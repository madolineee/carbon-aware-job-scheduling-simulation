// Job generation helpers. A job *spec* is immutable and is copied into each
// world (baseline and carbon-aware) so both simulations see the same stream.

const HOUR_MS = 3_600_000;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class JobFactory {
  constructor(seed, regionIds) {
    this.rng = mulberry32(seed);
    this.regionIds = regionIds;
    this.nextId = 1;
  }

  reset(seed = 20260621) {
    this.rng = mulberry32(seed);
    this.nextId = 1;
  }

  regionForHome() {
    return this.regionIds[Math.floor(this.rng() * this.regionIds.length)];
  }

  /** @param {'urgent'|'flexible'|'auto'} type */
  make(type = 'auto', urgentShare = 0.3) {
    const resolved =
      type === 'auto' ? (this.rng() < urgentShare ? 'urgent' : 'flexible') : type;
    const energyKWh = round1(2 + this.rng() * 8);
    const durationMin = Math.round(30 + this.rng() * 90);
    // Flexible jobs get a deadline 2-12h out, always comfortably after they
    // could have finished. Urgent jobs ignore deadlines entirely.
    let deadlineMinutes = null;
    if (resolved === 'flexible') {
      deadlineMinutes = Math.round(120 + this.rng() * 600);
      deadlineMinutes = Math.max(deadlineMinutes, durationMin + 90);
    }
    return {
      id: this.nextId++,
      type: resolved,
      energyKWh,
      durationMin,
      deadlineMinutes,
      homeRegionId: this.regionForHome(),
    };
  }

  batchOfFlexible(n) {
    return Array.from({ length: n }, () => this.make('flexible'));
  }
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

export function deadlineFromSpec(spec, arrivalSimMs) {
  if (spec.type === 'urgent' || spec.deadlineMinutes == null) return Infinity;
  return arrivalSimMs + spec.deadlineMinutes * 60_000;
}

export { HOUR_MS };
