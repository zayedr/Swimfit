// abu-dhabi-aquatics-database.js
//
// A local, hardcoded transcription of 15 real training sessions from Abu
// Dhabi Aquatics Club (Mesocycle 1: Aerobic Development, Weeks 3-5),
// uploaded directly by the user as scanned coaching documents authored by
// Coach Sherif Zakaria. This exists purely as a REFERENCE LIBRARY — a saved,
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
    mesocycle: 'Mesocycle 1 — Aerobic Development',
    source: 'User-uploaded scanned training documents (this session)',
    note: 'Local reference data only — not fetched from any network source, not currently read by the live generator.'
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
    'SWOLF': 'Stroke count + time efficiency score (lower is better)',
    'BE3/5/7/9': 'Build Effort scale — an increasing effort level per rep/round',
    'P200 / P400': 'Target pace derived from the swimmer\'s own 200m / 400m time',
    'RDS': 'Rounds',
    'desc': 'Descending — each rep/round faster than the last',
    'G1 / G2': 'Group 1 / Group 2 — two ability groups swum on different send-offs',
    'BE3/5': 'Build Effort at levels 3 and 5 (alternating or by rep)'
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
    }
  ];
})();
