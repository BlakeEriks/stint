import type { Metadata } from 'next';
import { ArrowRight, Laptop, Monitor, Smartphone, X } from 'lucide-react';
import { DemoTimer } from '@/components/marketing/demo-timer';

/**
 * Served at `/` on the apex domain, rewritten there by `src/proxy.ts`.
 *
 * Fully static: the session lives on the app subdomain, so this page never
 * reads a cookie and never needs to render per-request. That is the point of
 * the split — the pitch is a CDN document, the product is dynamic.
 */

/* The H1 keeps the short voice; the tab and the search result carry the
   terms someone would actually type. */
export const metadata: Metadata = {
  /* `absolute` escapes the root layout's `%s · Stint` template, which would
     otherwise render "Stint — … · Stint". */
  title: {
    absolute: 'Stint — time tracking and invoicing for solo contractors',
  },
  description:
    'Free time tracking and invoicing for solo contractors. One timer, your rates, and an invoice your client takes seriously. No teams, no seats, no upsell.',
  openGraph: {
    title: 'Time tracking and invoicing for solo contractors. That’s it.',
    description:
      'Track hours, know what you are owed, send the invoice. Free to use, fully.',
    type: 'website',
  },
};

/**
 * Sign-in lives on the app subdomain, so every CTA here is a cross-origin
 * link — a plain `<a>`, not `next/link`, which would try to route it
 * client-side within this origin.
 *
 * In local development there is no subdomain and both halves share one
 * origin, so this falls back to a same-origin path and the links still work.
 */
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? '';
const SIGN_IN_URL = `${APP_ORIGIN}/signin`;

/**
 * The content column. Sections span the full viewport so a section can carry
 * its own ground, and this holds the measure inside them.
 */
function Container({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-5xl px-6 sm:px-10 ${className}`}>
      {children}
    </div>
  );
}

export default function LandingPage() {
  return (
    /* The spine: problem -> the differentiator -> the deliverable -> where it
       runs -> the catch -> the fit -> the doubts -> go.

       Unbilled sits second because it is the argument; everything after it is
       support. It used to be third, below two sections about what the product
       refuses to do and what it costs — which is philosophy ahead of the
       reader's own problem.

       GROUNDS STRICTLY ALTERNATE, base / recessed, down to Questions. Two
       recessed sections ran together (Platforms then Free) and then three
       base ones, which made the banding look accidental rather than like a
       rhythm. Adding a section means re-checking the whole run, not just the
       neighbour above it.

       The exception is the last pair: Questions and Closing share the base
       ground on purpose, so the close reads as the page ending rather than
       as one more section. */
    <main>
      <Header />
      <Hero />
      <Unbilled />
      <Invoice />
      <Platforms />
      <Free />
      <NotForEveryone />
      <Questions />
      <Closing />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <Container className="flex items-center justify-between py-6">
      <span className="type-wordmark text-strong">Stint</span>
      <a
        href={SIGN_IN_URL}
        className="type-nav rounded-md px-2 py-1 text-muted
                   hover:bg-surface-hover hover:text-strong"
      >
        Sign in
      </a>
    </Container>
  );
}

/**
 * One screen, one green object, live.
 *
 * The accent is spent here and on the CTA — the same fact twice (start
 * tracking / time accruing), which is what the scarcity rule permits. It
 * never marks anything else on this page.
 */
function Hero() {
  return (
    <Container className="pt-12 pb-24 sm:pt-20 sm:pb-32">
      {/* Two columns above `lg`: the argument on the left, the product on the
          right. Stacked below it, where a side-by-side would starve both. */}
      {/* `grid-cols-[minmax(0,1fr)]` at every breakpoint, not just `lg`: a
          grid item defaults to `min-width: auto`, so the timer card's
          intrinsic width sets the single column on a phone and the whole page
          scrolls sideways. The explicit track is what lets it shrink. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-6">
          {/* The headline names the COMPOUND JOB, not the two features.
              "Track hours. Create invoices." described two nouns without
              connecting them — and the connection is the entire product.
              A visitor read it as "a tracker and an invoice tool, bundled",
              which describes a dozen other tools.

              What differentiates Stint is that it knows the rates, so the
              hours are already money. That belongs in the first sentence
              rather than three sections down.

              The refusal list ("no project boards…") moved to its own
              section further down. Four lines of struck-through grey in the
              middle of the first screen was the least legible element on the
              page occupying the most valuable space, and absence is not a
              benefit to someone who has not yet been told what they get. */}
          <h1 className="type-hero text-balance text-strong">
            Start the timer, and the invoice takes care of itself.
          </h1>
          <p className="type-lede max-w-md text-muted">
            Stint knows what you charge each client, so a month of hours
            becomes a numbered invoice you can send &mdash; instead of a CSV
            export and a spreadsheet full of arithmetic.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <CallToAction />
            <span className="type-meta text-subtle">
              Free, fully &mdash; no card, no trial.
            </span>
          </div>
        </div>

        {/* The price used to sit under the timer here, and there was a whole
            section about it further down as well — two of six sections spent
            on "free", which is a check-the-box for a free product, not a
            pillar. It is now one line under the CTA plus the "why it's free"
            band, and the timer has the column to itself. */}
        <DemoTimer />
      </div>
    </Container>
  );
}

/** A thing it deliberately doesn't. Muted and struck, never the danger red. */
function Doesnt({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <X
        aria-hidden
        strokeWidth={2.5}
        className="size-5 flex-none text-subtle sm:size-6"
      />
      <span className="type-hero-strike text-subtle line-through decoration-[1.5px]">
        {children}
      </span>
    </li>
  );
}

function CallToAction() {
  return (
    <a
      href={SIGN_IN_URL}
      /* `text-on-accent`, never white: white on the accent is 1.37:1 and CI
         guards this exact pairing. */
      className="type-nav inline-flex items-center gap-2 rounded-lg bg-accent-default
                 px-5 py-3 text-on-accent hover:bg-accent-hover"
    >
      Start tracking — free
      <ArrowRight aria-hidden className="size-3.5" />
    </a>
  );
}

/**
 * A section whose argument and evidence sit side by side above `lg`.
 *
 * `recessed` puts the section on the surface *below* the page ground, which
 * is how the page gets rhythm without alternating bands of unrelated colour —
 * the same recession the app's nav rail uses.
 */
function SplitSection({
  title,
  lede,
  aside,
  footnote,
  recessed = false,
  reverse = false,
}: {
  title: string;
  lede: React.ReactNode;
  aside: React.ReactNode;
  footnote?: React.ReactNode;
  recessed?: boolean;
  reverse?: boolean;
}) {
  return (
    <section className={recessed ? 'bg-surface-recessed' : undefined}>
      <Container className="py-20 sm:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className={`min-w-0 ${reverse ? 'lg:order-2' : ''}`}>
            <h2 className="type-display text-balance text-strong">{title}</h2>
            <div className="type-body mt-4 max-w-md text-muted">{lede}</div>
            {footnote ? (
              <p className="type-support mt-5 max-w-md text-subtle">
                {footnote}
              </p>
            ) : null}
          </div>
          <div className={`min-w-0 ${reverse ? 'lg:order-1' : ''}`}>{aside}</div>
        </div>
      </Container>
    </section>
  );
}

/**
 * The money question. A tracker that does not know rates structurally cannot
 * ask it, which is the whole argument of this section.
 */
function Unbilled() {
  return (
    <SplitSection
      recessed
      /* The old headline ("You don't need a project management suite…")
         argued with a competitor's roadmap, which is an argument the visitor
         is not in. This asks the question they already ask themselves. */
      title="How much work is sitting there, unbilled?"
      lede={
        <>
          Most trackers only count hours, so they can&rsquo;t tell you. Stint
          knows your rates, so it can &mdash; per client, on the home screen,
          every time you open it.
        </>
      }
      aside={
        /* Figures from the app's own seed data. Unbilled and awaiting payment
           are different money and are never summed: adding them double-counts
           the same hours. Awaiting payment is one line at the foot, not a
           card and not a row per invoice. */
        <div className="w-full rounded-xl bg-surface-primary p-6 shadow-float sm:p-7">
          <p className="type-label text-muted">Unbilled</p>
          <p className="type-figure mt-2 text-strong">$1,462.50</p>
          <dl className="mt-6 flex flex-col gap-3">
            <UnbilledRow
              color="#64A3E3"
              name="Northwind Trading"
              detail="18h 30m"
              amount="$975.00"
            />
            <UnbilledRow
              color="#F6964E"
              name="Harbour & Co."
              detail="9h 45m"
              amount="$487.50"
            />
          </dl>
          <p className="type-support mt-5 flex justify-between border-t border-edge-subtle pt-4 text-muted">
            <span>Awaiting payment</span>
            <span className="type-duration text-primary">$2,340.00</span>
          </p>
        </div>
      }
    />
  );
}

function UnbilledRow({
  color,
  name,
  detail,
  amount,
}: {
  color: string;
  name: string;
  detail: string;
  amount: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex min-w-0 items-center gap-2.5">
        {/* Colour belongs to the client, never the project. */}
        <span
          aria-hidden
          className="size-2 flex-none rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="type-control truncate text-primary">{name}</span>
        <span className="type-meta flex-none text-subtle">{detail}</span>
      </dt>
      <dd className="type-duration flex-none text-primary">{amount}</dd>
    </div>
  );
}

/**
 * The deliverable, and the page's strongest asset — so it gets the full
 * width and a centred heading rather than a column beside a paragraph. It is
 * the only section that breaks the left-aligned rhythm, which is what makes
 * it read as the exhibit.
 */
function Invoice() {
  return (
    <section>
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          {/* "One click" is the pitch — the old headline was passive about
              the thing that costs the user nothing. */}
          <h2 className="type-display text-balance text-strong">
            One click, and this is what your client gets.
          </h2>
          <p className="type-body mt-4 text-muted">
            Your hours, grouped by task, at the rate each one was worked
            &mdash; numbered, dated and ready to send.
          </p>
        </div>

        <div className="mt-12">
          <InvoicePreview />
        </div>

        {/* Two decisions that were invisible or buried.

            The no-email one MUST be stated: a visitor who discovers after
            signing up that Stint does not mail the invoice reads it as a
            missing feature. Said here, it is a reason to trust the product.

            The fraud line was an 11px grey centred footnote under the
            artifact — the only benefit on this page that protects the
            CLIENT rather than the user, and no competitor markets it. */}
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          <Aside title="You send it, from your address.">
            Stint gives you the PDF and stays out of the way. Sent by you, it
            carries your own domain&rsquo;s reputation &mdash; not a shared app
            domain&rsquo;s spam score.
          </Aside>
          {/* This was about invoice fraud, which arrived out of nowhere for a
              reader who had not been thinking about it. Same fact, framed as
              the thing the section is actually about: what your client sees,
              and why it makes paying you easy. */}
          <Aside title="Your bank details, already on it.">
            ACH routing and account number, rendered the same way every month
            &mdash; so your client can pay it without emailing you to ask how.
          </Aside>
        </div>
      </Container>
    </section>
  );
}

/** A titled note beside an exhibit. Not a card — cards would compete. */
function Aside({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-edge-control pl-5">
      <p className="type-heading text-strong">{title}</p>
      <p className="type-support mt-1.5 text-muted">{children}</p>
    </div>
  );
}

/**
 * A styled preview rather than a screenshot: it stays sharp at any width,
 * costs no image bytes, and cannot go stale against the real template.
 *
 * Deliberately rendered on white with near-black figures. The real PDF sets
 * its total in the light-theme accent, which is correct on paper but would
 * put a second green meaning on this page beside the CTA.
 */
function InvoicePreview() {
  const lines = [
    ['Onboarding email sequence rework', '12.25', '$175.00', '$2,143.75'],
    ['Checkout validation fixes', '8.50', '$175.00', '$1,487.50'],
    ['Q4 retainer scoping call', '1.75', '$220.00', '$385.00'],
  ];

  return (
    /* The invoice needs 34rem to stay legible, so on a phone it scrolls
       inside its own container rather than shrinking into unreadability.

       That scroll has to be ADVERTISED. Without the hint below, a phone
       visitor sees the description column and nothing else — the amount due,
       the two different rates and the payment block are all off-screen with
       nothing indicating they exist, which loses every persuasive element of
       the page's strongest asset. */
    <div className="mt-2">
      <div className="overflow-x-auto rounded-lg shadow-float">
        <div className="min-w-[34rem] bg-white p-6 text-[#1A1C21]">
        <div className="flex items-start justify-between gap-4">
          {/* A generic example, never a real person: this page is public and
              the invoice carries a name, an email and bank details. */}
          <div className="flex flex-col">
            <span className="type-heading">Your name here</span>
            <span className="type-support text-[#626875]">
              you@yourdomain.com
            </span>
          </div>
          <div className="text-right">
            <div className="type-section">INVOICE</div>
            <div className="type-meta text-[#626875]">INV-0042</div>
          </div>
        </div>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-[#D1D5DD]">
              <th className="type-label pb-2 text-left text-[#848B98]">
                Description
              </th>
              <th className="type-label pb-2 text-right text-[#848B98]">
                Hours
              </th>
              <th className="type-label pb-2 text-right text-[#848B98]">
                Rate
              </th>
              <th className="type-label pb-2 text-right text-[#848B98]">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map(([desc, hours, rate, amount]) => (
              <tr key={desc} className="border-b border-[#E4E6EC]">
                <td className="type-control py-2">{desc}</td>
                <td className="type-duration py-2 text-right">{hours}</td>
                <td className="type-duration py-2 text-right">{rate}</td>
                <td className="type-duration py-2 text-right">{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Two rates on one invoice, deliberately: it proves rate resolution
            at a glance, and the rate is always part of the grouping key. */}
        <div className="mt-4 flex items-baseline justify-end gap-6">
          <span className="type-body">Amount due</span>
          <span className="type-amount-hero">$6,779.16</span>
        </div>

        <div className="mt-6 border-l-2 border-[#1A1C21] bg-[#F2F3F6] p-3">
          <p className="type-heading">Payment — USD ACH</p>
          <p className="type-support mt-1 text-[#626875]">
            Our payment details never change. If you receive any message
            stating otherwise, call to verify before paying.
          </p>
          </div>
        </div>
      </div>

      {/* Only where the scroll actually happens. `lg:hidden` would be a lie
          on a tablet, where 34rem still overflows. */}
      <p className="type-meta mt-3 text-center text-subtle xl:hidden">
        Scroll the invoice to see the rates and the total &rarr;
      </p>
    </div>
  );
}

function Platforms() {
  const surfaces = [
    { icon: Laptop, label: 'Web', detail: 'Everything, everywhere' },
    { icon: Monitor, label: 'Mac', detail: 'Menu bar, always there' },
    { icon: Smartphone, label: 'Phone', detail: 'Start and stop anywhere' },
  ];

  return (
    <SplitSection
      recessed
      reverse
      title="Start it in the menu bar. Stop it from your phone."
      lede={
        <>
          One timer, one truth. The apps aren&rsquo;t shrunken copies of each
          other &mdash; each does the thing only it can do.
        </>
      }
      aside={
        <div className="grid gap-3 sm:grid-cols-3">
          {surfaces.map(({ icon: Icon, label, detail }) => (
            <div
              key={label}
              className="flex flex-col gap-2 rounded-lg bg-surface-primary p-4 shadow-card"
            >
              <Icon aria-hidden className="size-4 text-muted" />
              <span className="type-heading text-strong">{label}</span>
              <span className="type-support text-muted">{detail}</span>
            </div>
          ))}
        </div>
      }
    />
  );
}

/**
 * The price and the promises, as a centred statement with three short
 * pillars beneath it.
 *
 * It was a split section like everything around it, and at 154 words it was
 * the second-biggest wall of prose on the page. Five of eight sections shared
 * one shape, which is what made the page tiring to scan — this one breaks the
 * rhythm, and the cut forced every line to earn its place.
 */
function Free() {
  return (
    <section>
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="type-display text-balance text-strong">
            Free, and here&rsquo;s the catch.
          </h2>
          <p className="type-body mt-4 text-muted">
            There isn&rsquo;t one. Later, a few dollars a month will take the
            Stint mark off your invoices &mdash; and that is the only thing it
            will ever buy.
          </p>
        </div>

        <dl className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {/* A fourth pillar used to head this list — "overlapping entries
              are impossible, enforced by a database index" — and it was cut:
              a solo contractor with one timer has never produced an
              overlapping entry, so it reassured them about a bug they have
              never had, in the vocabulary of our implementation. */}
          <Pillar term="Nothing is gated.">
            Every feature, every export. Nothing that affects whether you get
            paid will sit behind a payment.
          </Pillar>
          <Pillar term="Your hours are never edited.">
            Left the timer running overnight? Stint shows you and asks.
          </Pillar>
          <Pillar term="Your rates freeze on the invoice.">
            Raise your rate next year and the invoices you already sent
            don&rsquo;t change.
          </Pillar>
        </dl>
      </Container>
    </section>
  );
}

/** One of three. Centred, no rule — the row IS the structure here. */
function Pillar({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="type-heading text-strong">{term}</dt>
      <dd className="type-support mt-2 text-muted">{children}</dd>
    </div>
  );
}

/**
 * Where the refusal list belongs.
 *
 * It used to be four struck-through lines in the hero, above any statement of
 * benefit — an absence is not a benefit to someone who has not yet been told
 * what they get, and it put the visitor's current tool on trial in paragraph
 * one. Here the negation is the point of the section, so it reads as service
 * rather than posture: conceding that other tools are better at things Stint
 * does not do buys more trust than any claim about itself.
 */
function NotForEveryone() {
  return (
    <section className="bg-surface-recessed">
      <Container className="py-20 sm:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className="min-w-0">
            <h2 className="type-display text-balance text-strong">
              Not for everyone.
            </h2>
            <p className="type-body mt-4 max-w-md text-muted">
              Bill as a team, need approvals, want project management? Stint
              will frustrate you, and other tools are genuinely good at those.
              This one is for a person billing hourly.
            </p>
          </div>

          <ul className="flex min-w-0 flex-col gap-2">
            <Doesnt>Project boards</Doesnt>
            <Doesnt>Team seats</Doesnt>
            <Doesnt>Timesheet approvals</Doesnt>
            <Doesnt>&ldquo;Upgrade to Pro&rdquo;</Doesnt>
          </ul>
        </div>
      </Container>
    </section>
  );
}

/**
 * Objection handling, plainly.
 *
 * "Will this exist in a year?" is the hardest question a free billing tool
 * faces, and it is severe rather than idle: an invoice is a tax record. The
 * answer is not a promise about longevity — a promise from an unknown party
 * is worth nothing — but the fact that every invoice is a PDF the user has
 * already downloaded and sent. The no-email decision answered this before
 * anyone asked it.
 */
function Questions() {
  /* Answers are one or two sentences. They were three or four, which made
     this the biggest block of prose on the page and meant nobody would read
     the one that matters ("what if Stint goes away"). */
  const qs: { q: string; a: React.ReactNode }[] = [
    {
      q: 'Does it email the invoice for me?',
      a: (
        <>
          No, deliberately. Mail from a shared app domain gets spam-filtered on
          the way to your client. You send the PDF yourself, from your address.
        </>
      ),
    },
    {
      q: 'What if Stint goes away?',
      a: (
        <>
          Every invoice is a PDF you already downloaded, so it doesn&rsquo;t
          depend on us existing. Export the rest any time.
        </>
      ),
    },
    {
      q: 'Does it do taxes, expenses or mileage?',
      a: <>No. Hours and invoices. The PDF drops into your books fine.</>,
    },
    {
      q: 'Can I use it outside the US?',
      a: (
        <>
          You can, but it&rsquo;s built US-first &mdash; USD, ACH, 1099/W-9, no
          VAT. The defaults will fight you.
        </>
      ),
    },
  ];

  /* A single column of rules rather than a two-column grid: five stacked
     cells read as a form to fill in, where a rule-separated list reads as a
     conversation. It also makes the section narrow, which is a shape nothing
     else on the page has. */
  return (
    <section>
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-2xl">
          <h2 className="type-display text-balance text-strong">
            Reasonable questions.
          </h2>
          <dl className="mt-8 flex flex-col">
            {qs.map(({ q, a }) => (
              <div
                key={q}
                className="flex flex-col gap-1.5 border-t border-edge-subtle py-5 sm:flex-row sm:gap-8"
              >
                <dt className="type-heading min-w-0 text-strong sm:w-2/5 sm:flex-none">
                  {q}
                </dt>
                <dd className="type-support min-w-0 text-muted">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

function Closing() {
  return (
    <section>
      <Container className="py-24 text-center sm:py-32">
        {/* The hero took this section's old line ("Start the timer…"), which
            was the better headline of the two. The close now asks for the
            decision instead of restating the pitch — the last line before a
            CTA should lower the cost of clicking. */}
        <h2 className="type-hero text-balance text-strong">
          Your next invoice could build itself.
        </h2>
        <div className="mt-8 flex flex-col items-center gap-3">
          <CallToAction />
          <span className="type-meta max-w-sm text-subtle">
            Email link, no password. Nothing to install, no card, and your data
            exports whenever you want it.
          </span>
        </div>
      </Container>
    </section>
  );
}

/**
 * A free financial tool from an unknown party with no way to reach a human is
 * a trust hole, and the cheapest one on the page to plug.
 *
 * The support address waits on the domain — a personal Gmail on a billing
 * product reads less established than nothing at all, so the row ships with
 * the legal pages and gains the address when there is one to give.
 */
function Footer() {
  return (
    <footer className="border-t border-edge-subtle">
      <Container className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 py-10">
        <div>
          <span className="type-wordmark text-muted">Stint</span>
          <p className="type-meta mt-1 text-subtle">
            Time tracking and invoicing for solo contractors.
          </p>
        </div>
        <nav aria-label="Legal" className="flex items-center gap-5">
          <a
            href="/privacy"
            className="type-meta text-subtle hover:text-muted"
          >
            Privacy
          </a>
          <a href="/terms" className="type-meta text-subtle hover:text-muted">
            Terms
          </a>
        </nav>
      </Container>
    </footer>
  );
}
