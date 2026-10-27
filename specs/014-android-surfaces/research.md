# Research: The timer outside the Android app

## The widget is native, not `react-native-android-widget`

- **Decision**: An `AppWidgetProvider` per size, drawn with `RemoteViews`
  from XML layouts, the clock a `Chronometer`. (decided autonomously)
- **Rationale**: The library renders each widget to a bitmap from its own
  primitives (0.24.0: Flex, Text, Image, Icon, Svg, List, Overlap), with no
  chronometer, and a widget redraws at most every 30 minutes on its own. A
  clock that counts is the design.
- **Alternatives**: the library with "since 8:54 AM" in place of a clock,
  which reads as stale beside the notification's counting one.

## A press without a screen runs the app's own mutation

- **Decision**: `useOptimisticMutation`'s options move into
  `optimisticOptions(queryClient, opts)`; the hook passes them to
  `useMutation`, and `pressOnce()` to a `MutationObserver` on the same
  `QueryClient`. The phone's headless press uses `pressOnce`.
- **Rationale**: Constitution VI wants one mechanism per platform. The same
  options give a widget press the same lane (`serial: 'timer'`), the same
  10s bound and the same late refetch as the app's Stop.
- **Alternatives**: Kotlin calling the API (two implementations of the
  timer's writes, against Principle III's spirit).

## The press reaches JavaScript through WorkManager

- **Decision**: A `ListenableWorker` that starts a headless JS task, after
  `react-native-headless-task-worker` (MIT), as `react-native-android-widget`
  does.
- **Rationale**: Android 8 and later refuse to start a background service
  from a widget click or a tile in many states; WorkManager is exempt.
- **Alternatives**: `HeadlessJsTaskService`, refused from the background.

## Live Updates

- **Decision**: The notification sets `android.requestPromotedOngoing` in
  its extras and the manifest asks `POST_PROMOTED_NOTIFICATIONS`. Android 16
  then promotes it, and shows its chronometer as a status bar chip.
- **Rationale**: An ordinary ongoing notification with a title, no custom
  view and no colorization meets promotion's rules; older Android ignores
  the extra.

## The widget's type

- **Decision**: IBM Plex Sans and Mono ship in the module's `res/font`, as
  the app's tokens name them; colors come from the tokens in each draw, for
  the phone's light or dark setting.
