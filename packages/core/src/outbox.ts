/**
 * Offline outbox.
 *
 * This replaces a sync engine. It is deliberately small because the
 * problem is small: one user, no concurrent editors, a few dozen writes
 * a day. Last-write-wins per entry is correct here, not a compromise.
 *
 * The storage layer is injected so web (IndexedDB), Expo (SQLite) and
 * macOS (SQLite) share this exact logic.
 */

import { uuidv7 } from './uuid.ts';

export type Entity = 'time_entry' | 'client' | 'project' | 'settings';
export type Op = 'create' | 'update' | 'delete';

export interface OutboxItem {
  /** Mutation id — distinct from the entity's id. */
  id: string;
  entity: Entity;
  entityId: string;
  op: Op;
  payload: Record<string, unknown>;
  clientUpdatedAt: string;
  attempts: number;
  lastError?: string;
}

export interface OutboxStore {
  add(item: OutboxItem): Promise<void>;
  /** Oldest first — order is preserved so dependent writes replay correctly. */
  list(limit?: number): Promise<OutboxItem[]>;
  remove(ids: string[]): Promise<void>;
  update(item: OutboxItem): Promise<void>;
  getCursor(): Promise<string | null>;
  setCursor(cursor: string): Promise<void>;
}

export function createMutation(
  entity: Entity,
  entityId: string,
  op: Op,
  payload: Record<string, unknown>,
): OutboxItem {
  return {
    id: uuidv7(),
    entity,
    entityId,
    op,
    payload,
    clientUpdatedAt: new Date().toISOString(),
    attempts: 0,
  };
}

/**
 * Collapse redundant mutations before sending.
 *
 * Editing one entry five times offline should produce one write, not
 * five. Order is preserved by keeping each entity at the position of its
 * FIRST mutation, since later writes may depend on earlier creates.
 */
export function coalesce(items: OutboxItem[]): OutboxItem[] {
  const byEntity = new Map<string, OutboxItem>();
  const order: string[] = [];

  for (const item of items) {
    const key = `${item.entity}:${item.entityId}`;
    const existing = byEntity.get(key);

    if (!existing) {
      byEntity.set(key, { ...item });
      order.push(key);
      continue;
    }

    // A delete supersedes everything queued before it.
    if (item.op === 'delete') {
      // Created and deleted while offline: the server never needs to know.
      if (existing.op === 'create') {
        byEntity.delete(key);
        order.splice(order.indexOf(key), 1);
      } else {
        byEntity.set(key, { ...item });
      }
      continue;
    }

    // Merge an update into whatever is already queued, preserving 'create'.
    byEntity.set(key, {
      ...existing,
      payload: { ...existing.payload, ...item.payload },
      clientUpdatedAt: item.clientUpdatedAt,
    });
  }

  return order.map((k) => byEntity.get(k)!).filter(Boolean);
}

export const MAX_ATTEMPTS = 5;

/** Exponential backoff with a 5-minute ceiling. */
export function backoffMs(attempts: number): number {
  return Math.min(1000 * 2 ** attempts, 5 * 60 * 1000);
}

/**
 * Whether a failed mutation should be retried.
 * 4xx (except 409/429) means the server rejected it on the merits —
 * retrying will fail identically, so it goes to the dead-letter path.
 */
export function isRetryable(status: number): boolean {
  if (status === 409 || status === 429) return true;
  return status >= 500 || status === 0; // 0 == network failure
}
