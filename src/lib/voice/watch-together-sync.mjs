// Pure playback-synchronization math for Watch Together.
// Kept framework-free so the drift/clamp rules can be unit-tested directly.

export const DRIFT_THRESHOLD_SECONDS = 1.5;
// A clock skew or a paused-forever session must never fast-forward a viewer to
// an absurd position, so the extrapolated elapsed time is clamped.
export const MAX_STALE_ELAPSED_SECONDS = 6 * 60 * 60;

export function sanitizePlaybackPosition(value) {
  const position = Number(value);
  if (!Number.isFinite(position) || position < 0) return 0;
  return Math.min(position, MAX_STALE_ELAPSED_SECONDS);
}

// Wall-clock position every participant should be at right now, given the
// host's last stored playback state.
export function computeTargetPosition({ positionSeconds, isPlaying, updatedAt, now = Date.now() }) {
  const base = sanitizePlaybackPosition(positionSeconds);
  if (!isPlaying) return base;
  const updated = typeof updatedAt === "number" ? updatedAt : Date.parse(updatedAt);
  if (!Number.isFinite(updated)) return base;
  const elapsed = Math.max(0, (now - updated) / 1000);
  return base + Math.min(elapsed, MAX_STALE_ELAPSED_SECONDS);
}

export function computePlaybackDrift(currentTime, target) {
  const current = Number.isFinite(Number(currentTime)) ? Number(currentTime) : 0;
  const goal = Number.isFinite(Number(target)) ? Number(target) : 0;
  return goal - current;
}

export function shouldResync(currentTime, target, threshold = DRIFT_THRESHOLD_SECONDS) {
  return Math.abs(computePlaybackDrift(currentTime, target)) > threshold;
}

export function formatPlaybackClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = value => String(value).padStart(2, "0");
  return hours > 0 ? hours + ":" + pad(minutes) + ":" + pad(secs) : minutes + ":" + pad(secs);
}

// Human-facing sync state for the room indicator.
export function describePlaybackState({ isPlaying, drift, threshold = DRIFT_THRESHOLD_SECONDS }) {
  if (!isPlaying) return "paused";
  if (!Number.isFinite(drift)) return "unknown";
  if (Math.abs(drift) <= threshold) return "synced";
  return drift > 0 ? "behind" : "ahead";
}
