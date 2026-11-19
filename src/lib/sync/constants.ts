export const AUTO_SYNC_SETTINGS_KEY = "track-dashboard-settings-v1";
export const AUTO_SYNC_STATE_KEY = "track-dashboard-autosync-v1";
export const FULL_SYNC_META_KEY = "track-dashboard-fullsync-v1";

/** One Play lookup at a time, with space between ticks. */
export const AUTO_SYNC_TICK_MS = 90_000;
/** After a timeout / rate-limit / flaky response, wait before the next tick. */
export const AUTO_SYNC_BACKOFF_MS = 5 * 60_000;
export const AUTO_SYNC_START_DELAY_MS = 8_000;
/** Recheck a healthy listing at most once per day. */
export const AUTO_SYNC_CYCLE_MS = 24 * 60 * 60 * 1000;
/** Wait before confirming a suspected takedown. */
export const AUTO_SYNC_SUSPECT_RETRY_MS = 45 * 60_000;
export const AUTO_SYNC_REQUIRED_MISSES = 3;
/** Gap between items during full Sync all. */
export const FULL_SYNC_GAP_MS = 1_200;
