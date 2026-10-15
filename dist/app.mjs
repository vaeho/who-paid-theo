import { getAudio } from './audio-store.mjs';
import { WINDOWS, catalogue, suggestions, createGame, guess, unlock, selectHint, reveal, RoundDeck, validateRound, dailyIndex } from './engine.mjs';
const $ = selector => document.querySelector(selector);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Session remains playable without storage. */ } };
const defaultStats = { played: 0, wins: 0, points: 0, best: 0, streak: 0 };
let stats = read('sg-stats', defaultStats), reports = read('sg-reports', []);
if (!stats || typeof stats !== 'object') stats = { ...defaultStats };
for (const key of Object.keys(defaultStats)) if (!Number.isFinite(stats[key]) || stats[key] < 0) stats[key] = 0;
if (!Array.isArray(reports)) reports = [];
let rounds = [], brands = [], deck, state, mode = 'free', recorded = false, lastSubmit = 0, lastAdvance = 0;
let matches = [], selected = -1, listDismissed = false;
const placeholder = $('#media-area').innerHTML;
let mediaEpoch = 0, player = null, audio = null, timer = null, readinessTimer = null, busy = false, playing = false;
let apiPromise;
const text = (selector, value) => { $(selector).textContent = value; };
const mediaStatus = value => text('#media-status', value);
function setPlaying(value) {
  playing = value;
  text('#play-icon', value ? 'Ⅱ' : '▶');
  text('#play-label', value ? 'Pause' : `Play ${WINDOWS[state?.stage ?? 0]} seconds`);
}
function progress(seconds) {
  const duration = WINDOWS[state?.stage ?? 0];
  const percent = Math.max(0, Math.min(100, seconds / duration * 100));
  $('#progress-fill').style.width = percent + '%';
  $('.progress').setAttribute('aria-valuenow', String(Math.round(percent)));
  text('#elapsed', `0:${String(Math.floor(Math.max(0, seconds))).padStart(2, '0')}`);
}
function pauseMedia() {
  try { player?.pauseVideo(); } catch { /* Player may already have been removed. */ }
  audio?.pause();
  setPlaying(false);
}
function destroyMedia(restore = true) {
  mediaEpoch++;
  clearInterval(timer); clearTimeout(readinessTimer);
  timer = null; readinessTimer = null;
  pauseMedia();
  try { player?.destroy(); } catch { /* Idempotent cleanup. */ }
  player = null;
  if (audio) { audio.pause(); audio.removeAttribute('src'); audio = null; }
  busy = false;
  if (restore) $('#media-area').innerHTML = placeholder;
}
function youtubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { apiPromise = null; reject(Error('YouTube did not load. Check your connection or blocker.')); }, 12000);
    window.onYouTubeIframeAPIReady = () => { clearTimeout(timeout); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { clearTimeout(timeout); apiPromise = null; reject(Error('YouTube is blocked or unavailable.')); };
    document.head.append(script);
  });
  return apiPromise;
}
function mediaFailure(message, epoch) {
  if (epoch !== mediaEpoch) return;
  clearTimeout(readinessTimer); clearInterval(timer);
  busy = false; pauseMedia();
  mediaStatus(message + ' Open the full video, retry, or skip this unavailable clip.');
  $('#unavailable-next').hidden = false;
  renderControls();
}
async function play(restart = false) {
  if (!state || state.status !== 'guessing' || busy) return;
  if (playing && !restart) { pauseMedia(); return; }
  destroyMedia(false);
  const epoch = mediaEpoch, current = state.round, duration = WINDOWS[state.stage];
  const active = () => epoch === mediaEpoch && state?.round === current && state.status === 'guessing';
  const end = current.start + duration;
  busy = true; renderControls(); progress(0);
  $('#unavailable-next').hidden = true;
  mediaStatus('Loading player…');
  $('#media-area').scrollIntoView({ block: 'center', behavior: 'instant' });
  try {
    if (current.kind === 'audio') {
      let url = localAudio.get(current.id);
      if (!url) { const file = await getAudio(current.id); if (!active()) return; if (!file) throw Error('Re-add this authorized audio file in the editor.'); url = URL.createObjectURL(file); localAudio.set(current.id, url); }
      const instance = new Audio(url); audio = instance;
      instance.onerror = () => { if (active() && audio === instance) mediaFailure('Audio could not play.', epoch); };
      instance.onended = () => { if (active() && audio === instance) { setPlaying(false); mediaStatus('Hint complete.'); } };
      instance.currentTime = current.start;
      await instance.play();
      if (!active()) { instance.pause(); return; }
      busy = false; setPlaying(true); mediaStatus('Listening…'); renderControls();
      timer = setInterval(() => {
        if (!active()) return clearInterval(timer);
        progress(instance.currentTime - current.start);
        if (instance.currentTime >= end - .1) { instance.pause(); clearInterval(timer); progress(duration); setPlaying(false); mediaStatus('Hint complete.'); }
      }, 50);
      return;
    }
    const YT = await youtubeAPI();
    if (!active()) return;
    $('#media-area').innerHTML = '<div id="youtube-player"></div>';
    let started = false, instance;
    const belongs = () => active() && player === instance;
    readinessTimer = setTimeout(() => mediaFailure('The embedded player did not become ready.', epoch), 12000);
    instance = new YT.Player('youtube-player', {
      host: 'https://www.youtube-nocookie.com', videoId: current.videoId, width: '100%', height: '100%',
      playerVars: { controls: 1, playsinline: 1, start: Math.floor(current.start), end: Math.ceil(end), origin: location.origin },
      events: {
        onReady: () => {
          if (!belongs()) { try { instance.destroy(); } catch {} return; }
          clearTimeout(readinessTimer); busy = false;
          instance.loadVideoById({ videoId: current.videoId, startSeconds: current.start, endSeconds: end });
          mediaStatus('Press play in the video if your browser blocks playback.'); renderControls();
          timer = setInterval(() => {
            if (!belongs()) return;
            const position = instance.getCurrentTime?.() ?? 0;
            if (position >= current.start - .2) started = true;
            if (!started) return;
            progress(position - current.start);
            if (position >= end - .15) { instance.pauseVideo(); clearInterval(timer); progress(duration); setPlaying(false); mediaStatus('Hint complete.'); }
          }, 50);
        },
        onStateChange: event => {
          if (!belongs()) return;
          if (event.data === 1) { setPlaying(true); mediaStatus('Listening…'); }
          if (event.data === 2) setPlaying(false);
          if (event.data === 0 && started) { setPlaying(false); progress(duration); mediaStatus('Hint complete.'); }
        },
        onError: event => { if (belongs()) mediaFailure(`YouTube playback unavailable (${event.data}).`, epoch); }
      }
    });
    player = instance;
  } catch (error) { if (active()) mediaFailure(error.message, epoch); }
}
function closeSuggestions() {
  $('#suggestions').hidden = true;
  $('#answer').setAttribute('aria-expanded', 'false');
  $('#answer').removeAttribute('aria-activedescendant');
  selected = -1;
}
function showSuggestions() {
  if (!state || state.status !== 'guessing' || listDismissed) return closeSuggestions();
  matches = suggestions($('#answer').value, brands); selected = -1;
  const list = $('#suggestions'); list.replaceChildren();
  if (!matches.length) return closeSuggestions();
  matches.forEach((brand, index) => {
    const option = document.createElement('li');
    option.id = 'suggestion-' + index; option.role = 'option'; option.textContent = brand.name;
    option.setAttribute('aria-selected', 'false');
    option.addEventListener('pointerdown', event => { event.preventDefault(); chooseSuggestion(index); });
    list.append(option);
  });
  list.hidden = false; $('#answer').setAttribute('aria-expanded', 'true');
}
function chooseSuggestion(index) {
  if (!matches[index]) return;
  $('#answer').value = matches[index].name; listDismissed = true; closeSuggestions(); $('#answer').focus();
}
function highlight(index) {
  selected = index;
  [...$('#suggestions').children].forEach((option, i) => option.setAttribute('aria-selected', i === index ? 'true' : 'false'));
  const option = $('#suggestions').children[index];
  if (option) { $('#answer').setAttribute('aria-activedescendant', option.id); option.scrollIntoView({ block: 'nearest' }); }
}
$('#answer').addEventListener('input', () => { listDismissed = false; showSuggestions(); });
$('#answer').addEventListener('keydown', event => {
  if (event.key === 'Escape') { listDismissed = true; closeSuggestions(); return; }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault(); listDismissed = false;
    if ($('#suggestions').hidden) showSuggestions();
    if (matches.length) highlight(selected < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
  }
  if (event.key === 'Enter' && !$('#suggestions').hidden && selected >= 0) { event.preventDefault(); chooseSuggestion(selected); }
});
$('#answer').addEventListener('blur', () => { setTimeout(closeSuggestions, 100); });
function renderControls() {
  const done = !state || state.status !== 'guessing';
  $('#play').disabled = done || busy; $('#replay').disabled = done || busy;
  $('#submit').disabled = done; $('#answer').disabled = done; $('#reveal').disabled = done;
  $('#skip').disabled = done || state.unlocked === WINDOWS.length - 1;
}
function render() {
  if (!state) return;
  renderControls();
  const done = state.status !== 'guessing';
  text('#points', state.points.toLocaleString() + ' PTS');
  text('#end-time', `0:${String(WINDOWS[state.stage]).padStart(2, '0')}`);
  if (!playing) setPlaying(false);
  text('#attempts', state.attempts ? `${state.attempts} ${state.attempts === 1 ? 'GUESS' : 'GUESSES'}` : '');
  text('#feedback', state.message);
  $('#feedback').className = 'feedback' + (state.status === 'correct' ? ' correct' : '');
  text('#skip', state.unlocked === WINDOWS.length - 1 ? 'All 20 seconds unlocked' : `Unlock ${WINDOWS[state.unlocked + 1]} seconds →`);
  $('#steps').replaceChildren(...WINDOWS.map((seconds, index) => {
    const button = document.createElement('button'); button.textContent = seconds + 's';
    button.disabled = index > state.unlocked || done;
    button.className = index <= state.unlocked ? 'unlocked' : '';
    button.setAttribute('aria-pressed', index === state.stage ? 'true' : 'false');
    button.setAttribute('aria-label', `${seconds} second hint${index > state.unlocked ? ', locked' : ''}`);
    button.onclick = () => { if (state.status !== 'guessing') return; destroyMedia(); state = selectHint(state, index); progress(0); mediaStatus('Ready to replay.'); render(); };
    return button;
  }));
  $('#guess-form').hidden = done; $('#hint-block').hidden = done; $('#result').hidden = !done;
  text('#guess-state', done ? state.status === 'correct' ? 'CORRECT' : 'ANSWER REVEALED' : 'YOUR GUESS');
  $('#guess-title').hidden = done;
  if (done) {
    closeSuggestions();
    text('#result-answer', state.round.answer);
    text('#result-detail', state.status === 'correct' ? `+${state.points.toLocaleString()} points · ${WINDOWS[state.unlocked]}s unlocked · ${state.attempts} ${state.attempts === 1 ? 'guess' : 'guesses'}` : 'No points this round. A fresh setup is waiting.');
    $('#ad-link').href = sourceURL(state.round);
    $('#ad-link').hidden = state.round.kind !== 'youtube';
    text('#next', mode === 'daily' ? 'Back to shuffle →' : 'Next clip →');
    if (!recorded) {
      recorded = true; stats.played++; stats.wins += state.status === 'correct' ? 1 : 0;
      stats.points += state.points; stats.best = Math.max(stats.best, state.points); stats.streak = state.status === 'correct' ? stats.streak + 1 : 0;
      save('sg-stats', stats);
    }
  }
}
function sourceURL(round) { return round.kind === 'youtube' ? `https://www.youtube.com/watch?v=${round.videoId}&t=${Math.floor(round.start)}` : '#'; }
function begin(round) {
  destroyMedia(); state = createGame(round); recorded = false; lastSubmit = 0; lastAdvance = 0; closeSuggestions();
  $('#answer').value = ''; $('#content-state').hidden = true; $('#unavailable-next').hidden = true;
  text('#round-label', mode === 'daily' ? 'DAILY · ' + new Date().toISOString().slice(0, 10) : `CLIP ${deck.position} / ${rounds.length}`);
  $('#source-link').hidden = round.kind !== 'youtube'; $('#source-link').href = sourceURL(round);
  $('#report').hidden = false;
  progress(0); mediaStatus('5 seconds. Make them count.'); render();
}
function empty(message) {
  destroyMedia(); state = null; closeSuggestions(); renderControls(); $('#guess-form').hidden = false; $('#hint-block').hidden = false; $('#result').hidden = true; $('#guess-title').hidden = false; $('#unavailable-next').hidden = true; $('#answer').value = ''; text('#feedback', '');
  text('#round-label', 'NO CLIPS AVAILABLE'); mediaStatus(''); $('#report').hidden = true; $('#source-link').hidden = true;
  $('#content-state').hidden = false; text('#content-state', message);
}
function next(override = false) {
  if (!override && state?.status === 'guessing') return;
  if (mode === 'daily') { mode = 'free'; syncMode(); }
  const round = deck?.next();
  if (round) begin(round); else empty('No available clips remain. Restore reported clips in Your stats, or reload to try again.');
}
$('#guess-form').onsubmit = event => {
  event.preventDefault();
  if (!state || state.status !== 'guessing' || Date.now() - lastSubmit < 300) return;
  lastSubmit = Date.now(); closeSuggestions();
  const previous = state; state = guess(state, $('#answer').value, brands);
  if (state.unlocked !== previous.unlocked || state.status !== 'guessing') { destroyMedia(); progress(0); }
  if (state.attempts > previous.attempts && state.status === 'guessing') $('#answer').value = '';
  render();
  if (state.status !== 'guessing') $('#next').focus();
};
$('#skip').onclick = () => {
  if (!state || state.status !== 'guessing' || state.unlocked === WINDOWS.length - 1 || Date.now() - lastAdvance < 300) return;
  lastAdvance = Date.now(); destroyMedia(); state = unlock(state); progress(0); mediaStatus('Ready when you are.'); render();
};
$('#reveal').onclick = () => {
  if (!state || state.status !== 'guessing') return;
  destroyMedia(); state = reveal(state); render(); $('#next').focus();
};
$('#next').onclick = () => { if (!state || state.status === 'guessing') return; next(); };
$('#play').onclick = () => play(); $('#replay').onclick = () => play(true);
$('#unavailable-next').onclick = () => next(true);
function syncMode() { $('#freeplay').setAttribute('aria-pressed', mode === 'free'); $('#daily').setAttribute('aria-pressed', mode === 'daily'); }
$('#freeplay').onclick = () => { if (mode === 'free') return; mode = 'free'; syncMode(); next(true); };
$('#daily').onclick = () => { if (mode === 'daily' || !rounds.length) return; mode = 'daily'; syncMode(); begin(rounds[dailyIndex(new Date().toISOString().slice(0, 10), rounds.length)]); };
function dialog(html) { destroyMedia(); $('#info-content').innerHTML = html; $('#info-dialog').showModal(); renderControls(); }
$('.close').onclick = () => $('#info-dialog').close();
function exportJSON(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('#stats-open').onclick = () => {
  dialog(`<p class="eyebrow">YOUR RECORD</p><h2>The receipt.</h2><div class="stats-grid"><div><b>${stats.played}</b><span>CLIPS</span></div><div><b>${stats.played ? Math.round(stats.wins / stats.played * 100) : 0}%</b><span>HIT RATE</span></div><div><b>${stats.points.toLocaleString()}</b><span>POINTS</span></div></div><p>Best round: ${stats.best} · Current streak: ${stats.streak}<br>Saved on this browser.</p><button id="reset-stats" class="text-button">Reset stats</button><button id="restore-reports" class="text-button">Restore reported clips (${reports.length})</button><button id="export-reports" class="text-button">Export clip reports</button>`);
  $('#reset-stats').onclick = () => { stats = { ...defaultStats }; save('sg-stats', stats); $('#info-dialog').close(); };
  $('#restore-reports').onclick = () => { save('sg-reports', []); location.reload(); };
  $('#export-reports').onclick = () => exportJSON(reports, 'sponsorguess-reports.json');
};
$('#report').onclick = () => {
  if (!state) return;
  const current = state.round;
  dialog('<h2>Report this clip.</h2><p>This hides the clip locally. Reports are saved on this browser and can be exported from Your stats. Nothing is sent automatically.</p><label for="reason">What went wrong?</label><select id="reason"><option>Spoken answer spoiler</option><option>Visible answer spoiler</option><option>Setup starts late</option><option>Wrong sponsor</option><option>Duplicate creative</option><option>Video unavailable</option></select><button id="confirm-report" class="primary submit">Hide clip & continue →</button>');
  $('#confirm-report').onclick = () => {
    reports.push({ id: current.id, videoId: current.videoId, reason: $('#reason').value, at: new Date().toISOString() }); save('sg-reports', reports);
    rounds = rounds.filter(round => round.id !== current.id); deck.remove(current.id); $('#info-dialog').close(); next(true);
  };
};
$('#theme').onclick = () => {
  const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('sg-theme', theme); } catch {}
};
document.addEventListener('keydown', event => {
  if (event.repeat || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName) || $('dialog[open]')) return;
  if (event.code === 'Space') { event.preventDefault(); play(); }
  if (event.key.toLowerCase() === 'r') play(true);
});
const localAudio = new Map();
async function load() {
  try {
    const response = await fetch('./rounds.json'); if (!response.ok) throw Error('Clip library unavailable.');
    const all = await response.json(), custom = read('sg-rounds', []), ids = new Set(), creatives = new Set();
    const playable = [...all, ...(Array.isArray(custom) ? custom : [])].filter(round => {
      try {
        validateRound(round);
        if (ids.has(round.id) || creatives.has(round.creativeId ?? round.id)) return false;
        ids.add(round.id); creatives.add(round.creativeId ?? round.id);
        return true;
      } catch { return false; }
    });
    brands = catalogue(playable); rounds = playable.filter(round => !reports.some(report => report.id === round.id)); deck = new RoundDeck(rounds);
    if (rounds.length) next(true); else empty('No clips with a reviewed 20-second setup are available. Reload the library or restore reported clips in Your stats.');
  } catch { empty('The clip library could not load. Check your connection and reload.'); }
}
load();
window.addEventListener('pagehide', () => { destroyMedia(false); localAudio.forEach(url => URL.revokeObjectURL(url)); });
