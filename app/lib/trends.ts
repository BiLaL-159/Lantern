// ─── Trend vocabulary ───
// The Window and series shapes shared by the analytics service, which
// computes Trends, and the components that draw them.
//
// They live here rather than in the service because a component that
// imports a *value* from the service drags the service's `~/db` import —
// and better-sqlite3, a native Node module — into the client bundle, where
// it throws and takes the whole route module down with it. Types are erased
// at build time and cost nothing; these constants are not. Guarded by
// client-safety.test.ts. This module must stay free of server imports.

export const TREND_WINDOWS = ["30d", "90d", "all"] as const;

export type TrendWindow = (typeof TREND_WINDOWS)[number];

/** The bucket size a Window's Trend is reported in. */
export type TrendBucket = "day" | "week";

/** One bucket of a Trend: its UTC start, and the total that fell in it. */
export type TrendPoint = { bucketStart: string; value: number };
