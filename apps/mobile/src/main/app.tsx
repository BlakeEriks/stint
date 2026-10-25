import { ApiError } from '@stint/client';
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
import { origin, target } from '../config.ts';
import { usePlex } from '../fonts.ts';
import { createRequest } from '../request.ts';
import { createAuth, type Session } from '../session.ts';
import { secureStore } from '../storage';
import { useColors } from '../theme.ts';
import { SignInContainer } from './sign-in-container.tsx';
import { TimerContainer } from './timer-container.tsx';

const auth = createAuth({
  supabaseUrl: target.supabaseUrl,
  supabaseKey: target.supabaseKey,
  store: secureStore,
});
const api = createApi(createRequest({ origin, auth, bypass: target.bypass }));

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
  useEffect(() => {
    const off = auth.subscribe((next) => {
      // Nothing of one account outlives its sign-out.
      if (!next) queryClient.clear();
      setSession(next);
    });
    void (async () => {
      const stored = await auth.load();
      // A preview build signs in as its PR's seeded account on launch.
      if (!stored && target.preview)
        await auth.signInWithPassword(
          target.preview.email,
          target.preview.password,
        );
      else setSession(stored);
    })().catch((e) => {
      // A preview account the PR hasn't seeded yet: show sign-in.
      if (!(e instanceof ApiError || e instanceof TypeError)) throw e;
      setSession(null);
    });
    return off;
  }, []);
  return session;
}

export function App() {
  const [fonts] = usePlex();
  const session = useSession();
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="auto" />
        {!fonts || session === undefined ? (
          <Blank />
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
