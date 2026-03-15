import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";

const SEGMENTS = [
  { type: "lead_status", values: ["new", "contacted", "interested", "engaged", "converted"], label: "Lead Status" },
  { type: "contact_type", values: ["investor", "partner", "advisor", "vendor", "press", "other"], label: "Contact Type" },
];

export default function BroadcastNewScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [selectedLeadStatuses, setSelectedLeadStatuses] = useState<string[]>([]);
  const [selectedContactTypes, setSelectedContactTypes] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);

  const hasSelection = selectedLeadStatuses.length > 0 || selectedContactTypes.length > 0;

  const toggleChip = (type: string, value: string) => {
    if (type === "lead_status") {
      setSelectedLeadStatuses((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    } else {
      setSelectedContactTypes((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    }
  };

  const isChipActive = (type: string, value: string) => {
    return type === "lead_status"
      ? selectedLeadStatuses.includes(value)
      : selectedContactTypes.includes(value);
  };

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });
  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["broadcastPreview", selectedLeadStatuses, selectedContactTypes],
    queryFn: () => api.previewBroadcastRecipients(selectedLeadStatuses, selectedContactTypes),
    enabled: hasSelection && step >= 2,
  });

  const sendMut = useMutation({
    mutationFn: () => {
      const tmpl = templates.find((t: any) => t.id === templateId);
      return api.createBroadcast({
        subject: tmpl?.subject || "Broadcast",
        leadStatuses: selectedLeadStatuses,
        contactTypes: selectedContactTypes,
        templateId,
      });
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      Alert.alert("Sent", "Your broadcast is on its way.", [{ text: "OK", onPress: () => router.back() }]);
    },
    onError: (err: any) => Alert.alert("Couldn't send", err.message || "Something went wrong. Try again."),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const selectedTemplate = templates.find((t: any) => t.id === templateId);

  const segmentSummary = [
    ...selectedLeadStatuses.map((s) => s.replace("_", " ")),
    ...selectedContactTypes.map((s) => s.replace("_", " ")),
  ].join(", ");

  return (
    <KeyboardAwareScrollViewCompat style={[styles.container, { paddingTop: topPad }]} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable onPress={() => (step > 0 ? setStep(step - 1) : router.back())}>
          <Text style={styles.backText}>{step > 0 ? "Back" : "Cancel"}</Text>
        </Pressable>
        <Text style={styles.title}>Broadcast</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.stepIndicator}>
        {[0, 1, 2, 3].map((s) => (
          <View key={s} style={[styles.dot, step >= s && styles.dotActive]} />
        ))}
      </View>

      {step === 0 && (
        <View>
          <Text style={styles.stepTitle}>Who's getting this?</Text>
          {SEGMENTS.map((seg) => (
            <View key={seg.type}>
              <Text style={styles.segLabel}>{seg.label}</Text>
              <View style={styles.chipRow}>
                {seg.values.map((v) => (
                  <Pressable
                    key={v}
                    style={[styles.chip, isChipActive(seg.type, v) && styles.chipActive]}
                    onPress={() => toggleChip(seg.type, v)}
                  >
                    <Text style={[styles.chipText, isChipActive(seg.type, v) && styles.chipTextActive]}>{v.replace("_", " ")}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          <Pressable
            style={[styles.nextBtn, !hasSelection && { opacity: 0.4 }]}
            onPress={() => hasSelection && setStep(1)}
            disabled={!hasSelection}
          >
            <Text style={styles.nextBtnText}>Next</Text>
          </Pressable>
        </View>
      )}

      {step === 1 && (
        <View>
          <Text style={styles.stepTitle}>Pick a template</Text>
          {templates.map((t: any) => (
            <Pressable key={t.id} style={[styles.templateCard, templateId === t.id && styles.templateCardActive]} onPress={() => setTemplateId(t.id)}>
              <Text style={[styles.templateName, templateId === t.id && { color: colors.onPrimary }]}>{t.name}</Text>
              <Text style={[styles.templateSubject, templateId === t.id && { color: "rgba(255,255,255,0.8)" }]}>{t.subject}</Text>
            </Pressable>
          ))}
          {templates.length === 0 && <Text style={styles.noTemplates}>Create a template first. You'll need one to send.</Text>}
          <Pressable
            style={[styles.nextBtn, !templateId && { opacity: 0.4 }]}
            onPress={() => templateId && setStep(2)}
            disabled={!templateId}
          >
            <Text style={styles.nextBtnText}>Next</Text>
          </Pressable>
        </View>
      )}

      {step === 2 && (
        <View>
          <Text style={styles.stepTitle}>Review your list</Text>
          <View style={styles.previewInfo}>
            <Text style={styles.previewLabel}>Segments: {segmentSummary}</Text>
            <Text style={styles.previewLabel}>Template: {selectedTemplate?.name}</Text>
          </View>
          {previewLoading ? (
            <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <>
              <Text style={styles.recipientCount}>{preview?.count || 0} recipients</Text>
              {(preview?.recipients || []).map((r: any, i: number) => (
                <View key={i} style={styles.recipientRow}>
                  <Feather name="user" size={14} color={colors.textSecondary} />
                  <Text style={styles.recipientName}>{r.name}</Text>
                  <Text style={styles.recipientEmail}>{r.email}</Text>
                </View>
              ))}
              <Pressable style={styles.nextBtn} onPress={() => setStep(3)}>
                <Text style={styles.nextBtnText}>Next</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {step === 3 && (
        <View>
          <Text style={styles.stepTitle}>Ready to send</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Segments</Text>
              <Text style={styles.summaryValue}>{segmentSummary}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Template</Text>
              <Text style={styles.summaryValue}>{selectedTemplate?.name}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Recipients</Text>
              <Text style={styles.summaryValue}>{preview?.count || 0}</Text>
            </View>
          </View>
          <Pressable
            style={[styles.sendBtn, sendMut.isPending && { opacity: 0.6 }]}
            onPress={() => sendMut.mutate()}
            disabled={sendMut.isPending}
          >
            {sendMut.isPending ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Feather name="send" size={18} color={colors.onPrimary} />
                <Text style={styles.sendBtnText}>Send Broadcast</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <View style={{ height: 40 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  backText: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular", color: colors.info },
  title: { fontSize: 17, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  stepIndicator: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: Layout.sectionSpacing },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  stepTitle: { fontSize: 20, fontFamily: "Lato_700Bold", color: colors.text, marginBottom: 20 },
  segLabel: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", color: colors.textSecondary, marginBottom: 8, marginTop: 14, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text, textTransform: "capitalize" },
  chipTextActive: { color: colors.onPrimary },
  nextBtn: { backgroundColor: colors.primary, borderRadius: Layout.inputRadius, paddingVertical: 14, alignItems: "center", marginTop: Layout.sectionSpacing },
  nextBtnText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  templateCard: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  templateCardActive: { backgroundColor: colors.primary },
  templateName: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  templateSubject: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  noTemplates: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, textAlign: "center", paddingVertical: 24 },
  previewInfo: { backgroundColor: colors.surfaceSecondary, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: 14, gap: 4 },
  previewLabel: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary, textTransform: "capitalize" },
  recipientCount: { fontSize: 16, fontFamily: "Lato_700Bold", color: colors.text, marginBottom: 14 },
  recipientRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  recipientName: { flex: 1, fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  recipientEmail: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary },
  summaryCard: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.sectionSpacing, gap: 14 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, textTransform: "capitalize", flexShrink: 1, textAlign: "right" },
  sendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.success, borderRadius: Layout.inputRadius, paddingVertical: 16 },
  sendBtnText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
});
