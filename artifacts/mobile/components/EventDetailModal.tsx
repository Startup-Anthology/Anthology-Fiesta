import { Feather } from "@expo/vector-icons";
import React, { useMemo, useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FriendlyDateTimePicker from "@/components/FriendlyDateTimePicker";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

interface CalendarEvent {
  id: number;
  title: string;
  description?: string;
  eventType: string;
  startTime: string;
  endTime: string;
  leadName?: string;
  contactName?: string;
  createdAt: string;
}

interface EventDetailModalProps {
  visible: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onSave: (id: number, data: { title: string; description?: string; eventType: string; startTime: string; endTime: string }) => void;
  isSaving: boolean;
}

const EVENT_TYPES = ["meeting", "call", "follow-up", "demo", "other"];

export default function EventDetailModal({
  visible,
  event,
  onClose,
  onSave,
  isSaving,
}: EventDetailModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const EVENT_COLORS: Record<string, string> = useMemo(() => ({
    meeting: "#AF52DE",
    call: "#34C759",
    "follow-up": colors.accent,
    demo: colors.info,
    other: colors.textTertiary,
  }), [colors]);
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventType, setEventType] = useState("other");
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());

  useEffect(() => {
    if (event) {
      setTitle(event.title || "");
      setDescription(event.description || "");
      setEventType(event.eventType || "other");
      setStartDate(new Date(event.startTime));
      setEndDate(new Date(event.endTime));
      setEditing(false);
    }
  }, [event]);

  const handleSave = () => {
    if (!event) return;
    onSave(event.id, {
      title,
      description: description || undefined,
      eventType,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
    });
  };

  const handleClose = () => {
    setEditing(false);
    onClose();
  };

  const resetForm = () => {
    if (!event) return;
    setTitle(event.title || "");
    setDescription(event.description || "");
    setEventType(event.eventType || "other");
    setStartDate(new Date(event.startTime));
    setEndDate(new Date(event.endTime));
    setEditing(false);
  };

  if (!event) return null;

  const typeColor = EVENT_COLORS[event.eventType] || colors.textTertiary;
  const canSave = title.trim() && !isSaving;

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const duration = () => {
    const ms = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
    const mins = Math.round(ms / 60000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Event Detail</Text>
          <View style={styles.headerActions}>
            {!editing && (
              <Pressable onPress={() => setEditing(true)} hitSlop={10}>
                <Feather name="edit-2" size={20} color={colors.text} />
              </Pressable>
            )}
            <Pressable onPress={handleClose} hitSlop={10}>
              <Feather name="x" size={24} color={colors.text} />
            </Pressable>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {editing ? (
            <View style={styles.form}>
              <Text style={styles.label}>Title</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder="Event title"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={styles.label}>Type</Text>
              <View style={styles.typeRow}>
                {EVENT_TYPES.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.typeChip, eventType === t && styles.typeChipActive]}
                    onPress={() => setEventType(t)}
                  >
                    <Text style={[styles.typeChipText, eventType === t && styles.typeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <FriendlyDateTimePicker label="Start Time" value={startDate} onChange={setStartDate} />
              <FriendlyDateTimePicker label="End Time" value={endDate} onChange={setEndDate} />

              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Event description or agenda"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.formActions}>
                <Pressable style={styles.cancelBtn} onPress={resetForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, !canSave && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={!canSave}
                >
                  <Feather name="check" size={16} color={colors.onPrimary} />
                  <Text style={styles.saveBtnText}>{isSaving ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.details}>
              <View style={styles.titleRow}>
                <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
                  <Text style={[styles.typeBadgeText, { color: typeColor }]}>{event.eventType}</Text>
                </View>
              </View>

              <Text style={styles.eventTitle}>{event.title}</Text>

              <View style={styles.timeCard}>
                <View style={styles.timeRow}>
                  <Feather name="clock" size={16} color={colors.accent} />
                  <View>
                    <Text style={styles.timeLabel}>Start</Text>
                    <Text style={styles.timeValue}>{formatDateTime(event.startTime)}</Text>
                  </View>
                </View>
                <View style={styles.timeDivider} />
                <View style={styles.timeRow}>
                  <Feather name="clock" size={16} color={colors.textTertiary} />
                  <View>
                    <Text style={styles.timeLabel}>End</Text>
                    <Text style={styles.timeValue}>{formatDateTime(event.endTime)}</Text>
                  </View>
                </View>
                <View style={styles.durationBadge}>
                  <Text style={styles.durationText}>{duration()}</Text>
                </View>
              </View>

              {(event.leadName || event.contactName) && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Linked To</Text>
                  {event.leadName && (
                    <View style={styles.linkRow}>
                      <Feather name="target" size={14} color={colors.accent} />
                      <Text style={styles.linkText}>{event.leadName}</Text>
                    </View>
                  )}
                  {event.contactName && (
                    <View style={styles.linkRow}>
                      <Feather name="user" size={14} color={colors.info} />
                      <Text style={styles.linkText}>{event.contactName}</Text>
                    </View>
                  )}
                </View>
              )}

              {event.description ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Description</Text>
                  <Text style={styles.detailValue}>{event.description}</Text>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 20 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  headerTitle: { fontSize: 20, fontFamily: "Lato_700Bold", color: colors.text },
  scroll: { flex: 1 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "capitalize" },
  eventTitle: { fontSize: 22, fontFamily: "Lato_700Bold", color: colors.text, marginBottom: 20 },
  timeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  timeLabel: { fontSize: 11, fontFamily: "LeagueSpartan_600SemiBold", color: colors.textTertiary, textTransform: "uppercase" },
  timeValue: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  timeDivider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  durationBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accent + "20",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 10,
  },
  durationText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: colors.accent },
  details: { gap: 0 },
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.text,
    lineHeight: 20,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  linkText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  form: { gap: 12 },
  label: {
    fontSize: 12,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textSecondary,
    textTransform: "uppercase",
    marginTop: 4,
  },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary },
  typeChipText: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, textTransform: "capitalize" },
  typeChipTextActive: { color: colors.onPrimary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.text,
  },
  textArea: { minHeight: 100 },
  formActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  cancelBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.textSecondary },
  saveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  saveBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
});
