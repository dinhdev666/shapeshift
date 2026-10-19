// P10: ambient type declarations for the ss* globals that core/ files publish
// onto globalThis. Without these, `tsc --noEmit` reports TS7017 for every
// `globalThis.ssFoo` access because the global scope has no index signature.
// This file is consumed only by the typecheck pass; it does not ship in dist/.

declare global {
  // eslint-disable-next-line no-var
  var chrome: {
    storage: {
      local: { get(keys: string | string[]): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> };
    };
    runtime: { id?: string; onMessage?: unknown; getManifest?: () => { version?: string } };
    tabs: unknown;
    alarms: unknown;
  };

  var ssConfig: Record<string, unknown>;
  var ssConfigSchema: {
    version: number;
    defaults: Record<string, unknown>;
    flatDefaults: Record<string, unknown>;
    flatToNested: (v: Record<string, unknown>) => Record<string, unknown>;
    migrations: Record<string, (v: Record<string, unknown>) => Record<string, unknown>>;
    presets: Record<string, Record<string, unknown>>;
  };
  var ssDefaultConfig: Record<string, unknown>;
  var ssFlatDefaults: Record<string, unknown>;
  var ssFlatToNested: (v: Record<string, unknown>) => Record<string, unknown>;

  var ssHashString: (str: string) => number;
  var ssMixString: (...parts: unknown[]) => number;
  var ssClampIterations: (value: number, fallback: number) => number;
  var ssDeriveSeed: (baseSalt: string, origin: string) => number;
  var ssDeriveSeedSimple: (baseSalt: string, origin: string) => number;
  var ssDeriveStrongSeed: (baseSalt: string, origin: string, iterations?: number) => number;
  var ssDeriveSurfaceSeed: (baseSalt: string, origin: string, surfaceId: string, iterations?: number) => number;
  var ssDeriveSeedWithConfig: (baseSalt: string, origin: string) => number;

  var ssGetSalt: () => string;
  var ssSaltGeneration: number;

  var ssCreatePRNG: (seed: number) => () => number;
  var ssCreateMulberry32: (seed: number) => () => number;
  var ssPRNG: () => number;
  var ssNoise: (stream: string) => number;
  var ssEnv: { config: Record<string, unknown>; seed: number; prng: () => number; origin: string; debug?: boolean };
  var ssReady: boolean;

  var ssChromeStableVersions: string[];
  var ssPickChromeVersion: (hash: number) => { major: string; minor: string; build: string; patch: string; full: string };

  var ssHookInstallers: Array<(env?: Record<string, unknown>) => void>;
  var ssStealth: {
    isPatched(target: object): boolean;
    markPatched(target: object): void;
    unpatchAll(): void;
    cleanupGlobals: () => void;
  };
  var ssStatsTracker: { increment(surface: string): void };
  var ssTestFingerprint: () => unknown;
  var ssTestFingerprintReport: () => unknown;
  var ssTimingUtils: Record<string, unknown>;
  var ssBuildWorkerShim: (persona: Record<string, unknown>) => string;
  var ssRingCircumference: number;

  var ssMigrateConfig: (stored: Record<string, unknown>) => Record<string, unknown>;
  var ssNormalizeConfig: (stored: Record<string, unknown>) => Record<string, unknown>;
  var ssLoadConfig: () => Promise<Record<string, unknown>>;
}

export {};
