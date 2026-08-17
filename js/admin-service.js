  /* ============================= ADMIN PANEL (swimfit.ae@gmail.com only) =============================
     The user roster (name/email/plan/joined) still comes from adminListUsers
     (Cloud Function, Admin SDK — needs a cross-collection join no Firestore
     rule can express). The message thread and unread badges are fully
     real-time instead: a live onSnapshot(collection('admin_chats')) feeds
     unread dots/last-message previews for every swimmer at once, and opening
     a thread subscribes directly to that swimmer's messages — see the
     __adminPanel* bridges in the module <script> in <head>, and
     firestore.rules' isAdminAuth() for how this is allowed without a Cloud
     Function round-trip. There is deliberately no password column anywhere
     in this table: Firebase Authentication never exposes a swimmer's
     password to this app in any form (hashed or otherwise) — see CLAUDE.md. */
  var ADMIN_LIST_USERS_ENDPOINT = 'https://us-central1-swimfi-ae.cloudfunctions.net/adminListUsers';
  var ADMIN_SET_PLAN_ENDPOINT = 'https://us-central1-swimfi-ae.cloudfunctions.net/adminSetUserPlan';
  var ADMIN_EXTEND_TRIAL_ENDPOINT = 'https://us-central1-swimfi-ae.cloudfunctions.net/adminExtendTrial';
  var ADMIN_TOGGLE_ACCESS_ENDPOINT = 'https://us-central1-swimfi-ae.cloudfunctions.net/adminToggleAccess';

  (function wireAdminPanel() {
    var tbody = document.getElementById('adminUsersTbody');
    var countEl = document.getElementById('adminUsersCount');
    var refreshBtn = document.getElementById('adminRefreshBtn');
    var chatHeader = document.getElementById('adminChatHeader');
    var chatMessages = document.getElementById('adminChatMessages');
    var chatForm = document.getElementById('adminChatForm');
    var chatInput = document.getElementById('adminChatInput');
    var chatSendBtn = document.getElementById('adminChatSendBtn');
    if (!tbody || !chatForm) return;

    var users = [];
    var inboxByUid = {}; // live admin_chats/{uid} docs — lastMessageText/unreadForAdmin, keyed by uid
    var selectedUid = null;
    var unsubscribeInbox = null;
    var unsubscribeThread = null;
    var lastThreadMessages = null; // last messages array rendered into the open thread, for tick-only re-renders

    // WhatsApp-style read receipt for the admin's own sent messages: a single
    // check means "sent" (written to Firestore), a colored double check means
    // the swimmer has opened the conversation since (unreadForUser === false
    // on the live admin_chats/{uid} metadata doc — see __adminChatMarkSeenByUser
    // in the swimmer-side bridges above). This is thread-level granularity,
    // not truly per-message (Firestore only tracks one shared flag per
    // conversation, not a read timestamp per message) — the same honest
    // "coarser than a per-item ledger" trade-off this codebase already makes
    // elsewhere (e.g. Most Swum Discipline ranking by month, not by instant).
    function threadSeenByUser(uid) {
      var meta = inboxByUid[uid];
      return !(meta && meta.unreadForUser === true);
    }
    function chatTickHtml(seen) {
      return '<span class="admin-chat-tick' + (seen ? ' is-seen' : '') + '" title="' + (seen ? 'Seen' : 'Sent') + '">' +
        icon('i-check') + (seen ? icon('i-check') : '') + '</span>';
    }

    function adminFetch(endpoint, body) {
      return window.__firebaseGetIdToken().then(function (idToken) {
        return fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
          body: JSON.stringify(body || {})
        });
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
      });
    }

    function formatDate(ms) {
      return ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    }

    var ADMIN_TRIAL_DAYS = 3;
    function timeRemainingInfo(u) {
      if (u.accessDisabled) return { text: 'Suspended', cls: 'is-expired' };
      if (u.plan) {
        var isActive = u.status === 'active' || u.status === 'trialing';
        return { text: isActive ? 'Active plan' : 'Inactive', cls: isActive ? 'is-active' : 'is-expired' };
      }
      if (!u.trialStartedAt) return { text: '—', cls: 'is-expired' };
      var endsAt = u.trialStartedAt + ADMIN_TRIAL_DAYS * 24 * 60 * 60 * 1000;
      var msLeft = endsAt - Date.now();
      if (msLeft <= 0) return { text: 'Free plan', cls: 'is-expired' };
      var d = Math.floor(msLeft / 86400000), h = Math.floor((msLeft % 86400000) / 3600000);
      return { text: (d > 0 ? d + 'd ' + h + 'h left' : h + 'h left'), cls: 'is-trial' };
    }

    var ADMIN_RING_CIRCUMFERENCE = 2 * Math.PI * 17.5; // matches each ring's r="17.5" in the markup

    function setAdminRing(key, count, total) {
      var pct = total > 0 ? Math.round((count / total) * 100) : 0;
      var circle = document.getElementById('adminRing' + key);
      var label = document.getElementById('adminRing' + key + 'Pct');
      if (circle) circle.style.strokeDashoffset = (ADMIN_RING_CIRCUMFERENCE * (1 - pct / 100)).toFixed(2);
      if (label) label.textContent = pct + '%';
    }

    function renderAdminStats() {
      var subscribers = users.filter(function (u) { return !!u.plan; }).length;
      var active = users.filter(function (u) { return u.plan && (u.status === 'active' || u.status === 'trialing') && !u.accessDisabled; }).length;
      var onTrial = users.filter(function (u) {
        return !u.plan && !u.accessDisabled && u.trialStartedAt && Date.now() < u.trialStartedAt + ADMIN_TRIAL_DAYS * 24 * 60 * 60 * 1000;
      }).length;
      var suspended = users.filter(function (u) { return u.accessDisabled; }).length;
      var total = users.length;
      var totalEl = document.getElementById('adminStatTotal');
      var subsEl = document.getElementById('adminStatSubscribers');
      var activeEl = document.getElementById('adminStatActive');
      var trialEl = document.getElementById('adminStatTrial');
      var suspendedEl = document.getElementById('adminStatSuspended');
      if (totalEl) totalEl.textContent = total;
      if (subsEl) subsEl.textContent = subscribers;
      if (activeEl) activeEl.textContent = active;
      if (trialEl) trialEl.textContent = onTrial;
      if (suspendedEl) suspendedEl.textContent = suspended;
      // Radial-progress rings — each tile's own % share of Total Registered
      // Users, computed from the exact same numbers the big figures above
      // already show. No new data source; purely a second, visual reading
      // of numbers already on screen.
      setAdminRing('Subscribers', subscribers, total);
      setAdminRing('Active', active, total);
      setAdminRing('Trial', onTrial, total);
      setAdminRing('Suspended', suspended, total);
    }

    var ADMIN_DONUT_CIRCUMFERENCE = 2 * Math.PI * 50; // matches r="50" in buildAdminDonut()

    function svgEl(tag, attrs) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (var k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    // Plan Distribution — a real donut chart, categorical hues in a fixed
    // order (All-Access Pro=aqua, No Plan=muted gray), never cycled or
    // reassigned as the underlying counts change. FREEMIUM SIMPLIFICATION:
    // pro/elite/ultra are all bucketed into one "All-Access Pro" segment —
    // a legacy Elite/Ultra subscriber is still a paying, full-access
    // swimmer under the new 2-tier model, so a 3-way split here would just
    // be noise now that checkout itself only ever offers one paid plan.
    function renderPlanDonut(users) {
      var svg = document.getElementById('adminPlanDonut');
      var legend = document.getElementById('adminPlanLegend');
      var centerValue = document.getElementById('adminDonutCenterValue');
      if (!svg || !legend) return;
      var total = users.length;
      var counts = {
        pro: users.filter(function (u) { return u.plan === 'pro' || u.plan === 'elite' || u.plan === 'ultra'; }).length
      };
      counts.none = total - counts.pro;
      var segments = [
        { key: 'pro', label: 'All-Access Pro', color: 'var(--aqua)', count: counts.pro },
        { key: 'none', label: 'Free / Trial', color: 'var(--muted-2)', count: counts.none }
      ];
      svg.innerHTML = '';
      // Track ring (drawn first, sits underneath every colored segment).
      svg.appendChild(svgEl('circle', { cx: 60, cy: 60, r: 50, fill: 'none', stroke: 'var(--border)', 'stroke-width': 16 }));
      var offset = 0;
      segments.forEach(function (seg) {
        if (seg.count <= 0) return;
        var pct = total > 0 ? seg.count / total : 0;
        var len = ADMIN_DONUT_CIRCUMFERENCE * pct;
        var circle = svgEl('circle', {
          cx: 60, cy: 60, r: 50, fill: 'none', stroke: seg.color, 'stroke-width': 16,
          'stroke-dasharray': len.toFixed(2) + ' ' + ADMIN_DONUT_CIRCUMFERENCE.toFixed(2),
          'stroke-dashoffset': (-offset).toFixed(2)
        });
        var title = svgEl('title', {});
        title.textContent = seg.label + ': ' + seg.count + ' (' + Math.round(pct * 100) + '%)';
        circle.appendChild(title);
        svg.appendChild(circle);
        offset += len;
      });
      if (centerValue) centerValue.textContent = total;
      legend.innerHTML = '';
      segments.forEach(function (seg) {
        var row = document.createElement('div');
        row.className = 'admin-chart-legend-row';
        var swatch = document.createElement('span');
        swatch.className = 'admin-chart-legend-swatch';
        swatch.style.background = seg.color;
        var label = document.createElement('span');
        label.textContent = seg.label;
        var value = document.createElement('span');
        value.className = 'admin-chart-legend-value';
        value.textContent = seg.count;
        row.appendChild(swatch);
        row.appendChild(label);
        row.appendChild(value);
        legend.appendChild(row);
      });
    }

    // Account Status — a horizontal bar chart using status semantics (good/
    // neutral/warning/critical), not an arbitrary categorical rotation:
    // Active=green (good), Trial=aqua (neutral/in-progress), Expired=gold
    // (warning), Suspended=maroon (critical) — reserved status colors,
    // never reused for a plain "series 4."
    function renderStatusBarChart(users) {
      var wrap = document.getElementById('adminStatusBarChart');
      if (!wrap) return;
      var active = users.filter(function (u) { return u.plan && (u.status === 'active' || u.status === 'trialing') && !u.accessDisabled; }).length;
      var onTrial = users.filter(function (u) {
        return !u.plan && !u.accessDisabled && u.trialStartedAt && Date.now() < u.trialStartedAt + ADMIN_TRIAL_DAYS * 24 * 60 * 60 * 1000;
      }).length;
      var expired = users.filter(function (u) {
        return !u.plan && !u.accessDisabled && u.trialStartedAt && Date.now() >= u.trialStartedAt + ADMIN_TRIAL_DAYS * 24 * 60 * 60 * 1000;
      }).length;
      var suspended = users.filter(function (u) { return u.accessDisabled; }).length;
      var rows = [
        { label: 'Active', color: 'var(--green-bright)', count: active },
        { label: 'Trial', color: 'var(--aqua)', count: onTrial },
        // Renamed from "Expired" — under the Freemium model a trial ending
        // just settles the account onto the permanent Free plan, never a
        // lock, so this bucket is better read as "on the Free plan" now.
        { label: 'Free', color: 'var(--gold)', count: expired },
        { label: 'Suspended', color: 'var(--maroon-bright)', count: suspended }
      ];
      var max = Math.max(1, active, onTrial, expired, suspended);
      wrap.innerHTML = '';
      rows.forEach(function (row) {
        var rowEl = document.createElement('div');
        rowEl.className = 'admin-bar-row';
        var labelEl = document.createElement('span');
        labelEl.className = 'admin-bar-row-label';
        labelEl.textContent = row.label;
        var track = document.createElement('span');
        track.className = 'admin-bar-track';
        var fill = document.createElement('span');
        fill.className = 'admin-bar-fill';
        fill.style.background = row.color;
        fill.style.width = Math.round((row.count / max) * 100) + '%';
        fill.title = row.label + ': ' + row.count;
        track.appendChild(fill);
        var valueEl = document.createElement('span');
        valueEl.className = 'admin-bar-row-value';
        valueEl.textContent = row.count;
        rowEl.appendChild(labelEl);
        rowEl.appendChild(track);
        rowEl.appendChild(valueEl);
        wrap.appendChild(rowEl);
      });
    }

    // New Signups trend — a real line/area chart bucketing each swimmer's
    // actual account-creation timestamp (u.createdAt, the same field the
    // table's own "Joined" column already reads) into the last 14 calendar
    // days. This is a genuine substitute for "visitor trend" data this app
    // has no way to track (see the Total Site Visitors tile's own honest
    // N/A disclosure) — real registrations, not a fabricated number.
    function renderSignupsTrend(users) {
      var svg = document.getElementById('adminSignupsTrend');
      if (!svg) return;
      var DAYS = 14;
      var dayMs = 24 * 60 * 60 * 1000;
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var buckets = [];
      for (var i = DAYS - 1; i >= 0; i--) {
        var dayStart = today.getTime() - i * dayMs;
        buckets.push({ start: dayStart, end: dayStart + dayMs, count: 0, date: new Date(dayStart) });
      }
      users.forEach(function (u) {
        if (!u.createdAt) return;
        for (var i = 0; i < buckets.length; i++) {
          if (u.createdAt >= buckets[i].start && u.createdAt < buckets[i].end) { buckets[i].count++; break; }
        }
      });
      var maxCount = Math.max(1, Math.max.apply(null, buckets.map(function (b) { return b.count; })));
      var W = 560, H = 160, padL = 24, padR = 12, padT = 12, padB = 24;
      var plotW = W - padL - padR, plotH = H - padT - padB;
      var stepX = plotW / (buckets.length - 1);
      function xFor(i) { return padL + i * stepX; }
      function yFor(count) { return padT + plotH - (count / maxCount) * plotH; }

      svg.innerHTML = '';
      var defs = svgEl('defs', {});
      var grad = svgEl('linearGradient', { id: 'adminTrendGradient', x1: 0, y1: 0, x2: 0, y2: 1 });
      var stop1 = svgEl('stop', { offset: '0%', 'stop-color': 'var(--aqua)', 'stop-opacity': 0.55 });
      var stop2 = svgEl('stop', { offset: '100%', 'stop-color': 'var(--aqua)', 'stop-opacity': 0 });
      grad.appendChild(stop1); grad.appendChild(stop2); defs.appendChild(grad); svg.appendChild(defs);

      // Recessive horizontal gridlines (0%, 50%, 100% of max) behind the plot.
      [0, 0.5, 1].forEach(function (frac) {
        var y = padT + plotH * (1 - frac);
        svg.appendChild(svgEl('line', { class: 'trend-grid-line', x1: padL, x2: W - padR, y1: y.toFixed(1), y2: y.toFixed(1) }));
      });

      var linePoints = buckets.map(function (b, i) { return xFor(i).toFixed(1) + ',' + yFor(b.count).toFixed(1); }).join(' ');
      var areaPoints = linePoints + ' ' + xFor(buckets.length - 1).toFixed(1) + ',' + (padT + plotH) + ' ' + xFor(0).toFixed(1) + ',' + (padT + plotH);
      svg.appendChild(svgEl('polygon', { class: 'trend-area', points: areaPoints }));
      svg.appendChild(svgEl('polyline', { class: 'trend-line', points: linePoints }));

      buckets.forEach(function (b, i) {
        var dot = svgEl('circle', { class: 'trend-dot', cx: xFor(i).toFixed(1), cy: yFor(b.count).toFixed(1), r: 2.5 });
        var title = svgEl('title', {});
        title.textContent = b.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ': ' + b.count + (b.count === 1 ? ' signup' : ' signups');
        dot.appendChild(title);
        svg.appendChild(dot);
        // Label every ~3rd day on the x-axis so labels don't collide.
        if (i % 3 === 0 || i === buckets.length - 1) {
          var lbl = svgEl('text', { class: 'trend-axis-label', x: xFor(i).toFixed(1), y: H - 6, 'text-anchor': 'middle' });
          lbl.textContent = b.date.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' });
          svg.appendChild(lbl);
        }
      });
    }

    function renderAdminCharts() {
      renderPlanDonut(users);
      renderStatusBarChart(users);
      renderSignupsTrend(users);
    }

    function renderUsers() {
      tbody.innerHTML = '';
      countEl.textContent = users.length + (users.length === 1 ? ' swimmer' : ' swimmers');
      renderAdminStats();
      renderAdminCharts();
      users.forEach(function (u) {
        var meta = inboxByUid[u.uid];
        var unread = meta ? !!meta.unreadForAdmin : !!u.unreadForAdmin;
        var disabled = !!u.accessDisabled;

        var tr = document.createElement('tr');
        tr.className = u.uid === selectedUid ? 'is-selected' : '';

        var nameTd = document.createElement('td');
        var nameEl = document.createElement('span');
        nameEl.className = 'admin-user-name';
        nameEl.textContent = u.displayName || '(no name)';
        var emailEl = document.createElement('span');
        emailEl.className = 'admin-user-email';
        emailEl.textContent = u.email || u.uid;
        nameTd.appendChild(nameEl);
        nameTd.appendChild(emailEl);

        var planTd = document.createElement('td');
        var planSelect = document.createElement('select');
        planSelect.className = 'admin-plan-select';
        // FREEMIUM: only 'pro' ("All-Access Pro") is offered going forward —
        // 'elite'/'ultra' stay in this list (relabeled "legacy") rather than
        // being removed outright, so a swimmer who's actually still on one
        // of those old plans (from before the pricing simplification) shows
        // correctly selected instead of misleadingly defaulting to
        // "Free / Trial" the moment their real plan value isn't one of the
        // dropdown's own options anymore.
        [['', 'Free / Trial'], ['pro', 'All-Access Pro'], ['elite', 'Elite (legacy)'], ['ultra', 'Ultra (legacy)']].forEach(function (opt) {
          var o = document.createElement('option');
          o.value = opt[0];
          o.textContent = opt[1];
          if ((u.plan || '') === opt[0]) o.selected = true;
          planSelect.appendChild(o);
        });
        planSelect.addEventListener('change', function () {
          var plan = planSelect.value || 'clear';
          planSelect.disabled = true;
          adminFetch(ADMIN_SET_PLAN_ENDPOINT, { targetUid: u.uid, plan: plan }).then(function (result) {
            if (result.ok) u.plan = planSelect.value || null;
          }).finally(function () { planSelect.disabled = false; });
        });
        var extendBtn = document.createElement('button');
        extendBtn.type = 'button';
        extendBtn.className = 'admin-extend-btn';
        extendBtn.textContent = '+3 Day Trial';
        extendBtn.title = 'Reset this swimmer’s trial to a fresh 3 days starting now';
        extendBtn.addEventListener('click', function () {
          extendBtn.disabled = true;
          adminFetch(ADMIN_EXTEND_TRIAL_ENDPOINT, { targetUid: u.uid }).finally(function () { extendBtn.disabled = false; });
        });
        planTd.appendChild(planSelect);
        planTd.appendChild(document.createElement('br'));
        planTd.appendChild(extendBtn);

        var timeTd = document.createElement('td');
        var timeInfo = timeRemainingInfo(u);
        var timeSpan = document.createElement('span');
        timeSpan.className = 'admin-time-remaining ' + timeInfo.cls;
        timeSpan.textContent = timeInfo.text;
        timeTd.appendChild(timeSpan);

        var joinedTd = document.createElement('td');
        joinedTd.textContent = formatDate(u.createdAt);

        var accessTd = document.createElement('td');
        var accessCell = document.createElement('div');
        accessCell.className = 'admin-access-cell';
        var accessToggle = document.createElement('button');
        accessToggle.type = 'button';
        accessToggle.className = 'admin-access-toggle';
        accessToggle.dataset.disabled = String(disabled);
        accessToggle.textContent = disabled ? 'Disabled' : 'Enabled';
        accessToggle.title = disabled ? 'Access is manually suspended — click to restore' : 'Click to suspend this swimmer’s access';
        accessToggle.addEventListener('click', function () {
          var nextDisabled = !disabled;
          accessToggle.disabled = true;
          adminFetch(ADMIN_TOGGLE_ACCESS_ENDPOINT, { targetUid: u.uid, disabled: nextDisabled }).then(function (result) {
            if (result.ok) { u.accessDisabled = nextDisabled; renderUsers(); }
          }).finally(function () { accessToggle.disabled = false; });
        });
        accessCell.appendChild(accessToggle);
        accessTd.appendChild(accessCell);

        var msgTd = document.createElement('td');
        var msgBtn = document.createElement('button');
        msgBtn.type = 'button';
        msgBtn.className = 'admin-msg-btn';
        msgBtn.setAttribute('aria-label', 'Message ' + (u.displayName || u.email || 'this swimmer'));
        msgBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-comment"/></svg>';
        if (unread) {
          var dot = document.createElement('span');
          dot.className = 'admin-unread-dot';
          msgBtn.appendChild(dot);
        }
        msgBtn.addEventListener('click', function () { openThread(u); });
        msgTd.appendChild(msgBtn);

        tr.appendChild(nameTd);
        tr.appendChild(planTd);
        tr.appendChild(timeTd);
        tr.appendChild(joinedTd);
        tr.appendChild(accessTd);
        tr.appendChild(msgTd);
        tbody.appendChild(tr);
      });
    }

    function loadUsers() {
      countEl.textContent = 'Loading…';
      return adminFetch(ADMIN_LIST_USERS_ENDPOINT).then(function (result) {
        if (!result.ok || !result.data || !Array.isArray(result.data.users)) {
          countEl.textContent = 'Could not load the user list.';
          return;
        }
        users = result.data.users;
        renderUsers();
      }).catch(function () { countEl.textContent = 'Could not load the user list.'; });
    }

    // Formats a Firestore Timestamp (createdAt) as a plain "3:45 PM" clock
    // reading — purely a display helper, reads a field the messages query
    // already returns, never touches the query or the message schema itself.
    function formatChatTime(ts) {
      if (!ts || typeof ts.toDate !== 'function') return '';
      var d = ts.toDate();
      var h = d.getHours(), m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      var h12 = h % 12; if (h12 === 0) h12 = 12;
      return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
    }

    function renderThreadMessages(messages) {
      lastThreadMessages = messages;
      chatMessages.innerHTML = '';
      if (!messages.length) {
        chatMessages.innerHTML = '<p style="text-align:center;color:var(--muted-2);padding:20px 0;">No messages yet — say hello!</p>';
        return;
      }
      var seen = threadSeenByUser(selectedUid);
      messages.forEach(function (m) {
        var row = document.createElement('div');
        row.className = 'coach-msg ' + (m.sender === 'admin' ? 'coach-msg-user' : 'coach-msg-assistant');
        var bubble = document.createElement('div');
        bubble.className = 'coach-bubble';
        bubble.textContent = m.text;
        var timeStr = formatChatTime(m.createdAt);
        if (timeStr || m.sender === 'admin') {
          var metaEl = document.createElement('span');
          metaEl.className = 'admin-chat-msg-meta';
          if (timeStr) {
            var timeEl = document.createElement('span');
            timeEl.className = 'admin-chat-msg-time';
            timeEl.textContent = timeStr;
            metaEl.appendChild(timeEl);
          }
          if (m.sender === 'admin') metaEl.insertAdjacentHTML('beforeend', chatTickHtml(seen));
          bubble.appendChild(metaEl);
        }
        row.appendChild(bubble);
        chatMessages.appendChild(row);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Re-paints just the tick icons on an already-rendered thread when the
    // live admin_chats/{uid} metadata updates (e.g. the swimmer opens their
    // widget and unreadForUser flips to false) — deliberately NOT a full
    // renderThreadMessages() re-run, since that would also reset scroll
    // position back to the bottom even if the admin had scrolled up to read
    // earlier history.
    function refreshOpenThreadTicks() {
      if (!selectedUid || !lastThreadMessages || !lastThreadMessages.length) return;
      var seen = threadSeenByUser(selectedUid);
      chatMessages.querySelectorAll('.admin-chat-tick').forEach(function (t) {
        t.outerHTML = chatTickHtml(seen);
      });
    }

    // Built via DOM methods (not innerHTML) so a swimmer's own displayName —
    // arbitrary text from their Google account — can never inject markup
    // into the admin's own page.
    function renderChatHeader(u) {
      chatHeader.innerHTML = '';
      var avatar = document.createElement('span');
      avatar.className = 'admin-chat-header-avatar';
      avatar.textContent = (u.displayName || u.email || '?').charAt(0).toUpperCase();
      var name = document.createElement('span');
      name.className = 'admin-chat-header-name';
      name.textContent = u.displayName || u.email || u.uid;
      chatHeader.appendChild(avatar);
      chatHeader.appendChild(name);
    }

    function openThread(u) {
      selectedUid = u.uid;
      renderUsers();
      renderChatHeader(u);
      chatMessages.innerHTML = '<p style="text-align:center;color:var(--muted-2);padding:20px 0;">Loading…</p>';
      chatForm.style.display = '';
      if (unsubscribeThread) { unsubscribeThread(); unsubscribeThread = null; }
      if (typeof window.__adminPanelSubscribeThread === 'function') {
        // An onError callback matters here specifically: without one, a
        // permission-denied or other Firestore error on this query leaves
        // the "Loading…" placeholder above stuck forever with zero
        // feedback, since onSnapshot's onNext callback simply never fires.
        unsubscribeThread = window.__adminPanelSubscribeThread(u.uid, renderThreadMessages, function () {
          chatMessages.innerHTML = '<p style="text-align:center;color:var(--muted-2);padding:20px 0;">Could not load this conversation — check your connection and try again.</p>';
        });
      }
      if (typeof window.__adminPanelMarkRead === 'function') window.__adminPanelMarkRead(u.uid);
    }

    chatForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!selectedUid) return;
      var text = (chatInput.value || '').trim();
      if (!text || typeof window.__adminPanelSendMessage !== 'function') return;
      chatSendBtn.disabled = true;
      // No optimistic append needed — the live thread subscription above
      // renders this message the instant it lands in Firestore.
      window.__adminPanelSendMessage(selectedUid, text).then(function () {
        chatInput.value = '';
      }).finally(function () { chatSendBtn.disabled = false; });
    });
    chatInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); chatForm.requestSubmit(); }
    });

    if (refreshBtn) refreshBtn.addEventListener('click', loadUsers);
    document.querySelectorAll('[data-tab="admin"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (!window.__isAdminAccount) return;
        loadUsers();
        if (!unsubscribeInbox && typeof window.__adminPanelSubscribeInbox === 'function') {
          unsubscribeInbox = window.__adminPanelSubscribeInbox(function (byUid) {
            inboxByUid = byUid;
            renderUsers();
            refreshOpenThreadTicks();
          }, function () {
            countEl.textContent = 'Could not load live message status — check your connection.';
          });
        }
      });
    });
    document.addEventListener('swimfit:authchange', function (e) {
      if (e.detail.user && window.__isAdminAccount) return;
      if (unsubscribeInbox) { unsubscribeInbox(); unsubscribeInbox = null; }
      if (unsubscribeThread) { unsubscribeThread(); unsubscribeThread = null; }
      selectedUid = null;
    });
  })();

  // Reusable toast — used by wireAdminUnreadNotifications() below (the only
  // caller today), kept generic so any future feature can call
  // window.__showToast({title, body, onClick}) without wiring its own
  // show/hide/auto-dismiss logic.
  window.__showToast = function (opts) {
    var stack = document.getElementById('toastStack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<span class="toast-icon"><svg class="icon" aria-hidden="true"><use href="#i-comment"/></svg></span>' +
      '<span class="toast-body"><strong></strong><p></p></span>' +
      '<button type="button" class="toast-close" aria-label="Dismiss"><svg class="icon" aria-hidden="true"><use href="#i-close"/></svg></button>';
    el.querySelector('.toast-body strong').textContent = opts.title || '';
    el.querySelector('.toast-body p').textContent = opts.body || '';
    function dismiss() {
      el.classList.remove('is-visible');
      setTimeout(function () { el.remove(); }, 320);
    }
    el.addEventListener('click', function (e) {
      if (e.target.closest('.toast-close')) { dismiss(); return; }
      if (typeof opts.onClick === 'function') opts.onClick();
      dismiss();
    });
    stack.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-visible'); }); });
    setTimeout(dismiss, 7000);
  };

  /* ============================= ADMIN: LIVE UNREAD BADGE + TOAST =============================
     Independent of the Admin Panel tab's own inbox subscription above (which
     only starts once the admin actually opens that tab) — this one starts the
     instant the admin signs in, so the nav's unread counter badge is correct
     without ever requiring the admin to click into the panel first, and a
     brand-new unread message pops a toast even while the admin is elsewhere
     on the site. A second onSnapshot on the same small admin_chats collection
     is cheap and mirrors this file's existing precedent of independent live
     reads per surface (e.g. the AI Coach widget and full-screen page each
     keep their own history). */
  (function wireAdminUnreadNotifications() {
    var unsubscribe = null;
    var seenUnreadUids = {};
    var primed = false; // true once the first snapshot has resolved — suppresses toasts for a pre-existing backlog on sign-in

    function updateBadge(count) {
      var badge = document.getElementById('adminNavUnreadBadge');
      if (!badge) return;
      if (count > 0) { badge.hidden = false; badge.textContent = count > 99 ? '99+' : String(count); }
      else { badge.hidden = true; badge.textContent = '0'; }
    }

    document.addEventListener('swimfit:authchange', function (e) {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      seenUnreadUids = {};
      primed = false;
      updateBadge(0);
      if (!e.detail.user || !window.__isAdminAccount || typeof window.__adminPanelSubscribeInbox !== 'function') return;
      unsubscribe = window.__adminPanelSubscribeInbox(function (byUid) {
        var count = 0;
        var newlyUnread = [];
        var nextSeen = {};
        Object.keys(byUid).forEach(function (uid) {
          var meta = byUid[uid];
          if (meta && meta.unreadForAdmin) {
            count++;
            nextSeen[uid] = true;
            if (primed && !seenUnreadUids[uid]) newlyUnread.push(meta);
          }
        });
        seenUnreadUids = nextSeen;
        updateBadge(count);
        if (primed) {
          newlyUnread.forEach(function (meta) {
            window.__showToast({
              title: 'New swimmer message',
              body: meta.lastMessageText || 'Open the Admin Panel to reply.',
              onClick: function () {
                var btn = document.querySelector('[data-tab="admin"]');
                if (btn) btn.click();
              }
            });
          });
        }
        primed = true;
      }, function () { /* silent — the Admin Panel's own subscription surfaces a connection error once the tab is actually open */ });
    });
  })();

