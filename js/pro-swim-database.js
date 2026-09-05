/* =====================================================================
   PRO SWIM DATABASE — derived pattern library
   =====================================================================
   WHERE THIS COMES FROM, AND WHY IT IS A SEPARATE FILE.

   js/abu-dhabi-aquatics-database.js is a TRANSCRIPTION ARCHIVE — real
   Abu Dhabi Aquatics Club sessions (Coach Sherif Zakaria) copied out
   verbatim, distance for distance, and deliberately kept that way so
   the source record stays clean.

   THIS file is the DERIVED PATTERN LIBRARY built from a further batch of
   real elite ADAC session sheets (Mesocycle 1 "Aerobic Development"
   Week 6 Days 1-3, and Mesocycle 2 "Speed Development" Week 8 Days 2-3).
   Each entry below generalises one real STRUCTURE from those sheets into
   a build() that scales to whatever distance the swimmer actually chose —
   the same "real structure, not just real words" standard the swiML and
   ADAC blueprints already hold to. The `source` field on every entry
   names the exact session the shape came from.

   WHY IT EXISTS AT ALL: before this file, the generator drew from 7
   Warm-Up blueprints, 12 Pre-Set archetypes, ~9 Speed / ~10 Endurance /
   ~6 Technique Main Set archetypes — and a COMPLETELY HARDCODED
   Cool-Down (the identical three lines every single session, forever).
   On a single-goal day the effective pool was far smaller still (a Speed
   day only ever saw 8 Pre-Sets and ~9 Main Sets). That is genuinely too
   shallow to read as a rotation, which is exactly what was reported.

   PRO TERMINOLOGY used verbatim in the labels below, as the coach writes
   it (see ADAC_GLOSSARY in the transcription archive for the full list):
     Cho = choice stroke        MS = main stroke
     BE3/5/7/9 = breathe every 3/5/7/9 strokes (hypoxic ladder)
     IMO = IM order             RIM/RIMO = reverse IM order
     OTB = off the blocks       UWK = underwater kick
     SL = streamline            SC = stroke count
     SWOLF = strokes + time     DPS = distance per stroke
     L-Pos = side/lateral kick position   11-Pos = both arms extended
     r:10 = rest 10 seconds     "desce to strong" = descend to strong

   CONTRACT: every build() below uses the exact
   (shareM, pace100, scaler, nextStroke, equipment) signature every native
   archetype in workout-generator.js already uses and returns
   [{label, sets}, ...] rounds, so it runs through the identical
   buildToShare() distance-accuracy machinery with zero special-casing.
   Cool-Down blueprints are the one exception — they return a FLAT array
   of sets (the Cool-Down's own existing shape) sized against a budget
   that is already exact, since the Cool-Down is what reconciles the
   grand total.

   buildSet / splitProportional / splitShareEqual / roundCountFor /
   paceBand / pickOne / workoutRng are real globals defined in
   workout-generator.js (no wrapping IIFE there). Safe to call here
   because these build() functions are only ever INVOKED later, once
   generateWorkout() runs, by which time that file has fully loaded.
   ===================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // EQUIPMENT-AWARE DRILL + KICK PHRASES
  // Real drill vocabulary off the session sheets. Gear is named in the
  // phrase itself where the real session named it; the blueprint's own
  // gear array is what actually drives the rendered gear chips, so a
  // swimmer without that item still gets a usable line.
  // ---------------------------------------------------------------------
  window.PRO_WARMUP_DRILL_PHRASES = [
    'Catch-Up — one hand waits at full extension until the other touches it',
    'Fist Freestyle — fists closed the whole length, forearm does the catch',
    'Fingertip Drag — high elbow recovery, fingertips tracing the surface',
    'IM Transitions — last 5m of one stroke into the first 5m of the next',
    'RIM drill/swim — reverse IM order, 25 drill then 25 swim',
    'IMO drill/swim — IM order, 25 drill then 25 swim',
    'Ankle Pull — band at the ankles, no kick, hold the hips up',
    'Scull / Drill / Swim by 25 — three ways to feel the same catch',
    '11-Pos w/Snorkel — both arms extended, rotate around a still head',
    'L-Pos w/Snorkel — one arm extended, kick on your side, eyes down',
    'Single-Arm w/Paddle — one paddle only, feel which arm actually pulls',
    'Pull w/Buoy + Paddles — long and heavy, hold pressure the whole pull',
    'Doggy Paddle to Full Stroke — 12 short catches, then 12 full strokes',
    'Head-Up Polo to Freestyle — 12.5m heads-up, 12.5m normal, same tempo',
    '3 Strokes / 3 Kicks — three strokes, pause on your side for three kicks',
    'Broken Arrow — one arm freestyle, one arm butterfly, switch each 25',
    'Sculling Ladder — front scull 25, mid scull 25, hip scull 25, swim 25',
    'Low SC Swim — count strokes, then repeat the length one stroke lower'
  ];

  window.PRO_WARMUP_KICK_PHRASES = [
    'Kick — L-Pos side kick, one arm extended, breathe to the side every 6',
    'Kick — SL-Pos on your back, arms locked overhead, dolphin from the hips',
    'Kick — w/Snorkel 11-Pos, both arms extended, head completely still',
    'Kick — board out front, last 25 of every rep strong',
    'Kick — vertical kick 20s hands out, 20s elbows out, 10s streamline',
    'Kick — w/Fins, 6 UWK off every wall then long flutter',
    'Kick — FLY kick on your side, small and fast, no knee bend',
    'Kick — build by 25 inside every rep: easy, moderate, strong, fast',
    'Kick — BR whip kick w/board, count kicks, cover more per kick',
    'Kick — 25 no board head down / 25 board out front, same tempo',
    'Kick — arms slow / kick FAST, swim the arms but drive the legs',
    'Kick — descend 1-4, last one at race-leg effort'
  ];

  // ---------------------------------------------------------------------
  // WARM-UP STRUCTURAL BLUEPRINTS
  // Each is a genuinely different SHAPE — block count, order, and the
  // rep/distance relationship between blocks all differ, not just the
  // label text on the same three lines.
  // ---------------------------------------------------------------------
  window.PRO_WARMUP_BLUEPRINTS = [
    {
      name: 'Five-Line Rotation',
      source: 'M2 Speed Dev, Week 8 Day 3 — 5x200 swim/kick/pull/IM drill/scull-swim',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: five equal reps, each a completely different
        // modality — swim, kick, pull, IM drill, scull-into-swim.
        var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
        var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
        var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
        var repM = Math.max(100, Math.round((shareM / 5) / 50) * 50);
        var pullGear = [];
        if (hasBuoy) pullGear.push('Pull Buoy');
        if (hasPaddles) pullGear.push('Hand Paddles');
        var opener = buildSet(1, repM, 'FR swim, settle the stroke', [], pace100 + 15, 15, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        return [
          { label: null, sets: [opener] },
          { label: 'Kick', sets: [buildSet(1, repM, 'Kick — steady, tight streamline off every wall', hasKickboard ? ['Kickboard'] : [], pace100 + 20, 20, scaler, 'Kick')] },
          { label: 'Pull', sets: [buildSet(1, repM, 'FR pull, hold pressure through the whole catch', pullGear, pace100 + 8, 15, scaler, 'Easy Pace')] },
          { label: 'IM Drill', sets: [buildSet(Math.max(2, Math.round(repM / 50)), 50, 'IMO drill/swim — 25 drill, 25 swim', [], pace100 + 12, 15, scaler, 'Drill Pace')] },
          { label: 'Scull to Swim', sets: [buildSet(Math.max(2, Math.round(repM / 50)), 50, 'Scull 25 into swim 25, keep the catch you just found', [], pace100 + 12, 15, scaler, 'Drill Pace')] }
        ];
      },
      intents: [
        'Five equal reps, five completely different jobs — swim, kick, pull, IM drill, and scull-into-swim. Every system that has to work later gets touched once here, instead of a single easy swim doing all the warming up.'
      ]
    },
    {
      name: 'Kick-Ladder Opener',
      source: 'M2 Speed Dev, Week 8 Day 2 — 300 Cho / 3x100 kick last 25-50-75 strong / 4x50 IMO',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: choice opener, then a kick line where the STRONG
        // portion of each rep grows (last 25, then last 50, then last 75),
        // then an IM-order drill/swim line.
        var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
        var fr = splitProportional(shareM, [0.4, 0.36, 0.24]);
        var opener = buildSet(1, Math.max(100, fr[0]), 'FR Cho, easy and long', [], pace100 + 15, 15, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        var kickRepM = Math.max(50, Math.round((fr[1] / 3) / 25) * 25);
        return [
          { label: null, sets: [opener] },
          {
            label: 'Kick — growing strong finish',
            sets: [
              buildSet(1, kickRepM, 'Kick — last 25 strong', hasKickboard ? ['Kickboard'] : [], pace100 + 20, 20, scaler, 'Kick'),
              buildSet(1, kickRepM, 'Kick — last 50 strong', hasKickboard ? ['Kickboard'] : [], pace100 + 18, 20, scaler, 'Kick'),
              buildSet(1, kickRepM, 'Kick — last 75 strong', hasKickboard ? ['Kickboard'] : [], pace100 + 16, 20, scaler, 'Kick')
            ]
          },
          { label: 'IMO Drill/Swim', sets: [buildSet(Math.max(4, Math.round(fr[2] / 50)), 50, 'IMO drill/swim — 25 drill, 25 swim', [], pace100 + 12, 15, scaler, 'Drill Pace')] }
        ];
      },
      intents: [
        'A choice opener into a kick line where the strong portion grows rep by rep — last 25, last 50, last 75 — so the legs are genuinely awake before the IM-order drill line, rather than a single flat kick set.'
      ]
    },
    {
      name: 'Ankle-Pull Opener',
      source: 'M1 Aerobic Dev, Week 6 Day 1 — 300 Cho / 6x50 ankle pull / 200 RIM / 4x25 Cho FAST',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: choice opener, ankle-band pull line alternating
        // stroke odd/even, reverse-IM drill/swim, then a short FAST
        // choice-drill line to wake the nervous system.
        var fr = splitProportional(shareM, [0.34, 0.26, 0.24, 0.16]);
        var opener = buildSet(1, Math.max(100, fr[0]), 'FR Cho, easy', [], pace100 + 15, 15, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        return [
          { label: null, sets: [opener] },
          { label: 'Ankle Pull', sets: [buildSet(Math.max(4, Math.round(fr[1] / 50)), 50, 'Ankle pull — odd FR / even BK, hips high, no kick', [], pace100 + 10, 15, scaler, 'Drill Pace')] },
          { label: 'RIM Drill/Swim', sets: [buildSet(Math.max(2, Math.round(fr[2] / 50)), 50, 'RIM drill/swim — reverse IM order by 25', [], pace100 + 12, 15, scaler, 'Drill Pace')] },
          { label: 'Cho Drill FAST', sets: [buildSet(Math.max(4, Math.round(fr[3] / 25)), 25, 'Cho drill FAST — BK 8-spin, BR & FLY on a FR kick', [], pace100 + 2, 25, scaler, 'Cruise Pace')] }
        ];
      },
      intents: [
        'The club\'s own aerobic-block opener: an easy choice swim, an ankle-band pull line that forces the upper body to hold the body line alone, reverse-IM drill work, and a short FAST drill line so the warm-up finishes sharp rather than sleepy.'
      ]
    },
    {
      name: 'Swim / Kick / Pull BE3',
      source: 'M1 Aerobic Dev, Week 6 Day 2 — 3x200 swim/kick/pull BE3 / 3x100 K / 8x25 ankle pull',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: one distance repeated three ways under a breathing
        // restriction, then a kick line with a growing strong finish, then
        // short ankle-pull 25s across all four strokes.
        var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
        var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
        var fr = splitProportional(shareM, [0.46, 0.32, 0.22]);
        var repM = Math.max(100, Math.round((fr[0] / 3) / 50) * 50);
        var swimSet = buildSet(1, repM, 'FR swim BE3 — breathe every 3', [], pace100 + 12, 15, scaler, 'Easy Pace');
        swimSet.stroke = 'Freestyle';
        return [
          {
            label: 'Swim / Kick / Pull — BE3',
            sets: [
              swimSet,
              buildSet(1, repM, 'Kick — steady, breathe every 3 off the board', hasKickboard ? ['Kickboard'] : [], pace100 + 20, 20, scaler, 'Kick'),
              buildSet(1, repM, 'FR pull BE3 — long, quiet, hips up', hasBuoy ? ['Pull Buoy'] : [], pace100 + 10, 15, scaler, 'Easy Pace')
            ]
          },
          { label: 'Kick — strong finish', sets: [buildSet(Math.max(2, Math.round(fr[1] / 100)), 100, 'Kick — last 25/50/75 strong, growing each rep', hasKickboard ? ['Kickboard'] : [], pace100 + 18, 20, scaler, 'Kick')] },
          { label: 'Ankle Pull — all four', sets: [buildSet(Math.max(4, Math.round(fr[2] / 25)), 25, 'Ankle pull — two of each stroke, hips high', [], pace100 + 8, 15, scaler, 'Drill Pace')] }
        ];
      },
      intents: [
        'One distance swum three ways — swim, kick, pull — all under a breathe-every-3 restriction, so the warm-up doubles as early aerobic and breathing-control work before the kick and ankle-pull lines finish it off.'
      ]
    },
    {
      name: 'Fins Underwater Opener',
      source: 'M1 Aerobic Dev, Week 6 Day 3 — 400 w/fins every 4th 25 UW / 200 scull-drill-swim',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: one long continuous fins swim with an underwater
        // length every fourth 25, then a scull/drill/swim rotation by 25.
        var hasFins = equipment && equipment.indexOf('Fins') > -1;
        var fr = splitProportional(shareM, [0.62, 0.38]);
        var opener = buildSet(1, Math.max(100, fr[0]), 'FR long swim — every 4th 25 fully underwater, tight SL', hasFins ? ['Fins'] : [], pace100 + 12, 20, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        return [
          { label: null, sets: [opener] },
          { label: 'Scull / Drill / Swim', sets: [buildSet(Math.max(2, Math.round(fr[1] / 75)), 75, 'Scull 25 / drill 25 / swim 25 — carry the catch through all three', [], pace100 + 12, 15, scaler, 'Drill Pace')] }
        ];
      },
      intents: [
        'A single long fins swim with an underwater length every fourth 25 — real streamline and breath-control work folded into the opener itself — then a scull/drill/swim rotation to carry that same catch into full stroke.'
      ]
    },
    {
      name: 'Descending Choice Ladder',
      source: 'Derived from the club\'s recurring "desce to strong" ladder pattern',
      build: function (shareM, pace100, scaler, nextStroke) {
        // Descending rungs, each faster than the last — the warm-up
        // equivalent of the club's own "descend to strong" instruction.
        var ratios = [4, 3, 2, 1];
        var sum = ratios.reduce(function (a, b) { return a + b; }, 0);
        var unit = Math.max(25, Math.round((shareM / sum) / 25) * 25);
        var sets = ratios.map(function (r, i) {
          var s = buildSet(1, unit * r, 'FR rung ' + (i + 1) + '/4 — descend, each faster than the last', [], pace100 + (12 - i * 4), 15, scaler, i === ratios.length - 1 ? 'Cruise Pace' : 'Easy Pace');
          s.stroke = 'Freestyle';
          return s;
        });
        return [{ label: 'Descend to Strong', sets: sets }];
      },
      intents: [
        'Four descending rungs — the distance shrinks as the effort climbs, so the swimmer arrives at the Pre-Set already moving well instead of stepping straight from an easy swim into hard work.'
      ]
    },
    {
      name: 'Snorkel Body-Line Opener',
      source: 'Derived from the club\'s recurring snorkel 11-Pos / L-Pos body-position work',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Snorkel removes breathing from the equation entirely so the
        // swimmer can hold one head position for a whole block.
        var hasSnorkel = equipment && equipment.indexOf('Snorkel') > -1;
        var gear = hasSnorkel ? ['Snorkel'] : [];
        var fr = splitProportional(shareM, [0.4, 0.3, 0.3]);
        var opener = buildSet(1, Math.max(100, fr[0]), 'FR w/Snorkel — head completely still, eyes straight down', gear, pace100 + 14, 15, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        return [
          { label: null, sets: [opener] },
          { label: '11-Pos / L-Pos', sets: [buildSet(Math.max(4, Math.round(fr[1] / 50)), 50, '25 in 11-Pos (both arms extended) / 25 in L-Pos (one arm, on your side)', gear, pace100 + 16, 20, scaler, 'Drill Pace')] },
          { label: 'Low SC Build', sets: [buildSet(Math.max(4, Math.round(fr[2] / 50)), 50, 'FR — count strokes, hold the lowest SC you can while building pace', [], pace100 + 6, 15, scaler, 'Easy Pace')] }
        ];
      },
      intents: [
        'A snorkel opener takes breathing out of the equation so body line is the only thing to think about — head still, hips up — then carries that alignment straight into a low-stroke-count build.'
      ]
    },
    {
      name: 'Reverse IM Build',
      source: 'Derived from the club\'s RIM/RIMO warm-up notation',
      build: function (shareM, pace100, scaler, nextStroke) {
        // Reverse IM order — Free, Breast, Back, Fly — so the hardest
        // stroke comes last, once the shoulders are genuinely warm.
        var fr = splitProportional(shareM, [0.34, 0.4, 0.26]);
        var opener = buildSet(1, Math.max(100, fr[0]), 'FR EZ, wake the stroke up', [], pace100 + 16, 15, scaler, 'Easy Pace');
        opener.stroke = 'Freestyle';
        return [
          { label: null, sets: [opener] },
          { label: 'RIMO — FR / BR / BK / FLY', sets: [buildSet(Math.max(4, Math.round(fr[1] / 50)), 50, 'RIMO by rep — FR, BR, BK, FLY, drill 25 into swim 25', [], pace100 + 12, 20, scaler, 'Drill Pace')] },
          { label: 'Build 25s', sets: [buildSet(Math.max(4, Math.round(fr[2] / 25)), 25, 'Build 1-4 — fast push-off, strong breakout, hold form', [], pace100 + 2, 20, scaler, '200 Pace')] }
        ];
      },
      intents: [
        'Reverse IM order puts Butterfly last, once the shoulders have actually warmed up through Free, Breast and Back — the safer way to touch all four strokes before a session that will demand them.'
      ]
    }
  ];

  // ---------------------------------------------------------------------
  // PRE-SET ARCHETYPES — activation only, split by which system the Main
  // Set is about to demand (the generator's presetPoolForGoals() picks
  // the sub-pool). Every shape here is a real SET 1 / SET 2 / SKILL block
  // off the session sheets, where those blocks always sit between the
  // warm-up and the main set.
  // ---------------------------------------------------------------------
  window.PRO_PRESET_ARCHETYPES = {
    speed: [
      {
        name: 'Open-Turn Skill Activation',
        source: 'M2 Week 8 Day 2 — SET 1 SKILLS: 8x open turn + push @1:00',
        build: function (shareM, pace100, scaler, nextStroke) {
          var stroke = nextStroke();
          var reps = Math.max(4, Math.min(12, Math.round(shareM / 25)));
          return [{ label: 'Turn Skill', sets: [buildSet(reps, 25, stroke + ' — swim in, open turn, explosive push, 5m fast breakout', [], pace100 + 4, 20, scaler, 'Cruise Pace')] }];
        },
        intents: [
          'Turn practice as its own dedicated block, exactly as the club programs it: swim in, execute the turn, push off hard and carry the breakout. Races are won and lost on walls, and walls only improve when they are trained on purpose.'
        ]
      },
      {
        name: 'Fins UWK Burst Activation',
        source: 'M2 Week 8 Day 2 — SET 2: 4x25 w/fins 3UWK + 4 strokes fast + EZ',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasFins = equipment && equipment.indexOf('Fins') > -1;
          var stroke = nextStroke();
          var reps = Math.max(4, Math.min(10, Math.round(shareM / 25)));
          return [{ label: 'UWK Burst', sets: [buildSet(reps, 25, stroke + ' — 3 UWK off the wall, 4 strokes FAST, then EZ to the end', hasFins ? ['Fins'] : [], paceBand(pace100, 'm1'), 25, scaler, '50 Pace')] }];
        },
        intents: [
          'Three underwater kicks then four genuinely fast strokes, and nothing else — short enough that every single rep is at full speed, long enough to link the underwater phase to the first strokes of the swim, which is where most races are actually decided.'
        ]
      },
      {
        name: 'SWOLF Paddle Primer',
        source: 'M2 Week 8 Day 2 — PRE SET: 2x[3x50 w/Paddles FR SWOLF, 2x25 fast/EZ]',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var stroke = nextStroke();
          var n = Math.max(2, Math.min(3, roundCountFor(scaler)));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var swolfReps = Math.max(2, Math.round((m * 0.7) / 50));
            var fastReps = Math.max(2, Math.round((m * 0.3) / 25));
            return {
              label: 'Round ' + (i + 1),
              sets: [
                buildSet(swolfReps, 50, stroke + ' SWOLF — count strokes + time, chase the lower score', hasPaddles ? ['Hand Paddles'] : [], pace100 + 4, 20, scaler, 'Cruise Pace'),
                buildSet(fastReps, 25, stroke + ' — odd FAST / even EZ', [], paceBand(pace100, 'm1'), 20, scaler, '50 Pace')
              ]
            };
          });
        },
        intents: [
          'Paddle SWOLF reps make the swimmer earn speed through efficiency rather than turnover, then a fast/easy 25 pair immediately cashes that efficiency in at real speed — the exact pairing the club uses to prime a sprint main set.'
        ]
      },
      {
        name: 'Chute Sprint Primer',
        source: 'M2 Week 8 Day 3 — 4x25 w/Chute FLY / BK / BR between pull rungs',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasParachute = equipment && (equipment.indexOf('Parachute') > -1 || equipment.indexOf('Drag Chute') > -1);
          var stroke = nextStroke();
          var reps = Math.max(4, Math.min(10, Math.round(shareM / 25)));
          return [{ label: 'Resisted Sprint', sets: [buildSet(reps, 25, stroke + ' — resisted sprint against the chute, hold stroke length under load', hasParachute ? ['Drag Chute'] : [], paceBand(pace100, 'm1'), 30, scaler, '50 Pace')] }];
        },
        intents: [
          'Resisted 25s load the catch without letting the swimmer cheat with turnover — the stroke has to stay long against the drag, so the free-swimming speed that follows comes from a stronger pull rather than a faster arm cycle.'
        ]
      },
      {
        name: 'Deadstart Finish Primer',
        source: 'M1 Week 6 Day 2 — SET 2: 4x25 deadstart finishes from 10m out',
        build: function (shareM, pace100, scaler, nextStroke) {
          var stroke = nextStroke();
          var reps = Math.max(4, Math.min(10, Math.round(shareM / 25)));
          return [{ label: 'Deadstart Finish', sets: [buildSet(reps, 25, stroke + ' — deadstart from 10m out, sprint the finish, no breath inside the flags', [], paceBand(pace100, 'm1'), 30, scaler, '50 Pace')] }];
        },
        intents: [
          'Starting from a dead stop removes every bit of momentum, so the only way to move is a genuinely powerful first catch — and finishing from 10m out trains the one part of a race almost nobody practises: the last few strokes into the wall.'
        ]
      },
      {
        name: 'Three-Kick Eight-Stroke Activation',
        source: 'M1 Week 6 Day 2 — SET 2: fins+paddles then no-equipment 3UWK + 8 strokes FAST',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasFins = equipment && equipment.indexOf('Fins') > -1;
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var stroke = nextStroke();
          var gear = [];
          if (hasFins) gear.push('Fins');
          if (hasPaddles) gear.push('Hand Paddles');
          var per = Math.max(2, Math.round(shareM / 25 / 2));
          return [
            { label: 'Loaded', sets: [buildSet(per, 25, stroke + ' — 3 UWK + 8 strokes FAST, then EZ', gear, paceBand(pace100, 'm1'), 25, scaler, '50 Pace')] },
            { label: 'No Equipment — transfer', sets: [buildSet(per, 25, stroke + ' — same 3 UWK + 8 strokes FAST, no gear, keep the feel', [], paceBand(pace100, 'm1'), 25, scaler, '50 Pace')] }
          ];
        },
        intents: [
          'The same burst is done twice — once with gear, once without — because the whole point of equipment is what the swimmer keeps after taking it off. The second round is where the transfer either happens or does not.'
        ]
      }
    ],
    endurance: [
      {
        name: 'Vertical Kick & Scull Skill',
        source: 'M2 Week 8 Day 3 — SKILL: 4x[vertical kick :30 hands / :20 elbows / :10 SL, 2x25 scull]',
        build: function (shareM, pace100, scaler, nextStroke) {
          var n = Math.max(2, Math.min(4, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            return {
              label: 'Round ' + (i + 1),
              sets: [
                buildSet(1, Math.max(25, Math.round((m * 0.5) / 25) * 25), 'Vertical kick — 20s hands out, 20s elbows out, 10s streamline', [], pace100 + 25, 20, scaler, 'Kick'),
                buildSet(Math.max(2, Math.round((m * 0.5) / 25)), 25, 'Scull — front scull, high elbows, forearms only', [], pace100 + 20, 15, scaler, 'Drill Pace')
              ]
            };
          });
        },
        intents: [
          'Vertical kicking has nowhere to hide — the legs either hold the body up or they do not — and pairing it straight into sculling means the swimmer feels both ends of their propulsion before a long aerobic set asks for them.'
        ]
      },
      {
        name: 'Ankle-Pull Catch Primer',
        source: 'M1 Week 6 Day 3 — SET 1: 4x25 ankle pull catch-up, 4x25 single arm, 4x50 chute',
        build: function (shareM, pace100, scaler, nextStroke) {
          var per = Math.max(2, Math.round(shareM / 25 / 2));
          return [
            { label: 'Catch-Up', sets: [buildSet(per, 25, 'Ankle pull, catch-up — one hand waits at extension, no kick to help', [], pace100 + 12, 20, scaler, 'Drill Pace')] },
            { label: 'Single Arm', sets: [buildSet(per, 25, 'Ankle pull, single arm — other arm at your side, rotate to breathe', [], pace100 + 14, 25, scaler, 'Drill Pace')] }
          ];
        },
        intents: [
          'With the ankles banded there is no kick to cover a weak catch, so catch-up and single-arm work expose exactly where the pull is losing water — the cheapest speed a distance swimmer can find before a long set.'
        ]
      },
      {
        name: 'Breath-Control Lead-In',
        source: 'Derived from the club\'s BE3/BE5/BE7 breathing-pattern notation',
        build: function (shareM, pace100, scaler, nextStroke) {
          var stroke = nextStroke();
          var reps = Math.max(3, Math.min(8, Math.round(shareM / 50)));
          return [{ label: 'Hypoxic Lead-In', sets: [buildSet(reps, 50, stroke + ' — BE3 / BE5 / BE7 by rep, rotating, hold pace as breathing widens', [], pace100 + 8, 20, scaler, 'Cruise Pace')] }];
        },
        intents: [
          'Widening the breathing pattern rep by rep — every 3, then 5, then 7 — teaches the body to hold its pace while oxygen gets scarcer, which is exactly what happens in the back half of a distance race.'
        ]
      },
      {
        name: 'Low Stroke-Count Primer',
        source: 'M1 Week 6 Day 2 — SET 3: hold low SC across 50s and 100s',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var stroke = nextStroke();
          var reps = Math.max(3, Math.min(8, Math.round(shareM / 50)));
          return [{ label: 'Low SC', sets: [buildSet(reps, 50, stroke + ' — count your strokes on rep 1, then hold that count as pace increases', hasPaddles ? ['Hand Paddles'] : [], pace100 + 6, 20, scaler, 'Cruise Pace')] }];
        },
        intents: [
          'Locking the stroke count and then raising the pace forces speed to come from a better hold on the water rather than a faster arm cycle — the single most transferable habit in distance swimming.'
        ]
      },
      {
        name: 'Pull-Buoy Pressure Lead-In',
        source: 'M1 Week 6 Day 3 — 3x100 ankle pull w/paddles BE3 between aerobic rungs',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var gear = [];
          if (hasBuoy) gear.push('Pull Buoy');
          if (hasPaddles) gear.push('Hand Paddles');
          var reps = Math.max(2, Math.min(6, Math.round(shareM / 100)));
          return [{ label: 'Pull Pressure', sets: [buildSet(reps, 100, 'FR pull BE3 — heavy, deliberate pressure the whole way through the catch', gear, pace100 + 4, 20, scaler, 'Threshold Pace')] }];
        },
        intents: [
          'Buoy and paddles take the legs out and load the arms, so the swimmer arrives at an aerobic main set having already found the pressure they will need to hold for the next twenty minutes.'
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------
  // MAIN SET ARCHETYPES — the real, complex structures off the sheets.
  // These are the shapes the request specifically pointed at: descending
  // intervals, build sets, broken swims, HR/effort tiers, hypoxic
  // breathing ladders, and stroke counting.
  // ---------------------------------------------------------------------
  window.PRO_MAIN_SET_ARCHETYPES = {
    endurance: [
      {
        name: 'Aero — MS/FR Descending Ladder',
        source: 'M1 Week 6 Day 1 — MAIN SET 1900 FR AERO (3x200 / 3x150 / 3x100 / 3x50 + FAST + BE rungs)',
        build: function (shareM, pace100, scaler, nextStroke) {
          // The real headline set: four descending rungs, each a group of
          // main-stroke/Freestyle mixed reps descended to strong, each
          // followed by a pair of FAST 25s and an easy BE recovery 50
          // whose breathing pattern WIDENS as the ladder descends
          // (BE3 -> BE5 -> BE7 -> BE9).
          var stroke = nextStroke();
          var rungs = [
            { dist: 200, be: 'BE3' },
            { dist: 150, be: 'BE5' },
            { dist: 100, be: 'BE7' },
            { dist: 50, be: 'BE9' }
          ];
          // Each rung costs its own reps*dist + 50 FAST + 50 recovery.
          var perRungOverhead = 100;
          var budgetPerRung = Math.max(150, Math.floor(shareM / rungs.length));
          return rungs.map(function (r, i) {
            var reps = Math.max(1, Math.round((budgetPerRung - perRungOverhead) / r.dist));
            return {
              label: r.dist + 's — descend to strong',
              sets: [
                buildSet(reps, r.dist, stroke + ' 50 MS / 50 FR — descend to strong', [], pace100 + (4 - i), 25, scaler, 'Threshold Pace'),
                buildSet(2, 25, stroke + ' FAST', [], paceBand(pace100, 'm1'), 20, scaler, '50 Pace'),
                buildSet(1, 50, 'FR ' + r.be + ' EZ — recover on a wider breath', [], pace100 + 20, 20, scaler, 'Recovery Pace')
              ]
            };
          });
        },
        intents: [
          'The club\'s signature aerobic ladder: the rep distance shrinks — 200s, 150s, 100s, 50s — while the effort climbs to strong, and each rung is punctuated by a pair of genuinely fast 25s and an easy recovery swim on a wider and wider breathing pattern. Volume, speed and breath control all trained inside one set.'
        ]
      },
      {
        name: 'Aero — Broken 400 Effort Tiers',
        source: 'M1 Week 6 Day 3 — MAIN SET 2800: 1x400 (200 BE3 70% / 100 STRONG 80% / r:10 / 100 build 90%)',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: a long swim broken internally into named
          // percentage-effort tiers with a single 10-second break inside
          // it, alternated with short paddle-pull reps. Round 2 inverts
          // the 200/100 split.
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
          var gear = [];
          if (hasBuoy) gear.push('Pull Buoy');
          if (hasPaddles) gear.push('Hand Paddles');
          var n = Math.max(1, Math.min(2, roundCountFor(scaler)));
          var shares = splitShareEqual(shareM, n);
          var splits = [[0.5, 0.25, 0.25], [0.25, 0.5, 0.25]];
          return shares.map(function (m, i) {
            var swimM = Math.max(200, Math.round((m * 0.65) / 50) * 50);
            var parts = splitProportional(swimM, splits[i % splits.length]);
            var pullM = Math.max(100, m - swimM);
            var pullReps = Math.max(1, Math.round(pullM / 100));
            return {
              label: 'Broken ' + swimM + ' — effort tiers',
              sets: [
                buildSet(1, parts[0], 'FR BE3 @ 70% — controlled, breathing every 3', [], pace100 + 12, 10, scaler, 'Cruise Pace'),
                buildSet(1, parts[1], 'FR STRONG @ 80% — lift without straining', [], pace100 + 2, 10, scaler, 'Threshold Pace'),
                buildSet(1, parts[2], 'FR build @ 90% — r:10 first, then build to strong', [], pace100 - 2, 10, scaler, '400 Pace'),
                buildSet(pullReps, 100, 'FR pull BE3 — hold pressure, recover the arms nowhere else', gear, pace100 + 6, 25, scaler, 'Cruise Pace')
              ]
            };
          });
        },
        intents: [
          'One long swim, three named effort tiers inside it — 70%, then 80%, then a 90% build after a single ten-second break — and the split between them inverts on the second round. Pace judgement inside a continuous swim, which is a different skill entirely from hitting an interval.'
        ]
      },
      {
        name: 'Threshold — Hypoxic Pull Ladder',
        source: 'M2 Week 8 Day 3 — SET 3: 400 BE3 / 4x25 chute / 300 BE5 / 4x25 / 200 BE7 / 4x25 / 100 BE9',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: a descending pull ladder where the breathing
          // pattern widens as the distance shrinks, with short resisted
          // sprints between each rung.
          var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var hasParachute = equipment && (equipment.indexOf('Parachute') > -1 || equipment.indexOf('Drag Chute') > -1);
          var gear = [];
          if (hasBuoy) gear.push('Pull Buoy');
          if (hasPaddles) gear.push('Hand Paddles');
          var ratios = [4, 3, 2, 1];
          var sum = ratios.reduce(function (a, b) { return a + b; }, 0);
          // Reserve ~20% of the share for the sprint rungs between pulls.
          var pullBudget = Math.max(200, Math.round(shareM * 0.8));
          var unit = Math.max(50, Math.round((pullBudget / sum) / 50) * 50);
          var breaths = ['BE3', 'BE5', 'BE7', 'BE9'];
          var out = [];
          ratios.forEach(function (r, i) {
            out.push({
              label: 'Pull ' + (unit * r) + 'm ' + breaths[i],
              sets: [buildSet(1, unit * r, 'FR pull ' + breaths[i] + ' — hold pace as the breath widens', gear, pace100 + (6 - i * 2), 30, scaler, 'Threshold Pace')]
            });
            if (i < ratios.length - 1) {
              out.push({
                label: 'Resisted sprint',
                sets: [buildSet(2, 25, nextStroke() + ' — short resisted sprint, wake the catch back up', hasParachute ? ['Drag Chute'] : [], paceBand(pace100, 'm1'), 25, scaler, '50 Pace')]
              });
            }
          });
          return out;
        },
        intents: [
          'A descending pull ladder where the breathing pattern widens exactly as the distance shrinks — every 3, then 5, then 7, then 9 — with short resisted sprints between rungs so the catch stays sharp instead of dulling under fatigue. Brutal, and the single best predictor of a strong closing 50.'
        ]
      },
      {
        name: 'IM Aero — Transition Rotation',
        source: 'M2 Week 8 Day 3 — MAIN SET [IM Aero] 4x: 150 FR BE3 / 2x50 IMO by rounds / 150 50BK-BR-FR',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real shape: an aerobic Freestyle rep, an IM-order pair that
          // advances stroke by round, and a mixed back-half rep.
          var n = Math.max(2, Math.min(4, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          var imoStrokes = ['FLY', 'BK', 'BR', 'FR'];
          return shares.map(function (m, i) {
            var aeroM = Math.max(100, Math.round((m * 0.4) / 50) * 50);
            var mixedM = Math.max(100, Math.round((m * 0.4) / 50) * 50);
            var imoReps = Math.max(2, Math.round((m - aeroM - mixedM) / 50));
            var aeroSet = buildSet(1, aeroM, 'FR BE3 — steady aerobic, breathing every 3', [], pace100 + 8, 25, scaler, 'Cruise Pace');
            aeroSet.stroke = 'Freestyle';
            return {
              label: 'Round ' + (i + 1) + ' — IMO ' + imoStrokes[i % imoStrokes.length],
              sets: [
                aeroSet,
                buildSet(imoReps, 50, imoStrokes[i % imoStrokes.length] + ' — IMO by round, this round\'s stroke only', [], pace100 + 4, 20, scaler, 'Threshold Pace'),
                buildSet(1, mixedM, '50 BK / 50 BR / 50 FR — transitions on the move, no stopping between', [], pace100 + 6, 25, scaler, 'Cruise Pace')
              ]
            };
          });
        },
        intents: [
          'Aerobic volume that refuses to let the swimmer settle into one stroke: a steady Freestyle rep, an IM-order pair that advances a stroke each round, and a mixed rep that changes stroke mid-swim. Transitions under fatigue are the whole point.'
        ]
      },
      {
        name: 'Aero — Ankle-Pull Aerobic Blocks',
        source: 'M1 Week 6 Day 3 — alternating regular pull and ankle-pull paddle blocks',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var hasBuoy = equipment && equipment.indexOf('Pull Buoy') > -1;
          var n = Math.max(2, roundCountFor(scaler));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var reps = Math.max(2, Math.round(m / 100));
            var isAnkle = i % 2 === 0;
            var gear = [];
            if (hasPaddles) gear.push('Hand Paddles');
            if (!isAnkle && hasBuoy) gear.push('Pull Buoy');
            return {
              label: isAnkle ? 'Ankle pull — no leg support' : 'Regular pull — buoy support',
              sets: [buildSet(reps, 100, isAnkle
                ? 'FR ankle pull BE3 — band at the ankles, arms hold the body line alone'
                : 'FR pull BE3 — buoy in, long and heavy through the catch', gear, pace100 + 5, 25, scaler, 'Threshold Pace')]
            };
          });
        },
        intents: [
          'Alternating banded and buoy-supported pull blocks: the banded rounds strip away every bit of leg help so the catch has to hold the hips up by itself, and the supported rounds let the swimmer immediately apply that stronger catch at pace.'
        ]
      }
    ],
    speed: [
      {
        name: 'Speed Endurance — 125 Variants',
        source: 'M1 Week 6 Day 2 — MAIN SET 1600 Speed Endurance 2RDS: 4x125 @2:00/2:20, four internal structures',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: the same rep distance repeated four times, but
          // each with a COMPLETELY different internal fast/easy structure
          // — the fast portion migrates from the front of the rep to the
          // back across the four.
          var hasFins = equipment && equipment.indexOf('Fins') > -1;
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var hasSnorkel = equipment && equipment.indexOf('Snorkel') > -1;
          var stroke = nextStroke();
          var variants = [
            '50 OTB FAST / 75 EZ',
            '50 build / 25 EZ / 50 FAST',
            '25 FAST / 25 EZ, repeat through',
            '25 EZ / 100 FAST — fast finish'
          ];
          var n = Math.max(1, Math.min(2, roundCountFor(scaler)));
          var shares = splitShareEqual(shareM, n);
          var gear = [];
          if (hasFins) gear.push('Fins');
          if (hasPaddles) gear.push('Hand Paddles');
          if (hasSnorkel) gear.push('Snorkel');
          return shares.map(function (m, i) {
            var repM = 125;
            var variantCount = Math.max(2, Math.min(4, Math.round((m * 0.78) / repM)));
            var sets = [];
            for (var v = 0; v < variantCount; v++) {
              sets.push(buildSet(1, repM, stroke + ' — ' + variants[v % variants.length], [], pace100 + 2 - v, 25, scaler, 'Race-Pace Band'));
            }
            var flushM = Math.max(100, m - repM * variantCount);
            sets.push(buildSet(1, flushM, 'FR low SC flush — long stroke, recover the arms', gear, pace100 + 18, 20, scaler, 'Recovery Pace'));
            return { label: 'Round ' + (i + 1) + ' — 125 variants', sets: sets };
          });
        },
        intents: [
          'Four reps at the same distance, four completely different internal shapes — the fast portion starts at the front of the rep and migrates to the back. By the fourth one the swimmer is sprinting the last 100 of a rep on tired arms, which is precisely the second half of a race.'
        ]
      },
      {
        name: 'Sprint — Group Ladder (Odd Fast / Even EZ)',
        source: 'M2 Week 8 Day 2 — SET 3 MAIN SET: 2x[4x25 / 4x50 / 4x75] odd fast / even EZ',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real shape: an ascending three-rung ladder where every ODD
          // rep is fast and every EVEN rep is easy, repeated twice. The
          // real session ran two distance groups (G1 sprinters on
          // 25/50/75, G2 middle-distance on 50/75/100) — the swimmer's
          // own selected type is the analogue of that group split.
          var stroke = nextStroke();
          var isDistanceGroup = state.swimmerType === 'distance';
          var rungs = isDistanceGroup ? [50, 75, 100] : [25, 50, 75];
          var n = Math.max(1, Math.min(2, roundCountFor(scaler)));
          var shares = splitShareEqual(shareM, n);
          var out = [];
          shares.forEach(function (m, ri) {
            var perRung = m / rungs.length;
            rungs.forEach(function (d) {
              var reps = Math.max(2, Math.round(perRung / d));
              if (reps % 2 !== 0) reps += 1; // odd/even pairing needs an even count
              out.push({
                label: 'Round ' + (ri + 1) + ' — ' + d + 's',
                sets: [buildSet(reps, d, stroke + ' — odd FAST / even EZ', [], paceBand(pace100, 'm1'), 20, scaler, d <= 50 ? '50 Pace' : '100 Pace')]
              });
            });
          });
          return out;
        },
        intents: [
          'An ascending ladder where every other rep is genuinely all-out and the ones between are genuinely easy — the recovery is built into the set rather than bolted on afterwards, so the fast reps stay fast all the way to the last rung.'
        ]
      },
      {
        name: 'Sprint — Descending-Interval Holds',
        source: 'Derived from the club\'s recurring "@1:00 / :50 / :45" tightening send-off notation',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real pattern: same rep distance and same target speed, but
          // the send-off tightens round by round, so rest shrinks while
          // the required pace does not.
          var stroke = nextStroke();
          var n = Math.max(2, Math.min(3, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          var restSteps = [30, 20, 12];
          return shares.map(function (m, i) {
            var reps = Math.max(2, Math.round(m / 50));
            return {
              label: 'Round ' + (i + 1) + ' — send-off tightening',
              sets: [buildSet(reps, 50, stroke + ' — hold the same speed on less rest', [], paceBand(pace100, 'm1'), restSteps[Math.min(i, restSteps.length - 1)], scaler, '100 Pace')]
            };
          });
        },
        intents: [
          'The distance and the target speed never change — only the rest does, shrinking round by round. Holding a pace on thirty seconds rest is training; holding the same pace on twelve is racing.'
        ]
      },
      {
        name: 'Sprint — Broken Race Simulation',
        source: 'Derived from the club\'s Broken 200 / Broken 125 notation with r:10 internal breaks',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real shape: race distance swum in segments with tiny (10s)
          // internal breaks, so the swimmer holds genuine race speed for
          // the full distance rather than fading.
          var stroke = nextStroke();
          var n = Math.max(1, Math.min(3, roundCountFor(scaler)));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var segM = Math.max(25, Math.min(50, Math.round((m / 4) / 25) * 25));
            var segs = Math.max(2, Math.round(m / segM));
            return {
              label: 'Broken ' + (segM * segs) + ' — r:10 between segments',
              sets: [buildSet(segs, segM, stroke + ' at race speed — 10s break between segments, no fade', [], paceBand(pace100, 'm2'), 10, scaler, 'Race-Pace Band')]
            };
          });
        },
        intents: [
          'A race distance broken into segments with only ten seconds between them. The clock adds up to the race, but the tiny breaks let the swimmer actually hold race speed all the way through — teaching the body what the whole distance is supposed to feel like.'
        ]
      }
    ],
    technique: [
      {
        name: 'SWOLF — Descend & Hold',
        source: 'M1 Week 6 Day 2 — SET 3 SKILLS 4RDS: 6x50 FR desce 1-3 then hold 4-6 (SWOLF)',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: descend the first half of a group of 50s, then
          // HOLD that final time for the second half — while the stroke
          // count is being scored, so speed can't come from thrashing.
          var hasPaddles = equipment && equipment.indexOf('Hand Paddles') > -1;
          var stroke = nextStroke();
          var n = Math.max(2, Math.min(4, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var half = Math.max(2, Math.round((m / 50) / 2));
            return {
              label: 'Round ' + (i + 1) + ' — SWOLF',
              sets: [
                buildSet(half, 50, stroke + ' — descend, strokes + time scored each rep', hasPaddles && i % 2 === 1 ? ['Hand Paddles'] : [], pace100 + 6, 20, scaler, 'Cruise Pace'),
                buildSet(half, 50, stroke + ' — HOLD your best SWOLF score, no drift', [], pace100 + 2, 20, scaler, 'Threshold Pace')
              ]
            };
          });
        },
        intents: [
          'SWOLF scores strokes plus time together, so the only way to improve is to get faster without taking more strokes. Descending into a hold means the swimmer has to repeat their own best efficiency on tired arms rather than hit it once by accident.'
        ]
      },
      {
        name: 'Choice Kick Build Ladder',
        source: 'M1 Week 6 Day 3 — SET 3 CHO KICK 4RDS: 150 build by 25/50/75/all strong + 50 arms slow/kick fast',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: four kick reps where the BUILD INTERVAL changes
          // each round — build by 25, then by 50, then by 75, then all
          // strong — each followed by a swim rep with slow arms and a
          // fast kick.
          var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
          var buildPatterns = ['build by 25', 'build by 50', 'build by 75', 'all strong'];
          var n = Math.max(2, Math.min(4, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var kickM = Math.max(100, Math.round((m * 0.7) / 50) * 50);
            var swimM = Math.max(50, m - kickM);
            return {
              label: 'Round ' + (i + 1) + ' — ' + buildPatterns[i % buildPatterns.length],
              sets: [
                buildSet(1, kickM, 'Cho kick — ' + buildPatterns[i % buildPatterns.length], hasKickboard ? ['Kickboard'] : [], pace100 + 20, 25, scaler, 'Kick'),
                buildSet(1, swimM, 'FR swim — arms slow, kick FAST, let the legs carry it', [], pace100 + 10, 20, scaler, 'Drill Pace')
              ]
            };
          });
        },
        intents: [
          'The build interval itself changes every round — by 25, by 50, by 75, then all strong — so the legs learn to lift effort on four completely different timescales, and each round finishes with a swim that deliberately makes the kick do the work.'
        ]
      },
      {
        name: 'Position Kick — L-Pos / SL-Pos Rotation',
        source: 'M2 Week 8 Day 2 — SET 4: 2x[8x25] hand@side / L-Pos / snorkel 11-Pos / snorkel SL',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real shape: the same short kick rep swum in four distinct
          // body positions, two reps in each, twice through.
          var hasSnorkel = equipment && equipment.indexOf('Snorkel') > -1;
          var positions = [
            { label: 'on your back, hands at your sides', gear: false },
            { label: 'on your side in L-Pos, one arm extended', gear: false },
            { label: 'in 11-Pos, both arms extended', gear: true },
            { label: 'in full streamline, hands locked', gear: true }
          ];
          var perPos = Math.max(2, Math.round((shareM / positions.length) / 25));
          return positions.map(function (p, i) {
            return {
              label: 'Position ' + (i + 1),
              sets: [buildSet(perPos, 25, 'Kick — ' + p.label, p.gear && hasSnorkel ? ['Snorkel'] : [], pace100 + 22, 20, scaler, 'Kick')]
            };
          });
        },
        intents: [
          'The same kick, four body positions — on the back, on the side, both arms extended, full streamline. A kick that only works with a board in front of it is not a kick a swimmer can use in a race; this finds and fixes the positions where it falls apart.'
        ]
      },
      {
        name: 'Stroke-Count Descend Ladder',
        source: 'Derived from the club\'s "Low SC" and stroke-count notation across M1 Week 6',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Take one fewer stroke per length across the rungs, at a
          // constant pace — the purest DPS constraint set.
          var stroke = nextStroke();
          var rungs = ['your natural count', 'one stroke fewer', 'two strokes fewer', 'back to natural, but faster'];
          var n = Math.max(2, Math.min(4, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var reps = Math.max(2, Math.round(m / 50));
            return {
              label: 'Rung ' + (i + 1),
              sets: [buildSet(reps, 50, stroke + ' — hold ' + rungs[i % rungs.length] + ', same pace throughout', [], pace100 + 6, 20, scaler, 'Cruise Pace')]
            };
          });
        },
        intents: [
          'Take one fewer stroke each rung while the clock stays the same, then return to your natural count and find it suddenly easier to go faster. Distance per stroke is the only free speed in swimming and this is how it is trained.'
        ]
      },
      {
        name: 'Equipment Transfer Ladder',
        source: 'Derived from the club\'s repeated "with gear then no gear, keep the feel" pattern',
        build: function (shareM, pace100, scaler, nextStroke, equipment) {
          // Real pattern seen throughout the sheets: a loaded rep
          // immediately followed by the identical rep with nothing,
          // so the swimmer has to keep the feel rather than the gear.
          var stroke = nextStroke();
          var gearSets = [];
          if (equipment && equipment.indexOf('Hand Paddles') > -1) gearSets.push(['Hand Paddles']);
          if (equipment && equipment.indexOf('Fins') > -1) gearSets.push(['Fins']);
          if (equipment && equipment.indexOf('Pull Buoy') > -1) gearSets.push(['Pull Buoy']);
          if (!gearSets.length) gearSets.push([]);
          var n = Math.max(2, Math.min(3, roundCountFor(scaler) + 1));
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m, i) {
            var reps = Math.max(1, Math.round((m / 2) / 50));
            var g = gearSets[i % gearSets.length];
            var gearName = g.length ? g[0] : 'no equipment';
            return {
              label: 'Round ' + (i + 1) + ' — ' + gearName,
              sets: [
                buildSet(reps, 50, stroke + ' — loaded, find the strongest hold on the water', g, pace100 + 6, 20, scaler, 'Cruise Pace'),
                buildSet(reps, 50, stroke + ' — same rep with nothing, keep exactly that feel', [], pace100 + 6, 20, scaler, 'Cruise Pace')
              ]
            };
          });
        },
        intents: [
          'Every loaded rep is immediately repeated with nothing on. Equipment is only ever worth what the swimmer keeps after taking it off, and pairing the reps back to back is the only way to find out whether anything transferred.'
        ]
      }
    ]
  };

  // ---------------------------------------------------------------------
  // COOL-DOWN BLUEPRINTS
  // Before this, the Cool-Down was three hardcoded lines — the identical
  // WD every session forever, which is exactly what "it keeps looping the
  // same thing" meant. Each build() returns a FLAT array of sets (the
  // Cool-Down's own existing shape) filling an already-exact budget.
  // ---------------------------------------------------------------------
  window.PRO_COOLDOWN_BLUEPRINTS = [
    {
      name: 'Long-Axis Loosen',
      source: 'The generator\'s own long-standing default, kept as one option among many',
      build: function (budgetM, pace100, scaler, nextStroke) {
        var parts = splitProportional(budgetM, [0.5, 0.3, 0.2]);
        var s0 = buildSet(1, parts[0], nextStroke() + ' EZ, long-axis rotation', [], pace100 + 20, 10, scaler, 'Recovery Pace');
        s0.stroke = nextStroke.current;
        var s1 = buildSet(1, parts[1], 'BK EZ, loosen shoulders', [], pace100 + 24, 10, scaler, 'Recovery Pace');
        s1.stroke = 'Backstroke';
        var s2 = buildSet(1, parts[2], 'EZ Kick, settle HR', [], pace100 + 28, 10, scaler, 'Recovery Pace');
        return [s0, s1, s2];
      }
    },
    {
      name: 'Scull / Catch-Up / Swim',
      source: 'M2 Week 8 Day 2 — WD: 1x300, 25 scull / 25 catch-up / 50 swim',
      build: function (budgetM, pace100, scaler) {
        var parts = splitProportional(budgetM, [0.25, 0.25, 0.5]);
        var s2 = buildSet(1, parts[2], 'FR EZ swim — carry the catch you just found', [], pace100 + 22, 10, scaler, 'Recovery Pace');
        s2.stroke = 'Freestyle';
        return [
          buildSet(1, parts[0], 'Scull EZ — front scull, no hurry', [], pace100 + 30, 10, scaler, 'Recovery Pace'),
          buildSet(1, parts[1], 'Catch-up drill EZ — one hand waits at extension', [], pace100 + 26, 10, scaler, 'Recovery Pace'),
          s2
        ];
      }
    },
    {
      name: 'Low SC Equipment Flush',
      source: 'M2 Week 8 Day 3 — WD: 8x50 w/fins, paddles, snorkel @1:00, Low SC',
      build: function (budgetM, pace100, scaler, nextStroke, equipment) {
        var gear = [];
        if (equipment && equipment.indexOf('Fins') > -1) gear.push('Fins');
        if (equipment && equipment.indexOf('Hand Paddles') > -1) gear.push('Hand Paddles');
        if (equipment && equipment.indexOf('Snorkel') > -1) gear.push('Snorkel');
        var reps = Math.max(2, Math.round(budgetM / 50));
        var per = Math.max(25, Math.round((budgetM / reps) / 25) * 25);
        var s = buildSet(reps, per, 'FR EZ — lowest stroke count you can hold, nothing forced', gear, pace100 + 24, 10, scaler, 'Recovery Pace');
        s.stroke = 'Freestyle';
        return [s];
      }
    },
    {
      name: 'Long-Stroke Fins Flush',
      source: 'M1 Week 6 Day 2 — WD: 4x50 w/fins LONG STROKE',
      build: function (budgetM, pace100, scaler, nextStroke, equipment) {
        var hasFins = equipment && equipment.indexOf('Fins') > -1;
        var parts = splitProportional(budgetM, [0.65, 0.35]);
        var s0 = buildSet(Math.max(2, Math.round(parts[0] / 50)), 50, 'FR EZ — longest possible stroke, glide the front end', hasFins ? ['Fins'] : [], pace100 + 22, 10, scaler, 'Recovery Pace');
        s0.stroke = 'Freestyle';
        var s1 = buildSet(1, parts[1], 'BK EZ — open the chest, unwind the shoulders', [], pace100 + 26, 10, scaler, 'Recovery Pace');
        s1.stroke = 'Backstroke';
        return [s0, s1];
      }
    },
    {
      name: 'Straight EZ Swim',
      source: 'M1 Week 6 Day 1 / Day 3 — WD: 1x100 EZ FR',
      build: function (budgetM, pace100, scaler) {
        var s = buildSet(1, budgetM, 'FR EZ — one continuous easy swim, breathe whenever you want', [], pace100 + 24, 10, scaler, 'Recovery Pace');
        s.stroke = 'Freestyle';
        return [s];
      }
    },
    {
      name: 'Descending EZ Ladder',
      source: 'Derived from the club\'s descending-rung cool-down pattern',
      build: function (budgetM, pace100, scaler) {
        var parts = splitProportional(budgetM, [0.45, 0.32, 0.23]);
        var out = parts.map(function (p, i) {
          var s = buildSet(1, p, 'FR EZ rung ' + (i + 1) + '/3 — each one slower and longer than the last', [], pace100 + 20 + i * 4, 10, scaler, 'Recovery Pace');
          s.stroke = 'Freestyle';
          return s;
        });
        return out;
      }
    },
    {
      name: 'Kick-Down Flush',
      source: 'Derived from the club\'s kick-finish WD pattern',
      build: function (budgetM, pace100, scaler, nextStroke, equipment) {
        var hasKickboard = equipment && equipment.indexOf('Kickboard') > -1;
        var parts = splitProportional(budgetM, [0.4, 0.35, 0.25]);
        var s0 = buildSet(1, parts[0], 'FR EZ, shake the arms out', [], pace100 + 22, 10, scaler, 'Recovery Pace');
        s0.stroke = 'Freestyle';
        return [
          s0,
          buildSet(1, parts[1], 'EZ Kick — gentle flutter, let the heart rate come down', hasKickboard ? ['Kickboard'] : [], pace100 + 30, 10, scaler, 'Recovery Pace'),
          buildSet(1, parts[2], 'Backstroke EZ — float, breathe, finish relaxed', [], pace100 + 28, 10, scaler, 'Recovery Pace')
        ];
      }
    },
    {
      name: 'Mixed-Stroke Unwind',
      source: 'Derived from the club\'s choice-stroke WD pattern',
      build: function (budgetM, pace100, scaler, nextStroke) {
        var parts = splitProportional(budgetM, [0.35, 0.35, 0.3]);
        var s0 = buildSet(1, parts[0], 'BR EZ — long glide, no urgency at all', [], pace100 + 26, 10, scaler, 'Recovery Pace');
        s0.stroke = 'Breaststroke';
        var s1 = buildSet(1, parts[1], 'BK EZ — arms wide, open the shoulders', [], pace100 + 26, 10, scaler, 'Recovery Pace');
        s1.stroke = 'Backstroke';
        var s2 = buildSet(1, parts[2], 'FR EZ — finish long and smooth', [], pace100 + 22, 10, scaler, 'Recovery Pace');
        s2.stroke = 'Freestyle';
        return [s0, s1, s2];
      }
    }
  ];
})();
