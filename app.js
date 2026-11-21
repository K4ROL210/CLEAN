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

// Passa rośnie jak roślinka. [od ilu dni, ikonka, nazwa]
const STREAK_STAGES = [
  [0, "🪨", "Pusta ziemia"],
  [1, "🌰", "Nasionko"],
  [2, "🌱", "Kiełek"],
  [3, "🍃", "Listek"],
  [5, "🌿", "Porosty"],
  [7, "🪴", "Krzaczek"],
  [14, "🌳", "Drzewo"],
  [21, "🌷", "Kwiatki"],
  [30, "🌸", "Kwitnące drzewo"],
  [60, "🍎", "Owocowe drzewo"],
  [100, "🌲", "Las"],
  [365, "🌈", "Rajski ogród"],
];

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
  activeDays: [], bestStreak: 0, badges: [], avatarLevel: 0, cleanBonus: {}, photoHashes: [], session: null,
  frozenDays: [],      // dni passy uratowane zamrożeniem
  avatarHalf: false,   // stworek stracił połówkę (zamrożenie passy)
  peakLevel: 0,        // najwyższy poziom, jaki stworek kiedykolwiek osiągnął (odsłania ścieżkę)
  lastProcessed: null, // do którego dnia sprawdziliśmy opuszczone dni
  dayOffset: 0,        // tylko testy: przesunięcie kalendarza w grze
  savedAt: 0,          // kiedy zapisano – wygrywa nowszy zapis (telefon / chmura)
  catPoints: {},       // punkty w kategoriach zadań – za nie kupuje się odznaki danej kategorii
  roomNotes: {},       // uwagi gracza o pomieszczeniach (rzeczy, które mają tam stałe miejsce)
  installHidden: false, // gracz schował kartę „Zainstaluj na telefonie”
};
function freshState() {
  return Object.assign({}, DEFAULT_STATE, { activeDays: [], badges: [], cleanBonus: {}, photoHashes: [], frozenDays: [] });
}

// Uzupełnia brakujące pola i przerabia starsze zapisy na obecny kształt.
function normalize(raw) {
  const s = Object.assign({}, DEFAULT_STATE, raw || {});
  if (typeof s.lostHalves === "number") {
    // stara wersja zamrożenia (licznik połówek) → poziom + ewentualna połówka
    const halves = Math.max(0, 2 * s.avatarLevel - s.lostHalves);
    s.avatarLevel = Math.ceil(halves / 2);
    s.avatarHalf = halves % 2 === 1;
    delete s.lostHalves;
  }
  if (!s.peakLevel || s.peakLevel < s.avatarLevel) s.peakLevel = s.avatarLevel;
  if (s.session) s.session.missions = s.session.missions.map(missionOf);
  return s;
}
function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(STORE_KEY)));
  } catch (e) {
    return normalize(null);
  }
}
function saveLocal() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* tryb prywatny itp. */ }
}
function save() {
  S.savedAt = Date.now();
  saveLocal();
  cloudSave();
}

/* ---- zapis w chmurze (claude.ai) ----
   Pamięć przeglądarki w aplikacji na claude.ai potrafi się wyczyścić po zamknięciu,
   więc stan trzymamy też w bazie artefaktu, w prywatnym miejscu gracza (data/users/<id>). */
const Cloud = { doc: null, busy: false, again: false, timer: null };
function cloudSave(now) {
  if (!Cloud.doc) return;
  clearTimeout(Cloud.timer);
  Cloud.timer = setTimeout(cloudFlush, now ? 0 : 800); // kilka zmian naraz = jeden zapis
}
async function cloudFlush() {
  if (!Cloud.doc) return;
  if (Cloud.busy) { Cloud.again = true; return; } // jeden zapis naraz
  Cloud.busy = true;
  try {
    await Cloud.doc.set(JSON.parse(JSON.stringify(S)));
  } catch (e) {
    console.warn("CLEAN QUEST: zapis w chmurze nieudany", e && e.code);
  }
  Cloud.busy = false;
  if (Cloud.again) { Cloud.again = false; cloudFlush(); }
}
// Zwraca true, jeśli wczytano z chmury nowszy stan niż ten w telefonie.
async function cloudInit() {
  try {
    if (!window.claude || typeof window.claude.use !== "function") return false;
    const [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !user) return false;
    const id = await user.id();
    if (!id) return false;
    const doc = db.doc(`data/users/${id}/game`);
    const snap = await doc.get();
    Cloud.doc = doc;
    const remote = snap.exists ? snap.data() : null;
    if (remote && (remote.savedAt || 0) > (S.savedAt || 0)) {
      S = normalize(JSON.parse(JSON.stringify(remote)));
      saveLocal();
      return true;
    }
    cloudSave(true); // w chmurze nic nie ma albo starsze – wysyłamy aktualny stan
    return false;
  } catch (e) {
    return false;
  }
}

// Misja = {text, checks: [{where, check}]} – każdy punkt (miejsce) można zaliczyć osobnym zdjęciem.
// Starsze zapisy (sam tekst albo {text, check}) zamieniamy na ten kształt.
function missionOf(m) {
  if (typeof m === "string") m = { text: m };
  if (!Array.isArray(m.checks) || !m.checks.length) m.checks = [{ where: "", check: m.check || m.text }];
  if (!TASK_CATEGORIES.includes(m.cat)) m.cat = guessCategory(m.text);
  return m;
}
function checkLabel(c) { return c.where || c.check; }

/* ---- punkty kategorii (do kupowania odznak) ---- */
function catIcon(cat) { return (BADGE_CATEGORIES[cat] || {}).icon || "⭐"; }
function catPts(cat) { return (S.catPoints && S.catPoints[cat]) || 0; }
function addCatPoints(cat, n) {
  if (!n) return;
  S.catPoints = Object.assign({}, S.catPoints, { [cat]: catPts(cat) + n });
}

/* ---- zapamiętane uwagi o pomieszczeniach ("miotła zawsze stoi w kącie") ---- */
function roomNotes(room) { return (S.roomNotes && S.roomNotes[room]) || []; }
function addRoomNote(room, text) {
  const list = roomNotes(room).filter((n) => n !== text);
  list.push(text);
  S.roomNotes = Object.assign({}, S.roomNotes, { [room]: list.slice(-8) });
  save();
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
// Data w grze. dayOffset > 0 tylko w testach (przesuwa kalendarz).
function now() {
  const d = new Date();
  if (S.dayOffset) d.setDate(d.getDate() + S.dayOffset);
  return d;
}
function dayKey(d = now()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function fmtDay(k) { const d = parseKey(k); return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
// Długość passy kończącej się w danym dniu.
// Dzień zamrożony podtrzymuje passę, ale jej nie wydłuża.
function streakAt(date) {
  const act = new Set(S.activeDays), fr = new Set(S.frozenDays);
  let d = new Date(date), n = 0;
  while (act.has(dayKey(d)) || fr.has(dayKey(d))) {
    if (act.has(dayKey(d))) n++;
    d = addDays(d, -1);
  }
  return n;
}
function currentStreak() {
  const today = now();
  // dziś jeszcze można przedłużyć, więc liczy się też passa do wczoraj
  return activeToday() ? streakAt(today) : streakAt(addDays(today, -1));
}
function streakStage(n) {
  let idx = 0;
  STREAK_STAGES.forEach((s, i) => { if (n >= s[0]) idx = i; });
  const [, icon, name] = STREAK_STAGES[idx];
  const next = STREAK_STAGES[idx + 1];
  return { icon, name, next: next ? { days: next[0], icon: next[1], name: next[2] } : null };
}
function dni(n) { return n === 1 ? "dzień" : "dni"; }
function activeToday() { return S.activeDays.includes(dayKey()); }
function markActive() {
  const k = dayKey();
  if (S.activeDays.includes(k)) return;
  S.activeDays.push(k);
  if (S.activeDays.length > 400) S.activeDays = S.activeDays.slice(-400);
  const c = currentStreak();
  if (c > S.bestStreak) S.bestStreak = c;
  const st = streakStage(c);
  const grew = st.name !== streakStage(c - 1).name;
  setTimeout(() => toast(grew
    ? `${st.icon} Twoja passa urosła: ${st.name}! (${c} ${dni(c)})`
    : `${st.icon} Passa przedłużona: ${c} ${dni(c)}!`), 900);
}

/* ---- zamrożenie passy ---- */
// Opuszczony dzień nie przerywa passy, ale stworek traci połówkę. Druga połówka = cały poziom znika
// (np. Mopik → Ścierek) i trzeba go zdobyć od nowa normalną ewolucją.
// Za gwiazdki da się odzyskać tylko bieżącą połówkę. Stworek na poziomie L ma 2·L połówek zapasu.
// Gdy zapas się skończy, kolejny opuszczony dzień zabiera Kurzynka: passa przepada,
// chyba że gracz zapłaci 100 ⭐ (stworek zaczyna od nowa, passa zostaje).
const HALF_COST = Math.round(EVOLVE_COST / 2); // odzyskanie połówki: połowa kosztu ulepszenia = 17 ⭐
const KURZYNEK_SAVE_COST = 100;
const STREAK_FOR_EVOLVE = 3; // do ewolucji trzeba min. 3 dni aktywności z rzędu
const ALWAYS_VISIBLE_STAGES = 4; // Kurzynek, Pyłek, Ścierek, Mopik – reszta to tajemnica

function creatureHalves() { return Math.max(0, 2 * S.avatarLevel - (S.avatarHalf ? 1 : 0)); } // = zapas zamrożeń w dniach
function shownLevel() { return S.avatarLevel; }
function isHalf() { return !!S.avatarHalf; }
function myCreature() { return creatureSVG(shownLevel(), isHalf()); }
function loseHalf() {
  if (S.avatarHalf) { S.avatarLevel--; S.avatarHalf = false; } // druga połówka – poziom przepada
  else S.avatarHalf = true;
}
function stageKnown(i) { return i < ALWAYS_VISIBLE_STAGES || i <= S.peakLevel; }
// Dni aktywności z rzędu (zamrożone dni się nie liczą).
function activeRun() {
  const act = new Set(S.activeDays);
  let d = now();
  if (!act.has(dayKey(d))) d = addDays(d, -1);
  let n = 0;
  while (act.has(dayKey(d))) { n++; d = addDays(d, -1); }
  return n;
}
function polowek(n) {
  if (n === 1) return "połówkę";
  const d = n % 10, t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? "połówki" : "połówek";
}

let processingMissed = false;
function processMissedDays(done) {
  if (processingMissed) return;
  const todayKey = dayKey();
  const yKey = dayKey(addDays(now(), -1));
  const chain = S.activeDays.concat(S.frozenDays).filter((k) => k < todayKey).sort();
  const last = chain[chain.length - 1];
  if (!last || last >= yKey) return done && done(); // nic nie opuszczono
  if (S.lastProcessed && S.lastProcessed > last) {   // passa przerwała się już wcześniej
    S.lastProcessed = yKey;
    save();
    return done && done();
  }
  processingMissed = true;
  let d = addDays(parseKey(last), 1);
  let frozen = 0;
  const finish = () => {
    processingMissed = false;
    S.lastProcessed = yKey;
    if (S.frozenDays.length > 400) S.frozenDays = S.frozenDays.slice(-400);
    save();
    renderHeader();
    if (frozen) toast(`🧊 Passa zamrożona na ${frozen} ${dni(frozen)}. Stworek stracił ${frozen} ${polowek(frozen)}.`);
    if (done) done();
  };
  const step = () => {
    while (dayKey(d) <= yKey) {
      const k = dayKey(d);
      if (creatureHalves() > 0) {
        loseHalf();
        S.frozenDays.push(k);
        frozen++;
        d = addDays(d, 1);
        continue;
      }
      save();
      return kurzynekLost(k, (paid) => {
        S.avatarLevel = 0;
        S.avatarHalf = false;
        if (paid) {
          S.points -= KURZYNEK_SAVE_COST;
          S.frozenDays.push(k);
          d = addDays(d, 1);
          step();
        } else {
          finish(); // pozostałe dni nie są zamrożone – passa przepada
        }
      });
    }
    finish();
  };
  step();
}

function kurzynekLost(dayK, cb) {
  const streak = streakAt(addDays(parseKey(dayK), -1));
  const can = S.points >= KURZYNEK_SAVE_COST;
  openSheet(`
    <div style="font-size:64px">😱</div>
    <h2>Kurzynek zniknął!</h2>
    <p class="muted" style="font-weight:700">Opuszczony dzień: ${fmtDay(dayK)}. Stworek nie ma już połówek na zamrożenie,
      więc Twoja passa (${streak} ${dni(streak)}) przepadnie.</p>
    <p style="font-weight:700">Uratuj ją za ${KURZYNEK_SAVE_COST} ⭐ – stworek zacznie od nowa, ale passa zostanie.</p>
    <button class="btn yellow" id="pay" ${can ? "" : "disabled"}>${can ? `Zapłać ${KURZYNEK_SAVE_COST} ⭐ i zachowaj passę` : `Brakuje ${KURZYNEK_SAVE_COST - S.points} ⭐`}</button>
    <button class="btn ghost" id="lose">Trudno, tracę passę</button>`,
  (m) => {
    $("#pay", m).onclick = () => { closeSheet(); cb(true); };
    $("#lose", m).onclick = () => { closeSheet(); cb(false); };
  }, { locked: true });
}

function streakLegend() {
  const rows = STREAK_STAGES.filter((s) => s[0] > 0).map(([days, icon, name]) => {
    const secret = days >= 50 && S.bestStreak < days; // 50+ dni: tajemnica, dopóki nie zdobyte
    const reached = S.bestStreak >= days;
    return `<tr class="${reached ? "reached" : ""}">
      <td class="lg-icon">${secret ? "❓" : icon}</td>
      <td>${secret ? "Tajemnica" : name}</td>
      <td>${days} ${dni(days)}</td></tr>`;
  }).join("");
  const z = creatureHalves();
  openSheet(`
    <h2>Etapy passy</h2>
    <table class="legend">${rows}</table>
    <div class="legend-rules">
      <p><b>🧊 Zamrożenie.</b> Opuszczony dzień nie przerywa passy, ale stworek traci połówkę.
        Druga połówka zabiera cały poziom (np. Mopik zmienia się w Ścierka) – utracony poziom trzeba zdobyć od nowa.
        Zamrożony dzień podtrzymuje passę, ale jej nie wydłuża.</p>
      <p><b>❤️ Odzyskiwanie.</b> Za ${HALF_COST} ⭐ odzyskasz tylko bieżącą połówkę. Utracone poziomy kupujesz zwykłą ewolucją.</p>
      <p><b>😱 Kurzynek.</b> Gdy stworek nie ma już połówek, kolejny opuszczony dzień kasuje passę – chyba że zapłacisz ${KURZYNEK_SAVE_COST} ⭐.</p>
      <p>Twój zapas zamrożeń: <b>${z} ${dni(z)}</b></p>
    </div>
    <button class="btn" id="ok">OK</button>`,
  (m) => { $("#ok", m).onclick = closeSheet; });
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
let svgSeq = 0;
// half = true: widać tylko lewą połówkę stworka (prawa wyblakła) – skutek zamrożenia passy.
function creatureSVG(level, half = false) {
  const art = creatureArt(level);
  const label = `Stworek: ${stageName(level)}${half ? " (połówka)" : ""}`;
  if (!half) return `<svg class="creature" viewBox="0 0 120 125" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${art}</svg>`;
  const id = "cq" + ++svgSeq;
  return `<svg class="creature" viewBox="0 0 120 125" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">
    <defs><clipPath id="${id}l"><rect x="-10" y="-10" width="70" height="145"/></clipPath>
      <clipPath id="${id}r"><rect x="60" y="-10" width="70" height="145"/></clipPath></defs>
    <g clip-path="url(#${id}l)">${art}</g>
    <g clip-path="url(#${id}r)" opacity=".15">${art}</g>
    <line x1="60" y1="14" x2="60" y2="124" stroke="#64B5F6" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="92" y="70" font-size="20" text-anchor="middle">🧊</text>
  </svg>`;
}
// Jeden, ten sam zakryty stworek dla każdego niezdobytego poziomu-tajemnicy: szary, bez szczegółów.
function secretCreatureSVG() {
  return `<svg class="creature" viewBox="0 0 120 125" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Nieznany stworek">
    <ellipse cx="42" cy="113" rx="11" ry="7" fill="#C3C9D2"/><ellipse cx="78" cy="113" rx="11" ry="7" fill="#C3C9D2"/>
    <ellipse cx="60" cy="80" rx="38" ry="34" fill="#D3D8DF"/>
  </svg>`;
}
function creatureArt(level) {
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

  return `
    ${back}
    <ellipse cx="60" cy="${cy}" rx="${rx}" ry="${ry}" fill="${body}"/>
    <ellipse cx="60" cy="${cy + ry * 0.35}" rx="${rx * 0.6}" ry="${ry * 0.45}" fill="${belly}"/>
    <circle cx="${60 - ex}" cy="${ey}" r="9" fill="#fff"/><circle cx="${60 + ex}" cy="${ey}" r="9" fill="#fff"/>
    <circle cx="${60 - ex + 1.5}" cy="${ey + 1.5}" r="4.5" fill="#1F2A37"/><circle cx="${60 + ex + 1.5}" cy="${ey + 1.5}" r="4.5" fill="#1F2A37"/>
    <circle cx="${60 - ex + 3}" cy="${ey}" r="1.6" fill="#fff"/><circle cx="${60 + ex + 3}" cy="${ey}" r="1.6" fill="#fff"/>
    <path d="M53 ${ey + 14}Q60 ${ey + 21} 67 ${ey + 14}" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
    ${front}`;
}

/* ============ UI: nagłówek, toast, modal, konfetti ============ */

function renderHeader(bump) {
  $("#hdrPoints").textContent = S.points;
  const streakNow = currentStreak();
  $("#hdrStreak").textContent = streakNow;
  $("#hdrStreakIcon").textContent = streakStage(streakNow).icon;
  $(".avatar-mini").innerHTML = myCreature();
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

// opts.locked: nie da się zamknąć kliknięciem obok (trzeba wybrać przycisk).
function openSheet(html, bind, opts = {}) {
  const m = $("#modal");
  m.innerHTML = `<div class="sheet">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (!opts.locked && e.target === m) closeSheet(); };
  if (bind) bind(m);
}
function closeSheet() { const m = $("#modal"); m.hidden = true; m.innerHTML = ""; }

// Animacja ewolucji: stary stworek drży i błyska, pojawia się nowy, wybuchają fajerwerki.
function evolveAnimation(from, to) {
  const ov = document.createElement("div");
  ov.className = "evolve-overlay";
  ov.innerHTML = `
    <div class="evolve-box">
      <div class="evo-stage">
        <div class="evo-old">${creatureSVG(from)}</div>
        <div class="evo-flash"></div>
        <div class="evo-new">${creatureSVG(to)}</div>
      </div>
      <div class="evo-title">Nowy poziom!</div>
      <div class="evo-name">${stageName(to)}</div>
      <button class="btn yellow evo-ok" id="evoOk">Super!</button>
    </div>`;
  document.body.appendChild(ov);
  const stage = ov.querySelector(".evo-stage");
  [1150, 1450, 1800, 2200].forEach((t) => setTimeout(() => fireworkBurst(stage), t));
  setTimeout(confetti, 1300);
  $("#evoOk", ov).onclick = () => ov.remove();
}
function fireworkBurst(host) {
  if (!host.isConnected) return;
  const colors = ["#FFC93C", "#FF8A3D", "#2BB673", "#3B82F6", "#8B5CF6", "#EF5350", "#FFFFFF"];
  const fw = document.createElement("div");
  fw.className = "firework";
  fw.style.left = 15 + Math.random() * 70 + "%";
  fw.style.top = 10 + Math.random() * 60 + "%";
  const color = rand(colors);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 50 + Math.random() * 30;
    const p = document.createElement("i");
    p.style.setProperty("--dx", Math.cos(a) * r + "px");
    p.style.setProperty("--dy", Math.sin(a) * r + "px");
    p.style.background = i % 3 ? color : rand(colors);
    fw.appendChild(p);
  }
  host.appendChild(fw);
  setTimeout(() => fw.remove(), 1100);
}

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
    cb(URL.createObjectURL(f), f);
  }
});
// cb(url, file) – url do podglądu, file do wysłania do AI
function takePhoto(cb) { photoCb = cb; cam.click(); }

// Zdjęcie „przed” trzymamy tylko w pamięci (nie zapisujemy zdjęć nigdzie na stałe).
const photoMemory = { before: null };

function aiBadge() {
  const txt = !AI.live ? "🧪 Tryb testowy – AI nie jest podłączone"
    : AI.viaProxy ? "🤖 Ocenia Claude" : "🤖 Ocenia Claude (z Twojego konta)";
  return `<p class="hint">${txt}</p>`;
}

/* ---------- INSTALACJA NA TELEFONIE ---------- */
let installEvent = null; // Android/Chrome: systemowe okno instalacji
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  if (GATED) showInstallGate();
  else if (currentScreen === "home" || currentScreen === "settings") go(currentScreen);
});
window.addEventListener("appinstalled", () => {
  installEvent = null;
  if (GATED) showInstallGate(true);
  else toast("📲 Zainstalowano CLEAN QUEST!");
});
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function isMobile() { return isIOS() || /android|mobile/i.test(navigator.userAgent); }
function canOfferInstall() { return !window.claude && !isStandalone(); }

// Gra działa tylko po zainstalowaniu (z ikony na ekranie). W przeglądarce – ekran instalacji.
// Wyjątki: wersja na claude.ai oraz adres z ?przegladarka (do testów).
function browserAllowed() {
  try {
    if (new URLSearchParams(location.search).has("przegladarka")) sessionStorage.setItem("cq-browser", "1");
    return sessionStorage.getItem("cq-browser") === "1";
  } catch (e) {
    return false;
  }
}
const GATED = canOfferInstall() && !browserAllowed();

const SHARE_ICON = `<svg class="ios-share" viewBox="0 0 24 24" aria-label="ikona Udostępnij"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const INSTALL_STEPS = {
  ios: `<ol class="install-steps">
      <li>Otwórz tę stronę w <b>Safari</b>.</li>
      <li>Stuknij <b>☰</b> (trzy kreseczki) na pasku Safari.</li>
      <li>Wybierz <b>Udostępnij</b> ${SHARE_ICON}.</li>
      <li>Stuknij <b>„Więcej opcji”</b>.</li>
      <li>Wybierz <b>„Dodaj do ekranu głównego”</b> i potwierdź <b>Dodaj</b>.</li>
    </ol>
    <p class="hint">Nie widzisz ☰? Stuknij od razu <b>Udostępnij</b> ${SHARE_ICON} na dolnym pasku.</p>`,
  android: `<ol class="install-steps">
      <li>Otwórz tę stronę w <b>Chrome</b>.</li>
      <li>Stuknij <b>⋮</b> w prawym górnym rogu.</li>
      <li>Wybierz <b>„Zainstaluj aplikację”</b>, <b>„Zainstaluj i utwórz skrót”</b> albo <b>„Dodaj do ekranu głównego”</b>
        (zależnie od telefonu).</li>
      <li>Potwierdź: <b>Zainstaluj</b>.</li>
    </ol>
    <p class="hint">Samsung Internet: ☰ → „Dodaj stronę do” → „Ekran startowy”.</p>`,
  desktop: `<ol class="install-steps">
      <li>Otwórz tę stronę w <b>Chrome</b> albo <b>Edge</b>.</li>
      <li>Kliknij ikonę instalacji na końcu paska adresu (monitor ze strzałką) albo menu <b>⋮ → „Zainstaluj CLEAN QUEST”</b>.</li>
      <li>Potwierdź: <b>Zainstaluj</b>.</li>
    </ol>
    <p class="hint">Najwygodniej grać na telefonie – zdjęcia robisz od razu aparatem.</p>`,
};
function defaultOS() { return isIOS() ? "ios" : isMobile() ? "android" : "desktop"; }
function osTabs(active) {
  return `<div class="seg" style="margin:12px 0">
    ${[["ios", "iPhone"], ["android", "Android"], ["desktop", "Komputer"]]
      .map(([k, l]) => `<button data-os="${k}" class="${k === active ? "active" : ""}">${l}</button>`).join("")}
  </div>`;
}
function bindOsTabs(root) {
  root.querySelectorAll("[data-os]").forEach((b) => (b.onclick = () => {
    root.querySelectorAll("[data-os]").forEach((x) => x.classList.toggle("active", x === b));
    $("#steps", root).innerHTML = INSTALL_STEPS[b.dataset.os];
  }));
}

function installGuide() {
  if (installEvent) { // Android/Chrome: od razu systemowe okno „Zainstaluj”
    const ev = installEvent;
    installEvent = null;
    ev.prompt();
    return;
  }
  const os = defaultOS();
  openSheet(`
    <div style="font-size:48px">📲</div>
    <h2>Zainstaluj CLEAN QUEST</h2>
    <p class="muted" style="font-weight:700">Ikona pojawi się na ekranie telefonu, a aplikacja otworzy się jak zwykła apka – bez sklepu.</p>
    ${osTabs(os)}
    <div id="steps">${INSTALL_STEPS[os]}</div>
    <button class="btn" id="ok">Rozumiem</button>`,
  (m) => { bindOsTabs(m); $("#ok", m).onclick = closeSheet; });
}

// Ekran zamiast gry, gdy aplikacja jest otwarta w przeglądarce.
function showInstallGate(installed = false) {
  document.body.classList.add("gated");
  const os = defaultOS();
  app.innerHTML = `
    <div class="gate">
      <div class="gate-hero">${creatureSVG(3)}</div>
      <h1>CLEAN<span>QUEST</span></h1>
      <p class="gate-lead">Sprzątanie jako gra: AI układa misje, Ty zdobywasz punkty, odznaki i rozwijasz stworka.</p>
      ${installed ? `
        <div class="card gate-done">
          <div style="font-size:40px">🎉</div>
          <h2>Zainstalowano!</h2>
          <p style="font-weight:700">Zamknij przeglądarkę i otwórz <b>CLEAN QUEST</b> z ikony na ekranie telefonu.</p>
        </div>` : `
        <div class="card">
          <h2 style="font-size:24px">📲 Najpierw zainstaluj aplikację</h2>
          <p class="muted" style="font-weight:700;margin:6px 0 0">Gra działa po dodaniu jej do ekranu telefonu – za darmo, bez sklepu, w minutę.</p>
          ${installEvent ? `<button class="btn" id="gateInstall" style="margin-top:14px">Zainstaluj</button>
            <p class="hint">albo zrób to ręcznie:</p>` : ""}
          ${osTabs(os)}
          <div id="steps">${INSTALL_STEPS[os]}</div>
          <p class="hint">Po instalacji uruchamiaj CLEAN QUEST z ikony na ekranie.</p>
          <p class="hint">Link otworzył się w Messengerze, Instagramie lub innej aplikacji? Wybierz w jej menu
            „Otwórz w przeglądarce” (Safari na iPhonie, Chrome na Androidzie).</p>
        </div>`}
    </div>`;
  bindOsTabs(app);
  if ($("#gateInstall")) $("#gateInstall").onclick = () => {
    const ev = installEvent;
    installEvent = null;
    if (ev) ev.prompt();
  };
}

/* ============ ROUTER ============ */

const FLOW_SCREENS = new Set(["room", "mission", "verify", "missionResult", "summary", "clean"]);
let tick = null;
let currentScreen = "home";
let screenToken = 0; // rośnie przy każdej zmianie ekranu – spóźniona odpowiedź AI nie nadpisze nowego ekranu

function go(screen, params = {}) {
  clearInterval(tick);
  tick = null;
  currentScreen = screen;
  screenToken++;
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
  const today = now();
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const names = ["P", "W", "Ś", "C", "P", "S", "N"];
  const week = names.map((n, i) => {
    const d = addDays(monday, i);
    const on = S.activeDays.includes(dayKey(d));
    const frozen = !on && S.frozenDays.includes(dayKey(d));
    const isToday = dayKey(d) === dayKey(today);
    return `<div class="${on ? "on" : ""} ${frozen ? "frozen" : ""} ${isToday ? "today" : ""}"><i>${on ? streakStage(streakAt(d)).icon : frozen ? "🧊" : ""}</i>${n}</div>`;
  }).join("");
  const reserve = creatureHalves();
  const streak = currentStreak();
  const st = streakStage(streak);
  const cleanToday = S.cleanBonus[dayKey()] || [];

  app.innerHTML = `
    <div class="card hero">
      ${myCreature()}
      <div style="flex:1">
        <div class="label">${stageName(shownLevel())} · poziom ${shownLevel()}${isHalf() ? " · połówka 🧊" : ""}</div>
        <h1>Cześć, ${esc(S.name)}!</h1>
        <div class="muted" style="font-weight:700;margin-top:4px">Odznaki: ${owned}/333 · do ewolucji ${Math.max(0, nextNeed - owned)}</div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
    </div>

    <div class="card">
      <div class="streak-head">
        <div class="streak-plant">${st.icon}</div>
        <div style="flex:1">
          <h2>${streak} ${dni(streak)} passy</h2>
          <div class="label">${st.name} · rekord: ${S.bestStreak}</div>
        </div>
        <button class="info-btn" id="streakInfo" aria-label="Legenda passy">i</button>
      </div>
      ${st.next ? `<div class="hint" style="text-align:left;margin-top:8px">Jeszcze ${st.next.days - streak} ${dni(st.next.days - streak)} do: ${st.next.icon} ${st.next.name}</div>` : ""}
      <div class="week">${week}</div>
      <div class="hint" style="text-align:left;margin-top:10px">🧊 Zapas zamrożeń: ${reserve} ${dni(reserve)}${reserve === 0 ? " – opuszczony dzień skasuje passę!" : ""}</div>
      ${activeToday() ? "" : `<div class="hint" style="margin-top:8px">Ukończ dziś misję albo skan czystości, żeby podlać swoją roślinkę 💧</div>`}
    </div>

    <button class="card bonus-card" id="cleanBtn" style="width:100%;text-align:left">
      <span class="big">📸</span>
      <span><h3>Skan czystości</h3><span class="muted" style="font-weight:700">Pokaż AI posprzątane pomieszczenie</span></span>
      <span class="plus">+${CLEAN_BONUS}</span>
    </button>

    ${canOfferInstall() && !S.installHidden ? `
    <div class="card install-card">
      <span class="big">📲</span>
      <span style="flex:1;min-width:0"><h3>Zainstaluj na telefonie</h3><span class="muted" style="font-weight:700">Ikona na ekranie, działa jak apka</span></span>
      <button class="btn small" id="installBtn">${installEvent ? "Zainstaluj" : "Jak?"}</button>
    </div>
    <button class="linkbtn" id="installHide" style="margin:-6px auto 6px">nie pokazuj tego</button>` : ""}

    <h2 class="section-title">Co dzisiaj sprzątamy?</h2>
    <div class="rooms">
      ${Object.entries(ROOMS).map(([k, r]) => `
        <button class="room ${cleanToday.includes(k) ? "done" : ""}" data-room="${k}">
          <span class="emoji">${r.emoji}</span><b>${r.name}</b>
          <small>${cleanToday.includes(k) ? "✓ czysto dziś" : "Skanuj bałagan"}</small>
        </button>`).join("")}
    </div>`;

  $("#cleanBtn").onclick = () => go("clean");
  $("#streakInfo").onclick = streakLegend;
  if ($("#installBtn")) $("#installBtn").onclick = installGuide;
  if ($("#installHide")) $("#installHide").onclick = () => { S.installHidden = true; save(); go("home"); };
  app.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => go("room", { room: b.dataset.room })));
};

/* ---------- SKAN BAŁAGANU → MISJE ---------- */
function pickMissions(roomKey) {
  const list = ROOMS[roomKey][S.mode];
  const want = S.mode === "kid" ? 3 + Math.round(Math.random()) : 4 + Math.floor(Math.random() * 3);
  // pierwsza misja (najważniejsza) zawsze, reszta losowo – ale w ustalonej kolejności
  const rest = list.slice(1).map((m, i) => ({ m, i, r: Math.random() })).sort((a, b) => a.r - b.r)
    .slice(0, Math.min(want, list.length) - 1).sort((a, b) => a.i - b.i).map((x) => x.m);
  return [list[0], ...rest].map(missionOf);
}

SCREENS.room = ({ room }) => {
  const r = ROOMS[room];
  const my = screenToken;
  const head = (t, label = "Skanowanie") => `<div class="label">${label} · ${r.name}</div><h1 style="font-size:30px;margin:4px 0 14px">${t}</h1>`;
  // shots: [{url, file}] – 1–3 zdjęcia pomieszczenia z różnych stron
  const pics = (shots, cls = "") => shots.length
    ? `<div class="shots ${cls}">${shots.map((s) => `<div class="photo ${cls}">${s.url ? `<img src="${s.url}" alt="Zdjęcie pomieszczenia">` : r.emoji}</div>`).join("")}</div>`
    : `<div class="photo">${r.emoji}</div>`;
  const MAX_SHOTS = 3;
  let shots = [];

  const intro = () => {
    const n = shots.length;
    app.innerHTML = `${head("Pokaż mi bałagan!")}
      ${pics(shots)}
      <p class="muted" style="font-weight:700">Zrób 1–3 zdjęcia z różnych stron, żeby AI widziało całe pomieszczenie. Potem zatwierdź – AI ułoży misje po kolei.</p>
      ${aiBadge()}
      ${n < MAX_SHOTS ? `<button class="btn ${n ? "ghost" : ""}" id="shot">📷 ${n ? `Dodaj zdjęcie (${n}/${MAX_SHOTS})` : "Zrób zdjęcie"}</button>` : ""}
      ${n ? `<button class="btn" id="go">✓ Zatwierdź ${n} ${n === 1 ? "zdjęcie" : "zdjęcia"}</button>
             <button class="linkbtn" id="undo">usuń ostatnie zdjęcie</button>` : ""}
      ${AI.live || n ? "" : `<button class="linkbtn" id="skip">pomiń zdjęcie (test)</button>`}
      <button class="linkbtn" id="back">← wróć</button>`;
    if ($("#shot")) $("#shot").onclick = () => takePhoto((url, file) => { shots.push({ url, file }); intro(); });
    if ($("#go")) $("#go").onclick = () => analyze();
    if ($("#undo")) $("#undo").onclick = () => { shots.pop(); intro(); };
    if ($("#skip")) $("#skip").onclick = () => analyze();
    $("#back").onclick = () => go("home");
  };

  const analyze = async () => {
    photoMemory.before = shots.map((s) => s.file).filter(Boolean);
    app.innerHTML = `${head("Analizuję…")}
      ${pics(shots, "scanning")}
      <div class="ai-status"><span class="ai-chip">AI</span>Szukam rzeczy do posprzątania…</div>`;
    if (!AI.live || !photoMemory.before.length) {
      setTimeout(() => { if (screenToken === my) showMissions(pickMissions(room), ""); }, 1800);
      return;
    }
    try {
      const res = await AI.analyzeRoom({ roomName: r.name, mode: S.mode, photos: photoMemory.before, notes: roomNotes(room) });
      if (screenToken !== my) return;
      if (!res.valid) return problem(`Te zdjęcia nie wyglądają na: ${r.name}. ${res.comment}`);
      if (!res.missions.length) return alreadyClean(res.comment);
      showMissions(res.missions.map(missionOf), res.comment);
    } catch (e) {
      if (screenToken === my) problem(AI.errorText(e));
    }
  };

  const problem = (msg) => {
    app.innerHTML = `${head("Hmm…")}
      ${pics(shots)}
      <div class="alert" style="margin-top:14px">${esc(msg)}</div>
      ${AI.live && shots.length ? `<button class="btn" id="retry">↻ Spróbuj ponownie</button>` : ""}
      <button class="btn ghost" id="again">📷 Zrób zdjęcia od nowa</button>
      <button class="linkbtn" id="fallback">użyj gotowych misji</button>
      <button class="linkbtn" id="back">← wróć</button>`;
    if ($("#retry")) $("#retry").onclick = analyze;
    $("#again").onclick = () => { shots = []; intro(); };
    $("#fallback").onclick = () => showMissions(pickMissions(room), "");
    $("#back").onclick = () => go("home");
  };

  const alreadyClean = (comment) => {
    const claimed = (S.cleanBonus[dayKey()] || []).includes(room);
    const first = shots[0] || {};
    app.innerHTML = `${head("Tu jest czysto! ✨")}
      ${pics(shots)}
      <p style="font-weight:700">${esc(comment || "AI nie widzi tu nic do sprzątania.")}</p>
      ${claimed
        ? `<p class="hint">Bonus za to pomieszczenie został już dziś odebrany.</p>`
        : `<button class="btn yellow" id="bonus">📸 Odbierz bonus +${CLEAN_BONUS} pkt</button>`}
      <button class="linkbtn" id="back">← wróć</button>`;
    if ($("#bonus")) $("#bonus").onclick = () => go("clean", { room, url: first.url, file: first.file });
    $("#back").onclick = () => go("home");
  };

  const showMissions = (missions, comment) => {
    app.innerHTML = `${head(`${missions.length} misji do zrobienia`, "Plan sprzątania")}
      ${shots.length ? `<div class="shots small">${shots.map((s) => `<div class="photo"><img src="${s.url}" alt=""></div>`).join("")}</div>` : ""}
      ${comment ? `<p style="font-weight:700"><span class="ai-chip">AI</span>${esc(comment)}</p>` : ""}
      <div class="card"><ol class="mission-list">${missions.map((m) => `<li><span>${esc(m.text)}
        <br><small class="muted">${catIcon(m.cat)} ${esc(BADGE_CATEGORIES[m.cat].label)}${m.checks.length > 1
          ? ` · 📷 ${m.checks.map((c) => esc(checkLabel(c))).join(" · ")}` : ""}</small></span></li>`).join("")}</ol></div>
      <p class="hint">Każda misja ma stoper. Im szybciej (i porządniej), tym więcej punktów – do 9 za misję.
        Punkty trafiają też do kategorii misji – za nie kupisz pasujące odznaki.<br>
        Po zatwierdzeniu masz ${READY_MS / 1000} s, potem stoper ruszy sam.</p>
      <button class="btn" id="startAll">Zatwierdzam – zaczynamy!</button>
      <button class="linkbtn" id="back">← wróć</button>`;
    $("#startAll").onclick = () => {
      S.session = { room, missions, idx: 0, acc: 0, startedAt: null, earned: 0, results: [], failMsg: "", readyAt: Date.now() };
      save();
      go("mission");
    };
    $("#back").onclick = () => go("home");
  };
  intro();
};

/* ---------- MISJA ZE STOPEREM ---------- */
// Po zatrzymaniu stopera jest tyle czasu na dostarczenie zdjęcia. Potem stoper rusza sam
// i liczy też te sekundy – zatrzymanie stopera nie daje darmowego czasu.
const PHOTO_WINDOW_MS = 24000;
// Po zatwierdzeniu misji (i po każdej zaliczonej) jest tyle czasu, zanim stoper ruszy sam.
const READY_MS = 20000;

function elapsed(ses) { return ses.acc + (ses.startedAt ? Date.now() - ses.startedAt : 0); }
function photoTimeLeft(ses) { return ses.stoppedAt ? PHOTO_WINDOW_MS - (Date.now() - ses.stoppedAt) : 0; }
function readyTimeLeft(ses) { return ses.readyAt ? READY_MS - (Date.now() - ses.readyAt) : 0; }

function autoStart(ses) {
  ses.startedAt = ses.readyAt + READY_MS; // stoper liczy od końca 20 s, nawet jeśli strona była zamknięta
  ses.readyAt = null;
  ses.failMsg = "";
  save();
  go("mission");
}

function autoResume(ses) {
  ses.startedAt = ses.stoppedAt || Date.now(); // czas od zatrzymania też się liczy
  ses.stoppedAt = null;
  ses.okMsg = "";
  ses.failMsg = `Minęło ${PHOTO_WINDOW_MS / 1000} s bez zdjęcia – stoper liczy dalej (razem z tym czasem).`;
  save();
  go("mission");
}

// Zdjęcie przyjmujemy tylko, jeśli przyszło w oknie czasowym.
function acceptPhoto(next) {
  const ses = S.session;
  if (!ses || ses.startedAt || !ses.stoppedAt) {
    toast(`Za późno – zdjęcie trzeba zrobić w ${PHOTO_WINDOW_MS / 1000} s od zatrzymania stopera`);
    return;
  }
  if (photoTimeLeft(ses) < -500) return autoResume(ses); // pół sekundy tolerancji
  ses.stoppedAt = null;
  save();
  next();
}

SCREENS.mission = () => {
  const ses = S.session;
  if (!ses) return go("home");
  if (ses.idx >= ses.missions.length) return go("summary");
  const r = ROOMS[ses.room];
  const running = !!ses.startedAt;
  const started = running || ses.acc > 0;
  const steps = ses.missions.map((_, i) => `<i class="${i < ses.idx ? "done" : i === ses.idx ? "now" : ""}"></i>`).join("");
  if (started && !running) {
    if (!ses.stoppedAt) { ses.stoppedAt = Date.now(); save(); } // np. po odświeżeniu strony – nowe okno
    if (photoTimeLeft(ses) <= 0) return autoResume(ses);
  }
  if (!started) {
    if (!ses.readyAt) { ses.readyAt = Date.now(); save(); }
    if (readyTimeLeft(ses) <= 0) return autoStart(ses);
  }
  const mission = ses.missions[ses.idx];
  const checksDone = ses.checksDone || mission.checks.map(() => false);
  const multi = mission.checks.length > 1;
  const nextCheck = mission.checks.find((_, i) => !checksDone[i]);
  const someDone = checksDone.some(Boolean);

  app.innerHTML = `
    <div class="mission-head">
      <span class="label">${r.name} · Misja ${ses.idx + 1}/${ses.missions.length}</span>
      <span class="label">⭐ ${ses.earned} pkt</span>
    </div>
    <div class="steps">${steps}</div>
    ${ses.failMsg ? `<div class="alert">🔍 ${esc(ses.failMsg)}</div>` : ""}
    ${ses.okMsg ? `<div class="alert ok">✓ ${esc(ses.okMsg)}</div>` : ""}
    <h1 class="task">${esc(mission.text)}</h1>
    ${multi ? `<div class="checks">
      ${mission.checks.map((c, i) => `<div class="chk ${checksDone[i] ? "done" : ""}"><i>${checksDone[i] ? "✓" : "📷"}</i>${esc(checkLabel(c))}</div>`).join("")}
    </div>
    <p class="hint" style="margin-top:-6px">Każde miejsce możesz sfotografować osobno.</p>` : ""}
    <div class="timer ${running ? "" : "paused"}">
      <div class="label" style="color:#CBD5E1">Twój czas</div>
      <div class="t" id="t">00:00</div>
      <div class="now-pts" id="nowPts"></div>
      <div class="next-pts" id="nextPts"></div>
      ${started && !running ? `<div class="photo-countdown" id="cd"></div>` : ""}
      ${!started ? `<div class="photo-countdown ready" id="rd"></div>` : ""}
    </div>
    ${!started
      ? `<button class="btn" id="start">▶ Start teraz</button>`
      : running
        ? `<button class="btn red" id="stop">⏹ Zatrzymaj stoper</button>`
        : `<button class="btn ghost" id="resume">▶ Wznów stoper</button>`}
    <button class="btn yellow ${started && !running ? "glow" : ""}" id="check" ${started && !running ? "" : "disabled"}>📷 Sprawdź${multi && someDone && nextCheck ? `: ${esc(checkLabel(nextCheck))}` : ""}</button>
    ${started && !running
      ? (AI.live ? "" : `<button class="linkbtn" id="checkNoPhoto">sprawdź bez zdjęcia (test)</button>`)
      : `<p class="hint">Przycisk SPRAWDŹ aktywuje się po zatrzymaniu stopera.</p>`}
    <button class="linkbtn" id="abort">Przerwij sprzątanie</button>`;

  const update = () => {
    const ms = elapsed(ses);
    const sec = ms / 1000;
    $("#t").textContent = fmtTime(ms);
    const p = pointsFor(sec);
    $("#nowPts").textContent = p > 0 ? `Teraz: ${p} pkt` : "0 pkt – ale dokończ, porządek się liczy!";
    const nd = nextDrop(sec);
    $("#nextPts").textContent = nd ? `za ${fmtTime(nd.in * 1000)} spadnie do ${nd.pts} pkt` : "";
    const cd = $("#cd");
    if (cd) {
      const left = photoTimeLeft(ses);
      if (left <= 0) return autoResume(ses);
      const s = Math.ceil(left / 1000);
      cd.textContent = `📷 Zrób zdjęcie: ${s} s`;
      cd.classList.toggle("urgent", s <= 3);
    }
    const rd = $("#rd");
    if (rd) {
      const left = readyTimeLeft(ses);
      if (left <= 0) return autoStart(ses);
      const s = Math.ceil(left / 1000);
      rd.textContent = `⏳ Stoper ruszy za ${s} s`;
      rd.classList.toggle("urgent", s <= 3);
    }
  };
  update();
  tick = setInterval(update, 250);

  const start = () => { ses.startedAt = Date.now(); ses.stoppedAt = null; ses.readyAt = null; ses.failMsg = ""; ses.okMsg = ""; save(); go("mission"); };
  if ($("#start")) $("#start").onclick = start;
  if ($("#resume")) $("#resume").onclick = start;
  if ($("#stop")) $("#stop").onclick = () => {
    ses.acc = elapsed(ses);
    ses.startedAt = null;
    ses.stoppedAt = Date.now(); // rusza okno na zdjęcie
    save();
    go("mission");
  };
  $("#check").onclick = () => takePhoto((url, file) => acceptPhoto(() => go("verify", { url, file })));
  if ($("#checkNoPhoto")) $("#checkNoPhoto").onclick = () => acceptPhoto(() => go("verify", { url: null, file: null }));
  $("#abort").onclick = () => openSheet(`
      <h2>Przerwać sprzątanie?</h2>
      <p class="muted" style="font-weight:700">Punkty z ukończonych misji zostają (${ses.earned} pkt).</p>
      <div class="row"><button class="btn ghost" id="no">Nie</button><button class="btn red" id="yes">Przerwij</button></div>`,
    (m) => {
      $("#no", m).onclick = closeSheet;
      $("#yes", m).onclick = () => { S.session = null; save(); closeSheet(); go("home"); };
    });
};

/* ---------- WERYFIKACJA ZDJĘCIA ---------- */
// aiCheck: async () => ({passed, message, done?}). Bez AI (lub po błędzie AI) – decyzja ręczna.
// checks: [{i, label}] – niezaliczone punkty misji; przy kilku można je zatwierdzać ręcznie pojedynczo.
// onPass(message, done) – done: lista zaliczonych punktów albo null (= wszystkie).
// Po odrzuceniu przez AI gracz może dodać komentarz (np. "to stałe miejsce miotły") i sprawdzić ponownie.
// onFail(message, failAt) – failAt: kiedy AI pierwszy raz odrzuciło (czas od tej chwili się liczy).
function verifyUI({ url, file, title, room, checks, aiCheck, onPass, onFail, failLabel = "🧹 Sprzątam dalej" }) {
  let failAt = null;
  const kid = S.mode === "kid";
  const my = screenToken;
  app.innerHTML = `
    <div class="label">Weryfikacja</div>
    <h1 style="font-size:30px;margin:4px 0 14px">${esc(title)}</h1>
    <div class="photo scanning" id="ph">${url ? `<img src="${url}" alt="Zdjęcie kontrolne">` : "🔍"}</div>
    <div class="ai-status" id="st"><span class="ai-chip">AI</span>Sprawdzam, czy jest posprzątane…</div>
    <div id="panel"></div>`;

  const manual = (errorMsg) => {
    $("#ph").classList.remove("scanning");
    $("#st").innerHTML = errorMsg ? "" : `<span class="ai-chip">AI</span>Gotowe.`;
    $("#panel").innerHTML = `
      ${errorMsg ? `<div class="alert">${esc(errorMsg)}</div>` : ""}
      ${AI.live && file ? `<button class="btn" id="retry">↻ Spróbuj ponownie</button>` : ""}
      <div class="card test-panel" style="margin-top:16px">
        <div class="label">${AI.live ? "Decyzja ręczna" : "Tryb testowy"}</div>
        <p style="font-weight:700;margin:6px 0 14px">${AI.live
          ? (kid ? "Rodzic może zatwierdzić ręcznie:" : "Albo zdecyduj ręcznie:")
          : `Prawdziwe AI działa w wersji na claude.ai. ${kid ? "Rodzic decyduje" : "Wybierz"}, jaki ma być wynik:`}</p>
        ${checks && checks.length > 1
          ? `<div class="checks">${checks.map((c) => `<button class="chk" data-ci="${c.i}"><i>✓</i>${esc(c.label)}</button>`).join("")}</div>`
          : ""}
        <div class="row"><button class="btn red" id="fail">✗ Niezaliczone</button><button class="btn" id="pass">✓ ${checks && checks.length > 1 ? "Wszystko" : "Zaliczone"}</button></div>
      </div>`;
    $("#pass").onclick = () => onPass("", null);
    $("#fail").onclick = () => onFail("");
    $("#panel").querySelectorAll("[data-ci]").forEach((b) => (b.onclick = () => onPass("", [+b.dataset.ci])));
    if ($("#retry")) $("#retry").onclick = () => run();
  };

  const showFail = (msg) => {
    if (!failAt) failAt = Date.now();
    $("#ph").classList.remove("scanning");
    $("#st").innerHTML = "";
    $("#panel").innerHTML = `
      <div class="alert">🔍 ${esc(msg || "AI nie widzi tu jeszcze porządku.")}</div>
      <div class="card comment-card">
        <div class="label">💬 Coś tu ma swoje stałe miejsce?</div>
        <p class="hint" style="text-align:left;margin:6px 0 8px">Napisz to – AI oceni zdjęcie jeszcze raz, bardzo wyrozumiale,
          i zapamięta uwagę na przyszłość.</p>
        <textarea id="cmt" class="input" rows="3" maxlength="200"
          placeholder="Np. To jest stałe miejsce na miotłę, więc powinno być zaliczone."></textarea>
        <button class="btn" id="recheck" style="margin-top:12px">Sprawdź ponownie z komentarzem</button>
      </div>
      <button class="btn red" id="giveup">${failLabel}</button>`;
    $("#recheck").onclick = () => {
      const c = $("#cmt").value.trim();
      if (!c) { toast("Napisz najpierw komentarz"); return; }
      if (room) addRoomNote(room, c);
      run(c);
    };
    $("#giveup").onclick = () => onFail(msg, failAt);
  };

  const run = async (comment = "") => {
    if (!AI.live || !file || !aiCheck) {
      setTimeout(() => { if (screenToken === my) manual(""); }, 1500);
      return;
    }
    $("#ph").classList.add("scanning");
    $("#panel").innerHTML = "";
    $("#st").innerHTML = `<span class="ai-chip">AI</span>${comment ? "Sprawdzam jeszcze raz, z Twoim komentarzem…" : "Sprawdzam, czy jest posprzątane…"}`;
    try {
      const res = await aiCheck(comment);
      if (screenToken !== my) return;
      if (res.passed) onPass(res.message, res.done || null); else showFail(res.message);
    } catch (e) {
      if (screenToken === my) manual(AI.errorText(e));
    }
  };
  run();
}

SCREENS.verify = ({ url, file }) => {
  const ses = S.session;
  if (!ses) return go("home");
  const mission = ses.missions[ses.idx];
  if (!ses.checksDone || ses.checksDone.length !== mission.checks.length) ses.checksDone = mission.checks.map(() => false);
  const pending = mission.checks.map((_, i) => i).filter((i) => !ses.checksDone[i]);
  verifyUI({
    url,
    file,
    title: mission.text,
    room: ses.room,
    failLabel: "🧹 Sprzątam dalej (stoper rusza)",
    checks: pending.map((i) => ({ i, label: checkLabel(mission.checks[i]) })),
    aiCheck: async (comment) => {
      const r = await AI.verifyMission({
        roomName: ROOMS[ses.room].name, mode: S.mode, mission, pending, before: photoMemory.before, after: file,
        comment, notes: roomNotes(ses.room),
      });
      return { passed: r.done.length > 0, done: r.done, message: r.message };
    },
    onPass: (msg, done) => {
      (done || pending).forEach((i) => (ses.checksDone[i] = true));
      if (!ses.checksDone.every(Boolean)) {
        // część zaliczona – stoper dalej stoi, od razu można zrobić zdjęcie kolejnego miejsca
        const left = mission.checks.filter((_, i) => !ses.checksDone[i]).map(checkLabel);
        ses.okMsg = msg || `Zaliczone! Zostało: ${left.join(", ")}`;
        ses.failMsg = "";
        ses.stoppedAt = Date.now(); // nowe okno na zdjęcie kolejnego miejsca
        save();
        return go("mission");
      }
      ses.checksDone = null;
      ses.okMsg = "";
      const ms = ses.acc;
      const pts = pointsFor(ms / 1000);
      ses.results.push({ mission: mission.text, ms, pts });
      ses.earned += pts;
      S.missionsDone++;
      ses.idx++;
      ses.acc = 0;
      ses.startedAt = null;
      ses.failMsg = "";
      ses.readyAt = Date.now(); // 20 s do startu stopera następnej misji
      addCatPoints(mission.cat, pts);
      addPoints(pts);
      markActive();
      save();
      go("missionResult", { pts, ms, msg, cat: mission.cat });
    },
    onFail: (msg, failAt) => {
      ses.failMsg = msg || rand(FAIL_MSG[S.mode]);
      ses.okMsg = "";
      // stoper rusza dalej – liczy też czas spędzony na ekranie odrzucenia
      ses.startedAt = failAt || Date.now();
      save();
      go("mission");
    },
  });
};

SCREENS.missionResult = ({ pts, ms, msg, cat }) => {
  const ses = S.session;
  if (!ses) return go("home");
  const last = ses.idx >= ses.missions.length;
  app.innerHTML = `
    <div class="result">
      <div class="icon">${pts >= 6 ? "🚀" : pts >= 2 ? "🎉" : "👍"}</div>
      <h1>Zaliczone!</h1>
      <div class="gain">+${pts} pkt</div>
      ${cat && pts ? `<p style="font-weight:800">+${pts} ${catIcon(cat)} ${esc(BADGE_CATEGORIES[cat].label)} <span class="muted">(na odznaki)</span></p>` : ""}
      ${last ? "" : `<p class="hint">Następna misja: stoper ruszy sam ${READY_MS / 1000} s od zaliczenia.</p>`}
      <p class="muted" style="font-weight:800">Czas: ${fmtTime(ms)}</p>
      ${msg ? `<p style="font-weight:700"><span class="ai-chip">AI</span>${esc(msg)}</p>` : ""}
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
      <p class="muted" style="font-weight:800">Łączny czas: ${fmtTime(total)} · ${streakStage(currentStreak()).icon} passa: ${currentStreak()}</p>
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
        ${aiBadge()}
        <button class="btn" id="shot">📷 Zrób zdjęcie</button>
        ${AI.live ? "" : `<button class="linkbtn" id="skip">pomiń zdjęcie (test)</button>`}`,
      (m) => {
        $("#shot", m).onclick = () => { closeSheet(); takePhoto((url, file) => go("clean", { room: k, url, file })); };
        if ($("#skip", m)) $("#skip", m).onclick = () => { closeSheet(); go("clean", { room: k, url: null, file: null }); };
      });
    }));
    $("#back").onclick = () => go("home");
  }
}
SCREENS.clean = (params = {}) => {
  if (!params.room) return cleanPicker();
  const { room, url, file } = params;
  const r = ROOMS[room];
  if ((S.cleanBonus[dayKey()] || []).includes(room)) {
    toast("Bonus za to pomieszczenie już dziś odebrany");
    return go("home");
  }
  let hash = null;
  verifyUI({
    url,
    file,
    title: `${r.name} – skan czystości`,
    room,
    failLabel: "Zakończ skan",
    aiCheck: async (comment) => {
      hash = await photoHash(file);
      if (hash && S.photoHashes.includes(hash)) {
        return { passed: false, message: "To zdjęcie było już użyte. Zrób nowe." };
      }
      return AI.verifyClean({ roomName: r.name, mode: S.mode, photo: file, comment, notes: roomNotes(room) });
    },
    onPass: (msg) => {
      const k = dayKey();
      if (hash) S.photoHashes = [...S.photoHashes, hash].slice(-60);
      S.cleanBonus = { [k]: [...(S.cleanBonus[k] || []), room] }; // trzymamy tylko dzisiejszy dzień
      addCatPoints("blask", CLEAN_BONUS);
      addPoints(CLEAN_BONUS);
      markActive();
      save();
      app.innerHTML = `
        <div class="result">
          <div class="icon">✨</div>
          <h1>Czysto!</h1>
          <div class="gain">+${CLEAN_BONUS} pkt</div>
          <p class="muted" style="font-weight:800">Bonus za utrzymanie porządku: ${r.name}</p>
          <p style="font-weight:800">+${CLEAN_BONUS} ✨ Blask <span class="muted">(na odznaki specjalne)</span></p>
          ${msg ? `<p style="font-weight:700"><span class="ai-chip">AI</span>${esc(msg)}</p>` : ""}
        </div>
        <button class="btn" id="home">Super!</button>`;
      confetti();
      $("#home").onclick = () => go("home");
    },
    onFail: (msg) => {
      app.innerHTML = `
        <div class="result">
          <div class="icon">🧐</div>
          <h1>Jeszcze nie</h1>
          <p class="muted" style="font-weight:800">${esc(msg || "AI widzi tu jeszcze trochę bałaganu.")} Może zrobimy z tego misje?</p>
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
      <span>${b.emoji}</span><span class="tier">${b.tier}</span>${has ? "" : `<span class="price">${b.price}${catIcon(b.cat)}</span>`}
    </button>`;
  };
  let body;
  if (badgeFilter === "all") {
    // pogrupowane według kategorii – każda ma własne punkty
    body = Object.entries(BADGE_CATEGORIES).map(([cat, c]) => `
      <div class="cat-head"><h2>${c.icon} ${c.label}</h2><span class="cat-wallet">${catPts(cat)} ${c.icon}</span></div>
      <p class="hint" style="text-align:left;margin:0 0 4px">${cat === "blask" ? "Punkty za skan czystości (utrzymanie porządku)." : `Punkty za misje: ${esc(c.ai.split(": ")[1] || "")}.`}</p>
      ${c.sets.map((name) => {
        const s = BADGE_SETS.findIndex(([n]) => n === name);
        const items = BADGES.filter((b) => b.set === s);
        const cnt = items.filter((b) => owned.has(b.id)).length;
        return `<div class="set-title"><h3>${items[0].emoji} ${name}</h3><span class="label">${cnt}/9</span></div>
          <div class="badge-grid">${items.map(badgeHTML).join("")}</div>`;
      }).join("")}`).join("");
  } else {
    const list = BADGES.filter((b) => (badgeFilter === "owned" ? owned.has(b.id) : b.rarity === badgeFilter));
    body = list.length ? `<div class="badge-grid" style="margin-top:12px">${list.map(badgeHTML).join("")}</div>`
      : `<p class="hint">Jeszcze nic tu nie ma. Zdobywaj punkty i kupuj odznaki!</p>`;
  }
  app.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><div class="label">Twoja kolekcja</div><h1 style="font-size:34px">${S.badges.length}/333</h1></div>
        <div class="label" style="text-align:right">Punkty na odznaki</div>
      </div>
      <div class="wallets">${Object.entries(BADGE_CATEGORIES).map(([cat, c]) =>
        `<span class="wallet" title="${esc(c.label)}">${c.icon} <b>${catPts(cat)}</b></span>`).join("")}</div>
    </div>
    <div class="filters">${filters.map(([k, l]) => `<button data-f="${k}" class="${badgeFilter === k ? "active" : ""}">${l}</button>`).join("")}</div>
    ${body}`;
  app.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { badgeFilter = b.dataset.f; SCREENS.badges(); }));
  app.querySelectorAll("[data-badge]").forEach((el) => (el.onclick = () => badgeSheet(BADGES[+el.dataset.badge])));
};

function badgeSheet(b) {
  const has = S.badges.includes(b.id);
  const c = BADGE_CATEGORIES[b.cat];
  const missing = b.price - catPts(b.cat);
  openSheet(`
    <div class="badge ${b.rarity}"><span>${b.emoji}</span></div>
    <span class="rarity-tag ${b.rarity}">${RARITY_LABEL[b.rarity]}</span>
    <h2 style="margin-top:8px">${esc(b.name)}</h2>
    <p class="muted" style="font-weight:700">Kolekcja „${esc(b.setName)}” · poziom ${b.tier}/9<br>
      Kupujesz punktami: ${c.icon} ${esc(c.label)} (masz ${catPts(b.cat)})</p>
    ${has ? `<button class="btn ghost" id="close">✓ Masz już tę odznakę</button>`
      : missing > 0 ? `<button class="btn" disabled>Brakuje ${missing} ${c.icon}</button>
          <p class="hint">${b.cat === "blask" ? "Zdobywasz je skanem czystości." : `Zdobywasz je misjami z kategorii ${esc(c.label)}.`}</p>
          <button class="linkbtn" id="close">zamknij</button>`
        : `<button class="btn yellow" id="buy">Kup za ${b.price} ${c.icon}</button><button class="linkbtn" id="close">zamknij</button>`}`,
  (m) => {
    if ($("#close", m)) $("#close", m).onclick = closeSheet;
    if ($("#buy", m)) $("#buy", m).onclick = () => {
      addCatPoints(b.cat, -b.price);
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
  const reserve = creatureHalves();
  const need = BADGES_PER_EVOLVE * (L + 1);
  const run = activeRun();
  const okBadges = S.badges.length >= need;
  const okPts = S.points >= EVOLVE_COST;
  const okRun = run >= STREAK_FOR_EVOLVE;
  const okWhole = !S.avatarHalf;
  const canEvolve = okBadges && okPts && okRun && okWhole;
  const lostLevels = S.peakLevel > L ? STAGES.slice(L + 1, S.peakLevel + 1) : [];
  const req = (ok, text) => `<div class="req"><span class="${ok ? "ok" : "no"}">${ok ? "✓" : "✗"}</span> ${text}</div>`;
  app.innerHTML = `
    <div class="card creature-stage">
      ${myCreature()}
      <div class="label">Poziom ${L}${isHalf() ? " · połówka" : ""}</div>
      <h1>${stageName(L)}</h1>
      <p class="hint">🧊 Zapas zamrożeń passy: ${reserve} ${dni(reserve)}</p>
    </div>
    ${S.avatarHalf || lostLevels.length ? `
    <div class="card frozen-card">
      <div class="label">Stworek nadgryziony przez mróz</div>
      ${S.avatarHalf ? `<p style="font-weight:700;margin:6px 0 12px">${stageName(L)} stracił połówkę. Możesz ją odzyskać raz za ${HALF_COST} ⭐.</p>
        <button class="btn yellow" id="heal" ${S.points >= HALF_COST ? "" : "disabled"}>❤️ Odzyskaj połówkę (${HALF_COST} ⭐)</button>` : ""}
      ${lostLevels.length ? `<p class="hint" style="text-align:left">Utracone poziomy: ${lostLevels.join(", ")} – trzeba je zdobyć od nowa ewolucją.</p>` : ""}
    </div>` : ""}
    <div class="card">
      <div class="label">Następna ewolucja: ${stageKnown(L + 1) ? stageName(L + 1) : "??? (tajemnica)"}</div>
      ${okWhole ? "" : req(false, "Najpierw odzyskaj połówkę stworka")}
      ${req(okBadges, `Odznaki: ${S.badges.length}/${need}`)}
      ${req(okPts, `Punkty: ${S.points}/${EVOLVE_COST} ⭐`)}
      ${req(okRun, `Passa bez przerwy: ${run}/${STREAK_FOR_EVOLVE} ${dni(STREAK_FOR_EVOLVE)}`)}
      <button class="btn yellow ${canEvolve ? "glow" : ""}" id="evolve" ${canEvolve ? "" : "disabled"}>✨ Ulepsz stworka (${EVOLVE_COST} ⭐)</button>
    </div>
    <h2 class="section-title">Ścieżka ewolucji</h2>
    <div class="evo-path">
      ${STAGES.map((n, i) => {
        if (i <= L) return `<div class="evo-cell owned">${creatureSVG(i)}<small>${n}</small></div>`;
        if (stageKnown(i)) return `<div class="evo-cell known">${creatureSVG(i)}<small>${n}${i <= S.peakLevel ? "<br>(utracony)" : ""}</small></div>`;
        return `<div class="evo-cell secret">${secretCreatureSVG()}<small>???</small></div>`;
      }).join("")}
    </div>`;
  $("#evolve").onclick = () => {
    const from = S.avatarLevel;
    S.points -= EVOLVE_COST;
    S.avatarLevel++;
    S.peakLevel = Math.max(S.peakLevel, S.avatarLevel);
    save();
    go("creature");
    evolveAnimation(from, S.avatarLevel);
  };
  if ($("#heal")) $("#heal").onclick = () => {
    S.points -= HALF_COST;
    S.avatarHalf = false;
    save();
    toast("❤️ Stworek znów jest cały!");
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
      <div class="label">Sztuczna inteligencja</div>
      <p style="font-weight:700;margin:8px 0 0">${!AI.live
        ? "🧪 Tryb testowy: AI nie jest podłączone, wynik sprawdzania wybierasz ręcznie."
        : AI.viaProxy ? "🤖 Włączona: zdjęcia ocenia Claude."
          : "🤖 Włączona: zdjęcia ocenia Claude z konta osoby, która ma otwartą aplikację na claude.ai."}</p>
    </div>
    ${canOfferInstall() ? `
    <div class="card">
      <div class="label">Instalacja</div>
      <p style="font-weight:700;margin:8px 0 12px">Dodaj CLEAN QUEST do ekranu telefonu – otwiera się jak zwykła aplikacja.</p>
      <button class="btn ghost" id="installBtn2">📲 ${installEvent ? "Zainstaluj" : "Jak zainstalować?"}</button>
    </div>` : ""}
    <div class="card">
      <div class="label">Punktacja za misję</div>
      <table class="score-table">
        ${SCORE_TABLE.map(([m, p]) => `<tr><td>${m === 1 ? "do 1 minuty" : `${m} minut`}</td><td>${p} pkt</td></tr>`).join("")}
      </table>
      <p class="hint" style="text-align:left">Czasy pomiędzy są zaokrąglane (np. 4 min = 5 pkt, 2 min = 8 pkt). Skan czystości: +${CLEAN_BONUS} pkt raz dziennie na pomieszczenie.</p>
    </div>
    <div class="card">
      <div class="label">Zapamiętane uwagi o pomieszczeniach</div>
      <p class="hint" style="text-align:left;margin:6px 0">AI traktuje te rzeczy jako stojące na swoim miejscu. Dopisują się z komentarzy przy weryfikacji zdjęć.</p>
      ${Object.entries(ROOMS).map(([k, r]) => roomNotes(k).length ? `
        <div style="font-weight:800;margin-top:8px">${r.emoji} ${r.name}</div>
        ${roomNotes(k).map((n, i) => `<div class="note-row"><span>${esc(n)}</span><button class="note-del" data-room="${k}" data-i="${i}" aria-label="Usuń uwagę">✕</button></div>`).join("")}` : "").join("")
        || `<p class="muted" style="font-weight:700">Na razie brak uwag.</p>`}
    </div>
    <div class="card">
      <div class="label">Statystyki</div>
      <table class="score-table">
        <tr><td>Ukończone misje</td><td>${S.missionsDone}</td></tr>
        <tr><td>Zdobyte punkty łącznie</td><td>${S.totalEarned}</td></tr>
        <tr><td>Najdłuższa passa</td><td>${S.bestStreak}</td></tr>
      </table>
    </div>
    ${DEV_TOOLS ? `
    <div class="card test-panel">
      <div class="label">Narzędzia testowe</div>
      <p class="hint" style="text-align:left">Data w grze: ${fmtDay(dayKey())}${S.dayOffset ? ` (+${S.dayOffset} ${dni(S.dayOffset)} testowo)` : ""}
        · passa: ${currentStreak()} · zapas zamrożeń: ${creatureHalves()} · stworek: poziom ${S.avatarLevel}</p>
      <div class="row"><button class="btn ghost" id="dayPlus">➕ Dzień passy</button><button class="btn ghost" id="dayMiss">➖ Opuść dzień</button></div>
      <button class="btn ghost" id="lvlPlus">🐾 +1 poziom stworka</button>
      <button class="btn ghost" id="add">+200 ⭐ i +200 w każdej kategorii</button>
      <button class="btn red" id="reset">Wyczyść cały postęp</button>
    </div>` : ""}`;
  if (DEV_TOOLS) bindDevTools();
  $("#name").onchange = (e) => { S.name = e.target.value.trim() || "Graczu"; save(); toast("Zapisano"); };
  if ($("#installBtn2")) $("#installBtn2").onclick = installGuide;
  app.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { S.mode = b.dataset.mode; save(); go("settings"); }));
  app.querySelectorAll(".note-del").forEach((b) => (b.onclick = () => {
    const list = roomNotes(b.dataset.room).slice();
    list.splice(+b.dataset.i, 1);
    S.roomNotes = Object.assign({}, S.roomNotes, { [b.dataset.room]: list });
    save();
    go("settings");
  }));
  if ($("#reset")) $("#reset").onclick = () => openSheet(`
      <h2>Wyczyścić postęp?</h2>
      <p class="muted" style="font-weight:700">Punkty, odznaki, passa i stworek wrócą do zera.</p>
      <div class="row"><button class="btn ghost" id="no">Anuluj</button><button class="btn red" id="yes">Wyczyść</button></div>`,
    (m) => {
      $("#no", m).onclick = closeSheet;
      $("#yes", m).onclick = () => { S = freshState(); save(); closeSheet(); go("home"); };
    });
};

// Narzędzia testowe (przesuwanie dni, poziomy, punkty). Włączasz je, ustawiając DEV_TOOLS = true.
const DEV_TOOLS = false;
function bindDevTools() {
  // ➕: dzisiejszy dzień zaliczony; jeśli już był – przeskakujemy do jutra i zaliczamy jutro.
  $("#dayPlus").onclick = () => {
    if (activeToday()) S.dayOffset = (S.dayOffset || 0) + 1;
    save();
    processMissedDays(() => { markActive(); save(); go("settings"); });
  };
  // ➖: dokładnie jeden dzień bez aktywności (jeśli dziś już coś zrobiono – opuszczamy jutro).
  $("#dayMiss").onclick = () => {
    S.dayOffset = (S.dayOffset || 0) + (activeToday() ? 2 : 1);
    save();
    processMissedDays(() => go("settings"));
  };
  $("#lvlPlus").onclick = () => {
    const from = S.avatarLevel;
    S.avatarLevel++;
    S.avatarHalf = false;
    S.peakLevel = Math.max(S.peakLevel, S.avatarLevel);
    save();
    go("settings");
    evolveAnimation(from, S.avatarLevel);
  };
  $("#add").onclick = () => {
    Object.keys(BADGE_CATEGORIES).forEach((c) => addCatPoints(c, 200));
    addPoints(200);
    toast("+200 ⭐ i +200 w każdej kategorii (test)");
  };
}

/* ============ START ============ */

if (GATED) {
  showInstallGate(); // w przeglądarce: tylko ekran instalacji
} else {
  go(S.session ? "mission" : "home");

  // Najpierw wczytujemy stan z chmury (jeśli nowszy), potem sprawdzamy opuszczone dni.
  const refreshHome = () => { if (currentScreen === "home") go("home"); };
  cloudInit().then((changed) => {
    if (changed && !FLOW_SCREENS.has(currentScreen)) go(S.session ? "mission" : currentScreen);
    else if (changed && S.session && currentScreen === "mission") go("mission");
    else renderHeader();
    processMissedDays(refreshHome);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cloudSave(true); // wychodzisz z aplikacji – zapisz od razu
    else processMissedDays(refreshHome);
  });
  window.addEventListener("pagehide", () => cloudSave(true));

  // Gdy okaże się, że AI jest dostępne, odśwież ekrany, które o nim informują.
  AI.ready.then(() => {
    if (AI.live && (currentScreen === "home" || currentScreen === "settings" || currentScreen === "mission")) go(currentScreen);
  });
}

// Service worker tylko w wersji „na własnym serwerze” (GitHub Pages). Na claude.ai nie działa.
if ("serviceWorker" in navigator && !window.claude && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
