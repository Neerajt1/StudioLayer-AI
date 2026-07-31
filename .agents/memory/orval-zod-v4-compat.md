---
name: Orval Zod v4 compat
description: Orval v8 generates Zod v4 syntax — avoid integer/email formats in OpenAPI spec; also the identities endpoint must exist in the spec or Orval drops useGetIdentities
---

# Orval v8 + Zod v4 Compatibility

## Format constraints
Orval v8 generates Zod v4 syntax. Avoid `format: integer` and `format: email` in the OpenAPI spec — these are Zod v3 conventions that break generation.

## Regeneration workflow
The codegen script lives in `lib/api-spec/`:
```
cd lib/api-spec && npx orval --config ./orval.config.ts
```
There is no `build` or `generate` script — run Orval directly via `npx`.

## Spec completeness is critical
Orval drops any hook/type not present in the spec. If an endpoint exists in the API server but NOT in `lib/api-spec/openapi.yaml`, Orval will silently remove its generated hook on the next codegen run.

**Endpoints that must exist in the spec:**
- `/identities` → `useGetIdentities` (was missing; caused a prod break when added after a codegen run)
- `/renders/usage` → `useGetRenderUsage`
- All auth, renders, and support endpoints

**Why:** When adding `isAdmin` to the User and RenderUsage schemas in July 2026, Orval was re-run and stripped `useGetIdentities` because `/identities` was not in the spec. The fix was to add the endpoint + Identity schema to openapi.yaml before re-running codegen.

## DB schema pushes
Schema changes require `cd lib/db && npx drizzle-kit push` (not `drizzle-kit migrate` — the project uses push mode).
