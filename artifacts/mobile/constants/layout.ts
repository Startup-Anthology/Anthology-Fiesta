import { Platform } from "react-native";

const layout = {
  // Existing tokens (unchanged — screens depend on these)
  screenPadding: 24,
  cardRadius: 12,
  cardPadding: 16,
  sectionSpacing: 28,
  cardGap: 10,
  fabElevation: 6,
  inputRadius: 6,
  chipRadius: 9999,
  badgeRadius: 3,

  // Spacing scale
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    "3xl": 48,
  },

  // Shadow/elevation tokens — aligned to Startup Anthology brand guide shadow scale.
  // Web uses CSS custom properties (--shadow-*) so dark mode can scale opacity via
  // prefers-color-scheme in +html.tsx without needing theme context here.
  shadow: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.10,
      shadowRadius: 3,
      elevation: 1,
      ...Platform.select({ web: { boxShadow: "var(--shadow-sm)" }, default: {} }),
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 6,
      elevation: 3,
      ...Platform.select({ web: { boxShadow: "var(--shadow-md)" }, default: {} }),
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.10,
      shadowRadius: 15,
      elevation: 6,
      ...Platform.select({ web: { boxShadow: "var(--shadow-lg)" }, default: {} }),
    },
    fab: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 10,
      elevation: 8,
      ...Platform.select({ web: { boxShadow: "var(--shadow-fab)" }, default: {} }),
    },
  },

  // Motion constants
  motion: {
    duration: {
      fast: 150,
      normal: 250,
      slow: 400,
    },
    easing: {
      standard: "ease-in-out" as const,
      decelerate: "ease-out" as const,
      accelerate: "ease-in" as const,
    },
  },
};

export default layout;
