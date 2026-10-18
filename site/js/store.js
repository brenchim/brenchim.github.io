// Хранилище: Supabase (общая база) или localStorage (если ключи не заданы).
import { CONFIG } from './config.js';

export const remote = Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
const CACHE_KEY = 'brenchim:cache';
const LOCAL_KEY = 'brenchim:local';

const state = { songs: [], marks: [], plays: [], set: null, loaded: false, offline: false };
export const db = state;

const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((fn) => fn(state));

function safeGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } }
function safeSet(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* квота или приватный режим */ } }

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

function persistLocal() {
  if (remote) safeSet(CACHE_KEY, { songs: state.songs, marks: state.marks, plays: state.plays, set: state.set });
  else safeSet(LOCAL_KEY, { songs: state.songs, marks: state.marks, plays: state.plays, set: state.set });
}

export async function load() {
  if (!remote) {
    const local = safeGet(LOCAL_KEY);
    if (local) Object.assign(state, local);
    else {
      const seed = await fetch('data/seed.json').then((r) => r.json()).catch(() => ({ songs: [] }));
      state.songs = seed.songs || [];
    }
    state.loaded = true;
    emit();
    return;
  }
  const cached = safeGet(CACHE_KEY);
  if (cached && !state.loaded) { Object.assign(state, cached); state.loaded = true; emit(); }
  try {
    const [songs, marks, plays, sets] = await Promise.all([
      rest('songs?select=*&order=created_at.desc'),
      rest('marks?select=song_id,member,kind'),
      rest('plays?select=song_id,member,played_at&order=played_at.desc&limit=5000'),
      rest('sets?select=*&order=created_at.desc&limit=1'),
    ]);
    Object.assign(state, { songs, marks, plays, set: sets[0] || null, loaded: true, offline: false });
    persistLocal();
  } catch (e) {
    console.warn(e);
    state.offline = true;
    state.loaded = true;
  }
  emit();
}

export async function addSong(song) {
  const row = { id: uid(), created_at: new Date().toISOString(), tags: [], ...song };
  if (remote) {
    const [saved] = await rest('songs', { method: 'POST', body: row, prefer: 'return=representation' });
    state.songs.unshift(saved);
  } else state.songs.unshift(row);
  persistLocal(); emit();
  return row.id;
}

export async function updateSong(id, patch) {
  if (remote) await rest(`songs?id=eq.${id}`, { method: 'PATCH', body: patch });
  const s = state.songs.find((x) => x.id === id);
  if (s) Object.assign(s, patch, { updated_at: new Date().toISOString() });
  persistLocal(); emit();
}

export async function deleteSong(id) {
  if (remote) await rest(`songs?id=eq.${id}`, { method: 'DELETE' });
  state.songs = state.songs.filter((s) => s.id !== id);
  state.marks = state.marks.filter((m) => m.song_id !== id);
  state.plays = state.plays.filter((p) => p.song_id !== id);
  if (state.set) state.set.song_ids = state.set.song_ids.filter((x) => x !== id);
  persistLocal(); emit();
}

export const hasMark = (songId, member, kind) => state.marks.some((m) => m.song_id === songId && m.member === member && m.kind === kind);

export async function toggleMark(songId, member, kind) {
  const on = hasMark(songId, member, kind);
  if (on) {
    state.marks = state.marks.filter((m) => !(m.song_id === songId && m.member === member && m.kind === kind));
    emit();
    if (remote) await rest(`marks?song_id=eq.${songId}&member=eq.${encodeURIComponent(member)}&kind=eq.${kind}`, { method: 'DELETE' });
  } else {
    state.marks.push({ song_id: songId, member, kind });
    emit();
    if (remote) await rest('marks', { method: 'POST', body: { song_id: songId, member, kind }, prefer: 'resolution=ignore-duplicates' });
  }
  persistLocal();
}

export async function addPlay(songId, member) {
  const row = { song_id: songId, member: member || null, played_at: new Date().toISOString() };
  state.plays.unshift(row);
  emit();
  if (remote) await rest('plays', { method: 'POST', body: row });
  persistLocal();
}

export async function saveSet(patch) {
  if (!state.set) {
    const row = { id: uid(), title: 'Сет на вечер', date: null, song_ids: [], ...patch };
    state.set = row;
    emit();
    if (remote) { const [saved] = await rest('sets', { method: 'POST', body: row, prefer: 'return=representation' }); state.set = saved; }
  } else {
    Object.assign(state.set, patch);
    emit();
    if (remote) await rest(`sets?id=eq.${state.set.id}`, { method: 'PATCH', body: patch });
  }
  persistLocal(); emit();
}

export async function newSet() {
  state.set = null;
  await saveSet({ title: 'Сет на вечер', date: null, song_ids: [] });
}

// ---------- производные ----------
export const playsOf = (id) => state.plays.filter((p) => p.song_id === id);
export const marksOf = (id, kind) => state.marks.filter((m) => m.song_id === id && m.kind === kind);

export function topSongs(limit = 10) {
  const score = new Map();
  for (const p of state.plays) score.set(p.song_id, (score.get(p.song_id) || 0) + 1);
  for (const m of state.marks) if (m.kind === 'like') score.set(m.song_id, (score.get(m.song_id) || 0) + 0.5);
  return state.songs
    .map((s) => ({ s, sc: score.get(s.id) || 0 }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, limit)
    .map((x) => x.s);
}

export function forgottenSongs(limit = 6) {
  const last = new Map();
  for (const p of state.plays) if (!last.has(p.song_id)) last.set(p.song_id, p.played_at);
  return state.songs
    .filter((s) => last.has(s.id))
    .sort((a, b) => (last.get(a.id) < last.get(b.id) ? -1 : 1))
    .slice(0, limit);
}
