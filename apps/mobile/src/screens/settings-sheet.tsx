import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { text, useColors } from '../theme.ts';

export interface SettingsSheetProps {
  open: boolean;
  email: string;
  /** The backend, when it is not production. */
  label: string | null;
  onSignOut: () => void;
  onClose: () => void;
}

/**
 * The account and Sign out, nothing more: rates, clients and invoicing are
 * business configuration and live in the web app, as on macOS.
 */
export function SettingsSheet(props: SettingsSheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={props.open}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <Pressable
        style={[s.scrim, { backgroundColor: c.overlay }]}
        onPress={props.onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      />
      <View
        style={[
          s.sheet,
          {
            backgroundColor: c['bg-elevated'],
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <Text style={[text('label'), { color: c['text-subtle'] }]}>
          Signed in
        </Text>
        <Text style={[text('body'), { color: c['text-strong'] }]}>
          {props.email}
        </Text>
        {props.label && (
          <Text style={[text('meta'), { color: c.warning }]}>
            {props.label}
          </Text>
        )}
        <Pressable
          onPress={props.onSignOut}
          accessibilityRole="button"
          style={[s.button, { borderColor: c['border-default'] }]}
        >
          <Text style={[text('control'), { color: c['text-strong'] }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    gap: 6,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  button: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
});
