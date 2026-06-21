# MVP.md — 피아노 코드 & 건반 시각화 웹 서비스 (MiniXi)

> 단일 진실 원본: `PRD.md`. 본 문서는 그 구현 설계서이다.

---

## Architecture

100% 클라이언트 사이드 정적 웹 앱 (서버·백엔드·빌드 도구 없음).

```
[Browser]
  index.html ── css/styles.css (디자인 시스템)
            └── js/chords.js  (코드 데이터 + 파싱: 순수 함수)
            └── js/app.js     (UI 렌더 + 상태 + Web Audio)
```

- 데이터 흐름: 사용자 입력(검색/탭) → `chords.js`가 코드 객체 반환 → `app.js`가 건반 하이라이트 + 레이블 + 오디오 재생
- 상태: 메모리 내 단순 변수(`lang`, `currentChord`). 영속 저장 없음(Out of Scope).
- 모든 경로는 상대 경로(GitHub Pages 서브패스 대응).

## Tech Stack

| 영역 | 기술 / 버전 |
|------|------|
| 마크업 | HTML5 |
| 스타일 | CSS3 (Custom Properties, Grid/Flexbox), HSL 톤온톤 다크 테마 |
| 로직 | Vanilla JavaScript (ES2020, 모듈 없이 전역 스크립트 순서 로드) |
| 사운드 | Web Audio API — `OscillatorNode`(triangle) + `GainNode` ADSR |
| 폰트 | Google Fonts `Inter` (CDN 1개) |
| 빌드 | 없음 |
| 배포 | GitHub Pages (정적 호스팅) |

외부 의존성: CDN 폰트 1개뿐 (PRD 제약: 1~2개 이하 충족).

## Database Design
N/A — 백엔드/DB 없음. 코드 데이터는 `js/chords.js`에 정적 정의(런타임 생성).

## API Design
N/A — 외부 API 호출 없음. 모든 연산은 클라이언트 로컬.

## UI Structure

화면 1개(SPA, 스크롤 없는 단일 뷰 지향).

```
<header>           앱 타이틀 + 한/영 토글
<section .stage>
  ├ 코드 디스플레이 (현재 코드명 + 구성음 칩)
  └ 피아노 건반 (#piano, 25키, 상단 고정 느낌)
<section .controls>
  ├ 검색창 (#search) + 안내
  ├ 코드타입 탭 (Major/minor/7/maj7/m7/aug/dim/sus2/sus4)
  └ 루트음 버튼 12개 (선택된 타입 기준)
```

컴포넌트(함수 단위, 과한 추상화 지양):
- `renderKeyboard()` — 25건반 DOM 1회 생성
- `highlightChord(chord)` — 건반 점등 + 역할 레이블 + 칩
- `playChord(midiNotes)` — Web Audio 동시 재생
- `renderTypeTabs()`, `renderRootButtons(typeId)` — 브라우징
- `parseChord(text)` — 검색 파싱 (chords.js)

## Development Tasks (구현 순서)

- [x] 1. 프로젝트 골격 (index.html, css, js 파일)
- [x] 2. 디자인 시스템 (HSL 변수, 타이포, 반응형 토큰)
- [x] 3. `chords.js`: 루트/타입/역할 데이터 + `buildChord()` + `parseChord()`
- [x] 4. 피아노 건반 렌더 (흰15·검10, 절대위치 정렬, C4~C6)
- [x] 5. 하이라이트 + 반짝임 애니메이션 + 역할 레이블
- [x] 6. Web Audio 합성음 (클릭 제스처 내 init, ADSR)
- [x] 7. 검색창 연동 (#/b 정규화, alias 매칭)
- [x] 8. 코드타입 탭 + 루트 버튼 브라우징
- [x] 9. 한/영 음이름 토글
- [x] 10. 모바일 반응형 + 접근성(텍스트 정보) 마감

## Deployment Plan

빌드 불필요. 정적 파일 그대로 호스팅.

**로컬 실행**
```bash
# 정적 서버 아무거나
python3 -m http.server 5173
# → http://localhost:5173
```
(Web Audio는 file:// 에서도 동작하나, 로컬 서버 권장)

**GitHub Pages 배포**
```bash
git init && git add . && git commit -m "feat: MiniXi piano chord visualizer"
git branch -M main
git remote add origin <REPO_URL>
git push -u origin main
# GitHub → Settings → Pages → Source: main / root → 저장
```
상대 경로 사용으로 `https://<user>.github.io/<repo>/` 서브패스에서 정상 동작.
