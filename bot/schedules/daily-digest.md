---
cron: "0 16 * * 1-5"
---

Run the weekday job-search digest (16:00 UTC, 9:00 America/Los_Angeles during PDT).

1. Call `profile` action `get`. If none exists, say so and stop.
2. Call `pipeline` action `list`.
3. Delegate remaining recap work to the `tracker` subagent.
4. Summarize counts by status, list `ready_to_apply` jobs, and flag applied roles with no follow-up.
5. Propose at most three next actions. Do not mark any job applied.
