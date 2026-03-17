import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";
import Layout from "@/constants/layout";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ message = "Something went wrong.", onRetry }: ErrorStateProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} accessibilityRole="alert" accessibilityLabel={message}>
      <Feather name="alert-circle" size={40} color={colors.error} />
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Feather name="refresh-cw" size={14} color={colors.onPrimary} />
          <Text style={[styles.retryText, { color: colors.onPrimary }]}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 14,
  },
  message: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: Layout.inputRadius,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
});
