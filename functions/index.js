/* Optional: push alerts to phones and computers while no portal is open.
   Runs whenever a portal writes a notification to tenants/{company}/inbox/{recipient}/items.
   Each company's alerts only go to people in that company.
   Needs the Firebase Blaze (pay-as-you-go) plan; light use stays within the free allowance.
   Deploy: see README.md, "Push alerts while the portal is closed". */
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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

    const path = `/${co}` + (PATHS[item.portal] || '') + (item.chat ? `?chat=${encodeURIComponent(item.chat)}` : item.jobId ? `?job=${encodeURIComponent(item.jobId)}` : '');
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
