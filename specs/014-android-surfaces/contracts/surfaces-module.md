# Contract: the `StintSurfaces` module

JS to Kotlin (`apps/mobile/src/surfaces-native.ts`):

| Call | Does |
| --- | --- |
| `draw(state: string)` | Stores the surface state (JSON, `data-model.md`), drops any prediction, and redraws the notification, both widgets, the tile and the shortcut |

Kotlin to JS, the headless task `StintPress`, run by WorkManager:

| Data | Meaning |
| --- | --- |
| `action` | `start` or `stop` |
| `taskName`, `projectId` | `start` only: what the surface showed Start would begin |

A shortcut opens `PressActivity`, which is not exported, with
`dev.stint.surfaces.ACTION` set to `start` or `stop`; it presses as a widget
does and opens the app. No public link presses the timer.
