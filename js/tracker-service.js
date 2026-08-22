  /* ============================= DISTANCE TRACKER ============================= */
  /* Not tier-gated — like Gym/Academy, this is open to any signed-in swimmer
     regardless of plan (see CLAUDE.md). Firestore access goes through the
     __swimLog* bridges exposed by the module <script> in <head>. */
  (function wireDistanceTracker() {
    var form = document.getElementById('trackerLogForm');
    var dateInput = document.getElementById('trackerLogDate');
    var kmInput = document.getElementById('trackerLogKm');
    var durationInput = document.getElementById('trackerLogDuration');
    var disciplineSelect = document.getElementById('trackerLogDiscipline');
    var statusNote = document.getElementById('trackerLogStatus');
    var viewButtons = document.querySelectorAll('#trackerViewTabs [data-tracker-view]');
    var statValue = document.getElementById('trackerStatValue');
    var statLabel = document.getElementById('trackerStatLabel');
    var weeklyTotalEl = document.getElementById('trackerWeeklyTotal');
    var monthlyTotalEl = document.getElementById('trackerMonthlyTotal');
    var topDisciplineEl = document.getElementById('trackerTopDiscipline');
    var caloriesEl = document.getElementById('trackerCalories');
    var avgPaceEl = document.getElementById('trackerAvgPace');
    var entriesList = document.getElementById('trackerEntriesList');
    var signInBtn = document.getElementById('trackerSignInBtn');
    var goalInput = document.getElementById('trackerGoalInput');
    var goalFill = document.getElementById('trackerGoalFill');
    var goalNote = document.getElementById('trackerGoalNote');
    var pbForm = document.getElementById('trackerPbForm');
    var pbDisciplineSelect = document.getElementById('trackerPbDiscipline');
    var pbDistanceSelect = document.getElementById('trackerPbDistance');
    var pbTimeInput = document.getElementById('trackerPbTime');
    var pbDateInput = document.getElementById('trackerPbDate');
    if (!form || !dateInput || !kmInput || !entriesList) return;

    var currentView = 'daily';
    var cachedEntries = []; // { id, distanceMeters, loggedAt: Date, discipline, durationSeconds }
    var cachedPbEntries = []; // { id, discipline, distanceLabel, timeSeconds, loggedAt: Date }
    var loadedForUid = null;
    var pbLoadedForUid = null;
    var VIEW_LABELS = { daily: 'Logged Today', weekly: 'This Week', monthly: 'This Month' };
    var CALORIES_PER_METER = 0.2; // rough estimate for moderate-intensity swimming — not medical advice

    if (signInBtn) signInBtn.addEventListener('click', function () { if (typeof openAuthModal === 'function') openAuthModal(); });

    function todayIsoDate() {
      var d = new Date();
      var tz = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - tz).toISOString().slice(0, 10);
    }
    dateInput.value = todayIsoDate();
    dateInput.max = todayIsoDate();
    if (pbDateInput) { pbDateInput.value = todayIsoDate(); pbDateInput.max = todayIsoDate(); }

    function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
    function startOfWeek(d) { var x = startOfDay(d); var day = x.getDay(); x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); return x; }
    function startOfMonth(d) { var x = startOfDay(d); x.setDate(1); return x; }
    function daysAgo(n) { var d = startOfDay(new Date()); d.setDate(d.getDate() - n); return d; }

    // mm:ss (or h:mm:ss for a very long swim) — a stricter, purpose-built
    // parser than parseTimeToSeconds's forgiving "1m 5s" grammar, since this
    // field's placeholder promises an exact mm:ss shape.
    function parseDurationToSeconds(str) {
      if (!str) return null;
      var parts = str.trim().split(':').map(function (p) { return parseInt(p, 10); });
      if (parts.some(function (p) { return isNaN(p) || p < 0; })) return null;
      var seconds = 0;
      parts.forEach(function (p) { seconds = seconds * 60 + p; });
      return seconds > 0 ? seconds : null;
    }

    function sumDistance(entries) {
      return entries.reduce(function (sum, e) { return sum + e.distanceMeters; }, 0);
    }

    function computePace100(entry) {
      if (!entry.durationSeconds) return null;
      return entry.durationSeconds / (entry.distanceMeters / 100);
    }

    function computeAvgPace(entries) {
      var withPace = entries.filter(function (e) { return !!e.durationSeconds; });
      if (!withPace.length) return null;
      var totalSec = withPace.reduce(function (s, e) { return s + e.durationSeconds; }, 0);
      var totalM = withPace.reduce(function (s, e) { return s + e.distanceMeters; }, 0);
      return totalSec / (totalM / 100);
    }

    // Ranked by total distance rather than entry count — two long swims of
    // the same stroke says more about what's actually being trained than
    // five short ones of another. Entries logged with no discipline (it's
    // optional) simply don't count toward any stroke's total.
    function computeTopDiscipline(entries) {
      var totals = {};
      entries.forEach(function (e) {
        if (!e.discipline) return;
        totals[e.discipline] = (totals[e.discipline] || 0) + e.distanceMeters;
      });
      var top = null, topMeters = 0;
      Object.keys(totals).forEach(function (k) {
        if (totals[k] > topMeters) { top = k; topMeters = totals[k]; }
      });
      return top;
    }

    function renderStat() {
      var since = currentView === 'daily' ? startOfDay(new Date()) : currentView === 'weekly' ? startOfWeek(new Date()) : startOfMonth(new Date());
      var totalM = sumDistance(cachedEntries.filter(function (e) { return e.loggedAt >= since; }));
      statValue.textContent = formatDistanceM(totalM);
      statLabel.textContent = VIEW_LABELS[currentView];

      // Automated analytics strip — always reflects Weekly/Monthly totals and
      // the swimmer's most-swum discipline regardless of which pill tab above
      // is currently selected, so this data is on screen at a glance rather
      // than requiring a click through each view.
      var weekEntries = cachedEntries.filter(function (e) { return e.loggedAt >= startOfWeek(new Date()); });
      var monthEntries = cachedEntries.filter(function (e) { return e.loggedAt >= startOfMonth(new Date()); });
      if (weeklyTotalEl) weeklyTotalEl.textContent = formatDistanceM(sumDistance(weekEntries));
      if (monthlyTotalEl) monthlyTotalEl.textContent = formatDistanceM(sumDistance(monthEntries));
      if (topDisciplineEl) topDisciplineEl.textContent = computeTopDiscipline(monthEntries) || '—';
      if (caloriesEl) caloriesEl.textContent = Math.round(sumDistance(monthEntries) * CALORIES_PER_METER).toLocaleString();
      if (avgPaceEl) {
        var avgPace = computeAvgPace(monthEntries);
        avgPaceEl.textContent = avgPace != null ? formatTime(avgPace) : '—';
      }
      renderGoalProgress();
      renderVolumeChart();
      renderPaceChart();
    }

    // ============================= ANALYTICS-DASHBOARD CHARTS =============================
    // Every chart here is a hand-rolled inline SVG (no external chart
    // library) — a single accent hue, recessive grid lines, and a native
    // <title> per mark for a zero-JS hover tooltip, consistent with the
    // rest of this file's "no build step, no dependencies" approach.
    var GOAL_STORAGE_KEY = 'swimfit_weekly_goal_km';
    function loadWeeklyGoalKm() {
      try {
        var v = parseFloat(localStorage.getItem(GOAL_STORAGE_KEY));
        return v > 0 ? v : 10;
      } catch (e) { return 10; }
    }
    function saveWeeklyGoalKm(v) {
      try { localStorage.setItem(GOAL_STORAGE_KEY, String(v)); } catch (e) { /* private browsing etc. */ }
    }
    if (goalInput) {
      goalInput.value = loadWeeklyGoalKm();
      goalInput.addEventListener('change', function () {
        var v = parseFloat(goalInput.value);
        if (v > 0) { saveWeeklyGoalKm(v); renderGoalProgress(); }
      });
    }
    function renderGoalProgress() {
      if (!goalFill) return;
      var goal = loadWeeklyGoalKm();
      var weekKm = sumDistance(cachedEntries.filter(function (e) { return e.loggedAt >= startOfWeek(new Date()); })) / 1000;
      var pct = goal > 0 ? Math.min(100, (weekKm / goal) * 100) : 0;
      goalFill.style.width = pct + '%';
      if (goalNote) goalNote.textContent = weekKm.toFixed(2) + ' / ' + goal.toFixed(2) + ' km this week';
    }

    function svgChart(innerMarkup, w, h, label) {
      return '<svg class="tracker-svg-chart" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' + label + '">' + innerMarkup + '</svg>';
    }

    // Last 7 calendar days (today inclusive), one bar each — distance in km
    // internally for the height ratio (an arbitrary common unit works fine
    // for scaling), but every displayed label/tooltip reads through the
    // shared unit-aware formatDistanceM() so this respects the swimmer's
    // Meters/Yards preference.
    function renderVolumeChart() {
      var container = document.getElementById('trackerVolumeChart');
      if (!container) return;
      var isYards = false;
      try { isYards = localStorage.getItem('swimfit_units') === 'yd'; } catch (e) { /* private browsing etc. */ }
      var W = 460, H = 170, padL = 6, padR = 6, padT = 20, padB = 22;
      var chartW = W - padL - padR, chartH = H - padT - padB;
      var days = [];
      for (var i = 6; i >= 0; i--) {
        var d = daysAgo(i);
        var dayTotal = sumDistance(cachedEntries.filter(function (e) { return startOfDay(e.loggedAt).getTime() === d.getTime(); }));
        days.push({ date: d, m: dayTotal, km: dayTotal / 1000 });
      }
      var maxKm = Math.max.apply(null, days.map(function (d) { return d.km; }).concat([0.1]));
      var barGap = 10;
      var barW = (chartW - barGap * (days.length - 1)) / days.length;
      var gridLines = [0, 0.5, 1].map(function (f) {
        var y = padT + chartH * (1 - f);
        return '<line class="chart-grid-line" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y + '" y2="' + y + '"/>';
      }).join('');
      var bars = days.map(function (d, idx) {
        var barH = maxKm > 0 ? (d.km / maxKm) * chartH : 0;
        var x = padL + idx * (barW + barGap);
        var y = padT + chartH - barH;
        var dayLabel = d.date.toLocaleDateString(undefined, { weekday: 'short' });
        var barLabelText = isYards ? Math.round(d.m / METERS_PER_YARD).toLocaleString() : d.km.toFixed(1);
        var out = '<rect class="chart-bar" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + Math.max(barH, 1).toFixed(1) + '" rx="3">' +
          '<title>' + dayLabel + ': ' + formatDistanceM(d.m) + '</title></rect>';
        if (d.km > 0) out += '<text class="chart-bar-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '">' + barLabelText + '</text>';
        out += '<text class="chart-axis-label" x="' + (x + barW / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + dayLabel + '</text>';
        return out;
      }).join('');
      container.innerHTML = svgChart(gridLines + bars, W, H, 'Weekly volume in ' + (isYards ? 'yards' : 'kilometers') + ' per day');
    }

    // Average pace (seconds per 100m) for the last 10 logged swims that
    // included a duration — only entries with a duration carry a pace at
    // all, so a swimmer who never logs one simply never sees this chart.
    function renderPaceChart() {
      var container = document.getElementById('trackerPaceChart');
      var emptyEl = document.getElementById('trackerPaceEmpty');
      if (!container) return;
      var withPace = cachedEntries.filter(function (e) { return !!e.durationSeconds; })
        .slice().sort(function (a, b) { return a.loggedAt - b.loggedAt; }).slice(-10);
      if (withPace.length < 2) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      var W = 460, H = 170, padL = 12, padR = 12, padT = 16, padB = 22;
      var chartW = W - padL - padR, chartH = H - padT - padB;
      var paces = withPace.map(computePace100);
      var minP = Math.min.apply(null, paces), maxP = Math.max.apply(null, paces);
      var range = Math.max(maxP - minP, 1);
      var pts = withPace.map(function (e, idx) {
        var x = padL + (idx / (withPace.length - 1)) * chartW;
        var y = padT + ((computePace100(e) - minP) / range) * chartH;
        return { x: x, y: y, e: e };
      });
      var pathD = pts.map(function (p, idx) { return (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
      var dots = pts.map(function (p, idx) {
        return '<circle class="chart-dot' + (idx === pts.length - 1 ? ' pb-latest' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4">' +
          '<title>' + p.e.loggedAt.toLocaleDateString() + ': ' + formatTime(computePace100(p.e)) + '/100m</title></circle>';
      }).join('');
      container.innerHTML = svgChart('<path class="chart-line" d="' + pathD + '"/>' + dots, W, H, 'Average pace per 100 meters trend');
    }

    // Charts whichever discipline+distance combo has the most logged PB
    // entries (the one with real trend data), rather than asking the
    // swimmer to pick — with only one PB series shown at a time, per this
    // file's "one axis, no dual-scale" chart convention elsewhere.
    function bestPbGroup() {
      var groups = {};
      cachedPbEntries.forEach(function (e) {
        var key = e.discipline + '|' + e.distanceLabel;
        (groups[key] = groups[key] || []).push(e);
      });
      var bestKey = null, bestCount = 1;
      Object.keys(groups).forEach(function (k) {
        if (groups[k].length > bestCount) { bestKey = k; bestCount = groups[k].length; }
      });
      return bestKey ? { key: bestKey, entries: groups[bestKey].slice().sort(function (a, b) { return a.loggedAt - b.loggedAt; }) } : null;
    }
    function renderPbChart() {
      var container = document.getElementById('trackerPbChart');
      var emptyEl = document.getElementById('trackerPbEmpty');
      if (!container) return;
      var group = bestPbGroup();
      if (!group) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      var entries = group.entries;
      var W = 460, H = 170, padL = 12, padR = 12, padT = 30, padB = 12;
      var chartW = W - padL - padR, chartH = H - padT - padB;
      var times = entries.map(function (e) { return e.timeSeconds; });
      var minT = Math.min.apply(null, times), maxT = Math.max.apply(null, times);
      var range = Math.max(maxT - minT, 1);
      var pts = entries.map(function (e, idx) {
        var x = padL + (entries.length === 1 ? 0 : (idx / (entries.length - 1)) * chartW);
        var y = padT + ((e.timeSeconds - minT) / range) * chartH;
        return { x: x, y: y, e: e };
      });
      var pathD = pts.map(function (p, idx) { return (idx === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' ');
      var dots = pts.map(function (p, idx) {
        return '<circle class="chart-dot' + (idx === pts.length - 1 ? ' pb-latest' : '') + '" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4">' +
          '<title>' + p.e.loggedAt.toLocaleDateString() + ': ' + formatTime(p.e.timeSeconds) + '</title></circle>';
      }).join('');
      var parts = group.key.split('|');
      var caption = '<text class="chart-axis-label" x="' + padL + '" y="14" style="font-size:11px; fill:var(--aqua);">' + parts[0] + ' — ' + parts[1] + '</text>';
      container.innerHTML = svgChart(caption + '<path class="chart-line" d="' + pathD + '"/>' + dots, W, H, 'Personal best time progression for ' + parts[0] + ' ' + parts[1]);
    }

    // "Your Personal Bests" grid — the swimmer's single fastest time for every
    // discipline+distance they've ever logged, sorted by distance. Re-rendered
    // the instant a new PB is logged, so a new record shows on the dashboard
    // immediately without a reload.
    var PB_DIST_ORDER = ['50m', '100m', '200m', '400m', '800m', '1500m'];
    function renderPbList() {
      var listEl = document.getElementById('trackerPbList');
      var emptyEl = document.getElementById('trackerPbListEmpty');
      if (!listEl) return;
      var best = {}; // "discipline|distance" -> { discipline, distanceLabel, timeSeconds, loggedAt }
      cachedPbEntries.forEach(function (e) {
        var key = e.discipline + '|' + e.distanceLabel;
        if (!best[key] || e.timeSeconds < best[key].timeSeconds) best[key] = e;
      });
      var items = Object.keys(best).map(function (k) { return best[k]; });
      if (!items.length) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.hidden = false;
        return;
      }
      if (emptyEl) emptyEl.hidden = true;
      items.sort(function (a, b) {
        if (a.discipline !== b.discipline) return a.discipline < b.discipline ? -1 : 1;
        return PB_DIST_ORDER.indexOf(a.distanceLabel) - PB_DIST_ORDER.indexOf(b.distanceLabel);
      });
      listEl.innerHTML = items.map(function (e) {
        return '<div class="tracker-pb-item">' +
          '<div class="tracker-pb-item-event">' + e.discipline + ' · ' + e.distanceLabel + '</div>' +
          '<div class="tracker-pb-item-time">' + formatTime(e.timeSeconds) + '</div>' +
          '<div class="tracker-pb-item-date">' + e.loggedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + '</div>' +
          '</div>';
      }).join('');
    }

    function renderEntries() {
      entriesList.innerHTML = '';
      if (!cachedEntries.length) {
        var empty = document.createElement('p');
        empty.className = 'tracker-empty';
        empty.textContent = 'No swims logged yet this month — add your first one above.';
        entriesList.appendChild(empty);
        return;
      }
      cachedEntries.slice(0, 10).forEach(function (entry) {
        var row = document.createElement('div');
        row.className = 'tracker-entry-row';
        var meta = document.createElement('div');
        meta.className = 'tracker-entry-meta';
        var dateEl = document.createElement('span');
        dateEl.className = 'tracker-entry-date';
        dateEl.textContent = entry.loggedAt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        var kmEl = document.createElement('span');
        kmEl.className = 'tracker-entry-km';
        kmEl.textContent = formatDistanceM(entry.distanceMeters);
        meta.appendChild(dateEl);
        meta.appendChild(kmEl);
        if (entry.discipline) {
          var discEl = document.createElement('span');
          discEl.className = 'tracker-entry-discipline';
          discEl.textContent = entry.discipline;
          meta.appendChild(discEl);
        }
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'tracker-entry-delete';
        delBtn.setAttribute('aria-label', 'Delete this entry');
        delBtn.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>';
        delBtn.addEventListener('click', function () { deleteEntry(entry.id); });
        row.appendChild(meta);
        row.appendChild(delBtn);
        entriesList.appendChild(row);
      });
    }

    function deleteEntry(id) {
      if (typeof window.__swimLogDelete !== 'function') return;
      window.__swimLogDelete(id).then(function () {
        cachedEntries = cachedEntries.filter(function (e) { return e.id !== id; });
        renderStat();
        renderEntries();
      }).catch(function () {});
    }

    // Bounded to the current month's start for the Daily/Weekly/Monthly
    // views and analytics strip — but never any narrower than 7 days back,
    // so the Weekly Volume chart always has full 7-day coverage even during
    // the first few days of a new month.
    function loadEntriesIfNeeded() {
      var user = window.__firebaseUser;
      if (!user || loadedForUid === user.uid || typeof window.__swimLogQuerySince !== 'function') return;
      loadedForUid = user.uid;
      var since = startOfMonth(new Date());
      var sevenDaysBack = daysAgo(6);
      if (sevenDaysBack < since) since = sevenDaysBack;
      window.__swimLogQuerySince(since).then(function (entries) {
        cachedEntries = entries;
        renderStat();
        renderEntries();
      }).catch(function () {
        entriesList.innerHTML = '<p class="tracker-empty">Couldn\'t load your log — please try again.</p>';
      });
    }

    function loadPbEntriesIfNeeded() {
      var user = window.__firebaseUser;
      if (!user || pbLoadedForUid === user.uid || typeof window.__pbLogQueryAll !== 'function') return;
      pbLoadedForUid = user.uid;
      window.__pbLogQueryAll().then(function (entries) {
        cachedPbEntries = entries;
        renderPbChart();
        renderPbList();
      }).catch(function () {});
    }

    viewButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentView = btn.dataset.trackerView;
        viewButtons.forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
        renderStat();
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!window.__firebaseUser || typeof window.__swimLogAdd !== 'function') return;

      var km = parseFloat(kmInput.value);
      if (!km || km <= 0 || km > 100) {
        statusNote.style.color = '#e5484d';
        statusNote.textContent = 'Enter a distance between 0 and 100 km.';
        return;
      }
      var durationSeconds = durationInput ? parseDurationToSeconds(durationInput.value) : null;
      if (durationInput && durationInput.value && !durationSeconds) {
        statusNote.style.color = '#e5484d';
        statusNote.textContent = 'Enter duration as mm:ss, e.g. 45:00.';
        return;
      }
      var loggedDate = dateInput.value ? new Date(dateInput.value + 'T12:00:00') : new Date();
      var distanceMeters = Math.round(km * 1000);
      var discipline = (disciplineSelect && disciplineSelect.value) || '';

      var submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      var payload = { distanceMeters: distanceMeters, loggedAt: loggedDate, discipline: discipline };
      if (durationSeconds) payload.durationSeconds = durationSeconds;
      window.__swimLogAdd(payload).then(function (ref) {
        cachedEntries.unshift({ id: ref.id, distanceMeters: distanceMeters, loggedAt: loggedDate, discipline: discipline, durationSeconds: durationSeconds });
        cachedEntries.sort(function (a, b) { return b.loggedAt - a.loggedAt; });
        renderStat();
        renderEntries();
        kmInput.value = '';
        if (durationInput) durationInput.value = '';
        statusNote.style.color = '';
        statusNote.textContent = 'Logged ' + km.toFixed(2) + ' km.';
      }).catch(function () {
        statusNote.style.color = '#e5484d';
        statusNote.textContent = 'Couldn\'t save that — please try again.';
      }).finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });

    if (pbForm) {
      pbForm.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!window.__firebaseUser || typeof window.__pbLogAdd !== 'function') return;
        var timeSeconds = parseTimeToSeconds(pbTimeInput.value);
        if (!timeSeconds) return;
        var loggedDate = pbDateInput && pbDateInput.value ? new Date(pbDateInput.value + 'T12:00:00') : new Date();
        var entry = {
          discipline: pbDisciplineSelect.value,
          distanceLabel: pbDistanceSelect.value,
          timeSeconds: timeSeconds,
          loggedAt: loggedDate
        };
        // Is this a NEW personal best for this exact event (faster than any
        // previously-logged time for the same discipline+distance)?
        var eventKey = entry.discipline + '|' + entry.distanceLabel;
        var priorBest = null;
        cachedPbEntries.forEach(function (pe) {
          if (pe.discipline + '|' + pe.distanceLabel === eventKey && (priorBest === null || pe.timeSeconds < priorBest)) priorBest = pe.timeSeconds;
        });
        var isNewBest = priorBest === null || timeSeconds < priorBest;
        var submitBtn = pbForm.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        window.__pbLogAdd(entry).then(function (ref) {
          cachedPbEntries.push({ id: ref.id, discipline: entry.discipline, distanceLabel: entry.distanceLabel, timeSeconds: timeSeconds, loggedAt: loggedDate });
          renderPbChart();
          renderPbList();
          pbTimeInput.value = '';
          var pbStatus = document.getElementById('trackerPbStatus');
          if (pbStatus) {
            pbStatus.hidden = false;
            pbStatus.classList.toggle('is-record', isNewBest);
            pbStatus.textContent = isNewBest
              ? '🎉 New personal best! ' + entry.discipline + ' ' + entry.distanceLabel + ' — ' + formatTime(timeSeconds)
              : 'Logged ' + entry.discipline + ' ' + entry.distanceLabel + ' — ' + formatTime(timeSeconds) + ' (your best is ' + formatTime(priorBest) + ').';
          }
        }).catch(function () {}).finally(function () {
          if (submitBtn) submitBtn.disabled = false;
        });
      });
    }

    // FREEMIUM: the analytics strip through the PB Progression card
    // (#trackerAdvancedSection) is an All-Access Pro perk; Free tier sees
    // #trackerUpsellCard instead. The underlying data still loads/computes
    // either way (loadEntriesIfNeeded/loadPbEntriesIfNeeded don't check
    // plan at all) — this only toggles which container is visible, reusing
    // window.__hasFullAccess() (js/paddle-client.js) rather than a second
    // access check.
    var trackerAdvancedSection = document.getElementById('trackerAdvancedSection');
    var trackerUpsellCard = document.getElementById('trackerUpsellCard');
    function updateTrackerPlanGate() {
      if (!trackerAdvancedSection || !trackerUpsellCard) return;
      var hasFull = typeof window.__hasFullAccess === 'function' && window.__hasFullAccess();
      trackerAdvancedSection.style.display = hasFull ? '' : 'none';
      trackerUpsellCard.style.display = hasFull ? 'none' : '';
    }
    window.__updateTrackerPlanGate = updateTrackerPlanGate;
    document.addEventListener('swimfit:accesschange', updateTrackerPlanGate);

    document.querySelectorAll('[data-tab="tracker"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTimeout(loadEntriesIfNeeded, 0);
        setTimeout(loadPbEntriesIfNeeded, 0);
        setTimeout(updateTrackerPlanGate, 0);
      });
    });
    document.addEventListener('swimfit:authchange', function (e) {
      if (e.detail.user) {
        loadEntriesIfNeeded();
        loadPbEntriesIfNeeded();
      } else {
        loadedForUid = null; pbLoadedForUid = null;
        cachedEntries = []; cachedPbEntries = [];
        renderStat(); renderEntries(); renderPbChart(); renderPbList();
      }
    });
    // loadEntriesIfNeeded() only ever fetches once per signed-in session
    // (guarded by loadedForUid) — fine for a normal tab switch, but a swim
    // logged elsewhere (the Workouts tab's "Complete Workout" button) needs
    // to show up here even if the Tracker was already opened earlier this
    // session, so force a re-fetch on this event instead of waiting for a
    // fresh sign-in.
    document.addEventListener('swimfit:swimlogchange', function () {
      loadedForUid = null;
      loadEntriesIfNeeded();
    });
    // Switching Meters/Yards in Settings redraws every distance already on
    // screen immediately, rather than only taking effect on the next tab
    // visit or reload.
    document.addEventListener('swimfit:unitschange', function () {
      renderStat();
      renderEntries();
    });

    /* ============================= TRACKER STUDIO (dedicated view) =============================
       Same pattern as the Workout Studio / Swim Generator Studio / Gym
       Studio: the Tracker tab is now a Hub with one entry card, and the
       dashboard itself lives in #trackerStudioOverlay. Shares the same
       body.workout-studio-active scroll-lock class every other studio
       overlay uses — safe because they're all mutually exclusive (each is
       only reachable from its own tab's Hub, never from inside another).
       Opening forces a data refresh rather than relying on the tab-click
       handler, since the dashboard is no longer rendered by simply
       switching to the tab. */
    var trackerOverlay = document.getElementById('trackerStudioOverlay');
    var trackerOpenBtn = document.getElementById('openTrackerStudioBtn');
    var trackerBackBtn = document.getElementById('trackerStudioBackBtn');
    function openTrackerStudio() {
      if (!trackerOverlay) return;
      trackerOverlay.hidden = false;
      document.body.classList.add('workout-studio-active');
      loadEntriesIfNeeded();
      loadPbEntriesIfNeeded();
      updateTrackerPlanGate();
    }
    function closeTrackerStudio() {
      if (!trackerOverlay || trackerOverlay.hidden) return;
      trackerOverlay.hidden = true;
      document.body.classList.remove('workout-studio-active');
    }
    if (trackerOpenBtn) trackerOpenBtn.addEventListener('click', openTrackerStudio);
    if (trackerBackBtn) trackerBackBtn.addEventListener('click', closeTrackerStudio);
    document.addEventListener('keydown', function (e) {
      if (!trackerOverlay || trackerOverlay.hidden || e.key !== 'Escape') return;
      var live = document.getElementById('liveWorkoutOverlay');
      if (live && !live.hidden) return; // Live Mode owns Escape while it's on top
      closeTrackerStudio();
    });
    // A signed-out swimmer must never be left inside the dashboard.
    document.addEventListener('swimfit:authchange', function (e) {
      if (!e.detail.user) closeTrackerStudio();
    });
  })();

