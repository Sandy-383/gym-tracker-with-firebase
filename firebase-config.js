// Firebase Configuration
// Get your config from: https://console.firebase.google.com/
// Project Settings > Add app > Web app > Copy config

const firebaseConfig = {
  apiKey: "AIzaSyDN-WSBrKx8AjZhFpOkJ8MlPsvGO02NxO8",
  authDomain: "gym-tracker-c1754.firebaseapp.com",
  databaseURL: "https://gym-tracker-c1754-default-rtdb.firebaseio.com",
  projectId: "gym-tracker-c1754",
  storageBucket: "gym-tracker-c1754.firebasestorage.app",
  messagingSenderId: "92960918604",
  appId: "1:92960918604:web:75a90a5833497186d738e9",
  measurementId: "G-NF4617V9S1"
};

// Initialize Firebase - using compat version
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Get reference to the database
const db = firebase.database();
