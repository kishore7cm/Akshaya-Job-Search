import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { applyEasyApply } from "../lib/linkedin-browser.js";
import {
  MAX_APPLY_PER_CALL,
  answerField,
  assertCanApply,
  isMockSession,
  linkedinIdFromUrl,
  recordApply,
} from "../lib/linkedin.js";
import { getJob, getPacket, getProfile, setJobStatus } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Fill LinkedIn Easy Apply for a saved pipeline job. submit false previews
    the form. submit true sends the application after playground approval.
    Stops on unmapped required questions instead of guessing. Daily cap 15,
    at most 3 jobs per call, 60s between sends.
  `,
  inputSchema: z.object({
    jobIds: z.array(z.string().min(1)).min(1).max(MAX_APPLY_PER_CALL),
    submit: z.boolean().default(false),
  }),
  needsApproval: (input) => input.submit === true,
  effect: "write",
  dryRunResult: ({ jobIds, submit }) => ({
    ok: false,
    dryRun: true,
    submit,
    jobIds,
  }),
  async execute({ jobIds, submit }, ctx) {
    const profile = await getProfile(ctx.host.kv);
    if (!profile) throw new Error("Save a profile before applying.");
    const mock = isMockSession(ctx.session.purpose);
    const results = [];
    for (const jobId of jobIds) {
      const job = await getJob(ctx.host.kv, jobId);
      if (!job) {
        results.push({ jobId, status: "skipped", detail: "Unknown pipeline job id." });
        continue;
      }
      if (!job.url) {
        results.push({ jobId, status: "skipped", detail: "Job has no LinkedIn URL." });
        continue;
      }
      const linkedinId = linkedinIdFromUrl(job.url) ?? job.id.replace(/^linkedin-/, "");
      if (job.status === "applied" || job.status === "interviewing" || job.status === "offer" || job.status === "accepted") {
        results.push({ jobId, status: "already_applied", detail: `Pipeline already ${job.status}.` });
        continue;
      }
      if (!mock) await assertCanApply(ctx.host.kv, ctx.now(), linkedinId);
      const packet = await getPacket(ctx.host.kv, job.id);
      if (mock) {
        if (submit) {
          await recordApply(ctx.host.kv, ctx.now(), linkedinId);
          const updated = await setJobStatus(ctx.host.kv, {
            id: job.id,
            status: "applied",
            note: "Mock LinkedIn Easy Apply submit.",
          });
          results.push({ jobId, status: "applied", job: updated, detail: "Mock submit." });
        } else {
          results.push({ jobId, status: "preview", detail: "Mock form fill. Re-call with submit true to send." });
        }
        continue;
      }
      const outcome = await applyEasyApply(ctx.host.files, {
        url: job.url,
        submit,
        resumeFilePath: profile.resumeFilePath,
        answers: (field) => answerField(field, profile, packet),
      });
      if (outcome.status === "applied") {
        await recordApply(ctx.host.kv, ctx.now(), linkedinId);
        const updated = await setJobStatus(ctx.host.kv, {
          id: job.id,
          status: "applied",
          note: `LinkedIn Easy Apply submitted (${outcome.url}).`,
        });
        results.push({ ...outcome, jobId, job: updated });
      } else {
        results.push({ ...outcome, jobId });
      }
    }
    return { submit, results };
  },
});
