// CLEAN QUEST – Etap 0 (prototyp). AI jest symulowane: o wyniku weryfikacji decydujesz przyciskiem testowym.
"use strict";

/* ============ DANE ============ */

const ROOMS = {
  kitchen: {
    name: "Kuchnia", emoji: "🍳",
    adult: [
      "Włóż do lodówki wszystko, co powinno być w lodówce",
      "Włóż brudne naczynia do zmywarki albo zlewu",
      "Wyrzuć śmieci i puste opakowania",
      "Odłóż rzeczy z blatu na swoje miejsca",
      "Przetrzyj blat",
      "Przetrzyj płytę kuchenną",
      "Rozpakuj zmywarkę",
    ],
    kid: [
      "Zanieś swój talerz i kubek do zlewu",
      "Wyrzuć papierki do kosza",
      "Schowaj przekąski na swoje miejsce",
      "Dosuń krzesła do stołu",
      "Przetrzyj stół ściereczką",
    ],
  },
  bathroom: {
    name: "Łazienka", emoji: "🛁",
    adult: [
      "Odłóż kosmetyki na półkę",
      "Wrzuć brudne ubrania do kosza na pranie",
      "Powieś ręczniki",
      "Wyrzuć puste opakowania",
      "Przetrzyj umywalkę",
      "Przetrzyj lustro",
    ],
    kid: [
      "Odłóż szczoteczkę i pastę do kubka",
      "Wrzuć brudne ubrania do kosza na pranie",
      "Powieś swój ręcznik",
      "Wyłów zabawki z wanny",
    ],
  },
  living: {
    name: "Salon", emoji: "🛋️",
    adult: [
      "Zbierz naczynia i zanieś je do kuchni",
      "Odnieś rzeczy, które nie należą do salonu",
      "Zbierz śmieci i wyrzuć je",
      "Ułóż poduszki i koc na kanapie",
      "Odłóż piloty i ładowarki na miejsce",
      "Przetrzyj stolik",
    ],
    kid: [
      "Pozbieraj zabawki do pudełka",
      "Zanieś kubki do kuchni",
      "Ułóż poduszki na kanapie",
      "Odłóż książki na półkę",
    ],
  },
  bedroom: {
    name: "Sypialnia", emoji: "🛏️",
    adult: [
      "Wrzuć brudne ubrania do kosza na pranie",
      "Odwieś czyste ubrania do szafy",
      "Wynieś naczynia i śmieci",
      "Pościel łóżko",
      "Uporządkuj szafkę nocną",
    ],
    kid: [
      "Pozbieraj zabawki z podłogi",
      "Wrzuć brudne ubrania do kosza",
      "Schowaj piżamę pod poduszkę",
      "Pościel łóżko (choć trochę!)",
    ],
  },
};

// Tabela punktów: [minuty, punkty]. Pomiędzy – interpolacja i zaokrąglenie.
const SCORE_TABLE = [[1, 9], [3, 6], [5, 4], [10, 2], [15, 1], [20, 0]];
const CLEAN_BONUS = 14;
const EVOLVE_COST = 33;
const BADGES_PER_EVOLVE = 9;

const STAGES = ["Kurzynek", "Pyłek", "Ścierek", "Mopik", "Błyskun", "Lśniak",
  "Książę Porządku", "Król Czystości", "Smok Czystości", "Legenda Porządku"];

const FAIL_MSG = {
  adult: [
    "Zacznij sprzątać dalej, bo nie widzę tu posprzątania.",
    "Jeszcze nie wszystko! Sprawdź rzeczy, które zostały na wierzchu.",
    "Prawie! AI widzi jeszcze kilka rzeczy do odłożenia.",
  ],
  kid: [
    "Jeszcze chwilka! Coś zostało do posprzątania 🙂",
    "Prawie! Rozejrzyj się jeszcze raz.",
  ],
};

/* ============ STAN ============ */

const STORE_KEY = "cleanquest.v1";
const DEFAULT_STATE = {
  name: "Graczu", mode: "adult", points: 0, totalEarned: 0, missionsDone: 0,
  activeDays: [], bestStreak: 0, badges: [], avatarLevel: 0, cleanBonus: {}, session: null,
};

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY));
    return Object.assign({}, DEFAULT_STATE, raw || {});
  } catch (e) {
    return Object.assign({}, DEFAULT_STATE);
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* tryb prywatny itp. */ }
}

let S = load();

/* ============ POMOCNICZE ============ */

const $ = (sel, root = document) => root.querySelector(sel);
const app = $("#app");

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtTime(ms) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function pointsFor(seconds) {
  const m = seconds / 60;
  if (m <= SCORE_TABLE[0][0]) return SCORE_TABLE[0][1];
  for (let i = 0; i < SCORE_TABLE.length - 1; i++) {
    const [m0, p0] = SCORE_TABLE[i];
    const [m1, p1] = SCORE_TABLE[i + 1];
    if (m <= m1) return Math.round(p0 + ((p1 - p0) * (m - m0)) / (m1 - m0));
  }
  return 0;
}
// Ile sekund zostało, zanim punktacja spadnie.
function nextDrop(seconds) {
  const now = pointsFor(seconds);
  if (now === 0) return null;
  for (let t = Math.floor(seconds) + 1; t <= 1200; t++) {
    const p = pointsFor(t);
    if (p < now) return { in: t - seconds, pts: p };
  }
  return null;
}

/* ---- passa ---- */
function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function currentStreak() {
  const set = new Set(S.activeDays);
  let d = new Date();
  if (!set.has(dayKey(d))) d = addDays(d, -1); // dziś jeszcze można przedłużyć
  let n = 0;
  while (set.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}
function activeToday() { return S.activeDays.includes(dayKey()); }
function markActive() {
  const k = dayKey();
  if (S.activeDays.includes(k)) return;
  S.activeDays.push(k);
  if (S.activeDays.length > 400) S.activeDays = S.activeDays.slice(-400);
  const c = currentStreak();
  if (c > S.bestStreak) S.bestStreak = c;
  setTimeout(() => toast(`🔥 Passa przedłużona: ${c} ${c === 1 ? "dzień" : "dni"}!`), 900);
}

/* ---- punkty ---- */
function addPoints(n) {
  S.points += n;
  S.totalEarned += n;
  save();
  renderHeader(true);
}

/* ============ STWOREK (SVG) ============ */

function stageName(l) {
  return l < STAGES.length ? STAGES[l] : `${STAGES[STAGES.length - 1]} +${l - STAGES.length + 1}`;
}
function star(x, y, r, fill = "#FFC93C") {
  const k = r * 0.3;
  return `<path d="M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z" fill="${fill}"/>`;
}
function creatureSVG(level) {
  const hues = [95, 150, 175, 200, 225, 265, 295, 330, 15, 42];
  const h = hues[level % hues.length];
  const body = `hsl(${h} 60% 62%)`, shade = `hsl(${h} 50% 42%)`, belly = `hsl(${h} 70% 84%)`;
  const s = Math.min(1, 0.78 + level * 0.035);
  const rx = 40 * s, ry = 36 * s, cy = 80, top = cy - ry;
  const ey = cy - ry * 0.2, ex = rx * 0.38;
  let back = "", front = "";

  if (level >= 9) back += `<circle cx="60" cy="${cy}" r="${ry + 16}" fill="none" stroke="#FFC93C" stroke-width="3" stroke-dasharray="4 7"/>`;
  if (level >= 8) back += `<path d="M${60 - rx + 4} ${cy - 6} q-26 -22 -18 8 q8 10 18 4z" fill="${shade}"/><path d="M${60 + rx - 4} ${cy - 6} q26 -22 18 8 q-8 10 -18 4z" fill="${shade}"/>`;
  back += `<ellipse cx="${60 - rx * 0.45}" cy="${cy + ry - 3}" rx="11" ry="7" fill="${shade}"/><ellipse cx="${60 + rx * 0.45}" cy="${cy + ry - 3}" rx="11" ry="7" fill="${shade}"/>`;

  if (level >= 1 && level < 6) {
    front += `<path d="M60 ${top + 3}q-2 -13 -14 -15q4 13 14 15z" fill="#43A047"/><path d="M60 ${top + 3}q2 -15 14 -16q-3 14 -14 16z" fill="#66BB6A"/>`;
  }
  if (level >= 2) {
    front += `<ellipse cx="${60 - ex}" cy="${ey + 13}" rx="6" ry="3.5" fill="#FF8A80" opacity=".7"/><ellipse cx="${60 + ex}" cy="${ey + 13}" rx="6" ry="3.5" fill="#FF8A80" opacity=".7"/>`;
  }
  if (level >= 3) {
    // rączka z gąbką
    front += `<ellipse cx="${60 + rx - 2}" cy="${cy + 8}" rx="7" ry="10" fill="${body}" transform="rotate(-30 ${60 + rx - 2} ${cy + 8})"/>`;
    front += `<rect x="${60 + rx + 1}" y="${cy - 8}" width="16" height="12" rx="3" fill="#FFC93C" stroke="#D9A21A" stroke-width="2"/>`;
  }
  if (level >= 4) front += star(14, 30, 6) + star(104, 24, 5) + star(100, 104, 4);
  if (level >= 6) {
    front += `<path d="M${60 - 16} ${top + 5}L${60 - 14} ${top - 11}L${60 - 7} ${top - 2}L60 ${top - 15}L${60 + 7} ${top - 2}L${60 + 14} ${top - 11}L${60 + 16} ${top + 5}Z" fill="#FFC93C" stroke="#D9A21A" stroke-width="2" stroke-linejoin="round"/>`;
  }

  return `<svg class="creature" viewBox="0 0 120 125" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Stworek: ${stageName(level)}">
    ${back}
    <ellipse cx="60" cy="${cy}" rx="${rx}" ry="${ry}" fill="${body}"/>
    <ellipse cx="60" cy="${cy + ry * 0.35}" rx="${rx * 0.6}" ry="${ry * 0.45}" fill="${belly}"/>
    <circle cx="${60 - ex}" cy="${ey}" r="9" fill="#fff"/><circle cx="${60 + ex}" cy="${ey}" r="9" fill="#fff"/>
    <circle cx="${60 - ex + 1.5}" cy="${ey + 1.5}" r="4.5" fill="#1F2A37"/><circle cx="${60 + ex + 1.5}" cy="${ey + 1.5}" r="4.5" fill="#1F2A37"/>
    <circle cx="${60 - ex + 3}" cy="${ey}" r="1.6" fill="#fff"/><circle cx="${60 + ex + 3}" cy="${ey}" r="1.6" fill="#fff"/>
    <path d="M53 ${ey + 14}Q60 ${ey + 21} 67 ${ey + 14}" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${front}
  </svg>`;
}

/* ============ UI: nagłówek, toast, modal, konfetti ============ */

function renderHeader(bump) {
  $("#hdrPoints").textContent = S.points;
  $("#hdrStreak").textContent = currentStreak();
  $(".avatar-mini").innerHTML = creatureSVG(S.avatarLevel);
  if (bump) {
    const p = $(".pill.coins");
    p.classList.remove("bump"); void p.offsetWidth; p.classList.add("bump");
  }
  document.body.classList.toggle("kid", S.mode === "kid");
}

let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function openSheet(html, bind) {
  const m = $("#modal");
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeSheet(); };
  if (bind) bind(m);
}
function closeSheet() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }

function confetti() {
  const box = document.createElement("div");
  box.className = "confetti";
  const colors = ["#2BB673", "#FFC93C", "#FF8A3D", "#3B82F6", "#8B5CF6", "#EF5350"];
  for (let i = 0; i < 50; i++) {
    const p = document.createElement("i");
    p.style.left = Math.random() * 100 + "%";
    p.style.background = rand(colors);
    p.style.animationDuration = 1.4 + Math.random() * 1.6 + "s";
    p.style.animationDelay = Math.random() * 0.4 + "s";
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 3800);
}

/* ============ APARAT ============ */

let photoCb = null;
const cam = $("#cameraInput");
cam.addEventListener("change", () => {
  const f = cam.files && cam.files[0];
  cam.value = "";
  if (f && photoCb) {
    const cb = photoCb;
    photoCb = null;
    cb(URL.createObjectURL(f));
  }
});
function takePhoto(cb) { photoCb = cb; cam.click(); }

/* ============ ROUTER ============ */

const FLOW_SCREENS = new Set(["room", "mission", "verify", "missionResult", "summary", "clean"]);
let tick = null;
let currentScreen = "home";

function go(screen, params = {}) {
  clearInterval(tick);
  tick = null;
  currentScreen = screen;
  document.body.classList.toggle("flow", FLOW_SCREENS.has(screen));
  document.querySelectorAll(".bottomnav button").forEach((b) => b.classList.toggle("active", b.dataset.go === screen));
  window.scrollTo(0, 0);
  SCREENS[screen](params);
  renderHeader();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-go]");
  if (!b) return;
  if (S.session && !FLOW_SCREENS.has(b.dataset.go)) {
    toast("Najpierw dokończ albo przerwij sprzątanie 🧹");
    return;
  }
  go(b.dataset.go);
});

/* ============ EKRANY ============ */

const SCREENS = {};

/* ---------- DOM ---------- */
SCREENS.home = () => {
  const owned = S.badges.length;
  const nextNeed = BADGES_PER_EVOLVE * (S.avatarLevel + 1);
  const prevNeed = BADGES_PER_EVOLVE * S.avatarLevel;
  const pct = Math.max(0, Math.min(100, ((owned - prevNeed) / BADGES_PER_EVOLVE) * 100));
  const today = new Date();
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const names = ["P", "W", "Ś", "C", "P", "S", "N"];
  const week = names.map((n, i) => {
    const d = addDays(monday, i);
    const on = S.activeDays.includes(dayKey(d));
    const isToday = dayKey(d) === dayKey(today);
    return `<div class="${on ? "on" : ""} ${isToday ? "today" : ""}"><i>${on ? "🔥" : ""}</i>${n}</div>`;
  }).join("");
  const streak = currentStreak();
  const cleanToday = S.cleanBonus[dayKey()] || [];

  app.innerHTML = `
    <div class="card hero">
      ${creatureSVG(S.avatarLevel)}
      <div style="flex:1">
        <div class="label">${stageName(S.avatarLevel)} · poziom ${S.avatarLevel}</div>
        <h1>Cześć, ${esc(S.name)}!</h1>
        <div class="muted" style="font-weight:700;margin-top:4px">Odznaki: ${owned}/333 · do ewolucji ${Math.max(0, nextNeed - owned)}</div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
    </div>

    <div class="card">
      <div class="streak-head">
        <h2>🔥 ${streak} ${streak === 1 ? "dzień" : "dni"} passy</h2>
        <span class="label">Rekord: ${S.bestStreak}</span>
      </div>
      <div class="week">${week}</div>
      ${activeToday() ? "" : `<div class="hint" style="margin-top:12px">Ukończ dziś misję albo skan czystości, żeby utrzymać passę.</div>`}
    </div>

    <button class="card bonus-card" id="cleanBtn" style="width:100%;text-align:left">
      <span class="big">📸</span>
      <span><h3>Skan czystości</h3><span class="muted" style="font-weight:700">Pokaż AI posprzątane pomieszczenie</span></span>
      <span class="plus">+${CLEAN_BONUS}</span>
    </button>

    <h2 class="section-title">Co dzisiaj sprzątamy?</h2>
    <div class="rooms">
      ${Object.entries(ROOMS).map(([k, r]) => `
        <button class="room ${cleanToday.includes(k) ? "done" : ""}" data-room="${k}">
          <span class="emoji">${r.emoji}</span><b>${r.name}</b>
          <small>${cleanToday.includes(k) ? "✓ czysto dziś" : "Skanuj bałagan"}</small>
        </button>`).join("")}
    </div>`;

  $("#cleanBtn").onclick = () => go("clean");
  app.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => go("room", { room: b.dataset.room })));
};

/* ---------- SKAN BAŁAGANU → MISJE ---------- */
function pickMissions(roomKey) {
  const list = ROOMS[roomKey][S.mode];
  const want = S.mode === "kid" ? 3 + Math.round(Math.random()) : 4 + Math.floor(Math.random() * 3);
  // pierwsza misja (najważniejsza) zawsze, reszta losowo – ale w ustalonej kolejności
  const rest = list.slice(1).map((m, i) => ({ m, i, r: Math.random() })).sort((a, b) => a.r - b.r)
    .slice(0, Math.min(want, list.length) - 1).sort((a, b) => a.i - b.i).map((x) => x.m);
  return [list[0], ...rest];
}

SCREENS.room = ({ room }) => {
  const r = ROOMS[room];
  const intro = () => {
    app.innerHTML = `
      <div class="label">Skanowanie · ${r.name}</div>
      <h1 style="font-size:30px;margin:4px 0 14px">Pokaż mi bałagan!</h1>
      <div class="photo">${r.emoji}</div>
      <p class="muted" style="font-weight:700">Zrób zdjęcie całego pomieszczenia. AI rozpozna, co trzeba posprzątać, i ułoży misje po kolei.</p>
      <button class="btn" id="shot">📷 Zrób zdjęcie</button>
      <button class="linkbtn" id="skip">pomiń zdjęcie (test)</button>
      <button class="linkbtn" id="back">← wróć</button>`;
    $("#shot").onclick = () => takePhoto(analyze);
    $("#skip").onclick = () => analyze(null);
    $("#back").onclick = () => go("home");
  };
  const analyze = (url) => {
    app.innerHTML = `
      <div class="label">Skanowanie · ${r.name}</div>
      <h1 style="font-size:30px;margin:4px 0 14px">Analizuję…</h1>
      <div class="photo scanning">${url ? `<img src="${url}" alt="Zdjęcie pomieszczenia">` : r.emoji}</div>
      <div class="ai-status"><span class="ai-chip">AI</span>Szukam rzeczy do posprzątania…</div>`;
    setTimeout(() => showMissions(url), 1800);
  };
  const showMissions = (url) => {
    const missions = pickMissions(room);
    app.innerHTML = `
      <div class="label">Plan sprzątania · ${r.name}</div>
      <h1 style="font-size:30px;margin:4px 0 14px">${missions.length} misji do zrobienia</h1>
      ${url ? `<div class="photo" style="aspect-ratio:16/9;margin-bottom:14px"><img src="${url}" alt=""></div>` : ""}
      <div class="card"><ol class="mission-list">${missions.map((m) => `<li>${esc(m)}</li>`).join("")}</ol></div>
      <p class="hint">Każda misja ma stoper. Im szybciej (i porządniej), tym więcej punktów – do 9 za misję.</p>
      <button class="btn" id="startAll">Zaczynamy!</button>
      <button class="linkbtn" id="back">← wróć</button>`;
    $("#startAll").onclick = () => {
      S.session = { room, missions, idx: 0, acc: 0, startedAt: null, earned: 0, results: [], failMsg: "" };
      save();
      go("mission");
    };
    $("#back").onclick = () => go("home");
  };
  intro();
};

/* ---------- MISJA ZE STOPEREM ---------- */
function elapsed(ses) { return ses.acc + (ses.startedAt ? Date.now() - ses.startedAt : 0); }

SCREENS.mission = () => {
  const ses = S.session;
  if (!ses) return go("home");
  if (ses.idx >= ses.missions.length) return go("summary");
  const r = ROOMS[ses.room];
  const running = !!ses.startedAt;
  const started = running || ses.acc > 0;
  const steps = ses.missions.map((_, i) => `<i class="${i < ses.idx ? "done" : i === ses.idx ? "now" : ""}"></i>`).join("");

  app.innerHTML = `
    <div class="mission-head">
      <span class="label">${r.name} · Misja ${ses.idx + 1}/${ses.missions.length}</span>
      <span class="label">⭐ ${ses.earned} pkt</span>
    </div>
    <div class="steps">${steps}</div>
    ${ses.failMsg ? `<div class="alert">🔍 ${esc(ses.failMsg)}</div>` : ""}
    <h1 class="task">${esc(ses.missions[ses.idx])}</h1>
    <div class="timer ${running ? "" : "paused"}">
      <div class="label" style="color:#CBD5E1">Twój czas</div>
      <div class="t" id="t">00:00</div>
      <div class="now-pts" id="nowPts"></div>
      <div class="next-pts" id="nextPts"></div>
    </div>
    ${!started
      ? `<button class="btn" id="start">▶ Start</button>`
      : running
        ? `<button class="btn red" id="stop">⏹ Zatrzymaj stoper</button>`
        : `<button class="btn ghost" id="resume">▶ Wznów stoper</button>`}
    <button class="btn yellow ${started && !running ? "glow" : ""}" id="check" ${started && !running ? "" : "disabled"}>📷 Sprawdź</button>
    ${started && !running ? `<button class="linkbtn" id="checkNoPhoto">sprawdź bez zdjęcia (test)</button>` : `<p class="hint">Przycisk SPRAWDŹ aktywuje się po zatrzymaniu stopera.</p>`}
    <button class="linkbtn" id="abort">Przerwij sprzątanie</button>`;

  const update = () => {
    const ms = elapsed(ses);
    const sec = ms / 1000;
    $("#t").textContent = fmtTime(ms);
    const p = pointsFor(sec);
    $("#nowPts").textContent = p > 0 ? `Teraz: ${p} pkt` : "0 pkt – ale dokończ, porządek się liczy!";
    const nd = nextDrop(sec);
    $("#nextPts").textContent = nd ? `za ${fmtTime(nd.in * 1000)} spadnie do ${nd.pts} pkt` : "";
  };
  update();
  if (running) tick = setInterval(update, 250);

  const start = () => { ses.startedAt = Date.now(); ses.failMsg = ""; save(); go("mission"); };
  if ($("#start")) $("#start").onclick = start;
  if ($("#resume")) $("#resume").onclick = start;
  if ($("#stop")) $("#stop").onclick = () => {
    ses.acc = elapsed(ses);
    ses.startedAt = null;
    save();
    go("mission");
  };
  $("#check").onclick = () => takePhoto((url) => go("verify", { url }));
  if ($("#checkNoPhoto")) $("#checkNoPhoto").onclick = () => go("verify", { url: null });
  $("#abort").onclick = () => openSheet(`
      <h2>Przerwać sprzątanie?</h2>
      <p class="muted" style="font-weight:700">Punkty z ukończonych misji zostają (${ses.earned} pkt).</p>
      <div class="row"><button class="btn ghost" id="no">Nie</button><button class="btn red" id="yes">Przerwij</button></div>`,
    (m) => {
      $("#no", m).onclick = closeSheet;
      $("#yes", m).onclick = () => { S.session = null; save(); closeSheet(); go("home"); };
    });
};

/* ---------- WERYFIKACJA ZDJĘCIA (symulacja AI) ---------- */
function verifyUI({ url, title, onPass, onFail }) {
  const kid = S.mode === "kid";
  app.innerHTML = `
    <div class="label">Weryfikacja</div>
    <h1 style="font-size:30px;margin:4px 0 14px">${esc(title)}</h1>
    <div class="photo scanning" id="ph">${url ? `<img src="${url}" alt="Zdjęcie kontrolne">` : "🔍"}</div>
    <div class="ai-status" id="st"><span class="ai-chip">AI</span>Sprawdzam, czy jest posprzątane…</div>
    <div id="panel"></div>`;
  setTimeout(() => {
    $("#ph").classList.remove("scanning");
    $("#st").innerHTML = `<span class="ai-chip">AI</span>Gotowe.`;
    $("#panel").innerHTML = `
      <div class="card test-panel">
        <div class="label">Etap 0 · tryb testowy</div>
        <p style="font-weight:700;margin:6px 0 14px">AI nie jest jeszcze podłączone. ${kid ? "Rodzic decyduje" : "Wybierz"}, jaki ma być wynik:</p>
        <div class="row"><button class="btn red" id="fail">✗ Niezaliczone</button><button class="btn" id="pass">✓ Zaliczone</button></div>
      </div>`;
    $("#pass").onclick = onPass;
    $("#fail").onclick = onFail;
  }, 1500);
}

SCREENS.verify = ({ url }) => {
  const ses = S.session;
  if (!ses) return go("home");
  verifyUI({
    url,
    title: ses.missions[ses.idx],
    onPass: () => {
      const ms = ses.acc;
      const pts = pointsFor(ms / 1000);
      ses.results.push({ mission: ses.missions[ses.idx], ms, pts });
      ses.earned += pts;
      S.missionsDone++;
      ses.idx++;
      ses.acc = 0;
      ses.startedAt = null;
      ses.failMsg = "";
      addPoints(pts);
      markActive();
      save();
      go("missionResult", { pts, ms });
    },
    onFail: () => {
      ses.failMsg = rand(FAIL_MSG[S.mode]);
      ses.startedAt = Date.now(); // stoper rusza dalej
      save();
      go("mission");
    },
  });
};

SCREENS.missionResult = ({ pts, ms }) => {
  const ses = S.session;
  const last = ses.idx >= ses.missions.length;
  app.innerHTML = `
    <div class="result">
      <div class="icon">${pts >= 6 ? "🚀" : pts >= 2 ? "🎉" : "👍"}</div>
      <h1>Zaliczone!</h1>
      <div class="gain">+${pts} pkt</div>
      <p class="muted" style="font-weight:800">Czas: ${fmtTime(ms)}</p>
    </div>
    <button class="btn" id="next">${last ? "Zobacz podsumowanie" : `Następna misja (${ses.idx + 1}/${ses.missions.length})`}</button>`;
  if (pts > 0) confetti();
  $("#next").onclick = () => go(last ? "summary" : "mission");
};

SCREENS.summary = () => {
  const ses = S.session;
  if (!ses) return go("home");
  const r = ROOMS[ses.room];
  const total = ses.results.reduce((a, x) => a + x.ms, 0);
  app.innerHTML = `
    <div class="result">
      <div class="icon">${r.emoji}✨</div>
      <h1>${r.name} posprzątana!</h1>
      <div class="gain">+${ses.earned} pkt</div>
      <p class="muted" style="font-weight:800">Łączny czas: ${fmtTime(total)} · 🔥 passa: ${currentStreak()}</p>
    </div>
    <div class="card">
      <table class="score-table">
        ${ses.results.map((x) => `<tr><td>${esc(x.mission)}<br><small class="muted">${fmtTime(x.ms)}</small></td><td>+${x.pts}</td></tr>`).join("")}
      </table>
    </div>
    <button class="btn" id="home">Wróć do domu</button>`;
  confetti();
  $("#home").onclick = () => { S.session = null; save(); go("home"); };
};

/* ---------- SKAN CZYSTOŚCI (+14) ---------- */
function cleanPicker() {
  const done = S.cleanBonus[dayKey()] || [];
  {
    app.innerHTML = `
      <div class="label">Skan czystości · +${CLEAN_BONUS} pkt</div>
      <h1 style="font-size:30px;margin:4px 0 8px">Które pomieszczenie jest czyste?</h1>
      <p class="muted" style="font-weight:700">Bonus za utrzymanie porządku – raz dziennie na pomieszczenie. AI sprawdzi, czy naprawdę wszystko jest na miejscu (np. rozpakowana zmywarka).</p>
      <div class="rooms">
        ${Object.entries(ROOMS).map(([k, r]) => `
          <button class="room ${done.includes(k) ? "done" : ""}" data-room="${k}" ${done.includes(k) ? "disabled" : ""}>
            <span class="emoji">${r.emoji}</span><b>${r.name}</b>
            <small>${done.includes(k) ? "✓ zaliczone dziś" : `+${CLEAN_BONUS} pkt`}</small>
          </button>`).join("")}
      </div>
      <button class="linkbtn" id="back">← wróć</button>`;
    app.querySelectorAll("[data-room]:not([disabled])").forEach((b) => (b.onclick = () => {
      const k = b.dataset.room;
      openSheet(`
        <h2>${ROOMS[k].emoji} ${ROOMS[k].name}</h2>
        <p class="muted" style="font-weight:700">Zrób zdjęcie całego pomieszczenia.</p>
        <button class="btn" id="shot">📷 Zrób zdjęcie</button>
        <button class="linkbtn" id="skip">pomiń zdjęcie (test)</button>`,
      (m) => {
        $("#shot", m).onclick = () => { closeSheet(); takePhoto((url) => go("clean", { room: k, url })); };
        $("#skip", m).onclick = () => { closeSheet(); go("clean", { room: k, url: null }); };
      });
    }));
    $("#back").onclick = () => go("home");
  }
}
SCREENS.clean = (params = {}) => {
  if (!params.room) return cleanPicker();
  const { room, url } = params;
  const r = ROOMS[room];
  verifyUI({
    url,
    title: `${r.name} – skan czystości`,
    onPass: () => {
      const k = dayKey();
      S.cleanBonus = { [k]: [...(S.cleanBonus[k] || []), room] }; // trzymamy tylko dzisiejszy dzień
      addPoints(CLEAN_BONUS);
      markActive();
      save();
      app.innerHTML = `
        <div class="result">
          <div class="icon">✨</div>
          <h1>Czysto!</h1>
          <div class="gain">+${CLEAN_BONUS} pkt</div>
          <p class="muted" style="font-weight:800">Bonus za utrzymanie porządku: ${r.name}</p>
        </div>
        <button class="btn" id="home">Super!</button>`;
      confetti();
      $("#home").onclick = () => go("home");
    },
    onFail: () => {
      app.innerHTML = `
        <div class="result">
          <div class="icon">🧐</div>
          <h1>Jeszcze nie</h1>
          <p class="muted" style="font-weight:800">AI widzi tu jeszcze trochę bałaganu. Może zrobimy z tego misje?</p>
        </div>
        <button class="btn" id="go">🧹 Sprzątamy: ${r.name}</button>
        <button class="linkbtn" id="home">wróć do domu</button>`;
      $("#go").onclick = () => go("room", { room });
      $("#home").onclick = () => go("home");
    },
  });
};

/* ---------- ODZNAKI ---------- */
let badgeFilter = "all";
SCREENS.badges = () => {
  const owned = new Set(S.badges);
  const filters = [["all", "Wszystkie"], ["owned", "Moje"], ["common", "Zwykłe"], ["rare", "Rzadkie"], ["epic", "Epickie"], ["legendary", "Legendarne"]];
  const badgeHTML = (b) => {
    const has = owned.has(b.id);
    return `<button class="badge ${b.rarity} ${has ? "" : "locked"}" data-badge="${b.id}" aria-label="${esc(b.name)}">
      <span>${b.emoji}</span><span class="tier">${b.tier}</span>${has ? "" : `<span class="price">${b.price}⭐</span>`}
    </button>`;
  };
  let body;
  if (badgeFilter === "all") {
    body = BADGE_SETS.map(([name], s) => {
      const items = BADGES.filter((b) => b.set === s);
      const cnt = items.filter((b) => owned.has(b.id)).length;
      return `<div class="set-title"><h3>${items[0].emoji} ${name}</h3><span class="label">${cnt}/9</span></div>
        <div class="badge-grid">${items.map(badgeHTML).join("")}</div>`;
    }).join("");
  } else {
    const list = BADGES.filter((b) => (badgeFilter === "owned" ? owned.has(b.id) : b.rarity === badgeFilter));
    body = list.length ? `<div class="badge-grid" style="margin-top:12px">${list.map(badgeHTML).join("")}</div>`
      : `<p class="hint">Jeszcze nic tu nie ma. Zdobywaj punkty i kupuj odznaki!</p>`;
  }
  app.innerHTML = `
    <div class="card" style="display:flex;align-items:center;justify-content:space-between">
      <div><div class="label">Twoja kolekcja</div><h1 style="font-size:34px">${S.badges.length}/333</h1></div>
      <div style="text-align:right"><div class="label">Masz</div><h2 style="font-size:28px;color:var(--yellow-dark)">${S.points} ⭐</h2></div>
    </div>
    <div class="filters">${filters.map(([k, l]) => `<button data-f="${k}" class="${badgeFilter === k ? "active" : ""}">${l}</button>`).join("")}</div>
    ${body}`;
  app.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { badgeFilter = b.dataset.f; SCREENS.badges(); }));
  app.querySelectorAll("[data-badge]").forEach((el) => (el.onclick = () => badgeSheet(BADGES[+el.dataset.badge])));
};

function badgeSheet(b) {
  const has = S.badges.includes(b.id);
  const missing = b.price - S.points;
  openSheet(`
    <div class="badge ${b.rarity}"><span>${b.emoji}</span></div>
    <span class="rarity-tag ${b.rarity}">${RARITY_LABEL[b.rarity]}</span>
    <h2 style="margin-top:8px">${esc(b.name)}</h2>
    <p class="muted" style="font-weight:700">Kolekcja „${esc(b.setName)}” · poziom ${b.tier}/9</p>
    ${has ? `<button class="btn ghost" id="close">✓ Masz już tę odznakę</button>`
      : missing > 0 ? `<button class="btn" disabled>Brakuje ${missing} ⭐</button><button class="linkbtn" id="close">zamknij</button>`
        : `<button class="btn yellow" id="buy">Kup za ${b.price} ⭐</button><button class="linkbtn" id="close">zamknij</button>`}`,
  (m) => {
    if ($("#close", m)) $("#close", m).onclick = closeSheet;
    if ($("#buy", m)) $("#buy", m).onclick = () => {
      S.points -= b.price;
      S.badges.push(b.id);
      save();
      closeSheet();
      renderHeader(true);
      SCREENS.badges();
      if (b.rarity === "legendary" || b.rarity === "epic") confetti();
      const need = BADGES_PER_EVOLVE * (S.avatarLevel + 1);
      toast(S.badges.length >= need ? "🐾 Możesz ulepszyć stworka!" : `Nowa odznaka: ${b.name}`);
    };
  });
}

/* ---------- STWOREK ---------- */
SCREENS.creature = () => {
  const L = S.avatarLevel;
  const need = BADGES_PER_EVOLVE * (L + 1);
  const okBadges = S.badges.length >= need;
  const okPts = S.points >= EVOLVE_COST;
  app.innerHTML = `
    <div class="card creature-stage">
      ${creatureSVG(L)}
      <div class="label">Poziom ${L}</div>
      <h1>${stageName(L)}</h1>
    </div>
    <div class="card">
      <div class="label">Następna ewolucja: ${stageName(L + 1)}</div>
      <div class="req"><span class="${okBadges ? "ok" : "no"}">${okBadges ? "✓" : "✗"}</span> Odznaki: ${S.badges.length}/${need}</div>
      <div class="req"><span class="${okPts ? "ok" : "no"}">${okPts ? "✓" : "✗"}</span> Punkty: ${S.points}/${EVOLVE_COST} ⭐</div>
      <button class="btn yellow ${okBadges && okPts ? "glow" : ""}" id="evolve" ${okBadges && okPts ? "" : "disabled"}>✨ Ulepsz stworka (${EVOLVE_COST} ⭐)</button>
    </div>
    <h2 class="section-title">Ścieżka ewolucji</h2>
    <div class="badge-grid" style="grid-template-columns:repeat(5,1fr)">
      ${STAGES.map((n, i) => `<div style="text-align:center;${i > L ? "filter:grayscale(1) opacity(.4)" : ""}">${creatureSVG(i)}<small style="font-weight:800">${n}</small></div>`).join("")}
    </div>`;
  $("#evolve").onclick = () => {
    S.points -= EVOLVE_COST;
    S.avatarLevel++;
    save();
    confetti();
    toast(`🎉 Ewolucja! Teraz: ${stageName(S.avatarLevel)}`);
    go("creature");
  };
};

/* ---------- PROFIL / USTAWIENIA ---------- */
SCREENS.settings = () => {
  app.innerHTML = `
    <div class="card">
      <div class="label">Imię gracza</div>
      <input class="input" id="name" maxlength="20" value="${esc(S.name)}">
    </div>
    <div class="card">
      <div class="label">Tryb</div>
      <div class="seg" style="margin-top:8px">
        <button data-mode="adult" class="${S.mode === "adult" ? "active" : ""}">🧑 Dorosły</button>
        <button data-mode="kid" class="${S.mode === "kid" ? "active" : ""}">🧒 Dziecko</button>
      </div>
      <p class="hint" style="text-align:left">Tryb dziecka: prostsze misje, większe napisy, łagodniejsze komunikaty, rodzic zatwierdza wynik.</p>
    </div>
    <div class="card">
      <div class="label">Punktacja za misję</div>
      <table class="score-table">
        ${SCORE_TABLE.map(([m, p]) => `<tr><td>${m === 1 ? "do 1 minuty" : `${m} minut`}</td><td>${p} pkt</td></tr>`).join("")}
      </table>
      <p class="hint" style="text-align:left">Czasy pomiędzy są zaokrąglane (np. 4 min = 5 pkt, 2 min = 8 pkt). Skan czystości: +${CLEAN_BONUS} pkt raz dziennie na pomieszczenie.</p>
    </div>
    <div class="card">
      <div class="label">Statystyki</div>
      <table class="score-table">
        <tr><td>Ukończone misje</td><td>${S.missionsDone}</td></tr>
        <tr><td>Zdobyte punkty łącznie</td><td>${S.totalEarned}</td></tr>
        <tr><td>Najdłuższa passa</td><td>${S.bestStreak}</td></tr>
      </table>
    </div>
    <div class="card test-panel">
      <div class="label">Narzędzia testowe (Etap 0)</div>
      <button class="btn ghost" id="add" style="margin-top:10px">+200 ⭐ (test sklepu)</button>
      <button class="btn red" id="reset">Wyczyść cały postęp</button>
    </div>`;
  $("#name").onchange = (e) => { S.name = e.target.value.trim() || "Graczu"; save(); toast("Zapisano"); };
  app.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { S.mode = b.dataset.mode; save(); go("settings"); }));
  $("#add").onclick = () => { addPoints(200); toast("+200 ⭐ (test)"); };
  $("#reset").onclick = () => openSheet(`
      <h2>Wyczyścić postęp?</h2>
      <p class="muted" style="font-weight:700">Punkty, odznaki, passa i stworek wrócą do zera.</p>
      <div class="row"><button class="btn ghost" id="no">Anuluj</button><button class="btn red" id="yes">Wyczyść</button></div>`,
    (m) => {
      $("#no", m).onclick = closeSheet;
      $("#yes", m).onclick = () => { S = Object.assign({}, DEFAULT_STATE, { activeDays: [], badges: [], cleanBonus: {} }); save(); closeSheet(); go("home"); };
    });
};

/* ============ START ============ */

go(S.session ? "mission" : "home");

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
