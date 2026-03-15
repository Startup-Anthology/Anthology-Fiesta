import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { HamburgerMenu } from "@/components/HamburgerMenu";
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
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

type TabKey = "templates" | "sequences" | "broadcasts";

export default function CommsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [tab, setTab] = useState<TabKey>("templates");
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: templates = [], isLoading: tLoading, refetch: tRefetch } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });
  const { data: sequences = [], isLoading: sLoading, refetch: sRefetch } = useQuery({
    queryKey: ["sequences"],
    queryFn: api.getSequences,
  });
  const { data: broadcasts = [], isLoading: bLoading, refetch: bRefetch } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: api.getBroadcasts,
  });

  const isLoading = tab === "templates" ? tLoading : tab === "sequences" ? sLoading : bLoading;
  const onRefresh = tab === "templates" ? tRefetch : tab === "sequences" ? sRefetch : bRefetch;

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]}>Workflows</Text>
        <HamburgerMenu />
      </View>

      <View style={styles.tabs}>
        {(["templates", "sequences", "broadcasts"] as TabKey[]).map((t) => (
          <Pressable key={t} style={[styles.tab, { backgroundColor: colors.surfaceSecondary }, tab === t && { backgroundColor: colors.primary }]} onPress={() => setTab(t)}>
            <Feather
              name={t === "templates" ? "file-text" : t === "sequences" ? "repeat" : "send" as any}
              size={14}
              color={tab === t ? colors.onPrimary : colors.textSecondary}
            />
            <Text style={[styles.tabText, { color: colors.textSecondary }, tab === t && { color: colors.onPrimary }]}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          {tab === "templates" && (
            <FlatList
              data={templates}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/template/[id]", params: { id: String(item.id) } })}
                >
                  <View style={[styles.cardIcon, { backgroundColor: colors.primary + "15" }]}>
                    <Feather name="file-text" size={18} color={colors.primary} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>{item.subject}</Text>
                    <View style={[styles.audienceBadge, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.audienceText, { color: colors.textSecondary }]}>{item.audience}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="file-text" size={48} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No templates yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>Write once. Send whenever you need it.</Text>
                  <Pressable style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/template/new")}>
                    <Feather name="plus" size={16} color={colors.onPrimary} />
                    <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>Create Template</Text>
                  </Pressable>
                </View>
              }
            />
          )}

          {tab === "sequences" && (
            <FlatList
              data={sequences}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/sequence/[id]", params: { id: String(item.id) } })}
                >
                  <View style={[styles.cardIcon, { backgroundColor: colors.info + "15" }]}>
                    <Feather name="repeat" size={18} color={colors.info} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.name}</Text>
                    <View style={[styles.audienceBadge, { backgroundColor: colors.surfaceSecondary }]}>
                      <Text style={[styles.audienceText, { color: colors.textSecondary }]}>{item.targetAudience}</Text>
                    </View>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="repeat" size={48} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No sequences yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>Build a drip. Let it work while you don't.</Text>
                  <Pressable style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/sequence/new")}>
                    <Feather name="plus" size={16} color={colors.onPrimary} />
                    <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>Create Sequence</Text>
                  </Pressable>
                </View>
              }
            />
          )}

          {tab === "broadcasts" && (
            <FlatList
              data={broadcasts}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.primary} />}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.card, { backgroundColor: colors.surface }, pressed && styles.pressed]}
                  onPress={() => router.push({ pathname: "/broadcast/[id]", params: { id: String(item.id) } })}
                >
                  <View style={[styles.cardIcon, { backgroundColor: colors.success + "15" }]}>
                    <Feather name="send" size={18} color={colors.success} />
                  </View>
                  <View style={styles.cardContent}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{item.subject}</Text>
                    <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]}>
                      {item.recipientCount} recipients · {item.status}
                    </Text>
                    <Text style={[styles.cardDate, { color: colors.textTertiary }]}>
                      {item.sentAt ? new Date(item.sentAt).toLocaleDateString() : "Draft"}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary} />
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Feather name="send" size={48} color={colors.textTertiary} />
                  <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No broadcasts yet</Text>
                  <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>One message. Every inbox that matters.</Text>
                  <Pressable style={[styles.emptyBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/broadcast/new")}>
                    <Feather name="plus" size={16} color={colors.onPrimary} />
                    <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>New Broadcast</Text>
                  </Pressable>
                </View>
              }
            />
          )}
        </>
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && { transform: [{ scale: 0.95 }] }]}
        onPress={() => {
          if (tab === "templates") router.push("/template/new");
          else if (tab === "sequences") router.push("/sequence/new");
          else router.push("/broadcast/new");
        }}
      >
        <Feather name="plus" size={24} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Layout.screenPadding, paddingTop: 14, paddingBottom: 6, gap: 12 },
  title: { fontSize: 24, fontFamily: "Lato_700Bold" },
  settingsBtn: { padding: 8, borderRadius: Layout.badgeRadius },
  tabs: { flexDirection: "row", paddingHorizontal: Layout.screenPadding, gap: 8, marginTop: 10, marginBottom: 12 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius },
  tabText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium" },
  tabTextActive: { color: "#FFFFFF" },
  listContent: { padding: Layout.screenPadding, paddingBottom: 100 },
  card: { flexDirection: "row", alignItems: "center", borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  pressed: { opacity: 0.7 },
  cardIcon: { width: 40, height: 40, borderRadius: Layout.inputRadius, justifyContent: "center", alignItems: "center", marginRight: 12 },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold" },
  cardSubtitle: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  cardDate: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  audienceBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginTop: 4 },
  audienceText: { fontSize: 11, fontFamily: "SpaceGrotesk_500Medium", textTransform: "capitalize" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center", paddingHorizontal: 32 },
  fab: { position: "absolute", bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: Layout.fabElevation },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: Layout.inputRadius, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  emptyBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
});
