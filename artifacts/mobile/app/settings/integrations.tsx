import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { showAlert } from "@/lib/alert";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
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
import { ErrorState } from "@/components/ErrorState";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8080";
type ProviderConfig = {
  provider: string;
  label: string;
  category: string;
  icon: string;
  iconSet: "feather" | "material" | "text";
  color: string;
};
const PROVIDERS: ProviderConfig[] = [
  { provider: "gmail", label: "Gmail", category: "email", icon: "gmail", iconSet: "material", color: "#EA4335" },
  { provider: "outlook", label: "Outlook", category: "email", icon: "microsoft-outlook", iconSet: "material", color: "#0078D4" },
  { provider: "google_calendar", label: "Google Calendar", category: "calendar", icon: "G", iconSet: "text", color: "#4285F4" },
  { provider: "outlook_calendar", label: "Outlook Calendar", category: "calendar", icon: "microsoft-outlook", iconSet: "material", color: "#0078D4" },
  { provider: "notion", label: "Notion", category: "notes", icon: "N", iconSet: "text", color: "#000000" },
  { provider: "slack", label: "Slack", category: "messaging", icon: "slack", iconSet: "material", color: "#4A154B" },
];
const CATEGORY_LABELS: Record<string, string> = {
  email: "Email",
  calendar: "Calendar",
  notes: "Notes",
  messaging: "Messaging",
};
function IntegrationRow({ config, status, onConnect, onDisconnect, isDisconnecting }: {
  config: ProviderConfig;
  status?: { id: number; status: string; displayName?: string | null };
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { colors } = useTheme();
  const isConnected = status?.status === "active";
  const isError = status?.status === "error";
  const dotColor = isConnected ? colors.success : isError ? colors.error : colors.textTertiary;
  const statusLabel = isConnected ? (status?.displayName || "Connected") : isError ? "Error — reconnect" : "Not connected";
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: config.color + "15" }]}>
        {config.iconSet === "material" ? (
          <MaterialCommunityIcons name={config.icon as any} size={20} color={config.color} />
        ) : config.iconSet === "text" ? (
          <Text style={{ fontSize: 16, fontFamily: "SpaceGrotesk_700Bold", color: config.color }}>{config.icon}</Text>
        ) : (
          <Feather name={config.icon as any} size={18} color={config.color} />
        )}
      </View>
      <View style={styles.rowInfo}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{config.label}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={[styles.statusText, { color: dotColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {isConnected ? (
        <Pressable
          style={[styles.disconnectBtn, { borderColor: colors.border }]}
          onPress={() => {
            showAlert(
              `Disconnect ${config.label}`,
              "Your access token will be removed. You can reconnect at any time.",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Disconnect", style: "destructive", onPress: onDisconnect },
              ]
            );
          }}
          disabled={isDisconnecting}
          accessibilityRole="button"
          accessibilityLabel={`Disconnect ${config.label}`}
        >
          {isDisconnecting ? (
            <ActivityIndicator size="small" color={colors.textTertiary} />
          ) : (
            <Text style={[styles.disconnectText, { color: colors.textTertiary }]}>Disconnect</Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          style={[styles.connectBtn, { backgroundColor: colors.primary }]}
          onPress={onConnect}
          accessibilityRole="button"
          accessibilityLabel={`Connect ${config.label}`}
        >
          <Text style={[styles.connectText, { color: colors.onPrimary }]}>Connect</Text>
        </Pressable>
      )}
    </View>
  );
}
export default function IntegrationsScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top + 16;
  const { data: integrations = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: api.getIntegrations,
  });
  const { data: horizonStatus } = useQuery({
    queryKey: ["horizonStatus"],
    queryFn: () => api.getHorizonStatus(),
  });
  const disconnectMut = useMutation({
    mutationFn: (provider: string) => api.deleteIntegration(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integrations"] }),
    onError: (err: Error) => showAlert("Error", err.message),
  });
  const horizonSyncMut = useMutation({
    mutationFn: () => api.syncFromHorizon(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["horizonStatus"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      showAlert("Sync Complete", "Horizon data has been synced.");
    },
    onError: (err: Error) => showAlert("Sync Failed", err.message),
  });
  const notionExportMut = useMutation({
    mutationFn: () => api.exportToNotion(),
    onSuccess: (data: any) => {
      showAlert("Export Complete", `Leads: ${data.leads?.synced || 0}, Contacts: ${data.contacts?.synced || 0}, Activities: ${data.activities?.synced || 0}`);
    },
    onError: (err: Error) => showAlert("Export Failed", err.message),
  });
  const integrationList: any[] = Array.isArray(integrations)
    ? integrations
    : (integrations as any)?.integrations ?? [];
  const integrationMap = Object.fromEntries(
    integrationList.map((i: any) => [i.provider, i])
  );
  const handleConnect = async (provider: string) => {
    const url = `${API_BASE}/api/integrations/${provider}/connect`;
    if (Platform.OS === "web") {
      window.open(url, "_blank");
    } else {
      await WebBrowser.openBrowserAsync(url);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    }
  };
  const groupedProviders = PROVIDERS.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, ProviderConfig[]>);

  const isNotionConnected = integrationMap.notion?.status === "active";

  if (isError) {
    return <ErrorState message="Failed to load integrations." onRetry={refetch} />;
  }
  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>Connected Accounts</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        Connect your own accounts. Tokens are encrypted and stored only for you.
      </Text>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <>
          {Object.entries(groupedProviders).map(([category, providers]) => (
            <View key={category} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
                {CATEGORY_LABELS[category] || category}
              </Text>
              {providers.map((p) => (
                <IntegrationRow
                  key={p.provider}
                  config={p}
                  status={integrationMap[p.provider]}
                  onConnect={() => handleConnect(p.provider)}
                  onDisconnect={() => disconnectMut.mutate(p.provider)}
                  isDisconnecting={disconnectMut.isPending && disconnectMut.variables === p.provider}
                />
              ))}
            </View>
          ))}

          {isNotionConnected && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>Notion Actions</Text>
              <View style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.rowIcon, { backgroundColor: "#00000015" }]}>
                  <Feather name="upload-cloud" size={18} color="#000000" />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>Export All to Notion</Text>
                  <Text style={[styles.statusText, { color: colors.textTertiary }]}>Sync all leads, contacts, and activities</Text>
                </View>
                <Pressable
                  style={[styles.connectBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    showAlert("Export to Notion", "This will sync all your CRM data to Notion. Continue?", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Export", onPress: () => notionExportMut.mutate() },
                    ]);
                  }}
                  disabled={notionExportMut.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Export all to Notion"
                >
                  {notionExportMut.isPending ? (
                    <ActivityIndicator size="small" color={colors.onPrimary} />
                  ) : (
                    <Text style={[styles.connectText, { color: colors.onPrimary }]}>Export</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>CRM Sync</Text>
            <View style={[styles.row, { backgroundColor: colors.surface }]}>
              <View style={[styles.rowIcon, { backgroundColor: "#6366f115" }]}>
                <Feather name="refresh-cw" size={18} color="#6366f1" />
              </View>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Horizon</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: horizonStatus?.configured ? colors.success : colors.textTertiary }]} />
                  <Text style={[styles.statusText, { color: colors.textTertiary }]}>
                    {horizonStatus?.configured
                      ? horizonStatus.lastSyncAt
                        ? `Last sync: ${new Date(horizonStatus.lastSyncAt).toLocaleDateString()}`
                        : "Connected — never synced"
                      : "Not configured"}
                  </Text>
                </View>
              </View>
              <Pressable
                style={[styles.connectBtn, { backgroundColor: horizonStatus?.configured ? colors.primary : colors.surface2 }]}
                onPress={() => horizonSyncMut.mutate()}
                disabled={!horizonStatus?.configured || horizonSyncMut.isPending}
                accessibilityRole="button"
                accessibilityLabel="Sync from Horizon"
              >
                {horizonSyncMut.isPending ? (
                  <ActivityIndicator size="small" color={colors.onPrimary} />
                ) : (
                  <Text style={[styles.connectText, { color: horizonStatus?.configured ? colors.onPrimary : colors.textTertiary }]}>Sync</Text>
                )}
              </Pressable>
            </View>
            {horizonStatus?.lastSyncAt && (
              <View style={[styles.syncStats, { backgroundColor: colors.surface }]}>
                <Text style={[styles.syncStatsText, { color: colors.textSecondary }]}>
                  Last sync: {horizonStatus.lastSyncLeadsCreated} new leads, {horizonStatus.lastSyncLeadsUpdated} updated | {horizonStatus.lastSyncContactsCreated} new contacts, {horizonStatus.lastSyncContactsUpdated} updated
                </Text>
              </View>
            )}
          </View>
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Layout.screenPadding },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  title: { fontSize: 20, fontFamily: "SpaceGrotesk_700Bold" },
  subtitle: {
    fontSize: 13,
    fontFamily: "SpaceGrotesk_400Regular",
    marginBottom: Layout.sectionSpacing,
    lineHeight: 19,
  },
  section: { marginBottom: Layout.sectionSpacing },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginBottom: Layout.cardGap,
    gap: 12,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  rowInfo: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold" },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular" },
  connectBtn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  connectText: { fontSize: 13, fontFamily: "SpaceGrotesk_600SemiBold" },
  disconnectBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  disconnectText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium" },
  syncStats: {
    borderRadius: Layout.cardRadius,
    padding: Layout.cardPadding,
    marginTop: -Layout.cardGap + 2,
  },
  syncStatsText: { fontSize: 11, fontFamily: "SpaceGrotesk_400Regular", lineHeight: 16 },
});
