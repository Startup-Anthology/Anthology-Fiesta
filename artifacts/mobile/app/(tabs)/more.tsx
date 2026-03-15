import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/layout";
import { useTheme } from "@/lib/theme";

const saIconWhite = require("@/assets/images/sa-icon-white.png");

const MENU_ITEMS = [
  { label: "Files", icon: "folder", route: "/files" },
  { label: "Workflows", icon: "git-branch", route: "/comms" },
  { label: "AI Assistant", icon: "cpu", route: "/(tabs)/ai" },
  { label: "Settings", icon: "settings", route: "/settings" },
] as const;

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <View style={styles.headerRow}>
        <View style={[styles.headerLogo, { backgroundColor: colors.primary }]}>
          <Image source={saIconWhite} style={styles.headerLogoImage} resizeMode="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>More</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Files, workflows & settings.</Text>
        </View>
        <Pressable onPress={() => router.push("/settings")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings">
          <Feather name="settings" size={22} color={colors.text} />
        </Pressable>
      </View>

      <View style={[styles.menuCard, { backgroundColor: colors.surface }]}>
        {MENU_ITEMS.map((item, idx) => (
          <Pressable
            key={item.label}
            style={[styles.menuItem, idx < MENU_ITEMS.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.border }]]}
            onPress={() => router.push(item.route as any)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={[styles.menuIconWrap, { backgroundColor: colors.accent + "15" }]}>
              <Feather name={item.icon as any} size={20} color={colors.accent} />
            </View>
            <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
            <Feather name="chevron-right" size={18} color={colors.textTertiary} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Layout.screenPadding },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  headerLogo: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  headerLogoImage: { width: 20, height: 20 },
  title: { fontSize: 22, fontFamily: "LeagueSpartan_700Bold" },
  subtitle: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
  menuCard: { borderRadius: Layout.cardRadius, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, gap: 14 },
  menuItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  menuLabel: { flex: 1, fontSize: 16, fontFamily: "SpaceGrotesk_500Medium" },
});
