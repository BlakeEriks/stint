/**
 * The calls the billing routes make to Stripe, in memory. Set as
 * `__TEST_STRIPE__`, the way `__TEST_DB__` stands in for PostgREST, so no
 * test reaches Stripe. Webhook signatures are not faked: tests sign with
 * the SDK's offline `generateTestHeaderString`, and the route verifies them
 * for real.
 */
export interface FakeSubscription {
  id: string;
  customer: string;
  status: string;
  metadata: { user_id?: string };
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  items: { data: Array<{ current_period_end: number }> };
}

export interface FakeSession {
  id: string;
  client_reference_id: string | null;
  customer: string | null;
}

export function fakeStripe() {
  const state = {
    /** Newest first, as Stripe lists them. */
    subscriptions: [] as FakeSubscription[],
    sessions: new Map<string, FakeSession>(),
    created: [] as Array<Record<string, unknown>>,
    portals: [] as Array<Record<string, unknown>>,
    canceled: [] as string[],
    /** Makes the next cancel fail, as an outage would. */
    failCancel: false,
  };

  const client = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          state.created.push(params);
          return {
            url: `https://checkout.stripe.test/${state.created.length}`,
          };
        },
        retrieve: async (id: string) => {
          const s = state.sessions.get(id);
          if (!s)
            throw Object.assign(new Error('No such checkout.session'), {
              statusCode: 404,
            });
          return s;
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params: Record<string, unknown>) => {
          state.portals.push(params);
          return { url: 'https://billing.stripe.test/session' };
        },
      },
    },
    subscriptions: {
      list: async ({ customer }: { customer: string }) => ({
        data: state.subscriptions.filter((s) => s.customer === customer),
      }),
      cancel: async (id: string) => {
        if (state.failCancel) throw new Error('Stripe is down');
        state.canceled.push(id);
        const s = state.subscriptions.find((x) => x.id === id);
        if (s) s.status = 'canceled';
        return s;
      },
    },
  };

  return { state, client };
}

/** A subscription a year out, paid, for `userId`. */
export function subscription(
  over: Partial<FakeSubscription> & { userId?: string } = {},
): FakeSubscription {
  const { userId, ...rest } = over;
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    metadata: userId ? { user_id: userId } : {},
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: 1_830_000_000 }] },
    ...rest,
  };
}
