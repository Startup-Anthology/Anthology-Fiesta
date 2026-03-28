import { Platform } from "react-native";

export interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 * Pick a document file.
 * - Web: uses a hidden <input type="file">
 * - Native: delegates to expo-document-picker
 */
export async function pickFile(options?: {
  type?: string[];
}): Promise<PickedFile | null> {
  if (Platform.OS === "web") {
    return pickFileWeb(options?.type?.join(","));
  }
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    type: options?.type ?? ["*/*"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.name,
    mimeType: asset.mimeType ?? "application/octet-stream",
  };
}

/**
 * Pick an image.
 * - Web: uses a hidden <input type="file" accept="image/*">
 * - Native: delegates to expo-image-picker
 */
export async function pickImage(): Promise<PickedFile | null> {
  if (Platform.OS === "web") {
    return pickFileWeb("image/*");
  }
  const ImagePicker = await import("expo-image-picker");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const name = asset.uri.split("/").pop() ?? "image.jpg";
  return {
    uri: asset.uri,
    name,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
}

function pickFileWeb(accept?: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    if (accept) input.accept = accept;
    input.style.display = "none";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      if (!file) {
        resolve(null);
        return;
      }
      const uri = URL.createObjectURL(file);
      resolve({
        uri,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
      });
    });
    input.addEventListener("cancel", () => {
      document.body.removeChild(input);
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}
