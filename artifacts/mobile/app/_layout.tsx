import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from "@expo-google-fonts/hanken-grotesk";
import { Lato_400Regular, Lato_700Bold } from "@expo-google-fonts/lato";
import {
  LeagueSpartan_500Medium,
  LeagueSpartan_600SemiBold,
  LeagueSpartan_700Bold,
} from "@expo-google-fonts/league-spartan";
import {
  RobotoMono_400Regular,
  RobotoMono_500Medium,
} from "@expo-google-fonts/roboto-mono";

// On web, font assets in pnpm's node_modules are not reliably copied by
// expo export. Use static public URLs instead so fonts are always available.
const webFonts: Record<string, string> = {
  HankenGrotesk_400Regular: "/fonts/HankenGrotesk_400Regular.ttf",
  HankenGrotesk_500Medium: "/fonts/HankenGrotesk_500Medium.ttf",
  HankenGrotesk_600SemiBold: "/fonts/HankenGrotesk_600SemiBold.ttf",
  HankenGrotesk_700Bold: "/fonts/HankenGrotesk_700Bold.ttf",
  Lato_400Regular: "/fonts/Lato_400Regular.ttf",
  Lato_700Bold: "/fonts/Lato_700Bold.ttf",
  LeagueSpartan_500Medium: "/fonts/LeagueSpartan_500Medium.ttf",
  LeagueSpartan_600SemiBold: "/fonts/LeagueSpartan_600SemiBold.ttf",
  LeagueSpartan_700Bold: "/fonts/LeagueSpartan_700Bold.ttf",
  RobotoMono_400Regular: "/fonts/RobotoMono_400Regular.ttf",
  RobotoMono_500Medium: "/fonts/RobotoMono_500Medium.ttf",
  feather: "/fonts/Feather.ttf",
  "material-community": "/fonts/MaterialCommunityIcons.ttf",
};
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { OfflineBanner } from "@/components/OfflineBanner";
import { TwoFactorScreen } from "@/components/TwoFactorScreen";
import { ThemeProvider, useTheme } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
});

function WebShell({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View style={[webShellStyles.outer, { backgroundColor: colors.surface2 }]}>
      <View style={[webShellStyles.inner, { backgroundColor: colors.background, borderColor: colors.borderLight }]}>
        {children}
      </View>
    </View>
  );
}

const webShellStyles = StyleSheet.create({
  outer: { flex: 1 },
  inner: { flex: 1, maxWidth: 430, width: "100%", alignSelf: "center", borderLeftWidth: 1, borderRightWidth: 1 },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, isAdmin, is2faVerified } = useAuth();

  if (isLoading) return null;
  if (!isAuthenticated) return <LoginScreen />;
  if (isAdmin && !is2faVerified) return <TwoFactorScreen />;

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <>
      <OfflineBanner />
      <Stack screenOptions={{ headerBackTitle: "Back", headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lead/[id]" />
        <Stack.Screen name="contact/[id]" />
        <Stack.Screen name="compose-email" options={{ presentation: "modal" }} />
        <Stack.Screen name="template/[id]" options={{ presentation: "modal" }} />
        <Stack.Screen name="sequence/[id]" options={{ presentation: "modal" }} />
        <Stack.Screen name="broadcast/[id]" />
        <Stack.Screen name="broadcast/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="search" options={{ presentation: "modal" }} />
        <Stack.Screen name="comms" />
        <Stack.Screen name="files" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="settings/profile" />
        <Stack.Screen name="settings/appearance" />
        <Stack.Screen name="settings/integrations" />
        <Stack.Screen name="settings/general" />
        <Stack.Screen name="settings/triggers" />
        <Stack.Screen name="admin" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(
    Platform.OS === "web"
      ? webFonts
      : {
          HankenGrotesk_400Regular,
          HankenGrotesk_500Medium,
          HankenGrotesk_600SemiBold,
          HankenGrotesk_700Bold,
          Lato_400Regular,
          Lato_700Bold,
          LeagueSpartan_500Medium,
          LeagueSpartan_600SemiBold,
          LeagueSpartan_700Bold,
          RobotoMono_400Regular,
          RobotoMono_500Medium,
        }
  );

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <ThemeProvider>
                <WebShell>
                  <AuthProvider>
                    <AuthGate>
                      <RootLayoutNav />
                    </AuthGate>
                  </AuthProvider>
                </WebShell>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
