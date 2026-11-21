// CLEAN QUEST – warstwa AI. Dwie drogi do Claude'a:
// 1) na claude.ai (Artifact) – z konta osoby, która ma otwartą aplikację (capability "sample"),
// 2) na GitHub Pages – przez własny serwer na Cloudflare (adres w config.js), który trzyma klucz API.
// Bez żadnej z nich aplikacja działa w trybie testowym.
"use strict";

const AI = {
  sample: null,
  proxy: null, // adres serwera AI (Cloudflare Worker)
  maxImages: 0,
  get live() { return (!!this.sample || !!this.proxy) && this.maxImages > 0; },
  get viaProxy() { return !this.sample && !!this.proxy; },
};

AI.ready = (async () => {
  try {
    if (!window.claude || typeof window.claude.use !== "function") {
      const url = ((window.CQ_CONFIG || {}).aiUrl || "").replace(/\/+$/, "");
      if (url) { AI.proxy = url; AI.maxImages = 4; }
      return;
    }
    const s = await window.claude.use("sample");
    if (!s) return;
    const lim = await s.limits().catch(() => null);
    if (!lim || !lim.images) return;
    AI.sample = s;
    AI.maxImages = lim.images.maxCount || 1;
  } catch (e) { /* brak AI = tryb testowy */ }
})();

// Błędy, po których AI nie zadziała do końca tej sesji – przechodzimy na tryb testowy.
const AI_PERMANENT = new Set(["not_granted", "sampling_disabled", "not_declared", "capability_disabled",
  "capability_removed", "images_unavailable"]);

AI.errorText = (e) => {
  const code = e && e.code;
  if (AI_PERMANENT.has(code)) return "AI jest niedostępne (brak zgody albo dostępu). Przełączam na tryb testowy.";
  return ({
    rate_limited: e.reason === "usage_limit"
      ? "Wyczerpał się limit Claude'a na Twoim koncie. Spróbuj później."
      : "Za dużo zapytań naraz. Spróbuj za chwilę.",
    image_rejected: "Nie udało się odczytać zdjęcia. Zrób je jeszcze raz.",
    session_expired: "Zaloguj się ponownie do claude.ai.",
    refused: "AI nie oceni tego zdjęcia. Zrób inne ujęcie.",
    invalid_json: "AI odpowiedziało nie na temat. Spróbuj jeszcze raz.",
    empty_completion: "AI nic nie odpowiedziało. Spróbuj jeszcze raz.",
    forbidden_origin: "Serwer AI nie przyjmuje zapytań z tej strony (sprawdź ALLOWED_ORIGINS).",
    server_misconfigured: "Serwer AI jest źle skonfigurowany (klucz API).",
    offline: "Brak internetu albo serwer AI nie odpowiada. Spróbuj jeszcze raz.",
  })[code] || "Nie udało się połączyć z AI. Spróbuj jeszcze raz.";
};

async function aiCall(prompt, images, modelTier) {
  if (AI.viaProxy) return proxyCall(prompt, images, modelTier);
  try {
    return await AI.sample.json(prompt, { images, modelTier, cache: false });
  } catch (e) {
    if (e && AI_PERMANENT.has(e.code)) AI.sample = null;
    throw e;
  }
}

/* ---- serwer AI na Cloudflare ---- */
async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// Odpowiedź ma być JSON-em – czytamy ją tolerancyjnie (całość, blok ```json albo od { do }).
function parseJsonLoose(text) {
  const t = String(text || "");
  try { return JSON.parse(t); } catch (e) { /* dalej */ }
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* dalej */ } }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* dalej */ } }
  throw { code: "invalid_json", text: t };
}
async function proxyCall(prompt, images, tier) {
  const imgs = await Promise.all(images.map(async (b) => ({ type: b.type || "image/jpeg", data: await blobToBase64(b) })));
  let res;
  try {
    res = await fetch(AI.proxy + "/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt + "\n\nOdpowiedz wyłącznie poprawnym JSON-em, bez innego tekstu.", images: imgs, tier }),
    });
  } catch (e) {
    throw { code: "offline" };
  }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw { code: out.code || "upstream_error" };
  return parseJsonLoose(out.text);
}

// Zmniejsza zdjęcie z telefonu (zwykle 3–8 MB) – szybciej, taniej i pewniej.
async function shrinkImage(file, max = AI.viaProxy ? 1280 : 1600) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return await new Promise((res) => c.toBlob((b) => res(b || file), "image/jpeg", AI.viaProxy ? 0.8 : 0.85));
  } catch (e) {
    return file;
  }
}

// Odcisk zdjęcia – żeby nie dało się drugi raz wysłać tego samego pliku po bonus.
async function photoHash(file) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(buf).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    return null;
  }
}

const WHO = "Gracz to dorosły. Pisz krótko i konkretnie, z odrobiną humoru.";

// Uwagi gracza o pomieszczeniu (np. "miotła zawsze stoi w kącie") – rzeczy na swoim stałym miejscu to nie bałagan.
function notesBlock(notes) {
  if (!notes || !notes.length) return "";
  return `\nUwagi gracza o tym pomieszczeniu – te rzeczy mają tu swoje stałe miejsce, więc NIE są bałaganem:\n${notes.map((n) => `- ${n}`).join("\n")}\n`;
}

// Komentarz gracza do konkretnego zdjęcia. Gracz zna swój dom lepiej niż AI:
// jeśli komentarz wyjaśnia, dlaczego te rzeczy tu stoją, zaliczamy (decyduje o tym pole "comment_ok").
function commentBlock(comment) {
  if (!comment) return "";
  return `\nGracz dodał komentarz: "${comment}"
Gracz zna swój dom lepiej niż Ty. Ustaw "comment_ok": true, jeśli komentarz w jakikolwiek sensowny sposób wyjaśnia,
dlaczego rzeczy z tej misji albo widoczne na zdjęciu mają tu zostać – np. mają tu stałe miejsce, stoją celowo,
żeby były pod ręką (miska z owocami, dynie na blacie, miotła w kącie, suszarka na naczynia). Wtedy misja jest zaliczona,
nawet jeśli wcześniej kazałeś te rzeczy sprzątnąć. W razie wątpliwości wierz graczowi.
Ustaw "comment_ok": false tylko wtedy, gdy komentarz zupełnie nie dotyczy tego, co widać, albo zdjęcie pokazuje inne miejsce.\n`;
}

function guessCategory(text) {
  const t = String(text).toLowerCase();
  const rules = [
    ["naczynia", /naczy|zmywar|zlew|talerz|kub(ek|ki)|sztućc|garn|patel|suszark/],
    ["jedzenie", /lodów|jedzen|przekąs|słodycz|mleko|ser\b|spiżar|produkt/],
    ["smieci", /śmie|opakowa|papierk|butelk|wynieś worek|segreg/],
    ["pranie", /prani|ubra|pralk|piżam|skarpet|koszul|szaf|kosza? na pranie/],
    ["lozko", /łóżk|pości|kołdr/],
    ["podloga", /zamie|odkurz|podłog|miotł/],
    ["rosliny", /kwiat|rośl|podlej/],
    ["lazienka", /umywalk|prysznic|wann|toalet|sedes|kosmetyk|szczoteczk|ręcznik/],
    ["odkladanie", /odłóż|odnieś|odwieś|schowaj|pozbieraj|zabawk|książk|buty|klucz|poduszk|koc\b/],
    ["kurz", /kurz|przetrzyj|przetrz|blat|stół|stolik|lustr|płyt[aęy]|kuchenk|półk/],
  ];
  const hit = rules.find(([, re]) => re.test(t));
  return hit ? hit[0] : "inne";
}

/** Skan bałaganu (1–3 zdjęcia) → lista misji. */
AI.analyzeRoom = async ({ roomName, photos, notes }) => {
  const [min, max] = [3, 6];
  const imgs = [];
  for (const p of photos.slice(0, Math.max(1, AI.maxImages))) imgs.push(await shrinkImage(p));
  const cats = TASK_CATEGORIES.map((k) => `- "${k}" – ${BADGE_CATEGORIES[k].ai}`).join("\n");
  const prompt = `Jesteś asystentem w grze CLEAN QUEST, która zamienia sprzątanie w misje na czas.
${imgs.length > 1 ? `Dostajesz ${imgs.length} zdjęcia tego samego pomieszczenia (${roomName}) z różnych stron.` : `Na zdjęciu jest pomieszczenie: ${roomName}.`}
${WHO}
${notesBlock(notes)}
Rozpoznaj bałagan widoczny na zdjęciach i ułóż od ${min} do ${max} misji sprzątania w najlepszej kolejności:
najpierw rzeczy pilne (np. jedzenie wymagające chłodzenia do lodówki), potem naczynia, śmieci,
odkładanie rzeczy na miejsce, a na końcu przecieranie powierzchni.
- Każda misja to jedno konkretne polecenie w trybie rozkazującym, najwyżej 70 znaków,
  dotyczące tego, co NAPRAWDĘ widać na zdjęciach (np. "Włóż mleko i ser do lodówki").
- Wolę misje pojedyncze: jedna czynność w jednym miejscu.
- Każda misja ma listę "checks" – punkty do sfotografowania. Gracz robi OSOBNE zdjęcie każdego miejsca,
  bo często nie da się złapać wszystkiego na jednym zdjęciu. Jeśli misja dotyczy dwóch miejsc
  (np. "Zdejmij pranie z kaloryfera i włóż do pralki"), daj dwa punkty: kaloryfer i pralka.
  Najwyżej 3 punkty na misję. Każdy punkt: "where" – krótka nazwa miejsca do zdjęcia (do 25 znaków),
  "check" – co musi być widać na zdjęciu tego miejsca, żeby punkt zaliczyć.
- Każda misja ma "category" – dokładnie jeden klucz z tej listy. Wybierz go na podstawie tego, co widać
  na zdjęciu przy tej misji (jaka to rzecz i gdzie leży). Jeśli nic nie pasuje, użyj "inne":
${cats}
- Jedna misja powinna dać się zrobić w 1–15 minut.
- Rzeczy, które według uwag gracza mają tu stałe miejsce, pomiń.
- Jeśli pomieszczenie jest już posprzątane, zwróć pustą listę misji.
- Jeśli zdjęcia nie przedstawiają pomieszczenia (${roomName}), ustaw "valid": false.

Odpowiedz wyłącznie JSON-em w tym formacie:
{"valid": true, "comment": "jedno zdanie po polsku o tym, co widzisz", "missions": [
  {"text": "Zdejmij pranie z kaloryfera i włóż do pralki", "category": "pranie", "checks": [
    {"where": "kaloryfer", "check": "na kaloryferze nie wiszą ubrania"},
    {"where": "pralka", "check": "ubrania są w bębnie pralki"}]}]}`;
  const r = await aiCall(prompt, imgs, "default");
  const missions = Array.isArray(r && r.missions) ? r.missions : [];
  return {
    valid: r && r.valid !== false,
    comment: String((r && r.comment) || ""),
    missions: missions
      .filter((m) => m && m.text)
      .slice(0, max)
      .map((m) => {
        const checks = (Array.isArray(m.checks) ? m.checks : [])
          .filter((c) => c && c.check)
          .slice(0, 3)
          .map((c) => ({ where: String(c.where || "").slice(0, 30), check: String(c.check).slice(0, 200) }));
        const text = String(m.text).slice(0, 120);
        const cat = TASK_CATEGORIES.includes(m.category) ? m.category : guessCategory(text);
        return { text, cat, checks };
      }),
  };
};

/**
 * Zdjęcie kontrolne. Misja może mieć kilka punktów (miejsc) – każde zdjęcie zalicza te punkty,
 * które na nim widać. `pending` to numery punktów, które jeszcze nie są zaliczone.
 * Zwraca {done: [numery zaliczonych teraz punktów], message}.
 */
AI.verifyMission = async ({ roomName, mission, pending, before, after, comment, notes }) => {
  const befores = (before || []).slice(0, Math.max(0, Math.min(2, AI.maxImages - 1)));
  const images = [];
  for (const b of befores) images.push(await shrinkImage(b));
  images.push(await shrinkImage(after));
  const photos = befores.length
    ? `${befores.length === 1 ? "Pierwsze zdjęcie to" : `Pierwsze ${befores.length} zdjęcia to`} ogólny widok pomieszczenia PRZED sprzątaniem (dla kontekstu). Ostatnie zdjęcie to nowe zdjęcie kontrolne PO – oceniasz właśnie je.`
    : "Zdjęcie to zdjęcie kontrolne PO wykonaniu (części) misji.";
  const list = pending.map((i) => {
    const c = mission.checks[i];
    return `${i}. ${c.where ? `[${c.where}] ` : ""}${c.check}`;
  }).join("\n");
  const prompt = `Gra CLEAN QUEST. Pomieszczenie: ${roomName}. ${WHO}
Misja gracza: "${mission.text}".
Punkty do zaliczenia (numer. [miejsce] co ma być widać):
${list}
${photos}
${notesBlock(notes)}${commentBlock(comment)}
Gracz może fotografować każde miejsce OSOBNO. Oceń, które z powyższych punktów widać na zdjęciu kontrolnym jako wykonane.
- Zalicz punkt, jeśli jego miejsce jest na zdjęciu i warunek jest spełniony.
- Punkt, którego miejsca nie widać na zdjęciu, po prostu pomiń (gracz zrobi mu osobne zdjęcie) – to nie jest błąd.
- Nie oceniaj niczego spoza tych punktów. Bądź uczciwy, ale nie przesadnie surowy.
- Jeśli zdjęcie jest nieostre albo za ciemne, nie zaliczaj niczego i poproś o lepsze ujęcie.

Odpowiedz wyłącznie JSON-em:
{${comment ? `"comment_ok": true, ` : ""}"done": [numery zaliczonych punktów, np. 1], "message": "krótki komunikat po polsku, najwyżej 100 znaków: co zaliczone, a jeśli coś zostało – co jeszcze zrobić albo sfotografować"}`;
  const r = await aiCall(prompt, images, comment ? "default" : "quick");
  // Komentarz wyjaśnia sytuację → zaliczamy wszystkie pozostałe punkty misji.
  if (comment && r && r.comment_ok === true) {
    return { done: pending.slice(), message: String(r.message || "Rozumiem – te rzeczy mają tu swoje miejsce. Zaliczone!") };
  }
  const done = (Array.isArray(r && r.done) ? r.done : []).map(Number).filter((i) => pending.includes(i));
  return { done: [...new Set(done)], message: String((r && r.message) || "") };
};

/** Skan czystości (bonus +14): czy całe pomieszczenie jest naprawdę posprzątane. */
AI.verifyClean = async ({ roomName, photo, comment, notes }) => {
  const prompt = `Gra CLEAN QUEST: bonus za utrzymanie porządku. ${WHO}
Na zdjęciu ma być posprzątane pomieszczenie: ${roomName}.
${notesBlock(notes)}${commentBlock(comment)}
Oceń uczciwie i dość surowo, czy pomieszczenie jest naprawdę uporządkowane: nic zbędnego nie leży na wierzchu,
nie ma brudnych naczyń, śmieci ani ubrań na podłodze. W kuchni zlew ma być pusty, a zmywarka rozpakowana (jeśli ją widać).
Rzeczy stojące porządnie na swoim stałym miejscu (zwłaszcza te z uwag gracza) to nie bałagan.
Nie zaliczaj, jeśli zdjęcie pokazuje tylko mały fragment pomieszczenia, jest zdjęciem ekranu lub wydruku,
albo nie przedstawia pomieszczenia: ${roomName}.

Odpowiedz wyłącznie JSON-em:
{${comment ? `"comment_ok": true, ` : ""}"clean": true, "message": "krótki komunikat po polsku, najwyżej 100 znaków; przy niezaliczeniu napisz, co psuje porządek"}`;
  const r = await aiCall(prompt, [await shrinkImage(photo)], "default");
  const passed = !!(r && (r.clean === true || (comment && r.comment_ok === true)));
  return { passed, message: String((r && r.message) || (passed ? "Rozumiem – to ich stałe miejsce. Zaliczone!" : "")) };
};
