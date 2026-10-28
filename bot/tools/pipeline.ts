import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import {
  JOB_STATUSES,
  allowedTransitions,
  boardFromJobs,
  getJob,
  getTimeline,
  listJobs,
  scoreJob,
  setJobStatus,
  upsertJob,
} from "../lib/store.js";

export default defineTool({
  description: prompt`
    Durable job pipeline. Use upsert to record a role, get or list to inspect
    the board, score to store a match, set_status to move a role, and timeline
    for the event log. Prefer linkedin_apply to mark LinkedIn Easy Apply jobs
    applied. Manual set_status applied still requires a note.
  `,
  inputSchema: z.object({
    action: z.enum(["upsert", "get", "list", "score", "set_status", "timeline"]),
    id: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    company: z.string().min(1).optional(),
    location: z.string().optional(),
    url: z.string().optional(),
    source: z.string().optional(),
    description: z.string().min(1).optional(),
    status: z.enum(JOB_STATUSES).optional(),
    matchScore: z.number().min(0).max(100).optional(),
    matchReasons: z.array(z.string().min(1)).optional(),
    gaps: z.array(z.string().min(1)).optional(),
    nextAction: z.string().optional(),
    followUpAt: z.string().optional(),
    note: z.string().optional(),
  }),
  effect: ({ action }) =>
    action === "get" || action === "list" || action === "timeline" ? "read" : "write",
  dryRunResult: ({ action }) => ({ ok: false, dryRun: true, action }),
  async execute(input, ctx) {
    const kv = ctx.host.kv;
    switch (input.action) {
      case "upsert": {
        if (!input.title || !input.company || !input.description) {
          throw new Error("upsert requires title, company, and description.");
        }
        const result = await upsertJob(kv, {
          id: input.id,
          title: input.title,
          company: input.company,
          location: input.location,
          url: input.url,
          source: input.source,
          description: input.description,
        });
        return { ok: true, created: result.created, job: result.job };
      }
      case "get": {
        if (!input.id) throw new Error("get requires id.");
        const job = await getJob(kv, input.id);
        if (!job) return { found: false, id: input.id };
        const timeline = await getTimeline(kv, job.id);
        return { found: true, job, timeline };
      }
      case "list": {
        const jobs = await listJobs(kv, input.status);
        return {
          count: jobs.length,
          filter: input.status ?? "all",
          board: boardFromJobs(jobs),
          jobs,
        };
      }
      case "score": {
        if (!input.id || input.matchScore === undefined) {
          throw new Error("score requires id and matchScore.");
        }
        const job = await scoreJob(kv, {
          id: input.id,
          matchScore: input.matchScore,
          matchReasons: input.matchReasons ?? [],
          gaps: input.gaps ?? [],
          nextAction: input.nextAction,
        });
        return { ok: true, job };
      }
      case "set_status": {
        if (!input.id || !input.status) {
          throw new Error("set_status requires id and status.");
        }
        const current = await getJob(kv, input.id);
        if (!current) throw new Error(`Unknown job: ${input.id}`);
        if (input.status === "applied") {
          const note = input.note?.trim() ?? "";
          if (note.length === 0) {
            throw new Error(
              "Marking applied requires note with how the human submitted (site, date, confirmation).",
            );
          }
        }
        const job = await setJobStatus(kv, {
          id: input.id,
          status: input.status,
          note: input.note,
          nextAction: input.nextAction,
          followUpAt: input.followUpAt,
        });
        return {
          ok: true,
          job,
          nextStatuses: allowedTransitions(job.status),
        };
      }
      case "timeline": {
        if (!input.id) throw new Error("timeline requires id.");
        const job = await getJob(kv, input.id);
        if (!job) return { found: false, id: input.id };
        return { found: true, job, timeline: await getTimeline(kv, job.id) };
      }
    }
  },
});
