import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getPacket, savePacket } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Store or load the tailored resume, cover letter, and screening answers
    for one job. Saving a packet moves sourced or shortlisted jobs to drafted.
    This does not submit the application. The human still applies on the
    employer site, then pipeline set_status applied.
  `,
  inputSchema: z.object({
    action: z.enum(["get", "save"]),
    jobId: z.string().min(1),
    tailoredResume: z.string().min(1).optional(),
    coverLetter: z.string().min(1).optional(),
    screeningAnswers: z
      .array(z.object({ question: z.string().min(1), answer: z.string().min(1) }))
      .optional(),
    notes: z.string().optional(),
  }),
  effect: ({ action }) => (action === "get" ? "read" : "write"),
  dryRunResult: ({ action, jobId }) => ({ ok: false, dryRun: true, action, jobId }),
  async execute(input, ctx) {
    if (input.action === "get") {
      const packet = await getPacket(ctx.host.kv, input.jobId);
      if (!packet) return { found: false, jobId: input.jobId };
      return { found: true, packet };
    }
    if (!input.tailoredResume || !input.coverLetter) {
      throw new Error("save requires tailoredResume and coverLetter.");
    }
    const result = await savePacket(ctx.host.kv, {
      jobId: input.jobId,
      tailoredResume: input.tailoredResume,
      coverLetter: input.coverLetter,
      screeningAnswers: input.screeningAnswers,
      notes: input.notes,
    });
    return {
      saved: true,
      job: result.job,
      packet: result.packet,
      reminder: "Do not submit this packet. Ask the human to apply, then mark applied.",
    };
  },
});
