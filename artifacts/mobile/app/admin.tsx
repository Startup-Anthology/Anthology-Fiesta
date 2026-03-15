import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import { useTheme } from "@/lib/theme";
import { getAuthToken } from "@/lib/auth";
import { type ThemeColors } from "@/constants/colors";

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAuthToken();
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed: ${res.status}`);
  }
  return res;
}

interface AdminUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
}

interface UserUpdatePayload {
  role?: string;
  isActive?: boolean;
}

interface AdminStyles {
  container: object;
  header: object;
  headerTitle: object;
  tabBar: object;
  tab: object;
  tabActive: object;
  tabText: object;
  tabTextActive: object;
  searchContainer: object;
  searchInput: object;
  userCard: object;
  userInfo: object;
  userName: object;
  userEmail: object;
  badgeRow: object;
  badge: object;
  badgeText: object;
  userActions: object;
  exportContent: object;
  exportCard: object;
  exportHeader: object;
  exportLabel: object;
  exportButtons: object;
  exportButton: object;
  exportButtonText: object;
  importTypeRow: object;
  importTypeButton: object;
  importTypeActive: object;
  importTypeText: object;
  importTypeTextActive: object;
  importHint: object;
  jsonInput: object;
  importButton: object;
  importButtonText: object;
  filePickerButton: object;
  filePickerText: object;
  filePickerHint: object;
}

type Tab = "users" | "export" | "import";

export default function AdminScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 12 : insets.top + 4;
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Panel</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.tabBar}>
        {(["users", "export", "import"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === "users" ? "Users" : tab === "export" ? "Export" : "Import"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "users" && <UsersTab colors={colors} styles={styles} />}
      {activeTab === "export" && <ExportTab colors={colors} styles={styles} />}
      {activeTab === "import" && <ImportTab colors={colors} styles={styles} />}
    </SafeAreaView>
  );
}

function UsersTab({ colors, styles }: { colors: ThemeColors; styles: AdminStyles }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await apiFetch("/admin/users");
      return res.json();
    },
  });

  const updateUser = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UserUpdatePayload }) => {
      await apiFetch(`/admin/users/${id}`, {
        method: "PUT",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const deleteUser = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/admin/users/${id}`, { method: "DELETE" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (err: Error) => Alert.alert("Error", err.message),
  });

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q)
    );
  });

  const handleToggleActive = (user: AdminUser) => {
    const action = user.isActive ? "suspend" : "activate";
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
      `Are you sure you want to ${action} ${user.email || user.firstName || "this user"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: user.isActive ? "destructive" : "default",
          onPress: () => updateUser.mutate({ id: user.id, updates: { isActive: !user.isActive } }),
        },
      ],
    );
  };

  const handleDelete = (user: AdminUser) => {
    Alert.alert(
      "Delete User",
      `Are you sure you want to permanently delete ${user.email || user.firstName || "this user"}? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => deleteUser.mutate(user.id),
        },
      ],
    );
  };

  const handleToggleRole = (user: AdminUser) => {
    const newRole = user.role === "admin" ? "user" : "admin";
    Alert.alert(
      "Change Role",
      `Set ${user.email || user.firstName || "this user"} to ${newRole}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: () => updateUser.mutate({ id: user.id, updates: { role: newRole } }),
        },
      ],
    );
  };

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />;
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchContainer}>
        <Feather name="search" size={16} color={colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          placeholderTextColor={colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>
                {item.firstName || ""} {item.lastName || ""} {!item.firstName && !item.lastName ? item.email : ""}
              </Text>
              {item.email && item.firstName && (
                <Text style={styles.userEmail}>{item.email}</Text>
              )}
              <View style={styles.badgeRow}>
                <View style={[styles.badge, { backgroundColor: item.role === "admin" ? colors.accent : colors.border }]}>
                  <Text style={[styles.badgeText, { color: item.role === "admin" ? "#fff" : colors.text }]}>{item.role}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: item.isActive ? "#22c55e" : "#ef4444" }]}>
                  <Text style={styles.badgeText}>{item.isActive ? "Active" : "Suspended"}</Text>
                </View>
              </View>
            </View>
            <View style={styles.userActions}>
              <TouchableOpacity onPress={() => handleToggleRole(item)} hitSlop={8}>
                <Feather name="shield" size={18} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleToggleActive(item)} hitSlop={8}>
                <Feather name={item.isActive ? "pause-circle" : "play-circle"} size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(item)} hitSlop={8}>
                <Feather name="trash-2" size={18} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function ExportTab({ colors, styles }: { colors: ThemeColors; styles: AdminStyles }) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleExport = async (type: string, format: string) => {
    setLoading(`${type}-${format}`);
    try {
      const res = await apiFetch(`/admin/export/${type}?format=${format}`);
      const content = format === "csv" ? await res.text() : JSON.stringify(await res.json(), null, 2);
      const filename = `${type}_export.${format}`;

      if (Platform.OS === "web") {
        const blob = new Blob([content], { type: format === "csv" ? "text/csv" : "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert("Export Complete", `${type} exported as ${format.toUpperCase()}.`);
      } else {
        const fileUri = `${FileSystem.cacheDirectory}${filename}`;
        await FileSystem.writeAsStringAsync(fileUri, content);
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: format === "csv" ? "text/csv" : "application/json",
            dialogTitle: `Share ${type} export`,
          });
        } else {
          Alert.alert("Export Saved", `File saved to ${fileUri}`);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Export failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(null);
    }
  };

  const exportTypes = [
    { type: "leads", icon: "trending-up" as const, label: "Leads" },
    { type: "contacts", icon: "users" as const, label: "Contacts" },
    { type: "activities", icon: "activity" as const, label: "Activities" },
  ];

  return (
    <ScrollView contentContainerStyle={styles.exportContent}>
      {exportTypes.map((item) => (
        <View key={item.type} style={styles.exportCard}>
          <View style={styles.exportHeader}>
            <Feather name={item.icon} size={20} color={colors.accent} />
            <Text style={styles.exportLabel}>{item.label}</Text>
          </View>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport(item.type, "json")}
              disabled={!!loading}
            >
              {loading === `${item.type}-json` ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.exportButtonText}>JSON</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport(item.type, "csv")}
              disabled={!!loading}
            >
              {loading === `${item.type}-csv` ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={styles.exportButtonText}>CSV</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ImportTab({ colors, styles }: { colors: ThemeColors; styles: AdminStyles }) {
  const [importType, setImportType] = useState<"leads" | "contacts">("leads");
  const [jsonInput, setJsonInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);

  const parseCSV = (csvText: string): Record<string, string>[] => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    return lines.slice(1).map(line => {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = values[i] || "";
      });
      return obj;
    });
  };

  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/json", "text/csv", "text/comma-separated-values"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setPickedFileName(asset.name);

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const text = await response.text();
        setJsonInput(text);
      } else {
        const text = await FileSystem.readAsStringAsync(asset.uri);
        setJsonInput(text);
      }
    } catch {
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const handleImport = async () => {
    if (!jsonInput.trim()) {
      Alert.alert("Error", "Please paste data or pick a file to import");
      return;
    }

    let data: Record<string, string | boolean | number>[];
    const trimmed = jsonInput.trim();

    if (trimmed.startsWith("[")) {
      try {
        data = JSON.parse(trimmed);
        if (!Array.isArray(data)) {
          Alert.alert("Error", "Data must be a JSON array");
          return;
        }
      } catch {
        Alert.alert("Error", "Invalid JSON format");
        return;
      }
    } else {
      data = parseCSV(trimmed);
      if (data.length === 0) {
        Alert.alert("Error", "CSV must have a header row and at least one data row");
        return;
      }
    }

    setLoading(true);
    try {
      const res = await apiFetch(`/admin/import/${importType}`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
      const result: { imported: number } = await res.json();
      Alert.alert("Import Complete", `Successfully imported ${result.imported} ${importType}.`);
      setJsonInput("");
      setPickedFileName(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      Alert.alert("Error", message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.exportContent}>
      <View style={styles.importTypeRow}>
        <TouchableOpacity
          style={[styles.importTypeButton, importType === "leads" && styles.importTypeActive]}
          onPress={() => setImportType("leads")}
        >
          <Text style={[styles.importTypeText, importType === "leads" && styles.importTypeTextActive]}>Leads</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.importTypeButton, importType === "contacts" && styles.importTypeActive]}
          onPress={() => setImportType("contacts")}
        >
          <Text style={[styles.importTypeText, importType === "contacts" && styles.importTypeTextActive]}>Contacts</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.filePickerButton} onPress={handleFilePick}>
        <Feather name="upload" size={18} color={colors.accent} />
        <Text style={styles.filePickerText}>
          {pickedFileName || "Pick a JSON or CSV file"}
        </Text>
      </TouchableOpacity>

      <Text style={styles.filePickerHint}>
        Or paste JSON / CSV data below:
      </Text>

      <Text style={styles.importHint}>
        Each record should include at minimum a "name" field for {importType}.
      </Text>

      <TextInput
        style={styles.jsonInput}
        placeholder={`[{"name": "John Doe", "email": "john@example.com"}]`}
        placeholderTextColor={colors.textTertiary}
        value={jsonInput}
        onChangeText={(text) => { setJsonInput(text); setPickedFileName(null); }}
        multiline
        numberOfLines={8}
        textAlignVertical="top"
      />

      <TouchableOpacity
        style={styles.importButton}
        onPress={handleImport}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.importButtonText}>Import {importType}</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const createStyles = (colors: ThemeColors): AdminStyles => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    fontFamily: "LeagueSpartan_700Bold",
  },
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: "#fff",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    margin: 16,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  userEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: "SpaceGrotesk_400Regular",
    marginTop: 2,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "SpaceGrotesk_500Medium",
    color: "#fff",
  },
  userActions: {
    flexDirection: "row",
    gap: 12,
  },
  exportContent: {
    padding: 16,
    gap: 12,
  },
  exportCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exportHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  exportLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  exportButtons: {
    flexDirection: "row",
    gap: 10,
  },
  exportButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.accent,
  },
  exportButtonText: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  importTypeRow: {
    flexDirection: "row",
    gap: 8,
  },
  importTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  importTypeActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + "15",
  },
  importTypeText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.textSecondary,
  },
  importTypeTextActive: {
    color: colors.accent,
  },
  importHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: "SpaceGrotesk_400Regular",
  },
  jsonInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    color: colors.text,
    fontFamily: "SpaceGrotesk_400Regular",
    minHeight: 160,
  },
  importButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
    fontFamily: "LeagueSpartan_600SemiBold",
  },
  filePickerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    backgroundColor: colors.surface,
  },
  filePickerText: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: "SpaceGrotesk_500Medium",
  },
  filePickerHint: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
});
