import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function AiInsightCards() {
  const { colors } = useTheme();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: insights = [] } = useQuery({
    queryKey: ["aiInsights"],
    queryFn: () => api.getAiInsights(),
    refetchInterval: 60000,
  });

  const dismissMut = useMutation({
    mutationFn: (id: number) => api.dismissAiInsight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["aiInsights"] }),
  });

  if (insights.length === 0) return null;

  const displayInsights = insights.slice(0, 4);

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>AI Insights</Text>
      {displayInsights.map((insight: any) => {
        const isCleo = insight.sourceAgent === "cleo";
        const agentColor = isCleo ? colors.info : colors.accent;
        const severityColor = insight.severity === "high" ? colors.error
          : insight.severity === "medium" ? colors.warning
          : colors.textTertiary;

        const isExpanded = expandedId === insight.id;

        return (
          <Pressable
            key={insight.id}
            style={({ pressed }) => [
              styles.card,
              { backgroundColor: colors.surface },
              pressed && styles.pressed,
            ]}
            onPress={() => setExpandedId(prev => prev === insight.id ? null : insight.id)}
          >
            <View style={styles.cardHeader}>
              <View style={[styles.agentBadge, { backgroundColor: agentColor + "15" }]}>
                <View style={[styles.agentDot, { backgroundColor: agentColor }]} />
                <Text style={[styles.agentLabel, { color: agentColor }]}>
                  {isCleo ? "Cleo" : "Miles"}
                </Text>
              </View>
              <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  dismissMut.mutate(insight.id);
                }}
                style={styles.dismissBtn}
                hitSlop={8}
              >
                <Feather name="x" size={14} color={colors.textTertiary} />
              </Pressable>
            </View>
            <Text
              style={[styles.cardTitle, { color: colors.text }]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {insight.title}
            </Text>
            <Text
              style={[styles.cardDesc, { color: colors.textSecondary }]}
              numberOfLines={isExpanded ? undefined : 2}
            >
              {insight.description}
            </Text>
            {isExpanded && (insight.leadId || insight.contactId) && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  if (insight.leadId) {
                    router.push({ pathname: "/lead/[id]", params: { id: String(insight.leadId) } });
                  } else if (insight.contactId) {
                    router.push({ pathname: "/contact/[id]", params: { id: String(insight.contactId) } });
                  }
                }}
                style={styles.viewLink}
                hitSlop={8}
              >
                <Text style={[styles.viewLinkText, { color: colors.accent }]}>
                  {insight.leadId ? "View Lead" : "View Contact"}
                </Text>
                <Feather name="arrow-right" size={13} color={colors.accent} />
              </Pressable>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: Layout.sectionSpacing },
  sectionTitle: { fontSize: 18, fontFamily: "HankenGrotesk_600SemiBold", marginBottom: 14 },
  card: {
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  agentBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  agentDot: { width: 6, height: 6, borderRadius: 3 },
  agentLabel: { fontSize: 11, fontFamily: "HankenGrotesk_600SemiBold" },
  severityDot: { width: 8, height: 8, borderRadius: 4 },
  dismissBtn: { marginLeft: "auto", padding: 4 },
  cardTitle: { fontSize: 14, fontFamily: "HankenGrotesk_600SemiBold", marginBottom: 4 },
  cardDesc: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", lineHeight: 18 },
  viewLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10, alignSelf: "flex-end" },
  viewLinkText: { fontSize: 13, fontFamily: "HankenGrotesk_600SemiBold" },
  pressed: { opacity: 0.92 },
});
