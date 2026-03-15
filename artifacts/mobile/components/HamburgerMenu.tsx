import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useMemo } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { useAuth } from "@/lib/auth";

const BASE_MENU_ITEMS = [
  { label: "Workflows", icon: "git-branch" as const, route: "/comms" },
  { label: "Files", icon: "folder" as const, route: "/files" },
  { label: "Settings", icon: "settings" as const, route: "/settings" },
];

export function HamburgerMenu() {
  const [open, setOpen] = useState(false);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 12 : insets.top + 4;
  const { isAdmin, is2faVerified } = useAuth();

  const menuItems = useMemo(() => {
    const items = [...BASE_MENU_ITEMS];
    if (isAdmin && is2faVerified) {
      items.push({ label: "Admin", icon: "shield" as const, route: "/admin" });
    }
    return items;
  }, [isAdmin, is2faVerified]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        accessibilityHint="Opens navigation menu"
      >
        <Feather name="menu" size={22} color={colors.text} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close menu"
        >
          <View
            style={[styles.menuContainer, { top: topPad, backgroundColor: colors.surface, shadowColor: colors.text }]}
            accessibilityViewIsModal
          >
            {menuItems.map((item, idx) => (
              <Pressable
                key={item.label}
                style={[
                  styles.menuItem,
                  idx < menuItems.length - 1 && [styles.menuItemBorder, { borderBottomColor: colors.border }],
                ]}
                onPress={() => {
                  setOpen(false);
                  setTimeout(() => {
                    router.push(item.route as any);
                  }, 100);
                }}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Feather name={item.icon} size={18} color={colors.accent} />
                <Text style={[styles.menuLabel, { color: colors.text }]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  menuContainer: {
    position: "absolute",
    right: 16,
    minWidth: 200,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuLabel: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
});
