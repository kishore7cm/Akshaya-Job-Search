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

## Laptop setup (copy each block)

Run these in **Terminal.app**, one block at a time. `npm install` only works after you `cd` into the repo. `login` and `dev` are two separate commands.

### 1. Get the project

```bash
cd ~
git clone https://github.com/kishore7cm/Akshaya-Job-Search.git
cd Akshaya-Job-Search
git checkout cursor/job-search-agents-9f9b
npm install
npx playwright install chromium
```

If the repo is already cloned, skip `git clone` and `cd` into that folder instead of `~`.

### 2. Cursor login (once)

```bash
cd ~/Akshaya-Job-Search
npx --yes "@grok/agent-sdk@0.4.0" login
```

Finish the browser sign-in it opens. Then:

### 3. Chrome with debug port

Quit Chrome completely first (**Cmd+Q**). If it is already running, this next line only opens a tab and the agent cannot attach.

```bash
osascript -e 'quit app "Google Chrome"'
sleep 2
mkdir -p "$HOME/.akshaya-job-search/chrome-profile"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="$HOME/.akshaya-job-search/chrome-profile"
```

Leave that window open. Log into LinkedIn there. Confirm the debug port is up:

```bash
curl -s http://127.0.0.1:9222/json/version
```

You should see JSON with `"Browser": "Chrome/..."`. If `curl` fails, Chrome did not start with the debug port — quit Chrome and run step 3 again.

### 4. Start the agent (new Terminal tab)

```bash
cd ~/Akshaya-Job-Search
export LINKEDIN_CDP_URL=http://127.0.0.1:9222
npx --yes "@grok/agent-sdk@0.4.0" dev
```

Open the playground URL it prints. Prompt: “Search LinkedIn for customer success roles in the Bay Area and remote.”

Akshaya Ramprasad's resume is seeded (`profile` get, `bot/sandbox/workspace/resume.md`, and the PDF for uploads). Work authorization is **H-4 EAD**; employer sponsorship is not required. She **cannot relocate** (Fremont / Bay Area / remote only).

## Apply

1. Search LinkedIn for customer-success / client-support roles matching her profile.
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
