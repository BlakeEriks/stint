import { radius } from '@stint/design-tokens';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { text, useColors } from '../theme.ts';
import { Wordmark } from './parts.tsx';

export interface SignInScreenProps {
  /** Null until a code is sent; then the address it went to. */
  sentTo: string | null;
  error: string | null;
  /** A send or a check is with the server: the button says so. */
  pending: boolean;
  onSend: (email: string) => void;
  onVerify: (code: string) => void;
  onDifferentEmail: () => void;
}

/**
 * The macOS panel's two steps, full screen
 * (`specs/012-mobile-timer/design/sign-in.html`): an email, then the
 * six-digit code it sends. The code field has no placeholder: `000000`
 * reads as a value in a digits-only field.
 */
export function SignInScreen(props: SignInScreenProps) {
  const c = useColors();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const digits = code.replace(/\D/g, '');
  const ready = props.sentTo ? digits.length === 6 : email.includes('@');
  const live = ready && !props.pending;

  const submit = () => {
    if (!live) return;
    if (props.sentTo) props.onVerify(digits);
    else props.onSend(email.trim());
  };

  const label = props.sentTo
    ? props.pending
      ? 'Signing in…'
      : 'Sign in'
    : props.pending
      ? 'Sending…'
      : 'Email me a code';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[s.screen, { backgroundColor: c['bg-base'] }]}
    >
      <View style={s.stack}>
        <View style={s.lockup}>
          <Wordmark large />
        </View>
        <Text style={[text('body'), { color: c['text-muted'] }]}>
          {props.sentTo
            ? `Sent to ${props.sentTo}.`
            : 'We’ll email you a six-digit code.'}
        </Text>
        {props.sentTo ? (
          <TextInput
            key="code"
            value={code}
            onChangeText={setCode}
            onSubmitEditing={submit}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={7}
            autoFocus
            accessibilityLabel="Sign-in code"
            style={[
              text('figure'),
              s.field,
              s.code,
              fieldColors(c, props.error),
            ]}
          />
        ) : (
          <TextInput
            key="email"
            value={email}
            onChangeText={setEmail}
            onSubmitEditing={submit}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="you@example.com"
            placeholderTextColor={c['text-subtle']}
            accessibilityLabel="Email"
            style={[text('body'), s.field, fieldColors(c, props.error)]}
          />
        )}
        {props.error && (
          <Text
            accessibilityRole="alert"
            style={[text('support'), { color: c.danger }]}
          >
            {props.error}
          </Text>
        )}
        <Pressable
          onPress={submit}
          disabled={!live}
          accessibilityRole="button"
          aria-disabled={!live}
          aria-busy={props.pending}
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
            {label}
          </Text>
        </Pressable>
        {props.sentTo && (
          <Pressable
            onPress={() => {
              setCode('');
              props.onDifferentEmail();
            }}
            accessibilityRole="button"
            style={s.quiet}
          >
            <Text style={[text('control'), { color: c['text-muted'] }]}>
              Use a different email
            </Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function fieldColors(c: ReturnType<typeof useColors>, error: string | null) {
  return {
    color: c['text-strong'],
    backgroundColor: c['bg-primary'],
    borderColor: error ? c.danger : c['border-default'],
  };
}

const s = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  stack: { gap: 12, paddingHorizontal: 20, paddingBottom: 80 },
  lockup: { alignItems: 'center', marginBottom: 12 },
  field: {
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  code: { textAlign: 'center', letterSpacing: 8 },
  button: { borderRadius: 12, padding: 15, alignItems: 'center' },
  quiet: { padding: 12, alignItems: 'center' },
});
