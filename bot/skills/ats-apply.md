---
description: Use when LinkedIn Apply opens Greenhouse, Lever, Ashby, Workday, or another company career page.
---

# Off-site ATS apply

The LinkedIn job is only a doorway. The application lives on the company site.

1. Confirm `applyKind` is `external` (scout / `linkedin_search` records this).
2. `external_apply` `submit: false` first.
3. Greenhouse, Lever, and Ashby are usually one or two forms. Workday often needs an existing account in this Chrome profile — never register a new one.
4. Upload `profile.resumeFilePath` when the form asks for a resume. Cover letter comes from `application_packet`.
5. Unknown required questions block. Save answers, retry.
6. `external_apply` `submit: true` waits for approval, then clicks Submit.
7. Same daily cap as Easy Apply (15 Pacific, 60s gap).

If Apply stays on LinkedIn, this is Easy Apply — use `linkedin_apply` instead.
