import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { loginLinkedIn, sessionStatus } from "../lib/linkedin-browser.js";
import { isMockSession } from "../lib/linkedin.js";

export default defineTool({
  description: prompt`
    Check or create the LinkedIn browser session used to search and Easy Apply.
    Call status first. Call login on the laptop where Chrome can open; complete
    2FA in the window if LinkedIn asks. Do not pass a password as tool input.
  `,
  inputSchema: z.object({
    action: z.enum(["status", "login"]),
  }),
  effect: ({ action }) => (action === "status" ? "read" : "write"),
  dryRunResult: ({ action }) => ({ ok: false, dryRun: true, action }),
  async execute({ action }, ctx) {
    if (isMockSession(ctx.session.purpose)) {
      return {
        mock: true,
        ready: true,
        loggedIn: action === "login" || action === "status",
        hint: "LINKEDIN_MOCK/eval session. Search and apply will not open a browser.",
      };
    }
    if (action === "status") {
      return sessionStatus(ctx.host.files);
    }
    const result = await loginLinkedIn(ctx.host.files);
    return {
      loggedIn: result.loggedIn,
      hint: "Session saved. Use linkedin_search, then linkedin_apply.",
    };
  },
});
