// Particles, ground telegraphs, shock rings, sword trails, floating damage numbers, screen shake.
import * as THREE from 'three';
import { G } from './state.js';
import { rand } from './util.js';

const MAX = 2600;
let points, ppos, pcol, psize, pvel, plife, pmax, pgrav, pbase, head = 0;
let group, dnLayer;
const teles = [], rings = [], dns = [], dnPool = [];
const _c = new THREE.Color(), _v = new THREE.Vector3();
const circleGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const ringGeo = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
const thickRingGeo = new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2);

export const fx = {
  init(scene) {
    group = new THREE.Group(); scene.add(group); this.group = group;
    ppos = new Float32Array(MAX * 3); pcol = new Float32Array(MAX * 4); psize = new Float32Array(MAX);
    pvel = new Float32Array(MAX * 3); plife = new Float32Array(MAX); pmax = new Float32Array(MAX); pgrav = new Float32Array(MAX); pbase = new Float32Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(ppos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(pcol, 4));
    g.setAttribute('size', new THREE.BufferAttribute(psize, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float size; attribute vec4 pcolor; varying vec4 vC; uniform float uScale; void main(){ vC=pcolor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ float d=length(gl_PointCoord-0.5); float a=smoothstep(0.5,0.12,d); gl_FragColor=vec4(vC.rgb*vC.a*a,1.0); }',
    });
    points = new THREE.Points(g, m); points.frustumCulled = false; points.renderOrder = 5; scene.add(points);
    dnLayer = document.getElementById('dmg');
  },

  spawn(x, y, z, vx, vy, vz, color, size = 0.3, life = 0.5, grav = 0) {
    const i = head; head = (head + 1) % MAX;
    ppos[i * 3] = x; ppos[i * 3 + 1] = y; ppos[i * 3 + 2] = z;
    pvel[i * 3] = vx; pvel[i * 3 + 1] = vy; pvel[i * 3 + 2] = vz;
    _c.set(color); pcol[i * 4] = _c.r; pcol[i * 4 + 1] = _c.g; pcol[i * 4 + 2] = _c.b; pcol[i * 4 + 3] = 1;
    pbase[i] = size; psize[i] = size; plife[i] = life; pmax[i] = life; pgrav[i] = grav;
  },
  burst(pos, color, n = 10, o = {}) {
    const sp = o.speed ?? 5, life = o.life ?? 0.45, size = o.size ?? 0.35, up = o.up ?? 2, grav = o.grav ?? 9, y = pos.y + (o.y ?? 0), sr = o.spread ?? 0;
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), e = rand(-0.4, 1), s = sp * rand(0.3, 1);
      this.spawn(pos.x + rand(-sr, sr), y + rand(-sr, sr) * 0.5, pos.z + rand(-sr, sr), Math.cos(a) * s, e * s * 0.7 + up, Math.sin(a) * s, color, size * rand(0.6, 1.3), life * rand(0.6, 1.2), grav);
    }
  },
  // sparks fanning in a direction
  spray(pos, dx, dz, color, n = 8, sp = 9) {
    for (let i = 0; i < n; i++) this.spawn(pos.x, pos.y, pos.z, dx * sp * rand(0.3, 1) + rand(-3, 3), rand(0, 5), dz * sp * rand(0.3, 1) + rand(-3, 3), color, rand(0.15, 0.4), rand(0.2, 0.45), 12);
  },
  column(pos, color, h = 8, n = 30) {
    for (let i = 0; i < n; i++) this.spawn(pos.x + rand(-0.4, 0.4), pos.y + rand(h), pos.z + rand(-0.4, 0.4), rand(-1, 1), rand(1, 5), rand(-1, 1), color, rand(0.4, 0.9), rand(0.25, 0.6), 0);
  },
  bolt(a, b, color) {
    const n = Math.max(8, Math.floor(a.distanceTo(b) * 2.2));
    for (let i = 0; i <= n; i++) { const t = i / n, j = 0.35 * Math.sin(t * Math.PI); this.spawn(a.x + (b.x - a.x) * t + rand(-j, j), a.y + (b.y - a.y) * t + rand(-j, j), a.z + (b.z - a.z) * t + rand(-j, j), 0, 0, 0, color, rand(0.3, 0.6), rand(0.12, 0.3), 0); }
  },
  disc(pos, r, color, n = 24, y = 0.3) {
    for (let i = 0; i < n; i++) { const a = rand(Math.PI * 2), d = Math.sqrt(Math.random()) * r; this.spawn(pos.x + Math.cos(a) * d, pos.y + y, pos.z + Math.sin(a) * d, 0, rand(2, 7), 0, color, rand(0.3, 0.7), rand(0.3, 0.7), 2); }
  },

  telegraph(pos, r, time, color = 0xff3344) {
    const g = new THREE.Group();
    const m1 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false });
    const m2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.3, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, m1), fill = new THREE.Mesh(circleGeo, m2);
    ring.scale.setScalar(r); fill.scale.setScalar(0.01); g.add(ring, fill);
    g.position.set(pos.x, (G.area ? G.area.heightAt(pos.x, pos.z) : pos.y) + 0.12, pos.z); g.renderOrder = 3;
    group.add(g); teles.push({ g, fill, r, t: 0, time, m1, m2 });
    return g;
  },
  ring(pos, color, r0, r1, time = 0.4, thick = false) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(thick ? thickRingGeo : ringGeo, m); mesh.position.set(pos.x, pos.y + 0.15, pos.z); mesh.scale.setScalar(r0);
    group.add(mesh); rings.push({ mesh, m, r0, r1, t: 0, time });
  },

  dmgNum(pos, text, cls = '') {
    let d = dnPool.pop();
    if (!d) { if (dns.length > 40) return; d = { el: document.createElement('div') }; dnLayer.appendChild(d.el); }
    d.el.className = 'dn ' + cls; d.el.textContent = text; d.el.style.display = 'block';
    d.x = pos.x + rand(-0.3, 0.3); d.y = pos.y; d.z = pos.z + rand(-0.3, 0.3); d.t = 0; d.life = 0.8; dns.push(d);
  },
  shake(a) { G.cam.shake = Math.max(G.cam.shake, a); },
  project(x, y, z) {
    _v.set(x, y, z).project(G.camera);
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, vis: _v.z < 1 && _v.z > -1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 };
  },

  update(dt, rawDt) {
    // particles
    for (let i = 0; i < MAX; i++) {
      if (plife[i] <= 0) continue;
      plife[i] -= dt;
      if (plife[i] <= 0) { psize[i] = 0; pcol[i * 4 + 3] = 0; continue; }
      const k = plife[i] / pmax[i];
      pvel[i * 3 + 1] -= pgrav[i] * dt;
      ppos[i * 3] += pvel[i * 3] * dt; ppos[i * 3 + 1] += pvel[i * 3 + 1] * dt; ppos[i * 3 + 2] += pvel[i * 3 + 2] * dt;
      pcol[i * 4 + 3] = k; psize[i] = pbase[i] * (0.4 + 0.6 * k);
    }
    const g = points.geometry; g.attributes.position.needsUpdate = true; g.attributes.pcolor.needsUpdate = true; g.attributes.size.needsUpdate = true;
    points.material.uniforms.uScale.value = innerHeight * 0.55 * (G.renderer ? G.renderer.getPixelRatio() : 1) * (G.camera ? 0.5774 / Math.tan(G.camera.fov * Math.PI / 360) : 1);
    // telegraphs
    for (let i = teles.length - 1; i >= 0; i--) {
      const t = teles[i]; t.t += dt; const k = Math.min(1, t.t / t.time);
      t.fill.scale.setScalar(Math.max(0.01, t.r * k)); t.m1.opacity = 0.6 + 0.4 * Math.sin(t.t * 22);
      if (t.t >= t.time + 0.06) { group.remove(t.g); t.m1.dispose(); t.m2.dispose(); teles.splice(i, 1); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt; const k = Math.min(1, r.t / r.time), e = 1 - (1 - k) * (1 - k);
      r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e); r.m.opacity = 0.9 * (1 - k);
      if (k >= 1) { group.remove(r.mesh); r.m.dispose(); rings.splice(i, 1); }
    }
    // damage numbers (real time so they stay readable in slow motion)
    for (let i = dns.length - 1; i >= 0; i--) {
      const d = dns[i]; d.t += rawDt; const k = d.t / d.life;
      if (k >= 1) { d.el.style.display = 'none'; dnPool.push(d); dns.splice(i, 1); continue; }
      const p = this.project(d.x, d.y + k * 1.2, d.z);
      if (!p.vis) { d.el.style.opacity = 0; continue; }
      const s = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15) * 0.6);
      d.el.style.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      d.el.style.transform = `translate(${p.x.toFixed(0)}px,${p.y.toFixed(0)}px) translate(-50%,-50%) scale(${s.toFixed(2)})`;
    }
  },
  clear() {
    for (const t of teles) group.remove(t.g); teles.length = 0;
    for (const r of rings) group.remove(r.mesh); rings.length = 0;
  },
};

// A fading ribbon that follows the blade.
export class Trail {
  constructor(scene, n = 16) {
    this.n = n; this.pts = [];
    this.pos = new Float32Array(n * 6); this.col = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; scene.add(this.mesh);
  }
  push(a, b) { this.pts.unshift({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, t: 0 }); if (this.pts.length > this.n) this.pts.pop(); }
  update(dt, color) {
    const L = 0.2; _c.set(color);
    for (const p of this.pts) p.t += dt;
    while (this.pts.length && this.pts[this.pts.length - 1].t > L) this.pts.pop();
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], k = Math.pow(1 - p.t / L, 1.5), o = i * 6;
      this.pos[o] = p.ax; this.pos[o + 1] = p.ay; this.pos[o + 2] = p.az; this.pos[o + 3] = p.bx; this.pos[o + 4] = p.by; this.pos[o + 5] = p.bz;
      this.col[o] = _c.r * k * 0.25; this.col[o + 1] = _c.g * k * 0.25; this.col[o + 2] = _c.b * k * 0.25;
      this.col[o + 3] = _c.r * k; this.col[o + 4] = _c.g * k; this.col[o + 5] = _c.b * k;
    }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}
