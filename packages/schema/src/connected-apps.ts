import { z } from 'zod';
import { iso, uuid } from './primitives.ts';

/** An app the user approved through Supabase's OAuth server, such as Claude. */
export const ConnectedApp = z.object({
  clientId: uuid,
  name: z.string(),
  grantedAt: iso,
});
export type ConnectedApp = z.infer<typeof ConnectedApp>;
