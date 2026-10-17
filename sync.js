/* =====================================================================
   sync.js — optional cloud sync (Firebase Auth + Firestore)
   Loaded lazily by script.js. If this file or Firebase fails to load
   (for example you are offline), the app still works from local data.

   How it works
   - Entries are grouped by month into small cloud documents:
       ledgers/{userId}/shards/2026-10, 2026-11 ... and "meta"
     ("meta" holds budgets and recurring items).
   - Every record has an id and an updatedAt time. When two devices have
     the same record, the newer one wins. Deleted records are kept as
     "deleted: true" so deletions sync too.
   - Nothing is pushed until the first download from the cloud has been
     merged, so a new device can never overwrite your cloud data.
   ===================================================================== */
import { firebaseConfig } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";

/* A short fingerprint of a shard: changes whenever any record changes. */
export function shardSignature(p) {
  const parts = [];
  (p.entries || []).forEach((e) => parts.push(`e${e.id}:${e.updatedAt || 0}:${e.deleted ? 1 : 0}`));
  (p.recurring || []).forEach((r) => parts.push(`r${r.id}:${r.updatedAt || 0}:${r.deleted ? 1 : 0}`));
  if (p.budgets) parts.push(`b:${p.budgets.updatedAt || 0}`);
  return parts.sort().join("|");
}

async function loadFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/`;
  const [app, auth, fs] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js"),
  ]);
  return { app, auth, fs };
}

/* `deps` is only used by automated tests; the app calls initSync(bridge). */
export async function initSync(bridge, deps) {
  const cfg = (deps && deps.config) || firebaseConfig;
  if (!cfg || !cfg.apiKey || String(cfg.apiKey).startsWith("PASTE")) {
    bridge.setSyncState({ configured: false });
    return null;
  }
  const { app: appMod, auth: authMod, fs } = deps && deps.mods ? deps.mods : await loadFirebase();
  const app = appMod.initializeApp(cfg);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);

  let user = null, unsub = null, timer = null, ready = false;
  const remoteSig = {};
  const stamp = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  function pushDiff() {
    if (!user || !ready) return;
    const shards = bridge.splitShards();
    Object.keys(shards).forEach((key) => {
      const payload = shards[key];
      const sig = shardSignature(payload);
      if (remoteSig[key] === sig) return;
      remoteSig[key] = sig;
      fs.setDoc(fs.doc(db, "ledgers", user.uid, "shards", key), { data: JSON.stringify(payload), updatedAt: fs.serverTimestamp() })
        .then(() => bridge.setSyncState({ status: "Synced " + stamp() }))
        .catch((err) => {
          console.error("Sync write failed", err);
          delete remoteSig[key];
          bridge.setSyncState({ status: "Couldn't sync, will retry" });
        });
    });
  }

  function schedulePush() {
    clearTimeout(timer);
    timer = setTimeout(pushDiff, 600);
  }
  bridge.onChange = schedulePush;

  function onSnapshot(snap) {
    let changed = false;
    snap.docs.forEach((d) => {
      let payload;
      try { payload = JSON.parse(d.data().data); } catch (e) { return; }
      remoteSig[d.id] = shardSignature(payload);
      if (bridge.mergeShard(payload)) changed = true;
    });
    if (changed) bridge.finishRemote();
    ready = true;
    pushDiff();
    bridge.setSyncState({ status: "Synced " + stamp() });
  }

  authMod.onAuthStateChanged(auth, (u) => {
    user = u;
    ready = false;
    if (unsub) { unsub(); unsub = null; }
    Object.keys(remoteSig).forEach((k) => delete remoteSig[k]);
    if (!u) { bridge.setSyncState({ configured: true, user: null, status: "" }); return; }
    bridge.setSyncState({ configured: true, user: { email: u.email }, status: "Connecting…" });
    unsub = fs.onSnapshot(
      fs.collection(db, "ledgers", u.uid, "shards"),
      onSnapshot,
      (err) => { console.error("Sync listen failed", err); bridge.setSyncState({ status: "Sync error: " + (err.code || err.message) }); }
    );
  });

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { if (user) pushDiff(); });
    window.addEventListener("offline", () => { if (user) bridge.setSyncState({ status: "Offline, saved on this device" }); });
  }

  return {
    signIn: (email, pw) => authMod.signInWithEmailAndPassword(auth, email, pw),
    signUp: (email, pw) => authMod.createUserWithEmailAndPassword(auth, email, pw),
    signOut: () => authMod.signOut(auth),
    reset: (email) => authMod.sendPasswordResetEmail(auth, email),
    syncNow: () => pushDiff(),
  };
}
