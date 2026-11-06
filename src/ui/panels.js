import { formatDuration, formatLocalTime, formatSimTime } from '../clock.js';
import { EVENT_DEFS } from '../regions.js';
import { ciColor } from '../grid.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(opts) {
    this.opts = opts;
    this.regionDefs = opts.regionDefs;
    this.params = opts.params;
    this.refs = new Map();
    this.selected = null;
    this.logKey = null;
    this.detailForecastKey = null;
    this.lastEventsHtml = new Map();

    this.buildRegions();
    this.buildEventControls();
    this.bind();
    this.syncParamInputs();
  }

  // ------------------------------------------------------------------ build

  buildRegions() {
    const wrap = $('region-cards');
    wrap.innerHTML = '';
    for (const def of this.regionDefs) {
      const card = document.createElement('button');
      card.className = 'region-card';
      card.dataset.region = def.id;
      card.innerHTML = `
        <div class="rc-top">
          <span class="rc-dot"></span>
          <div class="rc-id">
            <div class="rc-name">${def.name}</div>
            <div class="rc-sub">${def.sub} · <span class="rc-time">--:--</span></div>
          </div>
          <div class="rc-ci"><b>---</b><span>g</span></div>
        </div>
        <div class="rc-meters">
          <div class="rc-meter"><span>REN</span><div class="rc-bar"><i class="ren-fill"></i></div><em class="ren-val">0%</em></div>
          <div class="rc-meter"><span>LOAD</span><div class="rc-bar load"><i class="load-fill"></i></div><em class="load-val">0/8</em></div>
        </div>
        <div class="rc-events"></div>`;
      card.addEventListener('click', () => this.opts.onRegion(def.id));
      wrap.appendChild(card);
      this.refs.set(def.id, {
        root: card,
        dot: card.querySelector('.rc-dot'),
        ci: card.querySelector('.rc-ci b'),
        time: card.querySelector('.rc-time'),
        renFill: card.querySelector('.ren-fill'),
        renVal: card.querySelector('.ren-val'),
        loadFill: card.querySelector('.load-fill'),
        loadVal: card.querySelector('.load-val'),
        events: card.querySelector('.rc-events'),
      });
    }
  }

  buildEventControls() {
    const select = $('event-region');
    for (const def of this.regionDefs) {
      const o = document.createElement('option');
      o.value = def.id;
      o.textContent = def.name;
      select.appendChild(o);
    }
    const grid = $('event-grid');
    for (const [type, def] of Object.entries(EVENT_DEFS)) {
      const btn = document.createElement('button');
      btn.className = 'event-btn';
      btn.dataset.event = type;
      btn.innerHTML = `<span class="ev-icon" style="color:${def.color}">${def.icon}</span>
        <span class="ev-name">${def.label}</span>
        <span class="ev-desc">${def.description}</span>`;
      btn.addEventListener('click', () => this.opts.onEvent(select.value, type));
      grid.appendChild(btn);
    }
  }

  bind() {
    document.querySelectorAll('#mode-switch button').forEach((btn) => {
      btn.addEventListener('click', () => this.opts.onMode(btn.dataset.mode));
    });
    $('btn-play').addEventListener('click', () => this.opts.onPlay());
    document.querySelectorAll('#speed-group button').forEach((btn) => {
      btn.addEventListener('click', () => this.opts.onSpeed(Number(btn.dataset.speed)));
    });
    $('day-length').addEventListener('change', (e) => {
      this.opts.onDayLength(Number(e.target.value));
    });

    const bindRange = (id, outId, key, format, transform = (v) => v) => {
      const input = $(id);
      const out = $(outId);
      input.addEventListener('input', () => {
        const value = transform(Number(input.value));
        out.textContent = format(value);
        this.opts.onParam(key, value);
      });
    };
    bindRange('in-rate', 'out-rate', 'arrivalRate', (v) => `${v.toFixed(1)}/h`);
    bindRange('in-urgent', 'out-urgent', 'urgentShare', (v) => `${Math.round(v * 100)}%`, (v) => v / 100);
    bindRange('in-threshold', 'out-threshold', 'greenThreshold', (v) => `${Math.round(v)}`, (v) => v);
    bindRange('in-gain', 'out-gain', 'routeGain', (v) => `${Math.round(v * 100)}%`, (v) => v / 100);

    $('btn-batch').addEventListener('click', () => this.opts.onBatch());
    $('btn-reset').addEventListener('click', () => this.opts.onReset());
    $('detail-close').addEventListener('click', () => this.closeDetail());
    $('btn-reset-view').addEventListener('click', () => this.opts.onResetView?.());
  }

  syncParamInputs() {
    const p = this.params;
    $('in-rate').value = p.arrivalRate;
    $('out-rate').textContent = `${p.arrivalRate.toFixed(1)}/h`;
    $('in-urgent').value = Math.round(p.urgentShare * 100);
    $('out-urgent').textContent = `${Math.round(p.urgentShare * 100)}%`;
    $('in-threshold').value = p.greenThreshold;
    $('out-threshold').textContent = `${p.greenThreshold}`;
    $('in-gain').value = Math.round(p.routeGain * 100);
    $('out-gain').textContent = `${Math.round(p.routeGain * 100)}%`;
    $('day-length').value = String(p.dayLength);
  }

  // ------------------------------------------------------------------ modes

  setMode(mode) {
    document.querySelectorAll('#mode-switch button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    $('log-mode').textContent = mode === 'aware' ? 'CARBON-AWARE' : 'BASELINE';
    this.logKey = null;
  }

  setRunning(running) {
    const btn = $('btn-play');
    btn.textContent = running ? '❚❚' : '▶';
    btn.title = running ? 'Pause simulation' : 'Resume simulation';
    btn.classList.toggle('paused', !running);
  }

  setSpeed(speed) {
    document.querySelectorAll('#speed-group button').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
    });
  }

  // ----------------------------------------------------------------- update

  update(activeWorld, aware, baseline, grid, clock) {
    this.updateClock(clock);
    this.updateRegions(activeWorld, grid, clock);
    this.updateMetrics(activeWorld, aware, baseline);
    this.renderLog(activeWorld);
    if (this.selected) this.updateDetail(activeWorld, grid, clock);
  }

  updateClock(clock) {
    $('clock-utc').textContent = clock.formatUTC();
    $('clock-day').textContent = `DAY ${clock.simDay}`;
    $('clock-date').textContent = clock.formatDate();
  }

  updateRegions(world, grid, clock) {
    const now = clock.simMs;
    for (const def of this.regionDefs) {
      const region = world.regionsById[def.id];
      const ref = this.refs.get(def.id);
      const ci = grid.intensity(region, now);
      const renewable = grid.renewableShare(region, now);
      const capacity = region.capacity;
      const assigned = region.assigned.length;
      const offline = grid.hasEvent(def.id, 'outage', now);
      const events = grid.activeEvents(def.id, now);
      const color = ciColor(ci);

      ref.ci.textContent = offline ? 'OFF' : `${Math.round(ci)}`;
      ref.ci.style.color = offline ? '#ff5d5d' : color;
      ref.dot.style.background = offline ? '#ff5d5d' : color;
      ref.dot.style.boxShadow = `0 0 10px ${offline ? '#ff5d5d' : color}`;
      ref.time.textContent = formatLocalTime(now, def.utcOffset);
      ref.renFill.style.width = `${Math.round(renewable * 100)}%`;
      ref.renVal.textContent = `${Math.round(renewable * 100)}%`;
      ref.loadFill.style.width = `${Math.min(100, (assigned / Math.max(1, capacity)) * 100)}%`;
      ref.loadVal.textContent = offline ? 'offline' : `${assigned}/${capacity}`;
      ref.root.classList.toggle('offline', offline);
      ref.root.classList.toggle('active', this.selected === def.id);

      const evHtml = events
        .map((ev) => {
          const d = EVENT_DEFS[ev.type];
          return `<span class="ev-chip" style="border-color:${d.color};color:${d.color}">${d.icon} ${d.label}</span>`;
        })
        .join('');
      if (this.lastEventsHtml.get(def.id) !== evHtml) {
        ref.events.innerHTML = evHtml;
        this.lastEventsHtml.set(def.id, evHtml);
      }
    }
  }

  updateMetrics(active, aware, baseline) {
    const awareG = aware.metrics.emissionsG;
    const baselineG = baseline.metrics.emissionsG;
    const savedG = Math.max(0, baselineG - awareG);
    const pct = baselineG > 0.5 ? (savedG / baselineG) * 100 : 0;
    const avgDelay =
      active.metrics.delayCount > 0
        ? active.metrics.delaySumMin / active.metrics.delayCount
        : 0;

    $('m-jobs').textContent = `${active.metrics.jobsDone}`;
    $('m-jobs-sub').textContent = `baseline ${baseline.metrics.jobsDone} · aware ${aware.metrics.jobsDone}`;

    $('m-aware').textContent = `${(awareG / 1000).toFixed(1)} kg`;
    $('m-aware-sub').textContent = `${aware.metrics.energyKWh.toFixed(0)} kWh served`;

    $('m-baseline').textContent = `${(baselineG / 1000).toFixed(1)} kg`;
    $('m-baseline-sub').textContent = 'carbon-blind · run now';

    $('m-saved').textContent = `${(savedG / 1000).toFixed(1)} kg`;
    $('m-saved-pct').textContent = `${pct.toFixed(0)}% less CO₂ than baseline`;

    $('m-delay').textContent = formatDuration(avgDelay);
    $('m-delay-sub').textContent = `${active.metrics.delayed} delayed · ${active.metrics.routed} routed`;

    $('m-miss').textContent = `${active.metrics.deadlineMisses}`;
    $('m-miss').classList.toggle('bad', active.metrics.deadlineMisses > 0);
    $('m-miss-sub').textContent = 'deadline guard active';
  }

  renderLog(world) {
    const key = `${world.mode}:${world.logVersion}`;
    if (key === this.logKey) return;
    this.logKey = key;

    const list = $('log-list');
    const frag = document.createDocumentFragment();
    for (const entry of world.log.slice(0, 45)) {
      const row = document.createElement('div');
      row.className = `log-item ${entry.kind}`;
      const time = document.createElement('span');
      time.className = 'log-time';
      time.textContent = formatSimTime(entry.simMs);
      const text = document.createElement('span');
      text.className = 'log-text';
      text.textContent = entry.text;
      row.append(time, text);
      frag.appendChild(row);
    }
    list.replaceChildren(frag);
  }

  // ----------------------------------------------------------------- detail

  openDetail(regionId) {
    this.selected = regionId;
    const card = this.refs.get(regionId);
    if (card) card.root.classList.add('active');
    $('region-detail').classList.remove('hidden');
    this.detailForecastKey = null;
  }

  closeDetail() {
    this.selected = null;
    $('region-detail').classList.add('hidden');
    for (const ref of this.refs.values()) ref.root.classList.remove('active');
  }

  updateDetail(world, grid, clock) {
    const def = this.regionDefs.find((r) => r.id === this.selected);
    if (!def) return;
    const region = world.regionsById[def.id];
    const now = clock.simMs;
    const ci = grid.intensity(region, now);
    const solar = grid.solarAt(region, now);
    const wind = grid.windAt(region, now);
    const renewable = grid.renewableShare(region, now);
    const offline = grid.hasEvent(def.id, 'outage', now);
    const color = ciColor(ci);
    const delayCount = world.delayed.filter((j) => j.homeRegionId === def.id).length;
    const events = grid.activeEvents(def.id, now);

    $('detail-name').textContent = def.name;
    $('detail-ci').textContent = offline ? 'OFFLINE' : `${Math.round(ci)} gCO₂/kWh`;
    $('detail-ci').style.color = offline ? '#ff5d5d' : color;
    $('detail-sub').textContent = `${def.sub} · ${formatLocalTime(now, def.utcOffset)} local · UTC${
      def.utcOffset >= 0 ? '+' : ''
    }${def.utcOffset}`;
    $('detail-renew').textContent = `${Math.round(renewable * 100)}%`;
    $('detail-solar').textContent = `${Math.round(solar * 100)}%`;
    $('detail-wind').textContent = `${Math.round(wind * 100)}%`;
    $('detail-load').textContent = `${region.assigned.length}/${region.capacity}`;
    $('detail-queue').textContent = `${region.queue.length}`;
    $('detail-delayed').textContent = `${delayCount}`;
    $('detail-events').innerHTML = events
      .map((ev) => {
        const d = EVENT_DEFS[ev.type];
        return `<span class="ev-chip" style="border-color:${d.color};color:${d.color}">${d.icon} ${d.label}</span>`;
      })
      .join('');

    // Refresh the forecast strip only when the simulated time has moved a bit.
    const key = `${def.id}:${Math.floor(now / (5 * 60_000))}`;
    if (key !== this.detailForecastKey) {
      this.detailForecastKey = key;
      const fc = grid.forecast(region, now, 6, 30);
      const frag = document.createDocumentFragment();
      fc.forEach((point, i) => {
        const col = document.createElement('div');
        col.className = 'fc-col';
        col.title = `${formatSimTime(point.time)} · ${Math.round(point.ci)} gCO₂/kWh`;
        const bar = document.createElement('div');
        bar.className = 'fc-bar';
        bar.style.height = `${Math.max(5, (point.ci / 820) * 100)}%`;
        bar.style.background = ciColor(point.ci);
        const label = document.createElement('span');
        label.className = 'fc-time';
        label.textContent = i % 2 === 0 ? formatSimTime(point.time) : '';
        col.append(bar, label);
        frag.appendChild(col);
      });
      $('detail-forecast').replaceChildren(frag);
    }
  }

  // ------------------------------------------------------------------ toast

  showToast(text, color = '#4dd4ff') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.borderColor = color;
    toast.innerHTML = `<span class="toast-dot" style="background:${color}"></span><span></span>`;
    toast.lastElementChild.textContent = text;
    $('toasts').appendChild(toast);
    setTimeout(() => toast.classList.add('out'), 3200);
    setTimeout(() => toast.remove(), 3800);
  }
}
