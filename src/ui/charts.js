import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { formatSimTime } from '../clock.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
);

const POINTS = 97; // 24h at 15-minute resolution
const STEP_MS = 15 * 60_000;

export class CIChart {
  constructor(canvas, regions) {
    this.regions = regions;
    this.labels = [];
    this.data = Object.fromEntries(regions.map((r) => [r.id, []]));

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: regions.map((r) => ({
          label: r.name,
          data: this.data[r.id],
          borderColor: r.color,
          backgroundColor: r.color,
          borderWidth: 1.7,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.35,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 2, right: 4, bottom: 0, left: 0 } },
        plugins: {
          legend: {
            position: 'top',
            align: 'end',
            labels: {
              color: '#93adbd',
              boxWidth: 10,
              boxHeight: 2,
              usePointStyle: true,
              pointStyle: 'line',
              padding: 8,
              font: { family: "'IBM Plex Mono', monospace", size: 9 },
            },
          },
          tooltip: {
            backgroundColor: 'rgba(4,13,21,0.95)',
            borderColor: 'rgba(92,180,220,0.28)',
            borderWidth: 1,
            titleColor: '#dcecf6',
            bodyColor: '#a9c2d0',
            titleFont: { family: "'IBM Plex Mono', monospace", size: 10 },
            bodyFont: { family: "'IBM Plex Mono', monospace", size: 10 },
            padding: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${Math.round(ctx.parsed.y)} g`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.035)' },
            border: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#5d7787',
              maxTicksLimit: 5,
              maxRotation: 0,
              font: { family: "'IBM Plex Mono', monospace", size: 8.5 },
            },
          },
          y: {
            min: 0,
            suggestedMax: 820,
            grid: { color: 'rgba(255,255,255,0.045)' },
            border: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#5d7787',
              stepSize: 200,
              font: { family: "'IBM Plex Mono', monospace", size: 8.5 },
            },
          },
        },
      },
    });
  }

  seed(grid, now) {
    this.labels.length = 0;
    for (const r of this.regions) this.data[r.id].length = 0;
    for (let i = POINTS - 1; i >= 0; i--) {
      const t = now - i * STEP_MS;
      this.labels.push(formatSimTime(t));
      for (const r of this.regions) {
        this.data[r.id].push(grid.baseIntensity(r, t));
      }
    }
    this.chart.update('none');
  }

  push(grid, now) {
    this.labels.push(formatSimTime(now));
    if (this.labels.length > POINTS) this.labels.shift();
    for (const r of this.regions) {
      const arr = this.data[r.id];
      arr.push(grid.baseIntensity(r, now));
      if (arr.length > POINTS) arr.shift();
    }
    this.chart.update('none');
  }
}
