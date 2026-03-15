import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState, useCallback } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

interface ProfilePicModalProps {
  visible: boolean;
  onClose: () => void;
  onUpload: () => void;
  onUrlSet: (url: string) => void;
}

export default function ProfilePicModal({
  visible,
  onClose,
  onUpload,
  onUrlSet,
}: ProfilePicModalProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [picUrl, setPicUrl] = useState("");

  const handleClose = useCallback(() => {
    setPicUrl("");
    onClose();
  }, [onClose]);

  const handleUrlSet = useCallback(() => {
    if (picUrl.trim()) {
      onUrlSet(picUrl.trim());
      setPicUrl("");
    }
  }, [picUrl, onUrlSet]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>Set Profile Photo</Text>
          <Pressable style={styles.option} onPress={onUpload}>
            <Feather name="upload" size={18} color={colors.info} />
            <Text style={styles.optionText}>Upload Image</Text>
          </Pressable>
          <View style={styles.urlRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Paste image URL"
              placeholderTextColor={colors.textTertiary}
              value={picUrl}
              onChangeText={setPicUrl}
              autoCapitalize="none"
            />
            <Pressable style={styles.urlBtn} onPress={handleUrlSet}>
              <Text style={styles.urlBtnText}>Set</Text>
            </Pressable>
          </View>
          <Pressable style={styles.cancelBtn} onPress={handleClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  content: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  title: {
    fontSize: 18,
    fontFamily: "LeagueSpartan_700Bold",
    color: colors.text,
    marginBottom: 16,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    backgroundColor: colors.surface,
    borderRadius: 12,
    marginBottom: 12,
  },
  optionText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  urlRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.text,
    marginBottom: 12,
  },
  urlBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.info,
    borderRadius: 10,
  },
  urlBtnText: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold", color: "#fff" },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.textSecondary,
  },
});
