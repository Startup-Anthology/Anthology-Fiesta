import * as Haptics from "expo-haptics";
import { showAlert } from "@/lib/alert";
import { router } from "expo-router";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
type SettingsRow = {
  label: string;
  icon: string;
  iconColor?: string;
  onPress: () => void;
  destructive?: boolean;
};
type SettingsSection = {
  title: string;
  data: SettingsRow[];
};
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, logout, isAdmin } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top + 16;
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.email || "Account";
  const sections: SettingsSection[] = [
    {
      title: "Account",
      data: [
        {
          label: "Profile",
          icon: "user",
          onPress: () => router.push("/settings/profile"),
        },
        {
          label: "Connected Accounts",
          icon: "link",
          iconColor: colors.accent,
          onPress: () => router.push("/settings/integrations"),
        },
        {
          label: "Appearance",
          icon: "sun",
          onPress: () => router.push("/settings/appearance"),
        },
      ],
    },
    {
      title: "App",
      data: [
        {
          label: "General",
          icon: "settings",
          onPress: () => router.push("/settings/general"),
        },
        {
          label: "Automation Rules",
          icon: "zap",
          iconColor: colors.warning,
          onPress: () => router.push("/settings/triggers"),
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: "Admin",
            data: [
              {
                label: "Admin Panel",
                icon: "shield",
                iconColor: colors.error,
                onPress: () => router.push("/admin"),
              },
            ],
          },
        ]
      : []),
    {
      title: "",
      data: [
        {
          label: "Log Out",
          icon: "log-out",
          destructive: true,
          onPress: () => {
            showAlert("Log out?", "You'll need to sign in again.", [
              { text: "Stay", style: "cancel" },
              {
                text: "Log Out",
                style: "destructive",
                onPress: () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  logout();
                },
              },
            ]);
          },
        },
      ],
    },
  ];
  const renderItem = ({ item }: { item: SettingsRow }) => (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface },
        pressed && { backgroundColor: colors.pressed },
      ]}
      onPress={item.onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <View style={[styles.rowIcon, { backgroundColor: (item.iconColor || colors.text) + "18" }]}>
        <Feather
          name={item.icon as any}
          size={17}
          color={item.destructive ? colors.error : (item.iconColor || colors.text)}
        />
      </View>
      <Text style={[styles.rowLabel, item.destructive && { color: colors.error }]}>{item.label}</Text>
      {!item.destructive && (
        <Feather name="chevron-right" size={16} color={colors.textTertiary} />
      )}
    </Pressable>
  );
  const renderSectionHeader = ({ section }: { section: { title: string } }) =>
    section.title ? (
      <Text style={styles.sectionHeader}>{section.title}</Text>
    ) : (
      <View style={{ height: Layout.spacing.lg }} />
    );
  return (
    <SectionList
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(item) => item.label}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
            <Feather name="arrow-left" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.userInfo}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.firstName?.[0] || user?.email?.[0] || "?").toUpperCase()}
              </Text>
            </View>
            <View>
              <Text style={styles.displayName}>{displayName}</Text>
              {user?.role && (
                <Text style={styles.role}>{user.role}</Text>
              )}
            </View>
          </View>
        </View>
      }
      ItemSeparatorComponent={() => (
        <View style={[styles.separator, { backgroundColor: colors.border }]} />
      )}
      ListFooterComponent={<View style={{ height: 60 }} />}
    />
  );
}
const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: Layout.screenPadding, paddingBottom: 40 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: Layout.sectionSpacing,
  },
  userInfo: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 20, fontFamily: "SpaceGrotesk_700Bold", color: colors.accent },
  displayName: { fontSize: 17, fontFamily: "SpaceGrotesk_600SemiBold", color: colors.text },
  role: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary, textTransform: "capitalize" },
  sectionHeader: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_600SemiBold",
    color: colors.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingTop: Layout.sectionSpacing,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: Layout.cardPadding,
    gap: 12,
    borderRadius: 0,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.text,
  },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 },
});
