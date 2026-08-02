  /* ============================= PRICING — SUBSCRIBE (Firebase-gated Paddle Billing checkout) =============================
     Real Paddle PRICE ids (pri_...) as of 2026-07-19 — Paddle.Checkout.open()
     needs the price id, not the product id (pro_...) that used to live here;
     the product ids are still used server-side in functions/index.js
     (PADDLE_PLAN_BY_PRODUCT_ID) to resolve a webhook event to a plan, which is
     a separate, still-correct mapping unaffected by this fix. */
  var PADDLE_CLIENT_TOKEN = 'live_8981fe2520a3f946c975f5a1ad2';
  var PADDLE_PRICE_IDS = {
    pro: 'pri_01kxxv52g2r41z02hsbfzaepyv',
    elite: 'pri_01kxxvaqrfy9dqnaswssqabgx2',
    ultra: 'pri_01kxxves4frfx01sww4z6ah0bw'
  };
  var PLAN_LABELS = { pro: 'Pro', elite: 'Elite', ultra: 'Ultra' };
  var pendingSubscribePlan = null;
  var paddleReady = false;

  function paddleEventCallback(event) {
    if (event.name === 'checkout.completed') {
      alert('Thanks for subscribing to Swimfit! A confirmation is on its way to your email.');
    }
  }

  if (window.Paddle && PADDLE_CLIENT_TOKEN.indexOf('REPLACE_WITH_') !== 0) {
    try {
      Paddle.Environment.set('production');
      Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN, eventCallback: paddleEventCallback });
      paddleReady = true;
    } catch (e) {}
  }

  // Paddle Retain's pwCustomer identifies the signed-in customer to Paddle so
  // its dunning/recovery features (e.g. failed-payment emails) attach to the
  // right account — but a customer id (ctm_...) only exists once a swimmer
  // has actually subscribed at least once, and isn't known at the initial
  // page-load Initialize() call above (which must still run immediately, for
  // a signed-out visitor or a never-subscribed swimmer). Re-initializing
  // Paddle.js after resolving the id is the documented way to attach it once
  // it's known, without blocking the first Initialize() on an auth/Firestore
  // round-trip. Only ever fires with a REAL Paddle customer id — never the
  // Firebase uid or email — per Paddle's own pwCustomer contract.
  if (paddleReady) {
    document.addEventListener('swimfit:authchange', function (e) {
      if (!e.detail.user || typeof window.__resolvePaddleCustomerId !== 'function') return;
      window.__resolvePaddleCustomerId(e.detail.user.uid).then(function (customerId) {
        if (!customerId) return;
        try {
          Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN, eventCallback: paddleEventCallback, pwCustomer: { id: customerId } });
        } catch (e) {}
      });
    });
  }

  function goToPaddleCheckout(plan) {
    if (!paddleReady) {
      alert('Checkout is temporarily unavailable — please try again shortly, or email SWIMFIT.ae@gmail.com to join now.');
      return;
    }
    var checkoutSettings = { items: [{ priceId: PADDLE_PRICE_IDS[plan], quantity: 1 }] };
    if (window.__firebaseUser && window.__firebaseUser.email) {
      checkoutSettings.customer = { email: window.__firebaseUser.email };
    }
    if (window.__firebaseUser && window.__firebaseUser.uid) {
      // Echoed back on every Paddle webhook event so our Cloud Function can link the
      // subscription to this Firebase user (see functions/index.js).
      checkoutSettings.customData = { firebaseUid: window.__firebaseUser.uid };
    }
    Paddle.Checkout.open(checkoutSettings);
  }

  document.querySelectorAll('.price-card [data-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var plan = btn.dataset.plan;
      if (window.__isAdminAccount) { alert('This account already has full Ultra access — no need to subscribe!'); return; }
      if (window.__firebaseUser) { goToPaddleCheckout(plan); return; }
      pendingSubscribePlan = plan;
      window.openAuthModal();
      document.getElementById('authStatusNote').textContent = 'Sign in to subscribe to the ' + PLAN_LABELS[plan] + ' plan.';
    });
  });

  document.addEventListener('swimfit:authchange', function (e) {
    if (e.detail.user && pendingSubscribePlan) {
      var plan = pendingSubscribePlan;
      pendingSubscribePlan = null;
      if (window.__isAdminAccount) { alert('This account already has full Ultra access — no need to subscribe!'); return; }
      goToPaddleCheckout(plan);
    }
  });

  /* ============================= ACCESS-LOCK OVERLAY =============================
     Full-screen lock shown in two cases (see the overlay markup comment):
       • 'expired' — trial over, no active plan → subscribe-to-unlock CTAs.
       • 'locked'  — admin suspension (accessDisabled) → contact-support only.
     Both hard-lock the page so an out-of-trial swimmer can't reach any
     interactive section; only Log Out (or, for 'expired', subscribing) exits
     the state. */
  var paywallLogoutBtn = document.getElementById('paywallLogoutBtn');
  if (paywallLogoutBtn) {
    paywallLogoutBtn.addEventListener('click', function () {
      var navLogout = document.getElementById('navLogoutBtn');
      if (navLogout) navLogout.click();
    });
  }
  // The paywall's own plan buttons open the exact same Paddle checkout the
  // Pricing tab's Subscribe buttons use — a successful payment writes the
  // subscription, which flips access level off 'expired' and drops the lock.
  document.querySelectorAll('#paywallPlans [data-paywall-plan]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var plan = btn.dataset.paywallPlan;
      if (window.__isAdminAccount) { alert('This account already has full Ultra access — no need to subscribe!'); return; }
      if (window.__firebaseUser) { goToPaddleCheckout(plan); return; }
      window.openAuthModal();
    });
  });
  // BEGINNER FREE ACCESS: an out-of-trial swimmer with no active plan used to
  // be hard-locked out of the entire site. Beginner-level Workouts is now a
  // permanently free tier, never gated behind a subscription — so the lock
  // is skipped specifically when the swimmer is on the Workouts tab with
  // Beginner selected. Competitive/Elite, Gym, the AI Swim Coach and the
  // Tracker still require subscribing once the trial ends, same as before.
  // refreshPaywallLock() is re-run not just on swimfit:accesschange but also
  // on every tab switch and Level-tab click (see switchTab()/the levelTabs
  // handler below), since either of those can flip the bypass on or off
  // without the underlying access level itself changing.
  var latestAccessForPaywall = null;
  function refreshPaywallLock() {
    var access = latestAccessForPaywall;
    var expired = !!(access && access.level === 'expired');
    var suspended = !!(access && access.level === 'locked');
    var dashboardEl = document.getElementById('dashboard');
    var onBeginnerWorkouts = dashboardEl && dashboardEl.getAttribute('data-active-tab') === 'workouts' &&
      typeof window.__workoutsLevelIsBeginner === 'function' && window.__workoutsLevelIsBeginner();
    var beginnerBypass = expired && onBeginnerWorkouts;
    var locked = suspended || (expired && !beginnerBypass);
    var overlay = document.getElementById('paywallOverlay');
    if (overlay) overlay.hidden = !locked;
    document.body.classList.toggle('paywall-locked', locked);

    // Swap the overlay's copy/CTAs to match which lock is active.
    var pTitle = document.getElementById('paywallTitle');
    var pBody = document.getElementById('paywallBody');
    var pPlans = document.getElementById('paywallPlans');
    var pNote = document.getElementById('paywallNote');
    if (pTitle && pBody && pPlans && pNote) {
      if (suspended) {
        pTitle.textContent = 'Account Access Suspended';
        pBody.textContent = 'Your account has been temporarily suspended by the Swimfit team. If you believe this is a mistake, please get in touch.';
        pPlans.hidden = true;
        pNote.innerHTML = 'Contact <a href="mailto:SWIMFIT.ae@gmail.com">SWIMFIT.ae@gmail.com</a> for help.';
      } else {
        pTitle.textContent = 'Your Free Trial Has Ended';
        pBody.textContent = 'Your 3-day free trial is over. Beginner-level Workouts stays free — choose a plan below to unlock Competitive/Elite training, Gym, the AI Swim Coach and your Distance Tracker.';
        pPlans.hidden = false;
        pNote.innerHTML = 'Questions? Contact <a href="mailto:SWIMFIT.ae@gmail.com">SWIMFIT.ae@gmail.com</a>.';
      }
    }

    // The AI Coach FAB stays gated for the whole 'expired' state — the
    // Beginner bypass only ever covers Workouts generation, never the paid
    // AI Coach surfaces.
    var fab = document.getElementById('coachFab');
    if (fab) fab.style.display = (expired || suspended) ? 'none' : '';
    return locked;
  }
  window.__refreshPaywallLock = refreshPaywallLock;
  document.addEventListener('swimfit:accesschange', function (e) {
    var access = e.detail.access;
    latestAccessForPaywall = access;
    var locked = refreshPaywallLock();

    var badge = document.getElementById('navStatusBadge');
    if (badge) {
      // Reset urgency state each recompute; the trial branch re-adds it as due.
      badge.classList.remove('is-urgent', 'is-critical');
      if (!access || locked) {
        badge.hidden = true;
      } else if (access.level === 'admin') {
        badge.hidden = false;
        badge.innerHTML = '<svg class="icon"><use href="#i-bolt"/></svg> Ultra Access';
      } else if (access.level === 'trial') {
        // A real countdown, not a once-a-page-load day count — days+hours
        // (minutes too, in the final hour) recomputed every time this runs,
        // which is now frequent enough (see the 30s interval below) that it
        // reads as live rather than static. It now also shifts color as the
        // deadline nears — amber under 24h, pulsing red under 2h — so a
        // swimmer feels the urgency to subscribe before the hard lock lands.
        var msLeft = Math.max(0, access.trialEndsAt.getTime() - Date.now());
        var daysLeft = Math.floor(msLeft / 86400000);
        var hoursLeft = Math.floor((msLeft % 86400000) / 3600000);
        var minutesLeft = Math.floor((msLeft % 3600000) / 60000);
        var countdownLabel = daysLeft > 0 ? (daysLeft + 'd ' + hoursLeft + 'h ' + minutesLeft + 'm left')
          : hoursLeft > 0 ? (hoursLeft + 'h ' + minutesLeft + 'm left')
          : (minutesLeft + 'm left');
        badge.hidden = false;
        badge.innerHTML = '<svg class="icon"><use href="#i-clock"/></svg> Trial — ' + countdownLabel;
        if (msLeft <= 2 * 3600000) badge.classList.add('is-critical');
        else if (msLeft <= 24 * 3600000) badge.classList.add('is-urgent');
      } else if (['pro', 'elite', 'ultra'].indexOf(access.level) > -1) {
        badge.hidden = false;
        badge.innerHTML = '<svg class="icon"><use href="#i-trophy"/></svg> ' + access.level.charAt(0).toUpperCase() + access.level.slice(1) + ' Plan';
      } else {
        // 'expired' handled by the overlay above; any other level: nothing to show.
        badge.hidden = true;
      }
    }

    // Re-render whatever content reads access level so a subscription
    // resolving mid-session (or a suspension toggling) updates immediately
    // rather than only on the next manual interaction.
    if (typeof window.generateWorkout === "function") window.generateWorkout();
    if (typeof window.renderCoachPageGate === "function") window.renderCoachPageGate();
  });

