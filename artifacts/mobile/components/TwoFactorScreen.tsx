import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { useAuth, getAuthToken } from "@/lib/auth";
import { Feather } from "@expo/vector-icons";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

function getApiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_DOMAIN) {
    return `https://${process.env.EXPO_PUBLIC_DOMAIN}`;
  }
  return "";
}

export function TwoFactorScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { twoFactorStatus, refreshTwoFactorStatus, logout } = useAuth();

  const [mode, setMode] = useState<"choose" | "totp-setup" | "totp-verify" | "email-verify" | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const isEnrolled = twoFactorStatus?.enrolled;
  const enrolledMethod = twoFactorStatus?.method;

  const currentMode = mode || (isEnrolled && enrolledMethod === "totp" ? "totp-verify" : isEnrolled && enrolledMethod === "email" ? "email-verify" : "choose");

  const enrollTotp = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/2fa/totp/enroll`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Failed to enroll");
        return;
      }
      setTotpUri(data.uri);
      setTotpSecret(data.secret);
      setMode("totp-setup");
    } catch {
      Alert.alert("Error", "Failed to start TOTP setup");
    } finally {
      setLoading(false);
    }
  };

  const verifyTotp = async () => {
    if (!code || code.length !== 6) {
      Alert.alert("Invalid code", "Please enter a 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/2fa/totp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Verification failed");
        return;
      }
      await refreshTwoFactorStatus();
    } catch {
      Alert.alert("Error", "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const sendEmailCode = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/2fa/email/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Failed to send code");
        return;
      }
      setMode("email-verify");
    } catch {
      Alert.alert("Error", "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyEmailCode = async () => {
    if (!code || code.length !== 6) {
      Alert.alert("Invalid code", "Please enter a 6-digit code");
      return;
    }
    setLoading(true);
    try {
      const token = await getAuthToken();
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/2fa/email/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Error", data.error || "Verification failed");
        return;
      }
      await refreshTwoFactorStatus();
    } catch {
      Alert.alert("Error", "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Admin Verification</Text>
        <Text style={styles.subtitle}>
          Two-factor authentication is required for admin access.
        </Text>

        {currentMode === "choose" && (
          <View style={styles.optionsContainer}>
            <TouchableOpacity
              style={styles.optionButton}
              onPress={enrollTotp}
              disabled={loading}
            >
              <Text style={styles.optionIcon}>🔐</Text>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Authenticator App</Text>
                <Text style={styles.optionDesc}>Use Google Authenticator or similar</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.optionButton}
              onPress={sendEmailCode}
              disabled={loading}
            >
              <Text style={styles.optionIcon}>📧</Text>
              <View style={styles.optionTextContainer}>
                <Text style={styles.optionTitle}>Email Code</Text>
                <Text style={styles.optionDesc}>Receive a one-time code via email</Text>
              </View>
            </TouchableOpacity>

            {loading && <ActivityIndicator style={{ marginTop: 16 }} color={colors.accent} />}
          </View>
        )}

        {currentMode === "totp-setup" && (
          <View style={styles.setupContainer}>
            <Text style={styles.setupLabel}>
              Scan this QR code with your authenticator app:
            </Text>
            {totpUri && Platform.OS !== "web" ? (
              <View style={styles.qrContainer}>
                <QRCode value={totpUri} size={200} backgroundColor="#FFFFFF" color="#000000" />
              </View>
            ) : totpUri ? (
              <View style={styles.qrContainer}>
                <Text style={styles.setupLabel}>
                  QR code scanning is not available on web. Use the secret below:
                </Text>
              </View>
            ) : null}
            <Text style={styles.manualEntryLabel}>
              Or enter this secret manually:
            </Text>
            <View style={styles.secretBox}>
              <Text style={styles.secretText} selectable>{totpSecret}</Text>
            </View>
            <Text style={styles.setupLabel}>
              Then enter the 6-digit code from your authenticator:
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={colors.textTertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={verifyTotp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMode("choose"); setCode(""); }}>
              <Text style={styles.backText}>Choose a different method</Text>
            </TouchableOpacity>
          </View>
        )}

        {currentMode === "totp-verify" && (
          <View style={styles.setupContainer}>
            <Text style={styles.setupLabel}>
              Enter the 6-digit code from your authenticator app:
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={colors.textTertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={verifyTotp}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {currentMode === "email-verify" && (
          <View style={styles.setupContainer}>
            <Text style={styles.setupLabel}>
              A verification code has been sent to your email. Enter it below:
            </Text>
            <TextInput
              style={styles.codeInput}
              placeholder="000000"
              placeholderTextColor={colors.textTertiary}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
            />
            <TouchableOpacity
              style={styles.verifyButton}
              onPress={verifyEmailCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={sendEmailCode} disabled={loading}>
              <Text style={styles.backText}>Resend code</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMode("choose"); setCode(""); }}>
              <Text style={styles.backText}>Choose a different method</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            Alert.alert("Log out?", "You'll need to sign in again.", [
              { text: "Stay", style: "cancel" },
              { text: "Log Out", style: "destructive", onPress: () => logout() },
            ]);
          }}
        >
          <Feather name="log-out" size={16} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.primary,
    fontFamily: "Lato_700Bold",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: "Montserrat_500Medium",
    textAlign: "center",
    marginBottom: 32,
  },
  optionsContainer: {
    gap: 16,
  },
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  optionIcon: {
    fontSize: 28,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
  optionDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: "SpaceGrotesk_400Regular",
    marginTop: 2,
  },
  setupContainer: {
    alignItems: "center",
    gap: 16,
  },
  setupLabel: {
    fontSize: 15,
    color: colors.text,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
  qrContainer: {
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  manualEntryLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: "SpaceGrotesk_400Regular",
    textAlign: "center",
  },
  secretBox: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    width: "100%",
  },
  secretText: {
    fontSize: 14,
    fontFamily: "SpaceGrotesk_500Medium",
    color: colors.accent,
    textAlign: "center",
    letterSpacing: 1,
  },
  codeInput: {
    width: 200,
    height: 56,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    fontSize: 24,
    color: colors.text,
    fontFamily: "SpaceGrotesk_600SemiBold",
    backgroundColor: colors.surface,
    letterSpacing: 8,
  },
  verifyButton: {
    width: "100%",
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
  },
  verifyButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "LeagueSpartan_600SemiBold",
  },
  backText: {
    fontSize: 14,
    color: colors.accent,
    fontFamily: "SpaceGrotesk_500Medium",
    textAlign: "center",
  },
  logoutButton: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 8,
    marginTop: 40,
    paddingVertical: 12,
  },
  logoutText: {
    fontSize: 15,
    color: colors.error,
    fontFamily: "SpaceGrotesk_600SemiBold",
  },
});
