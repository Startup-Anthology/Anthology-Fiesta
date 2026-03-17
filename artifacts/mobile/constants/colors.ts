export type ThemeColors = {
  primary: string;
  primaryLight: string;
  onPrimary: string;
  accent: string;
  accentLight: string;
  background: string;
  // Surface elevation levels
  surface: string;       // surface1 — cards, list items
  surface2: string;      // modals, popovers
  surface3: string;      // tooltips, floating elements
  surfaceSecondary: string; // legacy alias for surface2
  // Interactive states
  pressed: string;
  disabled: string;
  focused: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
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
  surface2: "#F0F0F0",
  surface3: "#E8E8E8",
  surfaceSecondary: "#F0F0F0",
  pressed: "#E8E8E8",
  disabled: "#F0F0F0",
  focused: "#BB935B26",
  text: "#000000",
  textSecondary: "#666666",
  textTertiary: "#767676",
  textDisabled: "#B0B0B0",
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
  surface2: "#252525",
  surface3: "#2E2E2E",
  surfaceSecondary: "#2A2A2A",
  pressed: "#2A2A2A",
  disabled: "#1E1E1E",
  focused: "#BB935B33",
  text: "#F0F0F0",
  textSecondary: "#A0A0A0",
  textTertiary: "#8E8E8E",
  textDisabled: "#555555",
  border: "#333333",
  borderLight: "#2A2A2A",
  tabIconDefault: "#8E8E8E",
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
