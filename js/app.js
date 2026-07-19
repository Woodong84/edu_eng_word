// 전역 상태 데이터
let wordBank = JSON.parse(localStorage.getItem('wordBank')) || [];
let userStats = JSON.parse(localStorage.getItem('userStats')) || { level: 1, exp: 0, stickers: [] };
// 이제 GitHub는 "마스터 단어장 읽기 전용"으로만 사용 (개인 진도는 동기화하지 않음)
let githubConfig = JSON.parse(localStorage.getItem('githubConfig')) || { rawUrl: '', token: '' };

let currentQuizList = [];
let currentQuizIndex = 0;
let quizIncorrectCount = 0;
let presetSelected = new Set(); // 초등 필수 단어 목록에서 사용자가 체크한 단어(임시 선택 상태, 저장되지 않음)
const stickerTypes = ['⭐', '🌟', '🏆', '👑', '🚀', '🔥', '🍎', '🦖', '🦄', '💎', '🏅', '🍕', '🎉', '🍀'];
const VALID_WORD_PATTERN = /^[a-z]+(-[a-z]+)*$/; // 영어 알파벳 + 하이픈 복합어만 허용 (앱 입력/GitHub 파일/프리셋 모두 동일 검증)

// 초기화
document.getElementById('gh-raw-url').value = githubConfig.rawUrl;
document.getElementById('gh-token').value = githubConfig.token;
updateWordCount();
renderRewards();
checkSyncStatus();
renderPresetWordPicker();

// ----------------------------------------------------
// [GitHub 마스터 단어장 연동부 - 읽기 전용]
// ----------------------------------------------------
function saveCloudConfig() {
    githubConfig.rawUrl = document.getElementById('gh-raw-url').value.trim();
    githubConfig.token = document.getElementById('gh-token').value.trim();
    localStorage.setItem('githubConfig', JSON.stringify(githubConfig));
    alert('단어장 연동 설정이 로컬에 저장되었습니다.');
    checkSyncStatus();
}

function checkSyncStatus() {
    const badge = document.getElementById('sync-status');
    badge.style.display = githubConfig.rawUrl ? 'block' : 'none';
}

// words.txt("apple, banana, school" 또는 줄바꿈 구분) 또는 words.json(["apple", ...] / [{"word":"apple"}, ...]) 둘 다 지원
function parseMasterWordText(rawText) {
    try {
        const parsed = JSON.parse(rawText);
        if(Array.isArray(parsed)) {
            return parsed
                .map(item => (typeof item === 'string' ? item : item && item.word))
                .filter(Boolean)
                .map(w => String(w).trim().toLowerCase());
        }
    } catch (e) {
        // JSON 파싱 실패 시 plain text로 간주하고 아래에서 처리
    }
    return rawText.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
}

// 단어 배열을 검증 후 중복 없이 wordBank에 추가하는 공통 함수.
// saveWords(수동입력), fetchMasterWords(GitHub 불러오기), addSelectedPresetWords/addAllPresetWords(프리셋 선택)에서 공통으로 사용.
function addWordsToBank(words) {
    let addedCount = 0;
    let invalidCount = 0;

    words.forEach(rawWord => {
        const word = String(rawWord).trim().toLowerCase();
        if(!VALID_WORD_PATTERN.test(word)) { invalidCount++; return; }
        if(!wordBank.some(item => item.word === word)) {
            wordBank.push({
                id: Date.now() + Math.random(),
                word: word,
                addedDate: new Date().toISOString().split('T')[0],
                correctCount: 0,
                incorrectCount: 0
            });
            addedCount++;
        }
    });

    if(addedCount > 0) saveLocalCache();
    updateWordCount();
    return { addedCount, invalidCount };
}

// GitHub 파일 -> 로컬 단어장 병합 (GET, 읽기 전용)
// 기존 단어의 correctCount/incorrectCount(개인 진도)는 건드리지 않고, 새 단어만 추가한다.
async function fetchMasterWords() {
    if(!githubConfig.rawUrl) return alert('GitHub 단어장 파일 주소를 먼저 입력해 주세요.');

    try {
        document.body.style.cursor = 'wait';
        const headers = {};
        if(githubConfig.token) headers['Authorization'] = `Bearer ${githubConfig.token}`;

        const response = await fetch(githubConfig.rawUrl, { method: 'GET', headers });
        if(!response.ok) throw new Error('파일을 불러오지 못했습니다 (주소와 저장소 공개 여부를 확인하세요)');

        const rawText = await response.text();
        const incomingWords = parseMasterWordText(rawText);
        const { addedCount, invalidCount } = addWordsToBank(incomingWords);
        renderPresetWordPicker(); // 프리셋 목록의 '등록됨' 표시 갱신

        alert(`☁️ 단어장 새로고침 완료! 새로 추가된 단어 ${addedCount}개`
            + (invalidCount > 0 ? `\n(형식이 맞지 않는 ${invalidCount}개 단어는 제외되었습니다)` : ''));
    } catch (error) {
        alert(`오류: ${error.message}`);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// 로컬 데이터 저장 (더 이상 GitHub로 자동 push하지 않음 - 개인 진도는 이 기기에만 보관)
function saveLocalCache() {
    localStorage.setItem('wordBank', JSON.stringify(wordBank));
    localStorage.setItem('userStats', JSON.stringify(userStats));
}

// ----------------------------------------------------
// [기존 비즈니스 로직 연동부]
// ----------------------------------------------------
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    event.target.classList.add('active');
    document.getElementById(`sec-${tabId}`).classList.add('active');

    if(tabId === 'manage') { updateWordCount(); renderPresetWordPicker(); }
    if(tabId === 'study') renderStudyList();
    if(tabId === 'test') startCumulativeTest();
    if(tabId === 'wrong') renderWrongList();
}

function renderRewards() {
    document.getElementById('level-text').innerText = `Lv.${userStats.level} 영어 탐험가`;
    document.getElementById('exp-text').innerText = `${userStats.exp} / 100 EXP`;
    document.getElementById('exp-fill').style.width = `${userStats.exp}%`;
    const board = document.getElementById('sticker-board');
    board.innerHTML = userStats.stickers.length > 0 ? userStats.stickers.join(' ') : '';
}

function gainExp(amount) {
    userStats.exp += amount;
    if(userStats.exp >= 100) {
        userStats.exp -= 100;
        userStats.level++;
        const newSticker = stickerTypes[Math.floor(Math.random() * stickerTypes.length)];
        userStats.stickers.push(newSticker);
        alert(`🎉 레벨업! [Lv.${userStats.level}]\n새로운 칭찬 스티커 '${newSticker}'를 획득했어요!`);
    }
    saveLocalCache(); // 개인 진도는 이 기기에만 저장 (GitHub로 전송하지 않음)
    renderRewards();
}

function saveWords() {
    const input = document.getElementById('word-input').value;
    if(!input.trim()) return alert('단어를 입력해 주세요.');

    const rawWords = input.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
    const { addedCount, invalidCount } = addWordsToBank(rawWords);
    renderPresetWordPicker(); // 프리셋 목록의 '등록됨' 표시 갱신

    alert(`${addedCount}개의 단어 저장 완료!` + (invalidCount > 0 ? `\n(영문/하이픈 형식이 아닌 ${invalidCount}개 단어는 제외되었습니다)` : ''));
    document.getElementById('word-input').value = '';
}

// ----------------------------------------------------
// [초등 필수 단어 300개 프리셋 선택 UI]
// ----------------------------------------------------
function renderPresetWordPicker() {
    const container = document.getElementById('preset-word-picker');
    const searchTerm = document.getElementById('preset-search').value.trim().toLowerCase();
    container.innerHTML = '';

    Object.entries(ELEMENTARY_WORD_CATEGORIES).forEach(([category, words]) => {
        const filtered = words.filter(w => w.includes(searchTerm));
        if(filtered.length === 0) return;

        const catBlock = document.createElement('div');
        catBlock.style.marginBottom = '12px';

        const catHeader = document.createElement('div');
        catHeader.style.cssText = 'font-weight:bold; font-size:13px; color:#475569; margin-bottom:4px;';
        catHeader.textContent = `${category} (${filtered.length})`;
        catBlock.appendChild(catHeader);

        const wordWrap = document.createElement('div');
        wordWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px;';

        filtered.forEach(word => {
            const alreadyRegistered = wordBank.some(item => item.word === word);
            const chip = document.createElement('label');
            chip.style.cssText = `display:inline-flex; align-items:center; gap:4px; padding:4px 8px;
                border-radius:6px; font-size:13px; cursor:${alreadyRegistered ? 'default' : 'pointer'};
                background:${alreadyRegistered ? '#f1f5f9' : (presetSelected.has(word) ? '#ede9fe' : '#f8fafc')};
                border:1px solid ${alreadyRegistered ? '#e2e8f0' : (presetSelected.has(word) ? 'var(--primary)' : '#cbd5e1')};
                color:${alreadyRegistered ? '#94a3b8' : '#1e293b'};`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = presetSelected.has(word);
            checkbox.disabled = alreadyRegistered;
            checkbox.addEventListener('change', () => {
                if(checkbox.checked) presetSelected.add(word); else presetSelected.delete(word);
                renderPresetWordPicker();
            });

            chip.appendChild(checkbox);
            chip.appendChild(document.createTextNode(alreadyRegistered ? `${word} ✓` : word));
            wordWrap.appendChild(chip);
        });

        catBlock.appendChild(wordWrap);
        container.appendChild(catBlock);
    });

    if(container.innerHTML === '') {
        container.innerHTML = '<p style="text-align:center; color:#94a3b8; font-size:13px;">검색 결과가 없습니다.</p>';
    }
    document.getElementById('preset-selected-count').textContent = presetSelected.size;
}

function selectAllPresetWords(checked) {
    const searchTerm = document.getElementById('preset-search').value.trim().toLowerCase();
    Object.values(ELEMENTARY_WORD_CATEGORIES).flat().forEach(word => {
        if(!word.includes(searchTerm)) return;
        if(wordBank.some(item => item.word === word)) return; // 이미 등록된 단어는 건드리지 않음
        if(checked) presetSelected.add(word); else presetSelected.delete(word);
    });
    renderPresetWordPicker();
}

function addSelectedPresetWords() {
    if(presetSelected.size === 0) return alert('추가할 단어를 먼저 선택해 주세요.');
    const { addedCount } = addWordsToBank([...presetSelected]);
    presetSelected.clear();
    renderPresetWordPicker();
    alert(`${addedCount}개의 단어가 추가되었습니다!`);
}

function addAllPresetWords() {
    if(!confirm('초등 필수 단어 300개를 모두 추가할까요? (이미 등록된 단어는 건너뜁니다)')) return;
    const all = Object.values(ELEMENTARY_WORD_CATEGORIES).flat();
    const { addedCount } = addWordsToBank(all);
    presetSelected.clear();
    renderPresetWordPicker();
    alert(`${addedCount}개의 단어가 새로 추가되었습니다!`);
}

function updateWordCount() { document.getElementById('total-count').innerText = wordBank.length; }

function renderStudyList() {
    const container = document.getElementById('study-list');
    container.innerHTML = '';
    if(wordBank.length === 0) return container.innerHTML = '<p style="text-align:center;">등록된 단어가 없습니다.</p>';

    [...wordBank].reverse().forEach(item => {
        const card = document.createElement('div');
        card.className = 'word-card';

        const wordText = document.createElement('span');
        wordText.textContent = item.word;
        card.appendChild(wordText);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-word-btn';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `${item.word} 삭제`);
        delBtn.addEventListener('click', (e) => deleteWord(item.id, e));
        card.appendChild(delBtn);

        card.addEventListener('click', () => window.open(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(item.word)}`, '_blank'));
        container.appendChild(card);
    });
}

// 잘못 등록된 단어 삭제 (개인 기기 로컬 단어장에서만 제거됨. GitHub 원본 파일은 그대로이므로
// 다음에 [단어장 새로고침]을 누르면 다시 들어올 수 있어, 필요하면 GitHub 파일도 함께 수정해야 함)
function deleteWord(id, event) {
    if(event) event.stopPropagation(); // 카드 클릭(사전 열기)으로 이벤트가 전파되지 않도록 방지
    const target = wordBank.find(w => w.id === id);
    if(!target) return;
    if(!confirm(`'${target.word}' 단어를 삭제할까요?`)) return;

    wordBank = wordBank.filter(w => w.id !== id);
    saveLocalCache();
    updateWordCount();
    renderStudyList();
    renderPresetWordPicker();
}

function startCumulativeTest() {
    if(wordBank.length === 0) return document.getElementById('quiz-container').innerHTML = '<p>단어를 등록해 주세요.</p>';
    currentQuizList = [...wordBank].sort((a, b) => b.incorrectCount - a.incorrectCount || Math.random() - 0.5).slice(0, 20);
    currentQuizIndex = 0;
    renderQuiz();
}

function renderQuiz() {
    const container = document.getElementById('quiz-container');
    const progress = document.getElementById('quiz-progress');

    if(currentQuizIndex >= currentQuizList.length) {
        container.innerHTML = `<h2>🎉 테스트 완료!</h2>`;
        progress.innerText = '';
        saveLocalCache(); // 테스트 결과(오답 카운트 등)를 이 기기에 저장
        return;
    }

    const currentItem = currentQuizList[currentQuizIndex];
    quizIncorrectCount = 0;

    container.innerHTML = `
        <button class="audio-btn" id="quiz-audio-btn">🔊</button>
        <div class="hint-text" id="hint-zone"></div>
        <input type="text" id="quiz-input" class="quiz-input" autocomplete="off" autofocus onkeyup="checkEnter(event)">
        <button class="btn-main" onclick="validateAnswer()">정답 확인</button>
    `;
    document.getElementById('quiz-audio-btn').addEventListener('click', () => playTTS(currentItem.word));
    document.getElementById('hint-zone').textContent = generateHintBlank(currentItem.word, 0);

    progress.innerText = `문제: ${currentQuizIndex + 1} / ${currentQuizList.length}`;
    playTTS(currentItem.word);
    setTimeout(() => document.getElementById('quiz-input').focus(), 300);
}

function generateHintBlank(word, penalty) {
    return word.split('').map((c, i) => (i === 0 && penalty >= 1) || (['a','e','i','o','u'].includes(c) && penalty >= 2) ? c : '_').join(' ');
}

function playTTS(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US'; u.rate = 0.8;
        window.speechSynthesis.speak(u);
    }
}

function checkEnter(e) { if(e.key === 'Enter') validateAnswer(); }

function validateAnswer() {
    const inputEl = document.getElementById('quiz-input');
    const userAnswer = inputEl.value.trim().toLowerCase();
    const currentItem = currentQuizList[currentQuizIndex];
    const masterItem = wordBank.find(item => item.id === currentItem.id);

    if(userAnswer === currentItem.word) {
        if (quizIncorrectCount === 0) { masterItem.correctCount++; alert('🎯 완벽해요! +10 EXP'); gainExp(10); }
        else { alert('🎯 정답입니다! (힌트 사용)'); }
        currentQuizIndex++; renderQuiz();
    } else {
        quizIncorrectCount++; masterItem.incorrectCount++;
        alert('❌ 다시 한 번 들어보세요!');
        inputEl.value = ''; inputEl.focus();
        document.getElementById('hint-zone').innerText = generateHintBlank(currentItem.word, quizIncorrectCount);
        playTTS(currentItem.word);
    }
}

function renderWrongList() {
    const container = document.getElementById('wrong-list');
    container.innerHTML = '';
    const wrongWords = wordBank.filter(w => w.incorrectCount > 0).sort((a,b) => b.incorrectCount - a.incorrectCount);

    if(wrongWords.length === 0) return container.innerHTML = '<p style="text-align:center;">🎉 틀린 단어가 없습니다!</p>';

    wrongWords.forEach(item => {
        const card = document.createElement('div');
        card.className = 'wrong-card';

        const title = document.createElement('div');
        title.className = 'wrong-title';
        title.textContent = item.word; // textContent 사용: 단어에 HTML/스크립트가 섞여 있어도 텍스트로만 표시됨

        const badge = document.createElement('div');
        badge.className = 'wrong-badge';
        badge.textContent = `틀린 횟수: ${item.incorrectCount}회`;

        const actions = document.createElement('div');
        actions.className = 'wrong-actions';

        const btnAudio = document.createElement('button');
        btnAudio.className = 'btn-action btn-audio';
        btnAudio.textContent = '🔊 듣기';
        btnAudio.addEventListener('click', () => playTTS(item.word));

        const btnDict = document.createElement('button');
        btnDict.className = 'btn-action btn-dict';
        btnDict.textContent = '📖 뜻';
        btnDict.addEventListener('click', () => window.open(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(item.word)}`, '_blank'));

        actions.appendChild(btnAudio);
        actions.appendChild(btnDict);
        card.appendChild(title);
        card.appendChild(badge);
        card.appendChild(actions);
        container.appendChild(card);
    });
}
