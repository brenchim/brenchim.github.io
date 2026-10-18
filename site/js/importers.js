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
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    // сайт ответил «нет такой страницы» — это ответ, а не сбой прокси: в запасной прокси не идём
    if (/upstream status 4\d\d/.test(err.message || '')) throw Object.assign(new Error('not found'), { upstream: true });
    throw new Error(`proxy ${r.status}`);
  }
  const text = await r.json();
  if (typeof text !== 'string' || !text) throw new Error('empty');
  return text;
}

async function viaPublic(url) {
  const r = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`public proxy ${r.status}`);
  return r.text();
}

export async function fetchPage(url) {
  if (CONFIG.supabaseUrl) {
    try { return await viaSupabase(url); } catch (e) { if (e.upstream) throw e; console.warn('proxy_get failed, fallback', e); }
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
      source: 'amdm',
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

// ---------- бас-табы (Ultimate Guitar) ----------
const loose = (s) => (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[ії]/g, 'и').replace(/є/g, 'е').replace(/ґ/g, 'г').replace(/[^\p{L}\p{N}]+/gu, '');

// Название совпадает целиком; приписки в скобках («(live cover)», «(альб. …)») не мешают,
// а «Gruppa Krovi (Группа крови)» засчитывается по скобкам. «Что такое осень» ≠ «Осень».
const titleVariants = (s) => {
  const str = s || '';
  const inside = [...str.matchAll(/\(([^)]*)\)|\[([^\]]*)\]/g)].map((m) => m[1] ?? m[2]);
  return [str.replace(/\([^)]*\)|\[[^\]]*\]/g, ''), ...inside].map(loose).filter(Boolean);
};
const sameTitle = (a, b) => { const B = titleVariants(b); return titleVariants(a).some((x) => B.includes(x)); };

/** Songsterr: интерактивные табы, у многих русских групп есть отдельная дорожка баса. Открываются у них на сайте. */
async function bassSongsterr(title, artist) {
  const ask = async (pattern) => JSON.parse(await fetchPage(`https://www.songsterr.com/api/songs?pattern=${encodeURIComponent(pattern)}&size=20`));
  const ok = (s) => s.popularTrackBass != null && !s.isJunk && sameTitle(s.title, title);
  let list = (await ask(`${artist} ${title}`.trim())).filter(ok);
  // не нашли «исполнитель + название» — ищем по названию и сверяем исполнителя (бывает записан иначе)
  if (!list.length && artist) list = (await ask(title)).filter((s) => ok(s) && sameTitle(s.artist, artist));
  return list
    .slice(0, 3)
    .map((s) => ({
      source: 'Songsterr', external: true,
      url: `https://www.songsterr.com/a/wsa/bass-tab-s${s.songId}`,
      title: s.title, artist: s.artist,
      note: (s.tracks?.[s.popularTrackBass]?.name || '').split('|').slice(0, 2).join('·').trim(),
    }));
}

/** Ultimate Guitar: type=400 — только бас-табы; 404 значит «ничего нет». Текстом, показываем у себя. */
async function bassUG(title, artist) {
  let data;
  try { data = ugStore(await fetchPage(`https://www.ultimate-guitar.com/search.php?search_type=title&type=400&value=${encodeURIComponent(title)}`)); } catch { return []; }
  const a = loose(artist);
  return (data.results || [])
    .filter((r) => r.type === 'Bass Tabs' && r.tab_url?.includes('/tab/') && sameTitle(r.song_name, title))
    .filter((r) => !a || sameTitle(r.artist_name, artist))
    .sort((x, y) => (y.votes || 0) - (x.votes || 0))
    .slice(0, 3)
    .map((r) => ({ source: 'UG', url: r.tab_url, title: r.song_name, artist: r.artist_name, note: r.votes ? `★ ${Number(r.rating || 0).toFixed(1)} · ${r.votes} голосов` : '' }));
}

/** Бас-партии к песне из обоих источников. */
export async function findBassTabs(title, artist) {
  const [ss, ug] = await Promise.allSettled([bassSongsterr(title, artist), bassUG(title, artist)]);
  const out = [...(ss.status === 'fulfilled' ? ss.value : []), ...(ug.status === 'fulfilled' ? ug.value : [])];
  if (!out.length && ss.status === 'rejected' && ug.status === 'rejected') throw new Error('no answer');
  return out;
}

export async function importBassTab(url) {
  return (await importUG(url)).body;
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

/**
 * Видео можно встроить? oEmbed YouTube отдаёт CORS, ходим напрямую.
 * true — да; false — удалено, приватное или встраивание запрещено; null — не смогли проверить (нет сети).
 */
export async function youtubeOk(id) {
  if (!youtubeId(id)) return false;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) return true;
    return [400, 401, 403, 404].includes(r.status) ? false : null;
  } catch { return null; }
}

/** Первое из результатов поиска видео, которое реально работает. skip — уже известные нерабочие id. */
export async function findYoutube(q, skip = []) {
  const html = await fetchPage(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
  const found = [];
  for (const m of html.matchAll(/"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/gs)) {
    if (!found.some((f) => f.id === m[1])) found.push({ id: m[1], title: (() => { try { return JSON.parse(`"${m[2]}"`); } catch { return ''; } })() });
    if (found.length >= 6) break;
  }
  if (!found.length) for (const m of html.matchAll(/"videoId":"([\w-]{11})"/g)) { if (!found.some((f) => f.id === m[1])) found.push({ id: m[1], title: '' }); if (found.length >= 6) break; }
  for (const v of found) {
    if (skip.includes(v.id)) continue;
    const ok = await youtubeOk(v.id);
    if (ok !== false) return v; // null (не проверить) — лучше показать, чем ничего
  }
  return null;
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
  // видео со страницы аккордов бывает удалено — тогда пусть подберётся новое
  if (song.youtube && (await youtubeOk(song.youtube)) === false) song.youtube = null;
  return song;
}
