import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { searchLinkedInJobs } from "../lib/linkedin-browser.js";
import {
  MAX_SEARCH_RESULTS,
  isMockSession,
  mockJobs,
  pipelineJobId,
} from "../lib/linkedin.js";
import { getProfile, upsertJob } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Search LinkedIn for jobs matching keywords and location, then upsert each
    listing. Captures Easy Apply and off-site Apply URLs (Greenhouse, Lever,
    Ashby, Workday). Requires linkedin_session. applyKind defaults to all.
  `,
  inputSchema: z.object({
    keywords: z.string().min(1).optional(),
    location: z.string().optional(),
    applyKind: z.enum(["easy_apply", "external", "all"]).optional(),
    limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
  }),
  effect: "write",
  dryRunResult: () => ({ ok: false, dryRun: true, jobs: [] }),
  async execute(input, ctx) {
    const profile = await getProfile(ctx.host.kv);
    const keywords =
      input.keywords ?? profile?.targetRoles.join(" OR ") ?? "software engineer";
    const location = input.location ?? profile?.locations[0];
    const limit = input.limit ?? MAX_SEARCH_RESULTS;
    const applyKind = input.applyKind ?? "all";
    const listings = isMockSession(ctx.session.purpose)
      ? mockJobs(keywords, applyKind)
      : await searchLinkedInJobs(ctx.host.files, { keywords, location, limit, applyKind });

    const jobs = [];
    for (const listing of listings) {
      const upserted = await upsertJob(ctx.host.kv, {
        id: pipelineJobId(listing.linkedinId),
        title: listing.title,
        company: listing.company,
        location: listing.location,
        url: listing.url,
        source: "linkedin",
        description: listing.description,
        applyKind: listing.applyKind,
        applyUrl: listing.applyUrl,
        ats: listing.ats,
      });
      jobs.push({
        id: upserted.job.id,
        created: upserted.created,
        linkedinId: listing.linkedinId,
        title: listing.title,
        company: listing.company,
        location: listing.location,
        url: listing.url,
        applyKind: listing.applyKind,
        applyUrl: listing.applyUrl ?? null,
        ats: listing.ats ?? null,
        easyApply: listing.easyApply,
        alreadyApplied: listing.alreadyApplied,
        status: upserted.job.status,
        nextTool: listing.applyKind === "external" ? "external_apply" : "linkedin_apply",
      });
    }
    return {
      keywords,
      location: location ?? null,
      applyKind,
      count: jobs.length,
      easyApplyCount: jobs.filter((job) => job.easyApply).length,
      externalCount: jobs.filter((job) => job.applyKind === "external").length,
      jobs,
    };
  },
});
