# 사양서 — 영단어 마스터 (edu_eng_word)

초등학생용 영단어 학습 웹앱의 최신 기능·구조 사양입니다. 이 문서 하나로 앱의 현재 상태를 파악할 수 있도록 작성했으며, 요청/변경 이력은 [`PROMPT_HISTORY.md`](./PROMPT_HISTORY.md)에 있습니다.

- **접속 URL**: https://woodong84.github.io/edu_eng_word/
- **저장소**: https://github.com/woodong84/edu_eng_word

---

## 1. 기술 스택 및 배포

| 항목 | 내용 |
|---|---|
| 런타임 | 순수 HTML/CSS/JS — 프레임워크·빌드 도구 없음 |
| 로컬 저장 | 브라우저 `localStorage` (개인 단어장/폴더/통계) |
| 클라우드 | Firebase Authentication + Firestore (프로필 미러링/마스터 단어/사용이력/랭킹) |
| 음성 | Web Speech API (`speechSynthesis`), en-US, rate 0.8 |
| 배포 | GitHub Pages — `main` 브랜치 `/(root)`, push 시 자동 배포 |
| 캐시 무효화 | css/js 참조에 `?v=N` 쿼리, 배포 시 N 증가 (현재 `v=16`) |

### 배포 절차
1. `claude/...` 작업 브랜치에 커밋 → push → PR → `main` 머지
2. GitHub Pages가 자동 빌드 (1~2분)
3. **정적 자원을 수정했다면 `index.html`의 `?v=` 버전을 반드시 올릴 것** (모바일 캐시 강제 갱신)
4. Firestore 보안 규칙(`firestore.rules`) 변경 시에는 Firebase 콘솔 → Firestore → 규칙 탭에 수동 게시 필요 (저장소 커밋만으로는 적용 안 됨)

---

## 2. 파일 구조

```
.
├── index.html              # 마크업 전체 (프로필 화면 + 앱 본체 + 오버레이/토스트)
├── firestore.rules         # Firestore 보안 규칙 소스 (콘솔 수동 게시)
├── css/
│   └── style.css           # 모바일 우선 스타일, 레벨 티어 테마(body[data-tier])
├── js/
│   ├── storage.js          # localStorage 추상화 (AppStorage, Adapter 패턴)
│   ├── profiles.js         # 로컬 프로필 관리 (Profiles)
│   ├── firebase-init.js    # Firebase SDK 초기화 (type="module", gstatic CDN ESM)
│   ├── cloud.js            # Cloud.* — Firebase 연동 계층
│   ├── app.js              # 화면 로직 전체
│   └── data/
│       └── elementary-words.js  # 프리셋 300단어(18개 카테고리) + 한글 뜻 사전
└── docs/
    ├── SPEC.md             # 이 문서 (사양서)
    └── PROMPT_HISTORY.md   # 요청/변경 이력
```

의존 원칙: `app.js`는 저장을 `AppStorage`, 계정을 `Profiles`, 클라우드를 `Cloud`를 통해서만 접근합니다. `localStorage`를 직접 만지는 파일은 `storage.js`뿐입니다.

---

## 3. 화면 사양

최상위 뷰 2개: `#profile-screen`(프로필 선택) ↔ `#app-root`(학습 앱). 앱 본체는 하단 탭바(모바일 고정/데스크톱 641px↑ 상단 정적)로 전환합니다.

### 3.1 탭 구성

| 탭 | 섹션 | 기능 |
|---|---|---|
| 📝 단어 | `sec-manage` | 학습 폴더 선택/➕생성/🗑️삭제, 단어 등록([영어]+[뜻] 분리 입력), 프리셋 300단어 선택(기본 접힘) |
| 📖 단어장 | `sec-study` | **학습 범위**·**학습 문제 수** 설정, 폴더 칩 필터 + 전체 단어 삭제(🗑️), 단어 카드 목록(4열×3줄+스크롤) |
| 🎧 학습 | `sec-test` | 받아쓰기 퀴즈 (TTS·Hint·뜻 표시·콤보) |
| ❗ 오답 | `sec-wrong` | 오답 단어 카드 목록 (틀린 횟수 순) |
| 📊 상태 | `sec-status` | 레벨/학습한 단어/오답 단어 카드 → 🏆 랭킹(주간/월간) → 🏅 업적(32종) |
| ⚙️ 설정 | `sec-cloud` | 관리자 전용, 헤더 버튼으로 진입. GitHub 단어장 연동 + Firebase 마스터 단어 관리 |

헤더: 좌측 프로필 칩(탭=프로필 전환), 우측 [⚙️ 설정](관리자만) + [프로필 전환].
보상 존(상단 고정): 레벨/칭호, EXP 바, 🔥 연속 학습일, 스티커 보드.

### 3.2 단어 탭 (등록)

- **학습 폴더**: select + ➕(prompt로 생성) + 🗑️(삭제 — 단어는 "기본 학습장"으로 이동). 기본 학습장은 삭제 불가
- **단어 등록**: [영어 단어] 입력 → Enter → [뜻] 입력 → Enter(또는 저장 버튼) → 저장 후 영어 칸으로 포커스 복귀
  - 뜻 생략 시 프리셋 사전(`ELEMENTARY_WORD_MEANINGS`)에서 자동 매칭
  - 영어 칸에 쉼표/줄바꿈으로 여러 단어 일괄 등록 가능 (항목별 `word:뜻` 표기 지원)
  - 검증: `/^[a-z]+(-[a-z]+)*$/` (소문자 정규화), 프로필 내 중복 금지, 결과는 "추가 N·중복 제외 M·형식 오류 K" 토스트
- **프리셋**: "초등 필수 단어 300개에서 선택하기" 토글(기본 접힘) — 검색, 전체 선택/해제, 300개 일괄, 개별 체크 후 추가. 이미 등록된 단어는 ✓ 비활성 표시

### 3.3 단어장 탭 (목록/학습 설정)

- **학습 범위**: 전체 또는 특정 폴더 — 학습(퀴즈) 출제 범위
- **학습 문제 수**: 5개부터 5단위 ~ 범위 단어 수("전체 N개"), 기본 5개, 프로필별 저장. 범위 변경 시 상한 자동 재계산
- **단어 카드**: 4열 그리드, 3줄(250px) 초과 시 세로 스크롤
  - 카드 탭 = 발음 재생 / 좌상단 📖 = 네이버 사전 / 우상단 ✕ = 개별 삭제
  - "전체" 필터일 때 카드에 소속 폴더명 표시
- **전체 삭제**(🗑️): 확인 후 프로필의 모든 단어 삭제 (폴더는 유지)

### 3.4 학습 탭 (받아쓰기 퀴즈)

1. 진입 시 범위 내에서 설정된 문제 수만큼 **랜덤** 출제
2. 문제마다: TTS 자동 재생 → 🔊(다시 듣기 + 입력창 포커스) → **Hint** 빈칸(`_ _ _`) → **뜻** 표시(있을 때만, "뜻: 사과" 배지) → 입력 → 정답 확인(Enter 가능)
3. 오답 시: 빈칸 힌트 단계 공개(1회=첫 글자, 2회+=모음), 재청취, 오답 카운트 누적
4. 정답 시: 힌트 미사용이면 +10 EXP, **콤보**(연속 힌트 없는 정답) 2연속부터 "🔥 N연속 정답!" + 파티클 버스트. 힌트 사용/오답 시 콤보 리셋
5. 완료 화면: "🎉 학습 완료!"
6. 문제를 풀 때마다(정답/오답 무관) **출석 스트릭** 기록 + Firebase 사용이력 전송

### 3.5 상태 탭

- **요약 카드 3개**: 레벨/칭호(비클릭), 학습한 단어 수, 오답 단어 수 — 건수 카드 탭 시 아래에 상세 목록 토글
  - 학습한 단어 목록 색상: 정답만=초록 / 정답+오답=주황 / 오답만=빨강
- **🏆 랭킹**: 이번 주/이번 달 토글. Firestore `profiles`를 `stats.weeklyCorrect`/`stats.monthlyCorrect` 내림차순 조회(최대 20명, 관리자 제외). 1~5등 표시 후 스크롤(300px). 🥇🥈🥉 메달, 내 프로필 강조
- **🏅 업적**: 32종 잠금/해금 그리드, 5줄(420px) 초과 시 스크롤, 달성 수 "N / 32" 표시

### 3.6 설정 탭 (관리자 전용)

- **GitHub 단어장 연동(읽기 전용)**: Raw URL(+선택 토큰) 저장, "단어장 새로고침" 시 파일(txt/JSON)을 파싱해 현재 프로필의 `☁️ 마스터` 폴더에 중복 검증 후 병합
- **Firebase 마스터 단어 관리**: 관리자 이메일/비밀번호 로그인 → "초등 필수 단어 300개를 마스터 DB에 등록"(batch, 문서 ID=단어라 중복 안전) / 로그아웃(익명으로 복귀)

---

## 4. 계정/권한 모델

- **로그인** = 같은 기기 안의 프로필 전환. 비밀번호 없이 이름(중복 불가, ≤12자)+아이콘(18종)으로 구분
- **상위/하위**: `parentId`로 2단계 관계. 상위 삭제 시 하위와 그 데이터도 삭제
- **관리자**: 프로필 이름이 `마스터` 또는 `멋쟁이아빠` (`ADMIN_PROFILE_NAMES`) — ⚙️ 설정 노출 + 전체 프로필 조회
- **프로필 조회 범위** (앱 안에서 전환 화면을 열 때):

| 연 사람 | 보이는 목록 |
|---|---|
| 최초 접속(로그인 화면) | 전체 |
| 관리자 | 전체 |
| 상위 프로필 | 자신 + 하위들 |
| 하위 프로필 | 자신만 |

- **이름 검색**: 정확한 전체 일치 시에만 범위 밖 프로필로 이동 가능 (부분 검색 불허 — 사실상의 접근 통제)

---

## 5. 데이터 모델

### 5.1 localStorage (프리픽스 `eduword:v2:`)

| 키 | 내용 |
|---|---|
| `profiles` | `[{id, name, icon, parentId, createdAt}]` |
| `activeProfileId` | 현재 프로필 ID |
| `cloudConfig` | GitHub 연동 `{rawUrl, token}` |
| `p:<id>:words` | 단어장 (아래 WordItem) |
| `p:<id>:stats` | 통계 (아래 UserStats) |
| `p:<id>:folders` | `[{id, name}]` — 기본값 `{id:'default', name:'기본 학습장'}` |

```ts
type WordItem = {
  id: number; word: string;
  meaning: string;                    // 한글 뜻 (없으면 '')
  addedDate: string; correctCount: number; incorrectCount: number;
  folderId: string; source: 'manual'|'preset'|'master';
};

type UserStats = {
  level: number; exp: number; stickers: string[];
  quizCount?: number;                  // 학습 문제 수 (기본 5)
  totalCorrect?: number; totalWrong?: number;
  weeklyCorrect?: number; weekStartDate?: string;   // 주간 랭킹 (월요일 기준, lazy reset)
  monthlyCorrect?: number; monthKey?: string;        // 월간 랭킹 ("YYYY-MM", lazy reset)
  streakDays?: number; lastStudyDate?: string; bestStreak?: number;  // 출석 스트릭 (로컬 날짜)
  bestCombo?: number;                  // 최고 연속 정답
  achievements?: string[];             // 해금된 업적 id
};
```

로드 시 자동 백필: `folderId` 누락→기본 학습장, `meaning` 누락→프리셋 사전 매칭, 기본 폴더 옛 이름("기본 폴더")→"기본 학습장".

### 5.2 Firestore

```
profiles/{profileId}: { name, icon, parentId, role('admin'|'member'), ownerUid, stats, updatedAt }
profiles/{profileId}/history/{id}: { word, result('correct'|'wrong'), usedHint, folderId, testedAt }  // 영구 보관
masterWords/{word}: { word, category, addedBy, createdAt }   // 문서 ID = 단어 (중복 원천 방지)
```

- **인증**: 앱 로드 시 자동 익명 로그인(전 사용자), 관리자만 이메일/비밀번호 (masterWords 쓰기 권한)
- **보안 규칙**(`firestore.rules`): 로그인 사용자(가족 신뢰 그룹) 전체 읽기/쓰기 허용, `masterWords` 쓰기만 `token.email != null` 제한
- **실패 내성**: 모든 Cloud 호출은 로컬 기능과 독립 (동기화 fire-and-forget, 랭킹/관리자 상태 표시는 5초 타임아웃) — 오프라인/미설정 상태에서도 학습 기능 100% 동작

---

## 6. 게임화 요소

| 요소 | 사양 |
|---|---|
| 레벨/EXP | 힌트 없는 정답 +10 EXP, 100 도달 시 레벨업(잉여 이월) + 풀스크린 파티클 + 랜덤 스티커 |
| 레벨 티어 테마 | Lv.1새싹/5탐험가/10마법사/15챔피언/20마스터 — 티어마다 앱 색상·배경 자동 변경 |
| 출석 스트릭 | 하루 1문제 이상 = 학습일. "🔥 N일 연속 학습 중!"(최고 기록 병기), 하루 건너뛰면 1부터 |
| 콤보 | 힌트 없는 연속 정답, 2연속부터 토스트+파티클, `bestCombo` 기록 |
| 업적 32종 | 기본 14종(단어 수집/정답 수/콤보/스트릭/레벨) + 카테고리 마스터 18종(카테고리 전 단어 정답 경험). 해금 시 토스트+파티클, 소급 다수 해금은 요약 토스트 |
| 랭킹 | 주간/월간 정답 수 기준(월간=주간 누적, 월 변경 시 리셋). 서버 스케줄러 없이 클라이언트 lazy reset |

---

## 7. 모바일/브라우저 대응

- 하단 고정 탭바(safe-area 대응), 44px+ 터치 타깃, 16px+ 입력 폰트(iOS 확대 방지), alert 대신 토스트
- **TTS**: 재생 중일 때만 cancel 후 80ms 지연 재생(안드로이드 크롬 무시 버그 회피), 유휴 시 제스처 컨텍스트 내 즉시 재생(iOS), paused면 resume, utterance 참조 유지(GC 끊김 방지)
- **인앱 브라우저**: 카카오톡은 `kakaotalk://web/openExternal`로 기본 브라우저 자동 이동(로드 0.4초 후), 기타 안드로이드 인앱은 크롬 intent, 실패 시 안내 토스트 + 인앱에서도 앱 자체는 사용 가능(소리만 제한)

---

## 8. 알려진 제약

- 개인 단어장/폴더는 기기 단위 (기기 간 동기화 대상은 프로필/통계/마스터/이력/랭킹만)
- 프로필 이름이 사실상의 인증 수단 — 관리자 프로필 이름 노출 주의
- Firestore 규칙은 가족 신뢰 그룹 전제 (불특정 다수 서비스 부적합)
- iOS에서 카카오톡 외 인앱 브라우저는 외부 브라우저 자동 탈출 불가 (안내 토스트로 대체)
- 인앱 브라우저 감지는 User-Agent 기반

## 9. 확장 아이디어 (미구현)

- 개인 단어장의 클라우드 완전 동기화 (기기 간 이어 학습)
- 마스터 단어 개별 추가/삭제 UI (현재는 300개 일괄 시드만)
- `history` 기반 학습 그래프, 단어-뜻 짝맞추기 등 학습 유형 다양화, 포인트 상점/캐릭터 키우기
