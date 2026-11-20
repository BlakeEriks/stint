import { BUSINESS_PROFILES, profileCollection } from '@/lib/profiles';

const routes = profileCollection(BUSINESS_PROFILES);
export const GET = routes.GET;
export const POST = routes.POST;
