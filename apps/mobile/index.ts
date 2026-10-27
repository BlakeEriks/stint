import './src/polyfills.ts';
import './src/crash-reporting.ts';
import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';
import { App, surfaces } from './src/main/app.tsx';
import type { Press } from './src/surfaces.ts';

registerRootComponent(App);

/* A press on the notification, a widget or the tile, run by `PressWorker.kt`
   with or without the app open. */
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(
    'StintPress',
    () => (press: Press) => surfaces.press(press),
  );
}
