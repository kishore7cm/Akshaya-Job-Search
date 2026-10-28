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

- `bot/instructions.md` routes to `scout`, `writer`, and `tracker`.
- `bot/tools/profile.ts`, `pipeline.ts`, and `application_packet.ts` own durable state in `ctx.host.kv`.
- `bot/lib/store.ts` is the status machine and JSON store. Never discovered.
- `evals/` is filesystem evals (`evals/evals.config.ts` required).
  Not `bot/evals/`. That path is ignored.

## Do not

- Auto-submit applications or add browser automation against job boards.
- Grow host TypeScript for matching copy or cover-letter prose. That stays in skills.
- Add npm deps on a first cut. Stick to what `@grok/agent-sdk` already ships.
- Point `serve` at a parent folder during bring-up. It mounts every sibling.

## Pointers

- Package loop: `node_modules/@grok/agent-sdk/AGENTS.md`
- Docs: `npx @grok/agent-sdk docs`
- LLM docs index: `node_modules/@grok/agent-sdk/dist/docs/llms.txt`
