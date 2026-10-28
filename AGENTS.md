# akshaya-job-search

Agent SDK project (`@grok/agent-sdk`). This file is
for coding agents editing the project. The served agent's prompt is
`bot/instructions.md`.

## Loop

```bash
npx --yes "@grok/agent-sdk@0.4.0" validate --dir .
npx --yes "@grok/agent-sdk@0.4.0" info --dir . --json
npx --yes "@grok/agent-sdk@0.4.0" run --dir . --message "..."
npx --yes "@grok/agent-sdk@0.4.0" eval --dir .
npm run check
```

Run the CLI under Node, never Bun.

## Layout

- `bot/instructions.md` routes to `scout`, `writer`, `applier`, `ats`, and `tracker`.
- `linkedin_apply` is Easy Apply. `external_apply` follows company-site Apply buttons.
- `bot/lib/linkedin.ts` owns search URLs, answer mapping, and the daily cap.
- `bot/lib/store.ts` is the status machine and JSON store. Never discovered.
- `evals/` is filesystem evals (`evals/evals.config.ts` required).

## Do not

- Pass LinkedIn passwords as tool arguments or commit `storage-state`.
- Guess required Easy Apply answers. Block and ask.
- Bypass CAPTCHA, 2FA, or LinkedIn rate limits.
- Point `serve` at a parent folder during bring-up. It mounts every sibling.

## Pointers

- Package loop: `node_modules/@grok/agent-sdk/AGENTS.md`
- Docs: `npx @grok/agent-sdk docs`
- LLM docs index: `node_modules/@grok/agent-sdk/dist/docs/llms.txt`
