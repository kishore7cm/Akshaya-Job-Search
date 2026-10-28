---
description: Use when scoring a job against Akshaya's saved profile before shortlisting.
---

# Match a role

Score 0–100. Persist the score with `pipeline` action `score` before you recommend a status.

| Band | Meaning | Default next step |
| --- | --- | --- |
| 85–100 | Strong overlap on title, stack, and constraints | shortlist, then write |
| 75–84 | Solid overlap, a few gaps | shortlist if gaps are learnable |
| 60–74 | Partial overlap | keep sourced, ask the human |
| 0–59 | Poor overlap or a hard constraint miss | reject, with the blocking gap |

Hard constraints (location, work authorization, seniority far above/below, banned industries) cap the score at 59 even if skills match.

Reasons must cite profile facts vs the posting. Do not invent years of experience or employers.
