// The felt look (a prototype): Vael as a stop-motion set made of felt. Turned on with ?look=felt in the
// address, or Menu, Status, Look (the page reloads to switch). It changes how things are drawn, not
// what they are:
//  - every lit surface gets felt fibres, soft rounded shading and a fuzzy sheen toward its edges
//  - soft shadows, and the picture is finished like a photographed miniature: tilt-shift blur above
//    and below the focus, warm grading, a vignette and film grain
//  - characters change pose twelve times a second, like puppets moved between photographs, while
//    the camera and controls stay smooth
// This module must be imported before anything makes a material: the switch to soft shading has to
// be in place before the first one is created.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const FELT = { on: false, tick: true, acc: 0, step: 1 / 12, frame: 0 };
const U = { feltMap: { value: null }, feltJit: { value: new THREE.Vector2() } };

function chosen() {
  const q = new URLSearchParams(location.search).get('look');
  if (q) return q === 'felt';
  try { return (JSON.parse(localStorage.getItem('hushfall_opts_v1')) || {}).look === 'felt'; } catch (e) { return false; }
}

// ---------------------------------------------------------------- the felt itself
// a tiling texture of short, crossing fibres around mid-grey, drawn once at startup
function feltTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // soft clumps first, then thousands of fibres over them
  for (let i = 0; i < 90; i++) {
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 60, v = Math.floor(100 + rnd() * 56);
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.35)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 11000; i++) {
    const x = rnd() * S, y = rnd() * S, a = rnd() * Math.PI * 2, l = 5 + rnd() * 16, b = (rnd() - 0.5) * 1.2, v = Math.floor(50 + rnd() * 160);
    g.strokeStyle = `rgba(${v},${v},${v},${0.22 + rnd() * 0.3})`; g.lineWidth = 0.6 + rnd() * 1.1;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const sx = x + ox, sy = y + oy; if (sx < -l || sy < -l || sx > S + l || sy > S + l) continue;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + Math.cos(a + b) * l * 0.5, sy + Math.sin(a + b) * l * 0.5, sx + Math.cos(a) * l, sy + Math.sin(a) * l); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.NoColorSpace;
  return t;
}

// added to every lit (Lambert) material: fibres laid on from three sides (so slopes and walls get them
// too), a large soft mottling, and a sheen that brightens surfaces as they turn away, as felt does
export function feltShader(sh) {
  sh.uniforms.feltMap = U.feltMap; sh.uniforms.feltJit = U.feltJit;
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFeltPos;')
    .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 fp = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  fp = instanceMatrix * fp;
#endif
#ifdef USE_BATCHING
  fp = batchingMatrix * fp;
#endif
  vFeltPos = ( modelMatrix * fp ).xyz;
}`);
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFeltPos; uniform sampler2D feltMap; uniform vec2 feltJit;
float feltAt( vec3 p, vec3 w, float s, vec2 j ) {
  return texture2D( feltMap, p.zy * s + j ).r * w.x + texture2D( feltMap, p.xz * s + j.yx ).r * w.y + texture2D( feltMap, p.xy * s - j ).r * w.z;
}`)
    .replace('#include <color_fragment>', `#include <color_fragment>
vec3 feltN = normalize( cross( dFdx( vFeltPos ), dFdy( vFeltPos ) ) ); vec3 feltW = pow( abs( feltN ), vec3( 4.0 ) ); feltW /= feltW.x + feltW.y + feltW.z;
float feltFib = feltAt( vFeltPos, feltW, 0.21, feltJit );                 // tufts and fibres, a tile every five units
float feltMot = feltAt( vFeltPos * 0.045 + 3.7, feltW, 1.0, vec2( 0.0 ) );  // broad patches, a tile every twenty
diffuseColor.rgb *= ( 0.58 + 0.84 * feltFib ) * ( 0.8 + 0.4 * feltMot );`)
    .replace('#include <opaque_fragment>', `{
  float feltRim = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
  outgoingLight += diffuseColor.rgb * ( 0.09 + 0.6 * pow( feltRim, 2.6 ) ) * ( 0.55 + 0.45 * feltFib );
}
#include <opaque_fragment>`);
}

// soft, rounded shading: the same shape with its corners shared, so light rolls over it like stuffed felt
export function soften(geo) {
  if (!FELT.on || !geo.attributes.position) return geo;
  const g = geo.clone(); g.deleteAttribute('normal'); const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m;
}

if (chosen()) {
  FELT.on = true;
  // no faceted shading anywhere (three reads flatShading from each material; this answers false for all)
  Object.defineProperty(THREE.Material.prototype, 'flatShading', { get() { return false; }, set() {}, configurable: true });
  U.feltMap.value = feltTexture();
  THREE.Material.prototype.onBeforeCompile = function (sh) { if (this.isMeshLambertMaterial) feltShader(sh); };
}

// ---------------------------------------------------------------- the clock: twelve frames a second
export function feltFrame(raw) {
  FELT.acc += raw; FELT.tick = false;
  if (FELT.acc >= FELT.step) {
    FELT.acc %= FELT.step; FELT.tick = true; FELT.frame++;
    U.feltJit.value.set((Math.random() - 0.5) * 0.004, (Math.random() - 0.5) * 0.004);   // the fibres shift a hair, as if handled
  }
}

// ---------------------------------------------------------------- the photograph: blur, grade, grain
const QUAD_V = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';
const BLUR = `
uniform sampler2D src; uniform vec2 res; uniform vec2 dir; uniform float focusY, band, amount;
varying vec2 vUv;
vec3 tilt( vec2 uv ) {
  float r = amount * smoothstep( band, band + 0.32, abs( uv.y - focusY ) );          // in fractions of the screen height
  vec2 st = dir * vec2( res.y / res.x, 1.0 ) * r / 4.0;
  vec3 c = texture2D( src, uv ).rgb * 0.2;
  c += ( texture2D( src, uv + st ).rgb + texture2D( src, uv - st ).rgb ) * 0.17;
  c += ( texture2D( src, uv + st * 2.0 ).rgb + texture2D( src, uv - st * 2.0 ).rgb ) * 0.13;
  c += ( texture2D( src, uv + st * 3.0 ).rgb + texture2D( src, uv - st * 3.0 ).rgb ) * 0.07;
  c += ( texture2D( src, uv + st * 4.0 ).rgb + texture2D( src, uv - st * 4.0 ).rgb ) * 0.03;
  return c;
}`;
let rtA = null, rtB = null, quad = null, qScene = null, qCam = null, blurMat = null, finMat = null;
const size = new THREE.Vector2();

function setupPost() {
  const uni = () => ({ src: { value: null }, res: { value: new THREE.Vector2(1, 1) }, dir: { value: new THREE.Vector2(1, 0) }, focusY: { value: 0.45 }, band: { value: 0.1 }, amount: { value: 0.011 } });
  blurMat = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: QUAD_V, fragmentShader: BLUR + 'void main() { gl_FragColor = vec4( tilt( vUv ), 1.0 ); }', depthTest: false, depthWrite: false });
  finMat = new THREE.ShaderMaterial({
    uniforms: { ...uni(), dir: { value: new THREE.Vector2(0, 1) }, frame: { value: 0 } }, vertexShader: QUAD_V, depthTest: false, depthWrite: false,
    fragmentShader: BLUR + `
uniform float frame;
float hash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
void main() {
  vec3 c = tilt( vUv );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 1.12 );                        // a little richer colour
  c *= vec3( 1.05, 1.0, 0.91 );                         // warm studio light
  c = c * 0.95 + 0.008;                                 // softly lifted shadows
  vec2 q = ( vUv - 0.5 ) * vec2( res.x / res.y, 1.0 );
  c *= 1.0 - 0.42 * pow( clamp( length( q ) * 0.95, 0.0, 1.0 ), 2.4 );   // vignette
  gl_FragColor = vec4( c, 1.0 );
  #include <colorspace_fragment>
  gl_FragColor.rgb += ( hash( floor( vUv * res ) + frame * 17.0 ) - 0.5 ) * 0.04;   // film grain, new each photograph
}`,
  });
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat); quad.frustumCulled = false;
  qScene = new THREE.Scene(); qScene.add(quad); qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

export function feltRender(renderer, scene, camera) {
  if (!quad) setupPost();
  renderer.getDrawingBufferSize(size);
  if (!rtA || rtA.width !== size.x || rtA.height !== size.y) {
    if (rtA) { rtA.dispose(); rtB.dispose(); }
    rtA = new THREE.WebGLRenderTarget(size.x, size.y, { samples: 4, type: THREE.HalfFloatType });
    rtB = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  }
  renderer.setRenderTarget(rtA); renderer.render(scene, camera);
  for (const m of [blurMat, finMat]) m.uniforms.res.value.copy(size);
  blurMat.uniforms.src.value = rtA.texture; quad.material = blurMat; renderer.setRenderTarget(rtB); renderer.render(qScene, qCam);
  finMat.uniforms.src.value = rtB.texture; finMat.uniforms.frame.value = FELT.frame; quad.material = finMat; renderer.setRenderTarget(null); renderer.render(qScene, qCam);
}

// a clump of wool balls (tree canopies, bushes): a sphere pushed out into a dozen rounded lumps
export function woolBall(seed = 3) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lumps = []; for (let i = 0; i < 13; i++) { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); lumps.push([Math.cos(a) * r, z, Math.sin(a) * r, 0.55 + rnd() * 0.45]); }
  const g = mergeVertices(new THREE.IcosahedronGeometry(0.5, 4).deleteAttribute('normal').deleteAttribute('uv'), 1e-4), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize(); let bump = 0;
    for (const [x, y, z, k] of lumps) { const d = v.x * x + v.y * y + v.z * z; if (d > 0.55) bump = Math.max(bump, k * Math.sin((d - 0.55) / 0.45 * Math.PI / 2)); }
    v.multiplyScalar(0.5 * (0.8 + 0.24 * bump)); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); g.translate(0, 0.5, 0); return g;
}

// wool for a leafy colour: deep and olive greens with now and then a mustard ball, as in felted trees
const WOOL = [0x3d7a35, 0x2f6237, 0x6d8c3c, 0x8fa646, 0x4f8a3f, 0xc9a23a, 0xb38a2e];
export function woolTint(hex, r) {
  const c = new THREE.Color(hex); if (!(c.g > c.r * 1.15 && c.g > c.b * 1.15)) return hex;   // only greens
  const n = WOOL.length; return WOOL[((Math.floor(r * n) % n) + n) % n];
}
