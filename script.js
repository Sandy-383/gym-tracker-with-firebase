let currentDay = 1;
let currentExerciseForLogging = null;
let repsChart = null;
let weightChart = null;

// ==================== FIREBASE / SESSION STATE ====================

const fb = window.gymFirebase || { ready: false, error: 'config-missing', db: null, auth: null };

let currentUser = null;      // firebase.User once signed in
let userRef = null;          // db.ref('gymTracker/users/<uid>')
let dataBound = false;       // a value listener is attached
let firstSnapshot = false;   // server state has arrived at least once
let legacyChecked = false;   // pre-auth local data already offered for import

const LEGACY_STORAGE_KEY = 'gymTrackerData';
const BOOT_TIMEOUT_MS = 9000;

// ==================== BOOT ====================

document.addEventListener('DOMContentLoaded', () => {
    // Everything here is data-independent, so it is safe before sign-in.
    wireAuthUI();
    wireDashboardInputs();
    setupSetsLogUI();
    initChartDefaults();
    setTodayDate();

    if (!fb.ready) {
        setText('gateErrorDetail', fb.error === 'sdk-missing'
            ? 'The Firebase SDK could not be downloaded. Check your connection or any content blocker, then reload.'
            : 'Firebase failed to start (' + fb.error + '). Check firebase-config.js, then reload.');
        showGateView('gateError');
        return;
    }

    showGateView('gateLoading');
    watchConnection();
    fb.auth.onAuthStateChanged(handleAuthChange);
});

// The single place session changes are handled: sign in, sign out, token refresh,
// and the initial "was I already signed in?" resolution all land here.
function handleAuthChange(user) {
    detachData();
    currentUser = user;

    if (!user) {
        cachedData = { schedule: {}, logs: [] };
        currentExerciseForLogging = null;
        showApp(false);
        showGateView('gateSignIn');
        return;
    }

    setText('brandSub', user.email || 'Signed in');

    // Hydrate from this account's own cache first so an offline launch still shows
    // the log instead of an indefinite spinner. The snapshot reconciles it later.
    const cached = readCache();
    if (cached) {
        cachedData = cached;
        showApp(true);
        renderAll();
    } else {
        showApp(false);
        setText('gateStatusText', 'Loading your training log…');
        showGateView('gateLoading');
        startBootTimeout();
    }

    attachData(user.uid);
}

// Access is decided by the server, not here: if the rules reject the read we get
// an error callback, which is the signal that this account is not allowlisted.
function attachData(uid) {
    userRef = fb.db.ref('gymTracker/users/' + uid);
    dataBound = true;

    userRef.on('value', snapshot => {
        firstSnapshot = true;
        clearBootTimeout();

        const raw = snapshot.val();
        cachedData = normalizeRemote(raw);
        writeCache();

        showApp(true);
        renderAll();

        maybeImportLegacyData(raw);
    }, error => {
        clearBootTimeout();
        console.warn('Read rejected:', error && error.code);

        if (error && error.code === 'PERMISSION_DENIED') {
            renderDenied();
            showApp(false);
            showGateView('gateDenied');
        } else if (!firstSnapshot && !readCache()) {
            setText('gateStatusText', 'Could not load your log. Pull down to retry or reload.');
        }
    });
}

function detachData() {
    if (userRef && dataBound) userRef.off();
    userRef = null;
    dataBound = false;
    firstSnapshot = false;
    legacyChecked = false;
    clearBootTimeout();
}

let bootTimer = null;
function startBootTimeout() {
    clearBootTimeout();
    bootTimer = setTimeout(() => {
        if (!firstSnapshot) {
            setText('gateStatusText', 'Still connecting… check your network, or reload the page.');
        }
    }, BOOT_TIMEOUT_MS);
}
function clearBootTimeout() {
    if (bootTimer) { clearTimeout(bootTimer); bootTimer = null; }
}

function showApp(visible) {
    const app = document.getElementById('app');
    const gate = document.getElementById('gate');
    if (app) app.hidden = !visible;
    if (gate) gate.hidden = visible;

    // The gate is dark and the app is light. The class goes on <html> so the
    // dark background also covers mobile overscroll past the body.
    document.documentElement.classList.toggle('auth-mode', !visible);

    // Match the phone's status bar to whichever surface is showing; a white bar
    // above the dark login reads as a rendering bug when installed.
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', visible ? '#ffffff' : '#07080a');
}

function renderAll() {
    selectDay(currentDay);
    updateDashboard();
}

// `.info/connected` is readable regardless of the security rules.
function watchConnection() {
    fb.db.ref('.info/connected').on('value', snap => {
        const badge = document.getElementById('offlineBadge');
        if (badge) badge.hidden = snap.val() === true;
    });
}

// ==================== AUTH UI ====================

const AUTH_ERRORS = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'No account with that email yet — create one below.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/invalid-login-credentials': 'Wrong email or password.',
    'auth/missing-password': 'Enter your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute, then try again.',
    'auth/email-already-in-use': 'That email already has an account — sign in instead.',
    'auth/weak-password': 'Use at least 6 characters.',
    'auth/network-request-failed': 'No connection. Check your network and try again.',
    // The exact error you get if the provider was never switched on in the console.
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled for this Firebase project yet.',
    // The most common post-deploy failure: the Pages domain was never added to
    // Firebase Authentication > Settings > Authorized domains.
    'auth/unauthorized-domain': 'This web address is not in the Firebase authorised-domains list yet.'
};

function authMessage(err) {
    const code = err && err.code;
    return AUTH_ERRORS[code] || (err && err.message) || 'Something went wrong. Try again.';
}

function showGateView(id) {
    document.querySelectorAll('.gate-view').forEach(v => { v.hidden = v.id !== id; });
    document.querySelectorAll('.gate-error, .gate-ok').forEach(el => { el.hidden = true; });

    // Don't autofocus on touch devices — it throws up the keyboard unasked.
    if (!window.matchMedia('(pointer: coarse)').matches) {
        const input = document.querySelector('#' + id + ' input');
        if (input) input.focus();
    }
}

function showFieldError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    el.hidden = !message;
}

function busy(buttonId, isBusy, label) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.disabled = isBusy;
    if (label) btn.textContent = label;
}

function wireAuthUI() {
    const signIn = document.getElementById('gateSignIn');
    if (signIn) signIn.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('signInEmail').value.trim();
        const password = document.getElementById('signInPassword').value;
        if (!email || !password) return showFieldError('signInError', 'Enter your email and password.');

        showFieldError('signInError', '');
        busy('signInBtn', true, 'Signing in…');
        fb.auth.signInWithEmailAndPassword(email, password)
            .catch(err => showFieldError('signInError', authMessage(err)))
            .finally(() => busy('signInBtn', false, 'Sign in'));
    });

    const signUp = document.getElementById('gateSignUp');
    if (signUp) signUp.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('signUpEmail').value.trim();
        const password = document.getElementById('signUpPassword').value;
        const confirmPassword = document.getElementById('signUpConfirm').value;

        if (!email) return showFieldError('signUpError', 'Enter your email.');
        if (password.length < 6) return showFieldError('signUpError', 'Use at least 6 characters.');
        if (password !== confirmPassword) return showFieldError('signUpError', 'Those passwords do not match.');

        showFieldError('signUpError', '');
        busy('signUpBtn', true, 'Creating…');
        fb.auth.createUserWithEmailAndPassword(email, password)
            .catch(err => showFieldError('signUpError', authMessage(err)))
            .finally(() => busy('signUpBtn', false, 'Create account'));
    });

    const reset = document.getElementById('gateReset');
    if (reset) reset.addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value.trim();
        if (!email) return showFieldError('resetError', 'Enter your email.');

        showFieldError('resetError', '');
        busy('resetBtn', true, 'Sending…');
        fb.auth.sendPasswordResetEmail(email)
            .then(() => showFieldError('resetOk', 'Reset link sent. Check your inbox and spam folder.'))
            .catch(err => showFieldError('resetError', authMessage(err)))
            .finally(() => busy('resetBtn', false, 'Send reset link'));
    });

    const signOutBtn = document.getElementById('signOutBtn');
    if (signOutBtn) signOutBtn.addEventListener('click', () => fb.auth && fb.auth.signOut());

    const deniedSignOut = document.getElementById('deniedSignOut');
    if (deniedSignOut) deniedSignOut.addEventListener('click', () => fb.auth && fb.auth.signOut());

    const recheck = document.getElementById('recheckBtn');
    if (recheck) recheck.addEventListener('click', () => {
        if (!currentUser) return;
        busy('recheckBtn', true, 'Checking…');
        detachData();
        attachData(currentUser.uid);
        setTimeout(() => busy('recheckBtn', false, 'Check again'), 1200);
    });

    const copyUid = document.getElementById('copyUidBtn');
    if (copyUid) copyUid.addEventListener('click', () => {
        const uid = currentUser && currentUser.uid;
        if (!uid) return;
        const done = () => { copyUid.textContent = 'Copied'; setTimeout(() => { copyUid.textContent = 'Copy'; }, 1600); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(uid).then(done).catch(() => selectUidText());
        } else {
            selectUidText();
        }
    });
}

// Clipboard API needs a secure context; selecting the text is the fallback.
function selectUidText() {
    const code = document.getElementById('deniedUid');
    if (!code) return;
    const range = document.createRange();
    range.selectNodeContents(code);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

function renderDenied() {
    setText('deniedUid', (currentUser && currentUser.uid) || '—');
    setText('deniedEmail', currentUser && currentUser.email ? 'Signed in as ' + currentUser.email : '');
}

// ==================== HELPERS ====================

// Escape for HTML text and quoted-attribute contexts. Exercise names are
// free text, so anything interpolated into innerHTML goes through this.
function esc(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Read a design token so CSS stays the single source of truth for the palette.
function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
}

function withAlpha(hex, alpha) {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Parse a 'YYYY-MM-DD' key as local midnight. `new Date('2026-08-07')` is UTC,
// which renders as the previous day west of Greenwich.
function parseDateKey(key) {
    return new Date(String(key) + 'T00:00:00');
}

function toDateKey(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysAgoKey(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - days);
    return toDateKey(d);
}

function formatDate(key) {
    return parseDateKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Stat-tile values: 1,284 / 12.9K / 3.4M
function compactNumber(n) {
    if (!isFinite(n)) return '—';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
}

// Total reps for a log, tolerating older records that stored `reps` only.
function repsOf(log) {
    if (typeof log.totalReps === 'number') return log.totalReps;
    if (Array.isArray(log.sets) && log.sets.length) return log.sets.reduce((s, it) => s + (it.reps || 0), 0);
    if (typeof log.reps === 'number') return log.reps;
    return 0;
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
}

function setTodayDate() {
    const input = document.getElementById('sessionDate');
    if (input && !input.value) input.value = toDateKey(new Date());
}

function wireDashboardInputs() {
    // 'change' is the right event for a date input: it fires once the picker
    // commits a complete date, not on every partial keystroke.
    const dateInput = document.getElementById('sessionDate');
    if (dateInput) dateInput.addEventListener('change', handleSessionDateChange);

    const dayInput = document.getElementById('sessionDay');
    if (dayInput) {
        dayInput.value = dayInput.value || 1;
        dayInput.addEventListener('input', () => { updateExercisesToday(); populateExerciseSelect(); });
    }
    const sessionNumberInput = document.getElementById('sessionNumber');
    if (sessionNumberInput) {
        sessionNumberInput.value = sessionNumberInput.value || 1;
        sessionNumberInput.addEventListener('input', () => {
            updateExercisesToday();
            populateExerciseSelect();
            handleSessionNumberChange();
        });
    }
}

function initChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = cssVar('--sans', 'system-ui, sans-serif');
    Chart.defaults.font.size = 11;
    Chart.defaults.color = cssVar('--ink-muted', '#6b7280');
}

// ==================== DATA MANAGEMENT ====================

// The synchronous read surface every render function uses. `logs` stays an array
// here even though it is stored keyed, so no rendering code had to change; each
// entry carries the Firebase key as `id` so it can be written individually.
let cachedData = { schedule: {}, logs: [] };

function loadAllData() {
    return cachedData;
}

function getScheduleData() {
    return loadAllData().schedule || {};
}

function getLogsData() {
    return loadAllData().logs || [];
}

// Cache is per-account: a single shared key would let two friends on one phone
// read each other's data straight out of localStorage.
function storageKey() {
    return currentUser ? 'gymTrackerData:' + currentUser.uid : null;
}

function readCache() {
    const key = storageKey();
    if (!key) return null;
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return { schedule: parsed.schedule || {}, logs: Array.isArray(parsed.logs) ? parsed.logs : [] };
    } catch (err) {
        console.warn('Could not read local cache:', err);
        return null;
    }
}

function writeCache() {
    const key = storageKey();
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(cachedData));
    } catch (err) {
        console.warn('Could not write local cache:', err);
    }
}

// Firebase returns `logs` as a keyed object; older data may arrive as an array,
// and a schedule day can come back keyed if it was ever written sparsely.
function normalizeRemote(raw) {
    const out = { schedule: {}, logs: [] };
    if (!raw || typeof raw !== 'object') return out;

    const schedule = raw.schedule || {};
    Object.keys(schedule).forEach(dayKey => {
        const value = schedule[dayKey];
        if (Array.isArray(value)) {
            out.schedule[dayKey] = value.filter(Boolean);
        } else if (value && typeof value === 'object') {
            out.schedule[dayKey] = Object.keys(value).map(k => value[k]).filter(Boolean);
        }
    });

    const logs = raw.logs;
    if (Array.isArray(logs)) {
        logs.forEach((log, i) => { if (log) out.logs.push(Object.assign({ id: String(i) }, log)); });
    } else if (logs && typeof logs === 'object') {
        Object.keys(logs).forEach(k => { if (logs[k]) out.logs.push(Object.assign({ id: k }, logs[k])); });
    }

    return out;
}

// A chronologically-sortable key, generated client-side without touching the network.
function newLogId() {
    if (userRef) {
        try { return userRef.child('logs').push().key; } catch (err) { /* fall through */ }
    }
    return 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Scoped multi-path write. Nothing here sends the whole tree, so an incoming
// snapshot can no longer be overwritten by a stale local copy — which is what
// made the previous `set()` on every save lose data.
function pushUpdate(updates) {
    if (!userRef) return Promise.resolve();
    return userRef.update(updates).catch(err => {
        // A rejection is a real problem (denied or invalid). Network drops don't
        // reject — the SDK queues the write and replays it on reconnect.
        console.error('Save rejected:', err);
        const code = (err && err.code) || '';
        if (String(code).toUpperCase().indexOf('PERMISSION') !== -1) {
            alert('Could not save: this account does not have write access yet.');
        } else {
            alert('Could not save: ' + ((err && err.message) || code || 'unknown error'));
        }
    });
}

function saveScheduleDay(dayNumber, exercises) {
    const dayKey = 'day' + dayNumber;
    if (!cachedData.schedule) cachedData.schedule = {};
    cachedData.schedule[dayKey] = exercises;
    writeCache();
    // Firebase deletes empty arrays anyway; null states the intent.
    return pushUpdate({ ['schedule/' + dayKey]: exercises.length ? exercises : null });
}

// One-time offer to carry over data written before sign-in existed.
function maybeImportLegacyData(remoteRaw) {
    if (legacyChecked) return;
    legacyChecked = true;

    const remoteEmpty = !remoteRaw || (!remoteRaw.schedule && !remoteRaw.logs);
    if (!remoteEmpty) return;

    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return;

    let legacy;
    try { legacy = JSON.parse(raw); } catch (err) { return; }

    const days = Object.keys((legacy && legacy.schedule) || {});
    const logs = (legacy && Array.isArray(legacy.logs)) ? legacy.logs : [];
    if (!days.length && !logs.length) { localStorage.removeItem(LEGACY_STORAGE_KEY); return; }

    const ok = confirm(
        'Found data saved on this device from before sign-in was added '
        + '(' + days.length + ' training day(s), ' + logs.length + ' session(s)).\n\n'
        + 'Import it into this account?'
    );
    if (!ok) { localStorage.removeItem(LEGACY_STORAGE_KEY); return; }

    const updates = {};
    days.forEach(dayKey => {
        const list = legacy.schedule[dayKey];
        if (Array.isArray(list) && list.length) updates['schedule/' + dayKey] = list;
    });
    logs.forEach(log => {
        if (!log || !log.date || !log.exercise) return;
        updates['logs/' + newLogId()] = sanitizeLog(log);
    });

    if (!Object.keys(updates).length) { localStorage.removeItem(LEGACY_STORAGE_KEY); return; }
    pushUpdate(updates).then(() => localStorage.removeItem(LEGACY_STORAGE_KEY));
}

// The stored shape is pinned by .validate in database.rules.json — extra keys are
// rejected, so `id` (a client-side convenience) must never be written.
function sanitizeLog(log) {
    const sets = (Array.isArray(log.sets) ? log.sets : [])
        .map(s => ({ reps: parseInt(s && s.reps) || 0 }))
        .filter(s => s.reps > 0);

    const clean = {
        exercise: String(log.exercise),
        date: String(log.date),
        sessionNumber: parseInt(log.sessionNumber) || 1,
        sets: sets,
        totalReps: sets.length ? sets.reduce((s, it) => s + it.reps, 0) : repsOf(log)
    };
    const day = parseInt(log.day);
    if (!isNaN(day)) clean.day = day;
    if (log.sessionName) clean.sessionName = String(log.sessionName);
    const weight = parseFloat(log.weight);
    if (!isNaN(weight)) clean.weight = weight;
    return clean;
}

// ==================== TAB SWITCHING ====================

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });

    // Remove active class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(tabName).classList.add('active');

    // Add active class to clicked button
    if (event && event.target) {
        event.target.classList.add('active');
    }

    // Update dashboard when switching to it
    if (tabName === 'dashboard') {
        updateDashboard();
    }
}

// Chart / table view switch inside the progression card
function switchChartView(view) {
    const isTable = view === 'table';
    document.getElementById('viewChart').hidden = isTable;
    document.getElementById('viewTable').hidden = !isTable;
    document.getElementById('viewChartBtn').classList.toggle('active', !isTable);
    document.getElementById('viewTableBtn').classList.toggle('active', isTable);
    if (isTable) {
        renderHistoryTable();
    } else {
        updateCharts();
    }
}

// ==================== PLANNER FUNCTIONALITY ====================

function selectDay(dayNumber) {
    currentDay = dayNumber;

    // Update active button
    document.querySelectorAll('.day-btn').forEach((btn, idx) => {
        if (idx + 1 === dayNumber) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update title
    document.getElementById('selectedDayName').textContent = `Day ${dayNumber}`;

    // Display exercises for this day
    displayExercisesForDay(dayNumber);
}

function addExerciseToDay() {
    const input = document.getElementById('exerciseName');
    const exerciseName = input.value.trim();

    if (!exerciseName) {
        alert('Please enter an exercise name');
        return;
    }

    const schedule = getScheduleData();
    const dayKey = `day${currentDay}`;
    const exercises = (schedule[dayKey] || []).slice();

    exercises.push({ name: exerciseName, id: Date.now() });

    saveScheduleDay(currentDay, exercises);
    input.value = '';
    displayExercisesForDay(currentDay);
    populateExerciseSelect();
}

function displayExercisesForDay(dayNumber) {
    const schedule = getScheduleData();
    const dayKey = `day${dayNumber}`;
    const exercises = schedule[dayKey] || [];

    const container = document.getElementById('exercisesList');

    if (exercises.length === 0) {
        container.innerHTML = `
            <p class="empty-state">
                <svg class="icon" aria-hidden="true"><use href="#i-list"/></svg>
                Nothing planned for this day yet. Add your first exercise above.
            </p>`;
        return;
    }

    container.innerHTML = exercises.map((exercise, idx) => `
        <div class="exercise-item">
            <div class="exercise-main">
                <span class="exercise-meta">${idx + 1}</span>
                <span class="exercise-name">${esc(exercise.name)}</span>
            </div>
            <button class="icon-btn" type="button" aria-label="Delete ${esc(exercise.name)}"
                    onclick="deleteExercise(${currentDay}, ${exercise.id})">
                <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
            </button>
        </div>
    `).join('');
}

function deleteExercise(day, exerciseId) {
    const schedule = getScheduleData();
    const dayKey = `day${day}`;
    const exercises = (schedule[dayKey] || []).filter(ex => ex.id !== exerciseId);

    saveScheduleDay(day, exercises);
    displayExercisesForDay(day);
    populateExerciseSelect();
}

// ==================== DASHBOARD FUNCTIONALITY ====================

function updateDashboard() {
    renderStats();
    updateExercisesToday();
    populateExerciseSelect();
    updateCharts(); // also refreshes the table twin
}

function updateExercisesToday() {
    const sessionDate = document.getElementById('sessionDate').value;
    const sessionDay = parseInt(document.getElementById('sessionDay').value) || 1;
    const sessionNumber = parseInt(document.getElementById('sessionNumber').value) || 1;
    const logs = getLogsData();

    const schedule = getScheduleData();
    const dayKey = `day${sessionDay}`;
    const exercises = schedule[dayKey] || [];

    const container = document.getElementById('exercisesToday');

    if (!exercises || exercises.length === 0) {
        container.innerHTML = `
            <p class="empty-state">
                <svg class="icon" aria-hidden="true"><use href="#i-list"/></svg>
                No exercises planned for day ${sessionDay}. Add some in the Planner.
            </p>`;
        return;
    }

    container.innerHTML = exercises.map(exercise => {
        const exerciseName = exercise.name;
        // Scoped by session number too — otherwise logging session 1 marked
        // session 2 as already done.
        const sessionLogs = logs.filter(log =>
            log.date === sessionDate &&
            log.exercise === exerciseName &&
            (parseInt(log.sessionNumber) || 1) === sessionNumber
        );
        const completed = sessionLogs.length > 0;
        const totalReps = completed ? repsOf(sessionLogs[0]) : 0;
        // The name rides in a data attribute so quotes in it can't break the handler.
        return `
            <div class="exercise-item is-clickable ${completed ? 'completed' : ''}"
                 data-exercise="${esc(exerciseName)}"
                 onclick="selectExerciseForLogging(this.dataset.exercise, '${sessionDate}', ${sessionDay}, ${sessionNumber})">
                <div class="exercise-main">
                    <svg class="status-icon" aria-hidden="true"><use href="#i-${completed ? 'check' : 'circle'}"/></svg>
                    <span class="exercise-name">${esc(exerciseName)}</span>
                </div>
                <span class="exercise-meta">${completed ? totalReps + ' reps' : 'Not logged'}</span>
            </div>
        `;
    }).join('');
}

function selectExerciseForLogging(exerciseName, date, dayNumber, sessionNumber) {
    currentExerciseForLogging = { name: exerciseName, date: date, day: dayNumber, sessionNumber: sessionNumber };

    // Show log form
    document.getElementById('logForm').hidden = false;
    setText('logFormTitle', exerciseName);

    // Populate session day & number inputs
    const dayInput = document.getElementById('sessionDay');
    if (dayInput) dayInput.value = dayNumber || dayInput.value;
    const sessionNumberInput = document.getElementById('sessionNumber');
    if (sessionNumberInput) sessionNumberInput.value = sessionNumber || sessionNumberInput.value;

    loadLogIntoForm(date, exerciseName, sessionNumber);
}

// The single answer to "what should the form show for this date/exercise/session".
// Used on first open AND whenever the date or session number changes underneath
// an already-open form. Previously this logic was duplicated, which is exactly
// why the date path never got it: changing the date left the previous day's
// sets on screen.
function loadLogIntoForm(date, exerciseName, sessionNumber) {
    const wanted = parseInt(sessionNumber) || 1;
    const existing = getLogsData().find(log =>
        log.date === date &&
        log.exercise === exerciseName &&
        (parseInt(log.sessionNumber) || 1) === wanted
    );

    if (existing) {
        renderSetsForLog(existing.sets || []);
        document.getElementById('overallWeight').value = (typeof existing.weight === 'number') ? existing.weight : '';
        document.getElementById('sessionName').value = existing.sessionName || '';
        setText('logMessage', `Showing your saved session for ${formatDate(date)}.`);
    } else {
        renderSetsForLog([]); // one empty row
        document.getElementById('overallWeight').value = '';
        document.getElementById('sessionName').value = '';
        setText('logMessage', `Nothing logged for ${formatDate(date)} yet.`);
    }

    // Deleting only makes sense when there is something saved to delete.
    const deleteBtn = document.getElementById('deleteLogBtn');
    if (deleteBtn) deleteBtn.hidden = !existing;

    return !!existing;
}

// Removes a whole logged session. Without this there is no way to take a session
// back out of the progress charts: clearing every set row and saving is refused
// (a session needs at least one set), so the old numbers would stay forever.
function deleteLoggedSession() {
    if (!currentExerciseForLogging || !currentExerciseForLogging.name) return;

    const date = document.getElementById('sessionDate').value;
    const sessionNumber = parseInt(document.getElementById('sessionNumber').value) || 1;
    const name = currentExerciseForLogging.name;

    const index = cachedData.logs.findIndex(log =>
        log.date === date &&
        log.exercise === name &&
        (parseInt(log.sessionNumber) || 1) === sessionNumber
    );
    if (index === -1) return;

    const log = cachedData.logs[index];
    const confirmed = confirm(
        `Delete the logged session for ${name} on ${formatDate(date)}?\n\n`
        + 'It will be removed from your totals, charts and history.'
    );
    if (!confirmed) return;

    cachedData.logs.splice(index, 1);
    writeCache();
    // null at the log's own path — a scoped delete, not a rewrite of the list.
    pushUpdate({ ['logs/' + log.id]: null });

    document.getElementById('logForm').hidden = true;
    currentExerciseForLogging = null;

    // Everything that derives from logs has to be recomputed, not just the list.
    updateExercisesToday();
    renderStats();
    populateExerciseSelect();
    updateCharts();   // also refreshes the table twin
}

// Changing the date must re-point the open form at the new day, not just
// relabel it. Without re-pointing, a save went to the previously selected date
// and silently overwrote it.
function handleSessionDateChange() {
    const date = document.getElementById('sessionDate').value;
    if (!date) return;

    updateExercisesToday();   // refresh the logged/not-logged markers for the new day

    if (!currentExerciseForLogging || !currentExerciseForLogging.name) return;
    currentExerciseForLogging.date = date;
    loadLogIntoForm(date, currentExerciseForLogging.name, currentExerciseForLogging.sessionNumber);
}

function logExercise() {
    if (!currentExerciseForLogging) return;

    // Collect session day
    const sessionDay = parseInt(document.getElementById('sessionDay').value) || null;

    // Collect sets
    const sets = [];
    document.querySelectorAll('#setsLogContainer .set-row').forEach(row => {
        const repsInput = row.querySelector('.set-reps');
        const reps = parseInt(repsInput.value);
        if (!isNaN(reps) && reps > 0) {
            sets.push({ reps: reps });
        }
    });

    if (sets.length === 0) {
        alert('Please add at least one set with valid reps');
        return;
    }

    const weight = parseFloat(document.getElementById('overallWeight').value);
    const sessionNameValue = document.getElementById('sessionName').value.trim();

    // Read the date and session number from the visible inputs, not from the
    // values captured when the row was tapped. Anything else risks saving to
    // whatever was selected earlier — which is how editing after changing the
    // date silently overwrote the wrong day.
    const curSessionNumber = parseInt(document.getElementById('sessionNumber').value) || 1;
    const curDate = document.getElementById('sessionDate').value || currentExerciseForLogging.date;

    const newLog = sanitizeLog({
        exercise: currentExerciseForLogging.name,
        date: curDate,
        day: sessionDay,
        sessionNumber: curSessionNumber,
        sessionName: sessionNameValue || null,
        sets: sets,
        weight: isNaN(weight) ? null : weight
    });

    // Reuse the existing key for this exercise/date/session so re-logging updates
    // in place instead of leaving an orphan behind.
    const logs = getLogsData();
    const existing = logs.find(log =>
        log.date === newLog.date &&
        log.exercise === newLog.exercise &&
        (parseInt(log.sessionNumber) || 1) === curSessionNumber
    );
    const logId = existing ? existing.id : newLogId();

    if (existing) {
        Object.keys(existing).forEach(k => { if (k !== 'id') delete existing[k]; });
        Object.assign(existing, newLog);
    } else {
        cachedData.logs.push(Object.assign({ id: logId }, newLog));
    }
    writeCache();
    pushUpdate({ ['logs/' + logId]: newLog });

    // Keep the tracked selection pointing at what was just written.
    currentExerciseForLogging.date = curDate;
    currentExerciseForLogging.sessionNumber = curSessionNumber;

    // There is now a saved session here, so it can be deleted.
    const deleteBtn = document.getElementById('deleteLogBtn');
    if (deleteBtn) deleteBtn.hidden = false;

    // Compare with next session for the same exercise (chronological)
    const comparison = compareWithNextSession(Object.assign({ id: logId }, newLog), getLogsData());

    // Refresh UI
    updateExercisesToday();
    renderStats();
    populateExerciseSelect();
    updateCharts();

    document.getElementById('logMessage').textContent = 'Saved. ' + (comparison || 'No next session to compare.');
    setTimeout(() => {
        document.getElementById('logForm').hidden = true;
    }, 800);
}

// ----------------- Sets UI Helpers -----------------
function setupSetsLogUI() {
    const addBtn = document.getElementById('addSetLogBtn');
    if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); addSetLogRow(); });

    const saveBtn = document.getElementById('saveLogBtn');
    if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); logExercise(); });

    const deleteBtn = document.getElementById('deleteLogBtn');
    if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.preventDefault(); deleteLoggedSession(); });

    // Ensure at least one set row exists
    renderSetsForLog([]);
}

function addSetLogRow(reps) {
    const container = document.getElementById('setsLogContainer');
    const idx = container.querySelectorAll('.set-row').length + 1;
    const row = document.createElement('div');
    row.className = 'set-row';

    const label = document.createElement('div');
    label.className = 'set-label';
    label.textContent = `Set ${idx}`;

    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.min = '1';
    // Numeric keypad on phones instead of the full keyboard.
    repsInput.inputMode = 'numeric';
    repsInput.placeholder = 'Reps';
    repsInput.className = 'set-reps';
    repsInput.value = reps || '';
    repsInput.addEventListener('input', updateTotalFromUI);
    repsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            logExercise();
        }
    });

    // Trash rather than a bare ×: × reads as "close/dismiss", trash reads as
    // "delete this row", which is what it does.
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn set-remove';
    removeBtn.setAttribute('aria-label', `Delete set ${idx}`);
    removeBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>';
    removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        row.remove();
        updateSetRowControls();
        updateTotalFromUI();
    });

    row.appendChild(label);
    row.appendChild(repsInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
    updateSetRowControls();
    updateTotalFromUI();
}

function renderSetsForLog(setsArray) {
    const container = document.getElementById('setsLogContainer');
    container.innerHTML = '';
    if (!setsArray || setsArray.length === 0) {
        addSetLogRow();
        return;
    }
    setsArray.forEach(s => addSetLogRow(s.reps));
    updateSetRowControls();
}

// Renumbers rows after a deletion and keeps the delete buttons honest: a saved
// session must have at least one set, so the last remaining row can't be
// deleted. Disabling it says so, rather than letting the tap fail silently or
// leaving an empty form with nothing to fill in.
function updateSetRowControls() {
    const rows = document.querySelectorAll('#setsLogContainer .set-row');
    const onlyOne = rows.length <= 1;

    rows.forEach((row, i) => {
        const label = row.querySelector('.set-label');
        if (label) label.textContent = `Set ${i + 1}`;

        const removeBtn = row.querySelector('.set-remove');
        if (removeBtn) {
            removeBtn.setAttribute('aria-label', `Delete set ${i + 1}`);
            removeBtn.disabled = onlyOne;
            removeBtn.title = onlyOne ? 'A session needs at least one set' : `Delete set ${i + 1}`;
        }
    });
}

function updateTotalFromUI() {
    const total = computeTotalRepsFromLogRows();
    const el = document.getElementById('totalRepsDisplay');
    if (el) el.textContent = `Total reps: ${total}`;
}

function handleSessionNumberChange() {
    const sessionNumber = parseInt(document.getElementById('sessionNumber').value) || 1;

    // If a specific exercise is open for logging, load that session's saved log (if any), otherwise clear form
    if (!currentExerciseForLogging || !currentExerciseForLogging.name) {
        // nothing to load
        return;
    }

    // Re-point the form at the new session. This was missing too: it loaded
    // session 2's sets but a save still went to session 1.
    currentExerciseForLogging.sessionNumber = sessionNumber;
    loadLogIntoForm(currentExerciseForLogging.date, currentExerciseForLogging.name, sessionNumber);
}

function computeTotalRepsFromLogRows() {
    let total = 0;
    document.querySelectorAll('#setsLogContainer .set-row .set-reps').forEach(inp => {
        const v = parseInt(inp.value);
        if (!isNaN(v) && v > 0) total += v;
    });
    return total;
}

// ----------------- Comparison -----------------
function compareWithNextSession(currentLog, allLogs) {
    // Find logs for same exercise and sort by date
    const same = allLogs.filter(l => l.exercise === currentLog.exercise).sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
    const idx = same.findIndex(l => l.date === currentLog.date && (l.totalReps === currentLog.totalReps || JSON.stringify(l.sets) === JSON.stringify(currentLog.sets)));
    if (idx === -1) return null;

    const next = same[idx + 1];
    if (!next) return null;

    const diff = next.totalReps - currentLog.totalReps;
    if (diff > 0) return `Next session (on ${next.date}) is +${diff} reps compared to this session.`;
    if (diff < 0) return `Next session (on ${next.date}) is ${diff} reps (fewer) compared to this session.`;
    return `Next session (on ${next.date}) has the same total reps.`;
}

// ==================== SUMMARY STATS ====================

// A "session" is one date + session number, regardless of how many
// exercises were logged inside it.
function sessionKeyOf(log) {
    return `${log.date}|${parseInt(log.sessionNumber) || 1}`;
}

function deltaMarkup(diff, suffix, period) {
    if (!diff) return `No change vs ${period}`;
    const up = diff > 0;
    // Icon + label, so direction never rests on colour alone.
    return `<span class="${up ? 'up' : 'down'}">`
        + `<svg class="icon" aria-hidden="true"><use href="#i-${up ? 'up' : 'down'}"/></svg>`
        + `${up ? '+' : '−'}${compactNumber(Math.abs(diff))}${suffix}</span> vs ${period}`;
}

// Consecutive Monday-based weeks with at least one logged session, counted
// back from this week (or last week, so a fresh week doesn't read as broken).
function trainingStreakWeeks(logs) {
    const weeks = new Set();
    logs.forEach(log => {
        const d = parseDateKey(log.date);
        if (isNaN(d)) return;
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        weeks.add(toDateKey(d));
    });
    if (weeks.size === 0) return 0;

    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    cursor.setDate(cursor.getDate() - ((cursor.getDay() + 6) % 7));
    if (!weeks.has(toDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 7); // allow the current week to still be empty
        if (!weeks.has(toDateKey(cursor))) return 0;
    }

    let streak = 0;
    while (weeks.has(toDateKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 7);
    }
    return streak;
}

function renderStats() {
    const logs = getLogsData();

    if (logs.length === 0) {
        ['statSessions', 'statReps', 'statBest', 'statStreak'].forEach(id => setText(id, '—'));
        setText('statSessionsFoot', 'Nothing logged yet');
        setText('statRepsFoot', 'Nothing logged yet');
        setText('statBestFoot', 'Nothing logged yet');
        setText('statStreakFoot', 'Nothing logged yet');
        return;
    }

    const weekStart = daysAgoKey(6);   // today inclusive = last 7 days
    const prevStart = daysAgoKey(13);
    const inThisWeek = log => log.date >= weekStart;
    const inPrevWeek = log => log.date >= prevStart && log.date < weekStart;

    // Sessions
    const sessions = new Set(logs.map(sessionKeyOf));
    const thisWeekSessions = new Set(logs.filter(inThisWeek).map(sessionKeyOf)).size;
    setText('statSessions', compactNumber(sessions.size));
    setHTML('statSessionsFoot', thisWeekSessions
        ? `<span class="up"><svg class="icon" aria-hidden="true"><use href="#i-up"/></svg>${thisWeekSessions}</span> in the last 7 days`
        : 'None in the last 7 days');

    // Total reps
    const totalReps = logs.reduce((s, l) => s + repsOf(l), 0);
    const thisWeekReps = logs.filter(inThisWeek).reduce((s, l) => s + repsOf(l), 0);
    const prevWeekReps = logs.filter(inPrevWeek).reduce((s, l) => s + repsOf(l), 0);
    setText('statReps', compactNumber(totalReps));
    setHTML('statRepsFoot', deltaMarkup(thisWeekReps - prevWeekReps, ' reps', 'previous week'));

    // Best single set
    let best = null;
    logs.forEach(log => {
        (Array.isArray(log.sets) ? log.sets : []).forEach(s => {
            if (typeof s.reps === 'number' && (!best || s.reps > best.reps)) {
                best = { reps: s.reps, exercise: log.exercise, date: log.date };
            }
        });
    });
    if (best) {
        setHTML('statBest', `${best.reps}<span class="unit">reps</span>`);
        setText('statBestFoot', `${best.exercise} · ${formatDate(best.date)}`);
    } else {
        setText('statBest', '—');
        setText('statBestFoot', 'No sets recorded');
    }

    // Streak
    const streak = trainingStreakWeeks(logs);
    setHTML('statStreak', streak ? `${streak}<span class="unit">${streak === 1 ? 'week' : 'weeks'}</span>` : '0');
    setText('statStreakFoot', streak ? 'Consecutive weeks trained' : 'No recent activity');
}

// ==================== PROGRESSION ====================

function populateExerciseSelect() {
    // Show only exercises planned for the selected session day (not every exercise in logs)
    const sessionDay = parseInt(document.getElementById('sessionDay').value) || 1;
    const schedule = getScheduleData();
    const dayKey = `day${sessionDay}`;
    const exercises = schedule[dayKey] || [];

    const select = document.getElementById('exerciseSelect');
    const currentValue = select.value;

    if (!exercises || exercises.length === 0) {
        select.innerHTML = '<option value="">No exercises for selected day</option>';
        return;
    }

    select.innerHTML = '<option value="">Choose an exercise</option>' +
        exercises.map(ex => `<option value="${esc(ex.name)}">${esc(ex.name)}</option>`).join('');

    // Restore previous selection if it still exists in today's plan
    if (exercises.some(e => e.name === currentValue)) {
        select.value = currentValue;
    }
}

// Logs for the current filter, oldest first (sessions on one date ordered by number)
function logsForSelectedExercise() {
    const selected = document.getElementById('exerciseSelect').value;
    return getLogsData()
        .filter(log => !selected || log.exercise === selected)
        .sort((a, b) => {
            const delta = parseDateKey(a.date) - parseDateKey(b.date);
            if (delta !== 0) return delta;
            return (parseInt(a.sessionNumber) || 1) - (parseInt(b.sessionNumber) || 1);
        });
}

function sessionLabel(log) {
    const num = log.sessionNumber ? `#${log.sessionNumber}` : '#1';
    return log.sessionName ? `${num} · ${log.sessionName}` : num;
}

function destroyCharts() {
    if (repsChart) { repsChart.destroy(); repsChart = null; }
    if (weightChart) { weightChart.destroy(); weightChart = null; }
}

// Shared chart chrome: recessive hairline grid, muted ticks, no legend
// (single series — the caption names it), crosshair-style shared tooltip.
function lineChartOptions(valueLabel, integersOnly) {
    const ink = cssVar('--ink-2', '#4b5563');
    const muted = cssVar('--ink-muted', '#6b7280');
    const grid = cssVar('--grid', '#eef0f3');
    const line = cssVar('--line', '#e5e7eb');

    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 4, right: 6 } },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#ffffff',
                titleColor: cssVar('--ink', '#111827'),
                bodyColor: ink,
                borderColor: line,
                borderWidth: 1,
                padding: 10,
                cornerRadius: 8,
                displayColors: false,
                titleFont: { size: 12, weight: '600' },
                bodyFont: { size: 12 },
                callbacks: {
                    label: ctx => ctx.raw == null ? 'Not recorded' : `${valueLabel}: ${ctx.raw}`
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                border: { color: line },
                ticks: { color: muted, font: { size: 11 }, maxRotation: 0, autoSkipPadding: 12 }
            },
            y: {
                beginAtZero: true,
                grid: { color: grid, drawTicks: false },
                border: { display: false },
                ticks: {
                    color: muted,
                    font: { size: 11 },
                    padding: 8,
                    maxTicksLimit: 6,        // keep the grid recessive
                    precision: integersOnly ? 0 : undefined
                }
            }
        }
    };
}

function seriesStyle(color) {
    return {
        borderColor: color,
        backgroundColor: withAlpha(color, 0.1),   // area wash, never a saturated block
        borderWidth: 2,
        tension: 0.25,
        fill: true,
        spanGaps: true,
        pointRadius: 4,                            // 8px mark
        pointHoverRadius: 6,
        pointBackgroundColor: color,
        pointBorderColor: cssVar('--card', '#ffffff'),
        pointBorderWidth: 2,                       // 2px surface ring
        pointHitRadius: 14                          // generous hit target
    };
}

function updateCharts() {
    const selectedExercise = document.getElementById('exerciseSelect').value;
    const grid = document.querySelector('.charts-grid');
    const empty = document.getElementById('chartEmpty');

    const showEmpty = (message) => {
        destroyCharts();
        if (grid) grid.classList.add('hide');
        if (empty) empty.classList.add('show');
        setText('chartEmptyText', message);
    };

    renderHistoryTable();

    if (!selectedExercise) {
        showEmpty('Select an exercise to see its progression.');
        return;
    }

    const exerciseLogs = logsForSelectedExercise();
    if (exerciseLogs.length === 0) {
        showEmpty(`No sessions logged for ${selectedExercise} yet.`);
        return;
    }

    if (grid) grid.classList.remove('hide');
    if (empty) empty.classList.remove('show');

    const labels = exerciseLogs.map(log => {
        const num = log.sessionNumber && log.sessionNumber > 1 ? ` #${log.sessionNumber}` : '';
        return `${formatDate(log.date)}${num}`;
    });
    const repsData = exerciseLogs.map(repsOf);
    const weightData = exerciseLogs.map(log => (typeof log.weight === 'number' ? log.weight : null));

    destroyCharts();

    repsChart = new Chart(document.getElementById('repsChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [Object.assign({ label: 'Total reps', data: repsData }, seriesStyle(cssVar('--series-1', '#4f46e5')))]
        },
        options: lineChartOptions('Total reps', true)
    });

    weightChart = new Chart(document.getElementById('weightChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [Object.assign({ label: 'Weight (kg)', data: weightData }, seriesStyle(cssVar('--series-2', '#eb6834')))]
        },
        options: lineChartOptions('Weight (kg)', false)
    });
}

// The table twin: every plotted value is also readable as text.
function renderHistoryTable() {
    const body = document.getElementById('historyBody');
    if (!body) return;

    const rows = logsForSelectedExercise().slice().reverse(); // newest first

    // When the filter already names the exercise, the column just repeats that
    // one value on every row — pure noise, and on a phone it is the difference
    // between the table fitting and being scrolled sideways.
    const showExercise = !document.getElementById('exerciseSelect').value;
    const header = document.getElementById('thExercise');
    if (header) header.hidden = !showExercise;

    if (rows.length === 0) {
        body.innerHTML = `<tr><td colspan="${showExercise ? 6 : 5}" class="empty-cell">No sessions logged yet.</td></tr>`;
        return;
    }

    body.innerHTML = rows.map(log => {
        const sets = (Array.isArray(log.sets) ? log.sets : []).map(s => s.reps).join(' / ') || '—';
        const weight = typeof log.weight === 'number' ? `${log.weight} kg` : '—';
        return `
            <tr>
                <td>${esc(formatDate(log.date))}</td>
                ${showExercise ? `<td>${esc(log.exercise)}</td>` : ''}
                <td>${esc(sessionLabel(log))}</td>
                <td>${esc(sets)}</td>
                <td class="num">${repsOf(log)}</td>
                <td class="num">${esc(weight)}</td>
            </tr>`;
    }).join('');
}

// ==================== PWA ====================

// How a deploy reaches an already-installed app.
//
// The new worker installs and then sits in "waiting" (sw.js deliberately does
// not call skipWaiting). We surface that as a banner; the reload happens only
// when the user taps Update, so the app can never swap out mid-set. Ignore it
// and the new version applies on the next cold start anyway.
function showUpdateBanner(worker) {
    const banner = document.getElementById('updateBanner');
    const button = document.getElementById('updateBtn');
    const dismiss = document.getElementById('updateDismiss');
    if (!banner || !button || !worker) return;

    banner.hidden = false;
    document.body.classList.add('has-update');

    button.onclick = () => {
        button.disabled = true;
        button.textContent = 'Updating…';
        // Tells the waiting worker to take over; controllerchange then reloads.
        worker.postMessage('SKIP_WAITING');
    };

    if (dismiss) dismiss.onclick = () => {
        banner.hidden = true;
        document.body.classList.remove('has-update');
    };
}

function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;   // controllerchange can fire more than once
        reloading = true;
        window.location.reload();
    });

    window.addEventListener('load', () => {
        // Relative path on purpose: GitHub Pages serves this from /<repo>/, so an
        // absolute '/sw.js' would 404 and the scope would be wrong.
        navigator.serviceWorker.register('sw.js').then(registration => {
            // A worker left waiting by an earlier visit. The controller check
            // distinguishes an update from a very first install — on a first
            // install there is nothing to update *from*, so no banner.
            if (registration.waiting && navigator.serviceWorker.controller) {
                showUpdateBanner(registration.waiting);
            }

            registration.addEventListener('updatefound', () => {
                const incoming = registration.installing;
                if (!incoming) return;
                incoming.addEventListener('statechange', () => {
                    if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateBanner(incoming);
                    }
                });
            });

            // Installed apps can stay open for days, so poll, and re-check
            // whenever the app is brought back to the foreground.
            const check = () => registration.update().catch(() => {});
            setInterval(check, 60 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') check();
            });
        }).catch(err => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

initServiceWorker();
