import { Feather } from "@expo/vector-icons";
import React, { useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import { ACTION_LABELS, ACTION_COLORS } from "@/constants/crm";

interface HistoryEntry {
  id: number;
  action: string;
  userName?: string;
  createdAt: string;
  beforeSnapshot?: Record<string, unknown>;
  afterSnapshot?: Record<string, unknown>;
}

interface HistoryModalProps {
  visible: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  selectedRevision: HistoryEntry | null;
  onSelectRevision: (entry: HistoryEntry | null) => void;
  onRollback: (revisionId: number) => void;
  isRollingBack: boolean;
  entityLabel: string;
}

export default function HistoryModal({
  visible,
  onClose,
  history,
  selectedRevision,
  onSelectRevision,
  onRollback,
  isRollingBack,
  entityLabel,
}: HistoryModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();

  const handleClose = useCallback(() => {
    onSelectRevision(null);
    onClose();
  }, [onClose, onSelectRevision]);

  const handleEntryPress = useCallback(
    (entry: HistoryEntry) => {
      onSelectRevision(selectedRevision?.id === entry.id ? null : entry);
    },
    [selectedRevision, onSelectRevision],
  );

  const handleRollback = useCallback(
    (entryId: number) => {
      Alert.alert(
        "Restore this version?",
        `The ${entityLabel} will be reverted to the state before this change.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Restore", onPress: () => onRollback(entryId) },
        ],
      );
    },
    [entityLabel, onRollback],
  );

  const canRestore = (entry: HistoryEntry) =>
    ((entry.action === "update" || entry.action === "delete" || entry.action === "rollback") &&
      entry.beforeSnapshot) ||
    (entry.action === "create" && entry.afterSnapshot);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Change History</Text>
          <Pressable onPress={handleClose}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
          {history.length === 0 ? (
            <Text style={styles.empty}>No changes recorded yet.</Text>
          ) : (
            history.map((entry) => (
              <Pressable
                key={entry.id}
                style={[
                  styles.entry,
                  selectedRevision?.id === entry.id && styles.entrySelected,
                ]}
                onPress={() => handleEntryPress(entry)}
              >
                <View style={styles.entryHeader}>
                  <View
                    style={[
                      styles.actionBadge,
                      {
                        backgroundColor:
                          (ACTION_COLORS[entry.action] || colors.textTertiary) + "20",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.actionBadgeText,
                        { color: ACTION_COLORS[entry.action] || colors.textTertiary },
                      ]}
                    >
                      {ACTION_LABELS[entry.action] || entry.action}
                    </Text>
                  </View>
                  <Text style={styles.meta}>
                    {entry.userName || "Unknown"} ·{" "}
                    {new Date(entry.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
                {selectedRevision?.id === entry.id && (
                  <View style={styles.snapshotContainer}>
                    {entry.beforeSnapshot && (
                      <View style={styles.snapshotBox}>
                        <Text style={styles.snapshotLabel}>Before</Text>
                        <Text style={styles.snapshotText}>
                          {JSON.stringify(entry.beforeSnapshot, null, 2)}
                        </Text>
                      </View>
                    )}
                    {entry.afterSnapshot && (
                      <View style={styles.snapshotBox}>
                        <Text style={styles.snapshotLabel}>After</Text>
                        <Text style={styles.snapshotText}>
                          {JSON.stringify(entry.afterSnapshot, null, 2)}
                        </Text>
                      </View>
                    )}
                    {canRestore(entry) && (
                      <Pressable
                        style={styles.rollbackBtn}
                        onPress={() => handleRollback(entry.id)}
                      >
                        <Feather name="rotate-ccw" size={16} color="#fff" />
                        <Text style={styles.rollbackBtnText}>
                          {isRollingBack ? "Restoring..." : "Restore this version"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            ))
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
  title: { fontSize: 20, fontFamily: "Lato_700Bold", color: colors.text },
  scroll: { flex: 1 },
  empty: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary },
  entry: { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 },
  entrySelected: { borderWidth: 1, borderColor: colors.info },
  entryHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  actionBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  actionBadgeText: {
    fontSize: 11,
    fontFamily: "LeagueSpartan_600SemiBold",
    textTransform: "uppercase",
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.textTertiary,
  },
  snapshotContainer: { marginTop: 12, gap: 10 },
  snapshotBox: { backgroundColor: colors.background, borderRadius: 8, padding: 10 },
  snapshotLabel: {
    fontSize: 11,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.textTertiary,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  snapshotText: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.textSecondary,
  },
  rollbackBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.warning,
    borderRadius: 10,
    paddingVertical: 10,
    marginTop: 4,
  },
  rollbackBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
});
