# Class Demo Script: Carbon // Grid

**Total time:** about 5–7 minutes. Say the **bold** lines out loud and do the
*clicks* as you talk. The in-app **Guide** button follows the same sequence and
can set up each world for you.

> Both schedulers run at the same time from the same job stream. Switching
> between **Baseline** and **Carbon-Aware** changes what you see, not what has
> been simulated — so the comparison stays fair.

---

## Opening (30 sec)

**"Imagine you run a company with data centers in four regions. Every job you
run uses electricity, and some electricity is dirtier than others. Can we cut
CO₂ just by choosing when and where we run jobs?"**

---

## Step 1: Show the map (30 sec)

*Open the simulation. Drag to rotate, scroll to zoom.*

**"These are four data centers, each in a different region. Each has its own
grid, and the carbon level changes through the day."**

*Click a region card or a data center — Oregon is a good first choice.*

**"Here I can see its local time, renewable share, solar, wind, and how busy it
is. The forecast strip shows the next six hours."**

---

## Step 2: Explain the colors (30 sec)

*Point to the **Grid carbon intensity** chart and the legend underneath it.*

**"Green means clean, below 200 grams of CO₂ per kilowatt-hour. Red means dirty,
above 450. Amber is in between. The goal is to run jobs when and where it is
green."**

**"The scheduler has a perfect six-hour forecast of these curves, so it can see a
cleaner window coming."**

---

## Step 3: Run the Baseline (1 min)

*Click **Reset** if you want a fresh start, then select **Baseline** and press
**4×**.*

**"The baseline is carbon-blind. Every job runs right away, no matter how dirty
the grid is. Nothing waits, and nothing moves between regions."**

*Let it run for a few seconds, then point to **Baseline emissions**.*

**"Remember this number. The baseline keeps running in the background even while
we look at the other scheduler."**

---

## Step 4: Switch to Carbon-Aware (1 min)

*Select **Carbon-Aware**. Keep it running at **4×**. No reset is needed — the same
jobs have been scheduled by both worlds since the start.*

**"Now the scheduler thinks before running a job. Same jobs, same weather, but
four questions before every decision."**

Explain the rules in plain words:

1. Urgent job? Run now.
2. Local grid clean? Run now.
3. Another region much cleaner? Send it there.
4. Otherwise, wait for a cleaner time before the deadline.

*Point to the **Scheduler log**.*

**"Here we can see each decision as it happens: run, route, delay, or a forced
start from the deadline guard."**

---

## Step 5: Show the controls (1.5 min)

*Change one setting at a time and let the class see what happens. The in-app
Guide's **Controls** step has one-click versions of these.*

| Try this | Say this |
|---|---|
| **Urgent share → 80%** | "More urgent jobs means less room to be green. Savings drop." |
| **Urgent share → 10%** | "More flexible jobs means more room to wait. Savings rise." |
| **Green threshold → lower** | "A stricter clean-energy rule means more waiting and routing." |
| **Route gain → lower** | "Jobs move between regions more easily." |
| **Submit 10 flexible jobs** | "A batch of jobs arrives. Watch them get delayed or routed." |

*Note: urgent-share changes affect both worlds because both receive the same job
mix. Threshold and route-gain changes only affect the carbon-aware scheduler.*

---

## Step 6: Read the results (1 min)

*Point to the results panel along the bottom.*

- **CO₂ saved:** "This is the difference between the two worlds, in kilograms."
- **Avg flex delay:** "This is the cost. Flexible jobs wait a bit."
- **Deadline misses:** "It stays at 0 because of the deadline guard."
- **Jobs done:** "Both worlds finish the same work. We are not dropping jobs to
  look green."

---

## Closing (30 sec)

**"Flexible work, like backups or batch processing, can wait for clean energy or
move to a cleaner region. We cut CO₂ without losing work. The trade-off is a small
delay."**

**"Urgent work still runs immediately, and no job misses its deadline."**

---

## Quick recovery notes

- **Numbers are moving too fast:** switch to **1×** or **2×**, or press
  **Space** to pause.
- **Want a clean comparison:** press **Reset**; both worlds restart from day 1
  with the same seeded jobs.
- **Nothing seems to change:** the scheduler only re-decides for jobs that have
  not started yet. Give it a few simulated minutes at 4×.
- **Guide closed too early:** click **Guide** in the top bar to reopen it.
