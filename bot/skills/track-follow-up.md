---
description: Use when updating pipeline status, scheduling a follow-up, or writing a digest.
---

# Follow-up cadence

| Status | Reminder | Purpose |
| --- | --- | --- |
| ready_to_apply | same day | Human still needs to submit |
| applied | 3 days | Check confirmation / recruiter ping |
| applied (no reply) | 7 days | One polite follow-up draft |
| interviewing | 1 day before | Prep notes from the packet and posting |
| offer | same day | Compare with other pipeline offers |

Set `followUpAt` on the job when you create a reminder. If the human already heard back, cancel the reminder and move status instead of sending another nudge.

Daily digest: counts, `ready_to_apply` list, stale applied jobs, interviews in the next 7 days, one recommended action.
