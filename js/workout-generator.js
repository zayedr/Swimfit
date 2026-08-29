  /* ============================= WORKOUT GENERATOR ============================= */
  // The daily rotation boundary is a fixed 16:00 UAE time (UTC+4) == 12:00 UTC
  // instant — the same moment for every swimmer worldwide, not each visitor's
  // own local midnight. Shifting the timestamp back 12h before reading UTC
  // calendar fields lands a plain UTC day-boundary check exactly on that real
  // 4pm UAE cutover.
  var ROTATION_SHIFT_MS = 12 * 60 * 60 * 1000;
  function uaeRotationShiftedDate(d) { return new Date(d.getTime() - ROTATION_SHIFT_MS); }
  function dayIndexForDate(d) {
    var shifted = uaeRotationShiftedDate(d);
    var start = Date.UTC(shifted.getUTCFullYear(), 0, 0);
    var today = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
    return Math.floor((today - start) / 86400000);
  }
  function dayIndex() { return dayIndexForDate(new Date()); }
  // Year folded in so the seed doesn't repeat every 365/366 days like a bare
  // dayIndex() would.
  function dailySeedForDate(d) { return uaeRotationShiftedDate(d).getUTCFullYear() * 1000 + dayIndexForDate(d); }
  function dailySeed() { return dailySeedForDate(new Date()); }
  function weekIndex() { return Math.floor(dayIndex() / 7); }
  // 6-HOUR FRESHNESS BUCKET — swimmers train twice a day (sometimes three
  // times), so a workout that only refreshes once every 24 hours is too slow
  // for a swimmer generating a second session the same afternoon. This is
  // deliberately SEPARATE from dailySeed()/dayIndex()/weekIndex() above,
  // which still drive genuinely calendar-based content (the Weekly Training
  // Schedule's Mon-Sun rotation, Gym's weekly focus) that has no business
  // flipping every 6 hours — this bucket only feeds the generator's own
  // archetype/structure freshness (workoutRng, the Warm-Up/Pre-Set rotation
  // walk below), never the day-of-week schedule itself.
  var SIX_HOUR_MS = 6 * 60 * 60 * 1000;
  function sixHourBucket(dateObj) { return Math.floor(dateObj.getTime() / SIX_HOUR_MS); }

  // COMPLETION-TRIGGERED ROTATION — a second, separate mechanism from the
  // daily one above, specifically for the Warm-Up blueprint and Pre-Set
  // archetype. This used to be a fixed 12-hour UAE-clock window (before that,
  // a per-click Math.random() reshuffle); per direct follow-up feedback that
  // a time-based window still felt "stale" between rotations, it's now tied
  // to the swimmer's own actual progress instead of a clock: both stay FIXED
  // across every Generate click until the swimmer presses "Complete
  // Workout," at which point the very next Generate produces a different
  // pick. `workoutGenSeed()` reads a plain incrementing counter persisted in
  // localStorage (`swimfit_workout_gen_seed`, mirroring this file's existing
  // localStorage-preference precedent — e.g. the Weekly Volume Goal, theme,
  // and language toggles); `bumpWorkoutGenSeed()` increments it, called only
  // from the Complete Workout button's own success handler below.
  var WORKOUT_GEN_SEED_KEY = 'swimfit_workout_gen_seed';
  function workoutGenSeed() {
    var stored = parseInt(localStorage.getItem(WORKOUT_GEN_SEED_KEY), 10);
    return isNaN(stored) ? 0 : stored;
  }
  function bumpWorkoutGenSeed() {
    var next = workoutGenSeed() + 1;
    try { localStorage.setItem(WORKOUT_GEN_SEED_KEY, String(next)); } catch (e) { /* storage unavailable — no-op */ }
    return next;
  }

  // FNV-1a, used only to fold the swimmer's own selections into the variance
  // seed below — not security-sensitive, just needs to spread similar strings
  // to very different integers.
  function stringHash(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // THE WARM-UP/PRE-SET VARIANCE SEED — a real bug fix, not a tuning tweak.
  // postCompletionRng used to be seeded from workoutGenSeed() ALONE, i.e. a
  // localStorage counter that only ever moves when the swimmer presses
  // "Complete Workout". The practical effect: a swimmer who generates
  // workouts without ever pressing that button got the byte-identical
  // Warm-Up blueprint and Pre-Set archetype forever — not merely "the same
  // all day", the same every day, indefinitely. That's exactly the
  // "outputting the exact same exercises/distances every single day"
  // report.
  //
  // The seed is now a mix of THREE independent inputs, so a change to any
  // one of them re-rolls the sequence:
  //   • a 6-hour freshness bucket (sixHourBucket(), not the calendar day) ->
  //     genuinely rotates every 6 hours, so a swimmer training twice in one
  //     day gets a fresh, deeply-structured workout for the second session
  //     rather than the identical one from the morning
  //   • the completion counter -> still rotates the moment a workout is
  //     completed, preserving the earlier explicitly-requested behaviour
  //     rather than silently dropping it
  //   • discipline / goals / level / swimmer type -> a Butterfly sprinter and
  //     a Freestyle distance swimmer no longer share a warm-up shape
  // state.distance is deliberately EXCLUDED: the blueprint is already scaled
  // to warmupM by buildToShare(), so volume changes already change the
  // rendered distances, and including it would reshuffle the whole structure
  // on every drag of the distance slider.
  // A SECOND, SEPARATE BUG on top of the one above, and the one behind the
  // "still the exact same warm-up when I generate for a different day"
  // report: the seed had no idea which Weekly Schedule day was actually
  // driving generation. Tapping a day badge sets state.scheduleOverrideKey
  // and applies that day's goalKeys — but SEVERAL WEEKLY_FOCUS days share
  // identical goalKeys ('im' and 'technique' are both technique+endurance;
  // 'sprint' and 'race' are both speed+endurance), so previewing one of
  // those days produced a byte-identical profile string, a byte-identical
  // seed, and therefore a byte-identical Warm-Up and Pre-Set. Mixing the
  // effective focus key in directly means every one of the seven schedule
  // days re-rolls, regardless of whether two of them happen to want the same
  // goal pools.
  function generatorProfileString() {
    return [
      (state.disciplines || []).join('|'),
      (state.goals || []).join('|'),
      state.level || '',
      state.swimmerType || ''
    ].join('~');
  }
  // Split out so the day-walk below can hash the profile and read the
  // completion counter ONCE instead of once per simulated day (the counter
  // read hits localStorage).
  function varianceSeedFrom(profileStr, genSeed, dateObj, focusKey) {
    return (stringHash(profileStr + '~' + (focusKey || ''))
      ^ Math.imul(sixHourBucket(dateObj), 0x9E3779B1)
      ^ Math.imul(genSeed + 1, 0x85EBCA77)) >>> 0;
  }
  function generatorVarianceSeed(dateObj, focusKey) {
    return varianceSeedFrom(generatorProfileString(), workoutGenSeed(), dateObj, focusKey);
  }
  // Drives workoutRng — the Main Set/Cool-Down's own freshness — combining
  // the 6-hour bucket with the swimmer's discipline/goals/level/swimmer-type
  // profile (generatorProfileString() already carries all four), so two
  // swimmers training the same 6-hour window but on different disciplines or
  // levels never land on the same generated set, and a swimmer's own second
  // session later the same day gets a genuinely different one.
  function freshnessSeed(dateObj) {
    return (stringHash(generatorProfileString()) ^ Math.imul(sixHourBucket(dateObj), 0x9E3779B1)) >>> 0;
  }
  // GUARANTEED-NON-REPEAT 6-HOUR ROTATION.
  //
  // The previous approach (pickOneNoRepeatFrom: draw today, simulate
  // yesterday, re-draw on a collision) is only *probabilistically* correct,
  // and this file already documented why — a day whose own pick needed the
  // tie-break re-draw can't have that re-draw reconstructed by the next day's
  // independent simulation, so the guard silently misses. Measured directly:
  // over 14 simulated consecutive days it still produced a back-to-back
  // repeat of the same Warm-Up blueprint.
  //
  // This replaces the draw-and-compare with a WALK. Starting from a fixed
  // epoch, each 6-hour bucket advances the pool index by a step in [1, n-1]
  // derived from that bucket's own seed. A step is never 0, so
  // idx(B) !== idx(B-1) is true BY CONSTRUCTION rather than by a check that
  // can fail — and because the walk is anchored to a fixed epoch (not a
  // rolling window), the index any given bucket lands on is a pure, exactly-
  // reproducible function of the timestamp, with no hidden branch to
  // reconstruct. The bucket width is SIX HOURS (not a full day) so a
  // swimmer generating a second session the same day gets a genuinely fresh
  // Warm-Up/Pre-Set, not the same one from the morning.
  //
  // `salt` keeps independent pools (Warm-Up blueprint vs Pre-Set archetype)
  // walking independently instead of in lockstep.
  var ROTATION_EPOCH_MS = Date.UTC(2026, 0, 1);
  var ROTATION_MAX_STEPS = 8000; // ~5.5 years at 4 buckets/day; a hard bound on the walk cost
  function dailyRotationPick(pool, salt, nowMs) {
    if (!pool || !pool.length) return null;
    var n = pool.length;
    if (n === 1) return pool[0];
    // With an override active every bucket in the walk shares that pinned
    // focus key; with none, each bucket contributes its own real schedule
    // key (from whichever calendar day that bucket falls on), so the walk
    // still reflects the actual weekly rotation underneath the 6h freshness.
    var overrideKey = state.scheduleOverrideKey || null;
    var nowT = typeof nowMs === 'number' ? nowMs : Date.now();
    var profileStr = generatorProfileString();
    var genSeed = workoutGenSeed();
    var totalBuckets = Math.floor((nowT - ROTATION_EPOCH_MS) / SIX_HOUR_MS);
    if (totalBuckets < 0) totalBuckets = 0;
    if (totalBuckets > ROTATION_MAX_STEPS) totalBuckets = ROTATION_MAX_STEPS;
    var idx = 0;
    for (var back = totalBuckets; back >= 0; back--) {
      var d = new Date(nowT - back * SIX_HOUR_MS);
      var key = overrideKey || WEEKLY_FOCUS[uaeRotationShiftedDate(d).getUTCDay()].key;
      var seed = (varianceSeedFrom(profileStr, genSeed, d, key) ^ Math.imul(salt, 0x27D4EB2F)) >>> 0;
      var rng = makeSeededRandom(seed);
      idx = (idx + 1 + Math.floor(rng() * (n - 1))) % n;
    }
    return pool[idx];
  }

  // Deterministic PRNG (mulberry32) so a workout generated within the same
  // 6-hour window always comes out the same for a given set of picks —
  // refreshing automatically every 6 hours — instead of reshuffling on
  // every single click of Generate. pickN/pickOne/roundCountFor below all
  // draw from workoutRng rather than Math.random() directly;
  // generateWorkout() reseeds it from freshnessSeed() at the top of every
  // call.
  function makeSeededRandom(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var workoutRng = Math.random;
  // Reseeded from workoutGenSeed() at the top of every generateWorkout()
  // call — drives ONLY the Warm-Up blueprint and Pre-Set archetype picks, so
  // those two stay stable across every Generate click until the swimmer
  // completes a workout, at which point both rotate together.
  var postCompletionRng = Math.random;

  // Labels renamed to match the Weekly Training Schedule's own day
  // terminology directly (Sprint/Power, Aerobic/Distance, Technique/Drills
  // are three of the schedule's own six day names — see WEEKLY_FOCUS below),
  // per direct feedback that "Endurance/Speed/Technique" read as a different,
  // disconnected vocabulary from the schedule sitting right above this
  // picker. The underlying `key` values (and every archetype pool/pace/gym
  // orientation lookup keyed off them) are unchanged — this is a display-
  // label-only rename, not a new goal system. "Threshold" and "Race Pace"
  // (the schedule's other two non-technique/non-recovery day names) aren't
  // separate buttons here since they already draw from these same two pools
  // (endurance and speed respectively) rather than having distinct archetype
  // content of their own — a 5th/6th button with no distinct backing logic
  // would just be a cosmetic duplicate, not a real new choice.
  var GOALS = [
    { key: 'endurance', icon: 'i-wave', label: 'Aerobic / Distance', quote: 'Every length is a deposit in the bank of race day.' },
    { key: 'speed', icon: 'i-bolt', label: 'Sprint / Power', quote: 'Speed is a decision you make before you dive in.' },
    { key: 'technique', icon: 'i-target', label: 'Technique / Drills', quote: 'Perfect the stroke, and the clock takes care of itself.' }
  ];

  // WEEKLY PERIODIZATION SCHEDULE — a designed Mon-Sun training calendar,
  // replacing the old arbitrary "cycle through the 3 goals by day index"
  // default. Indexed 0=Sun..6=Sat to match Date#getUTCDay(), and read off the
  // same UAE-shifted timestamp dayIndex()/dailySeed() already use (see
  // uaeRotationShiftedDate() above), so this flips at the identical 16:00 UAE
  // boundary as the rest of the daily rotation — never a visitor's own local
  // midnight. goalKeys maps each day onto the existing Speed/Endurance/
  // Technique archetype pools rather than inventing a fourth pool system —
  // several days deliberately share an underlying pool (e.g. Aerobic/
  // Distance and Threshold both draw from ENDURANCE_ARCHETYPES, which already
  // contains a dedicated "Broken Threshold Swim" archetype) with only the
  // day's label/framing differing. Sunday's recoveryDay flag additionally
  // eases the target pace in generateWorkout(), since a true recovery day
  // needs to feel different, not just draw from the same pool under a
  // different name.
  // Each day's blurb is now THREE variants (sprinter/distance/both) instead of
  // one — the schedule reads differently depending on the swimmer's own
  // Swimmer Type selection (see the Race Goal card), not just which day it
  // is. goalKeys (which archetype pool the day draws from) stays fixed per
  // day — the swimmer-type difference is expressed through copy plus the
  // archetype-bias in generateWorkout() (a Sprinter/Distance swimmer is
  // guaranteed at least one archetype from their specialty pool every day,
  // not just on days already themed toward it). Saturday is now a genuine
  // Rest / Active Recovery day (restDay: true) rather than "Race Pace" —
  // generateWorkout() caps its volume hard regardless of the swimmer's
  // chosen Target Distance, since the whole point of a rest day is that it
  // ISN'T a full session.
  // EVERY NON-REST DAY NOW COMBINES TWO GOAL POOLS, NOT ONE — a real, direct
  // fix for two reported problems at once: (1) a single-goalKey day drew from
  // a ~6-archetype pool, so the day-to-day/no-repeat-vs-yesterday variety a
  // swimmer actually sees was capped by that pool's own small size, and a
  // handful of real consecutive days could plausibly land on visually
  // similar sets even with the rotation working correctly; (2) a pure
  // 'speed'-only day meant a genuine all-out-effort session with nothing
  // easing it — physiologically unrealistic, since even a real Sprint/Power
  // day needs some aerobic thread underneath it, and no swimmer should be
  // handed a 100%-max-effort day regardless of level. Sprint/Power and Race
  // Pace now also draw from ENDURANCE_ARCHETYPES, Aerobic/Distance and
  // Technique/Drills now also draw from each other's pools, and Threshold
  // also draws from SPEED_ARCHETYPES — every pairing chosen so the day's own
  // label stays the *dominant* theme (still reinforced via the swimmerType
  // bias and the Race-Pace Band/Elite-block guarantees below, which still
  // key off 'speed'/'endurance' being present) while the *pool* a swimmer
  // draws from roughly doubles in size. Saturday's Rest day deliberately
  // stays single-pool — blending in a second, harder pool would work against
  // the entire point of a scheduled rest day.
  var WEEKLY_FOCUS = [
    { key: 'im', label: 'IM / Transitional', goalKeys: ['technique', 'endurance'],
      blurbs: {
        both: 'A lighter, mixed day bridging the week’s hard efforts into the new week.',
        sprinter: 'Short, sharp transition work — keep the explosive feel alive without a full hard day.',
        distance: 'An easy mixed-stroke day to keep the aerobic engine ticking over.'
      } },
    { key: 'sprint', label: 'Sprint / Power', goalKeys: ['speed', 'endurance'],
      blurbs: {
        both: 'Explosive speed and power — today is about raw pace.',
        sprinter: 'Your signature day — max-effort starts, explosive power, and pure reaction speed.',
        distance: 'A shorter, sharper day to keep top-end speed from going stale.'
      } },
    { key: 'aerobic', label: 'Aerobic / Distance', goalKeys: ['endurance', 'technique'],
      blurbs: {
        both: 'Building the aerobic engine with sustained, honest-pace volume.',
        sprinter: 'A shorter aerobic top-up — just enough volume to support the speed work, not replace it.',
        distance: 'Your bread-and-butter day — real volume, honest pace, the engine that wins races.'
      } },
    { key: 'technique', label: 'Technique / Drills', goalKeys: ['technique', 'endurance'],
      blurbs: {
        both: 'Slowing down to fix the stroke — drills and feel-first work.',
        sprinter: 'Technical work aimed at the start, turn and breakout — the moments speed is actually won.',
        distance: 'Efficiency-focused drills — every wasted stroke over a long race adds up.'
      } },
    { key: 'threshold', label: 'Threshold', goalKeys: ['endurance', 'speed'],
      blurbs: {
        both: 'Sustained effort right at your aerobic ceiling.',
        sprinter: 'A controlled aerobic day to support recovery between your real speed sessions.',
        distance: 'Race-pace-adjacent volume at your threshold — this is where distance races are won.'
      } },
    { key: 'race', label: 'Race Pace', goalKeys: ['speed', 'endurance'],
      blurbs: {
        both: 'Locking in the exact pace you need to hit on race day.',
        sprinter: 'Explosive race-modeled speed — starts, turns, and the pace you’ll actually race at.',
        distance: 'Long race-pace repeats — rehearsing the exact effort your target race demands.'
      } },
    { key: 'rest', label: 'Rest / Active Recovery', goalKeys: ['endurance'], restDay: true,
      blurbs: {
        both: 'Scheduled rest — a light, low-volume session so the week’s work can actually absorb.',
        sprinter: 'Full rest for the nervous system — sprinting demands fresh legs more than any other style.',
        distance: 'A true rest day — even high-volume swimmers need one genuinely easy day.'
      } }
  ];
  function todaysFocus() { return WEEKLY_FOCUS[uaeRotationShiftedDate(new Date()).getUTCDay()]; }
  function focusBlurbFor(focus, swimmerType) { return focus.blurbs[swimmerType] || focus.blurbs.both; }
  // The Weekly Schedule card is now interactive — tapping a day badge lets a
  // swimmer preview/override which day's focus actually drives generation,
  // rather than always silently following the real calendar day. effectiveFocus()
  // is the one place generateWorkout() and the volume badge/schedule card read
  // "today's" focus from; state.scheduleOverrideKey is null whenever no
  // override is active (the common case), so this transparently falls back
  // to the real todaysFocus() with zero behavior change unless a swimmer has
  // actually tapped a day.
  function effectiveFocus() {
    if (state.scheduleOverrideKey) {
      for (var i = 0; i < WEEKLY_FOCUS.length; i++) {
        if (WEEKLY_FOCUS[i].key === state.scheduleOverrideKey) return WEEKLY_FOCUS[i];
      }
    }
    return todaysFocus();
  }

  // Feeds the Workout Generator's #disciplineChips picker (name/icon per
  // stroke) — the standalone Disciplines showcase tab that used to render a
  // matching grid from this same array has been removed, but the generator
  // still needs the stroke names/icons themselves.
  var DISCIPLINES = [
    { key: 'freestyle', icon: 'i-wave', name: 'Freestyle' },
    { key: 'backstroke', icon: 'i-back', name: 'Backstroke' },
    { key: 'butterfly', icon: 'i-fly', name: 'Butterfly' },
    { key: 'breaststroke', icon: 'i-breast', name: 'Breaststroke' },
    { key: 'medley', icon: 'i-medley', name: 'Individual Medley' }
  ];

  // Auto-save for the Workout Generator + Gym profile inputs — previously
  // these lived only in the in-memory `state` object (or, for the plain
  // form fields below, weren't captured anywhere at all outside of a live
  // generate/apply call), so every one of them silently reset on a page
  // reload or tab navigation. All of it is device-local generator
  // preference, not account data another device needs to see, so
  // localStorage (rather than a new Firestore field + rules deploy) is the
  // right store — same precedent as the existing units/theme/language/
  // weekly-goal preferences elsewhere in this file.
  var GENERATOR_PREFS_KEY = 'swimfit_generator_prefs';
  function loadGeneratorPrefs() {
    try { return JSON.parse(localStorage.getItem(GENERATOR_PREFS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function saveGeneratorPrefs(patch) {
    try {
      var current = loadGeneratorPrefs();
      Object.keys(patch).forEach(function (k) { current[k] = patch[k]; });
      localStorage.setItem(GENERATOR_PREFS_KEY, JSON.stringify(current));
    } catch (e) { /* private-browsing/storage-full: auto-save is best-effort */ }
  }
  var generatorPrefs = loadGeneratorPrefs();

  // FULLY FLEXIBLE PERSONAL BESTS: a one-time migration for any swimmer whose
  // browser still has the old fixed-4-stroke fields saved (pbDistanceFreestyle
  // etc., from before this became a freely-configurable entry list) — carries
  // their real logged values forward as the new default entries rather than
  // silently discarding them. A swimmer with no saved data at all gets the
  // same 4 starting rows (blank times) as before, just now fully editable —
  // any stroke/distance combination, and any number of entries — going forward.
  function migrateLegacyPbEntries(prefs) {
    var legacyStrokes = ['Freestyle', 'Backstroke', 'Butterfly', 'Breaststroke'];
    var fields = prefs.fields || {};
    return legacyStrokes.map(function (stroke) {
      return {
        stroke: stroke,
        distance: fields['pbDistance' + stroke] || '100',
        currentTime: fields['pbTime' + stroke] || '',
        targetTime: fields['raceGoalTarget' + stroke] || ''
      };
    });
  }

  var state = {
    disciplines: (generatorPrefs.disciplines && generatorPrefs.disciplines.length) ? generatorPrefs.disciplines : [DISCIPLINES[dayIndex() % DISCIPLINES.length].name],
    distance: generatorPrefs.distance || 2000,
    equipment: generatorPrefs.equipment || [],
    // Default goal selection now comes from the designed Weekly Periodization
    // Schedule (see WEEKLY_FOCUS above) instead of an arbitrary modulo-3 cycle
    // — still just a default, fully overridable via the goal chips below and
    // then persisted like any other saved preference.
    goals: (generatorPrefs.goals && generatorPrefs.goals.length) ? generatorPrefs.goals : todaysFocus().goalKeys.slice(),
    level: generatorPrefs.level || 'beginner',
    swimmerType: generatorPrefs.swimmerType || 'both',
    // null = no override, follow the real calendar day (effectiveFocus()
    // falls back to todaysFocus()); otherwise a WEEKLY_FOCUS key a swimmer
    // picked by tapping a day badge on the Weekly Schedule card.
    scheduleOverrideKey: generatorPrefs.scheduleOverrideKey || null,
    // Each entry: { stroke, distance, currentTime, targetTime } — freely
    // editable, any stroke+distance combination, any number of entries.
    pbEntries: (generatorPrefs.pbEntries && generatorPrefs.pbEntries.length) ? generatorPrefs.pbEntries : migrateLegacyPbEntries(generatorPrefs)
  };
  // Read by the global paywall lock (see the ACCESS LEVEL section near the
  // top of this file) so an expired-trial swimmer can still be recognized as
  // "currently on Beginner" and exempted from the hard lock — Beginner is a
  // permanently free level, never gated behind a subscription.
  window.__workoutsLevelIsBeginner = function () { return state.level === 'beginner'; };

  document.getElementById('disciplineChips').innerHTML = DISCIPLINES.map(function (d) {
    return '<button type="button" class="chip" data-discipline="' + d.name + '" aria-pressed="' + (state.disciplines.indexOf(d.name) > -1) + '">' + icon(d.icon) + d.name + '</button>';
  }).join('');
  document.getElementById('disciplineChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var name = chip.dataset.discipline;
    var idx = state.disciplines.indexOf(name);
    if (idx > -1) {
      if (state.disciplines.length === 1) return; // keep at least one selected
      state.disciplines.splice(idx, 1);
      chip.setAttribute('aria-pressed', 'false');
    } else {
      state.disciplines.push(name);
      chip.setAttribute('aria-pressed', 'true');
    }
    saveGeneratorPrefs({ disciplines: state.disciplines });
  });

  document.getElementById('equipmentGrid').innerHTML = GEAR.filter(function (g) { return g.key !== 'snorkel'; }).map(function (g) {
    return '<label class="equip-check"><input type="checkbox" data-equip="' + g.name + '"' + (state.equipment.indexOf(g.name) > -1 ? ' checked' : '') + '>' + icon(g.icon) + '<span>' + g.name + '</span></label>';
  }).join('');
  document.getElementById('equipmentGrid').addEventListener('change', function (e) {
    state.equipment = Array.from(this.querySelectorAll('input:checked')).map(function (i) { return i.dataset.equip; });
    saveGeneratorPrefs({ equipment: state.equipment });
  });

  // Weekly Training Schedule card — a read-only Mon-Sun strip with today's
  // focus visually highlighted, so a swimmer sees the periodization plan
  // before touching the config form below. Monday-first display order (the
  // natural way people read a weekly calendar) even though WEEKLY_FOCUS
  // itself is stored Sun-first to match Date#getUTCDay() indexing — this
  // function is the one place that reorders it for display. Now genuinely
  // DYNAMIC (not just rendered once at load) — it re-runs whenever Swimmer
  // Type changes, since every day's blurb reads differently depending on
  // that selection (see WEEKLY_FOCUS's blurbs.{sprinter,distance,both}
  // above), and Saturday's Rest/Active Recovery day gets its own muted
  // `.is-rest` styling regardless of swimmer type.
  function renderWeeklyScheduleCard() {
    var grid = document.getElementById('weeklyScheduleGrid');
    if (!grid) return;
    var todayIdx = uaeRotationShiftedDate(new Date()).getUTCDay();
    var mondayFirstOrder = [1, 2, 3, 4, 5, 6, 0];
    var active = effectiveFocus();
    grid.innerHTML = mondayFirstOrder.map(function (idx) {
      var focus = WEEKLY_FOCUS[idx];
      var dayAbbrev = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
      var isToday = idx === todayIdx;
      var isActive = focus.key === active.key;
      var cls = 'weekly-schedule-day' + (isToday ? ' is-today' : '') + (isActive ? ' is-active' : '') + (focus.restDay ? ' is-rest' : '');
      var blurb = focusBlurbFor(focus, state.swimmerType);
      var vol = recommendedVolumeFor(focus, state.level);
      var title = blurb + ' Recommended: ' + formatDistanceM(vol.min, 1) + '–' + formatDistanceM(vol.max, 1) + '.' + (isToday ? ' (today)' : '') + ' Tap to ' + (isActive && !isToday ? 'clear this override' : isActive ? 'preview another day' : 'preview/override this day') + '.';
      return '<button type="button" class="' + cls + '" role="listitem" data-focus-key="' + focus.key + '" aria-pressed="' + isActive + '" title="' + title.replace(/"/g, '&quot;') + '">' +
        '<span class="weekly-schedule-day-abbrev">' + dayAbbrev + '</span>' +
        '<span class="weekly-schedule-day-focus">' + focus.label + '</span>' +
        '</button>';
    }).join('');
    var note = document.getElementById('scheduleOverrideNote');
    if (note) {
      if (state.scheduleOverrideKey && state.scheduleOverrideKey !== todaysFocus().key) {
        note.innerHTML = icon('i-target') + ' Previewing <strong>' + active.label + '</strong> — tap it again to return to today’s auto schedule.';
        note.style.display = '';
      } else {
        note.style.display = 'none';
      }
    }
  }
  document.getElementById('weeklyScheduleGrid').addEventListener('click', function (e) {
    var btn = e.target.closest('.weekly-schedule-day');
    if (!btn) return;
    var key = btn.dataset.focusKey;
    var realTodayKey = todaysFocus().key;
    // Re-tapping the day that's already driving generation clears the
    // override and returns to following the real calendar day; tapping any
    // other day sets/moves the override to it.
    if (state.scheduleOverrideKey === key || (!state.scheduleOverrideKey && key === realTodayKey)) {
      state.scheduleOverrideKey = null;
    } else {
      state.scheduleOverrideKey = key;
    }
    saveGeneratorPrefs({ scheduleOverrideKey: state.scheduleOverrideKey });
    // Applying a day's focus also updates Fitness Goals to match — mirrors
    // the same "default but freely overridable" precedent state.goals
    // already used for its own initial seed from todaysFocus().goalKeys.
    var focus = effectiveFocus();
    state.goals = focus.goalKeys.slice();
    saveGeneratorPrefs({ goals: state.goals });
    renderGoalChips();
    updateQuote();
    renderWeeklyScheduleCard();
    renderRecommendedVolumeBadge();
  });
  // Initial render of the schedule card itself happens further below, once
  // recommendedVolumeFor() (which renderWeeklyScheduleCard()'s per-day
  // tooltips depend on) has actually been defined and assigned.

  // "Recommended Volume" guidance badge — a small reference strip under the
  // schedule showing a sane total-distance range for whichever day is
  // currently driving generation (effectiveFocus() — today by default, or a
  // swimmer's own tapped-day override), nudged narrower/wider depending on
  // that day's own primary goal (a Speed-focused session is honestly shorter
  // but higher-quality; an Endurance-focused one runs longer), and clamped
  // tighter on a scheduled Rest day. recommendedVolumeFor() is shared with
  // the per-day tooltip text in renderWeeklyScheduleCard() above so the badge
  // and each day's own hover text never disagree with each other.
  var RECOMMENDED_VOLUME_BY_LEVEL = {
    beginner: { min: 1000, max: 2000 },
    competitive: { min: 2000, max: 4000 },
    elite: { min: 3000, max: 6000 }
  };
  function recommendedVolumeFor(focus, level) {
    var base = RECOMMENDED_VOLUME_BY_LEVEL[level] || RECOMMENDED_VOLUME_BY_LEVEL.beginner;
    var min = base.min, max = base.max, note = '';
    var primaryGoal = focus.goalKeys[0];
    if (primaryGoal === 'speed') { max = Math.round(max * 0.8 / 100) * 100; note = ' — shorter, higher-quality sessions'; }
    else if (primaryGoal === 'endurance') { max = Math.round(max * 1.2 / 100) * 100; note = ' — longer aerobic volume pays off here'; }
    if (focus.restDay) { min = Math.min(min, 800); max = Math.min(max, 1200); note = ' — scheduled rest day, kept deliberately light'; }
    return { min: min, max: max, note: note };
  }
  function renderRecommendedVolumeBadge() {
    var badge = document.getElementById('recommendedVolumeBadge');
    if (!badge) return;
    var focus = effectiveFocus();
    var vol = recommendedVolumeFor(focus, state.level);
    badge.innerHTML = icon('i-target') + '<span>Recommended for <strong>' + state.level + '</strong> on <strong>' + focus.label + '</strong>: <strong>' +
      formatDistanceM(vol.min, 1) + '–' + formatDistanceM(vol.max, 1) + '</strong>' + vol.note + '</span>';
  }
  renderRecommendedVolumeBadge();
  // Now that recommendedVolumeFor() actually exists, it's safe to run the
  // Weekly Schedule card's first real render (its per-day tooltips depend on
  // that helper) — the click listener wired above already re-runs this on
  // every tap.
  renderWeeklyScheduleCard();

  var quoteText = document.getElementById('quoteText');
  var quoteGoal = document.getElementById('quoteGoal');
  function renderGoalChips() {
    document.getElementById('goalChips').innerHTML = GOALS.map(function (g) {
      return '<button type="button" class="chip" data-goal="' + g.key + '" aria-pressed="' + (state.goals.indexOf(g.key) > -1) + '">' + icon(g.icon) + g.label + '</button>';
    }).join('');
  }
  renderGoalChips();
  // With multiple goals selected, the quote/label always reflects the FIRST
  // selected one (the swimmer's primary focus) — same "primary = first
  // selected" convention primaryPbStrokeKey() already uses for disciplines,
  // rather than inventing a second rule here.
  function updateQuote() {
    var g = GOALS.find(function (x) { return x.key === state.goals[0]; });
    quoteText.textContent = g.quote;
    quoteGoal.textContent = state.goals.map(function (k) { return GOALS.find(function (x) { return x.key === k; }).label; }).join(' + ');
  }
  updateQuote();
  document.getElementById('goalChips').addEventListener('click', function (e) {
    var chip = e.target.closest('.chip');
    if (!chip) return;
    var key = chip.dataset.goal;
    var idx = state.goals.indexOf(key);
    if (idx > -1) {
      if (state.goals.length === 1) return; // keep at least one selected
      state.goals.splice(idx, 1);
      chip.setAttribute('aria-pressed', 'false');
    } else {
      state.goals.push(key);
      chip.setAttribute('aria-pressed', 'true');
    }
    updateQuote();
    saveGeneratorPrefs({ goals: state.goals });
    renderRecommendedVolumeBadge();
  });

  var distanceSlider = document.getElementById('distanceSlider');
  var distanceValue = document.getElementById('distanceValue');
  distanceSlider.value = state.distance;
  function updateDistanceLabel() {
    var v = +distanceSlider.value;
    distanceValue.textContent = formatDistanceM(v, 1) + (v >= 6000 ? '+' : '');
    state.distance = v;
    // Drive the emerald "filled" portion of the slider track — the CSS reads
    // --fill (0-100%) to paint a gradient up to the thumb, giving the range
    // input a modern filled-track look instead of a flat bar.
    var min = +distanceSlider.min, max = +distanceSlider.max;
    var pct = max > min ? Math.round(((v - min) / (max - min)) * 100) : 0;
    distanceSlider.style.setProperty('--fill', pct + '%');
    distanceValue.classList.remove('value-pulse');
    void distanceValue.offsetWidth;
    distanceValue.classList.add('value-pulse');
  }
  updateDistanceLabel();
  distanceSlider.addEventListener('input', updateDistanceLabel);
  distanceSlider.addEventListener('change', function () { saveGeneratorPrefs({ distance: state.distance }); });
  document.addEventListener('swimfit:unitschange', updateDistanceLabel);

  // BEGINNER DISTANCE CAP: 3000m max at Beginner level — a real ceiling on
  // the slider itself (not just a generation-time clamp), so a beginner
  // never even sees an option past what's appropriate for that level.
  // Switching back to Competitive/Elite restores the full 6000m ceiling
  // without forcing the value back up.
  function applyLevelDistanceCap() {
    if (state.level === 'beginner') {
      distanceSlider.max = '3000';
      if (+distanceSlider.value > 3000) distanceSlider.value = '3000';
    } else {
      distanceSlider.max = '6000';
    }
    updateDistanceLabel();
    saveGeneratorPrefs({ distance: state.distance });
  }
  // FREEMIUM: Competitive/Elite are an All-Access Pro perk — Free tier (and
  // an unresolved-yet-signed-in state) stays Beginner-only. Reads
  // window.__hasFullAccess() (js/paddle-client.js) rather than re-deriving
  // its own access check.
  function updateLevelTabLocks() {
    var levelTabs = document.getElementById('levelTabs');
    if (!levelTabs) return;
    var hasFull = typeof window.__hasFullAccess === 'function' && window.__hasFullAccess();
    levelTabs.querySelectorAll('.pill-tab[data-level="competitive"], .pill-tab[data-level="elite"]').forEach(function (b) {
      b.classList.toggle('is-locked', !hasFull);
    });
    // A swimmer whose saved level was Competitive/Elite from an earlier
    // full-access session (trial, or a subscription that's since lapsed) is
    // downgraded the instant real access resolves to less than full — the
    // click-time gate below only ever stops a NEW switch, so without this a
    // stale localStorage preference could leave state.level pointed at a
    // level the swimmer can no longer actually select.
    if (!hasFull && state.level !== 'beginner') {
      state.level = 'beginner';
      var beginnerBtn = levelTabs.querySelector('.pill-tab[data-level="beginner"]');
      levelTabs.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === beginnerBtn ? 'true' : 'false'); });
      saveGeneratorPrefs({ level: state.level });
      applyLevelDistanceCap();
    }
  }
  window.__updateLevelTabLocks = updateLevelTabLocks;
  // Only reacts to REAL resolved access (swimfit:accesschange fires once
  // auth + Firestore actually resolve) — deliberately not run at plain page
  // load, so a genuinely paying swimmer's saved Competitive/Elite choice is
  // never flash-downgraded before their real access level is even known.
  document.addEventListener('swimfit:accesschange', updateLevelTabLocks);

  document.getElementById('levelTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.pill-tab');
    if (!btn) return;
    var requestedLevel = btn.dataset.level;
    var upsellNote = document.getElementById('levelUpsellNote');
    var hasFull = typeof window.__hasFullAccess === 'function' && window.__hasFullAccess();
    // A REAL BUG WAS HERE, the actual root cause behind "the level tabs show
    // Competitive selected but my distance still got capped": this used to
    // block the switch (with an easy-to-miss upsell note) whenever hasFull
    // was false — but hasFull is ALSO false the instant a swimmer signs in,
    // before window.__swimfitAccess has resolved for the first time. A
    // genuinely full-access swimmer clicking Competitive/Elite in that brief
    // window got silently bounced back to Beginner with no visible cause.
    // Only block when access is DEFINITIVELY known and not full — an
    // unresolved state trusts the tentative switch, exactly like
    // updateLevelTabLocks() already does; if access then resolves to
    // non-full a moment later, that same listener corrects it visibly.
    var accessResolved = !!window.__swimfitAccess;
    if (requestedLevel !== 'beginner' && accessResolved && !hasFull) {
      if (upsellNote) upsellNote.style.display = '';
      return;
    }
    if (upsellNote) upsellNote.style.display = 'none';
    state.level = requestedLevel;
    this.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
    saveGeneratorPrefs({ level: state.level });
    applyLevelDistanceCap();
    renderRecommendedVolumeBadge();
    renderWeeklyScheduleCard();
    updateAllPbEstimates();
    if (typeof window.__refreshPaywallLock === 'function') window.__refreshPaywallLock();
  });
  (function restoreLevelTab() {
    var levelTabs = document.getElementById('levelTabs');
    if (!levelTabs) return;
    var match = levelTabs.querySelector('.pill-tab[data-level="' + state.level + '"]');
    if (!match) return;
    levelTabs.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === match ? 'true' : 'false'); });
    applyLevelDistanceCap();
  })();

  // Race Goal card's "Sprinter vs Distance vs Both" swimmer-type selector —
  // a plain, always-visible pill-tab rather than a one-time onboarding modal,
  // since this codebase has twice already removed modal-based onboarding
  // wizards in favor of simple inline controls (see the Auth modal history
  // and the removed post-signup wizard elsewhere in this file). Same
  // wire/restore pattern as levelTabs immediately above.
  var swimmerTypeTabsEl = document.getElementById('swimmerTypeTabs');
  if (swimmerTypeTabsEl) {
    swimmerTypeTabsEl.addEventListener('click', function (e) {
      var btn = e.target.closest('.pill-tab');
      if (!btn) return;
      state.swimmerType = btn.dataset.swimmerType;
      this.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
      saveGeneratorPrefs({ swimmerType: state.swimmerType });
      renderWeeklyScheduleCard();
    });
    (function restoreSwimmerTypeTab() {
      var match = swimmerTypeTabsEl.querySelector('.pill-tab[data-swimmer-type="' + state.swimmerType + '"]');
      if (!match) return;
      swimmerTypeTabsEl.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === match ? 'true' : 'false'); });
    })();
  }

  // The remaining Workout Generator + Gym profile fields are plain inputs
  // with no chip/slider state of their own — restore each one's last saved
  // value on load, then auto-save on every keystroke/change so none of them
  // reset on a reload or tab switch either.
  // Personal Bests are no longer fixed per-stroke fields — they're persisted
  // via state.pbEntries (see the flexible-entries section further below)
  // instead of this plain id-keyed restore/auto-save loop.
  var GENERATOR_PREF_FIELD_IDS = [
    'swimmerAge', 'gymAge', 'gymWorkingWeight', 'gymStrengthLimit'
  ];
  GENERATOR_PREF_FIELD_IDS.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (generatorPrefs.fields && generatorPrefs.fields[id] !== undefined) el.value = generatorPrefs.fields[id];
    var persistField = function () {
      var fields = loadGeneratorPrefs().fields || {};
      fields[id] = el.value;
      saveGeneratorPrefs({ fields: fields });
    };
    el.addEventListener('input', persistField);
    el.addEventListener('change', persistField);
  });

  // GOAL PROGRESSION ESTIMATOR — a science-based "how long until I hit this
  // target" readout per stroke, live under each Personal Bests & Race Goals
  // row. Modeled as a percent-improvement-needed divided by a per-level
  // monthly-improvement rate: beginners typically drop time faster from a
  // lower training base, elites need much more work for the same percentage
  // gain as they approach their physiological ceiling — matching the same
  // "disclosed estimate, not a lab-measured constant" posture as
  // PB_PACE_FATIGUE_EXPONENT/CALORIES_PER_METER elsewhere in this file.
  // Calibrated against the worked example a 28.0s->27.0s 50m improvement
  // (3.57% faster) at the 'competitive' rate lands on "2-3 months," matching
  // real coaching expectation for that exact gap.
  var PB_ESTIMATE_MONTHLY_RATE = { beginner: 0.022, competitive: 0.014, elite: 0.008 };
  function estimateProgressionMonths(currentSec, targetSec, level) {
    if (!currentSec || !targetSec || targetSec <= 0) return null;
    if (targetSec >= currentSec) {
      return { met: true, longTerm: false, text: 'Already at or beyond this target — nice! Set a faster target to keep chasing progress.' };
    }
    var pctImprove = (currentSec - targetSec) / currentSec;
    var monthlyRate = PB_ESTIMATE_MONTHLY_RATE[level] || PB_ESTIMATE_MONTHLY_RATE.competitive;
    // A very large ask isn't realistically framed as "X months away" off one
    // linear model — flag it as a longer-term, multi-block goal instead of
    // extrapolating a false-precision number from a small-improvement model.
    if (pctImprove > 0.12) {
      return { met: false, longTerm: true, text: 'That’s a big jump (' + (pctImprove * 100).toFixed(1) + '% faster) — realistically a multi-season goal (12+ months) built through several progressive targets, not one training block.' };
    }
    var months = pctImprove / monthlyRate;
    var lowM = Math.max(1, Math.round(months * 0.75));
    var highM = Math.max(lowM + 1, Math.round(months * 1.25));
    var label = lowM === highM ? (lowM + (lowM === 1 ? ' month' : ' months')) : (lowM + '–' + highM + ' months');
    return { met: false, longTerm: false, text: 'With consistent training, expected progression to hit ' + formatTime(targetSec) + ' is ~' + label + ' (' + (pctImprove * 100).toFixed(1) + '% faster).' };
  }
  // Operates on a PB entry's own row (by index in state.pbEntries) rather
  // than a fixed per-stroke element id — see the flexible Personal Bests
  // section further below (renderPbEntries() etc.), which replaced the old
  // one-row-per-fixed-stroke layout with any number of freely-configurable
  // stroke+distance slots.
  function updatePbEstimateForIndex(i) {
    var entry = state.pbEntries[i];
    var row = document.querySelector('.pb-stroke-block[data-pb-index="' + i + '"]');
    var estEl = row ? row.querySelector('[data-pb-estimate]') : null;
    if (!entry || !estEl) return;
    var currentSec = parseTimeToSeconds(entry.currentTime);
    var targetSec = parseTimeToSeconds(entry.targetTime);
    var est = estimateProgressionMonths(currentSec, targetSec, state.level);
    if (!est) { estEl.textContent = ''; estEl.className = 'pb-stroke-estimate'; return; }
    estEl.textContent = est.text;
    estEl.className = 'pb-stroke-estimate' + (est.met ? ' is-met' : est.longTerm ? '' : ' has-estimate');
  }
  function updateAllPbEstimates() { state.pbEntries.forEach(function (e, i) { updatePbEstimateForIndex(i); }); }

  // Sharp, meaningful progression between the three levels — not just more
  // distance. Beginner gets generous rest and foundational technique/body-
  // position work; Competitive gets race-relevant intervals and race-pace
  // build sets; Elite gets the tightest intervals AND a dedicated explosive-
  // power / start-reaction / power-breakout / 15m-underwater-dolphin block
  // (see ELITE_POWER_BLOCK below, injected into the Main Set for elite only).
  var LEVEL_SCALERS = {
    beginner:    { intervalMult: 1.35, restAdd: 20, blocks: 2, minRounds: 2, maxRounds: 2, note: 'Generous rest on every interval today — the goal is clean, repeatable technique and a strong body position, not the clock. Speed always follows good technique, never the other way around.' },
    competitive: { intervalMult: 1.0,  restAdd: 0,  blocks: 3, minRounds: 2, maxRounds: 3, note: 'Race-relevant intervals and structured, descending build sets today — enough load to create a real training stimulus, enough rest to hit every rep at quality race pace.' },
    elite:       { intervalMult: 0.85, restAdd: -8, blocks: 4, minRounds: 3, maxRounds: 3, note: 'Tightened intervals plus a dedicated high-performance block today — explosive starts, race-start reaction, power breakouts and 15m max-effort underwater dolphin kick under a tight clock. This is where the margins that matter are won.' }
  };

  function formatTime(sec) {
    sec = Math.max(5, Math.round(sec));
    if (sec < 60) return sec + 's';
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // Accepts one or more simultaneously-selected goals and blends their base
  // pace (a plain average) — e.g. Speed + Endurance together lands the
  // target pace between a pure-sprint and pure-distance session, rather
  // than requiring the swimmer to pick only one focus.
  function paceSecondsPer100(goalKeys, level) {
    var bases = { speed: 85, endurance: 100, technique: 105 };
    var avgBase = goalKeys.reduce(function (sum, k) { return sum + bases[k]; }, 0) / goalKeys.length;
    var levelAdj = { beginner: 25, competitive: 0, elite: -8 }[level];
    return avgBase + levelAdj;
  }

  // Real swim training runs off a pace ladder, not one flat number: your 50m
  // pace is faster per-100m than your 100m pace, which is faster than your
  // 200m pace, which is faster than your 400m pace. Deriving every set's
  // target from this ladder (instead of one multiplier) is what keeps a
  // session realistic — aerobic sets hold 400/200 pace, race-modeled sets
  // hold 100 pace, and only short reps ever touch 50 pace/max effort.
  function paceLadder(pace100) {
    return {
      p50: pace100 - 4,
      p100: pace100,
      p200: pace100 + 4,
      p400: pace100 + 9
    };
  }

  // RACE-PACE BAND SYSTEM: real elite club programming keys a Main Set's
  // target pace off a named "band" (P+2/P+1/P/P-1/P-2) relative to the
  // swimmer's own goal-race pace, tightening the interval AND the target
  // band together as a set progresses, rather than one flat pace for the
  // whole block. A fixed ~3s/100m step between bands mirrors the same scale
  // paceLadder() already uses between its own p50/p100/p200 steps, so this
  // reads as one consistent pace system rather than a second, unrelated one.
  function paceBand(pace100, band) {
    var steps = { p2: 6, p1: 3, p0: 0, m1: -3, m2: -6 };
    return pace100 + (steps[band] != null ? steps[band] : 0);
  }

  // Open, forgiving time parser for the optional PB fields — accepts "1:05",
  // "65", "1m5s", "1m 5s", or "1 min 5 sec" so the field never feels "strictly
  // restricted" to one exact format.
  function parseTimeToSeconds(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    if (!str) return null;
    var mMatch = str.match(/(\d+(\.\d+)?)\s*m/);
    var sMatch = str.match(/(\d+(\.\d+)?)\s*s/);
    if (mMatch || sMatch) {
      var total = (mMatch ? parseFloat(mMatch[1]) : 0) * 60 + (sMatch ? parseFloat(sMatch[1]) : 0);
      return total > 0 ? total : null;
    }
    if (str.indexOf(':') > -1) {
      var parts = str.split(':');
      var sec = (+parts[0]) * 60 + (+parts[1]);
      return isFinite(sec) && sec > 0 ? sec : null;
    }
    var plain = parseFloat(str);
    return isFinite(plain) && plain > 0 ? plain : null;
  }

  // Pulls the first number out of an open free-text field like "40kg" or
  // "1RM squat 80kg, bench 55kg" so the Gym profile fields can stay unstructured.
  function parseFirstNumber(str) {
    if (!str) return null;
    var m = str.match(/(\d+(\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
  }

  // FULLY FLEXIBLE PERSONAL BESTS — replaces the old "one fixed row per
  // stroke" layout with any number of freely-configurable entries, each with
  // its own Stroke AND Distance picker, so a swimmer can log e.g. both a 50m
  // Freestyle and a 100m Freestyle PB simultaneously, or track only the two
  // strokes they actually race. Pace personalization keys off whichever
  // entry matches the primary (first-selected) discipline — Individual
  // Medley has no single-stroke PB to key off, so it falls back to
  // Freestyle as the closest general-pace proxy, same precedent as before.
  // If more than one entry matches the primary stroke (e.g. both a 50m and a
  // 100m Freestyle logged), the one with an actual current time filled in
  // wins; if several qualify, the first one in the list does.
  var PB_STROKE_OPTIONS = ['Freestyle', 'Backstroke', 'Butterfly', 'Breaststroke', 'Individual Medley'];
  var PB_DISTANCE_OPTIONS = [50, 100, 200, 400, 800, 1500];
  function primaryPbStrokeKey() {
    var primary = state.disciplines && state.disciplines[0];
    return (primary && primary !== 'Individual Medley') ? primary : 'Freestyle';
  }
  function activePbEntry() {
    var key = primaryPbStrokeKey();
    var matches = state.pbEntries.filter(function (e) { return e.stroke === key; });
    if (!matches.length) return null;
    var withTime = matches.filter(function (e) { return parseTimeToSeconds(e.currentTime); });
    return withTime[0] || matches[0];
  }
  function pbStrokeOptionsHtml(selected) {
    return PB_STROKE_OPTIONS.map(function (s) {
      return '<option value="' + s + '"' + (s === selected ? ' selected' : '') + '>' + s + '</option>';
    }).join('');
  }
  function pbDistanceOptionsHtml(selected) {
    return PB_DISTANCE_OPTIONS.map(function (d) {
      return '<option value="' + d + '"' + (String(d) === String(selected) ? ' selected' : '') + '>' + d + 'm</option>';
    }).join('');
  }
  function escapeAttr(str) { return (str || '').replace(/"/g, '&quot;'); }
  function renderPbEntries() {
    var list = document.getElementById('pbEntriesList');
    if (!list) return;
    var canRemove = state.pbEntries.length > 1;
    list.innerHTML = state.pbEntries.map(function (entry, i) {
      return '<div class="pb-stroke-block" data-pb-index="' + i + '">' +
        '<div class="pb-stroke-row">' +
          '<select class="form-select pb-entry-field" data-field="stroke" aria-label="Stroke">' + pbStrokeOptionsHtml(entry.stroke) + '</select>' +
          '<select class="form-select pb-entry-field" data-field="distance" aria-label="Distance">' + pbDistanceOptionsHtml(entry.distance) + '</select>' +
          '<input type="text" class="pb-entry-field" data-field="currentTime" placeholder="Current — e.g. 1:05" value="' + escapeAttr(entry.currentTime) + '" aria-label="Current PB time">' +
          '<input type="text" class="pb-entry-field" data-field="targetTime" placeholder="Target — e.g. 1:00" value="' + escapeAttr(entry.targetTime) + '" aria-label="Target time">' +
          (canRemove ? '<button type="button" class="pb-entry-remove" data-action="remove-pb" aria-label="Remove this Personal Best entry">' + icon('i-close') + '</button>' : '') +
        '</div>' +
        '<p class="pb-stroke-estimate" data-pb-estimate aria-live="polite"></p>' +
      '</div>';
    }).join('');
    updateAllPbEstimates();
  }
  document.getElementById('pbEntriesList').addEventListener('input', function (e) {
    var field = e.target.closest('.pb-entry-field');
    if (!field || field.tagName === 'SELECT') return;
    var block = field.closest('.pb-stroke-block');
    var i = parseInt(block.dataset.pbIndex, 10);
    state.pbEntries[i][field.dataset.field] = field.value;
    saveGeneratorPrefs({ pbEntries: state.pbEntries });
    updatePbEstimateForIndex(i);
  });
  document.getElementById('pbEntriesList').addEventListener('change', function (e) {
    var field = e.target.closest('.pb-entry-field');
    if (!field || field.tagName !== 'SELECT') return;
    var block = field.closest('.pb-stroke-block');
    var i = parseInt(block.dataset.pbIndex, 10);
    state.pbEntries[i][field.dataset.field] = field.value;
    saveGeneratorPrefs({ pbEntries: state.pbEntries });
    updatePbEstimateForIndex(i);
  });
  document.getElementById('pbEntriesList').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action="remove-pb"]');
    if (!btn) return;
    var block = btn.closest('.pb-stroke-block');
    var i = parseInt(block.dataset.pbIndex, 10);
    if (state.pbEntries.length <= 1) return; // always keep at least one entry
    state.pbEntries.splice(i, 1);
    saveGeneratorPrefs({ pbEntries: state.pbEntries });
    renderPbEntries();
  });
  var pbAddEntryBtn = document.getElementById('pbAddEntryBtn');
  if (pbAddEntryBtn) {
    pbAddEntryBtn.addEventListener('click', function () {
      state.pbEntries.push({ stroke: primaryPbStrokeKey(), distance: '100', currentTime: '', targetTime: '' });
      saveGeneratorPrefs({ pbEntries: state.pbEntries });
      renderPbEntries();
    });
  }
  renderPbEntries();

  // Predicts pace per 100m from a PB logged at ANY race distance (50m-1500m),
  // not just a hardcoded 50m/100m shortcut — uses the same family of
  // fatigue-exponent model sports science uses for cross-distance time
  // prediction (Riegel's formula: T2 = T1 * (D2/D1)^b). Swimming's
  // aerobic/anaerobic profile means per-100m pace naturally slows at longer
  // distances; 1.03 is a middle-of-the-road exponent for competitive
  // swimming (running's own version of this typically uses ~1.06) — a
  // reasonable estimate, not a lab-measured constant, same disclosed-estimate
  // posture as CALORIES_PER_METER elsewhere in this file.
  var PB_PACE_FATIGUE_EXPONENT = 1.03;
  // goalKeys: one or more simultaneously-selected goals — their offsets are
  // averaged, same blending convention as paceSecondsPer100 above.
  function personalPaceFromPB(pbDistanceM, pbTimeSec, goalKeys) {
    if (!pbDistanceM || !pbTimeSec) return null;
    var equivalent100Pace = pbTimeSec * Math.pow(100 / pbDistanceM, PB_PACE_FATIGUE_EXPONENT);
    var offsets = { speed: 3, endurance: 12, technique: 15 };
    var avgOffset = goalKeys.reduce(function (sum, k) { return sum + offsets[k]; }, 0) / goalKeys.length;
    return equivalent100Pace + avgOffset;
  }

  function strokeLabelSingle(discipline) {
    return discipline === 'Individual Medley' ? 'IM (Fly–Back–Breast–Free order)' : discipline;
  }

  // Real coach-shorthand stroke tags (FR/BK/FLY/BR/IM), matching how every
  // reference elite program actually labels a set — used only for the set
  // labels a swimmer reads on the generated card. The other 4 strokeLabelSingle
  // call sites (the disciplines summary line, both PB/pace notes, and the
  // swim_logs Firestore write the Distance Tracker reads) intentionally keep
  // full stroke names, since those feed cross-feature text/data that expects
  // "Freestyle", not "FR".
  var STROKE_ABBREV = {
    'Freestyle': 'FR',
    'Backstroke': 'BK',
    'Butterfly': 'FLY',
    'Breaststroke': 'BR',
    'Individual Medley': 'IM'
  };
  function strokeAbbrev(discipline) {
    return STROKE_ABBREV[discipline] || discipline;
  }

  // PROFILE-DRIVEN STROKE DISTRIBUTION: disciplines[0] is the swimmer's Top
  // Stroke (first-selected in the chip group), disciplines[1+] are secondary
  // strokes. Rather than a flat round-robin (which gives every selected
  // stroke identical weight regardless of which one the swimmer actually
  // leads with), the rotation cycles a weighted PATTERN that repeats the Top
  // Stroke roughly twice as often as any single secondary stroke — e.g. two
  // disciplines [Freestyle, Backstroke] rotate FR/BK/FR/FR/BK/FR/... (Top
  // Stroke ~67% of picks), three disciplines spread the remaining weight
  // evenly across the other two. A single selected discipline is unaffected
  // (pattern of length 1). This is what actually makes "weekly distribution"
  // profile-driven instead of an arbitrary alternation.
  function buildStrokePattern(disciplines) {
    if (disciplines.length <= 1) { return disciplines.slice(); }
    var primary = disciplines[0];
    var rest = disciplines.slice(1);
    var pattern = [];
    rest.forEach(function (s) { pattern.push(primary, s); });
    pattern.push(primary);
    return pattern;
  }
  // startOffset carries the weighted pattern forward across days (seeded
  // from dayIndex() at the call site below) instead of restarting at index 0
  // — i.e. Top Stroke — every single day. A typical day only draws 1-3 picks
  // from a given rotator (one per Main Set block), which isn't enough calls
  // within one day to ever reach the pattern's extra Top-Stroke slot — so
  // resetting daily was silently defeating the weighting for exactly the
  // common case (1-2 block days), and is what made the profile-driven skew
  // disappear in practice despite the pattern itself being correctly biased.
  // Treating the pattern as one continuous, never-resetting cycle sampled at
  // a day-relative offset is what actually makes Top Stroke dominate over a
  // real week, not just a single unusually long session.
  function makeStrokeRotator(disciplines, startOffset) {
    var pattern = buildStrokePattern(disciplines);
    var i = startOffset ? (startOffset % pattern.length) : 0;
    var rotator = function () {
      var full = pattern[i % pattern.length];
      rotator.current = full;
      var s = strokeAbbrev(full);
      i++;
      return s;
    };
    // .current always holds the full discipline name (e.g. 'Backstroke') the
    // most recent call resolved to — a structured, non-text-parsed way for
    // callers to know exactly which stroke a given nextStroke() call just
    // returned, independent of the abbreviated display string.
    rotator.current = disciplines[0];
    return rotator;
  }

  // Hard realism cap: no single rep of Backstroke, Breaststroke, or Butterfly
  // is ever allowed to exceed 200m — swimming 300m+ of any of the three "off"
  // strokes in one continuous rep isn't a realistic set for almost any
  // swimmer, whereas Freestyle (and mixed-stroke IM) genuinely can go 400m,
  // 800m and beyond. Every archetype funnels through this one function to
  // build its sets, so capping here covers every current and future archetype
  // without auditing each one's hardcoded distances individually. When a rep
  // is capped its rep count scales up (ceil of total-volume ÷ 200) so the
  // archetype's intended total meterage is preserved rather than silently
  // shrunk.
  var STROKE_REP_CAP_M = 200;
  // Labels lead with the abbreviated stroke code (BK/BR/FLY), not the full
  // name, since makeStrokeRotator() started returning strokeAbbrev() output —
  // this list must match what labels actually start with or the cap silently
  // never fires.
  var CAPPED_STROKES = ['BK', 'BR', 'FLY'];
  // zone/equipment are structured mirrors of the existing paceTag/gear fields
  // (swiML-style intensity zone + equipment typing), added without changing
  // any existing field or call site.
  var ZONE_BY_PACE_TAG = {
    'Recovery Pace': 'easy', 'Easy Pace': 'easy', 'Kick': 'easy', 'Drill Pace': 'easy',
    'Cruise Pace': 'endurance', 'Even Pace': 'endurance',
    'Threshold Pace': 'threshold',
    'Race Pace': 'racePace', '@ Race Pace': 'racePace', 'Broken @ Race Pace': 'racePace', 'Straight @ Race Pace': 'racePace'
  };
  function zoneFromPaceTag(tag) {
    if (!tag) { return null; }
    if (ZONE_BY_PACE_TAG[tag]) { return ZONE_BY_PACE_TAG[tag]; }
    // Numeric tags ("50 Pace".."400 Pace") are short, sub-max speed work —
    // the shorter the reference distance, the closer to max effort.
    var m = /^(\d+)/.exec(tag);
    if (m) { return Number(m[1]) <= 100 ? 'max' : 'endurance'; }
    return null;
  }
  // Main Set archetype names are "Focus — Descriptor" (e.g. "Lactate — Sprint
  // Ladder"); the physiological-focus half is the structured category, the
  // descriptor half stays display-only text.
  function focusFromArchetypeName(name) {
    var idx = name.indexOf(' — ');
    return idx > -1 ? name.slice(0, idx) : name;
  }
  function buildSet(reps, dist, label, gearList, pace100, restBase, scaler, paceTag) {
    var isCappedStroke = CAPPED_STROKES.some(function (s) { return label.indexOf(s) === 0; });
    if (dist > STROKE_REP_CAP_M && isCappedStroke) {
      reps = Math.max(reps, Math.ceil((reps * dist) / STROKE_REP_CAP_M));
      dist = STROKE_REP_CAP_M;
    }
    var interval = Math.round(((dist / 100) * pace100 + restBase) * scaler.intervalMult);
    var rest = Math.max(10, Math.round(restBase * scaler.intervalMult + scaler.restAdd));
    var tag = paceTag || null;
    return { title: reps + ' x ' + dist + 'm ' + label, reps: reps, dist: dist, interval: interval, rest: rest, totalSec: reps * interval, gear: gearList, equipment: gearList, pace: Math.round(pace100), paceTag: tag, zone: zoneFromPaceTag(tag) };
  }
  // Converts an internal pace tag like "200 Pace" into a clean display label
  // ("200m Pace") with no specific clock time attached — descriptive tags
  // that are already clock-free (Recovery/Easy/Drill/Cruise/Threshold Pace)
  // pass through unchanged.
  function cleanPaceLabel(tag) {
    if (!tag) return null;
    var m = tag.match(/^(\d+)\s*Pace$/);
    return m ? m[1] + 'm Pace' : tag;
  }

  // A short 50-100m EZ active-recovery round, interspersed directly inside a
  // high-intensity sprint/power Main Set block (right after its hard rounds)
  // rather than only relying on the Cool-Down several minutes later — moving
  // blood through the working muscles flushes lactate while it's actually
  // accumulating, not just once the whole session is already over. This is a
  // REDISTRIBUTION, not an addition: every call site carves EZ_RECOVERY_M
  // out of that block's own already-allocated share before calling
  // ezRecoverySet(), so appending this round never pushes the workout's
  // grand total past the swimmer's chosen distance.
  var EZ_RECOVERY_M = 100;
  function ezRecoverySet(pace100) {
    return { label: 'REC — Flush', sets: [buildSet(2, 50, 'EZ, shake out', [], pace100 + 22, 10, { intervalMult: 1, restAdd: 0 }, 'Recovery Pace')] };
  }

  // Real meters a flat array of built sets (Warm-Up/Cool-Down's own shape) or
  // an array of {label, sets} rounds (Pre-Set/Main Set's shape) actually
  // renders to — the same reps*dist accounting renderBlock() already does
  // internally for its stage-total pill, reused here so generateWorkout() can
  // reconcile the GRAND total against the swimmer's chosen distance after
  // every archetype's own internal rounding/capping has already been applied.
  function sumSetsMeters(sets) {
    return sets.reduce(function (m, s) { return m + (s.reps || 1) * (s.dist || 0); }, 0);
  }
  function sumRoundsMeters(rounds) {
    return rounds.reduce(function (m, r) { return m + sumSetsMeters(r.sets); }, 0);
  }

  // Every archetype's build() applies its own minimum-rep floors (e.g.
  // "Math.max(2, Math.round(m/50))") so a set is never asked for a
  // fractional/nonsensical rep count — legitimate on its own, but when a
  // block's allocated share is small (many concurrent blocks/rounds spread
  // across a smaller total distance), those floors can push the ACTUAL built
  // volume well past what that block was allocated, which is exactly what
  // breaks the strict ±50m total guarantee. Rather than touching every
  // archetype's internal math, this scales an already-built round's rep
  // counts down (never below 1 rep) to bring it back toward its intended
  // share — buildSet()'s title is always the deterministic
  // "REPS x DISTm LABEL" shape, so it can be safely re-derived after
  // adjusting reps; interval/rest/pace are per-rep values and stay correct
  // regardless of how many reps there end up being.
  function scaleSetVolume(s, factor) {
    if (factor >= 0.999) return s;
    var m = s.title.match(/^(\d+) x (\d+)m (.*)$/);
    if (!m) return s;
    var origReps = parseInt(m[1], 10), dist = parseInt(m[2], 10), rest = m[3];
    var newReps = Math.max(1, Math.round(origReps * factor));
    if (newReps === origReps) return s;
    var scaled = {};
    for (var k in s) { if (s.hasOwnProperty(k)) scaled[k] = s[k]; }
    scaled.title = newReps + ' x ' + dist + 'm ' + rest;
    scaled.reps = newReps;
    scaled.totalSec = newReps * s.interval;
    return scaled;
  }
  function scaleRoundsVolume(rounds, factor) {
    if (factor >= 0.999) return rounds;
    return rounds.map(function (r) {
      return { label: r.label, sets: r.sets.map(function (s) { return scaleSetVolume(s, factor); }) };
    });
  }
  // SANE REP CHUNKING: most archetype templates above compute a single
  // buildSet() rep count as roughly "share ÷ rep distance" — reasonable at a
  // normal share, but a real, reachable problem once a large volume
  // concentrates into few rounds (e.g. a 900m round of 25m turns/starts work
  // maths out to a single, genuinely unbroken "36 x 25m" line). No real coach
  // writes a 36-rep block on the whiteboard without breaking it up, and
  // swimming the exact same 25m at the exact same effort 36 times running has
  // no more training value than 4 tighter 9-rep groups with a visible reset
  // between them. This splits any round whose one set exceeds
  // MAX_REPS_PER_SET into several sibling rounds of the identical distance/
  // interval/rest/pace — same total volume, same content, just chunked into
  // realistic, separately-labeled coaching groups ("Sprint (1/4)", "Sprint
  // (2/4)", …) instead of one intimidating repeated line. Applied once,
  // universally, inside buildToShare() below rather than touching every
  // archetype's own template — every archetype/blueprint in this file already
  // funnels through that one function.
  var MAX_REPS_PER_SET = 10;
  function chunkExcessiveReps(rounds) {
    var out = [];
    rounds.forEach(function (r) {
      if (r.sets.length !== 1 || r.sets[0].reps <= MAX_REPS_PER_SET) { out.push(r); return; }
      var s = r.sets[0];
      var m = s.title.match(/^\d+ x (\d+)m (.*)$/);
      if (!m) { out.push(r); return; }
      var dist = m[1], restOfTitle = m[2];
      var chunkCount = Math.ceil(s.reps / MAX_REPS_PER_SET);
      var base = Math.floor(s.reps / chunkCount);
      var extra = s.reps - base * chunkCount;
      for (var i = 0; i < chunkCount; i++) {
        var repsHere = base + (i < extra ? 1 : 0);
        if (repsHere < 1) continue;
        var chunkSet = {};
        for (var k in s) { if (s.hasOwnProperty(k)) chunkSet[k] = s[k]; }
        chunkSet.reps = repsHere;
        chunkSet.title = repsHere + ' x ' + dist + 'm ' + restOfTitle;
        chunkSet.totalSec = repsHere * s.interval;
        out.push({ label: (r.label ? r.label + ' ' : '') + '(' + (i + 1) + '/' + chunkCount + ')', sets: [chunkSet] });
      }
    });
    return out;
  }
  // Builds an archetype's rounds against its allocated share, then — if the
  // archetype's own rep floors pushed the actual result past that share —
  // iteratively scales it back down toward the target. Used for Warm-Up,
  // Pre-Set, every regular Main Set block, and the Elite Power block, so all
  // four respect the same "the number you were promised is the number you
  // get" rule. Iterates (rather than a single pass) because rounding a rep
  // count can land exactly back where it started on the first attempt (e.g.
  // 2 reps × 0.75 still rounds to 2) — recomputing the ratio against the
  // still-too-high result and trying again a few times converges much closer
  // than hoping one pass is enough, without ever asking for a fractional rep.
  function buildToShare(buildFn, targetM) {
    var rounds = buildFn();
    for (var i = 0; i < 4; i++) {
      var actualM = sumRoundsMeters(rounds);
      if (actualM <= targetM * 1.05) break;
      var scaled = scaleRoundsVolume(rounds, targetM / actualM);
      if (sumRoundsMeters(scaled) === actualM) break; // no further reduction possible (every set already at 1 rep)
      rounds = scaled;
    }
    return chunkExcessiveReps(rounds);
  }

  // rounds is an array of { label, sets } — label is a short round title
  // (e.g. "Round 1 — Build Pace") or null/undefined for a flat, single-round
  // block like Warm-Up/Cool-Down where a "round" heading would just be noise.
  // Native <details>/<summary> keeps every stage's full content in the DOM
  // (still readable by extractStructuredWorkout() for the PDF export and
  // still findable by browser find-in-page/screen readers) while collapsing
  // it visually — the compact "at a glance" view the result panel needs,
  // without a second parallel summarized data structure to keep in sync.
  // Main Set stays open by default (the stage a swimmer actually came for);
  // Warm-Up/Pre-Set/Cool-Down start collapsed since they're supporting work.
  // Per-stage identity: an icon + accent color so the Warm-Up / Pre-Set /
  // Main Set / Cool-Down blocks read as four visually distinct, color-coded
  // stages at a glance rather than four identical grey blocks.
  var STAGE_META = {
    warmup:   { icon: 'i-droplet',   label: 'W-UP' },
    preset:   { icon: 'i-stopwatch', label: 'Pre-Set' },
    main:     { icon: 'i-bolt',      label: 'Main Set' },
    cooldown: { icon: 'i-wave',      label: 'WD' }
  };
  function renderBlock(name, rounds, openByDefault, stage) {
    var totalSets = rounds.reduce(function (n, r) { return n + r.sets.length; }, 0);
    if (!totalSets) return '';
    // Total distance across this stage — a genuinely useful at-a-glance figure
    // in each stage header (a swimmer wants to know "how much warm-up?").
    var stageMeters = rounds.reduce(function (m, r) {
      return m + r.sets.reduce(function (mm, s) { return mm + (s.reps || 1) * (s.dist || 0); }, 0);
    }, 0);
    var body = rounds.map(function (round) {
      var rows = round.sets.map(function (s) {
        var gearHtml = s.gear.map(function (g) { return '<span class="gear-chip">' + icon(GEAR_ICON[g] || 'i-fin') + g + '</span>'; }).join('');
        var paceLabel = cleanPaceLabel(s.paceTag);
        // A leading reps×distance "rep-chip" gives every row an instant,
        // scannable anchor (e.g. "7 × 50m") before the descriptive title. On
        // the right, ONE clean send-off interval only ("@ 1:15") — no separate
        // REST or TOTAL columns, matching how a coach writes a send-off on the
        // board and keeping every row uncluttered.
        var repChip = (s.reps && s.dist)
          ? '<span class="set-rep">' + s.reps + '<span class="set-rep-x">×</span>' + s.dist + 'm</span>'
          : '';
        return '<div class="set-row">' +
          repChip +
          '<div class="set-main"><span class="set-title">' + s.title + '</span>' +
          (paceLabel ? '<span class="set-pace">' + paceLabel + '</span>' : '') +
          (gearHtml ? '<span class="set-gear">' + gearHtml + '</span>' : '') + '</div>' +
          '<div class="set-stats"><span class="set-sendoff">@ ' + formatTime(s.interval) + '</span></div></div>';
      }).join('');
      var labelHtml = round.label ? '<div class="round-label"><span class="round-label-badge">' + round.label + '</span></div>' : '';
      return '<div class="set-group">' + labelHtml + rows + '</div>';
    }).join('');
    var st = STAGE_META[stage] || null;
    var iconHtml = st ? icon(st.icon) : '';
    var distHtml = stageMeters > 0 ? '<span class="workout-block-dist">' + formatDistanceM(stageMeters, 1) + '</span>' : '';
    return '<details class="workout-block"' + (stage ? ' data-stage="' + stage + '"' : '') + (openByDefault ? ' open' : '') +
      '><summary class="workout-block-title"><span class="workout-stage-icon">' + iconHtml + '</span>' + name +
      distHtml + '<span class="workout-block-count">' + totalSets + ' set' + (totalSets === 1 ? '' : 's') + '</span></summary>' +
      '<div class="workout-block-body">' + body + '</div></details>';
  }

  function pickN(arr, n) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(workoutRng() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy.slice(0, Math.min(n, copy.length));
  }
  function pickOne(arr) { return arr[Math.floor(workoutRng() * arr.length)]; }
  // Draws against an arbitrary RNG instance instead of the global workoutRng —
  // used to replay "what would today's settings have produced yesterday" for
  // the no-repeat-vs-yesterday check in generateWorkout(), without disturbing
  // today's own real pick sequence.
  function pickOneFrom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
  // Draws today's real pick, simulates what the exact same call site would
  // have drawn yesterday (via a separate throwaway RNG seeded from
  // yesterday's date), and re-rolls once if they collide — the same
  // "never the same headline pick two days running" technique already
  // applied to the Pre-Set/Main Set archetypes, generalized so it can also
  // cover the Warm-Up's drill and kick pools (100% fresh Warm-Up, Pre-Set
  // AND Main Set day to day, not just two of the three stages).
  function pickOneNoRepeat(pool, priorRng) {
    if (pool.length <= 1) return pickOne(pool);
    var priorPick = pickOneFrom(priorRng, pool);
    var pick = pickOne(pool);
    if (pick === priorPick) pick = pickOne(pool.filter(function (x) { return x !== priorPick; }));
    return pick;
  }
  // A "check N days back, not just 1" extension of pickOneNoRepeat was
  // attempted for the Warm-Up's drill/kick pools (three escalating designs:
  // naive-vs-decorated comparison, a depth-bounded recursive resolver, and
  // an anchor-fixed recursive resolver) and rejected — each was caught by a
  // dedicated Playwright test producing real multi-day identical-pick runs,
  // traced to the same root cause: any day whose own pick required a
  // tie-break can't have that tie-break reliably reconstructed by a LATER
  // day's independent re-derivation, so a from-scratch, no-persisted-history
  // exclusion check beyond 1 day back is not reliably correct with this
  // small a pool (5-6 items) and this codebase's existing seeded-RNG
  // machinery. pickOneNoRepeat's existing 1-day check (below) doesn't hit
  // this failure mode and is what both pool picks use.

  // How many rounds (2-3) a given level is allowed to build a Main Set
  // circuit from — seeded per 6-hour window (see workoutRng above) so the
  // shape is stable across regenerations within that window and rotates
  // automatically once the next one starts.
  function roundCountFor(scaler) {
    var min = scaler.minRounds || 2, max = scaler.maxRounds || min;
    return min + Math.floor(workoutRng() * (max - min + 1));
  }
  // Splits a Main Set archetype's total meterage evenly across n rounds,
  // rounded to a clean 50m so every round still lands on a swimmable rep scheme.
  function splitShareEqual(shareM, n) {
    var per = Math.max(50, Math.round((shareM / n) / 50) * 50);
    var out = [];
    for (var i = 0; i < n; i++) out.push(per);
    return out;
  }
  // Splits a total meterage across uneven fractions (e.g. a Cool-Down's
  // 50/30/20 split across easy Freestyle / Backstroke / final settle),
  // rounding each part to a clean 50m.
  function splitProportional(totalM, fractions) {
    return fractions.map(function (f) { return Math.max(50, Math.round((totalM * f) / 50) * 50); });
  }

  // The Warm-Up's second line always follows the hardcoded Freestyle-easy
  // opener, but which drill it actually is now rotates daily (via
  // workoutRng, same day-stable seed as the rest of generateWorkout())
  // instead of being the same fixed "odd 25 drill, even 25 build" every day.
  var WARMUP_DRILL_POOL = [
    'Drill/Build — odd 25 Drill, even 25 Build',
    'Kick/Swim — odd 25 Kick, even 25 MS',
    'Catch-Up Drill — exaggerate the front-end extension every length',
    'Fingertip Drag — brush your fingertips along the surface on recovery',
    'desc 1-4 — each 25 a little faster than the last',
    '3-3-3 Breathing — 3 lengths breathing every 3, 5, then every 2 strokes',
    // The pool was previously only 6 entries deep, so even a correctly-seeded
    // draw kept landing on the same handful of drills. These are all real,
    // standard squad drills, deliberately spread across catch, rotation,
    // tempo, balance and breathing so consecutive days feel genuinely
    // different rather than being six phrasings of the same idea.
    'Single-Arm — one arm only, other arm at your side, switch every 25',
    'Scull #1 — front scull, elbows high, forearms doing all the work',
    'Scull #2 — mid-scull at the hip line, feel the pressure change',
    '6-Kick Switch — 6 kicks on your side, one stroke, 6 on the other side',
    'Zipper Drill — thumb brushes your side all the way up the recovery',
    'Doggy Paddle — heads-up, short front-quadrant pulls, no recovery over the water',
    'Closed-Fist — swim with fists closed, then open the hands and feel the water',
    'Tarzan / Water Polo — head-up freestyle, high tempo, strong catch',
    'Stroke Count — count strokes each 25, take one fewer every length',
    'Broken Tempo — 25 slow and long, 25 fast turnover, same stroke length',
    'Pull With Buoy — long strokes, no kick, hips high and still',
    'Head-Lead Balance — arms at your sides, kick on your back, then your side',
    'Turn Focus — no breath in or out of the wall, tight tuck, fast breakout',
    'Distance Per Stroke — glide the front end, longest possible strokes'
  ];
  // The Warm-Up's kick set used to be hardcoded to underwater-dolphin focus
  // every single day — combined with the Pre-Set's own activation archetypes
  // (many of which are also turn/start/underwater-themed), a swimmer could
  // see that same handful of focus areas two or three times in one session,
  // every session. Rotating this kick set daily (same day-stable workoutRng
  // seed as everything else here) spreads starts/turns/underwater work across
  // days instead of cramming all of it into every single one.
  var WARMUP_KICK_POOL = [
    'Kick — 6-8 UWK off every wall, then strong flutter, tight streamline',
    'Kick — steady flutter, relaxed tempo, focus on ankle flexibility not speed',
    'Kick — on your side, one arm extended, rotate every 4 kicks',
    'Kick — BR whip-kick isolation, narrow and snappy, no glide skipped',
    'Kick — vertical kick treading position for 10s, then 40m EZ flutter',
    // Same reasoning as the drill pool above — 5 entries was far too shallow
    // to read as a rotation. Each of these targets a genuinely different
    // part of the kick (ankles, streamline, dolphin, tempo, balance).
    'Kick — streamline on your back, no board, arms locked overhead',
    'Kick — dolphin on your back, small and fast from the hips',
    'Kick — 25 fast / 25 easy by 25, hold the same body line on both',
    'Kick — board out front, head down, breathe every 4 kicks',
    'Kick — fins on if you have them, long powerful flutter, pointed toes',
    'Kick — 15m UWK off the wall, then EZ swim to the far end',
    'Kick — alternating 12.5m dolphin / 12.5m flutter, no break at the switch',
    'Kick — BK flutter with a slight hip rotation each 6 kicks',
    'Kick — descend 1-4 by 50, last one at race-leg effort',
    'Kick — heels breaking the surface only, small tight kick from the hips'
  ];
  // js/swiml-database.js (loaded before this file — see index.html) hardcodes
  // real drill/kick phrases transcribed verbatim from actual swiML XML swim
  // sessions (github.com/bartneck/swiML). Splicing them onto these two pools
  // means a Warm-Up's drill/kick line is genuine real-coach vocabulary some of
  // the time, not exclusively this file's own invented phrasing — a no-op if
  // that file somehow isn't loaded (WARMUP_DRILL_POOL/WARMUP_KICK_POOL simply
  // keep their original 5-6 entries).
  if (window.SWIML_WARMUP_DRILL_PHRASES) { WARMUP_DRILL_POOL = WARMUP_DRILL_POOL.concat(window.SWIML_WARMUP_DRILL_PHRASES); }
  if (window.SWIML_WARMUP_KICK_PHRASES) { WARMUP_KICK_POOL = WARMUP_KICK_POOL.concat(window.SWIML_WARMUP_KICK_PHRASES); }

  // WARM-UP STRUCTURAL BLUEPRINTS — genuinely different SHAPES, not the same
  // fixed opener/drill/kick/build skeleton every day with different label
  // text spliced in. Each build() has the same (shareM, pace100, scaler,
  // nextStroke, equipment) signature every Main Set/Pre-Set archetype
  // already uses, returning [{label, sets}, ...] rounds that
  // generateWorkout() runs through buildToShare() exactly like every other
  // stage — so distance accuracy holds for whichever blueprint gets picked.
  // A blueprint is chosen from postCompletionRng — fixed across every
  // Generate click until the swimmer completes a workout, then rotating —
  // so the Warm-Up's actual STRUCTURE, not just its drill/kick label text,
  // changes on that schedule rather than every click.
  var WARMUP_BLUEPRINTS = [
    {
      name: 'Classic Build',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var hasFins = equipment && equipment.indexOf('Fins') > -1;
        var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
        var drillReps = Math.max(4, Math.min(8, Math.round(shareM / 100) + 2));
        var kickReps = Math.max(4, Math.min(8, Math.round(shareM / 120) + 2));
        var buildReps = Math.max(4, Math.min(8, Math.round(shareM / 120) + 2));
        var openerSet = buildSet(1, Math.max(100, Math.round(shareM * 0.6 / 100) * 100), 'FR EZ — long smooth strokes', [], pace100 + 15, 15, scaler, 'Easy Pace');
        openerSet.stroke = 'Freestyle';
        var sets = [
          openerSet,
          buildSet(drillReps, 50, pickOneFrom(postCompletionRng, WARMUP_DRILL_POOL), hasFins ? ['Fins'] : [], pace100 + 10, 15, scaler, 'Easy Pace'),
          buildSet(kickReps, 50, pickOneFrom(postCompletionRng, WARMUP_KICK_POOL), hasKickboard ? ['Kickboard'] : [], pace100 + 18, 20, scaler, 'Kick')
        ];
        if (state.level !== 'beginner') {
          var buildStroke = nextStroke();
          var buildSetObj = buildSet(buildReps, 25, buildStroke + ' OTB desc 1-4', [], pace100 - 2, 15, scaler, '200 Pace');
          buildSetObj.stroke = nextStroke.current;
          sets.push(buildSetObj);
        }
        return [{ label: null, sets: sets }];
      },
      intents: [
        'A long easy opener settles the stroke before a drill line and a dedicated kick line each get their own focus, with a short build-up finishing the block for anyone past beginner level — the most familiar warm-up shape, still just one of several this generator can pick.'
      ]
    },
    {
      name: 'Pyramid Build',
      build: function (shareM, pace100, scaler, nextStroke) {
        // A genuine pyramid — swiML.xsd's own real `pyramid` instruction
        // type (startLength/stopLength/increment/isPointy) — ascending then
        // descending distance across several rungs, rather than a repeated
        // fixed-distance rep. None of the 7 literally-fetched swiML example
        // sessions happen to use a pyramid, but the construct is real,
        // defined schema, not invented. A pyramid can't shrink via
        // buildToShare's usual rep-scaling (every rung is already a single
        // rep), so on a small Warm-Up share this degrades to fewer, smaller
        // rungs instead — a 3- or 5-rung pyramid rather than forcing the
        // full 7-rung shape's own ~16-unit floor onto a session too small to
        // carry it.
        var ratioOptions = [[1, 2, 3, 4, 3, 2, 1], [1, 2, 3, 2, 1], [1, 2, 1]];
        var chosenRatios = ratioOptions[ratioOptions.length - 1];
        for (var oi = 0; oi < ratioOptions.length; oi++) {
          var sum = ratioOptions[oi].reduce(function (a, b) { return a + b; }, 0);
          var testUnit = Math.max(25, Math.round((shareM / sum) / 25) * 25);
          if (testUnit * sum <= shareM * 1.35) { chosenRatios = ratioOptions[oi]; break; }
        }
        var ratioSum = chosenRatios.reduce(function (a, b) { return a + b; }, 0);
        var unit = Math.max(25, Math.round((shareM / ratioSum) / 25) * 25);
        var peak = Math.max.apply(null, chosenRatios);
        // The whole pyramid stays Freestyle — like the Classic Build's own
        // opener, it's the Warm-Up's easing-in swim, not a discipline-
        // rotating block, so it never calls nextStroke() (avoiding a real
        // label/data mismatch a rotating stroke plus a Freestyle-only first
        // rung would otherwise create).
        var sets = chosenRatios.map(function (r, i) {
          var dist = unit * r;
          var tag = r >= peak ? 'Cruise Pace' : 'Easy Pace';
          var s = buildSet(1, dist, 'FR pyramid rung ' + (i + 1) + '/' + chosenRatios.length, [], pace100 + (10 - r * 2), 15, scaler, tag);
          s.stroke = 'Freestyle';
          return s;
        });
        return [{ label: null, sets: sets }];
      },
      intents: [
        'A true pyramid: distance climbs rung by rung to a peak, then descends back down — a genuinely different pacing challenge than a flat repeated rep, easing the body in and back out rather than holding one distance throughout.'
      ]
    }
  ];
  // js/swiml-database.js hardcodes structural blueprints lifted straight
  // from real swiML session STRUCTURES (not just vocabulary) — an IM-order
  // kick/drill rotation, broken no-stop continue pairs, a long-swim-plus-
  // ladder shape, and a repetition-triples shape. No-op if that file isn't
  // loaded.
  if (window.SWIML_WARMUP_BLUEPRINTS) { WARMUP_BLUEPRINTS = WARMUP_BLUEPRINTS.concat(window.SWIML_WARMUP_BLUEPRINTS); }
  // js/abu-dhabi-aquatics-database.js hardcodes a real ADAC Warm-Up structural
  // blueprint (a real meet-day shape, not just vocabulary) — spliced in the
  // same way the swiML blueprints are. No-op if that file isn't loaded.
  if (window.ADAC_WARMUP_BLUEPRINTS) { WARMUP_BLUEPRINTS = WARMUP_BLUEPRINTS.concat(window.ADAC_WARMUP_BLUEPRINTS); }

  var SPEED_ARCHETYPES = [
    {
      name: 'Lactate — Sprint Ladder',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var hasFins = equipment.indexOf('Fins') > -1;
        var ladder = paceLadder(pace100);
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Build', sets: [buildSet(Math.max(3, Math.round(m / 50)), 50, nextStroke() + ' desc, build to pace', [], ladder.p200, 30, scaler, '200 Pace')] }; },
          function (m) { return { label: '@ Race Pace' + (hasFins ? ', Fins On' : ''), sets: [buildSet(Math.max(3, Math.round(m / 50)), 50, nextStroke() + ' @ race pace', hasFins ? ['Fins'] : [], ladder.p100, 30, scaler, '100 Pace')] }; },
          function (m) { return { label: 'Sprint', sets: [buildSet(Math.max(2, Math.round(m / 50)), 50, nextStroke() + ' sprint, tight REC', [], ladder.p50, 20, scaler, '50 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Real speed is built on a ladder, not one gear: Round 1 grooves the stroke at 200 pace, Round 2 proves you can hold your actual 100 pace under a tighter clock, and only the final round asks for true 50-pace sprint effort — so your nervous system never redlines before it has to.',
        'Jumping straight to maximum effort burns out your fast-twitch fibers before the set is half done. Layering 200 pace into 100 pace into 50 pace lets each round prime the next, so the fastest swimming happens exactly when your body is ready for it.'
      ]
    },
    {
      name: 'Resist-Power — Turns & Starts',
      build: function (shareM, pace100, scaler, nextStroke) {
        var ladder = paceLadder(pace100);
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Streamline', sets: [buildSet(Math.max(3, Math.round(m / 25)), 25, nextStroke() + ' OTB streamline', [], ladder.p200, 35, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Race-Speed Turns', sets: [buildSet(Math.max(3, Math.round(m / 25)), 25, nextStroke() + ' explosive turn @ race pace', [], ladder.p100, 30, scaler, '100 Pace')] }; },
          function (m) { return { label: 'Sprint', sets: [buildSet(Math.max(2, Math.round(m / 25)), 25, nextStroke() + ' OTB sprint', [], ladder.p50, 20, scaler, '50 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Races are won and lost in transitions, but you can’t rehearse a wall at full sprint speed from the first rep. Round 1 grooves the mechanics at a controlled pace, and only the final round asks for the true race-day sprint — so the technique survives contact with real fatigue.',
        'Most swimmers lose more time to a sloppy turn than they gain from a fast middle length. Building from a controlled pace up to a true sprint rewires the wall into muscle memory without asking for maximum output before it can be executed cleanly.'
      ]
    },
    {
      name: 'Active Recovery',
      build: function (shareM, pace100, scaler) {
        return [{ label: null, sets: [buildSet(Math.max(1, Math.round(shareM / 100)), 100, 'EZ pace REC swim', [], pace100 + 20, 15, scaler, 'Recovery Pace')] }];
      },
      intents: [
        'Easy swimming between hard efforts actively flushes lactate from the working muscles — moving blood through them clears fatigue products faster than standing still ever would.'
      ]
    },
    {
      name: 'Broken — Race-Pace 100s',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var hasFins = equipment.indexOf('Fins') > -1;
        var ladder = paceLadder(pace100);
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Broken, Build', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, nextStroke() + ' Broken 4x25 REC:8, build', [], ladder.p200, 25, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Broken @ Race Pace' + (hasFins ? ', Fins On' : ''), sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, nextStroke() + ' Broken 4x25 REC:5 @ race pace', hasFins ? ['Fins'] : [], ladder.p100, 25, scaler, '100 Pace')] }; },
          function (m) { return { label: 'Straight @ Race Pace', sets: [buildSet(Math.max(1, Math.round(m / 100)), 100, nextStroke() + ' straight thru @ race pace', [], ladder.p100, 40, scaler, '100 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Breaking the 100 into 25s with only a short touch lets you hold your actual race pace with less fatigue than swimming it straight through — each round closes that gap until you’re asked to prove it unbroken, at the same honest pace, not faster.'
      ]
    },
    {
      name: 'VO2 Max — Power Ladder',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var hasPaddles = equipment.indexOf('Hand Paddles') > -1;
        var ladder = paceLadder(pace100);
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        function ladderRound(m, restMult, gear) {
          var reps = Math.max(1, Math.round(m / 150));
          var sets = [];
          for (var i = 0; i < reps; i++) {
            sets.push(buildSet(1, 75, nextStroke() + ' @ 200 pace', gear, ladder.p200, Math.round(25 * restMult), scaler, '200 Pace'));
            sets.push(buildSet(1, 50, nextStroke() + ' @ 100 pace', gear, ladder.p100, Math.round(25 * restMult), scaler, '100 Pace'));
            sets.push(buildSet(1, 25, 'all-out @ 50 pace', [], ladder.p50, Math.round(20 * restMult), scaler, '50 Pace'));
          }
          return sets;
        }
        var templates = [
          function (m) { return { label: 'Build', sets: ladderRound(m, 1, []) }; },
          function (m) { return { label: 'Power' + (hasPaddles ? ', Paddles On' : ''), sets: ladderRound(m, 0.85, hasPaddles ? ['Hand Paddles'] : []) }; },
          function (m) { return { label: 'All-Out', sets: ladderRound(m, 0.7, []) }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Shortening the distance while moving down the pace ladder — 200 pace, then 100 pace, then 50 pace — teaches your body the exact gear shift a real race demands. Each round keeps those same three honest paces but tightens the rest, so the ladder gets harder without ever asking for an unrealistic single top gear.'
      ]
    },
    {
      name: 'Speed Endurance — Race-Pace Band',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var hasFins = equipment.indexOf('Fins') > -1;
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'P+2', sets: [buildSet(Math.max(2, Math.round(m / 50)), 50, nextStroke() + ' desc, hold P+2', [], paceBand(pace100, 'p2'), 30, scaler, 'Race-Pace Band')] }; },
          function (m) { return { label: 'P+1 → P' + (hasFins ? ', Fins On' : ''), sets: [buildSet(Math.max(2, Math.round(m / 50)), 50, nextStroke() + ' P+1 → P', hasFins ? ['Fins'] : [], paceBand(pace100, 'p1'), 25, scaler, 'Race-Pace Band')] }; },
          function (m) { return { label: 'P → P-1', sets: [buildSet(Math.max(2, Math.round(m / 50)), 50, nextStroke() + ' P → P-1', [], paceBand(pace100, 'p0'), 20, scaler, 'Race-Pace Band')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Real race-pace training is keyed to a named pace band, not one flat interval — starting at P+2 and tightening toward P (and past it) round by round is exactly how a personalized target gets handed to you, rather than a generic send-off everyone swims the same.',
        'The interval gets tighter at the same moment the target pace gets faster — that double squeeze is what actually simulates the closing stages of a race, where the clock and your own effort are both compressing together.'
      ]
    },
    // A genuine heart-rate-targeting Main Set structure — climbing through
    // named training zones rather than just a faster clock time — one of
    // the explicitly-requested "elite coach" tools this pool didn't have
    // before. Excluded from Beginner (see BEGINNER_EXCLUDED_ARCHETYPES
    // below): all-out Zone 5 work with full recovery asks for pacing
    // control a beginner hasn't built yet.
    {
      name: 'VO2 Max — Heart-Rate Zone Ladder',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Zone 3 — Controlled', sets: [buildSet(Math.max(3, Math.round(m / 50)), 50, nextStroke() + ' hold Zone 3, comfortably hard', [], pace100 + 1, 15, scaler, '100 Pace')] }; },
          function (m) { return { label: 'Zone 4 — Threshold Push', sets: [buildSet(Math.max(3, Math.round(m / 50)), 50, nextStroke() + ' hold Zone 4, breathing hard', [], pace100 - 1, 20, scaler, '100 Pace')] }; },
          function (m) { return { label: 'Zone 5 — Max Effort', sets: [buildSet(Math.max(2, Math.round(m / 50)), 50, nextStroke() + ' hold Zone 5, all-out, full REC', [], pace100 - 4, 40, scaler, '50 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Climbing through named heart-rate zones — not just faster clock times — teaches a swimmer to read their own effort honestly, the same skill that keeps a race from being paced entirely off feel and adrenaline once the lactate builds.'
      ]
    }
  ];
  // js/swiml-database.js hardcodes real Main Set shapes transcribed verbatim
  // from real swiML swim sessions (see that file's own header for full
  // provenance/scope notes) — spliced in here so a genuine real-coach-
  // authored set can be picked alongside this file's own invented archetypes,
  // scaled through the exact same buildToShare()/pace-personalization
  // machinery every other archetype already uses. No-op if that file isn't
  // loaded.
  if (window.SWIML_MAIN_SET_ARCHETYPES && window.SWIML_MAIN_SET_ARCHETYPES.speed) {
    SPEED_ARCHETYPES = SPEED_ARCHETYPES.concat(window.SWIML_MAIN_SET_ARCHETYPES.speed);
  }
  // js/abu-dhabi-aquatics-database.js — see the matching ENDURANCE_ARCHETYPES
  // splice below for the full provenance note; same real-club-data
  // integration, speed side.
  if (window.ADAC_MAIN_SET_ARCHETYPES && window.ADAC_MAIN_SET_ARCHETYPES.speed) {
    SPEED_ARCHETYPES = SPEED_ARCHETYPES.concat(window.ADAC_MAIN_SET_ARCHETYPES.speed);
  }

  var ENDURANCE_ARCHETYPES = [
    {
      name: 'Low Aero — Base',
      build: function (shareM, pace100, scaler, nextStroke, equipment, totalM) {
        var longRep = totalM >= 3000 ? 400 : 200;
        var longTag = longRep >= 400 ? '400 Pace' : '200 Pace';
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Steady', sets: [buildSet(Math.max(2, Math.round(m / longRep)), longRep, nextStroke() + ' steady', [], pace100, 20, scaler, longTag)] }; },
          function (m) { return { label: 'Tempo', sets: [buildSet(Math.max(2, Math.round(m / longRep)), longRep, nextStroke() + ' same pace, tighter REC', [], pace100 - 2, 12, scaler, longTag)] }; },
          function (m) { return { label: 'Pull, Cruise', sets: [buildSet(Math.max(2, Math.round(m / longRep)), longRep, nextStroke() + ' Pull, rhythm', ['Pull Buoy'], pace100 + 2, 20, scaler, 'Cruise Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Sustained swimming at a steady, controlled effort is how you build mitochondrial density and improve your body’s ability to use oxygen efficiently. Each round changes the interval or the tool while the pace stays honest, so the aerobic engine gets built from more than one angle.'
      ]
    },
    {
      name: 'FR Aero — Negative-Split Pull',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var gear = equipment.filter(function (g) { return g === 'Pull Buoy' || g === 'Hand Paddles'; });
        var g = gear.length ? gear : ['Pull Buoy'];
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Even Pace', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, 'Pull, even pace', g, pace100 + 8, 20, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Neg Split', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, 'Pull, neg split', g, pace100 + 5, 20, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Desc', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, 'Pull, desc 1', g, pace100 + 2, 15, scaler, '100 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Swimming the second half faster proves — to your body and your head — that you can accelerate on command even with real work already in the legs and lungs. Each round raises that demand, from an even pace up to a full descend, so pacing discipline is built in layers.'
      ]
    },
    {
      name: 'Low Aero — Descend Ladder',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'desc 1-4', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' desc 1-4', [], pace100 + 8, 15, scaler, '200 Pace')] }; },
          function (m) { return { label: 'desc, Tighter', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' desc, tighter REC', [], pace100 + 4, 10, scaler, '150 Pace')] }; },
          function (m) { return { label: 'Best Avg', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' hold best avg', [], pace100, 10, scaler, '100 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Getting faster on every rep forces you to control effort early so you have something left to give late. Each round tightens the interval or raises the bar the last round set, exactly the discipline that prevents the third-quarter fade in a longer race.'
      ]
    },
    {
      name: 'Threshold — Broken Swim',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Threshold', sets: [buildSet(Math.max(2, Math.round(m / 200)), 200, nextStroke() + ' @ threshold', [], pace100 + 5, 15, scaler, 'Threshold Pace')] }; },
          function (m) { return { label: 'Threshold, Tighter', sets: [buildSet(Math.max(2, Math.round(m / 200)), 200, nextStroke() + ' @ threshold, tighter REC', [], pace100 + 3, 8, scaler, 'Threshold Pace')] }; },
          function (m) { return { label: 'Broken, Push', sets: [buildSet(Math.max(2, Math.round(m / 200)), 200, nextStroke() + ' Broken 2x100 REC:10', [], pace100, 20, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Short rest breaks let you accumulate more total time near your threshold pace than one long unbroken swim would allow. Each round shortens the rest or the pace target, precisely where your aerobic ceiling gets pushed up.'
      ]
    },
    {
      name: 'Threshold — Build-By-Thirds',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { var dist = Math.max(200, Math.round(m / 100) * 100); return { label: 'Build x3', sets: [buildSet(1, dist, nextStroke() + ' build x3 (EZ/mod/strong)', [], pace100 + 6, 15, scaler, dist >= 400 ? '400 Pace' : '200 Pace')] }; },
          function (m) { var dist = Math.max(200, Math.round(m / 100) * 100); return { label: 'Faster Baseline', sets: [buildSet(1, dist, nextStroke() + ' build x3, faster baseline', [], pace100 + 2, 15, scaler, dist >= 400 ? '400 Pace' : '200 Pace')] }; },
          function (m) { var dist = Math.max(200, Math.round(m / 100) * 100); return { label: 'Race-Effort Final', sets: [buildSet(1, dist, nextStroke() + ' build x3, final @ race', [], pace100, 15, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Shifting gears within one continuous swim, rather than resting between reps, trains the more specific skill of changing pace mid-race without losing stroke length or rhythm. Each round raises the baseline, so the same shift gets harder to execute cleanly.'
      ]
    },
    {
      name: 'Low Aero — Distance Ladder',
      build: function (shareM, pace100, scaler, nextStroke) {
        // A genuine descending-distance ladder (e.g. 400-300-200-100) rather
        // than the same rep distance repeated more times as volume grows —
        // the rung sizes themselves scale with shareM, so a big-volume day
        // actually carries larger rungs (400s, 300s) instead of just more
        // reps of a small fixed distance.
        var unit = Math.max(50, Math.round((shareM / 10) / 50) * 50);
        var rungs = [4, 3, 2, 1].map(function (m) { return unit * m; });
        var stroke = nextStroke();
        var offsets = [8, 5, 2, -2];
        var sets = rungs.map(function (dist, idx) {
          var tail = idx === rungs.length - 1 ? 'fastest rung' : 'hold pace';
          return buildSet(1, dist, stroke + ' rung ' + (idx + 1) + '/' + rungs.length + ', ' + tail, [], pace100 + offsets[idx], 15, scaler, idx === rungs.length - 1 ? '100 Pace' : null);
        });
        return [{ label: 'Distance Ladder ' + rungs.join('-') + 'm', sets: sets }];
      },
      intents: [
        'Descending through real distance rungs — 400 down to 100 — asks for a completely different pacing skill than repeating the same rep over and over: you have to genuinely shift gears as the rung shrinks, which is exactly what a race\'s closing stages demand.'
      ]
    },
    // A genuine hypoxic threshold structure — widening the breathing pattern
    // WHILE holding real threshold pace, not just a slow easy-swim breath-hold
    // exercise. One of the explicitly-requested "elite coach" tools this pool
    // didn't have before. Excluded from Beginner: restricted breathing at
    // pace is a real risk for a swimmer who hasn't built the aerobic base
    // for it yet.
    {
      name: 'Threshold — Hypoxic Breath Ladder',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Breathe Every 3', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, nextStroke() + ' @ threshold, breathe every 3', [], pace100 + 4, 15, scaler, 'Threshold Pace')] }; },
          function (m) { return { label: 'Breathe Every 5', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, nextStroke() + ' @ threshold, breathe every 5', [], pace100 + 4, 15, scaler, 'Threshold Pace')] }; },
          function (m) { return { label: 'Breathe Every 7', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, nextStroke() + ' @ threshold, breathe every 7 — hold form', [], pace100 + 4, 15, scaler, 'Threshold Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Widening the breathing pattern while holding real threshold pace forces genuine oxygen efficiency, not a breath-hold party trick — the same restricted-air discipline that keeps stroke length together on the last 50 of a race, when legal breathing feels like a luxury you can\'t afford to take.'
      ]
    }
  ];
  // See the matching SPEED_ARCHETYPES splice above — same real-swiML-data
  // integration, endurance side.
  if (window.SWIML_MAIN_SET_ARCHETYPES && window.SWIML_MAIN_SET_ARCHETYPES.endurance) {
    ENDURANCE_ARCHETYPES = ENDURANCE_ARCHETYPES.concat(window.SWIML_MAIN_SET_ARCHETYPES.endurance);
  }
  // js/abu-dhabi-aquatics-database.js hardcodes real Main Set shapes
  // transcribed verbatim from actual Abu Dhabi Aquatics Club sessions (see
  // that file's own header for full provenance/scope notes) — spliced in
  // here the same way the swiML archetypes are, so a genuine real-club-
  // authored set can be picked alongside this file's own invented ones,
  // scaled through the identical buildToShare()/pace-personalization
  // machinery. No-op if that file isn't loaded.
  if (window.ADAC_MAIN_SET_ARCHETYPES && window.ADAC_MAIN_SET_ARCHETYPES.endurance) {
    ENDURANCE_ARCHETYPES = ENDURANCE_ARCHETYPES.concat(window.ADAC_MAIN_SET_ARCHETYPES.endurance);
  }

  // "Secret swimmer tricks" — subtle, coach-voice technique cues woven
  // directly into a Technique archetype's own set description (rather than a
  // separate wall-of-text intent paragraph) so a swimmer absorbs one concrete
  // fix mid-set, organically, instead of feeling lectured. Each cue targets
  // one of the three explicitly-requested fundamentals — underwater
  // propulsion, a clean catch, or body rotation — and rotates via the same
  // 6-hour-stable workoutRng/pickOne() as every other random choice in the
  // generator, so it's stable within that window and changes at the same
  // 6-hour rotation as the rest of the workout.
  var TECHNIQUE_MICRO_CUES = [
    'a strong early-vertical-forearm catch — feel the water "grab" before the pull even starts',
    'a subtle hip-driven body rotation feeding power into every stroke, not just the arms',
    '2 quiet UWK off every wall before breaking into MS',
    'a high, quiet catch that holds the water instead of slipping through it',
    'finishing the pull fully past the hip for a clean, complete exit before recovery'
  ];
  var TECHNIQUE_ARCHETYPES = [
    {
      name: 'Skill — Drill Focus',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Isolation', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' Drill, catch/body position', ['Snorkel'], pace100 + 14, 20, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'Drill/Swim', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' odd 25 Drill, even 25 MS', [], pace100 + 10, 18, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'MS + Cue', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' MS, focus on ' + pickOne(TECHNIQUE_MICRO_CUES), [], pace100 + 6, 15, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Isolating the catch and body position at low intensity lets your nervous system actually rewire the movement pattern. Each round removes a layer of scaffolding — first the drill alone, then blended with full stroke, then full stroke with just a cue — so the fix survives contact with real swimming.'
      ]
    },
    {
      name: 'Skill — Equipment Strength',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        var gearOptions = equipment.length ? equipment : ['Pull Buoy'];
        // Realistic gear use is one piece at a time, never everything
        // combined onto the same rep — Round 1 and Round 2 each use a
        // single item (a different one where more than one is selected),
        // and Round 3 intentionally goes gear-off to test transfer.
        var gearRound1 = gearOptions[0];
        var gearRound2 = gearOptions.length > 1 ? gearOptions[1] : gearOptions[0];
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: gearRound1 + ' Feel', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, gearRound1 + '-assisted pace work', [gearRound1], pace100 + 10, 20, scaler, 'Drill Pace')] }; },
          function (m) { return { label: gearRound2 + ' Strength', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, gearRound2 + ' pace work, faster target', [gearRound2], pace100 + 6, 18, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Gear Off', sets: [buildSet(Math.max(2, Math.round(m / 100)), 100, 'No gear, transfer feel', [], pace100 + 4, 15, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Equipment isolates specific muscle groups and removes compensations. The final round strips the gear away on purpose — that’s the only way to prove the strength or feel actually transfers back into full-stroke swimming.'
      ]
    },
    {
      name: 'Skill — SC Focus',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Baseline SC', sets: [buildSet(Math.max(4, Math.round(m / 25)), 25, nextStroke() + ' minimum SC per length', [], pace100 + 15, 20, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'Hold SC', sets: [buildSet(Math.max(4, Math.round(m / 25)), 25, nextStroke() + ' same SC, faster pace', [], pace100 + 10, 15, scaler, '200 Pace')] }; },
          function (m) { return { label: 'Race Pace', sets: [buildSet(Math.max(4, Math.round(m / 25)), 25, nextStroke() + ' @ race pace, track SC', [], pace100 + 4, 12, scaler, '100 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Counting strokes per length makes efficiency measurable, not just a feeling. Each round holds that same count against a faster and faster target — the honest test of whether your efficiency survives speed.'
      ]
    },
    {
      name: 'Skill — Catch-Up Progression',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Catch-Up', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' Catch-Up Drill', [], pace100 + 16, 20, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'Catch-Up + MS', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' first 25 Catch-Up, second 25 MS', [], pace100 + 10, 18, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'MS', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' MS, hold extension', [], pace100 + 6, 15, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Catch-up drilling forces a complete extension and a distinct catch before the recovering arm enters. Each round hands more of the stroke back to full speed while asking you to keep that same extension — isolating the exact moment most swimmers rush and lose their hold on the water.'
      ]
    },
    {
      name: 'Skill — Tempo Awareness',
      build: function (shareM, pace100, scaler, nextStroke) {
        var n = roundCountFor(scaler);
        var shares = splitShareEqual(shareM, n);
        var templates = [
          function (m) { return { label: 'Slow Tempo', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' slow tempo, same effort', [], pace100 + 12, 20, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'Fast Tempo', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' fast tempo, same effort', [], pace100 + 8, 15, scaler, 'Drill Pace')] }; },
          function (m) { return { label: 'Cho Tempo', sets: [buildSet(Math.max(4, Math.round(m / 50)), 50, nextStroke() + ' Cho tempo', [], pace100 + 4, 12, scaler, '200 Pace')] }; }
        ];
        return templates.slice(0, n).map(function (t, i) { return t(shares[i]); });
      },
      intents: [
        'Deliberately varying stroke rate without changing effort builds the awareness to choose the most efficient tempo for any pace. The final round hands the choice back to you — the real test of whether that awareness stuck.'
      ]
    }
  ];

  // js/abu-dhabi-aquatics-database.js — real ADAC Main Set shapes, technique
  // side (see the matching ENDURANCE_ARCHETYPES splice above for the full
  // provenance note).
  if (window.ADAC_MAIN_SET_ARCHETYPES && window.ADAC_MAIN_SET_ARCHETYPES.technique) {
    TECHNIQUE_ARCHETYPES = TECHNIQUE_ARCHETYPES.concat(window.ADAC_MAIN_SET_ARCHETYPES.technique);
  }

  var ARCHETYPE_POOLS = { speed: SPEED_ARCHETYPES, endurance: ENDURANCE_ARCHETYPES, technique: TECHNIQUE_ARCHETYPES };
  // DIFFICULTY SCALING (Beginner): these four archetypes ask for a pacing/
  // execution skill a beginner hasn't built yet — genuine all-out ladders and
  // explosive wall work (Explosive Turns & Starts, Descending Power Ladder),
  // or a sustained-threshold/gear-shifting demand (Broken Threshold Swim,
  // Distance Ladder). Every other Speed/Endurance archetype already builds
  // gradually within its own rounds (e.g. Sprint Reps ramps 200-pace ->
  // 100-pace -> 50-pace) and stays available. The Technique pool is entirely
  // drill-based already and is never filtered.
  var BEGINNER_EXCLUDED_ARCHETYPES = ['Resist-Power — Turns & Starts', 'VO2 Max — Power Ladder', 'Threshold — Broken Swim', 'Low Aero — Distance Ladder', 'Low Aero — swiML Vikings Ladder', 'Sprint — swiML 25s Ladder', 'Sprint — ADAC Broken Ladder', 'VO2 Max — Heart-Rate Zone Ladder', 'Threshold — Hypoxic Breath Ladder'];

  // SPRINTER PHYSIOLOGY: a swimmer who set their Swimmer Type (Race Goal
  // card) to Sprinter shouldn't be handed the Endurance pool's long-
  // unbroken-swim archetypes on an Endurance/Aerobic-Distance/Threshold-
  // themed day. Aerobic Base is the concrete, reachable case a direct bug
  // report named: its own build() literally computes
  // `Math.max(2, Math.round(m / 400))` reps of a 400m rep once totalM hits
  // 3000m+ — a genuine "4x400m" (or worse at higher volumes) handed to a
  // swimmer whose training is built around fast-twitch, race-specific work
  // rather than sustained aerobic swimming. Build-By-Thirds (a single
  // continuous rep that scales directly with distance) and Distance Ladder
  // (long descending rungs) are the same category of problem. Excluding
  // these three leaves exactly the Endurance archetypes already built around
  // short reps and short rest — Negative-Split Pull (100m reps), Descend
  // Ladder (50m reps), and Broken Threshold Swim (200m broken into 2x100) —
  // which is the actual "high-repetition 50s/100s, short rest" adaptation a
  // sprinter's own endurance work should look like, not a rewrite of the
  // pool's own pacing logic.
  var SPRINTER_ENDURANCE_EXCLUDED_ARCHETYPES = ['Low Aero — Base', 'Threshold — Build-By-Thirds', 'Low Aero — Distance Ladder'];

  // Pre-Set archetypes: the second of four stages in every generated workout
  // (Warm-Up → Pre-Set → Main Set → Cool-Down), always exactly one per
  // session. Its job is narrow and singular — pure ACTIVATION: short, sharp
  // work that primes the nervous system, opens the underwater/turn/start
  // mechanics, and lifts the heart rate into the working zone the Main Set is
  // about to demand. Every archetype here is built around one of those
  // activation levers (speed build, HR activation, underwater dolphin kick,
  // turns, start/reaction power) and each carries an explicit technical focus
  // — underwater kick distance, turn execution, breakout timing, stroke count
  // — rather than being a generic "medium effort swim." Reps scale with the
  // Pre-Set's share of the session's distance, so a bigger day genuinely gets
  // a bigger activation block, not the same fixed set every time.
  var PRESET_ARCHETYPES = [
    {
      name: 'Speed-Build Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var ladder = paceLadder(pace100);
        var reps = Math.max(4, Math.round(shareM / 25));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 25, stroke + ' desc 1-4, EZ to fast', [], ladder.p50 + 4, 25, scaler, '50 Pace')];
        return [{ label: 'CNS Activation — 25s Build', sets: sets }];
      },
      intents: [
        'Short build reps wake up the fast-twitch fibers and rehearse acceleration without redlining — the point of activation is to switch the sprint system on, not to fatigue it before the Main Set.'
      ]
    },
    {
      name: 'Heart-Rate Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(3, Math.round(shareM / 50));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' desc 1-3 to Z4', [], pace100 + 2, 20, scaler, '100 Pace')];
        return [{ label: 'HR Lift — desc 50s', sets: sets }];
      },
      intents: [
        'Stepping the heart rate up before the Main Set means your aerobic system is already open when the real work starts — a cold first rep wastes the hardest set of the day warming you up.'
      ]
    },
    {
      name: 'Underwater Dolphin Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(4, Math.round(shareM / 25));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 25, stroke + ' 6-8 UWK off wall', [], pace100 + 6, 20, scaler, 'Drill Pace')];
        return [{ label: 'UWK — Off Every Wall', sets: sets }];
      },
      intents: [
        'The underwater dolphin off each wall is the fastest part of any race — activating it in the Pre-Set means the fifth stroke of hidden speed is switched on and streamlined before the Main Set, not something you rediscover halfway through.'
      ]
    },
    {
      name: 'Turn & Breakout Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(4, Math.round(shareM / 50));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' fast turn, strong breakout', [], pace100 + 4, 25, scaler, '100 Pace')];
        return [{ label: 'Turns — Fast In, Fast Out', sets: sets }];
      },
      intents: [
        'Most swimmers lose more time to a lazy turn than to a slow middle length. Rehearsing the fast approach, the turn, and the breakout at speed before the Main Set means every wall in the main work is already sharp.'
      ]
    },
    {
      name: 'Start & Reaction Power',
      build: function (shareM, pace100, scaler, nextStroke) {
        var ladder = paceLadder(pace100);
        var reps = Math.max(4, Math.round(shareM / 25));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 25, stroke + ' OTB explosive, full REC', [], ladder.p50, 35, scaler, '50 Pace')];
        return [{ label: 'OTB Power — Explosive 15s', sets: sets }];
      },
      intents: [
        'Start and reaction power is trained fresh, with real rest between reps, or not at all — activating the explosive push-off and first strokes here primes maximal power without the fatigue that would blunt it.'
      ]
    },
    {
      name: 'Stroke-Rate Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(4, Math.round(shareM / 50));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' 25 EZ/long, 25 fast turnover', [], pace100 + 2, 20, scaler, '100 Pace')];
        return [{ label: 'Tempo Switch — 25 EZ / 25 Fast', sets: sets }];
      },
      intents: [
        'Flipping between a long relaxed tempo and a fast turnover on the same rep rehearses the exact gear-change the Main Set demands — activation is teaching the body where the higher gear lives before you need it under fatigue.'
      ]
    },
    // The six archetypes above are all explosive-power/turn/start/underwater
    // activation — genuinely the right lever for a Speed-focused Main Set,
    // but firing every single day regardless of goal meant a swimmer saw
    // starts/turns/underwater work two or three times in one session (here,
    // then again in the Warm-Up's kick set, then again if a Speed Main Set
    // archetype rolled). These two give the daily rotation somewhere else to
    // land — an aerobic lead-in for Endurance-leaning days and a feel/technique
    // primer for Technique-leaning days — without ever making Pre-Set goal-
    // gated (it stays one shared pool, still equally available every day).
    {
      name: 'Aerobic Lead-In',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(2, Math.round(shareM / 100));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 100, stroke + ' steady, no build', [], pace100 + 8, 15, scaler, 'Cruise Pace')];
        return [{ label: 'Aerobic Lead-In — Steady 100s', sets: sets }];
      },
      intents: [
        'Not every day needs an explosive primer — a longer session\'s Main Set often asks for a settled aerobic rhythm, not a jolt of speed. A few steady, unhurried 100s open that engine gradually so the Main Set\'s pacing discipline starts from a calm baseline, not a spike.'
      ]
    },
    {
      name: 'Feel & Technique Primer',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(4, Math.round(shareM / 50));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' Cho Drill, slow', [], pace100 + 12, 20, scaler, 'Drill Pace')];
        return [{ label: 'Feel Primer — Slow & Deliberate', sets: sets }];
      },
      intents: [
        'A Technique-focused Main Set is wasted if the swimmer arrives thinking about speed. A slow, deliberate primer with one technical focus per length gets the mind and the stroke into a feel-first mode before the real drill work begins.'
      ]
    },
    // Four additional activation archetypes — the pool was 8 deep, which with
    // a once-per-day draw meant a swimmer could plausibly see the same
    // Pre-Set twice inside a single week. Each of these primes a genuinely
    // different system (pull pressure, breath control, tempo laddering,
    // broken race pace) rather than restating one of the eight above.
    {
      name: 'Pull-Pressure Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(3, Math.round(shareM / 75));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 75, stroke + ' build the catch — 25 scull, 50 strong pull', [], pace100 + 4, 20, scaler, '200 Pace')];
        return [{ label: 'Pull Activation — Catch Pressure', sets: sets }];
      },
      intents: [
        'Sculling straight into a hard pull teaches the hand to find pressure before the Main Set demands it, so the first hard rep is not the one spent looking for the catch.'
      ]
    },
    {
      name: 'Hypoxic Breath Control',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(4, Math.round(shareM / 50));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' breathe 3/5/7 by 50, steady tempo throughout', [], pace100 + 6, 25, scaler, 'Cruise Pace')];
        return [{ label: 'Breath Control — Restricted Breathing 50s', sets: sets }];
      },
      intents: [
        'Restricting the breath at an easy pace trains the swimmer to stay relaxed under CO2 load, so breathing patterns hold together later in the session instead of collapsing the stroke.'
      ]
    },
    {
      name: 'Tempo Ladder Activation',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(3, Math.round(shareM / 75));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 75, stroke + ' 25 slow / 25 moderate / 25 fast, same stroke length', [], pace100 + 2, 20, scaler, '200 Pace')];
        return [{ label: 'Tempo Ladder — Three-Gear 75s', sets: sets }];
      },
      intents: [
        'Shifting through three gears inside one rep proves the swimmer can raise turnover without shortening the stroke — the exact skill every descending Main Set is about to ask for.'
      ]
    },
    {
      name: 'Broken Race-Pace Primer',
      build: function (shareM, pace100, scaler, nextStroke) {
        var reps = Math.max(2, Math.round(shareM / 100));
        var stroke = nextStroke();
        var sets = [buildSet(reps, 50, stroke + ' at goal race pace, 10s break at the 25 — feel the pace, not the effort', [], pace100 - 3, 30, scaler, '100 Pace')];
        return [{ label: 'Race-Pace Primer — Broken 50s', sets: sets }];
      },
      intents: [
        'Breaking the rep lets a swimmer touch real race pace while still fresh, so the body has a clear reference point for what the Main Set is chasing rather than guessing at it under fatigue.'
      ]
    }
  ];

  // PRE-SET MUST PHYSICALLY PRIME THE MAIN SET — a Pre-Set drawn at random
  // from the full 12-archetype pool above could hand a Sprint/Power day a
  // slow aerobic lead-in, or a Distance/Threshold day an explosive CNS
  // activation block that just burns matches before the real work starts.
  // These two sub-pools split the same 12 archetypes (by reference, not by
  // duplicating their build()s) into the two physiological camps a real
  // coach actually reasons in: CNS/explosive priming for a sprint-oriented
  // Main Set, DPS/pacing/feel priming for a distance-, threshold- or
  // technique-oriented one. presetPoolForGoals() below picks which sub-pool
  // actually feeds dailyRotationPick() — the Pre-Set is no longer goal-blind.
  var PRESET_SPEED_ARCHETYPES = PRESET_ARCHETYPES.filter(function (a) {
    return ['Speed-Build Activation', 'Underwater Dolphin Activation', 'Turn & Breakout Activation',
      'Start & Reaction Power', 'Stroke-Rate Activation', 'Heart-Rate Activation',
      'Tempo Ladder Activation', 'Broken Race-Pace Primer'].indexOf(a.name) > -1;
  });
  var PRESET_ENDURANCE_ARCHETYPES = PRESET_ARCHETYPES.filter(function (a) {
    return ['Aerobic Lead-In', 'Feel & Technique Primer', 'Pull-Pressure Activation',
      'Hypoxic Breath Control'].indexOf(a.name) > -1;
  });
  // Mirrors exactly how the Main Set's own archetype pool is chosen (see
  // `state.goals.reduce(...)` below) — Speed-only -> CNS priming,
  // Endurance-only -> DPS/pacing priming, both selected -> the swimmer is
  // training both systems today so the full combined pool stays in play,
  // Technique-only or no signal at all -> the gentler DPS/feel bucket (a
  // Technique day's own Feel & Technique Primer already lives there).
  function presetPoolForGoals(goals) {
    var hasSpeed = goals.indexOf('speed') > -1;
    var hasEndurance = goals.indexOf('endurance') > -1;
    if (hasSpeed && !hasEndurance) return PRESET_SPEED_ARCHETYPES;
    if (hasEndurance && !hasSpeed) return PRESET_ENDURANCE_ARCHETYPES;
    if (hasSpeed && hasEndurance) return PRESET_ARCHETYPES;
    return PRESET_ENDURANCE_ARCHETYPES;
  }

  var TIPS_BY_DISCIPLINE = {
    'Freestyle': 'Keep a high-elbow catch and rotate through the hips, not just the shoulders.',
    'Backstroke': 'Keep your head still and level — just a slight ripple at the crown, eyes on the ceiling.',
    'Butterfly': 'Start the undulation at your chest; let the hips and legs follow the wave rather than forcing it.',
    'Breaststroke': 'Time the kick to snap shut just as your arms finish the outsweep and begin to recover.',
    'Individual Medley': 'Plan each stroke transition two strokes before the wall — never rush the touch.'
  };
  var TIPS_BY_GOAL = {
    speed: 'Your fastest speed in the pool is right after a start or turn — explode off every wall.',
    endurance: 'Lock into a fixed breathing pattern (e.g. every 3rd stroke) and hold it, even as fatigue builds.',
    technique: 'Count strokes per length — fewer, longer strokes almost always beat more, shorter ones.'
  };
  var UNIVERSAL_TIPS = [
    'Streamline off every wall: glide tight and straight until your first kick, not before.',
    'Flip turns: tuck earlier than feels natural and drive off the wall with straight legs.',
    'Breath control: exhale steadily underwater so you are not gasping for air on the turn.'
  ];

  function renderCoachTips() {
    var tips = state.disciplines.map(function (d) { return TIPS_BY_DISCIPLINE[d]; });
    tips = tips.concat(state.goals.map(function (g) { return TIPS_BY_GOAL[g]; }));
    tips.push(UNIVERSAL_TIPS[dayIndex() % UNIVERSAL_TIPS.length]);
    return '<div class="coach-tips"><div class="coach-tips-head">' + icon('i-target') + ' Coach’s Technical Tips</div><ul>' +
      tips.map(function (t) { return '<li>' + icon('i-check') + '<span>' + t + '</span></li>'; }).join('') + '</ul></div>';
  }

  function generateWorkout() {
    // Reseed from the current 6-hour freshness bucket first, so every
    // archetype/round-count pick this function makes below comes from the
    // same bucket-stable sequence — a swimmer's workout automatically
    // rotates every 6 hours (not once a day) rather than reshuffling on
    // every single click of Generate, so a second session later the same
    // day still gets a genuinely fresh, deeply-structured set.
    workoutRng = makeSeededRandom(freshnessSeed(new Date()));
    // Composite seed (6-hour bucket + completion counter + the swimmer's own
    // selections) — see generatorVarianceSeed() for why seeding this from
    // the completion counter alone was a real bug.
    // Drives the drill/kick LABEL picks inside whichever Warm-Up blueprint
    // gets chosen. The blueprint and Pre-Set archetype themselves no longer
    // draw from this — they use dailyRotationPick()'s guaranteed-non-repeat
    // walk instead (see above).
    postCompletionRng = makeSeededRandom(generatorVarianceSeed(new Date(), effectiveFocus().key));
    // A separate, throwaway RNG seeded with the PREVIOUS 6-hour bucket, used
    // only to simulate "what would this exact profile have produced last
    // bucket" for the Pre-Set and first Main Set archetype — so a swimmer
    // generating twice in the same day with unchanged settings never sees
    // the identical headline archetype twice in a row. This never touches
    // the real workoutRng, so the current bucket's own pick sequence stays
    // exactly as deterministic as before.
    var priorBucketRng = makeSeededRandom(freshnessSeed(new Date(Date.now() - SIX_HOUR_MS)));
    // FREEMIUM LEVEL GATE, defense-in-depth: Competitive/Elite are already
    // blocked at the UI layer (the levelTabs click handler and
    // updateLevelTabLocks() below), so this only ever fires for a stored
    // preference from before a subscription lapsed, or otherwise-stale
    // state.level reaching this function directly.
    //
    // A REAL, PREVIOUSLY-LIVE BUG WAS FOUND HERE: this check used to fire
    // whenever window.__hasFullAccess() returned false — but that function
    // ALSO returns false while access simply hasn't resolved yet (the brief
    // window right after sign-in, before the async Firestore round-trip in
    // recomputeAccessLevel() sets window.__swimfitAccess for the first
    // time). A swimmer — including a genuinely full-access Pro/Trial/Admin
    // one — who opened the Workout Studio, dragged the Target Distance
    // slider to e.g. 5.0 km, and hit Generate quickly (well within normal
    // human reaction time relative to that round-trip) would get silently
    // downgraded to Beginner AND capped to 3000m below, with the level tabs
    // still visually showing their real, unlocked selection — reading
    // exactly like "I asked for 5km and got 3km" with no visible cause. The
    // fix distinguishes "access is DEFINITIVELY known and not full" (the
    // real intended case: a genuinely free-tier swimmer with a stale
    // Competitive/Elite preference in localStorage) from "access hasn't
    // resolved yet" (window.__swimfitAccess still null/undefined) — only
    // the former downgrades; the latter trusts whatever state.level the UI
    // itself is already showing, since updateLevelTabLocks() will correct
    // it visually and re-run this same check a moment later once access
    // actually resolves.
    var freeLevelDowngraded = false;
    var accessResolved = !!window.__swimfitAccess;
    if (accessResolved && state.level !== 'beginner' && !(typeof window.__hasFullAccess === 'function' && window.__hasFullAccess())) {
      state.level = 'beginner';
      freeLevelDowngraded = true;
    }
    var scaler = LEVEL_SCALERS[state.level];

    var age = parseInt(document.getElementById('swimmerAge').value, 10);
    var activeEntry = activePbEntry();
    var pbDistanceM = activeEntry ? parseInt(activeEntry.distance, 10) : null;
    var pbTimeSec = activeEntry ? parseTimeToSeconds(activeEntry.currentTime) : null;
    var personalPace = personalPaceFromPB(pbDistanceM, pbTimeSec, state.goals);
    var pace100 = personalPace != null ? personalPace : paceSecondsPer100(state.goals, state.level);

    // RACE-GOAL TARGETING: a Target Time only changes anything once there's
    // both a real current PB AND a target genuinely faster than it (parsing
    // failures or a target slower/equal to the current PB just no-op back to
    // the plain PB-derived pace above — never a worse or nonsensical result).
    // personalPaceFromPB() already normalizes ANY race distance to an
    // equivalent 100m pace via its Riegel-exponent model, so calling it again
    // with the *target* time treats that target exactly like a hypothetical
    // faster PB, putting both numbers on the same footing. The blend (65%
    // current / 35% target) is a deliberately honest middle ground — genuinely
    // harder than the swimmer's comfortable current pace so the sets actually
    // build toward the goal, but not simply handing them full target pace on
    // day one, which would be unrealistic and demoralizing.
    var raceGoalTargetSec = activeEntry ? parseTimeToSeconds(activeEntry.targetTime) : null;
    var raceGoalActive = !!(personalPace != null && raceGoalTargetSec != null && raceGoalTargetSec > 0 && raceGoalTargetSec < pbTimeSec);
    if (raceGoalActive) {
      var targetPace100 = personalPaceFromPB(pbDistanceM, raceGoalTargetSec, state.goals);
      pace100 = personalPace * 0.65 + targetPace100 * 0.35;
    }
    // WEEKLY PERIODIZATION: Saturday's Rest / Active Recovery day is meant to
    // feel genuinely different, not just draw from the same archetype pool
    // under a different label — a flat pace ease applies regardless of any
    // race goal above, since a true rest day should never be pushed hard even
    // while chasing a target time. effectiveFocus() honors a swimmer's own
    // tapped-day override on the Weekly Schedule card, falling back to the
    // real calendar day (todaysFocus()) when no override is set.
    var focusToday = effectiveFocus();
    if (focusToday.restDay) pace100 += 10;

    var totalM = state.distance;
    var restDayCapApplied = false;
    // A scheduled Rest / Active Recovery day is not meant to be a full
    // session — capping its volume well below the swimmer's own chosen
    // Target Distance is the entire point of "Saturday off," not a bug in
    // the strict-distance-matching logic below (which still applies exactly,
    // just against this smaller effective target for today).
    if (focusToday.restDay && totalM > 1200) { totalM = 1200; restDayCapApplied = true; }
    var ageCapApplied = false;
    if (age && age < 12 && totalM > 2000) { totalM = 2000; ageCapApplied = true; }
    // BEGINNER DISTANCE CAP: 3000m max — the distance slider's own `max`
    // attribute already enforces this at the UI level (see
    // applyLevelDistanceCap()), so this is defense-in-depth for any stored
    // preference that predates the cap, not the primary enforcement point.
    var beginnerCapApplied = false;
    if (state.level === 'beginner' && totalM > 3000) { totalM = 3000; beginnerCapApplied = true; }

    // Both rotators below are seeded from dayIndex() (not 0) so the weighted
    // Top-Stroke-favoring pattern keeps advancing across days instead of
    // resetting to "Top Stroke first" every single day — a session usually
    // only draws 1-3 picks per rotator, nowhere near enough within one day to
    // reach the pattern's extra Top-Stroke slot, so a daily reset was quietly
    // erasing the weighting for exactly the common case. The two rotators use
    // different offsets so they don't move in lockstep day to day.
    var strokeDayOffset = dayIndex();
    var nextStroke = makeStrokeRotator(state.disciplines, strokeDayOffset);
    // CLEAN SET ISOLATION: the Pre-Set and each Main Set block are each locked
    // to ONE stroke for the whole block, rather than letting nextStroke()
    // advance rep-to-rep inside a single set — a Fly set is 100% Fly, a Back
    // set is 100% Back. The block-level rotator advances once per block (not
    // once per rep), so with multiple disciplines selected the *blocks*
    // alternate strokes while each individual set stays on one clean stroke.
    // Individual Medley is the sole intentional multi-stroke exception (its
    // single "stroke" label already means the four-stroke IM order). Warm-Up
    // and Cool-Down keep the free-rotating nextStroke() — easy choice work
    // across strokes is standard there and isn't the "random mixing" the
    // isolation rule targets.
    var nextBlockStroke = makeStrokeRotator(state.disciplines, strokeDayOffset + 1);
    function fixedStrokeFn(strokeLabel) { return function () { return strokeLabel; }; }
    var disciplinesLabel = state.disciplines.map(strokeLabelSingle).join(' + ');
    // STRICT DISTANCE ACCURACY: Warm-Up and Pre-Set get their usual fixed
    // shares. Warm-Up moved from 10%→17% of totalM — real coaching practice
    // scales the warm-up to roughly 15-20% of session volume rather than a
    // flat 10%, so a 6km session genuinely gets a substantial ~1km warm-up,
    // not the same proportionally-thin one a 2km session gets. Main Set's
    // own nominal share (62%, down slightly from 65% to make room for the
    // bigger Warm-Up) is still the dominant share by a wide margin — active
    // recovery that used to live in the Cool-Down is carved OUT of the Main
    // Set's own budget (see EZ_RECOVERY_M below), never added on top of it,
    // so the grand total stays conserved by construction rather than by
    // luck. The Cool-Down's own size is deliberately NOT fixed here — it's
    // computed further down as whatever's actually left once Warm-Up/
    // Pre-Set/Main Set have rendered their real (rounded, stroke-capped)
    // meters, so it's the one block that absorbs every other stage's own
    // internal rounding drift and guarantees the finished workout lands
    // within ±50m of the swimmer's chosen distance regardless of how big
    // that distance is — this is what makes "ask for 5.0 km, get 5.0 km"
    // true by construction rather than by hoping several independently-
    // rounded blocks happen to add up.
    var warmupM = Math.round((totalM * 0.17) / 100) * 100 || 200;
    var presetM = Math.round((totalM * 0.13) / 100) * 100 || 200;
    var mainM = Math.max(200, Math.round((totalM * 0.62) / 100) * 100);
    var noScale = { intervalMult: 1, restAdd: 0 };
    // A real target time tightens the actual work — quality intervals aimed
    // at a specific clock, not just "more of the same." Warm-Up/Cool-Down
    // stay on noScale regardless (always easy, race goal or not); only the
    // Pre-Set, Main Set archetypes and the Elite Power block use this.
    // Multi-round archetypes (roundCountFor() picks 2-3 rounds per the
    // level's own minRounds/maxRounds) each carry their own per-round minimum
    // rep floor — fine on their own, but stacking 3 rounds' worth of "at
    // least one ~200m rep" floors on a smaller total distance is exactly what
    // buildToShare's post-hoc rep-scaling can't fully correct (it can shrink
    // reps within a round, never the round count itself). Capping rounds to 2
    // below 2500m gives the smallest sessions one fewer independent floor to
    // stack, without touching any archetype's own internal math.
    var smallTotalRoundCap = totalM < 2500 ? 2 : null;
    var workScaler = {
      intervalMult: raceGoalActive ? scaler.intervalMult * 0.95 : scaler.intervalMult,
      restAdd: raceGoalActive ? scaler.restAdd - 3 : scaler.restAdd,
      blocks: scaler.blocks,
      minRounds: smallTotalRoundCap ? Math.min(scaler.minRounds, smallTotalRoundCap) : scaler.minRounds,
      maxRounds: smallTotalRoundCap ? Math.min(scaler.maxRounds, smallTotalRoundCap) : scaler.maxRounds,
      note: scaler.note
    };

    // DYNAMIC STRUCTURAL BLUEPRINTING: the Warm-Up no longer always renders
    // the same fixed opener/drill/kick/build skeleton — a genuinely
    // different STRUCTURE (WARMUP_BLUEPRINTS, above) is picked, and that
    // blueprint's own build() decides how many blocks the Warm-Up has, what
    // order they're in, and how their rep/distance/rest relate to each other
    // — a pyramid, an IM-order kick/drill rotation, a broken no-stop pair, or
    // a long-swim-plus-ladder shape all look structurally nothing alike, not
    // just differently-labeled versions of the same three lines. The pick
    // itself comes from postCompletionRng (seeded from workoutGenSeed(),
    // reseeded at the top of this function) rather than per-click
    // Math.random() — this stays FIXED across every Generate click until the
    // swimmer completes a workout, then rotates. Every blueprint is still
    // run through buildToShare() against warmupM, so whichever one gets
    // picked still respects the swimmer's chosen distance exactly like every
    // other stage.
    var warmupBlueprint = dailyRotationPick(WARMUP_BLUEPRINTS, 1) || WARMUP_BLUEPRINTS[0];
    var warmupRounds = buildToShare(function () {
      return warmupBlueprint.build(warmupM, pace100, noScale, nextStroke, state.equipment);
    }, warmupM);

    // Pre-Set: always exactly one archetype — a short, purposeful bridge
    // between Warm-Up and the Main Set (see PRESET_ARCHETYPES above), the
    // second of this generator's four fixed stages. Drawn from
    // presetPoolForGoals(state.goals) — the sub-pool that actually PRIMES
    // whatever the Main Set is about to demand (CNS/explosive for a Sprint/
    // Power day, DPS/pacing for a Distance/Threshold day) — via the same
    // 6-hour rotation walk as the Warm-Up blueprint, so both stay fixed
    // together for the current 6-hour window, then both rotate together.
    var presetPool = presetPoolForGoals(state.goals);
    var presetArchetype = dailyRotationPick(presetPool, 2) || presetPool[0];
    // Pre-Set is locked to one stroke for the whole activation block.
    var presetStroke = nextBlockStroke();
    var preset = {
      name: presetArchetype.name,
      stroke: nextBlockStroke.current,
      focus: 'Activation',
      rounds: buildToShare(function () { return presetArchetype.build(presetM, pace100, workScaler, fixedStrokeFn(presetStroke)); }, presetM)
    };
    // HIGH-INTENSITY STRICTLY INSIDE MAIN SET: a couple of Pre-Set archetypes
    // (Speed-Build Activation, Start & Reaction Power) use short, fully-
    // recovered reps fast enough to tag '50 Pace' — which zoneFromPaceTag
    // would otherwise read as 'max', the same zone true Main Set race-effort
    // work carries. Full recovery between a handful of 15-25m reps is not the
    // same physiological demand as sustained max-effort Main Set work, so the
    // schema relabels it 'activation' — a distinct zone from 'max'/'racePace'
    // — without changing a single rep, distance, or pace number. 'max' and
    // 'racePace' now only ever appear inside a Main Set block.
    preset.rounds.forEach(function (r) {
      (r.sets || []).forEach(function (s) { if (s.zone === 'max') { s.zone = 'activation'; } });
    });

    // Multiple selected goals combine their archetype pools into one bigger
    // candidate set (deduplicated) rather than picking just one goal's pool —
    // Speed + Endurance together genuinely means more variety to draw from,
    // not an arbitrary tie-break.
    var pool = state.goals.reduce(function (acc, g) {
      ARCHETYPE_POOLS[g].forEach(function (a) { if (acc.indexOf(a) === -1) acc.push(a); });
      return acc;
    }, []);
    // DIFFICULTY SCALING: Beginner Main Sets stick to simpler, gentler
    // archetypes — the same drill-focused Technique pool (already
    // appropriate at any level), plus only the least demanding Speed/
    // Endurance archetypes (excluding explosive-turn work and all-out/
    // broken-threshold ladders, which ask for a level of pacing control a
    // beginner hasn't built yet). Competitive/Elite keep the full pool —
    // this only narrows the *choice* of archetype, never the pace/rest
    // scaling, which LEVEL_SCALERS below already handles separately.
    if (state.level === 'beginner') {
      var beginnerFiltered = pool.filter(function (a) { return BEGINNER_EXCLUDED_ARCHETYPES.indexOf(a.name) === -1; });
      if (beginnerFiltered.length) pool = beginnerFiltered;
    }
    // A Sprinter picking an Endurance-themed day (Aerobic/Distance,
    // Threshold, or the Rest day's own endurance-keyed pool) gets the same
    // short-rep, short-rest adaptation described above, not a straight
    // hand-off of the pool's own long-unbroken-swim archetypes. Only fires
    // when Endurance is actually one of the selected goals — a Sprinter on
    // a pure Speed or Technique day is completely unaffected — and only
    // ever narrows the pool, with the same empty-pool safety net every
    // other filter in this function already uses.
    if (state.swimmerType === 'sprinter' && state.goals.indexOf('endurance') > -1) {
      var sprinterFiltered = pool.filter(function (a) { return SPRINTER_ENDURANCE_EXCLUDED_ARCHETYPES.indexOf(a.name) === -1; });
      if (sprinterFiltered.length) pool = sprinterFiltered;
    }
    // DISTRIBUTE THE LOAD: a single archetype block absorbing 100% of a large
    // Main Set share is exactly what produced the "one monolithic 36x25m
    // block" problem — every archetype's own round-count is capped (2-3
    // rounds, see LEVEL_SCALERS), so concentrating a big volume into just one
    // block leaves each of those few rounds with an outsized share, which
    // read as one intimidating repeated line even after the rep-chunking
    // above. A real coach's whiteboard splits real volume across multiple
    // distinct Main Set blocks instead — "MAIN SET 1" then "MAIN SET 2" (or
    // effectively a POST-SET before Cool-Down) — each its own archetype, its
    // own pacing philosophy, and (since pickN never repeats an archetype)
    // its own genuine cognitive shift from the one before it. mainBlockCount
    // scales with the swimmer's own chosen totalM: 1 below 3.0km (no reason
    // to split a short session), 2 from 3.0km up, 3 from 5.5km up. Elite
    // Power content (below) still folds into main[0] specifically — the
    // highest-CNS-demand work leads whichever block renders first — never
    // its own separate section, exactly as before this change.
    var mainBlockCount = totalM >= 5500 ? 3 : totalM >= 3000 ? 2 : 1;
    var chosenArchetypes = pickN(pool, mainBlockCount);
    if (pool.length > 1) {
      var priorFirstMainArchetype = pickOneFrom(priorBucketRng, pool);
      if (chosenArchetypes[0] === priorFirstMainArchetype) {
        var altMainPool = pool.filter(function (a) { return a !== priorFirstMainArchetype; });
        var replacementMain = pickOne(altMainPool);
        if (chosenArchetypes.indexOf(replacementMain) === -1) {
          chosenArchetypes[0] = replacementMain;
        }
      }
    }
    // ELITE INTENSITY GUARANTEE: an Elite swimmer's Main Set is guaranteed to
    // draw from one of the pool's genuinely most demanding structures —
    // broken swims, VO2/lactate ladders, race-pace holds, hypoxic or
    // heart-rate-zone work — rather than leaving it purely to chance which
    // archetype the 6-hour rotation happens to land on. Same "guarantee it's
    // present" principle swimmerType bias and the race-goal band below
    // already use; this just raises the floor for the level whose whole
    // point is training at the absolute limit.
    var ELITE_INTENSITY_ARCHETYPE_NAMES = [
      'Lactate — Sprint Ladder', 'VO2 Max — Power Ladder', 'Broken — Race-Pace 100s',
      'Speed Endurance — Race-Pace Band', 'VO2 Max — Heart-Rate Zone Ladder',
      'Threshold — Broken Swim', 'Threshold — Hypoxic Breath Ladder', 'Low Aero — Distance Ladder'
    ];
    if (state.level === 'elite' && chosenArchetypes.length) {
      var alreadyElite = chosenArchetypes.some(function (a) { return ELITE_INTENSITY_ARCHETYPE_NAMES.indexOf(a.name) > -1; });
      if (!alreadyElite) {
        var eliteCandidates = pool.filter(function (a) { return ELITE_INTENSITY_ARCHETYPE_NAMES.indexOf(a.name) > -1; });
        if (eliteCandidates.length) chosenArchetypes[chosenArchetypes.length - 1] = pickOne(eliteCandidates);
      }
    }
    // SWIMMER TYPE BIAS: a Sprinter or Distance swimmer gets that emphasis
    // guaranteed in the Main Set every single day, not just on days already
    // themed toward it (and not just when a race goal Target Time is set) —
    // the same "guarantee it's present" principle the Elite Power block
    // already uses for elite level. This is what makes the Weekly Schedule
    // genuinely dynamic per swimmer type rather than copy-only: a Sprinter's
    // Tuesday "Aerobic/Distance" day still gets one real speed-archetype set
    // woven in, and vice versa for a Distance swimmer's Monday "Sprint/Power"
    // day. 'Both' applies no bias.
    if (state.swimmerType !== 'both' && chosenArchetypes.length) {
      var biasPool = state.swimmerType === 'sprinter' ? SPEED_ARCHETYPES : ENDURANCE_ARCHETYPES;
      var alreadyBiased = chosenArchetypes.some(function (a) { return biasPool.indexOf(a) > -1; });
      if (!alreadyBiased) chosenArchetypes[chosenArchetypes.length - 1] = pickOne(biasPool);
    }
    // RACE-PACE BAND GUARANTEE: a real Target Time (Race Goal) should
    // visibly change WHAT gets generated, not just quietly tighten the pace/
    // rest numbers inside whichever archetype the daily rotation happened to
    // pick. Same "guarantee it's present" principle already used for
    // swimmerType bias and the Elite Power block above — only fires when
    // Speed is actually one of the selected goals (so the archetype's own
    // pool is genuinely in play) and only ever swaps in a candidate already
    // available in `pool`, never bypassing the beginner/sprinter filters
    // applied to it above.
    if (raceGoalActive && state.goals.indexOf('speed') > -1 && chosenArchetypes.length) {
      var raceBandArchetype = pool.filter(function (a) { return a.name === 'Speed Endurance — Race-Pace Band'; })[0];
      if (raceBandArchetype && chosenArchetypes.indexOf(raceBandArchetype) === -1) {
        chosenArchetypes[chosenArchetypes.length - 1] = raceBandArchetype;
      }
    }
    // ELITE ONLY, AND ONLY ON A SPRINT-ORIENTED SESSION: the Elite Power block
    // used to fire for every elite-level swimmer every single day regardless
    // of focus — genuinely too much explosive/high-CNS volume stacked onto an
    // Aerobic, Technique, or Threshold day, which is meant to be about
    // something else entirely. It's now gated behind `speed` actually being
    // one of the selected Fitness Goals — true whenever the Weekly Schedule's
    // own Sprint/Power or Race Pace days auto-select it, AND whenever a
    // swimmer manually picks Speed themselves ("requested"), so it still
    // fires exactly on the sessions it's meant for, just never as a blanket
    // daily fixture. eliteBlockM stays 0 (no block, no reserved budget) on
    // every other elite-level day.
    var eliteBlockWanted = state.level === 'elite' && state.goals.indexOf('speed') > -1;
    // The Elite Power block's own budget is reserved out of the SAME mainM
    // pool the regular archetype blocks split, rather than being fixed-size
    // volume added on top of it — previously an elite swimmer's actual total
    // silently overshot their chosen distance by however big that block was,
    // regardless of how small a total they picked. Reserving ~22% of mainM
    // for it (floor 300m) before splitting the remainder among the regular
    // blocks keeps the whole Main Set inside its own already-budgeted meters.
    var eliteBlockM = eliteBlockWanted ? Math.max(300, Math.round((mainM * 0.22) / 50) * 50) : 0;
    var regularMainM = Math.max(200, mainM - eliteBlockM);
    var share = 1 / chosenArchetypes.length;
    // TECHNIQUE & SPRINT HYBRID: a swimmer who selects ONLY Technique (no
    // Speed) previously got zero sprint stimulus at all — every Main Set
    // block drawn purely from TECHNIQUE_ARCHETYPES. Rather than heavy sprint
    // volume (which would defeat the point of a technique-focused day), the
    // first Technique-archetype block gets one small, clearly-labeled
    // high-tempo set appended — "just 1 short high-tempo set" per the
    // explicit ask — carved OUT of that block's own share (never added on
    // top of it, so strict distance accuracy holds exactly as before).
    // Skipped entirely when Speed is also selected, since real sprint volume
    // already exists elsewhere in that session and a second small bridge
    // would just be redundant.
    var wantsTechniqueSprintBridge = state.goals.indexOf('technique') > -1 && state.goals.indexOf('speed') === -1;
    var addedTechniqueSprintBridge = false;
    var TECH_SPRINT_BRIDGE_M = 100;
    var main = chosenArchetypes.map(function (archetype) {
      var shareM = Math.round((regularMainM * share) / 100) * 100 || 100;
      // Each Main Set block is locked to a single stroke (rotating across
      // blocks), so a 3-block session for a Free+Fly+Back swimmer reads as
      // one clean Free block, one clean Fly block, one clean Back block —
      // never three strokes randomly blended inside one set.
      var blockStroke = nextBlockStroke();
      var isRecoveryCarveArchetype = SPEED_ARCHETYPES.indexOf(archetype) > -1;
      var addSprintBridgeHere = wantsTechniqueSprintBridge && !addedTechniqueSprintBridge && TECHNIQUE_ARCHETYPES.indexOf(archetype) > -1;
      // INTEGRATED ACTIVE RECOVERY: every SPEED_ARCHETYPES block is genuine
      // sprint/power work — rather than only flushing lactate at the very end
      // via the Cool-Down, a short EZ recovery set is appended directly inside
      // the block itself, right after the hard rounds. EZ_RECOVERY_M is
      // carved OUT of this block's own share (not added on top of it) so the
      // block's rendered total stays at shareM, keeping the Main Set's grand
      // total exactly conserved. The Technique-to-Speed bridge set below uses
      // the identical carve-not-add principle.
      var contentShareM = isRecoveryCarveArchetype ? Math.max(150, shareM - EZ_RECOVERY_M)
        : addSprintBridgeHere ? Math.max(150, shareM - TECH_SPRINT_BRIDGE_M)
        : shareM;
      var rounds = buildToShare(function () { return archetype.build(contentShareM, pace100, workScaler, fixedStrokeFn(blockStroke), state.equipment, totalM); }, contentShareM);
      if (isRecoveryCarveArchetype) {
        rounds = rounds.concat([ezRecoverySet(pace100)]);
      }
      if (addSprintBridgeHere) {
        var bridgeLadder = paceLadder(pace100);
        var bridgeReps = Math.max(2, Math.round(TECH_SPRINT_BRIDGE_M / 25));
        rounds = rounds.concat([{ label: 'Technique-to-Speed Bridge', sets: [buildSet(bridgeReps, 25, blockStroke + ' high-tempo burst, same technique', [], bridgeLadder.p50, 20, workScaler, '50 Pace')] }]);
        addedTechniqueSprintBridge = true;
      }
      return {
        name: archetype.name,
        stroke: blockStroke,
        strokeFull: nextBlockStroke.current,
        focus: focusFromArchetypeName(archetype.name),
        rounds: rounds
      };
    });

    // ELITE ONLY: fold a dedicated high-performance power segment into the
    // SAME single Main Set block (prepended to its rounds), not rendered as
    // its own separate "Main Set" section — this is what makes the elite
    // level a genuine step up rather than just more distance, without
    // reintroducing a second main-set-looking block. Explosive max-effort
    // underwater dolphin, race-start reaction power, and power breakouts,
    // all under the elite scaler's tight intervals, lead the block's own
    // rounds (rendered first) so the highest-CNS-demand work is done while
    // freshest, then the archetype's own rounds continue right after. Labels
    // deliberately don't start with a capped stroke name (Back/Breast/Fly),
    // so the 200m realism cap never touches these short power reps. Rep
    // counts scale with eliteBlockM (see above) — proportional to the
    // swimmer's own chosen distance like every other stage — and its own EZ
    // recovery set is carved from the same reserved budget rather than added
    // on top of it.
    if (eliteBlockWanted && main.length) {
      var eliteContentM = Math.max(200, eliteBlockM - EZ_RECOVERY_M);
      var eliteLadder = paceLadder(pace100);
      var eliteFins = state.equipment.indexOf('Fins') > -1;
      var eliteShares = splitProportional(eliteContentM, [0.4, 0.35, 0.25]);
      var uwReps = Math.max(4, Math.round(eliteShares[0] / 25));
      var startReps = Math.max(4, Math.round(eliteShares[1] / 25));
      var breakoutReps = Math.max(2, Math.round(eliteShares[2] / 50));
      var elitePowerRounds = buildToShare(function () {
        return [
          { label: 'UWK Speed', sets: [buildSet(uwReps, 25, 'Max 15m UWK off wall, rocket streamline', eliteFins ? ['Fins'] : [], eliteLadder.p50, 15, workScaler, '50 Pace')] },
          { label: 'OTB Reaction Power', sets: [buildSet(startReps, 25, 'OTB explosive, max first 3 strokes', [], eliteLadder.p50, 25, workScaler, '50 Pace')] },
          { label: 'Power Breakouts', sets: [buildSet(breakoutReps, 50, 'Fast turn, powerful UWK breakout', [], eliteLadder.p100, 20, workScaler, '100 Pace')] }
        ];
      }, eliteContentM);
      // Same integrated active-recovery principle as the Main Set's own
      // SPEED_ARCHETYPES blocks — this is the highest-intensity segment in
      // the whole session, so it gets the EZ flush too, right before the
      // archetype's own rounds pick back up.
      elitePowerRounds.push(ezRecoverySet(pace100));
      main[0].rounds = elitePowerRounds.concat(main[0].rounds);
    }

    // STRICT DISTANCE ACCURACY, part 2: the Cool-Down's size is whatever's
    // actually left once Warm-Up/Pre-Set/Main Set have rendered their real
    // meters (reps × dist, after every archetype's own stroke-cap/rounding
    // has already applied) — not a second independent percentage of totalM.
    // This is what actually GUARANTEES the ±50m tolerance rather than hoping
    // several independently-rounded blocks happen to add up.
    var actualWarmupM = sumRoundsMeters(warmupRounds);
    var actualPresetM = sumRoundsMeters(preset.rounds);
    var actualMainM = main.reduce(function (sum, block) { return sum + sumRoundsMeters(block.rounds); }, 0);
    var cooldownBudgetM = Math.max(150, totalM - actualWarmupM - actualPresetM - actualMainM);
    var cdParts = splitProportional(cooldownBudgetM, [0.5, 0.3, 0.2]);
    var cdStroke1 = nextStroke();
    var cdStroke1Full = nextStroke.current;
    var cdSet0 = buildSet(1, cdParts[0], cdStroke1 + ' EZ, long-axis rotation', [], pace100 + 20, 10, noScale, 'Recovery Pace');
    cdSet0.stroke = cdStroke1Full;
    var cdSet1 = buildSet(1, cdParts[1], 'BK EZ, loosen shoulders', [], pace100 + 24, 10, noScale, 'Recovery Pace');
    cdSet1.stroke = 'Backstroke';
    var cdSet2 = buildSet(1, cdParts[2], 'EZ Kick, settle HR', [], pace100 + 28, 10, noScale, 'Recovery Pace');
    // Generic kick line — no single stroke identity, stroke stays null.
    var cooldown = [cdSet0, cdSet1, cdSet2];
    // Final reconciliation nudge: splitProportional's own 50m-snapping across
    // 3 parts can leave a small residual even against an exact budget —
    // absorb it into the largest, most flexible cool-down swim (a plain
    // continuous easy swim takes any clean distance gracefully) so the
    // GRAND total always lands within ±50m of the swimmer's chosen distance.
    var grandTotalM = actualWarmupM + actualPresetM + actualMainM + sumSetsMeters(cooldown);
    var totalResidualM = totalM - grandTotalM;
    if (Math.abs(totalResidualM) > 50) {
      var adjustedCd0 = Math.max(50, Math.round((cdParts[0] + totalResidualM) / 50) * 50);
      cooldown[0] = buildSet(1, adjustedCd0, cdStroke1 + ' EZ, long-axis rotation', [], pace100 + 20, 10, noScale, 'Recovery Pace');
      cooldown[0].stroke = cdStroke1Full;
      grandTotalM = actualWarmupM + actualPresetM + actualMainM + sumSetsMeters(cooldown);
    }

    // STRUCTURED SCHEMA (swiML-inspired): a clean, typed JSON mirror of the
    // whole generated workout — segments (Warm-Up/Pre-Set/Main Set/Cool-Down)
    // -> groups (rounds/blocks) -> instructions (individual sets), each set
    // carrying real typed fields (stroke, zone, equipment, rest/interval in
    // seconds) rather than only a single display-text title. This is purely
    // additive — every existing field/renderer above is untouched — and lets
    // any future consumer (an export, an API, a different UI) read the
    // workout as data instead of re-parsing display strings.
    function instructionFromSet(s) {
      return {
        reps: s.reps, distanceM: s.dist, stroke: s.stroke || null, zone: s.zone,
        equipment: s.equipment, intervalSec: s.interval, restSec: s.rest,
        totalSec: s.totalSec, paceTag: s.paceTag, label: s.title
      };
    }
    function groupFromRound(r) {
      return { name: r.label || null, instructions: (r.sets || []).map(instructionFromSet) };
    }
    function structuredWorkout() {
      return {
        generatedAt: new Date().toISOString(),
        totalDistanceM: grandTotalM,
        targetDistanceM: totalM,
        disciplines: state.disciplines.slice(),
        goals: state.goals.slice(),
        level: state.level,
        segments: [
          { name: 'Warm-Up', focus: warmupBlueprint.name, stroke: null, groups: warmupRounds.map(groupFromRound) },
          { name: 'Pre-Set', focus: preset.focus, stroke: preset.stroke, groups: preset.rounds.map(groupFromRound) },
          // Main Set nests one level deeper than the other stages — each
          // archetype block has its own name/focus/stroke and its own set of
          // rounds (each round itself a group of instructions), since a
          // session can combine several distinct blocks in one Main Set.
          { name: 'Main Set', focus: null, stroke: null, groups: main.map(function (block) {
            return { name: block.name, focus: block.focus, stroke: block.strokeFull, rounds: block.rounds.map(groupFromRound) };
          }) },
          { name: 'Cool-Down', focus: null, stroke: null, groups: [groupFromRound({ label: null, sets: cooldown })] }
        ]
      };
    }
    window.__lastGeneratedWorkoutStructured = structuredWorkout();

    var html = renderBlock('W-UP', warmupRounds, false, 'warmup') +
      renderBlock('Pre-Set — ' + preset.name, preset.rounds, false, 'preset') +
      main.map(function (block, i) { return renderBlock('Main Set — ' + block.name, block.rounds, i === 0, 'main'); }).join('') +
      renderBlock('WD', [{ label: null, sets: cooldown }], false, 'cooldown');

    var scalerNoteHtml = '<p style="color:var(--muted); font-size:0.82rem; margin-bottom:4px;">' +
      '<strong style="color:var(--fg)">Coach’s Plan — Today’s Set:</strong> ' + disciplinesLabel + ' · ' + formatDistanceM(totalM, 1) + (totalM >= 6000 ? '+' : '') + ' · ' +
      state.goals.map(function (k) { return GOALS.find(function (g) { return g.key === k; }).label; }).join(' + ') + ' focus · ' + state.level + ' level. ' + scaler.note +
      (state.disciplines.length > 1 ? ' Strokes alternate set-to-set across your selected disciplines.' : '') +
      ' This exact set structure holds for the next 6 hours and rotates automatically after that.' + '</p>';

    scalerNoteHtml += '<p style="color:var(--aqua); font-size:0.78rem; margin-bottom:4px;">' +
      (personalPace != null
        ? 'Pace personalized from your ' + pbDistanceM + 'm ' + strokeLabelSingle(state.disciplines[0]) + ' PB (' + formatTime(pbTimeSec) + ').'
        : 'Add a Personal Best above for pacing calculated from your own times.') +
      (ageCapApplied ? ' Volume capped at 2000m — age-appropriate load for an 11-and-under swimmer.' : '') +
      (restDayCapApplied ? ' Volume capped at 1.2 km — today is a scheduled Rest / Active Recovery day, so this intentionally ignores your Target Distance slider.' : '') +
      (beginnerCapApplied ? ' Volume capped at 3 km — Beginner level’s maximum session distance.' : '') +
      (freeLevelDowngraded ? ' Competitive/Elite level requires All-Access Pro — generated at Beginner instead.' : '') + '</p>';

    // Weekly Periodization + Race Goal transparency lines — directly visible
    // confirmation that both features are actually shaping today's set, not
    // silent background logic. The blurb itself now depends on Swimmer Type
    // (see focusBlurbFor()), so the same day reads differently for a
    // Sprinter vs a Distance swimmer vs Both.
    scalerNoteHtml += '<p style="color:var(--green-bright); font-size:0.78rem; margin-bottom:4px;">' +
      icon('i-target') + ' Weekly Schedule — <strong>' + focusToday.label + '</strong>: ' + focusBlurbFor(focusToday, state.swimmerType) + '</p>';
    if (raceGoalActive) {
      scalerNoteHtml += '<p style="color:var(--gold); font-size:0.78rem; margin-bottom:4px;">' +
        icon('i-trophy') + ' Racing toward a ' + formatTime(raceGoalTargetSec) + ' ' + pbDistanceM + 'm ' + strokeLabelSingle(state.disciplines[0]) +
        ' — pace and intervals tightened toward that target' + (state.swimmerType !== 'both' ? ' (' + (state.swimmerType === 'sprinter' ? 'Sprinter' : 'Distance') + ' emphasis)' : '') + '.</p>';
    }
    // STRICT DISTANCE ACCURACY confirmation — the whole point of the
    // Cool-Down-as-reconciliation-buffer rewrite above is that this line
    // should always read as an exact (or ±50m) match, never a silent drift.
    scalerNoteHtml += '<p style="color:var(--muted-2); font-size:0.72rem; margin-bottom:12px;">' +
      'Total: ' + formatDistanceM(grandTotalM, 1) + ' (target ' + formatDistanceM(totalM, 1) + ')' +
      (Math.abs(grandTotalM - totalM) <= 50 ? '' : ' — within realistic rounding for this combination of picks') + '.</p>';

    html += renderCoachTips();

    html += '<button type="button" class="btn btn-primary btn-complete-workout" id="completeWorkoutBtn" data-total-m="' + totalM + '">' +
      icon('i-check') + ' Complete Workout — Log ' + formatDistanceM(totalM, 1) + '</button>';

    document.getElementById('workoutResult').innerHTML = scalerNoteHtml + html;
    document.getElementById('workoutResult').querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.preventDefault(); switchTab(btn.dataset.tab); });
    });
    var pdfBtn = document.getElementById('workoutPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
    // Live Split-Screen Workout Mode (js/custom-workout.js) reuses this
    // already-rendered result panel via window.__extractStructuredWorkout —
    // just unhide the static button here, same as the PDF button above;
    // its click handler is wired entirely from custom-workout.js.
    var liveBtn = document.getElementById('workoutLiveModeBtn');
    if (liveBtn) liveBtn.style.display = '';
    // SAVE TO MY WORKOUTS: unhide + reset to its default state on every
    // fresh Generate (a previously "✓ Saved" state must never bleed into a
    // newly-generated, not-yet-saved workout). The smart-name components
    // (primary discipline, primary goal, distance in km) are stashed as data
    // attributes here — where state/totalM are already in scope — so the
    // click handler below (wired once, at load) doesn't need its own
    // reference into this closure.
    var saveStudioBtn = document.getElementById('workoutSaveStudioBtn');
    if (saveStudioBtn) {
      saveStudioBtn.style.display = '';
      saveStudioBtn.disabled = false;
      saveStudioBtn.classList.remove('btn-workout-logged');
      saveStudioBtn.innerHTML = icon('i-save') + ' Save to My Workouts';
      var goalLabelMap = { speed: 'Sprint', endurance: 'Endurance', technique: 'Technique' };
      var primaryGoalLabel = goalLabelMap[state.goals[0]] || 'Training';
      saveStudioBtn.dataset.smartName = 'AI ' + strokeLabelSingle(state.disciplines[0]) + ' ' + primaryGoalLabel +
        ' - ' + (grandTotalM / 1000).toFixed(1) + 'km';
    }
  }

  document.getElementById('generateBtn').addEventListener('click', generateWorkout);
  // Exposed so js/paddle-client.js (extracted out of this shared script) can
  // re-render the just-generated workout the instant an access-level change
  // resolves (e.g. a subscription completing mid-session), matching the
  // pre-existing window.renderCoachPageGate bridge used the same way below.
  window.generateWorkout = generateWorkout;
  document.getElementById('generateBtn').addEventListener('click', function () {
    var btn = this;
    btn.classList.remove('btn-pulse');
    void btn.offsetWidth; // restart the animation even on rapid re-clicks
    btn.classList.add('btn-pulse');
    setTimeout(function () { btn.classList.remove('btn-pulse'); }, 550);
  });

  // "Complete Workout" replaces the earlier per-set completion checkboxes —
  // swimmers don't want to click through a dozen+ individual boxes mid-set.
  // One press logs the whole session's total target distance straight into
  // the Distance Tracker (swim_logs) via the same bridge the Tracker's own
  // manual log form uses — no new Firestore collection or Cloud Function
  // needed. The button carries its own state (disabled + "Logged" once
  // clicked) since re-clicking would double-log the same session; a fresh
  // Generate re-enables it for the next one. A swimfit:swimlogchange event
  // tells an already-open Tracker tab to re-fetch immediately, since its own
  // load-once-per-session guard would otherwise miss this new entry.
  // bumpWorkoutGenSeed() also fires here — this is the ONLY place the
  // Warm-Up blueprint/Pre-Set archetype's rotation seed ever advances, per
  // the "changes when you actually finish a workout, not on a clock" ask.
  document.getElementById('workoutResult').addEventListener('click', function (e) {
    var btn = e.target.closest('#completeWorkoutBtn');
    if (!btn) return;
    var totalM = parseInt(btn.dataset.totalM, 10);
    if (!totalM) return;
    if (!window.__firebaseUser || typeof window.__swimLogAdd !== 'function') return;
    btn.disabled = true;
    var originalHtml = btn.innerHTML;
    window.__swimLogAdd({ distanceMeters: totalM, loggedAt: new Date(), discipline: strokeLabelSingle(state.disciplines[0]) })
      .then(function () {
        btn.innerHTML = icon('i-check') + ' Logged To Tracker — ' + formatDistanceM(totalM, 1);
        btn.classList.add('btn-workout-logged');
        bumpWorkoutGenSeed();
        document.dispatchEvent(new CustomEvent('swimfit:swimlogchange'));
      })
      .catch(function () {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        alert('Could not log this workout — please check your connection and try again.');
      });
  });

  // SAVE TO MY WORKOUTS: bridges a generated AI workout into the Custom
  // Workout Builder's own custom_workouts/{uid}/entries/{id} library —
  // js/custom-workout.js's flattenGeneratedWorkout() already established
  // exactly this pattern for Live Mode (read window.__extractStructuredWorkout
  // off the already-rendered #workoutResult DOM, the same DOM the PDF export
  // reads, so this can never drift from what the swimmer is looking at —
  // never window.__lastGeneratedWorkoutStructured, the richer internal JSON,
  // which wouldn't reflect the on-screen rep-chunking labels). This mirrors
  // that same regex parse ("N x Dist" -> reps/distance, first comma-segment
  // -> stroke) but targets the Builder's own {label, sets:[{kind,reps,
  // distance,stroke,intervalSec,restSec,note}]} block shape instead of a
  // flat Live-Mode step list — see firestore.rules' custom_workouts comment
  // for the exact expected doc shape.
  var STROKE_ABBR_MAP = { BK: 'Backstroke', FR: 'Freestyle', FLY: 'Butterfly', BR: 'Breaststroke', IM: 'Individual Medley', EZ: 'Freestyle' };
  function normalizeStrokeForBuilder(raw) {
    var first = (raw || '').split(/[\s,]+/)[0].toUpperCase();
    if (STROKE_ABBR_MAP[first]) return STROKE_ABBR_MAP[first];
    var full = ['Freestyle', 'Backstroke', 'Breaststroke', 'Butterfly', 'Individual Medley', 'Kick', 'Drill'];
    for (var i = 0; i < full.length; i++) {
      if ((raw || '').toLowerCase().indexOf(full[i].toLowerCase()) === 0) return full[i];
    }
    return 'Mixed';
  }
  function convertGeneratedWorkoutToBuilderBlocks() {
    if (typeof window.__extractStructuredWorkout !== 'function') return null;
    var resultEl = document.getElementById('workoutResult');
    if (!resultEl) return null;
    var data = window.__extractStructuredWorkout(resultEl);
    if (!data || !data.blocks || !data.blocks.length) return null;
    var blocks = data.blocks.map(function (block) {
      var sets = (block.rows || []).map(function (row) {
        var m = row.label.match(/^(\d+)\s*[×x]\s*(\d+)m\s*(.*)$/i);
        var reps = m ? Math.max(1, Math.min(99, parseInt(m[1], 10))) : 1;
        var distance = m ? Math.max(1, Math.min(10000, parseInt(m[2], 10))) : 0;
        var descText = m ? m[3] : row.label;
        var intervalSec = row.interval ? ((typeof parseTimeToSeconds === 'function' ? parseTimeToSeconds(row.interval) : 0) || 0) : 0;
        return {
          kind: 'set', reps: reps, distance: distance, stroke: normalizeStrokeForBuilder(descText),
          intervalSec: intervalSec, restSec: 0,
          note: ((row.round ? row.round + ' — ' : '') + descText).trim().slice(0, 60)
        };
      });
      return { label: block.title || 'Set', sets: sets };
    }).filter(function (b) { return b.sets.length; });
    return blocks.length ? blocks : null;
  }
  var saveStudioBtnEl = document.getElementById('workoutSaveStudioBtn');
  if (saveStudioBtnEl) saveStudioBtnEl.addEventListener('click', function () {
    var btn = saveStudioBtnEl;
    if (!window.__firebaseUser || typeof window.__customWorkoutCreate !== 'function' || typeof window.__customWorkoutsList !== 'function') {
      alert('Sign in to save workouts to your profile.');
      return;
    }
    var blocks = convertGeneratedWorkoutToBuilderBlocks();
    if (!blocks) { alert('Generate a workout first.'); return; }
    var uid = window.__firebaseUser.uid;
    var name = btn.dataset.smartName || 'AI Generated Workout';
    var originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = icon('i-save') + ' Saving…';
    // Same Free-tier cap the Custom Workout Builder itself enforces
    // (FREE_SAVED_WORKOUT_CAP in js/custom-workout.js) — read fresh via
    // __customWorkoutsList rather than reaching into that file's own
    // closure-local count, so this stays correct independent of whether the
    // Builder has ever been opened this session.
    window.__customWorkoutsList(uid).then(function (existing) {
      var hasFullAccess = typeof window.__hasFullAccess === 'function' && window.__hasFullAccess();
      if (!hasFullAccess && existing && existing.length >= 2) {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        alert('Free plan is limited to 2 saved workouts — upgrade to All-Access Pro for unlimited.');
        return;
      }
      return window.__customWorkoutCreate(uid, name, blocks).then(function () {
        btn.innerHTML = icon('i-check') + ' Saved to Studio';
        btn.classList.add('btn-workout-logged');
      });
    }).catch(function () {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      alert('Could not save this workout — please check your connection and try again.');
    });
  });

  /* ============================= GYM FOCUS SELECTOR ============================= */
  // Every focus is a full daily routine matrix across four phases —
  // Warm-Up, Core Activation, Main Power/Strength Lifts, and
  // Cool-Down/Mobility — not just a flat list of exercises.
  /* ============================= DRYLAND EXERCISE DATABASE =============================
     A ground-up rewrite around ELITE SWIMMER-SPECIFIC dryland programming,
     replacing the generic commercial-gym content this matrix used to carry
     (Jumping Jacks, Arm Circles, plain Bench Press, Battle Ropes as filler).
     Three rules govern every row below:

     1) SPECIFICITY. Every main-block movement earns its place by mapping onto
        a real phase of swimming — the catch (Banded Catch & Pull, Straight-Arm
        Pulldowns), the pull-through (Lat Pulldowns, Ring/TRX Rows, Weighted
        Pull-Ups), body rotation (Rotational Med Ball Throws, Cable Woodchoppers,
        Landmine Rotations), the start/turn wall push-off (Explosive Streamline
        Jumps, Box Jumps, Depth Jumps, Trap Bar Jumps), or the kick (Romanian
        Deadlifts, Standing Calf Raises, Hamstring Curls).

     2) PRE-HAB FIRST. Warm-ups are swimmer prehab, not generic gym warm-ups:
        thoracic-spine open-ups, scapular control (Scapular Push-Ups, Y-T-W-L
        Raises, Band Pull-Aparts), rotator-cuff work, and ankle mobility — the
        three joints (shoulder, t-spine, ankle) whose range actually limits a
        streamline, a catch, and a dolphin kick.

     3) EVERY CUE EXPLAINS THE TRANSFER. `cue` never describes the muscle
        worked; it names the specific swimming outcome the movement buys —
        "faster flip turns", "a higher elbow catch", "a streamline that doesn't
        collapse at 15m" — so a swimmer always knows why a movement is in
        their program.

     Shape is unchanged and load-bearing: renderGym() reads warmup/core/main/
     cooldown arrays per focus, with `full` nesting main one level deep by
     gymOrientation() and `plyometrics` two levels deep by orientation THEN
     state.level. `loadPct`/`weighted` drive the suggested-load line in
     renderGymCard(). Any new exercise name also needs a GYM_ANIM_MAP row
     below, or it falls back to the generic stick figure. */
  var GYM_FOCUS = {
    cardio: {
      warmup: [
        { name: 'Band Pull-Aparts', prescription: '2 x 15', cue: 'Squeeze the shoulder blades together, arms straight — switches on the mid-back that holds your posture together once the heart rate climbs and the stroke starts to fall apart.' },
        { name: 'Scapular Push-Ups', prescription: '2 x 12', cue: 'Arms locked, move only the shoulder blades — teaches the scapular control that keeps your catch anchored instead of shrugging when you get tired.' },
        { name: 'Explosive Streamline Jumps', prescription: '2 x 8', cue: 'Hands locked overhead in a tight streamline the whole rep — the dryland rehearsal of the position you leave every wall in.' }
      ],
      core: [
        { name: 'Hollow Body Hold', prescription: '3 x 30s', cue: 'The exact braced, hips-tucked shape you hold off every wall — a streamline that holds this line travels further on the same push.' },
        { name: 'Pallof Press', prescription: '3 x 12 / side', cue: 'Resist the cable pulling you into rotation — anti-rotation strength is what stops your hips fishtailing when your arms are working hard.' },
        { name: 'Med Ball Russian Twists', prescription: '3 x 20 / side', cue: 'Rotate from the ribs, not the arms — the trunk control that keeps you tracking straight down the lane under fatigue.' }
      ],
      main: [
        { name: 'Rowing Machine Sprints', prescription: '6 x 250m', cue: 'Legs-body-arms in that order, exactly like a pull: catch with the legs, connect through the trunk, finish with the arms. The closest dryland match to a swim stroke\'s power sequence.' },
        { name: 'VersaClimber / Ski Erg Intervals', prescription: '5 x 60s', cue: 'Overhead pulling under a redlined heart rate — builds the specific lat endurance that fails first in the back half of a 200.' },
        { name: 'Burpee to Streamline Jump', prescription: '4 x 10', cue: 'Finish every rep locked overhead in a streamline — trains you to hold race position when your heart rate is already at its ceiling.' },
        { name: 'Rotational Med Ball Throws', prescription: '4 x 10 / side', cue: 'Throw hard from the hip, not the shoulder — rotational power under a raised heart rate, the same torque a fast turn asks for on the last 50.' },
        { name: 'Bike Sprints (Seated)', prescription: '8 x 20s', cue: 'Pure leg-drive conditioning with zero shoulder cost — lets you build an aerobic base on a day your shoulders already have heavy stroke volume.' }
      ],
      cooldown: [
        { name: 'Thoracic Rotation Stretch (Open Book)', prescription: '2 x 30s / side', cue: 'Hips stacked, chest rotates open — restores the rotational range your breathing side loses over a hard session.' },
        { name: 'Lat Stretch', prescription: '2 x 30s / side', cue: 'Opens the lats after sustained overhead pulling so your streamline still reaches full length tomorrow.' },
        { name: 'Deep Breathing Walk', prescription: '3–5 min', cue: 'Slow nasal breathing walks the heart rate down and starts clearing the session\'s fatigue before you leave the room.' }
      ]
    },
    full: {
      warmup: [
        { name: 'Band Pull-Aparts', prescription: '2 x 15', cue: 'Wakes up the mid-back and rear delts that hold your shoulders in a safe position under every pull to come.' },
        { name: 'Band External Rotations (Rotator Cuff)', prescription: '2 x 15 / side', cue: 'Elbow pinned to your side, rotate only the forearm — the single most protective prehab there is for a shoulder taking swimming\'s stroke volume.' },
        { name: 'Thoracic Spine Open-Ups', prescription: '2 x 8 / side', cue: 'Rotate the upper back, not the lower — a stiff t-spine forces your shoulder to find rotation it wasn\'t built for, which is where swimmer\'s shoulder starts.' },
        { name: 'Ankle Mobility Rocks (Wall)', prescription: '2 x 10 / side', cue: 'Knee drives over the toes, heel glued down — a locked ankle blunts your dolphin kick and shortens your push-off. This buys back both.' }
      ],
      core: [
        { name: 'Pallof Press', prescription: '3 x 12 / side', cue: 'Anti-rotation strength — the ability to resist twist is what lets you rotate on purpose and hold the line under load.' },
        { name: 'Hollow Body Hold', prescription: '3 x 30s', cue: 'The same braced position you hold in a streamline off every wall — the difference between gliding to 12m and gliding to 15m.' },
        { name: 'Landmine Rotations', prescription: '3 x 10 / side', cue: 'Drive the bar across with hips and ribs, arms along for the ride — heavy loaded rotation, the trunk torque behind a powerful pull and a fast turn.' }
      ],
      // Sprint swimmers (Speed goal, or a short target distance): heavy,
      // low-rep explosive power work.
      main: {
        sprint: [
          { name: 'Trap Bar Jumps', prescription: '5 x 3', loadPct: 0.4, weighted: true, cue: 'Loaded vertical power with a safe spine position — the most direct dryland transfer to the leg drive off the blocks and off every turn wall.' },
          { name: 'Weighted Pull-Ups', prescription: '4 x 4', loadPct: 0.25, weighted: true, cue: 'Added load turns the pull into a power movement — this is the exact strength that pulls your body past your hand at race speed.' },
          { name: 'Power Cleans', prescription: '5 x 3', loadPct: 0.55, weighted: true, cue: 'Triple extension through ankle, knee and hip in one snap — the same sequence, in the same order, as an explosive start off the block.' },
          { name: 'Banded Catch & Pull (Explosive)', prescription: '4 x 8 / side', cue: 'Set a high elbow, then accelerate the hand back to the hip — trains an early vertical forearm at sprint tempo, so the catch holds up when your stroke rate climbs.' },
          { name: 'Box Jumps', prescription: '4 x 5', cue: 'Full reset between reps, land soft — mirrors the single explosive push off the blocks with no fatigue in the way.' },
          { name: 'Rotational Med Ball Throws', prescription: '4 x 6 / side', cue: 'Maximum-intent rotation — the torque that snaps a flip turn around fast and drives your hips through the stroke.' }
        ],
        // Distance swimmers (Endurance goal, or a long target distance):
        // high-rep muscular endurance and sustained pulling power.
        distance: [
          { name: 'Ring / TRX Rows', prescription: '4 x 15', cue: 'Body straight, pull the chest to the rings — high-volume pulling that builds the mid-back endurance holding your catch position together on the last 100.' },
          { name: 'Weighted Pull-Ups', prescription: '4 x 10', loadPct: 0.1, weighted: true, cue: 'Light load, high volume — builds the specific muscular endurance for a pull that still holds its shape 1500m in.' },
          { name: 'Straight-Arm Lat Pulldowns', prescription: '4 x 15', loadPct: 0.3, weighted: true, cue: 'Arms locked long, drive the bar to the thighs — isolates the exact lat action of the front half of your pull, repeated until it becomes automatic.' },
          { name: 'Romanian Deadlifts', prescription: '3 x 15', loadPct: 0.5, weighted: true, cue: 'High-rep posterior chain — the hamstrings and glutes that keep your kick alive when the legs start going quiet late in a distance swim.' },
          { name: 'Rowing Machine Intervals', prescription: '5 x 500m', cue: 'Sustained legs-body-arms pulling under aerobic load — the same power sequence as your stroke, held for the same kind of duration.' },
          { name: 'Turkish Get-Up', prescription: '3 x 5 / side', loadPct: 0.2, weighted: true, cue: 'Full-body control under load with the arm locked overhead — builds the shoulder stability a streamline needs when you\'re already deep in a race.' }
        ],
        // No strong sprint/distance signal yet (e.g. Technique goal): balanced
        // all-purpose strength across the same core lifts.
        balanced: [
          { name: 'Weighted Pull-Ups', prescription: '4 x 6', loadPct: 0.2, weighted: true, cue: 'The single highest-value dryland lift for a swimmer — it loads the exact lat-and-back action that moves you past your hand every stroke.' },
          { name: 'Barbell Squats', prescription: '4 x 8', loadPct: 0.65, weighted: true, cue: 'Builds explosive lower-body power for faster flip turns and starts off the block — every wall you touch pays this back.' },
          { name: 'Romanian Deadlifts', prescription: '4 x 8', loadPct: 0.6, weighted: true, cue: 'Posterior-chain strength that transfers straight into a powerful, sustained kick and a strong body line.' },
          { name: 'Ring / TRX Rows', prescription: '3 x 12', cue: 'Rings let the shoulder rotate freely as you pull — safer than a fixed bar for a swimmer\'s shoulder, and it trains the same high-elbow position as your catch.' },
          { name: 'Banded Catch & Pull', prescription: '3 x 12 / side', cue: 'High elbow, forearm vertical, hand accelerating to the hip — the closest dryland copy of an early vertical forearm catch there is.' },
          { name: 'Rotational Med Ball Throws', prescription: '4 x 8 / side', cue: 'Explosive hip-led rotation — connects your legs to your arms the way a real stroke does, through the trunk rather than around it.' }
        ]
      },
      cooldown: [
        { name: 'Lat Stretch', prescription: '2 x 30s / side', cue: 'Opens the lats worked hard by every pulling movement, so tomorrow\'s streamline still reaches full length.' },
        { name: 'Hip Flexor Stretch', prescription: '2 x 30s / side', cue: 'Releases the hips that squats and deadlifts just loaded — tight hip flexors drop your legs and drag your body line down in the water.' },
        { name: 'Foam Roll — Thoracic Spine', prescription: '2 min', cue: 'Restores the upper-back extension a full, relaxed streamline depends on.' }
      ]
    },
    // Upper Body — built entirely around the pull. Every main lift is either a
    // vertical pull (the catch), a horizontal pull (the pull-through), or
    // direct scapular/cuff work that keeps a swimmer's shoulder healthy under
    // 20+ hours a week of stroke volume. Pressing is deliberately minimal and
    // secondary: swimmers are already pull-dominant, and over-pressing closes
    // down the very shoulder range a streamline needs.
    upper: {
      warmup: [
        { name: 'Band External Rotations (Rotator Cuff)', prescription: '2 x 15 / side', cue: 'Elbow pinned to your side, rotate only the forearm — the most protective prehab movement there is for a swimmer\'s shoulder under high stroke volume.' },
        { name: 'Scapular Push-Ups', prescription: '2 x 12', cue: 'Arms locked, move only the shoulder blades — restores the scapular control that lets your catch anchor against the water instead of slipping.' },
        { name: 'Y-T-W-L Raises', prescription: '2 x 8 each position', cue: 'Four positions, four different parts of the lower trap and rear delt — the specific scapular stabilizers that keep your shoulder centred through every stroke cycle.' },
        { name: 'Thoracic Spine Open-Ups', prescription: '2 x 8 / side', cue: 'A stiff upper back forces your shoulder to find rotation it wasn\'t designed for — this gives the range back to the joint that should own it.' }
      ],
      core: [
        { name: 'Cable Woodchoppers', prescription: '3 x 12 / side', loadPct: 0.2, weighted: true, cue: 'Rotational core power that mirrors the torso drive behind every strong pull — your arms only get to use the power your trunk can transmit.' },
        { name: 'Pallof Press', prescription: '3 x 12 / side', loadPct: 0.15, weighted: true, cue: 'Anti-rotation strength — the trunk stiffness that stops your body twisting away from your own pull and wasting it.' },
        { name: 'Side Plank', prescription: '3 x 30s / side', cue: 'Lateral core strength that keeps the hips from dropping mid-stroke — a dropped hip is drag you\'re paying for on every length.' }
      ],
      main: [
        { name: 'Weighted Pull-Ups', prescription: '4 x 6', loadPct: 0.2, weighted: true, cue: 'The most swim-specific strength lift there is — loaded vertical pulling is exactly the action of moving your body past a planted hand.' },
        { name: 'Lat Pulldowns', prescription: '4 x 10', loadPct: 0.55, weighted: true, cue: 'Builds the wide-lat pulling strength behind a powerful catch and pull-through, at a load you can control precisely week to week.' },
        { name: 'Ring / TRX Rows', prescription: '4 x 12', cue: 'Rings let the shoulder rotate naturally through the pull — trains the high-elbow position of your catch with far less joint cost than a fixed bar.' },
        { name: 'Banded Catch & Pull', prescription: '4 x 12 / side', cue: 'Set a high elbow with the forearm vertical, then accelerate the hand back past your hip — the single closest dryland rehearsal of an early vertical forearm.' },
        { name: 'Straight-Arm Lat Pulldowns', prescription: '3 x 15', loadPct: 0.3, weighted: true, cue: 'Arms long, drive from the lats alone — isolates the front half of your pull, the phase most swimmers rush and lose distance on.' },
        { name: 'Cable Face Pulls', prescription: '4 x 15', loadPct: 0.25, weighted: true, cue: 'Rear-delt and external-rotator strength — the direct counterweight to swimming\'s constant internal rotation, and the best insurance against shoulder injury.' },
        { name: 'Incline Dumbbell Press', prescription: '3 x 10', loadPct: 0.35, weighted: true, cue: 'Kept deliberately light and secondary — just enough pressing to balance the pulling volume above without closing down your streamline range.' }
      ],
      cooldown: [
        { name: 'Lat Stretch', prescription: '2 x 30s / side', cue: 'Long lats mean a longer reach at the front of your stroke — the cheapest distance-per-stroke you\'ll ever buy.' },
        { name: 'Doorway Chest Stretch', prescription: '2 x 30s', cue: 'Opens a chest tightened by pressing and by swimming\'s own rounded-shoulder posture.' },
        { name: 'Cross-Body Shoulder Stretch', prescription: '2 x 30s / side', cue: 'Keeps the posterior shoulder capsule mobile for a long, relaxed recovery over the water.' }
      ]
    },
    // A modality, not a muscle-group split — mobility, dynamic stretching and
    // footwork/agility work rather than a strength lift day. Deliberately no
    // loadPct/weighted fields anywhere here, same convention as Cardio.
    flexibility: {
      warmup: [
        { name: 'Leg Swings — Front & Lateral', prescription: '2 x 10 / side, each direction', cue: 'Dynamic range through the hip in every plane a flutter and dolphin kick actually use.' },
        { name: 'Ankle Mobility Rocks (Wall)', prescription: '2 x 10 / side', cue: 'Knee over toes, heel down — ankle range is the hidden limiter on both your dolphin kick amplitude and how hard you can push off a wall.' },
        { name: 'World’s Greatest Stretch', prescription: '2 x 5 / side', cue: 'Hip, thoracic spine and hamstring in one movement — the fastest way to open every joint a stroke depends on.' }
      ],
      core: [
        { name: 'Bird Dog', prescription: '3 x 8 / side', cue: 'Opposite arm and leg extend without the hips rotating — the same anti-rotation control that keeps a stroke from fishtailing.' },
        { name: '90/90 Hip Switches', prescription: '3 x 8 / side', cue: 'Rotates through the hip socket, not the lower back — the internal/external hip range every breaststroke kick and flip turn needs.' },
        { name: 'Hollow Body Hold', prescription: '3 x 25s', cue: 'The braced streamline shape, held still — mobility only helps if you can hold the position you just unlocked.' }
      ],
      main: [
        { name: 'Deep Squat Hold (Mobility)', prescription: '4 x 30s', cue: 'Sit as low as you can with heels flat — opens the ankles and hips for a deeper, more powerful streamline push-off.' },
        { name: 'Thoracic Spine Open-Ups', prescription: '3 x 10 / side', cue: 'The rotation your breathing depends on should come from the upper back — this trains it there instead of stealing it from your shoulder or lower back.' },
        { name: 'Banded Ankle Distraction', prescription: '3 x 45s / side', cue: 'Band pulls the ankle joint open as you rock forward — restores the dorsiflexion a hard wall push-off and a whippy dolphin kick both demand.' },
        { name: 'Lateral Bounds (Skater Jumps)', prescription: '4 x 8 / side', cue: 'Stick each landing before bounding again — single-leg power and control that carries into a stronger, more stable push-off.' },
        { name: 'Walking Lunges with Rotation', prescription: '3 x 10 / side', cue: 'Rotate toward the front knee at the bottom — hip mobility and trunk rotation trained together, exactly how a stroke uses them.' },
        { name: 'Agility Ladder — In-In-Out-Out', prescription: '6 x through', cue: 'Fast, light feet — the same quick neuromuscular firing that makes a start or turn snap instead of drag.' }
      ],
      cooldown: [
        { name: 'Standing Forward Fold', prescription: '1 x 45s', cue: 'Let the head and arms hang heavy — releases the whole posterior chain after a high-output mobility session.' },
        { name: 'Seated Straddle Stretch', prescription: '2 x 30s', cue: 'Hinge from the hips, not the back — opens the inner thighs and hips for a wider, freer breaststroke kick.' },
        { name: 'Pigeon Pose', prescription: '2 x 30s / side', cue: 'Deep glute and hip-rotator release — tight hips pull your legs low and cost you body position on every length.' }
      ]
    },
    // Explosive/plyometric power for swimmers specifically — block starts,
    // flip-turn push-off, and reactive strength — not a general strength
    // day. Deliberately kept low-volume per exercise: real plyometric
    // programming prioritizes full recovery and movement quality over set/rep
    // volume, so a longer list here would work against the modality's own
    // training principle, not just be an implementation shortcut. `main` is
    // nested two levels deep — gymOrientation() (sprint/distance/balanced,
    // reusing the exact same Workout Generator goal/distance signal Full Body
    // already reads) picks WHICH drills based on the swimmer's own stated
    // goal, then state.level (beginner/competitive/elite, reusing the same
    // Level tabs the Workout Generator already has) picks how advanced/high-
    // CNS-demand today's version of those drills is — e.g. a beginner never
    // sees a true depth jump, only a competitive/elite swimmer does. See
    // renderGym()'s `focus === 'plyometrics'` branch for how both axes get
    // read together.
    plyometrics: {
      warmup: [
        { name: 'Ankle Pogo Hops', prescription: '2 x 20s', cue: 'Stiff-ankled little bounces — primes the reactive ankle stiffness every wall push-off is built on.' },
        { name: 'Ankle Mobility Rocks (Wall)', prescription: '2 x 10 / side', cue: 'A stiff ankle can\'t absorb or return force — open it first, or every jump below leaks power into the floor.' },
        { name: 'Explosive Streamline Jumps', prescription: '2 x 8', cue: 'Hands locked overhead in a tight streamline, jump for height — grooves the exact push-off position before any real plyometric load.' },
        { name: 'Dynamic Walking Lunge with Reach', prescription: '2 x 8 / side', cue: 'Opens the hips through full range before anything ballistic.' }
      ],
      core: [
        { name: 'Plank-to-Pike', prescription: '3 x 10', cue: 'Explosive hip flexion from a braced plank — the same fast hip-snap that drives a flip turn around.' },
        { name: 'Rotational Med Ball Throw', prescription: '3 x 8 / side', cue: 'Full hip-and-shoulder rotation, thrown hard — mirrors the torque of a fast flip-turn rotation.' },
        { name: 'Pallof Press', prescription: '3 x 10 / side', cue: 'Anti-rotation bracing — a trunk that can resist twist is a trunk that can transmit your legs\' power into your arms instead of losing it.' }
      ],
      main: {
        sprint: {
          beginner: [
            { name: 'Squat Jumps', prescription: '3 x 6', cue: 'Full reset between reps — grooves the vertical pop behind a block start before adding any bounce-tempo.' },
            { name: 'Broad Jumps', prescription: '3 x 5', cue: 'Stick every landing — the same horizontal drive as an explosive dive off the blocks.' },
            { name: 'Streamline Wall Push-Off Jumps', prescription: '3 x 8', cue: 'Hands locked overhead, jump and hold the line — the literal dryland version of the position you leave every wall in.' }
          ],
          competitive: [
            { name: 'Box Step-Off Depth Jumps', prescription: '4 x 5', cue: 'Step off a low box, land, rebound immediately — teaches the ground-contact speed a real start off the blocks demands.' },
            { name: 'Broad Jumps', prescription: '4 x 6', cue: 'Chain jumps with a short reset — raw horizontal power for the start.' },
            { name: 'Rotational Med Ball Throws', prescription: '4 x 8 / side', cue: 'Explosive hip-led rotation at max intent — the torque behind both a fast turn and a powerful stroke.' }
          ],
          elite: [
            { name: 'Depth Jumps (45cm Box)', prescription: '5 x 5', cue: 'Minimal ground contact on landing — the highest-CNS drill for start and turn explosiveness; always full recovery between reps.' },
            { name: 'Single-Leg Bounds', prescription: '4 x 6 / side', cue: 'Single-leg landing and re-drive — builds the asymmetric push-off power used on a one-footed turn wall contact.' },
            { name: 'Trap Bar Jumps', prescription: '5 x 3', loadPct: 0.4, weighted: true, cue: 'Loaded vertical power — the heaviest legal way to overload the exact push-off pattern of a start and a turn.' }
          ]
        },
        distance: {
          beginner: [
            { name: 'Squat Jumps', prescription: '3 x 10', cue: 'Higher rep, moderate intensity — repeatable explosive endurance for the 15th turn, not just the 1st.' },
            { name: 'Step-Up Drives', prescription: '3 x 10 / side', cue: 'Drive hard off the top leg — sustained power output that doesn\'t fade late in a race.' },
            { name: 'Streamline Wall Push-Off Jumps', prescription: '3 x 12', cue: 'Repeated streamline jumps — trains the push-off position to hold its shape even when you\'re tired and turn number 20 arrives.' }
          ],
          competitive: [
            { name: 'Continuous Broad Jumps', prescription: '4 x 8', cue: 'Jump-to-jump with no reset — explosive power that holds up across many consecutive turns.' },
            { name: 'Lateral Bounds', prescription: '4 x 8 / side', cue: 'Side-to-side stick-and-go — the repeatable push-off control a long race demands turn after turn.' },
            { name: 'Med Ball Rotational Wall Throws', prescription: '4 x 12 / side', cue: 'High-rep rotational throws — rotational endurance so your turns stay sharp on the back half of a distance swim.' }
          ],
          elite: [
            { name: 'Continuous Depth Jumps', prescription: '4 x 10', cue: 'Minimal pause between landings — the highest-volume reactive-strength drill, for turn power that never fades late in a race.' },
            { name: 'Single-Leg Box Jumps', prescription: '4 x 8 / side', cue: 'Repeated single-leg power output — the asymmetric-turn equivalent of distance-swim pacing.' },
            { name: 'Bounding for Distance', prescription: '4 x 30m', cue: 'Continuous exaggerated bounds — reactive strength maintained over distance, exactly the quality a fading 1500 needs.' }
          ]
        },
        balanced: {
          beginner: [
            { name: 'Squat Jumps', prescription: '3 x 6', cue: 'General explosive leg power — the foundation under every start and turn.' },
            { name: 'Lateral Bounds', prescription: '3 x 6 / side', cue: 'Side-to-side power and control for a stable, strong wall push-off.' },
            { name: 'Explosive Streamline Jumps', prescription: '3 x 8', cue: 'Overhead streamline held through every rep — position first, power second, exactly the order a young swimmer should learn it in.' }
          ],
          competitive: [
            { name: 'Box Jumps', prescription: '4 x 6', cue: 'Full-extension vertical power — carries directly into a stronger dive and turn push-off.' },
            { name: 'Broad Jumps', prescription: '4 x 6', cue: 'Horizontal drive — general-purpose start and turn power.' },
            { name: 'Rotational Med Ball Throws', prescription: '4 x 8 / side', cue: 'Explosive rotational power — the same torque that snaps a flip turn around fast.' }
          ],
          elite: [
            { name: 'Depth Jumps', prescription: '4 x 6', cue: 'Reactive strength that transfers directly to both the start and every wall turn.' },
            { name: 'Trap Bar Jumps', prescription: '4 x 4', loadPct: 0.4, weighted: true, cue: 'Loaded jump work — overloads the push-off pattern itself rather than just the muscles that serve it.' },
            { name: '180° Jump Turns', prescription: '4 x 6', cue: 'Full rotation mid-air, stick the landing — reactive strength plus the rotational control a fast flip turn needs.' }
          ]
        }
      },
      cooldown: [
        { name: 'Standing Calf Stretch', prescription: '2 x 30s / side', cue: 'Releases the calves and Achilles after repeated ground-reactive loading — the same tissue your dolphin kick relies on.' },
        { name: 'Pigeon Pose', prescription: '2 x 30s / side', cue: 'Opens the hips loaded by jumping and bounding work.' },
        { name: 'Deep Breathing Walk', prescription: '3–5 min', cue: 'Active recovery — let the nervous system settle after high-CNS explosive work.' }
      ]
    },
    // Lower Body — organized around the two things a swimmer's legs actually
    // do: push off a wall explosively, and kick continuously. Heavy bilateral
    // strength for the push-off, posterior-chain and calf/ankle work for the
    // kick, and single-leg work so a one-footed turn contact is as strong as
    // a two-footed one.
    lower: {
      warmup: [
        { name: 'Ankle Mobility Rocks (Wall)', prescription: '2 x 10 / side', cue: 'Knee over toes, heel glued down — restore ankle range first or you\'ll squat around the restriction and never reach a real push-off depth.' },
        { name: 'Leg Swings', prescription: '2 x 10 / side', cue: 'Opens the hips through the same range a flutter kick actually travels.' },
        { name: 'Goblet Squats (light warm-up sets)', prescription: '2 x 10', loadPct: 0.2, weighted: true, cue: 'Grooves the squat pattern and warms the hips before loaded barbell work.' }
      ],
      core: [
        { name: 'Cable Pull-Throughs', prescription: '3 x 12', loadPct: 0.3, weighted: true, cue: 'Hip-hinge activation that primes the glutes — the muscle that should be driving your kick, not your quads.' },
        { name: 'Glute Bridge Hold', prescription: '3 x 30s', cue: 'Wakes the glutes before they\'re asked to fire explosively, and teaches the hip extension that keeps your legs high in the water.' },
        { name: 'Bird Dog', prescription: '3 x 8 / side', cue: 'Keeps the hips square while a limb moves — the anti-rotation control that stops your kick from rolling your whole body.' }
      ],
      main: [
        { name: 'Barbell Squats', prescription: '4 x 8', loadPct: 0.7, weighted: true, cue: 'Builds explosive lower-body power for faster flip turns and starts off the block — the single biggest lever on your wall push-off speed.' },
        { name: 'Romanian Deadlifts', prescription: '4 x 8', loadPct: 0.6, weighted: true, cue: 'Posterior-chain strength that transfers directly into a powerful, sustained kick and keeps your legs riding high.' },
        { name: 'Trap Bar Jumps', prescription: '4 x 4', loadPct: 0.4, weighted: true, cue: 'Loaded vertical jumping — bridges the gap between heavy squat strength and the actual explosive speed a push-off needs.' },
        { name: 'Bulgarian Split Squats', prescription: '3 x 10 / side', loadPct: 0.4, weighted: true, cue: 'Single-leg strength and balance — turns are rarely a perfect two-footed contact, and this makes the off-side just as strong.' },
        { name: 'Hamstring Curl Machine', prescription: '3 x 12', loadPct: 0.4, weighted: true, cue: 'Isolated hamstring strength balancing the quad-dominant lifts above — hamstring strength is what makes the upbeat of your kick propulsive rather than passive.' },
        { name: 'Standing Calf Raise Machine', prescription: '4 x 20', loadPct: 0.5, weighted: true, cue: 'Ankle stiffness and pop under real load — directly drives flutter and dolphin kick amplitude off the plantar-flexed foot.' }
      ],
      cooldown: [
        { name: 'Calf Stretch', prescription: '2 x 30s / side', cue: 'Keeps the ankle supple for a whippy, high-amplitude flutter kick.' },
        { name: 'Pigeon Pose', prescription: '2 x 30s / side', cue: 'Opens the hips for a full, unrestricted kick range.' },
        { name: 'Standing Quad Stretch', prescription: '2 x 30s / side', cue: 'Releases quads loaded by heavy squats and jump work — tight quads tilt the pelvis and drop your legs in the water.' }
      ]
    }
  };
  var GYM_TONE = { cardio: 'maroon', full: 'green', upper: 'aqua', lower: 'green', flexibility: 'aqua', plyometrics: 'aqua' };
  var GYM_LABEL = { cardio: 'Fitness / Cardio', full: 'Full Body', upper: 'Upper Body', lower: 'Lower Body', flexibility: 'Flexibility & Agility', plyometrics: 'Plyometrics & Explosive Power' };
  var GYM_PHASE_LABEL = { warmup: 'Warm-Up', core: 'Core Activation', main: 'Main Power / Strength Lifts', cooldown: 'Cool-Down & Mobility' };
  var GYM_PHASE_ICON = { warmup: 'i-heart-pulse', core: 'i-core', main: 'i-bolt', cooldown: 'i-droplet' };

  function scaleDownPrescription(str) {
    var m = str.match(/^(\d+)\s*x\s*(\d+)(.*)$/);
    if (!m) return str;
    var sets = Math.max(2, parseInt(m[1], 10) - 1);
    var reps = Math.max(4, Math.round(parseInt(m[2], 10) * 0.8));
    return sets + ' x ' + reps + m[3];
  }

  // Every muscle-split focus (Cardio is a modality, not a split, so it stays
  // manually-selected only) takes its turn as the auto-selected default once
  // a week, rotating on the same weekIndex() used elsewhere — Full Body's
  // own Core Activation phase covers the "Core" leg of the classic
  // Upper/Lower/Core split, since there's no separate Core tab in GYM_FOCUS.
  var GYM_WEEKLY_ROTATION = ['upper', 'lower', 'full'];
  function thisWeeksGymFocus() { return GYM_WEEKLY_ROTATION[weekIndex() % GYM_WEEKLY_ROTATION.length]; }
  var currentGymFocus = thisWeeksGymFocus();

  // Reads the Workout Generator's own state (same discipline/goal/distance the
  // swimmer already configured) so Full Body programming automatically leans
  // sprint or distance without asking the swimmer to repeat themselves.
  function gymOrientation() {
    if (state.goals.indexOf('speed') > -1 || state.distance <= 1500) return 'sprint';
    if (state.goals.indexOf('endurance') > -1 || state.distance >= 3500) return 'distance';
    return 'balanced';
  }
  var GYM_ORIENTATION_LABEL = {
    sprint: 'Sprint-focused — heavy, low-rep explosive power (from your Workout Generator settings)',
    distance: 'Distance-focused — high-rep muscular endurance & sustained pulling power (from your Workout Generator settings)',
    balanced: 'Balanced strength across core lifts (set a Speed or Endurance goal in the Workout Generator to specialize this)'
  };

  var GYM_PHASE_PHOTO = { warmup: 'var(--gym-warmup-photo)', core: 'var(--gym-core-photo)', main: 'none', cooldown: 'var(--gym-cooldown-photo)' };

  /* ============================= GYM TECHNIQUE DEMOS =============================
     Every exercise card carries a live, looping stick-figure demonstration of
     the movement — a hand-drawn SVG flipbook (2-4 key poses per movement
     archetype, cycled by one global timer) rather than external GIF/video
     assets, so demos load instantly, stay on-brand, and never depend on a
     third-party CDN. Coordinates live in a 120x80 viewBox with the ground at
     y=74; `class="p"` marks props (bars, boxes, ropes, walls) drawn in the
     muted color. `beats` slows a hold/stretch to a calmer cadence. */
  var GYM_ANIMS = {
    jack: { frames: [
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 31 L50 44"/><path d="M60 31 L70 44"/><path d="M60 47 L56 73"/><path d="M60 47 L64 73"/>',
      '<circle cx="60" cy="18" r="5"/><path d="M60 23 L60 44"/><path d="M60 29 L46 12"/><path d="M60 29 L74 12"/><path d="M60 44 L45 73"/><path d="M60 44 L75 73"/>'
    ] },
    armcircles: { frames: [
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 47 L54 73"/><path d="M60 47 L66 73"/><path d="M60 31 L52 15"/><path d="M60 31 L68 15"/>',
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 47 L54 73"/><path d="M60 47 L66 73"/><path d="M60 31 L44 30"/><path d="M60 31 L76 30"/>',
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 47 L54 73"/><path d="M60 47 L66 73"/><path d="M60 31 L52 46"/><path d="M60 31 L68 46"/>',
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 47 L54 73"/><path d="M60 47 L66 73"/><path d="M60 31 L44 30"/><path d="M60 31 L76 30"/>'
    ] },
    plank: { beats: 2, frames: [
      '<circle cx="26" cy="52" r="5"/><path d="M34 56 L72 58 L98 71"/><path d="M36 57 L36 70 L24 70"/>',
      '<circle cx="26" cy="50" r="5"/><path d="M34 54 L72 57 L98 71"/><path d="M36 55 L36 70 L24 70"/>'
    ] },
    sideplank: { beats: 2, frames: [
      '<circle cx="32" cy="38" r="5"/><path d="M38 43 L96 70"/><path d="M40 44 L40 70"/><path d="M40 44 L34 24"/>',
      '<circle cx="32" cy="38" r="5"/><path d="M38 43 L96 70"/><path d="M40 44 L40 70"/><path d="M40 44 L34 24"/><path d="M66 56 L90 46"/>'
    ] },
    deadbug: { beats: 2, frames: [
      '<circle cx="22" cy="67" r="5"/><path d="M28 68 L58 68"/><path d="M36 68 L36 48"/><path d="M58 68 L70 54 L82 58"/>',
      '<circle cx="22" cy="67" r="5"/><path d="M28 68 L58 68"/><path d="M44 68 L44 48"/><path d="M58 68 L74 62 L88 66"/>'
    ] },
    jumprope: { frames: [
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 46"/><path d="M60 31 L52 40"/><path d="M60 31 L68 40"/><path d="M60 46 L55 72"/><path d="M60 46 L65 72"/><path class="p" d="M52 40 Q60 2 68 40"/>',
      '<circle cx="60" cy="16" r="5"/><path d="M60 21 L60 42"/><path d="M60 27 L52 36"/><path d="M60 27 L68 36"/><path d="M60 42 L55 66"/><path d="M60 42 L65 66"/><path class="p" d="M52 36 Q60 76 68 36"/>'
    ] },
    burpee: { frames: [
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 31 L51 45"/><path d="M60 31 L69 45"/><path d="M60 47 L55 73"/><path d="M60 47 L65 73"/>',
      '<circle cx="52" cy="43" r="5"/><path d="M56 47 L64 59"/><path d="M56 49 L48 72"/><path d="M64 59 L58 72"/><path d="M64 59 L70 72"/>',
      '<circle cx="26" cy="49" r="5"/><path d="M36 53 L96 68"/><path d="M36 53 L36 72"/>',
      '<circle cx="60" cy="12" r="5"/><path d="M60 17 L60 38"/><path d="M60 23 L48 6"/><path d="M60 23 L72 6"/><path d="M60 38 L54 60"/><path d="M60 38 L66 60"/>'
    ] },
    climber: { frames: [
      '<circle cx="26" cy="48" r="5"/><path d="M36 52 L78 60"/><path d="M36 52 L36 72"/><path d="M78 60 L100 72"/><path d="M78 60 L52 60"/>',
      '<circle cx="26" cy="48" r="5"/><path d="M36 52 L78 60"/><path d="M36 52 L36 72"/><path d="M78 60 L96 71"/><path d="M78 60 L62 69"/>'
    ] },
    rower: { frames: [
      '<path class="p" d="M18 70 L102 70"/><circle cx="38" cy="45" r="5"/><path d="M56 64 L42 50"/><path d="M42 51 L28 55"/><path d="M56 64 L44 52 L40 68"/>',
      '<path class="p" d="M18 70 L102 70"/><circle cx="82" cy="45" r="5"/><path d="M66 64 L78 50"/><path d="M78 52 L62 53"/><path d="M66 64 L46 66 L40 68"/>'
    ] },
    ropes: { frames: [
      '<circle cx="72" cy="24" r="5"/><path d="M72 29 L72 48"/><path d="M72 48 L64 60 L62 72"/><path d="M72 48 L80 60 L82 72"/><path d="M72 34 L58 24"/><path d="M72 34 L60 44"/><path class="p" d="M58 24 Q42 14 36 34 Q30 54 18 68"/><path class="p" d="M60 44 Q44 56 36 46 Q26 36 18 68"/>',
      '<circle cx="72" cy="24" r="5"/><path d="M72 29 L72 48"/><path d="M72 48 L64 60 L62 72"/><path d="M72 48 L80 60 L82 72"/><path d="M72 34 L58 44"/><path d="M72 34 L60 26"/><path class="p" d="M58 44 Q42 56 36 42 Q28 30 18 68"/><path class="p" d="M60 26 Q46 16 38 34 Q30 52 18 68"/>'
    ] },
    squat: { frames: [
      '<circle cx="52" cy="20" r="5"/><path d="M54 25 L56 46"/><path d="M54 30 L36 32"/><path d="M56 46 L52 72"/><path d="M56 46 L60 72"/>',
      '<circle cx="54" cy="33" r="5"/><path d="M56 38 L63 52"/><path d="M56 42 L38 42"/><path d="M63 52 L50 56 L52 72"/><path d="M63 52 L54 58 L58 72"/>'
    ] },
    bbsquat: { frames: [
      '<path class="p" d="M40 25 L74 25"/><circle class="p" cx="40" cy="25" r="3"/><circle class="p" cx="74" cy="25" r="3"/><circle cx="57" cy="18" r="5"/><path d="M57 23 L58 46"/><path d="M57 27 L48 25"/><path d="M57 27 L68 25"/><path d="M58 46 L54 72"/><path d="M58 46 L62 72"/>',
      '<path class="p" d="M42 39 L76 39"/><circle class="p" cx="42" cy="39" r="3"/><circle class="p" cx="76" cy="39" r="3"/><circle cx="58" cy="32" r="5"/><path d="M59 37 L64 52"/><path d="M59 41 L50 39"/><path d="M59 41 L70 39"/><path d="M64 52 L50 56 L52 72"/><path d="M64 52 L56 58 L60 72"/>'
    ] },
    hinge: { frames: [
      '<circle cx="44" cy="34" r="5"/><path d="M48 38 L62 54"/><path d="M48 40 L46 60"/><circle class="p" cx="46" cy="64" r="6"/><path d="M62 54 L56 62 L58 72"/><path d="M62 54 L62 63 L64 72"/>',
      '<circle cx="54" cy="20" r="5"/><path d="M56 25 L58 48"/><path d="M56 31 L54 50"/><circle class="p" cx="54" cy="55" r="6"/><path d="M58 48 L54 72"/><path d="M58 48 L62 72"/>'
    ] },
    slrdl: { frames: [
      '<circle cx="56" cy="20" r="5"/><path d="M58 25 L58 47"/><path d="M58 31 L56 48"/><circle class="p" cx="56" cy="51" r="3"/><path d="M58 47 L56 72"/><path d="M58 47 L64 70"/>',
      '<circle cx="40" cy="36" r="5"/><path d="M46 40 L62 50"/><path d="M48 42 L46 62"/><circle class="p" cx="46" cy="65" r="3"/><path d="M62 50 L88 44"/><path d="M62 50 L60 72"/>'
    ] },
    pullup: { frames: [
      '<path class="p" d="M36 12 L84 12"/><circle cx="60" cy="26" r="5"/><path d="M60 31 L60 52"/><path d="M60 31 L50 13"/><path d="M60 31 L70 13"/><path d="M60 52 L56 70"/><path d="M60 52 L64 70"/>',
      '<path class="p" d="M36 12 L84 12"/><circle cx="60" cy="14" r="5"/><path d="M60 19 L60 40"/><path d="M60 20 L50 14"/><path d="M60 20 L70 14"/><path d="M60 40 L54 56"/><path d="M60 40 L66 56"/>'
    ] },
    clean: { frames: [
      '<circle cx="44" cy="34" r="5"/><path d="M48 38 L62 54"/><path d="M48 40 L46 60"/><circle class="p" cx="46" cy="64" r="6"/><path d="M62 54 L56 62 L58 72"/><path d="M62 54 L62 63 L64 72"/>',
      '<circle cx="54" cy="16" r="5"/><path d="M56 21 L58 44"/><path d="M56 27 L54 46"/><circle class="p" cx="54" cy="50" r="6"/><path d="M58 44 L55 70"/><path d="M58 44 L61 70"/>',
      '<circle cx="54" cy="24" r="5"/><path d="M56 29 L60 48"/><circle class="p" cx="49" cy="32" r="6"/><path d="M56 33 L48 32"/><path d="M60 48 L54 58 L56 72"/><path d="M60 48 L62 58 L64 72"/>'
    ] },
    swing: { frames: [
      '<circle cx="46" cy="34" r="5"/><path d="M50 38 L62 52"/><path d="M50 40 L64 62"/><circle class="p" cx="66" cy="64" r="4"/><path d="M62 52 L58 62 L58 72"/><path d="M62 52 L66 62 L66 72"/>',
      '<circle cx="56" cy="18" r="5"/><path d="M58 23 L60 46"/><path d="M58 29 L38 32"/><circle class="p" cx="36" cy="33" r="4"/><path d="M60 46 L56 72"/><path d="M60 46 L64 72"/>'
    ] },
    slam: { frames: [
      '<circle cx="58" cy="16" r="5"/><path d="M60 21 L60 44"/><path d="M60 27 L52 8"/><path d="M60 27 L68 8"/><circle class="p" cx="60" cy="7" r="5"/><path d="M60 44 L56 70"/><path d="M60 44 L64 70"/>',
      '<circle cx="52" cy="42" r="5"/><path d="M56 46 L62 58"/><path d="M56 48 L54 66"/><circle class="p" cx="54" cy="69" r="5"/><path d="M62 58 L58 72"/><path d="M62 58 L68 72"/>'
    ] },
    boxjump: { frames: [
      '<rect class="p" x="72" y="52" width="30" height="22"/><circle cx="34" cy="40" r="5"/><path d="M36 45 L40 56"/><path d="M36 47 L26 56"/><path d="M40 56 L34 64 L38 72"/><path d="M40 56 L44 64 L46 72"/>',
      '<rect class="p" x="72" y="52" width="30" height="22"/><circle cx="74" cy="18" r="5"/><path d="M76 23 L78 36"/><path d="M76 27 L66 20"/><path d="M76 27 L86 22"/><path d="M78 36 L72 44"/><path d="M78 36 L84 44"/>',
      '<rect class="p" x="72" y="52" width="30" height="22"/><circle cx="86" cy="26" r="5"/><path d="M87 31 L87 42"/><path d="M87 34 L81 42"/><path d="M87 34 L93 42"/><path d="M87 42 L84 52"/><path d="M87 42 L90 52"/>'
    ] },
    broadjump: { frames: [
      '<circle cx="30" cy="40" r="5"/><path d="M32 45 L36 56"/><path d="M32 47 L22 56"/><path d="M36 56 L30 64 L34 72"/><path d="M36 56 L40 64 L42 72"/>',
      '<circle cx="58" cy="26" r="5"/><path d="M60 31 L64 44"/><path d="M60 34 L72 24"/><path d="M60 34 L70 30"/><path d="M64 44 L54 54"/><path d="M64 44 L58 58"/>',
      '<circle cx="86" cy="40" r="5"/><path d="M88 45 L92 56"/><path d="M88 47 L78 56"/><path d="M92 56 L86 64 L90 72"/><path d="M92 56 L96 64 L98 72"/>'
    ] },
    getup: { beats: 2, frames: [
      '<circle cx="26" cy="66" r="5"/><path d="M32 68 L60 68"/><path d="M40 66 L40 46"/><circle class="p" cx="40" cy="42" r="3"/><path d="M60 68 L66 58 L72 70"/><path d="M60 68 L84 70"/>',
      '<circle cx="34" cy="50" r="5"/><path d="M38 54 L62 66"/><path d="M40 56 L46 70"/><path d="M40 52 L42 32"/><circle class="p" cx="42" cy="28" r="3"/><path d="M62 66 L70 56 L76 70"/>',
      '<circle cx="58" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 29 L58 10"/><circle class="p" cx="58" cy="7" r="3"/><path d="M60 31 L68 44"/><path d="M60 47 L56 72"/><path d="M60 47 L64 72"/>'
    ] },
    pushup: { frames: [
      '<circle cx="26" cy="45" r="5"/><path d="M36 50 L36 70"/><path d="M36 50 L96 66"/>',
      '<circle cx="26" cy="57" r="5"/><path d="M36 61 L44 70"/><path d="M36 61 L96 70"/>'
    ] },
    birddog: { beats: 2, frames: [
      '<circle cx="38" cy="46" r="5"/><path d="M44 52 L76 52"/><path d="M44 52 L44 70"/><path d="M76 52 L76 70"/><path d="M44 52 L24 42"/><path d="M76 52 L98 44"/>',
      '<circle cx="38" cy="46" r="5"/><path d="M44 52 L76 52"/><path d="M44 52 L44 70"/><path d="M76 52 L76 70"/><path d="M44 52 L26 54"/><path d="M76 52 L96 56"/>'
    ] },
    ytw: { beats: 2, frames: [
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L48 16"/><path d="M60 31 L72 16"/>',
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L42 30"/><path d="M60 31 L78 30"/>',
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L50 40 L46 30"/><path d="M60 31 L70 40 L74 30"/>'
    ] },
    dips: { frames: [
      '<path class="p" d="M24 58 L48 58"/><path class="p" d="M28 58 L28 74"/><path class="p" d="M44 58 L44 74"/><circle cx="56" cy="33" r="5"/><path d="M56 38 L56 54"/><path d="M56 40 L48 57"/><path d="M56 54 L80 68 L88 68"/>',
      '<path class="p" d="M24 58 L48 58"/><path class="p" d="M28 58 L28 74"/><path class="p" d="M44 58 L44 74"/><circle cx="56" cy="43" r="5"/><path d="M56 48 L56 60"/><path d="M56 49 L48 57"/><path d="M56 60 L80 70 L88 70"/>'
    ] },
    lunge: { frames: [
      '<circle cx="58" cy="20" r="5"/><path d="M60 25 L60 48"/><path d="M60 31 L54 45"/><path d="M60 31 L66 45"/><path d="M60 48 L72 60 L72 72"/><path d="M60 48 L48 60 L44 72"/>',
      '<circle cx="58" cy="32" r="5"/><path d="M60 37 L60 56"/><path d="M60 42 L54 54"/><path d="M60 42 L66 54"/><path d="M60 56 L74 58 L74 72"/><path d="M60 56 L50 68 L42 71"/>'
    ] },
    bridge: { beats: 2, frames: [
      '<circle cx="28" cy="67" r="5"/><path d="M34 68 L62 68"/><path d="M62 68 L72 56 L74 72"/>',
      '<circle cx="28" cy="67" r="5"/><path d="M34 66 L70 52"/><path d="M70 52 L74 72"/>'
    ] },
    calfraise: { frames: [
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 31 L52 45"/><path d="M60 31 L68 45"/><path d="M60 47 L55 73"/><path d="M60 47 L65 73"/>',
      '<circle cx="60" cy="18" r="5"/><path d="M60 23 L60 44"/><path d="M60 28 L52 42"/><path d="M60 28 L68 42"/><path d="M60 44 L55 70"/><path d="M60 44 L65 70"/><path class="p" d="M53 73 L57 70"/><path class="p" d="M63 73 L67 70"/>'
    ] },
    legswing: { frames: [
      '<path class="p" d="M22 26 L22 74"/><circle cx="52" cy="20" r="5"/><path d="M53 25 L54 47"/><path d="M53 31 L24 32"/><path d="M54 47 L52 72"/><path d="M54 47 L34 58"/>',
      '<path class="p" d="M22 26 L22 74"/><circle cx="52" cy="20" r="5"/><path d="M53 25 L54 47"/><path d="M53 31 L24 32"/><path d="M54 47 L52 72"/><path d="M54 47 L74 58"/>'
    ] },
    quadstretch: { beats: 2, frames: [
      '<circle cx="56" cy="20" r="5"/><path d="M57 25 L57 47"/><path d="M57 31 L44 36"/><path d="M57 31 L64 49"/><path d="M57 47 L55 72"/><path d="M57 47 L61 60 L65 50"/>',
      '<circle cx="57" cy="20" r="5"/><path d="M58 25 L58 47"/><path d="M58 31 L45 36"/><path d="M58 31 L65 49"/><path d="M58 47 L56 72"/><path d="M58 47 L62 60 L66 50"/>'
    ] },
    childpose: { beats: 2, frames: [
      '<circle cx="34" cy="62" r="5"/><path d="M64 56 Q52 50 40 60"/><path d="M64 56 L66 72"/><path d="M66 72 L88 72"/><path d="M38 66 L22 68"/>',
      '<circle cx="34" cy="63" r="5"/><path d="M64 57 Q52 52 40 61"/><path d="M64 57 L66 72"/><path d="M66 72 L88 72"/><path d="M38 67 L22 69"/>'
    ] },
    pigeon: { beats: 2, frames: [
      '<circle cx="44" cy="32" r="5"/><path d="M46 37 L50 56"/><path d="M46 42 L38 58"/><path d="M50 58 L36 62 L54 66"/><path d="M50 58 L88 68"/>',
      '<circle cx="40" cy="40" r="5"/><path d="M43 45 L50 58"/><path d="M43 48 L30 62"/><path d="M50 58 L36 62 L54 66"/><path d="M50 58 L88 68"/>'
    ] },
    kneellunge: { beats: 2, frames: [
      '<circle cx="54" cy="28" r="5"/><path d="M56 33 L58 52"/><path d="M56 38 L70 50"/><path d="M58 52 L74 54 L76 72"/><path d="M58 52 L46 70 L32 72"/>',
      '<circle cx="57" cy="28" r="5"/><path d="M59 33 L61 52"/><path d="M59 38 L72 50"/><path d="M61 52 L76 54 L78 72"/><path d="M61 52 L47 70 L32 72"/>'
    ] },
    foamroll: { beats: 2, frames: [
      '<circle class="p" cx="56" cy="66" r="5"/><circle cx="30" cy="57" r="5"/><path d="M36 60 L74 66"/><path d="M74 66 L84 58 L88 72"/>',
      '<circle class="p" cx="56" cy="66" r="5"/><circle cx="34" cy="55" r="5"/><path d="M40 58 L78 66"/><path d="M78 66 L86 58 L90 72"/>'
    ] },
    hollow: { beats: 2, frames: [
      '<circle cx="34" cy="60" r="5"/><path d="M38 58 L22 54"/><path d="M40 62 Q58 68 74 60"/><path d="M74 60 L92 54"/>',
      '<circle cx="34" cy="58" r="5"/><path d="M38 56 L22 50"/><path d="M40 60 Q58 66 74 58"/><path d="M74 58 L92 50"/>'
    ] },
    bandpull: { frames: [
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L48 34"/><path d="M60 31 L72 34"/><path class="p" d="M48 34 L72 34"/>',
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L38 30"/><path d="M60 31 L82 30"/><path class="p" d="M38 30 L82 30"/>'
    ] },
    sidelean: { beats: 2, frames: [
      '<circle cx="58" cy="21" r="5"/><path d="M59 26 L61 47"/><path d="M59 30 L54 14 L46 16"/><path d="M59 33 L68 44"/><path d="M61 47 L55 72"/><path d="M61 47 L67 72"/>',
      '<circle cx="55" cy="22" r="5"/><path d="M57 27 L62 47"/><path d="M57 31 L50 15 L42 18"/><path d="M57 34 L67 44"/><path d="M62 47 L56 72"/><path d="M62 47 L68 72"/>'
    ] },
    armacross: { beats: 2, frames: [
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L44 34"/><path d="M60 31 L52 38"/>',
      '<circle cx="60" cy="20" r="5"/><path d="M60 25 L60 47"/><path d="M60 47 L54 72"/><path d="M60 47 L66 72"/><path d="M60 31 L42 35"/><path d="M60 31 L50 39"/>'
    ] },
    cheststretch: { beats: 2, frames: [
      '<path class="p" d="M78 20 L78 74"/><circle cx="58" cy="22" r="5"/><path d="M60 27 L60 48"/><path d="M62 32 L72 32 L72 22"/><path d="M60 48 L54 72"/><path d="M60 48 L66 70"/>',
      '<path class="p" d="M78 20 L78 74"/><circle cx="60" cy="22" r="5"/><path d="M62 27 L62 48"/><path d="M64 32 L72 32 L72 22"/><path d="M62 48 L55 72"/><path d="M62 48 L68 70"/>'
    ] },
    calfstretch: { beats: 2, frames: [
      '<path class="p" d="M96 22 L96 74"/><circle cx="58" cy="26" r="5"/><path d="M60 31 L66 50"/><path d="M62 34 L94 38"/><path d="M66 50 L76 62 L76 72"/><path d="M66 50 L48 72"/>',
      '<path class="p" d="M96 22 L96 74"/><circle cx="60" cy="27" r="5"/><path d="M62 32 L68 50"/><path d="M64 35 L94 38"/><path d="M68 50 L78 62 L78 72"/><path d="M68 50 L50 72"/>'
    ] },
    walk: { frames: [
      '<circle cx="56" cy="20" r="5"/><path d="M58 25 L58 47"/><path d="M58 31 L66 44"/><path d="M58 31 L50 44"/><path d="M58 47 L48 72"/><path d="M58 47 L68 72"/>',
      '<circle cx="58" cy="20" r="5"/><path d="M59 25 L59 47"/><path d="M59 31 L54 45"/><path d="M59 31 L64 45"/><path d="M59 47 L55 72"/><path d="M59 47 L63 72"/>'
    ] },
    generic: { beats: 2, frames: [
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 31 L51 45"/><path d="M60 31 L69 45"/><path d="M60 47 L55 73"/><path d="M60 47 L65 73"/>',
      '<circle cx="60" cy="21" r="5"/><path d="M60 26 L60 47"/><path d="M60 31 L48 42"/><path d="M60 31 L72 42"/><path d="M60 47 L55 73"/><path d="M60 47 L65 73"/>'
    ] },
    woodchop: { frames: [
      '<path class="p" d="M92 6 L92 74"/><circle class="p" cx="92" cy="10" r="3"/><circle cx="50" cy="24" r="5"/><path d="M52 29 L54 50"/><path d="M52 33 L74 14"/><path d="M54 50 L48 72"/><path d="M54 50 L60 72"/>',
      '<path class="p" d="M92 6 L92 74"/><circle class="p" cx="92" cy="10" r="3"/><circle cx="50" cy="24" r="5"/><path d="M52 29 L54 50"/><path d="M52 33 L30 58"/><path d="M54 50 L48 72"/><path d="M54 50 L60 72"/>'
    ] },
    latpulldown: { frames: [
      '<path class="p" d="M40 8 L80 8"/><path class="p" d="M60 8 L60 20"/><circle cx="60" cy="34" r="5"/><path d="M62 39 L62 56"/><path d="M62 42 L46 18"/><path d="M62 42 L78 18"/><path d="M62 56 L56 72"/><path d="M62 56 L68 72"/>',
      '<path class="p" d="M40 8 L80 8"/><path class="p" d="M60 8 L60 30"/><circle cx="60" cy="38" r="5"/><path d="M62 43 L62 58"/><path d="M62 45 L48 32"/><path d="M62 45 L76 32"/><path d="M62 58 L56 72"/><path d="M62 58 L68 72"/>'
    ] },
    benchpress: { beats: 2, frames: [
      '<path class="p" d="M30 60 L30 74"/><path class="p" d="M30 60 L58 46"/><circle cx="58" cy="40" r="5"/><path d="M60 44 L74 50"/><path class="p" d="M64 38 L86 38"/><path d="M74 50 L82 62"/>',
      '<path class="p" d="M30 60 L30 74"/><path class="p" d="M30 60 L58 46"/><circle cx="58" cy="40" r="5"/><path d="M60 44 L70 34"/><path class="p" d="M60 24 L82 24"/><path d="M70 34 L78 46"/>'
    ] },
    pushdown: { frames: [
      '<path class="p" d="M70 6 L70 30"/><circle class="p" cx="70" cy="8" r="3"/><circle cx="56" cy="24" r="5"/><path d="M58 29 L58 48"/><path d="M58 32 L70 30"/><path d="M58 48 L52 72"/><path d="M58 48 L64 72"/>',
      '<path class="p" d="M70 6 L70 30"/><circle class="p" cx="70" cy="8" r="3"/><circle cx="56" cy="24" r="5"/><path d="M58 29 L58 48"/><path d="M58 34 L72 48"/><path d="M58 48 L52 72"/><path d="M58 48 L64 72"/>'
    ] },
    legpress: { beats: 2, frames: [
      '<path class="p" d="M20 40 L20 74"/><path d="M20 55 L40 55"/><circle cx="46" cy="50" r="5"/><path d="M48 55 L58 60"/><path d="M58 60 L70 52"/><path d="M58 60 L66 70"/><path class="p" d="M78 40 L78 66"/>',
      '<path class="p" d="M20 40 L20 74"/><path d="M20 55 L40 55"/><circle cx="46" cy="50" r="5"/><path d="M48 55 L58 60"/><path d="M58 60 L86 56"/><path d="M58 60 L66 70"/><path class="p" d="M92 40 L92 62"/>'
    ] },
    hamcurl: { beats: 2, frames: [
      '<path class="p" d="M18 56 L70 56"/><circle cx="24" cy="50" r="5"/><path d="M30 54 L58 56"/><path d="M58 56 L86 60"/><path class="p" d="M86 60 L92 50"/>',
      '<path class="p" d="M18 56 L70 56"/><circle cx="24" cy="50" r="5"/><path d="M30 54 L58 56"/><path d="M58 56 L78 40"/><path class="p" d="M78 40 L86 32"/>'
    ] }
  };

  // Exact exercise-name → movement-archetype mapping for every entry in
  // GYM_FOCUS above. Names are matched verbatim (including the typographic
  // apostrophe/dash in Child's Pose and Foam Roll), so adding a new exercise
  // means adding a row here too — unmapped names fall back to 'generic'.
  var GYM_ANIM_MAP = {
    'Arm Circles & Leg Swings': 'armcircles',
    'Jumping Jacks': 'jack',
    'Plank Hold': 'plank',
    'Dead Bug': 'deadbug',
    'Jump Rope Intervals': 'jumprope',
    'Burpees': 'burpee',
    'Mountain Climbers': 'climber',
    'Rowing Machine Sprints': 'rower',
    'Rowing Machine Intervals': 'rower',
    'Battle Ropes': 'ropes',
    'Standing Quad Stretch': 'quadstretch',
    'Child’s Pose': 'childpose',
    'Deep Breathing Walk': 'walk',
    'Bodyweight Squats': 'squat',
    'Band Pull-Aparts (light)': 'bandpull',
    'Band Pull-Aparts': 'bandpull',
    'Pallof Press': 'bandpull',
    'Hollow Body Hold': 'hollow',
    'Squats': 'bbsquat',
    'Deadlifts': 'hinge',
    'Weighted Pull-Ups': 'pullup',
    'Pull-Ups': 'pullup',
    'Power Cleans': 'clean',
    'Box Jumps': 'boxjump',
    'Broad Jumps': 'broadjump',
    'Turkish Get-Up': 'getup',
    'Kettlebell Swings': 'swing',
    'Medicine Ball Slams': 'slam',
    'Hip Flexor Stretch': 'kneellunge',
    'Lat Stretch': 'sidelean',
    'Foam Roll — Thoracic Spine': 'foamroll',
    'Arm Circles': 'armcircles',
    'Side Plank': 'sideplank',
    'Side Plank with Leg Lift': 'sideplank',
    'Bird Dog': 'birddog',
    'Seated Cable Rows': 'rower',
    'Doorway Chest Stretch': 'cheststretch',
    'Cross-Body Shoulder Stretch': 'armacross',
    'Leg Swings': 'legswing',
    'Bulgarian Split Squats': 'lunge',
    'Glute Bridge Hold': 'bridge',
    'Pigeon Pose': 'pigeon',
    'Calf Stretch': 'calfstretch',
    'Cable Face Pulls (light warm-up sets)': 'bandpull',
    'Cable Face Pulls': 'bandpull',
    'Cable Woodchoppers': 'woodchop',
    'Lat Pulldowns': 'latpulldown',
    'Incline Bench Press': 'benchpress',
    'Cable Tricep Pushdowns': 'pushdown',
    'Goblet Squats (light warm-up sets)': 'squat',
    'Cable Pull-Throughs': 'hinge',
    'Barbell Squats': 'bbsquat',
    'Romanian Deadlifts': 'hinge',
    'Leg Press': 'legpress',
    'Hamstring Curl Machine': 'hamcurl',
    'Standing Calf Raise Machine': 'calfraise',
    'Leg Swings — Front & Lateral': 'legswing',
    'World’s Greatest Stretch': 'kneellunge',
    '90/90 Hip Switches': 'pigeon',
    'Deep Squat Hold (Mobility)': 'squat',
    'Lateral Bounds (Skater Jumps)': 'lunge',
    'Walking Lunges with Rotation': 'lunge',
    'Standing Forward Fold': 'hinge',
    'Seated Straddle Stretch': 'sidelean',
    'Thoracic Rotation Stretch (Open Book)': 'foamroll',
    // Plyometrics & Explosive Power — reuses existing jump/rotation/lunge
    // archetypes wherever the movement genuinely matches (Broad Jumps and Box
    // Jumps already existed as exact-name keys above from Full Body's own
    // sprint-block exercises). Ankle Pogo Hops, High Knees and Squat Jumps
    // have no dedicated archetype and are deliberately left unmapped here —
    // same disclosed generic-fallback trade-off Flexibility & Agility's
    // Agility Ladder/Cone Shuffle drills already established, not worth
    // hand-drawing three new one-off SVGs for.
    'Dynamic Walking Lunge with Reach': 'lunge',
    'Plank-to-Pike': 'plank',
    'Rotational Med Ball Throw': 'woodchop',
    'Rotational Med Ball Throws': 'woodchop',
    'Box Step-Off Depth Jumps': 'boxjump',
    'Depth Jumps (45cm Box)': 'boxjump',
    'Depth Jumps': 'boxjump',
    'Continuous Depth Jumps': 'boxjump',
    'Single-Leg Box Jumps': 'boxjump',
    'Single-Leg Bounds': 'lunge',
    'Step-Up Drives': 'lunge',
    'Continuous Broad Jumps': 'broadjump',
    'Standing Calf Stretch': 'calfstretch',
    // Second round of Plyometrics additions (one extra exercise per
    // orientation/level leaf) — same disclosed generic-fallback trade-off as
    // above for anything with no clean match (e.g. the two Jump Rope
    // variants and Pogo Jumps reuse 'jumprope'/generic rather than new SVGs).
    'Countermovement Jumps': 'boxjump',
    'Tuck Jumps': 'boxjump',
    '180° Jump Turns': 'boxjump',
    'Alternate-Leg Bounding': 'lunge',
    'Continuous Lateral Bounds': 'lunge',
    'Bounding for Distance': 'lunge',
    'Jump Rope — Endurance Bounce': 'jumprope',
    'Jump Rope — Basic Bounce': 'jumprope',
    // Swimmer-specific replacements for the generic filler that used to sit
    // in the Cardio/Upper/Plyometrics warm-ups and the Cardio main block
    // (Jumping Jacks, Arm Circles, High Knees, Burpees, Mountain Climbers).
    // Each maps to the existing archetype whose stick-figure pose genuinely
    // matches the movement — an overhead streamline jump reads as the
    // vertical-jump 'boxjump' figure, every band/cuff movement reads as
    // 'bandpull', and every loaded rotation reads as 'woodchop'.
    'Explosive Streamline Jumps': 'boxjump',
    'Streamline Jump Squats': 'boxjump',
    'Band Shoulder Dislocates': 'bandpull',
    'Band External Rotations (Rotator Cuff)': 'bandpull',
    'Burpee to Streamline Jump': 'burpee',
    'Med Ball Rotational Wall Throws': 'woodchop',
    'Med Ball Russian Twists': 'woodchop',
    'Landmine Rotations': 'woodchop',
    // ELITE DRYLAND OVERHAUL — the swimmer-specific movements that replaced
    // the generic gym filler. Three previously-unused archetypes finally get
    // their exact intended exercise: 'ytw' was drawn for Y-T-W-L raises,
    // 'pushup' for scapular push-ups, and 'climber' (orphaned when Mountain
    // Climbers was removed) is a genuine match for a VersaClimber. Everything
    // else reuses the archetype whose stick-figure pose actually matches the
    // movement — every banded shoulder/catch drill reads as 'bandpull', every
    // vertical jump as 'boxjump', every loaded barbell jump as 'clean', and
    // half-kneeling ankle work as 'kneellunge'.
    'Y-T-W-L Raises': 'ytw',
    'Scapular Push-Ups': 'pushup',
    'VersaClimber / Ski Erg Intervals': 'climber',
    'Banded Catch & Pull': 'bandpull',
    'Banded Catch & Pull (Explosive)': 'bandpull',
    'Ring / TRX Rows': 'rower',
    'Straight-Arm Lat Pulldowns': 'latpulldown',
    'Incline Dumbbell Press': 'benchpress',
    'Thoracic Spine Open-Ups': 'foamroll',
    'Ankle Mobility Rocks (Wall)': 'kneellunge',
    'Banded Ankle Distraction': 'kneellunge',
    'Trap Bar Jumps': 'clean',
    'Squat Jumps': 'boxjump',
    'Streamline Wall Push-Off Jumps': 'boxjump',
    'Ankle Pogo Hops': 'boxjump',
    'Lateral Bounds': 'lunge',
    'Bike Sprints (Seated)': 'rower'
  };

  function renderGymAnim(exerciseName) {
    var key = GYM_ANIM_MAP[exerciseName] || 'generic';
    var anim = GYM_ANIMS[key];
    var safeName = String(exerciseName).replace(/"/g, '&quot;');
    var frames = anim.frames.map(function (f, i) {
      return '<g data-frame="' + i + '"' + (i ? ' style="display:none"' : '') + '>' + f + '</g>';
    }).join('');
    return '<div class="gym-anim-frame" role="img" aria-label="Looping demonstration of ' + safeName + '">' +
      '<svg class="gym-anim" viewBox="0 0 120 80" data-frames="' + anim.frames.length + '" data-beats="' + (anim.beats || 1) + '" aria-hidden="true">' +
      '<line class="gym-anim-ground" x1="8" y1="74" x2="112" y2="74"/>' + frames + '</svg>' +
      '<span class="gym-anim-label">Technique demo</span></div>';
  }

  // One global flipbook clock drives every demo on screen. The frame index is
  // derived from the shared tick count (stateless per element), so a full
  // renderGym() re-render never desyncs anything and there's exactly one
  // timer no matter how many cards exist. Under prefers-reduced-motion the
  // timer never starts and each card shows its first pose as a static
  // form diagram.
  var gymAnimTick = 0;
  function advanceGymAnims() {
    // Real perf fix: this used to run unconditionally every 420ms for the
    // entire lifetime of the page, querying the whole document even while a
    // swimmer was on a completely different tab (or had never opened Gym at
    // all that session, in which case the querySelectorAll was merely wasted
    // rather than genuinely expensive) — bail out immediately unless Gym is
    // the actual visible tab, so this timer does real work only when its
    // animation is actually on screen.
    if (!dashboard || dashboard.getAttribute('data-active-tab') !== 'gym') return;
    gymAnimTick++;
    document.querySelectorAll('.gym-anim').forEach(function (svg) {
      var frameCount = parseInt(svg.getAttribute('data-frames'), 10) || 1;
      if (frameCount < 2) return;
      var beats = parseInt(svg.getAttribute('data-beats'), 10) || 1;
      var idx = Math.floor(gymAnimTick / beats) % frameCount;
      svg.querySelectorAll('[data-frame]').forEach(function (g) {
        g.style.display = parseInt(g.getAttribute('data-frame'), 10) === idx ? '' : 'none';
      });
    });
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setInterval(advanceGymAnims, 420);
  }

  // Visual muscle tags per exercise, derived from the exercise name via a
  // keyword map (same lightweight pattern as GYM_ANIM_MAP) so no per-row data
  // entry is needed across the whole GYM_FOCUS matrix. Returns up to 3 colored
  // {key,label} chips; key drives the chip's accent color in CSS. Falls back
  // to a plain "Full Body" tag when nothing specific matches.
  var MUSCLE_KEYWORDS = [
    { re: /pulldown|pull-?up|rows?\b|rowing|face pull|lat pull|lats\b|catch & pull|trx|ring \//i, key: 'back', label: 'Back / Lats' },
    // `push-?up` deliberately does NOT appear here: the only push-up variant
    // in the database is the Scapular Push-Up, which is a scapular-control
    // prehab drill, not a chest exercise — it's matched by the shoulders rule
    // below instead, which sits after this one and would otherwise be
    // shadowed by a "Chest" tag it doesn't deserve.
    { re: /bench|incline|chest|dumbbell press|\bdip\b/i, key: 'chest', label: 'Chest' },
    { re: /overhead press|shoulder|arm circle|band pull|rotator|cuff|dislocate|external rotation|scapular|y-t-w/i, key: 'shoulders', label: 'Shoulders' },
    { re: /tricep|pushdown|bicep|skull ?crusher/i, key: 'arms', label: 'Arms' },
    { re: /deadlift|romanian|hinge|pull-?through|kettlebell swing|good morning|turkish|get-?up/i, key: 'posterior', label: 'Posterior Chain' },
    { re: /hamstring|ham curl|leg curl/i, key: 'posterior', label: 'Hamstrings' },
    { re: /squat|lunge|leg press|split squat|step-?up|\bjumps?\b|bound|calf|leg extension|glute|trap bar|pogo/i, key: 'legs', label: 'Legs / Glutes' },
    { re: /plank|dead ?bug|hollow|pallof|bird dog|90\/90|woodchop|russian twist|hanging leg|v-?up|sit-?up|crunch|landmine|rotational|med ball/i, key: 'core', label: 'Core' },
    { re: /stretch|foam roll|mobility|child|cobra|pigeon|forward fold|straddle|open book|thoracic|hip flexor|cat-?cow|breathing|leg swing|world.s greatest|deep squat hold|distraction/i, key: 'mobility', label: 'Mobility' },
    { re: /jump rope|burpee|battle rope|ladder|cone|shuffle|skater|sprint|\bwalk|versaclimber|ski erg|climber|\berg\b/i, key: 'cardio', label: 'Conditioning' }
  ];
  function inferMuscleTags(name) {
    var tags = [];
    MUSCLE_KEYWORDS.forEach(function (m) {
      if (m.re.test(name) && !tags.some(function (t) { return t.key === m.key; })) tags.push({ key: m.key, label: m.label });
    });
    if (!tags.length) tags.push({ key: 'full', label: 'Full Body' });
    return tags.slice(0, 3);
  }

  function renderGymCard(g, tone, focusLabel, age, refMax) {
    var prescription = (age && age < 12) ? scaleDownPrescription(g.prescription) : g.prescription;
    var loadNote = '';
    if (g.weighted && refMax) {
      var pct = g.loadPct != null ? g.loadPct : 0.65;
      var suggested = Math.max(4, Math.round(refMax * pct / 2) * 2);
      loadNote = '<p style="color:var(--green-bright); font-size:0.82rem; margin-top:4px;">Suggested load: ~' + suggested + 'kg (' + Math.round(pct * 100) + '% of your listed max)</p>';
    }
    var muscleHtml = '<div class="gym-muscle-tags">' + inferMuscleTags(g.name).map(function (t) {
      return '<span class="muscle-tag" data-m="' + t.key + '">' + t.label + '</span>';
    }).join('') + '</div>';
    return '<article class="card gym-card" data-reveal>' +
      '<span class="tag tag-' + tone + '">' + focusLabel + '</span>' +
      '<h3 style="margin-top:12px">' + g.name + '</h3>' +
      muscleHtml +
      '<p class="prescription">' + prescription + '</p>' + loadNote +
      '<p class="cue">' + g.cue + '</p>' +
      renderGymAnim(g.name) +
      '</article>';
  }

  function renderGymPhase(phaseKey, exercises, tone, focusLabel, age, refMax) {
    var photo = GYM_PHASE_PHOTO[phaseKey];
    var bannerHtml = photo !== 'none' ? '<div class="gym-phase-banner" style="--photo:' + photo + '"></div>' : '';
    return '<div class="gym-phase" data-reveal>' +
      '<div class="gym-phase-head">' + bannerHtml +
      '<div class="gym-phase-title"><svg class="icon"><use href="#' + GYM_PHASE_ICON[phaseKey] + '"/></svg>' + GYM_PHASE_LABEL[phaseKey] + '</div></div>' +
      '<div class="grid grid-auto">' + exercises.map(function (g) { return renderGymCard(g, tone, focusLabel, age, refMax); }).join('') + '</div>' +
      '</div>';
  }

  function renderGym(focus) {
    currentGymFocus = focus;
    document.querySelectorAll('#gymFocusTabs [data-focus]').forEach(function (btn) {
      btn.setAttribute('aria-selected', btn.dataset.focus === focus ? 'true' : 'false');
    });
    var weeklyNote = document.getElementById('gymWeeklyFocusNote');
    if (weeklyNote) {
      weeklyNote.textContent = focus === thisWeeksGymFocus()
        ? 'This Week’s Focus: ' + GYM_LABEL[focus] + ' — cycles automatically every week; pick any tab above to train something else today.'
        : GYM_LABEL[focus] + ' (this week’s automatic focus is ' + GYM_LABEL[thisWeeksGymFocus()] + ').';
    }
    var tone = GYM_TONE[focus];
    var focusLabel = GYM_LABEL[focus];
    var age = parseInt(document.getElementById('gymAge').value, 10);
    var workingWeight = parseFirstNumber(document.getElementById('gymWorkingWeight').value);
    var strengthLimit = parseFirstNumber(document.getElementById('gymStrengthLimit').value);
    var refMax = strengthLimit || (workingWeight ? workingWeight * 1.15 : null);
    // Plyometrics automatically categorizes its main drills on TWO axes, not
    // just one: gymOrientation() (the swimmer's stated goal — same signal
    // Full Body already reads) picks WHICH drills, and state.level (the
    // Workout Generator's own beginner/competitive/elite tabs) picks HOW
    // advanced today's version of those drills is — a beginner never lands
    // on a true depth jump, only Competitive/Elite does.
    var isTwoAxisFocus = focus === 'full' || focus === 'plyometrics';
    var orientation = isTwoAxisFocus ? gymOrientation() : null;
    var routine = GYM_FOCUS[focus];
    var mainExercises = focus === 'full' ? routine.main[orientation]
      : focus === 'plyometrics' ? routine.main[orientation][state.level]
      : routine.main;

    document.getElementById('gymGrid').innerHTML =
      renderGymPhase('warmup', routine.warmup, tone, focusLabel, age, refMax) +
      renderGymPhase('core', routine.core, tone, focusLabel, age, refMax) +
      renderGymPhase('main', mainExercises, tone, focusLabel, age, refMax) +
      renderGymPhase('cooldown', routine.cooldown, tone, focusLabel, age, refMax);

    var gymNote = document.getElementById('gymNote');
    var notes = [];
    if (orientation) notes.push(GYM_ORIENTATION_LABEL[orientation] + '.');
    if (focus === 'plyometrics') notes.push('Drills additionally scaled for your ' + state.level + ' experience level — higher-CNS-demand variations (e.g. true depth jumps) unlock at Competitive and Elite.');
    if (age && age < 12) notes.push('Sets/reps trimmed — youth-appropriate volume for an 11-and-under athlete.');
    if (refMax) notes.push('Suggested loads use ' + (strengthLimit ? 'your strength limit' : 'your working weight') + ' (' + refMax.toFixed(0) + 'kg reference), scaled per exercise for power vs. endurance work.');
    if (notes.length) { gymNote.textContent = notes.join(' '); gymNote.style.display = 'block'; }
    else { gymNote.style.display = 'none'; }

    if (io) document.querySelectorAll('#gymGrid [data-reveal]').forEach(function (el) { io.observe(el); });
    else document.querySelectorAll('#gymGrid [data-reveal]').forEach(function (el) { el.classList.add('is-visible'); });

    var pdfBtn = document.getElementById('gymPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
  }

  document.getElementById('gymApplyBtn').addEventListener('click', function () { renderGym(currentGymFocus); });

  document.getElementById('gymFocusTabs').addEventListener('click', function (e) {
    var btn = e.target.closest('.pill-tab');
    if (!btn) return;
    this.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
    renderGym(btn.dataset.focus);
  });

  /* ============================= PDF WORKOUT EXPORT ============================= */
  // jsPDF is bundled inline (see the <script> tag near the top of the file,
  // right after the Paddle <script>) rather than lazy-loaded from a CDN —
  // a CDN fetch could be blocked by an ad-blocker, a corporate/school
  // network filter, or plain flakiness, any of which used to surface as a
  // generic "Could not generate the PDF right now" alert on Save-as-PDF with
  // no way to tell the network from a real bug. Bundling it removes that
  // whole failure class: the library is already present by the time this
  // script runs, so there is nothing left to fetch on click.
  (function wirePdfExport() {
    function loadJsPDF() {
      return (window.jspdf && window.jspdf.jsPDF)
        ? Promise.resolve(window.jspdf.jsPDF)
        : Promise.reject(new Error('jsPDF failed to initialize'));
    }

    function todayFileStamp() { return new Date().toISOString().slice(0, 10); }

    // Reads the already-rendered result panel's own DOM (rather than
    // recomputing the workout a second time) so the PDF always matches
    // exactly what's on screen.
    function extractStructuredWorkout(rootEl) {
      // Social-ready PDF: keep ONLY the core structure — stage, each set's
      // reps×distance + stroke, and the INTERVAL send-off (e.g. "4×200 @ 3:00").
      // The coaching blurbs (plan notes, per-block intents, technical tips) and
      // the rest/total clock figures are deliberately dropped for a clean,
      // glanceable, photo-ready card.
      var blocks = Array.prototype.map.call(rootEl.querySelectorAll('.workout-block'), function (block) {
        var titleEl = block.querySelector('.workout-block-title');
        var titleText = '';
        if (titleEl) {
          titleText = Array.prototype.filter.call(titleEl.childNodes, function (n) { return n.nodeType === 3; })
            .map(function (n) { return n.textContent; }).join('').trim();
        }
        var stage = block.getAttribute('data-stage') || '';
        var rows = [];
        var currentRound = null;
        Array.prototype.forEach.call(block.querySelectorAll('.round-label, .set-row'), function (child) {
          if (child.classList.contains('round-label')) { currentRound = child.textContent.trim(); return; }
          var titleNode = child.querySelector('.set-title');
          var full = titleNode ? titleNode.textContent.trim() : '';
          // FULL set description — no truncation. The whole set line (including
          // the technical execution notes after the em-dash) is kept so the
          // swimmer can read exact execution steps straight off the PDF; only
          // the "N x Dist" is normalized to a compact "N×Dist" glyph.
          var label = full.replace(/(\d)\s*[x×]\s*(\d)/g, '$1×$2').trim();
          // The single send-off interval, read from the ".set-sendoff" element
          // (its text is "@ 1:15"); strip the leading "@ " so the PDF renders it.
          var sendoffEl = child.querySelector('.set-sendoff');
          var interval = sendoffEl ? sendoffEl.textContent.replace(/^@\s*/, '').trim() : '';
          var paceEl = child.querySelector('.set-pace');
          rows.push({ round: currentRound, label: label, interval: interval, pace: paceEl ? paceEl.textContent.trim() : '' });
        });
        return { title: titleText, stage: stage, rows: rows };
      });
      return { blocks: blocks };
    }
    // Exposed so js/custom-workout.js (Live Split-Screen Workout Mode) can
    // build its flat, sequential set list from exactly what's already
    // rendered in #workoutResult — the identical "read the on-screen DOM,
    // never recompute" principle the PDF export above already established,
    // so Live Mode can never drift from what the swimmer is looking at.
    window.__extractStructuredWorkout = extractStructuredWorkout;

    function extractStructuredGym(rootEl) {
      var phases = Array.prototype.map.call(rootEl.querySelectorAll('.gym-phase'), function (phase) {
        var titleEl = phase.querySelector('.gym-phase-title');
        var exercises = Array.prototype.map.call(phase.querySelectorAll('.gym-card'), function (card) {
          var extraP = Array.prototype.find.call(card.querySelectorAll('p'), function (p) {
            return !p.classList.contains('prescription') && !p.classList.contains('cue');
          });
          return {
            name: card.querySelector('h3').textContent.trim(),
            prescription: card.querySelector('.prescription').textContent.trim(),
            load: extraP ? extraP.textContent.trim() : null,
            cue: card.querySelector('.cue').textContent.trim()
          };
        });
        return { title: titleEl ? titleEl.textContent.trim() : '', exercises: exercises };
      });
      return { phases: phases };
    }

    // ---- Social-ready dark "story" PDF theme, matching the SwimFit app ----
    // A 9:16 portrait "card" layout on a deep-slate background with neon stage
    // accents — photo-ready for an Instagram/TikTok story, not a plain A4 sheet.
    var PDF_PAGE = [720, 1280]; // 9:16 portrait
    // Strict monochrome "future-forward" export — matches the live site's
    // pure black/white/gray redesign exactly (no hue anywhere): a white
    // page, near-black ink, and every "accent" reduced to a distinct
    // lightness of gray rather than a color, so the 4 workout stages / gym
    // phases still read as visually distinct without breaking the
    // monochrome rule.
    var PDF = {
      bg: [255, 255, 255], card: [255, 255, 255], border: [222, 222, 222],
      ink: [10, 10, 10], muted: [90, 90, 90], dim: [140, 140, 140],
      accent1: [10, 10, 10], accent2: [90, 90, 90], accent3: [40, 40, 40],
      accent4: [130, 130, 130], black: [0, 0, 0]
    };
    var STAGE_RGB = { warmup: PDF.accent2, preset: PDF.accent4, main: PDF.accent1, cooldown: PDF.accent3 };

    // Registers the real site fonts (Orbitron for the display wordmark,
    // Plus Jakarta Sans for everything else) into this jsPDF document —
    // base64 TTF data lives in js/pdf-fonts.js (loaded before this file),
    // fetched once from Google Fonts and committed directly here per this
    // repo's own "bundle it, no CDN dependency" precedent (see jsPDF
    // itself, bundled inline in index.html). Falls back to jsPDF's built-in
    // Helvetica if that file somehow isn't loaded, so a PDF can never fail
    // to generate over a missing font.
    var PDF_FONTS_READY = false;
    function registerPdfFonts(doc) {
      var F = window.__PDF_FONTS;
      if (!F) return false;
      try {
        doc.addFileToVFS('Orbitron-Bold.ttf', F.orbitronBold);
        doc.addFont('Orbitron-Bold.ttf', 'Orbitron', 'bold');
        doc.addFileToVFS('PlusJakartaSans-Regular.ttf', F.jakartaRegular);
        doc.addFont('PlusJakartaSans-Regular.ttf', 'PlusJakartaSans', 'normal');
        doc.addFileToVFS('PlusJakartaSans-Bold.ttf', F.jakartaBold);
        doc.addFont('PlusJakartaSans-Bold.ttf', 'PlusJakartaSans', 'bold');
        return true;
      } catch (e) {
        return false;
      }
    }
    function pdfSetFont(doc, weight) {
      if (PDF_FONTS_READY) doc.setFont('PlusJakartaSans', weight === 'bold' ? 'bold' : 'normal');
      else doc.setFont('helvetica', weight === 'bold' ? 'bold' : 'normal');
    }
    function pdfSetDisplayFont(doc) {
      if (PDF_FONTS_READY) doc.setFont('Orbitron', 'bold');
      else doc.setFont('helvetica', 'bold');
    }

    function pdfFillPage(doc) {
      var w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
      doc.setFillColor(PDF.bg[0], PDF.bg[1], PDF.bg[2]); doc.rect(0, 0, w, h, 'F');
      // Single black top accent band — monochrome, matching the live site's
      // strict black/white/gray redesign (no hue anywhere in this export).
      doc.setFillColor(PDF.black[0], PDF.black[1], PDF.black[2]); doc.rect(0, 0, w, 9, 'F');
    }
    function pdfWordmarkHeader(doc, subtitle) {
      pdfFillPage(doc);
      var w = doc.internal.pageSize.getWidth();
      var hx = 46, hy = 78;
      pdfSetDisplayFont(doc); doc.setFontSize(34);
      doc.setTextColor(PDF.black[0], PDF.black[1], PDF.black[2]); doc.text('SWIM', hx, hy);
      var ww = doc.getTextWidth('SWIM');
      doc.setTextColor(PDF.dim[0], PDF.dim[1], PDF.dim[2]); doc.text('FIT', hx + ww + 2, hy);
      if (subtitle) {
        pdfSetFont(doc, 'normal'); doc.setFontSize(12.5);
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.text(subtitle, hx, hy + 24);
      }
      doc.setDrawColor(PDF.border[0], PDF.border[1], PDF.border[2]); doc.setLineWidth(1);
      doc.line(hx, hy + 40, w - hx, hy + 40);
      return hy + 68;
    }
    function pdfStoryFooter(doc) {
      var w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
      var n = doc.internal.getNumberOfPages();
      for (var p = 1; p <= n; p++) {
        doc.setPage(p);
        pdfSetFont(doc, 'bold'); doc.setFontSize(11);
        doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
        doc.text('swimfit.online', w / 2, h - 30, { align: 'center' });
      }
    }
    // Draws one accent-railed stage card (white fill + a subtle hairline
    // border, since white-on-white needs a drawn edge to read as a card at
    // all) and returns the new y below it.
    function pdfStageCard(doc, opts) {
      var pageW = doc.internal.pageSize.getWidth();
      var marginX = 46, cardX = marginX, cardW = pageW - marginX * 2;
      var accent = opts.accent;
      doc.setFillColor(PDF.card[0], PDF.card[1], PDF.card[2]);
      doc.setDrawColor(PDF.border[0], PDF.border[1], PDF.border[2]); doc.setLineWidth(1);
      doc.roundedRect(cardX, opts.y, cardW, opts.height, 16, 16, 'FD');
      doc.setFillColor(accent[0], accent[1], accent[2]);
      doc.roundedRect(cardX, opts.y + 10, 6, opts.height - 20, 3, 3, 'F');
      var tx = cardX + 26, ty = opts.y + 36;
      pdfSetFont(doc, 'bold'); doc.setFontSize(18);
      doc.setTextColor(accent[0], accent[1], accent[2]);
      doc.text(String(opts.title).toUpperCase(), tx, ty);
      if (opts.badge) {
        pdfSetFont(doc, 'bold'); doc.setFontSize(11);
        doc.setTextColor(PDF.dim[0], PDF.dim[1], PDF.dim[2]);
        doc.text(opts.badge, cardX + cardW - 22, ty, { align: 'right' });
      }
      return { tx: tx, cardX: cardX, cardW: cardW, ry: ty + 30 };
    }

    function buildWorkoutPdf(jsPDFCtor, data) {
      var doc = new jsPDFCtor({ unit: 'pt', format: PDF_PAGE, orientation: 'portrait' });
      PDF_FONTS_READY = registerPdfFonts(doc);
      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var marginX = 46;
      var subtitle;
      try {
        subtitle = state.disciplines.map(strokeLabelSingle).join(' + ') + '   ·   ' + formatDistanceM(state.distance, 1) +
          '   ·   ' + new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      } catch (e) { subtitle = new Date().toLocaleDateString(); }
      var y = pdfWordmarkHeader(doc, subtitle);

      function ensureSpace(need) {
        if (y + need > pageH - 60) { doc.addPage(); pdfFillPage(doc); y = 60; }
      }

      var headH = 66, roundH = 24, padB = 20, lineLead = 16, rowGap = 9;

      data.blocks.forEach(function (block) {
        var accent = STAGE_RGB[block.stage] || PDF.accent1;
        var cardX = marginX, cardW = pageW - marginX * 2;
        // The interval sits on the FIRST line of each set; reserve room for it.
        var labelW = cardW - 26 - 92;

        // Pre-measure so the card background can be drawn at the correct height
        // BEFORE the (multi-line, full-length) text is rendered on top of it.
        pdfSetFont(doc, 'bold'); doc.setFontSize(12);
        var lastR = null, height = headH, measured = [];
        block.rows.forEach(function (r) {
          var roundBefore = (r.round && r.round !== lastR) ? r.round : null;
          if (roundBefore) lastR = r.round;
          var lines = doc.splitTextToSize(r.label, labelW);
          var rowH = lines.length * lineLead + rowGap;
          measured.push({ r: r, lines: lines, rowH: rowH, roundBefore: roundBefore });
          height += (roundBefore ? roundH : 0) + rowH;
        });
        height += padB;

        function renderRows(startY, tx, contentRight) {
          var ry = startY;
          measured.forEach(function (m) {
            if (m.roundBefore) {
              pdfSetFont(doc, 'bold'); doc.setFontSize(9.5);
              doc.setTextColor(PDF.dim[0], PDF.dim[1], PDF.dim[2]);
              doc.text(String(m.roundBefore).toUpperCase(), tx, ry);
              ry += roundH;
            }
            if (m.r.interval) {
              pdfSetFont(doc, 'bold'); doc.setFontSize(12);
              doc.setTextColor(accent[0], accent[1], accent[2]);
              doc.text('@ ' + m.r.interval, contentRight, ry, { align: 'right' });
            }
            pdfSetFont(doc, 'bold'); doc.setFontSize(12);
            doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
            m.lines.forEach(function (ln, i) { doc.text(ln, tx, ry + i * lineLead); });
            ry += m.lines.length * lineLead + rowGap;
          });
          return ry;
        }

        var usable = pageH - 60 - 60;
        if (height <= usable) {
          ensureSpace(height + 16);
          var c = pdfStageCard(doc, { y: y, height: height, title: block.title, accent: accent });
          renderRows(c.ry, c.tx, c.cardX + c.cardW - 22);
          y += height + 16;
        } else {
          // Extremely long block (rare): render header + rows with per-row
          // pagination and no single background card, so full text is never
          // clipped even if it spans more than one page.
          ensureSpace(headH);
          pdfSetFont(doc, 'bold'); doc.setFontSize(18);
          doc.setTextColor(accent[0], accent[1], accent[2]);
          doc.text(String(block.title).toUpperCase(), marginX + 26, y + 36);
          y += headH;
          measured.forEach(function (m) {
            ensureSpace((m.roundBefore ? roundH : 0) + m.rowH);
            if (m.roundBefore) {
              pdfSetFont(doc, 'bold'); doc.setFontSize(9.5);
              doc.setTextColor(PDF.dim[0], PDF.dim[1], PDF.dim[2]);
              doc.text(String(m.roundBefore).toUpperCase(), marginX + 26, y); y += roundH;
            }
            if (m.r.interval) {
              pdfSetFont(doc, 'bold'); doc.setFontSize(12);
              doc.setTextColor(accent[0], accent[1], accent[2]);
              doc.text('@ ' + m.r.interval, pageW - marginX - 22, y, { align: 'right' });
            }
            pdfSetFont(doc, 'bold'); doc.setFontSize(12);
            doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
            m.lines.forEach(function (ln, i) { doc.text(ln, marginX + 26, y + i * lineLead); });
            y += m.lines.length * lineLead + rowGap;
          });
          y += 16;
        }
      });

      pdfStoryFooter(doc);
      return doc;
    }

    function buildGymPdf(jsPDFCtor, data, focusLabel) {
      var doc = new jsPDFCtor({ unit: 'pt', format: PDF_PAGE, orientation: 'portrait' });
      PDF_FONTS_READY = registerPdfFonts(doc);
      var pageW = doc.internal.pageSize.getWidth();
      var pageH = doc.internal.pageSize.getHeight();
      var marginX = 46;
      var subtitle = focusLabel + '   ·   ' + new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      var y = pdfWordmarkHeader(doc, subtitle);
      var phaseAccents = [PDF.accent1, PDF.accent4, PDF.accent2, PDF.accent3];
      var headH = 66, padB = 20, nameLead = 16, cueLead = 14, exGap = 12;

      function ensureSpace(need) {
        if (y + need > pageH - 60) { doc.addPage(); pdfFillPage(doc); y = 60; }
      }

      data.phases.forEach(function (phase, pi) {
        var accent = phaseAccents[pi % phaseAccents.length];
        var cardX = marginX, cardW = pageW - marginX * 2;
        var textW = cardW - 26 - 90;

        // Pre-measure: name (1 line) + FULL wrapped cue lines + load line.
        pdfSetFont(doc, 'normal'); doc.setFontSize(10.5);
        var height = headH, measured = [];
        phase.exercises.forEach(function (ex) {
          var cueLines = ex.cue ? doc.splitTextToSize(ex.cue, textW + 60) : [];
          var loadH = ex.load ? cueLead : 0;
          var exH = nameLead + (cueLines.length * cueLead) + loadH + exGap;
          measured.push({ ex: ex, cueLines: cueLines, exH: exH, loadH: loadH });
          height += exH;
        });
        height += padB;

        ensureSpace(Math.min(height, pageH - 120) + 16);
        var c = pdfStageCard(doc, { y: y, height: height, title: phase.title, accent: accent });
        var ry = c.ry;
        measured.forEach(function (m) {
          // Exercise name (left) + prescription (right, accent).
          pdfSetFont(doc, 'bold'); doc.setFontSize(12.5);
          doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
          var nameLines = doc.splitTextToSize(m.ex.name, textW);
          doc.text(nameLines[0], c.tx, ry);
          pdfSetFont(doc, 'bold'); doc.setFontSize(12);
          doc.setTextColor(accent[0], accent[1], accent[2]);
          doc.text(m.ex.prescription, c.cardX + c.cardW - 22, ry, { align: 'right' });
          ry += nameLead;
          if (m.ex.load) {
            pdfSetFont(doc, 'bold'); doc.setFontSize(9.5);
            doc.setTextColor(PDF.dim[0], PDF.dim[1], PDF.dim[2]);
            doc.text(m.ex.load, c.tx, ry); ry += cueLead;
          }
          if (m.cueLines.length) {
            pdfSetFont(doc, 'normal'); doc.setFontSize(10.5);
            doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
            m.cueLines.forEach(function (ln, i) { doc.text(ln, c.tx, ry + i * cueLead); });
            ry += m.cueLines.length * cueLead;
          }
          ry += exGap;
        });
        y += height + 16;
      });

      pdfStoryFooter(doc);
      return doc;
    }

    function wireButton(btn, buildFn) {
      if (!btn) return;
      btn.addEventListener('click', function () {
        var original = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Preparing PDF…';
        loadJsPDF().then(function (jsPDFCtor) {
          buildFn(jsPDFCtor);
        }).catch(function () {
          alert('Could not generate the PDF right now — please try again.');
        }).finally(function () {
          btn.disabled = false;
          btn.innerHTML = original;
        });
      });
    }

    wireButton(document.getElementById('workoutPdfBtn'), function (jsPDFCtor) {
      var data = extractStructuredWorkout(document.getElementById('workoutResult'));
      buildWorkoutPdf(jsPDFCtor, data).save('swimfit-swim-workout-' + todayFileStamp() + '.pdf');
    });
    wireButton(document.getElementById('gymPdfBtn'), function (jsPDFCtor) {
      var data = extractStructuredGym(document.getElementById('gymGrid'));
      buildGymPdf(jsPDFCtor, data, GYM_LABEL[currentGymFocus]).save('swimfit-gym-' + currentGymFocus + '-' + todayFileStamp() + '.pdf');
    });
  })();

  /* ============================= SWIM GENERATOR STUDIO (dedicated view) =============================
     Mirrors the Custom Workout Builder's own Studio overlay
     (js/custom-workout.js's openWorkoutStudio()/closeWorkoutStudio()) —
     opened from the Workouts Hub's "Launch Workout Generator" card,
     closed via its own Back button. Reuses the same 'workout-studio-
     active' body class that overlay already established for locking
     scroll (safe to share: the two overlays are mutually exclusive, both
     only ever reachable from the Hub, never from inside one another) and
     the same Escape-to-close precedent, gated so it only fires when this
     is genuinely the topmost overlay — Live Workout Mode (z-index 480)
     sits above both Studio-family overlays (470) and owns Escape while
     it's open. No "unsaved draft" confirm is needed on Back, unlike the
     Builder's Studio — there's no draft concept here, the generator's
     own config just persists to localStorage as it always has. */
  (function wireSwimGeneratorStudio() {
    var overlay = document.getElementById('swimGeneratorStudioOverlay');
    var openBtn = document.getElementById('openSwimGeneratorBtn');
    var backBtn = document.getElementById('swimGeneratorBackBtn');
    if (!overlay || !openBtn) return;

    function openStudio() {
      overlay.hidden = false;
      document.body.classList.add('workout-studio-active');
    }
    function closeStudio() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.body.classList.remove('workout-studio-active');
    }
    openBtn.addEventListener('click', openStudio);
    if (backBtn) backBtn.addEventListener('click', closeStudio);
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden || e.key !== 'Escape') return;
      var liveOverlay = document.getElementById('liveWorkoutOverlay');
      if (liveOverlay && !liveOverlay.hidden) return; // Live Mode owns Escape while it's on top
      closeStudio();
    });
    document.addEventListener('swimfit:authchange', function (e) {
      if (!e.detail.user) closeStudio();
    });
  })();

  /* ============================= GYM STUDIO (dedicated view) =============================
     Same pattern as wireSwimGeneratorStudio() above, opened from the Gym
     Hub's ONE consolidated "Gym & Dryland Studio" card. The Hub used to
     have two cards, but both always opened this identical overlay —
     there's only one underlying Gym system (Strength Profile + Target
     Focus tabs driving one shared #gymGrid board) — so the second card
     was a focus-tab shortcut, not a separate feature. Consolidated at the
     user's request; strength AND plyometrics prescriptions are both
     reached from the focus tabs inside this one studio. openStudio()
     keeps its optional `focus` argument (unused by the single card, which
     opens on whatever focus is already current) so a future entry point
     can still deep-link straight to a focus without re-adding plumbing. */
  (function wireGymStudio() {
    var overlay = document.getElementById('gymStudioOverlay');
    var openBtn = document.getElementById('openGymStrengthBtn');
    var backBtn = document.getElementById('gymStudioBackBtn');
    if (!overlay || !openBtn) return;

    function openStudio(focus) {
      overlay.hidden = false;
      document.body.classList.add('workout-studio-active');
      if (focus) {
        var tabs = document.getElementById('gymFocusTabs');
        var target = tabs && tabs.querySelector('.pill-tab[data-focus="' + focus + '"]');
        if (target) {
          tabs.querySelectorAll('.pill-tab').forEach(function (b) { b.setAttribute('aria-selected', b === target ? 'true' : 'false'); });
          renderGym(focus);
        }
      }
    }
    function closeStudio() {
      if (overlay.hidden) return;
      overlay.hidden = true;
      document.body.classList.remove('workout-studio-active');
    }
    openBtn.addEventListener('click', function () { openStudio(); });
    if (backBtn) backBtn.addEventListener('click', closeStudio);
    document.addEventListener('keydown', function (e) {
      if (overlay.hidden || e.key !== 'Escape') return;
      var liveOverlay = document.getElementById('liveWorkoutOverlay');
      if (liveOverlay && !liveOverlay.hidden) return; // Live Mode owns Escape while it's on top
      closeStudio();
    });
    document.addEventListener('swimfit:authchange', function (e) {
      if (!e.detail.user) closeStudio();
    });
  })();

