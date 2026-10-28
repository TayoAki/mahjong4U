import * as Haptics from 'expo-haptics';

/** A happy buzz for big moments (the confetti is drawn by the screen). */
export function celebrateHaptic(): void {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
