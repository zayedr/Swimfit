  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
  import {
    getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
    setPersistence, browserLocalPersistence, browserSessionPersistence,
    getAdditionalUserInfo
  } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
  import {
    getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp,
    collection, addDoc, query, where, orderBy, limit, getDocs, Timestamp, runTransaction
  } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyDSB_A998Dyf7ryXdJ8hgbyEc3_QF94bbQ",
    authDomain: "swimfi-ae.firebaseapp.com",
    projectId: "swimfi-ae",
    storageBucket: "swimfi-ae.firebasestorage.app",
    messagingSenderId: "122377858721",
    appId: "1:122377858721:web:a138a0cfb0b8df3bf68ae0",
    measurementId: "G-GKCG1EJXE0"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const googleProvider = new GoogleAuthProvider();

  // Explicit rather than relying on the SDK default: sign-in survives a
  // refresh or closed tab (IndexedDB-backed). Some browser contexts (Safari
  // private browsing, third-party storage blocked) refuse IndexedDB entirely —
  // fall back to sessionStorage-backed persistence there rather than leaving
  // the swimmer stuck on an auth call that never resolves.
  setPersistence(auth, browserLocalPersistence).catch(function () {
    return setPersistence(auth, browserSessionPersistence);
  });

  /* ============================= CUSTOM WELCOME EMAIL (frontend trigger) =============================
     Sends a branded HTML welcome email the moment a brand-new account is
     created, entirely from the client via EmailJS (https://www.emailjs.com) —
     no server, and completely independent of Firebase Auth's built-in
     (Console-locked) verification/reset templates.

     SETUP (one-time, all in the EmailJS dashboard — takes ~5 min):
       1. Create a free EmailJS account and connect an email service
          (Gmail/Outlook/SMTP) → note the *Service ID*.
       2. Create an Email Template whose body is exactly:  {{{message_html}}}
          (triple braces = render raw HTML), subject:  {{subject}} , and set
          the "To email" field to  {{to_email}} . → note the *Template ID*.
       3. Copy your *Public Key* (Account → General / API Keys).
       4. Paste all three below. Until then this no-ops (never blocks signup).

     NOTE: This is a *client-side* sender — the Public Key is visible in page
     source (that is by design for EmailJS), so anyone could in principle reuse
     it to send your template; EmailJS's own rate-limits/allowed-origins are the
     mitigation. The more robust path is the existing server-side
     `onUserCreated` Cloud Function (functions/index.js), which already sends a
     custom welcome email over SMTP once per account. Enable only ONE of the two
     to avoid sending two welcome emails. */
  const EMAILJS_PUBLIC_KEY  = 'sxcX3ruBKP8Iys3RI';   // EmailJS Public Key (Account → API Keys)
  const EMAILJS_SERVICE_ID  = 'service_vdzwomv';     // EmailJS Email Service ID
  const EMAILJS_TEMPLATE_ID = 'template_s7rp3m6';    // EmailJS Email Template ID
  const EMAILJS_SDK_URL = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';

  function buildWelcomeEmailHtml(firstName) {
    var name = (firstName || 'Swimmer').replace(/[<>&]/g, '');
    return '' +
      '<div style="margin:0;padding:0;background:#0A0812;font-family:Arial,Helvetica,sans-serif;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0812;padding:28px 12px;"><tr><td align="center">' +
      '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1A1526;border:1px solid rgba(148,163,184,0.18);border-radius:16px;overflow:hidden;">' +
        // Header
        '<tr><td style="padding:32px 36px 20px;border-bottom:1px solid rgba(148,163,184,0.14);">' +
          '<div style="font-size:26px;font-weight:800;letter-spacing:1px;color:#F8FAFC;">SWIM<span style="color:#39FF9E;">FIT</span></div>' +
        '</td></tr>' +
        // Hero / welcome
        '<tr><td style="padding:32px 36px 8px;">' +
          '<h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#F8FAFC;">Welcome to the squad, ' + name + '! 🏊</h1>' +
          '<p style="margin:0;font-size:15px;line-height:1.6;color:#AEBBCC;">This is the day your training gets serious. Swimfit is your personal, always-adaptive swim &amp; dryland coach — a fresh, professionally-structured workout every single day, plus the tools to actually watch yourself get faster. No more guessing what to swim. Just show up, and we’ll have the set ready. Let’s command the water together. 💪</p>' +
        '</td></tr>' +
        // Trial offer banner
        '<tr><td style="padding:20px 36px 4px;">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(22,214,115,0.16),rgba(232,137,12,0.12));border:1px solid rgba(22,214,115,0.35);border-radius:12px;"><tr><td style="padding:18px 22px;">' +
            '<div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#39FF9E;">Your 3 days of full access are live — right now</div>' +
            '<div style="font-size:14px;line-height:1.5;color:#E7EDF3;margin-top:4px;">Every feature unlocked, no card needed. The swimmers who improve fastest start on day one — so dive in today while it’s all open.</div>' +
          '</td></tr></table>' +
        '</td></tr>' +
        // Feature highlights
        '<tr><td style="padding:24px 36px 8px;">' +
          '<div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#FFA53D;margin-bottom:12px;">What’s waiting for you</div>' +
          [
            ['🏊', 'Daily-rotating swim workouts', 'A full warm-up-to-cool-down set built from your discipline, distance, gear &amp; goals — new every day.'],
            ['🏋️', 'Tailored dryland &amp; gym focus', 'Muscle-group routines with live technique demos, matched to your swimming.'],
            ['🤖', 'AI Swim Coach', 'Ask anything about technique, pacing or your log — attach a photo for real feedback.'],
            ['📊', 'Distance Tracker', 'Log every swim and watch your weekly &amp; monthly volume, pace and PBs climb.'],
            ['🎓', 'Technique Academy', 'Stroke-by-stroke video breakdowns — 100% free, no tiers.']
          ].map(function (f) {
            return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>' +
              '<td width="34" valign="top" style="font-size:20px;padding-top:2px;">' + f[0] + '</td>' +
              '<td valign="top"><div style="font-size:15px;font-weight:700;color:#F8FAFC;">' + f[1] + '</div>' +
              '<div style="font-size:13px;line-height:1.5;color:#AEBBCC;margin-top:2px;">' + f[2] + '</div></td>' +
            '</tr></table>';
          }).join('') +
        '</td></tr>' +
        // Upsell — keep access after the trial
        '<tr><td style="padding:8px 36px 4px;">' +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(224,106,130,0.14),rgba(232,137,12,0.10));border:1px solid rgba(224,106,130,0.32);border-radius:12px;"><tr><td style="padding:18px 22px;">' +
            '<div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#E06A82;">Don’t lose your momentum on day 4</div>' +
            '<div style="font-size:14px;line-height:1.55;color:#E7EDF3;margin-top:6px;">Your 3-day trial is the on-ramp — real progress comes from the weeks that follow. Lock in a plan <strong>before your trial ends</strong> to keep your daily workouts, AI Coach and progress tracking without a single interruption. Plans start at just <strong>$13/month</strong>, and Ultra gives you two months free on annual.</div>' +
            '<div style="margin-top:12px;"><a href="https://swimfit.online" style="display:inline-block;background:transparent;color:#FFA53D;border:1px solid rgba(255,165,61,0.5);font-size:13px;font-weight:700;text-decoration:none;padding:9px 18px;border-radius:999px;">See plans &amp; keep training →</a></div>' +
          '</td></tr></table>' +
        '</td></tr>' +
        // CTA
        '<tr><td align="center" style="padding:18px 36px 34px;">' +
          '<a href="https://swimfit.online" style="display:inline-block;background:#16D673;color:#04120A;font-size:15px;font-weight:800;letter-spacing:0.5px;text-decoration:none;padding:14px 34px;border-radius:999px;">Start Training Today →</a>' +
        '</td></tr>' +
        // Footer
        '<tr><td style="padding:20px 36px;border-top:1px solid rgba(148,163,184,0.14);">' +
          '<p style="margin:0;font-size:12px;line-height:1.6;color:#7C8AA0;">You’re receiving this because you created a Swimfit account at swimfit.online. Questions? Just reply to this email.</p>' +
        '</td></tr>' +
      '</table></td></tr></table></div>';
  }

  // Registers the EmailJS public key on the loaded SDK. In v4, send() also
  // accepts { publicKey } as its 4th argument, but some SDK builds/paths only
  // honor a key registered via init() — calling both is belt-and-suspenders and
  // a common fix for "send silently does nothing / rejects with a public-key
  // error". Safe to call more than once.
  function initEmailJs(emailjs) {
    if (!emailjs || !EMAILJS_PUBLIC_KEY) return;
    try {
      // v4 signature (object). Falls back to the v3 string signature if needed.
      emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
    } catch (e) {
      try { emailjs.init(EMAILJS_PUBLIC_KEY); } catch (e2) { console.error('WELCOME EMAIL ERROR: emailjs.init failed:', e2); }
    }
  }

  var emailjsLoadPromise = null;
  function loadEmailJs() {
    if (window.emailjs) { initEmailJs(window.emailjs); return Promise.resolve(window.emailjs); }
    if (emailjsLoadPromise) return emailjsLoadPromise;
    emailjsLoadPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = EMAILJS_SDK_URL; s.async = true;
      s.onload = function () { initEmailJs(window.emailjs); resolve(window.emailjs); };
      s.onerror = function () { reject(new Error('EmailJS SDK failed to load — check network / ad-blocker / CSP for cdn.jsdelivr.net')); };
      document.head.appendChild(s);
    });
    return emailjsLoadPromise;
  }

  // PRODUCTION: false — the welcome email is sent ONCE per genuinely new
  // account only (gated by getAdditionalUserInfo(result).isNewUser in the
  // Google sign-in handler), and the per-uid localStorage guard prevents a
  // double-send. Flip to true only for temporary live testing (fires on every
  // sign-in and bypasses the guard).
  var WELCOME_EMAIL_TEST_MODE = false;

  // Fires per account-creation success path (and, while WELCOME_EMAIL_TEST_MODE
  // is on, on every Google sign-in for live testing). A per-uid localStorage
  // guard is belt-and-suspenders against a double submit — skipped in test mode.
  function sendWelcomeEmail(user, fullName) {
    try {
      if (!user || !user.email) return;
      if (!EMAILJS_PUBLIC_KEY || !EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
        console.info('[Swimfit] Welcome email skipped — EmailJS not configured yet (set EMAILJS_* constants in index.html).');
        return;
      }
      var guardKey = 'swimfit_welcome_email_' + user.uid;
      if (!WELCOME_EMAIL_TEST_MODE) {
        try { if (localStorage.getItem(guardKey)) return; } catch (e) { /* private mode — proceed */ }
      }
      var first = ((fullName || user.displayName || '').trim().split(' ')[0]) || 'Swimmer';
      var displayName = user.displayName || 'Swimmer';
      // Live execution marker so the send can be verified in the console.
      console.log('SENDING WELCOME EMAIL TO:', user.email);
      var brandedHtml = buildWelcomeEmailHtml(first);
      loadEmailJs().then(function (emailjs) {
        // Send EVERY common EmailJS variable name so the send succeeds and the
        // full SwimFit branding renders regardless of how the "Welcome"
        // template's fields happen to be defined:
        //   • recipient email: to_email / user_email / email
        //   • recipient name:  to_name / user_name / name
        //   • the branded body (SWIMFIT wordmark, aqua/green colors, 3-day-trial
        //     banner, feature list, upsell, "Start Training" CTA to
        //     swimfit.online) is passed under BOTH message_html and message, so
        //     a template using {{{message_html}}} OR {{{message}}} renders it.
        //   • logo_url / company_name / site_url for templates with their own
        //     branded header slots.
        var templateParams = {
          to_email: user.email,
          user_email: user.email,
          email: user.email,
          to_name: displayName,
          user_name: displayName,
          name: displayName,
          reply_to: 'swimfit.ae@gmail.com',
          subject: 'Welcome to Swimfit — your 3-day free trial is live 🏊',
          title: 'Welcome to Swimfit 🏊',
          company_name: 'Swimfit',
          site_url: 'https://swimfit.online',
          logo_url: 'https://swimfit.online',
          message_html: brandedHtml,
          message: brandedHtml
        };
        return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams, { publicKey: EMAILJS_PUBLIC_KEY });
      }).then(function (resp) {
        try { localStorage.setItem(guardKey, String(Date.now())); } catch (e) { /* ignore */ }
        console.log('WELCOME EMAIL SENT:', (resp && resp.status) || 'OK', '→', user.email);
      }).catch(function (err) {
        // Surface the EXACT EmailJS failure — an EmailJS reject carries a
        // numeric `.status` (e.g. 400/403/422) and a human `.text` explaining
        // the exact cause (bad Public Key, unknown template, blocked origin,
        // template-variable mismatch, etc.). Log all of it so the real reason a
        // send fails is never hidden. Still non-fatal to sign-in.
        console.error('WELCOME EMAIL ERROR:', err);
        if (err && (err.status !== undefined || err.text !== undefined)) {
          console.error('WELCOME EMAIL ERROR — status:', err.status, '| text:', err.text);
        }
      });
    } catch (e) { console.error('WELCOME EMAIL ERROR:', e); }
  }

  // Exposed so the plain <script> (AI Swim Coach widget) can attach a fresh
  // Firebase ID token to its Cloud Function call without importing the SDK
  // itself. Rejects cleanly if nobody's signed in — the widget treats that
  // the same as any other "please sign in" case.
  window.__firebaseGetIdToken = function () {
    return auth.currentUser ? auth.currentUser.getIdToken() : Promise.reject(new Error('Not signed in'));
  };

  // Resolves this swimmer's own Paddle customer id (ctm_...) for Paddle
  // Retain's pwCustomer — mirrors the exact same subscriptions-then-customers
  // lookup-by-firebaseUid the paddleCustomerPortalSession Cloud Function does
  // server-side (see functions/index.js), just run client-side against the
  // owner-only read rules already in firestore.rules for both collections.
  // Resolves to null (not an error) for a swimmer with no billing record yet —
  // that's the normal case for anyone who hasn't subscribed.
  window.__resolvePaddleCustomerId = function (uid) {
    var subQ = query(collection(db, 'subscriptions'), where('firebaseUid', '==', uid), limit(1));
    return getDocs(subQ).then(function (snap) {
      if (!snap.empty) return snap.docs[0].data().customerId || snap.docs[0].id;
      var custQ = query(collection(db, 'customers'), where('firebaseUid', '==', uid), limit(1));
      return getDocs(custQ).then(function (custSnap) {
        return custSnap.empty ? null : (custSnap.docs[0].data().customerId || custSnap.docs[0].id);
      });
    }).catch(function () { return null; });
  };

  // Persisted AI Coach chat history for the full-screen Coach page — any
  // signed-in, non-suspended swimmer (no tier gate; see coach_history rules
  // in firestore.rules). Text only, never image bytes — kept well under
  // Firestore's 1 MiB document limit.
  window.__coachHistoryLoad = function (uid) {
    return getDoc(doc(db, 'coach_history', uid)).then(function (snap) { return snap.exists() ? snap.data() : null; });
  };
  window.__coachHistorySave = function (uid, messages) {
    return setDoc(doc(db, 'coach_history', uid), { messages: messages, updatedAt: serverTimestamp() }, { merge: true }).catch(function () {});
  };

  // Same persistence, separate document, for the floating AI Coach widget —
  // a distinct surface/context from the full-screen page, so its transcript
  // is kept in its own coach_widget_history/{uid} doc rather than merging
  // (and confusing) the two conversations.
  window.__coachWidgetHistoryLoad = function (uid) {
    return getDoc(doc(db, 'coach_widget_history', uid)).then(function (snap) { return snap.exists() ? snap.data() : null; });
  };
  window.__coachWidgetHistorySave = function (uid, messages) {
    return setDoc(doc(db, 'coach_widget_history', uid), { messages: messages, updatedAt: serverTimestamp() }, { merge: true }).catch(function () {});
  };

  // Multi-thread AI Coach page (Gemini/ChatGPT-style topic sidebar) — each
  // thread is its own coach_threads/{uid}/threads/{threadId} doc, kept
  // separate from coach_history/{uid} above (that single-thread doc is now
  // legacy: still readable for a one-time migration into a "General" thread
  // the first time a returning swimmer with old history opens the redesigned
  // page, but no longer written to).
  window.__coachThreadsList = function (uid) {
    var q = query(collection(db, 'coach_threads', uid, 'threads'), orderBy('updatedAt', 'desc'));
    return getDocs(q).then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    });
  };
  window.__coachThreadCreate = function (uid, title, messages) {
    var now = serverTimestamp();
    return addDoc(collection(db, 'coach_threads', uid, 'threads'), { title: title, messages: messages || [], createdAt: now, updatedAt: now });
  };
  window.__coachThreadSave = function (uid, threadId, title, messages) {
    return setDoc(doc(db, 'coach_threads', uid, 'threads', threadId), { title: title, messages: messages, updatedAt: serverTimestamp() }, { merge: true }).catch(function () {});
  };
  window.__coachThreadDelete = function (uid, threadId) {
    return deleteDoc(doc(db, 'coach_threads', uid, 'threads', threadId));
  };

  // Custom Workout Builder — a swimmer's own hand-built workouts, saved to
  // custom_workouts/{uid}/entries/{workoutId} (see firestore.rules for the
  // doc shape/validation). Same list/create/save/delete shape as the
  // coach_threads bridges directly above, since a saved workout is
  // conceptually identical — a named, owner-only, editable-in-place doc a
  // swimmer picks from a sidebar-style list.
  window.__customWorkoutsList = function (uid) {
    var q = query(collection(db, 'custom_workouts', uid, 'entries'), orderBy('updatedAt', 'desc'));
    return getDocs(q).then(function (snap) {
      return snap.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
    });
  };
  window.__customWorkoutCreate = function (uid, name, blocks) {
    var now = serverTimestamp();
    return addDoc(collection(db, 'custom_workouts', uid, 'entries'), { name: name, blocks: blocks || [], createdAt: now, updatedAt: now });
  };
  window.__customWorkoutSave = function (uid, workoutId, name, blocks) {
    return setDoc(doc(db, 'custom_workouts', uid, 'entries', workoutId), { name: name, blocks: blocks, updatedAt: serverTimestamp() }, { merge: true });
  };
  window.__customWorkoutDelete = function (uid, workoutId) {
    return deleteDoc(doc(db, 'custom_workouts', uid, 'entries', workoutId));
  };

  // Distance Tracker data-access bridges — same "expose a narrow function on
  // window" pattern as __firebaseGetIdToken above, so the plain <script>
  // (which owns all of this feature's DOM/UI logic) never needs its own
  // Firestore SDK imports.
  window.__swimLogAdd = function (entry) {
    // entry: { distanceMeters: number, loggedAt: JS Date, discipline?: string, durationSeconds?: number }
    // — plain JS values only, since the caller (the bottom <script>) has no
    // Firestore SDK imports of its own; the Timestamp/serverTimestamp
    // conversion happens here, inside the module that actually imported them.
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    var payload = { distanceMeters: entry.distanceMeters, loggedAt: Timestamp.fromDate(entry.loggedAt), createdAt: serverTimestamp() };
    if (entry.discipline) payload.discipline = entry.discipline;
    if (entry.durationSeconds) payload.durationSeconds = entry.durationSeconds;
    return addDoc(collection(db, 'swim_logs', auth.currentUser.uid, 'entries'), payload);
  };
  window.__swimLogQuerySince = function (sinceDate) {
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    var q = query(
      collection(db, 'swim_logs', auth.currentUser.uid, 'entries'),
      where('loggedAt', '>=', Timestamp.fromDate(sinceDate)),
      orderBy('loggedAt', 'desc')
    );
    return getDocs(q).then(function (snap) {
      return snap.docs.map(function (d) {
        var data = d.data();
        return { id: d.id, distanceMeters: data.distanceMeters, loggedAt: data.loggedAt.toDate(), discipline: data.discipline || '', durationSeconds: data.durationSeconds || null };
      });
    });
  };
  window.__swimLogDelete = function (entryId) {
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    return deleteDoc(doc(db, 'swim_logs', auth.currentUser.uid, 'entries', entryId));
  };

  // Personal Best log entries — feeds the Distance Tracker's PB progression
  // chart. Same owner-only, create+delete (no in-place edit) shape as the
  // swim log above.
  window.__pbLogAdd = function (entry) {
    // entry: { discipline: string, distanceLabel: string, timeSeconds: number, loggedAt: JS Date }
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    return addDoc(collection(db, 'personal_bests', auth.currentUser.uid, 'entries'), {
      discipline: entry.discipline,
      distanceLabel: entry.distanceLabel,
      timeSeconds: entry.timeSeconds,
      loggedAt: Timestamp.fromDate(entry.loggedAt),
      createdAt: serverTimestamp()
    });
  };
  window.__pbLogQueryAll = function () {
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    var q = query(collection(db, 'personal_bests', auth.currentUser.uid, 'entries'), orderBy('loggedAt', 'asc'));
    return getDocs(q).then(function (snap) {
      return snap.docs.map(function (d) {
        var data = d.data();
        return { id: d.id, discipline: data.discipline, distanceLabel: data.distanceLabel, timeSeconds: data.timeSeconds, loggedAt: data.loggedAt.toDate() };
      });
    });
  };
  window.__pbLogDelete = function (entryId) {
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    return deleteDoc(doc(db, 'personal_bests', auth.currentUser.uid, 'entries', entryId));
  };

  // Admin Panel direct-message thread — the swimmer's own side. Reading is
  // real-time (onSnapshot); replying writes directly to Firestore as
  // sender:'user' (see firestore.rules) — only the admin's own messages go
  // through a Cloud Function, since those need to reach an arbitrary uid.
  window.__adminChatSubscribeMeta = function (onNext, onError) {
    if (!auth.currentUser) return function () {};
    return onSnapshot(doc(db, 'admin_chats', auth.currentUser.uid), function (snap) {
      onNext(snap.exists() ? snap.data() : null);
    }, onError || function () {});
  };
  window.__adminChatSubscribeMessages = function (onNext, onError) {
    if (!auth.currentUser) return function () {};
    var q = query(collection(db, 'admin_chats', auth.currentUser.uid, 'messages'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, function (snap) {
      onNext(snap.docs.map(function (d) { return d.data(); }));
    }, onError || function () {});
  };
  window.__adminChatReply = function (text) {
    if (!auth.currentUser) return Promise.reject(new Error('Not signed in'));
    var uid = auth.currentUser.uid;
    var now = serverTimestamp();
    // The message write (into the /messages subcollection) is the only part
    // that actually delivers the swimmer's text — that's what the caller's
    // success/failure branch should be judged on. The metadata doc write
    // (mirroring __adminPanelSendMessage's two-write shape below) only
    // updates the Admin Panel's unread-dot/last-message-preview; it's a
    // real, historically-documented case that this specific write path can
    // be rejected by a firestore.rules deploy that predates it while the
    // message write itself still succeeds under any rules version. Bundling
    // both into one Promise.all meant that lag alone made a genuinely-sent
    // message get reported to the swimmer as "could not send" — so the
    // metadata write now runs best-effort, logged but never surfaced as a
    // send failure.
    return addDoc(collection(db, 'admin_chats', uid, 'messages'), { sender: 'user', text: text, createdAt: now }).then(function (ref) {
      setDoc(doc(db, 'admin_chats', uid), { lastMessageText: text, lastMessageAt: now, lastSender: 'user', unreadForAdmin: true }, { merge: true })
        .catch(function (err) { console.warn('admin_chats metadata update failed (non-fatal, message itself was sent):', err); });
      return ref;
    });
  };
  // Marks the admin's messages as seen once the swimmer actually opens the
  // conversation — feeds the Admin Panel's WhatsApp-style read-receipt ticks
  // below. Best-effort/non-fatal: a failed write here only means a tick
  // stays on "Sent" a little longer, never a lost or blocked message.
  window.__adminChatMarkSeenByUser = function () {
    if (!auth.currentUser) return Promise.resolve();
    return setDoc(doc(db, 'admin_chats', auth.currentUser.uid), { unreadForUser: false }, { merge: true })
      .catch(function (err) { console.warn('admin_chats read-receipt update failed (non-fatal):', err); });
  };

  // Admin Panel direct-message thread — the admin's own side. Real-time on
  // both directions via firestore.rules' isAdminAuth() (the admin's own
  // verified ID token email claim, checked directly in rules — no Cloud
  // Function round-trip), so a swimmer's reply and the admin's own message
  // both land instantly via onSnapshot instead of a 20s poll.
  window.__adminPanelSubscribeInbox = function (onNext, onError) {
    return onSnapshot(collection(db, 'admin_chats'), function (snap) {
      var byUid = {};
      snap.forEach(function (d) { byUid[d.id] = d.data(); });
      onNext(byUid);
    }, onError || function () {});
  };
  window.__adminPanelSubscribeThread = function (targetUid, onNext, onError) {
    var q = query(collection(db, 'admin_chats', targetUid, 'messages'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, function (snap) { onNext(snap.docs.map(function (d) { return d.data(); })); }, onError || function () {});
  };
  window.__adminPanelMarkRead = function (targetUid) {
    return setDoc(doc(db, 'admin_chats', targetUid), { unreadForAdmin: false }, { merge: true });
  };
  window.__adminPanelSendMessage = function (targetUid, text) {
    var now = serverTimestamp();
    return Promise.all([
      addDoc(collection(db, 'admin_chats', targetUid, 'messages'), { sender: 'admin', text: text, createdAt: now }),
      setDoc(doc(db, 'admin_chats', targetUid), { lastMessageText: text, lastMessageAt: now, lastSender: 'admin', unreadForUser: true, unreadForAdmin: false }, { merge: true })
    ]);
  };

  // House account that always has full, unrestricted "Ultra" access sitewide —
  // client side this only ever drives cosmetic UI (badge, skipping upsell
  // copy, skipping real-money checkout); the one function call that actually
  // enforces a limit (aiSwimCoach's daily message cap) re-checks this same
  // address server-side against the verified ID token, so this constant being
  // visible in page source grants nothing by itself. Keep in sync with
  // ADMIN_EMAILS in functions/index.js.
  var SWIMFIT_ADMIN_EMAIL = 'swimfit.ae@gmail.com';

  // Every signed-in user (Google or password) gets a Firestore profile doc.
  // createdAt is only ever set once, on the very first sign-in — everything
  // else (lastLoginAt, provider, display name/photo) refreshes on every visit.
  // The authoritative "how many swimmers have registered" count is NOT kept
  // here — it's incremented exactly once per brand-new account by the
  // onUserCreated Cloud Function (see functions/index.js), so repeat logins
  // or a failed client write here can never double-count it.
  async function ensureUserProfile(user) {
    try {
      var ref = doc(db, 'users', user.uid);
      var snap = await getDoc(ref);
      var payload = {
        email: user.email || null,
        displayName: user.displayName || null,
        photoURL: user.photoURL || null,
        provider: (user.providerData[0] && user.providerData[0].providerId) || 'password',
        lastLoginAt: serverTimestamp()
      };
      // STRICT 3-day trial measured from the account's REAL creation time.
      // Firebase Auth exposes that on user.metadata.creationTime (an RFC date
      // string), which is authoritative and identical on every device/session
      // — so the trial can't be reset by clearing storage, and it applies
      // uniformly to old and new accounts alike. We no longer "grandfather" a
      // pre-existing account to a fresh trial starting now: an account created
      // more than 3 days ago with no active plan is correctly expired.
      var creationTime = (user.metadata && user.metadata.creationTime) ? new Date(user.metadata.creationTime) : null;
      if (creationTime && isNaN(creationTime.getTime())) creationTime = null;
      var existingTrialStart = snap.exists() && snap.data().trialStartedAt ? snap.data().trialStartedAt.toDate() : null;
      // The access decision's source of truth for "when did the trial start":
      // real creation time first, then any stored trialStartedAt, then now.
      var trialStart = creationTime || existingTrialStart || new Date();
      if (!snap.exists()) {
        payload.createdAt = creationTime ? Timestamp.fromDate(creationTime) : serverTimestamp();
        payload.trialStartedAt = Timestamp.fromDate(trialStart);
      } else if (!existingTrialStart) {
        // Backfill from the real creation time (not "now"), so the Admin Panel's
        // trial column matches the strict-from-creation lock the swimmer sees.
        payload.trialStartedAt = Timestamp.fromDate(trialStart);
      }
      await setDoc(ref, payload, { merge: true });
      window.__swimfitTrialStartedAt = trialStart;
      recomputeAccessLevel();
    } catch (e) {
      // Non-fatal — the user stays signed in either way; this only affects
      // the optional Firestore profile convenience data.
    }
  }

  // Live "Total Active Subscribers" counter — reads activeSubscriberCount off
  // the public stats/counters doc the Cloud Function maintains.
  // That field is maintained server-side by onSubscriptionWrite (functions/index.js),
  // a Firestore trigger on subscriptions/{subscriptionId} that increments/decrements
  // it whenever a subscription's status crosses the active/trialing boundary — never
  // computed client-side, since a swimmer has no read access to any subscription but
  // their own.
  function wireActiveSubscribersCounter() {
    var el = document.getElementById('activeSubscribersCount');
    var tile = document.getElementById('activeSubscribersStat');
    if (!el || !tile) return;
    var settled = false;
    var timeout = setTimeout(function () { if (!settled) tile.style.display = 'none'; }, 8000);
    try {
      onSnapshot(doc(db, 'stats', 'counters'), function (snap) {
        settled = true;
        clearTimeout(timeout);
        var count = snap.exists() && typeof snap.data().activeSubscriberCount === 'number' ? snap.data().activeSubscriberCount : null;
        if (count == null) { tile.style.display = 'none'; return; }
        tile.style.display = '';
        animateCountTo(el, count);
      }, function () {
        settled = true;
        tile.style.display = 'none';
      });
    } catch (e) {
      tile.style.display = 'none';
    }
  }
  function animateCountTo(el, target) {
    var start = parseInt(el.textContent, 10) || 0;
    var startTime = null, duration = 900;
    function step(ts) {
      if (!startTime) startTime = ts;
      var progress = Math.min((ts - startTime) / duration, 1);
      el.textContent = Math.round(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ============================= ACCESS LEVEL (informational trial/plan badge only) =============================
  // There is no paywall anywhere in this app — every signed-in, non-suspended
  // swimmer gets full access to everything (AI Coach, photo analysis,
  // Elite-level workouts, all of it), regardless of trial status or whether
  // a Paddle plan is active. Resolves 'admin' for the house account (see
  // SWIMFIT_ADMIN_EMAIL above), 'locked' *only* if the admin has manually
  // suspended this account (accessDisabled — the sole remaining gate on the
  // whole site), otherwise 'trial' / the real Paddle plan / 'unlocked' —
  // these three are purely informational (nav badge, Admin Panel), never
  // used to block anything. Mirrors the server-side resolution in
  // functions/index.js (getAccessLevel), which enforces the same thing for
  // the one call that costs money (aiSwimCoach): full access unless
  // accessDisabled.
  var TRIAL_DAYS = 3;
  var latestSubscriptionDoc = null; // last paddle_subscriptions/{uid} snapshot data, or null
  var unsubscribeSubscriptionDoc = null;
  var latestAccessDisabled = false; // live users/{uid}.accessDisabled — an admin-set manual suspension
  var unsubscribeOwnProfileDoc = null;

  function recomputeAccessLevel() {
    var user = window.__firebaseUser;
    if (!user) {
      window.__swimfitAccess = null;
      document.dispatchEvent(new CustomEvent('swimfit:accesschange', { detail: { access: null } }));
      return;
    }
    // The admin override is checked FIRST, before anything else on this page,
    // so nothing below — a trial date, a subscription doc, an accessDisabled
    // flag someone fat-fingered in the Firestore console — can ever touch it.
    // This is intentionally the one and only place a signed-in session
    // resolves to 'admin': every other tier gate (Coach page, Workouts Elite
    // lock, the global paywall) reads window.__swimfitAccess.level, never
    // re-derives admin status itself.
    if (window.__isAdminAccount) {
      window.__swimfitAccess = { level: 'admin', trialEndsAt: null };
      document.dispatchEvent(new CustomEvent('swimfit:accesschange', { detail: { access: window.__swimfitAccess } }));
      return;
    }
    // Treat "don't know the real trial start yet" (the brief window before
    // ensureUserProfile's Firestore round-trip resolves) as "just started" —
    // fail open into a fresh trial rather than ever computing a null
    // trialEndsAt, which every 'trial'-level UI (the nav badge countdown)
    // assumes is always a real Date once level is 'trial'.
    var trialStart = window.__swimfitTrialStartedAt || new Date();
    var trialEndsAt = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    var level;
    if (latestAccessDisabled) {
      // The one and only remaining lock on this entire site: an admin-set
      // manual suspension. Mirrors getAccessLevel() server-side.
      level = 'locked';
    } else if (latestSubscriptionDoc && latestSubscriptionDoc.plan &&
               ['active', 'trialing'].indexOf(latestSubscriptionDoc.status) > -1) {
      level = latestSubscriptionDoc.plan;
    } else if (Date.now() < trialEndsAt.getTime()) {
      level = 'trial';
    } else {
      // Trial elapsed with no active paid plan → hard lock. This is a real
      // access gate now (re-introduced at the user's explicit request): the
      // paywall overlay below full-screen-locks the site for an 'expired'
      // swimmer, blocking every interactive section until they subscribe. Only
      // the admin bypass and an active Paddle plan (both handled above) can
      // keep a signed-in account out of this state once its 3 days are up.
      level = 'expired';
    }
    window.__swimfitAccess = { level: level, trialEndsAt: trialEndsAt };
    document.dispatchEvent(new CustomEvent('swimfit:accesschange', { detail: { access: window.__swimfitAccess } }));
  }
  // A trial can cross its expiry boundary while a tab just sits open — recheck
  // periodically rather than only reacting to Firestore/auth changes. 30s
  // (not the previous 5min) so the nav countdown reads as live and a trial
  // hitting zero locks the dashboard within moments, not minutes.
  setInterval(recomputeAccessLevel, 30 * 1000);

  // Friendly copy for the Firebase Auth error codes real users actually hit in
  // production — including the easy-to-forget Firebase Console "authorized
  // domains" toggle, so a misconfiguration shows up as a clear message here
  // instead of a generic "sign-in failed".
  var AUTH_ERROR_MESSAGES = {
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/cancelled-popup-request': 'Sign-in was cancelled.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup — please allow popups for this site and try again.',
    'auth/unauthorized-domain': 'This domain isn’t authorized for sign-in yet — please contact support.',
    'auth/network-request-failed': 'Network error — please check your connection and try again.',
    'auth/invalid-email': 'That email address doesn’t look valid — please double-check it.',
    'auth/operation-not-allowed': 'This sign-in method isn’t enabled yet — please contact support.',
    'auth/user-disabled': 'This account has been disabled — please contact support.',
    'auth/too-many-requests': 'Too many attempts — please wait a moment and try again.',
    'auth/email-already-in-use': 'An account already exists for this email — try signing in instead.',
    'auth/weak-password': 'Password must be at least 8 characters, with at least one letter and one number.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account found for that email — check the address or create an account.',
    'auth/missing-password': 'Please enter your password.'
  };
  function describeAuthError(error, fallback) {
    return (error && AUTH_ERROR_MESSAGES[error.code]) || fallback;
  }

  // Real Google sign-in: clicking the button opens Google's own native popup,
  // which handles the entire login (including any 2-step verification) itself —
  // this page never sees or asks for a password. Google is now the ONLY
  // sign-in/sign-up mechanic on the whole site: the Email/Password forms,
  // fields and logic were removed entirely (along with the legacy email-OTP
  // path before them), so there are no password-related errors to hit and
  // every account is guaranteed a real, Google-verified email address.

  function wireFirebaseAuthUI() {
    var googleBtn = document.getElementById('googleLoginBtn');
    var statusNote = document.getElementById('authStatusNote');
    var authModal = document.getElementById('authModal');
    var logoutBtn = document.getElementById('navLogoutBtn');
    if (!googleBtn || !logoutBtn) return;

    onAuthStateChanged(auth, function (user) {
      window.__firebaseUser = user; // mirrored globally so the plain <script> (pricing Subscribe buttons) can read it
      window.__isAdminAccount = !!(user && user.email && user.email.toLowerCase().trim() === SWIMFIT_ADMIN_EMAIL);
      document.querySelectorAll('[data-admin-only]').forEach(function (el) { el.style.display = window.__isAdminAccount ? '' : 'none'; });
      // Seed the trial start synchronously from the account's real creation
      // time (Firebase Auth metadata) so an already-expired account locks the
      // instant auth resolves, without waiting on the ensureUserProfile
      // Firestore round-trip. ensureUserProfile reconciles/persists it below.
      var __creation = (user && user.metadata && user.metadata.creationTime) ? new Date(user.metadata.creationTime) : null;
      window.__swimfitTrialStartedAt = (__creation && !isNaN(__creation.getTime())) ? __creation : null;
      latestSubscriptionDoc = null;
      latestAccessDisabled = false;
      if (unsubscribeSubscriptionDoc) { unsubscribeSubscriptionDoc(); unsubscribeSubscriptionDoc = null; }
      if (unsubscribeOwnProfileDoc) { unsubscribeOwnProfileDoc(); unsubscribeOwnProfileDoc = null; }
      if (user && !window.__isAdminAccount) {
        unsubscribeSubscriptionDoc = onSnapshot(doc(db, 'paddle_subscriptions', user.uid), function (snap) {
          latestSubscriptionDoc = snap.exists() ? snap.data() : null;
          recomputeAccessLevel();
        }, function () { latestSubscriptionDoc = null; recomputeAccessLevel(); });
        // Live so an admin toggling accessDisabled (adminToggleAccess) takes
        // effect immediately for an already-open tab, not just on next sign-in.
        unsubscribeOwnProfileDoc = onSnapshot(doc(db, 'users', user.uid), function (snap) {
          latestAccessDisabled = !!(snap.exists() && snap.data().accessDisabled);
          recomputeAccessLevel();
        }, function () { latestAccessDisabled = false; recomputeAccessLevel(); });
      }
      recomputeAccessLevel();
      document.querySelectorAll('[data-auth-signed-out]').forEach(function (el) { el.style.display = user ? 'none' : ''; });
      document.querySelectorAll('[data-auth-signed-in]').forEach(function (el) { el.style.display = user ? '' : 'none'; });
      logoutBtn.textContent = user && user.displayName ? 'Log Out (' + user.displayName.split(' ')[0] + ')' : 'Log Out';
      if (user) ensureUserProfile(user);
      document.dispatchEvent(new CustomEvent('swimfit:authchange', { detail: { user: user } }));
    });

    googleBtn.addEventListener('click', function () {
      googleBtn.disabled = true;
      statusNote.style.color = '';
      statusNote.textContent = 'Waiting for Google sign-in…';
      signInWithPopup(auth, googleProvider).then(function (result) {
        statusNote.textContent = 'Signed in as ' + (result.user.displayName || result.user.email) + '.';
        // Welcome email trigger — PRODUCTION behavior: send ONLY to genuinely
        // new accounts, detected via getAdditionalUserInfo(result).isNewUser
        // (Firebase's own "was this account just created?" flag). A returning
        // Google sign-in never re-triggers it. (WELCOME_EMAIL_TEST_MODE, off in
        // production, can force it on every sign-in for live testing.)
        try {
          var info = getAdditionalUserInfo(result);
          var isNewUser = !!(info && info.isNewUser);
          console.log('[Swimfit] Google sign-in — isNewUser:', isNewUser, '| email:', result.user.email);
          if (WELCOME_EMAIL_TEST_MODE || isNewUser) {
            sendWelcomeEmail(result.user, result.user.displayName);
          }
        } catch (e) { console.error('WELCOME EMAIL ERROR:', e); }
        setTimeout(function () { if (authModal) authModal.classList.remove('open'); }, 700);
      }).catch(function (error) {
        statusNote.style.color = '#e5484d';
        statusNote.textContent = describeAuthError(error, 'Sign-in failed — please try again.');
      }).finally(function () {
        googleBtn.disabled = false;
      });
    });

    logoutBtn.addEventListener('click', function () { signOut(auth); });

    // Google is the only sign-in path — no password form to wire up.
    wireActiveSubscribersCounter();
  }

  // Backs the live "is this available?" check in the Create Account form's
  // Username field. The actual uniqueness guarantee is enforced by
  // claimUsernameAndProfile's atomic usernames/{name} claim transaction
  // (below, in wireFirebaseAuthUI) — this is purely a client-side courtesy
  // check to give fast feedback before a swimmer ever submits.
  window.__checkUsernameTaken = function (username) {
    return getDoc(doc(db, 'usernames', username)).then(function (snap) { return snap.exists(); });
  };

  // Settings tab: read the swimmer's own profile doc, and write back the
  // safe subset of fields (fullName, country, age, disciplines).
  // Username changes go through __renameUsername below
  // instead — not this plain merge — since a rename has to atomically free
  // the old usernames/{name} reservation and claim the new one.
  window.__userProfileGet = function (uid) {
    return getDoc(doc(db, 'users', uid)).then(function (snap) { return snap.exists() ? snap.data() : null; });
  };
  window.__userProfileUpdate = function (uid, fields) {
    return setDoc(doc(db, 'users', uid), fields, { merge: true });
  };

  // Settings tab: atomic username rename — mirrors claimUsernameAndProfile's
  // create-only usernames/{name} guarantee, but also frees the swimmer's OLD
  // reservation in the same transaction (via the delete rule scoped to
  // "the doc's own uid", added alongside this feature) so a username never
  // ends up orphaned-but-unusable after a rename. A no-op if the requested
  // name is unchanged; rejects with Error('USERNAME_TAKEN') if someone else
  // already holds it.
  window.__renameUsername = function (uid, newUsername) {
    var newRef = doc(db, 'usernames', newUsername);
    var userRef = doc(db, 'users', uid);
    return runTransaction(db, function (tx) {
      return tx.get(userRef).then(function (userSnap) {
        var oldUsername = userSnap.exists() ? userSnap.data().username : null;
        if (oldUsername === newUsername) return;
        return tx.get(newRef).then(function (newSnap) {
          if (newSnap.exists()) throw new Error('USERNAME_TAKEN');
          tx.set(newRef, { uid: uid, createdAt: serverTimestamp() });
          if (oldUsername) tx.delete(doc(db, 'usernames', oldUsername));
          tx.set(userRef, { username: newUsername }, { merge: true });
        });
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireFirebaseAuthUI);
  } else {
    wireFirebaseAuthUI();
  }
