import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo } from "react";
import { HamburgerMenu } from "@/components/HamburgerMenu";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AiInsightCards from "@/components/AiInsightCards";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

const saIconWhite = require("@/assets/images/sa-icon-white.png");

function StatCard({ label, value, icon, color, colors }: { label: string; value: string | number; icon: string; color: string; colors: ThemeColors }) {
  return (
    <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.statIcon, { backgroundColor: color + "15" }]}>
        <Feather name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.getDashboard,
  });

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (isLoading) {
    return (
      <View style={[styles.center, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const d = data || {};
  const betaPercent = d.betaSlotsTotal ? Math.round((d.betaSlotsFilled / d.betaSlotsTotal) * 100) : 0;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <View style={styles.headerRow}>
        <View style={[styles.headerLogo, { backgroundColor: colors.primary }]}>
          <Image source={saIconWhite} style={styles.headerLogoImage} resizeMode="contain" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.greeting, { color: colors.text }]}>Fiesta</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Your week at a glance.</Text>
        </View>
        <HamburgerMenu />
      </View>

      <View style={[styles.betaCard, { backgroundColor: colors.primary }]}>
        <View style={styles.betaHeader}>
          <Feather name="zap" size={16} color={colors.accent} />
          <Text style={[styles.betaTitle, { color: colors.onPrimary }]}>Beta Slots</Text>
          <Text style={[styles.betaCount, { color: colors.accent }]}>
            {d.betaSlotsFilled || 0}/{d.betaSlotsTotal || 100}
          </Text>
        </View>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${Math.min(betaPercent, 100)}%`, backgroundColor: colors.accent }]} />
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Leads" value={d.totalLeads || 0} icon="target" color={colors.statusNew} colors={colors} />
        <StatCard label="New this week" value={d.leadsThisWeek || 0} icon="trending-up" color={colors.info} colors={colors} />
        <StatCard label="Contacts" value={d.totalContacts || 0} icon="users" color={colors.primary} colors={colors} />
        <StatCard label="Emails sent" value={d.emailsSentThisWeek || 0} icon="send" color={colors.success} colors={colors} />
        <StatCard label="Follow-ups" value={d.followUpsDueToday || 0} icon="clock" color={colors.warning} colors={colors} />
        <StatCard label="Beta filled" value={d.betaSlotsFilled || 0} icon="star" color={colors.accent} colors={colors} />
      </View>

      <AiInsightCards />

      {(d.followUps?.length ?? 0) > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Follow up today</Text>
          {d.followUps.map((contact: any) => (
            <Pressable
              key={contact.id}
              style={({ pressed }) => [styles.followUpCard, { backgroundColor: colors.surface }, pressed && styles.pressed]}
              onPress={() => router.push({ pathname: "/contact/[id]", params: { id: String(contact.id) } })}
              accessibilityRole="button"
              accessibilityLabel={`Follow up with ${contact.name}${contact.company ? `, ${contact.company}` : ""}`}
              accessibilityHint="Double tap to view contact"
            >
              <View style={[styles.followUpAvatar, { backgroundColor: colors.primaryLight }]}>
                <Text style={styles.avatarText}>{contact.name?.charAt(0)?.toUpperCase()}</Text>
              </View>
              <View style={styles.followUpInfo}>
                <Text style={[styles.followUpName, { color: colors.text }]}>{contact.name}</Text>
                <Text style={[styles.followUpCompany, { color: colors.textSecondary }]}>{contact.company || contact.relationshipType}</Text>
              </View>
              <View style={[styles.priorityDot, { backgroundColor: contact.priority === "high" ? colors.priorityHigh : contact.priority === "medium" ? colors.priorityMedium : colors.priorityLow }]} />
            </Pressable>
          ))}
        </View>
      )}

      {(d.followUps?.length ?? 0) === 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Follow up today</Text>
          <Text style={[styles.allClear, { color: colors.textSecondary }]}>All caught up. Keep the momentum going.</Text>
        </View>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Layout.screenPadding },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: Layout.sectionSpacing },
  headerLogo: { width: 44, height: 44, borderRadius: Layout.cardRadius, justifyContent: "center", alignItems: "center" },
  headerLogoImage: { width: 28, height: 28 },
  greeting: { fontSize: 24, fontFamily: "Lato_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Montserrat_500Medium", marginTop: 2 },
  betaCard: { borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginBottom: Layout.sectionSpacing },
  betaHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  betaTitle: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff", flex: 1 },
  betaCount: { fontSize: 16, fontFamily: "Lato_700Bold" },
  progressBg: { height: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: Layout.sectionSpacing },
  statCard: {
    width: "47%" as any,
    flexGrow: 1,
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    minWidth: 140,
  },
  statIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginBottom: 10 },
  statValue: { fontSize: 24, fontFamily: "Lato_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Montserrat_400Regular", marginTop: 2 },
  section: { marginBottom: Layout.sectionSpacing },
  sectionTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold", marginBottom: 14 },
  followUpCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
  },
  pressed: { opacity: 0.7 },
  followUpAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: "#fff" },
  followUpInfo: { flex: 1 },
  followUpName: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold" },
  followUpCompany: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular" },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  allClear: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", paddingVertical: 12 },
});
