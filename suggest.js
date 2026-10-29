// Règles de suggestion (cahier des charges V1.2, « Règles de suggestion ») : la double progression du programme.
// On ajoute des répétitions dans la fourchette, puis de la charge quand toutes les séries atteignent le haut
// de la fourchette au RIR demandé. Une suggestion n'est jamais appliquée seule : elle pré-remplit la saisie,
// affiche sa raison, et l'utilisateur reste libre.
// Module pur, sans accès au stockage ni au navigateur.

export const fmtKg = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : `${String(Math.round(x * 100) / 100).replace('.', ',')}`);

/**
 * Comment se saisit la charge pour un emplacement :
 * 'none' : pas de charge (sauts, gainage) ; 'added' : lest au poids du corps ; 'external' : haltères, barre, machine.
 */
export function loadMode(item, increment) {
  if (item.category === 'explosive') return 'none';
  const t = increment && increment.type;
  if (t === 'none') return 'none';
  if (t === 'bodyweight') return 'added';
  return 'external';
}

export function loadLabel(item, increment) {
  const t = increment && increment.type;
  if (t === 'dumbbell') return 'kg par haltère';
  if (t === 'barbell') return 'kg au total, barre comprise';
  if (t === 'machine') return 'kg affichés';
  if (t === 'bodyweight') return 'lest en kg (0 = poids du corps)';
  return 'kg';
}

/** Pas de réglage de la charge pour les boutons − / +. */
export function loadStep(increment) {
  if (!increment) return 2.5;
  if (increment.type === 'bodyweight') return increment.loadStepKg || 2.5;
  if (increment.type === 'none') return 0;
  return increment.stepKg || 2.5;
}

const roundTo = (x, step) => (step > 0 ? Math.round(x / step) * step : x);
const maxLoad = (sets) => Math.max(...sets.map((s) => Number(s.loadKg) || 0));
const totalReps = (sets) => sets.reduce((n, s) => n + (Number(s.reps) || 0), 0);
const isUnder = (sets, min) => sets.filter((s) => s.reps < min).length > sets.length / 2;

/** Meilleure série : charge la plus haute, puis le plus de répétitions. */
export function bestSet(sets) {
  return sets.reduce((b, s) => (!b || (s.loadKg || 0) > (b.loadKg || 0) || ((s.loadKg || 0) === (b.loadKg || 0) && s.reps > b.reps) ? s : b), null);
}

/** Même charge et même total de répétitions sur les trois dernières séances. */
export function isStagnating(history) {
  if (history.length < 3) return false;
  const [a, b, c] = history;
  return maxLoad(a.sets) === maxLoad(b.sets) && maxLoad(b.sets) === maxLoad(c.sets)
    && totalReps(a.sets) === totalReps(b.sets) && totalReps(b.sets) === totalReps(c.sets);
}

/**
 * Suggestion pour un emplacement.
 * item : élément de la séance (resolveSession) ; increment : règle d'incrément de l'emplacement ;
 * history : séances passées du même exercice au même emplacement, la plus récente d'abord,
 *           chacune { date, sets: [{ loadKg, reps, rir }] } (séries de travail uniquement) ;
 * fatigue : fatigue déclarée aujourd'hui (1 à 5) ou null.
 * Retourne { kind, title, reason, load, reps, options, warnings, stagnation }.
 */
export function suggest({ item, increment, history = [], fatigue = null, deload = false }) {
  const { min, max } = item.reps;
  const rirTarget = item.rir ? item.rir.min : null;
  const mode = loadMode(item, increment);
  const out = { kind: 'hold', title: '', reason: '', load: null, reps: min, options: [], warnings: [], stagnation: false };
  const fatigueHigh = fatigue !== null && fatigue >= 4;

  if (item.category === 'explosive') {
    return { ...out, kind: 'explosive', title: 'Qualité avant tout', reason: 'Sauts rapides et propres, réception silencieuse. Pas de charge à suivre.', reps: max };
  }
  if (!history.length) {
    return {
      ...out,
      kind: 'calibration',
      title: 'Calibration',
      reason: mode === 'external'
        ? `Première fois : choisissez une charge qui laisse ${rirTarget ?? 3} répétition${rirTarget === 1 ? '' : 's'} en réserve à la fin de chaque série de ${min}–${max}.`
        : `Première fois : faites ${min}–${max} répétitions propres en gardant ${rirTarget ?? 3} répétitions en réserve.`,
      load: mode === 'added' ? 0 : null,
    };
  }

  const last = history[0];
  const sets = last.sets;
  if (deload) {
    const l = maxLoad(sets);
    return { ...out, kind: 'deload', title: mode === 'none' ? 'Semaine de décharge' : `Décharge : rester à ${fmtKg(l)} kg`, reason: 'Semaine de décharge : moitié des séries, mêmes charges, RIR 3–4. On récupère pour mieux repartir.', load: mode === 'none' ? null : l, reps: Math.max(min, Math.min(max, sets[0].reps - 1)) };
  }
  const load = maxLoad(sets);
  const step = loadStep(increment);
  const threshold = max + ((increment && increment.extraRepsBeforeIncrease) || 0);
  const allTop = sets.every((s) => s.reps >= threshold);
  const rirOk = sets.every((s) => s.rir === null || s.rir === undefined || rirTarget === null || s.rir >= rirTarget);
  out.load = mode === 'none' ? null : load;
  out.stagnation = isStagnating(history);
  if (out.stagnation) out.warnings.push('Stagnation : même charge et même total de répétitions trois séances de suite. À traiter au bilan.');

  if (allTop && rirOk) {
    if (fatigueHigh) {
      return { ...out, kind: 'fatigue', title: `Rester à ${fmtKg(load)} kg`, reason: 'Prêt à monter, mais fatigue 4 ou 5 aujourd\'hui : pas d\'augmentation ce jour-là.', reps: max };
    }
    if (mode === 'none') {
      return { ...out, kind: 'hold', title: 'Haut de fourchette atteint', reason: `Toutes les séries à ${threshold} : ralentissez la descente ou ajoutez une pause en bas pour rendre l'exercice plus dur.`, reps: max };
    }
    if (mode === 'added') {
      const add = increment.addLoadWhenAllSetsReach;
      if (!increment.loadStepKg) {
        return { ...out, kind: 'hold', title: 'Ajouter des répétitions', reason: `Toutes les séries à ${max} ou plus. Pas de lest prévu sur ce cycle : visez une répétition de plus, sans élan.`, reps: Math.min(max + 2, sets[0].reps + 1) };
      }
      if (add && sets.every((s) => s.reps >= add)) {
        const next = load + increment.loadStepKg;
        return { ...out, kind: 'increase', title: `Ajouter du lest : ${fmtKg(next)} kg`, reason: `Toutes les séries à ${add} répétitions : on ajoute ${fmtKg(increment.loadStepKg)} kg et on vise ${min}.`, load: next, reps: min };
      }
    }
    const next = Math.round((load + step) * 100) / 100;
    if (load > 0 && step / load > 0.1) {
      return {
        ...out,
        kind: 'choice',
        title: 'Prêt à monter : deux options',
        reason: `Toutes les séries à ${threshold} ou plus au RIR demandé. Le prochain cran (+${fmtKg(step)} kg) représente plus de 10 % de la charge.`,
        load: next,
        reps: min,
        options: [
          { label: `Monter à ${fmtKg(next)} kg, viser ${min}`, load: next, reps: min },
          { label: `Rester à ${fmtKg(load)} kg, viser ${threshold + 1}–${threshold + 2}`, load, reps: threshold + 1 },
        ],
      };
    }
    return { ...out, kind: 'increase', title: `Monter à ${fmtKg(next)} kg`, reason: `Toutes les séries à ${threshold} ou plus au RIR demandé la dernière fois : +${fmtKg(step)} kg, en visant ${min} répétitions.`, load: next, reps: min };
  }

  if (allTop && !rirOk) {
    return { ...out, kind: 'consolidate', title: `Rester à ${fmtKg(load)} kg`, reason: `Haut de fourchette atteint, mais avec moins de ${rirTarget} répétitions en réserve que prévu : on consolide avant de monter.`, reps: max };
  }

  if (isUnder(sets, min)) {
    const prev = history[1];
    if (prev && maxLoad(prev.sets) === load && isUnder(prev.sets, min) && mode === 'external') {
      const lower = Math.max(0, roundTo(load * 0.925, step || 0.5));
      return {
        ...out,
        kind: 'choice',
        title: 'Deux séances sous la fourchette',
        reason: `Deux fois de suite sous ${min} répétitions à ${fmtKg(load)} kg. Deux options, sans préférence.`,
        reps: min,
        options: [
          { label: `Garder ${fmtKg(load)} kg`, load, reps: min },
          { label: `Revenir à ${fmtKg(lower)} kg (≈ −7 %)`, load: lower, reps: min },
        ],
      };
    }
    return { ...out, kind: 'under', title: `Rester à ${fmtKg(load)} kg`, reason: `Dernière fois sous ${min} répétitions. Même charge ; causes fréquentes : sommeil, fatigue, technique.`, reps: min };
  }

  // Progression dans la fourchette : +1 répétition sur la première série incomplète.
  const idx = sets.findIndex((s) => s.reps < threshold);
  const target = Math.min(threshold, sets[idx].reps + 1);
  const where = mode === 'none' ? '' : `Même charge (${fmtKg(load)} kg). `;
  return {
    ...out,
    kind: 'progress',
    title: mode === 'none' ? `Objectif : ${target} sur la série ${idx + 1}` : `${fmtKg(load)} kg · objectif ${target} sur la série ${idx + 1}`,
    reason: `${where}Ajoutez 1 répétition sur la série ${idx + 1} (${sets[idx].reps} → ${target}) : c'est comme ça qu'on avance vers le haut de la fourchette.${fatigueHigh ? ' Fatigue 4 ou 5 : refaire la même chose est déjà bien.' : ''}`,
    reps: target,
    targets: sets.map((s, i) => (i === idx ? target : s.reps)),
  };
}

/** Avertissement si le RIR saisi passe sous le plancher de l'emplacement. */
export function rirFloorWarning(item, rir) {
  if (item.rirFloor === null || item.rirFloor === undefined || rir === null || rir === undefined) return null;
  return rir < item.rirFloor ? `Le programme prévoit au moins RIR ${item.rirFloor} sur cet exercice.` : null;
}
