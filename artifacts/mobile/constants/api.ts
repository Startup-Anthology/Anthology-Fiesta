import { Platform } from "react-native";

export function getServerBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}`;
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl;
  }
  // Web production: same-origin (relative URLs) — API is served by the same Express server
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return "";
  }
  return "http://localhost:8080";
}

export function getApiBaseUrl(): string {
  return `${getServerBaseUrl()}/api`;
}
