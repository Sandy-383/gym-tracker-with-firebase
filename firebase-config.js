// Firebase Configuration
// Get your config from: https://console.firebase.google.com/
// Project Settings > Add app > Web app > Copy config
//
// The apiKey here is NOT a secret — it identifies the project, it does not grant
// access. Access is controlled entirely by database.rules.json, which requires a
// signed-in user whose uid is present in gymTracker/allowlist.

const firebaseConfig = {
  apiKey: "AIzaSyASP0sjSY5nZE__ym8aWlfUXDYf5g3AJrY",
  authDomain: "gym-tracker-c1754-2ebca.firebaseapp.com",
  databaseURL: "https://gym-tracker-c1754-2ebca-default-rtdb.firebaseio.com",
  projectId: "gym-tracker-c1754-2ebca",
  storageBucket: "gym-tracker-c1754-2ebca.firebasestorage.app",
  messagingSenderId: "369716028158",
  appId: "1:369716028158:web:6e13b4ebc967dec2e4fbaf",
  measurementId: "G-BD02X9RS6L"
};

// Single namespace for everything Firebase, always defined.
//
// Why not `const db = firebase.database()` at top level: if the SDK fails to load
// (blocked CDN, offline first visit, corporate DNS) that line throws, the script
// aborts, and `db` is left declared-but-uninitialised. A later `typeof db` then
// throws a ReferenceError from the temporal dead zone instead of returning
// 'undefined', so the "fall back gracefully" path never runs and the page is dead.
// An assigned window property cannot fail that way.
window.gymFirebase = {
    ready: false,
    error: null,
    app: null,
    db: null,
    auth: null
};

(function initFirebase() {
    if (typeof firebase === 'undefined') {
        window.gymFirebase.error = 'sdk-missing';
        console.warn('Firebase SDK did not load — check your connection or ad blocker.');
        return;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }

        window.gymFirebase.app = firebase.app();
        window.gymFirebase.db = firebase.database();
        window.gymFirebase.auth = firebase.auth();
        window.gymFirebase.ready = true;

        // Keep the session across app restarts. This is the difference between
        // "opens straight into your log" and "sign in every time you hit the gym".
        // LOCAL is already the web default; setting it explicitly means a future
        // SDK default change can't silently log everyone out.
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .catch(err => console.warn('Could not set auth persistence:', err && err.code));
    } catch (err) {
        window.gymFirebase.error = (err && err.code) || 'init-failed';
        console.error('Firebase init failed:', err);
    }
})();
