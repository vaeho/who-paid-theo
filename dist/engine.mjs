export const WINDOWS = Object.freeze([5, 10, 15, 20]);
export const normalize = value => String(value ?? '').trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');

export function validateRound(round) {
  if (!round || typeof round !== 'object') throw Error('A round must be an object.');
  for (const key of ['id', 'answer', 'title']) {
    if (typeof round[key] !== 'string' || !round[key].trim() || round[key].length > 300) throw Error(`Invalid ${key}.`);
  }
  if (!['youtube', 'audio'].includes(round.kind)) throw Error('Unsupported source.');
  if (!Number.isFinite(round.start) || round.start < 0) throw Error('Invalid setup start.');
  const cutoff = round.safeEnd ?? round.reveal - 1;
  if (!Number.isFinite(cutoff) || cutoff - round.start < 20) throw Error('A full 20-second pre-brand setup is required.');
  if (round.hintDurations && ![JSON.stringify(WINDOWS), '[5,10,20]'].includes(JSON.stringify(round.hintDurations))) throw Error('Every playable round must offer 5, 10, 15 and 20 seconds.'); // Legacy metadata upgrades to the same fixed windows at runtime.
  if (round.kind === 'youtube') {
    const reviewed = round.verified === true && round.visualSafe === true;
    const beta = round.status === 'beta' && round.captionChecked === true && round.visualChecked === true;
    if (!/^[a-zA-Z0-9_-]{11}$/.test(round.videoId) || !(reviewed || beta) || !round.evidence || !round.reviewedBy) throw Error('Missing source review evidence.');
    if (!round.startAudit || !round.creativeId) throw Error('A defensible setup start and creative identifier are required.');
  }
  if (round.kind === 'audio' && !round.authorized) throw Error('Audio requires permission.');
  if (round.aliases && (!Array.isArray(round.aliases) || round.aliases.some(alias => typeof alias !== 'string'))) throw Error('Invalid aliases.');
  return round;
}

export function hints() { return [...WINDOWS]; }
export function score(unlocked, wrong = 0) { return Math.max(100, 1000 - unlocked * 250 - wrong * 75); }
export function correct(round, guess) { return [round.answer, ...(round.aliases ?? [])].some(alias => normalize(alias) === normalize(guess)); }
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function dailyIndex(date, count) {
  let hash = 0;
  for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return count ? hash % count : -1;
}
export function importRounds(value) {
  if (!Array.isArray(value)) throw Error('Import a JSON array.');
  const ids = new Set(), creatives = new Set();
  return value.map(round => {
    validateRound(round);
    if (ids.has(round.id)) throw Error('Duplicate occurrence ID: ' + round.id);
    if (round.creativeId && creatives.has(round.creativeId)) throw Error('Repeated creative: ' + round.creativeId);
    ids.add(round.id); creatives.add(round.creativeId);
    return round;
  });
}
export function catalogue(rounds) {
  const brands = new Map();
  for (const round of rounds) {
    const key = normalize(round.answer);
    const brand = brands.get(key) ?? { name: round.answer, aliases: [], count: 0 };
    brand.aliases = [...new Set([...brand.aliases, ...(round.aliases ?? [])])];
    brand.count++;
    brands.set(key, brand);
  }
  return [...brands.values()].sort((a, b) => a.name.localeCompare(b.name));
}
export function resolveBrand(input, brands) {
  const key = normalize(input);
  return key ? brands.find(brand => [brand.name, ...brand.aliases].some(alias => normalize(alias) === key)) ?? null : null;
}
export function suggestions(input, brands) {
  const key = normalize(input);
  if (!key) return [];
  return brands.filter(brand => [brand.name, ...brand.aliases].some(alias => normalize(alias).includes(key))).sort((a, b) => Number(!normalize(a.name).startsWith(key)) - Number(!normalize(b.name).startsWith(key))).slice(0, 6);
}
export function createGame(round) {
  validateRound(round);
  return { round, stage: 0, unlocked: 0, wrong: 0, attempts: 0, guessed: [], status: 'guessing', message: '', points: 1000 };
}
export function unlock(state) {
  if (state.status !== 'guessing') return state;
  const unlocked = Math.min(WINDOWS.length - 1, state.unlocked + 1);
  return { ...state, stage: unlocked, unlocked, points: score(unlocked, state.wrong), message: unlocked === state.unlocked ? 'All 20 seconds are unlocked. Keep guessing, replay, or reveal when you’re ready.' : `${WINDOWS[unlocked]} seconds unlocked.` };
}
export function selectHint(state, stage) {
  return state.status === 'guessing' && Number.isInteger(stage) && stage >= 0 && stage <= state.unlocked ? { ...state, stage } : state;
}
export function guess(state, input, brands) {
  if (state.status !== 'guessing') return state;
  const brand = resolveBrand(input, brands);
  if (!brand) return { ...state, message: input.trim() ? 'That brand isn’t in this library. Try a suggested spelling or visit Sponsors.' : 'Type a sponsor name first.' };
  const key = normalize(brand.name);
  if (state.guessed.includes(key)) return { ...state, message: 'You already tried that sponsor. No extra penalty — try another.' };
  const attempts = state.attempts + 1, guessed = [...state.guessed, key];
  if (correct(state.round, brand.name)) return { ...state, attempts, guessed, status: 'correct', points: score(state.unlocked, state.wrong), message: 'Called it.' };
  const wrong = state.wrong + 1, unlocked = Math.min(WINDOWS.length - 1, state.unlocked + 1);
  return { ...state, attempts, guessed, wrong, unlocked, stage: unlocked, points: score(unlocked, wrong), message: unlocked > state.unlocked ? `Not quite. ${WINDOWS[unlocked]} seconds unlocked.` : 'Not quite. Keep guessing — or replay the full 20 seconds.' };
}
export function reveal(state) {
  return state.status === 'guessing' ? { ...state, status: 'revealed', points: 0, message: 'Mystery solved.' } : state;
}
export class RoundDeck {
  constructor(rounds, random = Math.random) { this.rounds = rounds; this.random = random; this.queue = []; this.cycle = 0; this.position = 0; }
  next() {
    if (!this.rounds.length) return null;
    if (!this.queue.length) { this.queue = shuffle(this.rounds, this.random); this.position = 0; this.cycle++; }
    this.position++;
    return this.queue.pop();
  }
  remove(id) { this.rounds = this.rounds.filter(round => round.id !== id); this.queue = this.queue.filter(round => round.id !== id); }
}
