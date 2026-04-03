# Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal search screen reachable from the Pipeline header that finds leads and contacts by name or email.

**Architecture:** A new `app/search.tsx` modal screen uses the existing `["leads"]` and `["contacts"]` React Query cache keys. On first keystroke, the current data is snapshotted into local state; all filtering runs against that immutable snapshot so the list cannot mutate mid-search. The snapshot resets when the user clears the input so each new search reads fresh data.

**Tech Stack:** Expo Router (modal route), React Query v5 (`useQuery`), React Native (`FlatList`, `TextInput`, `Pressable`), `@expo/vector-icons` (Feather), existing `ErrorState` component.

---

### Task 1: Register the search modal route

**Files:**
- Modify: `artifacts/mobile/app/_layout.tsx:93-111`

- [ ] **Step 1: Add the Stack.Screen entry**

In `RootLayoutNav`, add one line after the `broadcast/new` entry (line 98):

```tsx
<Stack.Screen name="search" options={{ presentation: "modal" }} />
```

The full `Stack` block after the change:

```tsx
<Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
  <Stack.Screen name="(tabs)" />
  <Stack.Screen name="lead/[id]" />
  <Stack.Screen name="contact/[id]" />
  <Stack.Screen name="compose-email" options={{ presentation: "modal" }} />
  <Stack.Screen name="template/[id]" options={{ presentation: "modal" }} />
  <Stack.Screen name="sequence/[id]" options={{ presentation: "modal" }} />
  <Stack.Screen name="broadcast/[id]" />
  <Stack.Screen name="broadcast/new" options={{ presentation: "modal" }} />
  <Stack.Screen name="search" options={{ presentation: "modal" }} />
  <Stack.Screen name="comms" />
  <Stack.Screen name="files" />
  <Stack.Screen name="settings" />
  <Stack.Screen name="settings/profile" />
  <Stack.Screen name="settings/appearance" />
  <Stack.Screen name="settings/integrations" />
  <Stack.Screen name="settings/general" />
  <Stack.Screen name="settings/triggers" />
  <Stack.Screen name="admin" />
</Stack>
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter mobile exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add artifacts/mobile/app/_layout.tsx
git commit -m "feat: register search modal route in _layout"
```

---

### Task 2: Create the search screen

**Files:**
- Create: `artifacts/mobile/app/search.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState } from "@/components/ErrorState";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const LEAD_COLOR = "#BB935B";
const CONTACT_COLOR = "#6366f1";

type SearchRecord = {
  id: number;
  type: "lead" | "contact";
  name: string;
  email?: string | null;
};

function buildSnapshot(leads: any[], contacts: any[]): SearchRecord[] {
  return [
    ...leads.map((l) => ({ id: l.id, type: "lead" as const, name: l.name, email: l.email })),
    ...contacts.map((c) => ({ id: c.id, type: "contact" as const, name: c.name, email: c.email })),
  ];
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState<SearchRecord[] | null>(null);

  const {
    data: leads = [],
    isLoading: leadsLoading,
    isError: leadsError,
    refetch: refetchLeads,
  } = useQuery({ queryKey: ["leads"], queryFn: () => api.getLeads() });

  const {
    data: contacts = [],
    isLoading: contactsLoading,
    isError: contactsError,
    refetch: refetchContacts,
  } = useQuery({ queryKey: ["contacts"], queryFn: () => api.getContacts() });

  const isLoading = leadsLoading || contactsLoading;
  const isError = leadsError || contactsError;

  // Late-load case: user typed before data arrived. Once loading clears, take the snapshot.
  // Only isLoading is listed as a dep intentionally — we only want to fire when loading
  // transitions to false. The snapshot !== null guard prevents re-snapshotting on refetches.
  useEffect(() => {
    if (!isLoading && !isError && query.trim() && snapshot === null) {
      setSnapshot(buildSnapshot(leads, contacts));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setSnapshot(null);
      return;
    }
    // First keystroke while data is ready: lock the snapshot now.
    if (snapshot === null && !isLoading && !isError) {
      setSnapshot(buildSnapshot(leads, contacts));
    }
  };

  const trimmed = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!trimmed || !snapshot) return [];
    return snapshot.filter(
      (r) =>
        r.name?.toLowerCase().includes(trimmed) ||
        r.email?.toLowerCase().includes(trimmed)
    );
  }, [trimmed, snapshot]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close search"
        >
          <Feather name="x" size={22} color={colors.primary} />
        </Pressable>
        <TextInput
          style={[styles.input, { color: colors.text, backgroundColor: colors.surface }]}
          value={query}
          onChangeText={handleQueryChange}
          placeholder="Search leads & contacts…"
          placeholderTextColor={colors.textTertiary}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search leads and contacts"
        />
      </View>

      {!trimmed ? (
        <View style={styles.centeredState}>
          <Feather name="search" size={40} color={colors.textTertiary} />
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            Search by name or email
          </Text>
        </View>
      ) : isError && snapshot === null ? (
        <ErrorState
          message="Couldn't load results."
          onRetry={() => {
            refetchLeads();
            refetchContacts();
          }}
        />
      ) : isLoading && snapshot === null ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centeredState}>
          <Text style={[styles.stateIcon, { color: colors.textTertiary }]}>🤷</Text>
          <Text style={[styles.stateText, { color: colors.textSecondary }]}>
            No results for "{query.trim()}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const color = item.type === "lead" ? LEAD_COLOR : CONTACT_COLOR;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: colors.surface },
                  pressed && styles.pressed,
                ]}
                onPress={() =>
                  router.push(
                    item.type === "lead"
                      ? { pathname: "/lead/[id]", params: { id: String(item.id) } }
                      : { pathname: "/contact/[id]", params: { id: String(item.id) } }
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={`${item.type === "lead" ? "Lead" : "Contact"}: ${item.name}`}
                accessibilityHint="Double tap to view"
              >
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarText}>
                    {item.name?.charAt(0)?.toUpperCase() ?? "?"}
                  </Text>
                </View>
                <View style={styles.info}>
                  <View style={styles.nameLine}>
                    <View style={[styles.typeBadge, { backgroundColor: color + "22" }]}>
                      <Text style={[styles.typeBadgeText, { color }]}>
                        {item.type === "lead" ? "LEAD" : "CONTACT"}
                      </Text>
                    </View>
                    <Text
                      style={[styles.name, { color: colors.text }]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                  {item.email ? (
                    <Text
                      style={[styles.email, { color: colors.textSecondary }]}
                      numberOfLines={1}
                    >
                      {item.email}
                    </Text>
                  ) : null}
                </View>
                <Feather name="chevron-right" size={16} color={colors.textTertiary} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    borderRadius: Layout.inputRadius,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    fontFamily: "HankenGrotesk_400Regular",
  },
  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  stateIcon: { fontSize: 32 },
  stateText: {
    fontSize: 15,
    fontFamily: "HankenGrotesk_400Regular",
    textAlign: "center",
  },
  listContent: { padding: Layout.screenPadding, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
    gap: 10,
    ...Layout.shadow.sm,
  },
  pressed: { opacity: 0.92 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 16,
    fontFamily: "HankenGrotesk_600SemiBold",
    color: "#fff",
  },
  info: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  typeBadge: {
    borderRadius: Layout.badgeRadius,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeBadgeText: {
    fontSize: 9,
    fontFamily: "HankenGrotesk_700Bold",
    letterSpacing: 0.3,
  },
  name: {
    fontSize: 15,
    fontFamily: "HankenGrotesk_600SemiBold",
    flexShrink: 1,
  },
  email: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_400Regular",
    marginTop: 2,
  },
});
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter mobile exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
pnpm --filter mobile lint
```

Expected: no errors. If the `eslint-disable` comment on the `useEffect` triggers a lint rule requiring a description, change it to:

```ts
// eslint-disable-next-line react-hooks/exhaustive-deps -- only isLoading intentional; null guard prevents re-snapshot
```

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/app/search.tsx
git commit -m "feat: add global search modal screen"
```

---

### Task 3: Add search icon to Pipeline header

**Files:**
- Modify: `artifacts/mobile/app/(tabs)/funnel.tsx`

- [ ] **Step 1: Add the search Pressable to headerRight**

Locate the block ending with `<HamburgerMenu />` inside `<View style={styles.headerRight}>` (around line 259). Add a new `Pressable` immediately before `<HamburgerMenu />`:

```tsx
<Pressable
  onPress={() => router.push("/search")}
  style={[styles.viewToggle, { backgroundColor: colors.surfaceSecondary }]}
  hitSlop={8}
  accessibilityRole="button"
  accessibilityLabel="Search leads and contacts"
>
  <Feather name="search" size={20} color={colors.primary} />
</Pressable>
<HamburgerMenu />
```

`styles.viewToggle` is already defined as `{ padding: 6, borderRadius: Layout.badgeRadius }` — no new style needed.

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter mobile exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
pnpm --filter mobile lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add artifacts/mobile/app/(tabs)/funnel.tsx
git commit -m "feat: add search icon to Pipeline header"
```

---

## Manual Verification

After all tasks are complete, run the dev server and verify:

```bash
pnpm --filter mobile dev:fast
```

1. Open the Pipeline tab — search icon appears in the header next to the view-toggle button.
2. Tap the search icon — modal slides up, keyboard opens automatically.
3. Type a name — matching leads and contacts appear with LEAD/CONTACT badges.
4. Type an email fragment — correct records appear.
5. Clear the input — list disappears, "Search by name or email" prompt shows.
6. Tap a result — detail screen pushes on top; Back returns to search.
7. Tap X — modal dismisses.
8. Type before data loads (hard to reproduce manually; covered by the `useEffect` path).
