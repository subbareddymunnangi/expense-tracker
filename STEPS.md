# KnowUrExpense v2: your steps

What you get: budgets and alerts, income and savings, charts and insights, recurring items and reminders, UPI / cash / card, dark mode, an installable app (PWA), and free cloud sync so your phone and laptop show the same data.

Your old data is safe: the new version reads your old entries automatically and never deletes them.

Do the steps in order. Do not skip step 1.

---

## Step 1. Keep a safety copy of your phone data (5 minutes)

Your real data is on your phone, inside the browser. Save a copy first.

1. On your phone, open your current app (the shortcut you use now).
2. Scroll to the bottom and tap **export CSV**. A file called `pocket-ledger-....csv` downloads.
3. Open Downloads and check the file is there. Keep it. It is only a safety copy you can read in Excel.
4. Do not clear Chrome data or delete the old shortcut until step 9 is finished.

## Step 2. Set up free cloud sync (Firebase, about 15 minutes)

You need a Google account. No card is needed for the free Spark plan.

1. Go to **console.firebase.google.com** and tap **Create a project**. Name it `knowurexpense`. Turn **Google Analytics off**. Create.
2. Left menu, **Build, then Authentication, then Get started**. Open **Sign-in method**, choose **Email/Password**, turn on the first switch (not "Email link"), and **Save**.
3. Left menu, **Build, then Firestore Database, then Create database**.
   - If asked for an edition, choose **Standard**.
   - Pick a location near you, for example **asia-south1 (Mumbai)**. You cannot change this later.
   - Choose **Start in production mode**, then **Create**.
4. In Firestore open the **Rules** tab. Delete everything there, paste the contents of the file `firestore.rules` from this folder, and tap **Publish**. This makes sure each person can only see their own data.
5. Click the gear icon, **Project settings**. Under **Your apps** tap the web icon `</>`. Nickname: `knowurexpense`. Leave Firebase Hosting unticked. Tap **Register app**.
6. You will see a block called `firebaseConfig` with six values. Keep that page open.
7. Open `firebase-config.js` from this folder in Notepad (or VS Code). Replace each `PASTE_...` value with the matching value from the Firebase page. Keep the quotation marks. Save.

   It must look like this (your values will differ):
   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "knowurexpense-xxxx.firebaseapp.com",
     projectId: "knowurexpense-xxxx",
     storageBucket: "knowurexpense-xxxx.appspot.com",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```
8. Optional but tidy: **Authentication, Settings, Authorized domains, Add domain**, then add `knowurexpense.netlify.app`.

## Step 3. Put the new files in GitHub (without touching the live site yet)

1. Unzip `knowurexpense-v2.zip` on your laptop. You will see these files and folders:
   `index.html, style.css, script.js, sync.js, firebase-config.js, sw.js, manifest.webmanifest, netlify.toml, firestore.rules, STEPS.md, icons/, vendor/`
2. Make sure `firebase-config.js` has your real values from step 2.
3. Open your repository on github.com. Tap **Add file, then Upload files**.
4. Drag in **everything inside the unzipped folder** (the files and the two folders `icons` and `vendor`). GitHub replaces your old `index.html`, `style.css` and `script.js` automatically.
5. At the bottom choose **Create a new branch for this commit and start a pull request**. Name the branch `upgrade-v2`. Tap **Propose changes**, then **Create pull request**.
6. Your live site does not change yet. Wait about a minute: Netlify adds a **Deploy Preview** link on the pull request page.

Check in Netlify (Site configuration, Build and deploy) that **Build command** is empty and **Publish directory** is empty or `.`. Your site already worked that way, so it should be fine.

## Step 4. Test on the preview link

The preview address is different from your live site, so it starts empty. That is normal. Use it only to test.

1. Open the Deploy Preview link on your laptop.
2. Add an expense and an income. Check the numbers on Home.
3. Budgets tab: set an overall budget, add an expense that goes past 80%, and check the warning.
4. Recurring tab: add an item with yesterday's date. A reminder appears on Home. Tap **Add**.
5. Insights tab: the charts show. Tap the moon icon at the top to test dark mode.
6. Settings tab: tap **Create account**, use your email and a password of 6 or more characters. The badge at the top should change to **Synced**.
7. If Firebase says something is wrong, see "If something goes wrong" below.

## Step 5. Go live

1. On the pull request page tap **Merge pull request, then Confirm merge**.
2. In Netlify, Deploys: wait until the top deploy says **Published**.

Your live site now has the new version. Your old phone data is still in the browser, untouched.

## Step 6. Check your old data on the phone

1. On your phone, open **https://knowurexpense.netlify.app** in Chrome (use the same browser you used before).
2. Pull down to refresh once. You should see the new design with the tabs at the bottom.
3. Open History. Your old expenses must be there. Compare the count and a few amounts with your CSV from step 1.
4. If anything is missing, stop and go to "If something goes wrong". Nothing was deleted.

## Step 7. Back up, then sign in on the phone first

1. Settings, **Download backup (JSON)**. Keep that file. This is now your best backup.
2. Still in Settings, enter your email and password, tap **Create account**. Wait until the badge says **Synced**.
3. Your old data is now in the cloud.

## Step 8. Sign in on the laptop

1. Open the live site on your laptop. Settings, then **Sign in** with the same email and password.
2. After a few seconds, your phone entries appear on the laptop. From now on, anything you add on one device shows on the other.

If your laptop had test entries you do not want, delete them in History before signing in.

## Step 9. Install it as an app on your phone

1. Chrome on your phone: open the site, tap the three dots, then **Install app** (or **Add to Home screen, then Install**).
2. Open the new app icon and check that your data is there and the badge says Synced.
3. Now you can delete the old home screen shortcut.

---

## Using it every day

- **Add**: Home, choose Expense or Income, amount, category, how you paid (UPI, Cash, Card), Add.
- **Edit or delete**: tap the pencil or the cross on any entry (History or Home). Deleting shows an Undo button.
- **Budgets**: Budgets tab. An alert appears at 80% and when crossed.
- **Recurring**: rent, subscriptions, salary. When due, a reminder appears on Home with Add and Skip buttons.
- **Reminder notifications**: Settings, turn on. They show when you open the app and something is due or coming up in 3 days. A web app on a static site cannot send alerts while it is fully closed.
- **Free limits**: Firebase Spark allows about 50,000 reads and 20,000 writes per day. This app uses a tiny fraction of that.

## When you change the app later

1. Edit the files and upload them on a new branch like step 3.
2. In `sw.js` change `knowurexpense-v2-1` to `knowurexpense-v2-2` (then -3 and so on). This makes phones pick up the new version.
3. Merge after the preview looks right.

## If something goes wrong

| Problem | What to do |
|---|---|
| Badge says "Local only" | `firebase-config.js` still has `PASTE_` values, or the file was not uploaded. Fix step 2.7 and re-upload. |
| "Email sign-in is not turned on" | Step 2.2: enable Email/Password in Authentication. |
| "Sync error: permission-denied" | Step 2.4: the rules were not published, or the Firestore database was not created. |
| "Sync error: failed-precondition" or "not found" | Firestore database does not exist yet. Do step 2.3. |
| New design not showing on phone | Close the app fully and open it twice. Or in Chrome: three dots, Settings, Privacy, delete **cached images and files** only (not cookies or site data). |
| Old entries missing after going live | Do not clear anything. In Netlify, Deploys, open the previous deploy and tap **Publish deploy** to go back to the old version. Your data is still there. Then ask for help. |
| Forgot password | Settings, type your email, tap **Forgot password?** |

**Never** clear Chrome "Cookies and site data" for this site while your data exists only on that device, and sign in (step 7) as soon as you can so the cloud holds a copy.
