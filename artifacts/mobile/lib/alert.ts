import { Alert, Platform } from "react-native";

type AlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

/**
 * Cross-platform alert.
 * - Native: delegates to Alert.alert()
 * - Web: uses window.confirm() for two-button dialogs,
 *         window.alert() for single-button (informational) dialogs.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
) {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  // Web fallback
  if (!buttons || buttons.length <= 1) {
    // Informational alert — single OK button
    window.alert(message ? `${title}\n${message}` : title);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Two+ buttons — use confirm dialog
  // Convention: cancel button first, action button second (React Native pattern)
  const cancelBtn = buttons.find((b) => b.style === "cancel") ?? buttons[0];
  const actionBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[1];

  const confirmed = window.confirm(
    message ? `${title}\n\n${message}` : title,
  );
  if (confirmed) {
    actionBtn?.onPress?.();
  } else {
    cancelBtn?.onPress?.();
  }
}
