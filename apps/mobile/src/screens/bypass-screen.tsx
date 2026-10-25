import { radius } from '@stint/design-tokens';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { text, useColors } from '../theme.ts';
import { Wordmark } from './parts.tsx';

export interface BypassScreenProps {
  /** The PR this build is for, as the header names it. */
  label: string;
  /** Why the last one could not be kept. */
  error: string | null;
  onSave: (bypass: string) => void;
}

/**
 * A preview build's first screen, once per phone: the Vercel bypass that
 * lets it reach the PR's protected preview, typed in rather than shipped in
 * the build (`bypass.ts`).
 */
export function BypassScreen({ label, error, onSave }: BypassScreenProps) {
  const c = useColors();
  const [value, setValue] = useState('');
  const live = value.trim().length > 0;
  const save = () => live && onSave(value);
  return (
    <View style={[s.screen, { backgroundColor: c['bg-base'] }]}>
      <View style={s.stack}>
        <View style={s.lockup}>
          <Wordmark large />
          <Text style={[text('meta'), { color: c.warning }]}>{label}</Text>
        </View>
        <Text style={[text('body'), { color: c['text-muted'] }]}>
          This preview build reaches its PR through Vercel’s Protection Bypass
          for Automation. Paste it once; the next preview build finds it. If it
          is rotated, this asks again.
        </Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={save}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          accessibilityLabel="Vercel bypass"
          style={[
            text('body'),
            s.field,
            {
              color: c['text-strong'],
              backgroundColor: c['bg-primary'],
              borderColor: c['border-default'],
            },
          ]}
        />
        {error && (
          <Text
            accessibilityRole="alert"
            style={[text('support'), { color: c.danger }]}
          >
            {error}
          </Text>
        )}
        <Pressable
          onPress={save}
          disabled={!live}
          aria-disabled={!live}
          accessibilityRole="button"
          style={[
            s.button,
            { backgroundColor: live ? c['accent-default'] : c['bg-active'] },
          ]}
        >
          <Text
            style={[
              text('heading'),
              { color: live ? c['text-on-accent'] : c['text-muted'] },
            ]}
          >
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  stack: { gap: 12, paddingHorizontal: 20, paddingBottom: 80 },
  lockup: { alignItems: 'center', gap: 8, marginBottom: 12 },
  field: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  button: { borderRadius: 12, padding: 15, alignItems: 'center' },
});
