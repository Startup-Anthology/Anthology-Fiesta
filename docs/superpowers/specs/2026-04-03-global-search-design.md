# Global Search Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Add a global search screen that lets the user quickly find a lead or contact by name or email. Accessed from a search icon in the Pipeline screen header. Results from both datasets appear in a single unified list, each tagged with a type badge.

## Architecture

- **New route**: `app/search.tsx` — presented as a modal (`presentation: "modal"` in Expo Router)
- **Entry point**: Search icon (`feather: search`) added to the Pipeline screen header (`artifacts/mobile/app/(tabs)/funnel.tsx`). Calls `router.push("/search")`.
- **Data**: `useQuery(["leads"])` + `useQuery(["contacts"])` with default React Query options — staleness and refetch behaviour are unchanged.
- **Snapshot**: `snapshotRef` (`useRef`, initially `null`) is set on the **first keystroke** from whatever React Query has at that moment (`[...leads, ...contacts]`). It is released (reset to `null`) when the query is cleared back to empty. All filtering runs against the snapshot while a query is active. React Query may refetch freely in the background — the snapshot is immutable for the duration of one search. Each new search (after clearing) takes a fresh snapshot from current data.
- **Filtering**: `useMemo` over `snapshotRef.current`, case-insensitive match on `name` and `email`. Recomputes on every keystroke against the immutable snapshot.

## UI

### Search screen layout

- **Header**: TextInput with `autoFocus: true` (keyboard opens immediately), placeholder "Search leads & contacts…", and an X button on the left that dismisses the modal.
- **Result list**: `FlatList` of matched records below the input.
- **Empty query**: Show a centered prompt — search icon + "Search by name or email". No list rendered.
- **No results**: Centered — shrug icon + `No results for "[query]"`.
- **Loading indicator**: Small `ActivityIndicator` shown while either query has `isLoading: true` and the user has typed a query (snapshot not yet settable). Disappears once both queries resolve.

### Result row

Each row contains:
- **Avatar**: Circle with the record's initial. Gold (`#BB935B`) background for leads, indigo (`#6366f1`) for contacts.
- **Type badge**: `"LEAD"` or `"CONTACT"` label in small caps, tinted to match the avatar color.
- **Name**: Primary text.
- **Email**: Secondary text, single line, truncated with ellipsis.
- **Chevron**: `›` on the right edge.

Tapping a row navigates to `/lead/[id]` or `/contact/[id]` depending on the result type.

## Data Flow

1. Modal opens → `autoFocus` fires keyboard → both `useQuery` hooks activate (cache hit or fresh fetch). `snapshotRef` is `null`.
2. While either query has `isLoading: true` (no cache), show `ActivityIndicator`.
3. Empty query → empty-state prompt shown, no list rendered. React Query refetches freely — no list to mutate.
4. User types first character → `snapshotRef` is set to `[...leads, ...contacts]` at that instant. Subsequent React Query updates do not affect the snapshot.
5. `useMemo` filters `snapshotRef.current` on every keystroke — list is stable for the duration of this search.
6. User clears input → `snapshotRef` reset to `null`, empty-state prompt shown. Next keystroke takes a fresh snapshot from current React Query data.
7. If either fetch errors before any keystroke (snapshot still `null`), show the error state. Post-snapshot background refetch errors are silently ignored — the snapshot remains valid.
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
