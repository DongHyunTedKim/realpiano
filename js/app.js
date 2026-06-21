/* =====================================================================
 * app.js — UI 렌더링 + 상태 + Web Audio
 * chords.js(window.MiniXi)에 의존.
 * ===================================================================== */

(function () {
  'use strict';

  const { NOTES_EN, NOTES_KO, CHORD_TYPES, buildChord, chordLabel, parseChord, chordsOfType } = window.MiniXi;

  // 건반 범위: C4(60) ~ C6(84) = 25건반
  const MIDI_LOW = 60;
  const MIDI_HIGH = 84;
  const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B

  // ── 상태 ──────────────────────────────────────────────
  let lang = 'en';            // 'en' | 'ko'
  let activeTypeId = 'maj';   // 현재 브라우징 중인 코드 타입
  let currentChord = null;    // 마지막으로 선택된 코드
  const keyEls = {};          // midi → DOM 엘리먼트

  // ── DOM 참조 ─────────────────────────────────────────
  const $piano = document.getElementById('piano');
  const $chordName = document.getElementById('chordName');
  const $chordType = document.getElementById('chordType');
  const $chordNotes = document.getElementById('chordNotes');
  const $playBtn = document.getElementById('playBtn');
  const $search = document.getElementById('search');
  const $searchClear = document.getElementById('searchClear');
  const $searchHint = document.getElementById('searchHint');
  const $typeTabs = document.getElementById('typeTabs');
  const $rootGrid = document.getElementById('rootGrid');
  const $langToggle = document.getElementById('langToggle');

  /* ============================================================
   * Web Audio — OscillatorNode + GainNode 합성음
   * 모바일 Safari 정책: 반드시 사용자 제스처 안에서 ctx 생성/resume
   * ============================================================ */
  let audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  /** 한 음을 ADSR 엔벨로프로 재생 */
  function playNote(midi, when, gainScale) {
    const ctx = audioCtx;
    const t = when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(midi);

    const peak = 0.9 * gainScale;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.012);   // Attack
    gain.gain.exponentialRampToValueAtTime(peak * 0.65, t + 0.18); // Decay
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);   // Release

    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  /** 코드 구성음 동시 재생 (클리핑 방지를 위해 음 수로 게인 분배) */
  function playChord(midiNotes) {
    const ctx = ensureAudio();
    const t = ctx.currentTime + 0.01;
    const scale = 1 / Math.max(2, midiNotes.length);
    midiNotes.forEach((m) => playNote(m, t, scale));
  }

  /* ============================================================
   * 피아노 건반 렌더 (1회)
   * 흰 건반은 flex 행, 검은 건반은 절대위치(left = 흰건반 누적 %)
   * ============================================================ */
  function renderKeyboard() {
    $piano.innerHTML = '';
    let whiteCount = 0;

    for (let midi = MIDI_LOW; midi <= MIDI_HIGH; midi++) {
      const pc = midi % 12;
      const isWhite = WHITE_PCS.includes(pc);

      const el = document.createElement('div');
      el.className = isWhite ? 'key key-white' : 'key key-black';
      el.dataset.midi = String(midi);
      el.dataset.pc = String(pc);

      const label = document.createElement('span');
      label.className = 'key__label';
      el.appendChild(label);

      const role = document.createElement('span');
      role.className = 'key__role';
      el.appendChild(role);

      if (isWhite) {
        $piano.appendChild(el);
        whiteCount++;
      } else {
        // 검은 건반: 지금까지 배치된 흰 건반 수 위치 경계에 올림
        el.style.left = ((whiteCount / 15) * 100) + '%';
        $piano.appendChild(el);
      }

      // 개별 건반 클릭 → 단음 재생
      el.addEventListener('click', () => {
        ensureAudio();
        playChord([midi]);
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 560);
      });

      keyEls[midi] = el;
    }
    updateKeyLabels();
  }

  /** 건반 음이름 레이블 갱신 (한/영) */
  function updateKeyLabels() {
    const names = lang === 'en' ? NOTES_EN : NOTES_KO;
    Object.values(keyEls).forEach((el) => {
      const pc = Number(el.dataset.pc);
      el.querySelector('.key__label').textContent = names[pc];
    });
  }

  /* ============================================================
   * 코드 선택 → 하이라이트 + 레이블 + 소리
   * ============================================================ */
  function roleTier(role) {
    if (role === 'R') return 'root';
    if (role === '5') return '5th';
    if (role === '♭7' || role === '7') return '7th';
    return 'mid'; // 2,♭3,3,4,♭5,♯5
  }

  function clearHighlight() {
    Object.values(keyEls).forEach((el) => {
      el.classList.remove('is-on', 'tier-root', 'tier-mid', 'tier-5th', 'tier-7th');
      el.querySelector('.key__role').textContent = '';
    });
  }

  function selectChord(chord, opts = {}) {
    currentChord = chord;
    clearHighlight();

    const names = lang === 'en' ? NOTES_EN : NOTES_KO;

    // 1) 디스플레이 갱신
    $chordName.textContent = chordLabel(chord);
    $chordType.textContent = lang === 'en' ? chord.type.name : chord.type.nameKo;

    // 2) 구성음 칩
    $chordNotes.innerHTML = '';
    chord.notes.forEach((n) => {
      const tier = roleTier(n.role);
      const chip = document.createElement('div');
      chip.className = 'note-chip';
      chip.dataset.roleTier = tier;
      chip.innerHTML =
        '<span class="note-chip__role">' + n.role + '</span>' +
        '<span class="note-chip__name">' + names[n.pc] + '</span>';
      $chordNotes.appendChild(chip);
    });

    // 3) 건반 하이라이트 + 역할 배지 + 반짝임
    chord.notes.forEach((n) => {
      const el = keyEls[n.midi];
      if (!el) return;
      const tier = roleTier(n.role);
      el.classList.add('is-on', 'tier-' + tier);
      el.querySelector('.key__role').textContent = n.role;
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 560);
    });

    // 4) 소리
    $playBtn.disabled = false;
    if (opts.play !== false) {
      playChord(chord.notes.map((n) => n.midi));
    }

    // 5) 루트 버튼 active 동기화 (브라우징 타입과 일치할 때)
    syncRootButtons();
  }

  /* ============================================================
   * 검색
   * ============================================================ */
  function handleSearch() {
    const text = $search.value;
    $searchClear.hidden = text.length === 0;

    if (!text.trim()) {
      $searchHint.textContent = '';
      $searchHint.className = 'search__hint';
      return;
    }

    const chord = parseChord(text);
    if (chord) {
      $searchHint.textContent = '✓ ' + chordLabel(chord) + ' — ' +
        (lang === 'en' ? chord.type.name : chord.type.nameKo);
      $searchHint.className = 'search__hint is-ok';
      // 브라우징 타입도 검색 결과에 맞춰 전환
      if (chord.type.id !== activeTypeId) {
        activeTypeId = chord.type.id;
        renderTypeTabs();
        renderRootButtons();
      }
      selectChord(chord);
    } else {
      $searchHint.textContent = '인식할 수 없는 코드입니다. 예) Caug, Dm7, G#7, Bbmaj7';
      $searchHint.className = 'search__hint is-error';
    }
  }

  /* ============================================================
   * 브라우징 — 코드타입 탭 + 루트 버튼
   * ============================================================ */
  function renderTypeTabs() {
    $typeTabs.innerHTML = '';
    CHORD_TYPES.forEach((type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tab' + (type.id === activeTypeId ? ' is-active' : '');
      btn.textContent = type.id === 'maj' ? 'Major' : type.symbol;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(type.id === activeTypeId));
      btn.addEventListener('click', () => {
        activeTypeId = type.id;
        renderTypeTabs();
        renderRootButtons();
      });
      $typeTabs.appendChild(btn);
    });
  }

  function renderRootButtons() {
    $rootGrid.innerHTML = '';
    const list = chordsOfType(activeTypeId);
    const names = lang === 'en' ? NOTES_EN : NOTES_KO;
    list.forEach((chord) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'root-btn';
      btn.dataset.label = chordLabel(chord);
      btn.textContent = names[chord.rootPc] + chord.type.symbol;
      btn.addEventListener('click', () => {
        $search.value = '';
        $searchClear.hidden = true;
        $searchHint.textContent = '';
        $searchHint.className = 'search__hint';
        selectChord(chord);
      });
      $rootGrid.appendChild(btn);
    });
    syncRootButtons();
  }

  /** 현재 선택 코드와 일치하는 루트 버튼 강조 */
  function syncRootButtons() {
    if (!currentChord) return;
    const label = chordLabel(currentChord);
    $rootGrid.querySelectorAll('.root-btn').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.label === label);
    });
  }

  /* ============================================================
   * 한/영 토글
   * ============================================================ */
  function setLang(next) {
    lang = next;
    $langToggle.querySelectorAll('.lang-toggle__opt').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.lang === lang);
    });
    updateKeyLabels();
    renderRootButtons();
    if (currentChord) selectChord(currentChord, { play: false });
  }

  /* ============================================================
   * 초기화 + 이벤트 바인딩
   * ============================================================ */
  function init() {
    renderKeyboard();
    renderTypeTabs();
    renderRootButtons();

    $piano.classList.add('show-labels'); // 음이름 항상 표시(초보자 가이드)

    // 검색
    $search.addEventListener('input', handleSearch);
    $searchClear.addEventListener('click', () => {
      $search.value = '';
      $searchClear.hidden = true;
      $searchHint.textContent = '';
      $searchHint.className = 'search__hint';
      $search.focus();
    });

    // 다시 듣기
    $playBtn.addEventListener('click', () => {
      if (currentChord) playChord(currentChord.notes.map((n) => n.midi));
    });

    // 한/영
    $langToggle.addEventListener('click', () => setLang(lang === 'en' ? 'ko' : 'en'));

    // 데모 기본값: C 메이저 (소리는 자동재생하지 않음 — 제스처 정책)
    selectChord(buildChord(0, CHORD_TYPES[0]), { play: false });
    $playBtn.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
