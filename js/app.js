/* ============================================================
   PORTFOLIO_v3 — transport, reel backdrop, media pool viewer,
   color page, export form
   ============================================================ */
(function () {
  "use strict";

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FPS = 24;
  const TOTAL_FRAMES = 60 * FPS; // the page runs 00:01:00:00

  function fmtTC(frames) {
    frames = Math.max(0, Math.round(frames));
    const f = frames % FPS;
    const s = Math.floor(frames / FPS) % 60;
    const m = Math.floor(frames / (FPS * 60)) % 60;
    const h = Math.floor(frames / (FPS * 3600));
    const p = (n) => String(n).padStart(2, "0");
    return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
  }

  // seconds → "mm:ss" / "h:mm:ss"
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const p = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
  }

  const maxScroll = () =>
    Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const progress = () => Math.min(1, Math.max(0, window.scrollY / maxScroll()));

  function makeEmbed(ytid, title, autoplay = true) {
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?rel=0${autoplay ? "&autoplay=1" : ""}`;
    iframe.title = title;
    iframe.allow = "autoplay; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    return iframe;
  }

  /* ========================================================
     RENDER INTRO
     ======================================================== */
  const intro = document.getElementById("renderIntro");
  const fill = document.getElementById("renderFill");
  document.body.classList.add("introing");

  function endIntro() {
    if (!intro.classList.contains("done")) {
      intro.classList.add("done");
      document.body.classList.remove("introing");
    }
  }
  if (reducedMotion) {
    endIntro();
  } else {
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / 1100);
      fill.style.width = (p * 100).toFixed(1) + "%";
      if (p < 1 && !intro.classList.contains("done")) requestAnimationFrame(tick);
      else endIntro();
    })(t0);
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, endIntro, { once: true, passive: true })
    );
    // rAF is throttled in background tabs — never let the overlay outstay its welcome
    setTimeout(endIntro, 1600);
  }

  /* ========================================================
     TRANSPORT BAR — scroll ↔ timecode, playhead, markers
     ======================================================== */
  const track = document.getElementById("track");
  const playhead = document.getElementById("playhead");
  const timecode = document.getElementById("timecode");
  const hairline = document.getElementById("hairline");
  const markers = Array.from(document.querySelectorAll(".marker"));
  const sections = markers.map((m) => document.getElementById(m.dataset.target));
  const transportH = () =>
    document.getElementById("transport").offsetHeight;

  function sectionScrollPos(sec) {
    // the hero's scrub runway ends at its own height minus one viewport
    if (sec.id === "reel") return 0;
    return Math.min(maxScroll(), Math.max(0, sec.offsetTop - transportH() * 0.5));
  }

  function layoutMarkers() {
    markers.forEach((m, i) => {
      const p = sectionScrollPos(sections[i]) / maxScroll();
      m.style.left = (4 + p * 92) + "%"; // keep inside track with margins
      m.dataset.p = p;
    });
  }

  function trackXForProgress(p) {
    return track.clientWidth * (0.04 + p * 0.92);
  }
  function progressForTrackX(x) {
    return Math.min(1, Math.max(0, (x / track.clientWidth - 0.04) / 0.92));
  }

  let scrollRaf = null;
  function syncTransport() {
    scrollRaf = null;
    const p = progress();
    playhead.style.left = trackXForProgress(p) + "px";
    playhead.setAttribute("aria-valuenow", Math.round(p * 100));
    timecode.textContent = fmtTC(p * TOTAL_FRAMES);
    if (hairline) {
      const r = track.getBoundingClientRect();
      hairline.style.left = (r.left + trackXForProgress(p)) + "px";
    }
    // active marker = current section
    let active = 0;
    sections.forEach((sec, i) => {
      if (window.scrollY >= sec.offsetTop - window.innerHeight * 0.45) active = i;
    });
    markers.forEach((m, i) => m.classList.toggle("active", i === active));
  }
  window.addEventListener("scroll", () => {
    if (!scrollRaf) scrollRaf = requestAnimationFrame(syncTransport);
  }, { passive: true });

  markers.forEach((m, i) => {
    m.addEventListener("click", () => {
      window.scrollTo({ top: sectionScrollPos(sections[i]), behavior: reducedMotion ? "auto" : "smooth" });
    });
  });

  // playhead drag = scrub the page
  let scrubbing = false;
  playhead.addEventListener("pointerdown", (e) => {
    scrubbing = true;
    playhead.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  playhead.addEventListener("pointermove", (e) => {
    if (!scrubbing) return;
    const r = track.getBoundingClientRect();
    const p = progressForTrackX(e.clientX - r.left);
    window.scrollTo({ top: p * maxScroll(), behavior: "auto" });
  });
  playhead.addEventListener("pointerup", () => {
    scrubbing = false;
    // magnetic snap: land near a marker → ease onto it
    const p = progress();
    for (const m of markers) {
      const mp = parseFloat(m.dataset.p);
      if (Math.abs(p - mp) < 0.035) {
        window.scrollTo({ top: mp * maxScroll(), behavior: reducedMotion ? "auto" : "smooth" });
        break;
      }
    }
  });
  playhead.addEventListener("keydown", (e) => {
    const nudge = maxScroll() / 60; // one page-second
    if (e.key === "ArrowRight") { window.scrollBy({ top: nudge }); e.preventDefault(); }
    if (e.key === "ArrowLeft") { window.scrollBy({ top: -nudge }); e.preventDefault(); }
  });

  /* ========================================================
     J / K / L transport keys
     ======================================================== */
  let shuttle = 0; // px per frame; sign = direction
  const SPEED_1 = 7, SPEED_2 = 16;
  function shuttleLoop() {
    if (shuttle !== 0) {
      window.scrollBy(0, shuttle);
      const y = window.scrollY;
      if (y <= 0 || y >= maxScroll()) shuttle = 0;
    }
    requestAnimationFrame(shuttleLoop);
  }
  if (!reducedMotion) requestAnimationFrame(shuttleLoop);

  window.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (viewerOpen) return; // don't shuttle the page under the viewer
    const k = e.key.toLowerCase();
    if (k === "l") shuttle = shuttle === SPEED_1 ? SPEED_2 : SPEED_1;
    else if (k === "j") shuttle = shuttle === -SPEED_1 ? -SPEED_2 : -SPEED_1;
    else if (k === "k") shuttle = 0;
    else if (k === " " && tag !== "button" && tag !== "a") {
      shuttle = shuttle === 0 ? SPEED_1 : 0;
      e.preventDefault();
    }
  });

  const jklHint = document.getElementById("jklHint");
  const jklDismiss = document.getElementById("jklDismiss");
  if (localStorage.getItem("jklDismissed")) jklHint.classList.add("hidden");
  jklDismiss.addEventListener("click", () => {
    jklHint.classList.add("hidden");
    localStorage.setItem("jklDismissed", "1");
  });

  /* ========================================================
     HERO — full-bleed reel backdrop, short scrub reveal
     ======================================================== */
  const REEL_ID = "Hr9ESMunQaw";
  const fxStage = document.getElementById("fxStage");
  const heroInner = document.getElementById("heroInner");
  const heroScrim = document.getElementById("heroScrim");
  let player = null;
  let playerReady = false;

  if (!reducedMotion) {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = function () {
      player = new YT.Player("reelVideo", {
        videoId: REEL_ID,
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 1, mute: 1, controls: 0, rel: 0,
          loop: 1, playlist: REEL_ID, // playlist = own id → seamless loop
          playsinline: 1, modestbranding: 1, iv_load_policy: 3,
          disablekb: 1, fs: 0
        },
        events: {
          onReady: (e) => {
            playerReady = true;
            e.target.mute();
            e.target.playVideo();
            sizeStageVideo();
          }
        }
      });
    };
  }

  // size the iframe to cover the stage like object-fit: cover (16:9 overscan)
  function sizeStageVideo() {
    const iframe = fxStage.querySelector("iframe");
    if (!iframe) return;
    const w = fxStage.clientWidth, h = fxStage.clientHeight;
    iframe.style.width = Math.ceil(Math.max(w, h * (16 / 9))) + "px";
    iframe.style.height = Math.ceil(Math.max(h, w * (9 / 16))) + "px";
    iframe.style.position = "absolute";
    iframe.style.top = "50%";
    iframe.style.left = "50%";
    iframe.style.transform = "translate(-50%, -50%)";
  }
  window.addEventListener("resize", sizeStageVideo);

  // short reveal: text clears within ~130px of scroll, hero holds, then releases
  const REVEAL_PX = 130;
  function syncReveal() {
    const p = Math.min(1, Math.max(0, window.scrollY / REVEAL_PX));
    heroInner.style.opacity = String(1 - p);
    heroInner.style.transform = `translateY(${p * -34}px)`;
    heroInner.classList.toggle("cleared", p > 0.9);
    heroScrim.style.opacity = String(1 - p);
  }
  if (!reducedMotion) {
    window.addEventListener("scroll", syncReveal, { passive: true });
    syncReveal();
  }

  /* --- sound --- */
  const muteBtn = document.getElementById("muteBtn");
  muteBtn.addEventListener("click", () => {
    if (!playerReady) return;
    const muted = player.isMuted();
    if (muted) { player.unMute(); player.setVolume(100); }
    else player.mute();
    muteBtn.textContent = muted ? "🔊 MUTE" : "🔇 UNMUTE";
    muteBtn.setAttribute("aria-pressed", String(muted));
  });

  /* ========================================================
     MEDIA POOL — clip cards open the viewer
     ======================================================== */
  const GENRES = {
    COMMERCIAL: { color: "var(--teal)" },
    NARRATIVE: { color: "var(--orange)" },
    DOC: { color: "var(--text)" }
  };

  const PROJECTS = [
    { title: "Leadership Field Guide — Leap Virtuosi", ytid: "Hx4hQOsa9nM",
      genre: "COMMERCIAL", client: "Glacial Etch Media", durS: 197,
      log: "Enterprise leadership, unscripted — a conference sizzle cut from on-site interviews with voices like Indra Nooyi.",
      role: "Editor",
      outcome: "Studio-grade interview setup captured testimonials live at the event; cut into a broadcast-ready sizzle." },
    { title: "Founder's Story: Monterey Pelvic Health", ytid: "X7yDyEzOHCM",
      genre: "COMMERCIAL", client: "Glacial Etch Media", durS: 204,
      log: "Dr. Kyle Hartman's journey from teen athlete to a clinic that treats the whole person.",
      role: "Editor",
      outcome: "A founder profile that leads with warmth — built to convert website visitors into first appointments." },
    { title: "Set Free Monterey Bay — Pitch Clip", ytid: "gfetbZb3Ilw",
      genre: "COMMERCIAL", client: "Glacial Etch Media", durS: 93,
      log: "93 seconds for a survivor-led nonprofit — every frame built to move donors.",
      role: "Editor",
      outcome: "A pitch film balancing gravity and hope for a restorative residential program." },
    { title: "Son-Mat", ytid: "YpV4xC4Ev2k",
      genre: "NARRATIVE", client: "Independent", durS: 525,
      log: "A short film about the taste that only a mother's hands can make.",
      role: "Editor",
      outcome: "An independent narrative short — cut for the quiet beats between the lines." },
    { title: "Vicarious", ytid: "rLrl3Lh3GP8",
      genre: "NARRATIVE", client: "Independent", durS: 463,
      log: "A short film about living through someone else's frame.",
      role: "Editor",
      outcome: "An independent narrative short — tension carried in the cut, not the dialogue." },
    { title: "Operation Deep Freeze: A Retrospective", ytid: "YEAvHxdcYV0",
      genre: "DOC", client: "Independent", durS: 5770,
      log: "Through the lens of ensign David Baker: Antarctica, and one of the most ambitious missions ever staged on its ice.",
      role: "Editor, researcher",
      outcome: "A feature-length archival retrospective — 90+ minutes of story assembled from historical footage." },
  ];

  // SHORT-FORM bin — vertical 9:16 clips (durations aren't public for Shorts)
  const SHORTS = [
    { title: "Rice Gai", ytid: "RGxEAopLYZo",
      genre: "SOCIAL", client: "", vert: true,
      log: "Plate-up to post: a signature dish gets its close-up.",
      role: "Editor",
      outcome: "Vertical food content cut for appetite-first pacing." },
    { title: "Chess Game", ytid: "Nd3PvFDWDOY",
      genre: "SOCIAL", client: "", vert: true,
      log: "A quiet match, cut to feel like a title fight.",
      role: "Editor",
      outcome: "Short-form narrative energy applied to a slow game." },
    { title: "ADTV — Reel 003", ytid: "lq6NAFn7css",
      genre: "SOCIAL", client: "ADTV", vert: true,
      log: "Fast-turn vertical cutdown for the ADTV feed.",
      role: "Editor",
      outcome: "Part of an ongoing short-form series." },
    { title: "Gossip Girl — Reel 004", ytid: "OHB6G7gKE0E",
      genre: "SOCIAL", client: "", vert: true,
      log: "Episodic moments re-cut for the vertical feed.",
      role: "Editor",
      outcome: "Entertainment clips repackaged for short-form attention spans." },
    { title: "Tiramisu Latte", ytid: "KTOETjSxeEw",
      genre: "SOCIAL", client: "", vert: true,
      log: "A signature drink, built shot by shot.",
      role: "Editor",
      outcome: "Café content designed to stop the scroll mid-craving." },
    { title: "Turkish Coffee", ytid: "wyoWZJIsAq4",
      genre: "SOCIAL", client: "", vert: true,
      log: "Sand-brewed coffee, start to pour.",
      role: "Editor",
      outcome: "Process video — the craft is the hook." },
    { title: "Spice Talk: Turkish Coffee", ytid: "6PII1gtkMzc",
      genre: "SOCIAL", client: "", vert: true,
      log: "Mini-explainer series: the story in the cup.",
      role: "Editor",
      outcome: "Recurring vertical series built around one voice and one topic." },
    { title: "Spice Talk: Za'atar", ytid: "xTP3JH82G_0",
      genre: "SOCIAL", client: "", vert: true,
      log: "Mini-explainer series: the blend behind the bread.",
      role: "Editor",
      outcome: "Recurring vertical series built around one voice and one topic." },
    { title: "Catering Capabilities", ytid: "yjew97C1GVs",
      genre: "SOCIAL", client: "", vert: true,
      log: "The full spread, in under a minute.",
      role: "Editor",
      outcome: "Service showcase cut for decision-makers scrolling on lunch." },
    { title: "Catering for MBFC", ytid: "iAVH3qUmDjg",
      genre: "SOCIAL", client: "", vert: true,
      log: "Event catering recap, cut for the client's feed.",
      role: "Editor",
      outcome: "Recap content that doubles as a pitch for the next booking." },
    { title: "NVIDIA GTC Day 1: In the Arena", ytid: "-d5SmVdRzfM",
      genre: "SOCIAL", client: "Core42", vert: true,
      log: "Same-day recap from the GTC show floor.",
      role: "Editor",
      outcome: "Event coverage turned around within the day — shot, cut, posted before day two." },
  ];
  GENRES.SOCIAL = { color: "var(--teal)" };

  function buildCard(proj, container) {
    const el = document.createElement("article");
    el.className = "clip" + (proj.vert ? " vert" : "");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `Open ${proj.title} in the viewer`);
    const badge = proj.durS ? fmtDur(proj.durS) : "9:16";
    const tag2 = proj.client ? proj.client.toUpperCase() : (proj.vert ? "VERTICAL" : "");
    el.innerHTML = `
      <div class="thumb-wrap">
        <img src="https://i.ytimg.com/vi/${proj.ytid}/${proj.vert ? "oardefault" : "maxresdefault"}.jpg"
             alt="Frame from ${proj.title}" loading="lazy">
        <span class="thumb-play" aria-hidden="true">▶</span>
        <span class="dur-badge mono">${badge}</span>
      </div>
      <div class="clip-meta">
        <span class="track-color" style="background:${GENRES[proj.genre].color}"></span>
        <h3 class="clip-title">${proj.title}</h3>
        <p class="clip-log">${proj.log}</p>
        <div class="clip-tags">
          <span class="genre-tag mono">${proj.genre}</span>
          ${tag2 ? `<span class="genre-tag mono">${tag2}</span>` : ""}
        </div>
      </div>`;
    container.appendChild(el);

    // preferred thumb sizes can 404 — or return YouTube's 120×90 gray
    // placeholder with a 200, which never fires onerror. Check both.
    const img = el.querySelector("img");
    const fallback = () => { img.src = `https://i.ytimg.com/vi/${proj.ytid}/hqdefault.jpg`; };
    img.addEventListener("error", fallback, { once: true });
    img.addEventListener("load", function check() {
      if (img.naturalWidth <= 120 && !img.src.includes("hqdefault")) {
        img.removeEventListener("load", check);
        fallback();
      }
    });

    el.addEventListener("click", () => openViewer(proj));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { openViewer(proj); e.preventDefault(); }
    });
  }

  const bin = document.getElementById("bin");
  const binShort = document.getElementById("binShort");
  PROJECTS.forEach((p) => buildCard(p, bin));
  SHORTS.forEach((p) => buildCard(p, binShort));

  /* --- bin tabs --- */
  const tabLong = document.getElementById("tabLong");
  const tabShort = document.getElementById("tabShort");
  function selectBin(short) {
    bin.hidden = short;
    binShort.hidden = !short;
    tabLong.setAttribute("aria-selected", String(!short));
    tabShort.setAttribute("aria-selected", String(short));
    relayout(); // bin heights differ → marker positions shift
  }
  tabLong.addEventListener("click", () => selectBin(false));
  tabShort.addEventListener("click", () => selectBin(true));

  /* ========================================================
     CLIP VIEWER — near-fullscreen player overlay
     ======================================================== */
  const viewer = document.getElementById("viewer");
  const viewerVideo = document.getElementById("viewerVideo");
  let viewerOpen = false;
  let lastFocus = null;

  function openViewer(proj) {
    const list = proj.vert ? SHORTS : PROJECTS;
    const idx = list.indexOf(proj);
    const binName = proj.vert ? "SHORT-FORM" : "LONG-FORM";
    const trt = proj.durS ? ` · TRT ${fmtDur(proj.durS)}` : " · 9:16";
    lastFocus = document.activeElement;
    document.getElementById("viewerSlate").textContent =
      `${binName} ${String(idx + 1).padStart(2, "0")}/${String(list.length).padStart(2, "0")} · ${proj.genre}${trt}`;
    document.getElementById("viewerTitle").textContent = proj.title;
    document.getElementById("viewerLog").textContent = proj.log;
    document.getElementById("viewerRole").textContent = proj.role;
    document.getElementById("viewerClient").textContent = proj.client || "—";
    document.getElementById("viewerNotes").textContent = proj.outcome;
    document.getElementById("viewerYt").href = `https://www.youtube.com/watch?v=${proj.ytid}`;
    document.querySelector(".viewer-panel").classList.toggle("vert", !!proj.vert);
    viewerVideo.replaceChildren(makeEmbed(proj.ytid, proj.title, !reducedMotion));
    viewer.hidden = false;
    viewerOpen = true;
    document.body.style.overflow = "hidden";
    document.getElementById("viewerClose").focus();
  }

  function closeViewer() {
    viewer.hidden = true;
    viewerOpen = false;
    viewerVideo.replaceChildren(); // stop playback
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }

  document.getElementById("viewerClose").addEventListener("click", closeViewer);
  document.getElementById("viewerBackdrop").addEventListener("click", closeViewer);
  window.addEventListener("keydown", (e) => {
    if (viewerOpen && e.key === "Escape") closeViewer();
  });

  /* ========================================================
     COLOR PAGE — grade the headshot into color
     ======================================================== */
  const stillImg = document.getElementById("stillImg");
  const stillState = document.getElementById("stillState");
  const tintWarm = document.getElementById("tintWarm");
  const tintTint = document.getElementById("tintTint");

  const grade = { exposure: 0, contrast: 0, saturation: 0, temp: 0, tint: 0 };
  const GRADE_DEFAULTS = { ...grade };
  const AUTO_TARGET = { exposure: 6, contrast: 12, saturation: 108, temp: 10, tint: -4 };
  let bypass = false;

  const gradeInputs = {
    exposure: document.getElementById("gExposure"),
    contrast: document.getElementById("gContrast"),
    saturation: document.getElementById("gSaturation"),
    temp: document.getElementById("gTemp"),
    tint: document.getElementById("gTint")
  };
  const gradeVals = {
    exposure: document.getElementById("vExposure"),
    contrast: document.getElementById("vContrast"),
    saturation: document.getElementById("vSaturation"),
    temp: document.getElementById("vTemp"),
    tint: document.getElementById("vTint")
  };

  function applyGrade() {
    if (bypass) {
      stillImg.style.filter = "grayscale(1)";
      tintWarm.style.opacity = "0";
      tintTint.style.opacity = "0";
    } else {
      const bright = 1 + grade.exposure / 250;          // ±0.4
      const contr = 1 + grade.contrast / 220;           // ±0.45
      const sat = grade.saturation / 100;               // 0–2
      stillImg.style.filter =
        `grayscale(${Math.max(0, 1 - sat)}) saturate(${Math.max(sat, 0.01)}) brightness(${bright}) contrast(${contr})`;
      // temp: warm ↔ cool wash · tint: magenta ↔ green (soft-light layers)
      tintWarm.style.background = grade.temp >= 0 ? "#FF6A2B" : "#29C4C9";
      tintWarm.style.opacity = String(Math.abs(grade.temp) / 100 * 0.55);
      tintTint.style.background = grade.tint >= 0 ? "#B24BC9" : "#57C94B";
      tintTint.style.opacity = String(Math.abs(grade.tint) / 100 * 0.4);
    }
    // readouts, in colorist units
    gradeVals.exposure.textContent = (grade.exposure >= 0 ? "+" : "") + (grade.exposure / 50).toFixed(2);
    gradeVals.contrast.textContent = (grade.contrast >= 0 ? "+" : "") + (grade.contrast / 100).toFixed(2);
    gradeVals.saturation.textContent = String(grade.saturation);
    gradeVals.temp.textContent = (grade.temp >= 0 ? "+" : "") + grade.temp;
    gradeVals.tint.textContent = (grade.tint >= 0 ? "+" : "") + grade.tint;

    const touched = Object.keys(grade).some((k) => grade[k] !== GRADE_DEFAULTS[k]);
    stillState.textContent = bypass ? "BYPASSED" : (touched ? "GRADING…" : "UNGRADED");
    stillState.classList.toggle("graded", !bypass && grade.saturation > 60);
    if (!bypass && grade.saturation > 60) stillState.textContent = "GRADED ✓";
  }

  Object.entries(gradeInputs).forEach(([key, input]) => {
    input.addEventListener("input", () => {
      grade[key] = parseInt(input.value, 10);
      if (bypass) { bypass = false; bypassBtn.setAttribute("aria-pressed", "false"); }
      applyGrade();
    });
  });

  // AUTO GRADE: animate every control to a tasteful target, sliders moving live
  let autoAnim = null;
  document.getElementById("autoGrade").addEventListener("click", () => {
    if (autoAnim) cancelAnimationFrame(autoAnim);
    bypass = false;
    bypassBtn.setAttribute("aria-pressed", "false");
    const from = { ...grade };
    const t0 = performance.now();
    const DUR = reducedMotion ? 0 : 900;
    (function stepAnim(now) {
      const p = DUR === 0 ? 1 : Math.min(1, (now - t0) / DUR);
      const ease = 1 - Math.pow(1 - p, 3);
      Object.keys(grade).forEach((k) => {
        grade[k] = Math.round(from[k] + (AUTO_TARGET[k] - from[k]) * ease);
        gradeInputs[k].value = grade[k];
      });
      applyGrade();
      if (p < 1) autoAnim = requestAnimationFrame(stepAnim);
      else autoAnim = null;
    })(t0);
  });

  const bypassBtn = document.getElementById("bypassGrade");
  bypassBtn.addEventListener("click", () => {
    bypass = !bypass;
    bypassBtn.setAttribute("aria-pressed", String(bypass));
    applyGrade();
  });

  document.getElementById("resetGrade").addEventListener("click", () => {
    if (autoAnim) { cancelAnimationFrame(autoAnim); autoAnim = null; }
    bypass = false;
    bypassBtn.setAttribute("aria-pressed", "false");
    Object.keys(grade).forEach((k) => {
      grade[k] = GRADE_DEFAULTS[k];
      gradeInputs[k].value = grade[k];
    });
    applyGrade();
  });

  applyGrade();

  /* ========================================================
     EXPORT — project brief form (mailto compose)
     ======================================================== */
  const briefForm = document.getElementById("briefForm");
  const formStatus = document.getElementById("formStatus");

  briefForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("fName");
    const email = document.getElementById("fEmail");
    [name, email].forEach((f) => f.classList.remove("invalid"));
    formStatus.classList.remove("ok");

    if (!name.value.trim()) {
      name.classList.add("invalid"); name.focus();
      formStatus.textContent = "RENDER ERROR — add your name so I know who's calling.";
      return;
    }
    if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      email.classList.add("invalid"); email.focus();
      formStatus.textContent = "RENDER ERROR — that email won't conform. Check the address.";
      return;
    }

    const phone = document.getElementById("fPhone").value.trim();
    const type = document.getElementById("fType").value;
    const msg = document.getElementById("fMsg").value.trim();
    const subject = `Project brief — ${name.value.trim()} (${type})`;
    const body = [
      `Name: ${name.value.trim()}`,
      `Email: ${email.value.trim()}`,
      phone ? `Phone: ${phone}` : null,
      `Format: ${type}`,
      "",
      msg || "(no notes yet)"
    ].filter(Boolean).join("\n");

    window.location.href =
      `mailto:joshgreenfield.editor@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    formStatus.textContent = "EXPORT STARTED — your mail app has the brief. Send it and you're in the queue.";
    formStatus.classList.add("ok");
  });

  /* ========================================================
     layout sync
     ======================================================== */
  function relayout() { layoutMarkers(); syncTransport(); }
  window.addEventListener("resize", relayout);
  window.addEventListener("load", relayout);
  relayout();
  // marker positions depend on final layout; run again after fonts/images settle
  setTimeout(relayout, 300);
})();
