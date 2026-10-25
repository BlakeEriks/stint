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
const api = createApi(
  createRequest({
    origin,
    auth,
    bypass: bypass.current,
    onProtected: () => void bypass.clear(),
  }),
);

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

/**
 * A preview build needs the bypass before it can reach its PR, and again
 * whenever Vercel refuses it; the others never ask. A store that cannot be
 * read asks for it and still reports the fault; one that cannot be written
 * says so on the screen.
 */
function useBypass() {
  const [known, setKnown] = useState<boolean | undefined>(
    target.name === 'preview' ? undefined : true,
  );
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (target.name !== 'preview') return;
    bypass.load().then(
      (value) => setKnown(value !== null),
      (e: unknown) => {
        setKnown(false);
        throw e;
      },
    );
    return bypass.subscribe((value) => {
      setKnown(value !== null);
      // Whatever was showing was refused; refetch once it is typed in again.
      if (value === null) queryClient.clear();
    });
  }, []);
  const save = (typed: string) => {
    setError(null);
    bypass.save(typed).then(
      () => setKnown(true),
      (e: unknown) =>
        setError(
          `Couldn’t keep it on this phone: ${e instanceof Error ? e.message : String(e)}`,
        ),
    );
  };
  return { known, error, save };
}

export function App() {
  const [fonts] = usePlex();
  const session = useSession();
  const pass = useBypass();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {!fonts || session === undefined || pass.known === undefined ? (
          <Blank />
        ) : !pass.known ? (
          <BypassScreen
            label={target.label ?? ''}
            error={pass.error}
            onSave={pass.save}
          />
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
