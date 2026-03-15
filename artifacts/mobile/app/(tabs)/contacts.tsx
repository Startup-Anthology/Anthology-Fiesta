import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { REL_TYPES, REL_COLORS, PRIORITIES, PRIORITY_COLORS } from "@/constants/crm";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | "followups">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newType, setNewType] = useState("other");
  const [newPriority, setNewPriority] = useState("medium");

  const { data: contacts = [], isLoading, refetch } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => api.getContacts(),
  });
  const { data: followUps = [], refetch: refetchFU } = useQuery({
    queryKey: ["followUps"],
    queryFn: api.getFollowUps,
  });

  const createMut = useMutation({
    mutationFn: api.createContact,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      setShowAdd(false);
      setNewName(""); setNewEmail(""); setNewCompany(""); setNewType("other"); setNewPriority("medium");
    },
  });
  const markMut = useMutation({
    mutationFn: (id: number) => api.markContacted(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["followUps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const horizonSyncMut = useMutation({
    mutationFn: () => api.syncFromHorizon(),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["followUps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      const parts = [];
      if (data.leads) parts.push(`Leads: ${data.leads.created} new, ${data.leads.updated} updated`);
      if (data.contacts) parts.push(`Contacts: ${data.contacts.created} new, ${data.contacts.updated} updated`);
      Alert.alert("Horizon Sync Complete", parts.join("\n") || "Sync finished.");
    },
    onError: () => Alert.alert("Sync Failed", "Could not connect to Horizon. Check your API keys in Settings."),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const listData = tab === "all" ? contacts : followUps;

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
        <Text style={[styles.title, { color: colors.text }]}>Contacts</Text>
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
          <HamburgerMenu />
        </View>
      </View>

      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, { backgroundColor: colors.surfaceSecondary }, tab === "all" && { backgroundColor: colors.primary }]}
          onPress={() => setTab("all")}
          accessibilityRole="tab"
          accessibilityLabel="All contacts"
          accessibilityState={{ selected: tab === "all" }}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, tab === "all" && styles.tabTextActive, tab === "all" && { color: colors.onPrimary }]}>All</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, { backgroundColor: colors.surfaceSecondary }, tab === "followups" && { backgroundColor: colors.primary }]}
          onPress={() => setTab("followups")}
          accessibilityRole="tab"
          accessibilityLabel={`Follow-ups${followUps.length > 0 ? `, ${followUps.length} due` : ""}`}
          accessibilityState={{ selected: tab === "followups" }}
        >
          <Feather name="clock" size={14} color={tab === "followups" ? colors.onPrimary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: colors.textSecondary }, tab === "followups" && styles.tabTextActive, tab === "followups" && { color: colors.onPrimary }]}>Follow-ups</Text>
          {followUps.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.error }]}><Text style={styles.badgeText}>{followUps.length}</Text></View>
          )}
        </Pressable>
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetch(); refetchFU(); }} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.contactCard, { backgroundColor: colors.surface }, pressed && styles.pressed]}
            onPress={() => router.push({ pathname: "/contact/[id]", params: { id: String(item.id) } })}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.company ? `, ${item.company}` : ""}`}
            accessibilityHint="Double tap to view contact"
          >
            <View style={[styles.avatar, { backgroundColor: REL_COLORS[item.relationshipType] || colors.primary }]}>
              <Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
            <View style={styles.contactInfo}>
              <Text style={[styles.contactName, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.contactCompany, { color: colors.textSecondary }]}>{item.company || item.title || ""}</Text>
              <View style={styles.contactMeta}>
                <View style={[styles.relBadge, { backgroundColor: (REL_COLORS[item.relationshipType] || colors.primary) + "15" }]}>
                  <Text style={[styles.relText, { color: REL_COLORS[item.relationshipType] || colors.primary }]}>
                    {item.relationshipType}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.contactRight}>
              <View style={[styles.priorityIndicator, { backgroundColor: PRIORITY_COLORS[item.priority] }]} />
              {tab === "followups" && (
                <Pressable
                  style={[styles.markBtn, { backgroundColor: colors.success + "15" }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    markMut.mutate(item.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Mark ${item.name} as contacted`}
                >
                  <Feather name="check" size={16} color={colors.success} />
                </Pressable>
              )}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="users" size={48} color={colors.textTertiary} />
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>{tab === "all" ? "No contacts yet" : "No follow-ups due"}</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textTertiary }]}>{tab === "all" ? "Start with the people who matter most." : "All caught up. That's how you stay ahead."}</Text>
            {tab === "all" && (
              <Pressable
                style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowAdd(true);
                }}
              >
                <Feather name="plus" size={16} color={colors.onPrimary} />
                <Text style={[styles.emptyBtnText, { color: colors.onPrimary }]}>Add Contact</Text>
              </Pressable>
            )}
          </View>
        }
      />

      <Pressable
        style={({ pressed }) => [styles.fab, { backgroundColor: colors.primary }, pressed && { transform: [{ scale: 0.95 }] }]}
        accessibilityRole="button"
        accessibilityLabel="Add contact"
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setShowAdd(true);
        }}
      >
        <Feather name="plus" size={24} color={colors.onPrimary} />
      </Pressable>

      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={[styles.modalContent, { backgroundColor: colors.background, paddingTop: Platform.OS === "web" ? 67 : insets.top + 16 }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAdd(false)}>
              <Text style={[styles.cancelBtn, { color: colors.info }]}>Cancel</Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: colors.text }]}>New Contact</Text>
            <Pressable onPress={() => { if (newName) createMut.mutate({ name: newName, email: newEmail || undefined, company: newCompany || undefined, relationshipType: newType, priority: newPriority }); }} disabled={!newName}>
              <Text style={[styles.saveBtn, { color: colors.info }, !newName && styles.saveBtnDisabled]}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Name</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]} value={newName} onChangeText={setNewName} placeholder="Contact name" placeholderTextColor={colors.textTertiary} autoFocus />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Email</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]} value={newEmail} onChangeText={setNewEmail} placeholder="email@example.com" placeholderTextColor={colors.textTertiary} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Company</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.surface, color: colors.text }]} value={newCompany} onChangeText={setNewCompany} placeholder="Company name" placeholderTextColor={colors.textTertiary} />
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Relationship</Text>
            <View style={styles.chipRow}>
              {REL_TYPES.map((t) => (
                <Pressable key={t} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, newType === t && { backgroundColor: colors.primary, borderColor: colors.primary }]} onPress={() => setNewType(t)}>
                  <Text style={[styles.chipText, { color: colors.text }, newType === t && styles.chipTextActive, newType === t && { color: colors.onPrimary }]}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.formGroup}>
            <Text style={[styles.formLabel, { color: colors.textSecondary }]}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map((p) => (
                <Pressable key={p} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, newPriority === p && { backgroundColor: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p] }]} onPress={() => setNewPriority(p)}>
                  <Text style={[styles.chipText, { color: colors.text }, newPriority === p && { color: colors.onPrimary }]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: Layout.screenPadding, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 24, fontFamily: "Lato_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  syncBtnText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
  tabs: { flexDirection: "row", paddingHorizontal: Layout.screenPadding, gap: 8, marginBottom: 12, marginTop: 10 },
  tab: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius },
  tabText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium" },
  tabTextActive: { color: "#FFFFFF" },
  badge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: "center" },
  badgeText: { fontSize: 11, fontFamily: "Lato_700Bold", color: "#fff" },
  listContent: { padding: Layout.screenPadding, paddingBottom: 100 },
  contactCard: { flexDirection: "row", alignItems: "center", borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  pressed: { opacity: 0.7 },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: "center", alignItems: "center", marginRight: 12 },
  avatarText: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold" },
  contactCompany: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", marginTop: 1 },
  contactMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  relBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  relText: { fontSize: 11, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "capitalize" },
  contactRight: { alignItems: "center", gap: 8 },
  priorityIndicator: { width: 8, height: 8, borderRadius: 4 },
  markBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold" },
  emptySubtitle: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", textAlign: "center", paddingHorizontal: 32 },
  fab: { position: "absolute", bottom: 100, right: 20, width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: Layout.fabElevation },
  modalContent: { flex: 1, padding: Layout.screenPadding },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Layout.sectionSpacing },
  modalTitle: { fontSize: 17, fontFamily: "LeagueSpartan_600SemiBold" },
  cancelBtn: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular" },
  saveBtn: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold" },
  saveBtnDisabled: { opacity: 0.4 },
  formGroup: { marginBottom: 22 },
  formLabel: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 8, textTransform: "uppercase" },
  input: { borderRadius: Layout.inputRadius, padding: Layout.cardPadding, fontSize: 16, fontFamily: "SpaceGrotesk_400Regular" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", textTransform: "capitalize" },
  chipTextActive: { color: "#fff" },
  emptyBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: Layout.inputRadius, paddingVertical: 12, paddingHorizontal: 20, marginTop: 16 },
  emptyBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
});
