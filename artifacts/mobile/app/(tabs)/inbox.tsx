import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ErrorState } from "@/components/ErrorState";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

type TabKey = "broadcasts" | "sequences" | "templates";

const TAB_LABELS: Record<TabKey, string> = {
  broadcasts: "Broadcasts",
  sequences: "Sequences",
  templates: "Templates",
};

const TAB_ICONS: Record<TabKey, string> = {
  broadcasts: "send",
  sequences: "repeat",
  templates: "file-text",
};

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [tab, setTab] = useState<TabKey>("broadcasts");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: broadcasts = [], isLoading: bLoading, isError: bError, refetch: bRefetch } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: api.getBroadcasts,
  });
  const { data: sequences = [], isLoading: sLoading, isError: sError, refetch: sRefetch } = useQuery({
    queryKey: ["sequences"],
    queryFn: api.getSequences,
  });
  const { data: templates = [], isLoading: tLoading, isError: tError, refetch: tRefetch } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });

  const isLoading = tab === "broadcasts" ? bLoading : tab === "sequences" ? sLoading : tLoading;
  const isError = tab === "broadcasts" ? bError : tab === "sequences" ? sError : tError;
  const onRefresh = tab === "broadcasts" ? bRefetch : tab === "sequences" ? sRefetch : tRefetch;

  const data: any[] = tab === "broadcasts" ? broadcasts : tab === "sequences" ? sequences : templates;

  function renderItem({ item }: { item: any }) {
    if (tab === "broadcasts") {
      return (
        <Pressable
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: "/broadcast/[id]", params: { id: String(item.id) } })}
          accessibilityRole="button"
          accessibilityLabel={item.subject || item.name}
        >
          <View style={styles.cardIcon}>
            <Feather name="send" size={16} color={colors.accent} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.subject || "Untitled broadcast"}</Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              {item.status} · {item.recipientCount ?? 0} recipients
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textTertiary} />
        </Pressable>
      );
    }
    if (tab === "sequences") {
      return (
        <Pressable
          style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
          onPress={() => router.push({ pathname: "/sequence/[id]", params: { id: String(item.id) } })}
          accessibilityRole="button"
          accessibilityLabel={item.name}
        >
          <View style={styles.cardIcon}>
            <Feather name="repeat" size={16} color={colors.info} />
          </View>
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
            <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
              {item.stepCount ?? 0} steps
              {item.activeEnrollments != null ? ` · ${item.activeEnrollments} active` : ""}
            </Text>
          </View>
          <Feather name="chevron-right" size={16} color={colors.textTertiary} />
        </Pressable>
      );
    }
    // templates
    return (
      <Pressable
        style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
        onPress={() => router.push({ pathname: "/template/[id]", params: { id: String(item.id) } })}
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        <View style={styles.cardIcon}>
          <Feather name="file-text" size={16} color={colors.primary} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]} numberOfLines={1}>{item.subject}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.textTertiary} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Inbox</Text>
        {tab === "broadcasts" && (
          <Pressable
            style={[styles.newBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/broadcast/new")}
            accessibilityRole="button"
            accessibilityLabel="New broadcast"
          >
            <Feather name="plus" size={14} color={colors.onPrimary} />
            <Text style={[styles.newBtnText, { color: colors.onPrimary }]}>New</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.segmented, { backgroundColor: colors.surface }]}>
        {(["broadcasts", "sequences", "templates"] as TabKey[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.segment, tab === t && { backgroundColor: colors.background, ...Layout.shadow.sm }]}
            onPress={() => setTab(t)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t }}
            accessibilityLabel={TAB_LABELS[t]}
          >
            <Feather name={TAB_ICONS[t] as any} size={13} color={tab === t ? colors.text : colors.textTertiary} />
            <Text style={[styles.segmentText, { color: tab === t ? colors.text : colors.textTertiary },
              tab === t && { fontFamily: "SpaceGrotesk_600SemiBold" }]}>
              {TAB_LABELS[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1, alignSelf: "center" }} color={colors.primary} />
      ) : isError ? (
        <ErrorState message={`Failed to load ${TAB_LABELS[tab].toLowerCase()}.`} onRetry={onRefresh} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name={TAB_ICONS[tab] as any} size={40} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No {TAB_LABELS[tab].toLowerCase()} yet
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: Layout.screenPadding,
    paddingVertical: 14,
  },
  title: { fontSize: 24, fontFamily: "SpaceGrotesk_700Bold" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  newBtnText: { fontSize: 13, fontFamily: "SpaceGrotesk_600SemiBold" },
  segmented: {
    flexDirection: "row",
    marginHorizontal: Layout.screenPadding,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 7,
    borderRadius: 8,
  },
  segmentText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium" },
  listContent: { paddingHorizontal: Layout.screenPadding, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
    gap: 12,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  cardMeta: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  pressed: { opacity: 0.7 },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 15, fontFamily: "SpaceGrotesk_400Regular" },
});
