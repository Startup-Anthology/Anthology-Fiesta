import { Feather } from "@expo/vector-icons";
import React, { useMemo, useEffect, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

interface Activity {
  id: number;
  type: string;
  direction?: string;
  subject?: string;
  body?: string;
  note?: string;
  createdAt: string;
  gmailLink?: string;
}

interface ActivityDetailModalProps {
  visible: boolean;
  activity: Activity | null;
  onClose: () => void;
  onSave: (id: number, data: { type: string; subject?: string; body?: string; note?: string }) => void;
  isSaving: boolean;
}

const TYPE_OPTIONS = ["email", "linkedin", "note", "call", "meeting", "status_change", "ai_insight", "other"];

const TYPE_LABELS: Record<string, string> = {
  status_change: "Status Change",
  ai_insight: "AI Insight",
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

export default function ActivityDetailModal({
  visible,
  activity,
  onClose,
  onSave,
  isSaving,
}: ActivityDetailModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const TYPE_COLORS: Record<string, string> = useMemo(() => ({
    email: colors.info,
    linkedin: "#0A66C2",
    note: colors.accent,
    call: "#34C759",
    meeting: "#AF52DE",
    status_change: "#FF9500",
    ai_insight: colors.info,
    other: colors.textTertiary,
  }), [colors]);
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (activity) {
      setType(activity.type || "");
      setSubject(activity.subject || "");
      setBody(activity.body || "");
      setNote(activity.note || "");
      setEditing(false);
    }
  }, [activity]);

  const handleSave = () => {
    if (!activity) return;
    onSave(activity.id, {
      type: type || activity.type,
      subject: subject || undefined,
      body: body || undefined,
      note: note || undefined,
    });
  };

  const handleClose = () => {
    setEditing(false);
    onClose();
  };

  if (!activity) return null;

  const typeColor = TYPE_COLORS[activity.type] || colors.textTertiary;
  const formattedDate = new Date(activity.createdAt).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Activity Detail</Text>
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
          <View style={styles.metaRow}>
            <View style={[styles.typeBadge, { backgroundColor: typeColor + "20" }]}>
              <Text style={[styles.typeBadgeText, { color: typeColor }]}>
                {getTypeLabel(activity.type)}
                {activity.direction ? ` · ${activity.direction}` : ""}
              </Text>
            </View>
            <Text style={styles.date}>{formattedDate}</Text>
          </View>

          {editing ? (
            <View style={styles.form}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.typeRow}>
                {TYPE_OPTIONS.map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.typeChip, type === t && styles.typeChipActive]}
                    onPress={() => setType(t)}
                  >
                    <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>{t}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Subject</Text>
              <TextInput
                style={styles.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Subject line or topic"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={styles.label}>Body / Content</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={body}
                onChangeText={setBody}
                placeholder="Full content of the activity"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={note}
                onChangeText={setNote}
                placeholder="Internal notes about this activity"
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
              />

              <View style={styles.formActions}>
                <Pressable style={styles.cancelBtn} onPress={() => {
                  setType(activity.type || "");
                  setSubject(activity.subject || "");
                  setBody(activity.body || "");
                  setNote(activity.note || "");
                  setEditing(false);
                }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.saveBtn, isSaving && { opacity: 0.6 }]} onPress={handleSave} disabled={isSaving}>
                  <Feather name="check" size={16} color={colors.onPrimary} />
                  <Text style={styles.saveBtnText}>{isSaving ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.details}>
              {(activity.subject || subject) ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Subject</Text>
                  <Text style={styles.detailValue}>{activity.subject || subject}</Text>
                </View>
              ) : null}

              {(activity.body || body) ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Content</Text>
                  <Text style={styles.detailValue}>{activity.body || body}</Text>
                </View>
              ) : null}

              {(activity.note || note) ? (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Notes</Text>
                  <Text style={styles.detailValue}>{activity.note || note}</Text>
                </View>
              ) : null}

              {!activity.subject && !activity.body && !activity.note && (
                <Text style={styles.empty}>No details recorded for this activity.</Text>
              )}

              {activity.gmailLink && (
                <Pressable style={styles.gmailBtn} onPress={() => Linking.openURL(activity.gmailLink!)}>
                  <Feather name="mail" size={16} color={colors.info} />
                  <Text style={styles.gmailBtnText}>Open in Gmail</Text>
                </Pressable>
              )}
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
  title: { fontSize: 20, fontFamily: "Lato_700Bold", color: colors.text },
  scroll: { flex: 1 },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", textTransform: "capitalize" },
  date: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary },
  details: { gap: 16 },
  detailSection: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
  },
  detailLabel: {
    fontSize: 11,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textTertiary,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.text,
    lineHeight: 20,
  },
  empty: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, marginTop: 10 },
  gmailBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.info + "15",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  gmailBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.info },
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
