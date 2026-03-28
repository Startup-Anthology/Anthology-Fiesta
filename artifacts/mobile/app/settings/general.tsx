import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

export default function GeneralScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top + 16;

  const { data: settings = {} } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });

  const [appName, setAppName] = useState("");
  const [founderName, setFounderName] = useState("");
  const [betaTotal, setBetaTotal] = useState("");
  const [notionLeadsDb, setNotionLeadsDb] = useState("");
  const [notionContactsDb, setNotionContactsDb] = useState("");
  const [notionActivitiesDb, setNotionActivitiesDb] = useState("");
  const [myLinkedin, setMyLinkedin] = useState("");
  const [companyLinkedin, setCompanyLinkedin] = useState("");
  const [calendarLink, setCalendarLink] = useState("");
  const [customLabel1, setCustomLabel1] = useState("");
  const [customUrl1, setCustomUrl1] = useState("");
  const [customLabel2, setCustomLabel2] = useState("");
  const [customUrl2, setCustomUrl2] = useState("");
  const [customLabel3, setCustomLabel3] = useState("");
  const [customUrl3, setCustomUrl3] = useState("");
  const [slackChannelId, setSlackChannelId] = useState("");
  const [slackDigestEnabled, setSlackDigestEnabled] = useState(false);
  const [slackDigestTime, setSlackDigestTime] = useState("9");

  useEffect(() => {
    if (settings) {
      setAppName(settings.app_name || "Fiesta");
      setFounderName(settings.founder_name || "");
      setBetaTotal(settings.beta_slots_total || "100");
      setNotionLeadsDb(settings.notion_leads_db || "");
      setNotionContactsDb(settings.notion_contacts_db || "");
      setNotionActivitiesDb(settings.notion_activities_db || "");
      setMyLinkedin(settings.quick_link_my_linkedin || "");
      setCompanyLinkedin(settings.quick_link_company_linkedin || "");
      setCalendarLink(settings.quick_link_calendar || "");
      setCustomLabel1(settings.quick_link_custom1_label || "");
      setCustomUrl1(settings.quick_link_custom1_url || "");
      setCustomLabel2(settings.quick_link_custom2_label || "");
      setCustomUrl2(settings.quick_link_custom2_url || "");
      setCustomLabel3(settings.quick_link_custom3_label || "");
      setCustomUrl3(settings.quick_link_custom3_url || "");
      setSlackChannelId(settings.slack_channel_id || "");
      setSlackDigestEnabled(settings.slack_digest_enabled === "true");
      setSlackDigestTime(settings.slack_digest_time || "9");
    }
  }, [settings]);

  const updateMut = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const save = (data: Record<string, string>) => updateMut.mutate(data);

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>General</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.sectionTitle}>App</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App Name</Text>
          <TextInput
            style={styles.rowInput}
            value={appName}
            onChangeText={setAppName}
            onBlur={() => save({ app_name: appName })}
            accessibilityLabel="App name"
          />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>Founder Name</Text>
          <TextInput
            style={styles.rowInput}
            value={founderName}
            onChangeText={setFounderName}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            onBlur={() => save({ founder_name: founderName })}
            accessibilityLabel="Founder name"
          />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>Beta Slots</Text>
          <TextInput
            style={[styles.rowInput, { width: 80, textAlign: "right" }]}
            value={betaTotal}
            onChangeText={setBetaTotal}
            keyboardType="numeric"
            onBlur={() => save({ beta_slots_total: betaTotal })}
            accessibilityLabel="Beta slot total"
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: Layout.sectionSpacing }]}>Quick Links</Text>
      <Text style={styles.sectionSubtitle}>Stored as merge tags in email templates.</Text>
      <View style={styles.card}>
        {[
          { label: "My LinkedIn", value: myLinkedin, setter: setMyLinkedin, key: "quick_link_my_linkedin", placeholder: "https://linkedin.com/in/..." },
          { label: "Company LinkedIn", value: companyLinkedin, setter: setCompanyLinkedin, key: "quick_link_company_linkedin", placeholder: "https://linkedin.com/company/..." },
          { label: "Calendar Link", value: calendarLink, setter: setCalendarLink, key: "quick_link_calendar", placeholder: "https://calendly.com/..." },
        ].map((item, idx) => (
          <View key={item.key} style={[styles.row, idx > 0 && styles.rowBorder]}>
            <Text style={styles.rowLabel}>{item.label}</Text>
            <TextInput
              style={[styles.rowInput, { flex: 1, marginLeft: 8 }]}
              value={item.value}
              onChangeText={item.setter}
              placeholder={item.placeholder}
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onBlur={() => save({ [item.key]: item.value })}
            />
          </View>
        ))}
      </View>

      <View style={[styles.card, { marginTop: Layout.cardGap }]}>
        {[
          { label: customLabel1, setLabel: setCustomLabel1, url: customUrl1, setUrl: setCustomUrl1, labelKey: "quick_link_custom1_label", urlKey: "quick_link_custom1_url", idx: 1 },
          { label: customLabel2, setLabel: setCustomLabel2, url: customUrl2, setUrl: setCustomUrl2, labelKey: "quick_link_custom2_label", urlKey: "quick_link_custom2_url", idx: 2 },
          { label: customLabel3, setLabel: setCustomLabel3, url: customUrl3, setUrl: setCustomUrl3, labelKey: "quick_link_custom3_label", urlKey: "quick_link_custom3_url", idx: 3 },
        ].map((slot, i) => (
          <View key={i} style={[styles.customRow, i > 0 && styles.rowBorder]}>
            <TextInput
              style={styles.customLabel}
              value={slot.label}
              onChangeText={slot.setLabel}
              placeholder={`Label ${slot.idx}`}
              placeholderTextColor={colors.textTertiary}
              onBlur={() => save({ [slot.labelKey]: slot.label })}
            />
            <TextInput
              style={styles.customUrl}
              value={slot.url}
              onChangeText={slot.setUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onBlur={() => save({ [slot.urlKey]: slot.url })}
            />
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: Layout.sectionSpacing }]}>Notion Sync</Text>
      <Text style={styles.sectionSubtitle}>Paste your Notion database IDs to sync automatically.</Text>
      <View style={styles.card}>
        {[
          { label: "Leads DB", value: notionLeadsDb, setter: setNotionLeadsDb, key: "notion_leads_db" },
          { label: "Contacts DB", value: notionContactsDb, setter: setNotionContactsDb, key: "notion_contacts_db" },
          { label: "Activities DB", value: notionActivitiesDb, setter: setNotionActivitiesDb, key: "notion_activities_db" },
        ].map((item, idx) => (
          <View key={item.key} style={[styles.notionRow, idx > 0 && styles.rowBorder]}>
            <Text style={styles.notionLabel}>{item.label}</Text>
            <TextInput
              style={styles.notionInput}
              value={item.value}
              onChangeText={item.setter}
              placeholder="Notion database ID"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              onBlur={() => save({ [item.key]: item.value })}
            />
          </View>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: Layout.sectionSpacing }]}>Slack</Text>
      <Text style={styles.sectionSubtitle}>Configure Slack notifications and daily digest.</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Channel ID</Text>
          <TextInput
            style={[styles.rowInput, { flex: 1, marginLeft: 8 }]}
            value={slackChannelId}
            onChangeText={setSlackChannelId}
            placeholder="C0123456789"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => save({ slack_channel_id: slackChannelId })}
            accessibilityLabel="Slack channel ID"
          />
        </View>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>Daily Digest</Text>
          <Pressable
            onPress={() => {
              const next = !slackDigestEnabled;
              setSlackDigestEnabled(next);
              save({ slack_digest_enabled: String(next) });
            }}
            accessibilityRole="switch"
            accessibilityState={{ checked: slackDigestEnabled }}
            style={[
              {
                width: 48, height: 28, borderRadius: 14,
                justifyContent: "center",
                padding: 2,
                backgroundColor: slackDigestEnabled ? colors.primary : colors.surface2,
              },
            ]}
          >
            <View style={{
              width: 24, height: 24, borderRadius: 12,
              backgroundColor: "#fff",
              alignSelf: slackDigestEnabled ? "flex-end" : "flex-start",
            }} />
          </Pressable>
        </View>
        {slackDigestEnabled && (
          <View style={[styles.row, styles.rowBorder]}>
            <Text style={styles.rowLabel}>Digest Hour (UTC)</Text>
            <TextInput
              style={[styles.rowInput, { width: 60, textAlign: "right" }]}
              value={slackDigestTime}
              onChangeText={setSlackDigestTime}
              keyboardType="numeric"
              onBlur={() => save({ slack_digest_time: slackDigestTime })}
              accessibilityLabel="Digest hour"
            />
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />
    </KeyboardAwareScrollViewCompat>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Layout.sectionSpacing,
  },
  title: { fontSize: 20, fontFamily: "HankenGrotesk_700Bold", color: colors.text },
  sectionTitle: { fontSize: 13, fontFamily: "HankenGrotesk_600SemiBold", color: colors.textTertiary, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 },
  sectionSubtitle: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", color: colors.textTertiary, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, overflow: "hidden" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: Layout.cardPadding, paddingVertical: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowLabel: { fontSize: 14, fontFamily: "HankenGrotesk_500Medium", color: colors.text, flex: 1 },
  rowInput: {
    fontSize: 14,
    fontFamily: "HankenGrotesk_400Regular",
    color: colors.text,
    backgroundColor: colors.surface2,
    borderRadius: Layout.badgeRadius,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 120,
  },
  customRow: { flexDirection: "row", gap: 8, paddingHorizontal: Layout.cardPadding, paddingVertical: 10 },
  customLabel: { flex: 1, fontSize: 14, fontFamily: "HankenGrotesk_400Regular", color: colors.text, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  customUrl: { flex: 2, fontSize: 14, fontFamily: "HankenGrotesk_400Regular", color: colors.text, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  notionRow: { paddingHorizontal: Layout.cardPadding, paddingVertical: 12 },
  notionLabel: { fontSize: 12, fontFamily: "HankenGrotesk_600SemiBold", color: colors.textSecondary, marginBottom: 6, textTransform: "uppercase" },
  notionInput: { fontSize: 13, fontFamily: "HankenGrotesk_400Regular", color: colors.text, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
});
