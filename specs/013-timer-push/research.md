# Research: Push timer changes to Android phones

## What a push carries

- **Decision**: Data only, `{ kind: 'timer' }`, Android priority high, collapse key `timer`.
- **Rationale**: Clarification 1. The phone refetches, so ordering and stale payloads can't matter, and nothing about the user's work passes through Google.
- **Alternatives**: The running entry in the payload saves one request, but two pushes out of order would show the older state.

## Receiving a data-only message on Android

- **Decision**: `expo-notifications` for the token (`getDevicePushTokenAsync()`, the raw FCM token) and a task from `expo-task-manager` registered with `registerTaskAsync()`.
- **Rationale**: `expo-notifications` doesn't pass a data-only message to `addNotificationReceivedListener`; it runs the registered task instead, in the foreground and the background (`ExpoHandlingDelegate.kt`). The same task is where #465 will update its notification.
- **Alternatives**: `@react-native-firebase/messaging` has `onMessage`, but adds a second Firebase SDK and static frameworks on iOS.

## No permission prompt

- **Decision**: The app never asks for notification permission.
- **Rationale**: A data-only message shows nothing, and Android issues the FCM token without `POST_NOTIFICATIONS`. #465 asks when it first posts a notification.

## The server's credentials

- **Decision**: `FCM_SERVICE_ACCOUNT`, the service account's JSON key, as one Vercel env var. The access token is an RS256 JWT exchanged at Google's token endpoint with `node:crypto`, cached until a minute before it expires.
- **Rationale**: Three fields of the key are used; `google-auth-library` would add a dependency tree for one exchange.
- **Alternatives**: Expo's push service is free too, but adds a third party between the server and FCM and its own token format.

## Retry and dead tokens

- **Decision**: One retry, a second later, on a network error, 429 or 5xx. `404 UNREGISTERED` deletes the row. Anything else reaches Sentry.
- **Rationale**: Clarification 3; the issue names `UNREGISTERED`.

## After the response

- **Decision**: `after()` from `next/server`, given the request's own RLS client.
- **Rationale**: The issue asks for it; Vercel keeps the function alive until it settles. A route handler may read cookies inside `after()`.

## The pressing device

- **Decision**: It is sent the push too; the phone ignores a push while `isMutating() > 0`.
- **Rationale**: Clarification 2; the rule is `followRunningTimer`'s.
