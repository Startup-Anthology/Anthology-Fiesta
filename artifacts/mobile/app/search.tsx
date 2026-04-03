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

  // Late-load case: user typed before data arrived — take snapshot once loading completes.
  // Only isLoading in deps is intentional: fires once when loading transitions to false.
  // The snapshot !== null guard prevents re-snapshotting on subsequent background refetches.
  useEffect(() => {
    if (!isLoading && !isError && query.trim() && snapshot === null) {
      setSnapshot(buildSnapshot(leads, contacts));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      // Clear input → release snapshot so next search gets fresh data
      setSnapshot(null);
      return;
    }
    // First keystroke while data is ready → lock snapshot now
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
                    <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  {item.email ? (
                    <Text style={[styles.email, { color: colors.textSecondary }]} numberOfLines={1}>
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
