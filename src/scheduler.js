// The scheduling logic. Pure-ish functions that only mutate the world through
// explicit methods, so the carbon policy is easy to read and test.

export const SCHEDULE = {
  forecastHours: 6,
  routeMinutes: 20,
  transferCost: 0.05, // 5% extra energy for moving a job
  recheckMinutes: 15,
  marginMinutes: 15,
  deadlineGuardMinutes: 10,
};

const MIN = 60_000;

/**
 * Carbon-blind baseline: run in the home region as soon as a slot is free.
 * First come, first served; no regard for the grid.
 */
export function scheduleBaseline(world, job, now) {
  const home = world.regionsById[job.homeRegionId];
  if (world.freeSlots(home, now) > 0) {
    world.assign(job, home, now, { reason: 'baseline · run now' });
  } else {
    world.enqueue(job, home, now, 'baseline');
  }
}

/**
 * Carbon-aware policy:
 *   1. run locally if the grid is clean
 *   2. route if another region is meaningfully cleaner
 *   3. delay if a cleaner window is forecast before the deadline
 *   4. otherwise run in the cleanest place available right now
 */
export function scheduleAware(world, job, now, { quiet = false } = {}) {
  const params = world.params;
  const home = world.regionsById[job.homeRegionId];
  const localCI = world.grid.intensity(home, now);
  const durationMs = job.durationMin * MIN;

  // Urgent work is never carbon-scheduled.
  if (job.type === 'urgent') {
    return runUrgent(world, job, now);
  }

  const timeLeft = job.deadlineSimMs - now;

  // Hard safety net: never let a flexible job approach its deadline.
  if (timeLeft <= durationMs + SCHEDULE.deadlineGuardMinutes * MIN) {
    return world.runForced(job, now, 'deadline guard');
  }

  // 1. Is the local grid clean enough, and is there a slot?
  if (localCI <= params.greenThreshold && world.freeSlots(home, now) > 0) {
    return world.assign(job, home, now, { reason: 'clean local grid' });
  }

  // 2. Is another region much cleaner right now?
  const routeOverhead = SCHEDULE.routeMinutes * MIN;
  const travelFits = timeLeft > routeOverhead + durationMs + SCHEDULE.marginMinutes * MIN;
  const best = world.cleanestWithSlot(now, home.id);
  if (best && travelFits) {
    const bestCI = world.grid.intensity(best, now);
    if (bestCI * (1 + SCHEDULE.transferCost) < localCI * (1 - params.routeGain)) {
      return world.assign(job, best, now, {
        routeFrom: home.id,
        fromCI: localCI,
        toCI: bestCI,
        reason: 'route to cleaner region',
      });
    }
  }

  // 3. Can we wait for a cleaner window at home before the deadline?
  const latestStart = job.deadlineSimMs - durationMs - SCHEDULE.deadlineGuardMinutes * MIN;
  const horizon = Math.min(latestStart, now + SCHEDULE.forecastHours * 60 * MIN);
  if (horizon > now + 15 * MIN) {
    const fc = world.grid.forecast(home, now, (horizon - now) / (60 * MIN), 15);
    let window = null;
    for (const point of fc) {
      // Ignore the next few minutes: running now is better than a 5-minute nap.
      if (point.time < now + 10 * MIN) continue;
      if (!window || point.ci < window.ci) window = point;
    }
    if (
      window &&
      window.ci < localCI * (1 - params.routeGain) &&
      window.ci < localCI - 8
    ) {
      return world.delay(job, window.time, now, {
        targetCI: window.ci,
        localCI,
        quiet,
      });
    }
  }

  // 4. Out of options: run in the cleanest place that can take it now.
  if (world.freeSlots(home, now) > 0) {
    return world.assign(job, home, now, { reason: 'no cleaner option' });
  }
  const fallback = world.cleanestWithSlot(now, home.id);
  if (fallback) {
    return world.assign(job, fallback, now, {
      reason: 'home full · cleanest free region',
    });
  }
  return world.enqueue(job, home, now, 'no free slots');
}

function runUrgent(world, job, now) {
  const home = world.regionsById[job.homeRegionId];
  if (world.freeSlots(home, now) > 0) {
    return world.assign(job, home, now, { reason: 'urgent · no delay', urgent: true });
  }
  const best = world.cleanestWithSlot(now, home.id);
  if (best) {
    return world.assign(job, best, now, {
      reason: 'urgent · nearest free region',
      urgent: true,
    });
  }
  // Urgent work still runs, even if it briefly oversubscribes the home region.
  return world.assign(job, home, now, {
    reason: 'urgent · over capacity',
    urgent: true,
    overCapacity: true,
  });
}
