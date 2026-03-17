import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginScreen } from "@/components/LoginScreen";
import { OfflineBanner } from "@/components/OfflineBanner";
import { TwoFactorScreen } from "@/components/TwoFactorScreen";
import { ThemeProvider } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
    },
  },
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
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

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
                <AuthProvider>
                  <AuthGate>
                    <RootLayoutNav />
                  </AuthGate>
                </AuthProvider>
              </ThemeProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
