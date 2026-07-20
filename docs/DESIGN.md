# 설계서 — 영단어 마스터 (edu_eng_word)

빌드 도구 없이 브라우저에서 바로 실행되는 정적 웹앱입니다. 서버/DB가 없고 모든 데이터는 브라우저 `localStorage`에 저장됩니다. 모바일(카카오톡 링크로 공유) 사용을 최우선으로 설계했습니다.

관련 문서: 요청/변경 이력은 [`PROMPT_HISTORY.md`](./PROMPT_HISTORY.md) 참고.

---

## 1. 기술 스택 및 배포

| 항목 | 내용 |
|---|---|
| 런타임 | 순수 HTML/CSS/JS (프레임워크·빌드 없음) |
| 저장 | 브라우저 `localStorage` |
| 음성 | Web Speech API (`speechSynthesis`) |
| 배포 | GitHub Pages (`main` 브랜치 `/(root)`), 접속 URL: `https://woodong84.github.io/edu_eng_word/` |
| 캐시 무효화 | `index.html`에서 css/js 참조에 `?v=N` 쿼리 부여, 배포 시 N을 올림 (현재 `v=10`) |

정적 자원이라 서버 로직이 없고, `index.html`을 열면 바로 동작합니다. 배포는 GitHub Pages가 `main` 브랜치 push를 감지해 자동 빌드합니다.

---

## 2. 디렉토리 구조

```
.
├── index.html              # 마크업: 프로필 화면 + 앱 본체(6개 섹션) + 오버레이/토스트
├── css/
│   └── style.css           # 모바일 우선 스타일, 레벨 구간별 테마(body[data-tier])
├── js/
│   ├── storage.js          # 저장소 추상화 계층 (Adapter 패턴)
│   ├── profiles.js         # 로컬 프로필(계정) 관리
│   ├── app.js               # 화면 로직 전체 (단어/학습/테스트/오답/상태/설정)
│   └── data/
│       └── elementary-words.js  # 초등 필수 단어 300개 프리셋 (18개 카테고리)
└── docs/
    ├── PROMPT_HISTORY.md   # 요청 이력
    └── DESIGN.md            # 이 문서
```

### 계층 구조 의도

```
index.html ─┬─ css/style.css        (표현)
            └─ js/app.js            (화면 로직)
                 ├─ js/profiles.js  (계정 도메인)
                 └─ js/storage.js   (영속성 — 유일하게 localStorage를 직접 만짐)
                      └─ js/data/elementary-words.js (정적 데이터)
```

`app.js`와 `profiles.js`는 `localStorage`를 직접 호출하지 않고 반드시 `AppStorage`(storage.js)를 거칩니다. 이는 향후 클라우드 DB 전환 시 영향 범위를 storage.js 한 파일로 좁히기 위한 설계입니다 (§8 참고).

---

## 3. 데이터 모델 (localStorage)

모든 키는 `eduword:v2:` 프리픽스로 저장됩니다 (`js/storage.js`의 `AppStorage`가 자동 부여).

| 키 | 타입 | 내용 |
|---|---|---|
| `profiles` | `Profile[]` | 전체 프로필 목록 |
| `activeProfileId` | `string \| null` | 현재 로그인된 프로필 ID |
| `cloudConfig` | `{rawUrl, token}` | 마스터 단어장 GitHub 연동 설정 (프로필 공통) |
| `p:<profileId>:words` | `WordItem[]` | 프로필별 단어장 |
| `p:<profileId>:stats` | `UserStats` | 프로필별 레벨/EXP/스티커/테스트 문제 수 |
| `p:<profileId>:folders` | `Folder[]` | 프로필별 단어 폴더 목록 |

### 타입 정의

```ts
type Profile = {
  id: string;            // 'p' + timestamp36 + random4
  name: string;           // 프로필 이름 (최대 12자, 중복 불가)
  icon: string;            // 이모지 1개 (PROFILE_ICONS 중 선택)
  parentId: string | null; // 상위 프로필 ID (없으면 최상위)
  createdAt: string;       // ISO 날짜
};

type WordItem = {
  id: number;              // Date.now() + Math.random()
  word: string;             // 소문자 정규화된 영단어 (하이픈 복합어 허용)
  addedDate: string;         // YYYY-MM-DD
  correctCount: number;
  incorrectCount: number;
  folderId: string;          // 소속 폴더 ID
  source: 'manual' | 'preset' | 'master'; // 등록 경로 (향후 동기화 시 출처 구분용)
};

type UserStats = {
  level: number;
  exp: number;              // 0~99, 100 도달 시 레벨업
  stickers: string[];        // 레벨업마다 획득한 이모지
  quizCount?: number;        // 학습 탭에서 설정한 테스트 문제 수 (기본 5)
};

type Folder = { id: string; name: string };
```

### 검증 규칙

- 단어 형식: `/^[a-z]+(-[a-z]+)*$/` (영문 소문자 + 하이픈 복합어만 허용, `VALID_WORD_PATTERN`)
- 중복 방지: 같은 프로필의 `wordBank` 안에서 `word` 값 기준 중복 등록 불가 (수동 입력/프리셋/GitHub 마스터 목록 등록 경로 모두 동일 로직 `addWordsToBank()`를 거침)
- 등록 시 결과 리포트: 추가 성공 수 / 중복 제외 수 / 형식 오류 제외 수를 토스트로 안내 (`reportAddResult()`)

---

## 4. 계정(프로필) 모델

서버 인증이 없으므로 "로그인"은 **같은 기기·브라우저 안에서의 프로필 전환**입니다. 비밀번호는 없고 이름+아이콘만으로 구분합니다.

### 4.1 상위/하위 구조

- `Profile.parentId`가 없으면 최상위(독립 또는 상위) 프로필
- `parentId`가 있으면 해당 프로필의 하위 계정 (2단계까지만 허용 — 하위의 하위는 만들지 않음)
- 프로필 삭제 시 하위 계정과 그들의 학습 데이터(`words`/`stats`/`folders`)도 함께 삭제됨

### 4.2 관리자 프로필

`ADMIN_PROFILE_NAMES = ['마스터', '멋쟁이아빠']` (`js/app.js`)로 하드코딩되어 있습니다. 이 이름으로 만든 프로필만:

- 헤더의 ⚙️ 설정 버튼이 보임 (GitHub 마스터 단어장 연동 설정 화면 진입)
- 프로필 전환 시 **전체 프로필**을 조회 가능

이름 문자열을 그대로 비교하므로, 관리자 프로필 이름은 다른 사용자가 쉽게 추측하지 못하는 것으로 정하는 것이 좋습니다 (검색 기능이 정확한 이름 일치로 프로필을 찾아주기 때문 — §4.4).

### 4.3 프로필 조회 범위 (`visibleProfilesFor`)

프로필 전환 화면을 연 시점의 "이전 활성 프로필(viewer)"에 따라 목록이 제한됩니다.

| viewer | 보이는 프로필 |
|---|---|
| 없음 (앱 최초 접속) | 전체 — 아무도 로그인 못 하는 상황을 막기 위한 예외 |
| 관리자(`ADMIN_PROFILE_NAMES`) | 전체 |
| 상위 프로필 | 자신 + 자신을 상위로 둔 하위 프로필들 |
| 하위 프로필 | 자신만 |

### 4.4 프로필 검색 (`searchProfileByName`)

범위 제한 때문에 하위 프로필 사용자가 상위/관리자 프로필로 돌아갈 수 없는 문제를 보완하기 위해, 프로필 화면에 이름 검색창이 있습니다. **정확한 이름 전체 일치**만 허용합니다(부분 검색 금지) — 부분 검색을 허용하면 목록 전체가 사실상 노출되어 조회 범위 제한이 무력화되기 때문입니다. 즉 "이름을 정확히 아는 사람만 이동 가능"이 사실상의 접근 통제 역할을 합니다.

### 4.5 데이터 마이그레이션

- **v1 → v2**: 프로필 개념 도입 전 저장되어 있던 `wordBank`/`userStats`(레거시 최상위 키)를 최초 실행 시 "Sia"라는 이름의 기본 프로필로 자동 이전 (`Profiles.migrateLegacyData()`), `githubConfig` 레거시 키도 `cloudConfig`로 이전 (`migrateLegacyGithubConfig()`)
- **폴더 개념 이전 단어**: `folderId`가 없는 예전 단어는 로드 시 `DEFAULT_FOLDER`로 자동 보정 후 즉시 저장 (`loadProfileData()`)

---

## 5. 화면 구성

`index.html`은 두 개의 최상위 뷰를 토글합니다: `#profile-screen`(프로필 선택) ↔ `#app-root`(학습 앱). 앱 본체는 하단 탭바로 6개 섹션을 전환합니다 (`switchTab()`).

| 탭 | 섹션 ID | 설명 |
|---|---|---|
| 📝 단어 | `sec-manage` | 폴더 선택/생성/삭제, 수동 단어 입력, 초등 300단어 프리셋(기본 접힘) |
| 📖 학습 | `sec-study` | 폴더 필터 칩, 단어 카드(탭=발음 재생, 📖=사전), **테스트 문제 수 설정** |
| 🎧 테스트 | `sec-test` | 테스트 범위(폴더) 선택, 받아쓰기 퀴즈(TTS+Hint+오답 시 빈칸 힌트) |
| ❗ 오답 | `sec-wrong` | 오답 카드 목록 (빨강 고정) |
| 📊 상태 | `sec-status` | 레벨/테스트 건수/오답 건수 카드, 건수 탭 시 상세 목록(색상 구분) |
| ⚙️ 설정 (관리자 전용) | `sec-cloud` | GitHub 마스터 단어장 연동 설정 — 하단 탭바가 아닌 헤더 버튼으로 진입 |

헤더(`.app-header`)는 좌측에 현재 프로필 칩(탭하면 프로필 전환), 우측에 [⚙️ 설정](관리자만) + [프로필 전환] 버튼을 가집니다.

### 5.1 레벨/보상 (`renderRewards`, `gainExp`, `playLevelUpEffect`)

```js
const LEVEL_TIERS = [
  { min: 20, tier: 5, title: '단어 마스터' },
  { min: 15, tier: 4, title: '단어 챔피언' },
  { min: 10, tier: 3, title: '단어 마법사' },
  { min: 5,  tier: 2, title: '단어 탐험가' },
  { min: 1,  tier: 1, title: '단어 새싹' },
];
```

`currentTier()`가 레벨에 맞는 구간을 찾아 `document.body.dataset.tier`에 반영하면, `css/style.css`의 `body[data-tier="N"]` 규칙이 `--primary`/`--bg` 등 CSS 변수를 바꿔 **앱 전체 색상·배경이 자동 전환**됩니다. 레벨업 순간에는 `#levelup-overlay`에 이모지 파티클 24개를 흩뿌리는 애니메이션과 새 스티커를 보여줍니다.

### 5.2 테스트(퀴즈) 흐름

1. 학습 탭에서 "테스트 문제 수"를 설정 (5단위, 선택된 폴더의 단어 수까지, 기본 5개) → `userStats.quizCount`에 프로필별 저장
2. 테스트 탭에서 "테스트 범위"(폴더) 선택 → `quizPool()`이 대상 단어 목록 계산
3. `startCumulativeTest()`가 범위 내에서 `quizCount`만큼 **랜덤**으로 문제 목록(`currentQuizList`) 구성 (범위 단어 수보다 크면 자동 축소)
4. `renderQuiz()`가 문제를 그리고 `playTTS()`로 자동 재생, 오답 시 `generateHintBlank()`가 힌트(첫 글자→모음 순으로 공개)를 늘려가며 재도전
5. 정답 시 `gainExp(10)` (힌트 없이 맞히면), 오답 카운트는 `wordBank` 아이템에 누적되어 오답 노트/상태 탭에 반영

### 5.3 상태 탭 색상 구분

"테스트한 단어"(정답 또는 오답 기록이 있는 단어) 목록을 열면 카드가 3색으로 구분됩니다 (`createWordDetailCard(item, badgeText, variant)`):

| 조건 | variant | 색 |
|---|---|---|
| `incorrectCount === 0` | `correct` | 초록 |
| `correctCount > 0 && incorrectCount > 0` | `mixed` | 주황 |
| `correctCount === 0` (오답만) | 기본값(`wrong`, 미지정) | 빨강 |

오답 노트 탭과 상태 탭의 "오답 단어" 목록은 항상 `wrong`(빨강)만 사용합니다.

---

## 6. 모바일 대응

- **하단 고정 탭바**: `position: fixed`, `env(safe-area-inset-bottom)` 반영 (아이폰 홈 인디케이터 대응). 641px 이상 폭에서는 상단 정적 배치로 전환되며 본문과 16px 여백을 둠
- **터치 타깃**: 버튼 최소 44~52px
- **입력 폰트 16px 이상**: iOS Safari가 16px 미만 입력 포커스 시 자동 확대하는 것을 방지
- **alert() 대신 토스트**: `showToast()` — 모바일에서 네이티브 alert가 흐름을 과하게 끊는 것을 방지
- **TTS(발음) 모바일 버그 대응** (`playTTS`):
  - 모바일 크롬은 `cancel()` 직후 `speak()`를 조용히 무시하는 버그가 있어, 재생 중일 때만 cancel 후 80ms 지연 뒤 재생하고, 유휴 상태에서는 사용자 제스처 컨텍스트 안에서 즉시 재생 (iOS는 첫 재생이 제스처 컨텍스트 밖이면 무음)
  - `paused` 상태면 `resume()`
  - utterance 참조를 `currentUtterance`에 유지해 크롬이 재생 도중 GC로 끊는 버그 회피
- **인앱 브라우저 대응** (`escapeInAppBrowser`, `warnIfTtsUnavailable`):
  - 카카오톡: `kakaotalk://web/openExternal?url=...` 스킴으로 페이지 로드 직후(0.4초 지연) 기기 기본 브라우저로 자동 이동 (안드로이드=크롬 계열, iOS=사파리)
  - 기타 안드로이드 인앱 브라우저(네이버/인스타/페북/라인): 크롬 intent URL로 탈출
  - 이동이 차단되는 구버전 대비 안내 토스트를 함께 표시하며, 실패해도 앱 자체는 인앱 브라우저에서도 사용 가능(소리만 제한)
  - `speechSynthesis` 미지원 브라우저는 별도 안내

---

## 7. GitHub 마스터 단어장 연동 (읽기 전용)

관리자 전용 ⚙️ 설정 화면에서 GitHub Raw URL(+선택적 토큰)을 등록하면, `fetchMasterWords()`가 해당 파일을 GET으로 읽어와 파싱(`parseMasterWordText` — JSON 배열 또는 콤마/줄바꿈 텍스트 모두 지원) 후 현재 로그인된 프로필의 `☁️ 마스터` 전용 폴더(`MASTER_FOLDER`)에 병합합니다.

- **읽기 전용**: 앱에서 GitHub로 쓰기(push)는 하지 않음. 단어 등록/수정은 GitHub 쪽 파일을 직접 편집해야 함
- **개인 진도 비동기화**: 정답/오답 카운트 등은 동기화 대상이 아니며, 새로고침 시 기존 단어의 카운트는 보존한 채 신규 단어만 추가
- 중복/형식 검증은 수동 입력·프리셋과 동일한 `addWordsToBank()`를 거침

---

## 8. 향후 클라우드 DB 전환 가이드

`js/app.js`와 `js/profiles.js`는 `localStorage`를 직접 호출하지 않고 `AppStorage`(`js/storage.js`)의 `get/set/remove/keys` 인터페이스만 사용합니다. 클라우드 DB(Firebase, Supabase 등)를 도입할 때:

1. 동일한 인터페이스(`get/set/remove/keys`)를 구현한 원격 어댑터를 작성
2. `AppStorage.setAdapter(cloudAdapter)`로 교체 — 앱 로직은 수정 불필요
3. 권장 전략: 로컬 캐시에 즉시 반영 후 백그라운드로 원격 동기화 (오프라인 대응, 현재 구조와 UX 단절 최소화)

이 시점에 추가로 가능해지는 것:

- **진짜 로그인(비밀번호/OTP 등) 인증** — 현재는 이름만으로 구분되는 로컬 프로필
- **마스터 계정이 다른 기기의 하위 계정 데이터를 열람/관리** — 현재는 물리적으로 불가능(각자 데이터가 각자 브라우저에만 존재)
- **기기 간 동기화** — 현재는 같은 브라우저·기기 안에서만 프로필이 유효

`WordItem.source` 필드(`manual`/`preset`/`master`)는 이미 동기화 시 출처별 처리를 염두에 두고 넣어둔 필드이며, 프로필 데이터가 `p:<id>:*` 키로 이미 분리되어 있어 사용자 테이블로 자연스럽게 매핑 가능합니다.

---

## 9. 알려진 제약

- 프로필은 기기(브라우저) 단위로만 유효 — 다른 기기·브라우저와 동기화되지 않음
- 로그인에 비밀번호가 없어 보안 목적이 아닌 "학습자 구분" 용도. 관리자 프로필 이름(`마스터`/`멋쟁이아빠`)이 노출되면 검색으로 접근 가능
- iOS는 카카오톡 스킴 외의 다른 인앱 브라우저(인스타/페북 등)에서 외부 브라우저로 자동 탈출이 불가능 (iOS 자체 제약, 안내 토스트로 대체)
- 인앱 브라우저 감지는 User-Agent 문자열 기반이라, 특정 앱이 UA를 변경하면 감지가 어긋날 수 있음
