import type { Pool } from "geotiff";

/**
 * Worker pools shared by every COG imagery provider and point/zonal reader.
 *
 * `terriajs-tiff-imagery-provider` creates two pools of `hardwareConcurrency`
 * workers per provider and never terminates the geotiff decoder pool on
 * `destroy()`. A COG time series builds one provider per COG per time step, so
 * scrubbing the timeline used to spawn (and leak) dozens of workers. Providers
 * are instead built with `workerPoolSize: 0` and pointed at these pools.
 */

/** Minimal shape of the provider's (unexported) resample worker pool. */
export interface CogResamplePool {
  size: number;
  resample(data: unknown, options: unknown): Promise<unknown>;
  destroy(): void;
}

let sharedGeotiffPool: Promise<Pool> | undefined;
let sharedResamplePool: CogResamplePool | undefined;
let resamplePoolResolved = false;

/** Between 2 and 4 workers, leaving one core for the main thread. */
export function getCogWorkerPoolSize(): number {
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.max(2, Math.min(4, cores - 1));
}

/** Lazily created geotiff decoder pool. Never destroyed: it lives for the session. */
export function getSharedGeotiffPool(): Promise<Pool> {
  if (!sharedGeotiffPool) {
    sharedGeotiffPool = import("geotiff").then(
      ({ Pool: GeotiffPool }) => new GeotiffPool(getCogWorkerPoolSize())
    );
  }
  return sharedGeotiffPool;
}

/**
 * Lazily created resample pool. The provider does not export its `WorkerPool`
 * class, so the constructor is harvested from a throwaway provider built with
 * `workerPoolSize: 0` (which spawns no workers). Returns `undefined` if the
 * library internals changed; callers then keep the provider's own main-thread
 * pool.
 */
export function getSharedResamplePool(
  TIFFImageryProviderCtor: new (options: any) => unknown
): CogResamplePool | undefined {
  if (!resamplePoolResolved) {
    resamplePoolResolved = true;
    try {
      const probe = new TIFFImageryProviderCtor({ workerPoolSize: 0 }) as any;
      const WorkerPoolCtor = probe?.workerPool?.constructor;
      if (
        typeof WorkerPoolCtor === "function" &&
        typeof probe.workerPool.resample === "function"
      ) {
        sharedResamplePool = new WorkerPoolCtor(getCogWorkerPoolSize());
      }
    } catch (e) {
      console.warn("COG: could not create a shared resample pool", e);
    }
  }
  return sharedResamplePool;
}

/**
 * Stand-in assigned to a provider right before `destroy()` so the library
 * terminates this no-op instead of the shared pool.
 */
export const DETACHED_RESAMPLE_POOL: CogResamplePool = {
  size: 0,
  resample: () => Promise.reject(new Error("COG imagery provider destroyed")),
  destroy: () => {}
};

/** Test hook: forget the shared pools (does not terminate running workers). */
export function resetCogSharedPoolsForTests(): void {
  sharedGeotiffPool = undefined;
  sharedResamplePool = undefined;
  resamplePoolResolved = false;
}
