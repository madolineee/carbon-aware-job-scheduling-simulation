// One simulated world. Two instances (baseline + carbon-aware) run in lockstep
// with the same job stream and the same grid, which makes the comparison fair.

import { createRegionStates } from './regions.js';
import { deadlineFromSpec } from './jobs.js';
import { SCHEDULE, scheduleAware, scheduleBaseline } from './scheduler.js';
import { formatDuration, formatLocalTime } from './clock.js';

const MIN = 60_000;

export class World {
  constructor(mode, grid, params) {
    this.mode = mode; // 'baseline' | 'aware'
    this.grid = grid;
    this.params = params;
    this.regionsList = createRegionStates();
    this.regionsById = Object.fromEntries(this.regionsList.map((r) => [r.id, r]));
    this.jobs = new Map();
    this.delayed = [];
    this.log = [];
    this.logVersion = 0;
    this.nextRecheckSimMs = null;
    this.lastNow = null;
    this.onJobDone = null;
    this.metrics = {
      totalSubmitted: 0,
      jobsDone: 0,
      emissionsG: 0,
      energyKWh: 0,
      delaySumMin: 0,
      delayCount: 0,
      deadlineMisses: 0,
      routed: 0,
      delayed: 0,
      urgent: 0,
      overCapacity: 0,
    };
  }

  // ---------------------------------------------------------------- queries

  freeSlots(region, now) {
    if (region.capacity <= 0) return 0;
    if (this.grid.hasEvent(region.id, 'outage', now)) return 0;
    return Math.max(0, region.capacity - region.assigned.length);
  }

  load(region, now) {
    if (region.capacity <= 0) return 0;
    if (this.grid.hasEvent(region.id, 'outage', now)) return 0;
    return Math.min(1, region.assigned.length / region.capacity);
  }

  cleanestWithSlot(now, excludeId = null) {
    let best = null;
    let bestCI = Infinity;
    for (const region of this.regionsList) {
      if (excludeId && region.id === excludeId) continue;
      if (this.freeSlots(region, now) <= 0) continue;
      const ci = this.grid.intensity(region, now);
      if (ci < bestCI) {
        bestCI = ci;
        best = region;
      }
    }
    return best;
  }

  activeJobs() {
    const out = [];
    for (const job of this.jobs.values()) {
      if (job.state !== 'done') out.push(job);
    }
    return out;
  }

  // ---------------------------------------------------------------- logging

  addLog(text, kind, simMs) {
    this.log.unshift({ text, kind, simMs });
    if (this.log.length > 80) this.log.length = 80;
    this.logVersion++;
  }

  // --------------------------------------------------------------- mutations

  submit(spec, now) {
    const home = this.regionsById[spec.homeRegionId];
    const job = {
      id: spec.id,
      type: spec.type,
      energyKWh: spec.energyKWh,
      durationMin: spec.durationMin,
      homeRegionId: spec.homeRegionId,
      deadlineMinutes: spec.deadlineMinutes,
      arrivalSimMs: now,
      deadlineSimMs: deadlineFromSpec(spec, now),
      state: 'queued',
      regionId: home.id,
      startSimMs: null,
      endSimMs: null,
      slotIndex: -1,
      emissionG: 0,
      savedG: 0,
      atArrivalHomeCI: this.grid.intensity(home, now, { wobble: false }),
      ciAtRun: 0,
      route: null,
      wakeAtSimMs: null,
      overCapacity: false,
    };
    this.jobs.set(job.id, job);
    this.metrics.totalSubmitted++;
    if (job.type === 'urgent') this.metrics.urgent++;

    if (this.mode === 'baseline') scheduleBaseline(this, job, now);
    else scheduleAware(this, job, now);
    return job;
  }

  /** Remove a job from any waiting container (queue / delayed list). */
  detach(job) {
    const idx = this.delayed.indexOf(job);
    if (idx >= 0) this.delayed.splice(idx, 1);
    for (const region of this.regionsList) {
      const qi = region.queue.indexOf(job);
      if (qi >= 0) region.queue.splice(qi, 1);
    }
  }

  enqueue(job, region, now, reason = '') {
    this.detach(job);
    job.state = 'queued';
    job.regionId = region.id;
    region.queue.push(job);
    this.addLog(
      `#${job.id} waiting at ${region.name} · all ${region.capacity} slots busy${reason ? ` (${reason})` : ''}`,
      'queue',
      now,
    );
  }

  delay(job, wakeAtSimMs, now, { targetCI, localCI, quiet = false } = {}) {
    const wasDelayed = job.state === 'delayed';
    const oldWake = job.wakeAtSimMs;
    this.detach(job);
    job.state = 'delayed';
    job.regionId = job.homeRegionId;
    job.wakeAtSimMs = wakeAtSimMs;
    this.delayed.push(job);
    if (!wasDelayed) this.metrics.delayed++;

    const home = this.regionsById[job.homeRegionId];
    const waitMin = (wakeAtSimMs - now) / MIN;
    const changed = !wasDelayed || Math.abs(wakeAtSimMs - (oldWake ?? 0)) > 30 * MIN;
    if (!quiet || changed) {
      this.addLog(
        `#${job.id} delayed ${formatDuration(waitMin)} · ${home.name} forecast ${Math.round(
          targetCI,
        )} g at ${formatLocalTime(wakeAtSimMs, home.utcOffset)} (now ${Math.round(localCI)} g)`,
        'delay',
        now,
      );
    }
  }

  nextSlotIndex(region) {
    const used = new Set(region.assigned.map((j) => j.slotIndex));
    for (let i = 0; i < region.capacity; i++) {
      if (!used.has(i)) return i;
    }
    return region.assigned.length % Math.max(1, region.capacity);
  }

  assign(job, region, now, opts = {}) {
    const {
      routeFrom = null,
      fromCI = 0,
      reason = '',
      urgent = false,
      forced = false,
    } = opts;
    this.detach(job);

    const routeMs = routeFrom ? SCHEDULE.routeMinutes * MIN : 0;
    const start = now + routeMs;
    const ci = this.grid.intensity(region, start, { wobble: false });
    const factor = routeFrom ? 1 + SCHEDULE.transferCost : 1;
    const emission = job.energyKWh * factor * ci;
    const baselineRef = job.energyKWh * job.atArrivalHomeCI;

    job.emissionG = emission;
    job.savedG = Math.max(0, baselineRef - emission);
    job.ciAtRun = ci;
    job.regionId = region.id;
    job.startSimMs = start;
    job.endSimMs = start + job.durationMin * MIN;
    job.state = routeFrom ? 'routing' : 'running';
    job.route = routeFrom
      ? { from: routeFrom, to: region.id, depart: now, arrive: start }
      : null;
    job.overCapacity = region.assigned.length >= region.capacity;
    if (job.overCapacity) this.metrics.overCapacity++;
    job.slotIndex = this.nextSlotIndex(region);
    region.assigned.push(job);

    this.metrics.emissionsG += emission;
    this.metrics.energyKWh += job.energyKWh * factor;
    if (job.type === 'flexible') {
      const delayMin = Math.max(0, (start - job.arrivalSimMs) / MIN);
      this.metrics.delaySumMin += delayMin;
      this.metrics.delayCount++;
    }
    if (routeFrom) this.metrics.routed++;

    if (routeFrom) {
      const from = this.regionsById[routeFrom];
      this.addLog(
        `#${job.id} routed ${from.name} → ${region.name} · ${Math.round(fromCI)} → ${Math.round(
          ci,
        )} gCO₂/kWh`,
        'route',
        now,
      );
    } else if (forced) {
      this.addLog(
        `#${job.id} deadline guard → ${region.name} · ${Math.round(ci)} gCO₂/kWh`,
        'warn',
        now,
      );
    } else if (urgent) {
      this.addLog(
        `Urgent #${job.id} → ${region.name} now · ${Math.round(ci)} gCO₂/kWh`,
        'urgent',
        now,
      );
    } else {
      this.addLog(
        `#${job.id} runs ${region.name} · ${Math.round(ci)} gCO₂/kWh · ${reason}`,
        'run',
        now,
      );
    }
  }

  runForced(job, now, reason = 'deadline guard') {
    this.detach(job);
    if (this.mode === 'baseline') {
      const home = this.regionsById[job.homeRegionId];
      return this.assign(job, home, now, { reason, forced: true });
    }
    let target = this.cleanestWithSlot(now);
    if (!target) {
      const online = this.regionsList.filter((r) => !this.grid.hasEvent(r.id, 'outage', now));
      const pool = online.length ? online : this.regionsList;
      target = pool.reduce((a, b) =>
        this.grid.intensity(a, now) <= this.grid.intensity(b, now) ? a : b,
      );
    }
    return this.assign(job, target, now, { reason, forced: true });
  }

  completeJob(job, region, now) {
    job.state = 'done';
    job.completedSimMs = now;
    this.jobs.delete(job.id);
    this.metrics.jobsDone++;
    if (
      Number.isFinite(job.deadlineSimMs) &&
      job.endSimMs > job.deadlineSimMs + MIN
    ) {
      this.metrics.deadlineMisses++;
    }
    this.onJobDone?.(job, region);
  }

  // ---------------------------------------------------------------- stepping

  update(now, params) {
    this.params = params;
    this.lastNow = now;

    // 1. routing → running, and finish completed jobs
    for (const region of this.regionsList) {
      region.offline = this.grid.hasEvent(region.id, 'outage', now);
      const keep = [];
      for (const job of region.assigned) {
        if (job.state === 'routing' && now >= job.startSimMs) {
          job.state = 'running';
        }
        if (now >= job.endSimMs) {
          this.completeJob(job, region, now);
        } else {
          keep.push(job);
        }
      }
      region.assigned = keep;
    }

    // 2. deadline safety net for anything waiting
    this.deadlineRescue(now);

    // 3. periodic re-check of deliberately delayed jobs
    if (this.nextRecheckSimMs == null) {
      this.nextRecheckSimMs = now + SCHEDULE.recheckMinutes * MIN;
    }
    let guard = 0;
    while (now >= this.nextRecheckSimMs && guard++ < 12) {
      this.recheckDelayed(now);
      this.nextRecheckSimMs += SCHEDULE.recheckMinutes * MIN;
    }

    // 4. start queued jobs where slots have freed up
    this.fillQueues(now);
  }

  deadlineRescue(now) {
    const near = (job) =>
      job.type === 'flexible' &&
      Number.isFinite(job.deadlineSimMs) &&
      job.deadlineSimMs - now <=
        (job.durationMin + SCHEDULE.deadlineGuardMinutes) * MIN;

    for (const region of this.regionsList) {
      for (const job of [...region.queue]) {
        if (near(job)) this.runForced(job, now, 'deadline guard (queue)');
      }
    }
    for (const job of [...this.delayed]) {
      if (near(job)) this.runForced(job, now, 'deadline guard (delay)');
    }
    this.delayed = this.delayed.filter((j) => j.state === 'delayed' && this.jobs.has(j.id));
  }

  recheckDelayed(now) {
    for (const job of [...this.delayed]) {
      if (!this.jobs.has(job.id) || job.state !== 'delayed') continue;
      if (
        job.deadlineSimMs - now <=
        (job.durationMin + SCHEDULE.deadlineGuardMinutes) * MIN
      ) {
        this.runForced(job, now, 'deadline guard');
        continue;
      }
      scheduleAware(this, job, now, { quiet: true });
    }
    this.delayed = this.delayed.filter((j) => j.state === 'delayed' && this.jobs.has(j.id));
  }

  fillQueues(now) {
    for (const region of this.regionsList) {
      let guard = 0;
      while (region.queue.length > 0 && this.freeSlots(region, now) > 0 && guard++ < 64) {
        let idx = 0;
        if (this.mode === 'aware') {
          const urgentIdx = region.queue.findIndex((j) => j.type === 'urgent');
          if (urgentIdx >= 0) idx = urgentIdx;
        }
        const job = region.queue[idx];
        this.assign(job, region, now, { reason: 'slot freed' });
      }
    }
  }
}
