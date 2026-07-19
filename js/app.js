// app.js
// 화면 로직 (프로필 선택 → 학습 앱)
// - 저장은 AppStorage(storage.js), 계정은 Profiles(profiles.js)를 통해서만 접근한다.
// - 클라우드 DB 도입 시 이 파일은 그대로 두고 storage.js의 어댑터만 교체하면 된다.

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------
// [전역 상태] 현재 활성 프로필의 데이터만 메모리에 올린다
// ---------------------------------------------------
let wordBank = [];                                   // [{id, word, addedDate, correctCount, incorrectCount, folderId, source}]
let userStats = { level: 1, exp: 0, stickers: [] };
let folders = [];                                    // [{id, name}] 프로필별 단어 폴더
let githubConfig = { rawUrl: '', token: '' };        // 마스터 단어장 설정 (프로필 공통)

let currentQuizList = [];
let currentQuizIndex = 0;
let quizIncorrectCount = 0;
let quizFolderId = 'all';       // 테스트 범위 폴더
let studyFolderId = 'all';      // 학습 목록 필터 폴더
let presetSelected = new Set(); // 프리셋에서 체크한 단어 (임시 상태)
let selectedIcon = null;        // 프로필 생성 폼에서 고른 아이콘

const stickerTypes = ['⭐', '🌟', '🏆', '👑', '🚀', '🔥', '🍎', '🦖', '🦄', '💎', '🏅', '🍕', '🎉', '🍀'];
const ADMIN_PROFILE_NAMES = ['마스터', '멋쟁이아빠']; // ⚙️ 설정 메뉴가 보이는 관리자용 프로필 이름
let statusFilter = null; // 상태 탭에서 선택한 목록 ('tested' | 'wrong' | null)
const VALID_WORD_PATTERN = /^[a-z]+(-[a-z]+)*$/; // 영어 알파벳 + 하이픈 복합어만 허용 (수동입력/GitHub/프리셋 동일 검증)
const DEFAULT_FOLDER = { id: 'default', name: '기본 폴더' };
const MASTER_FOLDER = { id: 'master', name: '☁️ 마스터' };

// 레벨 구간별 칭호/테마. body[data-tier]로 CSS 색상이 바뀐다 (css/style.css 참조)
const LEVEL_TIERS = [
    { min: 20, tier: 5, title: '단어 마스터' },
    { min: 15, tier: 4, title: '단어 챔피언' },
    { min: 10, tier: 3, title: '단어 마법사' },
    { min: 5,  tier: 2, title: '단어 탐험가' },
    { min: 1,  tier: 1, title: '단어 새싹' }
];

// ---------------------------------------------------
// [프로필별 데이터 로드/저장]
// ---------------------------------------------------
function profileKey(suffix) { return `p:${Profiles.activeId()}:${suffix}`; }

function loadProfileData() {
    wordBank = AppStorage.get(profileKey('words'), []);
    userStats = AppStorage.get(profileKey('stats'), { level: 1, exp: 0, stickers: [] });
    folders = AppStorage.get(profileKey('folders'), [{ ...DEFAULT_FOLDER }]);
    // 예전 데이터(폴더 개념 이전)에 folderId가 없으면 기본 폴더로 보정 후 즉시 저장
    let needsBackfill = false;
    wordBank.forEach(w => { if (!w.folderId) { w.folderId = DEFAULT_FOLDER.id; needsBackfill = true; } });
    if (needsBackfill) saveProfileData();
}

function saveProfileData() {
    AppStorage.set(profileKey('words'), wordBank);
    AppStorage.set(profileKey('stats'), userStats);
    AppStorage.set(profileKey('folders'), folders);
}

// ---------------------------------------------------
// [토스트 알림] alert 대신 사용 (모바일에서 흐름이 끊기지 않도록)
// ---------------------------------------------------
function showToast(message, duration = 2200) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    $('toast-zone').appendChild(toast);
    setTimeout(() => {
        toast.classList.add('out');
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

// ---------------------------------------------------
// [프로필 선택 화면 (로그인)]
// ---------------------------------------------------
function showProfileScreen() {
    $('app-root').hidden = true;
    $('profile-screen').hidden = false;
    $('profile-form').hidden = true;
    renderProfileList();
}

function renderProfileList() {
    const container = $('profile-list');
    container.innerHTML = '';
    const profiles = Profiles.list();

    if (profiles.length === 0) {
        const p = document.createElement('p');
        p.className = 'profile-hint';
        p.textContent = '아직 프로필이 없어요. 첫 프로필을 만들어 보세요!';
        container.appendChild(p);
        return;
    }

    const appendCard = (profile, isChild) => {
        const card = document.createElement('div');
        card.className = 'profile-card' + (isChild ? ' child' : '');

        const icon = document.createElement('span');
        icon.className = 'p-icon';
        icon.textContent = profile.icon;

        const info = document.createElement('div');
        const name = document.createElement('div');
        name.className = 'p-name';
        name.textContent = profile.name;
        const meta = document.createElement('div');
        meta.className = 'p-meta';
        const stats = AppStorage.get(`p:${profile.id}:stats`, { level: 1 });
        const words = AppStorage.get(`p:${profile.id}:words`, []);
        meta.textContent = `Lv.${stats.level} · 단어 ${words.length}개`;
        info.appendChild(name);
        info.appendChild(meta);

        card.appendChild(icon);
        card.appendChild(info);

        if (isChild) {
            const badge = document.createElement('span');
            badge.className = 'child-badge';
            badge.textContent = '하위';
            card.appendChild(badge);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'profile-del-btn';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `${profile.name} 프로필 삭제`);
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const childCount = Profiles.children(profile.id).length;
            const warn = childCount > 0 ? `\n(하위 계정 ${childCount}개와 학습 데이터도 함께 삭제됩니다)` : '\n(학습 데이터도 함께 삭제됩니다)';
            if (!confirm(`'${profile.name}' 프로필을 삭제할까요?${warn}`)) return;
            Profiles.remove(profile.id);
            renderProfileList();
        });
        card.appendChild(delBtn);

        card.addEventListener('click', () => { Profiles.switchTo(profile.id); enterApp(); });
        container.appendChild(card);
    };

    Profiles.topLevel().forEach(p => {
        appendCard(p, false);
        Profiles.children(p.id).forEach(c => appendCard(c, true));
    });
}

function openProfileForm() {
    $('profile-form').hidden = false;
    $('new-profile-name').value = '';
    selectedIcon = null;

    // 아이콘 선택 그리드
    const picker = $('icon-picker');
    picker.innerHTML = '';
    Profiles.PROFILE_ICONS.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon-option';
        btn.textContent = icon;
        btn.addEventListener('click', () => {
            selectedIcon = icon;
            picker.querySelectorAll('.icon-option').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');
        });
        picker.appendChild(btn);
    });

    // 상위 계정 선택 (최상위 프로필만 상위가 될 수 있음 - 2단계까지만 허용)
    const parentSel = $('parent-select');
    parentSel.innerHTML = '';
    const noneOpt = document.createElement('option');
    noneOpt.value = '';
    noneOpt.textContent = '없음 (독립 계정)';
    parentSel.appendChild(noneOpt);
    Profiles.topLevel().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.icon} ${p.name}`;
        parentSel.appendChild(opt);
    });
}

function createProfileFromForm() {
    const name = $('new-profile-name').value.trim();
    if (!name) return showToast('이름을 입력해 주세요.');
    if (!selectedIcon) return showToast('아이콘을 선택해 주세요.');
    if (Profiles.list().some(p => p.name === name)) return showToast('같은 이름의 프로필이 이미 있어요.');

    const parentId = $('parent-select').value || null;
    const profile = Profiles.create({ name, icon: selectedIcon, parentId });
    Profiles.switchTo(profile.id);
    showToast(`${selectedIcon} ${name} 프로필이 만들어졌어요!`);
    enterApp();
}

// ---------------------------------------------------
// [앱 진입/초기화]
// ---------------------------------------------------
function enterApp() {
    loadProfileData();
    $('profile-screen').hidden = true;
    $('app-root').hidden = false;

    const profile = Profiles.active();
    $('profile-chip-icon').textContent = profile.icon;
    $('profile-chip-name').textContent = `${profile.name}의 영어 단어`;
    $('btn-open-settings').hidden = !isAdminProfile(); // 설정은 관리자 프로필에게만 노출

    studyFolderId = 'all';
    quizFolderId = 'all';
    statusFilter = null;
    presetSelected.clear();

    applyLevelTheme();
    renderRewards();
    updateWordCount();
    renderFolderSelect();
    renderQuizFolderSelect();
    renderPresetWordPicker();
    checkSyncStatus();
    $('gh-raw-url').value = githubConfig.rawUrl;
    $('gh-token').value = githubConfig.token;
    switchTab('manage');
}

function isAdminProfile() {
    const p = Profiles.active();
    return !!p && ADMIN_PROFILE_NAMES.includes(p.name);
}

function switchTab(tabId) {
    if (tabId === 'cloud' && !isAdminProfile()) return showToast('설정은 관리자 프로필에서만 열 수 있어요.');

    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    $(`sec-${tabId}`).classList.add('active');

    if (tabId === 'manage') { updateWordCount(); renderFolderSelect(); renderPresetWordPicker(); }
    if (tabId === 'study') { renderStudyFolderChips(); renderStudyList(); }
    if (tabId === 'test') { renderQuizFolderSelect(); startCumulativeTest(); }
    if (tabId === 'wrong') renderWrongList();
    if (tabId === 'status') renderStatus();
}

// ---------------------------------------------------
// [레벨/보상/테마]
// ---------------------------------------------------
function currentTier() { return LEVEL_TIERS.find(t => userStats.level >= t.min) || LEVEL_TIERS[LEVEL_TIERS.length - 1]; }

function applyLevelTheme() { document.body.dataset.tier = currentTier().tier; }

function renderRewards() {
    $('level-text').innerText = `Lv.${userStats.level} ${currentTier().title}`;
    $('exp-text').innerText = `${userStats.exp} / 100 EXP`;
    $('exp-fill').style.width = `${userStats.exp}%`;
    $('sticker-board').textContent = userStats.stickers.join(' ');
}

function gainExp(amount) {
    userStats.exp += amount;
    let leveledUp = false;
    let lastSticker = null;
    while (userStats.exp >= 100) {
        userStats.exp -= 100;
        userStats.level++;
        leveledUp = true;
        lastSticker = stickerTypes[Math.floor(Math.random() * stickerTypes.length)];
        userStats.stickers.push(lastSticker);
    }
    saveProfileData();
    renderRewards();
    if (leveledUp) {
        applyLevelTheme();
        playLevelUpEffect(userStats.level, lastSticker);
    }
}

// 레벨업 풀스크린 이펙트 (이모지 파티클 + 카드 팝업)
function playLevelUpEffect(newLevel, sticker) {
    const overlay = $('levelup-overlay');
    $('levelup-level').textContent = `Lv.${newLevel} ${currentTier().title}`;
    $('levelup-sticker').textContent = `새 스티커: ${sticker}`;

    overlay.querySelectorAll('.lv-particle').forEach(el => el.remove());
    const particleEmojis = ['🎉', '✨', '⭐', '🎊', '💫', sticker];
    for (let i = 0; i < 24; i++) {
        const span = document.createElement('span');
        span.className = 'lv-particle';
        span.textContent = particleEmojis[Math.floor(Math.random() * particleEmojis.length)];
        span.style.left = `${Math.random() * 100}vw`;
        span.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
        span.style.animationDelay = `${Math.random() * 0.5}s`;
        overlay.appendChild(span);
    }

    overlay.hidden = false;
    setTimeout(() => { overlay.hidden = true; }, 2600);
}

// ---------------------------------------------------
// [폴더 관리] 프로필마다 단어 폴더를 만들어 분류할 수 있다
// ---------------------------------------------------
function folderName(folderId) {
    const f = folders.find(f => f.id === folderId);
    return f ? f.name : DEFAULT_FOLDER.name;
}

function ensureFolder(folder) {
    if (!folders.some(f => f.id === folder.id)) {
        folders.push({ ...folder });
        saveProfileData();
    }
}

function renderFolderSelect() {
    const sel = $('folder-select');
    const prev = sel.value;
    sel.innerHTML = '';
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.name} (${wordBank.filter(w => w.folderId === f.id).length})`;
        sel.appendChild(opt);
    });
    if (folders.some(f => f.id === prev)) sel.value = prev;
}

function renderQuizFolderSelect() {
    const sel = $('quiz-folder-select');
    sel.innerHTML = '';
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = `전체 (${wordBank.length})`;
    sel.appendChild(allOpt);
    folders.forEach(f => {
        const opt = document.createElement('option');
        opt.value = f.id;
        opt.textContent = `${f.name} (${wordBank.filter(w => w.folderId === f.id).length})`;
        sel.appendChild(opt);
    });
    sel.value = quizFolderId;
    if (sel.value !== quizFolderId) { quizFolderId = 'all'; sel.value = 'all'; }
}

function addFolder() {
    const name = prompt('새 폴더 이름을 입력하세요 (예: 3월 단어, 과학 단어)');
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return showToast('폴더 이름을 입력해 주세요.');
    if (folders.some(f => f.name === trimmed)) return showToast('같은 이름의 폴더가 이미 있어요.');
    const folder = { id: 'f' + Date.now().toString(36), name: trimmed };
    folders.push(folder);
    saveProfileData();
    renderFolderSelect();
    $('folder-select').value = folder.id;
    showToast(`📁 '${trimmed}' 폴더가 만들어졌어요!`);
}

function deleteFolder() {
    const folderId = $('folder-select').value;
    if (folderId === DEFAULT_FOLDER.id) return showToast('기본 폴더는 삭제할 수 없어요.');
    const target = folders.find(f => f.id === folderId);
    if (!target) return;
    const count = wordBank.filter(w => w.folderId === folderId).length;
    if (!confirm(`'${target.name}' 폴더를 삭제할까요?\n(단어 ${count}개는 기본 폴더로 이동합니다)`)) return;

    ensureFolder(DEFAULT_FOLDER);
    wordBank.forEach(w => { if (w.folderId === folderId) w.folderId = DEFAULT_FOLDER.id; });
    folders = folders.filter(f => f.id !== folderId);
    if (studyFolderId === folderId) studyFolderId = 'all';
    if (quizFolderId === folderId) quizFolderId = 'all';
    saveProfileData();
    renderFolderSelect();
    showToast(`폴더가 삭제되고 단어는 기본 폴더로 이동했어요.`);
}

// ---------------------------------------------------
// [단어 추가/중복 검증]
// 데이터 정합성 규칙: 소문자 정규화 후 프로필 내 중복 금지.
// 결과로 추가/중복제외/형식오류 건수를 리포트한다.
// ---------------------------------------------------
function addWordsToBank(words, { folderId = DEFAULT_FOLDER.id, source = 'manual' } = {}) {
    let addedCount = 0, invalidCount = 0, duplicateCount = 0;
    const incoming = new Set(); // 같은 입력 안에서의 중복도 제거

    words.forEach(rawWord => {
        const word = String(rawWord).trim().toLowerCase();
        if (!VALID_WORD_PATTERN.test(word)) { invalidCount++; return; }
        if (incoming.has(word) || wordBank.some(item => item.word === word)) { duplicateCount++; return; }
        incoming.add(word);
        wordBank.push({
            id: Date.now() + Math.random(),
            word,
            addedDate: new Date().toISOString().split('T')[0],
            correctCount: 0,
            incorrectCount: 0,
            folderId,
            source // 'manual' | 'preset' | 'master' — 향후 클라우드 동기화 시 출처 구분용
        });
        addedCount++;
    });

    if (addedCount > 0) saveProfileData();
    updateWordCount();
    return { addedCount, invalidCount, duplicateCount };
}

function reportAddResult({ addedCount, invalidCount, duplicateCount }, prefix = '') {
    let msg = `${prefix}단어 ${addedCount}개 추가 완료!`;
    if (duplicateCount > 0) msg += `\n중복 제외 ${duplicateCount}개`;
    if (invalidCount > 0) msg += `\n형식 오류 제외 ${invalidCount}개`;
    showToast(msg);
}

function saveWords() {
    const input = $('word-input').value;
    if (!input.trim()) return showToast('단어를 입력해 주세요.');

    const rawWords = input.split(/[\n,]+/).map(w => w.trim()).filter(w => w.length > 0);
    const result = addWordsToBank(rawWords, { folderId: $('folder-select').value, source: 'manual' });
    renderFolderSelect();
    renderPresetWordPicker();
    reportAddResult(result);
    $('word-input').value = '';
}

function updateWordCount() { $('total-count').innerText = wordBank.length; }

// ---------------------------------------------------
// [GitHub 마스터 단어장 연동 - 읽기 전용]
// 불러온 단어는 '☁️ 마스터' 폴더에 저장되며, 등록할 때마다 중복 검증을 거친다.
// ---------------------------------------------------
function saveCloudConfig() {
    githubConfig.rawUrl = $('gh-raw-url').value.trim();
    githubConfig.token = $('gh-token').value.trim();
    AppStorage.set('cloudConfig', githubConfig);
    showToast('단어장 연동 설정이 저장되었어요.');
    checkSyncStatus();
}

function checkSyncStatus() {
    $('sync-status').style.display = githubConfig.rawUrl ? 'block' : 'none';
}

// words.txt("apple, banana" 또는 줄바꿈 구분) / words.json(["apple",...] 또는 [{"word":"apple"},...]) 모두 지원
function parseMasterWordText(rawText) {
    try {
        const parsed = JSON.parse(rawText);
        if (Array.isArray(parsed)) {
            return parsed
                .map(item => (typeof item === 'string' ? item : item && item.word))
                .filter(Boolean)
                .map(w => String(w).trim().toLowerCase());
        }
    } catch (e) {
        // JSON이 아니면 plain text로 간주
    }
    return rawText.split(/[\n,]+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);
}

async function fetchMasterWords() {
    if (!githubConfig.rawUrl) return showToast('GitHub 단어장 파일 주소를 먼저 입력해 주세요.');

    try {
        document.body.style.cursor = 'wait';
        const headers = {};
        if (githubConfig.token) headers['Authorization'] = `Bearer ${githubConfig.token}`;

        const response = await fetch(githubConfig.rawUrl, { method: 'GET', headers });
        if (!response.ok) throw new Error('파일을 불러오지 못했습니다 (주소와 저장소 공개 여부를 확인하세요)');

        const rawText = await response.text();
        ensureFolder(MASTER_FOLDER);
        const result = addWordsToBank(parseMasterWordText(rawText), { folderId: MASTER_FOLDER.id, source: 'master' });
        renderFolderSelect();
        renderPresetWordPicker();
        reportAddResult(result, '☁️ ');
    } catch (error) {
        showToast(`오류: ${error.message}`);
    } finally {
        document.body.style.cursor = 'default';
    }
}

// ---------------------------------------------------
// [초등 필수 단어 300개 프리셋 선택 UI]
// ---------------------------------------------------
function renderPresetWordPicker() {
    // 접혀 있는 동안은 렌더링을 생략하고, 펼칠 때 다시 그린다 (300개 칩 불필요 렌더 방지)
    if ($('preset-body').hidden) return;
    const container = $('preset-word-picker');
    const searchTerm = $('preset-search').value.trim().toLowerCase();
    container.innerHTML = '';

    Object.entries(ELEMENTARY_WORD_CATEGORIES).forEach(([category, words]) => {
        const filtered = words.filter(w => w.includes(searchTerm));
        if (filtered.length === 0) return;

        const catBlock = document.createElement('div');
        catBlock.className = 'preset-cat';

        const catHeader = document.createElement('div');
        catHeader.className = 'preset-cat-header';
        catHeader.textContent = `${category} (${filtered.length})`;
        catBlock.appendChild(catHeader);

        const wordWrap = document.createElement('div');
        wordWrap.className = 'preset-word-wrap';

        filtered.forEach(word => {
            const alreadyRegistered = wordBank.some(item => item.word === word);
            const chip = document.createElement('label');
            chip.className = 'preset-chip'
                + (alreadyRegistered ? ' registered' : '')
                + (presetSelected.has(word) ? ' selected' : '');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = presetSelected.has(word);
            checkbox.disabled = alreadyRegistered;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) presetSelected.add(word); else presetSelected.delete(word);
                renderPresetWordPicker();
            });

            chip.appendChild(checkbox);
            chip.appendChild(document.createTextNode(alreadyRegistered ? `${word} ✓` : word));
            wordWrap.appendChild(chip);
        });

        catBlock.appendChild(wordWrap);
        container.appendChild(catBlock);
    });

    if (container.innerHTML === '') {
        container.innerHTML = '<p class="preset-empty">검색 결과가 없습니다.</p>';
    }
    $('preset-selected-count').textContent = presetSelected.size;
}

function selectAllPresetWords(checked) {
    const searchTerm = $('preset-search').value.trim().toLowerCase();
    Object.values(ELEMENTARY_WORD_CATEGORIES).flat().forEach(word => {
        if (!word.includes(searchTerm)) return;
        if (wordBank.some(item => item.word === word)) return;
        if (checked) presetSelected.add(word); else presetSelected.delete(word);
    });
    renderPresetWordPicker();
}

function addSelectedPresetWords() {
    if (presetSelected.size === 0) return showToast('추가할 단어를 먼저 선택해 주세요.');
    const result = addWordsToBank([...presetSelected], { folderId: $('folder-select').value, source: 'preset' });
    presetSelected.clear();
    renderFolderSelect();
    renderPresetWordPicker();
    reportAddResult(result);
}

function addAllPresetWords() {
    if (!confirm('초등 필수 단어 300개를 모두 추가할까요? (이미 등록된 단어는 건너뜁니다)')) return;
    const all = Object.values(ELEMENTARY_WORD_CATEGORIES).flat();
    const result = addWordsToBank(all, { folderId: $('folder-select').value, source: 'preset' });
    presetSelected.clear();
    renderFolderSelect();
    renderPresetWordPicker();
    reportAddResult(result);
}

// ---------------------------------------------------
// [사전 학습 목록] 폴더 칩으로 필터링
// ---------------------------------------------------
function renderStudyFolderChips() {
    const container = $('study-folder-chips');
    container.innerHTML = '';

    const makeChip = (id, label) => {
        const btn = document.createElement('button');
        btn.className = 'folder-chip' + (studyFolderId === id ? ' active' : '');
        btn.textContent = label;
        btn.addEventListener('click', () => {
            studyFolderId = id;
            renderStudyFolderChips();
            renderStudyList();
        });
        container.appendChild(btn);
    };

    makeChip('all', `전체 ${wordBank.length}`);
    folders.forEach(f => makeChip(f.id, `${f.name} ${wordBank.filter(w => w.folderId === f.id).length}`));
}

function renderStudyList() {
    const container = $('study-list');
    container.innerHTML = '';
    const list = studyFolderId === 'all' ? wordBank : wordBank.filter(w => w.folderId === studyFolderId);
    if (list.length === 0) return container.innerHTML = '<p style="text-align:center; grid-column:1/-1;">등록된 단어가 없습니다.</p>';

    [...list].reverse().forEach(item => {
        const card = document.createElement('div');
        card.className = 'word-card';

        const wordText = document.createElement('span');
        wordText.textContent = item.word;
        card.appendChild(wordText);

        if (studyFolderId === 'all') {
            const tag = document.createElement('span');
            tag.className = 'word-folder-tag';
            tag.textContent = folderName(item.folderId);
            card.appendChild(tag);
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-word-btn';
        delBtn.textContent = '✕';
        delBtn.setAttribute('aria-label', `${item.word} 삭제`);
        delBtn.addEventListener('click', (e) => deleteWord(item.id, e));
        card.appendChild(delBtn);

        // 사전은 카드 왼쪽 위 📖 버튼으로 분리
        const dictBtn = document.createElement('button');
        dictBtn.className = 'dict-word-btn';
        dictBtn.textContent = '📖';
        dictBtn.setAttribute('aria-label', `${item.word} 사전 열기`);
        dictBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(`https://en.dict.naver.com/#/search?query=${encodeURIComponent(item.word)}`, '_blank');
        });
        card.appendChild(dictBtn);

        // 카드 탭 = 발음 재생 (모바일 학습 시 바로 들을 수 있도록)
        card.addEventListener('click', () => playTTS(item.word));
        container.appendChild(card);
    });
}

// 개인 기기 로컬 단어장에서만 제거된다. GitHub 원본 파일은 그대로이므로
// [단어장 새로고침] 시 다시 들어올 수 있어, 필요하면 GitHub 파일도 함께 수정해야 한다.
function deleteWord(id, event) {
    if (event) event.stopPropagation();
    const target = wordBank.find(w => w.id === id);
    if (!target) return;
    if (!confirm(`'${target.word}' 단어를 삭제할까요?`)) return;

    wordBank = wordBank.filter(w => w.id !== id);
    saveProfileData();
    updateWordCount();
    renderStudyFolderChips();
    renderStudyList();
    renderPresetWordPicker();
}

// ---------------------------------------------------
// [누적 테스트 (받아쓰기 퀴즈)]
// ---------------------------------------------------
function startCumulativeTest() {
    const pool = quizFolderId === 'all' ? wordBank : wordBank.filter(w => w.folderId === quizFolderId);
    if (pool.length === 0) {
        $('quiz-container').innerHTML = '<p>이 범위에 단어가 없어요. 단어를 먼저 등록해 주세요.</p>';
        $('quiz-progress').innerText = '';
        return;
    }
    currentQuizList = [...pool].sort((a, b) => b.incorrectCount - a.incorrectCount || Math.random() - 0.5).slice(0, 20);
    currentQuizIndex = 0;
    renderQuiz();
}

function renderQuiz() {
    const container = $('quiz-container');
    const progress = $('quiz-progress');

    if (currentQuizIndex >= currentQuizList.length) {
        container.innerHTML = `<h2>🎉 테스트 완료!</h2>`;
        progress.innerText = '';
        saveProfileData();
        return;
    }

    const currentItem = currentQuizList[currentQuizIndex];
    quizIncorrectCount = 0;

    container.innerHTML = `
        <button class="audio-btn" id="quiz-audio-btn" aria-label="단어 듣기">🔊</button>
        <div class="hint-text" id="hint-zone"></div>
        <input type="text" id="quiz-input" class="quiz-input" autocomplete="off" autocapitalize="none" autocorrect="off">
        <button class="btn-main" id="quiz-submit-btn">정답 확인</button>
    `;
    $('quiz-audio-btn').addEventListener('click', () => {
        playTTS(currentItem.word);
        $('quiz-input').focus(); // 듣기 후 바로 입력할 수 있도록 답 입력창으로 커서 이동
    });
    $('quiz-submit-btn').addEventListener('click', validateAnswer);
    $('quiz-input').addEventListener('keyup', (e) => { if (e.key === 'Enter') validateAnswer(); });
    $('hint-zone').textContent = generateHintBlank(currentItem.word, 0);

    progress.innerText = `문제: ${currentQuizIndex + 1} / ${currentQuizList.length}`;
    playTTS(currentItem.word);
    setTimeout(() => $('quiz-input').focus(), 300);
}

function generateHintBlank(word, penalty) {
    return word.split('').map((c, i) => (i === 0 && penalty >= 1) || (['a', 'e', 'i', 'o', 'u'].includes(c) && penalty >= 2) ? c : '_').join(' ');
}

let currentUtterance = null; // 크롬 계열에서 utterance가 재생 중 GC되며 소리가 끊기는 버그 방지용 참조 유지

function playTTS(text) {
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = 0.8;
    currentUtterance = u;

    if (synth.speaking || synth.pending) {
        // 모바일(특히 안드로이드 크롬)은 cancel() 직후의 speak()를 조용히 무시하는
        // 버그가 있어, 재생 중일 때만 cancel 후 잠깐 기다렸다가 재생한다.
        synth.cancel();
        setTimeout(() => {
            if (synth.paused) synth.resume();
            synth.speak(u);
        }, 80);
    } else {
        // 유휴 상태면 사용자 터치 이벤트 컨텍스트 안에서 바로 재생
        // (iOS는 첫 재생이 사용자 제스처 안에서 일어나야 소리가 허용됨)
        if (synth.paused) synth.resume();
        synth.speak(u);
    }
}

function validateAnswer() {
    const inputEl = $('quiz-input');
    const userAnswer = inputEl.value.trim().toLowerCase();
    const currentItem = currentQuizList[currentQuizIndex];
    const masterItem = wordBank.find(item => item.id === currentItem.id);

    if (userAnswer === currentItem.word) {
        if (quizIncorrectCount === 0) { masterItem.correctCount++; showToast('🎯 완벽해요! +10 EXP'); gainExp(10); }
        else { showToast('🎯 정답입니다! (힌트 사용)'); }
        currentQuizIndex++;
        renderQuiz();
    } else {
        quizIncorrectCount++;
        masterItem.incorrectCount++;
        showToast('❌ 다시 한 번 들어보세요!');
        inputEl.value = '';
        inputEl.focus();
        $('hint-zone').textContent = generateHintBlank(currentItem.word, quizIncorrectCount);
        playTTS(currentItem.word);
    }
}

// ---------------------------------------------------
// [오답 노트 / 상태 목록 공용 카드]
// ---------------------------------------------------
// variant: 'wrong'(빨강, 기본) | 'correct'(초록: 정답만) | 'mixed'(주황: 정답+오답)
function createWordDetailCard(item, badgeText, variant = 'wrong') {
    const card = document.createElement('div');
    card.className = 'wrong-card' + (variant !== 'wrong' ? ` ${variant}` : '');

    const title = document.createElement('div');
    title.className = 'wrong-title';
    title.textContent = item.word;

    const badge = document.createElement('div');
    badge.className = 'wrong-badge';
    badge.textContent = badgeText;

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
    return card;
}

function renderWrongList() {
    const container = $('wrong-list');
    container.innerHTML = '';
    const wrongWords = wordBank.filter(w => w.incorrectCount > 0).sort((a, b) => b.incorrectCount - a.incorrectCount);

    if (wrongWords.length === 0) return container.innerHTML = '<p style="text-align:center; grid-column:1/-1;">🎉 틀린 단어가 없습니다!</p>';

    wrongWords.forEach(item => container.appendChild(createWordDetailCard(item, `틀린 횟수: ${item.incorrectCount}회`)));
}

// ---------------------------------------------------
// [상태 탭] 레벨 / 테스트한 단어 수 / 오답 수 요약, 건수 탭 시 상세 목록
// ---------------------------------------------------
function renderStatus() {
    const tested = wordBank.filter(w => w.correctCount > 0 || w.incorrectCount > 0);
    const wrong = wordBank.filter(w => w.incorrectCount > 0);

    $('status-level').textContent = `Lv.${userStats.level}`;
    $('status-level-title').textContent = currentTier().title;
    $('status-tested-count').textContent = tested.length;
    $('status-wrong-count').textContent = wrong.length;
    $('status-tested-card').classList.toggle('active', statusFilter === 'tested');
    $('status-wrong-card').classList.toggle('active', statusFilter === 'wrong');

    const container = $('status-list');
    container.innerHTML = '';
    $('status-hint').hidden = statusFilter !== null;
    if (!statusFilter) return;

    const list = statusFilter === 'tested'
        ? [...tested].sort((a, b) => (b.correctCount + b.incorrectCount) - (a.correctCount + a.incorrectCount))
        : [...wrong].sort((a, b) => b.incorrectCount - a.incorrectCount);

    if (list.length === 0) return container.innerHTML = '<p style="text-align:center; grid-column:1/-1;">해당하는 단어가 없습니다.</p>';

    list.forEach(item => {
        if (statusFilter === 'tested') {
            // 정답만=초록, 정답+오답=주황, 오답만=빨강으로 구분 표시
            const variant = item.incorrectCount === 0 ? 'correct'
                : (item.correctCount > 0 ? 'mixed' : 'wrong');
            container.appendChild(createWordDetailCard(item, `정답 ${item.correctCount}회 · 오답 ${item.incorrectCount}회`, variant));
        } else {
            container.appendChild(createWordDetailCard(item, `틀린 횟수: ${item.incorrectCount}회`));
        }
    });
}

// ---------------------------------------------------
// [초기화]
// ---------------------------------------------------
function migrateLegacyGithubConfig() {
    // v1 시절 키(githubConfig)를 v2 키(cloudConfig)로 1회 이전
    if (AppStorage.get('cloudConfig')) return;
    try {
        const legacy = JSON.parse(localStorage.getItem('githubConfig') || 'null');
        if (legacy) {
            AppStorage.set('cloudConfig', legacy);
            localStorage.removeItem('githubConfig');
        }
    } catch (e) { /* 손상된 데이터는 무시 */ }
}

function bindStaticEvents() {
    // 탭
    document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    // 관리자 설정 / 상태 탭
    $('btn-open-settings').addEventListener('click', () => switchTab('cloud'));
    $('status-tested-card').addEventListener('click', () => { statusFilter = statusFilter === 'tested' ? null : 'tested'; renderStatus(); });
    $('status-wrong-card').addEventListener('click', () => { statusFilter = statusFilter === 'wrong' ? null : 'wrong'; renderStatus(); });

    // 프로필
    $('btn-new-profile').addEventListener('click', openProfileForm);
    $('btn-create-profile').addEventListener('click', createProfileFromForm);
    $('btn-cancel-profile').addEventListener('click', () => { $('profile-form').hidden = true; });
    $('btn-switch-profile').addEventListener('click', () => { Profiles.logout(); showProfileScreen(); });
    $('profile-chip').addEventListener('click', () => { Profiles.logout(); showProfileScreen(); });

    // 단어 관리
    $('btn-save-words').addEventListener('click', saveWords);
    $('btn-add-folder').addEventListener('click', addFolder);
    $('btn-del-folder').addEventListener('click', deleteFolder);
    $('btn-toggle-preset').addEventListener('click', () => {
        const body = $('preset-body');
        body.hidden = !body.hidden;
        $('btn-toggle-preset').classList.toggle('open', !body.hidden);
        if (!body.hidden) renderPresetWordPicker();
    });
    $('preset-search').addEventListener('input', renderPresetWordPicker);
    $('btn-preset-all-on').addEventListener('click', () => selectAllPresetWords(true));
    $('btn-preset-all-off').addEventListener('click', () => selectAllPresetWords(false));
    $('btn-preset-add-300').addEventListener('click', addAllPresetWords);
    $('btn-preset-add-selected').addEventListener('click', addSelectedPresetWords);

    // 테스트 범위 변경 시 새 테스트 시작
    $('quiz-folder-select').addEventListener('change', (e) => { quizFolderId = e.target.value; startCumulativeTest(); });

    // 클라우드 설정
    $('btn-save-cloud').addEventListener('click', saveCloudConfig);
    $('btn-fetch-master').addEventListener('click', fetchMasterWords);
}

// 카카오톡/네이버/인스타그램 등 인앱 브라우저는 음성합성(TTS)을 무음 처리하는 경우가 많아,
// 감지되면 외부 브라우저(크롬/사파리)로 자동 이동시킨다. 이동에 실패하면 안내 토스트로 대체.
function escapeInAppBrowser() {
    const ua = navigator.userAgent;
    if (/KAKAOTALK/i.test(ua)) {
        // 카카오톡 공식 스킴: 현재 페이지를 기기 기본 브라우저(안드로이드=크롬 등, 아이폰=사파리)로 열기
        location.href = 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href);
        return true;
    }
    if (/Android/i.test(ua) && /NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua)) {
        // 안드로이드 일반 인앱 브라우저: 크롬 intent로 탈출
        location.href = 'intent://' + location.host + location.pathname + '#Intent;scheme=https;package=com.android.chrome;end';
        return true;
    }
    return false;
}

function warnIfTtsUnavailable() {
    const ua = navigator.userAgent;
    const isInAppBrowser = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua);
    if (!('speechSynthesis' in window)) {
        showToast('📢 이 브라우저는 발음 소리를 지원하지 않아요.\n크롬 또는 사파리에서 열어주세요.', 5000);
    }
    if (isInAppBrowser) {
        showToast('📢 발음 소리를 위해 크롬/사파리로 이동합니다.\n이동되지 않으면 메뉴에서 [다른 브라우저로 열기]를 눌러주세요.', 5000);
        // 화면이 먼저 그려진 뒤 이동 시도 (이동이 차단돼도 앱은 그대로 사용 가능)
        setTimeout(escapeInAppBrowser, 400);
    }
}

function init() {
    migrateLegacyGithubConfig();
    Profiles.migrateLegacyData();
    githubConfig = AppStorage.get('cloudConfig', { rawUrl: '', token: '' });
    bindStaticEvents();
    warnIfTtsUnavailable();

    if (Profiles.active()) enterApp();
    else showProfileScreen();
}

init();
