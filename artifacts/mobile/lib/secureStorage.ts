import { Platform } from "react-native";

/**
 * Platform-aware secure storage.
 * - Native (iOS/Android): uses expo-secure-store (encrypted keychain/keystore)
 * - Web: uses localStorage (the stored value is the session ID, same as the httpOnly cookie)
 */

export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(key);
  }
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(key, value);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(key);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(key);
}
