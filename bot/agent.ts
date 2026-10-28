import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  name: "Akshaya Job Search",
  description:
    "Coordinator for Akshaya's job search: LinkedIn Easy Apply, tailored packets, and pipeline tracking.",
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  builtinTools: { reminders: true },
});
