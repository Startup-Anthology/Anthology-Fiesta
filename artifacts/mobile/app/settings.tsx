import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import React, { useMemo, useState, useEffect } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView as RNScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";
import Layout from "@/constants/layout";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STATUSES = ["new", "contacted", "interested", "engaged", "converted"];
const ACTION_TYPES = ["enroll_sequence", "schedule_followup"];

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user, logout, refreshUser } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const isAdmin = user?.role === "admin";

  const { data: settings = {} } = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const { data: triggers = [], refetch: refetchTriggers } = useQuery({ queryKey: ["triggers"], queryFn: api.getTriggerRules });
  const { data: sequences = [] } = useQuery({ queryKey: ["sequences"], queryFn: api.getSequences });
  const { data: adminUsers = [], refetch: refetchAdminUsers } = useQuery({
    queryKey: ["adminUsers"],
    queryFn: api.getAdminUsers,
    enabled: isAdmin,
  });

  const [betaTotal, setBetaTotal] = useState("");
  const [founderName, setFounderName] = useState("");
  const [appName, setAppName] = useState("");
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
  const [newTriggerStatus, setNewTriggerStatus] = useState("");
  const [newTriggerAction, setNewTriggerAction] = useState("");
  const [newTriggerSeqId, setNewTriggerSeqId] = useState<number | null>(null);
  const [newTriggerDays, setNewTriggerDays] = useState("3");

  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editProfileImage, setEditProfileImage] = useState("");
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFirstName, setNewUserFirstName] = useState("");
  const [newUserLastName, setNewUserLastName] = useState("");
  const [newUserRole, setNewUserRole] = useState("user");
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagData, setDiagData] = useState<any>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [recentData, setRecentData] = useState<any>(null);
  const [integrationStatuses, setIntegrationStatuses] = useState<{
    gmail?: string;
    googleCalendar?: string;
    notion?: string;
  }>({});

  useEffect(() => {
    if (settings) {
      setBetaTotal(settings.beta_slots_total || "100");
      setFounderName(settings.founder_name || "");
      setAppName(settings.app_name || "Fiesta");
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
    }
  }, [settings]);

  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditProfileImage(user.profileImageUrl || "");
    }
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    api.getDiagnostics().then((diag: any) => {
      if (diag?.integrations) {
        setIntegrationStatuses(diag.integrations);
      }
    }).catch(() => {});
  }, [isAdmin]);

  const updateSettingsMut = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  const updateProfileMut = useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string; profileImageUrl?: string }) => api.updateProfile(data),
    onSuccess: async (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result?.token) {
        await SecureStore.setItemAsync("auth_session_token", result.token);
      }
      await refreshUser();
      Alert.alert("Saved", "Your profile has been updated.");
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const createTriggerMut = useMutation({
    mutationFn: () => api.createTriggerRule({
      triggerStatus: newTriggerStatus,
      actionType: newTriggerAction,
      sequenceId: newTriggerAction === "enroll_sequence" ? newTriggerSeqId : undefined,
      followUpDays: newTriggerAction === "schedule_followup" ? parseInt(newTriggerDays, 10) : undefined,
    }),
    onSuccess: () => {
      refetchTriggers();
      setNewTriggerStatus("");
      setNewTriggerAction("");
    },
  });

  const deleteTriggerMut = useMutation({
    mutationFn: (id: number) => api.deleteTriggerRule(id),
    onSuccess: () => refetchTriggers(),
  });

  const createUserMut = useMutation({
    mutationFn: () => api.createAdminUser({
      email: newUserEmail.trim().toLowerCase(),
      firstName: newUserFirstName.trim() || undefined,
      lastName: newUserLastName.trim() || undefined,
      role: newUserRole,
    }),
    onSuccess: () => {
      refetchAdminUsers();
      setShowAddUser(false);
      setNewUserEmail("");
      setNewUserFirstName("");
      setNewUserLastName("");
      setNewUserRole("user");
      Alert.alert("Done", "User created successfully.");
    },
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const toggleUserActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.updateAdminUser(id, { isActive }),
    onSuccess: () => refetchAdminUsers(),
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const horizonSyncMut = useMutation({
    mutationFn: () => api.syncFromHorizon(),
    onSuccess: (result) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      const { leads, contacts } = result;
      const parts: string[] = [];
      if (leads.created > 0 || leads.updated > 0)
        parts.push(`Leads: ${leads.created} created, ${leads.updated} updated`);
      if (contacts.created > 0 || contacts.updated > 0)
        parts.push(`Contacts: ${contacts.created} created, ${contacts.updated} updated`);
      if (parts.length === 0) parts.push("Everything is up to date");
      const allErrors = [...(leads.errors || []), ...(contacts.errors || [])];
      if (allErrors.length > 0) parts.push(`${allErrors.length} error(s)`);
      Alert.alert("Horizon Sync Complete", parts.join("\n"));
    },
    onError: (err: Error) => Alert.alert("Sync Failed", err.message),
  });

  const toggleUserRoleMut = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      api.updateAdminUser(id, { role }),
    onSuccess: () => refetchAdminUsers(),
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const runDiagnostics = async () => {
    setDiagLoading(true);
    setDiagData(null);
    setRecentData(null);
    try {
      const [diag, recent] = await Promise.all([api.getDiagnostics(), api.getRecentErrors()]);
      setDiagData(diag);
      setRecentData(recent);
    } catch (err: any) {
      Alert.alert("Diagnostics Error", err.message || "Failed to load diagnostics");
    } finally {
      setDiagLoading(false);
    }
  };

  const handleSaveProfile = () => {
    updateProfileMut.mutate({
      firstName: editFirstName.trim() || undefined,
      lastName: editLastName.trim() || undefined,
      profileImageUrl: editProfileImage.trim() || undefined,
    });
  };

  return (
    <KeyboardAwareScrollViewCompat style={[styles.container, { paddingTop: topPad }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>First Name</Text>
          <TextInput
            style={styles.settingInput}
            value={editFirstName}
            onChangeText={setEditFirstName}
            placeholder="First name"
            placeholderTextColor={colors.textTertiary}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Last Name</Text>
          <TextInput
            style={styles.settingInput}
            value={editLastName}
            onChangeText={setEditLastName}
            placeholder="Last name"
            placeholderTextColor={colors.textTertiary}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Avatar URL</Text>
          <TextInput
            style={[styles.settingInput, { flex: 1, marginLeft: 8 }]}
            value={editProfileImage}
            onChangeText={setEditProfileImage}
            placeholder="https://..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
        {user?.email && (
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Email</Text>
            <Text style={[styles.settingInput, { color: colors.textSecondary }]}>{user.email}</Text>
          </View>
        )}
        {user?.role && (
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Role</Text>
            <View style={[styles.roleBadge, user.role === "admin" && styles.roleBadgeAdmin]}>
              <Text style={[styles.roleBadgeText, user.role === "admin" && styles.roleBadgeTextAdmin]}>{user.role}</Text>
            </View>
          </View>
        )}
        <Pressable
          style={[styles.saveBtn, updateProfileMut.isPending && { opacity: 0.6 }]}
          onPress={handleSaveProfile}
          disabled={updateProfileMut.isPending}
        >
          {updateProfileMut.isPending ? (
            <ActivityIndicator color={colors.onPrimary} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Profile</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <View style={styles.settingRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Feather name={isDark ? "moon" : "sun"} size={18} color={colors.accent} />
            <Text style={styles.settingLabel}>Dark Mode</Text>
          </View>
          <Switch
            value={isDark}
            onValueChange={toggleTheme}
            trackColor={{ false: colors.border, true: colors.accent }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>General</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>App Name</Text>
          <TextInput
            style={styles.settingInput}
            value={appName}
            onChangeText={setAppName}
            onBlur={() => updateSettingsMut.mutate({ app_name: appName })}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Founder Name</Text>
          <TextInput
            style={styles.settingInput}
            value={founderName}
            onChangeText={setFounderName}
            placeholder="Your name"
            placeholderTextColor={colors.textTertiary}
            onBlur={() => updateSettingsMut.mutate({ founder_name: founderName })}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Beta Slot Total</Text>
          <TextInput
            style={[styles.settingInput, { width: 80, textAlign: "right" }]}
            value={betaTotal}
            onChangeText={setBetaTotal}
            keyboardType="numeric"
            onBlur={() => updateSettingsMut.mutate({ beta_slots_total: betaTotal })}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Links</Text>
        <Text style={styles.sectionSubtitle}>Store commonly used URLs for easy access.</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>My LinkedIn</Text>
          <TextInput
            style={[styles.settingInput, { flex: 1, marginLeft: 8 }]}
            value={myLinkedin}
            onChangeText={setMyLinkedin}
            placeholder="https://linkedin.com/in/..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onBlur={() => updateSettingsMut.mutate({ quick_link_my_linkedin: myLinkedin })}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Company LinkedIn</Text>
          <TextInput
            style={[styles.settingInput, { flex: 1, marginLeft: 8 }]}
            value={companyLinkedin}
            onChangeText={setCompanyLinkedin}
            placeholder="https://linkedin.com/company/..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onBlur={() => updateSettingsMut.mutate({ quick_link_company_linkedin: companyLinkedin })}
          />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Calendar Link</Text>
          <TextInput
            style={[styles.settingInput, { flex: 1, marginLeft: 8 }]}
            value={calendarLink}
            onChangeText={setCalendarLink}
            placeholder="https://calendly.com/..."
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onBlur={() => updateSettingsMut.mutate({ quick_link_calendar: calendarLink })}
          />
        </View>
        {[
          { label: customLabel1, setLabel: setCustomLabel1, url: customUrl1, setUrl: setCustomUrl1, labelKey: "quick_link_custom1_label", urlKey: "quick_link_custom1_url" },
          { label: customLabel2, setLabel: setCustomLabel2, url: customUrl2, setUrl: setCustomUrl2, labelKey: "quick_link_custom2_label", urlKey: "quick_link_custom2_url" },
          { label: customLabel3, setLabel: setCustomLabel3, url: customUrl3, setUrl: setCustomUrl3, labelKey: "quick_link_custom3_label", urlKey: "quick_link_custom3_url" },
        ].map((slot, idx) => (
          <View key={idx} style={styles.customLinkRow}>
            <TextInput
              style={styles.customLinkLabel}
              value={slot.label}
              onChangeText={slot.setLabel}
              placeholder={`Custom label ${idx + 1}`}
              placeholderTextColor={colors.textTertiary}
              onBlur={() => updateSettingsMut.mutate({ [slot.labelKey]: slot.label })}
            />
            <TextInput
              style={styles.customLinkUrl}
              value={slot.url}
              onChangeText={slot.setUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              onBlur={() => updateSettingsMut.mutate({ [slot.urlKey]: slot.url })}
            />
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Integrations</Text>
        {([
          { key: "gmail" as const, label: "Gmail", icon: "mail" as const, fallbackColor: colors.success },
          { key: "googleCalendar" as const, label: "Google Calendar", icon: "calendar" as const, fallbackColor: colors.accent },
          { key: "notion" as const, label: "Notion", icon: "book" as const, fallbackColor: colors.primary },
        ]).map((integration) => {
          const status = integrationStatuses[integration.key];
          const hasStatus = status !== undefined;
          const isConnected = status === "configured";
          const dotColor = !hasStatus ? colors.textTertiary : isConnected ? colors.success : colors.textTertiary;
          const statusLabel = !hasStatus ? "Unknown" : isConnected ? "Connected" : "Not connected";
          return (
            <View key={integration.key} style={styles.integrationRow}>
              <View style={styles.integrationIcon}>
                <Feather name={integration.icon} size={18} color={isConnected ? integration.fallbackColor : colors.textTertiary} />
              </View>
              <View style={styles.integrationInfo}>
                <Text style={styles.integrationName}>{integration.label}</Text>
                <Text style={[styles.integrationStatus, { color: dotColor }]}>{statusLabel}</Text>
              </View>
              <View style={[styles.connectedDot, { backgroundColor: dotColor }]} />
            </View>
          );
        })}
        <View style={styles.integrationRow}>
          <View style={styles.integrationIcon}>
            <Feather name="refresh-cw" size={18} color={colors.accent} />
          </View>
          <View style={styles.integrationInfo}>
            <Text style={styles.integrationName}>Horizon</Text>
            <Text style={styles.integrationStatus}>Pull sync</Text>
          </View>
          <Pressable
            style={[styles.horizonSyncBtn, horizonSyncMut.isPending && { opacity: 0.6 }]}
            onPress={() => {
              Alert.alert(
                "Sync from Horizon",
                "This will import all users and contact submissions from Horizon. Existing records will be updated.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sync Now", onPress: () => horizonSyncMut.mutate() },
                ]
              );
            }}
            disabled={horizonSyncMut.isPending}
          >
            {horizonSyncMut.isPending ? (
              <ActivityIndicator color={colors.onPrimary} size="small" />
            ) : (
              <Text style={styles.horizonSyncBtnText}>Sync Now</Text>
            )}
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notion Sync</Text>
        <Text style={styles.sectionSubtitle}>Paste your Notion database IDs to sync automatically.</Text>
        <View style={styles.notionDbRow}>
          <Text style={styles.notionDbLabel}>Leads DB</Text>
          <TextInput
            style={styles.notionDbInput}
            value={notionLeadsDb}
            onChangeText={setNotionLeadsDb}
            placeholder="Notion database ID"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => updateSettingsMut.mutate({ notion_leads_db: notionLeadsDb })}
          />
        </View>
        <View style={styles.notionDbRow}>
          <Text style={styles.notionDbLabel}>Contacts DB</Text>
          <TextInput
            style={styles.notionDbInput}
            value={notionContactsDb}
            onChangeText={setNotionContactsDb}
            placeholder="Notion database ID"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => updateSettingsMut.mutate({ notion_contacts_db: notionContactsDb })}
          />
        </View>
        <View style={styles.notionDbRow}>
          <Text style={styles.notionDbLabel}>Activities DB</Text>
          <TextInput
            style={styles.notionDbInput}
            value={notionActivitiesDb}
            onChangeText={setNotionActivitiesDb}
            placeholder="Notion database ID"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            onBlur={() => updateSettingsMut.mutate({ notion_activities_db: notionActivitiesDb })}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trigger Rules</Text>
        <Text style={styles.sectionSubtitle}>Automate the busywork. Set it and forget it.</Text>
        {triggers.map((t: any) => (
          <View key={t.id} style={styles.triggerCard}>
            <View style={styles.triggerInfo}>
              <Text style={styles.triggerText}>
                When lead → <Text style={{ fontFamily: "LeagueSpartan_600SemiBold" }}>{t.triggerStatus}</Text>
              </Text>
              <Text style={styles.triggerAction}>
                {t.actionType === "enroll_sequence" ? `Start sequence #${t.sequenceId}` : `Follow up in ${t.followUpDays} days`}
              </Text>
            </View>
            <Pressable onPress={() => deleteTriggerMut.mutate(t.id)}>
              <Feather name="x" size={18} color={colors.error} />
            </Pressable>
          </View>
        ))}

        <View style={styles.addTrigger}>
          <Text style={styles.addTriggerTitle}>Add Rule</Text>
          <View style={styles.formGroup}>
            <Text style={styles.label}>When status becomes</Text>
            <View style={styles.chipRow}>
              {STATUSES.map((s) => (
                <Pressable key={s} style={[styles.chip, newTriggerStatus === s && styles.chipActive]} onPress={() => setNewTriggerStatus(s)}>
                  <Text style={[styles.chipText, newTriggerStatus === s && styles.chipTextActive]}>{s}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.formGroup}>
            <Text style={styles.label}>Action</Text>
            <View style={styles.chipRow}>
              {ACTION_TYPES.map((a) => (
                <Pressable key={a} style={[styles.chip, newTriggerAction === a && styles.chipActive]} onPress={() => setNewTriggerAction(a)}>
                  <Text style={[styles.chipText, newTriggerAction === a && styles.chipTextActive]}>{a.replace("_", " ")}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {newTriggerAction === "enroll_sequence" && sequences.length > 0 && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Sequence</Text>
              {sequences.map((s: any) => (
                <Pressable key={s.id} style={[styles.seqOption, newTriggerSeqId === s.id && { backgroundColor: colors.primary }]} onPress={() => setNewTriggerSeqId(s.id)}>
                  <Text style={[styles.seqOptionText, newTriggerSeqId === s.id && { color: colors.onPrimary }]}>{s.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {newTriggerAction === "schedule_followup" && (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Days until follow-up</Text>
              <TextInput style={styles.settingInput} value={newTriggerDays} onChangeText={setNewTriggerDays} keyboardType="numeric" />
            </View>
          )}
          <Pressable
            style={[styles.addBtn, (!newTriggerStatus || !newTriggerAction) && { opacity: 0.4 }]}
            onPress={() => newTriggerStatus && newTriggerAction && createTriggerMut.mutate()}
            disabled={!newTriggerStatus || !newTriggerAction}
          >
            <Text style={styles.addBtnText}>Add Rule</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Merge Tags</Text>
        <View style={styles.mergeTagCard}>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{first_name}}"}</Text><Text style={styles.mergeDesc}>Their first name</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{company_name}}"}</Text><Text style={styles.mergeDesc}>Their company</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{founder_name}}"}</Text><Text style={styles.mergeDesc}>Your name</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{my_linkedin}}"}</Text><Text style={styles.mergeDesc}>Your LinkedIn URL</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{company_linkedin}}"}</Text><Text style={styles.mergeDesc}>Company LinkedIn URL</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{calendar_link}}"}</Text><Text style={styles.mergeDesc}>Your calendar link</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{custom_link_1}}"}</Text><Text style={styles.mergeDesc}>Custom link 1</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{custom_link_2}}"}</Text><Text style={styles.mergeDesc}>Custom link 2</Text></View>
          <View style={styles.mergeRow}><Text style={styles.mergeTag}>{"{{custom_link_3}}"}</Text><Text style={styles.mergeDesc}>Custom link 3</Text></View>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <View style={styles.adminHeader}>
            <Text style={styles.sectionTitle}>User Management</Text>
            <Pressable style={styles.addUserBtn} onPress={() => setShowAddUser(true)}>
              <Feather name="plus" size={16} color={colors.onPrimary} />
              <Text style={styles.addUserBtnText}>Add User</Text>
            </Pressable>
          </View>
          <Text style={styles.sectionSubtitle}>Manage users and permissions.</Text>

          {adminUsers.map((u: any) => (
            <View key={u.id} style={styles.userCard}>
              <View style={styles.userAvatar}>
                <Text style={styles.userAvatarText}>
                  {(u.firstName?.[0] || u.email?.[0] || "?").toUpperCase()}
                </Text>
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                </Text>
                <Text style={styles.userEmail}>{u.email}</Text>
                <View style={styles.userMeta}>
                  <View style={[styles.roleBadgeSmall, u.role === "admin" && styles.roleBadgeSmallAdmin]}>
                    <Text style={[styles.roleBadgeSmallText, u.role === "admin" && styles.roleBadgeSmallTextAdmin]}>{u.role}</Text>
                  </View>
                  {!u.isActive && (
                    <View style={styles.disabledBadge}>
                      <Text style={styles.disabledBadgeText}>Disabled</Text>
                    </View>
                  )}
                </View>
              </View>
              {u.id !== user?.id && (
                <View style={styles.userActions}>
                  <Pressable
                    style={styles.userActionBtn}
                    onPress={() => {
                      const nextRole = u.role === "admin" ? "user" : "admin";
                      Alert.alert(
                        "Change Role",
                        `Set ${u.firstName || u.email} as ${nextRole}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: "Confirm", onPress: () => toggleUserRoleMut.mutate({ id: u.id, role: nextRole }) },
                        ]
                      );
                    }}
                  >
                    <Feather name="shield" size={16} color={u.role === "admin" ? colors.accent : colors.textTertiary} />
                  </Pressable>
                  <Pressable
                    style={styles.userActionBtn}
                    onPress={() => {
                      const action = u.isActive ? "Disable" : "Enable";
                      Alert.alert(
                        `${action} User`,
                        `${action} ${u.firstName || u.email}?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          { text: action, style: u.isActive ? "destructive" : "default", onPress: () => toggleUserActiveMut.mutate({ id: u.id, isActive: !u.isActive }) },
                        ]
                      );
                    }}
                  >
                    <Feather name={u.isActive ? "user-check" : "user-x"} size={16} color={u.isActive ? colors.success : colors.error} />
                  </Pressable>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {isAdmin && (
        <View style={styles.section}>
          <Pressable
            style={styles.diagToggle}
            onPress={() => {
              setShowDiagnostics(!showDiagnostics);
              if (!showDiagnostics && !diagData) runDiagnostics();
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Feather name="activity" size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>System Diagnostics</Text>
            </View>
            <Feather name={showDiagnostics ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
          </Pressable>
          {showDiagnostics && (
            <View style={{ marginTop: 12 }}>
              <Pressable
                style={[styles.addBtn, { backgroundColor: colors.accent, marginBottom: 14 }]}
                onPress={runDiagnostics}
                disabled={diagLoading}
              >
                {diagLoading ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.addBtnText}>Run Diagnostics</Text>
                )}
              </Pressable>

              {diagData && (
                <>
                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Service Health</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <DiagRow label="Database" value={diagData.database?.status} latency={diagData.database?.latencyMs} colors={colors} />
                    <DiagRow label="AI Model" value={diagData.ai?.status} latency={diagData.ai?.latencyMs} colors={colors} />
                    <DiagRow label="Horizon" value={diagData.horizon?.status} latency={diagData.horizon?.latencyMs} colors={colors} />
                  </View>

                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Integrations</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <DiagRow label="Gmail" value={diagData.integrations?.gmail} colors={colors} />
                    <DiagRow label="Google Calendar" value={diagData.integrations?.googleCalendar} colors={colors} />
                    <DiagRow label="Notion" value={diagData.integrations?.notion} colors={colors} />
                  </View>

                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Environment</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <DiagRow label="Mode" value={diagData.environment?.nodeEnv} colors={colors} />
                    <DiagRow label="Uptime" value={formatUptime(diagData.environment?.uptimeSeconds)} colors={colors} />
                    <DiagRow label="Memory" value={`${diagData.environment?.memoryMb} MB`} colors={colors} />
                  </View>

                  {diagData.tables && (
                    <>
                      <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Database Tables</Text>
                      <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        {diagData.tables.map((t: any) => (
                          <DiagRow key={t.name} label={t.name} value={`~${t.rowEstimate} rows`} colors={colors} />
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}

              {recentData && (
                <>
                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Last 24h Activity</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {recentData.last24hActivity?.length > 0 ? (
                      recentData.last24hActivity.map((a: any, i: number) => (
                        <DiagRow key={i} label={`${a.entity_type} / ${a.action}`} value={`${a.count}x`} colors={colors} />
                      ))
                    ) : (
                      <Text style={{ color: colors.textTertiary, fontSize: 13, fontFamily: "SpaceGrotesk_400Regular" }}>No activity in last 24 hours</Text>
                    )}
                  </View>

                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Recent AI Conversations</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {recentData.recentConversations?.length > 0 ? (
                      recentData.recentConversations.map((c: any) => (
                        <View key={c.id} style={styles.diagConvRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.diagConvTitle, { color: colors.text }]} numberOfLines={1}>{c.title}</Text>
                            <Text style={[styles.diagConvMeta, { color: colors.textTertiary }]}>
                              {c.user_email} · {c.message_count} msgs · {c.agents_involved}
                            </Text>
                          </View>
                          <Text style={[styles.diagConvMeta, { color: colors.textTertiary }]}>
                            {new Date(c.updated_at).toLocaleDateString()}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: colors.textTertiary, fontSize: 13, fontFamily: "SpaceGrotesk_400Regular" }}>No conversations yet</Text>
                    )}
                  </View>

                  <Text style={[styles.diagSectionLabel, { color: colors.text }]}>Recent Audit Log</Text>
                  <View style={[styles.diagCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    {recentData.recentAuditLog?.slice(0, 15).map((a: any, i: number) => (
                      <View key={i} style={styles.diagAuditRow}>
                        <View style={[styles.diagAuditAction, { backgroundColor: a.action === "create" ? colors.success + "20" : a.action === "delete" ? colors.error + "20" : colors.accent + "20" }]}>
                          <Text style={{ fontSize: 10, fontFamily: "LeagueSpartan_600SemiBold", color: a.action === "create" ? colors.success : a.action === "delete" ? colors.error : colors.accent }}>
                            {a.action.toUpperCase()}
                          </Text>
                        </View>
                        <Text style={[styles.diagAuditText, { color: colors.text }]} numberOfLines={1}>
                          {a.entity_type} #{a.entity_id}
                        </Text>
                        <Text style={[styles.diagConvMeta, { color: colors.textTertiary }]}>
                          {new Date(a.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.section}>
        <Pressable
          style={[styles.addBtn, { backgroundColor: colors.error, marginTop: 14 }]}
          onPress={() => {
            Alert.alert("Log out?", "You'll need to sign in again.", [
              { text: "Stay", style: "cancel" },
              { text: "Log Out", style: "destructive", onPress: () => logout() },
            ]);
          }}
        >
          <Text style={styles.addBtnText}>Log Out</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }} />

      <Modal visible={showAddUser} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add User</Text>
              <Pressable onPress={() => setShowAddUser(false)}>
                <Feather name="x" size={22} color={colors.text} />
              </Pressable>
            </View>
            <View style={styles.modalNameRow}>
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="First name"
                placeholderTextColor={colors.textTertiary}
                value={newUserFirstName}
                onChangeText={setNewUserFirstName}
                autoCapitalize="words"
              />
              <TextInput
                style={[styles.modalInput, { flex: 1 }]}
                placeholder="Last name"
                placeholderTextColor={colors.textTertiary}
                value={newUserLastName}
                onChangeText={setNewUserLastName}
                autoCapitalize="words"
              />
            </View>
            <TextInput
              style={styles.modalInput}
              placeholder="Email"
              placeholderTextColor={colors.textTertiary}
              value={newUserEmail}
              onChangeText={setNewUserEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <View style={styles.formGroup}>
              <Text style={styles.label}>Role</Text>
              <View style={styles.chipRow}>
                {["user", "admin"].map((r) => (
                  <Pressable key={r} style={[styles.chip, newUserRole === r && styles.chipActive]} onPress={() => setNewUserRole(r)}>
                    <Text style={[styles.chipText, newUserRole === r && styles.chipTextActive]}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Pressable
              style={[styles.addBtn, createUserMut.isPending && { opacity: 0.6 }]}
              onPress={() => {
                if (!newUserEmail.trim()) {
                  Alert.alert("Required", "Email is required.");
                  return;
                }
                createUserMut.mutate();
              }}
              disabled={createUserMut.isPending}
            >
              {createUserMut.isPending ? (
                <ActivityIndicator color={colors.onPrimary} size="small" />
              ) : (
                <Text style={styles.addBtnText}>Create User</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAwareScrollViewCompat>
  );
}

function formatUptime(seconds: number | undefined): string {
  if (!seconds) return "N/A";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusColor(value: string | undefined, colors: ThemeColors): string {
  if (!value) return colors.textTertiary;
  const v = value.toLowerCase();
  if (v === "connected" || v === "available" || v === "configured") return colors.success;
  if (v.includes("error") || v === "unavailable" || v === "not configured") return colors.error;
  return colors.accent;
}

function DiagRow({ label, value, latency, colors }: { label: string; value?: string; latency?: number; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
      <Text style={{ fontSize: 13, fontFamily: "SpaceGrotesk_500Medium", color: colors.text }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {latency !== undefined && (
          <Text style={{ fontSize: 11, fontFamily: "SpaceGrotesk_400Regular", color: colors.textTertiary }}>{latency}ms</Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: statusColor(value, colors) }} />
          <Text style={{ fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: statusColor(value, colors) }}>
            {value || "unknown"}
          </Text>
        </View>
      </View>
    </View>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: Layout.screenPadding },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: Layout.sectionSpacing },
  title: { fontSize: 20, fontFamily: "Lato_700Bold", color: colors.text },
  section: { marginBottom: Layout.sectionSpacing },
  sectionTitle: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 6 },
  sectionSubtitle: { fontSize: 13, fontFamily: "Montserrat_400Regular", color: colors.textTertiary, marginBottom: 14 },
  settingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: Layout.cardGap },
  settingLabel: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  settingInput: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.badgeRadius, paddingHorizontal: 10, paddingVertical: 6, minWidth: 120 },
  integrationRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: Layout.cardGap },
  integrationIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surfaceSecondary, justifyContent: "center", alignItems: "center" },
  integrationInfo: { flex: 1 },
  integrationName: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  integrationStatus: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.success },
  connectedDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  horizonSyncBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, minWidth: 80, alignItems: "center" as const },
  horizonSyncBtnText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  triggerCard: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: Layout.cardGap },
  triggerInfo: { flex: 1 },
  triggerText: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text },
  triggerAction: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary, marginTop: 2 },
  addTrigger: { backgroundColor: colors.surfaceSecondary, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: 14 },
  addTriggerTitle: { fontSize: 15, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text, marginBottom: 14 },
  formGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontFamily: "Montserrat_600SemiBold", color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium", color: colors.text, textTransform: "capitalize" },
  chipTextActive: { color: colors.onPrimary },
  seqOption: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: Layout.cardRadius, backgroundColor: colors.surface, marginBottom: 8 },
  seqOptionText: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium", color: colors.text },
  addBtn: { backgroundColor: colors.primary, borderRadius: Layout.inputRadius, paddingVertical: 12, alignItems: "center" },
  addBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 12 },
  saveBtnText: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  mergeTagCard: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: Layout.cardGap, gap: 10 },
  mergeRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  mergeTag: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", color: colors.info, backgroundColor: colors.info + "10", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, overflow: "hidden" },
  mergeDesc: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary },
  customLinkRow: { flexDirection: "row", gap: 8, marginTop: Layout.cardGap },
  customLinkLabel: { flex: 1, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, paddingHorizontal: 10, paddingVertical: 10 },
  customLinkUrl: { flex: 2, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, backgroundColor: colors.surface, borderRadius: Layout.cardRadius, paddingHorizontal: 10, paddingVertical: 10 },
  notionDbRow: { backgroundColor: colors.surface, borderRadius: Layout.cardRadius, padding: Layout.cardPadding, marginTop: Layout.cardGap },
  notionDbLabel: { fontSize: 12, fontFamily: "Montserrat_600SemiBold", color: colors.textSecondary, marginBottom: 8, textTransform: "uppercase" },
  notionDbInput: { fontSize: 13, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, backgroundColor: colors.surfaceSecondary, borderRadius: Layout.badgeRadius, paddingHorizontal: 10, paddingVertical: 8 },
  roleBadge: { backgroundColor: colors.surfaceSecondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  roleBadgeAdmin: { backgroundColor: colors.accent + "20" },
  roleBadgeText: { fontSize: 12, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary, textTransform: "capitalize" },
  roleBadgeTextAdmin: { color: colors.accent },
  adminHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  addUserBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  addUserBtnText: { fontSize: 12, fontFamily: "LeagueSpartan_600SemiBold", color: colors.onPrimary },
  userCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginTop: 8 },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary, justifyContent: "center", alignItems: "center" },
  userAvatarText: { color: colors.accent, fontFamily: "Lato_700Bold", fontSize: 16 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontFamily: "LeagueSpartan_600SemiBold", color: colors.text },
  userEmail: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", color: colors.textSecondary },
  userMeta: { flexDirection: "row", gap: 6, marginTop: 4 },
  roleBadgeSmall: { backgroundColor: colors.surfaceSecondary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  roleBadgeSmallAdmin: { backgroundColor: colors.accent + "20" },
  roleBadgeSmallText: { fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", color: colors.textSecondary, textTransform: "capitalize" },
  roleBadgeSmallTextAdmin: { color: colors.accent },
  disabledBadge: { backgroundColor: colors.error + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  disabledBadgeText: { fontSize: 10, fontFamily: "SpaceGrotesk_500Medium", color: colors.error },
  userActions: { flexDirection: "row", gap: 8 },
  userActionBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: colors.surfaceSecondary, justifyContent: "center", alignItems: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontFamily: "Lato_700Bold", color: colors.text },
  modalInput: { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "SpaceGrotesk_400Regular", color: colors.text, marginBottom: 12 },
  modalNameRow: { flexDirection: "row", gap: 10 },
  diagToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  diagSectionLabel: { fontSize: 13, fontFamily: "LeagueSpartan_600SemiBold", marginTop: 12, marginBottom: 6 },
  diagCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 4 },
  diagConvRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5 },
  diagConvTitle: { fontSize: 13, fontFamily: "SpaceGrotesk_500Medium" },
  diagConvMeta: { fontSize: 11, fontFamily: "SpaceGrotesk_400Regular" },
  diagAuditRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  diagAuditAction: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 52, alignItems: "center" as const },
  diagAuditText: { flex: 1, fontSize: 12, fontFamily: "SpaceGrotesk_500Medium" },
});
