import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation } from "@tanstack/react-query";
import { showAlert } from "@/lib/alert";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
const STATUSES = ["new", "contacted", "interested", "engaged", "converted"];
const ACTION_TYPES = ["enroll_sequence", "schedule_followup"];
export default function TriggersScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const topPad = Platform.OS === "web" ? 67 : insets.top + 16;
  const [triggerStatus, setTriggerStatus] = useState("");
  const [triggerAction, setTriggerAction] = useState("");
  const [triggerSeqId, setTriggerSeqId] = useState<number | null>(null);
  const [triggerDays, setTriggerDays] = useState("3");
  const { data: triggers = [], refetch } = useQuery({ queryKey: ["triggers"], queryFn: api.getTriggerRules });
  const { data: sequences = [] } = useQuery({ queryKey: ["sequences"], queryFn: api.getSequences });
  const createMut = useMutation({
    mutationFn: () => api.createTriggerRule({
      triggerStatus,
      actionType: triggerAction,
      sequenceId: triggerAction === "enroll_sequence" ? triggerSeqId : undefined,
      followUpDays: triggerAction === "schedule_followup" ? parseInt(triggerDays, 10) : undefined,
    }),
    onSuccess: () => {
      refetch();
      setTriggerStatus("");
      setTriggerAction("");
      setTriggerSeqId(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteTriggerRule(id),
    onSuccess: () => refetch(),
  });
  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/settings")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Automation Rules</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.subtitle}>Set it and forget it. Rules fire when a lead changes status.</Text>
      {triggers.length > 0 && (
        <View style={styles.section}>
          {triggers.map((t: any) => (
            <View key={t.id} style={styles.triggerCard}>
              <View style={styles.triggerInfo}>
                <Text style={styles.triggerText}>
                  When lead → <Text style={{ fontFamily: "HankenGrotesk_600SemiBold" }}>{t.triggerStatus}</Text>
                </Text>
                <Text style={styles.triggerAction}>
                  {t.actionType === "enroll_sequence"
                    ? `Start sequence #${t.sequenceId}`
                    : `Follow up in ${t.followUpDays} days`}
                </Text>
              </View>
              <Pressable
                onPress={() => showAlert("Delete rule?", "This cannot be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(t.id) },
                ])}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete rule"
              >
                <Feather name="trash-2" size={16} color={colors.error} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.addCard}>
        <Text style={styles.addCardTitle}>New Rule</Text>
        <Text style={styles.label}>When status becomes</Text>
        <View style={styles.chipRow}>
          {STATUSES.map((s) => (
            <Pressable
              key={s}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, triggerStatus === s && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setTriggerStatus(s)}
              accessibilityRole="radio"
              accessibilityState={{ checked: triggerStatus === s }}
            >
              <Text style={[styles.chipText, { color: colors.text }, triggerStatus === s && { color: colors.onPrimary }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 16 }]}>Action</Text>
        <View style={styles.chipRow}>
          {ACTION_TYPES.map((a) => (
            <Pressable
              key={a}
              style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }, triggerAction === a && { backgroundColor: colors.primary, borderColor: colors.primary }]}
              onPress={() => setTriggerAction(a)}
              accessibilityRole="radio"
              accessibilityState={{ checked: triggerAction === a }}
            >
              <Text style={[styles.chipText, { color: colors.text }, triggerAction === a && { color: colors.onPrimary }]}>{a.replace("_", " ")}</Text>
            </Pressable>
          ))}
        </View>
        {triggerAction === "enroll_sequence" && sequences.length > 0 && (
          <>
            <Text style={[styles.label, { marginTop: 16 }]}>Sequence</Text>
            {(sequences as any[]).map((s: any) => (
              <Pressable
                key={s.id}
                style={[styles.seqOption, { backgroundColor: colors.surface }, triggerSeqId === s.id && { backgroundColor: colors.primary }]}
                onPress={() => setTriggerSeqId(s.id)}
              >
                <Text style={[styles.seqOptionText, { color: colors.text }, triggerSeqId === s.id && { color: colors.onPrimary }]}>{s.name}</Text>
              </Pressable>
            ))}
          </>
        )}
        {triggerAction === "schedule_followup" && (
          <>
            <Text style={[styles.label, { marginTop: 16 }]}>Days until follow-up</Text>
            <TextInput
              style={styles.numInput}
              value={triggerDays}
              onChangeText={setTriggerDays}
              keyboardType="numeric"
              accessibilityLabel="Days until follow-up"
            />
          </>
        )}
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.primary }, (!triggerStatus || !triggerAction) && { opacity: 0.4 }]}
          onPress={() => triggerStatus && triggerAction && createMut.mutate()}
          disabled={!triggerStatus || !triggerAction || createMut.isPending}
          accessibilityRole="button"
          accessibilityLabel="Add rule"
        >
          <Text style={[styles.addBtnText, { color: colors.onPrimary }]}>Add Rule</Text>
        </Pressable>
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontFamily: "HankenGrotesk_700Bold", color: colors.text },
  subtitle: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", color: colors.textTertiary, marginBottom: Layout.sectionSpacing },
  section: { marginBottom: Layout.sectionSpacing },
  triggerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
  },
  triggerInfo: { flex: 1 },
  triggerText: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular", color: colors.text },
  triggerAction: { fontSize: 12, fontFamily: "HankenGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  addCard: { backgroundColor: colors.surface2, borderRadius: Layout.cardRadius, padding: Layout.cardPadding },
  addCardTitle: { fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold", color: colors.text, marginBottom: 16 },
  label: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold", color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "HankenGrotesk_500Medium", textTransform: "capitalize" },
  seqOption: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: Layout.cardRadius, marginBottom: 8 },
  seqOptionText: { fontSize: 14, fontFamily: "HankenGrotesk_500Medium" },
  numInput: {
    backgroundColor: colors.surface,
    borderRadius: Layout.inputRadius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "HankenGrotesk_400Regular",
    color: colors.text,
    width: 100,
  },
  addBtn: { borderRadius: Layout.inputRadius, paddingVertical: 12, alignItems: "center", marginTop: 18 },
  addBtnText: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold" },
});
