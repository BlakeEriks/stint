import { theme } from '@stint/design-tokens';
import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { type Backend, nativeState, type SurfaceState } from './surfaces.ts';

/** `modules/stint-surfaces`, on Android and iOS. */
const native = requireOptionalNativeModule<{
  draw(state: string): void;
  addListener?(event: 'pressed', listener: () => void): { remove(): void };
}>('StintSurfaces');
export const canDraw = native !== null;

/** The tokens the widgets draw with (`Widgets.kt`, `targets/widget`). */
const WIDGET = [
  'bg-primary',
  'bg-elevated',
  'border-subtle',
  'border-default',
  'text-strong',
  'text-primary',
  'text-muted',
  'text-subtle',
  'text-on-accent',
  'accent-default',
  'timer-running',
  'timer-idle',
  'danger',
] as const;
const pick = (colors: Record<string, string>) =>
  Object.fromEntries(WIDGET.map((name) => [name, colors[name]]));

/** Hands native the state, what a press would show, and both themes. */
export function drawSurfaces(state: SurfaceState, backend: Backend) {
  if (!native) return;
  const out = nativeState(state, backend);
  native.draw(
    JSON.stringify(
      out.kind === 'kept'
        ? out
        : {
            ...out,
            colors: { light: pick(theme.light), dark: pick(theme.dark) },
          },
    ),
  );
}

/** iOS: a press outside the app ran in Swift while the app's JS was up. */
export function onPressedOutside(listener: () => void): () => void {
  const sub = native?.addListener?.('pressed', listener);
  return () => sub?.remove();
}

/** Android's notification permission, and asking for it; `null` elsewhere. */
export const notifications = {
  async read() {
    if (!native || Platform.OS !== 'android') return null;
    return Notifications.getPermissionsAsync();
  },
  async ask() {
    return Notifications.requestPermissionsAsync();
  },
};
