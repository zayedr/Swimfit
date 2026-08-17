  /* ============================= PRICING — SUBSCRIBE (Firebase-gated Paddle Billing checkout) =============================
     Simplified to a single Freemium paid tier — "All-Access Pro" — at the
     user's explicit request to collapse the old Pro/Elite/Ultra 3-tier
     split into a plain Free vs. Paid structure. PADDLE_PRICE_IDS.pro is the
     exact same real Paddle PRICE id (pri_...) the old $13/mo "Pro" card
     already checked out against, reused as-is since the price/cadence is
     identical to what "All-Access Pro" asks for — no new Paddle catalog
     object was needed. The elite/ultra price ids that used to live here are
     gone from the client entirely; functions/index.js's
     PADDLE_PLAN_BY_PRODUCT_ID mapping for those two legacy products is
     deliberately left in place server-side (see that file) so a swimmer who
     already subscribed to the old Elite/Ultra tiers keeps resolving to full
     access via subscriptionGrantsAccess() without needing any data
     migration — this file only ever offers the one plan going forward. */
  var PADDLE_CLIENT_TOKEN = 'live_8981fe2520a3f946c975f5a1ad2';
  var PADDLE_PRICE_IDS = {
    pro: 'pri_01kxxv52g2r41z02hsbfzaepyv'
  };
  var PLAN_LABELS = { pro: 'All-Access Pro' };
  var pendingSubscribePlan = null;
  var paddleReady = false;

  // Single source of truth for "does this signed-in swimmer currently have
  // full (paid-tier-equivalent) access" — read by every feature-level
  // Freemium gate (Workout Generator levels, Custom Workout Builder save
  // cap, Distance Tracker analytics) instead of each re-deriving its own
  // copy of this check. 'trial' still counts as full access (the 3-day
  // trial is a genuine full-access preview before a swimmer settles onto
  // Free or subscribes); 'pro'/'elite'/'ultra' cover both the current
  // single paid plan and any legacy subscriber still on an old plan name.
  window.__hasFullAccess = function () {
    var access = window.__swimfitAccess;
    if (!access) return false;
    return access.level === 'admin' || access.level === 'trial' ||
      access.level === 'pro' || access.level === 'elite' || access.level === 'ultra';
  };

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
      if (window.__isAdminAccount) { alert('This account already has full admin access — no need to subscribe!'); return; }
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
      if (window.__isAdminAccount) { alert('This account already has full admin access — no need to subscribe!'); return; }
      goToPaddleCheckout(plan);
    }
  });

  /* ============================= ACCESS-LOCK OVERLAY (DISABLED) =============================
     FULLY DISABLED at the user's explicit request: "fix the paywall/
     suspension gating logic so that ANY user (new, registered, or without
     an active paid plan) can freely access and use the platform" — item 1
     specifically calls out removing the full-screen "Account Access
     Suspended" lockout so a non-paying/expired swimmer is never blocked.
     refreshPaywallLock() is now a permanent no-op: it never unhides
     #paywallOverlay and never toggles body.paywall-locked, regardless of
     access.level (including 'locked', an admin's accessDisabled flag —
     even that no longer produces a site-wide block). The admin's suspend/
     unsuspend toggle in the Admin Panel and the accessDisabled Firestore
     field are both left completely intact — this only removes the
     CLIENT-SIDE enforcement of that flag as a full-page lock; toggling it
     is simply informational going forward, the same "trial badge is
     informational, never enforcement" precedent this file already
     established elsewhere. The one narrower exception, left deliberately
     unchanged since it isn't "the platform" or this overlay: the
     dedicated full-screen AI Coach page's own coachPageTierAllowed() (see
     index.html) and the server-side aiSwimCoach 402 check (see
     functions/index.js) both still decline a genuinely admin-suspended
     account specifically — a narrow, disclosed anti-abuse/cost-control
     safety valve on the one feature that spends real Claude API money per
     message, not a paywall and not part of "browsing the platform." */
  var paywallLogoutBtn = document.getElementById('paywallLogoutBtn');
  if (paywallLogoutBtn) {
    paywallLogoutBtn.addEventListener('click', function () {
      var navLogout = document.getElementById('navLogoutBtn');
      if (navLogout) navLogout.click();
    });
  }
  var latestAccessForPaywall = null;
  function refreshPaywallLock() {
    var overlay = document.getElementById('paywallOverlay');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('paywall-locked');
    return false;
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
        badge.innerHTML = '<svg class="icon"><use href="#i-bolt"/></svg> Admin Access';
      } else if (access.level === 'trial') {
        // A real countdown, not a once-a-page-load day count — days+hours
        // (minutes too, in the final hour) recomputed every time this runs,
        // which is now frequent enough (see the 30s interval below) that it
        // reads as live rather than static. It now also shifts color as the
        // deadline nears — amber under 24h, pulsing red under 2h — since a
        // trial ending still means settling down onto the more limited Free
        // plan, even though it's no longer a hard lock.
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
        // Any of the three plan strings (including a legacy Elite/Ultra
        // subscriber) now reads as the one current paid tier's own name.
        badge.hidden = false;
        badge.innerHTML = '<svg class="icon"><use href="#i-trophy"/></svg> All-Access Pro';
      } else if (access.level === 'free') {
        badge.hidden = false;
        badge.innerHTML = '<svg class="icon"><use href="#i-user"/></svg> Free Plan';
      } else {
        badge.hidden = true;
      }
    }

    // Re-render whatever content reads access level so a subscription
    // resolving mid-session (or a suspension toggling) updates immediately
    // rather than only on the next manual interaction.
    if (typeof window.generateWorkout === "function") window.generateWorkout();
    if (typeof window.renderCoachPageGate === "function") window.renderCoachPageGate();
    if (typeof window.__updateLevelTabLocks === "function") window.__updateLevelTabLocks();
    if (typeof window.__updateTrackerPlanGate === "function") window.__updateTrackerPlanGate();
  });

