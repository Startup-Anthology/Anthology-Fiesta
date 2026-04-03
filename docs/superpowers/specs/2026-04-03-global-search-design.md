# Global Search Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Add a global search screen that lets the user quickly find a lead or contact by name or email. Accessed from a search icon in the Pipeline screen header. Results from both datasets appear in a single unified list, each tagged with a type badge.

## Architecture

- **New route**: `app/search.tsx` — presented as a modal (`presentation: "modal"` in Expo Router)
- **Entry point**: Search icon (`feather: search`) added to the Pipeline screen header (`artifacts/mobile/app/(tabs)/funnel.tsx`). Calls `router.push("/search")`.
- **Data**: `useQuery(["leads"])` + `useQuery(["contacts"])` — same React Query cache keys used by the Pipeline tab. No new API endpoints required.
- **Filtering**: `useMemo` over `[...leads, ...contacts]`, case-insensitive match on `name` and `email`. Recomputes on every keystroke.

## UI

### Search screen layout

- **Header**: TextInput with `autoFocus: true` (keyboard opens immediately), placeholder "Search leads & contacts…", and an X button on the left that dismisses the modal.
- **Result list**: `FlatList` of matched records below the input.
- **Empty query**: Show a centered prompt — search icon + "Search by name or email". No list rendered.
- **No results**: Centered — shrug icon + `No results for "[query]"`.
- **Loading indicator**: Small `ActivityIndicator` shown only when either query has `isLoading: true` (no cache yet — cold open). Background refetches (`isFetching && !isLoading`) resolve silently; the stale results update in place with no indicator. Does not hide or block results.

### Result row

Each row contains:
- **Avatar**: Circle with the record's initial. Gold (`#BB935B`) background for leads, indigo (`#6366f1`) for contacts.
- **Type badge**: `"LEAD"` or `"CONTACT"` label in small caps, tinted to match the avatar color.
- **Name**: Primary text.
- **Email**: Secondary text, single line, truncated with ellipsis.
- **Chevron**: `›` on the right edge.

Tapping a row navigates to `/lead/[id]` or `/contact/[id]` depending on the result type.

## Data Flow

1. Modal opens → `autoFocus` fires keyboard → both `useQuery` hooks activate (or return from cache immediately).
2. Both default to `[]` until resolved. `useMemo` filters over whatever is currently available — each dataset contributes results as it resolves independently.
3. User types → filter recomputes synchronously from cached arrays.
4. If either fetch errors (`isError`), show the error state immediately — no partial results displayed.
5. Background refetches (`isFetching && !isLoading`) update results silently when they complete — no indicator shown. The `ActivityIndicator` only appears during a cold open (`isLoading: true`).
6. Tapping a result calls `router.push("/lead/[id]")` or `router.push("/contact/[id]")`. This pushes the detail screen on top of the modal in the root Stack — the modal stays in the back-stack so pressing Back from the detail screen returns to search.

## Files Changed

| File | Change |
|------|--------|
| `artifacts/mobile/app/search.tsx` | New modal screen |
| `artifacts/mobile/app/(tabs)/funnel.tsx` | Add search icon to header |
| `artifacts/mobile/app/_layout.tsx` | Add `<Stack.Screen name="search" options={{ presentation: "modal" }} />` |

No API, schema, or codegen changes required.

## Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `name` or `email` is `null`/`undefined` on a record | Optional chaining (`r.name?.toLowerCase().includes(q)`) short-circuits to `undefined` (falsy); record is excluded from results. No crash. |
| Query is all whitespace | `query.trim()` produces `""` → treated as empty query → empty-state prompt shown, no list rendered. |
| Either or both `useQuery` hooks fail | Show the error state ("Couldn't load results — pull down to retry"). Partial results are not displayed — a silent half-answer is worse than an honest failure because the user can't tell whether "no results" means no match or a broken fetch. |
| Search screen opened before Pipeline tab visited | `useQuery` hooks have no `enabled` guard on the search screen — they always fire. Fresh fetches run on mount; partial results appear as each resolves. |
| Keyboard overlaps results list | `FlatList` uses `keyboardShouldPersistTaps="handled"` so tapping a result row works without first dismissing the keyboard. |
| Name is long enough to overflow | Name rendered with `numberOfLines={1}` (truncated with ellipsis), same as email. |
| Android hardware Back button | Modal is on the root Stack; Android back naturally pops it — no special handling needed. |
