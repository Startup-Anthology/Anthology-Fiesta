# Global Search Design

**Date:** 2026-04-03
**Status:** Approved

## Overview

Add a global search screen that lets the user quickly find a lead or contact by name or email. Accessed from a search icon in the Pipeline screen header. Results from both datasets appear in a single unified list, each tagged with a type badge.

## Architecture

- **New route**: `app/search.tsx` — presented as a modal (`presentation: "modal"` in Expo Router)
- **Entry point**: Search icon (`feather: search`) added to the Pipeline screen header (`artifacts/mobile/app/(tabs)/funnel.tsx`). Calls `router.push("/search")`.
- **Data**: `useQuery(["leads"])` + `useQuery(["contacts"])` with default React Query options — staleness and refetch behaviour are unchanged. Once both queries have data (`!leadsLoading && !contactsLoading`), the results are captured into a `snapshotRef` (a `useRef` set exactly once). All filtering runs against this snapshot for the modal's lifetime. React Query may refetch in the background but snapshot never updates — list is stable. The next time the modal opens, a fresh snapshot is taken from whatever React Query has at that point. No new API endpoints required.
- **Filtering**: `useMemo` over `snapshotRef.current`, case-insensitive match on `name` and `email`. Recomputes on every keystroke against the immutable snapshot.

## UI

### Search screen layout

- **Header**: TextInput with `autoFocus: true` (keyboard opens immediately), placeholder "Search leads & contacts…", and an X button on the left that dismisses the modal.
- **Result list**: `FlatList` of matched records below the input.
- **Empty query**: Show a centered prompt — search icon + "Search by name or email". No list rendered.
- **No results**: Centered — shrug icon + `No results for "[query]"`.
- **Loading indicator**: Small `ActivityIndicator` shown while either query has `isLoading: true` (snapshot not yet set). Disappears once both queries resolve and the snapshot locks in.

### Result row

Each row contains:
- **Avatar**: Circle with the record's initial. Gold (`#BB935B`) background for leads, indigo (`#6366f1`) for contacts.
- **Type badge**: `"LEAD"` or `"CONTACT"` label in small caps, tinted to match the avatar color.
- **Name**: Primary text.
- **Email**: Secondary text, single line, truncated with ellipsis.
- **Chevron**: `›` on the right edge.

Tapping a row navigates to `/lead/[id]` or `/contact/[id]` depending on the result type.

## Data Flow

1. Modal opens → `autoFocus` fires keyboard → both `useQuery` hooks activate (cache hit or fresh fetch).
2. While either query has `isLoading: true` (no cache), show `ActivityIndicator`. Both default to `[]`.
3. Once both queries have data (`!leadsLoading && !contactsLoading`), `snapshotRef` is set once to `[...leads, ...contacts]`. It never updates again for this modal session.
4. User types → `useMemo` filters `snapshotRef.current` synchronously. React Query may refetch in the background but the snapshot is immutable — the list cannot mutate mid-search.
5. If either fetch errors before the snapshot is set, show the error state. If an error occurs after the snapshot is set (background refetch fails), it is silently ignored — the snapshot remains valid.
6. Next modal open takes a fresh snapshot, so stale data never persists across sessions.
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
