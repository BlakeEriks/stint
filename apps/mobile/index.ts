import './src/polyfills.ts';
import './src/crash-reporting.ts';
import { registerRootComponent } from 'expo';
import { App } from './src/main/app.tsx';

registerRootComponent(App);
