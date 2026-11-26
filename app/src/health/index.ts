// Apple Health exists only on iPhone. Web and Android (Health Connect comes later) use this stand-in.
import type { HealthRead } from './types';

export type { HealthRead } from './types';

export const healthSupported = false;

export function healthAvailable(): boolean {
  return false;
}

export async function connectHealth(): Promise<boolean> {
  return false;
}

export async function readHealth(_anchor: string | null): Promise<HealthRead> {
  throw new Error('Apple Health is only available in the iPhone app');
}
