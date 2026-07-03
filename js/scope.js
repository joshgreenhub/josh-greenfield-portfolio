/* ============================================================
   SCOPE DRIFT — generative vectorscope field for the hero.
   Philosophy: notes/scope-drift-philosophy.md
   Two opposing lobes (the orange/teal grade split as it appears
   on a real vectorscope), seeded, scroll-reactive, phosphor decay.
   ============================================================ */

(function () {
  "use strict";

  const canvas = document.getElementById("scope");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- seeded PRNG + value noise ---------- */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 1D value noise with smooth interpolation, per-particle offsets keep it cheap
  function makeNoise(rand) {
    const grad = new Float32Array(512);
    for (let i = 0; i < 512; i++) grad[i] = rand() * 2 - 1;
    return function (x) {
      const xi = Math.floor(x);
      const xf = x - xi;
      const a = grad[xi & 511], b = grad[(xi + 1) & 511];
      const u = xf * xf * (3 - 2 * xf);
      return a + u * (b - a);
    };
  }

  /* ---------- parameters (inspector-tunable) ---------- */
  const params = {
    seed: 1024,
    density: 180,   // particle count
    drift: 1.0,     // angular/radial drift rate
    streak: 1.0,    // scroll-velocity gain
    spread: 0.45    // lobe angular spread (radians-ish)
  };

  const ORANGE = [255, 106, 43];
  const TEAL = [41, 196, 201];
  const WHITE = [244, 242, 236];

  let particles = [];
  let noise;
  let t = 0;
  let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, R = 0;

  // orange lobe sits where warm skin/highlight vectors live on a scope (~upper-left),
  // teal exactly opposite — the two-lobe signature of an orange/teal grade.
  const LOBE_WARM = -2.35; // radians
  const LOBE_COOL = LOBE_WARM + Math.PI;

  function gauss(rand) {
    // Box-Muller, one value
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function rebuild() {
    const rand = mulberry32(params.seed);
    noise = makeNoise(rand);
    particles = [];
    for (let i = 0; i < params.density; i++) {
      const warm = rand() < 0.5;
      const spark = rand() < 0.02;
      particles.push({
        lobe: warm ? LOBE_WARM : LOBE_COOL,
        color: spark ? WHITE : (warm ? ORANGE : TEAL),
        spark,
        aOff: gauss(rand) * params.spread,          // angular scatter in the lobe
        nx: rand() * 400,                            // noise offsets
        ny: rand() * 400,
        speed: 0.1 + rand() * 0.35,
        rBase: 0.28 + rand() * 0.62,                 // radial home, fraction of R
        px: 0, py: 0, hasPrev: false
      });
    }
    // hard clear so a new seed starts clean (canvas stays transparent —
    // the hero's grade-wheel gradients live behind it)
    ctx.clearRect(0, 0, W, H);
    drawGraticule(1);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width * DPR);
    H = Math.round(rect.height * DPR);
    canvas.width = W;
    canvas.height = H;
    CX = W * (W > H * 1.1 ? 0.62 : 0.5); // sit right of the headline on wide screens
    CY = H * 0.5;
    R = Math.min(W, H) * 0.36;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) p.hasPrev = false;
    drawGraticule(1);
  }

  /* ---------- graticule: rings, crosshair, six vector targets ---------- */
  function drawGraticule(alphaScale) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(42, 46, 51, ${0.5 * alphaScale})`;
    ctx.lineWidth = 1 * DPR;

    for (const f of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(CX, CY, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(CX - R * 1.08, CY); ctx.lineTo(CX + R * 1.08, CY);
    ctx.moveTo(CX, CY - R * 1.08); ctx.lineTo(CX, CY + R * 1.08);
    ctx.stroke();

    // six color-vector target boxes (R, Mg, B, Cy, G, Yl)
    const targets = [103, 61, 347, 283, 241, 167];
    const box = 7 * DPR;
    for (const deg of targets) {
      const a = (deg * Math.PI) / 180;
      const x = CX + Math.cos(a) * R * 0.85;
      const y = CY - Math.sin(a) * R * 0.85;
      ctx.strokeRect(x - box / 2, y - box / 2, box, box);
    }

    // skin-tone line
    ctx.strokeStyle = `rgba(42, 46, 51, ${0.35 * alphaScale})`;
    ctx.beginPath();
    ctx.moveTo(CX, CY);
    const skin = (123 * Math.PI) / 180;
    ctx.lineTo(CX + Math.cos(skin) * R * 0.95, CY - Math.sin(skin) * R * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------- scroll velocity → streak ---------- */
  let lastScrollY = window.scrollY;
  let scrollVel = 0;
  let lastInput = performance.now();
  window.addEventListener("scroll", () => { lastInput = performance.now(); }, { passive: true });
  window.addEventListener("pointermove", () => { lastInput = performance.now(); }, { passive: true });

  /* ---------- frame ---------- */
  function step(streakBoost) {
    t += 0.004 * params.drift;

    // phosphor decay — erode toward transparent so the graded hero shows through
    ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = "rgba(0, 0, 0, 0.16)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
    drawGraticule(0.16);

    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";

    for (const p of particles) {
      const wob = noise(p.nx + t * p.speed * 60) * 0.35;
      const ang = p.lobe + p.aOff + wob * (0.3 + streakBoost * 0.25);
      const rad = R * (p.rBase + noise(p.ny + t * p.speed * 45) * 0.2);
      const x = CX + Math.cos(ang) * rad;
      const y = CY - Math.sin(ang) * rad;

      if (p.hasPrev) {
        const dx = x - p.px, dy = y - p.py;
        const stretch = 1 + streakBoost * 2.2 * params.streak;
        const alpha = p.spark
          ? 0.6 + streakBoost * 0.2
          : 0.3 + streakBoost * 0.15;
        ctx.strokeStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, ${Math.min(alpha, 0.9)})`;
        ctx.lineWidth = (p.spark ? 1.7 : 1.2) * DPR;
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.px + dx * stretch, p.py + dy * stretch);
        ctx.stroke();
      }
      p.px = x; p.py = y; p.hasPrev = true;
    }
    ctx.globalCompositeOperation = "source-over";
  }

  let rafId = null;
  let lastFrame = 0;
  function loop(now) {
    rafId = requestAnimationFrame(loop);

    // idle → 30fps; active input → 60fps
    const active = now - lastInput < 400;
    const minInterval = active ? 0 : 33;
    if (now - lastFrame < minInterval) return;
    lastFrame = now;

    const sy = window.scrollY;
    const rawVel = Math.abs(sy - lastScrollY);
    lastScrollY = sy;
    scrollVel += (Math.min(rawVel / 40, 3) - scrollVel) * 0.12; // smoothed

    // stop rendering entirely once hero is well off-screen
    const heroBottom = canvas.parentElement.offsetHeight;
    if (sy > heroBottom * 1.2) return;

    step(scrollVel * params.streak);
  }

  function renderStatic() {
    // reduced motion: compose one settled frame — accumulate trails without animating
    ctx.clearRect(0, 0, W, H);
    drawGraticule(1);
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 240; i++) {
      t += 0.004;
      for (const p of particles) {
        const wob = noise(p.nx + t * p.speed * 60) * 0.25;
        const ang = p.lobe + p.aOff + wob * 0.3;
        const rad = R * (p.rBase + noise(p.ny + t * p.speed * 45) * 0.15);
        const x = CX + Math.cos(ang) * rad;
        const y = CY - Math.sin(ang) * rad;
        if (p.hasPrev) {
          ctx.strokeStyle = `rgba(${p.color[0]}, ${p.color[1]}, ${p.color[2]}, 0.02)`;
          ctx.lineWidth = 1.1 * DPR;
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        p.px = x; p.py = y; p.hasPrev = true;
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- public API for the inspector ---------- */
  window.SCOPE = {
    params,
    setSeed(s) { params.seed = ((s % 100000) + 100000) % 100000; rebuild(); if (reducedMotion) renderStatic(); return params.seed; },
    setParam(key, val) {
      params[key] = val;
      if (key === "density" || key === "spread") rebuild();
      if (reducedMotion) renderStatic();
    }
  };

  /* ---------- boot ---------- */
  resize();
  rebuild();
  window.addEventListener("resize", () => { resize(); if (reducedMotion) renderStatic(); });

  if (reducedMotion) {
    renderStatic();
  } else {
    rafId = requestAnimationFrame(loop);
  }
})();
