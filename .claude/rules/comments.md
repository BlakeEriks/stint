---
paths:
  - "apps/**"
  - "packages/**"
  - "scripts/**"
  - "supabase/**"
---

## Comments

Code reads as if it was written in one go, already in its final form. A fix
gets built into the design, not stuck on as a patch with a note about it.
The story of a change (the bug, the old behavior, the issue number) goes in
the commit and the PR. Git keeps it there; in the code it goes stale.

A comment says what the code can't (Ousterhout, *A Philosophy of Software
Design*, ch. 12–13):

| Keep | Cut |
| --- | --- |
| why this approach over the obvious one | what the next line does |
| a constraint held elsewhere: an index, a trigger, another client | how the code got this way, or what it used to do |
| a trap invisible in the source: DST, hydration, a vendor quirk | what the code deliberately doesn't do |
| units, invariants, the meaning of a return value | a restatement of a name, a type, a test or a CI check |

A comment cites an issue only as `TODO(#n)`, for work still open;
`scripts/check-comment-refs.mjs` fails any other citation. A name that says
what a function does replaces the comment that would. Keep a comment to the
length of what it has to say.
