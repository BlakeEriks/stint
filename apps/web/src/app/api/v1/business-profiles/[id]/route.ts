import { BUSINESS_PROFILES, profileItem } from '@/lib/profiles';

const routes = profileItem(BUSINESS_PROFILES);
export const GET = routes.GET;
export const PATCH = routes.PATCH;
export const DELETE = routes.DELETE;
