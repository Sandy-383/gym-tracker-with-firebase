let currentDay = 1;
let currentExerciseForLogging = null;
let repsChart = null;
let weightChart = null;
let useFirebase = false; // Will be set to true if Firebase is initialized

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    // Check if Firebase is available
    if (typeof db !== 'undefined') {
        useFirebase = true;
        console.log('Firebase initialized - using cloud storage');
    } else {
        useFirebase = false;
        console.log('Firebase not available - using browser storage');
    }

    // Initialize cache from localStorage/Firebase
    initializeCache();

    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('sessionDate').value = today;
    // Default session day & number
    const dayInput = document.getElementById('sessionDay');
    if (dayInput) dayInput.value = 1;
    const sessionNumberInput = document.getElementById('sessionNumber');
    if (sessionNumberInput) sessionNumberInput.value = 1;

    // Setup sets log UI
    setupSetsLogUI();
    // Update exercises and exercise selector when session day or session number changes
    if (dayInput) dayInput.addEventListener('input', () => { updateExercisesToday(); populateExerciseSelect(); });
    if (sessionNumberInput) sessionNumberInput.addEventListener('input', () => { updateExercisesToday(); populateExerciseSelect(); handleSessionNumberChange(); });

    // Initialize planners
    selectDay(1);
    updateDashboard();
});

// ==================== DATA MANAGEMENT ====================

let cachedData = { schedule: {}, logs: [] };

function getStorageKey() {
    return 'gymTrackerData';
}

function loadAllData() {
    // Always use cached data for synchronous operations
    return cachedData;
}

function saveAllData(data) {
    // Update cache
    cachedData = JSON.parse(JSON.stringify(data));
    
    // Always save to localStorage as backup
    localStorage.setItem(getStorageKey(), JSON.stringify(data));
    
    // Also save to Firebase if available
    if (useFirebase && typeof db !== 'undefined') {
        db.ref('gymTracker').set(data).catch(err => {
            console.log('Firebase save error (data still saved locally):', err);
        });
    }
}

// Initialize cache from localStorage on load
function initializeCache() {
    const stored = localStorage.getItem(getStorageKey());
    if (stored) {
        cachedData = JSON.parse(stored);
    }
    
    // Also load from Firebase if available
    if (useFirebase && typeof db !== 'undefined') {
        db.ref('gymTracker').once('value', (snapshot) => {
            const firebaseData = snapshot.val();
            if (firebaseData) {
                cachedData = firebaseData;
                localStorage.setItem(getStorageKey(), JSON.stringify(firebaseData));
            }
        });
    }
}

function getScheduleData() {
    const data = loadAllData();
    return data.schedule || {};
}

function saveScheduleData(schedule) {
    const data = loadAllData();
    data.schedule = schedule;
    saveAllData(data);
}

function getLogsData() {
    const data = loadAllData();
    return data.logs || [];
}

function saveLogsData(logs) {
    const data = loadAllData();
    data.logs = logs;
    saveAllData(data);
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
    const exerciseName = document.getElementById('exerciseName').value.trim();

    if (!exerciseName) {
        alert('Please enter an exercise name');
        return;
    }

    const schedule = getScheduleData();
    const dayKey = `day${currentDay}`;

    // Initialize day if it doesn't exist
    if (!schedule[dayKey]) {
        schedule[dayKey] = [];
    }

    // Add exercise
    schedule[dayKey].push({
        name: exerciseName,
        id: Date.now()
    });

    // Save and refresh
    saveScheduleData(schedule);
    document.getElementById('exerciseName').value = '';
    displayExercisesForDay(currentDay);
}

function displayExercisesForDay(dayNumber) {
    const schedule = getScheduleData();
    const dayKey = `day${dayNumber}`;
    const exercises = schedule[dayKey] || [];

    const container = document.getElementById('exercisesList');

    if (exercises.length === 0) {
        container.innerHTML = '<p class="empty-state">No exercises planned for this day. Add some!</p>';
        return;
    }

    container.innerHTML = exercises.map(exercise => `
        <div class="exercise-item">
            <div>
                <div class="exercise-name">${exercise.name}</div>
            </div>
            <button class="btn-delete" onclick="deleteExercise(${currentDay}, ${exercise.id})">Delete</button>
        </div>
    `).join('');
}

function deleteExercise(day, exerciseId) {
    const schedule = getScheduleData();
    const dayKey = `day${day}`;

    schedule[dayKey] = schedule[dayKey].filter(ex => ex.id !== exerciseId);

    saveScheduleData(schedule);
    displayExercisesForDay(day);
}

// ==================== DASHBOARD FUNCTIONALITY ====================

function updateDashboard() {
    updateExercisesToday();
    populateExerciseSelect();
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
        container.innerHTML = '<p class="empty-state">No exercises planned for this day. Select a different day or add exercises in the Planner.</p>';
        return;
    }

    container.innerHTML = exercises.map(exercise => {
        const exerciseName = exercise.name;
        const sessionLogs = logs.filter(log => log.date === sessionDate && log.exercise === exerciseName);
        const completed = sessionLogs.length > 0;
        // When opening the form we'll pass sessionNumber as well so the correct session entry is loaded/saved
        return `
            <div class="exercise-item ${completed ? 'completed' : ''}" onclick="selectExerciseForLogging('${exerciseName}', '${sessionDate}', ${sessionDay}, ${sessionNumber})">
                <div>
                    <div class="exercise-name">${exerciseName}</div>
                    ${completed ? `<div class="exercise-details">✓ Logged</div>` : ''}
                </div>
                <div>
                    ${completed ? '✓' : '○'}
                </div>
            </div>
        `;
    }).join('');
}

function selectExerciseForLogging(exerciseName, date, dayNumber, sessionNumber) {
    currentExerciseForLogging = { name: exerciseName, date: date, day: dayNumber, sessionNumber: sessionNumber };

    // Show log form
    document.getElementById('logForm').style.display = 'block';

    // Populate session day & number inputs
    const dayInput = document.getElementById('sessionDay');
    if (dayInput) dayInput.value = dayNumber || dayInput.value;
    const sessionNumberInput = document.getElementById('sessionNumber');
    if (sessionNumberInput) sessionNumberInput.value = sessionNumber || sessionNumberInput.value;

    // Load previous entry if exists for this date/exercise/session
    const logs = getLogsData();
    const previousLog = logs.find(log => log.date === date && log.exercise === exerciseName && (sessionNumber == null || log.sessionNumber == sessionNumber));

    if (previousLog) {
        renderSetsForLog(previousLog.sets || []);
        document.getElementById('overallWeight').value = previousLog.weight || '';
        document.getElementById('sessionName').value = previousLog.sessionName || '';
        document.getElementById('logMessage').textContent = 'Loaded previous log for this date/session.';
    } else {
        renderSetsForLog([]); // start fresh with one empty set
        document.getElementById('overallWeight').value = '';
        document.getElementById('sessionName').value = '';
        document.getElementById('logMessage').textContent = '';
    }
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

    const totalReps = sets.reduce((s, it) => s + it.reps, 0);
    const weight = parseFloat(document.getElementById('overallWeight').value) || null;
    const sessionName = (document.getElementById('sessionName') && document.getElementById('sessionName').value) ? document.getElementById('sessionName').value.trim() : null;

    let logs = getLogsData();

    // Remove existing log for this exercise on this date & session
    const curSessionNumber = parseInt(currentExerciseForLogging.sessionNumber) || parseInt(document.getElementById('sessionNumber').value) || 1;
    logs = logs.filter(log => !(log.date === currentExerciseForLogging.date && log.exercise === currentExerciseForLogging.name && (parseInt(log.sessionNumber) || 1) === curSessionNumber));

    // Add new log
    const newLog = {
        exercise: currentExerciseForLogging.name,
        date: currentExerciseForLogging.date,
        day: sessionDay,
        sessionNumber: curSessionNumber,
        sessionName: sessionName,
        sets: sets,
        totalReps: totalReps,
        weight: weight
    };

    logs.push(newLog);
    saveLogsData(logs);

    // Compare with next session for the same exercise (chronological)
    const comparison = compareWithNextSession(newLog, logs);

    // Refresh UI
    updateExercisesToday();
    // Refresh selector and charts so progress updates immediately
    populateExerciseSelect();
    updateCharts();

    document.getElementById('logMessage').textContent = 'Saved. ' + (comparison || 'No next session to compare.');
    setTimeout(() => {
        document.getElementById('logForm').style.display = 'none';
    }, 800);
}

// ----------------- Sets UI Helpers -----------------
function setupSetsLogUI() {
    const addBtn = document.getElementById('addSetLogBtn');
    if (addBtn) addBtn.addEventListener('click', (e) => { e.preventDefault(); addSetLogRow(); });

    const saveBtn = document.getElementById('saveLogBtn');
    if (saveBtn) saveBtn.addEventListener('click', (e) => { e.preventDefault(); logExercise(); });

    // Ensure at least one set row exists
    renderSetsForLog([]);
}

function addSetLogRow(reps) {
    const container = document.getElementById('setsLogContainer');
    const idx = container.querySelectorAll('.set-row').length + 1;
    const row = document.createElement('div');
    row.className = 'set-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '8px';

    const label = document.createElement('div');
    label.textContent = `Set ${idx}:`;
    label.style.minWidth = '60px';
    label.style.alignSelf = 'center';

    const repsInput = document.createElement('input');
    repsInput.type = 'number';
    repsInput.min = '1';
    repsInput.placeholder = 'Reps';
    repsInput.className = 'set-reps';
    repsInput.value = reps || '';
    repsInput.style.flex = '1';
    repsInput.addEventListener('input', updateTotalFromUI);
    repsInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            logExercise();
        }
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn-secondary';
    removeBtn.addEventListener('click', (e) => { e.preventDefault(); row.remove(); updateSetLabels(); updateTotalFromUI(); });

    row.appendChild(label);
    row.appendChild(repsInput);
    row.appendChild(removeBtn);

    container.appendChild(row);
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
}

function updateSetLabels() {
    document.querySelectorAll('#setsLogContainer .set-row').forEach((row, i) => {
        const label = row.querySelector('div');
        if (label) label.textContent = `Set ${i+1}:`;
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

    const logs = getLogsData();
    const existing = logs.find(log => 
        log.date === currentExerciseForLogging.date && 
        log.exercise === currentExerciseForLogging.name && 
        ((parseInt(log.sessionNumber) || 1) === sessionNumber)
    );

    if (existing) {
        renderSetsForLog(existing.sets || []);
        document.getElementById('overallWeight').value = existing.weight || '';
        document.getElementById('sessionName').value = existing.sessionName || '';
        document.getElementById('logMessage').textContent = `Loaded session ${sessionNumber}.`;
    } else {
        // clear form for new session
        renderSetsForLog([]);
        document.getElementById('overallWeight').value = '';
        document.getElementById('sessionName').value = '';
        document.getElementById('logMessage').textContent = '';
    }
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
    const same = allLogs.filter(l => l.exercise === currentLog.exercise).sort((a,b) => new Date(a.date) - new Date(b.date));
    const idx = same.findIndex(l => l.date === currentLog.date && (l.totalReps === currentLog.totalReps || JSON.stringify(l.sets) === JSON.stringify(currentLog.sets)));
    if (idx === -1) return null;

    const next = same[idx+1];
    if (!next) return null;

    const diff = next.totalReps - currentLog.totalReps;
    if (diff > 0) return `Next session (on ${next.date}) is +${diff} reps compared to this session.`;
    if (diff < 0) return `Next session (on ${next.date}) is ${diff} reps (fewer) compared to this session.`;
    return `Next session (on ${next.date}) has the same total reps.`;
}

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
        exercises.map(ex => `<option value="${ex.name}">${ex.name}</option>`).join('');

    // Restore previous selection if it still exists in today's plan
    if (exercises.some(e => e.name === currentValue)) {
        select.value = currentValue;
    }
}

function updateCharts() {
    const selectedExercise = document.getElementById('exerciseSelect').value;

    if (!selectedExercise) {
        // Clear charts
        if (repsChart) repsChart.destroy();
        if (weightChart) weightChart.destroy();
        return;
    }

    const logs = getLogsData();
    // Filter logs for the selected exercise and sort chronologically, then by sessionNumber
    const exerciseLogs = logs
        .filter(log => log.exercise === selectedExercise)
        .sort((a, b) => {
            const da = new Date(a.date);
            const db = new Date(b.date);
            if (da - db !== 0) return da - db;
            const sa = parseInt(a.sessionNumber) || 1;
            const sb = parseInt(b.sessionNumber) || 1;
            return sa - sb;
        });

    if (exerciseLogs.length === 0) return;

    // Build labels and compute total reps per session (sum sets if needed)
    const labels = exerciseLogs.map(log => {
        const dateLabel = new Date(log.date).toLocaleDateString();
        const sessNum = log.sessionNumber ? ` #${log.sessionNumber}` : '';
        const name = log.sessionName ? ` ${log.sessionName}` : '';
        return `${dateLabel}${sessNum}${name}`;
    });

    const repsData = exerciseLogs.map(log => {
        if (typeof log.totalReps === 'number') return log.totalReps;
        if (Array.isArray(log.sets) && log.sets.length) return log.sets.reduce((s, it) => s + (it.reps || 0), 0);
        if (typeof log.reps === 'number') return log.reps;
        return 0;
    });

    const weightData = exerciseLogs.map(log => log.weight || null);

    // Destroy existing charts
    if (repsChart) repsChart.destroy();
    if (weightChart) weightChart.destroy();

    // Create Reps Chart (total reps per session) as a line chart
    const repsCtx = document.getElementById('repsChart').getContext('2d');
    repsChart = new Chart(repsCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Reps',
                data: repsData,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.12)',
                tension: 0.35,
                fill: true,
                pointRadius: 6,
                pointBackgroundColor: '#667eea',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw;
                            return `Total reps: ${val}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });

    // Create Weight Chart
    const weightCtx = document.getElementById('weightChart').getContext('2d');
    weightChart = new Chart(weightCtx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: weightData,
                borderColor: '#764ba2',
                backgroundColor: 'rgba(118, 75, 162, 0.1)',
                tension: 0.4,
                fill: true,
                pointRadius: 5,
                pointBackgroundColor: '#764ba2',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}
