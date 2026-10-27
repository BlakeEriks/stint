import { Pressable, StyleSheet, Text, View } from 'react-native';
import { text, useColors } from '../theme.ts';

/** A client's color, or the hollow ring of a client with none. */
export function Swatch({
  color,
  size = 10,
}: {
  color: string | null;
  size?: number;
}) {
  const c = useColors();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        ...(color
          ? { backgroundColor: color }
          : { borderWidth: 1.5, borderColor: c['text-subtle'] }),
      }}
    />
  );
}

/** The lockup: the wordmark between its two bounds, as the web draws it. */
export function Wordmark({ large = false }: { large?: boolean }) {
  const c = useColors();
  const role = large ? 'wordmark' : 'wordmark-small';
  const size = text(role).fontSize ?? 14;
  const bound = {
    width: Math.max(1.5, size * 0.09),
    height: size * 1.05,
    borderRadius: 999,
    backgroundColor: c['text-strong'],
  };
  return (
    <View
      style={[styles.row, { gap: size * 0.18 }]}
      accessible
      accessibilityRole="header"
      accessibilityLabel="Stint"
    >
      <View style={bound} />
      <Text style={[text(role), { color: c['text-strong'] }]}>STINT</Text>
      <View style={bound} />
    </View>
  );
}

export interface NoticeProps {
  message: string;
  tone: 'error' | 'warning';
  onDismiss?: () => void;
  action?: { label: string; onPress: () => void };
}

/** Why something didn't take, under the header (Constitution VI). */
export function Notice({ message, tone, onDismiss, action }: NoticeProps) {
  const c = useColors();
  const error = tone === 'error';
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.notice,
        {
          backgroundColor: error ? c['danger-muted'] : c['warning-muted'],
          borderColor: error ? c.danger : c.warning,
        },
      ]}
    >
      <Text style={[text('support'), styles.grow, { color: c['text-strong'] }]}>
        {message}
      </Text>
      {action && (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          hitSlop={12}
        >
          <Text style={[text('control'), { color: c['text-strong'] }]}>
            {action.label}
          </Text>
        </Pressable>
      )}
      {onDismiss && (
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={12}
        >
          <Text style={[text('control'), { color: c['text-muted'] }]}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

export const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
});
