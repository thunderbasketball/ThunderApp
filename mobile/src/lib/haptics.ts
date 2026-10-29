// One place for the app's haptics, so every screen feels the same.
// Failures are ignored: a phone without haptics (or with them turned off) still works normally.
import * as Haptics from 'expo-haptics';

const quiet = (p: Promise<void>) => p.catch(() => {});

export const haptic = {
  // A button press.
  tap: () => quiet(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  // Moving between choices: tabs, toggles, check-in ? → ✓ → ✗.
  select: () => quiet(Haptics.selectionAsync()),
  // Something worked: logged in, saved, booked.
  success: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  // Something was refused: wrong PIN, booking limit, error.
  error: () => quiet(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
