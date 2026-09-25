import query from './db.js';
import { redis } from './redis.js';

/**
 * A health check has to answer quickly to be useful, and must not pile up
 * work while a dependency is hanging. Each probe is bounded, and only one
 * check runs at a time — concurrent callers share its result, so repeated
 * polling during an outage can't accumulate outstanding queries.
 */
const PROBE_TIMEOUT_MS = 2_000;

export type DependencyState = 'ok' | 'down';

export interface HealthReport {
  postgres: DependencyState;
  redis: DependencyState;
}

let inFlight: Promise<HealthReport> | null = null;

async function bounded(probe: Promise<unknown>): Promise<DependencyState> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<'down'>((resolve) => {
    timer = setTimeout(() => resolve('down'), PROBE_TIMEOUT_MS);
  });
  try {
    // A probe that loses the race is abandoned, not repeated: the dedupe
    // below means no new one starts until this settles.
    return await Promise.race([probe.then(() => 'ok' as const, () => 'down' as const), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function probeDependencies(): Promise<HealthReport> {
  const [postgres, redisState] = await Promise.all([
    bounded(query('SELECT 1')),
    bounded(redis.ping()),
  ]);
  return { postgres, redis: redisState };
}

export function checkHealth(): Promise<HealthReport> {
  inFlight ??= probeDependencies().finally(() => { inFlight = null; });
  return inFlight;
}

export function isHealthy(report: HealthReport): boolean {
  return report.postgres === 'ok' && report.redis === 'ok';
}
