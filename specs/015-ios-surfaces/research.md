# Research: The timer outside the iPhone app

## A press runs in the app, in Swift

- **Decision**: Every intent is a `LiveActivityIntent`, so iOS runs its
  `perform()` in the app's process, also from a widget or the control. It
  calls the module's Swift press. (decided autonomously)
- **Rationale**: Only the app may update or end its Live Activity. A
  background launch has no scene, and React Native starts in
  `SceneDelegate` (Expo SDK 58), so the app's JS press can't run.
- **Alternatives**: the widget extension calling the API (a second session
  spending refresh tokens, and a Live Activity it can't end); a headless
  React Native host (no supported path under the scene life cycle).

## The widgets read one keychain item

- **Decision**: The module writes the drawn state to the keychain item
  `dev.stint.surfaces`, `kSecAttrAccessibleAfterFirstUnlock`, with no
  access group, so it lands in the entitlement's first group, the shared
  one. The extension reads it the same way.
- **Rationale**: Keychain sharing is the one capability a free Apple ID can
  sign that both processes can read; an app group may not be. Without it,
  the item stays the app's own and the widgets say "Open Stint". After
  first unlock, so a lock screen widget redraws while locked.
- **Alternatives**: an app group's `UserDefaults` (`ExtensionStorage`),
  which a Personal Team may not sign.

## The session is shared, and refreshed by whoever needs it

- **Decision**: Swift reads the session expo-secure-store wrote (service
  `app:no-auth`, account the key), refreshes it at GoTrue when it expires
  within a minute, and writes it back. JS's refresh reads the stored
  session first, and uses one another process refreshed.
- **Rationale**: Access tokens last an hour, and a Stop from the lock screen
  comes hours after the app last ran. GoTrue's reuse interval covers a race
  between the two inside 10s.

## No push entitlement on iOS

- **Decision**: `app.config.ts` drops the `aps-environment` that
  `expo-notifications` adds, until #471.
- **Rationale**: A Personal Team can't sign push, and iOS registers for none
  yet.

## Siri and Shortcuts are App Shortcuts

- **Decision**: An `AppShortcutsProvider` in the app target names Start and
  Stop with phrases; no SiriKit, so no Siri capability.

## Stint Local reaches the local stack through Metro

- **Decision**: A native Stint Local loaded from Metro asks Metro's own
  origin for `/api/v1` and `/auth/v1`, which `metro.config.cjs` passes to
  the web server and to Supabase.
- **Rationale**: EAS Simulator runs in Expo's cloud and reaches the
  builder's machine only through Metro's tunnel; a phone on the LAN gets
  the same.
