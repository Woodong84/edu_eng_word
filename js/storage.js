// storage.js
// 데이터 저장소 추상화 계층 (Adapter 패턴)
//
// - 현재: localStorage 어댑터를 기본으로 사용 (오프라인, 기기별 저장)
// - 향후 클라우드 DB(Firebase/Supabase 등) 도입 시:
//   동일한 인터페이스 { get, set, remove, keys }를 구현한 어댑터를 만들어
//   AppStorage.setAdapter(cloudAdapter)로 교체하면 앱 로직(app.js/profiles.js)은
//   수정 없이 저장소만 바뀐다. 비동기 DB를 붙일 때는 이 계층에서
//   "로컬 캐시 즉시 반영 + 백그라운드 동기화" 전략을 구현하는 것을 권장.
//
// - 모든 키는 버전 프리픽스(eduword:v2:)로 관리한다.
//   스키마가 바뀌면 프리픽스 버전을 올리고 마이그레이션 코드를 추가한다.
const AppStorage = (() => {
    const PREFIX = 'eduword:v2:';

    const localStorageAdapter = {
        get(key) {
            try { return JSON.parse(localStorage.getItem(PREFIX + key)); }
            catch (e) { return null; }
        },
        set(key, value) { localStorage.setItem(PREFIX + key, JSON.stringify(value)); },
        remove(key) { localStorage.removeItem(PREFIX + key); },
        keys() {
            const result = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(PREFIX)) result.push(k.slice(PREFIX.length));
            }
            return result;
        }
    };

    let adapter = localStorageAdapter;

    return {
        get(key, fallback = null) {
            const v = adapter.get(key);
            return (v === null || v === undefined) ? fallback : v;
        },
        set(key, value) { adapter.set(key, value); },
        remove(key) { adapter.remove(key); },
        keys() { return adapter.keys(); },
        setAdapter(a) { adapter = a; }
    };
})();
