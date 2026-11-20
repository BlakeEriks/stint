import { PAYMENT_PROFILES, profileCollection } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

const routes = profileCollection(PAYMENT_PROFILES);
export const GET = routes.GET;
export const POST = routes.POST;
