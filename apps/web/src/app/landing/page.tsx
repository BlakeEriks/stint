import type { Metadata } from 'next';
import {
  ArrowRight,
  Check,
  Laptop,
  Monitor,
  Smartphone,
  X,
} from 'lucide-react';
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
 * The macOS and mobile apps are being built in parallel. Until they ship,
 * section 04 claims something a visitor can immediately falsify by going
 * looking for a download — which is a trust failure on the same axis the
 * product is built to defend. Flip this to `true` the day they land.
 */
const SHOW_PLATFORMS = false;

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
    <main>
      <Header />
      <Hero />
      <Unbilled />
      <Invoice />
      {SHOW_PLATFORMS ? <Platforms /> : null}
      <Free />
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
          {/* The headline IS the scope: three things it does, then the things
              it refuses. The refusal used to be subtext in a paragraph, where
              it was the most differentiating sentence on the page and nobody
              would read it.

              The struck-through items are MUTED AND STRUCK, not red. Red is
              this app's danger channel — it means something is wrong — and a
              stack of red marks reads as "this product is broken" for the
              half-second before it parses. Grey plus a line through it reads
              as "deliberately not included", which is the proud version of
              the same fact. */}
          <h1 className="flex flex-col gap-1.5">
            <span className="sr-only">
              Stint tracks hours, sends invoices and gets you paid. It has no
              project boards, no team seats, no timesheet approvals and no
              upgrade prompts. It is free.
            </span>
            <Does>Track hours.</Does>
            <Does>Send invoices.</Does>
            <Does>Get paid.</Does>
          </h1>

          <ul className="mt-5 flex flex-col gap-2" aria-hidden>
            <Doesnt>Project boards</Doesnt>
            <Doesnt>Team seats</Doesnt>
            <Doesnt>Timesheet approvals</Doesnt>
            <Doesnt>&ldquo;Upgrade to Pro&rdquo;</Doesnt>
          </ul>

          {/* The price, as a statement rather than a footnote. "Free" is the
              second-most differentiating claim on the page after the refusal
              above it, and it was previously the tail of a paragraph. The
              rule to its left groups it as one block without making it a card
              — a card here would compete with the timer beside it. */}
          <div className="mt-8 border-l-2 border-edge-control pl-5">
            <p className="type-display text-strong">Free.</p>
            <p className="type-body mt-1.5 max-w-sm text-muted">
              Not free-for-now, not free-until-you-grow. Every feature, every
              export, no card. There&rsquo;s no team plan to sell you, because
              there&rsquo;s only ever one of you.
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <CallToAction />
            <span className="type-meta text-subtle">
              Email link, no password.
            </span>
          </div>
        </div>

        <DemoTimer />
      </div>
    </Container>
  );
}

/**
 * A thing the product does.
 *
 * The tick is the accent. This is the one place the marketing page departs
 * from the in-app rule that green only ever means "time is accruing": here it
 * is the brand mark, and the three things it sits beside ARE the product, so
 * it reads as one meaning rather than several. The CTA below is the same
 * green and the same promise, which is what keeps it coherent.
 */
function Does({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <Check
        aria-hidden
        strokeWidth={2.5}
        className="size-6 flex-none text-accent-default sm:size-7"
      />
      <span className="type-hero text-strong">{children}</span>
    </span>
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
      title="You don't need a project management suite. You need to know what you're owed."
      lede={
        <>
          Stint knows your rates, so it can answer the one question you
          can&rsquo;t do in your head: how much work is sitting there
          un-invoiced, and for whom. Most trackers can&rsquo;t &mdash; they
          only count hours.
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
          <h2 className="type-display text-balance text-strong">
            This is what your client gets.
          </h2>
          <p className="type-body mt-4 text-muted">
            Your hours, grouped by task, at the rate each one was worked. Your
            rates freeze onto the invoice the moment you generate it &mdash;
            re-download it a year later and it&rsquo;s the same document, to
            the cent.
          </p>
        </div>

        <div className="mt-12">
          <InvoicePreview />
        </div>

        <p className="type-support mx-auto mt-6 max-w-lg text-center text-subtle">
          Payment details render on the invoice and nowhere else, with a line
          telling your client to call you if they ever change. That&rsquo;s
          how invoice fraud gets caught.
        </p>
      </Container>
    </section>
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
    <div className="mt-2 overflow-x-auto rounded-lg shadow-float">
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
  );
}

/** Gated by SHOW_PLATFORMS until the native apps actually exist. */
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
          One timer, one truth, on the web, your Mac&rsquo;s menu bar and your
          phone. The apps aren&rsquo;t shrunken copies of each other &mdash;
          each one does the thing only it can do.
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
 * The price, with its reason — framed as patronage rather than a feature
 * gate, because "no upsell" and a capability paywall cannot both be true.
 */
function Free() {
  return (
    <SplitSection
      recessed
      title="Free to use, fully."
      lede={
        <>
          <p>
            Every feature, every number, every export. Nothing is held back,
            nothing expires, and there&rsquo;s no seat to upgrade because
            there&rsquo;s only ever one of you.
          </p>
          <p className="mt-4">
            Later, a few dollars a month will take the Stint mark off your
            invoices. That&rsquo;s the only thing it buys &mdash; nothing that
            affects whether you get paid will ever sit behind it.
          </p>
        </>
      }
      aside={
        /* The three promises: one line in the spec, three rows here, because
           in a column each one is a separate guarantee and reads as a list of
           commitments rather than a run-on sentence. Still no cards. */
        <dl className="flex flex-col gap-5 border-l-2 border-edge-default pl-6">
          <Guarantee
            term="One timer, always."
            detail="Overlapping entries aren't cleaned up later — the database makes them impossible."
          />
          <Guarantee
            term="It never edits your hours."
            detail="Forgot to stop at 5pm? Stint shows you and asks. It doesn't guess and trim."
          />
          <Guarantee
            term="Your rates freeze on the invoice."
            detail="Change your rate tomorrow and every invoice you already issued stays exactly as it was."
          />
        </dl>
      }
    />
  );
}

function Guarantee({ term, detail }: { term: string; detail: string }) {
  return (
    <div>
      <dt className="type-heading text-strong">{term}</dt>
      <dd className="type-support mt-1 text-muted">{detail}</dd>
    </div>
  );
}

function Closing() {
  return (
    <section>
      <Container className="py-24 text-center sm:py-32">
        <h2 className="type-hero text-balance text-strong">
          Two things, done properly.
        </h2>
        <div className="mt-8 flex flex-col items-center gap-3">
          <CallToAction />
          <span className="type-meta text-subtle">
            Free, no card, no trial countdown.
          </span>
        </div>
      </Container>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-edge-subtle">
      <Container className="flex flex-wrap items-center justify-between gap-4 py-8">
        <span className="type-wordmark text-muted">Stint</span>
        <p className="type-meta text-subtle">
          Time tracking and invoicing for solo contractors.
        </p>
      </Container>
    </footer>
  );
}
