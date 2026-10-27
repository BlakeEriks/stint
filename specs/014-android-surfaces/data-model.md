# Data model: The timer outside the Android app

No table changes. One value crosses from JS to Kotlin.

## Surface state

What every surface draws, derived in `apps/mobile/src/surfaces.ts` from the
cached summary, task names, projects and clients.

| Field | Meaning |
| --- | --- |
| `kind` | `running`, `stopped` or `signedOut` |
| `task` | The running task, or the one Start begins (`''`: an unnamed timer) |
| `detail` | Project · client when running; the project when stopped; `null` for none |
| `color` | The project's color, or `null` |
| `startedAt` | Running: when it started, in the phone's clock (ms) |
| `next` | Stopped: `{ taskName, projectId }` Start sends |
| `why` | The last press's failure, until the next press or draw from the server |
| `colors` | The tokens the widget uses, light and dark |

Native keeps the last state it was given and, after a press, a prediction
over it (`running` or `stopped`) until the next state arrives.
