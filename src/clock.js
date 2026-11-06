// Simulation clock. Simulated time is stored as an epoch-ms timestamp so the
// grid model can derive local hours for every region.

export const SIM_START_MS = Date.UTC(2026, 5, 21, 14, 0, 0); // 21 Jun 2026, 14:00 UTC
const MS_PER_DAY = 86_400_000;

export class SimClock {
  constructor({ dayLengthSec = 60, speed = 1, startMs = SIM_START_MS } = {}) {
    this.startMs = startMs;
    this.simMs = startMs;
    this.dayLengthSec = dayLengthSec;
    this.speed = speed;
    this.running = true;
  }

  get isPaused() {
    return !this.running || this.speed === 0;
  }

  reset(startMs = this.startMs) {
    this.startMs = startMs;
    this.simMs = startMs;
  }

  /** Advance by real seconds. Returns the simulated ms advanced. */
  advance(realDtSec) {
    if (this.isPaused) return 0;
    // Guard against huge frame gaps (background tabs) so one frame can't skip hours.
    const dt = Math.min(realDtSec, 0.1);
    const advanced = dt * this.speed * (MS_PER_DAY / this.dayLengthSec);
    this.simMs += advanced;
    return advanced;
  }

  get utcHours() {
    const d = new Date(this.simMs);
    return d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  }

  get simDay() {
    return Math.floor((this.simMs - this.startMs) / MS_PER_DAY) + 1;
  }

  localHours(offset) {
    return (this.utcHours + offset + 48) % 24;
  }

  formatUTC() {
    const d = new Date(this.simMs);
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  formatDate() {
    return new Date(this.simMs).toLocaleDateString('en-GB', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  }

  /** True on the first update of a new day (used for the HUD). */
  dayOfYear() {
    const d = new Date(this.simMs);
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    return Math.floor((this.simMs - start) / MS_PER_DAY);
  }
}

export function formatSimTime(simMs) {
  const d = new Date(simMs);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function formatLocalTime(simMs, offset) {
  const d = new Date(simMs + offset * 3_600_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "3h 20m" style duration for logs. */
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}
