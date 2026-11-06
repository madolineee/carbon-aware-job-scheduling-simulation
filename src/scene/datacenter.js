import * as THREE from 'three';
import { GLOBE_RADIUS, latLonToVector3 } from './globe.js';
import { ciColor } from '../grid.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

let smokeTexture = null;
function getSmokeTexture() {
  if (smokeTexture) return smokeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(190,200,208,0.85)');
  g.addColorStop(0.45, 'rgba(140,152,162,0.4)');
  g.addColorStop(1, 'rgba(90,100,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  smokeTexture = new THREE.CanvasTexture(c);
  return smokeTexture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export function createDataCenter(region, parent) {
  const group = new THREE.Group();
  const normal = latLonToVector3(region.lat, region.lon, 1).normalize();
  group.position.copy(normal).multiplyScalar(GLOBE_RADIUS);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  group.userData.regionId = region.id;
  parent.add(group);

  const rackX = [-0.24, 0, 0.24];

  // --- platform -----------------------------------------------------------
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(0.64, 0.74, 0.12, 36),
    new THREE.MeshStandardMaterial({
      color: 0x0a1a26,
      metalness: 0.75,
      roughness: 0.38,
      emissive: 0x061c2b,
      emissiveIntensity: 0.8,
    }),
  );
  platform.position.y = 0.06;
  group.add(platform);

  // --- carbon intensity rings --------------------------------------------
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x3df5a5,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.9, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  group.add(ring);

  const ring2Mat = new THREE.MeshBasicMaterial({
    color: 0x3df5a5,
    transparent: true,
    opacity: 0.2,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.02, 64), ring2Mat);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.012;
  group.add(ring2);

  // --- server racks -------------------------------------------------------
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0x102b3d,
    metalness: 0.7,
    roughness: 0.32,
    emissive: 0x0c3a52,
    emissiveIntensity: 0.9,
  });
  const edgeMat = new THREE.LineBasicMaterial({
    color: 0x2b8db3,
    transparent: true,
    opacity: 0.45,
  });
  for (const x of rackX) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.36, 0.22), rackMat);
    rack.position.set(x, 0.3, 0);
    group.add(rack);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(0.2, 0.36, 0.22)),
      edgeMat,
    );
    edges.position.copy(rack.position);
    group.add(edges);
  }

  // --- slot lights --------------------------------------------------------
  const offMat = new THREE.MeshBasicMaterial({ color: 0x0a2430 });
  const onMat = new THREE.MeshBasicMaterial({ color: 0x3df5a5 });
  const dimMat = new THREE.MeshBasicMaterial({ color: 0x12704c });
  const routeMat = new THREE.MeshBasicMaterial({ color: 0x4dd4ff });
  const lightGeo = new THREE.BoxGeometry(0.045, 0.018, 0.045);
  const slotLights = [];
  const slotLocal = [];
  for (let i = 0; i < 8; i++) {
    const rack = Math.floor(i / 3);
    const within = i % 3;
    const x = rackX[rack];
    const z = -0.066 + within * 0.066;
    const light = new THREE.Mesh(lightGeo, offMat);
    light.position.set(x, 0.487, z);
    group.add(light);
    slotLights.push(light);
    slotLocal.push({ x, y: 0.55, z });
  }

  // --- wind turbine -------------------------------------------------------
  const turbine = new THREE.Group();
  turbine.position.set(-0.58, 0, -0.34);
  group.add(turbine);

  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x9fb4c0,
    metalness: 0.4,
    roughness: 0.5,
  });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 0.66, 8), mastMat);
  mast.position.y = 0.33;
  turbine.add(mast);

  const rotor = new THREE.Group();
  rotor.position.set(0, 0.66, 0.03);
  turbine.add(rotor);
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xcfe3ea,
    metalness: 0.2,
    roughness: 0.55,
  });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), bladeMat);
  rotor.add(hub);
  for (let b = 0; b < 3; b++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.42, 0.012), bladeMat);
    blade.position.y = 0.21;
    const pivot = new THREE.Group();
    pivot.rotation.z = (b * Math.PI * 2) / 3;
    pivot.add(blade);
    rotor.add(pivot);
  }

  // --- solar panel --------------------------------------------------------
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x0b2b3d,
    metalness: 0.6,
    roughness: 0.25,
    emissive: 0x2ad4ff,
    emissiveIntensity: 0.3,
  });
  const panelGroup = new THREE.Group();
  panelGroup.position.set(0.58, 0.1, -0.3);
  panelGroup.rotation.set(-0.55, 0.5, 0.1);
  group.add(panelGroup);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.018, 0.3), panelMat);
  panelGroup.add(panel);

  // --- smoke plume --------------------------------------------------------
  const smokeGroup = new THREE.Group();
  smokeGroup.position.y = 0.45;
  group.add(smokeGroup);
  const smokeSprites = [];
  const smokeMap = getSmokeTexture();
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({
      map: smokeMap,
      color: 0x93a0a8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const baseX = (Math.random() - 0.5) * 0.34;
    const baseZ = (Math.random() - 0.5) * 0.22;
    sprite.position.set(baseX, 0, baseZ);
    sprite.scale.setScalar(0.24 + Math.random() * 0.24);
    sprite.userData = {
      baseX,
      baseZ,
      phase: Math.random(),
      speed: 0.1 + Math.random() * 0.09,
    };
    smokeGroup.add(sprite);
    smokeSprites.push(sprite);
  }
  smokeGroup.visible = false;

  // --- floating label -----------------------------------------------------
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 128;
  const labelCtx = labelCanvas.getContext('2d');
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  const labelSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture,
      transparent: true,
      depthWrite: false,
    }),
  );
  labelSprite.scale.set(1.18, 0.295, 1);
  labelSprite.position.set(0, 1.12, 0);
  group.add(labelSprite);

  let lastLabelCI = -1;
  let lastLabelOffline = null;
  let lastLabelAt = -1;

  function drawLabel(ci, offline) {
    const ctx = labelCtx;
    const color = offline ? '#ff5d5d' : ciColor(ci);
    ctx.clearRect(0, 0, 512, 128);
    ctx.fillStyle = 'rgba(3, 12, 19, 0.78)';
    roundRect(ctx, 8, 10, 496, 108, 22);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8f6ff';
    ctx.font = '600 40px "Space Grotesk", "Segoe UI", sans-serif';
    ctx.fillText(region.name.toUpperCase(), 256, 56);
    ctx.fillStyle = color;
    ctx.font = '500 36px "IBM Plex Mono", "Consolas", monospace';
    ctx.fillText(offline ? 'OFFLINE' : `${Math.round(ci)} g/kWh`, 256, 98);
    labelTexture.needsUpdate = true;
  }

  // --- invisible click target --------------------------------------------
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 16, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  hitMesh.position.y = 0.35;
  hitMesh.userData.regionId = region.id;
  group.add(hitMesh);

  group.updateMatrixWorld(true);

  const tmp = new THREE.Vector3();

  function getSlotWorldPosition(index, target = new THREE.Vector3()) {
    const p = slotLocal[index % slotLocal.length];
    return group.localToWorld(target.set(p.x, p.y, p.z));
  }

  function getHoverPosition(target = new THREE.Vector3()) {
    return group.localToWorld(target.set(0, 0.95, 0));
  }

  function update(state, realTime, dt = 0.016) {
    const { ci, solar = 0, wind = 0, load = 0, assigned = 0, running = 0, offline = false } = state;
    const color = ciColor(ci);

    ringMat.color.set(color);
    ring2Mat.color.set(color);
    ringMat.opacity = 0.58 + 0.14 * Math.sin(realTime * 2.1);
    ring2Mat.opacity = 0.16 + 0.1 * Math.sin(realTime * 1.4 + 1.2);
    const pulse = 1 + 0.035 * Math.sin(realTime * 2.1);
    ring.scale.setScalar(pulse);
    ring2.scale.setScalar(1 + 0.06 * Math.sin(realTime * 1.2));

    rackMat.emissiveIntensity = 0.35 + load * 1.25;

    for (let i = 0; i < slotLights.length; i++) {
      let mat = offMat;
      if (!offline && i < assigned) {
        if (i < running) {
          mat = Math.floor(realTime * 4 + i * 0.7) % 7 === 0 ? dimMat : onMat;
        } else {
          mat = routeMat;
        }
      }
      slotLights[i].material = mat;
    }

    rotor.rotation.z += dt * (1.2 + wind * 14);
    panelMat.emissiveIntensity = 0.1 + clamp(solar, 0, 1) * 2.4;

    const dirty = clamp((ci - 240) / 430, 0, 1);
    smokeGroup.visible = dirty > 0.02;
    for (const sprite of smokeSprites) {
      const u = sprite.userData;
      const t = (realTime * u.speed + u.phase) % 1;
      sprite.position.x = u.baseX + Math.sin(realTime * 0.7 + u.phase * 9) * 0.12 * t;
      sprite.position.z = u.baseZ + Math.cos(realTime * 0.5 + u.phase * 5) * 0.07 * t;
      sprite.position.y = t * 1.05;
      const fade = Math.sin(Math.PI * t);
      sprite.material.opacity = dirty * 0.34 * fade;
    }

    if (
      realTime - lastLabelAt > 0.35 &&
      (Math.abs(ci - lastLabelCI) > 2 || offline !== lastLabelOffline)
    ) {
      drawLabel(ci, offline);
      lastLabelCI = ci;
      lastLabelOffline = offline;
      lastLabelAt = realTime;
    }
  }

  // Initialise the label immediately.
  drawLabel(450, false);
  lastLabelCI = 450;

  return {
    regionId: region.id,
    group,
    hitMesh,
    labelSprite,
    normal,
    update,
    getSlotWorldPosition,
    getHoverPosition,
    get position() {
      return group.position;
    },
    getBasis(target = {}) {
      const n = normal.clone();
      const tangentA = new THREE.Vector3(0, 1, 0).cross(n);
      if (tangentA.lengthSq() < 0.01) tangentA.set(1, 0, 0).cross(n);
      tangentA.normalize();
      const tangentB = new THREE.Vector3().crossVectors(n, tangentA).normalize();
      return { n, tangentA, tangentB };
    },
    tmp,
  };
}
