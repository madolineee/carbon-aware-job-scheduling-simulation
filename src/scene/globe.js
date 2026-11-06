import * as THREE from 'three';
import landGeoJson from '../assets/land.json';

export const GLOBE_RADIUS = 5;
const DEG = Math.PI / 180;

/** Project lat/lon onto the Three.js sphere, matching SphereGeometry UVs. */
export function latLonToVector3(lat, lon, radius = GLOBE_RADIUS, target = new THREE.Vector3()) {
  const phi = (lon + 180) * DEG;
  const theta = (90 - lat) * DEG;
  return target.set(
    -radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

/** Subsolar point (lat/lon) for a given simulated timestamp. */
export function subsolarPoint(simMs) {
  const d = new Date(simMs);
  const utcHours = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const startOfYear = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = (simMs - startOfYear) / 86_400_000;
  const declination = 23.44 * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365.24);
  const lon = (12 - utcHours) * 15;
  return { lat: declination, lon: ((lon + 540) % 360) - 180 };
}

// ---------------------------------------------------------------- earth skin

function makeEarthTexture(land) {
  const W = 2048;
  const H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Ocean gradient.
  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#04121f');
  ocean.addColorStop(0.35, '#061d31');
  ocean.addColorStop(0.5, '#08253b');
  ocean.addColorStop(0.65, '#061d31');
  ocean.addColorStop(1, '#04121f');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  // Land mask (equirectangular).
  const MW = 1024;
  const MH = 512;
  const mask = document.createElement('canvas');
  mask.width = MW;
  mask.height = MH;
  const mctx = mask.getContext('2d');
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, MW, MH);
  mctx.fillStyle = '#fff';

  const drawRing = (ring) => {
    mctx.beginPath();
    ring.forEach(([lon, lat], i) => {
      const x = ((lon + 180) / 360) * MW;
      const y = ((90 - lat) / 180) * MH;
      if (i === 0) mctx.moveTo(x, y);
      else mctx.lineTo(x, y);
    });
    mctx.closePath();
    mctx.fill();
  };

  for (const feature of land.features ?? []) {
    const g = feature.geometry;
    if (!g) continue;
    if (g.type === 'Polygon') {
      g.coordinates.forEach(drawRing);
    } else if (g.type === 'MultiPolygon') {
      g.coordinates.forEach((poly) => poly.forEach(drawRing));
    }
  }

  const maskData = mctx.getImageData(0, 0, MW, MH).data;

  // Draw a dotted land surface over the ocean gradient.
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  const hash = (x, y) => {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  };

  for (let y = 0; y < H; y += 4) {
    const my = Math.min(MH - 1, Math.floor((y / H) * MH));
    for (let x = 0; x < W; x += 4) {
      const mx = Math.min(MW - 1, Math.floor((x / W) * MW));
      if (maskData[(my * MW + mx) * 4] < 128) continue;
      const h = hash(x, y);
      // Dots are 2x2 texels with a one-texel gap → readable from orbit.
      const bright = h > 0.9 ? 1.35 : h > 0.55 ? 1.0 : 0.72;
      const r = Math.round(34 * bright);
      const g = Math.round(128 * bright);
      const b = Math.round(148 * bright);
      for (let oy = 0; oy < 2; oy++) {
        for (let ox = 0; ox < 2; ox++) {
          const px = x + ox;
          const py = y + oy;
          if (px >= W || py >= H) continue;
          const i = (py * W + px) * 4;
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  // Soft coastal glow.
  const tint = document.createElement('canvas');
  tint.width = MW;
  tint.height = MH;
  const tctx = tint.getContext('2d');
  tctx.fillStyle = '#000';
  tctx.fillRect(0, 0, MW, MH);
  tctx.drawImage(mask, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = '#2da4c4';
  tctx.fillRect(0, 0, MW, MH);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.28;
  ctx.filter = 'blur(7px)';
  ctx.drawImage(tint, 0, 0, W, H);
  ctx.restore();

  // Graticule.
  ctx.save();
  ctx.strokeStyle = 'rgba(78, 170, 205, 0.10)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// ------------------------------------------------------------------- objects

function makeSunGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,225,1)');
  g.addColorStop(0.22, 'rgba(255,236,170,0.9)');
  g.addColorStop(0.55, 'rgba(255,180,80,0.25)');
  g.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeStars() {
  const count = 1600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const r = 45 + Math.random() * 55;
    const theta = Math.acos(2 * Math.random() - 1);
    const phi = Math.random() * Math.PI * 2;
    positions[i * 3] = r * Math.sin(theta) * Math.cos(phi);
    positions[i * 3 + 1] = r * Math.cos(theta);
    positions[i * 3 + 2] = r * Math.sin(theta) * Math.sin(phi);
    color.setHSL(0.52 + Math.random() * 0.12, 0.35, 0.65 + Math.random() * 0.3);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.33,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  return new THREE.Points(geo, mat);
}

export function createGlobe(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const earthTexture = makeEarthTexture(landGeoJson);
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 128, 72),
    new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.92,
      metalness: 0.05,
      emissive: new THREE.Color(0x03101c),
      emissiveIntensity: 0.9,
    }),
  );
  group.add(earth);

  // Atmospheric rim glow.
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS * 1.055, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x2a9fd6) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        void main() {
          float i = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.4);
          gl_FragColor = vec4(uColor, 1.0) * clamp(i, 0.0, 1.0) * 0.85;
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    }),
  );
  group.add(atmosphere);

  const stars = makeStars();
  scene.add(stars);

  // Sun: a light + a visible disc with a soft glow sprite.
  const sunLight = new THREE.DirectionalLight(0xfff2da, 2.6);
  sunLight.position.set(30, 8, 10);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const ambient = new THREE.AmbientLight(0x1a3c55, 1.1);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x2a6f9e, 0x020509, 0.55);
  scene.add(hemi);

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff5d6 }),
  );
  scene.add(sunMesh);

  const sunGlow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: makeSunGlowTexture(),
      color: 0xffddaa,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  sunGlow.scale.setScalar(9);
  scene.add(sunGlow);

  const sunDirection = new THREE.Vector3();

  function update(simMs, dtReal) {
    const sub = subsolarPoint(simMs);
    latLonToVector3(sub.lat, sub.lon, 1, sunDirection);
    const sunPos = sunDirection.clone().multiplyScalar(32);
    sunLight.position.copy(sunPos);
    sunMesh.position.copy(sunDirection.clone().multiplyScalar(26));
    sunGlow.position.copy(sunMesh.position);
    stars.rotation.y += dtReal * 0.0035;
    stars.rotation.x += dtReal * 0.0008;
  }

  return {
    group,
    earth,
    atmosphere,
    sunLight,
    sunMesh,
    sunGlow,
    sunDirection,
    update,
  };
}
