import { Feather } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showAlert } from "@/lib/alert";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const { user, refreshUser } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top + 16;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileImage, setProfileImage] = useState("");
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName || "");
      setLastName(user.lastName || "");
      setProfileImage(user.profileImageUrl || "");
    }
  }, [user]);
  const updateMut = useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; profileImageUrl?: string }) =>
      api.updateProfile(data),
    onSuccess: async (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result?.token) {
        await SecureStore.setItemAsync("auth_session_token", result.token);
      }
      await refreshUser();
      showAlert("Saved", "Profile updated.");
    },
    onError: (err: Error) => showAlert("Error", err.message),
  });
  const handleSave = () => {
    updateMut.mutate({
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      profileImageUrl: profileImage.trim() || undefined,
    });
  };
  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Profile</Text>
        <View style={{ width: 22 }} />
      </View>
      {user?.email && (
        <View style={styles.emailRow}>
          <Text style={styles.emailLabel}>Email</Text>
          <Text style={styles.emailValue}>{user.email}</Text>
        </View>
      )}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>First Name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          placeholder="First name"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          returnKeyType="next"
          accessibilityLabel="First name"
        />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Last Name</Text>
        <TextInput
          style={styles.input}
          value={lastName}
          onChangeText={setLastName}
          placeholder="Last name"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="words"
          returnKeyType="next"
          accessibilityLabel="Last name"
        />
      </View>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Avatar URL</Text>
        <TextInput
          style={styles.input}
          value={profileImage}
          onChangeText={setProfileImage}
          placeholder="https://..."
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          accessibilityLabel="Avatar URL"
        />
      </View>
      <Pressable
        style={[styles.saveBtn, updateMut.isPending && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={updateMut.isPending}
        accessibilityRole="button"
        accessibilityLabel="Save profile"
      >
        {updateMut.isPending ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={styles.saveBtnText}>Save Profile</Text>
        )}
      </Pressable>
      <View style={{ height: 40 }} />
    </KeyboardAwareScrollViewCompat>
  );
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Layout.sectionSpacing,
  },
  title: { fontSize: 20, fontFamily: "HankenGrotesk_700Bold", color: colors.text },
  emailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.sectionSpacing,
  },
  emailLabel: { fontSize: 14, fontFamily: "HankenGrotesk_500Medium", color: colors.textSecondary },
  emailValue: { fontSize: 14, fontFamily: "HankenGrotesk_400Regular", color: colors.text },
  fieldGroup: { marginBottom: 18 },
  label: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_600SemiBold",
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: Layout.inputRadius,
    paddingHorizontal: Layout.cardPadding,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "HankenGrotesk_400Regular",
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: Layout.inputRadius,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { fontSize: 15, fontFamily: "HankenGrotesk_600SemiBold", color: colors.onPrimary },
});
