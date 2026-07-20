// firebase-init.js (type="module")
// Firebase SDK를 CDN(ESM)에서 불러와 초기화하고, 다른 일반 <script>(js/cloud.js)에서
// 쓸 수 있도록 window.FirebaseSDK에 노출한다.
//
// 이 프로젝트는 빌드 도구가 없는 순수 정적 사이트라 npm import 대신 gstatic CDN을 사용한다.
// apiKey는 비밀 값이 아니라 프로젝트 식별용 공개 값이며, 실제 접근 통제는
// Firestore 보안 규칙(firestore.rules)과 Authentication 승인된 도메인이 담당한다.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
    getAuth, onAuthStateChanged, signInAnonymously,
    signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, getDocs, collection, addDoc,
    query, where, orderBy, limit, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBhatE5HvrqtmtwIXelqKhqxongjcT_Xd4",
    authDomain: "edu-eng-word.firebaseapp.com",
    projectId: "edu-eng-word",
    storageBucket: "edu-eng-word.firebasestorage.app",
    messagingSenderId: "224311267959",
    appId: "1:224311267959:web:430815ecdfe877f685ac72"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

window.FirebaseSDK = {
    auth, db,
    onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut,
    doc, setDoc, getDoc, getDocs, collection, addDoc,
    query, where, orderBy, limit, serverTimestamp, writeBatch
};
// 모듈 스크립트는 defer로 동작해 일반 <script>(cloud.js)보다 늦게 실행될 수 있으므로,
// 준비 완료를 이벤트로 알려서 cloud.js가 늦게 도착하는 SDK를 기다릴 수 있게 한다.
window.dispatchEvent(new Event('firebase-ready'));
