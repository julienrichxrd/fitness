// Nutrition : objectifs estimés, base d'aliments locale, recettes de meal prep, totaux par repas et par jour.
// Les besoins sont des ESTIMATIONS de départ, ajustées ensuite d'après la tendance du poids (body.js).

export const MEALS = [
  { id: 'breakfast', label: 'Petit-déjeuner' },
  { id: 'lunch', label: 'Déjeuner' },
  { id: 'snack', label: 'Collation' },
  { id: 'dinner', label: 'Dîner' },
];

export function defaultMeal(hour) {
  if (hour < 11) return 'breakfast';
  if (hour < 15) return 'lunch';
  if (hour < 18) return 'snack';
  return 'dinner';
}

export const DEFAULT_PROFILE = { sex: 'male', age: 25, heightCm: 180, activity: 1.55, goal: 'lean-gain' };

/**
 * Objectifs de départ :
 * - dépense : Mifflin-St Jeor × facteur d'activité (1,55 : 3 séances de musculation, course, natation, marche) ;
 * - objectif « prise de muscle propre » : +150 kcal (recomposition ou léger surplus, décidé au bilan) ;
 * - protéines 1,8 g/kg (fourchette utile 1,6–2,2) ; lipides 0,9 g/kg ; glucides : le reste.
 */
export function estimateTargets(profile, weightKg) {
  const p = { ...DEFAULT_PROFILE, ...(profile || {}) };
  const w = weightKg || 79;
  const bmr = 10 * w + 6.25 * p.heightCm - 5 * p.age + (p.sex === 'female' ? -161 : 5);
  const tdee = bmr * p.activity;
  const adjust = { 'lean-gain': 150, maintain: 0, cut: -400 }[p.goal] ?? 150;
  const kcal = Math.round((tdee + adjust) / 50) * 50;
  const protein = Math.round(w * 1.8 / 5) * 5;
  const fat = Math.round(w * 0.9 / 5) * 5;
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4 / 5) * 5);
  return { kcal, protein, fat, carbs, bmr: Math.round(bmr), tdee: Math.round(tdee), adjust, weightKg: w };
}

export function targetsFor(settings, weightKg) {
  const est = estimateTargets(settings && settings.profile, weightKg);
  const t = (settings && settings.nutritionTargets) || null;
  return t ? { ...est, ...t, custom: true } : { ...est, custom: false };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe');

export function allFoods(lib, settings) {
  return [...((settings && settings.customFoods) || []).map((f) => ({ ...f, custom: true })), ...lib.foods];
}

/** Recherche sans accents ; les noms qui commencent par la recherche passent en premier. */
export function searchFoods(foods, query, limit = 30) {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  return foods
    .map((f) => ({ f, n: norm(f.name) }))
    .filter(({ n }) => words.every((w) => n.includes(w)))
    .sort((a, b) => (b.n.startsWith(q) - a.n.startsWith(q)) || a.n.length - b.n.length)
    .slice(0, limit)
    .map(({ f }) => f);
}

const r1 = (x) => Math.round(x * 10) / 10;

/** Valeurs pour une quantité en grammes. */
export function nutrients(food, grams) {
  const k = grams / 100;
  return { kcal: Math.round(food.kcal * k), p: r1(food.p * k), c: r1(food.c * k), f: r1(food.f * k) };
}

/** Valeurs d'une portion de recette (meal prep). */
export function recipePortion(recipe, foods) {
  const byId = new Map(foods.map((f) => [f.id, f]));
  const total = recipe.items.reduce((acc, it) => {
    const f = byId.get(it.foodId);
    if (!f) return acc;
    const n = nutrients(f, it.grams);
    return { kcal: acc.kcal + n.kcal, p: acc.p + n.p, c: acc.c + n.c, f: acc.f + n.f };
  }, { kcal: 0, p: 0, c: 0, f: 0 });
  const n = Math.max(1, recipe.portions || 1);
  return { kcal: Math.round(total.kcal / n), p: r1(total.p / n), c: r1(total.c / n), f: r1(total.f / n), totalGrams: recipe.items.reduce((s, it) => s + it.grams, 0) };
}

const sum = (list) => list.reduce((a, e) => ({ kcal: a.kcal + (e.kcal || 0), p: a.p + (e.p || 0), c: a.c + (e.c || 0), f: a.f + (e.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });

/** Totaux d'un jour, au total et par repas. */
export function dayTotals(entries, date) {
  const list = entries.filter((e) => e.kind === 'food' && e.date === date);
  const byMeal = Object.fromEntries(MEALS.map((m) => [m.id, { items: list.filter((e) => e.meal === m.id), ...sum(list.filter((e) => e.meal === m.id)) }]));
  const t = sum(list);
  return { ...t, p: r1(t.p), c: r1(t.c), f: r1(t.f), byMeal, count: list.length };
}

/** Moyennes sur les jours renseignés d'une période (les jours vides ne comptent pas). */
export function periodAverages(entries, dates) {
  const days = dates.map((d) => ({ date: d, ...dayTotals(entries, d) })).filter((d) => d.count > 0);
  if (!days.length) return { days: 0 };
  const t = sum(days);
  return { days: days.length, kcal: Math.round(t.kcal / days.length), p: r1(t.p / days.length), c: r1(t.c / days.length), f: r1(t.f / days.length) };
}

/** Aliments les plus utilisés récemment (pour les ajouter en un geste). */
export function frequentItems(entries, limit = 8) {
  const m = new Map();
  entries.filter((e) => e.kind === 'food').forEach((e) => {
    const k = e.recipeId ? `r:${e.recipeId}` : e.foodId ? `f:${e.foodId}:${e.grams}` : `m:${e.name}`;
    const cur = m.get(k) || { key: k, count: 0, last: '', sample: e };
    cur.count += 1;
    if ((e.createdAt || '') > cur.last) { cur.last = e.createdAt || ''; cur.sample = e; }
    m.set(k, cur);
  });
  return [...m.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, limit).map((x) => x.sample);
}

/** Entrée de journal à partir d'un aliment, d'une recette ou d'une saisie libre. */
export function foodEntry({ date, meal, food, grams, recipe, portions, foods, manual, id, now }) {
  const base = { id, kind: 'food', date, meal, createdAt: now, updatedAt: now };
  if (recipe) {
    const n = recipePortion(recipe, foods);
    const k = portions || 1;
    return { ...base, recipeId: recipe.id, name: recipe.name, portions: k, kcal: Math.round(n.kcal * k), p: r1(n.p * k), c: r1(n.c * k), f: r1(n.f * k) };
  }
  if (food) return { ...base, foodId: food.id, name: food.name, grams, ...nutrients(food, grams) };
  return { ...base, name: manual.name || 'Saisie libre', kcal: Math.round(manual.kcal || 0), p: r1(manual.p || 0), c: r1(manual.c || 0), f: r1(manual.f || 0) };
}
