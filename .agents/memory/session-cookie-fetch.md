---
name: Session cookie fetch
description: The shared customFetch must include credentials: 'include' for session-cookie-based auth to work in this monorepo.
---

**Rule:** `lib/api-client-react/src/custom-fetch.ts` must pass `credentials: 'include'` to every `fetch()` call.

**Why:** Without it, the browser does not send or store session cookies with API requests. The session is established server-side via `express-session`, and all subsequent requests need the cookie to be authenticated. The Orval-generated hooks use `customFetch` for every call, so this one change covers all endpoints.

**How to apply:**
- The fix is in the `customFetch` function: `const response = await fetch(input, { credentials: 'include', ...init, method, headers });`
- `credentials: 'include'` is placed before `...init` so it can be overridden per-call if ever needed.
- The backend's CORS config must include `credentials: true` (already set in `artifacts/api-server/src/app.ts`).
