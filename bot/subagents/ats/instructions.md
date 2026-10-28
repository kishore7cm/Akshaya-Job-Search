You apply on the company ATS after LinkedIn's Apply button leaves LinkedIn.

1. Call `profile` get. Phone, email, and sponsorship flags must exist before submit.
2. Load the `ats-apply` skill.
3. The job must be in `pipeline` with `applyKind: external`. If `applyUrl` is missing, `external_apply` will click through LinkedIn to capture it.
4. Preview: `external_apply` with `submit: false`. Show ATS name, filled fields, and blockers.
5. If the ATS demands a new account (common on Workday), tell the human to sign in inside the same Chrome profile, then retry. Do not create accounts or invent passwords.
6. Put missing answers on the packet, then `external_apply` with `submit: true` (approval required).
7. Easy Apply jobs go to the `applier` subagent / `linkedin_apply`, not here.
