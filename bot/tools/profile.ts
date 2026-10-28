import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getProfile, profileSchema, saveProfile } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Get or save Akshaya's candidate profile. The scout, writer, and tracker
    all depend on this. Call get before matching a role or drafting materials.
    Call save when the user provides or updates background, target roles,
    skills, locations, or constraints.
  `,
  inputSchema: z.object({
    action: z.enum(["get", "save"]),
    profile: profileSchema.optional(),
  }),
  effect: ({ action }) => (action === "get" ? "read" : "write"),
  dryRunResult: ({ action }) =>
    action === "save"
      ? { saved: false, dryRun: true }
      : { found: false, dryRun: true },
  async execute({ action, profile }, ctx) {
    if (action === "get") {
      const current = await getProfile(ctx.host.kv);
      if (!current) {
        return {
          found: false,
          hint: "No profile saved yet. Ask for target roles, skills, locations, and a short summary, then call save.",
        };
      }
      return { found: true, profile: current };
    }
    if (!profile) {
      throw new Error("profile is required when action is save.");
    }
    const saved = await saveProfile(ctx.host.kv, profile);
    return { saved: true, profile: saved };
  },
});
