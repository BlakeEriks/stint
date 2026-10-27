import type { Preview } from '@storybook/react-native-web-vite';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/* A phone's frame: 390 by 844, no notch, so every screen is judged at the
   width the design was drawn for. */
const FRAME = { width: 390, height: 844 };
const metrics = {
  frame: { x: 0, y: 0, ...FRAME },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const preview: Preview = {
  parameters: {
    a11y: {
      test: 'error',
      /* react-native-web draws a Modal's root as a div with `aria-modal`
         and no role, which is its markup, not ours; on a phone the Modal is
         the platform's own sheet. */
      config: {
        rules: [{ id: 'aria-allowed-attr', selector: '*:not([aria-modal])' }],
      },
    },
  },
  decorators: [
    (Story) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <View style={FRAME}>
          <Story />
        </View>
      </SafeAreaProvider>
    ),
  ],
};

export default preview;
