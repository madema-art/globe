// The instrument bezel: an engraved brass ring that follows the globe's on-screen silhouette.
// Its north mark points to geographic north, so it doubles as a roll indicator when the player twists
// the planet. Close to the surface (globe larger than the screen) it hands over to a small compass
// around the centre reticle. Drawn once; per frame only transforms change (no DOM churn).

const NS = 'http://www.w3.org/2000/svg';
const TAU = Math.PI * 2;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

/** Ticks on a unit circle: every 5 degrees, longer every 30, with a north index. */
function engrave(group, { inner, outer, major, labels }) {
  let d = '';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU;
    const r0 = i % 6 === 0 ? major : inner;
    const s = Math.sin(a), c = -Math.cos(a);
    d += `M${(s * r0).toFixed(4)} ${(c * r0).toFixed(4)}L${(s * outer).toFixed(4)} ${(c * outer).toFixed(4)}`;
  }
  el('path', { d, class: 'bezel-ticks', 'vector-effect': 'non-scaling-stroke' }, group);
  if (labels) el('path', { d: `M0 ${-outer - 0.012}L-0.022 ${-outer - 0.06}L0.022 ${-outer - 0.06}Z`, class: 'bezel-north' }, group);
}

export function createBezel(svg, { reduceMotion = () => false } = {}) {
  el('style', {}, svg).textContent = `
    .bezel-ring { fill: none; stroke: rgba(201,163,91,0.55); stroke-width: 1; }
    .bezel-ring.inner { stroke: rgba(201,163,91,0.22); }
    .bezel-ticks { stroke: rgba(201,163,91,0.5); stroke-width: 1; fill: none; }
    .bezel-north { fill: #e2c17f; }
    .bezel-n { fill: #e2c17f; font: italic 500 15px 'Bodoni Moda', Georgia, serif; text-anchor: middle; dominant-baseline: middle; }
    .bezel-ring.drawing { transition: stroke-dashoffset 2.4s cubic-bezier(.22,.61,.21,1); }
  `;
  // Large bezel around the globe.
  const big = el('g', { opacity: 0 }, svg);
  // The outer ring is drawn in screen pixels (not scaled) so its one-time draw-in can use pixel dashes.
  const ring = el('circle', { r: 1, class: 'bezel-ring' }, big);
  const bigScale = el('g', {}, big);
  el('circle', { r: 0.955, class: 'bezel-ring inner', 'vector-effect': 'non-scaling-stroke' }, bigScale);
  const bigTicks = el('g', {}, bigScale);
  engrave(bigTicks, { inner: 0.975, outer: 1, major: 0.955, labels: true });

  // Small compass around the reticle for close views.
  const small = el('g', { opacity: 0 }, svg);
  const smallScale = el('g', {}, small);
  el('circle', { r: 1, class: 'bezel-ring', 'vector-effect': 'non-scaling-stroke' }, smallScale);
  const smallTicks = el('g', {}, smallScale);
  engrave(smallTicks, { inner: 0.9, outer: 1, major: 0.8, labels: true });
  const smallN = el('text', { class: 'bezel-n' }, small);
  smallN.textContent = 'N';

  let drawn = false;
  let visible = 0;   // overall bezel visibility (screen-dependent), eased
  let target = 0;
  let last = '';

  return {
    /** Show or hide the bezel (eased). */
    setVisible(on) { target = on ? 1 : 0; },
    /**
     * @param {{cx:number, cy:number, r:number, north:number}|null} p globe projection in CSS px; north = screen angle (rad, clockwise from up)
     * @param {number} dt seconds
     */
    update(p, dt) {
      visible += (target - visible) * (reduceMotion() ? 1 : 1 - Math.exp(-dt * 5));
      if (!p) { big.setAttribute('opacity', 0); small.setAttribute('opacity', 0); return; }
      const w = innerWidth, h = innerHeight;
      const R = p.r * 1.075;
      if (!drawn && target > 0) {
        // One orchestrated moment: the ring engraves itself once when the Earth first appears.
        const c = 2 * Math.PI * R;
        ring.style.strokeDasharray = `${c} ${c}`;
        ring.style.strokeDashoffset = reduceMotion() ? '0' : `${c}`;
        ring.getBoundingClientRect();
        ring.classList.add('drawing');
        ring.style.strokeDashoffset = '0';
        ring.addEventListener('transitionend', () => { ring.style.strokeDasharray = ''; ring.classList.remove('drawing'); }, { once: true });
        drawn = true;
      }
      // Hand over smoothly between the large ring and the small compass as the globe outgrows the screen.
      // The compass only appears while the player is aiming at the centre reticle.
      const handover = Math.min(1, Math.max(0, (R - Math.min(h, w) * 0.42) / (Math.min(h, w) * 0.1)));
      const compass = p.aiming ? handover : 0;
      const deg = (p.north * 180) / Math.PI;
      const key = `${p.cx.toFixed(1)}|${p.cy.toFixed(1)}|${R.toFixed(1)}|${deg.toFixed(2)}|${visible.toFixed(3)}|${handover.toFixed(3)}|${compass}`;
      if (key === last) return;
      last = key;
      big.setAttribute('opacity', (visible * (1 - handover)).toFixed(3));
      big.setAttribute('transform', `translate(${p.cx.toFixed(2)} ${p.cy.toFixed(2)})`);
      ring.setAttribute('r', R.toFixed(2));
      bigScale.setAttribute('transform', `scale(${R.toFixed(2)})`);
      bigTicks.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
      const na = p.north;
      const sr = 46;
      small.setAttribute('opacity', (visible * compass).toFixed(3));
      small.setAttribute('transform', `translate(${(w / 2).toFixed(1)} ${(h / 2).toFixed(1)})`);
      smallScale.setAttribute('transform', `scale(${sr})`);
      smallTicks.setAttribute('transform', `rotate(${deg.toFixed(2)})`);
      smallN.setAttribute('x', (Math.sin(na) * (sr + 14)).toFixed(1));
      smallN.setAttribute('y', (-Math.cos(na) * (sr + 14)).toFixed(1));
    },
  };
}
