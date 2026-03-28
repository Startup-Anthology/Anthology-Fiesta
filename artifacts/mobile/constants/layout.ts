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

  // Shadow/elevation tokens
  // shadow* props are translated to CSS box-shadow by react-native-web (deprecated path).
  // boxShadow is provided explicitly for forward compatibility.
  shadow: {
    sm: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
      ...Platform.select({ web: { boxShadow: "0px 1px 3px rgba(0,0,0,0.05)" }, default: {} }),
    },
    md: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.10,
      shadowRadius: 6,
      elevation: 3,
      ...Platform.select({ web: { boxShadow: "0px 2px 6px rgba(0,0,0,0.10)" }, default: {} }),
    },
    lg: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 6,
      ...Platform.select({ web: { boxShadow: "0px 4px 12px rgba(0,0,0,0.14)" }, default: {} }),
    },
    fab: {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.20,
      shadowRadius: 10,
      elevation: 8,
      ...Platform.select({ web: { boxShadow: "0px 4px 10px rgba(0,0,0,0.20)" }, default: {} }),
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
