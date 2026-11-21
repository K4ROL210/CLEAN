// CLEAN QUEST – katalog 333 odznak (37 kolekcji × 9 poziomów).
// Każda kolekcja ma 9 odznak: 4 zwykłe, 3 rzadkie, 1 epicką i 1 legendarną.
// Cena rośnie z rzadkością i z numerem kolekcji (późniejsze kolekcje są droższe).

const BADGE_SETS = [
  ["Gąbka", "🧽"], ["Miotła", "🧹"], ["Mydło", "🧼"], ["Kosz", "🗑️"], ["Lodówka", "🧊"],
  ["Pranie", "🧺"], ["Łóżko", "🛏️"], ["Roślinka", "🪴"], ["Prysznic", "🚿"], ["Wanna", "🛁"],
  ["Szczoteczka", "🪥"], ["Książki", "📚"], ["Zabawki", "🧸"], ["Skarpetki", "🧦"], ["Koszulka", "👕"],
  ["Buty", "👟"], ["Klucze", "🔑"], ["Świeczka", "🕯️"], ["Patelnia", "🍳"], ["Kubek", "☕"],
  ["Iskra", "✨"], ["Gwiazda", "⭐"], ["Tęcza", "🌈"], ["Słońce", "☀️"], ["Księżyc", "🌙"],
  ["Kometa", "☄️"], ["Kryształ", "💎"], ["Korona", "👑"], ["Puchar", "🏆"], ["Medal", "🏅"],
  ["Rakieta", "🚀"], ["Kot", "🐱"], ["Lis", "🦊"], ["Sowa", "🦉"], ["Pszczoła", "🐝"],
  ["Jednorożec", "🦄"], ["Smok", "🐉"],
];

const BADGE_TIERS = [
  { name: "Początkujący", rarity: "common" },
  { name: "Brązowy", rarity: "common" },
  { name: "Srebrny", rarity: "common" },
  { name: "Złoty", rarity: "common" },
  { name: "Lśniący", rarity: "rare" },
  { name: "Kryształowy", rarity: "rare" },
  { name: "Mistrzowski", rarity: "rare" },
  { name: "Epicki", rarity: "epic" },
  { name: "Legendarny", rarity: "legendary" },
];

const RARITY_LABEL = { common: "Zwykła", rare: "Rzadka", epic: "Epicka", legendary: "Legendarna" };

// Każda kolekcja należy do kategorii zadań i kupuje się ją punktami TEJ kategorii.
// Np. Miotłę zdobywasz zamiataniem, Gąbkę zmywaniem, Mydło ścieraniem kurzu i myciem blatów.
// "ai" to opis dla AI, po którym przypisuje misję do kategorii.
const BADGE_CATEGORIES = {
  naczynia:   { label: "Naczynia",    icon: "🧽", ai: "naczynia: zmywanie, zmywarka (załadunek i rozpakowanie), zlew, suszarka na naczynia",
                sets: ["Gąbka", "Patelnia", "Kubek"] },
  podloga:    { label: "Podłoga",     icon: "🧹", ai: "podłoga: zamiatanie, odkurzanie, mycie podłogi, zbieranie rzeczy z podłogi",
                sets: ["Miotła"] },
  kurz:       { label: "Kurz i blaty", icon: "🧼", ai: "kurz i blaty: ścieranie kurzu, mycie płynem blatów, stołu, kuchenki, lustra, półek",
                sets: ["Mydło"] },
  smieci:     { label: "Śmieci",      icon: "🗑️", ai: "śmieci: wyrzucanie śmieci i opakowań, segregacja, wynoszenie worka",
                sets: ["Kosz"] },
  jedzenie:   { label: "Jedzenie",    icon: "🧊", ai: "jedzenie: chowanie jedzenia do lodówki i szafek, porządek w lodówce i spiżarni",
                sets: ["Lodówka"] },
  pranie:     { label: "Pranie",      icon: "🧺", ai: "pranie: brudne ubrania do kosza, pralka, wieszanie i zdejmowanie prania, składanie ubrań, szafa",
                sets: ["Pranie", "Skarpetki", "Koszulka"] },
  lozko:      { label: "Łóżko",       icon: "🛏️", ai: "łóżko: ścielenie łóżka, zmiana pościeli",
                sets: ["Łóżko"] },
  rosliny:    { label: "Rośliny",     icon: "🪴", ai: "rośliny: podlewanie kwiatów, porządek przy roślinach",
                sets: ["Roślinka"] },
  lazienka:   { label: "Łazienka",    icon: "🚿", ai: "łazienka: umywalka, prysznic, wanna, toaleta, kosmetyki, ręczniki",
                sets: ["Prysznic", "Wanna", "Szczoteczka"] },
  odkladanie: { label: "Odkładanie",  icon: "📚", ai: "odkładanie rzeczy na miejsce: zabawki, książki, buty, klucze, drobiazgi, poduszki i koce",
                sets: ["Książki", "Zabawki", "Buty", "Klucze", "Świeczka"] },
  inne:       { label: "Inne",        icon: "📦", ai: "inne: wszystko, co nie pasuje do żadnej z powyższych kategorii",
                sets: ["Kot", "Lis", "Sowa", "Pszczoła"] },
  blask:      { label: "Blask",       icon: "✨", ai: null, // tylko za skan czystości (utrzymanie porządku)
                sets: ["Iskra", "Gwiazda", "Tęcza", "Słońce", "Księżyc", "Kometa", "Kryształ", "Korona", "Puchar",
                       "Medal", "Rakieta", "Jednorożec", "Smok"] },
};
const TASK_CATEGORIES = Object.keys(BADGE_CATEGORIES).filter((k) => BADGE_CATEGORIES[k].ai);

function setCategory(setName) {
  return Object.keys(BADGE_CATEGORIES).find((k) => BADGE_CATEGORIES[k].sets.includes(setName));
}

// Cena rośnie z rzadkością i z kolejnością kolekcji w jej kategorii.
function badgePrice(rank, tierIdx) {
  const r = BADGE_TIERS[tierIdx].rarity;
  if (r === "common") return 10 + tierIdx * 3 + rank * 2;
  if (r === "rare") return 30 + (tierIdx - 4) * 10 + rank * 4;
  if (r === "epic") return 90 + rank * 6;
  return 150 + rank * 8;
}

const BADGES = [];
BADGE_SETS.forEach(([setName, emoji], s) => {
  const cat = setCategory(setName);
  const rank = BADGE_CATEGORIES[cat].sets.indexOf(setName);
  BADGE_TIERS.forEach((tier, t) => {
    BADGES.push({
      id: s * 9 + t,
      set: s,
      setName,
      emoji,
      cat,
      tier: t + 1,
      name: `${setName} – ${tier.name}`,
      rarity: tier.rarity,
      price: badgePrice(rank, t),
    });
  });
});
if (BADGES.some((b) => !b.cat)) console.warn("Kolekcja bez kategorii");

if (BADGES.length !== 333) console.warn("Liczba odznak:", BADGES.length);
