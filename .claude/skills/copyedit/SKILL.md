---
name: copyedit
description: Copyedit a doc against the Google developer documentation style guide and the house rules in docs/CLAUDE.md. Use when a hygiene issue says "Fix with /copyedit", or a doc has grown.
argument-hint: "<path>"
# Follows the Google developer documentation style guide, checked by Vale.
---

Copyedit `$ARGUMENTS`, a doc under `docs/` or a `CLAUDE.md`. If no path is
given, ask which.

## 1. Measure

`vale $ARGUMENTS` reports each line against the Google developer
documentation style guide and the house rules in `.vale/styles/Stint`.
`.vale.ini` turns off the Google rules that conflict with house style.
Record the count and the word count (`wc -w`): they are the before numbers.

## 2. Fix what Vale reports

Each alert is a candidate. Fix it unless the rule misreads the sentence,
such as a code identifier Vale takes for a word. When a rule misfires
across the docs, turn it off in `.vale.ini` with the reason.

## 3. Cut what another owner says

`docs/CLAUDE.md` holds the house rules. For each section, ask whether
something else already says it: the page itself, a CI check, a config file
comment, the screen doc that owns it. Cut the copy here. What stays is what
the section is, where it goes, and the one thing nothing else can say.

Then Google's rules for concision: one idea per sentence, the conclusion
first, measurements in tables.

## 4. Verify

- **Every fact you compress still holds.** Check the file exists, the
  script is in `package.json`, the test is still named that.
- An HTML doc renders over `pnpm design`: no horizontal overflow, nothing
  wrapped that should not wrap.
- `vale $ARGUMENTS` and `wc -w` again.

Report alerts and words before and after, what was cut by reason, and any
alert left in place with why.
