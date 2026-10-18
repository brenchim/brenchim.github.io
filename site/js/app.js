import { MEMBERS, memberById } from './members.js';
import * as store from './store.js';
import { parseSheet, uniqueChords, transposeLine, transposeChord, usesH, chordDiagramSVG, mainChord, longestLine, bassLine, bassNoteOf, bassDiagramSVG } from './chords.js';
import { searchAll, importFrom, findYoutube, youtubeId, youtubeOk, findBassTabs, importBassTab } from './importers.js';
import { Tuner, STRINGS, describe, nearestString } from './tuner.js';

const db = store.db;
const $app = document.getElementById('app');
const $nav = document.getElementById('nav');

// ---------- утилиты ----------
// Короткое имя источника для подписи: amdm, Ultimate Guitar, Songsterr…
function sourceName(url) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^(www|tabs)\./, ''); } catch { return ''; }
  const known = { 'amdm.ru': 'amdm', 'ultimate-guitar.com': 'Ultimate Guitar', 'songsterr.com': 'Songsterr', 'youtube.com': 'YouTube' };
  return known[host] || host;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many}`;
};
const times = (n) => plural(n, 'раз', 'раза', 'раз');
const norm = (s) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

const PREFS_KEY = 'brenchim:prefs';
const prefs = (() => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } })();
prefs.shifts ||= {};
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* нет доступа */ } };

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

const I = {
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5v14l12-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  listAdd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h9"/><path d="M8 18h6"/><path d="M19 15v6"/><path d="M16 18h6"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  listCheck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13"/><path d="M8 12h7"/><path d="M8 18h5"/><path d="m16 18 2 2 4-4"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8"/><path d="M8 12h8"/></svg>',
  people: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21c0-3-2-6-5-7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  guitar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m20 2 2 2-3.5 3.5"/><path d="m18.5 5.5-6 6"/><path d="M10.6 9.4a3.5 3.5 0 0 0-4.6.5 3 3 0 0 0-.8 2.1A4 4 0 0 0 3 16a5 5 0 0 0 5 5 4 4 0 0 0 4-2.2 3 3 0 0 0 2.1-.8 3.5 3.5 0 0 0 .5-4.6"/><circle cx="9" cy="15" r="1.2"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  tuner: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18a9 9 0 0 1 18 0"/><path d="m12 18 4-7"/><circle cx="12" cy="18" r="1.4"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>',
  yt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/></svg>',
};

const ava = (m, size = 28, cls = '') => (m ? `<img class="ava ${cls}" src="${esc(m.photo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px" loading="lazy">` : '');
const whoName = (id) => memberById(id)?.name || 'кто-то';

// ---------- тема ----------
function applyTheme() {
  if (prefs.theme) document.documentElement.setAttribute('data-theme', prefs.theme);
  else document.documentElement.removeAttribute('data-theme');
}
const isDark = () => (prefs.theme ? prefs.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
function toggleTheme() { prefs.theme = isDark() ? 'light' : 'dark'; savePrefs(); applyTheme(); render(); }

// ---------- «кто ты?» ----------
function pickMe(reason) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.innerHTML = `<div class="sheet-modal" role="dialog" aria-modal="true" aria-labelledby="who-t">
      <h2 id="who-t">Кто ты?</h2>
      <div class="muted small">${esc(reason || 'Запомним на этом телефоне — чтобы было видно, кто добавил песню.')}</div>
      <div class="people-grid">${MEMBERS.map((m) => `<button class="person ${prefs.me === m.id ? 'on' : ''}" data-id="${m.id}">${ava(m, 56)}<span>${esc(m.name)}</span></button>`).join('')}</div>
      <button class="btn btn-block" style="margin-top:16px" data-close>Отмена</button></div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-id]');
      if (b) { prefs.me = b.dataset.id; savePrefs(); done(prefs.me); render(); return; }
      if (e.target === wrap || e.target.closest('[data-close]')) done(null);
    });
    document.body.appendChild(wrap);
    wrap.querySelector('.person')?.focus();
  });
}
async function needMe(reason) { return prefs.me && memberById(prefs.me) ? prefs.me : pickMe(reason); }

// ---------- шапка ----------
function topBar() {
  const me = memberById(prefs.me);
  return `<header class="top">
    <a class="brand" href="#/"><img class="brand-logo" src="img/logo.png" alt="" width="40" height="40"><span><b>Brenchim</b></span></a>
    <div class="top-actions">
      <button class="icon-btn" data-act="theme" aria-label="${isDark() ? 'Светлая тема' : 'Тёмная тема'}">${isDark() ? I.sun : I.moon}</button>
      <button class="me-btn" data-act="me" aria-label="${me ? 'Ты: ' + esc(me.name) + '. Сменить' : 'Кто ты?'}">${me ? ava(me, 38, 'ava-ring') : `<span class="icon-btn">${I.people}</span>`}</button>
    </div></header>`;
}

function songRow(s, n) {
  const plays = store.playsOf(s.id).length;
  const chords = uniqueChords(s.body).slice(0, 4).join(' ');
  const adder = memberById(s.added_by);
  return `<a class="row" href="#/song/${s.id}">
    ${n != null ? `<span class="n">${n}</span>` : ''}
    <span class="main"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist || '—')}</span></span>
    <span class="side">${plays ? `<b>${times(plays)}</b>` : ''}<span>${esc(chords)}</span></span>
    ${adder ? `<span class="row-by" title="Добавил(а) ${esc(adder.name)}">${ava(adder, 26)}<span class="sr">добавил(а) ${esc(adder.name)}</span></span>` : ''}</a>`;
}
function songTile(s) {
  const m = memberById(s.added_by);
  return `<a class="card tile" href="#/song/${s.id}">
    <span><span class="t" style="display:block">${esc(s.title)}</span><span class="a">${esc(s.artist || '—')}</span></span>
    <span class="by">${ava(m, 22)}${esc(m ? m.name : '')}</span></a>`;
}

// ---------- главная ----------
let homeFilter = 'all';
let homeQuery = '';

function homeView() {
  const songs = db.songs;
  const q = norm(homeQuery);
  const set = db.set;
  const setSongs = (set?.song_ids || []).map((id) => songs.find((s) => s.id === id)).filter(Boolean);
  const requesters = [...new Set(setSongs.map((s) => s.added_by).filter(Boolean))].slice(0, 4).map(memberById).filter(Boolean);

  let body = '';
  if (q) {
    const found = songs.filter((s) => norm(`${s.title} ${s.artist}`).includes(q) || norm(s.body).includes(q));
    body = `<section class="section"><div class="section-head"><h2>Нашли ${plural(found.length, 'песню', 'песни', 'песен')}</h2></div>
      ${found.length ? `<div class="card list">${found.map((s) => songRow(s)).join('')}</div>` : `<div class="card empty">Такой песни у нас нет.<br><br><a class="btn btn-primary" href="#/add?q=${encodeURIComponent(homeQuery)}">Найти аккорды и добавить</a></div>`}</section>`;
  } else if (!db.loaded) {
    body = '<div class="spinner" role="status" aria-label="Загрузка"></div>';
  } else if (!songs.length) {
    body = `<section class="section card empty">Песен пока нет. Добавьте первую — аккорды подтянутся сами.<br><br><a class="btn btn-primary" href="#/add">${I.plus} Добавить песню</a></section>`;
  } else {
    const top = store.topSongs(5);
    const recent = songs.slice(0, 6);
    const forgotten = store.forgottenSongs(4).filter((s) => !top.slice(0, 3).includes(s));
    const me = prefs.me;
    const filters = [
      ['all', 'Все'],
      ['liked', 'Хотят сыграть'],
      ...(me ? [['mine', 'Я умею']] : []),
      ['new', 'Новые'],
      ['bass', 'С басом'],
      ...MEMBERS.map((m) => [`by:${m.id}`, m.name, m]),
    ];
    let list = [...songs];
    if (homeFilter === 'liked') list = list.filter((s) => store.marksOf(s.id, 'like').length).sort((a, b) => store.marksOf(b.id, 'like').length - store.marksOf(a.id, 'like').length);
    else if (homeFilter === 'mine') list = list.filter((s) => store.hasMark(s.id, me, 'canplay'));
    else if (homeFilter === 'new') list = list.slice(0, 15);
    else if (homeFilter === 'bass') list = list.filter((s) => Array.isArray(s.bass) && s.bass.length);
    else if (homeFilter.startsWith('by:')) list = list.filter((s) => s.added_by === homeFilter.slice(3));
    if (homeFilter !== 'new' && homeFilter !== 'liked') list.sort((a, b) => a.title.localeCompare(b.title, 'ru'));

    body = `
      ${top.length ? `<section class="section"><div class="section-head"><h2>Топ компании</h2><span class="muted small">по сыгранным</span></div>
        <div class="card list">${top.map((s, i) => songRow(s, i + 1)).join('')}</div></section>` : ''}
      <section class="section"><div class="section-head"><h2>Недавно добавили</h2></div><div class="grid2">${recent.map(songTile).join('')}</div></section>
      ${forgotten.length ? `<section class="section"><div class="section-head"><h2>Давно не играли</h2></div><div class="card list">${forgotten.map((s) => songRow(s)).join('')}</div></section>` : ''}
      <section class="section" id="all"><div class="section-head"><h2>Все песни</h2><span class="muted small">${songs.length}</span></div>
        <div class="chips" role="group" aria-label="Фильтр">${filters.map(([k, label, m]) => `<button class="chip ${homeFilter === k ? 'on' : ''}" data-filter="${k}" aria-pressed="${homeFilter === k}">${m ? ava(m, 22) : ''}${esc(label)}</button>`).join('')}</div>
        <div class="card list" style="margin-top:10px">${list.length ? list.map((s) => songRow(s)).join('') : '<div class="empty">Пусто</div>'}</div></section>`;
  }

  return `<div class="wrap">${topBar()}
    <label class="search">${I.search}<span class="sr">Поиск</span><input id="q" type="search" placeholder="Песня, исполнитель или строчка" value="${esc(homeQuery)}" autocomplete="off" enterkeyhint="search"></label>
    ${q ? '' : `<section class="hero">
      <div class="hero-row"><div><div class="eyebrow">Сет на вечер</div><h2>${esc(set?.title && set.title !== 'Сет на вечер' ? set.title : 'Что поём?')}</h2>
        <div class="sub">${setSongs.length ? plural(setSongs.length, 'песня', 'песни', 'песен') : 'пока пусто — накидайте песен'}${set?.date ? ' · ' + esc(new Date(set.date).toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short' })) : ''}</div></div>
        ${requesters.length ? `<div class="stack">${requesters.map((m) => ava(m, 28)).join('')}</div>` : ''}</div>
      <div class="hero-actions">
        ${setSongs.length ? `<a class="btn btn-primary btn-grow" href="#/song/${setSongs[0].id}?set=1">${I.play} Начать</a>` : ''}
        <a class="btn ghost btn-grow" href="#/set">${I.list} ${setSongs.length ? 'Сет' : 'Собрать сет'}</a>
        ${songs.length ? `<button class="btn ghost" data-act="random" aria-label="Случайная песня" style="width:44px;padding:0">${I.shuffle}</button>` : ''}
      </div></section>`}
    ${db.offline ? '<div class="notice">Нет связи с базой — показываем сохранённую копию.</div>' : ''}
    ${!store.remote ? '<div class="notice">Локальный режим: песни видны только на этом устройстве.</div>' : ''}
    <div id="home-body">${body}</div></div>`;
}

function bindHome() {
  const input = document.getElementById('q');
  input?.addEventListener('input', () => {
    homeQuery = input.value;
    const pos = input.selectionStart;
    render();
    const again = document.getElementById('q');
    again.focus();
    try { again.setSelectionRange(pos, pos); } catch { /* type=search */ }
  });
}

// ---------- песня ----------
let scrollTimer = null;
let wakeLock = null;

function stopScroll() { if (scrollTimer) cancelAnimationFrame(scrollTimer); scrollTimer = null; }
function startScroll() {
  stopScroll();
  let last = performance.now();
  let acc = 0;
  const step = (now) => {
    const dt = Math.min(100, now - last);
    last = now;
    acc += ((prefs.speed || 3) * 7 * dt) / 1000;
    if (acc >= 1) { const px = Math.floor(acc); acc -= px; window.scrollBy(0, px); }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { stopScroll(); updateDock(); return; }
    scrollTimer = requestAnimationFrame(step);
  };
  scrollTimer = requestAnimationFrame(step);
}
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); }
    if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { /* не поддерживается */ }
}

function sheetHTML(song, mode, shift) {
  const german = usesH(song.body);
  const lines = parseSheet(song.body);
  const out = [];
  let prevGap = false;
  for (const l of lines) {
    if (l.type === 'chords') {
      if (mode === 'chords') out.push(`<div class="cl">${esc(transposeLine(l.text, shift, german))}</div>`);
      else if (mode === 'bass') out.push(`<div class="cl">${esc(bassLine(transposeLine(l.text, shift, german)))}</div>`);
      continue;
    }
    if (l.type === 'gap') { if (!prevGap) out.push('<div class="ln"> </div>'); prevGap = true; continue; }
    prevGap = false;
    if (l.type === 'label') out.push(`<div class="lbl">${esc(l.text)}</div>`);
    else out.push(`<div class="ln">${esc(mode !== 'text' ? l.text : l.text.replace(/\s{2,}/g, ' ').trim())}</div>`);
  }
  return out.join('');
}

function songView(id, inSet) {
  const s = db.songs.find((x) => x.id === id);
  if (!s) return `<div class="wrap">${topBar()}<div class="card empty" style="margin-top:20px">${db.loaded ? 'Песня не найдена — возможно, её удалили.' : 'Загружаем…'}<br><br><a class="btn" href="#/">На главную</a></div></div>`;
  const mode = prefs.mode || 'chords';
  const shift = prefs.shifts[id] || 0;
  const german = usesH(s.body);
  const chords = uniqueChords(s.body);
  const size = prefs.size || 16;
  const plays = store.playsOf(id);
  const likes = store.marksOf(id, 'like');
  const can = store.marksOf(id, 'canplay');
  const me = prefs.me;
  const adder = memberById(s.added_by);
  const inCurrentSet = (db.set?.song_ids || []).includes(id);
  const keyChord = chords.length ? transposeChord(mainChord(s.body) || chords[0], shift, german) : '';
  // в режиме с аккордами строки нельзя переносить — ужимаем шрифт под ширину экрана (моноширинный ≈ 0.6em)
  const withChords = (mode === 'chords' || mode === 'bass') && chords.length > 0;
  const cols = withChords ? longestLine(s.body, true) : 0;
  const fontCSS = cols ? `font-size:max(11px, min(${size}px, calc((min(100vw, 720px) - 34px) / ${(cols * 0.6).toFixed(1)})))` : `font-size:${size}px`;
  const lastPlay = plays[0] ? new Date(plays[0].played_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '';
  let source = '';
  if (s.source_url) source = sourceName(s.source_url);

  return `<div class="wrap">
    <header class="top" style="padding-bottom:0">
      <a class="icon-btn" href="${inSet ? '#/set' : '#/'}" aria-label="Назад">${I.back}</a>
      <div class="top-actions">
        <button class="icon-btn" data-act="toset" aria-label="${inCurrentSet ? 'Убрать из сета' : 'Добавить в сет'}" aria-pressed="${inCurrentSet}" style="${inCurrentSet ? 'color:var(--accent-ink)' : ''}">${inCurrentSet ? I.listCheck : I.listAdd}</button>
        <button class="icon-btn" data-act="share" aria-label="Поделиться">${I.share}</button>
        <a class="icon-btn" href="#/edit/${id}" aria-label="Редактировать">${I.edit}</a>
        <button class="icon-btn" data-act="theme" aria-label="Сменить тему">${isDark() ? I.sun : I.moon}</button>
      </div></header>
    <div class="song-head">
      <h1>${esc(s.title)}</h1>
      <div class="meta">${s.artist ? `<span>${esc(s.artist)}</span>` : ''}
        ${adder ? `<span aria-hidden="true">·</span><span style="display:flex;align-items:center;gap:6px">${ava(adder, 20)}добавил(а) ${esc(adder.name)}</span>` : ''}
        ${plays.length ? `<span aria-hidden="true">·</span><span>играли ${times(plays.length)}${lastPlay ? ', последний ' + lastPlay : ''}</span>` : ''}</div>
    </div>
    <div class="tools">
      <div class="seg" role="group" aria-label="Режим">
        <button data-mode="chords" class="${mode === 'chords' ? 'on' : ''}" aria-pressed="${mode === 'chords'}">Аккорды</button>
        <button data-mode="text" class="${mode === 'text' ? 'on' : ''}" aria-pressed="${mode === 'text'}">Только текст</button>
        <button data-mode="bass" class="${mode === 'bass' ? 'on' : ''}" aria-pressed="${mode === 'bass'}">Бас</button>
      </div>
      <div class="tools-row">
        ${withChords ? `<div class="stepper"><button data-shift="-1" aria-label="Тональность ниже">−</button>
          <span class="val"><small>тональность</small><b>${esc(keyChord)}${shift ? ` (${shift > 0 ? '+' : ''}${shift})` : ''}</b></span>
          <button data-shift="1" aria-label="Тональность выше">+</button></div>` : ''}
        <div class="stepper ${withChords ? 'compact' : ''}"><button data-size="-1" aria-label="Мельче" style="font-size:13px;font-weight:600">A</button>
          ${withChords ? '' : `<span class="val"><small>шрифт</small><b>${size}</b></span>`}
          <button data-size="1" aria-label="Крупнее" style="font-size:19px;font-weight:600">A</button></div>
      </div>
    </div>
    ${mode === 'chords' && chords.length ? `<div class="diagrams" aria-label="Аккорды песни">${chords.map((c) => { const t = transposeChord(c, shift, german); const svg = chordDiagramSVG(t, german); return `<div class="card dia"><b>${esc(t)}</b>${svg || '<span class="muted small" style="height:60px;display:grid;place-items:center">—</span>'}</div>`; }).join('')}</div>` : ''}
    ${mode === 'bass' && chords.length ? `<div class="diagrams" aria-label="Басовые ноты">${[...new Set(chords.map((c) => bassNoteOf(transposeChord(c, shift, german))).filter(Boolean))].map((n) => `<div class="card dia bass"><b>${esc(n)}</b>${bassDiagramSVG(n, german)}</div>`).join('')}</div>
      <div class="muted small" style="margin-top:8px">Над текстом — ноты баса: тоника аккорда, у C/G — нота после дроби. Точки — где взять ноту на струнах E и A.</div>` : ''}
    <article class="sheet ${mode === 'text' ? 'text-only' : ''}" style="${fontCSS}">${s.body ? sheetHTML(s, mode, shift) : '<div class="muted">Текста пока нет. <a href="#/edit/' + id + '">Добавить</a></div>'}</article>
    ${mode === 'bass' ? bassTabsHTML(s) : ''}

    <div class="actions">
      <button class="btn" data-act="played">${I.check} Сыграли${plays.length ? ' · ' + plays.length : ''}</button>
      <button class="btn ${me && store.hasMark(id, me, 'like') ? 'on' : ''}" data-act="like" aria-pressed="${!!(me && store.hasMark(id, me, 'like'))}">${I.heart} Хочу${likes.length ? ' · ' + likes.length : ''}</button>
      <button class="btn ${me && store.hasMark(id, me, 'canplay') ? 'on' : ''}" data-act="canplay" aria-pressed="${!!(me && store.hasMark(id, me, 'canplay'))}">${I.guitar} Умею</button>
    </div>
    ${can.length || likes.length ? `<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      ${can.length ? `<div class="who-row"><span>Играют:</span>${can.map((m) => ava(memberById(m.member), 24)).join('')}<span>${esc(can.map((m) => whoName(m.member)).join(', '))}</span></div>` : ''}
      ${likes.length ? `<div class="who-row"><span>Хотят:</span>${likes.map((m) => ava(memberById(m.member), 24)).join('')}</div>` : ''}</div>` : ''}

    <section class="section">
      <div class="section-head"><h2>Видео</h2>${s.youtube ? `<a class="small" href="https://www.youtube.com/watch?v=${esc(s.youtube)}" target="_blank" rel="noopener">Открыть в YouTube</a>` : ''}</div>
      ${s.youtube ? (queueMicrotask(() => checkVideo(s)), '') : ''}${s.youtube ? `<button class="video" data-act="video" aria-label="Включить видео"><img src="https://i.ytimg.com/vi/${esc(s.youtube)}/hqdefault.jpg" alt="" loading="lazy"><span class="play"><span>${I.play.replace('<svg', '<svg width="22" height="22" style="color:#fff"')}</span></span></button>`
        : `<div class="card empty" style="padding:18px">Видео нет. <button class="btn" data-act="findvideo" style="margin-top:10px">${I.yt} Найти на YouTube</button></div>`}
      <div class="meta small" style="justify-content:space-between;margin-top:10px">
        <span>${source ? `Аккорды: <a href="${esc(s.source_url)}" target="_blank" rel="noopener nofollow">${esc(source)}</a>` : ''}</span>
        <a href="#/edit/${id}">Исправить</a></div>
    </section>
  </div>
  ${dockHTML(id, inSet)}`;
}

// Видео могли удалить с YouTube — проверяем один раз за сессию и тихо подменяем на рабочее
const ytChecked = new Set();
async function checkVideo(s) {
  const id = s.youtube;
  if (!id || ytChecked.has(id)) return;
  ytChecked.add(id);
  if ((await youtubeOk(id)) !== false) return;
  let v = null;
  try { v = await findYoutube(`${s.artist} ${s.title}`.trim(), [id]); } catch { /* YouTube не ответил */ }
  if (v) ytChecked.add(v.id);
  await store.updateSong(s.id, { youtube: v ? v.id : null }).catch(() => {});
  toast(v ? 'Старое видео удалили с YouTube — поставили другое' : 'Видео удалили с YouTube, замену не нашли');
  if (route.name === 'song' && route.id === s.id && !document.querySelector('.video iframe')) render();
}

function setNeighbors(id) {
  const ids = (db.set?.song_ids || []).filter((x) => db.songs.some((s) => s.id === x));
  const i = ids.indexOf(id);
  return { next: i >= 0 ? ids[i + 1] : null, pos: i, total: ids.length };
}

function dockHTML(id, inSet) {
  const { next, pos, total } = inSet ? setNeighbors(id) : {};
  const on = !!scrollTimer;
  return `<div class="dock"><div class="wrap"><div class="bar">
    <button class="play" data-act="scroll" aria-label="${on ? 'Остановить прокрутку' : 'Автопрокрутка'}" style="color:#fff">${(on ? I.pause : I.play).replace('<svg', '<svg width="18" height="18"')}</button>
    <div class="info"><b>${on ? 'Крутим…' : 'Автопрокрутка'}</b><span>скорость ${prefs.speed || 3}${inSet && pos >= 0 ? ` · песня ${pos + 1} из ${total}` : ''}</span></div>
    <button class="mini" data-speed="-1" aria-label="Медленнее">−</button>
    <button class="mini" data-speed="1" aria-label="Быстрее">+</button>
    ${inSet && next ? `<a class="mini" href="#/song/${next}?set=1">Далее ${I.next.replace('<svg', '<svg width="16" height="16"')}</a>` : ''}
  </div></div></div>`;
}
function updateDock() {
  const dock = document.querySelector('.dock');
  if (!dock || route.name !== 'song') return;
  dock.outerHTML = dockHTML(route.id, route.inSet);
}

// ---------- бас-табы ----------
const bassTabs = { songId: null, loading: false, results: null, error: '' };

// Бас-партии песни: свежий поиск на этой странице или сохранённые в базе
const bassList = (s) => (bassTabs.songId === s.id && bassTabs.results) || (Array.isArray(s.bass) ? s.bass : null);

function bassTabsHTML(s) {
  const st = bassTabs.songId === s.id ? bassTabs : { results: null };
  // ещё не искали — ищем сами, без кнопки
  if (!Array.isArray(s.bass) && !st.loading && !st.results && !st.error) queueMicrotask(() => runBassSearch(s));
  const list = bassList(s);
  const songsterr = `https://www.songsterr.com/?pattern=${encodeURIComponent(`${s.artist} ${s.title}`.trim())}`;
  let body;
  if (st.loading || (!list && !st.error)) body = '<div class="spinner" role="status" aria-label="Ищем"></div>';
  else if (list) {
    body = list.length
      ? list.map((r, i) => {
          const inner = `<span class="main"><span class="t">${esc(r.title)}</span><span class="muted small">${esc(r.artist)}${r.note ? ' · ' + esc(r.note) : ''}</span></span><span class="badge">${esc(r.source)}</span>`;
          return `<div class="result">${r.external
            ? `<a class="result-main" href="${esc(r.url)}" target="_blank" rel="noopener nofollow" style="color:inherit">${inner}</a>`
            : `<button class="result-main" data-basstab="${i}">${inner}</button>`}</div>`;
        }).join('') + '<div class="muted small">Songsterr откроется у них на сайте сразу на дорожке баса, со звуком и замедлением.</div>'
      : '<div class="card empty" style="padding:16px">Готовой бас-партии не нашлось — играйте по нотам выше.</div>';
  } else body = '';
  return `<section class="section"><div class="section-head"><h2>Бас-партии</h2>
      <span class="small" style="display:flex;gap:14px">${list ? '<button class="linkish" data-act="findbass">Обновить</button>' : ''}<a href="${songsterr}" target="_blank" rel="noopener">Songsterr</a></span></div>
    ${st.error ? `<div class="notice">${esc(st.error)} <button class="linkish" data-act="findbass">Ещё раз</button></div>` : ''}${body}</section>`;
}

async function runBassSearch(s) {
  Object.assign(bassTabs, { songId: s.id, loading: true, results: null, error: '' });
  render();
  try {
    bassTabs.results = await findBassTabs(s.title, s.artist);
    store.updateSong(s.id, { bass: bassTabs.results }).catch(() => {});
  } catch (e) { bassTabs.error = 'Сайты с табами не ответили.'; }
  bassTabs.loading = false;
  if (route.name === 'song' && route.id === s.id) render();
}

// Для новой песни бас ищем в фоне и сохраняем — чтобы в режиме «Бас» всё было сразу
function fetchBassInBackground(id, title, artist) {
  findBassTabs(title, artist).then((r) => store.updateSong(id, { bass: r })).catch(() => {});
}

async function openBassTab(r) {
  const wrap = document.createElement('div');
  wrap.className = 'modal';
  wrap.innerHTML = `<div class="sheet-modal tab-modal" role="dialog" aria-modal="true" aria-label="Бас-таб">
    <div style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:0"><h2 style="margin:0">${esc(r.title)}</h2><div class="muted small">${esc(r.artist)} · бас · Ultimate Guitar</div></div>
    <button class="icon-btn" data-close aria-label="Закрыть">${I.x}</button></div>
    <pre class="tabpre"><div class="spinner" role="status" aria-label="Загрузка"></div></pre>
    <a class="small" href="${esc(r.url)}" target="_blank" rel="noopener nofollow">Открыть на Ultimate Guitar</a></div>`;
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) wrap.remove(); });
  document.body.appendChild(wrap);
  try { wrap.querySelector('.tabpre').textContent = await importBassTab(r.url) || 'Пусто'; }
  catch { wrap.querySelector('.tabpre').textContent = 'Не получилось загрузить таб.'; }
}

// ---------- добавление / редактирование ----------
const addState = { tab: 'find', q: '', results: null, loading: false, error: '', draft: null, failed: 0 };

function formHTML(d, isEdit) {
  const yt = youtubeId(d.youtube);
  return `<form id="song-form" autocomplete="off">
    ${d.source_url ? `<div class="notice">Загрузили с ${esc(sourceName(d.source_url) || 'сайта')}. Проверьте текст и сохраните.</div>` : ''}
    <label class="field"><span>Название</span><input class="input" name="title" required maxlength="200" value="${esc(d.title)}"></label>
    <label class="field"><span>Исполнитель</span><input class="input" name="artist" maxlength="200" value="${esc(d.artist)}"></label>
    <label class="field"><span>Текст с аккордами (аккорды — строкой над словами)</span><textarea class="textarea" name="body" spellcheck="false">${esc(d.body)}</textarea></label>
    <label class="field"><span>Видео на YouTube (ссылка)</span><input class="input" name="youtube" inputmode="url" placeholder="https://youtu.be/…" value="${esc(yt ? 'https://youtu.be/' + yt : d.youtube || '')}"></label>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <button type="button" class="btn" data-act="autovideo">${I.yt} Подобрать видео</button>
      <span id="yt-note" class="muted small">${d.ytTitle ? esc(d.ytTitle) : ''}</span></div>
    ${yt ? `<img src="https://i.ytimg.com/vi/${esc(yt)}/mqdefault.jpg" alt="Превью видео" style="width:100%;max-width:320px;border-radius:12px;margin-top:10px;aspect-ratio:16/9;object-fit:cover">` : ''}
    ${isEdit ? '' : `<div class="card" style="margin-top:16px">
      <label class="toggle-row"><span class="main"><span>В сет на вечер</span><span class="muted small">${esc(db.set?.title || 'Сет на вечер')}</span></span><input type="checkbox" name="toset"></label>
      <label class="toggle-row"><span class="main"><span>Я умею её играть</span><span class="muted small">будет видно, кому дать гитару</span></span><input type="checkbox" name="canplay"></label></div>`}
    <button class="btn btn-primary btn-block" type="submit" style="margin-top:18px">${isEdit ? 'Сохранить' : 'Добавить песню'}</button>
    ${isEdit ? `<button class="btn btn-block" type="button" data-act="delete" style="margin-top:10px;color:var(--accent-ink)">Удалить песню</button>` : `<button class="btn btn-block" type="button" data-act="discard" style="margin-top:10px">Назад к поиску</button>`}
  </form>`;
}

function addView(params) {
  if (params.q && !addState.q && !addState.draft) { addState.q = params.q; queueMicrotask(runSearch); }
  const t = addState.tab;
  let inner = '';
  if (addState.draft) inner = formHTML(addState.draft, false);
  else if (t === 'find') {
    inner = `<form id="find-form" class="search" style="border-width:2px;border-color:var(--ink)" role="search">${I.search}
        <input id="find-q" type="search" placeholder="Например: сплин выхода нет" value="${esc(addState.q)}" enterkeyhint="search" autocomplete="off">
        <button class="btn btn-dark" style="height:36px;padding:0 12px" type="submit">Найти</button></form>
      <div class="muted small" style="margin-top:8px">Ищем на amdm и Ultimate Guitar. Нажмите на вариант — подтянем текст, аккорды и видео.</div>
      ${addState.loading ? '<div class="spinner" role="status" aria-label="Загрузка"></div>' : ''}
      ${addState.error ? `<div class="notice">${esc(addState.error)}</div>` : ''}
      ${addState.results ? (addState.results.length ? `<div class="muted small" style="margin-top:14px">Нажмите на песню, чтобы посмотреть и поправить, или «+», чтобы сразу добавить — можно несколько подряд.</div>
        <div style="margin-top:10px">${addState.results.map((r, i) => {
          const have = r.addedId || existingSong(r)?.id;
          const side = r.adding ? '<span class="quick-add" aria-label="Добавляем"><span class="spinner" style="margin:0;width:20px;height:20px"></span></span>'
            : have ? `<a class="quick-add done" href="#/song/${have}" aria-label="Уже в песеннике — открыть">${I.check}</a>`
            : `<button class="quick-add" data-quick="${i}" aria-label="Сразу добавить «${esc(r.title)}»">${I.plus}</button>`;
          return `<div class="result">
          <button class="result-main" data-pick="${i}"><span class="main"><span class="t">${esc(r.title)}</span>
            <span class="muted small">${esc(r.artist)}${r.note ? ' · ' + esc(r.note) : ''}${have ? ' · <b class="ok-text">уже есть</b>' : ''}</span></span>
            <span class="badge">${esc(r.source)}</span></button>${side}</div>`;
        }).join('')}</div>` : `<div class="card empty" style="margin-top:14px">Ничего не нашли. Попробуйте иначе написать или добавьте вручную.</div>`) : ''}
      ${addState.failed ? '<div class="muted small">Часть сайтов не ответила.</div>' : ''}`;
  } else if (t === 'link') {
    inner = `<form id="link-form"><label class="field"><span>Ссылка на страницу с аккордами</span>
        <input class="input" id="link-url" type="url" inputmode="url" placeholder="https://…" required></label>
        <div class="muted small" style="margin-top:8px">Лучше всего работают amdm и Ultimate Guitar; с других сайтов возьмём самый большой блок текста.</div>
        ${addState.loading ? '<div class="spinner" role="status" aria-label="Загрузка"></div>' : ''}
        ${addState.error ? `<div class="notice">${esc(addState.error)}</div>` : ''}
        <button class="btn btn-primary btn-block" type="submit" style="margin-top:16px">Загрузить</button></form>`;
  } else {
    inner = formHTML({ title: '', artist: '', body: '', youtube: '' }, false);
  }
  return `<div class="wrap">
    <header class="top" style="justify-content:flex-start"><a class="icon-btn" href="#/" aria-label="Закрыть">${I.x}</a><h1 style="margin:0;font-size:20px">Добавить песню</h1></header>
    ${addState.draft ? '' : `<div class="seg" role="group" aria-label="Способ" style="margin:8px 0 14px">
      <button data-tab="find" class="${t === 'find' ? 'on' : ''}">Найти</button>
      <button data-tab="link" class="${t === 'link' ? 'on' : ''}">По ссылке</button>
      <button data-tab="manual" class="${t === 'manual' ? 'on' : ''}">Вручную</button></div>`}
    ${inner}</div>`;
}

async function runSearch() {
  const q = addState.q.trim();
  if (!q) return;
  Object.assign(addState, { loading: true, error: '', results: null, failed: 0 });
  render();
  try {
    const { results, failed } = await searchAll(q);
    Object.assign(addState, { results, failed });
    if (!results.length && failed === 2) addState.error = 'Сайты с аккордами не ответили. Попробуйте ещё раз или добавьте вручную.';
  } catch (e) {
    addState.error = 'Не получилось поискать: ' + e.message;
  }
  addState.loading = false;
  if (route.name === 'add') render();
}

async function loadDraft(url, hint = {}) {
  Object.assign(addState, { loading: true, error: '' });
  render();
  try {
    const song = await importFrom(url);
    song.title ||= hint.title || '';
    song.artist ||= hint.artist || '';
    addState.draft = song;
    if (!song.youtube) {
      findYoutube(`${song.artist} ${song.title}`).then((v) => {
        if (v && addState.draft === song && !song.youtube) { song.youtube = v.id; song.ytTitle = v.title; if (route.name === 'add') render(); }
      }).catch(() => {});
    }
  } catch (e) {
    addState.error = 'Не получилось загрузить: ' + e.message;
  }
  addState.loading = false;
  if (route.name === 'add') render();
}

// Песня из результатов поиска уже есть в песеннике?
function existingSong(r) {
  const key = norm(`${r.artist} ${r.title}`);
  return db.songs.find((s) => (r.url && s.source_url === r.url) || norm(`${s.artist} ${s.title}`) === key);
}

// «+» в результатах: импорт и сохранение без формы, чтобы можно было добавить несколько подряд
async function quickAdd(r) {
  if (!r || r.adding || r.addedId) return;
  const me = await needMe('Выбери себя — так будет видно, кто добавил песню.');
  if (!me) return;
  r.adding = true;
  render();
  try {
    const s = await importFrom(r.url);
    s.title ||= r.title;
    s.artist ||= r.artist;
    if (!s.youtube) {
      try { const v = await findYoutube(`${s.artist} ${s.title}`); if (v) s.youtube = v.id; } catch { /* без видео */ }
    }
    r.addedId = await store.addSong({ title: s.title, artist: s.artist, body: s.body, youtube: s.youtube, source_url: s.source_url, added_by: me });
    fetchBassInBackground(r.addedId, s.title, s.artist);
    toast(`Добавили «${s.title}»`);
  } catch (e) {
    toast('Не получилось добавить: ' + e.message.slice(0, 60));
  }
  r.adding = false;
  if (route.name === 'add') render();
}

function readForm(form) {
  const f = new FormData(form);
  return {
    title: String(f.get('title') || '').trim(),
    artist: String(f.get('artist') || '').trim(),
    body: String(f.get('body') || '').replace(/\s+$/, ''),
    youtube: youtubeId(f.get('youtube')),
    toset: f.get('toset') === 'on',
    canplay: f.get('canplay') === 'on',
  };
}

function editView(id) {
  const s = db.songs.find((x) => x.id === id);
  if (!s) return `<div class="wrap">${topBar()}<div class="card empty">Песня не найдена</div></div>`;
  return `<div class="wrap"><header class="top" style="justify-content:flex-start"><a class="icon-btn" href="#/song/${id}" aria-label="Назад">${I.back}</a><h1 style="margin:0;font-size:20px">Редактировать</h1></header>
    ${formHTML(s, true)}</div>`;
}

// ---------- сет ----------
let setQuery = '';
function setView() {
  const set = db.set || { title: 'Сет на вечер', song_ids: [] };
  const songs = set.song_ids.map((id) => db.songs.find((s) => s.id === id)).filter(Boolean);
  const q = norm(setQuery);
  const candidates = q ? db.songs.filter((s) => !set.song_ids.includes(s.id) && norm(`${s.title} ${s.artist}`).includes(q)).slice(0, 8) : [];
  const liked = !q ? db.songs.filter((s) => !set.song_ids.includes(s.id) && store.marksOf(s.id, 'like').length).slice(0, 6) : [];
  const addRow = (s) => `<div class="row"><span class="main"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist || '—')}</span></span><button class="icon-btn" data-addset="${s.id}" aria-label="Добавить в сет">${I.plus}</button></div>`;
  return `<div class="wrap">
    <header class="top" style="justify-content:flex-start"><a class="icon-btn" href="#/" aria-label="Назад">${I.back}</a><h1 style="margin:0;font-size:20px">Сет на вечер</h1></header>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:8px">
      <label class="field" style="margin:0"><span>Название</span><input class="input" id="set-title" value="${esc(set.title)}" maxlength="120"></label>
      <label class="field" style="margin:0"><span>Когда</span><input class="input" id="set-date" type="date" value="${esc(set.date || '')}"></label></div>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${songs.length ? `<a class="btn btn-primary btn-grow" href="#/song/${songs[0].id}?set=1">${I.play} Начать с первой</a>
      <button class="btn" data-act="shuffle">${I.shuffle} Перемешать</button>` : ''}
    </div>
    ${songs.length ? `<ol class="card list" style="margin-top:14px">${songs.map((s, i) => `<li><div class="row" style="padding-right:4px">
        <span class="n" style="color:var(--muted)">${i + 1}</span>
        <a class="main" href="#/song/${s.id}?set=1" style="color:inherit"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist || '—')}</span></a>
        <button class="icon-btn" data-move="${i}:-1" aria-label="Выше" ${i === 0 ? 'disabled style="opacity:.3"' : ''}>${I.up}</button>
        <button class="icon-btn" data-move="${i}:1" aria-label="Ниже" ${i === songs.length - 1 ? 'disabled style="opacity:.3"' : ''}>${I.down}</button>
        <button class="icon-btn" data-remove="${s.id}" aria-label="Убрать из сета">${I.x}</button></div></li>`).join('')}</ol>`
      : '<div class="card empty" style="margin-top:14px">В сете пока пусто. Найдите песни ниже или нажмите значок списка на странице песни.</div>'}
    <section class="section"><div class="section-head"><h2>Добавить в сет</h2></div>
      <label class="search">${I.search}<span class="sr">Поиск песни для сета</span><input id="set-q" type="search" placeholder="Найти песню" value="${esc(setQuery)}" autocomplete="off"></label>
      ${candidates.length ? `<div class="card list" style="margin-top:10px">${candidates.map(addRow).join('')}</div>` : ''}
      ${liked.length ? `<div class="muted small" style="margin:14px 0 8px">Кто-то хочет сыграть:</div><div class="card list">${liked.map(addRow).join('')}</div>` : ''}
    </section>
    ${songs.length ? `<button class="btn btn-block" data-act="clearset" style="margin-top:22px">Новый пустой сет</button>` : ''}
  </div>`;
}

// ---------- люди ----------
function peopleView(id) {
  if (id) {
    const m = memberById(id);
    if (!m) return `<div class="wrap">${topBar()}<div class="card empty">Не нашли такого человека</div></div>`;
    const added = db.songs.filter((s) => s.added_by === id);
    const canIds = new Set(db.marks.filter((x) => x.member === id && x.kind === 'canplay').map((x) => x.song_id));
    const likeIds = new Set(db.marks.filter((x) => x.member === id && x.kind === 'like').map((x) => x.song_id));
    const block = (title, list) => (list.length ? `<section class="section"><div class="section-head"><h2>${title}</h2><span class="muted small">${list.length}</span></div><div class="card list">${list.map((s) => songRow(s)).join('')}</div></section>` : '');
    return `<div class="wrap"><header class="top" style="justify-content:flex-start"><a class="icon-btn" href="#/people" aria-label="Назад">${I.back}</a></header>
      <div style="display:flex;align-items:center;gap:14px">${ava(m, 72)}<div><h1 style="margin:0;font-size:26px">${esc(m.name)}</h1>
        <div class="muted small">${plural(added.length, 'песня добавлена', 'песни добавлено', 'песен добавлено')}</div></div></div>
      ${block('Умеет играть', db.songs.filter((s) => canIds.has(s.id)))}
      ${block('Хочет сыграть', db.songs.filter((s) => likeIds.has(s.id)))}
      ${block('Добавил(а)', added)}
      ${!added.length && !canIds.size && !likeIds.size ? '<div class="card empty" style="margin-top:20px">Пока ничего</div>' : ''}</div>`;
  }
  const rows = MEMBERS.map((m) => {
    const added = db.songs.filter((s) => s.added_by === m.id).length;
    const can = db.marks.filter((x) => x.member === m.id && x.kind === 'canplay').length;
    return `<a class="row" href="#/people/${m.id}">${ava(m, 44)}<span class="main"><span class="t">${esc(m.name)}${prefs.me === m.id ? ' <span class="muted small">(ты)</span>' : ''}</span>
      <span class="a">${plural(added, 'песня', 'песни', 'песен')}${can ? ` · умеет ${can}` : ''}</span></span>${can ? '<span class="badge acc">гитара</span>' : ''}</a>`;
  }).join('');
  return `<div class="wrap">${topBar()}<section class="section" style="margin-top:12px"><div class="section-head"><h2>Компания</h2><span class="muted small">${plural(MEMBERS.length, 'человек', 'человека', 'человек')}</span></div>
    <div class="card list">${rows}</div></section></div>`;
}

// ---------- тюнер ----------
let tuner = null;
let tunerLock = null; // null — авто, иначе индекс струны, выбранной вручную

function tunerView() {
  const on = !!tuner;
  return `<div class="wrap">
    <header class="top" style="justify-content:flex-start"><a class="icon-btn" href="#/" aria-label="Назад">${I.back}</a><h1 style="margin:0;font-size:20px">Тюнер</h1></header>
    <section class="card tuner" aria-live="polite">
      <div class="tn-note" id="tn-note">${on ? '…' : '—'}</div>
      <div class="tn-hz muted" id="tn-hz">${on ? 'сыграйте струну' : 'микрофон выключен'}</div>
      <div class="tn-meter" aria-hidden="true">
        <div class="tn-ticks">${Array.from({ length: 11 }, (_, i) => `<span class="${i === 5 ? 'mid' : ''}"></span>`).join('')}</div>
        <div class="tn-needle" id="tn-needle"></div>
      </div>
      <div class="tn-scale muted small" aria-hidden="true"><span>−50</span><span>0</span><span>+50</span></div>
      <div class="tn-hint" id="tn-hint">&nbsp;</div>
    </section>
    <div class="tn-mode small" id="tn-mode">${tunerLock == null ? '<b>Авто</b> — тюнер сам определяет, какую струну вы дёрнули' : `<b>Струна ${STRINGS[tunerLock].label} (${STRINGS[tunerLock].name})</b> — нажмите на неё ещё раз, чтобы вернуть авто`}</div>
    <div class="tn-strings" role="group" aria-label="Струны">
      ${STRINGS.map((s, i) => `<button class="tn-string ${tunerLock === i ? 'locked' : ''}" data-ref="${i}" id="tn-s${i}" aria-pressed="${tunerLock === i}" aria-label="Струна ${s.label}, ${s.name}: настраивать её и сыграть эталон"><b>${s.name}</b><span>${s.label}</span></button>`).join('')}
    </div>
    <button class="btn ${on ? '' : 'btn-primary'} btn-block" data-act="tuner" style="margin-top:16px">${I.mic} ${on ? 'Выключить микрофон' : 'Включить микрофон'}</button>
    <p class="muted small" style="margin-top:12px;line-height:1.5">Стандартный строй E A D G B E. Дёргайте одну струну и держите телефон рядом с гитарой.
      Если струна сильно расстроена (например, новая), нажмите на неё внизу: тюнер будет мерить именно от неё и сыграет эталонную ноту.</p>
  </div>`;
}

function showReading(freq) {
  const noteEl = document.getElementById('tn-note');
  if (!noteEl) return;
  const needle = document.getElementById('tn-needle');
  const hz = document.getElementById('tn-hz');
  const hint = document.getElementById('tn-hint');
  document.querySelectorAll('.tn-string').forEach((b) => b.classList.remove('on', 'ok'));
  if (!freq) {
    noteEl.textContent = '…'; hz.textContent = 'сыграйте струну'; hint.innerHTML = '&nbsp;';
    needle.style.transform = 'translateX(-50%) rotate(0deg)'; needle.className = 'tn-needle'; noteEl.className = 'tn-note';
    return;
  }
  const d = describe(freq);
  const locked = tunerLock != null;
  const s = locked ? { index: tunerLock, cents: Math.round(1200 * Math.log2(freq / STRINGS[tunerLock].freq)) } : nearestString(freq);
  const target = STRINGS[s.index];
  // с выбранной струной меряем всегда от неё; в авто — от ближайшей, а если далеко, показываем хроматически
  const cents = locked || Math.abs(s.cents) <= 60 ? s.cents : d.cents;
  const clamped = Math.max(-50, Math.min(50, cents));
  const ok = Math.abs(cents) <= 5;
  noteEl.textContent = d.note;
  noteEl.className = 'tn-note' + (ok ? ' ok' : '');
  hz.textContent = `${freq.toFixed(1)} Гц · ${cents > 0 ? '+' : ''}${cents} ц`;
  needle.style.transform = `translateX(-50%) rotate(${clamped * 0.9}deg)`;
  needle.className = 'tn-needle' + (ok ? ' ok' : '');
  const btn = document.getElementById('tn-s' + s.index);
  const name = `Струна ${target.label} (${target.name})`;
  if (locked || Math.abs(s.cents) <= 60) {
    btn?.classList.add(ok ? 'ok' : 'on');
    const far = Math.abs(s.cents) > 100 ? ' сильно' : '';
    hint.textContent = ok ? `${name} настроена` : s.cents < 0 ? `${name}: подтяните${far} ↑` : `${name}: ослабьте${far} ↓`;
  } else hint.textContent = s.cents < 0 ? `Ближе всего к ${target.name} (${target.label}) — подтяните` : `Ближе всего к ${target.name} (${target.label}) — ослабьте`;
}

async function startTuner() {
  if (!navigator.mediaDevices?.getUserMedia) { toast('Этот браузер не даёт доступ к микрофону'); return; }
  const t = new Tuner(showReading);
  try {
    await t.start();
    tuner = t;
    keepAwake(true);
  } catch (e) {
    toast(e.name === 'NotAllowedError' ? 'Разрешите доступ к микрофону в настройках браузера' : 'Микрофон не включился');
  }
  if (route.name === 'tuner') render();
}
function stopTuner() {
  tuner?.stop();
  tuner = null;
  if (route.name === 'tuner') { keepAwake(false); render(); }
}

let refCtx = null;
function playReference(i) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  refCtx ||= new Ctx();
  const ctx = refCtx;
  const f = STRINGS[i].freq;
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
  gain.connect(ctx.destination);
  [[1, 1], [2, 0.5], [3, 0.25], [4, 0.12]].forEach(([h, a]) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f * h;
    g.gain.value = a;
    o.connect(g).connect(gain);
    o.start(now);
    o.stop(now + 2.3);
  });
}

// ---------- роутинг ----------
let route = { name: 'home' };
function parseRoute() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'song' && parts[1]) return { name: 'song', id: parts[1], inSet: params.set === '1' };
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] };
  if (parts[0] === 'add') return { name: 'add', params };
  if (parts[0] === 'set') return { name: 'set' };
  if (parts[0] === 'tuner') return { name: 'tuner' };
  if (parts[0] === 'people') return { name: 'people', id: parts[1] };
  return { name: 'home' };
}

function render() {
  let html = '';
  if (route.name === 'song') html = songView(route.id, route.inSet);
  else if (route.name === 'edit') html = editView(route.id);
  else if (route.name === 'add') html = addView(route.params || {});
  else if (route.name === 'set') html = setView();
  else if (route.name === 'tuner') html = tunerView();
  else if (route.name === 'people') html = peopleView(route.id);
  else html = homeView();
  $app.innerHTML = html;
  document.body.classList.toggle('has-dock', route.name === 'song');
  const tab = { home: 'home', song: 'home', edit: 'home', add: 'add', set: 'set', people: 'people', tuner: 'tuner' }[route.name];
  $nav.querySelectorAll('a').forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (route.name === 'home') bindHome();
  const song = route.name === 'song' && db.songs.find((s) => s.id === route.id);
  document.title = song ? `${song.title}${song.artist ? ' — ' + song.artist : ''} · Brenchim` : 'Brenchim';
}

function onRoute() {
  const prev = route;
  route = parseRoute();
  if (prev.name === 'song' && (route.name !== 'song' || route.id !== prev.id)) stopScroll();
  if (prev.name === 'tuner' && route.name !== 'tuner') stopTuner();
  if (route.name === 'add' && prev.name !== 'add') Object.assign(addState, { draft: null, results: null, error: '', loading: false, q: '' });
  keepAwake(route.name === 'song');
  render();
  if (prev.name !== route.name || prev.id !== route.id) window.scrollTo(0, 0);
}

// ---------- события ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-act]');
  if (!t) return;
  const act = t.dataset.act;

  if (act === 'theme') return toggleTheme();
  if (act === 'me') return pickMe('Выбери себя — так будет видно, кто добавил песню и кто умеет её играть.');
  if (act === 'tuner') { if (tuner) stopTuner(); else startTuner(); return; }
  if (t.dataset.ref) {
    const i = Number(t.dataset.ref);
    if (tunerLock === i) tunerLock = null;
    else { tunerLock = i; playReference(i); }
    render();
    return;
  }
  if (act === 'random') {
    const pool = db.songs;
    if (pool.length) location.hash = `#/song/${pool[Math.floor(Math.random() * pool.length)].id}`;
    return;
  }
  if (t.dataset.filter) { homeFilter = t.dataset.filter; render(); document.getElementById('all')?.scrollIntoView({ block: 'start' }); return; }

  // песня
  if (route.name === 'song') {
    const id = route.id;
    if (t.dataset.mode) { prefs.mode = t.dataset.mode; savePrefs(); return render(); }
    if (act === 'findbass') return runBassSearch(db.songs.find((x) => x.id === id));
    if (t.dataset.basstab) return openBassTab(bassList(db.songs.find((x) => x.id === id))[Number(t.dataset.basstab)]);
    if (t.dataset.shift) { const v = ((((prefs.shifts[id] || 0) + Number(t.dataset.shift) + 6) % 12) + 12) % 12 - 6; if (v) prefs.shifts[id] = v; else delete prefs.shifts[id]; savePrefs(); return render(); }
    if (t.dataset.size) { prefs.size = Math.max(12, Math.min(26, (prefs.size || 16) + Number(t.dataset.size))); savePrefs(); return render(); }
    if (t.dataset.speed) { prefs.speed = Math.max(1, Math.min(10, (prefs.speed || 3) + Number(t.dataset.speed))); savePrefs(); return updateDock(); }
    if (act === 'scroll') { if (scrollTimer) stopScroll(); else startScroll(); return updateDock(); }
    if (act === 'video') {
      const s = db.songs.find((x) => x.id === id);
      t.outerHTML = `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.youtube)}?autoplay=1&rel=0" title="Видео: ${esc(s.title)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
      return;
    }
    if (act === 'findvideo') {
      const s = db.songs.find((x) => x.id === id);
      t.disabled = true; t.textContent = 'Ищем…';
      try {
        const v = await findYoutube(`${s.artist} ${s.title}`);
        if (v) { await store.updateSong(id, { youtube: v.id }); toast('Нашли видео'); } else toast('Видео не нашли');
      } catch { toast('YouTube не ответил'); }
      return render();
    }
    if (act === 'share') {
      const s = db.songs.find((x) => x.id === id);
      const url = location.href.replace(/\?.*$/, '');
      try {
        if (navigator.share) await navigator.share({ title: s.title, text: `${s.title}${s.artist ? ' — ' + s.artist : ''}`, url });
        else { await navigator.clipboard.writeText(url); toast('Ссылка скопирована'); }
      } catch { /* отмена */ }
      return;
    }
    if (act === 'toset') {
      const ids = [...(db.set?.song_ids || [])];
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1); else ids.push(id);
      await store.saveSet({ song_ids: ids }).catch(() => toast('Не сохранилось — нет связи'));
      toast(i >= 0 ? 'Убрали из сета' : 'Добавили в сет');
      return render();
    }
    if (act === 'played') {
      const me = prefs.me || null;
      await store.addPlay(id, me).catch(() => toast('Не сохранилось — нет связи'));
      toast('Записали, что сыграли');
      return render();
    }
    if (act === 'like' || act === 'canplay') {
      const me = await needMe('Выбери себя — отметка будет от твоего имени.');
      if (!me) return;
      await store.toggleMark(id, me, act).catch(() => toast('Не сохранилось — нет связи'));
      return render();
    }
  }

  // добавление
  if (route.name === 'add' || route.name === 'edit') {
    if (t.dataset.tab) { Object.assign(addState, { tab: t.dataset.tab, error: '' }); return render(); }
    if (t.dataset.pick) {
      const r = addState.results[Number(t.dataset.pick)];
      return loadDraft(r.url, r);
    }
    if (t.dataset.quick) return quickAdd(addState.results[Number(t.dataset.quick)]);
    if (act === 'discard') { addState.draft = null; return render(); }
    if (act === 'autovideo') {
      const form = document.getElementById('song-form');
      const d = readForm(form);
      const note = document.getElementById('yt-note');
      note.textContent = 'Ищем…';
      try {
        const v = await findYoutube(`${d.artist} ${d.title}`.trim());
        if (v) { form.elements.youtube.value = `https://youtu.be/${v.id}`; note.textContent = v.title || 'Нашли'; } else note.textContent = 'Не нашли';
      } catch { note.textContent = 'YouTube не ответил'; }
      return;
    }
    if (act === 'delete') {
      const s = db.songs.find((x) => x.id === route.id);
      if (s && confirm(`Удалить «${s.title}»? Это нельзя отменить.`)) {
        await store.deleteSong(s.id).catch(() => toast('Не удалилось — нет связи'));
        location.hash = '#/';
      }
      return;
    }
  }

  // сет
  if (route.name === 'set') {
    const ids = [...(db.set?.song_ids || [])];
    if (t.dataset.addset) { ids.push(t.dataset.addset); setQuery = ''; }
    else if (t.dataset.remove) ids.splice(ids.indexOf(t.dataset.remove), 1);
    else if (t.dataset.move) {
      const [i, d] = t.dataset.move.split(':').map(Number);
      const visible = ids.filter((x) => db.songs.some((s) => s.id === x));
      const j = i + d;
      if (j < 0 || j >= visible.length) return;
      [visible[i], visible[j]] = [visible[j], visible[i]];
      ids.splice(0, ids.length, ...visible);
    } else if (act === 'shuffle') {
      for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    } else if (act === 'clearset') {
      if (!confirm('Начать новый пустой сет? Текущий список очистится.')) return;
      await store.newSet().catch(() => toast('Нет связи'));
      return render();
    } else return;
    await store.saveSet({ song_ids: ids }).catch(() => toast('Не сохранилось — нет связи'));
    return render();
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target;
  e.preventDefault();
  if (form.id === 'find-form') { addState.q = form.querySelector('#find-q').value; return runSearch(); }
  if (form.id === 'link-form') { const url = form.querySelector('#link-url').value.trim(); if (url) loadDraft(url); return; }
  if (form.id === 'song-form') {
    const d = readForm(form);
    if (!d.title) return toast('Нужно название');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (route.name === 'edit') {
        await store.updateSong(route.id, { title: d.title, artist: d.artist, body: d.body, youtube: d.youtube });
        location.hash = `#/song/${route.id}`;
        toast('Сохранили');
        return;
      }
      const me = await needMe('Выбери себя — так будет видно, кто добавил песню.');
      const id = await store.addSong({ title: d.title, artist: d.artist, body: d.body, youtube: d.youtube, source_url: addState.draft?.source_url || null, added_by: me });
      fetchBassInBackground(id, d.title, d.artist);
      if (d.toset) await store.saveSet({ song_ids: [...(db.set?.song_ids || []), id] });
      if (d.canplay && me) await store.toggleMark(id, me, 'canplay');
      addState.draft = null;
      location.hash = `#/song/${id}`;
      toast('Песня добавлена');
    } catch (err) {
      console.error(err);
      toast('Не сохранилось: ' + err.message.slice(0, 80));
      btn.disabled = false;
    }
  }
});

let setInputTimer;
document.addEventListener('input', (e) => {
  if (e.target.id === 'set-q') {
    setQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const el = document.getElementById('set-q');
    el.focus();
    try { el.setSelectionRange(pos, pos); } catch { /* type=search */ }
  }
  if (e.target.id === 'set-title' || e.target.id === 'set-date') {
    clearTimeout(setInputTimer);
    const patch = e.target.id === 'set-title' ? { title: e.target.value || 'Сет на вечер' } : { date: e.target.value || null };
    setInputTimer = setTimeout(() => store.saveSet(patch).catch(() => toast('Нет связи')), 500);
  }
});

// Ручная прокрутка останавливает автопрокрутку
['touchstart', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { if (scrollTimer) { stopScroll(); updateDock(); } }, { passive: true }));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && route.name === 'song') keepAwake(true); });

// ---------- старт ----------
applyTheme();
store.onChange(() => {
  if (route.name === 'add' || route.name === 'edit') return;
  // не сбиваем ввод и играющее видео фоновым обновлением
  if (document.activeElement?.matches('input, textarea') || document.querySelector('.video iframe')) return;
  render();
});
window.addEventListener('hashchange', onRoute);
onRoute();
store.load();
setInterval(() => { if (document.visibilityState === 'visible' && !scrollTimer && route.name !== 'add' && route.name !== 'edit' && store.remote) store.load(); }, 60000);

// Новая версия сайта: сервис-воркер сменился — перезагружаемся, но не посреди ввода песни
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return; // первая установка — страница и так свежая
    if (route.name === 'add' || route.name === 'edit' || scrollTimer || tuner) pendingReload = true;
    else location.reload();
  });
  window.addEventListener('hashchange', () => { if (pendingReload && route.name !== 'add' && route.name !== 'edit') location.reload(); });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    // телефон мог держать вкладку часами — проверяем обновление при возвращении
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}
