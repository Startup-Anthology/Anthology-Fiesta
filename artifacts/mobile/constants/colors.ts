export type ThemeColors = {
  primary: string;
  primaryLight: string;
  onPrimary: string;
  accent: string;
  accentLight: string;
  background: string;
  surface: string;
  surfaceSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  statusNew: string;
  statusContacted: string;
  statusInterested: string;
  statusEngaged: string;
  statusConverted: string;
  priorityHigh: string;
  priorityMedium: string;
  priorityLow: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

const shared = {
  accent: "#BB935B",
  accentLight: "#D4B17A",
  success: "#10B981",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",
  statusNew: "#6366F1",
  statusContacted: "#3B82F6",
  statusInterested: "#F59E0B",
  statusEngaged: "#F97316",
  statusConverted: "#10B981",
  priorityHigh: "#EF4444",
  priorityMedium: "#F59E0B",
  priorityLow: "#767676",
};

export const lightColors: ThemeColors = {
  primary: "#000000",
  primaryLight: "#333333",
  onPrimary: "#FFFFFF",
  ...shared,
  background: "#FFFFFF",
  surface: "#F8F8F8",
  surfaceSecondary: "#F0F0F0",
  text: "#000000",
  textSecondary: "#666666",
  textTertiary: "#767676",
  border: "#E5E5E5",
  borderLight: "#F0F0F0",
  tabIconDefault: "#767676",
  tabIconSelected: "#000000",
};

export const darkColors: ThemeColors = {
  primary: "#FFFFFF",
  primaryLight: "#CCCCCC",
  onPrimary: "#000000",
  ...shared,
  background: "#121212",
  surface: "#1E1E1E",
  surfaceSecondary: "#2A2A2A",
  text: "#F0F0F0",
  textSecondary: "#A0A0A0",
  textTertiary: "#707070",
  border: "#333333",
  borderLight: "#2A2A2A",
  tabIconDefault: "#707070",
  tabIconSelected: "#FFFFFF",
};

const colors = {
  ...lightColors,
  light: {
    text: lightColors.text,
    background: lightColors.background,
    tint: lightColors.primary,
    tabIconDefault: lightColors.tabIconDefault,
    tabIconSelected: lightColors.tabIconSelected,
  },
};

export default colors;
