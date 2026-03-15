import { Link, Stack } from "expo-router";
import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <>
      <Stack.Screen options={{ title: "Not Found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>Nothing here.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Back to home</Text>
        </Link>
      </View>
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 20,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.text,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.info,
  },
});
