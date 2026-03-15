import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("pdf")) return "file-text";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "grid";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "monitor";
  if (mimeType.includes("word") || mimeType.includes("document")) return "file-text";
  return "file";
}

export default function FilesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: files = [], isLoading } = useQuery({
    queryKey: ["files"],
    queryFn: () => api.getFiles(),
  });

  const uploadMut = useMutation({
    mutationFn: async () => {
      const result = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true });
      if (result.canceled) throw new Error("CANCELLED");
      const asset = result.assets[0];
      return api.uploadFile(asset.uri, asset.name, asset.mimeType || "application/octet-stream");
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["files"] });
    },
    onError: (err: any) => {
      if (err.message === "CANCELLED") return;
      Alert.alert("Upload failed", err.message);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => api.deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["files"] }),
  });

  const renderItem = ({ item }: { item: any }) => (
    <View style={[styles.fileCard, { backgroundColor: colors.surface }]}>
      <View style={[styles.fileIconWrap, { backgroundColor: colors.info + "15" }]}>
        <Feather name={getFileIcon(item.mimeType) as any} size={20} color={colors.info} />
      </View>
      <View style={styles.fileInfo}>
        <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[styles.fileMeta, { color: colors.textTertiary }]}>{formatSize(item.size)} · {new Date(item.createdAt).toLocaleDateString()}</Text>
      </View>
      <Pressable
        onPress={() => Alert.alert("Delete file?", item.name, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(item.id) },
        ])}
        hitSlop={8}
      >
        <Feather name="trash-2" size={18} color={colors.error} />
      </Pressable>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad, backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]}>File Library</Text>
        <Pressable style={[styles.uploadBtn, { backgroundColor: colors.primary }]} onPress={() => uploadMut.mutate()} disabled={uploadMut.isPending}>
          {uploadMut.isPending ? (
            <ActivityIndicator size="small" color={colors.onPrimary} />
          ) : (
            <>
              <Feather name="upload" size={16} color={colors.onPrimary} />
              <Text style={[styles.uploadText, { color: colors.onPrimary }]}>Upload</Text>
            </>
          )}
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : files.length === 0 ? (
        <View style={styles.center}>
          <Feather name="folder" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No files yet</Text>
          <Text style={[styles.emptySubtext, { color: colors.textTertiary }]}>Upload pitch decks, one-pagers, and more</Text>
        </View>
      ) : (
        <FlatList
          data={files}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 22, fontFamily: "LeagueSpartan_700Bold" },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  uploadText: { fontSize: 14, fontFamily: "SpaceGrotesk_600SemiBold", color: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 8 },
  emptyText: { fontSize: 16, fontFamily: "LeagueSpartan_600SemiBold" },
  emptySubtext: { fontSize: 14, fontFamily: "SpaceGrotesk_400Regular" },
  list: { padding: 16 },
  fileCard: { flexDirection: "row", alignItems: "center", borderRadius: 12, padding: 14, marginBottom: 8, gap: 12 },
  fileIconWrap: { width: 40, height: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  fileInfo: { flex: 1 },
  fileName: { fontSize: 14, fontFamily: "SpaceGrotesk_500Medium" },
  fileMeta: { fontSize: 12, fontFamily: "SpaceGrotesk_400Regular", marginTop: 2 },
});
