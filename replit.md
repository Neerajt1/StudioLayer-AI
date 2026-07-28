# StudioLayer AI

An AI Fashion Studio platform for creative directors and brands to transform flat-lay clothing photos into editorial renders using AI diffusion models.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/studiolayer-ai run dev` — run the frontend (port 25562)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `SESSION_SECRET` — secret key for express-session

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/studiolayer-ai), dark mode, Tailwind CSS
- API: Express 5 (artifacts/api-server)
- Auth: express-session + bcryptjs (session-cookie based, no JWT)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/users.ts` — users table (email, passwordHash, name, subscriptionTier)
- `lib/db/src/schema/renders.ts` — renders table (userId, sourceImageUrl, outputImageUrl, modelPersona, locationEnvironment, status)
- `artifacts/api-server/src/routes/auth.ts` — register, login, logout, /me
- `artifacts/api-server/src/routes/renders.ts` — CRUD + usage stats, free-tier limit enforcement
- `artifacts/studiolayer-ai/src/` — React frontend (pages: login, register, studio, gallery, billing)

## Architecture decisions

- Session-cookie auth (express-session) chosen over JWT for simplicity. `credentials: 'include'` set on all API fetches in `lib/api-client-react/src/custom-fetch.ts`.
- Free tier capped at 3 renders; tier limits defined in `artifacts/api-server/src/routes/renders.ts:TIER_LIMITS`.
- Render jobs are created with `status: "pending"` and immediately transition to `"processing"` (simulating async diffusion API). Real diffusion API integration (Replicate/Fal.ai) plugs in via the `POST /renders` handler — set `outputImageUrl` via webhook.
- Orval v8 generates Zod v4 syntax (`zod.int()`, `zod.email()`) but the workspace runs Zod v3. Workaround: use `type: number` instead of `type: integer` and omit `format: email` in the OpenAPI spec.

## Product

- **Authentication**: Register / Login with email + password, persistent sessions
- **Studio Workspace**: Upload clothing photo, select model persona + environment, trigger render
- **Asset Gallery**: Browse past render jobs with status badges
- **Subscription & Billing**: Usage dashboard, tier comparison (Free 3 renders / Pro unlimited / Enterprise)

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm run typecheck:libs` after changing `lib/*` schema/types before checking artifact packages.
- After OpenAPI spec changes, run `pnpm --filter @workspace/api-spec run codegen` — do NOT use `type: integer` or `format: email` (Orval v8 generates Zod v4 syntax incompatible with Zod v3).
- `credentials: 'include'` is required on all fetches for session cookies to work — set in `lib/api-client-react/src/custom-fetch.ts`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
