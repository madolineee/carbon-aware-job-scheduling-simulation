// Guided demo / onboarding tour. The steps mirror DEMO.md, but actions can
// drive the live simulation so a first-time visitor can follow along.

const SEEN_KEY = 'carbongrid.guideSeen.v1';

export class GuidedTour {
  constructor(opts = {}) {
    this.opts = opts;
    this.index = 0;
    this.isOpen = false;
    this.returnFocus = null;

    this.steps = [
      {
        kicker: 'OPENING · 30 SEC',
        title: 'Cut CO₂ by choosing when and where',
        say: 'Imagine you run a company with data centers in four regions. Every job uses electricity — and some electricity is dirtier than others. Can we cut CO₂ just by choosing when and where we run jobs?',
        body: `
          <p>You are about to compare two schedulers that see the <b>same jobs, weather, and grid</b>. Both worlds run in lockstep, so the comparison is always fair.</p>
          <div class="guide-tip">You can reopen this tour any time with the <b>Guide</b> button in the top bar.</div>`,
        next: 'Start the tour',
      },
      {
        kicker: 'THE MAP · 30 SEC',
        title: 'Four regions, four grids',
        say: 'These are four data centers, each in a different region. Each has its own grid, and the carbon level changes through the day.',
        body: `
          <p><b>Drag</b> to rotate the globe and <b>scroll</b> to zoom. Click a region card or a data-center light to inspect it.</p>
          <p>You will see local time, renewable share, solar, wind, and how busy each region is.</p>`,
        actions: [
          {
            label: 'Focus Oregon',
            hint: 'open its live detail card',
            run: () => this.opts.onFocusRegion?.('oregon'),
            done: 'Oregon focused — close the guide to inspect its detail card.',
          },
        ],
        next: 'Next: read the colors',
      },
      {
        kicker: 'THE COLORS · 30 SEC',
        title: 'Green is clean, red is dirty',
        say: 'Green means below 200 grams of CO₂ per kilowatt-hour. Red means above 450. The goal is to run jobs when and where it is green.',
        body: `
          <p>The chart shows the last 24 hours for all four regions. The scheduler has a <b>perfect 6-hour forecast</b>, so it can see a cleaner window coming.</p>
          <div class="guide-legend">
            <span><i style="background:#3df5a5"></i>CLEAN &lt;200</span>
            <span><i style="background:#ffc857"></i>MODERATE</span>
            <span><i style="background:#ff5d5d"></i>DIRTY &gt;450</span>
          </div>`,
        next: 'Next: the baseline',
      },
      {
        kicker: 'BASELINE · 1 MIN',
        title: 'Carbon-blind, always on',
        say: 'The baseline is carbon-blind. Every job runs right away, no matter how dirty the grid is. Remember this number.',
        body: `
          <p>Run at <b>4×</b> for a few simulated hours. Baseline emissions keep climbing because no job ever waits or moves.</p>
          <p>Both worlds receive the same job stream, so the baseline keeps running even while you look at the other world.</p>`,
        actions: [
          {
            label: 'Reset & run baseline at 4×',
            primary: true,
            run: () => this.opts.onRunBaseline?.(),
            done: 'Baseline running at 4× — watch the baseline emissions rise.',
          },
        ],
        next: 'Next: carbon-aware',
      },
      {
        kicker: 'CARBON-AWARE · 1 MIN',
        title: 'The scheduler thinks first',
        say: 'Now the scheduler thinks before running a job. Same jobs, same weather — but four questions before every decision.',
        body: `
          <ol class="guide-rules">
            <li><b>Urgent?</b> Run it now.</li>
            <li><b>Local grid clean?</b> Run it now.</li>
            <li><b>Another region much cleaner?</b> Route it there.</li>
            <li><b>Cleaner window before the deadline?</b> Wait for it.</li>
          </ol>
          <p>A <b>deadline guard</b> forces a start if waiting ever gets risky. That is why deadline misses stay at zero.</p>`,
        actions: [
          {
            label: 'Show carbon-aware view',
            primary: true,
            run: () => this.opts.onShowAware?.(),
            done: 'Carbon-aware view active — the same run, scheduled differently.',
          },
        ],
        next: 'Next: tune the controls',
      },
      {
        kicker: 'CONTROLS · 1.5 MIN',
        title: 'Change one thing at a time',
        say: 'More urgent work leaves less room to be green. More flexible work gives the scheduler more freedom.',
        body: `
          <p>Try a control. New jobs respond immediately; already-running jobs finish normally. Watch the <b>CO₂ saved</b> metric after each change.</p>`,
        lab: true,
        actions: [
          {
            label: 'Urgent 80%',
            hint: 'less room to wait',
            run: () => this.opts.onParam?.('urgentShare', 0.8),
            done: 'Urgent share set to 80% — savings should fall.',
          },
          {
            label: 'Urgent 10%',
            hint: 'more flexible work',
            run: () => this.opts.onParam?.('urgentShare', 0.1),
            done: 'Urgent share set to 10% — savings should rise.',
          },
          {
            label: 'Green 120',
            hint: 'stricter clean rule',
            run: () => this.opts.onParam?.('greenThreshold', 120),
            done: 'Green threshold lowered to 120 g — expect more waiting.',
          },
          {
            label: 'Route gain 10%',
            hint: 'easier to move jobs',
            run: () => this.opts.onParam?.('routeGain', 0.1),
            done: 'Route gain set to 10% — jobs move between regions more easily.',
          },
          {
            label: '+10 flexible jobs',
            hint: 'inject a batch',
            run: () => this.opts.onBatch?.(),
            done: '10 flexible jobs submitted to both worlds.',
          },
          {
            label: 'Restore defaults',
            hint: 'urgent 30 · green 200 · gain 25%',
            run: () => this.opts.onDefaults?.(),
            done: 'Control values restored to their defaults.',
          },
        ],
        next: 'Next: read the results',
      },
      {
        kicker: 'RESULTS · 1 MIN',
        title: 'Carbon down, deadlines safe',
        say: 'CO₂ saved is the difference between the two worlds. Average flex delay is the cost. Deadline misses stays at zero because of the guard.',
        body: `
          <p>The <b>scheduler log</b> records every run, route, delay, and forced start. Switch worlds at any time to see what the other scheduler did with the same job.</p>
          <div class="guide-tip"><b>CO₂ saved</b> = baseline emissions − carbon-aware emissions.</div>`,
        actions: [
          {
            label: 'Show baseline',
            hint: 'carbon-blind decisions',
            run: () => this.opts.onMode?.('baseline'),
            done: 'Showing the baseline world.',
          },
          {
            label: 'Show carbon-aware',
            hint: 'optimized decisions',
            run: () => this.opts.onMode?.('aware'),
            done: 'Showing the carbon-aware world.',
          },
          {
            label: 'Pause & review',
            hint: 'freeze the numbers',
            run: () => this.opts.onPause?.(),
            done: 'Simulation paused — read the final metrics.',
          },
        ],
        lab: true,
        next: 'Finish',
      },
      {
        kicker: 'CLOSING · 30 SEC',
        title: 'Flexible work is the lever',
        say: 'Flexible work, like backups or batch processing, can wait for clean energy or move to a cleaner region. We cut CO₂ without losing work. The trade-off is a small delay.',
        body: `
          <p>That is the whole idea: <b>shift flexible load toward clean energy</b>. Urgent work still runs immediately, and the deadline guard keeps every job on time.</p>
          <div class="guide-tip">Reset restarts both worlds from day 1 with the same seeded job stream.</div>`,
        next: 'Finish',
      },
    ];

    this.build();
    this.bind();
  }

  build() {
    this.root = document.createElement('div');
    this.root.id = 'guide';
    this.root.className = 'guide';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'guide-title');
    this.root.innerHTML = `
      <div class="guide-card" role="document">
        <div class="guide-top">
          <div class="guide-badge"><i></i>GUIDED DEMO</div>
          <div class="guide-top-right">
            <span class="guide-step" id="guide-step"></span>
            <button class="guide-close" id="guide-close" title="Close guide" aria-label="Close guide">×</button>
          </div>
        </div>
        <div class="guide-progress"><i id="guide-progress-fill"></i></div>
        <div class="guide-kicker" id="guide-kicker"></div>
        <h2 class="guide-title" id="guide-title"></h2>
        <blockquote class="guide-say" id="guide-say"></blockquote>
        <div class="guide-body" id="guide-body"></div>
        <div class="guide-actions" id="guide-actions"></div>
        <div class="guide-status" id="guide-status" aria-live="polite"></div>
        <div class="guide-foot">
          <button class="ghost-btn guide-back" id="guide-back">Back</button>
          <div class="guide-dots" id="guide-dots"></div>
          <button class="primary-btn guide-next" id="guide-next">Next</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.card = this.root.querySelector('.guide-card');
    this.elStep = this.root.querySelector('#guide-step');
    this.elKicker = this.root.querySelector('#guide-kicker');
    this.elTitle = this.root.querySelector('#guide-title');
    this.elSay = this.root.querySelector('#guide-say');
    this.elBody = this.root.querySelector('#guide-body');
    this.elActions = this.root.querySelector('#guide-actions');
    this.elStatus = this.root.querySelector('#guide-status');
    this.elDots = this.root.querySelector('#guide-dots');
    this.elProgress = this.root.querySelector('#guide-progress-fill');
    this.btnBack = this.root.querySelector('#guide-back');
    this.btnNext = this.root.querySelector('#guide-next');
  }

  bind() {
    this.root.querySelector('#guide-close').addEventListener('click', () => this.close());
    this.root.addEventListener('click', (event) => {
      if (event.target === this.root) this.close();
    });
    this.btnBack.addEventListener('click', () => this.back());
    this.btnNext.addEventListener('click', () => this.next());

    this.onKeyDown = (event) => {
      if (!this.isOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.back();
      } else if (event.key === 'Tab') {
        // Keep keyboard focus inside the modal.
        const focusables = [...this.card.querySelectorAll('button:not([disabled])')].filter(
          (el) => el.offsetParent !== null,
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  open(step = 0) {
    if (this.isOpen) return;
    this.returnFocus = document.activeElement;
    this.index = Math.min(this.steps.length - 1, Math.max(0, step));
    this.isOpen = true;
    this.root.classList.add('open');
    document.body.classList.add('guide-open');
    this.render();
    requestAnimationFrame(() => this.btnNext.focus());
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    document.body.classList.remove('guide-open');
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage can be unavailable in private mode */
    }
    this.returnFocus?.focus?.();
  }

  next() {
    if (this.index >= this.steps.length - 1) {
      this.close();
      return;
    }
    this.index++;
    this.render();
  }

  back() {
    if (this.index === 0) return;
    this.index--;
    this.render();
  }

  render() {
    const step = this.steps[this.index];
    const last = this.index === this.steps.length - 1;

    this.elStep.textContent = `STEP ${this.index + 1} / ${this.steps.length}`;
    this.elKicker.textContent = step.kicker;
    this.elTitle.textContent = step.title;
    this.elSay.textContent = `“${step.say}”`;
    this.elBody.innerHTML = step.body || '';
    this.elStatus.textContent = '';
    this.elStatus.classList.remove('show');
    this.elProgress.style.width = `${((this.index + 1) / this.steps.length) * 100}%`;

    this.elActions.className = `guide-actions${step.lab ? ' lab' : ''}`;
    this.elActions.innerHTML = '';
    for (const action of step.actions || []) {
      const btn = document.createElement('button');
      if (step.lab) {
        btn.className = 'guide-lab-btn';
        btn.innerHTML = `<b>${action.label}</b>${action.hint ? `<span>${action.hint}</span>` : ''}`;
      } else {
        btn.className = action.primary ? 'primary-btn guide-action' : 'ghost-btn guide-action';
        btn.textContent = action.label;
      }
      btn.addEventListener('click', () => {
        action.run?.();
        if (step.lab) btn.classList.add('applied');
        this.elStatus.textContent = action.done || `${action.label} applied.`;
        this.elStatus.classList.add('show');
      });
      this.elActions.appendChild(btn);
    }
    this.elActions.classList.toggle('empty', this.elActions.children.length === 0);

    this.elDots.innerHTML = '';
    for (let i = 0; i < this.steps.length; i++) {
      const dot = document.createElement('span');
      dot.className = i === this.index ? 'active' : i < this.index ? 'done' : '';
      this.elDots.appendChild(dot);
    }

    this.btnBack.style.visibility = this.index === 0 ? 'hidden' : 'visible';
    this.btnNext.textContent = step.next || (last ? 'Finish' : 'Next');
    this.card.scrollTop = 0;
  }

  /** Auto-open once on the first visit, after the boot screen is gone. */
  maybeAutoOpen(delayMs = 1400) {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      seen = false;
    }
    if (seen) return;
    setTimeout(() => {
      if (!this.isOpen) this.open(0);
    }, delayMs);
  }
}
