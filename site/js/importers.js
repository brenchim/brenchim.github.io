// Поиск и импорт аккордов с сайтов-баз. Страницы забираются через прокси в базе (proxy_get),
// а если база не настроена или не ответила — через публичный CORS-прокси.
import { CONFIG } from './config.js';
import { uniqueChords } from './chords.js';

async function viaSupabase(url) {
  const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/proxy_get`, {
    method: 'POST',
    headers: { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`proxy ${r.status}`);
  const text = await r.json();
  if (typeof text !== 'string' || !text) throw new Error('empty');
  return text;
}

async function viaPublic(url) {
  const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`public proxy ${r.status}`);
  return r.text();
}

export async function fetchPage(url) {
  if (CONFIG.supabaseUrl) {
    try { return await viaSupabase(url); } catch (e) { console.warn('proxy_get failed, fallback', e); }
  }
  return viaPublic(url);
}

const parse = (html) => new DOMParser().parseFromString(html, 'text/html');
const clean = (s) => (s || '').replace(/ /g, ' ').replace(/[ \t]+$/gm, '').replace(/^\n+|\n+$/g, '');
const absAmdm = (href) => (href.startsWith('//') ? 'https:' + href : href.startsWith('/') ? 'https://amdm.ru' + href : href);

// ---------- amdm.ru ----------
async function searchAmdm(q) {
  const doc = parse(await fetchPage(`https://amdm.ru/search/?q=${encodeURIComponent(q)}`));
  const out = [];
  doc.querySelectorAll('table.items td.artist_name').forEach((td) => {
    const links = td.querySelectorAll('a');
    const song = [...links].find((a) => /\/akkordi\/[^/]+\/\d+\//.test(a.getAttribute('href') || ''));
    if (!song) return;
    out.push({
      source: 'amdm.ru',
      url: absAmdm(song.getAttribute('href')),
      title: song.textContent.trim(),
      artist: links[0] && links[0] !== song ? links[0].textContent.trim() : '',
    });
  });
  // у amdm бывает много подборов одной песни — подписываем «вариант 2, 3…»
  const seen = new Map();
  for (const r of out) {
    const key = `${r.artist}|${r.title}`.toLowerCase();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    if (n > 1) r.note = `вариант ${n}`;
  }
  return out.slice(0, 6);
}

async function importAmdm(url) {
  const doc = parse(await fetchPage(url));
  const pre = doc.querySelector('pre[itemprop="chordsBlock"]');
  if (!pre) throw new Error('На странице не нашли аккорды');
  pre.querySelectorAll('.podbor__chord').forEach((el) => { el.replaceWith(el.getAttribute('data-chord') || el.textContent); });
  pre.querySelectorAll('.podbor__keyword').forEach((el) => { el.replaceWith(el.textContent); });
  const yt = doc.querySelector('[data-youtube-id]');
  return {
    title: doc.querySelector('h1 [itemprop="name"]')?.textContent.trim() || '',
    artist: doc.querySelector('h1 [itemprop="byArtist"]')?.textContent.trim() || '',
    body: clean(pre.textContent),
    youtube: yt?.getAttribute('data-youtube-id') || null,
    source_url: url,
  };
}

// ---------- Ultimate Guitar ----------
function ugStore(html) {
  const el = parse(html).querySelector('.js-store');
  if (!el) throw new Error('UG: нет данных');
  return JSON.parse(el.getAttribute('data-content')).store.page.data;
}

async function searchUG(q) {
  const data = ugStore(await fetchPage(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(q)}`));
  return (data.results || [])
    .filter((r) => r.type === 'Chords' && r.tab_url && r.tab_url.includes('/tab/'))
    .sort((a, b) => (b.votes || 0) - (a.votes || 0))
    .slice(0, 5)
    .map((r) => ({
      source: 'Ultimate Guitar',
      url: r.tab_url,
      title: r.song_name,
      artist: r.artist_name,
      note: r.votes ? `★ ${Number(r.rating || 0).toFixed(1)} · ${r.votes} голосов` : '',
    }));
}

async function importUG(url) {
  const data = ugStore(await fetchPage(url));
  const content = data.tab_view?.wiki_tab?.content || '';
  return {
    title: data.tab?.song_name || '',
    artist: data.tab?.artist_name || '',
    body: clean(content.replace(/\[\/?(ch|tab)\]/g, '')),
    youtube: null,
    source_url: url,
  };
}

// ---------- любая страница с <pre> ----------
async function importGeneric(url) {
  const doc = parse(await fetchPage(url));
  const pres = [...doc.querySelectorAll('pre')].sort((a, b) => b.textContent.length - a.textContent.length);
  if (!pres.length) throw new Error('Не нашли на странице текст с аккордами');
  const title = (doc.querySelector('h1')?.textContent || doc.title || '').trim().replace(/\s+/g, ' ');
  return { title, artist: '', body: clean(pres[0].textContent), youtube: null, source_url: url };
}

// ---------- YouTube ----------
export function youtubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/|\/live\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export async function findYoutube(q) {
  const html = await fetchPage(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
  const m = html.match(/"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/s);
  if (m) return { id: m[1], title: JSON.parse(`"${m[2]}"`) };
  const id = html.match(/"videoId":"([\w-]{11})"/);
  return id ? { id: id[1], title: '' } : null;
}

// ---------- общий интерфейс ----------
export async function searchAll(q) {
  const jobs = [searchAmdm(q), searchUG(q)];
  const settled = await Promise.allSettled(jobs);
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const failed = settled.filter((s) => s.status === 'rejected').length;
  return { results, failed };
}

export async function importFrom(url) {
  let song;
  if (/amdm\.ru\//.test(url)) song = await importAmdm(url);
  else if (/ultimate-guitar\.com\/tab\//.test(url)) song = await importUG(url);
  else song = await importGeneric(url);
  song.chords = uniqueChords(song.body);
  return song;
}
