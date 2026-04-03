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
- **Loading indicator**: Small `ActivityIndicator` rendered below the result list while either query is still in-flight and the user has typed a query. Disappears once both queries settle. Does not hide or block results.

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
4. If one fetch hangs, the other's results are still visible. No global loading gate.
5. If both fetches fail, the result area stays empty (no explicit combined error state — each query's error is silently swallowed since the empty state is already shown).
6. Tapping a result calls `router.push("/lead/[id]")` or `router.push("/contact/[id]")`. This pushes the detail screen on top of the modal in the root Stack — the modal stays in the back-stack so pressing Back from the detail screen returns to search.

## Files Changed

| File | Change |
|------|--------|
| `artifacts/mobile/app/search.tsx` | New modal screen |
| `artifacts/mobile/app/(tabs)/funnel.tsx` | Add search icon to header |
| `artifacts/mobile/app/_layout.tsx` | Add `<Stack.Screen name="search" options={{ presentation: "modal" }} />` |

No API, schema, or codegen changes required.
