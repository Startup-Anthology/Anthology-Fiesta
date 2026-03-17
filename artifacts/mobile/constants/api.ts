export function getServerBaseUrl(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) {
    return `https://${domain}`;
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl;
  }
  return "http://localhost:8080";
}

export function getApiBaseUrl(): string {
  return `${getServerBaseUrl()}/api`;
}
