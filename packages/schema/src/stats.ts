import { z } from 'zod';
import { TimeEntry } from './entries.ts';
import { DraftActions } from './invoicing.ts';
import { currency, iso, money, timeZone, uuid } from './primitives.ts';

// ── summary (the menu bar endpoint) ────────────────────────────────
export const Summary = z.object({
  running: TimeEntry.nullable(),
  todaySeconds: z.number().int().nonnegative(),
  weekSeconds: z.number().int().nonnegative(),
  serverTime: iso,
});

export const SummaryQuery = z.object({ tz: timeZone });

/**
 * What a write may return beside its record, read after it in the same
 * request (`docs/api.md`, "Including what a write changed").
 */
export const IncludedName = z.enum(['summary', 'stats']);

/** A write's query: `?include=summary,stats&tz=…`. */
export const IncludeQuery = z.object({
  include: z
    .string()
    .transform((s) => s.split(','))
    .pipe(z.array(IncludedName))
    .optional(),
  tz: timeZone,
});
export const StatsQuery = z.object({ tz: timeZone });
export const ExportQuery = z.object({ tz: timeZone });

// ── home screen stats ──────────────────────────────────────────────
// One response for the whole card set: the cards render together, and a set
// that pops in piecemeal reads as broken.

export const UnbilledClient = z.object({
  /** Null for internal work — a project with no client. */
  clientId: uuid.nullable(),
  clientName: z.string(),
  currency,
  seconds: z.number().int().nonnegative(),
  amount: money,
  /** Entries with no resolvable rate: the total is incomplete, not low. */
  unratedCount: z.number().int().nonnegative(),
  /** Age of the oldest unbilled entry. A total is a fact; this is a prompt. */
  oldestDays: z.number().int().nonnegative(),
});

export const EarnedPoint = z.object({
  /** A business day, `YYYY-MM-DD` in the caller's zone. */
  date: z.string(),
  /**
   * Cumulative money earned to this day. Null beyond today.
   *
   * Null rather than flat, because a line held level to the 31st reads as a
   * month that stopped working rather than one still in progress. Weekend
   * work is carried onto the next business day's point, so the last non-null
   * value always equals the month's earned.
   */
  actual: z.number().nullable(),
});

/** One band of the month's client strip, and one key in the legend. */
export const MonthClient = z.object({
  /** Null for internal work — a project with no client, and so no hue. */
  clientId: uuid.nullable(),
  clientName: z.string(),
  amount: money,
});

export const MonthEarned = z.object({
  /**
   * The month's earned so far — the screen's hero figure.
   *
   * The series' own last point, never a separate sum: the projection
   * extrapolates that series, and a figure taken from a second source would
   * disagree with the line drawn beneath it.
   */
  earned: money,
  /**
   * Where the month lands if it keeps earning at the rate it has so far.
   *
   * Null until three business days have elapsed. Earned-so-far over one
   * elapsed day carried across twenty-two is one day's work multiplied by the
   * month — a figure that swings by thousands on the second day — so it is
   * withheld rather than guessed at. It extrapolates what was earned and
   * reads no target of any kind.
   */
  projected: money.nullable(),
  businessDaysElapsed: z.number().int().nonnegative(),
  businessDaysTotal: z.number().int().nonnegative(),
  /** One point per business day of the month: the solid cumulative line. */
  series: z.array(EarnedPoint),
  /** The dashed segment from today to month end. Null whenever `projected`
   *  is — there is no second endpoint to draw to. */
  projection: z
    .object({
      from: z.object({ date: z.string(), amount: money }),
      to: z.object({ date: z.string(), amount: money }),
    })
    .nullable(),
  /**
   * The month's money per client — the strip beneath the climb.
   *
   * MONEY, where the week's bars are seconds: the month's subject is Earned,
   * so its split divides what was earned. Ordered by amount descending, which
   * is the order the legend names them in.
   */
  byClient: z.array(MonthClient),
});

export const WeekDay = z.object({
  /** `YYYY-MM-DD` in the caller's zone. */
  date: z.string(),
  /**
   * All billable worked time that day — the bar's height.
   *
   * Counts work whose rate chain resolves to null, which `amount` does not:
   * that time was worked, and dropping it would draw a short day that was
   * not short.
   */
  seconds: z.number().int().nonnegative(),
  /** The figure at the bar's head, null when the day resolves no rate. A
   *  day of unrated work has a real height and no money to print. */
  amount: money.nullable(),
  /**
   * The day's billable seconds per client id — how the bar is stacked. Work
   * with no client keys as `''`. The parts add up to `seconds`, within a
   * second for a running session: SQL and JS each measure it to `now`.
   */
  byClient: z.record(z.string(), z.number()),
});

export const Stats = z.object({
  currency,
  unbilled: z.object({
    /** Work done and not yet invoiced, a running timer's session so far
     *  included. Never "earned" and never "revenue". */
    total: money,
    /** Rows in another currency are left out of `total`, which is only the
     *  response's `currency`. */
    mixed: z.boolean(),
    seconds: z.number().int().nonnegative(),
    byClient: z.array(UnbilledClient),
    moreClients: z.number().int().nonnegative(),
  }),
  /**
   * What today's work is worth, bucketed by the entry's own date in `tz`. A
   * running timer counts up to the response, priced as it would bill if
   * stopped then, so the stop moves nothing.
   *
   * A property of the data, not of this browser: it reads the same at 9am and
   * at midnight, on a laptop and a phone, on a first visit and a fiftieth.
   * Unrated work earns nothing it can name, so the figure can understate a
   * day whose rate chain resolves to null.
   *
   * Nonnegative by construction — it sums today's entries, so removing one
   * lowers it toward zero and never past it.
   */
  earnedToday: money,
  /**
   * The week's seven bars, oldest first, starting on the user's own
   * `weekStartsOn`.
   *
   * Always seven entries: a day with no work is present at zero rather than
   * absent, which is what holds every weekday label on one baseline.
   */
  week: z.array(WeekDay),
  /** The month's earned, its cumulative line, and where that line lands. */
  month: MonthEarned,
  /** Invoiced and not yet collected. Never summed with `unbilled` — that
   *  would double-count the same hours. */
  awaitingPayment: money,
  /**
   * How many invoices make up `awaitingPayment`.
   *
   * The count rather than a description of the worst of them: naming one
   * invoice says nothing about the others, and at two or more it drops them
   * silently. Which invoice is late is the inbox's subject, where it arrives
   * with the action that answers it.
   */
  openInvoiceCount: z.number().int().nonnegative(),
  /**
   * Money that has arrived — `sum(total)` over paid invoices, bucketed by
   * `paid_at`.
   *
   * The only finished figure on the screen: the work is done, the invoice is
   * settled, and nothing downstream revises it. `unbilled` can still be
   * discounted or written off and `awaitingPayment` can still go unpaid, so
   * neither is ever summed with this.
   */
  collected: z.object({
    /**
     * Trailing twelve months, which is the figure Home leads with.
     *
     * A calendar month reads `0` for most of every month when a contractor is
     * paid monthly, and resets the morning after a payment clears. A trailing
     * window never reads zero and never walks backwards on the 1st.
     */
    trailing12: money,
    /** The calendar month, for the line under the figure. `0` is normal. */
    thisMonth: money,
    /**
     * Whole days since the most recent `paid_at`, or null when nothing has
     * ever been paid.
     *
     * The cadence signal: invoiced monthly, this is how a late payment is
     * noticed without arithmetic.
     */
    daysSincePaid: z.number().int().nonnegative().nullable(),
    /**
     * The last six months, oldest first — the plot's whole input.
     *
     * Six rather than twelve: at the panel's width twelve points make one
     * month an illegible share of the picture, and eleven months back is not
     * a horizon anyone acts on. A month with no payments is present at `0`,
     * so a gap is a quiet month rather than missing data.
     */
    byMonth: z.array(
      z.object({
        /** `YYYY-MM`, in the request's time zone. */
        month: z.string(),
        amount: money,
      }),
    ),
  }),
  attention: z.object({
    /** The account has no default hourly rate: the Inbox asks for one. */
    noDefaultRate: z.boolean(),
    /** Old free-text terms that read as no number of days: the Inbox asks
     *  the user to check the 30 they became. */
    paymentTermsToCheck: z.string().nullable(),
    overdueInvoices: z.array(
      z.object({
        invoiceId: uuid,
        invoiceNumber: z.string(),
        clientId: uuid,
        clientName: z.string().nullable(),
        amount: money,
        currency,
        daysLate: z.number().int(),
      }),
    ),
    staleDrafts: z.array(
      z.object({
        invoiceId: uuid,
        invoiceNumber: z.string(),
        clientId: uuid,
        clientName: z.string().nullable(),
        amount: money,
        currency,
        ageDays: z.number().int(),
        /** Whether its PDF and Mark sent would refuse it now. */
        refuses: DraftActions,
      }),
    ),
    /** Billable work past due to bill, one row per client (`unbilledDue` in
     *  `@stint/core`): in an ended period of a scheduled client, or older
     *  than `UNBILLED_DUE_DAYS` for any other. `periodStart`..`periodEnd`
     *  span the work; `onePeriod` says they are one of the client's
     *  periods. */
    unbilledDue: z.array(
      z.object({
        clientId: uuid,
        clientName: z.string(),
        entryIds: z.array(uuid),
        seconds: z.number().int().nonnegative(),
        since: z.iso.date(),
        periodStart: z.iso.date(),
        periodEnd: z.iso.date(),
        onePeriod: z.boolean(),
      }),
    ),
    /** Unbilled billable work dated inside a sent or paid invoice's period
     *  for its client, oldest first: billed nowhere until the user says. */
    lateEntries: z.array(
      z.object({
        entryId: uuid,
        taskName: z.string(),
        startedAt: z.iso.datetime(),
        hours: z.number().nonnegative(),
        clientId: uuid,
        clientName: z.string().nullable(),
        invoiceId: uuid,
        invoiceNumber: z.string(),
        periodStart: z.iso.date(),
        periodEnd: z.iso.date(),
      }),
    ),
    /** One row per entry, oldest first. Empty array, never null. */
    unprojected: z.array(
      z.object({
        entryId: uuid,
        taskName: z.string(),
        startedAt: z.iso.datetime(),
        seconds: z.number().int().nonnegative(),
      }),
    ),
    /**
     * Entries whose length is implausible — under `minEntrySeconds` or over
     * `maxEntryHours`, and not yet answered with `durationOk`.
     */
    strangeDurations: z.array(
      z.object({
        entryId: uuid,
        kind: z.enum(['short', 'long']),
        taskName: z.string(),
        projectName: z.string().nullable(),
        clientName: z.string().nullable(),
        startedAt: z.iso.datetime(),
        seconds: z.number().int().nonnegative(),
      }),
    ),
    /**
     * Pairs of entries sharing a minute or more, at least one unbilled —
     * except non-billable work against billed time, which bills nothing twice.
     * `entryId` is unbilled; `otherInvoiceNumber` names the invoice holding
     * the other, if one does. Derived per request, so editing either entry
     * clears the row.
     */
    overlaps: z.array(
      z.object({
        entryId: uuid,
        taskName: z.string(),
        otherEntryId: uuid,
        otherTaskName: z.string(),
        otherInvoiceNumber: z.string().nullable(),
        startedAt: z.iso.datetime(),
        seconds: z.number().int().positive(),
      }),
    ),
  }),
});

/** The reads a write's `include` named, each in its own GET's shape. */
export const Included = z.object({
  summary: Summary.optional(),
  stats: Stats.optional(),
});

/**
 * `POST /timer/stop`: the stopped entry, plus Unbilled as it stands with that
 * entry in it — `/stats`'s own figure, so a client shows the new total from
 * the call it already made rather than predicting the delta from its own copy
 * of the rate chain. `included` is there when the request asked for it.
 */
export const StoppedTimer = z.object({
  entry: TimeEntry,
  currency,
  unbilled: Stats.shape.unbilled,
  included: Included.optional(),
});

/** A timer start or entry `PATCH` asked to `include`: the record beside them. */
export const WrittenEntry = z.object({ entry: TimeEntry, included: Included });

export type Summary = z.infer<typeof Summary>;
export type Stats = z.infer<typeof Stats>;
export type StoppedTimer = z.infer<typeof StoppedTimer>;
export type Included = z.infer<typeof Included>;
export type IncludedName = z.infer<typeof IncludedName>;
export type MonthEarned = z.infer<typeof MonthEarned>;
export type WeekDay = z.infer<typeof WeekDay>;
export type UnbilledClient = z.infer<typeof UnbilledClient>;
export type MonthClient = z.infer<typeof MonthClient>;
