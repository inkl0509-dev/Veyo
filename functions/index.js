/* Optional: push alerts to phones and computers while no portal is open.
   Runs whenever a portal writes a notification to tenants/{company}/inbox/{recipient}/items.
   Each company's alerts only go to people in that company.
   Needs the Firebase Blaze (pay-as-you-go) plan; light use stays within the free allowance.
   Deploy: see README.md, "Push alerts while the portal is closed". */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { getAuth } = require('firebase-admin/auth');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

// Set SITE_URL and REGION in functions/.env (copy .env.example). REGION must match your Firestore location.
const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
const PATHS = { customer: '', technician: '/tech', admin: '/admin' };

exports.pushNotification = onDocumentCreated(
  { document: 'tenants/{co}/inbox/{recipient}/items/{itemId}', region: process.env.REGION || 'asia-south1' },
  async (event) => {
    const item = event.data && event.data.data();
    if (!item) return;
    const db = getFirestore();
    const { co, recipient, itemId } = event.params;
    const company = await db.doc(`tenants/${co}`).get();
    if (!company.exists || company.data().status !== 'active') return;

    // The office inbox goes to every active office account; otherwise to the one person.
    let users = [];
    if (recipient === 'office') users = (await db.collection(`tenants/${co}/users`).where('role', '==', 'provider').get()).docs;
    else { const u = await db.doc(`tenants/${co}/users/${recipient}`).get(); if (u.exists) users = [u]; }

    const tokens = [], owner = {};
    for (const u of users) {
      const data = u.data();
      if ((data.status || 'active') !== 'active') continue;
      for (const t of data.fcmTokens || []) { if (!owner[t]) { tokens.push(t); owner[t] = u.ref; } }
    }
    if (!tokens.length) return;

    // One-company site (platform/site): the portals live at /customer, /tech and /admin.
    const site = await db.doc('platform/site').get();
    const single = site.exists && site.data().company === co;
    const path = (single ? ({ customer: '/customer', technician: '/tech', admin: '/admin' }[item.portal] || '/customer') : `/${co}` + (PATHS[item.portal] || '')) + (item.chat ? `?chat=${encodeURIComponent(item.chat)}` : item.jobId ? `?job=${encodeURIComponent(item.jobId)}` : '');
    const link = SITE_URL ? SITE_URL + path : undefined;

    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: item.title || 'Update', body: item.body || '' },
      data: { url: link || path, itemId },
      webpush: {
        // iPhone (Home Screen app) and browsers: deliver straight away, keep for a day if the phone is offline.
        headers: { Urgency: 'high', TTL: '86400' },
        notification: { tag: itemId, icon: SITE_URL ? SITE_URL + '/assets/icon-192.png' : undefined },
        fcmOptions: link ? { link } : undefined
      },
      // Phones running the Android app.
      android: { priority: 'high', notification: { channelId: 'updates', tag: itemId } }
    });

    // Forget devices that no longer accept messages.
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = (r.error && r.error.code) || '';
      if (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(code)) dead.push(tokens[i]);
    });
    await Promise.all(dead.map(t => owner[t].update({ fcmTokens: FieldValue.arrayRemove(t) })));
  }
);


/* Logins (sign-in accounts) for the office: delete them completely, and create them even when the email
   was used by a login that was deleted from a company before. A company can only touch logins that belong
   to it: an email that's still in use in another company is never deleted, reset or taken over. */
async function memberships(db, uid) {
  const out = [];
  for (const t of await db.collection('tenants').listDocuments()) {
    if ((await t.collection('users').doc(uid).get()).exists) out.push(t.id);
  }
  return out;
}

exports.manageLogin = onCall({ region: process.env.REGION || 'asia-south1' }, async (req) => {
  const caller = req.auth && req.auth.uid;
  if (!caller) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { action, co } = req.data || {};
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(String(co || ''))) throw new HttpsError('invalid-argument', 'Unknown company.');
  const db = getFirestore();
  const tenant = await db.doc(`tenants/${co}`).get();
  if (!tenant.exists || tenant.data().status !== 'active') throw new HttpsError('failed-precondition', 'This company is not active.');
  const isSuper = (await db.doc(`superAdmins/${caller}`).get()).exists;
  const me = await db.doc(`tenants/${co}/users/${caller}`).get();
  const isOffice = me.exists && me.data().role === 'provider' && (me.data().status || 'active') === 'active';
  if (!isSuper && !isOffice) throw new HttpsError('permission-denied', 'Only the office can manage logins.');

  if (action === 'delete') {
    const uid = String(req.data.uid || '');
    if (!uid || uid === caller) throw new HttpsError('invalid-argument', "You can't delete your own login here.");
    const owner = await db.doc(`tenants/${co}/config/owner`).get();
    if (owner.exists && owner.data().uid === uid && !isSuper) throw new HttpsError('permission-denied', "The company owner's login can't be deleted.");
    const userRef = db.doc(`tenants/${co}/users/${uid}`);
    if (!(await userRef.get()).exists) throw new HttpsError('not-found', 'That login is not part of this company.');
    const b = db.batch();
    b.delete(userRef);
    b.delete(db.doc(`tenants/${co}/techs/${uid}`));
    const cust = db.doc(`tenants/${co}/customers/${uid}`);
    if ((await cust.get()).exists) b.update(cust, { hasLogin: false, email: '' });   // keep the customer's history
    await b.commit();
    const others = (await memberships(db, uid)).filter((x) => x !== co);
    let authDeleted = false;
    if (!others.length) {
      try { await getAuth().deleteUser(uid); authDeleted = true; }
      catch (e) { if (e.code !== 'auth/user-not-found') throw e; authDeleted = true; }
    }
    return { authDeleted, otherCompanies: others.length };
  }

  if (action === 'create') {
    const email = String(req.data.email || '').trim().toLowerCase(), password = String(req.data.password || '');
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email.');
    if (password.length < 6) throw new HttpsError('invalid-argument', 'Use a password with at least 6 characters.');
    try {
      const u = await getAuth().createUser({ email, password });
      return { uid: u.uid, reused: false };
    } catch (e) {
      if (e.code !== 'auth/email-already-exists') throw e;
      const u = await getAuth().getUserByEmail(email);
      const m = await memberships(db, u.uid);
      if (m.includes(co)) throw new HttpsError('already-exists', 'This email already has a login in your company.');
      if (m.length) throw new HttpsError('already-exists', 'This email is used by a login in another company. Use a different email.');
      // A login left over after it was deleted from a company: reuse it with the new password.
      await getAuth().updateUser(u.uid, { password, disabled: false });
      return { uid: u.uid, reused: true };
    }
  }
  throw new HttpsError('invalid-argument', 'Unknown action.');
});
