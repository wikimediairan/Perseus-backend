
<div align="center">

[![Framework: Hono](https://img.shields.io/badge/framework-Hono-e36002?logo=hono&logoColor=white)](https://hono.dev/)
[![Language: TypeScript](https://img.shields.io/badge/language-TypeScript-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tests: Vitest](https://img.shields.io/badge/tests-Vitest-6e9f18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Runtime: Cloudflare Workers](https://img.shields.io/badge/runtime-Cloudflare%20Workers-f38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Database: Cloudflare D1](https://img.shields.io/badge/database-Cloudflare%20D1-f38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)

</div>

# Perseus Backend
The backend service for **Perseus**, a Wikimedia article translation system. It re-derives an English Wikipedia revision's translatable text directly from Wikimedia, sends it to an OpenRouter-backed LLM, and returns the translated text enforcing a per-user weekly cost quota along the way.

On top of the translation API, Perseus also runs the community side of the project: Wikimedia login (the *only* login method), a dashboard, a manually-reviewed API key request queue, a credit engine that fairly distributes a fixed $10/month community budget, and Wikimedia-identity-based admin access for reviewing requests.

## Table of Contents
- [Overview](#overview)
- [Architecture Summary](#architecture-summary)
- [Features](#features)
- [Frontend Rendering (Hono JSX + Tailwind)](#frontend-rendering-hono-jsx--tailwind)
- [Community Auth, Dashboard & Credit System](#community-auth-dashboard--credit-system)
- [Administrator Access](#administrator-access)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [API Overview](#api-overview)

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
| `src/routes/` | Hono route handlers (`translate.ts`, `quota.ts`, `health.ts`, plus `auth.ts`, `apiKeys.ts` for the community side, and `web/` for JSX-rendered human-facing pages) |
| `src/views/` | Hono JSX pages/layouts/components -- see [`docs/frontend-rendering.md`](./docs/frontend-rendering.md) |
| `src/styles/` | Tailwind CSS v4 entry point, compiled to `public/static/app.css` |
| `src/schema/` | Shared Zod schemas used for API request/response validation |
| `src/middleware/` | Cross-cutting Hono middleware (API-key auth, session auth, admin auth, quota, rate limiting, request id, error handling) |
| `src/translation/` | Chunking, the `[[SEGMENT n]]` render/parse protocol, prompt building, model selection, and the per-request orchestrator |
| `src/wikimedia/` | Fetching revision HTML from Wikipedia and extracting translatable text (citations, placeholder tokens, DOM parsing) |
| `src/provider/` | The OpenRouter chat-completions client |
| `src/infra/` | D1-backed persistence for the existing translate/quota pipeline: API key lookup, weekly quota read/write |
| `src/repositories/` | D1-backed persistence for the community system: users, sessions, key requests, usage events, credit ledger/queue, admins |
| `src/services/` | Business logic, independent of Hono: `wikimediaOAuth.ts`, `sessionService.ts`, `creditEngine.ts`, `usageService.ts` |
| `src/cron/` | The `weeklyEvaluation.ts` Cron Trigger handler |
| `src/config/` | Reads and types the Worker's environment bindings |
| `src/constants/` | Fixed, server-owned allow-lists and values (target wikis, models, Wikimedia config, chunk size, prompt text, credit-engine policy) |
| `src/shared/` | The error model (`PerseusError`/`BackendError`), the request-scoped logger, and small crypto/HTML helpers |

Translate request flow: `middleware/requestId` → `middleware/auth` → `middleware/quota`(pre-flight only) → `routes/translate.ts` → `translation/handleTranslateRequest.ts` (the orchestrator) → `wikimedia/loadArticleUnits.ts` → `translation/chunker.ts` → per chunk: `translation/translateChunk.ts` → `provider/openRouter.ts`, with `infra/quota.ts` checked/updated before and after each chunk (which also appends a `usage_events` row for the credit engine).

Community/dashboard request flow: `middleware/requestId` → `middleware/rateLimit` (auth endpoints only) → `routes/auth.ts` / `routes/web/*.ts` / `routes/apiKeys.ts` → `middleware/session.ts` or `middleware/adminAuth.ts` (session/admin-gated routes) → `services/*` → `repositories/*` → (for `routes/web/*.ts`) a `views/pages/*.tsx` component, called as a plain function and serialized with `c.html()`.

## Features
- **Translation orchestration**: re-derives article text from Wikimedia(never trusts client-supplied content), chunks it, and translates chunk-by-chunk with partial-failure handling(a single chunk's provider error doesn't fail the whole request).
- **Client-selectable models**: the caller picks one of three allow-listed OpenRouter models per request (see [`src/constants/models.ts`](./src/constants/models.ts)).
- **Fixed, server-built prompts**: the system prompt is built server-side from a target-wiki registry; there is no field through which a client can inject or override it.
- **API key authentication**: static bearer tokens, SHA-256-hashed at rest in D1.
- **Weekly cost-based quota**: enforced against OpenRouter's own reported `usage.cost` per request.
- **Interactive API reference**: a hand-authored OpenAPI document rendered with [Scalar](https://scalar.com/).
- **Hono JSX + Tailwind CSS v4**: human-facing pages (`/`, `/dashboard`) are server-rendered with Hono's built-in JSX (no React), styled with Tailwind v4 compiled to a single static CSS asset -- see [`docs/frontend-rendering.md`](./docs/frontend-rendering.md).
- **Wikimedia-only login**: OAuth 2.0 against `meta.wikimedia.org` is the sole authentication method for the dashboard and API key requests. Sessions are random tokens, SHA-256-hashed at rest (same pattern as API keys).
- **Manually-reviewed API key requests**: new users land in `pending`; a request only becomes a usable Perseus API key once a Wikimedia-identified admin approves it.
- **Wikimedia-identity-based admin access**: administrators are just Wikimedia accounts listed in a dedicated `admins` table - no separate admin credential, and no role column on `users`.
- **Fully audited credit engine**: every credit change (initial grant, increase, release) is recorded in `credit_transactions`; a fixed $10/month budget is tracked via `SUM(users.weekly_credit)`.
- **Weekly evaluation via Cron Trigger**: every Monday 04:00 UTC, `src/cron/weeklyEvaluation.ts` disables chronically low-usage users (releasing their credit back to the pool) and grants increases to consistently full-usage users, queueing increases the budget can't currently afford.

## Frontend Rendering (Hono JSX + Tailwind)
Human-facing pages (`GET /`, `GET /dashboard`) are server-rendered with **Hono's built-in JSX** (`hono/jsx` -- not React) and styled with **Tailwind CSS v4**, compiled to a single static `public/static/app.css` asset served directly by Cloudflare's native Workers Assets feature (no request ever reaches the Worker's `fetch` handler for it). There is deliberately no Vite in this project -- Tailwind v4's standalone CLI already handles CSS processing with zero config, and routing the Worker's own build through Vite would add real deployment risk for no corresponding benefit here.

Full details -- how routes call views, where components live, how to add a new page -- are in [`docs/frontend-rendering.md`](./docs/frontend-rendering.md).

## Community Auth, Dashboard & Credit System

| Route | Auth | Description |
|---|---|---|
| `GET /` | None | Public landing page with a "Login with Wikimedia" link. |
| `GET /auth/wikimedia` | None | Starts the Wikimedia OAuth 2.0 flow. |
| `GET /auth/wikimedia/callback` | None (validates OAuth `state`) | Exchanges the code, creates/updates the user, starts a session, redirects straight to `/dashboard`. |
| `POST /auth/logout` | Session | Destroys the session. |
| `GET /dashboard` | Session | Wikimedia identity, account status, key-request status, and (once active) weekly credit/usage/remaining/next-evaluation. |
| `POST /api/request-key` | Session | Enters the manual-review queue (`key_requests`, status `pending`). `409` if a request is already pending or already approved. |
| `POST /api/admin/key-requests/:id/approve` | Session + Wikimedia admin | Issues a Perseus API key (shown once in the response), grants the initial $0.16/week credit, activates the user. |
| `POST /api/admin/key-requests/:id/reject` | Session + Wikimedia admin | Marks the request rejected. |

Perseus users are identified only by their Wikimedia user ID and username - there is no other identity provider involved in onboarding. (The `users` table still has unused `github_user_id`/`github_username` columns left over from an earlier iteration; nothing reads or writes them anymore, and they're safe to ignore or drop in a future migration.)

**Credit rules** (see [`src/constants/credit.ts`](./src/constants/credit.ts) and [`src/services/creditEngine.ts`](./src/services/creditEngine.ts)):
- New approved users start at **$0.16/week**.
- 4 consecutive weeks under **$0.10** used → the user is disabled and their credit is released back to the shared budget.
- 4 consecutive weeks where the full weekly credit is used → **+$0.04/week**, capped at **$1.20/week**, if the shared budget has at least $0.04 available; otherwise the increase is queued (`credit_queue`) and applied automatically once budget frees up.
- Every change is written to `credit_transactions` (`INITIAL` / `USAGE` / `INCREASE` / `RELEASE`) so any user's credit history can be fully explained.

## Administrator Access
Perseus has **no separate admin login** - an administrator is simply a Wikimedia account that has a row in the `admins` table (see [`migrations/0003_admins.sql`](./migrations/0003_admins.sql)):

```sql
CREATE TABLE admins (
  id                  TEXT PRIMARY KEY,
  wikimedia_user_id   TEXT NOT NULL UNIQUE,
  wikimedia_username  TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  created_by          TEXT
);
```

Deliberately, this is **not** a role column on `users`. `users` represents application users; `admins` represents privileged Wikimedia identities. The two are checked independently, and nothing in `users` encodes admin status.

**How it works:**
1. A person logs in with Wikimedia OAuth as usual - this always creates/updates their `users` row and a session, admin or not.
2. When they hit an admin-only route, [`src/middleware/adminAuth.ts`](./src/middleware/adminAuth.ts)'s `requireAdmin` middleware:
   - Requires a valid session (`401` if not logged in).
   - Looks up the session's `wikimedia_user_id` in `admins` (`403` if not found).
3. Currently protected: `POST /api/admin/key-requests/:id/approve` and `POST /api/admin/key-requests/:id/reject`. Future admin actions should also be gated with `requireAdmin`.

**Adding the first administrator:** since there's no bootstrapping UI (a chicken-and-egg problem - you need an admin to create an admin), grant access directly via the provided script, keyed by **Wikimedia user ID** (not username, since usernames can change):

```bash
# Local D1:
pnpm run admin:add <wikimediaUserId> <wikimediaUsername> --local

# Remote/production D1:
pnpm run admin:add <wikimediaUserId> <wikimediaUsername>
```

To find someone's Wikimedia user ID, have them log in once (creating their `users` row), then read it back:
```bash
pnpm exec wrangler d1 execute perseus-wikimedia-db --local --command \
  "SELECT wikimedia_user_id, wikimedia_username FROM users WHERE wikimedia_username = 'ExampleUser'"
```

**Adding/removing subsequent administrators** works the same way - `pnpm run admin:add` is idempotent (re-running it for the same Wikimedia user ID just updates the stored username), and removal is a plain delete:
```bash
pnpm exec wrangler d1 execute perseus-wikimedia-db --remote --command \
  "DELETE FROM admins WHERE wikimedia_user_id = '<wikimediaUserId>'"
```

## Local Development
1. Copy the example dev-vars file and fill in real values:
   ```bash
   cp .dev.vars.example .dev.vars
   # edit .dev.vars: OPENROUTER_API_KEY, WIKIMEDIA_CONSUMER_KEY/SECRET
   ```
   - Register a Wikimedia OAuth 2.0 consumer at [meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration](https://meta.wikimedia.org/wiki/Special:OAuthConsumerRegistration/propose) (type: OAuth 2.0), with callback `http://localhost:8787/auth/wikimedia/callback`. Its client id/secret go in `WIKIMEDIA_CONSUMER_KEY`/`WIKIMEDIA_CONSUMER_SECRET`.
   - `PUBLIC_BASE_URL` already has a working local default in `wrangler.toml`; you only need to change it for a real deployment (see [Deployment](#deployment)). If it's ever missing or misconfigured, `/auth/wikimedia` falls back to deriving the redirect URI from the incoming request instead of failing outright (see [Environment Variables](#environment-variables)).
2. Apply migrations to your local D1 database (see [Database Setup & Migrations](#database-setup--migrations)):
   ```bash
   pnpm run db:migrate:local
   ```
3. Grant yourself admin access so you can approve key requests locally (see [Administrator Access](#administrator-access)):
   ```bash
   pnpm run admin:add <your-wikimedia-user-id> <your-wikimedia-username> --local
   ```
4. Start the dev server:
   ```bash
   pnpm run dev
   ```
   This runs `wrangler dev` (serving the Worker locally against a local D1 instance) *and* `tailwindcss --watch` together, so editing any `.tsx` file's classes rebuilds `public/static/app.css` automatically. See [Frontend Rendering](#frontend-rendering-hono-jsx--tailwind) for how that pipeline works.
5. Open the interactive API reference at `http://localhost:8787/docs`, or the login page at `http://localhost:8787/`. The expected flow is `GET /` → `/auth/wikimedia` → Wikimedia OAuth → `/auth/wikimedia/callback` → `/dashboard`.

## Environment Variables
Configuration is split between `wrangler.toml` (`[vars]`, non-secret) and Wrangler secrets (sensitive values). Both are typed together in [`src/config/env.ts`](./src/config/env.ts).

| Variable | Where it's set | Required | Purpose |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Wrangler secret (`.dev.vars` locally) | Yes | Bearer credential sent to OpenRouter's Chat Completions API. Without it, every translation request fails with a `ConfigurationError` (HTTP 500). |
| `DEFAULT_WEEKLY_COST_LIMIT` | `wrangler.toml` `[vars]` | Yes (has a repo default of `"0.16"`) | Documents the default weekly cost limit (same unit as OpenRouter's `usage.cost`) to use when provisioning a new API key. **Not read by any request-handling code path** - the value actually enforced per user is the `weekly_cost_limit` column on that user's `api_keys` row (kept in sync with `users.weekly_credit` by the credit engine). |
| `PUBLIC_BASE_URL` | `wrangler.toml` `[vars]` | Recommended | The Worker's own public URL, used to build the Wikimedia OAuth `redirect_uri`. Should exactly match the callback URL registered with the Wikimedia OAuth consumer. If unset or empty, `/auth/wikimedia` and `/auth/wikimedia/callback` fall back to the incoming request's own origin rather than failing - useful behind a proxy misconfiguration, but for production you should set this explicitly. |
| `WIKIMEDIA_CONSUMER_KEY` | Wrangler secret (`.dev.vars` locally) | Yes | Client ID of the Wikimedia OAuth 2.0 consumer. If this or `WIKIMEDIA_CONSUMER_SECRET` is missing, `/auth/wikimedia` and its callback return a clear `ConfigurationError` (HTTP 500) instead of an opaque failure. |
| `WIKIMEDIA_CONSUMER_SECRET` | Wrangler secret (`.dev.vars` locally) | Yes | Client secret of the Wikimedia OAuth 2.0 consumer. |
| `DB` | `wrangler.toml` `[[d1_databases]]` binding | Yes | The D1 database binding used for API key lookup, quota tracking, and every community/credit/admin table. Not a string env var - a binding. |

There is no `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` (GitHub OAuth has been removed - Wikimedia is the only login method) and no `ADMIN_TOKEN` (admin access is Wikimedia-identity-based - see [Administrator Access](#administrator-access)).

Local secrets go in a `.dev.vars` file (gitignored), based on [`.dev.vars.example`](./.dev.vars.example):
```bash
OPENROUTER_API_KEY=sk-or-v1-***
WIKIMEDIA_CONSUMER_KEY=***
WIKIMEDIA_CONSUMER_SECRET=***
```

For a deployed Worker, set secrets with Wrangler rather than committing them:
```bash
pnpx wrangler secret put OPENROUTER_API_KEY
pnpx wrangler secret put WIKIMEDIA_CONSUMER_KEY
pnpx wrangler secret put WIKIMEDIA_CONSUMER_SECRET
```

`vitest.config.ts` supplies its own non-secret placeholders for all of the above for the test runtime, so the test suite does not require a `.dev.vars` file.

## Deployment
Deployment is via Wrangler, targeting Cloudflare Workers:

```bash
pnpm run deploy
```

Before the first deploy:

1. Create a D1 database and set its id in `wrangler.toml` (`database_id`).
2. Apply migrations to it: `pnpm run db:migrate:remote`.
3. Set `PUBLIC_BASE_URL` in `wrangler.toml` `[vars]` to the Worker's real deployed URL.
4. Set the secrets listed in [Environment Variables](#environment-variables): `npx wrangler secret put <NAME>`.
5. Register the production callback URL (`<PUBLIC_BASE_URL>/auth/wikimedia/callback`) with the Wikimedia OAuth consumer.
6. Grant at least one administrator: `pnpm run admin:add <wikimediaUserId> <wikimediaUsername>` (see [Administrator Access](#administrator-access)).

`wrangler.toml` also declares `compatibility_flags = ["nodejs_compat"]`, required because the Wikimedia-parsing code path uses `linkedom` to polyfill `DOMParser`(Workers have no native DOM), and a `[triggers]` cron (`0 4 * * 1`, every Monday 04:00 UTC) that runs the weekly credit evaluation.

## API Overview
All routes are served from the Worker's root. `/v1/translate` and `/v1/quota` require a bearer API key; `/dashboard` and `/api/request-key` require a browser session (Wikimedia login); the `/api/admin/*` routes additionally require that session's Wikimedia identity to be listed in `admins`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | None | Public landing page with a "Login with Wikimedia" link. |
| `GET` | `/docs` | None | The interactive Scalar API reference UI. |
| `GET` | `/v1/health` | None | Liveness check. Returns `{"status":"ok"}`. Does not touch D1. |
| `POST` | `/v1/translate` | Bearer | Translates one chunk or all chunks (`"chunk": "all"`) of a given article revision into a chosen target wiki's language, using a chosen model. |
| `GET` | `/v1/quota` | Bearer | Returns the caller's current weekly quota status. |
| `GET` | `/auth/wikimedia` | None | Starts Wikimedia login. |
| `GET` | `/auth/wikimedia/callback` | None | Wikimedia OAuth callback; creates/updates the user, starts the session, redirects to `/dashboard`. |
| `POST` | `/auth/logout` | Session | Ends the session. |
| `GET` | `/dashboard` | Session | Account status, key-request status, weekly credit/usage. |
| `POST` | `/api/request-key` | Session | Requests API access (enters the manual-review queue). |
| `POST` | `/api/admin/key-requests/:id/approve` | Session + Wikimedia admin | Approves a request; returns the new plaintext API key once. |
| `POST` | `/api/admin/key-requests/:id/reject` | Session + Wikimedia admin | Rejects a request. |

Bearer authentication: `Authorization: Bearer <api-key>`. Keys are looked up by SHA-256 hash in `api_keys`; missing, malformed, or inactive keys return `401`. Session authentication: an httpOnly `perseus_session` cookie, set on successful Wikimedia login, holding a token whose SHA-256 hash is looked up in `sessions`. Admin authorization is layered on top of a valid session by checking the session's Wikimedia user ID against `admins` (`403` if absent) - see [Administrator Access](#administrator-access).

### API Documentation(Scalar)
In the development workflow, this gives anyone running `pnpm run dev` a live, browsable, testable API reference at `http://localhost:8787/docs` without needing a separate Postman collection or hand-maintained request examples.
