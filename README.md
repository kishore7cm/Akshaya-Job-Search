# Akshaya Job Search

Agent SDK desk that splits job search into three specialists behind one coordinator:

| Subagent | Job |
| --- | --- |
| **scout** | Ingest or search listings, score them against the saved profile, shortlist strong matches |
| **writer** | Tailor a resume and cover letter for one saved job |
| **tracker** | Pipeline board, status changes, follow-up reminders, weekday digest |

The coordinator persists every role in durable `pipeline` state. A human still submits every application. The agent never logs into LinkedIn, Indeed, Greenhouse, Lever, or Workday, and never clicks Submit.

## Talk to it

```bash
npx --yes "@grok/agent-sdk@0.4.0" login
npx --yes "@grok/agent-sdk@0.4.0" dev
```

Open the playground URL it prints. First message: paste Akshaya's background and target roles. After the profile is saved, paste a job description or ask it to search.

Useful prompts:

- "Save this profile, then score this job posting."
- "Draft the application packet for `<job-id>`."
- "I applied to Acme on the company site today. Mark it applied and remind me in 3 days."
- "What is in the pipeline?"

## Check it

```bash
npx --yes "@grok/agent-sdk@0.4.0" validate --dir .
npx --yes "@grok/agent-sdk@0.4.0" info --dir . --json
npx --yes "@grok/agent-sdk@0.4.0" tool call profile --dir . --input '{"action":"save","profile":{"fullName":"Akshaya","targetRoles":["Software Engineer"],"locations":["Remote"],"skills":["TypeScript"],"summary":"Backend and full-stack engineer."}}'
npx --yes "@grok/agent-sdk@0.4.0" eval --dir . --tag smoke
npm run check
```

Weekday digest cron is `0 16 * * 1-5` (16:00 UTC / 9:00 America/Los_Angeles during PDT). It does not fire under `dev`; dispatch it from the playground or `POST /v1/dev/schedules/daily-digest`.

## Deploy

Do not deploy from this agent. From your machine, after login:

```bash
npx --yes "@grok/agent-sdk@0.4.0" deploy --dir . --dry-run
npx --yes "@grok/agent-sdk@0.4.0" deploy --dir .
```

Manage the hosted agent at https://cursor.com/dashboard/deployed-agents.
