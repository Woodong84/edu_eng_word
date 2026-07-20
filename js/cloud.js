// cloud.js
// 로그인 관리 / Word 마스터 데이터 / 사용이력 / 랭킹을 위한 Firebase 연동 계층.
//
// 설계 원칙: 이 앱은 "로컬 우선(local-first)" 구조를 유지한다. localStorage(js/storage.js)가
// 여전히 즉시 반영되는 유일한 소스이고, Cloud.*는 그 위에 얹는 best-effort 백그라운드 동기화다.
// 네트워크가 없거나 Firebase 콘솔 설정이 덜 되어 있어도 앱의 핵심 기능(단어 학습/테스트)은
// 그대로 동작해야 하므로, 모든 Cloud 함수는 실패해도 예외를 앱 로직 쪽으로 던지지 않는다
// (관리자 전용 쓰기 함수는 예외이며, 이 경우 호출부에서 명시적으로 처리한다).
//
// 권한 모델(가족 앱 신뢰 경계, 상세 설계는 firestore.rules 참고):
// - 앱을 열면 자동으로 익명 로그인되어 누구나(자녀 프로필 포함) 자신의 프로필/이력을 읽고 쓸 수 있다.
// - masterWords(마스터 단어 데이터) 쓰기는 이메일/비밀번호로 로그인한 "관리자 계정"만 가능하다.
//   앱 화면의 마스터/멋쟁이아빠 프로필 여부(로컬 권한)와는 별개로, Firebase 인증 계정 하나를
//   가족 공용 관리자 계정으로 사용한다.
const Cloud = (() => {
    function waitForSdk() {
        if (window.FirebaseSDK) return Promise.resolve(window.FirebaseSDK);
        return new Promise(resolve => window.addEventListener('firebase-ready', () => resolve(window.FirebaseSDK), { once: true }));
    }

    let authReadyPromise = null;
    function ensureAuth() {
        if (!authReadyPromise) {
            authReadyPromise = waitForSdk().then(sdk => new Promise((resolve) => {
                sdk.onAuthStateChanged(sdk.auth, (user) => {
                    if (user) { resolve({ sdk, user }); return; }
                    sdk.signInAnonymously(sdk.auth).catch(err => console.warn('[cloud] 익명 로그인 실패', err));
                });
            }));
        }
        return authReadyPromise;
    }

    function isAdminAuthed() {
        const sdk = window.FirebaseSDK;
        const user = sdk && sdk.auth.currentUser;
        return !!(user && user.email); // 익명 계정은 email이 없음 → 이메일 계정으로 로그인된 경우만 관리자로 취급
    }

    async function adminSignIn(email, password) {
        const { sdk } = await ensureAuth();
        await sdk.signInWithEmailAndPassword(sdk.auth, email, password);
    }

    async function adminSignOut() {
        const { sdk } = await ensureAuth();
        await sdk.signOut(sdk.auth);
        await sdk.signInAnonymously(sdk.auth); // 로그아웃 후에도 앱은 계속 쓸 수 있도록 익명으로 복귀
    }

    // 프로필 + 통계를 클라우드에 반영 (실패해도 로컬 동작에는 영향 없음)
    async function syncProfile(profile, stats, role) {
        try {
            const { sdk, user } = await ensureAuth();
            await sdk.setDoc(sdk.doc(sdk.db, 'profiles', profile.id), {
                name: profile.name,
                icon: profile.icon,
                parentId: profile.parentId || null,
                role,
                ownerUid: user.uid,
                stats,
                updatedAt: sdk.serverTimestamp()
            }, { merge: true });
        } catch (e) {
            console.warn('[cloud] syncProfile 실패 (로컬 데이터는 정상 저장됨)', e);
        }
    }

    // 테스트 1문제 시도 기록 (사용 이력)
    async function logHistory(profileId, entry) {
        try {
            const { sdk } = await ensureAuth();
            await sdk.addDoc(sdk.collection(sdk.db, 'profiles', profileId, 'history'), {
                ...entry,
                testedAt: sdk.serverTimestamp()
            });
        } catch (e) {
            console.warn('[cloud] logHistory 실패', e);
        }
    }

    // 주간/월간 랭킹: 관리자 프로필은 제외하고, 지정한 통계 필드 기준 내림차순 상위 N명
    async function fetchRanking(statField, max = 20) {
        const { sdk } = await ensureAuth();
        const q = sdk.query(
            sdk.collection(sdk.db, 'profiles'),
            sdk.orderBy(`stats.${statField}`, 'desc'),
            sdk.limit(max)
        );
        const snap = await sdk.getDocs(q);
        return snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(p => p.role !== 'admin');
    }

    async function addMasterWord(word, category) {
        if (!isAdminAuthed()) throw new Error('관리자 로그인이 필요합니다.');
        const { sdk, user } = await ensureAuth();
        await sdk.setDoc(sdk.doc(sdk.db, 'masterWords', word), {
            word, category, addedBy: user.uid, createdAt: sdk.serverTimestamp()
        }, { merge: true });
    }

    // 초등 필수 단어 300개 프리셋을 masterWords 컬렉션에 일괄 등록(시드). 문서 ID가 단어 자체라
    // 여러 번 눌러도 중복 생성되지 않는다.
    async function seedMasterWordsFromPreset(categories) {
        if (!isAdminAuthed()) throw new Error('관리자 로그인이 필요합니다.');
        const { sdk, user } = await ensureAuth();
        const batch = sdk.writeBatch(sdk.db);
        let count = 0;
        Object.entries(categories).forEach(([category, words]) => {
            words.forEach(word => {
                batch.set(sdk.doc(sdk.db, 'masterWords', word), {
                    word, category, addedBy: user.uid, createdAt: sdk.serverTimestamp()
                }, { merge: true });
                count++;
            });
        });
        await batch.commit();
        return count;
    }

    return {
        ensureAuth, isAdminAuthed, adminSignIn, adminSignOut,
        syncProfile, logHistory, fetchRanking, addMasterWord, seedMasterWordsFromPreset
    };
})();
