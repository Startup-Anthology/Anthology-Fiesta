import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 6, style }: SkeletonProps) {
  const { colors, isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const baseColor = isDark ? "#2C2C2C" : "#E5E5E5";

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: baseColor,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }, style]}>
      <View style={styles.cardHeader}>
        <Skeleton width={40} height={40} borderRadius={20} />
        <View style={styles.cardHeaderText}>
          <Skeleton width="60%" height={14} borderRadius={4} />
          <Skeleton width="40%" height={11} borderRadius={4} style={styles.mt6} />
        </View>
      </View>
      <Skeleton width="80%" height={11} borderRadius={4} style={styles.mt10} />
      <Skeleton width="50%" height={11} borderRadius={4} style={styles.mt6} />
    </View>
  );
}

export function SkeletonStatCard({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }, style]}>
      <Skeleton width={36} height={36} borderRadius={10} />
      <Skeleton width="60%" height={22} borderRadius={4} style={styles.mt10} />
      <Skeleton width="80%" height={11} borderRadius={4} style={styles.mt6} />
    </View>
  );
}

export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.listItem, { backgroundColor: colors.surface }, style]}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={styles.listItemText}>
        <Skeleton width="55%" height={14} borderRadius={4} />
        <Skeleton width="35%" height={11} borderRadius={4} style={styles.mt6} />
      </View>
      <Skeleton width={60} height={22} borderRadius={11} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeaderText: {
    flex: 1,
  },
  statCard: {
    borderRadius: 12,
    padding: 16,
    width: "47%" as any,
    flexGrow: 1,
    minWidth: 140,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  listItemText: {
    flex: 1,
  },
  mt6: { marginTop: 6 },
  mt10: { marginTop: 10 },
});
