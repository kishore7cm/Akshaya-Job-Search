import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applyExternalAts } from "../lib/ats-browser.js";
import { classifyAts } from "../lib/ats.js";
import { resolveOffsiteApply } from "../lib/linkedin-browser.js";
import {
  MAX_APPLY_PER_CALL,
  answerField,
  assertCanApply,
  isMockSession,
  linkedinIdFromUrl,
  recordApply,
} from "../lib/linkedin.js";
import { getJob, getPacket, getProfile, setJobStatus, upsertJob } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Follow a LinkedIn Apply button that opens Greenhouse, Lever, Ashby,
    Workday, or another company ATS. Fills the off-site form from the saved
    profile and packet. submit false previews. submit true sends after
    approval. Does not create ATS accounts or guess required questions.
  `,
  inputSchema: z.object({
    jobIds: z.array(z.string().min(1)).min(1).max(MAX_APPLY_PER_CALL),
    submit: z.boolean().default(false),
  }),
  needsApproval: (input) => input.submit === true,
  effect: "write",
  dryRunResult: ({ jobIds, submit }) => ({ ok: false, dryRun: true, submit, jobIds }),
  async execute({ jobIds, submit }, ctx) {
    const profile = await getProfile(ctx.host.kv);
    const mock = isMockSession(ctx.session.purpose);
    const results = [];
    for (const jobId of jobIds) {
      const job = await getJob(ctx.host.kv, jobId);
      if (!job) {
        results.push({ jobId, status: "skipped", detail: "Unknown pipeline job id." });
        continue;
      }
      if (job.applyKind === "easy_apply") {
        results.push({
          jobId,
          status: "skipped",
          detail: "This job is LinkedIn Easy Apply. Use linkedin_apply.",
        });
        continue;
      }
      if (job.status === "applied" || job.status === "interviewing" || job.status === "offer" || job.status === "accepted") {
        results.push({ jobId, status: "already_applied", detail: `Pipeline already ${job.status}.` });
        continue;
      }
      const rateId = linkedinIdFromUrl(job.url ?? "") ?? job.id;
      if (!mock) await assertCanApply(ctx.host.kv, ctx.now(), rateId);

      let applyUrl = job.applyUrl;
      let ats = job.ats ?? (applyUrl ? classifyAts(applyUrl) : "generic");
      if (!applyUrl && job.url && /linkedin\.com/i.test(job.url) && !mock) {
        const resolved = await resolveOffsiteApply(ctx.host.files, job.url);
        applyUrl = resolved.applyUrl;
        ats = resolved.ats;
        await upsertJob(ctx.host.kv, {
          id: job.id,
          title: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          source: job.source,
          description: job.description,
          applyKind: "external",
          applyUrl,
          ats,
        });
      }
      if (!applyUrl) {
        results.push({
          jobId,
          status: "blocked",
          detail: "No company apply URL yet. Search again or paste the Greenhouse/Lever/Workday link.",
        });
        continue;
      }

      const packet = await getPacket(ctx.host.kv, job.id);
      if (mock) {
        if (submit) {
          await recordApply(ctx.host.kv, ctx.now(), rateId);
          const updated = await setJobStatus(ctx.host.kv, {
            id: job.id,
            status: "applied",
            note: `Mock ${ats} application submitted (${applyUrl}).`,
          });
          results.push({ jobId, status: "applied", ats, applyUrl, job: updated, detail: "Mock ATS submit." });
        } else {
          results.push({
            jobId,
            status: "preview",
            ats,
            applyUrl,
            detail: `Mock ${ats} form fill. Re-call with submit true to send.`,
          });
        }
        continue;
      }

      const outcome = await applyExternalAts(ctx.host.files, {
        applyUrl,
        submit,
        resumeFilePath: profile.resumeFilePath,
        answers: (field) => answerField(field, profile, packet),
      });
      if (outcome.status === "applied") {
        await recordApply(ctx.host.kv, ctx.now(), rateId);
        const updated = await setJobStatus(ctx.host.kv, {
          id: job.id,
          status: "applied",
          note: `${outcome.ats} application submitted (${outcome.applyUrl}).`,
        });
        results.push({ ...outcome, jobId, job: updated });
      } else {
        results.push({ ...outcome, jobId });
      }
    }
    return { submit, results };
  },
});
