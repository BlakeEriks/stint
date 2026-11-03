# Contract: the `StintSurfaces` module on iOS

JS to Swift (`apps/mobile/src/surfaces-native.ts`):

| Call | Does |
| --- | --- |
| `draw(state: string)` | Stores the state (`data-model.md`), reloads the widgets and the control, and starts, updates or ends the Live Activity |

Swift to JS: the event `pressed`, after a press while the app's JS runs, so
it refetches the timer (`onTimerChanged`).

The App Intents (`targets/widget/_shared/Intents.swift`):

| Intent | Does |
| --- | --- |
| `StartTimerIntent` | Starts the task the stored state's `next` names |
| `StopTimerIntent` | Stops the running timer |
| `ToggleTimerIntent` | The control's: start or stop by its value (iOS 18) |

Each asks to unlock first, runs in the app, and answers Siri with what it
did or why it didn't.
