# Akshaya Job Search

Agent SDK desk that searches LinkedIn, applies on Easy Apply **and** company ATS pages, and tracks the pipeline.

| Subagent | Job |
| --- | --- |
| **scout** | LinkedIn search, match scoring, Easy Apply vs off-site Apply URLs |
| **writer** | Tailored resume, cover letter, screening answers |
| **applier** | LinkedIn Easy Apply in local Chrome |
| **ats** | Greenhouse, Lever, Ashby, Workday, and other Apply-on-company-site forms |
| **tracker** | Pipeline board, follow-up reminders, weekday digest |

LinkedIn has no public apply API for candidates, so apply runs in **your** Chrome. A cloud/hosted agent cannot finish LinkedIn login or 2FA. Automated use can also get a LinkedIn account restricted; keep the daily cap (15) and the per-job approval on Submit.

## One-time LinkedIn login (laptop)

Install browsers, then pick one session method.

```bash
npm install
npx playwright install chromium
npx --yes "@grok/agent-sdk@0.4.0" login
```

**Option A — attach to Chrome you already use**

```bash
# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.akshaya-job-search/chrome-profile"
```

Log into LinkedIn in that window. In the same shell:

```bash
export LINKEDIN_CDP_URL=http://127.0.0.1:9222
npx --yes "@grok/agent-sdk@0.4.0" dev
```

**Option B — agent-owned window**

```bash
npx --yes "@grok/agent-sdk@0.4.0" dev
```

In the playground: “Log into LinkedIn”. Complete 2FA in the browser it opens. Optional env (never pass these as chat/tool input): `LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`.

Akshaya Ramprasad's resume is seeded (`profile` get, `bot/sandbox/workspace/resume.md`, and the PDF for uploads). Tell the agent her work authorization before it answers visa/sponsorship questions.

## Apply

1. Confirm work authorization / sponsorship (not on the resume), then search.
2. “Search LinkedIn for Easy Apply roles matching my profile.”
3. “Preview apply for these job ids.” Easy Apply uses `linkedin_apply`; a company-site Apply button uses `external_apply`.
4. Approve the call that has `submit: true`.

Workday and similar sites that demand a new account stop and ask you to sign in in the same Chrome profile. The ATS agent does not register accounts.

## Check it

```bash
npx --yes "@grok/agent-sdk@0.4.0" validate --dir .
npx --yes "@grok/agent-sdk@0.4.0" info --dir . --json
LINKEDIN_MOCK=1 npx --yes "@grok/agent-sdk@0.4.0" tool call linkedin_search --dir . --input '{"keywords":"software engineer"}'
npm run check
```

Weekday digest cron is `0 16 * * 1-5` (16:00 UTC / 9:00 America/Los_Angeles during PDT).
