import { z } from 'zod';
import { ApiError } from './errors';

/** Parses a JSON body, turning a Zod failure into a documented 422. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError('VALIDATION_FAILED', 'Request body must be valid JSON');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Request body failed validation',
      z.treeifyError(result.error),
    );
  }
  return result.data;
}

/** Same for query parameters. */
export function parseQuery<T extends z.ZodType>(req: Request, schema: T): z.infer<T> {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ApiError(
      'VALIDATION_FAILED',
      'Query parameters failed validation',
      z.treeifyError(result.error),
    );
  }
  return result.data;
}
