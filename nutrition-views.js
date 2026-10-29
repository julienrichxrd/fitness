// Nutrition : journal du jour par repas, ajout d'aliments, recettes de meal prep, objectifs.
import { esc } from './views.js';
import { formatDateFr, addDays, mondayOf } from './dates.js';
import { icon, nf, nf0, ring, macroBar, barChart, infoBtn } from './ui.js';
import { MEALS, dayTotals, targetsFor, allFoods, searchFoods, nutrients, recipePortion, frequentItems, periodAverages, estimateTargets } from './nutrition.js';
import { latestWeight } from './body.js';

export function currentTargets(state) {
  const lw = latestWeight(state.entries || []);
  return targetsFor(state.settings || {}, lw ? lw.kg : null);
}

export function renderNutrition(state) {
  const date = state.foodDate || state.today;
  const t = currentTargets(state);
  const d = dayTotals(state.entries || [], date);
  const left = t.kcal - d.kcal;
  const isToday = date === state.today;
  const week = [];
  const mon = mondayOf(date);
  for (let i = 0; i < 7; i += 1) week.push(addDays(mon, i));
  const wk = periodAverages(state.entries || [], week);
  const bars = week.map((x) => ({ value: dayTotals(state.entries || [], x).kcal, label: 'LMMJVSD'[week.indexOf(x)], muted: x > state.today }));
  return `
    <header class="page-head row-head">
      <div><p class="kicker">${isToday ? 'Aujourd\'hui' : esc(formatDateFr(date, { year: false }))}</p><h1 class="display">Nutrition</h1></div>
      <div class="date-nav"><button class="icon-btn" data-action="food-day" data-value="-1" aria-label="Jour précédent">${icon('back')}</button>${isToday ? '' : '<button class="chip small" data-action="food-day" data-value="0">Aujourd\'hui</button>'}<button class="icon-btn" data-action="food-day" data-value="1" aria-label="Jour suivant"${isToday ? ' disabled' : ''}>${icon('chevron')}</button></div>
    </header>
    <section class="food-sum">
      <div class="ring-big">${ring(d.kcal, t.kcal, { size: 148, stroke: 13 })}<div class="ring-center"><b>${nf0(Math.abs(left))}</b><span>${left >= 0 ? 'kcal restantes' : 'kcal en trop'}</span></div></div>
      <div class="food-macros">
        <div class="kcal-line"><b>${nf0(d.kcal)}</b> / ${nf0(t.kcal)} kcal ${infoBtn('calories')}</div>
        ${macroBar('Protéines', d.p, t.protein, 'p')}
        ${macroBar('Glucides', d.c, t.carbs, 'c')}
        ${macroBar('Lipides', d.f, t.fat, 'f')}
      </div>
    </section>
    ${MEALS.map((m) => {
      const meal = d.byMeal[m.id];
      return `<section class="meal">
        <div class="meal-head"><h3>${esc(m.label)}</h3><span class="muted">${meal.items.length ? `${nf0(meal.kcal)} kcal` : ''}</span><button class="icon-btn add" data-action="food-add" data-value="${m.id}" aria-label="Ajouter au ${esc(m.label.toLowerCase())}">${icon('plus')}</button></div>
        ${meal.items.length ? `<div class="group tight">${meal.items.map((e) => `<button class="row" data-action="food-edit" data-id="${esc(e.id)}"><span class="row-main"><b>${esc(e.name)}</b><span>${e.grams ? `${nf0(e.grams)} g` : e.portions ? `${nf(e.portions)} portion${e.portions > 1 ? 's' : ''}` : 'saisie libre'}, ${nf0(e.p)} g de protéines</span></span><span class="row-num">${nf0(e.kcal)}</span></button>`).join('')}</div>` : ''}
      </section>`;
    }).join('')}
    <h3 class="section">Semaine</h3>
    <div class="card chart-card">
      ${barChart({ bars, goal: t.kcal, cls: 'food', label: 'Calories par jour' })}
      <p class="muted small">${wk.days ? `Moyenne sur ${wk.days} jour${wk.days > 1 ? 's' : ''} notés : ${nf0(wk.kcal)} kcal, ${nf0(wk.p)} g de protéines.` : 'Aucun repas noté cette semaine.'} C'est la moyenne de la semaine qui compte, pas un jour isolé.</p>
    </div>
    <div class="group">
      <button class="row" data-action="go" data-tab="recipes"><span class="row-ic food">${icon('book')}</span><span class="row-main"><b>Mes recettes de meal prep</b><span>${((state.settings || {}).recipes || []).length} recette${((state.settings || {}).recipes || []).length > 1 ? 's' : ''} : une portion s'ajoute en un geste</span></span><span class="row-end">${icon('chevron')}</span></button>
      <button class="row" data-action="sheet" data-value="custom-food"><span class="row-ic food">${icon('plus')}</span><span class="row-main"><b>Créer un aliment</b><span>Recopiez l'étiquette d'un produit précis</span></span><span class="row-end">${icon('chevron')}</span></button>
      <button class="row" data-action="sheet" data-value="targets"><span class="row-ic food">${icon('flag')}</span><span class="row-main"><b>Objectifs</b><span>${nf0(t.kcal)} kcal, ${nf0(t.protein)} g de protéines${t.custom ? ', réglés à la main' : ', estimation'}</span></span><span class="row-end">${icon('chevron')}</span></button>
    </div>`;
}

/** Feuille d'ajout : recherche, récents, recettes, saisie libre ; puis choix de la quantité. */
export function renderFoodSheet(state) {
  const sh = state.sheet;
  const foods = allFoods(state.foodLib, state.settings);
  const meal = MEALS.find((m) => m.id === sh.meal);
  if (sh.pick) {
    const f = sh.pick.recipe ? null : foods.find((x) => x.id === sh.pick.foodId);
    const recipe = sh.pick.recipe ? ((state.settings || {}).recipes || []).find((r) => r.id === sh.pick.recipeId) : null;
    if (recipe) {
      const n = recipePortion(recipe, foods);
      const k = sh.pick.portions || 1;
      return `<h2>${esc(recipe.name)}</h2>
        <p class="muted">Une portion : ${nf0(n.kcal)} kcal, ${nf(n.p)} g de protéines.</p>
        <div class="qty-chips">${[0.5, 1, 1.5, 2].map((q) => `<button class="chip${q === k ? ' on' : ''}" data-action="food-portions" data-value="${q}">${nf(q)} portion${q > 1 ? 's' : ''}</button>`).join('')}</div>
        <div class="preview"><b>${nf0(n.kcal * k)}</b> kcal<span>P ${nf0(n.p * k)} g · G ${nf0(n.c * k)} g · L ${nf0(n.f * k)} g</span></div>
        <button class="btn big food" data-action="food-confirm">${sh.editId ? 'Enregistrer' : `Ajouter au ${esc(meal.label.toLowerCase())}`}</button>
        ${sh.editId ? `<button class="btn ghost danger-text" data-action="food-delete">${icon('trash')} Supprimer</button>` : ''}
        <button class="btn quiet" data-action="food-back">Retour</button>`;
    }
    const g = sh.pick.grams;
    const n = f && Number.isFinite(g) ? nutrients(f, g) : { kcal: 0, p: 0, c: 0, f: 0 };
    return `<h2>${esc(f ? f.name : 'Aliment')}</h2>
      <p class="muted small">Pour 100 g : ${nf0(f.kcal)} kcal, P ${nf(f.p)} g, G ${nf(f.c)} g, L ${nf(f.f)} g${f.custom ? ' (votre aliment)' : ''}.</p>
      <label class="field"><span class="field-label">Quantité en grammes</span><input id="food-grams" class="num-input" inputmode="decimal" value="${Number.isFinite(g) ? nf(g) : ''}" autocomplete="off"></label>
      <div class="qty-chips">${f.portion ? [0.5, 1, 2].map((q) => `<button class="chip" data-action="food-grams" data-value="${f.portion.g * q}">${q === 1 ? esc(f.portion.label) : `${nf(q)} × ${esc(f.portion.label)}`}</button>`).join('') : ''}<button class="chip" data-action="food-grams" data-value="100">100 g</button></div>
      <div class="preview" id="food-preview"><b>${nf0(n.kcal)}</b> kcal<span>P ${nf(n.p)} g · G ${nf(n.c)} g · L ${nf(n.f)} g</span></div>
      <button class="btn big food" data-action="food-confirm">${sh.editId ? 'Enregistrer' : `Ajouter au ${esc(meal.label.toLowerCase())}`}</button>
      ${sh.editId ? `<button class="btn ghost danger-text" data-action="food-delete">${icon('trash')} Supprimer</button>` : ''}
      <button class="btn quiet" data-action="food-back">Retour</button>`;
  }
  if (sh.mode === 'manual') {
    return `<h2>Saisie libre</h2><p class="muted small">Pour un plat au restaurant ou chez des amis : une estimation vaut mieux qu'un trou dans le journal.</p>
      <form data-form="food-manual" class="form">
        <label class="field"><span class="field-label">Nom</span><input name="name" value="${esc(sh.manual ? sh.manual.name : '')}" placeholder="Burger frites, repas chez Paul…" autocomplete="off"></label>
        <div class="field-row">
          <label class="field"><span class="field-label">Calories</span><input name="kcal" class="num-input" inputmode="numeric" value="${sh.manual ? esc(sh.manual.kcal) : ''}" required></label>
          <label class="field"><span class="field-label">Protéines (g)</span><input name="p" class="num-input" inputmode="decimal" value="${sh.manual ? esc(sh.manual.p) : ''}"></label>
        </div>
        <div class="field-row">
          <label class="field"><span class="field-label">Glucides (g)</span><input name="c" class="num-input" inputmode="decimal" value="${sh.manual ? esc(sh.manual.c) : ''}"></label>
          <label class="field"><span class="field-label">Lipides (g)</span><input name="f" class="num-input" inputmode="decimal" value="${sh.manual ? esc(sh.manual.f) : ''}"></label>
        </div>
        <button class="btn big food" type="submit">${sh.editId ? 'Enregistrer' : `Ajouter au ${esc(meal.label.toLowerCase())}`}</button>
        ${sh.editId ? `<button type="button" class="btn ghost danger-text" data-action="food-delete">${icon('trash')} Supprimer</button>` : ''}
      </form>
      <button class="btn quiet" data-action="food-mode" data-value="search">Retour</button>`;
  }
  const recent = frequentItems(state.entries || []);
  const recipes = (state.settings || {}).recipes || [];
  const q = sh.query || '';
  const results = q ? searchFoods(foods, q) : [];
  return `<h2>Ajouter au ${esc(meal.label.toLowerCase())}</h2>
    <div class="search">${icon('search')}<input id="food-search" type="search" placeholder="Rechercher : poulet, skyr, riz…" value="${esc(q)}" autocomplete="off" enterkeyhint="search"></div>
    <div id="food-results">${renderFoodResults(results, q, recent, recipes, foods)}</div>
    <button class="btn quiet" data-action="food-mode" data-value="manual">${icon('edit')} Saisie libre (restaurant, plat inconnu)</button>`;
}

export function renderFoodResults(results, q, recent, recipes, foods) {
  if (q) {
    return results.length ? `<div class="group tight">${results.map((f) => `<button class="row" data-action="food-pick" data-value="${esc(f.id)}"><span class="row-main"><b>${esc(f.name)}</b><span>${f.portion ? `${esc(f.portion.label)} (${nf0(f.portion.g)} g), ` : ''}${nf0(f.kcal)} kcal / 100 g${f.custom ? ', votre aliment' : ''}</span></span><span class="row-end">${icon('plus')}</span></button>`).join('')}</div>`
      : `<div class="empty small">Aucun aliment ne correspond. Essayez un autre mot, ou utilisez la saisie libre.</div>`;
  }
  const rec = recipes.length ? `<h3 class="section">Mes recettes</h3><div class="group tight">${recipes.map((r) => { const n = recipePortion(r, foods); return `<button class="row" data-action="food-pick-recipe" data-value="${esc(r.id)}"><span class="row-ic food">${icon('book')}</span><span class="row-main"><b>${esc(r.name)}</b><span>1 portion : ${nf0(n.kcal)} kcal, ${nf0(n.p)} g de protéines</span></span><span class="row-end">${icon('plus')}</span></button>`; }).join('')}</div>` : '';
  const rct = recent.length ? `<h3 class="section">Souvent ajoutés</h3><div class="group tight">${recent.map((e) => `<button class="row" data-action="food-quick" data-id="${esc(e.id)}"><span class="row-main"><b>${esc(e.name)}</b><span>${e.grams ? `${nf0(e.grams)} g, ` : e.portions ? `${nf(e.portions)} portion, ` : ''}${nf0(e.kcal)} kcal</span></span><span class="row-end">${icon('plus')}</span></button>`).join('')}</div>` : '';
  return `${rec}${rct}${!rec && !rct ? '<p class="muted small">Tapez le nom d\'un aliment. La base contient plus de 100 aliments courants ; vos recettes et vos aliments apparaîtront ici.</p>' : ''}`;
}

export function renderRecipes(state) {
  const recipes = (state.settings || {}).recipes || [];
  const foods = allFoods(state.foodLib, state.settings);
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Nutrition</button><h1 class="display">Recettes</h1>
      <p class="muted">Vos préparations du dimanche et du mercredi : pesez une fois les ingrédients, l'application calcule une portion.</p></header>
    ${recipes.length ? `<div class="group">${recipes.map((r) => { const n = recipePortion(r, foods); return `<button class="row" data-action="recipe-edit" data-value="${esc(r.id)}"><span class="row-ic food">${icon('book')}</span><span class="row-main"><b>${esc(r.name)}</b><span>${r.portions} portions ; une portion : ${nf0(n.kcal)} kcal, ${nf0(n.p)} g de protéines</span></span><span class="row-end">${icon('chevron')}</span></button>`; }).join('')}</div>` : '<div class="empty">Aucune recette pour l\'instant.</div>'}
    <button class="btn big food" data-action="recipe-edit" data-value="">${icon('plus')} Nouvelle recette</button>
    <p class="muted small">${infoBtn('recipes')} Pesez de la même façon que la base : « riz cuit » se compte cuit.</p>`;
}

export function renderRecipeEdit(state) {
  const r = state.recipeDraft;
  const foods = allFoods(state.foodLib, state.settings);
  const n = recipePortion(r, foods);
  const q = state.recipeQuery || '';
  const results = q ? searchFoods(foods, q, 12) : [];
  return `
    <header class="page-head with-back"><button class="back" data-action="back">${icon('back')} Recettes</button><h1 class="display">${r.name ? esc(r.name) : 'Nouvelle recette'}</h1></header>
    <label class="field"><span class="field-label">Nom</span><input id="recipe-name" value="${esc(r.name)}" placeholder="Poulet, riz, légumes" autocomplete="off"></label>
    <label class="field"><span class="field-label">Nombre de portions</span><input id="recipe-portions" class="num-input" inputmode="numeric" value="${esc(r.portions)}"></label>
    <h3 class="section">Ingrédients (quantité totale)</h3>
    ${r.items.length ? `<div class="group tight">${r.items.map((it, i) => { const f = foods.find((x) => x.id === it.foodId); return `<div class="row"><span class="row-main"><b>${esc(f ? f.name : it.foodId)}</b><span>${f ? `${nf0(nutrients(f, it.grams).kcal)} kcal` : ''}</span></span><input class="num-input mini" inputmode="decimal" data-recipe-item="${i}" value="${nf(it.grams)}" aria-label="Grammes"><span class="unit">g</span><button class="icon-btn" data-action="recipe-remove" data-value="${i}" aria-label="Retirer">${icon('close')}</button></div>`; }).join('')}</div>` : '<p class="muted small">Ajoutez les ingrédients avec leur poids total pour toute la préparation.</p>'}
    <div class="search">${icon('search')}<input id="recipe-search" type="search" placeholder="Ajouter un ingrédient" value="${esc(q)}" autocomplete="off"></div>
    <div id="recipe-results">${results.length ? `<div class="group tight">${results.map((f) => `<button class="row" data-action="recipe-add" data-value="${esc(f.id)}"><span class="row-main"><b>${esc(f.name)}</b><span>${nf0(f.kcal)} kcal / 100 g</span></span><span class="row-end">${icon('plus')}</span></button>`).join('')}</div>` : ''}</div>
    <div class="preview big"><span>Une portion</span><b>${nf0(n.kcal)} kcal</b><span>P ${nf(n.p)} g · G ${nf(n.c)} g · L ${nf(n.f)} g · ${nf0(n.totalGrams / Math.max(1, r.portions))} g</span></div>
    ${state.recipeError ? `<div class="msg-err">${esc(state.recipeError)}</div>` : ''}
    <button class="btn big food" data-action="recipe-save">Enregistrer la recette</button>
    ${r.id && ((state.settings || {}).recipes || []).some((x) => x.id === r.id) ? `<button class="btn ghost danger-text" data-action="recipe-delete">${icon('trash')} Supprimer la recette</button>` : ''}`;
}

export function renderTargetsSheet(state) {
  const s = state.settings || {};
  const lw = latestWeight(state.entries || []);
  const p = { sex: 'male', age: 25, heightCm: 180, activity: 1.55, goal: 'lean-gain', ...(s.profile || {}) };
  const est = estimateTargets(p, lw ? lw.kg : null);
  const t = s.nutritionTargets || null;
  return `<h2>Objectifs nutritionnels</h2>
    <p class="muted small">Estimation de départ à partir de votre profil et de votre dernier poids (${lw ? `${nf(lw.kg)} kg` : 'aucune pesée : 79 kg par défaut'}). Elle s'ajuste ensuite selon la tendance du poids. ${infoBtn('calories')}</p>
    <form data-form="targets" class="form">
      <div class="field-row">
        <label class="field"><span class="field-label">Âge</span><input name="age" class="num-input" inputmode="numeric" value="${esc(p.age)}"></label>
        <label class="field"><span class="field-label">Taille (cm)</span><input name="heightCm" class="num-input" inputmode="numeric" value="${esc(p.heightCm)}"></label>
      </div>
      <label class="field"><span class="field-label">Objectif</span><select name="goal">
        <option value="lean-gain"${p.goal === 'lean-gain' ? ' selected' : ''}>Prendre du muscle en restant sec (+150 kcal)</option>
        <option value="maintain"${p.goal === 'maintain' ? ' selected' : ''}>Recomposition (maintien)</option>
        <option value="cut"${p.goal === 'cut' ? ' selected' : ''}>Sécher (−400 kcal)</option></select></label>
      <div class="preview"><span>Estimation</span><b>${nf0(est.kcal)} kcal</b><span>P ${est.protein} g · G ${est.carbs} g · L ${est.fat} g ; dépense estimée ${nf0(est.tdee)} kcal</span></div>
      <label class="check"><input type="checkbox" name="custom"${t ? ' checked' : ''}> Régler mes objectifs à la main</label>
      <div class="field-row">
        <label class="field"><span class="field-label">Calories</span><input name="kcal" class="num-input" inputmode="numeric" value="${esc(t ? t.kcal : est.kcal)}"></label>
        <label class="field"><span class="field-label">Protéines (g)</span><input name="protein" class="num-input" inputmode="numeric" value="${esc(t ? t.protein : est.protein)}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field-label">Glucides (g)</span><input name="carbs" class="num-input" inputmode="numeric" value="${esc(t ? t.carbs : est.carbs)}"></label>
        <label class="field"><span class="field-label">Lipides (g)</span><input name="fat" class="num-input" inputmode="numeric" value="${esc(t ? t.fat : est.fat)}"></label>
      </div>
      <button class="btn big food" type="submit">Enregistrer</button>
    </form>`;
}

export function renderCustomFoodSheet() {
  return `<h2>Créer un aliment</h2><p class="muted small">Recopiez les valeurs pour 100 g indiquées sur l'emballage.</p>
    <form data-form="custom-food" class="form">
      <label class="field"><span class="field-label">Nom</span><input name="name" required autocomplete="off" placeholder="Skyr vanille Siggi's"></label>
      <div class="field-row">
        <label class="field"><span class="field-label">kcal / 100 g</span><input name="kcal" class="num-input" inputmode="decimal" required></label>
        <label class="field"><span class="field-label">Protéines</span><input name="p" class="num-input" inputmode="decimal" required></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field-label">Glucides</span><input name="c" class="num-input" inputmode="decimal" required></label>
        <label class="field"><span class="field-label">Lipides</span><input name="f" class="num-input" inputmode="decimal" required></label>
      </div>
      <div class="field-row">
        <label class="field"><span class="field-label">Portion (facultatif)</span><input name="portionLabel" placeholder="1 pot"></label>
        <label class="field"><span class="field-label">Poids de la portion (g)</span><input name="portionG" class="num-input" inputmode="decimal"></label>
      </div>
      <button class="btn big food" type="submit">Créer l'aliment</button>
    </form>`;
}
