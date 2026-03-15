import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AiAlertBanner from "@/components/AiAlertBanner";
import ActivityDetailModal from "@/components/ActivityDetailModal";
import ActivityList from "@/components/ActivityList";
import EventDetailModal from "@/components/EventDetailModal";
import HistoryModal from "@/components/HistoryModal";
import LinkedInLogModal from "@/components/LinkedInLogModal";
import ProfilePicModal from "@/components/ProfilePicModal";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { LEAD_STATUSES, STATUS_LABELS, STATUS_COLORS } from "@/constants/crm";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";

export default function LeadDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [historyVisible, setHistoryVisible] = useState(false);
  const [selectedRevision, setSelectedRevision] = useState<any>(null);
  const [editingFields, setEditingFields] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [showPicModal, setShowPicModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  const leadId = useMemo(() => Number(id), [id]);

  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead", id],
    queryFn: () => api.getLead(leadId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", "lead", id],
    queryFn: () => api.getActivities({ leadId }),
  });
  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendarEvents", "lead", id],
    queryFn: () => api.getCalendarEvents({ leadId }),
  });
  const { data: sequences = [] } = useQuery({ queryKey: ["sequences"], queryFn: api.getSequences });
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["history", "lead", id],
    queryFn: () => api.getHistory("lead", leadId),
    enabled: historyVisible,
  });
  const { data: leadFiles = [] } = useQuery({
    queryKey: ["leadFiles", id],
    queryFn: () => api.getLeadFiles(leadId),
  });

  const invalidateLead = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["lead", id] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  }, [qc, id]);

  const updateMut = useMutation({
    mutationFn: (data: any) => api.updateLead(leadId, data),
    onSuccess: invalidateLead,
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const statusMut = useMutation({
    mutationFn: (status: string) => api.updateLeadStatus(leadId, status),
    onSuccess: () => { invalidateLead(); qc.invalidateQueries({ queryKey: ["dashboard"] }); qc.invalidateQueries({ queryKey: ["activities", "lead", id] }); },
    onError: (err: Error) => Alert.alert("Status update failed", err.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteLead(leadId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["leads"] }); router.back(); },
    onError: (err: Error) => Alert.alert("Delete failed", err.message),
  });
  const enrollMut = useMutation({
    mutationFn: (seqId: number) => api.enrollInSequence(seqId, { leadId }),
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onError: (err: Error) => Alert.alert("Enrollment failed", err.message),
  });
  const logLinkedInMut = useMutation({
    mutationFn: (data: any) => api.createActivity(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities", "lead", id] }); setShowLinkedInModal(false); },
    onError: (err: Error) => Alert.alert("Failed to log", err.message),
  });
  const uploadFileMut = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) throw new Error("CANCELLED");
      const asset = result.assets[0];
      return api.uploadLeadFile(leadId, asset.uri, asset.name, asset.mimeType || "application/octet-stream");
    },
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); qc.invalidateQueries({ queryKey: ["leadFiles", id] }); },
    onError: (err: any) => { if (err.message !== "CANCELLED") Alert.alert("Upload failed", err.message); },
  });
  const rollbackMut = useMutation({
    mutationFn: (revisionId: number) => api.rollback("lead", leadId, revisionId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateLead();
      refetchHistory();
      setSelectedRevision(null);
    },
    onError: (err: Error) => Alert.alert("Rollback failed", err.message),
  });
  const updateActivityMut = useMutation({
    mutationFn: ({ actId, data }: { actId: number; data: any }) => api.updateActivity(actId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities", "lead", id] });
      setSelectedActivity(null);
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const updateEventMut = useMutation({
    mutationFn: ({ evId, data }: { evId: number; data: any }) => api.updateCalendarEvent(evId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendarEvents", "lead", id] });
      setSelectedEvent(null);
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const saveNotes = useCallback(() => {
    if (!lead) return;
    const oldNotes = lead.notes || "";
    updateMut.mutate({ notes: editNotes });
    if (editNotes && editNotes !== oldNotes) {
      api.createActivity({ leadId, type: "note", note: editNotes })
        .then(() => qc.invalidateQueries({ queryKey: ["activities", "lead", id] }));
    }
    setEditing(false);
  }, [lead, editNotes, leadId, id, qc, updateMut]);

  const saveFields = useCallback(() => {
    if (!lead) return;
    const updates: Record<string, any> = {};
    if (editFields.name !== lead.name) updates.name = editFields.name;
    if (editFields.email !== lead.email) updates.email = editFields.email;
    if ((editFields.source || "") !== (lead.source || "")) updates.source = editFields.source;
    if ((editFields.linkedinUrl || "") !== (lead.linkedinUrl || "")) updates.linkedinUrl = editFields.linkedinUrl;
    if (Object.keys(updates).length > 0) updateMut.mutate(updates);
    setEditingFields(false);
  }, [lead, editFields, updateMut]);

  const startEditFields = useCallback(() => {
    if (!lead) return;
    setEditFields({
      name: lead.name || "",
      email: lead.email || "",
      source: lead.source || "",
      linkedinUrl: lead.linkedinUrl || "",
    });
    setEditingFields(true);
  }, [lead]);

  const handleProfilePicUpload = useCallback(async () => {
    setShowPicModal(false);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (result.canceled) return;
    const asset = result.assets[0];
    try {
      const uploaded = await api.uploadFile(asset.uri, "profile.jpg", asset.mimeType || "image/jpeg");
      updateMut.mutate({ profilePictureUrl: uploaded.storageKey });
    } catch (err: any) {
      Alert.alert("Upload failed", err.message);
    }
  }, [updateMut]);

  const handleProfilePicUrl = useCallback((url: string) => {
    setShowPicModal(false);
    updateMut.mutate({ profilePictureUrl: url });
  }, [updateMut]);

  const handleLinkedInSubmit = useCallback((subject: string, message: string) => {
    logLinkedInMut.mutate({
      leadId,
      type: "linkedin",
      direction: "sent",
      subject: subject || undefined,
      note: message || "LinkedIn message sent",
    });
  }, [leadId, logLinkedInMut]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete this lead?", "This can't be undone.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() },
    ]);
  }, [deleteMut]);

  if (isLoading || !lead) {
    return <View style={[styles.center, { paddingTop: topPad }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const hasProfilePic = !!lead.profilePictureUrl;

  return (
    <KeyboardAwareScrollViewCompat style={[styles.container, { paddingTop: topPad }]} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable style={styles.historyBtn} onPress={() => setHistoryVisible(true)}>
          <Feather name="clock" size={20} color={colors.info} />
        </Pressable>
        <Pressable style={styles.deleteBtn} onPress={handleDelete}>
          <Feather name="trash-2" size={20} color={colors.error} />
        </Pressable>
      </View>

      <AiAlertBanner leadId={leadId} />

      <View style={styles.profileSection}>
        <Pressable onPress={() => setShowPicModal(true)}>
          {hasProfilePic ? (
            <Image source={{ uri: lead.profilePictureUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: STATUS_COLORS[lead.status] }]}>
              <Text style={styles.avatarText}>{lead.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.name}>{lead.name}</Text>
        <Text style={styles.email}>{lead.email}</Text>
        <View style={styles.badgeRow}>
          <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[lead.status] || colors.textSecondary) + "20" }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[lead.status] }]}>{STATUS_LABELS[lead.status]}</Text>
          </View>
          {lead.isBeta && <View style={styles.betaBadge}><Text style={styles.betaText}>BETA</Text></View>}
          <Text style={styles.sourceLabel}>{lead.source}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Details</Text>
          <Pressable onPress={() => editingFields ? saveFields() : startEditFields()}>
            <Text style={styles.editBtn}>{editingFields ? "Save" : "Edit"}</Text>
          </Pressable>
        </View>
        {editingFields ? (
          <View style={styles.editFieldsContainer}>
            {[
              { label: "Name", key: "name" },
              { label: "Email", key: "email" },
              { label: "Source", key: "source" },
              { label: "LinkedIn", key: "linkedinUrl" },
            ].map((f) => (
              <View key={f.key} style={styles.editFieldRow}>
                <Text style={styles.editFieldLabel}>{f.label}</Text>
                <TextInput
                  style={styles.editFieldInput}
                  value={editFields[f.key] || ""}
                  onChangeText={(v) => setEditFields({ ...editFields, [f.key]: v })}
                  placeholder={f.label}
                  placeholderTextColor={colors.textTertiary}
                />
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.infoSection}>
            <View style={styles.infoRow}><Feather name="mail" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>{lead.email}</Text></View>
            {lead.source && <View style={styles.infoRow}><Feather name="compass" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>Source: {lead.source}</Text></View>}
            {lead.linkedinUrl && (
              <Pressable style={styles.infoRow} onPress={() => Linking.openURL(lead.linkedinUrl!)}>
                <Feather name="linkedin" size={16} color="#0A66C2" />
                <Text style={[styles.infoText, { color: "#0A66C2" }]} numberOfLines={1}>{lead.linkedinUrl}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusRow}>
          {LEAD_STATUSES.map((s) => (
            <Pressable
              key={s}
              style={[styles.statusChip, lead.status === s && { backgroundColor: STATUS_COLORS[s], borderColor: STATUS_COLORS[s] }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); statusMut.mutate(s); }}
            >
              <Text style={[styles.statusChipText, lead.status === s && { color: colors.onPrimary }]}>{STATUS_LABELS[s]}</Text>
            </Pressable>
          ))}
        </RNScrollView>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Beta Tag</Text>
          <Switch
            value={lead.isBeta}
            onValueChange={(v) => updateMut.mutate({ isBeta: v })}
            trackColor={{ true: colors.accent }}
          />
        </View>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={styles.actionBtn} onPress={() => {
          if (!lead.email) return;
          api.createActivity({ leadId, type: "email", direction: "sent", subject: `Email to ${lead.email}` })
            .then(() => qc.invalidateQueries({ queryKey: ["activities", "lead", id] }))
            .catch(() => {});
          Linking.openURL(`mailto:${lead.email}`);
        }}>
          <Feather name="mail" size={18} color={colors.primary} />
          <Text style={styles.actionText}>Email</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: "/compose-email", params: { to: lead.email, name: lead.name, leadId: String(lead.id) } })}>
          <Feather name="send" size={18} color={colors.info} />
          <Text style={styles.actionText}>Compose</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => setShowLinkedInModal(true)}>
          <Feather name="linkedin" size={18} color="#0A66C2" />
          <Text style={styles.actionText}>Log LI</Text>
        </Pressable>
      </View>

      {sequences.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add to Sequence</Text>
          {sequences.map((seq: any) => (
            <Pressable key={seq.id} style={styles.seqCard} onPress={() => enrollMut.mutate(seq.id)}>
              <Feather name="repeat" size={16} color={colors.info} />
              <Text style={styles.seqName}>{seq.name}</Text>
              <Feather name="plus" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Files</Text>
          <Pressable onPress={() => uploadFileMut.mutate()}>
            <Text style={styles.editBtn}>{uploadFileMut.isPending ? "Uploading..." : "Add File"}</Text>
          </Pressable>
        </View>
        {leadFiles.length === 0 ? (
          <Text style={styles.emptyActivity}>No files attached.</Text>
        ) : (
          leadFiles.map((f: any) => (
            <View key={f.id} style={styles.fileItem}>
              <Feather name="file" size={16} color={colors.info} />
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              <Pressable onPress={() => api.removeLeadFile(leadId, f.id).then(() => qc.invalidateQueries({ queryKey: ["leadFiles", id] }))}>
                <Feather name="x" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Pressable onPress={() => { if (editing) saveNotes(); else { setEditNotes(lead.notes || ""); setEditing(true); } }}>
            <Text style={styles.editBtn}>{editing ? "Save" : "Edit"}</Text>
          </Pressable>
        </View>
        {editing ? (
          <TextInput style={styles.notesInput} value={editNotes} onChangeText={setEditNotes} multiline placeholder="Add notes..." placeholderTextColor={colors.textTertiary} />
        ) : (
          <Text style={styles.notesText}>{lead.notes || "No notes yet. Add context that matters."}</Text>
        )}
      </View>

      {calendarEvents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scheduled Events</Text>
          {calendarEvents.map((ev: any) => (
            <Pressable key={ev.id} style={styles.activityItem} onPress={() => setSelectedEvent(ev)}>
              <View style={[styles.activityDot, { backgroundColor: colors.accent }]} />
              <View style={styles.activityContent}>
                <Text style={styles.activityType}>{ev.title}</Text>
                <Text style={styles.activityNote}>{ev.eventType} · {new Date(ev.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Text>
              </View>
              <Text style={{ fontSize: 18, color: colors.textTertiary }}>›</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <ActivityList activities={activities} onPress={setSelectedActivity} />
      </View>

      <View style={{ height: 40 }} />

      <ActivityDetailModal
        visible={!!selectedActivity}
        activity={selectedActivity}
        onClose={() => setSelectedActivity(null)}
        onSave={(actId, data) => updateActivityMut.mutate({ actId, data })}
        isSaving={updateActivityMut.isPending}
      />

      <EventDetailModal
        visible={!!selectedEvent}
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onSave={(evId, data) => updateEventMut.mutate({ evId, data })}
        isSaving={updateEventMut.isPending}
      />

      <HistoryModal
        visible={historyVisible}
        onClose={() => setHistoryVisible(false)}
        history={history}
        selectedRevision={selectedRevision}
        onSelectRevision={setSelectedRevision}
        onRollback={(revisionId) => rollbackMut.mutate(revisionId)}
        isRollingBack={rollbackMut.isPending}
        entityLabel="lead"
      />

      <LinkedInLogModal
        visible={showLinkedInModal}
        onClose={() => setShowLinkedInModal(false)}
        onSubmit={handleLinkedInSubmit}
        isPending={logLinkedInMut.isPending}
      />

      <ProfilePicModal
        visible={showPicModal}
        onClose={() => setShowPicModal(false)}
        onUpload={handleProfilePicUpload}
        onUrlSet={handleProfilePicUrl}
      />
    </KeyboardAwareScrollViewCompat>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  topBar: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backBtn: { padding: 10, marginLeft: -10 },
  historyBtn: { padding: 10 },
  deleteBtn: { padding: 10, marginRight: -10 },
  profileSection: { alignItems: "center", marginBottom: Layout.sectionSpacing },
  avatar: { width: 64, height: 64, borderRadius: 32, justifyContent: "center", alignItems: "center", marginBottom: 14 },
  avatarImage: { width: 64, height: 64, borderRadius: 32, marginBottom: 14 },
  avatarText: { fontSize: 26, fontFamily: "Lato_700Bold", color: "#fff" },
  cameraIcon: { position: "absolute", bottom: 10, right: -4, backgroundColor: colors.info, borderRadius: 10, width: 20, height: 20, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 22, fontFamily: "Lato_700Bold", color: colors.text },
  email: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Layout.badgeRadius },
  statusText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "uppercase" },
  betaBadge: { backgroundColor: colors.accent + "20", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  betaText: { fontSize: 11, fontFamily: "Lato_700Bold", color: colors.accent },
  sourceLabel: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, textTransform: "capitalize" },
  section: { marginBottom: Layout.sectionSpacing },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 10 },
  statusRow: { gap: 8 },
  statusChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  statusChipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  actionRow: { flexDirection: "row", gap: 12, marginBottom: Layout.sectionSpacing },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, paddingVertical: 14 },
  actionText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  seqCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: 8 },
  seqName: { flex: 1, fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  editBtn: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.info },
  notesInput: { backgroundColor: colors.surface, borderRadius: Layout.inputRadius, padding: Layout.cardPadding, fontSize: 15, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, minHeight: 80, textAlignVertical: "top" },
  notesText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, lineHeight: 22 },
  emptyActivity: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary },
  activityItem: { flexDirection: "row", gap: 10, marginBottom: 14 },
  activityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  activityContent: { flex: 1 },
  activityType: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, textTransform: "capitalize" },
  activityNote: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  infoSection: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, flex: 1 },
  editFieldsContainer: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  editFieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  editFieldLabel: { width: 70, fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary },
  editFieldInput: { flex: 1, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingVertical: 6 },
  fileItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 6 },
  fileName: { flex: 1, fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
});
