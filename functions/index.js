/**
 * Swimfit — Paddle Billing webhook receiver, new-user onboarding, and the
 * registered-swimmers counter.
 *
 * Deploy target: Firebase Cloud Functions, project "swimfi-ae". Mixes 2nd-gen
 * HTTPS functions (paddleWebhook) with a 1st-gen Auth trigger (onUserCreated)
 * in the same codebase — both are fully supported together.
 *
 * Setup (one-time):
 *   1. cd functions && npm install
 *   2. firebase deploy --only functions   (deploys with a placeholder secret prompt)
 *   3. Copy the deployed paddleWebhook HTTPS URL, register it in the Paddle dashboard
 *      under Developer Tools -> Notifications -> Webhook destinations (select the
 *      events you want, e.g. subscription.created/updated/canceled, transaction.completed).
 *   4. Paddle then shows a webhook signing secret for that destination. Store it with:
 *        firebase functions:secrets:set PADDLE_WEBHOOK_SECRET
 *      (paste the secret when prompted), then redeploy:
 *        firebase deploy --only functions
 *   5. For the welcome email, set SMTP credentials from your email provider
 *      (e.g. an SMTP relay from Gmail/Google Workspace, SendGrid, Mailgun, Postmark):
 *        firebase functions:secrets:set SMTP_HOST
 *        firebase functions:secrets:set SMTP_PORT
 *        firebase functions:secrets:set SMTP_USER
 *        firebase functions:secrets:set SMTP_PASS
 *      then redeploy. Without these set, onUserCreated still creates the Firestore
 *      profile and increments the registered-users counter — it just skips the
 *      email send (logged, not thrown, so a missing/bad SMTP config never blocks
 *      user creation).
 *   6. Deploy Firestore rules too: firebase deploy --only firestore:rules
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const functionsV1 = require('firebase-functions/v1');
const logger = require('firebase-functions/logger');
const crypto = require('crypto');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();
const db = admin.firestore();

const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET');
const SMTP_HOST = defineSecret('SMTP_HOST');
const SMTP_PORT = defineSecret('SMTP_PORT');
const SMTP_USER = defineSecret('SMTP_USER');
const SMTP_PASS = defineSecret('SMTP_PASS');

// Reject signatures older than this to guard against replay attacks.
const MAX_SIGNATURE_AGE_SECONDS = 300;

function verifyPaddleSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;

  var parts = {};
  signatureHeader.split(';').forEach(function (part) {
    var kv = part.split('=');
    if (kv.length === 2) parts[kv[0]] = kv[1];
  });
  var ts = parts.ts;
  var h1 = parts.h1;
  if (!ts || !h1) return false;

  var age = Math.abs(Date.now() / 1000 - Number(ts));
  if (isNaN(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;

  var expected = crypto.createHmac('sha256', secret).update(ts + ':' + rawBody).digest('hex');

  var expectedBuf = Buffer.from(expected, 'utf8');
  var receivedBuf = Buffer.from(h1, 'utf8');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

exports.paddleWebhook = onRequest(
  { secrets: [PADDLE_WEBHOOK_SECRET], cors: false, region: 'us-central1' },
  async function (req, res) {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    var rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
    var signatureHeader = req.get('Paddle-Signature');

    if (!verifyPaddleSignature(rawBody, signatureHeader, PADDLE_WEBHOOK_SECRET.value())) {
      logger.warn('Paddle webhook: signature verification failed');
      res.status(401).send('Invalid signature');
      return;
    }

    var event;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      logger.error('Paddle webhook: could not parse JSON body', err);
      res.status(400).send('Invalid JSON');
      return;
    }

    var eventType = event.event_type;
    var data = event.data || {};
    logger.info('Paddle webhook received', { eventType: eventType, eventId: event.event_id });

    try {
      var customData = data.custom_data || {};
      var firebaseUid = customData.firebaseUid || customData.firebase_uid || null;
      var docId = firebaseUid || data.customer_id || data.id || event.event_id;

      if (docId) {
        var priceIds = Array.isArray(data.items)
          ? data.items.map(function (item) { return item.price && item.price.id; }).filter(Boolean)
          : [];

        await db.collection('paddle_subscriptions').doc(String(docId)).set(
          {
            eventType: eventType,
            status: data.status || null,
            subscriptionId: data.subscription_id || (eventType && eventType.indexOf('subscription.') === 0 ? data.id : null) || null,
            customerId: data.customer_id || null,
            firebaseUid: firebaseUid,
            priceIds: priceIds,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            raw: data
          },
          { merge: true }
        );
      } else {
        logger.warn('Paddle webhook: no usable document id on event, skipping Firestore write', { eventType: eventType });
      }
    } catch (err) {
      // Still ack the webhook so Paddle doesn't retry indefinitely for a processing bug —
      // the raw event is already logged above for manual recovery.
      logger.error('Paddle webhook: failed to write to Firestore', err);
    }

    res.status(200).send('OK');
  }
);

function welcomeEmailHtml(name) {
  var greetName = name ? name.split(' ')[0] : 'there';
  return (
    '<div style="background:#070B0A;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;">' +
      '<div style="max-width:480px;margin:0 auto;background:#101A19;border:1px solid #1c2b29;border-radius:16px;overflow:hidden;">' +
        '<div style="background:linear-gradient(135deg,#124a3d,#1f6b3a);padding:32px 32px 24px;">' +
          '<div style="font-family:Georgia,serif;font-size:26px;font-weight:700;color:#ffffff;letter-spacing:0.02em;">SWIM<span style="color:#22d3ee;">FIT</span></div>' +
        '</div>' +
        '<div style="padding:32px;color:#F3F7F5;">' +
          '<h1 style="font-size:22px;margin:0 0 16px;color:#ffffff;">Welcome to Swimfit, ' + escapeHtml(greetName) + '!</h1>' +
          '<p style="font-size:15px;line-height:1.6;color:#97A9A3;margin:0 0 20px;">' +
            'Your account is verified and ready. Swimfit builds your training around exactly where you are today — ' +
            'a workout generator that adapts warm-up to cool-down around your discipline, distance, gear and goal, ' +
            'a dryland Gym focus for every swim day, and full technique breakdowns across all five disciplines.' +
          '</p>' +
          '<a href="https://swimfit.com" style="display:inline-block;background:#22d3ee;color:#070B0A;font-weight:700;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Start Training</a>' +
          '<p style="font-size:12px;line-height:1.6;color:#5f7570;margin:28px 0 0;">' +
            'You’re receiving this because you created a Swimfit account. If this wasn’t you, you can safely ignore this email.' +
          '</p>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

async function sendWelcomeEmail(user) {
  var host = SMTP_HOST.value(), port = SMTP_PORT.value(), smtpUser = SMTP_USER.value(), pass = SMTP_PASS.value();
  if (!host || !smtpUser || !pass) {
    logger.info('onUserCreated: SMTP secrets not configured, skipping welcome email', { uid: user.uid });
    return;
  }
  var transporter = nodemailer.createTransport({
    host: host,
    port: Number(port) || 587,
    secure: Number(port) === 465,
    auth: { user: smtpUser, pass: pass }
  });
  await transporter.sendMail({
    from: 'Swimfit <' + smtpUser + '>',
    to: user.email,
    subject: 'Welcome to Swimfit — let’s build your first set',
    html: welcomeEmailHtml(user.displayName)
  });
}

// Fires exactly once per brand-new Firebase Auth account, regardless of
// sign-in method (Google or email link) — this is the single authoritative
// place the registered-users counter is incremented, so it can never be
// double-counted by repeat client-side logins.
exports.onUserCreated = functionsV1
  .runWith({ secrets: [SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS] })
  .auth.user()
  .onCreate(async function (user) {
    try {
      await db.collection('users').doc(user.uid).set(
        {
          email: user.email || null,
          displayName: user.displayName || null,
          photoURL: user.photoURL || null,
          provider: (user.providerData[0] && user.providerData[0].providerId) || 'password',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );
    } catch (err) {
      logger.error('onUserCreated: failed to write user profile', err);
    }

    try {
      await db.collection('stats').doc('counters').set(
        { userCount: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
    } catch (err) {
      logger.error('onUserCreated: failed to increment registered-users counter', err);
    }

    try {
      if (user.email) await sendWelcomeEmail(user);
    } catch (err) {
      logger.error('onUserCreated: failed to send welcome email', err);
    }
  }
);
