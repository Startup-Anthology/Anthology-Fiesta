import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function BroadcastDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: broadcasts = [], isLoading } = useQuery({
    queryKey: ["broadcasts"],
    queryFn: api.getBroadcasts,
  });

  const broadcast = broadcasts.find((b: { id: number | string }) => String(b.id) === id);

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Go back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>Broadcast</Text>
        <View style={{ width: 22 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : !broadcast ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>Broadcast not found</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={[styles.iconWrap, { backgroundColor: colors.success + "15" }]}>
              <Feather name="send" size={24} color={colors.success} />
            </View>
            <Text style={[styles.subject, { color: colors.text }]}>{broadcast.subject}</Text>

            <View style={styles.metaRow}>
              <View style={[styles.badge, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={[styles.badgeText, { color: colors.textSecondary }]}>{broadcast.status}</Text>
              </View>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {broadcast.recipientCount} recipients
              </Text>
            </View>

            {broadcast.sentAt && (
              <Text style={[styles.meta, { color: colors.textTertiary, marginTop: 8 }]}>
                Sent {new Date(broadcast.sentAt).toLocaleDateString()}
              </Text>
            )}
          </View>

          {broadcast.body && (
            <View style={[styles.card, { backgroundColor: colors.surface }]}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Message</Text>
              <Text style={[styles.body, { color: colors.text }]}>{broadcast.body}</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: Layout.screenPadding, paddingTop: 14, paddingBottom: 6, gap: 12 },
  title: { flex: 1, fontSize: 20, fontFamily: "LeagueSpartan_700Bold" },
  content: { padding: Layout.screenPadding, gap: 16 },
  card: { borderRadius: Layout.cardRadius, padding: Layout.cardPadding },
  iconWrap: { width: 48, height: 48, borderRadius: 14, justifyContent: "center", alignItems: "center", marginBottom: 12 },
  subject: { fontSize: 20, fontFamily: "LeagueSpartan_700Bold", marginBottom: 8 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", textTransform: "capitalize" },
  meta: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular" },
  sectionLabel: { fontSize: 13, fontFamily: "SpaceGrotesk_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  body: { fontSize: 15, fontFamily: "SpaceGrotesk_400Regular", lineHeight: 22 },
  emptyTitle: { fontSize: 18, fontFamily: "LeagueSpartan_600SemiBold" },
});
