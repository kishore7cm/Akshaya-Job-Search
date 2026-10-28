import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getProfile, profileSchema, profileSource, saveProfile } from "../lib/store.js";

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
      const [profile, source] = await Promise.all([
        getProfile(ctx.host.kv),
        profileSource(ctx.host.kv),
      ]);
      return {
        found: true,
        source,
        profile,
        missing:
          source === "resume"
            ? [
                "work authorization / requiresSponsorship (not on the resume)",
                "willingToRelocate",
              ]
            : [],
      };
    }
    if (!profile) {
      throw new Error("profile is required when action is save.");
    }
    const saved = await saveProfile(ctx.host.kv, profile);
    return { saved: true, profile: saved };
  },
});
