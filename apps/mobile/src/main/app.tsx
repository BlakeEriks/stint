import { ApiError } from '@stint/client';
import { startSession } from '../launch.ts';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createApi } from '../api.ts';
import { createBypass } from '../bypass.ts';
import { origin, target } from '../config.ts';
import { usePlex } from '../fonts.ts';
import { createRequest } from '../request.ts';
import { createAuth, type Session } from '../session.ts';
import { secureStore } from '../storage';
import { useColors } from '../theme.ts';
import { BypassScreen } from '../screens/bypass-screen.tsx';
import { SignInContainer } from './sign-in-container.tsx';
import { TimerContainer } from './timer-container.tsx';

const auth = createAuth({
  supabaseUrl: target.supabaseUrl,
  supabaseKey: target.supabaseKey,
  store: secureStore,
});
const bypass = createBypass(secureStore);
const api = createApi(createRequest({ origin, auth, bypass: bypass.current }));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // A 4xx will answer the same again; the network may not.
      retry: (count, error) =>
        !(
          error instanceof ApiError &&
          error.status >= 400 &&
          error.status < 500
        ) && count < 2,
    },
  },
});

/* "Focus" on a phone is the app coming to the foreground: the timer is
   refetched every time (`refetchOnWindowFocus: 'always'` in `useTimer`), so
   one started on the Mac shows as soon as the app opens. */
focusManager.setEventListener((setFocused) => {
  const sub = AppState.addEventListener('change', (state) =>
    setFocused(state === 'active'),
  );
  return () => sub.remove();
});

/** Undefined while the stored session loads. */
function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>();
  useEffect(
    () =>
      startSession({
        auth,
        preview: target.preview,
        show: setSession,
        clear: () => queryClient.clear(),
      }),
    [],
  );
  return session;
}

/** A preview build needs the bypass before it can reach its PR; the others never ask. */
function useBypassKnown(): [boolean | undefined, (typed: string) => void] {
  const [known, setKnown] = useState<boolean | undefined>(
    target.name === 'preview' ? undefined : true,
  );
  useEffect(() => {
    if (target.name === 'preview')
      void bypass.load().then((value) => setKnown(value !== null));
  }, []);
  const save = (typed: string) =>
    void bypass.save(typed).then(() => setKnown(true));
  return [known, save];
}

export function App() {
  const [fonts] = usePlex();
  const session = useSession();
  const [bypassKnown, saveBypass] = useBypassKnown();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {!fonts || session === undefined || bypassKnown === undefined ? (
          <Blank />
        ) : !bypassKnown ? (
          <BypassScreen label={target.label ?? ''} onSave={saveBypass} />
        ) : session ? (
          <TimerContainer
            api={api}
            email={session.email}
            onSignOut={() => void auth.signOut()}
          />
        ) : (
          <SignInContainer auth={auth} />
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** The frame before the session and fonts load: the background, nothing else. */
function Blank() {
  const c = useColors();
  return <View style={{ flex: 1, backgroundColor: c['bg-base'] }} />;
}
