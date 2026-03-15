import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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

export default function ComposeEmailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { to, name, leadId, contactId } = useLocalSearchParams<{ to?: string; name?: string; leadId?: string; contactId?: string }>();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);

  const { data: templates = [] } = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.getTemplates(),
  });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: libraryFiles = [] } = useQuery({
    queryKey: ["files"],
    queryFn: () => api.getFiles(),
  });
  const { data: recipientFiles = [] } = useQuery({
    queryKey: leadId ? ["leadFiles", leadId] : contactId ? ["contactFiles", contactId] : ["noFiles"],
    queryFn: () => {
      if (leadId) return api.getLeadFiles(Number(leadId));
      if (contactId) return api.getContactFiles(Number(contactId));
      return Promise.resolve([]);
    },
    enabled: !!(leadId || contactId),
  });

  const sendMut = useMutation({
    mutationFn: () => api.sendEmail({
      to: to || "",
      subject,
      body,
      leadId: leadId ? Number(leadId) : undefined,
      contactId: contactId ? Number(contactId) : undefined,
      attachmentFileIds: selectedFileIds.length > 0 ? selectedFileIds : undefined,
    }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      Alert.alert("Sent", "Your email is on its way.", [{ text: "OK", onPress: () => router.back() }]);
    },
    onError: (err: any) => Alert.alert("Couldn't send", err.message || "Something went wrong. Try again."),
  });

  const applyTemplate = (template: any) => {
    let subj = template.subject;
    let bod = template.body;
    const firstName = name?.split(" ")[0] || "";
    const founderName = settings?.founder_name || "";
    subj = subj.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{founder_name\}\}/g, founderName);
    bod = bod.replace(/\{\{first_name\}\}/g, firstName).replace(/\{\{founder_name\}\}/g, founderName);
    setSubject(subj);
    setBody(bod);
    setShowTemplates(false);
  };

  const toggleFile = (fileId: number) => {
    setSelectedFileIds((prev) =>
      prev.includes(fileId) ? prev.filter((id) => id !== fileId) : [...prev, fileId]
    );
  };

  const allFiles = [...libraryFiles];
  for (const rf of recipientFiles) {
    if (!allFiles.find((f: any) => f.id === rf.id)) allFiles.push(rf);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: topPad }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Compose</Text>
        <Pressable
          onPress={() => {
            if (subject && body) sendMut.mutate();
          }}
          disabled={!subject || !body || sendMut.isPending}
          hitSlop={8}
        >
          {sendMut.isPending ? (
            <ActivityIndicator size="small" color={colors.info} />
          ) : (
            <Text style={[styles.sendText, (!subject || !body) && { opacity: 0.4 }]}>Send</Text>
          )}
        </Pressable>
      </View>

      <KeyboardAwareScrollViewCompat style={styles.form} keyboardShouldPersistTaps="handled">
        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>To</Text>
          <View style={styles.toValue}>
            <Text style={styles.toText}>{to || "No recipient"}</Text>
          </View>
        </View>

        <View style={styles.actionBtnRow}>
          <Pressable style={styles.templateBtn} onPress={() => setShowTemplates(!showTemplates)}>
            <Feather name="file-text" size={16} color={colors.info} />
            <Text style={styles.templateBtnText}>Use Template</Text>
          </Pressable>
          <Pressable style={styles.templateBtn} onPress={() => setShowAttachments(!showAttachments)}>
            <Feather name="paperclip" size={16} color={colors.info} />
            <Text style={styles.templateBtnText}>
              Attach{selectedFileIds.length > 0 ? ` (${selectedFileIds.length})` : ""}
            </Text>
          </Pressable>
        </View>

        {showTemplates && (
          <View style={styles.templateList}>
            {templates.map((t: any) => (
              <Pressable key={t.id} style={styles.templateItem} onPress={() => applyTemplate(t)}>
                <Text style={styles.templateName}>{t.name}</Text>
                <Text style={styles.templateAudience}>{t.audience}</Text>
              </Pressable>
            ))}
            {templates.length === 0 && <Text style={styles.noTemplates}>No templates yet.</Text>}
          </View>
        )}

        {showAttachments && (
          <View style={styles.templateList}>
            {allFiles.length === 0 ? (
              <Text style={styles.noTemplates}>No files in library.</Text>
            ) : (
              allFiles.map((f: any) => (
                <Pressable key={f.id} style={styles.templateItem} onPress={() => toggleFile(f.id)}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                    <Feather
                      name={selectedFileIds.includes(f.id) ? "check-square" : "square"}
                      size={18}
                      color={selectedFileIds.includes(f.id) ? colors.info : colors.textTertiary}
                    />
                    <Text style={styles.templateName} numberOfLines={1}>{f.name}</Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        )}

        {selectedFileIds.length > 0 && (
          <View style={styles.attachedList}>
            {allFiles.filter((f: any) => selectedFileIds.includes(f.id)).map((f: any) => (
              <View key={f.id} style={styles.attachedChip}>
                <Feather name="paperclip" size={12} color={colors.info} />
                <Text style={styles.attachedName} numberOfLines={1}>{f.name}</Text>
                <Pressable onPress={() => toggleFile(f.id)} hitSlop={6}>
                  <Feather name="x" size={14} color={colors.textTertiary} />
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.fieldRow}>
          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            style={styles.subjectInput}
            value={subject}
            onChangeText={setSubject}
            placeholder="Email subject"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <TextInput
          style={styles.bodyInput}
          value={body}
          onChangeText={setBody}
          placeholder="Write your message..."
          placeholderTextColor={colors.textTertiary}
          multiline
          textAlignVertical="top"
        />
      </KeyboardAwareScrollViewCompat>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Layout.screenPadding, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  cancelText: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular", color: colors.info },
  title: { fontSize: 17, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  sendText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.info },
  form: { flex: 1, padding: Layout.screenPadding },
  fieldRow: { flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  fieldLabel: { width: 60, fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary },
  fieldValue: { flex: 1, fontSize: 15, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  toValue: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.badgeRadius, paddingHorizontal: 10, paddingVertical: 6 },
  toText: { fontSize: 15, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  subjectInput: { flex: 1, fontSize: 15, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  actionBtnRow: { flexDirection: "row", gap: 12, paddingVertical: Layout.cardPadding, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  templateBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  templateBtnText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.info },
  templateList: { backgroundColor: colors.surface, borderRadius: Layout.inputRadius, marginBottom: 14 },
  templateItem: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: Layout.cardPadding, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  templateName: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  templateAudience: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, textTransform: "capitalize" },
  noTemplates: { padding: Layout.cardPadding, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary },
  attachedList: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingVertical: 8 },
  attachedChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.info + "15", paddingHorizontal: 10, paddingVertical: 6, borderRadius: Layout.badgeRadius },
  attachedName: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium", color: colors.info, maxWidth: 120 },
  bodyInput: { fontSize: 16, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, minHeight: 200, paddingTop: 18, lineHeight: 24 },
});
