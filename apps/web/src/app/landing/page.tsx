import type { Metadata } from 'next';
import { Laptop, Monitor, Smartphone } from 'lucide-react';
import Image from 'next/image';
import { DemoTimer } from '@/components/marketing/demo-timer';
import { ScrollRegion } from '@/components/marketing/scroll-region';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { DemoMonth } from '@/components/marketing/demo-month';
import macTimer from './mac-timer.png';

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
    'Time tracking and invoicing for solo contractors. No seats, no team plan, no sales call. Free during beta.',
  openGraph: {
    title: 'Time tracking and invoicing for solo contractors.',
    description:
      'Track the hours, see what you’re owed, send the invoice. Free during beta.',
    type: 'website',
  },
};

/**
 * Sign-in lives on the app subdomain, so the header's link is cross-origin —
 * a plain `<a>`, not `next/link`, which would try to route it client-side
 * within this origin.
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

       GROUNDS STRICTLY ALTERNATE, base / recessed. Adding or removing a
       section means re-checking the whole run, not just the neighbor above
       it — both times this drifted, it was because one section moved and the
       rest were left alone, and the banding then reads as accidental rather
       than as a rhythm. */
    <main>
      <Header />
      <Hero />
      <Unbilled />
      <Invoice />
      <Platforms />
      <Price />
      <Questions />
      <Closing />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <Container className="flex items-center justify-between py-6">
      <Wordmark />
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
 * The accent is spent on the timer and on Get started, the action this
 * page exists to complete. It never marks anything else on this page.
 */
function Hero() {
  return (
    <Container className="pt-12 pb-24 sm:pt-20 sm:pb-32">
      {/* Two columns above `lg`: the argument on the left, the product on the
          right. Stacked below it, where a side-by-side would starve both. The
          left is wide enough to set the headline on two lines. */}
      {/* `grid-cols-[minmax(0,1fr)]` at every breakpoint, not just `lg`: a
          grid item defaults to `min-width: auto`, so the timer card's
          intrinsic width sets the single column on a phone and the whole page
          scrolls sideways. The explicit track is what lets it shrink. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-12 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h1 className="type-hero text-balance text-strong">
              Time tracking and invoicing for solo contractors.
            </h1>
            <p className="type-lede max-w-md text-muted">
              No seats, no team plan, no sales call.
            </p>
          </div>

          <div className="mt-4 flex flex-col items-start gap-3">
            <GetStarted />
            <span className="type-meta text-subtle">
              Free during beta. No card.
            </span>
          </div>
        </div>

        <DemoTimer />
      </div>
    </Container>
  );
}

/**
 * A section whose argument and evidence sit side by side above `lg`.
 *
 * `recessed` puts the section on the surface *below* the page ground, which
 * is how the page gets rhythm without alternating bands of unrelated color —
 * the same recession the app's nav rail uses.
 */
function SplitSection({
  title,
  lede,
  aside,
  below,
  recessed = false,
  reverse = false,
}: {
  title: string;
  lede: React.ReactNode;
  aside: React.ReactNode;
  below?: React.ReactNode;
  recessed?: boolean;
  reverse?: boolean;
}) {
  return (
    <section className={recessed ? 'bg-surface-recessed' : undefined}>
      <Container className="py-20 sm:py-28">
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div className={`min-w-0 ${reverse ? 'lg:order-2' : ''}`}>
            <h2 className="type-display text-balance text-strong">{title}</h2>
            <div className="type-body mt-2 max-w-md text-muted">{lede}</div>
            {below ? <div className="mt-8">{below}</div> : null}
          </div>
          <div className={`min-w-0 ${reverse ? 'lg:order-1' : ''}`}>
            {aside}
          </div>
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
    <section className="bg-surface-recessed">
      {/* The heading above, not beside: the month region needs the full
          width to lay out as it does on Home at laptop width. */}
      <Container className="py-20 sm:py-28">
        <h2 className="type-display text-balance text-strong">
          Unbilled work, in dollars.
        </h2>
        <p className="type-body mt-2 max-w-md text-muted">
          Every hour is priced at its client&rsquo;s rate, so the home screen
          shows what&rsquo;s unbilled and what the month is on track for.
        </p>
        <DemoMonth />
      </Container>
    </section>
  );
}

/**
 * The deliverable, and the page's strongest asset — so it gets the full
 * width and a centered heading rather than a column beside a paragraph. It is
 * the only section that breaks the left-aligned rhythm, which is what makes
 * it read as the exhibit.
 */
function Invoice() {
  return (
    <section>
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="type-display text-balance text-strong">
            The invoice your client gets.
          </h2>
          <p className="type-body mt-2 text-muted">
            Built from your tracked hours, at the rate each was worked, with
            your expenses and ACH details. Nothing is retyped, and a sent
            invoice never changes.
          </p>
        </div>

        <div className="mt-12">
          <InvoicePreview />
        </div>
      </Container>
    </section>
  );
}

/**
 * Drawn, where the rest of the page shows screenshots: the invoice is the
 * deliverable, and set in HTML its figures stay sharp at any width, where a
 * picture of the PDF would blur and show nothing more.
 *
 * Deliberately rendered on white with near-black figures. The real PDF sets
 * its total in the light-theme accent, which is correct on paper but would
 * put a second green meaning on this page beside the CTA.
 */
function InvoicePreview() {
  /* The standard template's sections, filled as a real month would fill
     them: two rates, an expense, terms and the ACH block. */
  const services = [
    ['Onboarding email sequence rework', '12.25', '$175.00', '$2,143.75'],
    ['Checkout validation fixes', '8.50', '$175.00', '$1,487.50'],
    ['Q4 retainer scoping call', '1.75', '$220.00', '$385.00'],
  ];
  const payment: [string, string][] = [
    ['Account holder', 'Your name here'],
    ['Bank', 'Your bank'],
    ['Account number', '000123456789'],
    ['Routing number (ACH)', '000000000'],
    ['Account type', 'Checking'],
    ['Payment reference', 'INV-0042'],
  ];
  const label = 'type-label text-print-faint';
  const muted = 'type-support text-print-muted';

  return (
    /* The invoice needs 34rem to stay legible, so on a phone it scrolls
       inside its own container rather than shrinking into unreadability. */
    <div className="mt-2">
      <ScrollRegion
        aria-label="Sample invoice"
        className="overflow-x-auto rounded-lg shadow-float"
      >
        <div className="min-w-[34rem] bg-print-ground p-6 text-print-ink sm:p-8">
          <div className="flex items-start justify-between gap-4">
            {/* A generic example, never a real person: this page is public and
              the invoice carries a name, an email and bank details. */}
            <div className="flex flex-col">
              <span className="type-heading">Your name here</span>
              <span className={muted}>Austin, TX</span>
              <span className={muted}>you@yourdomain.com</span>
            </div>
            <div className="text-right">
              <div className="type-section">INVOICE</div>
              <div className="type-meta text-print-muted">INV-0042</div>
            </div>
          </div>

          <div className="mt-6 flex items-start justify-between gap-6">
            <div className="flex flex-col">
              <span className={label}>BILLED TO</span>
              <span className="type-heading mt-1">Northwind Trading</span>
              <span className={muted}>Portland, OR</span>
              <span className={muted}>ap@northwind.example</span>
            </div>
            <div className="flex flex-col items-end gap-3 text-right">
              <div className="flex gap-7">
                <div className="flex flex-col items-end">
                  <span className={label}>ISSUED</span>
                  <span className="type-control mt-1">Nov 1, 2026</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className={label}>DUE</span>
                  <span className="type-heading mt-1">Nov 15, 2026</span>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className={label}>PERIOD</span>
                <span className={`${muted} mt-1`}>
                  Oct 1, 2026 &ndash; Oct 31, 2026
                </span>
              </div>
            </div>
          </div>

          <table className="mt-6 w-full border-collapse">
            <thead>
              <tr className="border-b border-print-ink">
                <th className={`${label} pb-2 text-left`}>DESCRIPTION</th>
                <th className={`${label} pb-2 text-right`}>QTY</th>
                <th className={`${label} pb-2 text-right`}>RATE</th>
                <th className={`${label} pb-2 text-right`}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              {services.map(([desc, qty, rate, amount]) => (
                <tr key={desc} className="border-b border-print-hairline">
                  <td className="type-control py-2">{desc}</td>
                  <td className="type-duration py-2 text-right">{qty}</td>
                  <td className="type-duration py-2 text-right">{rate}</td>
                  <td className="type-duration py-2 text-right">{amount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr className="border-b border-print-ink">
                <th className={`${label} pb-2 text-left`}>EXPENSES</th>
                <th className={`${label} pb-2 text-right`}>DATE</th>
                <th className={`${label} pb-2 text-right`}>AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-print-hairline">
                <td className="type-control py-2">Staging server</td>
                <td className="type-duration py-2 text-right">Oct 14, 2026</td>
                <td className="type-duration py-2 text-right">$48.00</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 ml-auto flex w-64 flex-col">
            <div className="flex justify-between py-0.5">
              <span className={muted}>Services</span>
              <span className="type-duration">$4,016.25</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className={muted}>Expenses</span>
              <span className="type-duration">$48.00</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between border-t border-print-ink pt-2">
              <span className="type-heading">Amount due</span>
              <span className="type-amount-hero">$4,064.25</span>
            </div>
            <span className="type-meta mt-1 text-print-faint">Net 15</span>
          </div>

          <div className="mt-6 border-l-2 border-print-ink bg-print-band p-3">
            <p className="type-heading">Payment details</p>
            <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
              {payment.map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <dt className="type-label text-print-muted">
                    {k.toUpperCase()}
                  </dt>
                  <dd className="type-duration">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </ScrollRegion>

      {/* Only below sm, where the content box is narrower than 34rem. */}
      <p className="type-meta mt-3 text-center text-subtle sm:hidden">
        Scroll the invoice to see the rates and the total &rarr;
      </p>
    </div>
  );
}

function Platforms() {
  const surfaces = [
    { icon: Laptop, label: 'Web', detail: 'Every screen' },
    { icon: Monitor, label: 'Mac', detail: 'Menu bar' },
    { icon: Smartphone, label: 'Phone', detail: 'Start and stop anywhere' },
  ];

  return (
    <SplitSection
      recessed
      reverse
      title="Start it in the menu bar. Stop it from your phone."
      lede={<>One timer on the web, your Mac and your phone.</>}
      below={
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
      aside={
        <>
          {/* The Mac panel, captured with `apps/macos/qa.sh shot` signed in
              as the seeded local account, then cropped to its timer and
              today: below that it lists task names. */}
          <Image
            src={macTimer}
            alt="Stint's Mac menu bar panel: a running timer, its task and project, and today's hours and their value"
            sizes="20rem"
            className="mx-auto h-auto w-full max-w-xs rounded-xl shadow-float"
          />
        </>
      }
    />
  );
}

/** The page's one action. Sign-in creates the account on first use. */
function GetStarted() {
  return (
    <Button asChild variant="accent" className="h-10 px-5">
      <a href={SIGN_IN_URL}>Get started</a>
    </Button>
  );
}

/**
 * The price: a centered statement over the two things a user pays for or
 * doesn't, side by side, so free tracking reads as part of the price.
 */
function Price() {
  const plans = [
    {
      label: 'TRACKING',
      figure: 'Free',
      detail: 'Clients, hours, your records and every export.',
    },
    {
      label: 'INVOICING',
      figure: '$3.33/month',
      detail: 'Billed annually, once beta ends.',
    },
  ];

  return (
    <section>
      <Container className="py-20 sm:py-28">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="type-display text-balance text-strong">
            Free during beta.
          </h2>
          <p className="type-body mt-2 text-muted">
            Accounts made during beta keep this price for life.
          </p>
        </div>

        <dl className="mx-auto mt-12 grid max-w-2xl divide-y divide-edge-control overflow-hidden rounded-lg bg-surface-primary shadow-card sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {plans.map(({ label, figure, detail }) => (
            <div key={label} className="flex flex-col gap-2 p-6 sm:p-8">
              <dt className="type-label text-subtle">{label}</dt>
              <dd className="type-amount-hero text-strong">{figure}</dd>
              <dd className="type-support text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

/** What a contractor asks before switching, answered in a sentence or two. */
function Questions() {
  const qs: { q: string; a: React.ReactNode }[] = [
    {
      q: 'Can I bring my hours from Toggl?',
      a: (
        <>
          Yes. Export a detailed report from Toggl Track as CSV, review what it
          adds, then import it.
        </>
      ),
    },
    {
      q: 'Does Stint email invoices to my clients?',
      a: (
        <>
          No. Mail from a shared app domain gets spam-filtered on the way to
          your client, so you send the PDF yourself, from your address.
        </>
      ),
    },
    {
      q: 'Can I export my data?',
      a: <>Yes. Your entries and invoices download as CSV any time.</>,
    },
    {
      q: 'Does it do taxes or mileage?',
      a: <>No. Hours, expenses and invoices.</>,
    },
    {
      q: 'Can I use it outside the US?',
      a: <>You can, but it&rsquo;s built US-first: USD and ACH. No VAT.</>,
    },
  ];

  /* A single column of rules rather than a grid: stacked cells read as a form
     to fill in, where a rule-separated list reads as a conversation. */
  return (
    <section className="bg-surface-recessed">
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
        {/* The close asks for the decision rather than restating the pitch —
            the last line before a CTA lowers the cost of clicking. */}
        <h2 className="type-hero text-balance text-strong">
          Track the hours. Send the invoice.
        </h2>
        <div className="mt-8 flex flex-col items-center gap-3">
          <GetStarted />
          <span className="type-meta max-w-sm text-subtle">
            Free during beta. Nothing to install, no card, and your data exports
            whenever you want it.
          </span>
        </div>
      </Container>
    </section>
  );
}

/**
 * A financial tool from an unknown party with no way to reach a human is
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
          {/* Receded, unlike the header's. The footer is where the page ends
              rather than where it introduces itself. */}
          <Wordmark className="text-muted" />
          <p className="type-meta mt-1 text-subtle">
            Time tracking and invoicing for solo contractors.
          </p>
        </div>
        <nav aria-label="Legal" className="flex items-center gap-5">
          <a href="/privacy" className="type-meta text-subtle hover:text-muted">
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
