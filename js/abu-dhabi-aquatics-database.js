// abu-dhabi-aquatics-database.js
//
// A local, hardcoded transcription of 31 real training sessions from Abu
// Dhabi Aquatics Club, uploaded directly by the user as scanned/typed
// coaching documents authored by Coach Sherif Zakaria — spanning Mesocycle 1
// (Aerobic Development, Weeks 3-5, Nov 2025), a later Specific Prep/Taper
// block (Weeks 14-15, Nov-Dec 2025, handwritten notebook pages), and a set of
// typed March 2026 sessions. This exists purely as a REFERENCE LIBRARY — a saved,
// searchable record of real elite club programming this project can look
// back at for real ideas/patterns/terminology in future rounds — mirroring
// the same "hardcode real files locally, don't rely on model memory"
// precedent already established for the swiML integration
// (js/swiml-database.js).
//
// PROVENANCE: transcribed by direct visual reading of the user's own
// uploaded images (Read tool, this same session) — not fetched from any
// network source. Every distance/rep/rest value below is a faithful,
// best-effort reading of the scanned document; a scanned table can carry
// minor OCR-style ambiguity (a smudged digit, a handwriting-adjacent font)
// that a from-scratch cross-check against the original PDF/printout would
// catch more reliably than a single visual pass — flagged here rather than
// silently presented as pixel-perfect. Each session keeps the coach's own
// real notation verbatim in its `lines` (not translated into generic
// English), with SWIMFIT_ADAC_GLOSSARY below decoding the club's own
// shorthand.
//
// SCOPE: this file is NOT currently wired into generateWorkout() — it is a
// saved reference library only, per the explicit ask ("save them in a file
// ... so you can go back and take the ideas or patterns"). Wiring specific
// real blocks from these sessions into the generator (the same way
// SWIML_MAIN_SET_ARCHETYPES/SWIML_WARMUP_BLUEPRINTS were built from the
// swiML sessions) is a natural next step if requested, not done here.

(function () {
  'use strict';

  window.ADAC_SOURCE_META = {
    club: 'Abu Dhabi Aquatics Club',
    coach: 'Sherif Zakaria',
    mesocycles: ['Mesocycle 1 — Aerobic Development (Weeks 3-5)', 'Specific Prep / Taper — Part 1 (Weeks 14-15)', 'March 2026 sessions (undated mesocycle)'],
    source: 'User-uploaded scanned/typed training documents (this session)',
    note: 'Local reference data only — not fetched from any network source, not currently read by the live generator. The Weeks 14-15 sessions are handwritten notebook pages, transcribed by direct visual reading — treat sub-block distance splits there as best-effort, though every overall session total is read directly off the coach\'s own clearly-circled total.'
  };

  // The club's own real shorthand, as used verbatim in `lines` below.
  window.ADAC_GLOSSARY = {
    'Cho': 'Choice of stroke (swimmer\'s own pick)',
    'MS': 'Main Stroke — the swimmer\'s individual specialty stroke, as distinct from FR (Freestyle)',
    'FR': 'Freestyle',
    'BK': 'Backstroke',
    'BR': 'Breaststroke',
    'FLY / FL': 'Butterfly',
    'IM / IMO': 'Individual Medley / IM Order (rotating through Fly-Back-Breast-Free)',
    'RIM / RIMO': 'Rotating IM drill sequence',
    'OTB': 'Off The Block (a race-start rep)',
    'UWK / UW': 'Underwater Kick',
    'SL': 'Straight Line / streamlined body position',
    'SC': 'Stroke Count',
    'DPS': 'Distance Per Stroke — counting strokes to maximize distance covered per stroke cycle',
    'SWOLF': 'Stroke count + time efficiency score (lower is better)',
    'BE3/5/7/9': 'Build Effort scale — an increasing effort level per rep/round',
    'P100 / P200 / P400': 'Target pace derived from the swimmer\'s own 100m / 200m / 400m time (also written as a subscript, e.g. "P200")',
    'P+1 / P+2 / P-1 / P-2': 'Race-pace band relative to goal pace P — each step roughly a fixed number of seconds faster/slower than P',
    'RDS': 'Rounds',
    'desc': 'Descending — each rep/round faster than the last',
    'G1 / G2': 'Group 1 / Group 2 — two ability groups swum on different send-offs',
    'L-Pos / 11-Pos': 'A specific hand/arm entry position drill (named for the clock-face-style arm angle)',
    'CNS Activation': 'Central Nervous System activation — an explosive jump/kick/turn/underwater sequence early in the Warm-Up',
    'SL Jumps': 'Standing Long Jumps (a dryland/pool-deck explosive-power drill)',
    'Broken 200 / Broken 125': 'A Main Set style where a nominal 200m/125m swim is broken into shorter fast segments with brief rest between them',
    'Dryland': 'The day\'s land-based conditioning focus (e.g. Mobility, Plank, Plyo, Med Ball), noted per session where shown'
  };

  window.ADAC_SESSIONS = [
    {
      id: 'W5D5', week: 5, day: 5, focus: 'Lactate', totalM: 3100,
      blocks: [
        { name: 'W-UP', totalM: 1300, lines: [
          '1x300 Cho',
          '4x50 FR kick, last 10/20/30/40m fast kick',
          '9x50 25 MS / 25 FR (3@:55 / 3@:50 / 3@:45) for G1 — add :10 sec for G2',
          '1x150 25 scull / 25 drill / 25 build',
          '3x50 MS (build / P200 / 25 FAST-25 EZ)',
          '2x25 OTB (15m FAST / 25m FAST)'
        ] },
        { name: 'MAIN SET', totalM: '300-600', focus: 'Lactate', sendoff: 'G1 5:00', lines: [
          'OTB',
          '6x50 MS, desc 1-4 to FAST, hold 5 & 6',
          '6x100 MS, desc 1-4 to FAST, hold 5 & 6',
          'Zach / Toff / Albert / Sam / Keial / Amer >> swim 6x100'
        ] },
        { name: 'SET 2', totalM: 600, sendoff: '1:00', lines: [
          '12x50 — 1: SL FE kick / 2: FE low SC / 3: 25 UWK + EZ / 4: BK, K'
        ] },
        { name: 'SET 3', totalM: 150, sendoff: ':50', lines: [
          '6x25 — 2 rounds deadstart + 4 cycle FAST + EZ / 2: 3 UWK + 4 cycle FAST + EZ / 2: OTB 4 cycle FAST + EZ'
        ] },
        { name: 'WD', totalM: 400, lines: [
          '1x200 Scull / swim',
          '4x50 Kick desc fast to EZ'
        ] }
      ]
    },
    {
      id: 'W5D6', week: 5, day: 6, focus: 'IM AERO', totalM: 5300,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '1x400 w/fins, every 4th 25 UW',
          '4x100 w/fins fly kick (50 side kick / 50 on back) [1:45]',
          '8x50 FR drill [1:00]'
        ] },
        { name: 'SET 1', totalM: 400, focus: 'SKILL', sendoff: ':45', lines: [
          '16x25 Ankle pull',
          '1: front scull / 2: middle scull',
          '3: UW recovery (dog paddle) / 4: deadstart + 6 STKS'
        ] },
        { name: 'MAIN SET', totalM: 3000, focus: 'IM AERO', rounds: '4RDS', lines: [
          'R1: FLY / R2: BK / R3: BR / R4: FR',
          '6x25 Odd: single arm / even: Cho drill [:45]',
          '1x150 Build up by 50 [2:30 G1 / 2:45 G2]',
          '2x100 50FLY-50BK / 50BK-50BR / 50BR-50FR / FR w/fins, By RDS [1:45]',
          '1:00 rest',
          '10x100 FR SWIM [1:30 G1 / 1:40 G2]'
        ] },
        { name: 'SET 2', totalM: 750, focus: 'PULL', rounds: '3RDS', lines: [
          '4x25 ankle pull, single arm [:45]',
          '1x200/150/100 By RD, pull w/chute [:20r]'
        ] },
        { name: 'WD', totalM: 150, lines: [
          '3x50 Scull, swim'
        ] }
      ]
    },
    {
      id: 'W5D4', week: 5, day: 4, focus: 'Threshold', totalM: 4200,
      blocks: [
        { name: 'W-UP', totalM: 800, rounds: '3RDS', lines: [
          '1x100 Cho [1:45]',
          '1x75 FL K on back [1:30]',
          '1x50 build to FAST turn [1:10]',
          '1x25 deadstart 3 FAST cycles + EZ [:45]'
        ] },
        { name: 'SET 1', totalM: 500, focus: 'RESIST-POWER', rounds: '2RDS', lines: [
          '6x25 Desc 1-3 (8 cycle w/fins, chute, paddles) [:50]',
          '4x25 FAST 8 Cycle w/chute [:50]'
        ] },
        { name: 'MAIN SET', totalM: 2200, focus: 'Threshold', lines: [
          '3x100 FR 75 strong - 25 EZ desc 1-3 [1:40]',
          '4x100 FR 50 build to FAST / 50 ez [1:50]',
          '5x100 FR 25 FAST / 75 ez [2:00]',
          ':30 rest',
          '5x200 FR SW P400 [3:20 G1 / 3:30 G2]'
        ] },
        { name: 'SET 3', totalM: 600, focus: 'Skills', rounds: '3RDS', sendoff: '1:10', lines: [
          'R1: Fins & Chute / R2: no equip / R3: fins',
          '4x50 — 1: 25 UWK + EZ / 2: 10 UWK big kick + EZ / 3: 20 UWK build to fast + EZ / 4: 20 UWK FAST + EZ'
        ] },
        { name: 'WD', totalM: 100, lines: [
          '1x100 Scull / sw'
        ] }
      ]
    },
    {
      id: 'W5D3', week: 5, day: 3, focus: 'FR — Aerobic', totalM: 5000,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '5x200 swim / kick / pull / IM drill / scull-swim by 25'
        ] },
        { name: 'SET 1', totalM: 600, focus: 'SKILLS (Snorkel & paddles)', rounds: '2RDS', lines: [
          '4x25 ankle pull - UW recovery catch-up (human drill) [:45]',
          '4x25 ankle pull - single arm [:45]',
          '1x100 ankle pull - catch-up drill [2:00]'
        ] },
        { name: 'MAIN SET', totalM: 2300, focus: 'FR — Aerobic (ALL FREE)', lines: [
          '1x500 Paddles & fins [7:00]',
          '2x100 BE3/5 by 50 [1:30 G1 / 1:40 G2]',
          '1x400 fins [6:00]',
          '2x100 BE3/5 by 50 [1:30 / 1:40]',
          '1x300 paddles [4:30]',
          '2x100 BE3/5 by 50 [1:30 / 1:40]',
          '1x200 no equip [3:00]',
          '2x100 BE3/5 by 50 [1:30 / 1:40]',
          '1x100 ankle pull [2:00]'
        ] },
        { name: 'SET 3', totalM: 900, focus: 'KICK', sendoff: '3:30', lines: [
          'Odd: FR / Even: Cho',
          '6x150 — 1: Smooth / 2: 100 smooth-50 build / 3: 50 smooth-100 build'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 w/fins, 25 UW / 25 swim'
        ] }
      ]
    },
    {
      id: 'W5D2', week: 5, day: 2, focus: 'Speed Endurance', totalM: 5000,
      blocks: [
        { name: 'W-UP', totalM: 1200, lines: [
          '3x200 swim / kick / pull BE3',
          '3x100 choice K, last 25 strong',
          '6x50 w/fins, paddle / odd: FR, even: BK [1:00 / 1:10]'
        ] },
        { name: 'SET 1', totalM: 1200, focus: 'SKILLS', rounds: '3RDS', lines: [
          '3x50 4-8-12 strokes + ez FR [1:00]',
          '1x100 FR, low SC (count your stroke) EX: 30 STKS [1:30 / 1:45]',
          '1x50 SWOLF desc score by rd [1:00]',
          '1x100 FR w/paddles (reduce SC) EX: 26 STKS [2:00]'
        ] },
        { name: 'MAIN SET', totalM: 1800, focus: 'Speed Endurance', rounds: '2RDS (R1: fast MS / R2: fast FR)', lines: [
          '1x200 50 FAST / 50 ez / 100 FAST [3:30 / 4:00]',
          '1x200 50 FAST / 100 ez / 50 FAST [3:30 / 4:00]',
          '1x200 100 FAST / 50 ez / 50 FAST [3:30 / 4:00]',
          '1x300 FR pull BE3 (can do any 100 BK pull) [5:00]'
        ] },
        { name: 'SET 3', totalM: 600, focus: 'UW', rounds: '3RDS (R1: UW FR K / R2: side kick on surface / R3: UW Fly kick)', lines: [
          '4x25 Smooth big kick [:45]',
          '2x25 15m fast + ez [:45]',
          '1x50 Fly kick on back SL [1:00]'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 EZ swim'
        ] }
      ]
    },
    {
      id: 'W5D1', week: 5, day: 1, focus: 'Threshold', totalM: 5400,
      blocks: [
        { name: 'W-UP', totalM: 900, lines: [
          '1x300 Cho',
          '6x50 Pull - odd: FR / even: BK [1:10]',
          '1x200 IM drill / swim',
          '4x25 Cho fast drill - BK: spin drill, BR/FL: w/FR K [:50]'
        ] },
        { name: 'SET 1', totalM: 150, focus: 'SKILLS (Double Turns)', lines: [
          '6x Push 3-4 UWK > open turn flip > back to wall TURN > push as you can'
        ] },
        { name: 'MAIN SET', totalM: 2000, focus: 'Threshold', rounds: '4RDS', lines: [
          '1x200 50 FR / 50 MS strong swim P400 [3:00 / 3:30]',
          '3x50 MS, desc 1-3 P200 [:50 / 1:00]',
          '2x25 MS FAST [:45]',
          '1x100 FR pull BE5 [2:00]',
          ':30 rest'
        ] },
        { name: 'SET 3', totalM: 1500, focus: 'KICK (w/fins >>> R3 BK KICK)', rounds: '3RDS', lines: [
          '1x50 SL FR kick [1:00 / 1:10]',
          '1x50 25 UW FR kick FAST / 25 FR SW smooth [1:00 / 1:10]',
          '1x150 FR kick w/board [2:30 / 2:45]',
          '1x100 SL fly kick on front / 50 fly kick on back [2:00 / 2:10]',
          '1x150 50 fly k (R - L - on back) [2:30 / 2:45]'
        ] },
        { name: 'WD', totalM: 800, lines: [
          '16x50 FR w/paddles desc 1-4 (reduce stroke every 4) [1:00 / 1:10]',
          '1x400 FR/BK - EZ'
        ] }
      ]
    },
    {
      id: 'W4D2', week: 4, day: 2, focus: 'Threshold', totalM: 4800,
      blocks: [
        { name: 'W-UP', totalM: 1100, lines: [
          '4x200 swim / kick / IM drill / pull BE3 [:20r]',
          '1x300 RIM 75 each fly drill'
        ] },
        { name: 'SET 2', totalM: 400, focus: 'PRE', lines: [
          'Every swimmer needs to know where to start counting the correct number of cycles',
          '8x50 MS, Strong finish, smooth FR >>> 4/6/8/10 cycles MS finish [1:10]'
        ] },
        { name: 'MAIN SET', totalM: 1800, focus: 'Threshold', rounds: '3RDS', lines: [
          '3x150 50 FR / 50 MS / 50 FR - DESC 1-3 [2:30]',
          '4x25 MS FAST [:50]',
          '1x50 FR easy BE5 [1:20]'
        ] },
        { name: 'SET 3', totalM: 1200, focus: 'PULL', rounds: '4RDS', lines: [
          '4x25 FR or BK Strong Pull [:50]',
          '4x50 Pull w/paddles & chute [1:20]'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '1x300 Scull / drill / swim'
        ] }
      ]
    },
    {
      id: 'W4D3', week: 4, day: 3, focus: 'Speed Endurance', totalM: 4200,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '5x100 Odd: FR, even: BK',
          '1x300 RIM (K, drill, SW)'
        ] },
        { name: 'SET 1', totalM: 1500, focus: 'SKILL', rounds: '3RDS', lines: [
          '3x50 Cho - SWOLF desc [1:00 / 1:10]',
          '1x100 FR low SC w/strong kick',
          ':30r',
          '3RDS: 3x50 4,8,12 cycles FAST + EZ by RDS [1:10]',
          '4x25 odd: 1st 10m FAST, even: last 10m FAST [:45]'
        ] },
        { name: 'MAIN SET', totalM: 1100, focus: 'Speed Endurance', lines: [
          '10x100 50 FAST / 25 FR smooth / :30 rest / 25 FAST; IMO 1-4 / 5,6 FR / 7-10 IMO [2:30]',
          '1x100 EZ SW'
        ] },
        { name: 'SET 3', totalM: 600, focus: 'UW', rounds: '3RDS (R1: w/chute, fins / R2: no equip / R3: w/fins)', lines: [
          '1x50 10 UWK (big kick) + EZ [1:00]',
          '1x50 15 UWK (strong kick) + EZ [1:00]',
          '1x50 20 UWK (FAST kick) + EZ [1:00]',
          '1x50 25 UWK - FAST [1:00]'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 FR, EZ'
        ] }
      ]
    },
    {
      id: 'W4D4', week: 4, day: 4, focus: 'IM AERO', totalM: 5500,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '1x300 MIX swim w/fins [:10r]',
          '1x200 Cho, K [:10r]',
          '1x200 FR pull BE3/5/7/9 by 50 [:10r]',
          '1x100 w/fins, 25 UW / 25 scull [:10r]'
        ] },
        { name: 'SET 1', totalM: 800, focus: 'SKILL (RD1: w/fins, RD2: no fins)', rounds: '2RDS', lines: [
          '1x100 w/snork (25 surface side fly K / 25 SL fly K on front) [2:00]',
          '4x25 15m surface side fly K FAST + EZ sw [:45]',
          '1x100 w/snork, L POS [2:00]',
          '4x25 15m L-POS (FR, K FAST + EZ) [:45]'
        ] },
        { name: 'MAIN SET', totalM: 3200, focus: 'IM AERO', lines: [
          '16x200: 25 Fly / 50 BK / 50 BR / 75 FR; 50 Fly / 25 BK / 50 BR / 75 FR; 50 Fly / 50 BK / 25 BR / 75 FR; 200 IM w/fins [3:00 G1 / 3:15 G2]'
        ] },
        { name: 'SET 3', totalM: 400, focus: 'SPEED', lines: [
          '4x25 Deadstart, ankle buoy + paddles 6 Cycle FAST [1:00]',
          '1x100 FR, drill (ankle pull BE3) [2:00]',
          '4x25 w/fins, 3 UWK + 3 cycles FAST [1:00]',
          '1x100 FR, drill (ankle pull BE3) [2:00]'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '1x300 FR kick w/fins & board'
        ] }
      ]
    },
    {
      id: 'W4D5', week: 4, day: 5, focus: 'Speed Endurance', totalM: 4200,
      blocks: [
        { name: 'W-UP', totalM: 600, lines: [
          '1x300 50 FR / 25 SL FR K',
          '1x200 RIM drill / swim',
          '4x25 OTB — 1-2: dive & glide / 3-4: UW + 1 cycle breakout [:45]'
        ] },
        { name: 'SET 1', totalM: 500, rounds: '2RDS', lines: [
          '4x25 w/chute & fins (4 cycle FAST) [1:00]',
          '4x25 w/chute (6 cycle FAST) [1:00]',
          '4x50 FR w/paddles, low SC [1:10]'
        ] },
        { name: 'MAIN SET', totalM: 2000, focus: 'Speed Endurance', rounds: '2RDS', lines: [
          '4x25 FR, 3 FAST / 1 ez [:40]',
          '4x50 FR, 3 FAST / 1 ez [1:00]',
          '4x75 FR, 3 FAST / 1 ez [1:20]',
          '1x400 50 FR / 50 BK [7:00]'
        ] },
        { name: 'SET 4', totalM: 1000, focus: 'w/fins', lines: [
          '1x1000 400 FR / 300 BR w/FR, K / 200 BK / 100 FLY drill'
        ] },
        { name: 'WD', totalM: 100, lines: [
          '1x100 scull / sw'
        ] }
      ]
    },
    {
      id: 'W4D6', week: 4, day: 6, focus: 'Test Set', totalM: 4900,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '4x100 50 swim / 25 SL FR K / :10 rest / 10m scull > 15 SW build to fast finish [2:00]',
          '1x200 FR pull BE2/3/4/5 by 50 [3:30]',
          '4x50 w/fins — odd: 15 UWK + ez swim each wall / even: build to FAST [1:10]',
          '1x100 FR ankle pull BE3/5 by 50',
          '4x25 OTB — 1: dive & glide / 2,3: 15m FAST / 4: 25 FAST'
        ] },
        { name: 'MAIN SET', totalM: 1600, focus: 'TEST SET', rounds: '6RDS', lines: [
          '1x150 FR P400 [2:30 G1 / 2:45 G2]',
          '1x100 FAST >>> Odd: FR / Even: MS [2:00]',
          'RD 6 w/fins',
          '1x100 EZ SW'
        ] },
        { name: 'SET 2', totalM: 800, lines: [
          '16x50 — 4: R,fin/L,hand / 4: L fin/R,hand / 8: fins & paddles [:50 G1 / 1:00 G2]'
        ] },
        { name: 'SET 3', totalM: 200, lines: [
          '2x25 Deadstart >> 4 cycle FAST, fly [1:00]',
          '2x25 5 UWK >> 4 cycle FAST, fly [1:00]',
          '2x25 OTB 5 UWK >> 4 cycle FAST, fly [1:00]'
        ] },
        { name: 'WD', totalM: 1500, lines: [
          '3x500 FR, SW - w/fins'
        ] }
      ]
    },
    {
      id: 'W3D1', week: 3, day: 1, focus: 'Low Aero', totalM: 4700,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '1x300 75 swim / 25 FL K on bk, hands @ side [6:00]',
          '4x75 25 BK / 25 UW / 25 BK - w/fins [1:20 / 1:30]',
          '4x50 RIMO - drill / swim [1:00]',
          '8x25 odd: scull / even: build to FAST finish [:45]'
        ] },
        { name: 'SET 1', totalM: 600, focus: 'SKILLS', sendoff: '1:15', lines: [
          '12x50 push-off >> glide 3 sec, FR K, UW + SW build to FAST finish'
        ] },
        { name: 'MAIN SET', totalM: 1800, focus: 'Low Aero', rounds: '3RDS', lines: [
          '1x300 FR, SW - BE3 70% [4:30 / 4:45]',
          '2x100 FR, SW [1:45] — R1: 70% / R2: 80% / R3: 90%',
          '2x50 odd: catch-up FR / even: single arm [1:15]',
          ':30 rest'
        ] },
        { name: 'SET 3', totalM: 900, focus: 'KICK', rounds: '4RDS (R1: FR / R2: FLY / R3: FR / R4: Cho)', lines: [
          '1x125 K, moderate 70% [2:20]',
          '1x75 K, strong 85% [1:30]',
          '1x25 K, FAST 95% [:40]'
        ] },
        { name: 'WD', totalM: 400, lines: [
          '8x50 FR, w/Fins & paddles >> 15 UW + low SC (-18) [1:00]'
        ] }
      ]
    },
    {
      id: 'W3D2', week: 3, day: 2, focus: 'Threshold', totalM: 4200,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '4x200 swim / kick / IM drill / pull BE3 [:20r]'
        ] },
        { name: 'SET 1', totalM: 400, focus: 'SKILLS (R1: w/fins, R2: no fins)', rounds: '2RDS', sendoff: ':45', lines: [
          '8x25 — odd: 5m in > 15m out UW FAST / even: SW, EZ > dive > 10m UW FAST'
        ] },
        { name: 'SET 2', totalM: 400, focus: 'PRE', lines: [
          'Every swimmer needs to know where to start counting the correct number of cycles',
          '8x50 MS, Strong finish, smooth FR >>> 4/6/8/10 cycles MS finish [1:10]'
        ] },
        { name: 'MAIN SET', totalM: 2000, focus: 'Threshold', rounds: '4RDS', lines: [
          '3x100 FR / MS / FR SW P200 (BR swimmer: 25 BR / 25 FLY) [1:30 / 1:40]',
          '3x50 MS P200 or faster (Beast AV) [:50 / 1:00]',
          '1x50 FR, EZ'
        ] },
        { name: 'SET 4', totalM: 500, focus: 'PULL', sendoff: '1:10', lines: [
          '5x100 75 FR / 25 BK w/Paddles, FR > BE5'
        ] },
        { name: 'WD', totalM: 100, lines: [
          '1x100 EZ kick'
        ] }
      ]
    },
    {
      id: 'W3D3', week: 3, day: 3, focus: 'Speed Endurance', totalM: 3600,
      blocks: [
        { name: 'W-UP', totalM: 600, rounds: '2RDS', lines: [
          '1x50 OTB - dive > glide as possible > ez swim [1:20]',
          '1x100 FR catch-up drill, build to strong kick [1:45]',
          '1x150 K on back (50 FL / 50 BK / 50 Cho) [3:00]'
        ] },
        { name: 'SET 1', totalM: 800, focus: 'SKILLS', rounds: '3RDS', lines: [
          '3x50 Cho of stroke, SWOLF [1:00 / 1:10]',
          '1x100 FR low count (STRONG KICK) [2:00]',
          '1x50 EZ'
        ] },
        { name: 'SET 2', totalM: 900, focus: 'PRE', rounds: '3RDS (R1: w/chute & fins / R2: w/chute / R3: no equip)', lines: [
          '4x50 4/6/8/10 cycles FAST (then EZ FR) [:30r]',
          '4x25 odd: 15m FAST, even: last 10m FAST'
        ] },
        { name: 'MAIN SET', totalM: 800, focus: 'Speed Endurance', sendoff: '2:00', lines: [
          '8x100 50 FAST / 25 FR smooth / :10 rest / 25 FAST; IMO 1-4 / 1:00 rest / 5-8 IMO'
        ] },
        { name: 'SET 4', totalM: 400, focus: 'UW', sendoff: '1:30', lines: [
          '8x50 FR, w/fins — 1: 40m ez swim > last 10m UW FAST / 2: 30m ez swim > last 20m UW FAST / 3: 20m ez swim > last 30m UW FAST / 4: EZ swim'
        ] },
        { name: 'WD', totalM: 100, lines: [
          '1x100 scull / swim / scull / swim'
        ] }
      ]
    },
    {
      id: 'W3D4', week: 3, day: 4, focus: 'IM AERO', totalM: 5200,
      blocks: [
        { name: 'W-UP', totalM: 1200, rounds: '3RDS', lines: [
          '1x200 FR BE3/5/7 by rd [3:00 / 3:20]',
          '2x75 50 K on back / 25 catch-up FR [1:30]',
          '1x50 25 FL or BR w/FR, K / 25 catch-up FR [1:20]'
        ] },
        { name: 'SET 1', totalM: 800, focus: 'SKILL (w/Snorkel)', sendoff: '1:30', lines: [
          '4x50 FR, K (25, 11 POS / 25 hands @ side)',
          '4x50 FR or Fly, K (L, POS)',
          '4x100 FR (50 SW straight arm slow catch) (50 hold high elbow 8 kick, switch)'
        ] },
        { name: 'MAIN SET', totalM: 2200, focus: 'IM AERO', lines: [
          '4x50 25 FLY Strong + EZ, FR [1:00]',
          '3x200 FRIM 70% [3:00 / 3:20]',
          '4x50 25 BK, Strong + EZ, FR [1:00]',
          '2x300 FRIM 70% [4:30]',
          '4x50 25 BR, Strong + EZ, FR [1:00]',
          '1x400 FRIM 70% [6:00]'
        ] },
        { name: 'SET 3', totalM: 100, focus: 'SPEED', sendoff: '1:20', lines: [
          '6x15m Start from 15m > FAST turn > push-off > only glide'
        ] },
        { name: 'WD', totalM: 900, lines: [
          '4x200 w/fins & paddles 100 FR / 100 BK, Low SC',
          '1x100 Cho EZ'
        ] }
      ]
    },
    {
      id: 'W14D3', week: 14, day: 3, date: '2025-11-19', phase: 'Specific Prep', dryland: '3R :40 work / :20 rest x2', totalM: 4250,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '1x400 w/fins every 4th 25 = UW, 6:00',
          '4x50 Fly Kick on side (1 hand up), 1:00',
          '4x100 FR Pull BE3/5 by 50, 1:30'
        ] },
        { name: 'PREP SET', totalM: 1050, lines: [
          '3x100 FR Pull BE3, 1:30',
          '4x50 MS Decel 1→4, :50',
          '2x100 FR Pull BE3, 1:30',
          '3x50 MS Decel→3, :55',
          '1x100 FR Pull BE3, 1:30',
          '2x50 MS Fast, 1:00'
        ] },
        { name: 'MAIN SET', totalM: 1200, focus: 'VO2 MAX', lines: [
          'Two group options (parallel, same 1200m total):',
          'G1 — Sprinter 50/100, P100: 24x50 1 fast / 1 EZ @1:00',
          'G2 — Mid 200/400, P200: 24x50 2 fast / 1 EZ @1:00'
        ] },
        { name: 'REC SET', totalM: 700, lines: [
          '1x200 w/fins scull/sw/kick/sw, 3:30',
          '4x50 FR Pull, :45',
          '4x25 w/fins UW (12.5 fast / 12.5 EZ), :40',
          '1x200 FR DPS'
        ] },
        { name: 'FAST TURNS', totalM: 200, lines: [
          '8x25 OTB Fast — dive 12.5m > open turn/flip turn > 12.5m finish (w/relay-style exchange, next swimmer goes as prior finishes)'
        ] },
        { name: 'WD', totalM: 100, lines: [
          '1x100 scull/sw'
        ] }
      ]
    },
    {
      id: 'W14D4', week: 14, day: 4, date: '2025-11-20', phase: 'Specific Prep', dryland: 'Mobility', totalM: 4150,
      blocks: [
        { name: 'W-UP', totalM: 600, lines: [
          '1x200 Cho sw',
          '1x200 Cho kick',
          '4x[15m MS OTB + EZ / 4x SL Jumps → :05 kick@wall + turn → 15m UW]'
        ] },
        { name: 'SET1 — PREP SET', totalM: 750, rounds: '3RDS (fins & paddles)', lines: [
          '2x100 (1st 15m UW + breakout fast (MS) / middle 75m = FR low SC / last 10m no-breath finish fast (MS)) @1:45',
          '1x50 35m build to fast / 15m kick Cho EZ, 1:15'
        ] },
        { name: 'SET2 — MAIN SET', totalM: 1300, focus: 'Speed Endurance', lines: [
          'Two group options (parallel):',
          'G1 (50/100 specialists), 900m: 3x[4x50 (①OTB build+35m / ②middle 25m / ③④last 15m) @1:30 / 1x100 EZ @3:00]',
          'G2 (200/400 specialists), 1300m: 4x[1x50 OTB build to fast, 1:20 / 1x75 hold race pace, 1:20 / 1x100 last 50m fast, 1:30 / 1x100 EZ, 3:00]'
        ] },
        { name: 'SET3 — KICK', totalM: 1200, rounds: '3x (w/fins & snorkel)', lines: [
          '4x100 (①② Fly kick on side, 25R-25L / ③ FR kick 11-Pos / ④ FR swim, strong kick, 6 strokes each 25), 1:45'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '1x300 scull / sw / double-arm BK'
        ] }
      ]
    },
    {
      id: 'W14D6', week: 14, day: 6, date: '2025-11-22', phase: 'Specific Prep', totalM: 5400,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '1x400 Cho sw, 6:00',
          '1x200 Cho kick, 4:00',
          '8x50 w/snorkel & fins (odd: 25 Fly kick hand@side / 25 11-Pos Fly kick), "body pos", 1:00'
        ] },
        { name: 'SET1', totalM: 500, focus: 'MS Speed', rounds: '3RDS + R3 w/fins', lines: [
          '2x25 MS kick "11 Pos", :40',
          '2x25 MS single arm, :40',
          '2x25 MS (odd: 20m fast / even: 25m fast OTB), :40',
          '1x50 FR EZ'
        ] },
        { name: 'MAIN SET', totalM: 2250, focus: 'FR Aero', rounds: '3RDS', lines: [
          '3x200 FR sw @2:50 / 2:40 / 2:30',
          '3x50 BK sw, :50 (:30 rest)'
        ] },
        { name: 'SET3', totalM: 1200, focus: 'Kick Set', rounds: '3RDS — R1: FR / R2: MS / R3: Cho', lines: [
          '1x50 kick build to fast, 1:00',
          '1x25 FR sw, 6-8 strokes, :30',
          '1x100 kick, no-breath by 25, 1:45',
          '1x25 FR sw, 6-8 strokes, :30',
          '1x200 kick, no-breath by 50, 3:30 / 3:45'
        ] },
        { name: 'WD', totalM: 450, lines: [
          '16x25 FR-dr, paddle on head, :40',
          '1x50 EZ'
        ] }
      ]
    },
    {
      id: 'W14D0', week: 14, day: 0, date: '2025-11-23', phase: 'Specific Prep', dryland: 'Med Ball', totalM: 4500,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '1x200 Cho sw, 3:30',
          '1x200 Cho kick, 4:00',
          '8x50 MS (odd: kick Fly/BR 11-Pos, 3-kick rotation / even: drill single arm), "body pos", 1:10'
        ] },
        { name: 'SET1 — PREP SET', totalM: 500, rounds: '2RDS', lines: [
          '1x100 FR sw, 1:30',
          '4x25 VS (fast+EZ / EZ+fast / build / fast), :40',
          '1x50 MS sw, P200 or faster, 1:00'
        ] },
        { name: 'SET2 — MAIN SET', totalM: 1800, focus: 'MS Threshold', rounds: '3RDS', lines: [
          '1x200 (50 MS fast / 150 FR DPS, 13-14 SC each 25), 3:30',
          '1x200 (100 MS fast / 100 FR DPS), 3:30',
          '1x200 (150 MS fast / 50 FR DPS), 4:00'
        ] },
        { name: 'SET3 — UW SET', totalM: 1200, lines: [
          '3x100 FR sw w/fins (4 UWK each wall), 1:30',
          '4x25 UW w/fins smooth, :45',
          '3x100 FR sw w/fins (6 UWK each wall), 1:30',
          '4x25 UW w/fins & chute, :50',
          '3x100 FR sw w/fins (8 UWK each wall), 1:30',
          '4x25 UW w/fins fast, :45'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 EZ sw'
        ] }
      ]
    },
    {
      id: 'W14D2', week: 14, day: 2, date: '2025-11-24', phase: 'Specific Prep', dryland: 'D:1', totalM: 3900,
      blocks: [
        { name: 'W-UP', totalM: 800, lines: [
          '1x300 Cho every 4th 25 UW, 5:00',
          '4x50 Kick (25 FR / 25 Cho), 1:00',
          '4x50 drill Cho, 1:00',
          '4x25 :05 kick@wall → turn → 15m fast, :45'
        ] },
        { name: 'PRE SET', totalM: 600, rounds: '3RDS', lines: [
          '1x50 kick build to fast, :50',
          '2x25 MS (①build ②fast), :30',
          '1x50 BK EZ, 1:20',
          '1x25 MS fast OTB, :30',
          '1x25 G2, 1:00'
        ] },
        { name: 'MAIN SET', totalM: 1250, focus: 'Lactate Production (MS incl. Free)', lines: [
          'Two group options (parallel):',
          'G1 (50/100), 1000m: 5x[1x25 fast OTB, 1:00 / 1x50 fast, 1:30 / 1x25 fast, 1:00 / 1x100 EZ kick/sw, 2:30]',
          'G2 (200/400), 1250m: 5x[1x50 fast OTB, 1:00 / 1x75 fast, 1:30 / 1x50 fast, 1:00 / 1x75 EZ kick/sw, 2:30]'
        ] },
        { name: 'RECOVERY', totalM: 300, lines: [
          '1x300 scull / drill / EZ sw'
        ] },
        { name: 'SET4 — KICK-KICK', totalM: 600, lines: [
          '12x50 w/fins (25 UW / 25 on back)'
        ] },
        { name: 'WD', totalM: 350, lines: [
          '2x100 FR-IM, no Fly, 1:40',
          '2x50 Cho-dr, 1:00',
          '1x50 double-arm BK'
        ] }
      ]
    },
    {
      id: 'W14D5', week: 14, day: 5, date: '2025-11-25', dryland: 'Plank', totalM: 5500,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '4x100 Cho, every 4th 25 = scull, 1:45',
          '4x50 kick, any 15m strong, 1:00',
          'Add fins + snorkel:',
          '4x[1x50 Fly K on side, 1 arm up, 1:45 / 1x50 Cho " ", "what do you need to work on? dr/K/sprint/Cho"]'
        ] },
        { name: 'SET1 — MAIN SET ①', totalM: 800, focus: 'Resisted Skills', rounds: '2RDS', lines: [
          '6x25 w/chute drill, :45',
          '4x25 w/fins & paddles sw (①smooth ②build w/big strokes ③fast "tempo" ④EZ FR), :45',
          '1x50 no equipment, build to fast, 1:00',
          '1x100 EZ'
        ] },
        { name: 'SET2 — MAIN SET ②', totalM: 3400, focus: 'IM Efficiency', rounds: '2RDS', lines: [
          '8x50 25 IMO / 25 FR, 1:00 — hold consistent UWK@SC',
          '4x100 IM, sw, 1:40 — stroke limit per stroke (5/9/5/9 or 6/10/7/11/8-12/7-13)',
          '4x25 body position Fly K, hands@side, :45',
          '4x100 IM, sw, 8 UWK, "8x double pullout" each wall, 1:40',
          '8x50 25 FR / 25 IMO, work perfect finishes, 1:00'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '6x50 FR-kick'
        ] }
      ]
    },
    {
      id: 'W14D3B', week: 14, day: 3, date: '2025-11-26', totalM: 4400, dryland: 'Plyo',
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '1x300 Cho-sw, 5:00',
          '6x50 kick on side (Fly or FR) w/snorkel, 1:00',
          '2x100 25 scull / 25 catch-up w/snorkel, 1:45',
          '8x25 UWK (Fly or BR) *3,6,8 = fast, :45'
        ] },
        { name: 'SET1 — PRE SET', totalM: 1050, rounds: '3RDS', lines: [
          '3x25 Cho-dr (R1: FR-FR-MS / R2: MS-FR-MS / R3: FR-MS-MS w/fins)',
          '3x75 (same R1/R2/R3 stroke pattern) @1:15 — FR=smooth, MS=fast',
          '1x50 EZ'
        ] },
        { name: 'MAIN SET', totalM: 1425, focus: 'VO2 MAX', rounds: '3RDS', lines: [
          '5x75 (odd: MS fast / even: FR EZ), 1:30',
          'G2 → 200/400: 6x50 (odd: fast / even: EZ), 1:00 / 1x100 EZ kick',
          '1x100 EZ kick'
        ] },
        { name: 'SET3 — REC', totalM: 500, lines: [
          '1x200 w/fins scull/sw/kick/sw, 3:30',
          '4x50 FR Pull, :45',
          '4x25 w/fins UW (12.5 fast / 12.5 EZ), :40'
        ] },
        { name: 'SET4 — FAST TURNS', totalM: 200, lines: [
          '8x25 OTB fast (w/relay exchange) — dive 12.5m > open turn/flip turn > 12.5m finish; next swimmer starts as prior finishes'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '4x50 EZ FR/BR'
        ] }
      ]
    },
    {
      id: 'W14D4B', week: 14, day: 4, date: '2025-11-27', totalM: 4900, dryland: 'Mobility',
      blocks: [
        { name: 'W-UP', totalM: 600, lines: [
          '1x200 Cho',
          '1x200 Cho/EZ, 7:00'
        ] },
        { name: 'CNS ACTIVATION', totalM: null, rounds: '4x', lines: [
          '1x15m OTB, 1:00',
          '4x SL Jumps → :05 kick@wall → turn → 15m UW, 1:00'
        ] },
        { name: 'SET1 — PRE SET', totalM: 1200, rounds: '2RDS (R1: w/fins / R2: no equip)', lines: [
          '4x75 50 FR / 25 MS kick, 1:20',
          '3x50 MS drill, 1:00',
          '2x25 MS build, :30',
          '1x100 50 MS fast / 50 EZ, 2:00'
        ] },
        { name: 'MAIN SET', totalM: 1800, focus: 'Speed Endurance "Race Pace"', rounds: '3RDS', lines: [
          '8x50 MS sw — R1@1:00 (Build,P+2,P+2,P+2,P+1,P+1,P,P), R2@1:10 (Build,P+2,P+2,P+1,P+1,P,P,P-1), R3@1:20 (P+2,P+1,P,P,P-1,P-1,P-2,P-2)',
          '1x200 EZ kick/sw, 4:00',
          'P = 100 goal pace (goal-100-time / 4); e.g. goal 100 = 1:04 → P = :16/25; P+2 = :18, P+1 = :17, P = :16, P-1 = :15, P-2 = :14'
        ] },
        { name: 'SET3 — KICK / BODY POSITION', totalM: 1000, rounds: '2RDS', lines: [
          '1x50 Fly or FR 11-Pos kick, 1:00',
          '1x50 Fly kick on side (one hand up), 1:00',
          '1x50 Cho kick on back, 1:00',
          '3x100 Cho kick fast "for time", 2:30',
          '1x50 Cho G2 sw'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '1x300 scull / sw / double-arm BK'
        ] }
      ]
    },
    {
      id: 'W15D0', week: 15, day: 0, date: '2025-11-30', phase: 'Taper — Part 1', dryland: '3RDS x6 Station :30 work / :30 rest', totalM: 3825,
      blocks: [
        { name: 'W-UP', totalM: 1025, lines: [
          '1x200 Cho, 3:30',
          '3x[1x50 K,Cho, 1:00 / 1x75 50dr/:05r/25build, 1:15 / 1x150 IM "No FR" Desc by Rd, 2:30]'
        ] },
        { name: 'SET1 — PRE SET', totalM: 700, rounds: '2x, w/chute', lines: [
          '2x25 smooth, :45',
          '2x25 15 build / 10 EZ, :45',
          '2x25 10 fast / 15 EZ, :45',
          'Chute off: 4x50 drill Cho, 1:00'
        ] },
        { name: 'SET2 — MAIN SET', totalM: 1300, rounds: '2x', lines: [
          '1x100 FR build, 1:30',
          '1x100 FR BE4,3,2,2,then2,5, 1:30',
          '5x50 MS → G1: 1 build / 2,3,4,5: P200, :50 (sprinkled) or G2: 3x50@P100@1:30',
          '1x200 EZ'
        ] },
        { name: 'WD', totalM: 800, rounds: '1x', lines: [
          '8x50 fins,paddles, :50 (odd 80% / even 70%)',
          '4x50 kick (any 15m fast), 1:00',
          '4x25 variable sprint, :40',
          '1x100 IM kick EZ'
        ] }
      ]
    },
    {
      id: 'W15D3', week: 15, day: 3, date: '2025-12-03', dryland: '8R :30 work / :30 transition, 6St, 18 min total — Plyo', totalM: 2900,
      blocks: [
        { name: 'W-UP', totalM: 1200, lines: [
          '1x300 Cho, w/fins, 5:00',
          '3x100 FR, kick w/fins, 1:45',
          '6x50 25 scull / 25 MS drill, 1:00',
          '3x100 FR Pull Desc 1→3, 1:30'
        ] },
        { name: 'SET1 — PRE SET', totalM: 600, rounds: '2x', lines: [
          '4x25 w/chute (odd: 8 UWK fast+EZ / even: build to last 10m fast), :45',
          '1x25 UW build, :45',
          '1x25 15m fast + EZ, :45',
          '1x50 EZ kick, 1:00',
          '4x50 MS dr/build, 1:00'
        ] },
        { name: 'SET2 — MAIN SET', totalM: 800, lines: [
          '8x25 (odd: MS strong / even: FR DPS), :30 — Pace=MS, Smooth=FR',
          '12x50, 1:00 → ①Pace/①Smooth, ①Pace/②Smooth, ①Pace/③Smooth, ①Pace/②Smooth (4 rotations)'
        ] },
        { name: 'SET3', totalM: 100, lines: [
          '4x25 OTB — ①dive@glide, ②UW+2cyc fast, ③④ 15m for time'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '4x50 Cho scull/sw'
        ] }
      ]
    },
    {
      id: 'W15D4', week: 15, day: 4, date: '2025-12-04', phase: 'Taper — Part 1', dryland: 'Mobility', totalM: 3400,
      blocks: [
        { name: 'W-UP', totalM: 1575, focus: 'Meet-Style Warmup', lines: [
          '4x100 50sw/25skull/25k, 1:45',
          '4x75 fins,snorkel, 6UWK, catch-up, 8SK, 1:15',
          '8x50 (odd: dr/sw MS, 1:00 / even: desc 1→4)',
          '6x25 Cho turn, 5m in - 10m out, :45',
          '3x50 MS ①build ②③P200, 1:00',
          '3x25 OTB ①dive+glide ②③15m',
          '1x100 FR'
        ] },
        { name: 'SET1 — MAIN SET (Broken)', totalM: 325, lines: [
          'Broken 200: 1x100 OTB EZ speed / R:20 / 1x50 fast / R:10 / 1x50 fast',
          'Broken 125: 1x50 OTB EZ speed / R:30 / 1x50 fast / R:10 / 1x25 fast'
        ] },
        { name: 'REC', totalM: 600, lines: [
          '2x100 kick/sw, 1:40',
          '4x50 FR BE5, :45',
          '1x200 scull/sw/kick/sw'
        ] },
        { name: 'WD', totalM: 900, lines: [
          '4x100 kick/sw, 1:45',
          '4x50 BE3, :45',
          '4x25 variable sprint, :30',
          '1x200 max pace EZ'
        ] }
      ]
    },
    {
      id: 'MAR10', date: '2026-03-10', phase: 'March 2026 sessions', totalM: 5150,
      blocks: [
        { name: 'W-UP', totalM: 1050, lines: [
          '1x400 choice w/fins - every 4th 25 UW, 6:00',
          '6x50 kick (3,6 fast), :55',
          '1x200 25 scull / 25 swim, 3:00',
          '6x25 UW w/fins (3,6 fast), :40'
        ] },
        { name: 'KICK', totalM: 900, lines: [
          '4x25 FL kick on side in L-position (w/snorkel), :45',
          '1x200 choice kick neg split by 50, 70%-80%, 4:00',
          '4x25 FR kick on side in L-position (w/snorkel), :45',
          '1x200 choice kick build, 4:00',
          '4x25 BR kick on back, hands@side, :45',
          '1x200 choice kick fast, 4:00'
        ] },
        { name: 'MAIN SET', totalM: 3000, lines: [
          '8x100 FR pull desc 1-2, 1:30',
          '4x50 IM order (fly-bk-br-fr), :50',
          '6x50 start@mid-pool (turn1: pause :02sec-push / turn2: smooth&fast), 1:00',
          '8x75 25 IMO / 50 FR, 1:05',
          '4x50 FR-strong, :50',
          '6x50 25 drill/:05r/25 build to fast finish (fins optional), 1:00',
          '8x50 FR w/fins desc 1-2, :50',
          '4x50 choice no fins, hold strong, 1:00'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 25 scull / 25 swim / 50 kick'
        ] }
      ]
    },
    {
      id: 'MAR22', date: '2026-03-22', phase: 'March 2026 sessions', totalM: 3100,
      blocks: [
        { name: 'W-UP', totalM: 900, lines: [
          '1x300 FR w/fins every 4th 25 UW',
          '3x100 kick Cho, any 25 fast, 2:00',
          '6x50 25 drill / 25 build (odd: FR, even: MS), 1:00 (G1) / 1:10 (G2)'
        ] },
        { name: 'SET1 — PRE SET', totalM: 800, rounds: '2RDS', lines: [
          '4x50 w/chute, 25 smooth / 25 build (odd: FR, even: MS), 1:15 (G1)',
          '2x25 no chute, 1: 90% / 2: 95%, :45',
          '6x50 (1: MS-smooth / 2: MS-build / 3: 25 MS fast - 25 FR EZ), :50 (G1) / 1:00 (G2)'
        ] },
        { name: 'MAIN SET', totalM: 800, lines: [
          '"200 group" (2RDS): 1x50 OTB 95% / 2x50 P200 / 1x50 EZ / 2x75 (25 build / 50 P200), 1:30 — then 1x100 EZ, 3:00 — group total 800m',
          '"100 group" (2RDS): 1x25 OTB 95% / 1x25 EZ / 1x50 P100 / 1x50 EZ / 2x75 (25 EZ / 25 build / 25 fast), 1:30-1:40 — then 1x100 EZ, 4:00 — group total 700m'
        ] },
        { name: 'WD', totalM: 600, lines: [
          '1x200 75 sw / 25 scull',
          '4x50 kick, any 10m fast',
          '1x200 EZ'
        ] }
      ]
    },
    {
      id: 'MAR23', date: '2026-03-23', phase: 'March 2026 sessions', totalM: 4100,
      blocks: [
        { name: 'W-UP', totalM: 1000, lines: [
          '2x200 (1: sw / 2: kick)',
          '4x75 IMO, 25R-25L-25sw, 1:30 (G1) / 1:40 (G2)',
          '6x50 (odd: FR, 2 BE each 25 / even: Cho build to strong), 1:00 / 1:10'
        ] },
        { name: 'SET1 — KICK', totalM: 750, rounds: '3RDS', lines: [
          '2x75 25R/25L (side kick) / 25 Fly kick on back, 1:30 (G1) / 1:40 (G2)',
          '2x50 FR kick w/board (desc by RD), 1:00 / 1:10'
        ] },
        { name: 'MAIN SET', totalM: 1650, rounds: '3RDS', lines: [
          '1x300 FR pull w/paddles (BE3,5,3 by 100), 4:30 (G1) / 5:00 (G2)',
          '4x50 Cho, NO FR (1: 25R arm/25L arm / 2-3: strong, seam stroke count / 4: build to fast), 1:00 / 1:10',
          '1x50 EZ, BK sw, 2:00'
        ] },
        { name: 'SET3', totalM: 500, lines: [
          '4x25 w/fins fast turns (FR), :45',
          '16x25 (1-3: UW smooth / 4: UW 15m fast + EZ), :45'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 kick-Cho'
        ] }
      ]
    },
    {
      id: 'MAR24', date: '2026-03-24', phase: 'March 2026 sessions', totalM: 5150,
      blocks: [
        { name: 'W-UP', totalM: 1050, lines: [
          '1x400 Cho w/fins, every 4th 25 UW, 6:00',
          '6x50 Cho kick (3,6 fast), :55 (G1) / 1:10 (G2)',
          '1x200 Cho, 25 scull / 25 sw, 3:00 (G1) / 3:20 (G2)',
          '6x25 UW w/fins, 3,6 fast, :40'
        ] },
        { name: 'SET1 — KICK', totalM: 900, rounds: '1RDS', lines: [
          '4x25 Fly kick on side L-Pos (w/snorkel), :45',
          '1x200 Cho kick neg split by 50, 70%-80%, 4:00 (G1) / 4:20 (G2)',
          '4x25 FR kick on side L-Pos (w/snorkel), :45',
          '1x200 Cho kick build, 4:00 / 4:20',
          '4x25 BR kick on back, hands@side, :45',
          '1x200 Cho kick fast, 4:00 / 4:20'
        ] },
        { name: 'MAIN SET', totalM: 3000, lines: [
          '8x100 FR pull desc 1-2, 1:30 (G1) / 1:45 (G2)',
          '4x50 IMO sw, :30 rest',
          '6x50 Cho turns (start from mid-pool, 12.5m in / 12.5m out x2), 1:00 / 1:10',
          '8x75 25 MS fast / 50 FR, 1:10 / 1:20',
          '4x50 FR strong, :50 / 1:00',
          '6x50 25 drill > :05 rest > 25 build to fast finish, 1:00 / 1:10',
          '8x50 FR w/fins desc 1-2, :50 / 1:00',
          '4x50 MS P200, 1:00 / 1:10'
        ] },
        { name: 'WD', totalM: 200, lines: [
          '1x200 25 scull / 25 sw / 50 kick'
        ] }
      ]
    },
    {
      id: 'MAR25', date: '2026-03-25', phase: 'March 2026 sessions', totalM: 3250,
      blocks: [
        { name: 'W-UP', totalM: 1050, lines: [
          '1x300 100sw/50 kick, 5:00',
          '3x100 FR pull desc 1-3, 1:30 (G1) / 1:40 (G2)',
          '1x300 scull / drill / sw, 5:00',
          '4x25 15m from deadstart, :40',
          '1x50 EZ, 1:10'
        ] },
        { name: 'SET1 — PRE SET', totalM: 450, rounds: '3RDS', lines: [
          '4x25 w/chute desc 1-4 to fast, :45, chute off',
          '1x25 fast-OTB, :45',
          '1x25 EZ, 1:00'
        ] },
        { name: 'MAIN SET', totalM: 1050, rounds: '3RDS', lines: [
          '1x100 Cho kick-smooth, 2:00 (G1) / 2:10 (G2)',
          '4x50 MS — R1: desc 1-4 to P200, :50/1:00 — R2: 1 build/2:P+1/3,4:P200, 1:00/1:05 — R3: 1 build/2,3:P200/4:P-1, 1:10/1:10',
          '1x50 EZ, 1:00'
        ] },
        { name: 'SET3 — UW', totalM: 400, lines: [
          '4x25 UW w/fins smooth, :40',
          '4x25 10m UW + glide > then EZ sw, :40',
          'No fins: 4x25 8 UW + glide > then EZ sw, :45',
          '4x25 12.5 UW + 3 strokes fast, :45'
        ] },
        { name: 'WD', totalM: 300, lines: [
          '3x100 25 scull / 25 kick / 50 sw, 1:40'
        ] }
      ]
    }
  ];

  // ---------------------------------------------------------------------
  // WIRED INTO THE LIVE GENERATOR — same pattern js/swiml-database.js
  // established: each build() has the exact (shareM, pace100, scaler,
  // nextStroke, equipment) signature every native archetype/blueprint in
  // workout-generator.js already uses, returning [{label, sets}, ...]
  // rounds run through the identical buildToShare() distance-accuracy
  // machinery. `buildSet`/`splitProportional`/`splitShareEqual`/
  // `roundCountFor`/`paceBand`/`pickOne`/`workoutRng` are all real globals
  // defined in workout-generator.js (no wrapping IIFE there) — safe to call
  // here because these build() functions are only ever INVOKED later, once
  // generateWorkout() runs, by which time that file has fully loaded.
  // Every shape below is the real, distinctive STRUCTURE from an actual
  // ADAC session (not just vocabulary spliced onto an existing skeleton) —
  // the same "real structure, not just real words" standard the swiML
  // blueprints already hold to.
  // ---------------------------------------------------------------------
  window.ADAC_MAIN_SET_ARCHETYPES = {
    endurance: [
      {
        name: 'Threshold — ADAC MS/DPS Split Ladder',
        adacSource: 'W14D0 (Sun 23 Nov 2025) — MS Threshold',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real shape: 3 rounds of 200m, each split into a Main-Stroke
          // "fast" segment and a Freestyle "DPS" segment whose ratio
          // inverts across rounds — 50/150, then 100/100, then 150/50 — so
          // the fast-stroke component grows while the easy-Freestyle
          // component shrinks, round by round.
          var stroke = nextStroke();
          var perRoundM = Math.max(200, Math.round((shareM / 3) / 200) * 200);
          var reps = Math.max(1, Math.round(perRoundM / 200));
          function round(msM, frM, label) {
            return { label: label + ' — ADAC', sets: [buildSet(reps, msM + frM, stroke + ' ' + msM + 'm fast / FR ' + frM + 'm DPS', [], pace100 + 2, 30, scaler, 'Threshold Pace')] };
          }
          return [round(50, 150, 'Round 1'), round(100, 100, 'Round 2'), round(150, 50, 'Round 3')];
        },
        intents: [
          'A real Abu Dhabi Aquatics Club threshold set: the same 200m rep is split between a fast main-stroke segment and an easy Freestyle DPS segment, but that split inverts round by round — 50/150 growing to 150/50 — so the hard-stroke workload climbs steadily inside a fixed rep length rather than the whole rep just getting harder all at once.'
        ]
      }
    ],
    speed: [
      {
        name: 'Sprint — ADAC Broken Ladder',
        adacSource: 'W15D4 (Thu 4 Dec 2025) — Broken 200/125',
        build: function (shareM, pace100, scaler, nextStroke) {
          // Real shape: an easy-speed OTB opener (real session: 100m or
          // 50m) followed by TWO shorter "fast" reps with shrinking rest
          // between them (real session: R:20 then R:10) — e.g. a real
          // Broken 200 is 100 opener + 50 fast + 50 fast, not one long
          // opener plus one long fast rep. Opener/fast legs are kept ≤100m/
          // ≤75m respectively — safely under the 200m single-rep stroke cap
          // buildSet() enforces for Backstroke/Breaststroke/Butterfly, so a
          // capped stroke here never triggers that cap's own rep-inflation
          // (which would otherwise silently blow this archetype's own
          // careful budget).
          var stroke = nextStroke();
          var n = roundCountFor(scaler);
          var shares = splitShareEqual(shareM, n);
          return shares.map(function (m) {
            var openerM = Math.max(25, Math.min(100, Math.round((m * 0.45) / 25) * 25));
            var remaining = Math.max(50, m - openerM);
            var fastEachM = Math.max(25, Math.min(75, Math.round((remaining / 2) / 25) * 25));
            return {
              label: 'Broken ' + (openerM + fastEachM * 2) + ' — ADAC',
              sets: [
                buildSet(1, openerM, stroke + ' OTB, ease speed', [], pace100 + 8, 20, scaler, 'Cruise Pace'),
                buildSet(2, fastEachM, stroke + ' fast, broken', [], paceBand(pace100, 'p1'), 10, scaler, 'Race-Pace Band')
              ]
            };
          });
        },
        intents: [
          'A real Abu Dhabi Aquatics Club broken-swim ladder: an easy-speed dive-and-glide opener bleeds straight into two genuinely fast finishing reps, mirroring the club\'s own real Broken 200/Broken 125 shape rather than a flat repeated sprint.'
        ]
      }
    ],
    technique: [
      {
        name: 'Stroke-Count Limit — ADAC IM Efficiency',
        adacSource: 'W14D5 (Tue 25 Nov 2025) — IM Efficiency',
        build: function (shareM, pace100, scaler) {
          // Real shape: IM reps constrained by a stroke-count CEILING per
          // length rather than a pace target — the real session's own
          // notation (e.g. "5/9" or "6/10/7/11/8-12/7-13").
          var reps = Math.max(2, Math.round(shareM / 100));
          var limitPhrase = pickOne([
            '5-9 strokes per 25, alternating',
            '6-10 strokes per 25, alternating',
            '7-11 strokes per 25, alternating',
            '8-12 strokes per 25 (odd) / 7-13 (even)'
          ]);
          return [{ label: 'IM Efficiency — ADAC', sets: [buildSet(reps, 100, 'IM, stroke-count limit — ' + limitPhrase, [], pace100 + 10, 20, scaler, 'Drill Pace')] }];
        },
        intents: [
          'A real Abu Dhabi Aquatics Club efficiency set: instead of chasing a clock, each length is capped at a maximum stroke count — the swimmer has to find more distance per stroke to stay under the ceiling, which trains the exact same DPS/SWOLF skill a pace-based set can\'t directly target.'
        ]
      }
    ]
  };

  window.ADAC_WARMUP_BLUEPRINTS = [
    {
      name: 'ADAC Meet-Style Warmup',
      adacSource: 'W15D4 (Thu 4 Dec 2025) — Meet-Style Warmup',
      build: function (shareM, pace100, scaler, nextStroke, equipment) {
        // Real shape: 7 distinct blocks — a 50sw/25scull/25kick opener,
        // fins+snorkel catch-up with underwater kicks off the wall, an
        // odd/even drill-vs-descend 50s line, choice-stroke turn practice
        // (5m in / 10m out), a main-stroke build line, a starts line
        // (dive+glide into 15m fast), and a closing easy Freestyle swim.
        var hasFins = equipment && equipment.indexOf('Fins') > -1;
        var hasSnorkel = equipment && equipment.indexOf('Snorkel') > -1;
        var fr = [0.25, 0.19, 0.25, 0.10, 0.10, 0.05, 0.06];
        var shares = splitProportional(shareM, fr);
        var openerSet = buildSet(Math.max(2, Math.round(shares[0] / 100)), 100, '50 sw / 25 scull / 25 kick — ADAC meet-style', [], pace100 + 15, 15, scaler, 'Easy Pace');
        openerSet.stroke = 'Freestyle';
        var catchUpGear = [];
        if (hasFins) catchUpGear.push('Fins');
        if (hasSnorkel) catchUpGear.push('Snorkel');
        var closerSet = buildSet(1, Math.max(100, shares[6]), 'FR EZ, settle in — ADAC', [], pace100 + 15, 10, scaler, 'Easy Pace');
        closerSet.stroke = 'Freestyle';
        return [
          { label: null, sets: [openerSet] },
          { label: 'Catch-Up + UWK — ADAC', sets: [buildSet(Math.max(2, Math.round(shares[1] / 75)), 75, 'Catch-up drill, 6 UWK off every wall', catchUpGear, pace100 + 12, 15, scaler, 'Drill Pace')] },
          { label: 'Drill / Descend — ADAC', sets: [buildSet(Math.max(4, Math.round(shares[2] / 50)), 50, nextStroke() + ' (odd: drill/swim / even: desc 1-4)', [], pace100 + 8, 15, scaler, 'Easy Pace')] },
          { label: 'Turn Practice — ADAC', sets: [buildSet(Math.max(4, Math.round(shares[3] / 25)), 25, 'Choice, turn practice — 5m in / 10m out', [], pace100 + 10, 15, scaler, 'Drill Pace')] },
          { label: 'Build — ADAC', sets: [buildSet(Math.max(2, Math.round(shares[4] / 50)), 50, nextStroke() + ' build to 200 pace', [], pace100 + 4, 15, scaler, '200 Pace')] },
          { label: 'Starts — ADAC', sets: [buildSet(Math.max(2, Math.round(shares[5] / 25)), 25, 'OTB, dive + glide, then 15m fast', [], pace100, 20, scaler, 'Cruise Pace')] },
          { label: null, sets: [closerSet] }
        ];
      },
      intents: [
        'A real Abu Dhabi Aquatics Club meet-day warmup: seven genuinely distinct blocks — a soft opener, catch-up drill with underwater kicks, a drill/descend line, dedicated turn practice, a pace build, a starts line, and a closing easy swim — rather than the same 3-4 flat lines every day.'
      ]
    }
  ];
})();
