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

export default function TemplateDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { id } = useLocalSearchParams();
  const isNew = id === "new";
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [audience, setAudience] = useState("general");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const { data: template } = useQuery({
    queryKey: ["template", id],
    queryFn: () => api.getTemplate(Number(id)),
    enabled: !isNew,
  });

  useEffect(() => {
    if (template) {
      setName(template.name);
      setAudience(template.audience);
      setSubject(template.subject);
      setBody(template.body);
    }
  }, [template]);

  const createMut = useMutation({
    mutationFn: () => api.createTemplate({ name, audience, subject, body }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["templates"] });
      router.back();
    },
    onError: (err: Error) => Alert.alert("Create failed", err.message),
  });
  const updateMut = useMutation({
    mutationFn: () => api.updateTemplate(Number(id), { name, audience, subject, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["template", id] });
      router.back();
    },
    onError: (err: Error) => Alert.alert("Update failed", err.message),
  });
  const deleteMut = useMutation({
    mutationFn: () => api.deleteTemplate(Number(id)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["templates"] }); router.back(); },
    onError: (err: Error) => Alert.alert("Delete failed", err.message),
  });

  const save = () => {
    if (!name || !subject || !body) return;
    if (isNew) { createMut.mutate(); } else { updateMut.mutate(); }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAwareScrollViewCompat style={[styles.container, { paddingTop: topPad }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>{isNew ? "New Template" : "Edit Template"}</Text>
        <Pressable onPress={save} disabled={!name || !subject || !body}>
          <Text style={[styles.saveText, (!name || !subject || !body) && { opacity: 0.4 }]}>Save</Text>
        </Pressable>
      </View>

      {!isNew && (
        <Pressable style={styles.deleteBtn} onPress={() => Alert.alert("Delete this template?", "This can't be undone.", [{ text: "Keep", style: "cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate() }])}>
          <Feather name="trash-2" size={16} color={colors.error} />
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.label}>Template Name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Welcome Email" placeholderTextColor={colors.textTertiary} />
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

      <View style={styles.formGroup}>
        <Text style={styles.label}>Subject</Text>
        <TextInput style={styles.input} value={subject} onChangeText={setSubject} placeholder="Email subject line" placeholderTextColor={colors.textTertiary} />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>Body</Text>
        <TextInput
          style={[styles.input, styles.bodyInput]}
          value={body}
          onChangeText={setBody}
          placeholder="Write your email. Merge tags work here."
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.mergeTagInfo}>
        <Feather name="info" size={14} color={colors.textTertiary} />
        <Text style={styles.mergeTagText}>Tags you can use: {"{{first_name}}"}, {"{{company_name}}"}, {"{{founder_name}}"}, {"{{my_linkedin}}"}, {"{{company_linkedin}}"}, {"{{calendar_link}}"}, {"{{custom_link_1}}"}, {"{{custom_link_2}}"}, {"{{custom_link_3}}"}</Text>
      </View>

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
  bodyInput: { minHeight: 160, lineHeight: 22 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Layout.chipRadius, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text, textTransform: "capitalize" },
  chipTextActive: { color: colors.onPrimary },
  mergeTagInfo: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.cardRadius, padding: Layout.cardPadding },
  mergeTagText: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, flex: 1 },
});
