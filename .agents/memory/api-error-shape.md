---
name: ApiError shape
description: How errors from useCreateRender and other mutations are structured — critical for correct toast messages
---

# ApiError shape in api-client-react

The custom fetch (`lib/api-client-react/src/custom-fetch.ts`) throws `ApiError` on non-2xx responses.

`ApiError` is a subclass of `Error` with:
- `.message` — formatted string like `"HTTP 403 Forbidden: Free tier limit of 5 renders reached."`
- `.status` — HTTP status code number
- `.data` — the parsed JSON response body (e.g. `{ error: "Free tier limit..." }`)

**Correct extraction pattern:**
```ts
const extractErrorMsg = (error: unknown): string => {
  const e = error as { data?: { error?: string }; message?: string };
  return e?.data?.error ?? e?.message ?? 'Please try again.';
};
```

**Wrong pattern (was in codebase):**
```ts
(error as { error?: string })?.error  // always undefined — ApiError has no .error property
```

**Why:** The `.error` field from the JSON body lives at `error.data.error`, not at the top level of the thrown object.

**How to apply:** Any `onError` callback for Orval-generated React Query mutations must use `extractErrorMsg(error)` or equivalent. Both `handleRender` and `handleRefine` in `studio.tsx` have been updated.
