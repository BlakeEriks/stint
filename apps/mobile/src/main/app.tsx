import { ApiError, currentTimeZone } from '@stint/client';
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
import { createPushDevice, onTimerPush } from '../push.ts';
import { createSurfaces } from '../surfaces.ts';
import { askToNotify, canDraw, drawSurfaces } from '../surfaces-native';
import { canPush, expoTokens, listenForTimerPushes } from '../push-native';
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

/* The notification, widgets, tile and shortcut (`surfaces.ts`): drawn on
   every change to the cached timer, and pressed through the same client, also
   with no screen (the `StintPress` task in `index.ts`). */
export const surfaces = createSurfaces({
  queryClient,
  api,
  timeZone: currentTimeZone,
  signedIn: canRequest,
  draw: drawSurfaces,
});
if (canDraw) surfaces.follow();

/**
 * Whether a request can be made with no screen: a session and, on a preview,
 * its bypass, which only the screen loads otherwise. Without it, a protected
 * preview's refusal would forget the stored bypass.
 */
async function canRequest() {
  if (
    target.name === 'preview' &&
    bypass.current() === null &&
    (await bypass.load()) === null
  )
    return false;
  return (await auth.load()) !== null;
}

/* A timer changed on another client: refetch it now, not on the next
   foreground (`push.ts`), and redraw the surfaces with the app closed. */
listenForTimerPushes(() => {
  void onTimerPush(queryClient);
  if (canDraw) void surfaces.refresh();
});

/** The running timer's notification needs Android 13's permission, asked once. */
function askForNotification() {
  void askToNotify().then((granted) => {
    if (granted) surfaces.redraw();
  });
}
const pushDevice = createPushDevice({
  tokens: expoTokens,
  register: api.registerPushDevice,
});

/**
 * The unregister on sign-out, as the session being left. It never refreshes:
 * a refresh landing after sign-out would sign the user back in, and a token
 * it can't remove only wakes a signed-out app.
 */
function unregisterAs(accessToken: string) {
  return createApi(
    createRequest({
      origin,
      auth: {
        accessToken: async () => accessToken,
        refresh: () =>
          Promise.reject(
            new ApiError(401, { code: 'UNAUTHORIZED', message: 'Signed out.' }),
          ),
        signOut: async () => {},
      },
      bypass: bypass.current,
    }),
  ).unregisterPushDevice;
}

async function signOut() {
  try {
    const session = canPush ? await auth.load() : null;
    if (session) pushDevice.leave(unregisterAs(session.accessToken));
  } finally {
    await auth.signOut();
    surfaces.signOut();
  }
}

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
  const signedIn = Boolean(session);
  const loaded = session !== undefined;
  useEffect(() => {
    if (signedIn && canPush) void pushDevice.join();
  }, [signedIn]);
  useEffect(() => {
    if (!loaded || !canDraw) return;
    if (signedIn) void surfaces.refresh();
    else surfaces.signOut();
  }, [loaded, signedIn]);
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
            onSignOut={() => void signOut()}
            onTimerShown={askForNotification}
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
