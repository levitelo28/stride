/** Connects Apple Health and runs incremental syncs. Per-user flags live on the device (localStorage). */
import { connectHealth, healthAvailable, healthSupported, readHealth } from '@/health';

import { writeHealth } from './repo';

const key = (userId: string, name: string) => `stride.health.${name}.${userId}`;

/**
 * Bump when Stride asks Health for more data types or reads workouts differently. Devices on an older
 * version see Apple's permission sheet once more (only new types are shown) and re-read their workouts.
 * v2: distance and heart-rate types, so workouts come with their distance, start time and average HR.
 */
const READ_VERSION = '2';

function get(k: string): string | null {
  try {
    return globalThis.localStorage?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function set(k: string, v: string | null): void {
  try {
    if (v === null) globalThis.localStorage?.removeItem(k);
    else globalThis.localStorage?.setItem(k, v);
  } catch {
    // storage unavailable: the next sync simply starts from scratch
  }
}

export interface HealthStatus {
  supported: boolean;
  connected: boolean;
  lastSync: string | null;
}

export function healthStatus(userId: string | undefined): HealthStatus {
  const supported = healthSupported && healthAvailable();
  if (!userId) return { supported, connected: false, lastSync: null };
  return { supported, connected: get(key(userId, 'connected')) === '1', lastSync: get(key(userId, 'lastSync')) };
}

/** Read everything new from Health and save it. The anchor is stored only after the write succeeds. */
export async function syncHealth(userId: string): Promise<number> {
  if (get(key(userId, 'version')) !== READ_VERSION) {
    await connectHealth();
    set(key(userId, 'anchor'), null);
  }
  const read = await readHealth(get(key(userId, 'anchor')));
  await writeHealth(userId, read);
  set(key(userId, 'anchor'), read.anchor);
  set(key(userId, 'lastSync'), new Date().toISOString());
  set(key(userId, 'version'), READ_VERSION);
  return read.activities.length;
}

export async function connectAndSync(userId: string): Promise<number> {
  await connectHealth();
  set(key(userId, 'connected'), '1');
  set(key(userId, 'version'), READ_VERSION);
  set(key(userId, 'anchor'), null);
  return syncHealth(userId);
}

/** Stop syncing on this device. Data already saved stays; Health access itself is managed in iOS Settings. */
export function disconnectHealth(userId: string): void {
  set(key(userId, 'connected'), null);
  set(key(userId, 'anchor'), null);
  set(key(userId, 'lastSync'), null);
  set(key(userId, 'version'), null);
}
