// Static region definitions. Everything time-dependent lives in grid.js / world.js.

export const REGION_DEFS = [
  {
    id: 'oregon',
    name: 'Oregon',
    sub: 'US-West',
    short: 'OR',
    utcOffset: -8,
    solarStrength: 0.6,
    windStrength: 0.85,
    fossilBase: 450,
    capacity: 8,
    lat: 44.0,
    lon: -122.0,
    color: '#4dd4ff',
    windPhase: -1.5,
  },
  {
    id: 'frankfurt',
    name: 'Frankfurt',
    sub: 'EU-Central',
    short: 'FRA',
    utcOffset: 1,
    solarStrength: 0.3,
    windStrength: 0.85,
    fossilBase: 500,
    capacity: 8,
    lat: 50.1,
    lon: 8.7,
    color: '#a78bfa',
    windPhase: 0.6,
  },
  {
    id: 'singapore',
    name: 'Singapore',
    sub: 'Asia-SE',
    short: 'SIN',
    utcOffset: 8,
    solarStrength: 0.6,
    windStrength: 0.2,
    fossilBase: 700,
    capacity: 8,
    lat: 1.35,
    lon: 103.8,
    color: '#ffb347',
    windPhase: 2.4,
  },
  {
    id: 'sydney',
    name: 'Sydney',
    sub: 'AU-East',
    short: 'SYD',
    utcOffset: 11,
    solarStrength: 0.9,
    windStrength: 0.55,
    fossilBase: 750,
    capacity: 8,
    lat: -33.87,
    lon: 151.2,
    color: '#ff6b9d',
    windPhase: 4.1,
  },
];

export const REGION_MAP = Object.fromEntries(REGION_DEFS.map((r) => [r.id, r]));

/** Create mutable per-world region state. */
export function createRegionStates() {
  return REGION_DEFS.map((def) => ({
    ...def,
    assigned: [], // jobs holding a slot (includes jobs in transit)
    queue: [], // jobs waiting for a free slot here
    offline: false,
  }));
}

export const EVENT_DEFS = {
  cloudy: {
    label: 'Cloudy day',
    icon: '☁',
    durationH: 2,
    description: 'Solar output −70%',
    color: '#8ea8c3',
  },
  calm: {
    label: 'Calm winds',
    icon: '≈',
    durationH: 2,
    description: 'Wind output −80%',
    color: '#7ad7f0',
  },
  heatwave: {
    label: 'Heatwave',
    icon: '☀',
    durationH: 2,
    description: 'Fossil baseline +18%',
    color: '#ff8a5c',
  },
  outage: {
    label: 'Region outage',
    icon: '⚠',
    durationH: 2,
    description: 'Capacity offline, reroute jobs',
    color: '#ff5d5d',
  },
};
