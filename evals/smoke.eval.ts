import { defineEval } from "@grok/agent-sdk/evals";

export default defineEval({
  tags: ["smoke"],
  description: "Saves a profile, records a job, and lists the pipeline.",
  async test(t) {
    await t.send(
      [
        "Save this candidate profile using the profile tool:",
        "fullName Test Candidate, targetRoles Software Engineer, locations Seattle,",
        "skills TypeScript, summary Three years building web services.",
        "Then upsert a job with the pipeline tool: title Backend Engineer, company Acme,",
        "description TypeScript services and APIs.",
        "Then list the pipeline. Do not mark the job applied.",
      ].join(" "),
    );
    t.succeeded();
    t.calledTool("profile");
    t.calledTool("pipeline");
    t.notCalledTool("application_packet");
  },
});
