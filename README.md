
<div align="center">

[![Framework: Hono](https://img.shields.io/badge/framework-Hono-e36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests: Vitest](https://img.shields.io/badge/tests-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Runtime: Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Database: Cloudflare D1](https://img.shields.io/badge/database-Cloudflare%20D1-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)

</div>

# Perseus Backend
The backend service for **Perseus**, a Wikimedia article translation system. It re-derives an English Wikipedia revision's translatable text directly from Wikimedia, sends it to an OpenRouter-backed LLM, and returns the translated text enforcing a per-user weekly cost quota along the way.

## Table of Contents
- [Overview](#overview)
- [Architecture Summary](#architecture-summary)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Database Setup & Migrations](#database-setup--migrations)
- [Deployment](#deployment)
- [API Overview](#api-overview)
- [API Documentation (Scalar)](#api-documentation-scalar)
- [Project Structure](#project-structure)
- [Logging & Error Handling](#logging--error-handling)
- [Testing](#testing)
- [License](#license)

## Overview
A client (a Wikimedia-editing tool, in Perseus's case) sends the identifiers for a specific, immutable Wikipedia revision (`wiki`, `pageId`, `revisionId`) - never article content itself.

The backend:
1. Fetches that revision's rendered HTML directly from Wikipedia.
2. Extracts translatable text (paragraphs, list items, table cells, headings, ...) while preserving citation markers and inline markup as opaque placeholder tokens.
3. Groups the text into size-bounded chunks.
4. Sends each chunk to an OpenRouter chat-completions model chosen by the client from a fixed allow-list, with a fixed, server-built system prompt (never client-supplied).
5. Parses the response back into per-unit translations and returns them.
6. Enforces a weekly cost quota per API key, checked before the request starts and again before every chunk, using OpenRouter's own reported `usage.cost` for that call.

## Architecture Summary
The codebase is organized by domain rather than by technical layer:

| Folder | Responsibility |
|---|---|
| `src/routes/` | Hono route handlers |
| `src/schema/` | Shared Zod schemas used for API request/response validation |
| `src/middleware/` | Cross-cutting Hono middleware (auth, quota, request id, error handling) |
| `src/translation/` | Chunking, the `[[SEGMENT n]]` render/parse protocol, prompt building, model selection, and the per-request orchestrator |
| `src/wikimedia/` | Fetching revision HTML from Wikipedia and extracting translatable text (citations, placeholder tokens, DOM parsing) |
| `src/provider/` | The OpenRouter chat-completions client |
| `src/infra/` | D1-backed persistence: API key lookup, weekly quota read/write |
| `src/config/` | Reads and types the Worker's environment bindings |
| `src/constants/` | Fixed, server-owned allow-lists and values (target wikis, models, Wikimedia config, chunk size, prompt text) |
| `src/shared/` | The error model (`PerseusError`/`BackendError`) and the request-scoped logger |

Request flow: `middleware/requestId` → `middleware/auth` → `middleware/quota`(pre-flight only) → `routes/translate.ts` → `translation/handleTranslateRequest.ts` (the orchestrator) → `wikimedia/loadArticleUnits.ts` → `translation/chunker.ts` → per chunk: `translation/translateChunk.ts` → `provider/openRouter.ts`, with `infra/quota.ts` checked/updated before and after each chunk.

## Features
- **Translation orchestration**: re-derives article text from Wikimedia(never trusts client-supplied content), chunks it, and translates chunk-by-chunk with partial-failure handling(a single chunk's provider error doesn't fail the whole request).
- **Client-selectable models**: the caller picks one of three allow-listed OpenRouter models per request (see [`src/constants/models.ts`](./src/constants/models.ts)).
- **Fixed, server-built prompts**: the system prompt is built server-side from a target-wiki registry; there is no field through which a client can inject or override it.
- **API key authentication**: static bearer tokens, SHA-256-hashed at rest in D1.
- **Weekly cost-based quota**: enforced against OpenRouter's own reported `usage.cost` per request.
- **Interactive API reference**: a hand-authored OpenAPI document rendered with [Scalar](https://scalar.com/) (see [API Documentation (Scalar)](#api-documentation-scalar)).

## Local Development
1. Copy the example dev-vars file and fill in a real OpenRouter key:
   ```bash
   cp .dev.vars.example .dev.vars
   # edit .dev.vars and set OPENROUTER_API_KEY
   ```
2. Apply migrations to your local D1 database (see [Database Setup & Migrations](#database-setup--migrations)):
   ```bash
   pnpm run db:migrate:local
   ```
3. Start the dev server:
   ```bash
   pnpm run dev
   ```
   This runs `wrangler dev`, which serves the Worker locally against a local D1 instance.
4. Open the interactive API reference at `http://localhost:8787/docs` (see [API Documentation (Scalar)](#api-documentation-scalar)).

## Environment Variables
Configuration is split between `wrangler.toml` (`[vars]`, non-secret) and Wrangler secrets (sensitive values). Both are typed together in [`src/config/env.ts`](./src/config/env.ts).

| Variable | Where it's set | Required | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Wrangler secret (`.dev.vars` locally) | Yes | Bearer credential sent to OpenRouter's Chat Completions API. Without it, every translation request fails with a `ConfigurationError` (HTTP 500). |
| `DEFAULT_WEEKLY_COST_LIMIT` | `wrangler.toml` `[vars]` | Yes (has a repo default of `"0.16"`) | Documents the default weekly cost limit (same unit as OpenRouter's `usage.cost`) to use when provisioning a new API key. **Not read by any request-handling code path** - the value actually enforced per user is the `weekly_cost_limit` column on that user's `api_keys` row. |
| `DB` | `wrangler.toml` `[[d1_databases]]` binding | Yes | The D1 database binding used for API key lookup and quota tracking. Not a string env var - a binding. |

Local secrets go in a `.dev.vars` file (gitignored), based on [`.dev.vars.example`](./.dev.vars.example):
```bash
OPENROUTER_API_KEY=sk-or-v1-***
```

For a deployed Worker, set secrets with Wrangler rather than committing them:
```bash
pnpx wrangler secret put OPENROUTER_API_KEY
```

`vitest.config.ts` supplies its own non-secret placeholder (`OPENROUTER_API_KEY: "sk-test-not-a-real-key"`) for the test runtime, so the test suite does not require a `.dev.vars` file.

## Deployment
Deployment is via Wrangler, targeting Cloudflare Workers:

```bash
pnpm run deploy
```

Before the first deploy:

1. Create a D1 database and set its id in `wrangler.toml` (`database_id`).
2. Apply migrations to it: `pnpm run db:migrate:remote`.
3. Set the `OPENROUTER_API_KEY` secret: `npx wrangler secret put OPENROUTER_API_KEY`.

`wrangler.toml` also declares `compatibility_flags = ["nodejs_compat"]`, required because the Wikimedia-parsing code path uses `linkedom` to polyfill `DOMParser`(Workers have no native DOM).

## API Overview
All routes are served from the Worker's root. `/v1/translate` and `/v1/quota` require a bearer API key.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/docs` | None | 	The interactive Scalar API reference UI. |
| `GET` | `/v1/health` | None | Liveness check. Returns `{"status":"ok"}`. Does not touch D1. |
| `POST` | `/v1/translate` | Bearer | Translates one chunk or all chunks (`"chunk": "all"`) of a given article revision into a chosen target wiki's language, using a chosen model. |
| `GET` | `/v1/quota` | Bearer | Returns the caller's current weekly quota status. |

Authentication: `Authorization: Bearer <api-key>`. Keys are looked up by SHA-256 hash in `api_keys`; missing, malformed, or inactive keys return `401`.

### API Documentation(Scalar)
In the development workflow, this gives anyone running `pnpm run dev` a live, browsable, testable API reference at `http://localhost:8787/docs` without needing a separate Postman collection or hand-maintained request examples.
