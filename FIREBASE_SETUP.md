# Gym Tracker - Firebase Setup Guide

## Overview
Your gym tracker now supports **Cloud Storage with Firebase** so your data persists across devices and hosting platforms.

## How It Works
- **Local Storage (Backup)**: Data is always saved to browser storage as backup
- **Firebase Cloud (Primary)**: When Firebase is configured, data syncs automatically to the cloud
- **Fallback**: If Firebase isn't available, the app uses local storage automatically

## Setup Instructions (5 minutes)

### Step 1: Create a Firebase Project
1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/)
2. Click **"Create a project"** or use an existing one
3. Project name: `gym-tracker` (or any name)
4. Accept the terms and create

### Step 2: Enable Realtime Database
1. In Firebase Console, go to **Build > Realtime Database**
2. Click **"Create Database"**
3. Choose region (closest to you)
4. Start in **Test mode** for now (you can secure it later)
5. Click **"Enable"**

### Step 3: Get Your Firebase Config
1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll to **Your apps** section
3. Click on the web app (if you don't have one, click **"Add app"** and select **Web**)
4. Copy the config object that looks like this:
```javascript
const firebaseConfig = {
    apiKey: "AIzaSy...",
    authDomain: "gym-tracker-xxx.firebaseapp.com",
    databaseURL: "https://gym-tracker-xxx.firebaseio.com",
    projectId: "gym-tracker-xxx",
    storageBucket: "gym-tracker-xxx.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abcdef123456"
};
```

### Step 4: Add Config to Your Project
1. Open `firebase-config.js` in your project
2. Replace the placeholder values with your actual Firebase config
3. Save the file

### Step 5: Test It
1. Open your app in a browser
2. Add some exercises and log a session
3. You should see logs in the browser console (if Firebase initialized)
4. Check [Firebase Console > Realtime Database](https://console.firebase.google.com/) to see your data stored

## Securing Your Database (After Testing)

Once you've tested, you should secure your database:

1. Go to **Realtime Database > Rules**
2. Replace with:
```json
{
  "rules": {
    "gymTracker": {
      ".read": "auth.uid === 'your-user-id'",
      ".write": "auth.uid === 'your-user-id'"
    }
  }
}
```

Or use a simpler approach (public but limited):
```json
{
  "rules": {
    "gymTracker": {
      ".read": true,
      ".write": true
    }
  }
}
```

## Features Now Enabled

✅ **Automatic Backup**: Data saved to cloud  
✅ **Multi-Device Sync**: Access from any device  
✅ **Persistent Hosting**: Works on any hosting platform (Netlify, Vercel, GitHub Pages, etc.)  
✅ **Automatic Fallback**: Works with or without Firebase  

## Troubleshooting

**"Firebase not available" message**
- Check that `firebase-config.js` has correct credentials
- Check browser console for errors (F12 > Console)
- Make sure Realtime Database is enabled in Firebase Console

**Data not syncing**
- Check internet connection
- Check Firebase Console > Realtime Database to see if data is there
- Clear browser cache and reload

**Want to Reset All Data?**
- Firebase: Delete all data in [Firebase Console > Realtime Database](https://console.firebase.google.com/)
- Browser: Open DevTools (F12) > Storage > Clear all

## Hosting Your App

You can now host this on:
- **Netlify**: Drag and drop your folder
- **Vercel**: Connect your GitHub repo
- **GitHub Pages**: Push to gh-pages branch
- **Firebase Hosting**: `firebase deploy` (with Firebase CLI)
- Any static host (AWS S3, Cloudflare, etc.)

Your Firebase database will work from any of these!

## Need Help?
- Firebase Docs: https://firebase.google.com/docs/database
- Console: https://console.firebase.google.com/
