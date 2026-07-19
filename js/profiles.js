// profiles.js
// 로컬 프로필(계정) 관리
//
// - 서버가 없으므로 "로그인"은 같은 기기(브라우저) 안에서의 프로필 전환으로 동작한다.
//   비밀번호 없이 이름+아이콘만으로 구분한다 (아이들이 쓰기 쉽도록 최소 정보만).
// - parentId로 상위/하위 계정 관계를 표현한다. 하위 계정은 상위 계정 아래에 묶여 표시된다.
// - 프로필별 데이터는 키를 분리해 저장한다:
//   p:<profileId>:words / p:<profileId>:stats / p:<profileId>:folders
// - 향후 클라우드 DB 도입 시 이 모듈의 인터페이스는 유지한 채
//   내부 구현만 원격 사용자 테이블 조회로 바꾸면 된다.
const Profiles = (() => {
    const PROFILE_ICONS = ['🦄', '🦖', '🐱', '🐶', '🐰', '🐼', '🦊', '🐸', '🐧', '🦁', '👧', '👦', '🧑‍🚀', '🧜‍♀️', '🦸', '🤖', '👑', '⭐'];

    function list() { return AppStorage.get('profiles', []); }
    function saveList(profiles) { AppStorage.set('profiles', profiles); }
    function activeId() { return AppStorage.get('activeProfileId', null); }
    function active() { return list().find(p => p.id === activeId()) || null; }
    function children(parentId) { return list().filter(p => p.parentId === parentId); }
    function topLevel() { return list().filter(p => !p.parentId); }

    function create({ name, icon, parentId = null }) {
        const profiles = list();
        const profile = {
            id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: String(name).trim(),
            icon,
            parentId,
            createdAt: new Date().toISOString()
        };
        profiles.push(profile);
        saveList(profiles);
        return profile;
    }

    // 프로필 삭제 시 하위 계정과 각 프로필의 학습 데이터도 함께 삭제한다.
    function remove(id) {
        const toDelete = [id, ...children(id).map(p => p.id)];
        saveList(list().filter(p => !toDelete.includes(p.id)));
        toDelete.forEach(pid => {
            AppStorage.remove(`p:${pid}:words`);
            AppStorage.remove(`p:${pid}:stats`);
            AppStorage.remove(`p:${pid}:folders`);
        });
        if (toDelete.includes(activeId())) AppStorage.remove('activeProfileId');
        return toDelete.length;
    }

    function switchTo(id) { AppStorage.set('activeProfileId', id); }
    function logout() { AppStorage.remove('activeProfileId'); }

    // 프로필 개념 도입 전(v1) localStorage 데이터를 기본 프로필로 1회 이전한다.
    function migrateLegacyData() {
        if (list().length > 0) return;
        let legacyWords = null, legacyStats = null;
        try { legacyWords = JSON.parse(localStorage.getItem('wordBank') || 'null'); } catch (e) { /* 손상된 데이터는 무시 */ }
        try { legacyStats = JSON.parse(localStorage.getItem('userStats') || 'null'); } catch (e) { /* 손상된 데이터는 무시 */ }
        if (!legacyWords && !legacyStats) return;

        const profile = create({ name: 'Sia', icon: '🦄' });
        if (Array.isArray(legacyWords)) AppStorage.set(`p:${profile.id}:words`, legacyWords);
        if (legacyStats) AppStorage.set(`p:${profile.id}:stats`, legacyStats);
        localStorage.removeItem('wordBank');
        localStorage.removeItem('userStats');
    }

    return { PROFILE_ICONS, list, active, activeId, children, topLevel, create, remove, switchTo, logout, migrateLegacyData };
})();
