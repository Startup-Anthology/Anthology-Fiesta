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
import { REL_TYPES, REL_COLORS, PRIORITIES, PRIORITY_COLORS } from "@/constants/crm";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";

export default function ContactDetailScreen() {
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

  const contactId = useMemo(() => Number(id), [id]);

  const { data: contact, isLoading } = useQuery({
    queryKey: ["contact", id],
    queryFn: () => api.getContact(contactId),
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", "contact", id],
    queryFn: () => api.getActivities({ contactId }),
  });
  const { data: calendarEvents = [] } = useQuery({
    queryKey: ["calendarEvents", "contact", id],
    queryFn: () => api.getCalendarEvents({ contactId }),
  });
  const { data: sequences = [] } = useQuery({ queryKey: ["sequences"], queryFn: api.getSequences });
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ["history", "contact", id],
    queryFn: () => api.getHistory("contact", contactId),
    enabled: historyVisible,
  });
  const { data: contactFiles = [] } = useQuery({
    queryKey: ["contactFiles", id],
    queryFn: () => api.getContactFiles(contactId),
  });

  const invalidateContact = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["contact", id] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
  }, [qc, id]);

  const updateMut = useMutation({
    mutationFn: (data: any) => api.updateContact(contactId, data),
    onSuccess: invalidateContact,
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const markMut = useMutation({
    mutationFn: () => api.markContacted(contactId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateContact();
      qc.invalidateQueries({ queryKey: ["followUps"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => Alert.alert("Failed", err.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteContact(contactId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); router.back(); },
    onError: (err: Error) => Alert.alert("Delete failed", err.message),
  });
  const enrollMut = useMutation({
    mutationFn: (seqId: number) => api.enrollInSequence(seqId, { contactId }),
    onSuccess: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onError: (err: Error) => Alert.alert("Enrollment failed", err.message),
  });
  const logLinkedInMut = useMutation({
    mutationFn: (data: any) => api.createActivity(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities", "contact", id] }); setShowLinkedInModal(false); },
    onError: (err: Error) => Alert.alert("Failed to log", err.message),
  });
  const uploadFileMut = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) throw new Error("CANCELLED");
      const asset = result.assets[0];
      return api.uploadContactFile(contactId, asset.uri, asset.name, asset.mimeType || "application/octet-stream");
    },
    onSuccess: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); qc.invalidateQueries({ queryKey: ["contactFiles", id] }); },
    onError: (err: any) => { if (err.message !== "CANCELLED") Alert.alert("Upload failed", err.message); },
  });
  const rollbackMut = useMutation({
    mutationFn: (revisionId: number) => api.rollback("contact", contactId, revisionId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateContact();
      refetchHistory();
      setSelectedRevision(null);
    },
    onError: (err: Error) => Alert.alert("Rollback failed", err.message),
  });
  const updateActivityMut = useMutation({
    mutationFn: ({ actId, data }: { actId: number; data: any }) => api.updateActivity(actId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities", "contact", id] });
      setSelectedActivity(null);
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const updateEventMut = useMutation({
    mutationFn: ({ evId, data }: { evId: number; data: any }) => api.updateCalendarEvent(evId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendarEvents", "contact", id] });
      setSelectedEvent(null);
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const saveNotes = useCallback(() => {
    if (!contact) return;
    const oldNotes = contact.notes || "";
    updateMut.mutate({ notes: editNotes });
    if (editNotes && editNotes !== oldNotes) {
      api.createActivity({ contactId, type: "note", note: editNotes })
        .then(() => qc.invalidateQueries({ queryKey: ["activities", "contact", id] }));
    }
    setEditing(false);
  }, [contact, editNotes, contactId, id, qc, updateMut]);

  const saveFields = useCallback(() => {
    if (!contact) return;
    const updates: Record<string, any> = {};
    const fields = ["name", "email", "company", "phone", "title", "linkedinUrl", "relationshipType", "priority"];
    for (const f of fields) {
      const current = (contact as any)[f] || "";
      if ((editFields[f] || "") !== current) updates[f] = editFields[f] || null;
    }
    if (Object.keys(updates).length > 0) updateMut.mutate(updates);
    setEditingFields(false);
  }, [contact, editFields, updateMut]);

  const startEditFields = useCallback(() => {
    if (!contact) return;
    setEditFields({
      name: contact.name || "",
      email: contact.email || "",
      company: contact.company || "",
      phone: contact.phone || "",
      title: contact.title || "",
      linkedinUrl: contact.linkedinUrl || "",
      relationshipType: contact.relationshipType || "",
      priority: contact.priority || "",
    });
    setEditingFields(true);
  }, [contact]);

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
      contactId,
      type: "linkedin",
      direction: "sent",
      subject: subject || undefined,
      note: message || "LinkedIn message sent",
    });
  }, [contactId, logLinkedInMut]);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete this contact?", "This can't be undone.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() },
    ]);
  }, [deleteMut]);

  if (isLoading || !contact) {
    return <View style={[styles.center, { paddingTop: topPad }]}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  const relColor = REL_COLORS[contact.relationshipType] || colors.primary;
  const hasProfilePic = !!contact.profilePictureUrl;

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

      <AiAlertBanner contactId={contactId} />

      <View style={styles.profileSection}>
        <Pressable onPress={() => setShowPicModal(true)}>
          {hasProfilePic ? (
            <Image source={{ uri: contact.profilePictureUrl }} style={styles.avatarImage} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: relColor }]}>
              <Text style={styles.avatarText}>{contact.name?.charAt(0)?.toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Feather name="camera" size={12} color="#fff" />
          </View>
        </Pressable>
        <Text style={styles.name}>{contact.name}</Text>
        {contact.title && <Text style={styles.subtitle}>{contact.title}{contact.company ? ` at ${contact.company}` : ""}</Text>}
        <View style={styles.badgeRow}>
          <View style={[styles.relBadge, { backgroundColor: relColor + "15" }]}>
            <Text style={[styles.relText, { color: relColor }]}>{contact.relationshipType}</Text>
          </View>
          <View style={[styles.priorityBadge, { backgroundColor: PRIORITY_COLORS[contact.priority] + "15" }]}>
            <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[contact.priority] }]} />
            <Text style={[styles.priorityText, { color: PRIORITY_COLORS[contact.priority] }]}>{contact.priority}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionRow}>
        {contact.phone && (
          <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${contact.phone}`)}>
            <Feather name="phone" size={18} color={colors.success} />
            <Text style={styles.actionText}>Call</Text>
          </Pressable>
        )}
        {contact.email && (
          <Pressable style={styles.actionBtn} onPress={() => router.push({ pathname: "/compose-email", params: { to: contact.email, name: contact.name, contactId: String(contact.id) } })}>
            <Feather name="send" size={18} color={colors.info} />
            <Text style={styles.actionText}>Email</Text>
          </Pressable>
        )}
        {contact.linkedinUrl && (
          <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(contact.linkedinUrl!)}>
            <Feather name="linkedin" size={18} color="#0A66C2" />
            <Text style={styles.actionText}>LinkedIn</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionBtn} onPress={() => markMut.mutate()}>
          <Feather name="check-circle" size={18} color={colors.success} />
          <Text style={styles.actionText}>Contacted</Text>
        </Pressable>
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
              { label: "Company", key: "company" },
              { label: "Phone", key: "phone" },
              { label: "Title", key: "title" },
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
            <View style={styles.editFieldRow}>
              <Text style={styles.editFieldLabel}>Type</Text>
              <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {REL_TYPES.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.chipSmall, editFields.relationshipType === r && { backgroundColor: REL_COLORS[r], borderColor: REL_COLORS[r] }]}
                    onPress={() => setEditFields({ ...editFields, relationshipType: r })}
                  >
                    <Text style={[styles.chipSmallText, editFields.relationshipType === r && { color: colors.onPrimary }]}>{r}</Text>
                  </Pressable>
                ))}
              </RNScrollView>
            </View>
            <View style={styles.editFieldRow}>
              <Text style={styles.editFieldLabel}>Priority</Text>
              <RNScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {PRIORITIES.map((p) => (
                  <Pressable
                    key={p}
                    style={[styles.chipSmall, editFields.priority === p && { backgroundColor: PRIORITY_COLORS[p], borderColor: PRIORITY_COLORS[p] }]}
                    onPress={() => setEditFields({ ...editFields, priority: p })}
                  >
                    <Text style={[styles.chipSmallText, editFields.priority === p && { color: colors.onPrimary }]}>{p}</Text>
                  </Pressable>
                ))}
              </RNScrollView>
            </View>
          </View>
        ) : (
          <View style={styles.infoSection}>
            {contact.email && <View style={styles.infoRow}><Feather name="mail" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>{contact.email}</Text></View>}
            {contact.phone && <View style={styles.infoRow}><Feather name="phone" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>{contact.phone}</Text></View>}
            {contact.company && <View style={styles.infoRow}><Feather name="briefcase" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>{contact.title ? `${contact.title} at ` : ""}{contact.company}</Text></View>}
            {contact.linkedinUrl && (
              <Pressable style={styles.infoRow} onPress={() => Linking.openURL(contact.linkedinUrl!)}>
                <Feather name="linkedin" size={16} color="#0A66C2" />
                <Text style={[styles.infoText, { color: "#0A66C2" }]} numberOfLines={1}>{contact.linkedinUrl}</Text>
              </Pressable>
            )}
            {contact.lastContactedAt && <View style={styles.infoRow}><Feather name="clock" size={16} color={colors.textTertiary} /><Text style={styles.infoText}>Last contacted: {new Date(contact.lastContactedAt).toLocaleDateString()}</Text></View>}
            {contact.nextFollowUpAt && <View style={styles.infoRow}><Feather name="calendar" size={16} color={colors.warning} /><Text style={[styles.infoText, { color: colors.warning }]}>Follow-up: {new Date(contact.nextFollowUpAt).toLocaleDateString()}</Text></View>}
          </View>
        )}
      </View>

      <View style={styles.quickActions}>
        <Pressable style={styles.quickBtn} onPress={() => setShowLinkedInModal(true)}>
          <Feather name="message-circle" size={16} color="#0A66C2" />
          <Text style={styles.quickText}>Log LinkedIn Message</Text>
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
        {contactFiles.length === 0 ? (
          <Text style={styles.emptyActivity}>No files attached.</Text>
        ) : (
          contactFiles.map((f: any) => (
            <View key={f.id} style={styles.fileItem}>
              <Feather name="file" size={16} color={colors.info} />
              <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
              <Pressable onPress={() => api.removeContactFile(contactId, f.id).then(() => qc.invalidateQueries({ queryKey: ["contactFiles", id] }))}>
                <Feather name="x" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Pressable onPress={() => { if (editing) saveNotes(); else { setEditNotes(contact.notes || ""); setEditing(true); } }}>
            <Text style={styles.editBtn}>{editing ? "Save" : "Edit"}</Text>
          </Pressable>
        </View>
        {editing ? (
          <TextInput style={styles.notesInput} value={editNotes} onChangeText={setEditNotes} multiline placeholder="Add notes..." placeholderTextColor={colors.textTertiary} />
        ) : (
          <Text style={styles.notesText}>{contact.notes || "No notes yet. Add context that matters."}</Text>
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
        entityLabel="contact"
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
  subtitle: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  relBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Layout.badgeRadius },
  relText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "capitalize" },
  priorityBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: Layout.badgeRadius },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "capitalize" },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: Layout.sectionSpacing, flexWrap: "wrap" },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, paddingVertical: 14, minWidth: 80 },
  actionText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  infoSection: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.sectionSpacing, gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, flex: 1 },
  quickActions: { marginBottom: Layout.sectionSpacing },
  quickBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding },
  quickText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  section: { marginBottom: Layout.sectionSpacing },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 10 },
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
  editFieldsContainer: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, gap: 8 },
  editFieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  editFieldLabel: { width: 70, fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary },
  editFieldInput: { flex: 1, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingVertical: 6 },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  chipSmallText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium", color: colors.text, textTransform: "capitalize" },
  fileItem: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderRadius: 10, padding: 10, marginBottom: 6 },
  fileName: { flex: 1, fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
});
