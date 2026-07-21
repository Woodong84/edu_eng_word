# 설계서 — 영단어 마스터 (edu_eng_word)

빌드 도구 없이 브라우저에서 바로 실행되는 정적 웹앱입니다. 개인 단어장 등 핵심 데이터는 여전히 브라우저 `localStorage`에 저장되고, 로그인 관리/마스터 단어 DB/사용이력/랭킹은 Firebase(Firestore)로 별도 연동되어 있습니다(§8). 모바일(카카오톡 링크로 공유) 사용을 최우선으로 설계했습니다.

관련 문서: 요청/변경 이력은 [`PROMPT_HISTORY.md`](./PROMPT_HISTORY.md) 참고.

---

## 1. 기술 스택 및 배포

| 항목 | 내용 |
|---|---|
| 런타임 | 순수 HTML/CSS/JS (프레임워크·빌드 없음, Firebase만 CDN ESM으로 로드) |
| 로컬 저장 | 브라우저 `localStorage` (개인 단어장/폴더) |
| 클라우드 | Firebase Authentication + Firestore (프로필/통계/마스터 단어/이력/랭킹, §8) |
| 음성 | Web Speech API (`speechSynthesis`) |
| 배포 | GitHub Pages (`main` 브랜치 `/(root)`), 접속 URL: `https://woodong84.github.io/edu_eng_word/` |
| 캐시 무효화 | `index.html`에서 css/js 참조에 `?v=N` 쿼리 부여, 배포 시 N을 올림 (현재 `v=15`) |

정적 자원이라 서버 로직이 없고, `index.html`을 열면 바로 동작합니다. 배포는 GitHub Pages가 `main` 브랜치 push를 감지해 자동 빌드합니다. Firestore 보안 규칙(`firestore.rules`)은 Firebase 콘솔에서 별도로 게시해야 합니다(§8.1).

---

## 2. 디렉토리 구조

```
.
├── index.html              # 마크업: 프로필 화면 + 앱 본체(6개 섹션) + 오버레이/토스트
├── firestore.rules         # Firestore 보안 규칙 소스 (콘솔에 수동 게시, §8.1)
├── css/
│   └── style.css           # 모바일 우선 스타일, 레벨 구간별 테마(body[data-tier])
├── js/
│   ├── storage.js          # 저장소 추상화 계층 (Adapter 패턴)
│   ├── profiles.js         # 로컬 프로필(계정) 관리
│   ├── firebase-init.js    # Firebase SDK 초기화 (type="module", CDN ESM)
│   ├── cloud.js             # Cloud.* API — 로그인/마스터 DB/이력/랭킹 연동 (§8)
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

## 8. Firebase 연동 — 로그인 관리 / 마스터 단어 DB / 사용이력 / 랭킹

기존 `AppStorage` 어댑터 교체 방식(§8 이전 버전 설계) 대신, 실제 구현은 **로컬 우선 + 클라우드 best-effort 미러링** 방식으로 진행했습니다. 개인 단어장(`words`)과 폴더(`folders`)는 계속 `localStorage`에만 저장되고(§3 그대로), **프로필/통계, 마스터 단어 데이터, 사용 이력, 랭킹만 Firestore로 별도 연동**됩니다. 이렇게 나눈 이유는 기존 `app.js`의 수백 곳에 걸친 동기 호출부를 전부 비동기로 바꾸지 않고도, "로그인 관리·마스터 데이터·사용이력·랭킹"이라는 실제 요구사항만 충족하기 위함입니다.

### 8.1 구성 파일

| 파일 | 역할 |
|---|---|
| `js/firebase-init.js` (`type="module"`) | gstatic CDN에서 Firebase SDK(v12)를 ESM으로 불러와 초기화하고 `window.FirebaseSDK`에 노출. 완료되면 `firebase-ready` 이벤트 발행 |
| `js/cloud.js` (일반 스크립트) | `Cloud.*` API 제공. `window.FirebaseSDK`가 아직 없으면(모듈이 늦게 로드됨) `firebase-ready` 이벤트를 기다렸다가 동작하는 지연 초기화 패턴 사용 |
| `firestore.rules` | Firestore 보안 규칙 소스. **저장소에 커밋해도 자동 배포되지 않으며**, Firebase 콘솔의 Firestore → 규칙 탭에 수동으로 붙여넣고 게시해야 함 |

### 8.2 인증 모델

가족 단위 개인 프로젝트라는 전제 위에, 프로필 간 소유권을 엄격히 나누지 않고 두 단계로만 구분합니다.

- **익명 로그인**: 앱 로드 시 자동으로 실행(`Cloud.ensureAuth()`), 별도 계정 없이 누구나(자녀 프로필 포함) 자신의 프로필·이력을 읽고 쓸 수 있음. 기존 "비밀번호 없는 프로필 전환" UX를 그대로 유지하기 위한 장치
- **관리자(이메일/비밀번호) 로그인**: ⚙️ 설정 화면 하단의 "Firebase 마스터 단어 관리" 블록에서 로그인. `masterWords` 컬렉션 쓰기는 이 계정으로만 가능(`firestore.rules`가 `request.auth.token.email != null` 조건으로 검사). **앱 화면의 관리자 프로필(마스터/멋쟁이아빠) 여부와는 독립적인 개념**입니다 — 로컬 프로필 이름은 UI 노출만 제어하고, 실제 쓰기 권한은 이 Firebase 계정이 결정합니다

### 8.3 데이터 흐름

- `profiles/{profileId}` 문서는 `syncCloudProfile()`이 프로필 진입 시·정답/오답 처리 시·레벨업 시 `{name, icon, parentId, role, stats}`를 덮어씁니다(merge). `role`은 로컬 `ADMIN_PROFILE_NAMES` 판정 결과를 그대로 전달
- `profiles/{profileId}/history/{id}`에는 문제를 풀 때마다(`validateAnswer()`) `{word, result, usedHint, folderId, testedAt}`가 한 건씩 쌓입니다 — 삭제 로직 없이 영구 보관(사용자 결정)
- 랭킹은 `stats.weeklyCorrect` / `stats.monthlyCorrect`를 기준으로 Firestore `orderBy` 쿼리(`Cloud.fetchRanking`)로 조회하며, 관리자 role은 결과에서 제외
- 주간/월간 리셋은 서버 스케줄러 없이 **클라이언트가 매번 "지금이 몇 주차/몇 월인지" 계산해 저장된 값과 비교하는 lazy reset** 방식입니다(`rolloverStatsBucketsIfNeeded()`). 월 경계에 걸친 주(예: 7월 마지막 주 → 8월 첫 주)에도 주/월 두 기준을 독립적으로 검사하므로 각각 올바르게 리셋됩니다
- `masterWords/{word}`는 **단어 문자열 자체를 문서 ID로 사용**해 중복 등록을 원천적으로 방지합니다. 관리자 로그인 상태에서 "초등 필수 단어 300개를 마스터 DB에 등록" 버튼(`Cloud.seedMasterWordsFromPreset`)으로 `elementary-words.js`의 데이터를 1회성 시드로 넣을 수 있습니다(batch write, 여러 번 눌러도 안전)

### 8.4 실패 내성(resilience)

Cloud 관련 호출은 전부 실패해도 로컬 기능에 영향이 없도록 설계했습니다.

- `syncCloudProfile()` / `Cloud.logHistory()`는 결과를 기다리지 않는 fire-and-forget 호출이며, 내부적으로 실패를 삼키고 `console.warn`만 남김
- 사용자가 직접 결과를 봐야 하는 화면(랭킹 목록, 관리자 로그인 상태 표시)은 5초 타임아웃을 두어, Firebase 콘솔 설정이 덜 되었거나 네트워크가 없어도 "불러오는 중..."에 무한정 멈추지 않고 안내 문구로 전환됨
- Firebase SDK 로드 자체가 실패해도(CDN 차단 등) 프로필 생성/단어 학습/테스트 등 기존 로컬 기능은 100% 그대로 동작 (헤드리스 브라우저로 CDN을 완전히 차단한 상태에서 전체 플로우 검증 완료)

---

## 9. 향후 확장 아이디어

- 개인 단어장(`words`/`folders`)도 클라우드로 옮기면 기기 간 완전 동기화가 가능해집니다. 이 경우 `app.js` 곳곳의 동기 호출부를 비동기로 바꿔야 하므로 별도 작업으로 분리하는 것을 권장합니다
- `masterWords`에 개별 단어 추가/삭제 UI(현재는 300개 일괄 시드만 지원)
- `history` 서브컬렉션을 활용한 "이번 주 학습 그래프" 등 시각화

---

## 10. 알려진 제약

- 개인 단어장/폴더는 여전히 기기(브라우저) 단위로만 유효 — 다른 기기·브라우저와 동기화되지 않음 (프로필/통계/마스터 데이터/이력/랭킹만 클라우드로 동기화됨)
- 로그인에 비밀번호가 없어 보안 목적이 아닌 "학습자 구분" 용도. 관리자 프로필 이름(`마스터`/`멋쟁이아빠`)이 노출되면 검색으로 접근 가능
- Firestore 보안 규칙은 "가족 전체를 하나의 신뢰 그룹"으로 취급합니다 — 프로필 간 소유권을 엄격히 분리하지 않으므로 불특정 다수 대상 서비스에는 적합하지 않음
- `firestore.rules` 파일은 저장소에 있지만 자동 배포되지 않음 — 변경 시 Firebase 콘솔에서 수동으로 게시해야 함
- iOS는 카카오톡 스킴 외의 다른 인앱 브라우저(인스타/페북 등)에서 외부 브라우저로 자동 탈출이 불가능 (iOS 자체 제약, 안내 토스트로 대체)
- 인앱 브라우저 감지는 User-Agent 문자열 기반이라, 특정 앱이 UA를 변경하면 감지가 어긋날 수 있음
