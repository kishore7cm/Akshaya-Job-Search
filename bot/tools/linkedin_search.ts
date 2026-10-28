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
    Search LinkedIn for Easy Apply jobs matching keywords and location, then
    upsert each listing into the pipeline. Requires a LinkedIn session
    (linkedin_session). Prefer the saved profile's target roles and locations.
  `,
  inputSchema: z.object({
    keywords: z.string().min(1).optional(),
    location: z.string().optional(),
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
    const listings = isMockSession(ctx.session.purpose)
      ? mockJobs(keywords)
      : await searchLinkedInJobs(ctx.host.files, { keywords, location, limit });

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
      });
      jobs.push({
        id: upserted.job.id,
        created: upserted.created,
        linkedinId: listing.linkedinId,
        title: listing.title,
        company: listing.company,
        location: listing.location,
        url: listing.url,
        easyApply: listing.easyApply,
        alreadyApplied: listing.alreadyApplied,
        status: upserted.job.status,
      });
    }
    return {
      keywords,
      location: location ?? null,
      count: jobs.length,
      easyApplyCount: jobs.filter((job) => job.easyApply).length,
      jobs,
    };
  },
});
