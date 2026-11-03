# Voice

How Stint's user-visible text reads, on every client: labels, sublabels,
buttons, dialogs, errors, and empty states.

## Principles

1. **Name the thing first.** Text starts by saying what the field or control
   is, not where its value shows up or when it is used.
2. **Behavior second, briefly.** One short second clause, only when the
   field changes something.
3. **One subject per sentence.** Detail about another field, screen, or later
   moment is cut.
4. **Plain words.** A term a new reader may not know is explained where it
   appears. Internal vocabulary stays internal.
5. **Concrete over vague.** Real values — durations, amounts, formats —
   replace a vague word such as *quickly*.
6. **Statements, not questions.** Headers and buttons name the action.
   Anything the screen already shows is not repeated.
7. **Impersonal.** No pronouns: you, your, we, our.
8. **Complete sentences.** No one-word sentences, and a restriction says
   what it means. No contractions.
9. **Dynamic values live in the body.** Labels and titles are fixed text.
10. **A sublabel exists only if it adds something**: it resolves an
    ambiguous name, states a unit or format, explains a consequence or
    non-obvious behavior, or defines jargon. Otherwise there is none.

## Words

| Avoided | Used |
| --- | --- |
| you, your, we, our | the thing's name, such as *the client* or *this payment method* |
| *Appears on…*, *Shown in…* | what the value is, or no sublabel |
| quickly, soon, a while | the real value, such as *after 24 hours* |
| Internal server error, and any status or code name | Something went wrong. Try again shortly. |
| can't, don't, isn't | cannot, do not, is not |

## Each kind of text

| Kind | Rule |
| --- | --- |
| Button | The action as a verb phrase, in fixed text, such as *Mark as sent* or *Add first client*. |
| Field label | The thing's name. A label is fixed text and is not a sentence. |
| Field sublabel | One sentence naming the thing, then its behavior, under principle 10. |
| Error | What failed, then what to do next, with any real limit stated. |
| Empty state | What the list holds once it has data. The screen's own button is not repeated. |
| Confirmation | The title is the action. The body says what changes, with its figures. |
| Destructive dialog | The title is the action. The body names what goes and whether it can come back. |

## Before and after

| Text | Before | After |
| --- | --- | --- |
| Payment method name | Only you see this. | Name for this payment method, not shared outside Stint. |
| Template, on New invoice | Changes your template for every draft, here and in Settings. | No sublabel. |
| Client rate | Blank uses your default | Hourly charge for this client. The default rate applies when left empty. |
| Bad sign-in code | That code did not work. Codes expire quickly and can only be used once. | That code did not work. Codes expire after 24 hours and work once. |
| Server error | Internal server error | Something went wrong. Try again shortly. |
| Mark paid, date label | When did the payment actually arrive? | When the payment landed |
| Mark sent dialog | Lock N entries · $total. The invoice stays as it is. | Title "Mark as sent"; body "The N entries ($total) on this invoice cannot be edited after it is sent. A mistake is corrected by voiding the invoice and issuing a new one." |
| Address | Appears on the invoice. | No sublabel. |
| Add client modal | The body *Add your first client now, or later from Clients.* | The header *Add first client*, and no body. |
| Expense | A cost {client} pays back. | Cost reimbursed by the client. |
