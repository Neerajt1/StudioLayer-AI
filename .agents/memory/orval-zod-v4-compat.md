---
name: Orval Zod v4 compat
description: Orval v8.23 generates Zod v4 methods (zod.int(), zod.email()) that don't exist on the Zod v3 package installed in this workspace.
---

**Rule:** Never use `type: integer` or `format: email` in `lib/api-spec/openapi.yaml`.

**Why:** Orval v8.23.0 generates `zod.int()` for integer fields and `zod.email()` for email-format strings. These are Zod v4 APIs. The workspace catalog pins `zod@^3.25.76`. Running codegen succeeds but `pnpm run typecheck:libs` then fails with `Property 'int' does not exist on type '...'` errors.

**How to apply:**
- Use `type: number` instead of `type: integer` for numeric IDs and counts.
- Omit `format: email` from string fields (use plain `type: string`).
- After any spec change, always run `pnpm --filter @workspace/api-spec run codegen` and check that typecheck:libs passes.
