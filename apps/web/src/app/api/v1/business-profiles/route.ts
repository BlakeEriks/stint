import { BUSINESS_PROFILES, profileCollection } from '@/lib/profiles';

export const dynamic = 'force-dynamic';

const routes = profileCollection(BUSINESS_PROFILES);
export const GET = routes.GET;
export const POST = routes.POST;
