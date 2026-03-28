import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useOnline } from "@/lib/useOnline";
import { useTheme } from "@/lib/theme";

// Warning text is always dark — #F59E0B (amber) requires dark text for WCAG contrast in both modes.
const WARNING_TEXT = "#1a1a1a";

export function OfflineBanner() {
  const isOnline = useOnline();
  const { colors } = useTheme();

  if (isOnline) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.warning }]} accessibilityRole="alert" accessibilityLabel="No connection">
      <Feather name="wifi-off" size={13} color={WARNING_TEXT} />
      <Text style={styles.text}>No connection — changes may not save</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: {
    fontSize: 12,
    fontFamily: "HankenGrotesk_500Medium",
    color: WARNING_TEXT,
  },
});
