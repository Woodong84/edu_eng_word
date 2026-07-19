# Sia의 영어 단어

초등학생용 영단어 학습 웹앱. 빌드 도구 없이 브라우저에서 바로 실행되는 정적 페이지입니다.

## 실행 방법

저장소를 내려받은 뒤 `index.html`을 브라우저로 열거나, 정적 서버로 서빙하면 됩니다.

```bash
python3 -m http.server 8000
# http://localhost:8000/index.html 접속
```

## 디렉토리 구조

```
.
├── index.html            # 마크업 + 화면 전환(탭) 진입점
├── css/
│   └── style.css         # 전체 스타일
└── js/
    ├── app.js            # 단어장 CRUD, 퀴즈, 오답 노트, GitHub 연동 로직
    └── data/
        └── elementary-words.js  # 초등 필수 단어 300개 프리셋 (카테고리별)
```

- **`css/style.css`**: 색상 변수, 탭/카드/폼 등 UI 스타일.
- **`js/app.js`**: `wordBank`(단어장), `userStats`(레벨/EXP) 등 상태 관리와 화면 렌더링, 받아쓰기 퀴즈, GitHub raw 파일에서 단어 목록을 읽어오는 연동 로직.
- **`js/data/elementary-words.js`**: 프리셋 단어 데이터만 담은 파일. 단어 추가/삭제는 이 파일만 수정하면 됩니다.

## 데이터 저장

- 단어장·학습 진도(`wordBank`, `userStats`)는 브라우저 `localStorage`에 기기별로 저장됩니다.
- "☁️ 설정" 탭에서 GitHub raw URL을 등록하면 공용 단어 목록 파일을 읽어와 로컬 단어장에 병합할 수 있습니다(읽기 전용, 진도는 동기화하지 않음).
