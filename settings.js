// Réglage de la date de début du cycle, sans jamais modifier le fichier programme.
// La valeur est gardée sur l'appareil (IndexedDB, clé « cycle-start ») avec l'historique des changements,
// pour que les bilans sachent à quelles dates le cycle a réellement commencé.
import { checkStartDate } from './dates.js';

export const START_KEY = 'cycle-start';

/**
 * Calcule le nouveau réglage. Fonction pure : aucune écriture ici.
 * override : réglage actuel (ou undefined) ; program : programme du fichier ; newDate : date choisie.
 */
export function applyStartDateChange(override, program, newDate, { now = new Date().toISOString(), today } = {}) {
  const current = override && override.programId === program.id ? override : null;
  const before = current ? current.startDate : program.startDate;
  const check = checkStartDate(newDate, { today });
  if (!check.ok) return { ok: false, errors: check.errors, suggestion: check.suggestion };
  if (newDate === before) return { ok: false, errors: ['C\'est déjà la date de début actuelle.'] };
  const history = current ? [...current.history] : [];
  history.push({ from: before, to: newDate, changedAt: now });
  return {
    ok: true,
    override: { programId: program.id, programVersion: program.version, fileStartDate: program.startDate, startDate: newDate, history },
  };
}

/** Revenir à la date prévue dans le fichier programme (l'historique est conservé). */
export function resetStartDate(override, program, { now = new Date().toISOString() } = {}) {
  if (!override || override.programId !== program.id || override.startDate === program.startDate) {
    return { ok: false, errors: ['La date de début est déjà celle du programme.'] };
  }
  const history = [...override.history, { from: override.startDate, to: program.startDate, changedAt: now }];
  return { ok: true, override: { ...override, startDate: program.startDate, history } };
}
