// Grid carbon-intensity model. No Three.js here on purpose: it is the
// "physics" the scheduler reasons about.

import { EVENT_DEFS } from './regions.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const HOUR = 3_600_000;

export class GridModel {
  constructor() {
    this.events = []; // {regionId, type, start, until}
  }

  reset() {
    this.events = [];
  }

  triggerEvent(regionId, type, simMs, durationHours = 2) {
    const def = EVENT_DEFS[type];
    if (!def) return null;
    // Extend an already-running event of the same kind rather than stacking.
    const existing = this.events.find(
      (e) => e.regionId === regionId && e.type === type && e.until > simMs,
    );
    const end = simMs + durationHours * HOUR;
    if (existing) {
      existing.until = Math.max(existing.until, end);
      return existing;
    }
    const ev = { regionId, type, start: simMs, until: end };
    this.events.push(ev);
    return ev;
  }

  cleanup(simMs) {
    this.events = this.events.filter((e) => e.until > simMs);
  }

  activeEvents(regionId, simMs) {
    return this.events.filter((e) => e.regionId === regionId && e.until > simMs);
  }

  hasEvent(regionId, type, simMs) {
    return this.events.some(
      (e) => e.regionId === regionId && e.type === type && e.until > simMs,
    );
  }

  /** Local hour (0-24) for a region, following the simulation clock. */
  localHour(region, simMs) {
    const d = new Date(simMs);
    const utc = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    return (utc + region.utcOffset + 48) % 24;
  }

  /** Deterministic solar output 0..strength for a local hour. */
  solarAt(region, simMs) {
    const h = this.localHour(region, simMs);
    let solar = Math.max(0, Math.sin((Math.PI * (h - 6)) / 12)) * region.solarStrength;
    for (const ev of this.activeEvents(region.id, simMs)) {
      if (ev.type === 'cloudy') solar *= 0.3;
    }
    return solar;
  }

  /** Deterministic wind output 0..strength. */
  windAt(region, simMs) {
    const h = this.localHour(region, simMs);
    let wind =
      region.windStrength * (0.5 + 0.5 * Math.sin((2 * Math.PI * h) / 24 + region.windPhase));
    for (const ev of this.activeEvents(region.id, simMs)) {
      if (ev.type === 'calm') wind *= 0.2;
    }
    return wind;
  }

  /** Renewable share 0..1, including active weather events. */
  renewableShare(region, simMs) {
    return clamp(this.solarAt(region, simMs) + this.windAt(region, simMs), 0, 1);
  }

  /** Deterministic (forecastable) carbon intensity, gCO2/kWh. */
  baseIntensity(region, simMs) {
    let fossil = region.fossilBase;
    for (const ev of this.activeEvents(region.id, simMs)) {
      if (ev.type === 'heatwave') {
        fossil *= 1.18;
      }
    }
    const rs = this.renewableShare(region, simMs);
    return fossil * (1 - rs) + 20 * rs;
  }

  /** Live intensity with a small smooth "sensor" wobble around the base. */
  intensity(region, simMs, { wobble = true } = {}) {
    let ci = this.baseIntensity(region, simMs);
    if (wobble) {
      const minutes = simMs / 60_000;
      const p = (region.lon * Math.PI) / 180;
      const wave =
        0.62 * Math.sin(minutes * 0.85 + p * 3.1) +
        0.38 * Math.sin(minutes * 2.15 + p * 7.7);
      ci *= 1 + 0.045 * wave;
    }
    return Math.max(14, ci);
  }

  /** Carbon band used by the UI colour scale. */
  band(ci) {
    if (ci < 200) return 'clean';
    if (ci <= 450) return 'medium';
    return 'dirty';
  }

  /** 6-hour look-ahead sampled every 15 simulated minutes. */
  forecast(region, fromMs, hours = 6, stepMin = 15) {
    const out = [];
    const step = stepMin * 60_000;
    const end = fromMs + hours * HOUR;
    for (let t = fromMs; t <= end + 1; t += step) {
      out.push({ time: t, ci: this.baseIntensity(region, t) });
    }
    return out;
  }
}

/** Colour for a carbon intensity value. */
export function ciColor(ci) {
  if (ci < 200) return '#3df5a5';
  if (ci <= 450) return '#ffc857';
  return '#ff5d5d';
}

export function ciGlow(ci) {
  if (ci < 200) return '#0fbf7c';
  if (ci <= 450) return '#d99a25';
  return '#c73a3a';
}

/** Region solar/wind as normalized 0..1-ish output for the 3D scenery. */
export function weatherSnapshot(grid, region, simMs) {
  return {
    solar: grid.solarAt(region, simMs),
    wind: grid.windAt(region, simMs),
    renewable: grid.renewableShare(region, simMs),
  };
}
