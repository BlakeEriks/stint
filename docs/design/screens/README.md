# Screen specs

One HTML doc per route, named after the route. `home.html` is `/`,
`calendar.html` is `/calendar`.

The rest are parts rather than routes, each one subject a route's doc would
otherwise restate:

| Doc | Subject |
|---|---|
| `frame.html` | what every screen renders inside |
| `components.html` | what a screen is assembled *from* |
| `inbox.html` | the dock's rows |
| `timer-bar.html` | the bar under every screen |
| `entry-dialog.html`, `task-suggest.html` | the two surfaces that open over one |

**States live inside the screen's doc, not beside it.** A drag-in-progress
mockup is a section of `calendar.html`, never `calendar-drag.html`. One file
per route is what stops this becoming a drawer of near-duplicate variants that
disagree with each other.

**A doc states the current final form.** Not options, not alternatives
considered, not a decision log. A doc may say *why* a thing is the way it is —
that constrains the next change — but never *what else was on the table*: no
"this used to say", no "was tried first", no refuting a proposal nobody made.

Unbuilt work goes to `../../roadmap.md` and a known fault to a GitHub
issue. A rejection is deleted — `../principles.md` holds what we
believe, never a record of what was turned down.

## Starting one

Copy `_shell.html`, keep everything outside `.content`, replace what is
inside it. There is no include mechanism: these are static files opened from
disk, and a build step for mockups is the wrong trade. `_shell.html` is the
reference copy — if the app's frame changes, change it there and the next doc
inherits it.

## Reading them

```bash
pnpm design
```

Serves `docs/design` at <http://localhost:8778> with an index of every doc and
a nav strip for moving between them. The port is fixed so the URL stays
bookmarkable; `PORT=…` overrides it.

**A server, not `file://`** — a doc links `_mockup.css` by relative path, so
opening one directly renders it unstyled.

The index and the nav strip are **built from the directory on each request**,
so a new doc appears as soon as it is saved. Titles come from each doc's own
`<title>`. Nothing is cached: edit, reload, see it.

The nav strip is injected at serve time and is not in the files — a doc is a
spec, and a link bar is not part of what it specifies.

## `_mockup.css` is generated

`pnpm tokens` writes it, like `Tokens.swift` and `dist/tokens.css`. **Never
edit it.** A hand-edited hex is the drift the token package exists to prevent,
and it fails silently — a stale colour renders perfectly and merely
misrepresents the app.

It carries the palette as raw token names (`--bg-primary`, `--text-muted`,
`--border-subtle`), one class per role in the type scale (`.type-amount`,
`.type-timer`), and `.mark`. A doc names a role and never assembles one, so it
cannot invent a size the product does not have.

It is committed because a browser opening a file from disk cannot reach the
gitignored `dist/`.

## The frame

Four planes, depth increasing toward what is being read:

| Plane | Surface | What sits on it |
|---|---|---|
| Furthest | `--bg-recessed` | the ground the app's card floats on at `2xl` |
| | `--bg-base` | the ground; the header, rail, dock and timer bar are painted straight onto it |
| | `--bg-primary` | the content column — one panel, shadow alone, no border |
| Nearest | `--bg-elevated` + `--shadow-card` | a row or a list you act on |

Never invert this — a surface darker than the one under it reads as a hole.

The header, the rail and the dock carry no surface of their own: the ground
runs unbroken behind them, so the only edge in the frame belongs to the
panel. **Nothing inside the panel is a card** — regions there are separated
by an inset rule with 18px above and below, and `_shell.html` is the copy to
start from.

The rail is 192px and appears at `lg`; the dock is a band beneath the content
until `xl`, where it becomes a 286px column. The content measure is 48rem, or
72rem for a screen that is a grid rather than a column.

## Identity

`../brand.html` is the mark, the typefaces and the four colours that carry
meaning. It is the authority on all three; a screen doc uses them and does not
restate them.
