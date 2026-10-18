// Работа с текстом песни в формате «аккорды над строкой».

const CHORD_RE = /^\(?([A-H])(#|b)?(m(?!aj)|min)?(maj|dim|aug|sus|add|\+|-|M)?\d*(?:(?:sus|add|maj|b|#|\+|-|\/)?\d+)*(?:\/([A-H])(#|b)?)?\)?$/;
const FILLER_RE = /^(\||\/|-|–|x\d+|х\d+|\(x?\d+\)|\d+x|\.{2,}|\(|\)|N\.?C\.?)$/i;

export const isChord = (tok) => CHORD_RE.test(tok);

// Токен может быть обёрнут в скобки, иметь повтор и позицию на грифе: (Am) {Em}x4 C| G(III)
const TOKEN_RE = /^([{(\[|]*)(.*?)((?:\([IVX]+\))?[})\]|]*(?:[xх]\d+)?[})\]|]*)$/i;
const splitToken = (t) => { const m = TOKEN_RE.exec(t); return m ? [m[1], m[2], m[3]] : ['', t, '']; };
const coreOf = (t) => splitToken(t)[1];

export function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return false;
  let chords = 0;
  for (const t of toks) {
    const c = coreOf(t);
    if (c && isChord(c)) chords++;
    else if (c && !FILLER_RE.test(c)) return false;
  }
  return chords > 0;
}

const LABEL_RE = /^\s*(\[[^\]]{1,40}\]:?|(куплет|припев|приспів|вступ|вступление|бридж|проигрыш|програш|кода|интро|аутро|chorus|verse|intro|outro|bridge)[^:]{0,20}:?)\s*$/i;

const INLINE_LABEL_RE = /^(\s*\[([^\]]{1,40})\]:?)(.*)$/;

/** Разбирает текст в строки: { type: 'chords'|'text'|'label'|'gap', text } */
export function parseSheet(body) {
  const out = [];
  const classify = (line) => {
    if (!line.trim()) return { type: 'gap', text: '' };
    if (isChordLine(line)) return { type: 'chords', text: line };
    if (LABEL_RE.test(line)) return { type: 'label', text: line.trim().replace(/^\[|\]:?$/g, '').replace(/:$/, '') };
    return { type: 'text', text: line };
  };
  for (const raw of (body || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    // amdm: «[Куплет]:C   G   D» — метка и аккорды в одной строке
    const m = INLINE_LABEL_RE.exec(line);
    if (m && m[3].trim() && isChordLine(m[3])) {
      out.push({ type: 'label', text: m[2].trim() });
      out.push({ type: 'chords', text: ' '.repeat(m[1].length) + m[3] });
      continue;
    }
    out.push(classify(line));
  }
  return out;
}

/** Самый частый аккорд — грубая, но рабочая оценка тональности. */
export function mainChord(body) {
  const count = new Map();
  for (const l of parseSheet(body)) {
    if (l.type !== 'chords') continue;
    for (const t of l.text.trim().split(/\s+/)) {
      const c = coreOf(t).replace(/\/.*$/, '');
      if (c && isChord(c)) count.set(c, (count.get(c) || 0) + 1);
    }
  }
  let best = '', n = 0;
  for (const [c, k] of count) if (k > n) { best = c; n = k; }
  return best;
}

/** Длина самой длинной строки — чтобы подогнать шрифт под ширину экрана. */
export function longestLine(body, withChords) {
  let max = 0;
  for (const l of parseSheet(body)) {
    if (l.type === 'gap' || l.type === 'label' || (!withChords && l.type === 'chords')) continue;
    max = Math.max(max, l.text.length);
  }
  return max;
}

export function uniqueChords(body) {
  const seen = new Set();
  const out = [];
  for (const l of parseSheet(body)) {
    if (l.type !== 'chords') continue;
    for (const t of l.text.trim().split(/\s+/)) {
      const c = coreOf(t);
      if (c && isChord(c) && !seen.has(c)) { seen.add(c); out.push(c); }
    }
  }
  return out;
}

// Транспонирование. Если в песне есть H, считаем «немецкую» запись: H = си, B = си-бемоль.
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_IDX = { Db: 1, Eb: 3, Gb: 6, Ab: 8, Bb: 10, Cb: 11, Fb: 4 };

export function usesH(body) { return uniqueChords(body).some((c) => /^H|\/H/.test(c)); }

function noteIndex(letter, acc, german) {
  let name = letter + (acc || '');
  if (german) {
    if (name === 'H') name = 'B';
    else if (name === 'B') name = 'A#';
    else if (name === 'Hb') name = 'A#';
  }
  if (FLAT_IDX[name] != null) return FLAT_IDX[name];
  if (name === 'E#') return 5;
  if (name === 'B#') return 0;
  return SHARP.indexOf(name);
}
function noteName(i, german) {
  const n = SHARP[((i % 12) + 12) % 12];
  if (german) { if (n === 'B') return 'H'; if (n === 'A#') return 'B'; }
  if (n === 'A#') return 'Bb';
  if (n === 'D#') return 'Eb';
  return n;
}

export function transposeChord(chord, shift, german) {
  if (!shift) return chord;
  return chord.replace(/([A-H])(#|b)?/g, (m, l, a) => {
    const i = noteIndex(l, a, german);
    return i < 0 ? m : noteName(i + shift, german);
  });
}

/** Транспонирует строку аккордов, стараясь сохранить позиции над текстом. */
export function transposeLine(line, shift, german) {
  if (!shift) return line;
  let out = '';
  let debt = 0;
  for (const part of line.split(/(\s+)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part)) {
      out += ' '.repeat(Math.max(1, part.length - debt));
      debt = 0;
    } else {
      const [a, core, b] = splitToken(part);
      const t = core && isChord(core) ? a + transposeChord(core, shift, german) + b : part;
      debt += t.length - part.length;
      out += t;
    }
  }
  return out;
}

// Аппликатуры: строки от 6-й (низкая E) к 1-й, x — не играть.
const SHAPES = {
  C: 'x32010', C7: 'x32310', Cmaj7: 'x32000', Cadd9: 'x32030', Cm: 'x35543', 'C#': 'x46664', 'C#m': 'x46654',
  D: 'xx0232', Dm: 'xx0231', D7: 'xx0212', Dm7: 'xx0211', Dmaj7: 'xx0222', Dsus2: 'xx0230', Dsus4: 'xx0233', 'D#': 'x68886', 'D#m': 'x68876',
  E: '022100', Em: '022000', E7: '020100', Em7: '022030', Esus4: '022200', F: '133211', Fm: '133111', F7: '131211', Fmaj7: 'xx3210',
  'F#': '244322', 'F#m': '244222', 'F#7': '242322', G: '320003', G7: '320001', Gm: '355333', Gsus4: '330013', 'G#': '466544', 'G#m': '466444',
  A: 'x02220', Am: 'x02210', A7: 'x02020', Am7: 'x02010', Asus2: 'x02200', Asus4: 'x02230', Amaj7: 'x02120',
  'A#': 'x13331', 'A#m': 'x13321', B: 'x24442', Bm: 'x24432', B7: 'x21202', Bm7: 'x20202',
};
const ALIAS = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#', Hb: 'A#' };

function shapeFor(chord, german) {
  let c = chord.replace(/\/.*$/, '').replace(/min$/, 'm');
  const m = /^([A-H])(#|b)?(.*)$/.exec(c);
  if (!m) return null;
  const i = noteIndex(m[1], m[2], german);
  if (i < 0) return null;
  let root = SHARP[i];
  if (ALIAS[root]) root = ALIAS[root];
  return SHAPES[root + m[3]] || null;
}

export function chordDiagramSVG(chord, german) {
  const shape = shapeFor(chord, german);
  if (!shape) return '';
  const frets = shape.split('').map((ch) => (ch === 'x' ? -1 : parseInt(ch, 10)));
  const played = frets.filter((f) => f > 0);
  const max = Math.max(0, ...played);
  const base = max > 4 ? Math.min(...played) : 1;
  const W = 50, H = 60, left = 6, top = 12, gap = 7.6, fh = 11;
  let s = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">`;
  if (base === 1) s += `<rect x="${left}" y="${top - 2.5}" width="${gap * 5}" height="2.5" fill="currentColor"/>`;
  else s += `<text x="${left + gap * 5 + 3}" y="${top + 8}" font-size="8" fill="currentColor" opacity=".7">${base}</text>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${left + i * gap}" y1="${top}" x2="${left + i * gap}" y2="${top + fh * 4}" stroke="currentColor" stroke-opacity=".45" stroke-width="1"/>`;
  for (let j = 0; j <= 4; j++) s += `<line x1="${left}" y1="${top + j * fh}" x2="${left + gap * 5}" y2="${top + j * fh}" stroke="currentColor" stroke-opacity=".25" stroke-width="1"/>`;
  // баррэ: одинаковый минимальный лад на крайних струнах
  const minF = Math.min(...played);
  const barreStrings = frets.map((f, i) => (f === minF ? i : -1)).filter((i) => i >= 0);
  if (minF > 0 && barreStrings.length >= 3 && frets[barreStrings[0]] === minF && barreStrings[barreStrings.length - 1] === 5) {
    const y = top + (minF - base + 0.5) * fh;
    s += `<rect x="${left + barreStrings[0] * gap - 3.2}" y="${y - 3.2}" width="${(5 - barreStrings[0]) * gap + 6.4}" height="6.4" rx="3.2" fill="currentColor"/>`;
  }
  frets.forEach((f, i) => {
    const x = left + i * gap;
    if (f < 0) s += `<text x="${x}" y="${top - 4.5}" font-size="7" text-anchor="middle" fill="currentColor" opacity=".6">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${top - 6.5}" r="2.2" fill="none" stroke="currentColor" stroke-width="1"/>`;
    else s += `<circle cx="${x}" cy="${top + (f - base + 0.5) * fh}" r="3.2" fill="currentColor"/>`;
  });
  return s + '</svg>';
}
