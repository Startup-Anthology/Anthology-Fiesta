import React, { useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { type ThemeColors } from "@/constants/colors";
import { useTheme } from "@/lib/theme";

const saLogoBlack = require("@/assets/images/sa-logo-black.png");

export function LoginScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { login, isLoading } = useAuth();

  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleLogin = async () => {
    setIsSubmitting(true);
    try {
      await login();
    } catch {
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Image source={saLogoBlack} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.title}>Fiesta</Text>
          <Text style={styles.subtitle}>
            Your relationships. Your pipeline. One place.
          </Text>
        </View>

        <View style={styles.features}>
          <FeatureItem icon="📊" text="See your full pipeline, clearly" colors={colors} />
          <FeatureItem icon="👥" text="Know who to follow up with and when" colors={colors} />
          <FeatureItem icon="📧" text="Reach out without the busywork" colors={colors} />
          <FeatureItem icon="🎯" text="Track what matters to your launch" colors={colors} />
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleLogin}
          disabled={isSubmitting || isLoading}
          activeOpacity={0.8}
        >
          {isSubmitting || isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Log In</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footerText}>
          Built for founders doing the work.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function FeatureItem({ icon, text, colors }: { icon: string; text: string; colors: ThemeColors }) {
  return (
    <View style={featureStyles.featureItem}>
      <Text style={featureStyles.featureIcon}>{icon}</Text>
      <Text style={[featureStyles.featureText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  featureIcon: {
    fontSize: 20,
  },
  featureText: {
    fontSize: 15,
    fontFamily: "SpaceGrotesk_500Medium",
  },
});

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
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
    width: 100,
    height: 100,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.primary,
    fontFamily: "Lato_700Bold",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    fontFamily: "Montserrat_500Medium",
    textAlign: "center",
  },
  features: {
    width: "100%",
    marginBottom: 32,
    gap: 16,
  },
  submitButton: {
    width: "100%",
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    height: 56,
    marginBottom: 12,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
    fontFamily: "LeagueSpartan_600SemiBold",
  },
  footerText: {
    marginTop: 16,
    fontSize: 13,
    color: colors.textTertiary,
    fontFamily: "Montserrat_400Regular",
  },
});
