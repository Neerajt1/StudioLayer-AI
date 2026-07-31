---
name: Multi-image project references
description: How the monorepo TypeScript project references work for api-zod and api-client-react, and the rebuild required when editing generated files.
---

## Rule
After editing any file in `lib/api-zod/src/` or `lib/api-client-react/src/`, run `tsc --build` in those packages before type-checking downstream packages (api-server or studiolayer-ai). Without this, downstream packages see stale `.d.ts` declarations from their `dist/` directories.

## Why
Both `lib/api-zod` and `lib/api-client-react` use `"composite": true` in their tsconfig and emit `.d.ts` files to `dist/`. The `artifacts/api-server` references `lib/api-zod` and the `artifacts/studiolayer-ai` frontend references `lib/api-client-react`. TypeScript project references mean the downstream packages read compiled declarations, not the source TypeScript.

## How to apply
Whenever you modify a generated file in either lib (e.g. adding `imageCount` to `CreateRenderBody` in `api-zod/src/generated/api.ts` or changing `createRender` return type in `api-client-react/src/generated/api.ts`):
1. `pnpm --filter @workspace/api-zod exec tsc --build`
2. `pnpm --filter @workspace/api-client-react exec tsc --build`
Then re-run `tsc --noEmit` on the consumer packages to verify.

## Multi-image architecture (SL-020)
- `POST /renders` now returns `Render[]` (one item per requested image)
- `imageCount: 1 | 2 | 4` added to `RenderInput` OpenAPI schema, Zod body, and client schemas
- `runAIPipeline` now accepts `shots?: ShotCount` and `onComplete(url, imageIndex)`
- Route creates N rows upfront, fires one pipeline call with `shots: N`, distributes via indexed `onComplete`
- Frontend tracks `activeRenderIds: number[]`; polls up to 4 renders via 4 unconditional `useGetRender` hooks
- `Render` interface cast errors: use `render as unknown as Record<string, unknown>` (TypeScript won't direct-cast `Render` to index-signature types)
