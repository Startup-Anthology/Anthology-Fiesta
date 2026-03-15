import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState, useEffect } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";

const AUDIENCES = ["general", "horizon_lead", "investor", "partner", "advisor"];

export default function SequenceDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const isNew = id === "new";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [audience, setAudience] = useState("general");
  const [newStepDelay, setNewStepDelay] = useState("0");
  const [newStepTemplateId, setNewStepTemplateId] = useState<number | null>(null);

  const { data: sequence } = useQuery({
    queryKey: ["sequence", id],
    queryFn: () => api.getSequence(Number(id)),
    enabled: !isNew,
  });
  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });

  useEffect(() => {
    if (sequence) {
      setName(sequence.name);
      setAudience(sequence.targetAudience);
    }
  }, [sequence]);

  const createMut = useMutation({
    mutationFn: () => api.createSequence({ name, targetAudience: audience }),
    onSuccess: (data: any) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["sequences"] });
      router.replace({ pathname: "/sequence/[id]", params: { id: String(data.id) } });
    },
    onError: (err: Error) => Alert.alert("Create failed", err.message),
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateSequence(Number(id), { name, targetAudience: audience }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequences"] });
      qc.invalidateQueries({ queryKey: ["sequence", id] });
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const addStepMut = useMutation({
    mutationFn: () => api.addSequenceStep(Number(id), {
      stepOrder: (sequence?.steps?.length || 0) + 1,
      delayDays: parseInt(newStepDelay, 10) || 0,
      templateId: newStepTemplateId!,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sequence", id] });
      setNewStepDelay("0");
      setNewStepTemplateId(null);
    },
    onError: (err: Error) => Alert.alert("Failed to add step", err.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteSequence(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sequences"] }); router.back(); },
    onError: (err: Error) => Alert.alert("Delete failed", err.message),
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAwareScrollViewCompat style={[styles.container, { paddingTop: topPad }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>{isNew ? "New Sequence" : "Sequence"}</Text>
        <Pressable onPress={() => { if (isNew) { createMut.mutate(); } else { updateMut.mutate(); } }} disabled={!name}>
          <Text style={[styles.saveText, !name && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => Alert.alert("Delete this sequence?", "This can't be undone.", [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() }])}>
          <Feather name="trash-2" size={16} color={colors.error} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Sequence Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Beta Welcome Flow" placeholderTextColor={colors.textTertiary} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Audience</Text>
        <View style={styles.chipRow}>
          {AUDIENCES.map((a) => (
            <Pressable key={a} style={[styles.chip, audience === a && styles.chipActive]} onPress={() => setAudience(a)}>
              <Text style={[styles.chipText, audience === a && styles.chipTextActive]}>{a.replace("_", " ")}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!isNew && sequence && (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Steps</Text>
            {(sequence.steps || []).map((step: any, idx: number) => {
              const tmpl = templates.find((t: any) => t.id === step.templateId);
              return (
                <View key={step.id} style={styles.stepCard}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumText}>{idx + 1}</Text>
                  </View>
                  <View style={styles.stepInfo}>
                    <Text style={styles.stepName}>{tmpl?.name || `Template #${step.templateId}`}</Text>
                    <Text style={styles.stepDelay}>
                      {step.delayDays === 0 ? "Send immediately" : `Wait ${step.delayDays} day${step.delayDays > 1 ? "s" : ""}`}
                    </Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.addStepSection}>
              <Text style={styles.addStepTitle}>Add Step</Text>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Delay (days)</Text>
                <TextInput style={styles.input} value={newStepDelay} onChangeText={setNewStepDelay} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textTertiary} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Template</Text>
                {templates.map((t: any) => (
                  <Pressable
                    key={t.id}
                    style={[styles.templateOption, newStepTemplateId === t.id && styles.templateOptionActive]}
                    onPress={() => setNewStepTemplateId(t.id)}
                  >
                    <Text style={[styles.templateOptionText, newStepTemplateId === t.id && { color: colors.onPrimary }]}>{t.name}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.addBtn, !newStepTemplateId && { opacity: 0.4 }]}
                onPress={() => newStepTemplateId && addStepMut.mutate()}
                disabled={!newStepTemplateId}
              >
                <Feather name="plus" size={16} color={colors.onPrimary} />
                <Text style={styles.addBtnText}>Add Step</Text>
              </Pressable>
            </View>
          </View>

          {(sequence.enrollments || []).length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Enrolled ({sequence.enrollments.length})</Text>
              {sequence.enrollments.map((e: any) => (
                <View key={e.id} style={styles.enrollCard}>
                  <Feather name="user" size={16} color={colors.textSecondary} />
                  <Text style={styles.enrollText}>
                    {e.leadId ? `Lead #${e.leadId}` : `Contact #${e.contactId}`} · Step {e.currentStep} · {e.status}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <View style={{ height: 40 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Layout.sectionSpacing },
  cancelText: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular", color: colors.info },
  title: { fontSize: 17, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  saveText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.info },
  deleteBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-end", marginBottom: 20 },
  deleteText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.error },
  formGroup: { marginBottom: 22 },
  label: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  input: { backgroundColor: colors.surface, borderRadius: Layout.inputRadius, padding: Layout.cardPadding, fontSize: 16, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text, textTransform: "capitalize" },
  chipTextActive: { color: colors.onPrimary },
  section: { marginBottom: Layout.sectionSpacing },
  sectionTitle: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 14 },
  stepCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.cardGap },
  stepNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.info + "15", justifyContent: "center", alignItems: "center" },
  stepNumText: { fontSize: 13, fontFamily: "Lato_700Bold", color: colors.info },
  stepInfo: { flex: 1 },
  stepName: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  stepDelay: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  addStepSection: { backgroundColor: colors.surfaceSecondary, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: 10 },
  addStepTitle: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 14 },
  templateOption: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: Layout.cardRadius, backgroundColor: colors.surface, marginBottom: 8 },
  templateOptionActive: { backgroundColor: colors.primary },
  templateOptionText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: Layout.inputRadius, paddingVertical: 12 },
  addBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  enrollCard: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: 8 },
  enrollText: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary },
});
