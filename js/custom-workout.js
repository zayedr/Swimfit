  /* ============================= CUSTOM WORKOUT BUILDER + LIVE SPLIT-SCREEN MODE =============================
     Two features sharing one closure since Live Mode is launched directly
     from the Builder's own draft/saved-workout state:

     1) A from-scratch workout builder (Workouts tab, below the generator) —
        blocks of sets (reps/distance/stroke/interval/rest/note), saved to
        the swimmer's own profile via custom_workouts/{uid}/entries/{id}
        (see firestore.rules + the __customWorkout* bridges in
        js/firebase-service.js), loadable/editable/deletable anytime.

     2) Live Split-Screen Workout Mode (#liveWorkoutOverlay) — a full-screen,
        exclusive execution surface: a massive pool-side-visible countdown
        timer + ring on the left, the live set breakdown on the right.
        AUTOMATIC set cycling — when a rep/rest's target interval elapses,
        it fires a beep + a spoken cue (Web Audio + SpeechSynthesis), logs
        that rep's distance, and advances to the next rep/set/block on its
        own; a swimmer never has to touch the phone mid-swim. Play/Pause/
        Restart/Skip/Exit remain as manual overrides for accessibility and
        recovering from a missed cue, but nothing REQUIRES a tap.

     Not tier-gated — same as Gym/Academy/Tracker, this lives entirely
     behind the Workouts tab's existing signed-in gate, no separate paywall
     check of its own. Firestore access goes through the __customWorkout*
     bridges exposed by the module <script> in <head>, same "plain <script>
     never imports the Firestore SDK directly" convention every other
     feature in this file already follows. */
  (function wireCustomWorkoutsAndLiveMode() {
    var blocksListEl = document.getElementById('cwbBlocksList');
    var nameInput = document.getElementById('cwbNameInput');
    var addBlockBtn = document.getElementById('cwbAddBlockBtn');
    var saveBtn = document.getElementById('cwbSaveBtn');
    var startBtn = document.getElementById('cwbStartBtn');
    var newBtn = document.getElementById('cwbNewBtn');
    var statusEl = document.getElementById('cwbStatus');
    var editingNoteEl = document.getElementById('cwbEditingNote');
    var savedListEl = document.getElementById('customWorkoutsList');
    var planNoteEl = document.getElementById('cwbPlanNote');

    var overlay = document.getElementById('liveWorkoutOverlay');
    if (!blocksListEl || !overlay) return; // markup missing — nothing to wire

    var liveTitleEl = document.getElementById('liveWorkoutTitle');
    var phaseBadgeEl = document.getElementById('liveWorkoutPhaseBadge');
    var timerEl = document.getElementById('liveWorkoutTimer');
    var timerSubEl = document.getElementById('liveWorkoutTimerSub');
    var ringProgressEl = document.getElementById('liveWorkoutRingProgress');
    var ringWrapEl = document.querySelector('.live-workout-ring-wrap');
    var playPauseBtn = document.getElementById('liveWorkoutPlayPauseBtn');
    var restartBtn = document.getElementById('liveWorkoutRestartBtn');
    var skipBtn = document.getElementById('liveWorkoutSkipBtn');
    var exitBtn = document.getElementById('liveWorkoutExitBtn');
    var elapsedTotalEl = document.getElementById('liveWorkoutElapsedTotal');
    var distDoneEl = document.getElementById('liveWorkoutDistDone');
    var voiceToggle = document.getElementById('liveWorkoutVoiceToggle');
    var setsListEl = document.getElementById('liveWorkoutSetsList');
    var bodyEl = document.getElementById('liveWorkoutBody');
    var completeScreenEl = document.getElementById('liveWorkoutComplete');
    var completeSummaryEl = document.getElementById('liveWorkoutCompleteSummary');
    var completeCloseBtn = document.getElementById('liveWorkoutCompleteCloseBtn');
    var liveModeBtn = document.getElementById('workoutLiveModeBtn'); // generated workout's own button

    var RING_CIRCUMFERENCE = 615.75; // 2 * PI * 98 — matches the SVG ring's r=98 in <style>

    function escHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function formatClock(sec) {
      sec = Math.max(0, Math.round(sec || 0));
      var m = Math.floor(sec / 60), s = sec % 60;
      return m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ============================= BUILDER STATE ============================= */
    var STROKE_OPTIONS = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Kick', 'Drill', 'Mixed'];
    var cwbIdCounter = 1;
    function newLocalId() { return 'x' + (cwbIdCounter++) + '-' + Date.now().toString(36); }
    function blankSet() { return { id: newLocalId(), reps: 4, distance: 100, stroke: 'Freestyle', interval: '', restSec: '', note: '' }; }
    function blankBlock(label) { return { id: newLocalId(), label: label || 'Warm-Up', sets: [blankSet()] }; }

    var cwbState = { editingId: null, blocks: [blankBlock('Warm-Up')] };

    function setStatus(msg, isError, isSuccess) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.classList.toggle('is-error', !!isError);
      statusEl.classList.toggle('is-success', !!isSuccess);
    }

    function renderSetRowHtml(s) {
      var options = STROKE_OPTIONS.map(function (name) {
        return '<option' + (name === s.stroke ? ' selected' : '') + '>' + name + '</option>';
      }).join('');
      return '<div class="cwb-set-row" data-set-id="' + s.id + '">' +
        '<input type="number" class="cwb-set-reps" data-field="reps" value="' + (s.reps != null ? s.reps : 4) + '" min="1" max="99" aria-label="Reps">' +
        '<input type="number" class="cwb-set-dist" data-field="distance" value="' + (s.distance != null ? s.distance : 100) + '" min="25" max="4000" step="25" aria-label="Distance in meters">' +
        '<select class="cwb-set-stroke" data-field="stroke" aria-label="Stroke">' + options + '</select>' +
        '<input type="text" class="cwb-set-interval" data-field="interval" value="' + escHtml(s.interval) + '" placeholder="Interval mm:ss" aria-label="Interval / send-off time">' +
        '<input type="text" class="cwb-set-rest" data-field="restSec" value="' + escHtml(s.restSec) + '" placeholder="Rest (s)" aria-label="Rest seconds after this set">' +
        '<input type="text" class="cwb-set-note" data-field="note" value="' + escHtml(s.note) + '" placeholder="Note (optional)" maxlength="60" aria-label="Note">' +
        '<button type="button" class="cwb-remove-btn" data-action="remove-set" aria-label="Remove set">' + icon('i-close') + '</button>' +
        '</div>';
    }
    function renderBlockHtml(block) {
      return '<div class="cwb-block" data-block-id="' + block.id + '">' +
        '<div class="cwb-block-head">' +
        '<input type="text" class="cwb-block-label" data-action="block-label" value="' + escHtml(block.label) + '" placeholder="Block name (e.g. Warm-Up, Main Set)" maxlength="40" aria-label="Block name">' +
        '<button type="button" class="cwb-remove-btn" data-action="remove-block" aria-label="Remove block">' + icon('i-close') + '</button>' +
        '</div>' +
        '<div class="cwb-sets-list">' + block.sets.map(renderSetRowHtml).join('') + '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm cwb-set-add-btn" data-action="add-set">' + icon('i-plus') + ' Add Set</button>' +
        '</div>';
    }
    function renderBuilder() {
      blocksListEl.innerHTML = cwbState.blocks.map(renderBlockHtml).join('');
    }
    function resetBuilder() {
      cwbState.editingId = null;
      cwbState.blocks = [blankBlock('Warm-Up')];
      if (nameInput) nameInput.value = '';
      if (editingNoteEl) editingNoteEl.textContent = '';
      setStatus('');
      renderBuilder();
    }
    resetBuilder();

    blocksListEl.addEventListener('click', function (e) {
      var blockEl = e.target.closest('.cwb-block');
      if (!blockEl) return;
      var block = cwbState.blocks.find(function (b) { return b.id === blockEl.dataset.blockId; });
      if (!block) return;
      if (e.target.closest('[data-action="remove-block"]')) {
        cwbState.blocks = cwbState.blocks.filter(function (b) { return b.id !== block.id; });
        if (!cwbState.blocks.length) cwbState.blocks.push(blankBlock('Warm-Up'));
        renderBuilder();
      } else if (e.target.closest('[data-action="add-set"]')) {
        block.sets.push(blankSet());
        renderBuilder();
      } else if (e.target.closest('[data-action="remove-set"]')) {
        var setId = e.target.closest('.cwb-set-row').dataset.setId;
        block.sets = block.sets.filter(function (s) { return s.id !== setId; });
        if (!block.sets.length) block.sets.push(blankSet());
        renderBuilder();
      }
    });
    // Plain field edits never re-render the block list (that would blow
    // away focus/cursor position on every keystroke) — just update the
    // in-memory model; renderBuilder() only runs on structural add/remove.
    blocksListEl.addEventListener('input', function (e) {
      var blockEl = e.target.closest('.cwb-block');
      if (!blockEl) return;
      var block = cwbState.blocks.find(function (b) { return b.id === blockEl.dataset.blockId; });
      if (!block) return;
      if (e.target.dataset.action === 'block-label') { block.label = e.target.value; return; }
      var setEl = e.target.closest('.cwb-set-row');
      if (!setEl) return;
      var set = block.sets.find(function (s) { return s.id === setEl.dataset.setId; });
      if (!set || !e.target.dataset.field) return;
      set[e.target.dataset.field] = e.target.value;
    });

    if (addBlockBtn) addBlockBtn.addEventListener('click', function () {
      cwbState.blocks.push(blankBlock('New Block'));
      renderBuilder();
    });
    if (newBtn) newBtn.addEventListener('click', function () {
      var hasContent = cwbState.blocks.some(function (b) { return b.sets.length > 0; }) && (nameInput && nameInput.value.trim());
      if (hasContent && !confirm('Clear the current draft and start a new workout?')) return;
      resetBuilder();
    });

    function serializeBuilderBlocks() {
      return cwbState.blocks.map(function (b) {
        return {
          label: (b.label || 'Block').trim().slice(0, 40) || 'Block',
          sets: b.sets.map(function (s) {
            var intervalSec = (typeof parseTimeToSeconds === 'function' ? parseTimeToSeconds(s.interval) : null) || 0;
            return {
              reps: Math.max(1, Math.min(99, parseInt(s.reps, 10) || 1)),
              distance: Math.max(1, Math.min(10000, parseInt(s.distance, 10) || 0)),
              stroke: s.stroke || 'Freestyle',
              intervalSec: intervalSec,
              restSec: Math.max(0, Math.min(1800, parseInt(s.restSec, 10) || 0)),
              note: (s.note || '').trim().slice(0, 60)
            };
          })
        };
      });
    }

    // FREEMIUM: Free tier caps saved workouts at FREE_SAVED_WORKOUT_CAP;
    // All-Access Pro (and trial/admin) is unlimited. Only gates a brand-new
    // CREATE — updating an existing saved workout (cwbState.editingId set)
    // is always allowed, since it doesn't grow the swimmer's saved count.
    var FREE_SAVED_WORKOUT_CAP = 2;
    function hasFullAccess() { return typeof window.__hasFullAccess === 'function' && window.__hasFullAccess(); }

    if (saveBtn) saveBtn.addEventListener('click', function () {
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) { setStatus('Give this workout a name first.', true); if (nameInput) nameInput.focus(); return; }
      var hasAnySet = cwbState.blocks.some(function (b) { return b.sets.length > 0; });
      if (!hasAnySet) { setStatus('Add at least one set before saving.', true); return; }
      if (!window.__firebaseUser || typeof window.__customWorkoutCreate !== 'function') {
        setStatus('Sign in to save workouts to your profile.', true);
        return;
      }
      if (!cwbState.editingId && !hasFullAccess() && cwbSavedWorkouts.length >= FREE_SAVED_WORKOUT_CAP) {
        setStatus('Free plan is limited to ' + FREE_SAVED_WORKOUT_CAP + ' saved workouts — upgrade to All-Access Pro for unlimited.', true);
        return;
      }
      var blocks = serializeBuilderBlocks();
      var uid = window.__firebaseUser.uid;
      saveBtn.disabled = true;
      setStatus('Saving…');
      var task = cwbState.editingId
        ? window.__customWorkoutSave(uid, cwbState.editingId, name, blocks)
        : window.__customWorkoutCreate(uid, name, blocks);
      task.then(function (ref) {
        if (!cwbState.editingId && ref && ref.id) {
          cwbState.editingId = ref.id;
        }
        if (editingNoteEl) editingNoteEl.textContent = '(editing “' + name + '”)';
        setStatus('Saved.', false, true);
        loadSavedWorkouts(true);
      }).catch(function () {
        setStatus('Could not save — please check your connection and try again.', true);
      }).then(function () { saveBtn.disabled = false; });
    });

    if (startBtn) startBtn.addEventListener('click', function () {
      var name = (nameInput && nameInput.value.trim()) || 'Custom Workout';
      var steps = flattenCustomBlocks(serializeBuilderBlocks());
      startLiveWorkout(name, steps);
    });

    /* ============================= SAVED WORKOUTS LIST ============================= */
    var cwbSavedWorkouts = [];
    var cwbLoadedForUid = null;

    function workoutTotalMeters(workout) {
      return (workout.blocks || []).reduce(function (sum, b) {
        return sum + (b.sets || []).reduce(function (s2, s) { return s2 + (s.reps || 1) * (s.distance || 0); }, 0);
      }, 0);
    }

    function renderPlanNote() {
      if (!planNoteEl) return;
      if (hasFullAccess()) {
        planNoteEl.innerHTML = '<strong>All-Access Pro</strong> — unlimited saved workouts.';
        planNoteEl.classList.add('is-full');
      } else {
        planNoteEl.innerHTML = cwbSavedWorkouts.length + ' / ' + FREE_SAVED_WORKOUT_CAP + ' saved on the Free plan — ' +
          '<button type="button" class="link-inline" data-tab="pricing">upgrade for unlimited</button>';
        planNoteEl.classList.remove('is-full');
      }
    }
    window.__updateCustomWorkoutPlanNote = renderPlanNote;
    document.addEventListener('swimfit:accesschange', renderPlanNote);
    // planNoteEl's "upgrade" link is injected via innerHTML at runtime, so
    // it never existed in the DOM at page-load time for the page's own
    // generic [data-tab] click-wiring pass to have picked up — the same
    // "dynamic content needs its own delegation" pattern the generated
    // workout result panel already uses for its own [data-tab] buttons.
    if (planNoteEl) planNoteEl.addEventListener('click', function (e) {
      var tabBtn = e.target.closest('[data-tab]');
      if (tabBtn && typeof window.switchTab === 'function') window.switchTab(tabBtn.dataset.tab);
    });

    function renderSavedList() {
      renderPlanNote();
      if (!savedListEl) return;
      if (!cwbSavedWorkouts.length) {
        savedListEl.innerHTML = '<p class="cwb-empty-note">No saved workouts yet — build one on the right and hit Save.</p>';
        return;
      }
      savedListEl.innerHTML = cwbSavedWorkouts.map(function (w) {
        var blockCount = (w.blocks || []).length;
        var totalM = workoutTotalMeters(w);
        return '<div class="cwb-workout-item' + (w.id === cwbState.editingId ? ' is-editing' : '') + '" data-workout-id="' + w.id + '">' +
          '<div class="cwb-workout-item-info"><strong>' + escHtml(w.name) + '</strong>' +
          '<span class="cwb-workout-item-meta">' + blockCount + ' block' + (blockCount === 1 ? '' : 's') + ' · ' + (typeof formatDistanceM === 'function' ? formatDistanceM(totalM, 1) : totalM + 'm') + '</span></div>' +
          '<div class="cwb-workout-item-actions">' +
          '<button type="button" class="cwb-icon-btn cwb-icon-start" data-action="start" aria-label="Start Live Workout: ' + escHtml(w.name) + '">' + icon('i-play') + '</button>' +
          '<button type="button" class="cwb-icon-btn" data-action="edit" aria-label="Edit ' + escHtml(w.name) + '">' + icon('i-settings') + '</button>' +
          '<button type="button" class="cwb-icon-btn cwb-icon-delete" data-action="delete" aria-label="Delete ' + escHtml(w.name) + '">' + icon('i-close') + '</button>' +
          '</div></div>';
      }).join('');
    }

    function loadWorkoutIntoBuilder(workout) {
      cwbState.editingId = workout.id;
      cwbState.blocks = (workout.blocks && workout.blocks.length ? workout.blocks : [{ label: 'Warm-Up', sets: [] }]).map(function (b) {
        var sets = (b.sets && b.sets.length ? b.sets : [{}]).map(function (s) {
          return {
            id: newLocalId(), reps: s.reps || 4, distance: s.distance || 100, stroke: s.stroke || 'Freestyle',
            interval: s.intervalSec ? formatClock(s.intervalSec) : '', restSec: s.restSec || '', note: s.note || ''
          };
        });
        return { id: newLocalId(), label: b.label || 'Block', sets: sets };
      });
      if (nameInput) nameInput.value = workout.name || '';
      if (editingNoteEl) editingNoteEl.textContent = '(editing “' + (workout.name || '') + '”)';
      setStatus('');
      renderBuilder();
      renderSavedList();
      blocksListEl.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }

    if (savedListEl) savedListEl.addEventListener('click', function (e) {
      var itemEl = e.target.closest('.cwb-workout-item');
      if (!itemEl) return;
      var id = itemEl.dataset.workoutId;
      var workout = cwbSavedWorkouts.find(function (w) { return w.id === id; });
      if (!workout) return;
      if (e.target.closest('[data-action="start"]')) {
        startLiveWorkout(workout.name, flattenCustomBlocks(workout.blocks || []));
      } else if (e.target.closest('[data-action="edit"]')) {
        loadWorkoutIntoBuilder(workout);
      } else if (e.target.closest('[data-action="delete"]')) {
        if (!confirm('Delete “' + workout.name + '”? This can’t be undone.')) return;
        var user = window.__firebaseUser;
        if (!user || typeof window.__customWorkoutDelete !== 'function') return;
        window.__customWorkoutDelete(user.uid, id).then(function () {
          cwbSavedWorkouts = cwbSavedWorkouts.filter(function (w) { return w.id !== id; });
          if (cwbState.editingId === id) resetBuilder();
          renderSavedList();
        }).catch(function () { alert('Could not delete this workout — please try again.'); });
      }
    });

    function loadSavedWorkouts(force) {
      var user = window.__firebaseUser;
      if (!user || typeof window.__customWorkoutsList !== 'function') return;
      if (!force && cwbLoadedForUid === user.uid) return;
      cwbLoadedForUid = user.uid;
      window.__customWorkoutsList(user.uid).then(function (list) {
        cwbSavedWorkouts = list;
        renderSavedList();
      }).catch(function () {
        if (savedListEl) savedListEl.innerHTML = '<p class="cwb-empty-note">Could not load your saved workouts — check your connection and try again.</p>';
      });
    }
    document.querySelectorAll('[data-tab="workouts"]').forEach(function (btn) {
      btn.addEventListener('click', function () { loadSavedWorkouts(); });
    });
    document.addEventListener('swimfit:authchange', function (e) {
      if (e.detail.user) {
        loadSavedWorkouts(true);
      } else {
        cwbSavedWorkouts = [];
        cwbLoadedForUid = null;
        resetBuilder();
        renderSavedList();
        if (live) stopLiveWorkout();
      }
    });

    /* ============================= FLATTENING: BUILDER/SAVED → FLAT STEPS ============================= */
    // A ~1:40/100m generic pace assumption — only used when a custom set's
    // own Interval field was left blank, so Live Mode can never divide by
    // zero or run an unbounded "rep" with no target time.
    function estimateDurationSec(distanceM) { return Math.max(20, Math.round((distanceM / 100) * 100)); }

    function flattenCustomBlocks(blocks) {
      var steps = [];
      (blocks || []).forEach(function (block) {
        var label = (block.label || 'Block').trim() || 'Block';
        (block.sets || []).forEach(function (set) {
          var reps = Math.max(1, parseInt(set.reps, 10) || 1);
          var distance = Math.max(1, parseInt(set.distance, 10) || 0);
          var stroke = set.stroke || 'Freestyle';
          var intervalSec = set.intervalSec > 0 ? set.intervalSec : estimateDurationSec(distance);
          var note = set.note || '';
          for (var r = 1; r <= reps; r++) {
            steps.push({ kind: 'swim', blockLabel: label, stroke: stroke, distance: distance, durationSec: intervalSec, repIndex: r, repsTotal: reps, note: note });
          }
          var restSec = parseInt(set.restSec, 10) || 0;
          if (restSec > 0) steps.push({ kind: 'rest', blockLabel: label, durationSec: restSec });
        });
      });
      return steps;
    }

    // Live Mode for the daily-generated workout reads exactly what's already
    // on screen in #workoutResult (via window.__extractStructuredWorkout,
    // the same DOM the PDF export reads) — so it can never drift from what
    // the swimmer actually generated, and needs zero access to the
    // generator's own internal archetype/pace logic.
    function flattenGeneratedWorkout() {
      if (typeof window.__extractStructuredWorkout !== 'function') return null;
      var resultEl = document.getElementById('workoutResult');
      if (!resultEl) return null;
      var data = window.__extractStructuredWorkout(resultEl);
      if (!data || !data.blocks || !data.blocks.length) return null;
      var steps = [];
      data.blocks.forEach(function (block) {
        var label = block.title || 'Set';
        (block.rows || []).forEach(function (row) {
          var m = row.label.match(/^(\d+)\s*[×x]\s*(\d+)m\s*(.*)$/i);
          var reps = m ? Math.max(1, parseInt(m[1], 10)) : 1;
          var distance = m ? Math.max(1, parseInt(m[2], 10)) : 0;
          var strokeText = m ? m[3] : row.label;
          var stroke = ((strokeText || '').split(',')[0] || strokeText || 'Swim').trim() || 'Swim';
          var intervalSec = row.interval ? parseTimeToSeconds(row.interval) : null;
          if (!intervalSec || intervalSec <= 0) intervalSec = estimateDurationSec(distance);
          for (var r = 1; r <= reps; r++) {
            steps.push({ kind: 'swim', blockLabel: label, stroke: stroke, distance: distance, durationSec: intervalSec, repIndex: r, repsTotal: reps, note: '' });
          }
        });
      });
      return { title: 'Today’s Generated Workout', steps: steps };
    }

    if (liveModeBtn) liveModeBtn.addEventListener('click', function () {
      var data = flattenGeneratedWorkout();
      if (!data || !data.steps.length) { alert('Generate a workout first.'); return; }
      startLiveWorkout(data.title, data.steps);
    });

    /* ============================= LIVE ENGINE: AUDIO + WAKE LOCK ============================= */
    var audioCtx = null;
    function ensureAudioCtx() {
      if (audioCtx) return audioCtx;
      try {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) audioCtx = new Ctx();
      } catch (e) { /* Web Audio unavailable in this browser/context */ }
      return audioCtx;
    }
    // A short synthesized tone — a functional UI cue (like a kitchen timer
    // beep), not music, so there's no licensing/asset dependency at all.
    function beep(freq, durMs) {
      var ctx = ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
      try {
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durMs / 1000);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + durMs / 1000 + 0.03);
      } catch (e) { /* ignore — a missed beep never blocks the timer itself */ }
    }

    // A sharp pool-deck whistle/start-horn — the "take off" cue fired the
    // instant a set/rep's timer hits 00:00 and the next one begins. A pure
    // sine tone (used for the softer 3-2-1 countdown ticks above) doesn't
    // read as a real whistle; a square wave has the harsher, buzzier
    // harmonic content an actual whistle/buzzer has, and a fast few-step
    // frequency wobble mimics the "trill" of a real pea whistle rather than
    // a flat, synthetic tone. Louder and longer than the tick beep so it's
    // unmistakably the GO cue, not another countdown tick.
    function playStartHorn() {
      var ctx = ensureAudioCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
      try {
        var now = ctx.currentTime;
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(2150, now);
        osc.frequency.linearRampToValueAtTime(2600, now + 0.05);
        osc.frequency.linearRampToValueAtTime(2100, now + 0.10);
        osc.frequency.linearRampToValueAtTime(2550, now + 0.15);
        osc.frequency.linearRampToValueAtTime(2150, now + 0.22);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.32, now + 0.015);
        gain.gain.setValueAtTime(0.32, now + 0.24);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.42);
      } catch (e) { /* ignore — a missed horn never blocks the timer itself */ }
    }

    // Screen Wake Lock — best-effort so a phone poolside doesn't lock mid-set
    // and silently pause the whole hands-free flow; not supported everywhere
    // (e.g. older Safari/Firefox), so this degrades gracefully to "the
    // swimmer's own screen-timeout setting still applies" with no error.
    var wakeLockSentinel = null;
    function requestWakeLock() {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').then(function (sentinel) { wakeLockSentinel = sentinel; }).catch(function () {});
    }
    function releaseWakeLock() {
      if (wakeLockSentinel) { wakeLockSentinel.release().catch(function () {}); wakeLockSentinel = null; }
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && live && !overlay.hidden) requestWakeLock();
    });

    function speak(text) {
      if (!live || !live.voiceEnabled || typeof window.speechSynthesis === 'undefined') return;
      try {
        window.speechSynthesis.cancel();
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        window.speechSynthesis.speak(u);
      } catch (e) { /* speech synthesis unavailable/blocked — visual + beep cues still work */ }
    }
    function announceStep(step) {
      if (!step) return;
      var text;
      if (step.kind === 'rest') {
        text = 'Rest, ' + Math.round(step.durationSec) + ' seconds.';
      } else if (step.repIndex === 1) {
        text = 'Next: ' + step.repsTotal + (step.repsTotal > 1 ? ' times ' : ' time ') + step.distance + ' meters ' + step.stroke + '. Go.';
      } else {
        text = 'Rep ' + step.repIndex + ' of ' + step.repsTotal + '. Go.';
      }
      speak(text);
    }
    function announceComplete() { speak('Workout complete. Nice work.'); }

    /* ============================= LIVE ENGINE: STATE MACHINE ============================= */
    var live = null;

    function totalStepDistance(steps) {
      return steps.reduce(function (m, s) { return m + (s.kind === 'swim' ? s.distance : 0); }, 0);
    }

    function renderSetsList() {
      if (!setsListEl) return;
      var html = '', lastLabel = null;
      live.steps.forEach(function (step, i) {
        if (step.blockLabel !== lastLabel) {
          html += '<div class="live-workout-set-block-label">' + escHtml(step.blockLabel) + '</div>';
          lastLabel = step.blockLabel;
        }
        var marker = step.kind === 'rest' ? icon('i-clock') : String(step.repIndex);
        var title = step.kind === 'rest'
          ? 'Rest'
          : step.distance + 'm ' + escHtml(step.stroke) + (step.repsTotal > 1 ? ' (rep ' + step.repIndex + '/' + step.repsTotal + ')' : '');
        var meta = formatClock(step.durationSec) + (step.kind === 'rest' ? ' rest' : ' interval');
        html += '<div class="live-workout-step" data-step-index="' + i + '">' +
          '<div class="live-workout-step-marker">' + marker + '</div>' +
          '<div class="live-workout-step-body"><div class="live-workout-step-title">' + title + '</div>' +
          '<div class="live-workout-step-meta">' + meta + '</div></div></div>';
      });
      setsListEl.innerHTML = html;
    }
    function updateSetsListHighlight() {
      if (!setsListEl) return;
      var current = null;
      Array.prototype.forEach.call(setsListEl.querySelectorAll('.live-workout-step'), function (row) {
        var isCurrent = parseInt(row.dataset.stepIndex, 10) === live.index;
        row.classList.toggle('is-current', isCurrent);
        if (isCurrent) current = row;
      });
      if (current) current.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    function markStepDone(index) {
      if (!setsListEl) return;
      var row = setsListEl.querySelector('.live-workout-step[data-step-index="' + index + '"]');
      if (row) { row.classList.remove('is-current'); row.classList.add('is-done'); }
    }

    function updatePhaseUI(step) {
      if (step.kind === 'rest') {
        phaseBadgeEl.textContent = 'REST';
        phaseBadgeEl.className = 'live-workout-phase-badge is-rest';
        timerSubEl.textContent = step.blockLabel + ' — Rest';
      } else {
        phaseBadgeEl.textContent = 'SWIM';
        phaseBadgeEl.className = 'live-workout-phase-badge';
        timerSubEl.textContent = step.blockLabel + ' — ' +
          (step.repsTotal > 1 ? 'Rep ' + step.repIndex + ' of ' + step.repsTotal + ' — ' : '') +
          step.distance + 'm ' + step.stroke;
      }
    }
    // 5-4-3-2-1 warning-yellow window, matching the request's own spec —
    // deliberately a wider window than the 3-2-1 audio tick below (that's
    // just the "about to go" audio nudge; the color has more room to warn).
    var TIMER_WARNING_SEC = 5;
    // How long the GO-green flash holds before the ring/digits settle back
    // to their normal color (or straight back to warning-yellow, for a
    // interval so short it's already inside its own final-5-seconds window).
    var GO_FLASH_MS = 450;

    function renderTimer(remaining, total) {
      timerEl.textContent = formatClock(remaining);
      var frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
      ringProgressEl.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - frac));
      // The GO flash (see advanceStep()) owns the color for its own brief
      // window — this only ever toggles the warning state outside of that.
      if (ringWrapEl && !ringWrapEl.classList.contains('is-go')) {
        ringWrapEl.classList.toggle('is-warning', remaining > 0.05 && remaining <= TIMER_WARNING_SEC + 0.05);
      }
    }
    function renderTotals() {
      elapsedTotalEl.textContent = formatClock((Date.now() - live.workoutStartTs) / 1000);
      distDoneEl.textContent = typeof formatDistanceM === 'function' ? formatDistanceM(live.doneDistanceM, 2) : live.doneDistanceM + 'm';
    }

    // Flashes the ring + digits GO-green for a beat at the exact instant a
    // new rep/rest/set begins — the visual half of the "take-off" cue,
    // paired with playStartHorn() below for the audible half.
    function flashGo() {
      if (!ringWrapEl) return;
      if (live && live.goFlashTimeout) { clearTimeout(live.goFlashTimeout); live.goFlashTimeout = null; }
      ringWrapEl.classList.remove('is-warning');
      ringWrapEl.classList.add('is-go');
      var timeoutId = setTimeout(function () {
        ringWrapEl.classList.remove('is-go');
        if (live && live.goFlashTimeout === timeoutId) live.goFlashTimeout = null;
      }, GO_FLASH_MS);
      if (live) live.goFlashTimeout = timeoutId;
    }

    // playHorn defaults to true (every automatic timer-driven transition,
    // including the very first rep of the whole workout, is a genuine
    // "take off" moment) — the manual Skip control passes false so a
    // swimmer deliberately jumping ahead doesn't get startled by the horn.
    function advanceStep(playHorn) {
      live.index++;
      if (live.index >= live.steps.length) { completeWorkout(); return; }
      var step = live.steps[live.index];
      live.stepStartTs = Date.now();
      live.pauseAccumSec = 0;
      live.pausedAt = null;
      live.stepDurationSec = step.durationSec;
      live.lastBeepSec = null;
      updatePhaseUI(step);
      renderTimer(step.durationSec, step.durationSec);
      flashGo();
      if (playHorn !== false) playStartHorn();
      announceStep(step);
      updateSetsListHighlight();
    }
    function finishCurrentStep(skipHorn) {
      var step = live.steps[live.index];
      if (step && step.kind === 'swim') live.doneDistanceM += step.distance;
      if (live.index > -1) markStepDone(live.index);
      advanceStep(!skipHorn);
    }

    function tick() {
      if (!live || !live.running) return;
      var elapsed = (Date.now() - live.stepStartTs) / 1000 - live.pauseAccumSec;
      var remaining = Math.max(0, live.stepDurationSec - elapsed);
      renderTimer(remaining, live.stepDurationSec);
      renderTotals();
      var remWhole = Math.ceil(remaining);
      if (remaining > 0.05 && remWhole <= 3 && live.lastBeepSec !== remWhole) {
        live.lastBeepSec = remWhole;
        beep(660, 90);
      }
      if (remaining <= 0.05) finishCurrentStep(false);
    }

    function completeWorkout() {
      live.running = false;
      if (live.tickHandle) { clearInterval(live.tickHandle); live.tickHandle = null; }
      beep(1046, 260);
      announceComplete();
      releaseWakeLock();
      var totalMin = Math.max(1, Math.round((Date.now() - live.workoutStartTs) / 60000));
      var distText = typeof formatDistanceM === 'function' ? formatDistanceM(live.doneDistanceM, 2) : live.doneDistanceM + 'm';
      completeSummaryEl.textContent = 'You logged ' + distText + ' in about ' + totalMin + ' minute' + (totalMin === 1 ? '' : 's') + '.';
      bodyEl.style.display = 'none';
      completeScreenEl.hidden = false;
      // Auto-logs straight into the Distance Tracker — the exact same
      // window.__swimLogAdd bridge the generated workout's "Complete
      // Workout" button and the Tracker's own manual log form already use,
      // so a finished Live Mode session shows up there identically.
      if (window.__firebaseUser && typeof window.__swimLogAdd === 'function' && live.doneDistanceM > 0 && !live.logged) {
        live.logged = true;
        window.__swimLogAdd({ distanceMeters: live.doneDistanceM, loggedAt: new Date() })
          .then(function () { document.dispatchEvent(new CustomEvent('swimfit:swimlogchange')); })
          .catch(function () {});
      }
    }

    function startLiveWorkout(title, steps) {
      if (!steps || !steps.length) { alert('This workout has no sets yet — add at least one set before starting.'); return; }
      live = {
        title: title, steps: steps, index: -1,
        stepStartTs: 0, stepDurationSec: 0, pausedAt: null, pauseAccumSec: 0,
        running: true, voiceEnabled: !voiceToggle || voiceToggle.checked,
        doneDistanceM: 0, workoutStartTs: Date.now(), tickHandle: null,
        lastBeepSec: null, logged: false, goFlashTimeout: null
      };
      liveTitleEl.textContent = title;
      bodyEl.style.display = '';
      completeScreenEl.hidden = true;
      playPauseBtn.innerHTML = icon('i-pause');
      playPauseBtn.setAttribute('aria-label', 'Pause');
      renderSetsList();
      overlay.hidden = false;
      document.body.classList.add('live-workout-active');
      requestWakeLock();
      advanceStep();
      live.tickHandle = setInterval(tick, 200);
    }

    function stopLiveWorkout() {
      if (live && live.tickHandle) clearInterval(live.tickHandle);
      if (live && live.goFlashTimeout) clearTimeout(live.goFlashTimeout);
      try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      releaseWakeLock();
      overlay.hidden = true;
      document.body.classList.remove('live-workout-active');
      if (completeScreenEl) completeScreenEl.hidden = true;
      if (bodyEl) bodyEl.style.display = '';
      if (ringWrapEl) ringWrapEl.classList.remove('is-warning', 'is-go');
      live = null;
    }

    playPauseBtn.addEventListener('click', function () {
      if (!live) return;
      if (live.running) {
        live.running = false;
        live.pausedAt = Date.now();
        playPauseBtn.innerHTML = icon('i-play');
        playPauseBtn.setAttribute('aria-label', 'Resume');
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      } else {
        if (live.pausedAt) { live.pauseAccumSec += (Date.now() - live.pausedAt) / 1000; live.pausedAt = null; }
        live.running = true;
        playPauseBtn.innerHTML = icon('i-pause');
        playPauseBtn.setAttribute('aria-label', 'Pause');
      }
    });
    restartBtn.addEventListener('click', function () {
      if (!live || live.index < 0) return;
      live.stepStartTs = Date.now();
      live.pauseAccumSec = 0;
      live.pausedAt = live.running ? null : Date.now();
      live.lastBeepSec = null;
    });
    skipBtn.addEventListener('click', function () {
      if (!live || live.index < 0) return;
      finishCurrentStep(true);
    });
    exitBtn.addEventListener('click', function () {
      if (!live) { stopLiveWorkout(); return; }
      var mid = live.index > -1 && live.index < live.steps.length - 1 && completeScreenEl.hidden;
      if (mid && !confirm('Exit this workout? Your progress on the current set won’t be saved.')) return;
      stopLiveWorkout();
    });
    if (completeCloseBtn) completeCloseBtn.addEventListener('click', stopLiveWorkout);
    if (voiceToggle) voiceToggle.addEventListener('change', function () {
      if (live) live.voiceEnabled = voiceToggle.checked;
      if (!voiceToggle.checked) { try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    });
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden) return;
      if (e.key === 'Escape') { exitBtn.click(); }
      else if (e.code === 'Space' && completeScreenEl.hidden) { e.preventDefault(); playPauseBtn.click(); }
    });
  })();
