import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { type ThemeColors } from "@/constants/colors";
import Layout from "@/constants/layout";
import { useTheme } from "@/lib/theme";
import { getServerBaseUrl } from "@/constants/api";

const saLogoBlack = require("@/assets/images/sa-logo-black.png");

export function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, isLoading } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required");
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      if (mode === "register") {
        const res = await fetch(`${getServerBaseUrl()}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password, firstName: firstName.trim() || undefined, lastName: lastName.trim() || undefined }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Registration failed");
          return;
        }
        // After registering, log in
        await login(email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <Image source={saLogoBlack} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.title}>Fiesta</Text>
            <Text style={styles.subtitle}>
              Your relationships. Your pipeline. One place.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeButton, mode === "login" && styles.modeButtonActive]}
                onPress={() => { setMode("login"); setError(null); }}
              >
                <Text style={[styles.modeButtonText, mode === "login" && styles.modeButtonTextActive]}>
                  Log In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeButton, mode === "register" && styles.modeButtonActive]}
                onPress={() => { setMode("register"); setError(null); }}
              >
                <Text style={[styles.modeButtonText, mode === "register" && styles.modeButtonTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {mode === "register" && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor={colors.textTertiary}
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="First name"
                />
                <TextInput
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor={colors.textTertiary}
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                  returnKeyType="next"
                  accessibilityLabel="Last name"
                />
              </>
            )}

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              returnKeyType="next"
              accessibilityLabel="Email address"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textTertiary}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Password"
            />

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isSubmitting || isLoading}
              activeOpacity={0.92}
              accessibilityRole="button"
              accessibilityLabel={mode === "login" ? "Log in" : "Create account"}
            >
              {isSubmitting || isLoading ? (
                <ActivityIndicator color={colors.onPrimary} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === "login" ? "Log In" : "Create Account"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footerText}>
            Built for founders doing the work.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    fontFamily: "HankenGrotesk_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    fontFamily: "HankenGrotesk_500Medium",
    textAlign: "center",
  },
  form: {
    width: "100%",
    marginBottom: 24,
  },
  modeToggle: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  modeButtonActive: {
    backgroundColor: colors.background,
    ...Layout.shadow.sm,
  },
  modeButtonText: {
    fontSize: 14,
    fontFamily: "HankenGrotesk_500Medium",
    color: colors.textSecondary,
  },
  modeButtonTextActive: {
    color: colors.text,
    fontFamily: "HankenGrotesk_600SemiBold",
  },
  input: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    fontFamily: "HankenGrotesk_400Regular",
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  errorText: {
    color: colors.error,
    fontSize: 13,
    fontFamily: "HankenGrotesk_400Regular",
    marginBottom: 12,
    textAlign: "center",
  },
  submitButton: {
    width: "100%",
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    marginTop: 4,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.onPrimary,
    fontFamily: "HankenGrotesk_600SemiBold",
  },
  footerText: {
    marginTop: 16,
    fontSize: 13,
    color: colors.textTertiary,
    fontFamily: "HankenGrotesk_400Regular",
  },
});
