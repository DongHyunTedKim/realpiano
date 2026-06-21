/* =====================================================================
 * chords.js — 코드 데이터 + 파싱 (순수 로직, DOM/오디오 의존 없음)
 *
 * 음 표기는 반음 인덱스(pitch class 0~11)를 기준으로 한다.
 *   0=C 1=C# 2=D 3=D# 4=E 5=F 6=F# 7=G 8=G# 9=A 10=A# 11=B
 * MIDI 노트: C4 = 60. 건반 범위는 C4(60) ~ C6(84) 의 25건반.
 * ===================================================================== */

// 12개 루트음 (영미식 / 한국식)
const NOTES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_KO = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'];

// 코드 타입 정의 — intervals: 루트로부터의 반음 거리
// aliases: 검색 시 인식할 표기들 (파싱에서 길이 내림차순으로 매칭)
const CHORD_TYPES = [
  { id: 'maj',  name: 'Major',         nameKo: '메이저',      symbol: '',     intervals: [0, 4, 7],     aliases: ['maj', 'M', ''] },
  { id: 'min',  name: 'Minor',         nameKo: '마이너',      symbol: 'm',    intervals: [0, 3, 7],     aliases: ['min', 'm', '-'] },
  { id: '7',    name: 'Dominant 7th',  nameKo: '도미넌트 7',  symbol: '7',    intervals: [0, 4, 7, 10], aliases: ['dom7', '7'] },
  { id: 'maj7', name: 'Major 7th',     nameKo: '메이저 7',    symbol: 'maj7', intervals: [0, 4, 7, 11], aliases: ['maj7', 'M7', 'Δ7', 'Δ'] },
  { id: 'm7',   name: 'Minor 7th',     nameKo: '마이너 7',    symbol: 'm7',   intervals: [0, 3, 7, 10], aliases: ['min7', 'm7', '-7'] },
  { id: 'aug',  name: 'Augmented',     nameKo: '어그멘티드',  symbol: 'aug',  intervals: [0, 4, 8],     aliases: ['aug', '+'] },
  { id: 'dim',  name: 'Diminished',    nameKo: '디미니쉬드',  symbol: 'dim',  intervals: [0, 3, 6],     aliases: ['dim', '°', 'o'] },
  { id: 'sus2', name: 'Suspended 2nd', nameKo: '서스2',       symbol: 'sus2', intervals: [0, 2, 7],     aliases: ['sus2'] },
  { id: 'sus4', name: 'Suspended 4th', nameKo: '서스4',       symbol: 'sus4', intervals: [0, 5, 7],     aliases: ['sus4', 'sus'] },
];

// 반음 거리 → 음의 역할 레이블
const ROLE_BY_SEMITONE = {
  0: 'R', 2: '2', 3: '♭3', 4: '3', 5: '4',
  6: '♭5', 7: '5', 8: '♯5', 10: '♭7', 11: '7',
};

// 루트 문자 → pitch class 기본값
const LETTER_TO_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * 코드 객체를 만든다.
 * @param {number} rootPc  루트 pitch class (0~11)
 * @param {object} type    CHORD_TYPES 항목
 * @returns {{rootPc, type, notes: Array<{pc,midi,role}>}}
 *
 * 모든 코드는 4옥타브(루트 midi = 60 + rootPc)에서 위로 쌓는다.
 * 최고음 = B(71) + 11 = 82(A#5) → C6(84) 범위 내에 항상 들어온다.
 */
function buildChord(rootPc, type) {
  const rootMidi = 60 + rootPc;
  const notes = type.intervals.map((iv) => ({
    pc: (rootPc + iv) % 12,
    midi: rootMidi + iv,
    role: ROLE_BY_SEMITONE[iv] || '?',
  }));
  return { rootPc, type, notes };
}

/** 코드의 표시 이름 (예: "C", "Dm7", "G#aug") */
function chordLabel(chord) {
  return NOTES_EN[chord.rootPc] + chord.type.symbol;
}

/**
 * 검색어를 코드 객체로 파싱한다. 인식 실패 시 null.
 * 지원: 루트(A~G) + 선택적 #/♯/b/♭ + 코드 접미사.
 * 예) "Caug", "Dm7", "G#7", "Bbmaj7", "f#dim", "Asus4"
 */
function parseChord(text) {
  if (!text) return null;
  let s = text.trim().replace(/\s+/g, '');
  if (!s) return null;

  // 1) 루트 문자
  const letter = s[0].toUpperCase();
  if (!(letter in LETTER_TO_PC)) return null;
  let pc = LETTER_TO_PC[letter];
  s = s.slice(1);

  // 2) 임시표 (#/♯ 또는 b/♭)
  if (s[0] === '#' || s[0] === '♯') { pc = (pc + 1) % 12; s = s.slice(1); }
  else if (s[0] === 'b' || s[0] === '♭') { pc = (pc + 11) % 12; s = s.slice(1); }

  // 3) 접미사 → 코드 타입.
  // 'M'(메이저)와 'm'(마이너)은 대소문자로 구분되는 표기이므로,
  // 이 모호한 alias만 대소문자를 엄격히 비교하고 나머지는 대소문자 무시.
  const suffix = s;
  const lowSuffix = suffix.toLowerCase();
  const caseSensitive = new Set(['M', 'm', 'M7', 'm7']);

  const candidates = [];
  for (const type of CHORD_TYPES) {
    for (const alias of type.aliases) {
      candidates.push({ type, alias });
    }
  }
  // 긴 alias 우선 (maj7 > maj, m7 > m)
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const c of candidates) {
    const matched = caseSensitive.has(c.alias)
      ? suffix === c.alias
      : lowSuffix === c.alias.toLowerCase();
    if (matched) return buildChord(pc, c.type);
  }
  return null;
}

/** 한 코드 타입의 12 루트음 코드 전체 반환 (브라우징용) */
function chordsOfType(typeId) {
  const type = CHORD_TYPES.find((t) => t.id === typeId);
  if (!type) return [];
  return NOTES_EN.map((_, pc) => buildChord(pc, type));
}

// 전역 노출 (모듈 번들 없이 사용)
window.MiniXi = {
  NOTES_EN, NOTES_KO, CHORD_TYPES,
  buildChord, chordLabel, parseChord, chordsOfType,
};
