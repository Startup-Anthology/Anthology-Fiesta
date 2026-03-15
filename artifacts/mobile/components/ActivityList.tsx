import React, { useMemo } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

interface Activity {
  id: number;
  type: string;
  direction?: string;
  subject?: string;
  body?: string;
  note?: string;
  createdAt: string;
  gmailLink?: string;
}

interface ActivityListProps {
  activities: Activity[];
  emptyMessage?: string;
  onPress?: (activity: Activity) => void;
}

export default function ActivityList({
  activities,
  emptyMessage = "No activity yet. Every touchpoint counts.",
  onPress,
}: ActivityListProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const TYPE_COLORS: Record<string, string> = useMemo(() => ({
    email: colors.info,
    linkedin: "#0A66C2",
    note: colors.accent,
    call: "#34C759",
    meeting: "#AF52DE",
    status_change: "#FF9500",
    ai_insight: colors.info,
  }), [colors]);

  if (activities.length === 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  return (
    <>
      {activities.map((a) => (
        <Pressable
          key={a.id}
          style={styles.item}
          onPress={() => {
            if (onPress) {
              onPress(a);
            } else if (a.gmailLink) {
              Linking.openURL(a.gmailLink);
            }
          }}
        >
          <View
            style={[
              styles.dot,
              { backgroundColor: TYPE_COLORS[a.type] || colors.textTertiary },
            ]}
          />
          <View style={styles.content}>
            <Text style={styles.type}>
              {a.type === "status_change" ? "Status Change"
                : a.type === "ai_insight" ? `AI Insight${a.note ? ` · ${a.note}` : ""}`
                : a.type}
              {a.direction ? ` (${a.direction})` : ""}
            </Text>
            <Text style={styles.note} numberOfLines={2}>
              {a.subject || a.note || ""}
            </Text>
            {a.type === "ai_insight" && a.body ? (
              <Text style={[styles.note, { color: colors.textTertiary }]} numberOfLines={2}>
                {a.body}
              </Text>
            ) : null}
            <Text style={styles.date}>{new Date(a.createdAt).toLocaleDateString()}</Text>
            {a.gmailLink && !onPress && <Text style={styles.gmailLink}>Open in Gmail →</Text>}
          </View>
          <View style={styles.chevron}>
            <Text style={styles.chevronText}>›</Text>
          </View>
        </Pressable>
      ))}
    </>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  empty: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary },
  item: { flexDirection: "row", gap: 10, marginBottom: 14, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 0 },
  content: { flex: 1 },
  type: {
    fontSize: 13,
    fontFamily: "LeagueSpartan_600SemiBold",
    color: colors.text,
    textTransform: "capitalize",
  },
  note: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.textSecondary,
    marginTop: 2,
  },
  date: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_400Regular",
    color: colors.textTertiary,
    marginTop: 2,
  },
  gmailLink: {
    fontSize: 12,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.info,
    marginTop: 2,
  },
  chevron: {
    paddingLeft: 4,
  },
  chevronText: {
    fontSize: 18,
    color: colors.textTertiary,
  },
});
