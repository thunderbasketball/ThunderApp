// Shared building blocks, styled like the website: white cards, Thunder-blue buttons, red/green message boxes.
import type { ComponentRef, ReactNode, Ref } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInputProps,
} from 'react-native';

import { Colors, Spacing, Thunder, type Palette } from '@/constants/theme';
import { haptic } from '@/lib/haptics';

// A text box on screen, e.g. to focus it again after a wrong PIN.
export type TextInputHandle = ComponentRef<typeof TextInput>;

export function usePalette(): Palette {
  return Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
}

export function Card({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>{children}</View>;
}

export function Heading({ title, intro }: { title: string; intro?: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={[styles.heading, { color: c.text }]}>{title}</Text>
      {intro ? <Text style={[styles.body, { color: c.textSecondary }]}>{intro}</Text> : null}
    </View>
  );
}

export function Field({
  label,
  spaced,
  style,
  ref,
  ...props
}: TextInputProps & { label: string; spaced?: boolean; ref?: Ref<TextInputHandle> }) {
  const c = usePalette();
  return (
    <View style={{ gap: Spacing.one }}>
      <Text style={[styles.label, { color: c.textSecondary }]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={c.textSecondary}
        style={[
          styles.input,
          { color: c.text, backgroundColor: c.card, borderColor: c.border },
          spaced && { letterSpacing: 8 },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

export function Button({ title, onPress, busy, disabled }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  const off = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? Thunder.blueDark : Thunder.blue, opacity: off ? 0.5 : 1 },
      ]}
    >
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

export function LinkButton({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  const c = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
    >
      {({ pressed }) => (
        <Text style={[styles.body, { color: c.link, opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Banner({ kind, text }: { kind: 'error' | 'notice'; text: string }) {
  const c = usePalette();
  const bg = kind === 'error' ? c.errorBg : c.noticeBg;
  const fg = kind === 'error' ? c.errorText : c.noticeText;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={[styles.small, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four - 4,
    gap: Spacing.three,
  },
  heading: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  small: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 18,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  banner: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: 12 },
});
