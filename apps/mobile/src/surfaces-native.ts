import { theme } from '@stint/design-tokens';
import { requireOptionalNativeModule } from 'expo';
import * as Notifications from 'expo-notifications';
import { pressedState, type SurfaceState } from './surfaces.ts';

/** `modules/stint-surfaces`, on Android only. */
const native = requireOptionalNativeModule<{ draw(state: string): void }>(
  'StintSurfaces',
);
export const canDraw = native !== null;

/** The tokens the widget draws with (`Widgets.kt`). */
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

/** Hands Kotlin the state, what a press would show, and both themes. */
export function drawSurfaces(state: SurfaceState) {
  if (!native) return;
  native.draw(
    JSON.stringify(
      state.kind === 'kept'
        ? state
        : {
            ...state,
            pressed: pressedState(state),
            colors: { light: pick(theme.light), dark: pick(theme.dark) },
          },
    ),
  );
}

/**
 * Asks once to show the running timer's notification (Android 13 and later),
 * when there is first one to show. Returns whether it was just granted.
 */
export async function askToNotify(): Promise<boolean> {
  if (!native) return false;
  const now = await Notifications.getPermissionsAsync();
  if (now.status !== 'undetermined' || !now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}
