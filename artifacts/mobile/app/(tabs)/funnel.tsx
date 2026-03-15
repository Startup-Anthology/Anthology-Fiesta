import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors } from "@/constants/colors";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_COLORS, LEAD_SOURCES } from "@/constants/crm";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

function LeadCard({ lead, onSwipeLeft, onSwipeRight, colors }: { lead: any; onSwipeLeft: () => void; onSwipeRight: () => void; colors: ThemeColors }) {
  const pan = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > 80) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeRight();
        } else if (g.dx < -80) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onSwipeLeft();
        }
        Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
      },
    })
  ).current;

  const statusColor = STATUS_COLORS[lead.status] || colors.textSecondary;

  return (
    <Animated.View style={[styles.leadCard, { backgroundColor: colors.surface, transform: [{ translateX: pan }] }]} {...panResponder.panHandlers}>
      <Pressable
        onPress={() => router.push({ pathname: "/lead/[id]", params: { id: String(lead.id) } })}
        style={({ pressed }) => pressed && styles.pressed}
        accessibilityRole="button"
        accessibilityLabel={`${lead.name}, ${STATUS_LABELS[lead.status] ?? lead.status}`}
        accessibilityHint="Double tap to view lead. Swipe left or right to move to adjacent stage."
      >
        <View style={styles.leadCardHeader}>
          <Text style={[styles.leadName, { color: colors.text }]} numberOfLines={1}>{lead.name}</Text>
          {lead.isBeta && (
            <View style={[styles.betaBadge, { backgroundColor: colors.accent + "20" }]}>
              <Text style={[styles.betaBadgeText, { color: colors.accent }]}>BETA</Text>
            </View>
          )}
        </View>
        <Text style={[styles.leadEmail, { color: colors.textSecondary }]} numberOfLines={1}>{lead.email}</Text>
        <View style={styles.leadMeta}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABELS[lead.status]}</Text>
          </View>
          <Text style={[styles.sourceText, { color: colors.textTertiary }]}>{lead.source}</Text>
        </View>
        <View style={styles.swipeHint}>
          <Feather name="chevrons-left" size={10} color={colors.textTertiary} />
          <Text style={[styles.swipeHintText, { color: colors.textTertiary }]}>swipe to move</Text>
          <Feather name="chevrons-right" size={10} color={colors.textTertiary} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function FunnelScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newSource, setNewSource] = useState("other");

  const { data: leads = [], isLoading, refetch } = useQuery({
    queryKey: ["leads"],
    queryFn: () => api.getLeads(),
  });
  const horizonSyncMut = useMutation({
    mutationFn: () => api.syncFromHorizon(),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      const parts = [];
      if (data.leads) parts.push(`Leads: ${data.leads.created} new, ${data.leads.updated} updated`);
      if (data.contacts) parts.push(`Contacts: ${data.contacts.created} new, ${data.contacts.updated} updated`);
      Alert.alert("Horizon Sync Complete", parts.join("\n") || "Sync finished.");
    },
    onError: () => Alert.alert("Sync Failed", "Could not connect to Horizon. Check your API keys in Settings."),
  });
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => api.updateLeadStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leads"] }),
  });
  const createMut = useMutation({
    mutationFn: api.createLead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setShowAdd(false);
      setNewName("");
      setNewEmail("");
      setNewSource("other");
    },
  });

  const advanceStatus = (lead: any) => {
    const idx = LEAD_STATUSES.indexOf(lead.status);
    if (idx < LEAD_STATUSES.length - 1) {
      statusMut.mutate({ id: lead.id, status: LEAD_STATUSES[idx + 1] });
    }
  };
  const retreatStatus = (lead: any) => {
    const idx = LEAD_STATUSES.indexOf(lead.status);
    if (idx > 0) {
      statusMut.mutate({ id: lead.id, status: LEAD_STATUSES[idx - 1] });
    }
  };

  const betaCount = leads.filter((l: any) => l.isBeta).length;
  const betaTotal = parseInt(settings?.beta_slots_total || "100", 10);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Your Funnel</Text>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => {
              Alert.alert("Sync from Horizon", "Pull latest leads and contacts from Horizon?", [
                { text: "Cancel", style: "cancel" },
                { text: "Sync Now", onPress: () => horizonSyncMut.mutate() },
              ]);
            }}
            style={[styles.syncBtn, { backgroundColor: colors.accent }]}
            disabled={horizonSyncMut.isPending}
            accessibilityRole="button"
            accessibilityLabel="Sync from Horizon"
          >
            {horizonSyncMut.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Feather name="refresh-cw" size={13} color="#fff" />
                <Text style={styles.syncBtnText}>Sync</Text>
              </>
            )}
          </Pressable>
          <View style={[styles.betaCounter, { backgroundColor: colors.primary + "10" }]}>
            <Feather name="zap" size={14} color={colors.accent} />
            <Text style={[styles.betaCountText, { color: colors.primary }]}>{betaCount}/{betaTotal}</Text>
          </View>
          <Pressable
            onPress={() => setViewMode(viewMode === "kanban" ? "list" : "kanban")}
            style={[styles.viewToggle, { backgroundColor: colors.surfaceSecondary }]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={viewMode === "kanban" ? "Switch to list view" : "Switch to kanban view"}
          >
            <Feather name={viewMode === "kanban" ? "list" : "columns"} size={20} color={colors.primary} />
          </Pressable>
          <HamburgerMenu />
        </View>
      </View>

      {viewMode === "kanban" ? (
        leads.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="target" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No leads yet</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>You know who your first one is. Add them.</Text>
            <Pressable
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setShowAdd(true);
              }}
            >
              <Feather name="plus" size={16} color={colors.onPrimary} />
              <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>Add Lead</Text>
            </Pressable>
          </View>
        ) : (
        <ScrollView
          horizontal
          pagingEnabled={false}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kanbanContainer}
        >
          {LEAD_STATUSES.map((status) => {
            const col = leads.filter((l: any) => l.status === status);
            return (
              <View key={status} style={[styles.kanbanColumn, { backgroundColor: colors.surfaceSecondary }]}>
                <View style={styles.columnHeader}>
                  <View style={[styles.columnDot, { backgroundColor: STATUS_COLORS[status] }]} />
                  <Text style={[styles.columnTitle, { color: colors.text }]}>{STATUS_LABELS[status]}</Text>
                  <Text style={[styles.columnCount, { color: colors.textSecondary, backgroundColor: colors.surface }]}>{col.length}</Text>
                </View>
                <FlatList
                  data={col}
                  keyExtractor={(item) => String(item.id)}
                  renderItem={({ item }) => (
                    <LeadCard
                      lead={item}
                      onSwipeRight={() => advanceStatus(item)}
                      onSwipeLeft={() => retreatStatus(item)}
                      colors={colors}
                    />
                  )}
                  showsVerticalScrollIndicator={false}
                  scrollEnabled={col.length > 0}
                  ListEmptyComponent={
                    <View style={styles.emptyCol}>
                      <Text style={[styles.emptyText, { color: colors.textTertiary }]}>None yet</Text>
                    </View>
                  }
                />
              </View>
            );
          })}
        </ScrollView>
        )
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.listCard, { backgroundColor: colors.surface }, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: "/lead/[id]", params: { id: String(item.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${STATUS_LABELS[item.status] ?? item.status}`}
              accessibilityHint="Double tap to view lead"
            >
              <View style={styles.listCardLeft}>
                <Text style={[styles.leadName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.leadEmail, { color: colors.textSecondary }]}>{item.email}</Text>
              </View>
              <View style={styles.listCardRight}>
                <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] || colors.textSecondary) + "20" }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>
                    {STATUS_LABELS[item.status]}
                  </Text>
                </View>
                {item.isBeta && (
                  <View style={[styles.betaBadge, { backgroundColor: colors.accent + "20" }]}>
                    <Text style={[styles.betaBadgeText, { color: colors.accent }]}>BETA</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="target" size={48} color={colors.textTertiary} />
              <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No leads yet</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>You know who your first one is. Add them.</Text>
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowAdd(true);
                }}
              >
                <Feather name="plus" size={16} color={colors.onPrimary} />
                <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>Add Lead</Text>
              </Pressable>
            </View>
          }
        />
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && { transform: [{ scale: 0.95 }] }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add lead"
      >
        <Feather name="plus" size={24} color={colors.onPrimary} />
      </Pressable>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modalContent, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAdd(false)}>
              <Text style={[styles.cancelBtn, { color: colors.info }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Lead</Text>
            <Pressable
              onPress={() => {
                if (newName && newEmail) createMut.mutate({ name: newName, email: newEmail, source: newSource });
              }}
              disabled={!newName || !newEmail}
            >
              <Text style={[styles.saveBtn, { color: colors.info }, (!newName || !newEmail) && styles.saveBtnDisabled]}>Save</Text>
            </Pressable>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              value={newName}
              onChangeText={setNewName}
              placeholder="Lead name"
              placeholderTextColor={colors.textTertiary}
              autoFocus
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Email</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]}
              value={newEmail}
              onChangeText={setNewEmail}
              placeholder="email@example.com"
              placeholderTextColor={colors.textTertiary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Source</Text>
            <View style={styles.sourcePicker}>
              {LEAD_SOURCES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.sourceChip, { backgroundColor: colors.surface, borderColor: colors.border }, newSource === s && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setNewSource(s)}
                >
                  <Text style={[styles.sourceChipText, { color: colors.text }, newSource === s && { color: colors.onPrimary }]}>
                    {s.replace("_", " ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const COLUMN_WIDTH = Dimensions.get("window").width * 0.75;

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Layout.screenPadding, paddingVertical: 14 },
  title: { fontSize: 24, fontFamily: "Lato_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  syncBtnText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
  betaCounter: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Layout.inputRadius },
  betaCountText: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold" },
  viewToggle: { padding: 6, borderRadius: Layout.badgeRadius },
  kanbanContainer: { paddingHorizontal: 14, gap: 14, paddingBottom: 100 },
  kanbanColumn: { width: COLUMN_WIDTH, borderRadius: Layout.cardRadius, padding: Layout.cardPadding },
  columnHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  columnDot: { width: 8, height: 8, borderRadius: 4 },
  columnTitle: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", flex: 1 },
  columnCount: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", paddingHorizontal: 8, paddingVertical: 2, borderRadius: Layout.badgeRadius },
  leadCard: { borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  leadCardHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  leadName: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold", flex: 1 },
  leadEmail: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  leadMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusText: { fontSize: 11, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "uppercase" },
  betaBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  betaBadgeText: { fontSize: 10, fontFamily: "Lato_700Bold" },
  sourceText: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular" },
  emptyCol: { padding: Layout.screenPadding, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular" },
  listContent: { padding: Layout.screenPadding, paddingBottom: 100 },
  listCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  pressed: { opacity: 0.7 },
  listCardLeft: { flex: 1, marginRight: 12 },
  listCardRight: { alignItems: "flex-end", gap: 4 },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center", paddingHorizontal: 32 },
  fab: {
    position: "absolute",
    bottom: 100,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: Layout.fabElevation,
  },
  modalContent: { flex: 1, padding: Layout.screenPadding },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Layout.sectionSpacing },
  modalTitle: { fontSize: 17, fontFamily: "LeagueSpartan_600SemiBold" },
  cancelBtn: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular" },
  saveBtn: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold" },
  saveBtnDisabled: { opacity: 0.4 },
  formGroup: { marginBottom: 22 },
  formLabel: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 8, textTransform: "uppercase" },
  input: {
    borderRadius: Layout.inputRadius,
    padding: Layout.cardPadding,
    fontSize: 16,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  sourcePicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sourceChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, borderWidth: 1 },
  sourceChipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", textTransform: "capitalize" },
  sourceChipTextActive: { color: "#fff" },
  swipeHint: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10, opacity: 0.5 },
  swipeHintText: { fontSize: 10, fontFamily: "SpaceGrotesk_400Regular" },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: Layout.inputRadius, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  emptyBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
});
