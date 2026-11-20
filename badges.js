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

function badgePrice(setIdx, tierIdx) {
  const r = BADGE_TIERS[tierIdx].rarity;
  if (r === "common") return 10 + tierIdx * 3 + setIdx;
  if (r === "rare") return 30 + (tierIdx - 4) * 10 + setIdx * 2;
  if (r === "epic") return 90 + setIdx * 3;
  return 150 + setIdx * 4;
}

const BADGES = [];
BADGE_SETS.forEach(([setName, emoji], s) => {
  BADGE_TIERS.forEach((tier, t) => {
    BADGES.push({
      id: s * 9 + t,
      set: s,
      setName,
      emoji,
      tier: t + 1,
      name: `${setName} – ${tier.name}`,
      rarity: tier.rarity,
      price: badgePrice(s, t),
    });
  });
});

if (BADGES.length !== 333) console.warn("Liczba odznak:", BADGES.length);
