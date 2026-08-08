# Gym Tracker — setup guide

A private training log for you and a few friends. Each person signs in with email +
password and sees **only their own** data. Nobody gets in unless you add their
account ID to an allowlist by hand.

Follow the steps in order. Steps 1–6 are one-time. Step 7 is per friend.

---

## How access actually works

Three things have to be true before anyone can read or write a single byte:

1. They are **signed in** (Firebase Authentication).
2. Their **uid is in `gymTracker/allowlist`** — a node only you can write.
3. They are touching **their own** `gymTracker/users/<their-uid>` subtree.

All three are enforced by `database.rules.json` on Google's servers, not by the app.
That matters: the database is reachable over the REST API by anyone who knows the
URL, so UI-level checks would protect nothing. The rules are the real gate.

> The `apiKey` in `firebase-config.js` is **not** a secret. It identifies the
> project; it grants nothing. Committing it is normal and safe.

---

## 1. Enable Email/Password sign-in

1. [Firebase Console](https://console.firebase.google.com/) → your project
2. **Build → Authentication → Get started**
3. **Sign-in method** tab → **Email/Password** → toggle **Enable** → **Save**

Leave "Email link (passwordless)" off.

> Skip this and every sign-in fails with
> *"Email/password sign-in is not enabled for this Firebase project yet."*

## 2. Enable the Realtime Database

1. **Build → Realtime Database → Create Database**
2. Pick the region closest to you
3. Choose **Start in locked mode** (not test mode — the next step replaces the rules anyway)

## 3. Install the security rules

1. **Realtime Database → Rules** tab
2. Delete what's there and paste the **entire contents of `database.rules.json`** from this repo
3. **Publish**

Verify it took effect with the **Rules Playground** (button on the Rules tab). Run
each of these and confirm the result:

| Simulated request | Location | Auth | Expect |
|---|---|---|---|
| Read | `/gymTracker/users/abc` | Unauthenticated | **Denied** |
| Read | `/gymTracker/users/abc` | Authenticated as `abc` | **Denied** (not allowlisted yet) |
| Write | `/gymTracker/allowlist/abc` | Authenticated as `abc` | **Denied** |

All three must be denied. If any is allowed, the rules did not save.

## 4. Turn on GitHub Pages

1. Repo → **Settings → Pages**
2. **Source: GitHub Actions** ← must be this, *not* "Deploy from a branch"
3. Push to `main`. The **Deploy static content to Pages** workflow runs.
4. Your URL is `https://<your-username>.github.io/<repo-name>/`

> Only one workflow remains in `.github/workflows/` on purpose. There used to be
> four, three of them wrong for a plain static site, all racing on the same
> `concurrency: pages` group — so which one defined the live site was luck.

## 5. Authorise your domain for sign-in

**This is the step people miss**, and sign-in silently fails without it.

1. **Authentication → Settings → Authorized domains → Add domain**
2. Add `<your-username>.github.io`

`localhost` is already there, which is why it works locally but breaks once deployed.
The app reports this one as *"This web address is not in the Firebase
authorised-domains list yet."*

## 6. Create your own account and allowlist yourself

1. Open your Pages URL. You'll get the sign-in screen.
2. **Create account** → your email + a password (6+ characters)
3. You'll land on **"Waiting for access"** showing your account ID. Tap **Copy**.
4. In the Console: **Realtime Database → Data**, and build this by hand:

```
gymTracker
└── allowlist
    └── <paste-your-uid-here>
        └── name: "Sanjana"
```

Use the **+** next to `gymTracker` to add each level. The value under `name` can be
anything — the rules only check that the uid node **exists**.

5. Back in the app, tap **Check again**. Your log opens.

> If you had data saved on this device from before sign-in existed, the app offers
> once to import it into your account. Accept and it's carried over.

## 7. Add a friend

1. Send them the URL.
2. They tap **Create account** and sign up.
3. They land on "Waiting for access" and send you the ID it shows.
4. You add `gymTracker/allowlist/<their-uid>` in the Console, exactly as in step 6.
5. They tap **Check again**.

To remove someone, delete their `allowlist` node. They lose access immediately —
their data stays at `gymTracker/users/<uid>` until you delete that too.

---

## 8. Install it on your phone

The site is a PWA, so it installs to the home screen and runs without browser
chrome. Requires HTTPS, which GitHub Pages gives you.

**Android (Chrome)**
1. Open your Pages URL
2. **⋮** menu → **Add to Home screen** / **Install app**
3. Confirm

**iPhone / iPad (Safari — must be Safari, not Chrome)**
1. Open your Pages URL
2. **Share** → **Add to Home Screen**
3. Confirm

Once installed you get the app icon, no address bar, and your session persists —
you won't be asked to sign in every visit.

**Offline behaviour.** Already-loaded data is cached per account, so opening the app
in a gym basement shows your log immediately with an **Offline** badge in the header.
Sessions you log while offline are queued and sent when you reconnect. A *first ever*
launch does need a connection.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| "Email/password sign-in is not enabled…" | Step 1 not done |
| "This web address is not in the Firebase authorised-domains list yet." | Step 5 not done |
| Stuck on **Waiting for access** | uid not in `gymTracker/allowlist`, or a typo in it. Compare character-for-character. |
| "Can't reach the server" | Firebase SDK blocked — ad/tracker blocker, or offline on a first launch |
| Sign-in works, app stays empty | Normal for a new account. Add exercises in **Plan** first. |
| "Could not save: …does not have write access" | Signed in but not allowlisted |
| Pages deploy fails | **Settings → Pages → Source** is not set to **GitHub Actions** |
| Phone won't offer "Install" | Not on HTTPS, or already installed. iOS only offers it in Safari. |
| Code changes don't appear on the phone | Close the app fully and reopen. App files are fetched network-first, so one relaunch is enough. |

### Resetting someone's data
Delete `gymTracker/users/<uid>` in the Console. Their next snapshot shows an empty app.

### If you add a field to a log
`database.rules.json` pins the exact shape of a log and **rejects unknown keys**.
That's deliberate — it stops a signed-in client writing junk into your database. If
you extend a log with a new field, add it to the `logs/$logId` block in the rules
too, or saves will start failing.

---

## Reference

- Data lives at `gymTracker/users/<uid>/{schedule,logs}`
- Logs are a keyed object (not an array), so each session is written independently —
  two devices editing at once can't overwrite each other
- The local cache key is `gymTrackerData:<uid>`, so two people sharing a phone can't
  read each other's cached data
- Firebase Realtime Database docs: https://firebase.google.com/docs/database/security
