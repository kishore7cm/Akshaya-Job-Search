---
description: Use when logging into LinkedIn, searching Easy Apply jobs, or submitting an application.
---

# LinkedIn Easy Apply

Session lives on the laptop. Hosted Cursor deploys cannot complete LinkedIn login.

1. `linkedin_session` `status`. If `ready` is false, `login` locally and finish any 2FA in the Chrome window.
2. `linkedin_search` using the profile's target roles. It upserts Easy Apply listings into `pipeline`.
3. Score with scout before mass-applying. Default bar: match score 75+.
4. `linkedin_apply` `jobIds` `submit: false` to fill and report blockers.
5. Put missing answers on `profile.commonAnswers` or `application_packet.screeningAnswers`.
6. `linkedin_apply` `submit: true` — this pauses for approval, then clicks Submit.
7. Caps: 15 applies per Pacific day, 60 seconds apart, 3 jobs per call.

Never pass LinkedIn passwords as tool arguments. Optional env on the laptop: `LINKEDIN_CDP_URL`, `LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD` (2FA still needs the human).
