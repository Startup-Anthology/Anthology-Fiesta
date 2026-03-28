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
  primary: "#0f172a",
  primaryLight: "#1e293b",
  onPrimary: "#FFFFFF",
  ...shared,
  background: "#f5f8fc",
  surface: "#ffffff",
  surface2: "#f0f3f7",
  surface3: "#dde3ed",
  surfaceSecondary: "#f0f3f7",
  pressed: "#dde3ed",
  disabled: "#f0f3f7",
  focused: "#BB935B26",
  text: "#0f172a",
  textSecondary: "#606a7e",
  textTertiary: "#7a8599",
  textDisabled: "#b0bec5",
  border: "#dde3ed",
  borderLight: "#e8edf5",
  tabIconDefault: "#7a8599",
  tabIconSelected: "#0f172a",
};

export const darkColors: ThemeColors = {
  primary: "#f5f8fc",
  primaryLight: "#cbd5e1",
  onPrimary: "#0f172a",
  ...shared,
  background: "#0b0f1a",
  surface: "#0f172a",
  surface2: "#172033",
  surface3: "#1f2937",
  surfaceSecondary: "#172033",
  pressed: "#1f2937",
  disabled: "#0f172a",
  focused: "#BB935B33",
  text: "#f5f8fc",
  textSecondary: "#94a3b8",
  textTertiary: "#64748b",
  textDisabled: "#475569",
  border: "#1f2937",
  borderLight: "#172033",
  tabIconDefault: "#64748b",
  tabIconSelected: "#f5f8fc",
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
