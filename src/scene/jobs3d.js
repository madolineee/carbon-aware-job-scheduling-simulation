import * as THREE from 'three';
import { GLOBE_RADIUS } from './globe.js';

const FLEX_COLOR = 0x4aa8ff;
const URGENT_COLOR = 0xff9d3c;
const DONE_COLOR = 0x3df5a5;

let clockTexture = null;
function getClockTexture() {
  if (clockTexture) return clockTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(5,16,24,0.86)';
  ctx.fill();
  ctx.strokeStyle = '#ffc857';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#ffc857';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(64, 64);
  ctx.lineTo(64, 34);
  ctx.moveTo(64, 64);
  ctx.lineTo(88, 74);
  ctx.stroke();
  clockTexture = new THREE.CanvasTexture(c);
  clockTexture.colorSpace = THREE.SRGBColorSpace;
  return clockTexture;
}

let clockMaterial = null;
function getClockMaterial() {
  if (!clockMaterial) {
    clockMaterial = new THREE.SpriteMaterial({
      map: getClockTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
  }
  return clockMaterial;
}

function makeSavedLabel(job) {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 96;
  const ctx = c.getContext('2d');
  const saved = job.savedG ?? 0;
  const text = saved > 20 ? `+${(saved / 1000).toFixed(2)} kg CO₂` : 'done';
  ctx.fillStyle = 'rgba(4,20,16,0.8)';
  ctx.strokeStyle = 'rgba(61,245,165,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(8, 12, 368, 72, 18);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3df5a5';
  ctx.font = '600 40px "IBM Plex Mono", "Consolas", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 51);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class JobVisuals {
  constructor(scene, anchors) {
    this.scene = scene;
    this.anchors = anchors; // Map<regionId, dataCenter>
    this.visuals = new Map();
    this.effects = [];
    this.boxGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    this.flexMat = new THREE.MeshStandardMaterial({
      color: 0x0a2a4a,
      emissive: FLEX_COLOR,
      emissiveIntensity: 1.7,
      metalness: 0.15,
      roughness: 0.35,
    });
    this.urgentMat = new THREE.MeshStandardMaterial({
      color: 0x3a1a06,
      emissive: URGENT_COLOR,
      emissiveIntensity: 1.9,
      metalness: 0.15,
      roughness: 0.35,
    });
    this.tmpA = new THREE.Vector3();
    this.tmpB = new THREE.Vector3();
    this.tmpC = new THREE.Vector3();
  }

  visualFor(job) {
    let vis = this.visuals.get(job.id);
    if (vis) return vis;
    const mat = job.type === 'urgent' ? this.urgentMat : this.flexMat;
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.scale.setScalar(job.type === 'urgent' ? 1.12 : 1);
    this.scene.add(mesh);
    vis = {
      mesh,
      clock: null,
      trail: null,
      trailCurvePoints: null,
      routeT0: null,
      runT0: null,
      seenState: null,
    };
    this.visuals.set(job.id, vis);
    return vis;
  }

  ensureClock(vis) {
    if (vis.clock) return vis.clock;
    const sprite = new THREE.Sprite(getClockMaterial());
    sprite.scale.setScalar(0.17);
    sprite.position.set(0, 0.16, 0);
    vis.mesh.add(sprite);
    vis.clock = sprite;
    return sprite;
  }

  makeTrail(vis, job, start, mid, end) {
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const points = curve.getPoints(64);
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const color = job.type === 'urgent' ? URGENT_COLOR : FLEX_COLOR;
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    line.geometry.setDrawRange(0, 2);
    this.scene.add(line);
    vis.trail = line;
    vis.trailCurvePoints = points;
    return curve;
  }

  removeTrail(vis) {
    if (!vis.trail) return;
    this.scene.remove(vis.trail);
    vis.trail.geometry.dispose();
    vis.trail.material.dispose();
    vis.trail = null;
    vis.trailCurvePoints = null;
  }

  update(job, vis, world, dt, realTime) {
    const anchor =
      this.anchors.get(job.regionId) || this.anchors.get(job.homeRegionId);
    const home = this.anchors.get(job.homeRegionId) || anchor;
    if (!anchor || !home) return;

    if (vis.clock) vis.clock.visible = job.state === 'delayed';

    if (job.state === 'routing' && job.route) {
      const from = this.anchors.get(job.route.from) || home;
      const to = this.anchors.get(job.route.to) || anchor;
      const start = from.getHoverPosition(this.tmpA).clone();
      const end = to.getSlotWorldPosition(job.slotIndex, this.tmpB).clone();
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const dist = start.distanceTo(end);
      mid.normalize().multiplyScalar(Math.max(GLOBE_RADIUS, mid.length()) + 1.2 + dist * 0.14);

      if (!vis.routeT0) {
        vis.routeT0 = realTime;
        vis.trailCurve = this.makeTrail(vis, job, start, mid, end);
      }
      const t = Math.min(1, (realTime - vis.routeT0) / 1.15);
      const ease = t * t * (3 - 2 * t);
      if (vis.trailCurve) vis.trailCurve.getPoint(ease, vis.mesh.position);
      else vis.mesh.position.lerp(end, 0.2);
      if (vis.trail) {
        vis.trail.geometry.setDrawRange(0, Math.max(2, Math.floor(ease * 64)));
        vis.trail.material.opacity = 0.45 * (1 - Math.max(0, t - 0.8) / 0.2);
      }
      vis.mesh.rotation.y += dt * 4;
      vis.mesh.rotation.x += dt * 2.5;
      vis.mesh.scale.setScalar(1 + Math.sin(realTime * 6) * 0.08);
      return;
    }

    if (job.state === 'running') {
      this.removeTrail(vis);
      if (!vis.runT0) vis.runT0 = realTime;
      const slot = anchor.getSlotWorldPosition(job.slotIndex, this.tmpA);
      const t = Math.min(1, (realTime - vis.runT0) / 0.5);
      const sink = (1 - t) * 0.42;
      const target = slot.clone().addScaledVector(anchor.normal, sink);
      vis.mesh.position.lerp(target, 0.3);
      vis.mesh.rotation.y += dt * 1.8;
      vis.mesh.scale.setScalar(1 + Math.sin(realTime * 3 + job.id) * 0.03);
      return;
    }

    // Queued or delayed: hover in a small orbit around the home region.
    this.removeTrail(vis);
    const hover = home.getHoverPosition(this.tmpA).clone();
    const basis = home.getBasis();
    const angle = job.id * 2.399 + realTime * 0.35;
    const radius = 0.33 + (job.id % 3) * 0.1;
    const target = hover
      .addScaledVector(basis.tangentA, Math.cos(angle) * radius)
      .addScaledVector(basis.tangentB, Math.sin(angle) * radius)
      .addScaledVector(
        basis.n,
        (job.state === 'delayed' ? 0.16 : 0.06) + Math.sin(realTime * 1.3 + job.id) * 0.05,
      );
    vis.mesh.position.lerp(target, 0.16);
    vis.mesh.rotation.y += dt * 1.1;
    vis.mesh.scale.setScalar(1 + Math.sin(realTime * 2.2 + job.id) * 0.06);
    if (job.state === 'delayed') {
      const clock = this.ensureClock(vis);
      clock.visible = true;
    }
  }

  sync(world, dt, realTime) {
    const active = new Set();
    for (const job of world.jobs.values()) {
      active.add(job.id);
      const vis = this.visualFor(job);
      this.update(job, vis, world, dt, realTime);
    }
    for (const [id, vis] of this.visuals) {
      if (active.has(id)) continue;
      this.removeVisual(vis);
      this.visuals.delete(id);
    }
    this.updateEffects(realTime);
  }

  removeVisual(vis) {
    this.removeTrail(vis);
    if (vis.clock) vis.mesh.remove(vis.clock);
    this.scene.remove(vis.mesh);
  }

  spawnDone(job, region, realTime) {
    const anchor = this.anchors.get(job.regionId) || this.anchors.get(region?.id);
    if (!anchor) return;
    const pos = anchor.getSlotWorldPosition(job.slotIndex ?? 0, new THREE.Vector3());
    const mat = new THREE.MeshBasicMaterial({
      color: DONE_COLOR,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(this.boxGeo, mat);
    mesh.position.copy(pos);
    mesh.scale.setScalar(1.5);
    this.scene.add(mesh);

    const tex = makeSavedLabel(job);
    const spriteMat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(pos);
    sprite.scale.set(0.95, 0.24, 1);
    this.scene.add(sprite);

    this.effects.push({
      mesh,
      mat,
      sprite,
      spriteMat,
      tex,
      t0: realTime,
      origin: pos,
      normal: anchor.normal.clone(),
    });

    if (this.effects.length > 14) {
      this.disposeEffect(this.effects.shift());
    }
  }

  updateEffects(realTime) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      const age = realTime - fx.t0;
      const t = age / 1.5;
      if (t >= 1) {
        this.disposeEffect(fx);
        this.effects.splice(i, 1);
        continue;
      }
      fx.mesh.position.copy(fx.origin).addScaledVector(fx.normal, t * 0.85);
      const s = 1.5 * (1 + t * 0.5);
      fx.mesh.scale.setScalar(s);
      fx.mat.opacity = 1 - t;
      fx.sprite.position
        .copy(fx.origin)
        .addScaledVector(fx.normal, 0.25 + t * 1.15);
      fx.spriteMat.opacity = Math.min(1, (1 - t) * 1.4);
      fx.sprite.scale.set(0.95 * (1 + t * 0.3), 0.24 * (1 + t * 0.3), 1);
    }
  }

  disposeEffect(fx) {
    if (!fx) return;
    this.scene.remove(fx.mesh);
    this.scene.remove(fx.sprite);
    fx.mat.dispose();
    fx.spriteMat.dispose();
    fx.tex.dispose();
  }

  clear() {
    for (const vis of this.visuals.values()) this.removeVisual(vis);
    this.visuals.clear();
    for (const fx of this.effects) this.disposeEffect(fx);
    this.effects = [];
  }
}
