<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## JEV and OpenRouter

JEV (`src/lib/jev.ts`) is the AI risk analyst. It calls OpenRouter's chat completions API through the `openai` SDK (`baseURL` = `OPENROUTER_BASE_URL`), which is how the brief's "use OpenRouter meaningfully" (E3) requirement is met. Keep it that way: never call a model provider directly.

Before changing anything OpenRouter-specific (model IDs, `provider` routing, `response_format`/structured outputs, `usage` accounting, headers), check the **`openrouter-docs`** MCP server from `.mcp.json` rather than relying on memory.
