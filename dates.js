// Calendrier du cycle. Toutes les semaines sont recalculées à partir de la date de début effective :
// rien n'est enregistré en « numéro de semaine », donc changer la date de début ne fausse rien.
// Les dates sont des chaînes AAAA-MM-JJ (date locale de l'appareil), sans heure ni fuseau.

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_FR = { monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi', thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche' };
const MONTH_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export const isIsoDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toDayNumber(s) !== null;

/** Numéro de jour absolu (indépendant des heures d'été). */
export function toDayNumber(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(t / 86400000);
}

export function fromDayNumber(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}

export const addDays = (iso, n) => fromDayNumber(toDayNumber(iso) + n);

/** Date du jour selon l'horloge locale de l'appareil. */
export function todayLocal(now = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const dayKey = (iso) => DAY_KEYS[new Date(toDayNumber(iso) * 86400000).getUTCDay()];
export const isMonday = (iso) => isIsoDate(iso) && dayKey(iso) === 'monday';
export const mondayOf = (iso) => addDays(iso, -((new Date(toDayNumber(iso) * 86400000).getUTCDay() + 6) % 7));

/** « lundi 2 novembre » ; avec l'année si demandée. */
export function formatDateFr(iso, { year = false, weekday = true } = {}) {
  const d = new Date(toDayNumber(iso) * 86400000);
  const txt = `${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MONTH_FR[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
  return weekday ? `${DAY_FR[dayKey(iso)]} ${txt}` : txt;
}

export const dayFr = (key) => DAY_FR[key];

/**
 * Position d'une date dans le cycle.
 * status : 'before' (pas encore commencé), 'during', 'after' (terminé).
 */
export function cycleInfo(program, iso) {
  const start = toDayNumber(program.startDate);
  const day = toDayNumber(iso);
  // Calendrier effectif (bilans de semaine : semaine maintenue, décharge) : program.calendar,
  // liste des semaines réelles [{ week, deload }]. Sans calendrier : une semaine du programme par semaine réelle.
  const cal = Array.isArray(program.calendar) && program.calendar.length ? program.calendar : null;
  const totalWeeks = cal ? cal.length : program.weeks;
  const end = start + totalWeeks * 7 - 1;
  const base = { startDate: program.startDate, endDate: fromDayNumber(end), dayKey: dayKey(iso), totalWeeks };
  if (day < start) return { ...base, status: 'before', daysUntilStart: start - day, week: null, calWeek: null, deload: false };
  if (day > end) return { ...base, status: 'after', daysSinceEnd: day - end, week: null, calWeek: null, deload: false };
  const calWeek = Math.floor((day - start) / 7) + 1;
  const entry = cal ? cal[calWeek - 1] : { week: calWeek, deload: false };
  return { ...base, status: 'during', calWeek, week: entry.week, deload: !!entry.deload, dayOfCycle: day - start + 1, weekStart: fromDayNumber(start + (calWeek - 1) * 7) };
}

/** Date réelle de la séance d'un jour donné, pour une semaine donnée du cycle. */
export function sessionDate(program, week, dayKeyName) {
  const offset = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(dayKeyName);
  return addDays(program.startDate, (week - 1) * 7 + offset);
}

/** Date d'un jour donné dans la semaine réelle n (calendrier effectif). */
export const calDate = (program, calWeek, dayKeyName) => sessionDate(program, calWeek, dayKeyName);

/**
 * Vérifie une nouvelle date de début proposée par l'utilisateur.
 * Retourne { ok, errors, suggestion } ; suggestion = lundi de la même semaine si la date n'est pas un lundi.
 */
export function checkStartDate(iso, { today } = {}) {
  if (!isIsoDate(iso)) return { ok: false, errors: ['Date invalide.'] };
  const errors = [];
  let suggestion = null;
  if (!isMonday(iso)) {
    suggestion = mondayOf(iso);
    errors.push(`Un cycle commence un lundi. Le lundi de cette semaine est le ${formatDateFr(suggestion)}.`);
  }
  if (today && isIsoDate(today)) {
    const diff = toDayNumber(iso) - toDayNumber(today);
    if (diff > 366 || diff < -366) errors.push('La date doit se situer à moins d\'un an d\'aujourd\'hui.');
  }
  return { ok: errors.length === 0, errors, suggestion };
}

/**
 * Programme effectif : le programme du fichier, avec la date de début choisie par l'utilisateur si elle
 * concerne ce programme (même identifiant). Le fichier JSON n'est jamais modifié.
 */
export function effectiveProgram(program, override) {
  if (!override || override.programId !== program.id || !isMonday(override.startDate)) return program;
  return { ...program, startDate: override.startDate };
}
