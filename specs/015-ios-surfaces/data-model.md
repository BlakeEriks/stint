# Data model: The timer outside the iPhone app

No table changes. One value crosses from JS to Swift: Android's surface
state (spec 014's `data-model.md`), with its `pressed` and `colors`, plus on
iOS:

| Field | Meaning |
| --- | --- |
| `failed` | `{ start, stop }`: the words a failed press starts with ("Not started") |
| `backend` | `{ origin, supabaseUrl, supabaseKey, session, bypass }`: where Swift's press goes, and the secure-store keys of the session and the preview's bypass. `null` signed out |

The module stores it as the keychain item `dev.stint.surfaces`. After a
press it stores the press's outcome in the same shape: `pressed` on
success, with the old state as its `pressed`; the old state with `why` on
failure.
