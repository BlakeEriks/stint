# Contract: the invite request

## Outbound: Formspree

`POST ${NEXT_PUBLIC_INVITE_FORM_URL}` (`https://formspree.io/f/<form id>`)

Body: `multipart/form-data` with `email` and an empty `_gotcha` honeypot.

| Request header | Answer |
| --- | --- |
| `Accept: application/json` (JavaScript on) | 2xx `{ "ok": true }` is sent; anything else, or a network error, is failed |
| none (JavaScript off) | Formspree's own thank-you page |

## UI

| State | The visitor sees |
| --- | --- |
| Open | Email field, "Request an invite" button |
| Sending | Field read-only, button disabled, "Sending…" |
| Sent | "You're on the list." and that the invite comes to their address by email if they're let in |
| Failed | The address still in the field, and an alert that it didn't send and to try again |

## Sign-in refusal

`otp_disabled` → "Stint is invite-only during alpha." and a link,
"Request an invite", to `<landing origin>/#invite`.
