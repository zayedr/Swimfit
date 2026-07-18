/**
 * Swimfit — Paddle Billing webhook receiver.
 *
 * Deploy target: Firebase Cloud Functions (2nd gen), project "swimfi-ae".
 * Verifies Paddle's webhook signature manually (HMAC-SHA256 over "<timestamp>:<rawBody>",
 * per Paddle's documented scheme), so no Paddle SDK or API key is required — only the
 * webhook signing secret from the Paddle dashboard.
 *
 * Setup (one-time):
 *   1. cd functions && npm install
 *   2. firebase deploy --only functions   (deploys with a placeholder secret prompt)
 *   3. Copy the deployed function's HTTPS URL, register it in the Paddle dashboard under
 *      Developer Tools -> Notifications -> Webhook destinations (select the events you
 *      want, e.g. subscription.created/updated/canceled, transaction.completed).
 *   4. Paddle then shows a webhook signing secret for that destination. Store it with:
 *        firebase functions:secrets:set PADDLE_WEBHOOK_SECRET
 *      (paste the secret when prompted), then redeploy:
 *        firebase deploy --only functions
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const crypto = require('crypto');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const PADDLE_WEBHOOK_SECRET = defineSecret('PADDLE_WEBHOOK_SECRET');

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
