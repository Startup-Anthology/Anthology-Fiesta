import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

interface AiAlertBannerProps {
  leadId?: number;
  contactId?: number;
}

export default function AiAlertBanner({ leadId, contactId }: AiAlertBannerProps) {
  const { colors } = useTheme();
  const qc = useQueryClient();

  const queryParams = leadId ? { leadId } : contactId ? { contactId } : {};
  const queryKey = ["aiInsights", leadId ? "lead" : "contact", leadId || contactId];

  const { data: insights = [] } = useQuery({
    queryKey,
    queryFn: () => api.getAiInsights(queryParams),
    enabled: !!(leadId || contactId),
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => api.dismissAiInsight(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["aiInsights"] });
    },
  });

  if (insights.length === 0) return null;

  return (
    <View style={styles.container}>
      {insights.slice(0, 3).map((insight: any) => {
        const isCleo = insight.sourceAgent === "cleo";
        const bgColor = insight.severity === "high" ? colors.error + "12"
          : insight.severity === "medium" ? colors.warning + "12"
          : colors.info + "12";
        const borderColor = insight.severity === "high" ? colors.error + "30"
          : insight.severity === "medium" ? colors.warning + "30"
          : colors.info + "30";
        const iconColor = insight.severity === "high" ? colors.error
          : insight.severity === "medium" ? colors.warning
          : colors.info;

        return (
          <View
            key={insight.id}
            style={[styles.banner, { backgroundColor: bgColor, borderColor }]}
          >
            <Feather
              name={insight.severity === "high" ? "alert-circle" : "info"}
              size={16}
              color={iconColor}
            />
            <View style={styles.bannerContent}>
              <Text style={[styles.bannerAgent, { color: isCleo ? colors.info : colors.accent }]}>
                {isCleo ? "Cleo" : "Miles"}
              </Text>
              <Text style={[styles.bannerTitle, { color: colors.text }]} numberOfLines={1}>
                {insight.title}
              </Text>
              <Text style={[styles.bannerDesc, { color: colors.textSecondary }]} numberOfLines={2}>
                {insight.description}
              </Text>
            </View>
            <Pressable
              onPress={() => dismissMut.mutate(insight.id)}
              style={styles.dismissBtn}
              hitSlop={8}
            >
              <Feather name="x" size={16} color={colors.textTertiary} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16, gap: 8 },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: Layout.cardRadius,
    padding: 12,
    gap: 10,
    borderWidth: 1,
  },
  bannerContent: { flex: 1 },
  bannerAgent: { fontSize: 11, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 2 },
  bannerTitle: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 2 },
  bannerDesc: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", lineHeight: 16 },
  dismissBtn: { padding: 4 },
});
