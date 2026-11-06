// Headless stress test for the scheduling core (no Three.js / DOM).
//
// Runs the carbon-aware and baseline worlds in lockstep for several simulated
// days, with a configurable arrival rate and random weather events, then
// asserts that:
//   1. no flexible job ever misses its deadline,
//   2. every submitted job eventually completes,
//   3. the carbon-aware world emits less CO2 than the baseline.
//
// Usage: node scripts/stress.mjs

import { SimClock, SIM_START_MS } from '../src/clock.js';
import { GridModel } from '../src/grid.js';
import { REGION_DEFS, EVENT_DEFS } from '../src/regions.js';
import { JobFactory, mulberry32 } from '../src/jobs.js';
import { World } from '../src/world.js';

const MIN = 60_000;
const HOUR = 60 * MIN;

function runScenario({
  name,
  arrivalRate = 8,
  urgentShare = 0.3,
  days = 7,
  eventEveryHours = 4,
  seed = 20260621,
}) {
  const params = {
    arrivalRate,
    urgentShare,
    greenThreshold: 200,
    routeGain: 0.25,
    dayLength: 60,
    speed: 1,
  };
  const clock = new SimClock({ dayLengthSec: 60, speed: 1, startMs: SIM_START_MS });
  const grid = new GridModel();
  const factory = new JobFactory(seed, REGION_DEFS.map((r) => r.id));
  const eventRng = mulberry32(seed ^ 0x9e3779b9);
  const eventTypes = Object.keys(EVENT_DEFS);

  const worlds = {
    aware: new World('aware', grid, params),
    baseline: new World('baseline', grid, params),
  };

  let worstLatenessMs = -Infinity;
  let deadlineViolations = 0;
  for (const world of Object.values(worlds)) {
    world.onJobDone = (job) => {
      if (!Number.isFinite(job.deadlineSimMs)) return;
      const lateness = job.endSimMs - job.deadlineSimMs;
      if (lateness > worstLatenessMs) worstLatenessMs = lateness;
      if (lateness > MIN) deadlineViolations++;
    };
  }

  const submitBoth = (spec) => {
    worlds.aware.submit(spec, clock.simMs);
    worlds.baseline.submit(spec, clock.simMs);
  };

  // Same 10 seeded jobs as the app.
  for (let i = 0; i < 10; i++) submitBoth(factory.make('auto', params.urgentShare));

  const totalMinutes = days * 24 * 60;
  const spawnIntervalMin = 60 / params.arrivalRate;
  const eventEvery = Math.max(1, eventEveryHours * 60);
  let spawnAccumMin = 0;
  let nextEventMin = clock.simMs + eventEvery * MIN;

  const stepMinute = (spawn = true) => {
    clock.simMs += MIN;
    const now = clock.simMs;
    grid.cleanup(now);

    if (spawn) {
      spawnAccumMin += 1;
      let guard = 0;
      while (spawnAccumMin >= spawnIntervalMin && guard++ < 64) {
        spawnAccumMin -= spawnIntervalMin;
        submitBoth(factory.make('auto', params.urgentShare));
      }
    }

    if (now >= nextEventMin) {
      nextEventMin += eventEvery * MIN;
      const region = REGION_DEFS[Math.floor(eventRng() * REGION_DEFS.length)];
      const type = eventTypes[Math.floor(eventRng() * eventTypes.length)];
      const def = EVENT_DEFS[type];
      grid.triggerEvent(region.id, type, now, def.durationH);
      for (const world of Object.values(worlds)) {
        world.addLog(`GRID EVENT · ${def.label} · ${region.name} (${def.durationH}h)`, 'event', now);
      }
    }

    worlds.aware.update(now, params);
    worlds.baseline.update(now, params);
  };

  for (let i = 0; i < totalMinutes; i++) stepMinute();

  const atEnd = {
    submitted: (w) => w.metrics.totalSubmitted,
    done: (w) => w.metrics.jobsDone,
    active: (w) => w.activeJobs().length,
  };
  const mid = Object.fromEntries(
    Object.entries(worlds).map(([mode, w]) => [
      mode,
      {
        submitted: atEnd.submitted(w),
        done: atEnd.done(w),
        active: atEnd.active(w),
        emissionsG: w.metrics.emissionsG,
        deadlineMisses: w.metrics.deadlineMisses,
        routed: w.metrics.routed,
        delayed: w.metrics.delayed,
        overCapacity: w.metrics.overCapacity,
      },
    ]),
  );

  // Drain: stop spawning and give every waiting job 24 more simulated hours.
  for (let i = 0; i < 24 * 60; i++) stepMinute(false);

  const final = Object.fromEntries(
    Object.entries(worlds).map(([mode, w]) => [
      mode,
      {
        submitted: w.metrics.totalSubmitted,
        done: w.metrics.jobsDone,
        active: w.activeJobs().length,
        emissionsG: w.metrics.emissionsG,
        deadlineMisses: w.metrics.deadlineMisses,
      },
    ]),
  );

  const baselineG = final.baseline.emissionsG;
  const awareG = final.aware.emissionsG;
  const savingsPct = baselineG > 0 ? ((baselineG - awareG) / baselineG) * 100 : 0;

  const failures = [];
  for (const [mode, w] of Object.entries(final)) {
    if (w.active !== 0) failures.push(`${mode}: ${w.active} jobs still active after drain`);
    if (w.done !== w.submitted) {
      failures.push(`${mode}: only ${w.done}/${w.submitted} jobs completed`);
    }
    if (w.deadlineMisses !== 0) failures.push(`${mode}: ${w.deadlineMisses} deadline misses`);
  }
  if (deadlineViolations !== 0) failures.push(`late completions beyond 1 min: ${deadlineViolations}`);
  if (!(awareG < baselineG)) failures.push(`aware (${awareG.toFixed(0)} g) not below baseline (${baselineG.toFixed(0)} g)`);

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${name} · rate ${arrivalRate}/h · urgent ${Math.round(urgentShare * 100)}% · ${days}d`);
  console.log(
    `  jobs: ${final.aware.submitted} submitted, ${final.aware.done} done (aware) · ` +
      `${final.baseline.done} done (baseline)`,
  );
  console.log(
    `  emissions: aware ${(awareG / 1000).toFixed(1)} kg vs baseline ${(baselineG / 1000).toFixed(1)} kg ` +
      `→ ${savingsPct.toFixed(1)}% saved`,
  );
  console.log(
    `  routing/delay (aware): ${mid.aware.routed} routed, ${mid.aware.delayed} delayed, ` +
      `${mid.aware.overCapacity} over-capacity starts`,
  );
  console.log(
    `  deadline misses: aware ${final.aware.deadlineMisses}, baseline ${final.baseline.deadlineMisses} · ` +
      `worst lateness ${(worstLatenessMs / MIN).toFixed(1)} min`,
  );
  if (failures.length) for (const f of failures) console.log(`  ! ${f}`);

  return { name, status, failures, savingsPct, final, mid };
}

const scenarios = [
  { name: 'Calm default', arrivalRate: 2, urgentShare: 0.3, days: 7, eventEveryHours: 6 },
  { name: 'High arrival', arrivalRate: 8, urgentShare: 0.3, days: 7, eventEveryHours: 4 },
  { name: 'Extreme arrival', arrivalRate: 16, urgentShare: 0.3, days: 5, eventEveryHours: 3 },
  { name: 'Urgent-heavy', arrivalRate: 8, urgentShare: 0.7, days: 5, eventEveryHours: 3 },
  { name: 'Outage-heavy', arrivalRate: 6, urgentShare: 0.4, days: 5, eventEveryHours: 1 },
];

const results = scenarios.map(runScenario);
const failed = results.filter((r) => r.status === 'FAIL');

console.log(`\n${results.length - failed.length}/${results.length} scenarios passed`);
if (failed.length) {
  console.error('STRESS TEST FAILED');
  process.exit(1);
}
