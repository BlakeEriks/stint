import { PAYMENT_PROFILES, profileItem } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

const routes = profileItem(PAYMENT_PROFILES);
export const GET = routes.GET;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
