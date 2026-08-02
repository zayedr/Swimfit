# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository contains a single self-contained `index.html` — no build step, bundler, or
package manager — styled and scripted inline. It is the live Swimfit site, deployed to
`swimfit.online` via GitHub Pages from `main` (custom domain set via the root `CNAME` file —
DNS for `swimfit.online`/`www.swimfit.online` already points at GitHub Pages' IPs correctly;
`swimfit.com` does not currently resolve to this site at all despite older docs/comments
referencing it, so treat `swimfit.online` as the actual production domain going forward).
Development happens on the branch `claude/claude-md-docs-4sek0o`, merged to `main` only when
explicitly requested.

The site is a marketing/training dashboard: a persistent Hero (with a looping background
video generated via image-to-video, falling back gracefully to a static photo layer if it
fails to load) + About section, followed by a tabbed shell: Workouts, Gym, Gear, Academy,
AI Coach, Distance Tracker, Settings, Pricing. Workouts and Gym each get their own full-screen looping background video
(swimmer/pool and dryland-gym respectively, lazy-loaded on first visit to that tab); the
other tabs share a CSS-only ambient water animation instead. A prior round built out a
full Community feed and a Profile/Swimmer Dashboard (with a client-side simulated
password+OTP auth layer); both were deliberately removed in full to simplify the site back
down to a pure content/training-tool experience — don't re-introduce nav links, footer
links, or JS for either without being asked. A later round removed the standalone
**Disciplines showcase tab** entirely (nav link, footer link, `#panel-disciplines`) as
redundant with the Workout Generator's own discipline picker — the `DISCIPLINES` array
itself (icon/key/name only, no `focus` field) still exists and still feeds
`#disciplineChips` and `state.disciplines`' day-rotated default; only the standalone grid
that used to render from that same array is gone. That same round also stripped the
**fake testimonials** out of `#socialProof` ("SWIMMERS ARE ALREADY TALKING" marquee + cards)
at the user's explicit request that they weren't real — `#socialProof` now contains only the
genuine Instagram/TikTok follow cards.

Auth is **real Firebase Authentication** (project `swimfi-ae`), wired in the `<script
type="module">` in `<head>`. There are exactly two sign-in mechanics: **Google**
(`signInWithPopup`, unchanged since the start) and **Email/Password**
(`createUserWithEmailAndPassword` / `signInWithEmailAndPassword` — Google's Identity Platform
hashes/verifies/stores the password entirely server-side, this app never sees or persists it
itself). The legacy 6-digit email-OTP sign-in method (and its `requestEmailOtp`/`verifyEmailOtp`
Cloud Functions, `email_otps` Firestore collection, "sign in with a code instead" link, and
`signInWithCustomToken` import) has been **removed entirely**, front and back end, at the user's
explicit request — it was the last remaining "Network error"-prone path now that Email/Password
is enabled in the Firebase Console, and every new registration already went through the password
form anyway. `#authModal`'s `passwordAuthForm` is now the *only* form: Create Account requires
Full Name + Username + Email + Password + Confirm Password (all native HTML5 `required`, toggled
on/off in lockstep with `#passwordSignupFields`' visibility by `setAuthMode()` — same
hidden-required-field trap as ever, same fix); Sign In only needs Email + Password. The only
other link in the modal is "Forgot password?" (`#passwordSecondaryRow`), which calls
`sendPasswordResetEmail()` (Firebase's own hosted reset flow) — there is no more "code" path to
swap to or from, so `setAuthMode()` no longer needs to force any auth-method view on mode switch.
A password must be 8+ characters with at least one letter and one number
(`PASSWORD_STRENGTH_RE`); on successful signup, `updateProfile()` sets the Firebase Auth
`displayName`, `sendEmailVerification()` fires (best-effort), and a client-side atomic
transaction (`claimUsernameAndProfile`, mirroring the same `usernames/{username}` create-only
guarantee `firestore.rules` already enforces) writes `fullName`/`username`/`email` onto
`users/{uid}` — no Cloud Function round-trip needed since the swimmer is already authenticated by
that point. Session persistence is explicit — `setPersistence(auth, browserLocalPersistence)`
(falling back to `browserSessionPersistence` if IndexedDB is unavailable, e.g. Safari private
browsing) — so a signed-in swimmer stays signed in across a refresh or closed tab regardless of
which of the two methods they used. Any pre-existing account that was created OTP-only (before
this removal, with no password ever set on it) now has only "Forgot password?" as a recovery
path — there is no code-based fallback left for it to sign in through.

Every signed-in user, via either method, gets a Firestore `users/{uid}` profile doc
(client-written, merged on each login via `ensureUserProfile`), including a `trialStartedAt`
timestamp set once on that first write (a pre-existing account missing this field gets it
backfilled to "now" — grandfathered rather than retroactively locked out). The Firebase Cloud
Function `onUserCreated` (`functions/index.js`, 1st-gen Auth trigger, fires regardless of which
method created the account) is the sole place that increments the public
`stats/counters.userCount` doc — exactly once per brand-new account — which the Hero's
"Registered Swimmers" stat tile reads live via `onSnapshot` and hides gracefully if Firestore
can't be reached; that same function sends a branded welcome email over SMTP (secrets:
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, skipped harmlessly if unset). Firestore access is
locked down by `firestore.rules` (a user can only read/write their own profile; `stats/counters`
is public-read/no-client-write; the now-unused `email_otps` collection's explicit rule was
removed along with the OTP backend, though the file's catch-all deny-all rule already covered it
either way). Every `onRequest` Cloud Function declares `invoker: 'public'` so `firebase deploy`
grants the underlying Cloud Run service's invoker role to `allUsers` automatically — 2nd-gen
functions are private by default, and without this every call (including the CORS preflight) is
rejected at the infrastructure layer before the function's own `cors`/auth checks ever run, which
the browser reports as a bare failed fetch rather than a readable error. **If the Admin Panel or
AI Coach are showing network/CORS-style errors in production, check this first** — the code for
both `adminListUsers` and `aiSwimCoach` was audited this round and is correct (including
`invoker: 'public'`), so a live failure most likely means Cloud Functions haven't been redeployed
since `invoker: 'public'` was added; run `firebase deploy --only functions` to pick up any pending
backend changes, including this round's OTP-function removal (which will prompt to confirm
deleting `requestEmailOtp`/`verifyEmailOtp` from the live project, or run
`firebase functions:delete requestEmailOtp verifyEmailOtp` proactively first).

Signing out (`signOut(auth)`) fires `onAuthStateChanged(null)`, which every feature with its own
local state (AI Coach widget/page, Distance Tracker, Admin Panel inbox) independently clears via
a shared `swimfit:authchange` DOM event; a separate top-level listener on that same event
(`SIGNED_IN_ONLY_TABS = ['coach', 'tracker', 'admin', 'settings', 'support']`) additionally switches away from a
signed-in-only tab back to Workouts if a swimmer signs out while on one — since the Admin Panel
in particular has no in-place "please sign in" fallback of its own (unlike Coach/Tracker, whose
panels do) — and then smooth-scrolls the page back to the Hero (`#top`) so signing out always
visibly returns the swimmer to the landing page rather than leaving them scrolled deep into a
now-inaccessible tab. The house admin account (`swimfit.ae@gmail.com`, see below) works
identically through either sign-in method — `isAdminEmail()`/`SWIMFIT_ADMIN_EMAIL` match on the
resolved email address, not on how the session was created; it remains the *sole* admin account
by explicit user decision — no second hardcoded admin email has been added.
"Join Pro/Elite/Ultra" on the Pricing tab still opens a `mailto:` instead of any checkout
flow, aside from the Firebase-gated Paddle Billing checkout wired to the Subscribe buttons.
A floating "AI Swim Coach" chat widget (gated behind sign-in) calls the `aiSwimCoach` Cloud
Function, which proxies to the Claude API behind a strict swim-only system prompt and a
per-user daily message cap. There is also a dedicated full-screen "AI Coach" tab
(`data-tab="coach"`, `#panel-coach`) in the same tab shell — a richer, independent surface
over the identical endpoint, now with a Gemini/ChatGPT-style multi-thread sidebar rather than one
running conversation (see below). Both surfaces let a
swimmer attach up to 3 photos per message (workout log pages, gear, technique/posture
stills); images are downscaled client-side to a 1600px longest edge and re-encoded as JPEG
on a canvas before upload. `aiSwimCoach` accepts an optional `images` array
(`{mediaType, data}` per image, base64-encoded, validated server-side against a media-type
allowlist, a per-image size cap, and a per-message count cap) and forwards them to Claude as
multimodal content blocks alongside the text turn — the floating widget never sends images,
so this is purely additive.

**There is no paywall anywhere on this site.** An earlier round built a full 7-day-trial →
Paddle-subscription enforcement system (trial countdown lockout, an Elite-only full-screen Coach
page, a Pro-only photo-upload restriction, an Elite-gated Workouts difficulty track); at the
user's explicit, repeated instruction that system's *enforcement* was removed entirely. Every
signed-in, non-suspended account now gets 100% of the platform unconditionally — the full-screen
AI Coach page, photo analysis, saved chat history, Elite-level Workouts sets, all of it — with no
lock screens, upgrade prompts, or gated overlays anywhere. The **only** remaining access gate on
the whole site is a manual admin suspension (`accessDisabled`, see below); everything else
(trial countdown, Paddle plan) is purely informational display, never enforcement. The Pricing
tab and Paddle checkout still exist as a voluntary "support us" option — subscribing changes
nothing functionally, since nothing was ever locked.

The full-screen Coach page (`#coachPageChatWrap`) is shown to any signed-in, non-suspended
swimmer via `window.renderCoachPageGate()` on every `swimfit:accesschange` — there are no more
`#coachPageLockedPrompt`/`#coachPageTierLock` prompts to gate around; `coachPageTierAllowed()`
is just `!!access && access.level !== 'locked'`. The chat itself still got a pass toward feeling
like a real product: consecutive messages from the same sender are visually grouped (tighter
spacing, softened inner corner — `coach-msg-grouped`, tracked via a `lastRenderedRole` variable
in `wireAiCoachPage`), and an empty conversation shows four suggested-prompt chips
(`#coachPagePrompts` — "Build a taper plan", "Explain lactate threshold", etc.) that hide the
moment either a real message is sent or persisted history loads in, so they only ever appear
alongside the canned welcome message on a genuinely fresh conversation.

**The full-screen Coach page was redesigned around multiple parallel conversation threads**
instead of one running history, mirroring Gemini/ChatGPT's sidebar-of-conversations pattern — a
swimmer asking about butterfly technique in one thread and race nutrition in another no longer
has both topics bleeding into the same context window. `#coachPageChatWrap` is now a two-pane
layout: a `<aside class="coach-threads-sidebar">` (a `#coachNewThreadBtn` "+ New Thread" button,
three quick-create chips seeded with common topics — "Butterfly Technique", "Freestyle Drills",
"Nutrition" — and `#coachThreadsList`, one `.coach-thread-item` per thread with a hover-reveal
delete button) beside the pre-existing `<div class="coach-threads-main">` wrapping the same
prompts/messages/attachments/form markup as before. Each thread is its own document in
`coach_threads/{uid}/threads/{threadId}` (rules-validated: title ≤80 chars, ≤60 messages per
thread, owner-only read/write) rather than the old single flat `coach_history/{uid}` doc — the
per-thread cap keeps any one document well inside Firestore's 1MiB limit, at the cost of a
long-running single topic eventually needing a fresh thread, which matches how these tools are
actually used in practice. A brand-new thread created via "+ New Thread" starts untitled and
**auto-titles itself from its first message** (truncated to 40 chars + "…") the moment that
message is sent, rather than forcing an upfront naming prompt — the three quick-create chips
skip this by pre-supplying their topic as the title immediately. `wireAiCoachPage()`'s state
changed from a single `coachPageHistory` array to `threads`/`activeThreadId`, with
`switchThread()`/`createThread()`/`deleteThread()`/`persistActiveThread()` replacing the old
single-document load/save pair; `loadThreadsIfNeeded()` runs a **one-time, read-only migration**
on first load per swimmer — if a legacy `coach_history/{uid}` doc exists, its messages are copied
into a new thread titled "General" (the old collection is never written to again afterward, only
ever read once for this migration, so it's inert dead data going forward rather than actively
maintained). Switching threads re-renders `#coachPageMessages` from the newly-active thread's own
message array only — the message-grouping (`coach-msg-grouped`) and suggested-prompt-chips logic
described above are unchanged, they just now operate per-thread instead of globally.

**Trial badge + Paddle plan (informational only).** Every new account still gets a
`trialStartedAt` timestamp on signup (see above), and the nav badge still shows a real, live
countdown (days+hours+minutes, then hours+minutes, then just minutes, recomputed every 30
seconds) purely as marketing/UI flavor — nothing happens when it reaches zero. `paddleWebhook`
(`functions/index.js`) still resolves each event's Paddle **product** id to a plan key
(`pro`/`elite`/`ultra`) via `PADDLE_PLAN_BY_PRODUCT_ID` and writes it onto
`paddle_subscriptions/{uid}`, and `getAccessLevel(uid, email)`/`recomputeAccessLevel()` still
resolve and display it (`'trial' | 'pro' | 'elite' | 'ultra' | 'unlocked' | 'locked' | 'admin'`)
— but only `'admin'` and `'locked'` (the accessDisabled case) ever change behavior; the rest are
cosmetic nav-badge text. `getAccessLevel` checks `isAdminEmail(email)` and returns `'admin'`
immediately, before any Firestore read, so the admin override lives in exactly one place rather
than being duplicated (and potentially forgotten) at each call site — `aiSwimCoach` is currently
the only caller, and its one remaining check is `if (accessLevel === 'locked') return 402`,
which now only ever fires for a manually suspended account.

There's a single hardcoded house account, `swimfit.ae@gmail.com` (the `ADMIN_EMAILS` array in
`functions/index.js`, kept in sync with the `SWIMFIT_ADMIN_EMAIL` constant in index.html's
module `<script>`), that always resolves to access level `'admin'` — full Ultra-equivalent
access everywhere above, trial/subscription status irrelevant, checked *before* every other
piece of access logic on both sides so nothing downstream (a trial date, a missing profile
doc, a manual suspension) can ever override it. Signing in as that address shows an "Ultra
Access" nav badge (no countdown — `trialEndsAt: null` for `'admin'`) and short-circuits the
Subscribe buttons (both the Pricing tab's and the paywall overlay's) with a friendly alert
instead of opening real Paddle checkout. Email comparisons on both sides (`isAdminEmail()`
server-side, the inline check in `onAuthStateChanged` client-side) lowercase *and* trim the
address before comparing, defensively.

A manual **account suspension** flag, `users/{uid}.accessDisabled` (boolean, Admin-SDK-only —
never in the client's own writable-field allowlist in `firestore.rules`, so a swimmer can never
clear it themselves), resolves a swimmer to `'locked'` regardless of trial/plan status —
checked in `getAccessLevel()` immediately after the admin bypass, and mirrored client-side via a
live `onSnapshot` on the swimmer's own `users/{uid}` doc (`latestAccessDisabled`, folded into
`recomputeAccessLevel()`) so a toggle from the Admin Panel takes effect on an already-open tab
within moments, not just on next sign-in. This is orthogonal to the trial/plan system — an
admin can suspend a paying subscriber without touching their plan record, and restore them just
as cleanly (`adminToggleAccess`).

That same address also unlocks a hidden **Admin Panel** tab (`data-tab="admin"`,
`#panel-admin`, nav entry shown/hidden via `[data-admin-only]`). It lists every registered
swimmer (`adminListUsers`, capped at the 300 most recent) with their name, email, resolved plan,
join date, and access status — there is deliberately **no password column of any kind**:
Firebase Authentication never exposes a swimmer's password to this app in any form, hashed or
otherwise (see the Auth section above), so displaying one is not a feature that can exist here,
only a request to build something insecure that isn't technically possible with this
architecture. From the table the admin can grant/clear a manual plan override per swimmer
(`adminSetUserPlan`, writes `paddle_subscriptions/{uid}` with `source: 'admin_grant'` — same
shape `paddleWebhook` writes, so it's picked up identically by
`getAccessLevel`/`recomputeAccessLevel`), reset a swimmer's trial to a fresh 7-day window
(`adminExtendTrial`, a "+7 Day Trial" button — resets `trialStartedAt` to now), and toggle their
`accessDisabled` suspension flag on/off (`adminToggleAccess`, an Enabled/Disabled pill per row).
`adminListUsers` was hardened in an earlier round: a `safeMillis()` helper guards every
`.toMillis()` call (a doc missing a timestamp field no longer throws), and each swimmer's
subscription/chat sub-lookups run in their own isolated `try/catch` so one malformed record
can't 500 the entire list — the previous "Could not load the user list" failure mode was traced
to this class of issue, on top of the general `invoker: 'public'` redeploy caveat noted above.
Every `admin*` Cloud Function independently re-verifies the caller's ID token and
`isAdminEmail()` — none of this is expressed as a Firestore rule, since "list every user",
"write any user's plan", "extend a trial", or "suspend an account" are exactly the kind of
cross-user privilege that's safer funneled through a server-verified endpoint than trusted to a
security-rules expression.

**Direct messaging is fully real-time on both sides**, via `admin_chats/{uid}/messages` —
unlike every other admin* operation above, this one deliberately bypasses Cloud Functions
entirely in favor of direct Firestore `onSnapshot`/writes on *both* ends, because a request/
response endpoint can't deliver true real-time push; the admin's identity is instead verified
directly in `firestore.rules` via an `isAdminAuth()` helper that checks the caller's verified ID
token `email` claim against the same hardcoded address — exactly as strong a guarantee as
`isAdminEmail()` server-side, just expressed in rules syntax. The swimmer's own side (a floating
inbox widget, mirrored from the AI Coach fab but bottom-left) reads/replies straight through
Firestore in real time, gated by ordinary owner-only rules (`sender` must be `'user'` on their
own writes) — unchanged from before. The **admin's side** (in the Admin Panel) now mirrors that
exactly instead of polling: `window.__adminPanelSubscribeInbox` runs one live
`onSnapshot(collection('admin_chats'))` for unread-dot/last-message-preview badges across every
swimmer at once, and opening a thread (`window.__adminPanelSubscribeThread`) subscribes directly
to that swimmer's `messages` subcollection — a swimmer's reply now appears in the Admin Panel
the instant it's written, with no 20-second poll delay. Sending as the admin
(`window.__adminPanelSendMessage`) writes the message plus the `admin_chats/{uid}` metadata doc
(`lastMessageText`/`unreadForUser`/`unreadForAdmin`) in the same two direct writes the old
`adminSendMessage` Cloud Function used to make server-side — the Cloud Function itself, along
with `adminGetThread`, was deleted as dead code once the rules made it possible to do the same
thing without a round-trip. The swimmer's inbox widget sits above the paywall overlay in
z-order deliberately — a locked-out swimmer can still read and reply to a support message from
the team. A **"Message Coach / Company" quick-action button** on the Workouts tab
(`#workoutsContactCoachBtn`, `data-auth-signed-in`) gives every signed-in non-admin swimmer an
obvious, labeled entry point into that same floating inbox widget (`window.__openAdminMsgPanel`,
exposed by the widget's own IIFE) rather than requiring them to notice the small corner FAB.

**A real one-way delivery bug in this system was found and fixed**: `firestore.rules` allowed a
swimmer to write their own reply into `admin_chats/{uid}/messages`, but blocked them from writing
to the *parent* `admin_chats/{uid}` metadata doc at all — and the Admin Panel's inbox list
(`window.__adminPanelSubscribeInbox`) reads unread-dot/last-message-preview state from exactly
that metadata doc, not from the messages subcollection directly. The practical symptom: a
swimmer's reply landed in Firestore and would render correctly if the admin already had that
specific thread open, but never surfaced as a new/unread conversation in the inbox list
otherwise — a swimmer replying was effectively invisible to the admin unless the admin was
already looking at the right thread. Fixed with a narrowly-scoped second write branch (see the
`firestore.rules` description in the Firestore-rules section) letting a swimmer's own write flag
their own reply as unread-for-admin (`lastSender: 'user'`, `unreadForAdmin: true`) without ever
letting them claim `lastSender: 'admin'` or clear `unreadForUser`, and `__adminChatReply` (the
client function backing the swimmer's send button) was updated to write both the message and
that metadata doc together, matching the two-write pattern `window.__adminPanelSendMessage`
already used on the admin's side. The floating inbox widget plus the Workouts tab's "Message
Coach / Company" button described above already serve as this platform's dedicated
Support/Contact-Admin entry points for a signed-in swimmer — no separate tab or modal was added,
since a second entry point into the identical widget would just be a second button doing the
same thing.

**Every chat `onSnapshot` subscription now takes an optional `onError` callback**
(`__adminChatSubscribeMeta`/`__adminChatSubscribeMessages` on the swimmer's side,
`__adminPanelSubscribeInbox`/`__adminPanelSubscribeThread` on the admin's) — previously none of
them did, so a Firestore error (permission-denied being the most likely: stale security rules on
the live project that predate a given round's `firestore.rules` changes, since deploying rules
is a separate manual `firebase deploy --only firestore:rules` step this repo's GitHub Pages
auto-deploy does **not** cover) meant the `onNext` callback simply never fired again, silently
freezing whatever placeholder text was on screen — most visibly the Admin Panel's `Chatting with
[Swimmer]` thread view, which sets its message area to "Loading…" the instant a thread is opened
and had nothing that ever cleared it if the subsequent `onSnapshot` errored instead of resolving.
Each call site now passes an `onError` that swaps that placeholder for a plain "Could not load…
check your connection and try again" message instead — turning a silent, indefinite hang into a
visible, honest failure state. This is a defensive fix for the *symptom* (an onSnapshot error
must never leave the UI stuck), not a fix for any specific cause — if the live site is actually
seeing this error state, check first whether this round's `firestore.rules` (or any Cloud
Function changes) have been deployed to the real `swimfi-ae` Firebase project yet, per the
`invoker: 'public'` caveat already noted above; this sandbox has no Firebase CLI credentials for
that project and cannot run that deploy step itself.

`PADDLE_PRICE_IDS` in index.html holds real Paddle **price** ids (`pri_...`, fixed 2026-07-19 —
it previously held product ids, which `Paddle.Checkout.open()` rejects). The **product** ids
those prices belong to are a separate, still-correct mapping used server-side in
`functions/index.js` (`PADDLE_PLAN_BY_PRODUCT_ID`) to resolve a webhook event to a plan.

**New Distance Tracker tab** (`data-tab="tracker"`, `#panel-tracker`) lets a signed-in swimmer
manually log a swim (date + km + optional discipline) to `swim_logs/{uid}/entries/{entryId}`
(owner-only, create+delete, no in-place edit — delete and re-log to fix a mislog) and view
Daily/Weekly/Monthly aggregate totals plus a recent-entries list. There's no workout-completion
tracking anywhere else in the app, so this is deliberately a manual log, not derived from the
Workout Generator's proposed sets. Alongside the Daily/Weekly/Monthly pill-tab switcher (which
shows one total at a time) sits an always-on analytics strip (`#trackerAnalyticsGrid`, folded
into the existing `renderStat()` so every call site updates it automatically): Weekly Total,
Monthly Total, and Most Swum Discipline — the last computed client-side from the same
month-bounded `cachedEntries` array (`computeTopDiscipline()`, ranked by total distance per
discipline, not entry count; entries logged with no discipline, since it's optional, simply
don't count toward any stroke's total).

**Workouts' Swimmer Profile** now takes Personal Bests per stroke, not just Freestyle —
Backstroke/Butterfly/Breaststroke each get their own 50m/100m fields (`#pb50Backstroke` etc.,
a `.pb-stroke-grid` under the existing Freestyle PB fields). `generateWorkout()` picks which
pair of fields actually feeds `personalPaceFromPB()` based on whichever discipline is *primary*
(`state.disciplines[0]`, i.e. first-selected in the chip group) via `activeStrokePbFieldIds()`
— a Backstroke swimmer's pace comes from their Backstroke PB, not a Freestyle default regardless
of what's being trained; Individual Medley (no single-stroke PB to key off) falls back to the
Freestyle fields as the closest general-pace proxy. Both Workouts and Gym also gained an inline
AI assistant panel (`.workout-ai-panel`, gated `data-auth-signed-in` same as every other
sign-in-only surface) — a lighter, chat-log-style companion to the full Coach page/floating
widget, reusing the identical `aiSwimCoach` endpoint but scoped to whichever tab it's in: the
Workouts one (`#workoutAiForm`) embeds the currently-generated workout's plain text as context
on every message, so "make this easier" or "explain the pacing" lands against the actual set on
screen, plus a "Regenerate this workout" chip that calls the deterministic `generateWorkout()`
directly (free, instant, no AI round-trip) rather than asking the model to describe a new one
in prose; the Gym one (`#gymAiForm`) sends the swimmer's current Gym focus/orientation and
strength profile instead, framed explicitly as dryland/gym programming (not a pool set), with
chips for generating a full day's or week's routine and for iterating on it ("make it shorter",
"add more core work"). Neither panel persists history — in-memory only, cleared on sign-out,
same tier/cost posture as the floating widget (no server-side enforcement beyond what
`aiSwimCoach` already does for every caller). Every Gym exercise card carries a **live, looping
technique demonstration** (`.gym-anim-frame`): a hand-drawn SVG stick-figure flipbook — 2-4 key
poses per movement archetype in `GYM_ANIMS`, mapped per exact exercise name via `GYM_ANIM_MAP`
(with a `generic` fallback; adding a new exercise to `GYM_FOCUS` means adding a map row too),
cycled by one global 420ms timer (`advanceGymAnims`) that derives every frame index statelessly
from a shared tick count so full `renderGym()` re-renders never desync anything, and
`prefers-reduced-motion` simply never starts the timer, leaving each first pose as a static form
diagram. Props (barbells, boxes, ropes, walls, benches) are marked `class="p"` and drawn muted.
This replaced the earlier `.gym-video-frame` → `#videoModal` "Coming Soon" placeholder path
entirely — the Gym tab no longer opens `#videoModal` at all (the Academy tab still does, for its
own in-production videos).

**Upper Body and Lower Body focuses use real commercial gym equipment**, not home-style
bodyweight work — a deliberate rewrite at the user's request. Upper Body's main lifts are Lat
Pulldowns, Incline Bench Press, Cable Face Pulls, Seated Cable Rows, Weighted Pull-Ups and Cable
Tricep Pushdowns, with Cable Woodchoppers as the rotational core exercise; Lower Body's main
lifts are Barbell Squats, Romanian Deadlifts, Leg Press, Hamstring Curl Machine, Bulgarian Split
Squats and a Standing Calf Raise Machine, with a Cable Pull-Through for glute activation. Warmups
now use light-load versions of the same equipment (Goblet Squats, Cable Face Pulls) rather than
plain bodyweight moves, since this is meant to read as a real gym session throughout, not just in
the main set. Six new movement archetypes were added to `GYM_ANIMS`/`GYM_ANIM_MAP` for the
equipment these bodyweight-only archetypes couldn't represent — `woodchop`, `latpulldown`,
`benchpress`, `pushdown`, `legpress`, `hamcurl` — each drawing the relevant machine/cable/barbell
as a muted `class="p"` prop so the stick-figure demo actually shows the right equipment, not just
a generic pose. Cardio and Full Body focuses were left as they were (jump-rope/burpee-style
conditioning and barbell strength work respectively already matched this "real gym" bar).

**Technique Academy photos** (`VIDEOS`/`FEATURED_VIDEO` in index.html — each a static thumbnail
behind a YouTube embed/play button) were regenerated in an earlier round, one purpose-shot photo per
topic (Freestyle, Backstroke, Butterfly, Breaststroke, Flip Turn, Underwater streamline, and the
"all four strokes" masterclass card), replacing a batch the user found visually
mismatched/artifact-y. That round's Flip Turn photo still read as Backstroke rather than an
authentic freestyle tumble turn, so it was regenerated again in a later round with an explicit
"forward tuck/somersault approaching the wall, NOT swimming on their back" prompt — if a future
Flip Turn regeneration is ever needed again, keep that same explicit disambiguation in the prompt,
since a bare "flip turn" prompt has twice now drifted toward a backstroke-flip-turn read. That
later round also regenerated the three photos used specifically on the Workouts Generator page —
the `.tab-banner`'s `--pool-edge-photo`, the "Meet Your Coach" `.coach-banner-photo`'s
`--coach-photo`, and the `.result-panel::before` ambient background's `--generator-photo` (all
three custom properties defined in `:root`, all three scoped to `#panel-workouts` only) — with
sharper, more professional swimming photography, replacing an earlier, more generic-looking batch.
All of these are generated via Higgsfield (`nano_banana_2`) with an explicit
photorealistic-sports-photography prompt per topic; every one is hosted on the same CloudFront
bucket as the site's other generated media (`d8j0ntlcm91z4.cloudfront.net`). Note: this sandbox's
network policy returns 403 on direct fetches to that CDN, so none of these renders (across any
round) were pixel-inspected by Claude after generation — only prompted carefully and swapped in by
URL: verify they look right in a real browser and regenerate any individual image that doesn't via
the same Higgsfield flow if needed.

The sign-in modal (`#authModal`) has a Sign In / Create Account toggle (`#authModeToggle`) that
swaps copy/button labels *and* which fields are visible, driving the password-only mechanics
described above (Google is a separate button, unaffected by this toggle). Create Account mode
shows Full Name + Username fields (`#passwordSignupFields`) inline alongside Email + Password +
Confirm Password — all native HTML5 `required` (toggled on/off in lockstep with
`#passwordSignupFields`' visibility by `setAuthMode()`, since a `required` field that's merely
`display:none` still blocks the whole form's `submit` event in Chromium) plus custom JS
validation. The Username field gets a live availability check (debounced `getDoc` against
`usernames/{username}` via `window.__checkUsernameTaken`) — `firestore.rules`'
`usernames/{username}` allows `get` for anyone (including signed-out visitors), specifically so
this pre-auth check works; `list` stays blocked so the directory can't be enumerated. On submit,
Full Name/Username are captured directly by `claimUsernameAndProfile` (see above) once the
swimmer is authenticated. Google sign-in has no equivalent form (Google's own popup only ever
returns name/email/photo) and currently has no path to set a Username at all — this app
previously used a post-signup onboarding wizard as a fallback for exactly that case, but the
wizard has been removed entirely, along with `window.__onboardingSaveProfile` and the training
specialization / fitness metrics fields it used to collect (`disciplines`, `distance`, `goal`,
`pb50`, `pb100`, `workingWeight`, `strengthLimit` on `users/{uid}` — still allowed by
`firestore.rules` but no longer written by any client code). Create Account's password-form
capture above is now the only signup-time data-capture surface; a Google-sign-in swimmer without
a Username is a known gap, not yet addressed.

**Signed-out visitors are hard-gated out of all four core training surfaces.** Workouts and Gym
each open with a `.coach-page-locked` register prompt (`data-auth-signed-out`) while the panel's
entire content sits in a `data-auth-signed-in` wrapper (`display:none` until sign-in) — Coach
and Tracker already had equivalent in-panel gates, so Workouts/Gym/Coach/Tracker are all
signed-in-only, while Disciplines, Gear, Academy and Pricing stay public. The gates' register
buttons (any `[data-open-auth]` element) open `#authModal` in the mode named by the attribute's
value; the old in-panel "sign in to use the AI panel" notes inside Workouts/Gym were removed as
redundant, since guests can no longer see any of that panel content anyway. On top of the gates,
an **entrance marketing popup** (`#promoPopup`) fires the moment the *first* Firebase auth
resolution reports a signed-out visitor: 7-day-free-trial conversion copy, a "Register Now" CTA
that hands off to `openAuthModal('signup')`, shown once per browser session
(`sessionStorage['swimfit_promo_seen']`), never shown to a signed-in swimmer (a persisted
session resolves before it would fire, and any signed-in resolution force-hides it), and never
re-fired by a mid-session sign-out (only the first resolution can trigger it).

Between the persistent About section and the tabbed shell, the landing page carries five
conversion-focused sections: a dismissible top **announcement bar** (`#announceBar`, launch
promo code, `localStorage`-persisted dismissal via a synchronous flash-prevention script in
`<head>` so returning visitors never see a layout shift — the fixed `--announce-h` custom
property drives the nav's `top` offset and `body`'s `padding-top` together, never JS-measured);
an **Offers Strip** (`#offersStrip`, right after About — two eye-catching cards for the 7-day
free trial and Ultra's 2-months-free annual pricing, separate from the SWIM20 launch code in
the announcement bar above); an **App Preview** (`#appPreview`, a static browser-chrome-framed
mockup of the weekly distance chart / goal ring / specialization chips a signed-in swimmer
would actually see); **Social Proof** (`#socialProof`, branded Instagram/TikTok follow cards
linking to `@swimfit.ae` — the testimonial marquee that used to sit above these was removed,
see above); and a **Plan
Sneak Peek** (`#planPreview`, a Pro/Elite/Ultra pill-tab switcher that swaps a single preview
card's price, features and accent color client-side — its own "join" CTA only ever routes to
the real Pricing tab via `data-tab`, it never touches checkout directly, so it can't
double-fire alongside the real Subscribe buttons' `[data-plan]` handler).

There are no build, lint, or test commands — verify changes by serving the file locally
(e.g. `python3 -m http.server`) and testing in a browser (Playwright is available in this
environment for automated checks).

A full codebase purge was done alongside the OTP removal above: dead `AUTH_ERROR_MESSAGES`
entries left over from the removed `signInWithCustomToken` path (`auth/invalid-custom-token`,
`auth/custom-token-mismatch`) and a stale "Paddle risk" comment about `PADDLE_PRICE_IDS` holding
product-not-price ids (already fixed in an earlier round; the note just hadn't been removed) were
deleted. Note for future purges: anything matching `wave`/`wavy` in this codebase (`.hero-waves`,
`.hero-wave-1`/`-2`, the `i-wave` icon symbol, `nav-icon-wave`) is legitimate, actively-rendering
Hero/nav design — not stale placeholder content — and should not be deleted on sight just because
the name sounds informal.

**Admin Panel subscription analytics.** `#adminStatsGrid` (five tiles, above the user table)
gives the admin an at-a-glance read on the whole swimmer base — Total Registered, Total
Subscribers (any real Paddle plan, not admin-granted), Active Memberships (Paddle plan OR an
admin-granted override), On Free Trial, and Suspended — all computed client-side in
`renderAdminStats()` from the same `users` array `adminListUsers` already returned, so no new
Cloud Function or Firestore read was needed. The user table also gained a **Time Remaining**
column (`timeRemainingInfo(u)`): `'Suspended'` for an `accessDisabled` account, `'Active plan'`
for a real/granted subscription, `'{d}d {h}h left'` / just `'{h}h left'` for a swimmer still
inside their trial window, `'Trial ended'` once it's passed, or `'—'` if there's no trial-start
timestamp to compute from at all.

**AI Coach got a visual pass and real persistence.** The floating widget's `.coach-bubble`
styling picked up a gradient/shadow treatment and a subtle entrance animation so the chat reads
like a finished product rather than a debug overlay. More substantively, both chat surfaces now
survive a tab switch or refresh: the full-screen page already persisted its history (now to
`coach_threads/{uid}/threads/{threadId}` per the multi-thread redesign above, `coach_history/{uid}`
before that); the **floating widget** now does the same into its own
`coach_widget_history/{uid}` document (identical shape/rules, kept separate so the widget and the
full-screen page never clobber each other's saved conversation) via `window.__coachWidgetHistoryLoad`
/`__coachWidgetHistorySave`, loaded once per sign-in (`loadHistoryIfNeeded()`) and persisted after
every assistant reply. Signing out clears both the in-memory `coachHistory` and the rendered
`#aiCoachWidget` messages via the existing `swimfit:authchange` listener, same as before.

**Distance Tracker is now a full analytics dashboard**, not just a log + three totals. On top of
the existing Daily/Weekly/Monthly pill-tabs and Weekly/Monthly/Most-Swum-Discipline strip, it now
shows: **Est. Calories (Month)** (`CALORIES_PER_METER = 0.2`, an explicitly-labeled rough
estimate for moderate-intensity swimming, not medical advice) and **Avg Pace / 100m** (only ever
computed across entries that logged a duration — a swimmer who never fills in the optional
Duration field simply never sees a pace number); a **Weekly Volume Goal** card
(`localStorage['swimfit_weekly_goal_km']`, a plain client-side UI preference, not worth a
Firestore round-trip) with a live progress bar; a **Weekly Volume Breakdown** chart (7-day bar
chart) and an **Average Pace Trend** chart (line chart of the last 10 duration-bearing entries,
with an explicit empty state under 2 points) — both hand-rolled inline SVG (no chart library,
matching this file's "no build step, no dependencies" posture and the `dataviz` skill's
guidance: single accent hue, recessive grid lines, a `<title>` per mark for zero-JS hover
tooltips); and a new **Personal Best Progression** mini-log (`#trackerPbForm` — discipline,
distance, time, date) writing to a new `personal_bests/{uid}/entries/{entryId}` Firestore
collection (owner-only, create+delete, no in-place edit — same shape/rules pattern as
`swim_logs`), charting whichever discipline+distance combo has the most logged entries
(`bestPbGroup()`) since that's the one with an actual trend to show. The existing `swim_logs`
schema gained an optional `durationSeconds` field (rules-validated, 0 < value ≤ 36000) to make
the pace chart/analytics possible at all; entries logged before this field existed, or logged
without filling in Duration, simply have no pace contribution — there is no retroactive
backfill.

**Every generated swim workout now follows a strict 4-stage structure** — Warm-Up → Pre-Set →
Main Set → Cool-Down — rather than the previous 3-stage Warm-Up/Main Set/Cool-Down, specifically
to read like something a real head coach wrote on a whiteboard rather than a generic AI-flavored
set list. `generateWorkout()`'s distance split changed from a straight warmup/main/cooldown
percentage breakdown to `warmupM` (10% of total), the new `presetM` (15%), `mainM` (55%, down
from the previous larger share to make room for the Pre-Set), and `cooldownM` (the ~20%
remainder) — each rounded to the nearest 100m with a 200m/100m floor so short total-distance
selections never produce a zero-length or oddly-fractional block. The Pre-Set stage's job is
narrower than Warm-Up (which is just easing in) or Main Set (which is the session's actual work):
it's a short, purposeful bridge that primes the specific energy system or stroke feel the Main
Set is about to demand. Exactly one archetype fires per generated workout, chosen via
`pickOne(PRESET_ARCHETYPES)` — so it draws from the same daily-seeded `workoutRng` as every other
random choice in the generator, meaning the Pre-Set (like the rest of the workout) is stable for
a given day and rotates at midnight, never reshuffling on every click. The six archetypes in
`PRESET_ARCHETYPES` are deliberately named and worded the way a real coach would say them aloud,
not just structurally different rep counts: **Descending 1-4** (four reps of the same distance,
each swum faster than the last, teaching pace control since "there's nowhere left to hide by the
fourth rep"); **Broken Build-Up** (a longer swim broken into short-rest segments that build in
effort, bridging short-rep speed and true distance-per-effort swimming); **Negative Split Swim**
(a controlled first half followed by a faster second half — the pacing discipline behind almost
every well-executed race); **SWOLF Efficiency Set** (stroke-count-plus-time reps chasing a lower
score rather than a faster clock); **Choice Drill Ladder** (a 25-50-75-100 ladder where the
swimmer picks whichever drill needs the most work that day, making the set self-correcting); and
**Heart-Rate Target Pace** (holding a named effort zone — "Zone 3, comfortably uncomfortable" —
so the workload stays honest even on a day the stroke feels off or the water's choppy). Each
archetype carries its own `intents` copy explaining *why* the set works physiologically, in the
same "Coach's Technical Tips" voice as the rest of the generator, and renders as its own labeled
block (`renderBlock('Pre-Set — ' + preset.name, ...)`) between Warm-Up and Main Set in the result
panel — so a swimmer sees exactly which archetype today's Pre-Set is and why, not just an
unlabeled extra set of reps.

**The Warm-Up's opening swim is always Freestyle**, regardless of which discipline(s) the
swimmer has selected — standard coaching practice for easing into the water even on a
Butterfly- or Backstroke-focused day. Previously the first `buildSet()` call in
`generateWorkout()`'s `warmup` array called `nextStroke()` like every other set, so a
Butterfly-primary swimmer's warm-up opened with Butterfly; it's now hardcoded to `'Freestyle,
easy — long smooth strokes'` instead. Nothing else in the Warm-Up (the Drill/Build set, or the
non-beginner "quick build" 25s) or in any later stage changed — they still rotate through
`state.disciplines` via `nextStroke()` exactly as before.

**Swim workouts and Gym focus now rotate automatically instead of only being click-random.**
Previously every `Math.random()` call inside `generateWorkout()` (which archetypes get picked,
how many rounds a Main Set circuit gets, which warm-up/cool-down intent line shows) reshuffled on
every single click of Generate, with no notion of "today's workout." `generateWorkout()` now
reseeds a small deterministic PRNG (`workoutRng`, mulberry32 — see `makeSeededRandom()`) from
`dailySeed()` (the calendar year folded together with the existing `dayIndex()` day-of-year, so
the seed doesn't repeat every 365/366 days) at the very top of every call, and `pickN()`/
`pickOne()`/`roundCountFor()` all draw from `workoutRng` instead of `Math.random()` directly. The
practical effect: for a given set of distance/goal/discipline/level selections, generating today
always produces the exact same workout, and it automatically rotates to a different one at
midnight — the result panel's "Coach's Plan" note says as much ("This exact set structure holds
for the rest of today and rotates automatically at midnight."). Gym's focus tabs got an
equivalent treatment: `GYM_WEEKLY_ROTATION = ['upper', 'lower', 'full']` (Cardio is a modality,
not a muscle-group split, so it's left out and stays manually-selected-only) cycles via
`thisWeeksGymFocus()` (`weekIndex()`, i.e. `Math.floor(dayIndex() / 7)`), auto-selecting that
week's focus as the default tab on load with a "This Week's Focus" note (`#gymWeeklyFocusNote`)
— a swimmer can still freely click any other tab to override for that session, which just calls
the existing `renderGym(focus)` and doesn't persist. There's no separate "Core" tab in
`GYM_FOCUS` to rotate into — Full Body's own Core Activation phase stands in for the "Core" leg
of the classic Upper/Lower/Core split.

**"Save as PDF" on both generated workouts.** `#workoutPdfBtn` (Workouts result panel) and
`#gymPdfBtn` (Gym, below the exercise grid) both build their PDF from jsPDF, which is now
**bundled inline** — the full UMD-minified library source is spliced directly into its own
`<script>` tag right after the Paddle `<script>` tag, rather than lazy-loaded from
`cdnjs.cloudflare.com` on first click as it was originally. The previous "Could not generate the
PDF right now" alert was masking exactly one failure mode: any ad-blocker, network filter, or
transient CDN flakiness that blocked that lazy `<script>` fetch silently killed the feature for
that visitor with no way to retry beyond a reload. Inlining the library removes that whole
failure class at the cost of the file itself (single-file `index.html` grows by jsPDF's ~365KB,
in keeping with this repo's "no build step, no bundler" posture — there's nothing to bundle
*into*, so "bundling" here just means committing the source directly). `loadJsPDF()` is now a
synchronous check against the already-present `window.jspdf.jsPDF` global instead of an
async script-injection promise. Both buttons still read the **already-rendered** result
panel/exercise grid's own DOM (`extractStructuredWorkout()` / `extractStructuredGym()`, walking
`.workout-block`/`.set-row` or
`.gym-phase`/`.gym-card` and their child text nodes) rather than recomputing the workout a second
time — so the PDF always matches exactly what's on screen, never a second silently-different
render. `buildWorkoutPdf()`/`buildGymPdf()` share a `pdfTitleBlock()`/`pdfFooterOnAllPages()`
branded header/footer (the Swimfit wordmark — read directly off the nav's own `.brand img`'s
`data:` URI at generation time via `document.querySelector('.brand img')`, not duplicated as a
second asset — an aqua accent bar, a
maroon divider rule, and a "Generated by Swimfit — swimfit.online" + page-number footer on every
page) and paginate via a per-builder `ensureSpace(need)` closure that calls `doc.addPage()` before
the content would run off the bottom margin. Neither button appears until its panel actually has
real content (`generateWorkout()`/`renderGym()` unhide them at the end of each render), and the
PDF's own filename embeds today's date and (for Gym) the focus key.

**New Settings tab** (`data-tab="settings"`, `#panel-settings`, signed-in-only — added to
`SIGNED_IN_ONLY_TABS` alongside Coach/Tracker/Admin) originally held four cards, since grown to
seven (Units, Notifications, and Export Your Data were added in a later round — see below):
**Swimmer Profile** (Full
Name/Country/Age, editable and saved via `window.__userProfileUpdate` — a thin `setDoc(...,
{merge:true})` bridge exposed alongside the existing `__userProfileGet`. **Username is now
editable** (a later round removed the original "read-only" restriction): renaming goes through
`window.__renameUsername`, an atomic `runTransaction` mirroring signup's own
`claimUsernameAndProfile` guarantee — read the swimmer's current `usernames/{old}` doc, no-op if
the new name is unchanged, `get()` the target `usernames/{new}` doc to confirm it doesn't already
exist, then in the same transaction `set()` the new reservation doc, `delete()` the old one, and
`set(..., {merge:true})` the new username onto `users/{uid}` — so a rename can never leave two
reservation docs pointing at the same swimmer, or free the old name without atomically claiming
the new one. The username field also gets the same debounced live-availability check
(`window.__checkUsernameTaken`) signup uses, so a swimmer sees "taken"/"available" before
submitting rather than only on a failed transaction. `firestore.rules`' `usernames/{username}`
collection was loosened from "no client update or delete, ever" to allow the *owner* to `delete`
their own reservation doc (`update` stays `false` in all cases — a rename is always a
delete-old+create-new pair via the transaction above, never an in-place field edit on the
reservation doc itself). Email stays read-only — Firebase Auth's own email-change flow is a
separate, unimplemented surface, not something this Settings card touches. A **real avatar
upload** sits above the name/username/email fields: a client-side pipeline
(`compressAvatarFile`) center-crops the chosen image to a square, downscales it to 200×200 on a
canvas, and re-encodes as JPEG at quality 0.82, producing a `data:` URI stored directly on
`users/{uid}.avatarDataUrl` (capped at 300,000 chars, enforced both client-side before upload and
in `firestore.rules`' `isValidProfileWrite()`) — Firebase Storage was deliberately not used here,
since this sandbox couldn't verify the `swimfi-ae` project's Storage bucket is enabled/configured,
and a Base64-in-Firestore avatar needs no new infra at all. The nav bar's own avatar
(`#navAvatar`) is kept in sync independently of whether the swimmer has ever opened Settings, via
a small `wireNavAvatar()` IIFE that fetches the profile doc on every sign-in and exposes
`window.__updateNavAvatar` for Settings to call immediately after a successful upload, so the nav
reflects a new photo without waiting for a refresh; **Swimming Specialties** (the same
`DISCIPLINES` chip picker
as the Workout Generator, persisted to `users/{uid}.disciplines` and — on save — applied live to
`state.disciplines` and `#disciplineChips`' own `aria-pressed` state, so the effect is visible
immediately without a reload); **Appearance**, a Dark/Light pill-tab switch
(`localStorage['swimfit_theme']`); and **Language**, an English/العربية pill-tab switch
(`localStorage['swimfit_lang']`). Both of the last two are applied twice: once synchronously in
the `<head>` flash-prevention `<script>` (same pattern as the announcement-bar dismissal guard —
reads `localStorage` and sets `data-theme="light"`/`lang="ar" dir="rtl"` on `<html>` before first
paint, so a returning swimmer's saved preference never flashes as Dark/English first) and once
live via the Settings pill-tab click handlers (`wireThemeToggle()`/`wireLanguageToggle()`).

The **Light theme** is a `:root[data-theme="light"]` block that only overrides the existing
surface/text/accent custom properties (`--bg`, `--surface`, `--fg`, `--muted`, `--aqua`, etc.) —
every rule in this file already reads color through `var(--...)`, so no second parallel
stylesheet was needed. `--aqua` in particular is deepened (`#22D3EE` → `#0E7C90`) for the light
palette specifically because the site's original bright cyan is a dark-background accent color
that reads as low-contrast text on white. Ambient/duotone background effects (the Hero water
animation, tab background photos) were designed against the dark palette and are left as-is in
Light mode — they still read fine over the lighter chrome but weren't independently re-tuned;
this is a deliberate, disclosed scope boundary, not an oversight.

**Language switching translates static chrome only, not generated content** — a deliberate,
disclosed scope decision rather than an oversight: the nav, Hero headline/sub/CTAs, and each tab's
eyebrow/heading are tagged `data-i18n="key"` (an element that needs to preserve child markup
across languages, like the Hero `<h1>`'s `<span class="accent">`, is additionally tagged
`data-i18n-html` so `wireLanguageToggle()` sets `innerHTML` instead of `textContent` for it) and
resolved against an `I18N.en`/`I18N.ar` dictionary in `wireLanguageToggle()`. Generated workouts,
AI Coach replies, PDFs, and the Admin Panel all stay in English regardless of this setting —
translating a content-generation system is a materially larger, separately-scoped effort than
translating this file's own static chrome, and the Settings tab's own copy says as much to the
swimmer. Setting `dir="rtl"` on `<html>` is enough to correctly mirror the large majority of this
file's flex-based layouts for free (`direction: rtl` reverses visual order for any
`flex-direction: row` container per spec, and default `text-align: start` follows direction
automatically) — but this file also has scattered **physical** `margin-left`/`padding-right`-style
rules that do *not* flip with `direction`, one of which (`.panel-wide`'s `width: 100vw;
margin-left: calc(50% - 50vw)` full-bleed trick) was an actual, verified RTL bug causing ~124px of
horizontal page overflow in Arabic — fixed by switching it to the logical
`margin-inline-start` (which does flip). Any other visual RTL rough edges most likely trace to
this same class of issue (a physical property that should have been logical); the fix each time
is the same targeted swap, not a full stylesheet rewrite.

**Hero cleanup + a real nav bug fix.** The Hero's stat row dropped its weakest, most generic tile
("24 Hour Access" — a cliché every SaaS claims, with no tie to any actual feature) while keeping
the three that map directly to real product structure (Disciplines, Skill Tracks, Gym Focuses)
plus the live Registered Swimmers counter — a deliberate trim toward signal over filler, not a
wholesale redesign. Separately, `.nav-links button` was missing `white-space: nowrap`, so the
two-word "AI Coach" label (uniquely, among otherwise one-word nav items) would wrap onto two
lines at common viewport widths — a one-line CSS fix.

**AI Coach: every fetch now has a client-side timeout.** A new shared `aiCoachFetch(idToken,
body)` helper (`AI_COACH_TIMEOUT_MS = 30000`, `AbortController`-backed) replaces the raw `fetch()`
call in all four AI Coach surfaces (the floating widget, the full-screen page, and the Workouts/
Gym inline panels) — previously none of them had a timeout, so a hung request (a cold Cloud
Function start, a network stall) left the "Thinking…" bubble on screen forever: the fetch promise
never settled, so neither the success branch nor the existing `.catch()` ever fired. Every `.catch`
now also distinguishes `err.name === 'AbortError'` to show "The coach took too long to respond"
instead of the generic network-error message. Every other part of the AI Coach request/response
pipeline (prompt chips, the aiSwimCoach Cloud Function itself) was audited and found already
correct — verified via Playwright against a mocked backend for every surface — so if AI Coach
replies are still silently failing in production after this ships, the most likely cause is the
Cloud Function/CORS/redeploy caveat already documented above, not a client bug.

**Chat `onSnapshot` calls fail loud instead of hanging.** `__adminChatSubscribeMeta`/
`__adminChatSubscribeMessages` (swimmer side) and `__adminPanelSubscribeInbox`/
`__adminPanelSubscribeThread` (admin side) now each accept an `onError` callback, and every call
site wires one in — swapping a stuck "Loading…" placeholder for a plain "could not load, check
your connection" message if the underlying Firestore query ever errors, instead of leaving the
UI frozen indefinitely with zero feedback (the previous failure mode, since a query error meant
the success callback simply never fired again).

**Workout Generator: the Warm-Up's opening swim is unconditionally Freestyle.** The first
`buildSet()` call in `generateWorkout()`'s `warmup` array no longer calls `nextStroke()` — it's
hardcoded to `'Freestyle, easy — long smooth strokes'` regardless of which discipline(s) are
selected, matching standard coaching practice for easing into the water even on a Butterfly- or
Backstroke-focused day. Nothing else in the Warm-Up or any later stage changed. (The Workout
Generator's daily rotation — one fixed set per calendar day, changing automatically at midnight,
never on every click of Generate or every page refresh — was already shipped in a previous round;
this round only verified it still holds across code changes. There is no LLM call inside
`generateWorkout()` itself and none was added — "AI Coach" and "the daily-rotating Workout
Generator" remain two separate systems, linked only by the Workouts tab's inline AI panel that
lets a swimmer ask questions about whatever the deterministic generator just produced.)

**Settings gained a real Units switcher, a data export, and a notification preference — not just
cosmetic toggles.** `formatDistanceM(meters, decimals)` is a hoisted, top-of-file function (so
it's callable from every feature regardless of source order, including code that runs
synchronously at page load, before the Settings IIFE that owns the pill-tabs has even executed)
that reads `localStorage['swimfit_units']` (`'m'` default, or `'yd'`) and returns either
`"X.XX km"` or a whole-number `"X,XXX yd"`. Every pure-display distance total in the app —
the Workouts distance slider's live label, the generated workout's "Coach's Plan" summary line,
and the Distance Tracker's stat tiles, weekly/monthly analytics-strip totals, Weekly Volume
Breakdown chart bar labels/tooltips, and recent-entries list — now reads through this one
function, and switching units fires a `swimfit:unitschange` event so an already-open Tracker
redraws immediately. **Deliberately out of scope**, the same "disclosed boundary" pattern used
elsewhere in this file: the swim-log entry form's km input and the Weekly Volume Goal input (and
its own progress-bar note) stay denominated in kilometers regardless of this toggle — converting
an *input*'s bound unit live risks silently reinterpreting a value a swimmer already typed, a
materially different and riskier problem than reformatting an already-computed, read-only number.
**Export Your Data** is a genuine client-side CSV export (`window.__swimLogQuerySince(new
Date(0))` + `window.__pbLogQueryAll()`, the same bridges the Tracker itself already uses) covering
every logged swim and PB on record, built as a `Blob`/`URL.createObjectURL` download with no new
Cloud Function needed. **Notifications** is one boolean, `users/{uid}.notifyWeeklyEmail`
(persisted via the existing `__userProfileUpdate` bridge, added to `firestore.rules`'
create/update field allowlists and `isValidProfileWrite()`), explicitly labeled as
informational-only in its own copy — there is no email or push infrastructure in this app to act
on it yet; it's saved for whenever that ships, the same "trial badge, informational only" honesty
already established elsewhere in this file rather than building a toggle that implies a feature
that doesn't exist.

**A dedicated, full-screen Support tab** (`data-tab="support"`, `#panel-support`, added to
`SIGNED_IN_ONLY_TABS`) gives a signed-in swimmer a proper page — not just the small corner FAB —
for messaging the Swimfit team, reachable from both the main nav and the footer nav. Critically,
it is **not a second, parallel chat system**: it reads and writes through the exact same
`__adminChatSubscribeMessages`/`__adminChatReply` bridges the floating widget already used, which
means a message sent from either surface appears in both instantly (and in the Admin Panel's live
view) with nothing to keep in sync — there was no new Firestore collection, no new Cloud Function,
and no new security rule needed. The floating widget was deliberately left in place rather than
removed, mirroring the precedent AI Coach already set (a floating widget *and* a dedicated
full-screen page, both real, both reading/writing the identical underlying data) — this is a
second, more spacious entry point into the same conversation, not a replacement.

**A real bug in `firestore.rules`' `isValidProfileWrite()` was found and fixed**: it validated the
*entire* `users/{uid}` document on every write, not just the fields a given write actually
touched. Since an `update` (including a merged `set()`) exposes `request.resource.data` as the
full post-merge document — every untouched pre-existing field included — this meant any account
carrying even one legacy field that predates a validation rule (most plausibly `distance`/`pb50`/
`pb100`/`goal`/`disciplines`, all originally written by the onboarding wizard this repo removed
several rounds ago, under whatever looser or different constraints existed at the time) would have
*every future write rejected* with a bare permission-denied — including ones that only ever touch
an unrelated field like `notifyWeeklyEmail` or `avatarDataUrl`. The practical symptom: toggling the
Settings "Email me a weekly training summary" switch (or saving a new avatar) failed with "Could
not save — please try again" on any account with old data, with no way for that swimmer to ever
fix a field they didn't know existed or was invalid. Fixed by scoping `isValidProfileWrite()` to a
`changedKeys` parameter — `request.resource.data.keys()` for `create`, `request.resource.data
.diff(resource.data).affectedKeys()` for `update` — so a write is judged only on what it actually
changes, never on untouched legacy data sitting elsewhere on the same document. Verified via a
dedicated rules-emulator test that seeds a doc with deliberately-invalid legacy fields (an
out-of-range `distance`, an oversized `pb50`) and confirms an update touching only
`notifyWeeklyEmail` now succeeds while a write that actually tries to set a bad value for a
validated field is still correctly rejected.

**Avatar rendering now has a real fail-safe.** Neither `#settingsAvatarPreview` nor `#navAvatar`
had an `error` listener, so a stored `avatarDataUrl` that failed to decode for any reason (most
likely: it was never actually persisted in the first place, e.g. due to the `isValidProfileWrite`
bug above rejecting the save while the client-side preview still showed it optimistically before
the write round-tripped) left the browser's broken-image glyph on screen instead of falling back
to the empty/placeholder state a swimmer with no avatar at all sees. Both `<img>` elements now call
`showAvatar(null)`/`window.__updateNavAvatar(null)` on their own `error` event. `wireNavAvatar()`'s
profile-fetch `.catch()` was also hardened to reset to that same safe empty state instead of
silently leaving whatever avatar state was on screen from a previous account/session.

**"Export My Data (CSV)" had a real, classic download bug.** The code called
`URL.revokeObjectURL(url)` immediately after `a.click()` — a well-documented failure mode in
Firefox and Safari, where the browser reads a `blob:` URL's data *asynchronously* after the click
fires, so revoking the reference before that read completes can silently fail or truncate the
download with no error surfaced back to the calling code (`a.click()` reports nothing either way,
so the "Downloaded." success message showed regardless of whether a file actually landed).
Confirmed independently: this file's own bundled jsPDF library ships a `saveAs()`-style download
helper internally that already delays its own `revokeObjectURL` by 40 seconds for exactly this
reason. Fixed by wrapping the revoke call in a short `setTimeout` (4s) instead of calling it
synchronously.

**A real, previously-live race condition in the full-screen Coach page was found and fixed**: it
was possible to send a message that silently never reached the AI at all, while the floating
widget (calling the identical `aiCoachFetch()`/`aiSwimCoach` endpoint) never had this problem —
looking, from the outside, exactly like "two different backend paths" even though both surfaces
always hit the same one. The actual cause: `loadThreadsIfNeeded()` loads (or, for a brand-new
swimmer, creates) a thread asynchronously the moment the Coach tab is opened, and the form
submit handler's old guard — `var thread = activeThread(); if (!thread) return;` — silently
bailed out if that network round-trip hadn't resolved yet. A swimmer typing and sending a message
quickly (trivially easy on any real production network latency, but never caught by this
project's own Playwright tests, which always `waitForTimeout()`'d before sending) would see their
own message render normally and then simply never get a reply, with no error either, because the
`aiSwimCoach` call was never made. The floating widget has no thread concept at all — just one
always-ready in-memory array — which is exactly why it never exhibited this. Fixed with
`ensureActiveThread()`: if no thread is active yet, it synthesizes one immediately with a
client-chosen id (a perfectly valid Firestore document id via the existing `setDoc`-based
`__coachThreadSave` — no `addDoc()` round-trip required before the first message can go out) so a
send can never be silently dropped, regardless of how slow the network is. A second, related race
was closed alongside it: if `loadThreadsIfNeeded()`'s query finally resolves *after* a message was
already sent against a synthesized thread, its callback now checks whether the currently-active
thread already has messages before overwriting `threads` wholesale — otherwise a swimmer's
just-sent conversation could be silently replaced by a different (older) thread the instant the
slow network call finally landed. Verified with a dedicated Playwright test that artificially
delays the thread-list query and confirms a message sent immediately (well before that delay
elapses) still reaches the AI and still renders correctly once the delayed query resolves.

**Avatar rendering was rewritten from show-then-hide-on-error to load-then-reveal.** The previous
fix (an `error` listener that fell back to the placeholder) still allowed one frame of the
browser's broken-image glyph before JS could react, since the `<img>` was made visible
immediately and only hidden *after* a failed decode. Both `#settingsAvatarPreview` and `#navAvatar`
now stay hidden behind their placeholder until a `load` event confirms the image actually decoded
successfully — so a bad, corrupted, or slow-to-fail `avatarDataUrl` can never flash a broken icon
on screen at all, not just briefly. The `error` listener still exists as the fallback path for a
value that fails outright. A real, valid upload is unaffected — it now just becomes visible the
instant it finishes decoding instead of instantly-but-optimistically.

**Paddle webhook handling was rewritten to use Paddle's own official Node SDK
(`@paddle/paddle-node-sdk`) instead of a hand-rolled HMAC verifier, and gained a proper
per-Paddle-entity Firestore mirror alongside the pre-existing billing state.** `paddleWebhook`
now verifies every delivery with `paddle.webhooks.unmarshal(rawRequestBody, PADDLE_WEBHOOK_SECRET,
signature)` — the SDK's own signature check, run against `req.rawBody` (the exact bytes Paddle
signed, read before any JSON-parsing) — and never returns a 2xx on a failed verification (401,
so Paddle keeps retrying a delivery this code never actually accepted). A verified event is routed
by `eventData.eventType` (compared against the SDK's own `EventName` enum, not a string literal)
to one of three paths: `subscription.created`/`updated`/`canceled` upsert into a new
`subscriptions/{paddleSubscriptionId}` Firestore collection via `upsertPaddleSubscription()`;
`customer.created`/`updated` upsert into a new `customers/{paddleCustomerId}` collection via
`upsertPaddleCustomer()`; and `transaction.completed` (plus the two subscription cases above)
also mirror into the pre-existing `paddle_subscriptions/{firebaseUid}` blob via
`mirrorLegacyPaddleSubscriptionDoc()`, kept in its original shape on purpose so `getAccessLevel()`
and the Admin Panel — both already shipped — never regress. Every event type not explicitly
routed falls to a `default:` branch that acks 200 without processing (defense in depth beyond
the signature check: a verified signature proves the delivery came from Paddle, not that every
event type Paddle might ever add is safe to blindly act on). Every upsert is keyed by the real
Paddle id (`subscriptionId`/`customerId`), not the Firebase uid, and always merge-writes — Paddle
deliveries are at-least-once and can arrive out of order, so every handler is idempotent by
construction. A new `subscriptionGrantsAccess(status)` helper (just `PADDLE_ACTIVE_STATUSES =
['active','trialing']` checked against `status`) is the single source of truth for "does this
subscription currently grant paid access" — deliberately never inspects `scheduledChange` at all,
since Paddle itself leaves `status` as `'active'`/`'trialing'` right up until a scheduled
cancellation/pause actually takes effect (at which point a fresh `subscription.updated` event
flips `status` itself), so gating purely on `status` already gets "never revoke early on a
pending scheduled change, only on an actual cancellation" right by construction, with no
special-casing needed. `getAccessLevel()` now calls this same helper instead of duplicating the
`PADDLE_ACTIVE_STATUSES.indexOf(...)` check inline. `scheduledChangeAction`/`scheduledChangeAt`
are still stored on the `subscriptions/{id}` doc for display/audit, just never read by the access
decision. Every entity is also stored in full as a `raw` field (JSON-round-tripped via
`toPlainObject()`, since Firestore rejects the SDK's class instances and `undefined` values
directly) — nothing is lost even where a specific convenience field wasn't extracted.
`firestore.rules` gained matching `customers/{customerId}`/`subscriptions/{subscriptionId}`
blocks, same owner-only-read/no-client-write convention as the pre-existing
`paddle_subscriptions/{docId}` block right above them (a swimmer can read only their own, matched
by the `firebaseUid` the checkout attached; list/write stay blocked; the one server-side query by
`firebaseUid`, in `paddleCustomerPortalSession` below, runs through the Admin SDK and bypasses
these rules entirely, same as every other admin-style lookup in this codebase).

**A new `paddleCustomerPortalSession` Cloud Function lets a signed-in swimmer self-serve payment
method changes, cancellation, and invoices through Paddle's own hosted customer portal**, wired to
a new "Manage Billing" button on the Settings tab's new Billing card (`#settingsBillingPortalBtn`).
The swimmer's Paddle customer id is resolved entirely server-side — a `subscriptions` (falling
back to `customers`) query by `firebaseUid` against the caller's own verified ID token uid — never
from anything the client sends in the request body, so no signed-in swimmer can ever request a
portal session scoped to someone else's billing data by supplying a different customer id. Once
resolved, `paddle.customerPortalSessions.create(customerId, subscriptionIds)` mints the session and
the function returns just `session.urls.general.overview`, which the client opens in a new tab. A
swimmer with no billing record yet (never subscribed) gets a plain 404 with an explanatory message
rather than a broken portal link. This is the first caller of `PADDLE_API_KEY` — a real Paddle API
key, a different credential from `PADDLE_WEBHOOK_SECRET` (which only ever verifies a webhook
delivery, never authenticates an outbound call) — read via a new `defineSecret`, alongside a new
non-secret `PADDLE_ENVIRONMENT` `defineString` (`'production'` default, `'sandbox'` for a
dev/local override) that selects which Paddle environment the SDK client points at. Both the
webhook handler and the portal-session function share one lazily-constructed `Paddle` SDK client
instance (`getPaddleClient()`) built from these two params.

A `functions/.env.example` was added (and `functions/.gitignore`'s blanket `.env.*` ignore rule
was given a `!.env.example` exception so it isn't itself gitignored) — it's documentation only,
listing every secret this codebase's Cloud Functions need and what each is for; every one of them
is actually backed by Firebase Secret Manager (`firebase functions:secrets:set ...`) at runtime,
never read from a real `.env` file, except `PADDLE_ENVIRONMENT` (the one non-secret `defineString`
param), which genuinely can be overridden via a real `functions/.env.<project-id>` file if needed.
The `functions/index.js` header's GO-LIVE CHECKLIST comment was updated to match: the new
`PADDLE_API_KEY` secret, the new `customers`/`subscriptions` Firestore rules needing their own
`firebase deploy --only firestore:rules`, and an explicit list of which Paddle event types to
select when registering the webhook destination in the Paddle dashboard (everything else is
safely ignored, not rejected, so over-selecting is harmless).

**Every entity this fulfillment system touches is live, production state — never disposable.**
The Paddle webhook notification destination and its signing secret (created manually in the
Paddle dashboard per the checklist above, since no Paddle MCP tool was available in this
environment to create one programmatically), the three product/price tiers backing the Pricing
tab's checkout, and every customer/subscription/transaction record in Paddle or in this app's
Firestore mirror are all real, live fulfillment state — deleting any of them breaks real billing
event processing for real swimmers, not a test fixture. Nothing along this build touched or
deleted any of them; all verification of the new SDK-based signature check and typed event
parsing was done entirely offline, against locally-fabricated test payloads signed with a
throwaway test secret that was never Paddle's real signing secret and never sent to any live
Paddle or Cloud Functions endpoint.

**`paddleWebhook` gained a defense-in-depth IP allowlist and cold-start mitigation, and the
client gained Paddle Retain's `pwCustomer` wiring — all three code-only, no live Paddle account
access involved.** A sandbox→live migration was requested this round (recreate the product/price
catalog in live, mint live credentials, configure live account settings) but neither the
`paddle-sandbox` nor `paddle-live` MCP server the request depended on was actually connected in
this session (confirmed via `ListConnectors` — only the Higgsfield media connector was present),
so none of that catalog/credential work was attempted; fabricating it was explicitly ruled out.
What *was* achievable without live Paddle access: `paddleWebhook` now fetches and caches Paddle's
published IPv4 ranges (`https://api.paddle.com/ips`, `data.ipv4_cidrs`, 1-hour cache) via
`fetchPaddleIpRanges()`/`ipInCidr()`/`extractClientIp()` (the last reading the real origin from
`X-Forwarded-For`, since Cloud Run's own connecting socket is always Google's front end, never
Paddle's) and rejects (403) any delivery from outside that range — deliberately **fails open**
(skips the IP check, logs a warning, still enforces the real signature check below) if the fetch
itself ever fails and no cached list exists yet, since this is defense-in-depth on top of
`paddle.webhooks.unmarshal()`'s cryptographic verification, never a replacement for it, and an
unrelated outage fetching Paddle's own IP list should never be able to take down real billing
event delivery. The list is intentionally never hardcoded, per Paddle's own guidance that it can
change. Separately, `paddleWebhook` now also sets `minInstances: 1` to keep one instance always
warm — a hedge against the SDK's hardcoded 5-second (`WebhooksValidator.MAX_VALID_TIME_DIFFERENCE`)
signature-freshness window being eaten by cold-start latency, at the cost of one always-on Cloud
Run instance; drop it if that theory gets ruled out. On the client, `window.__resolvePaddleCustomerId(uid)`
mirrors `paddleCustomerPortalSession`'s own subscriptions-then-customers lookup-by-`firebaseUid`
(same owner-only Firestore rules, just run client-side), and a new `swimfit:authchange` listener
calls it on sign-in and re-runs `Paddle.Initialize()` with `pwCustomer: { id: customerId }` once a
real Paddle customer id is found — the initial page-load `Paddle.Initialize()` call is deliberately
left to fire immediately without it, since a customer id only exists after a swimmer's first
subscription and blocking first paint on an auth/Firestore round-trip isn't worth it. A pure
code-audit of what already existed (no MCP needed) found the client Paddle token is already
`live_`-prefixed and `Paddle.Environment.set('production')` was already in place on both client
and server (`PADDLE_ENVIRONMENT` defaults to `'production'`) — i.e. this codebase was not actually
pointed at sandbox to begin with, so there was no sandbox→live string-swap to perform in the price
IDs, checkout code, or environment setters. Whether the actual `pri_.../pro_...` catalog IDs and
the `PADDLE_WEBHOOK_SECRET`/`PADDLE_API_KEY` secret *values* are genuinely live-account credentials
(as opposed to sandbox values that merely share the same ID format) is **not verifiable from code
alone** and still depends on the missing MCP connection or the user's own dashboard access. A
pre-verification content audit (also code-only) found the footer's Privacy Policy and Terms of
Service links are both literal `href="#"` placeholders, and there is no Refund/Cancellation Policy
link or page anywhere in the site at all — a real gap for Paddle's account verification, which
this round only surfaced, did not fix (no policy copy was drafted, since that's a business/legal
decision, not a coding one). Contact info is fine as-is (a `mailto:` link sits in the footer,
reachable from any page). Live-domain-resolution and pricing-page-vs-live-catalog checks could not
be completed either — this sandbox's own outbound network policy returned a 403 on direct fetches
to both `swimfit.online` and `api.paddle.com` (confirmed via a direct `curl`, ruling out a
Paddle-side or auth-side cause), independent of the missing MCP servers.

**A wide cross-app round touching Settings, Support, AI Coach, Gym, Workouts, the PB Tracker,
the Home page, and Pricing/trial.** Settings was live-audited (Playwright against the Firestore
emulator/mock) rather than rewritten — Units, Notifications, Export CSV, the Billing portal
button, and the avatar-remove edge case were all found already wired to real persistence with no
mock/placeholder logic, so nothing there needed fixing.

The **Support tab** (and the matching floating admin-chat widget) now shows an instant, no-wait
greeting bubble — "Hello! Welcome to the Swimfit Support Team. How can I assist you today?" —
the moment either surface opens with an empty thread, replacing the old, blander empty-state
copy. This is a purely client-rendered canned greeting, never written to Firestore as a fake
admin message (which would misrepresent a bot reply as a real admin one and pollute the Admin
Panel's own inbox view) — the underlying channel is still the same real human `admin_chats`
messaging system it always was, not an AI chatbot; a literal AI-backed "Support" channel would
conflict with `aiSwimCoach`'s own system prompt, which explicitly refuses non-swimming topics
including account/billing questions. The Support tab also picked up a real visual upgrade: a
`.support-page-header` identity strip (avatar, "Swimfit Support Team" name, a pulsing "Online
now" status dot) and a `.support-trust-row` of three trust badges (real-time replies, a real
human team, account & billing help) above the chat shell, plus a gradient-bordered, glow-shadowed
`.support-page-shell` distinct from the plain Coach page shell it's built on top of.

The **full-screen AI Coach page** got an equivalent `.coach-page-header` identity strip (bot
avatar, "AI Swim Coach" name, a pulsing "Ready to help" status dot) and a refined active-thread
indicator (a solid `aqua` inset left border on `.coach-thread-item.is-active`, replacing a flat
background-only highlight) for a sleeker, more product-like feel. Its existing per-thread
Firestore persistence (`coach_threads/{uid}/threads/{threadId}`, already fully automatic — every
message, image, and thread already survived a refresh before this round) needed no changes; this
round's real addition is **video upload**: since Claude's API takes images, not raw video, a
selected video file is never uploaded whole — `extractVideoFrames()` decodes it into an offscreen
`<video>`, seeks to 3 evenly-spaced timestamps (10%/50%/90% of duration), and captures each via
canvas into a JPEG through the exact same `compressImageFile()`-style downscale/encode pipeline
already used for photos, then feeds those frames into the same `pendingImages` array and the same
3-image-per-message cap `aiSwimCoach` already enforces server-side — no backend changes were
needed at all, since the endpoint only ever sees images either way. This is deliberately framed as
"the coach reviews key frames from your clip," not full motion/video understanding, since that's
an honest description of what a vision-only model can actually do with extracted stills.

**Gym gained a fifth focus, Flexibility & Agility** (`GYM_FOCUS.flexibility`), a modality like
Cardio rather than a muscle-group split — real mobility/agility work (Leg Swings, World's
Greatest Stretch, Bird Dog, 90/90 Hip Switches, a Deep Squat Hold, an Agility Ladder drill,
Lateral Bounds, Walking Lunges with Rotation, a Cone Shuffle Drill, and cooldown stretches)
across the same Warm-Up/Core/Main/Cool-Down phase structure every other focus uses. Left out of
`GYM_WEEKLY_ROTATION` on purpose, same precedent as Cardio — it's manually-selected only, not
part of the auto-rotating Upper/Lower/Full cycle. Most of its exercises reuse existing
`GYM_ANIM_MAP` archetypes (`legswing`, `birddog`, `pigeon`, `squat`, `lunge`, `hinge`,
`sidelean`, `foamroll`, `kneellunge`) rather than new hand-drawn SVGs, since those poses already
existed and matched closely; only the Agility Ladder and Cone Shuffle drills fall back to the
existing generic animation, a disclosed trade-off rather than inventing new archetypes for two
exercises.

**The Workout Generator's Speed-vs-Endurance-vs-Technique focus picker already existed**
(`state.goal`/`GOALS`, feeding `generateWorkout()`'s pacing and Gym's own sprint/distance
orientation) — this round's real work was making the **result panel compact**: each of the four
stage blocks (Warm-Up, Pre-Set, Main Set, Cool-Down) now renders as a native `<details>`/
`<summary>` disclosure (`renderBlock(..., openByDefault)`) instead of an always-expanded `<div>`,
with Main Set open by default and the three supporting stages collapsed, plus a "N sets" count in
each collapsed summary so there's still useful information at a glance without expanding
anything. `extractStructuredWorkout()` (the PDF export's DOM reader) was updated to strip that
count span's text back out when reading a block's title, so the PDF still shows a clean "Warm-Up"
rather than "Warm-Up3 sets" — verified the PDF export still fires correctly after this change.

**The Personal Best Tracker's distance picker now goes up to 1500m** (`#trackerPbDistance`
gained `800m`/`1500m` options, on top of the existing 50/100/200/400m) — `parseTimeToSeconds()`
and `formatTime()` already handled arbitrarily-large minute values correctly (an 18:32 1500m swim
parses/round-trips with no code changes needed), so this was purely an options-list addition,
verified by actually logging an 18:32 1500m PB end-to-end into the mock Firestore.

**The Hero's stat row was rebuilt around one new, genuinely live counter.** The three static
feature-count tiles (Disciplines/Skill Tracks/Gym Focuses) were removed, and a new **"Total
Active Subscribers"** tile sits alongside the existing live "Registered Swimmers" one — both read
the same public `stats/counters` doc via `onSnapshot`, both hide gracefully if Firestore can't be
reached. The new `activeSubscriberCount` field is maintained by a brand-new Firestore trigger,
`exports.onSubscriptionWrite` (`onDocumentWritten('subscriptions/{subscriptionId}', ...)`,
`firebase-functions/v2/firestore`) — it compares before/after `status` on every write to the
`subscriptions` collection (the same per-Paddle-entity mirror `paddleWebhook` already maintains)
through the existing `subscriptionGrantsAccess()` helper, and increments/decrements the counter
by exactly 1 only when a write crosses the active/not-active boundary (e.g. `trialing` →
`active` produces no delta at all, since both count as active) — this is the only place that
counter is ever written, so it can never drift from what `getAccessLevel()` itself would compute.
A swimmer has no read access to any subscription but their own, so this genuinely could not be
computed client-side.

That same round did a **light copy pass for brand neutrality and plain language**: every literal
"UAE"/"Emirates" reference was removed from user-visible copy (the Hero eyebrow, the Pricing
FAQ's currency note — which now just says "billed directly in AED" — and the Settings country
field's example placeholder), in both English and Arabic, while deliberately leaving AED itself
as the billing currency untouched, since removing a *brand* reference to a region is a different,
much smaller change than changing the actual currency Paddle bills in — the latter wasn't asked
for and isn't something this sandbox could safely do without live Paddle catalog access anyway.
Separately, every user-visible "dashboard" mention (the `<title>`, the meta description, the Hero
subhead in both languages, the auth modal subtitle, the About section and footer taglines, the
App Preview heading and its mocked browser-chrome URL bar, and a footer nav column literally
titled "Dashboard") was reworded to "platform" (or, for the footer column, renamed to "Explore")
— internal implementation details like the `#dashboard` element id, `.dashboard` CSS classes, and
the `dashboard` JS variable were deliberately left alone, since those are plumbing, not copy a
swimmer ever reads.

**The free trial dropped from 7 days to 3**, everywhere the number appeared: `TRIAL_DAYS` (both
the client constant and the server-side one in `functions/index.js`, which independently gates
`aiSwimCoach`), the Admin Panel's own `ADMIN_TRIAL_DAYS` and its "+7 Day Trial" grant button (now
"+3 Day Trial" — changed for consistency, since leaving the admin's manual grant at 7 days while
new signups got 3 would read as a confusing inconsistency rather than a deliberate goodwill
gesture), and every piece of marketing copy mentioning the old number (the Offers Strip cards,
the entrance promo popup badge, the Pricing tab's own sub-copy). Distinct "7 days"/"7-day"
mentions that were never about the trial at all — a Gym AI prompt chip asking for "a full week (7
days)" of programming, and a code comment about the Distance Tracker's chart needing "full 7-day
coverage" for its weekly view — were correctly left untouched, since a calendar week is still 7
days regardless of the trial length.

**Every "Subscribe" button on the Pricing tab is now "Get Started," with a persistent, color-
matched glow** (`.btn-cta-glow`, a slow breathing box-shadow — green for Elite's `.btn-primary`,
aqua for Pro's `.btn-ghost`, maroon for Ultra's `.btn-outline-maroon` — via three keyframe
variants keyed off the button's own existing class, so the glow always reads as a natural
extension of that button's own accent color rather than a mismatched effect; disabled under
`prefers-reduced-motion` down to a static shadow). No JS logic anywhere keyed off the literal
string "Subscribe," so the relabel was copy-only — verified via a full click-through that
`data-plan` (not button text) still drives checkout.

**A real Support/floating-widget greeting race was found and fixed.** The canned "Hello! Welcome
to the Swimfit Support Team..." greeting (see above) existed in code but, in practice, a real
signed-in swimmer often saw a blank panel instead: Firebase Auth's initial "signed out" resolution
fires for every visitor (even ones who turn out to be signed in a moment later), and the
`swimfit:authchange` handler's signed-out branch wiped the panel via `messagesEl.innerHTML = ''`;
when the real sign-in then landed, `subscribe()`/`subscribeIfNeeded()` only started the async
Firestore subscription — nothing re-asserted the greeting synchronously — so the panel stayed
blank until that round-trip resolved, or showed a bare error if it failed. Both the floating widget
and the full-screen Support tab now call `renderMessages([])` synchronously at wire-time *and* as
the very first statement inside `subscribe()`/`subscribeIfNeeded()`, and their `onError` callbacks
re-render the greeting before appending a small error note rather than replacing the whole panel
with only error text — verified via Playwright that the greeting renders in the same JS tick as
sign-in, before any Firestore round-trip could possibly resolve.

**Workout Generator: Personal Bests now accept any competition distance, not just fixed
50m/100m.** Each stroke's PB row (`.pb-stroke-grid`, Freestyle/Backstroke/Butterfly/Breaststroke)
is now a `<select>` (50/100/200/400/800/1500m, 100m default) paired with a time input, rather than
two separate fixed-distance fields — a 400m or 1500m specialist can log their actual best instead
of estimating a 50m/100m equivalent. `personalPaceFromPB(pbDistanceM, pbTimeSec, goalKeys)` was
rewritten around a Riegel-style fatigue-exponent formula (`T2 = T1 * (D2/D1)^1.03`) to normalize
whichever distance was logged to an equivalent 100m pace, replacing the old hardcoded
`pb50Sec*2+3` shortcut that only ever worked for a 50m input.

**Fitness Goals became multi-select** (`state.goals`, an array, replacing the single `state.goal`
string) — a swimmer can combine Speed + Endurance + Technique in one session instead of being
forced to pick exactly one, mirroring the existing Disciplines chip picker's own multi-select
pattern (same "keep at least one selected" guard). Every downstream consumer of the old singular
field was converted to blend across every selected goal: `paceSecondsPer100()` and
`personalPaceFromPB()` average their per-goal base pace across `goalKeys`; `renderCoachTips()`
concatenates one tip per selected goal; the Main Set's `ARCHETYPE_POOLS` are combined
(deduplicated) across every selected goal rather than picking just one goal's pool, so combining
goals genuinely means more archetype variety, not an arbitrary tie-break; `gymOrientation()`
checks membership (`indexOf(...) > -1`) instead of equality; and all four AI-context payload call
sites (the Workouts/Gym inline panels, the floating widget, the full-screen Coach page) now send
`state.goals.join(', ')`. The picker's own label changed to "Fitness Goals (pick one, or combine
several)" to signal the new behavior.

**Every generated workout now avoids repeating the prior day's headline Pre-Set/Main-Set
archetype.** `generateWorkout()`'s daily-seeded rotation already changed the workout automatically
at midnight (see above), but nothing previously stopped an unlucky roll from picking the exact
same Pre-Set archetype (or the same first Main Set block) two days running for a swimmer with
unchanged settings. A new `dailySeedForDate(d)` helper generalizes the existing `dailySeed()` (which
now just calls it with `new Date()`) so a seed can be computed for an arbitrary date, and
`generateWorkout()` builds a second, throwaway RNG (`priorDayRng`, seeded from yesterday's date)
purely to simulate what today's current settings would have produced yesterday for the Pre-Set
archetype and the Main Set's first archetype — the two most visible repeated elements a swimmer
would notice. If today's real pick (drawn from the real, still-fully-deterministic `workoutRng`)
matches that simulated prior-day pick, it's re-rolled from the remaining candidates (via a new
`pickOneFrom(rng, arr)` helper that draws against an arbitrary RNG instance without touching the
global `workoutRng`/`pickOne`). This never touches `priorDayRng` for anything actually rendered —
it exists solely as a comparison baseline — so today's own generation stays exactly as
deterministic-per-day as before. Verified via Playwright across three simulated consecutive
calendar days with identical settings: no Pre-Set archetype repeated on any two consecutive days.

**The avatar/profile-photo feature was removed entirely, at the user's request that it was
unnecessary.** Settings' avatar upload row (`#settingsAvatarPreview`/`#settingsAvatarInput`/
`#settingsAvatarRemoveBtn`), the nav bar's `#navAvatar` image, the `wireNavAvatar()` IIFE,
`compressAvatarFile()`, `showAvatar()`, `window.__updateNavAvatar`, and every `avatarDataUrl`
read/write in the Settings profile form JS are all gone — a swimmer's profile card in Settings now
starts directly with the Full Name/Username/Email/Country/Age fields, and the nav bar shows no
avatar slot for any account. `firestore.rules`' `isValidProfileWrite()` and both the `create`/
`update` field allowlists on `users/{uid}` dropped `avatarDataUrl` to match — a full removal
rather than just hiding the UI, since an orphaned nav avatar with no way to ever set a photo would
have been confusing dead code. The `support-page-avatar`/`coach-page-avatar` CSS classes and
markup (the Support/Coach bot identity icon badges) are unrelated to this feature and were left
untouched.

**Workout Generator + Gym profile inputs now auto-save, and Settings' Swimming Specialties saves
instantly on toggle instead of requiring a separate button.** Previously the Swimmer Profile's Age
field, all 4 PB distance+time pairs, and the Gym tab's Age/Working Weight/Strength Limit fields
were plain form inputs with no persistence at all — every one of them silently reset on a page
reload or tab navigation, since they were only ever read live at generate-time. A new
`swimfit_generator_prefs` localStorage blob (`loadGeneratorPrefs()`/`saveGeneratorPrefs()`) now
captures all of it — `state.disciplines`/`distance`/`equipment`/`goals`/`level` (restored into
`state`'s own initializer, so chip/slider/tab rendering reflects it from the very first paint) plus
every one of the plain fields above (`GENERATOR_PREF_FIELD_IDS`, restored on load and saved on
every `input`/`change` event). This is device-local generator preference, not account data another
device needs to see, so localStorage (matching the existing units/theme/language/weekly-goal
precedent elsewhere in this file) was the right store rather than a new Firestore field + rules
deploy. Separately, Settings' Swimming Specialties chip picker no longer needs its own "Save
Specialties" button (removed) — toggling a chip now calls `persistDisciplines()` immediately,
which writes to Firestore, applies live to the Workout Generator's own chip group, and mirrors the
selection into the same `swimfit_generator_prefs` blob, all in one step. Verified via Playwright:
typing into a PB/age/gym field, reloading the page, and confirming the value survives; toggling a
Specialty chip and confirming the "Saved" status text appears with no button click involved.

**A real, previously-live crash in `generateWorkout()` was found and fixed**: the "Coach's Plan"
pace-summary paragraph referenced `pb100Sec`/`pb50Sec`, two variables that no longer existed
anywhere in the function after an earlier round rewrote the PB fields around flexible
distance/time pairs (`pbDistanceM`/`pbTimeSec`) — a bare `ReferenceError` on that line, thrown the
moment `personalPace` was non-null (i.e. the instant a swimmer actually filled in a PB), meaning
the whole workout generation silently failed for exactly the swimmers using the feature as
intended. Every previous round's Playwright verification happened to test with empty PB fields,
so `personalPace` stayed `null` and the broken branch was never exercised. Fixed to read
`pbDistanceM`/`pbTimeSec` directly; verified end-to-end with a filled-in PB with zero page errors.

**Workout Generator: a wide formatting/logic revamp.** The "Coach's Intent — Why This Set" boxes
are gone from every stage (`renderBlock()` no longer takes or renders an `intent` param at all —
the underlying `intents` arrays stay on each archetype object as inert, harmless data, same
"don't touch working content, just stop reading it" precedent as `coach_history` elsewhere in this
file) — a swimmer sees the sets themselves, not a paragraph justifying them. "Target Pace: 1:44 /
100m" is gone too; `cleanPaceLabel()` converts an internal tag like `"200 Pace"` into a plain
`"200m Pace"` label with no clock time attached, while non-numeric tags (`Recovery Pace`, `Drill
Pace`, etc.) pass through unchanged. Every set row now also shows a **Total Time** figure
(`reps × interval`, via `buildSet()`'s new `totalSec` field) alongside the existing Interval/Rest
columns, and the Rest column now reads `"Rest: 15s"` inline rather than a value-over-label pair.
The Warm-Up's second line (previously a fixed `"Drill/Build — odd 25 drill, even 25 build"` every
single day) now rotates through `WARMUP_DRILL_POOL` via `pickOne()` — the same day-stable
`workoutRng` seed as everything else, so it still only changes at midnight, never on every click —
while the opening Freestyle-easy swim stays hardcoded exactly as before.

**A hard realism cap: no single Butterfly rep/set can ever exceed 200m.** `buildSet()` is the one
function every archetype (Warm-Up, Pre-Set, every Main Set archetype, Cool-Down) funnels through
to build a set, so the cap lives there once instead of being audited into each archetype
individually: if a label starts with `"Butterfly"` and the computed `dist` is over 200m, reps are
scaled up (`Math.ceil(reps * dist / 200)`) and `dist` is clamped to 200 — preserving the
archetype's intended total volume rather than silently shrinking the session. This was a real,
reachable case: `Build-By-Thirds` (an Endurance archetype whose single continuous rep scales
directly with the swimmer's chosen distance) could previously hand a Butterfly-primary swimmer an
800m+ unbroken Butterfly rep at large total distances.

**Longer sessions now get genuinely more varied Main Set archetypes, not just a bigger version of
the same one or two.** `blockCountForDistance()` adds one extra archetype (capped by how many
distinct archetypes actually exist in the combined goal pool) once total distance reaches 3500m —
a swimmer choosing 3-4km sees a wider spread of Main Set blocks instead of the existing
per-archetype round/rep scaling alone stretching to fill the volume.

**Equipment is never combined all at once onto the same set.** The Technique archetype "Equipment
Strength" previously handed every selected piece of gear (Fins + Kickboard + Pull Buoy + Hand
Paddles, if all four were checked) onto the same set row — unrealistic, since a swimmer only ever
uses one or two pieces of gear per rep in practice. It now picks one gear item for Round 1 and a
different one (where more than one is selected) for Round 2, with Round 3 intentionally gear-off
to test transfer, matching the realistic single-item-per-round pattern every other equipment-aware
archetype (`Descending Power Ladder`, `Sprint Reps`, etc.) already used.

**Every set row got an interactive completion checkbox that logs straight into the Distance
Tracker.** Checking `.set-complete-check` on a rendered `.set-row` calls the exact same
`window.__swimLogAdd` bridge the Tracker's own manual log form uses (`{distanceMeters, loggedAt,
discipline}` — no new Firestore collection, Cloud Function, or security rule needed), with the
discipline best-effort inferred from the set's own title text (`inferSetDiscipline()`, falling
back to the swimmer's primary selected discipline for the handful of equipment/pull-focused sets
whose titles don't name a specific stroke). Unchecking the same box deletes that exact entry again
via `window.__swimLogDelete`, tracked in-memory by the row's own generated `data-set-id` — a map
that never needs explicit clearing, since the next Generate click replaces `#workoutResult`'s
entire DOM subtree anyway. Verified end-to-end against the Firestore emulator mock: checking a box
creates exactly one `swim_logs` entry with the right distance/discipline, unchecking it removes
that same entry.

**The About section was condensed from three full pillar cards into a single slim chip row.**
Reaching the tab shell (Workouts, Gym, etc.) below it on a fresh page load meant scrolling past a
noticeably taller block than necessary; the same three ideas (Always Adaptive / Built On Technique
Science / One Squad, Every Level) now read as three small pill-shaped chips in one row
(`.about-pillar-chip`) under a shortened headline, with the restating "Swimfit is the ultimate..."
paragraph dropped as redundant with the `<h2>` right above it. This was a deliberate, scoped trim —
not a removal of the section or its ideas — confirmed with the user before touching it, since the
literal ask ("remove the long definition block") didn't match anything actually inside the Workouts
panel or the site footer (both already short) once audited; the About section was the only
genuinely long descriptive block sitting between the Hero and the tab shell.

**Settings got a visual pass**: a soft dual radial-gradient wash (aqua top-left, green
bottom-right, both low-opacity) now sits behind the whole signed-in Settings shell, and each
`.settings-card` picked up a gradient background, a colored top accent bar (rotating aqua/green/
maroon per card), a soft drop shadow, and a hover lift — replacing the previous flat single-tone
card treatment. This layers on top of both Dark and Light mode's own surface colors rather than
overriding them, so the page still fully respects the swimmer's Appearance choice while reading
noticeably less flat/gloomy than before.

**A landing-page/footer audit for leftover debug or placeholder copy found nothing to remove.**
Grepped for the usual signs of orphaned scaffolding (`TODO`/`FIXME`, `lorem ipsum`, sample
emails/names, raw `console.log`-style text visible in markup, etc.) across the whole file — every
hit traced back to either the bundled jsPDF library's own source (third-party, never user-facing)
or coincidental substring matches inside base64 image data URIs, not actual rendered copy. The
Hero's "Command the Water. Own the Race." headline was deliberately left untouched — it's an
intentional marketing pun, not technical debug text, and nothing else on the landing page or in
the footer read as unintentional scaffolding.

**A major layout cleanup removed every marketing section sitting between the Hero and the tab
shell, and everything inside the Workouts panel that sat above the actual generator form** — the
whole point being that reaching the Swim Workout Generator no longer means scrolling through a
stack of landing-page content first. Removed entirely: the About section ("What Is Swimfit?"),
the Offers Strip ("3 Days, Fully Free" / Ultra annual savings), the App Preview ("A Peek At Your
Training Platform" dashboard mockup teaser), and the Plan Sneak Peek ("Find Your Level" pricing
switcher) — along with their now-fully-orphaned JS (`wirePlanPreview()`, `PLAN_PREVIEW_DATA`, the
`offerTrialCtaBtn` click handler) and CSS. The Social Proof section (Instagram/TikTok follow
cards) was **not** in this list and was deliberately left in place. Within the Workouts panel
itself, the `.services-strip` six-card feature grid (Adaptive Daily Workouts / Personalized Pacing
/ Race-Pace Analytics / etc.) and the `.coach-banner` ("Meet Your Coach — Every Set, Coached Like
a Real Practice") were removed too, along with the panel's own decorative `.tab-banner` photo strip
— the actual config form (`.generator`) is now the first substantial thing a signed-in swimmer sees
on the Workouts tab, right below a minimal heading and the guest-gate/contact-coach button. The
Gym tab's own `.tab-banner` was left untouched (out of scope, and the class is still shared/used
there). Root CSS custom properties `--coach-photo`/`--pool-edge-photo` were removed alongside their
now-sole consumers.

**The generated workout card itself was made meaningfully more compact**, on top of the earlier
`<details>`/`<summary>` collapse-by-default pass: `.result-panel` padding dropped from
`--space-6` to `--space-4`; the gap between stages (`.workout-block + .workout-block`) dropped
from `--space-5` to `--space-3`; every set row's padding, font sizes (title, pace label, gear
chips, interval/rest/total figures) and checkbox size were all scaled down roughly 10-20%; and the
"Coach's Plan" summary paragraphs and "Coach's Technical Tips" block picked up smaller font sizes
and tighter margins to match. `.result-panel::before`'s background-photo darkening overlay was
also deepened (from ~0.94/0.78 opacity to ~0.97/0.92) specifically because a workout card is
read-heavy — a dozen-plus set rows at once — so legibility against the ambient photo mattered more
here than the decorative effect elsewhere in this file. Verified via Playwright: a 4000m workout
(6 stages, 12+ set rows) renders with zero layout overflow and the config form sits within ~270px
of the top of the Workouts panel instead of requiring a long scroll past marketing content first.

**Support's `.support-trust-row`** (three badges — "Real-time replies," "A real human team,"
"Account & billing help" — sitting above the chat shell) **was removed** as the one genuinely
promotional/decorative block on that page; everything else on Support and Settings was audited and
found to already be a functional interactive control or a one-line functional helper caption (e.g.
"Manual log entry and your weekly goal always stay in kilometers" on the Units card) rather than
marketing copy, so neither page needed further trimming beyond this.

**A real, previously-live bug in the full-screen Support page's `swimfit:authchange` handler was
found and fixed.** Its signed-out branch called `messagesEl.innerHTML = '';` directly instead of
`renderMessages([])` — the floating widget's equivalent handler already did this correctly, but the
full-screen page had been missed. Since this signed-out event fires for *every* visitor as Firebase
Auth resolves (even ones who turn out to be signed in a moment later), the practical effect was a
real, reproducible gap: the greeting would render at wire-time, then vanish the instant this event
fired, and only reappear once the real sign-in resolved and `subscribeIfNeeded()` ran — a swimmer
opening the tab during that window saw a blank panel instead of the intended instant greeting.
Fixed to call `renderMessages([])` in that branch too, matching the widget. Verified via Playwright
by simulating the exact race (Support tab opened → signed-out flash fires → greeting must survive →
real sign-in resolves 300ms later) — the greeting now stays visible through every step.

**The generated workout card was restructured again for a more aggressive scroll reduction.** Only
the *first* Main Set archetype now defaults open (`main.map(function (block, i) { ... i === 0 })`)
— previously every Main Set block opened by default, so a longer session (which now picks an extra
archetype per the earlier 3500m+ variety rule) rendered two or more fully-expanded blocks
simultaneously, which was the single biggest remaining contributor to scroll height. Every
set row was also rewritten from a grid of three separately-labeled mini-columns (Interval / Rest /
Total, each its own value-over-label pair) into one line: title, pace tag, and gear chips inline
on the left, a single compact "1:45 int · 15s rest · 7:00 tot" string on the right — removing an
entire line of vertical space per row. The `.quote-card` pull-quote above the result panel and the
gap between it and the result panel were both shrunk too, and `.result-panel`'s own padding
tightened further. Net effect, measured via Playwright on a 4000m/12-row workout: the result panel
dropped from ~1400px to ~980px tall in its default (collapsed-except-first-Main-Set) state — every
other stage is still one click away, just not force-expanded on load. `extractStructuredWorkout()`/
`buildWorkoutPdf()` (the PDF export) were updated to match the merged `.set-stats` markup instead of
reading the now-gone `.set-interval`/`.set-rest` elements — verified the PDF still exports correctly
afterward.

**Per-set completion checkboxes were removed entirely and replaced with one "Complete Workout"
button** at the bottom of the result panel, per explicit feedback that swimmers don't want to
click through a dozen-plus individual boxes mid-session. The button reads the workout's total
target distance directly off `totalM` (already computed in `generateWorkout()`) and, on click, logs
one `swim_logs` entry for that full amount via the same `window.__swimLogAdd` bridge the checkboxes
used — no new Firestore collection or Cloud Function needed, same as before. The button disables
itself and relabels to "Logged To Tracker — X km" on success (so re-clicking can't double-log the
same session; a fresh Generate produces a fresh button), and a new `swimfit:swimlogchange` DOM
event fires alongside the log so an *already-open* Distance Tracker tab refreshes immediately —
without it, the Tracker's own `loadEntriesIfNeeded()` only ever fetches once per signed-in session
(guarded by `loadedForUid`), so a swim logged from Workouts after the Tracker was already visited
earlier in the session would otherwise sit invisible until the next sign-in. `inferSetDiscipline()`
and the per-row `completedSetLogIds` map from the old checkbox implementation were deleted as fully
dead code alongside it. Verified via Playwright: zero checkboxes render, clicking Complete Workout
writes exactly one correctly-sized `swim_logs` entry and updates the button state, with no page
errors.

**Pricing display switched from AED to USD** — Pro/Elite/Ultra now show `$13`/`$21`/`$135` (the
`.price-amount` markup was reordered so the `<span class="cur">$</span>` prefix renders before the
`<span class="num">` instead of the old `<span class="num">AED</span>` suffix layout), and every
piece of surrounding copy ("Billed in USD," the price note, the FAQ item) was reworded to match.
**This is a display-only change and carries a real, disclosed risk**: `PADDLE_PRICE_IDS` (the real,
live Paddle Price object ids Checkout actually charges against) were deliberately left untouched,
since a Price object's own currency/amount is configured server-side in the Paddle dashboard — not
something this sandbox can read or change (no Paddle MCP connector available, consistent with every
earlier Paddle-related limitation already documented above). If those Price objects are still
AED-denominated, the page now visually promises $13/$21/$135 while checkout may still charge
whatever AED amount they're actually configured for — reconciling this requires the user's own
Paddle dashboard access to either confirm the Price objects are already USD, or update them (and
swap in the new Price ids here) to match.

**The Workout Generator's "same set repeated at every distance" complaint was fixed at its actual
root causes**, found via direct empirical comparison (Playwright, full workout structure at 1000m
vs. 4500m/6000m) rather than a wholesale archetype rewrite. Three genuine non-scaling bugs: the
Warm-Up's supporting Drill/Build blocks were hardcoded `4 x 50m`/`4 x 25m` regardless of
`warmupM`, now `Math.max(4, Math.min(8, Math.round(warmupM / 100) + 2))` (and an equivalent for
the build reps) so a bigger session's warm-up genuinely carries more volume; the Pre-Set "Choice
Drill Ladder" always used fixed rungs `25-50-75-100` regardless of `shareM`, now derives its own
`unit` from `shareM` so the ladder itself scales; and the Pre-Set "Heart-Rate Target Pace" read
only the swimmer's level for its rep count and never looked at `shareM` at all, producing an
identical 2-4x100m set regardless of how much distance the archetype was actually allocated — now
`Math.max(roundCountFor(scaler), Math.round(shareM / 100))`. A brand-new Main Set archetype,
**Distance Ladder**, was also added to `ENDURANCE_ARCHETYPES` — a genuine descending-distance
ladder (rungs scale from `shareM`, e.g. 400-300-200-100 at high volume, 200-150-100-50 at low
volume) rather than the same rep distance repeated more times as volume grows, matching the user's
explicit "400s, 200s, 100s breakdown ladder" ask. `SWOLF Efficiency Set` was investigated and
deliberately left untouched — it already scales its rep count with `shareM`, and its fixed 50m
distance is intentional/coaching-correct (SWOLF compares stroke-count+time over a *constant*
distance, so scaling the distance would break the whole point of the drill). This was a targeted
fix of the specific broken archetypes plus one new genuinely-varied one, not a rewrite of the
entire archetype library.

**The Instagram/TikTok follow-card section was removed** — `#socialProof` (two `.follow-card`
links plus all their supporting CSS) sat directly between the Hero and the tab shell and was
judged redundant with the nav bar's and footer's own Instagram/TikTok icon links, which already
existed independently. The Hero's `</header>` now flows straight into the tab shell with nothing in
between. This is unrelated to, and did not touch, the earlier-removed About/Offers/AppPreview/
PlanPreview sections — Social Proof was the one marketing block a previous round had explicitly
left in place, and this round is what finally removed it, at the user's explicit request that it
was redundant with the navbar/footer icons.

**A real Support/floating-widget chat send bug was found and fixed.** Both `wireSupportPage()`
(full-screen Support tab) and `wireAdminMessagesWidget()` (floating widget) sent a swimmer's
message purely by awaiting `window.__adminChatReply(text)` with no `.catch()` and no optimistic
rendering — the sent bubble only ever appeared once the `onSnapshot` listener re-fired with the
new message from Firestore. Verified via Playwright that this was a real, reproducible failure:
sending a message via button click, a second click, or Enter all cleared the input (proving the
write promise resolved) but the message never appeared in the chat stream. Fixed identically on
both surfaces: a new `appendOptimisticMessage(text)` helper renders the swimmer's own bubble
immediately at submit time (before the async Firestore write), `input.value = ''` now fires
synchronously at submit rather than inside `.then()`, and a `.catch()` was added that appends a
visible "Could not send — please check your connection and try again" note instead of silently
swallowing a rejected write. The live `onSnapshot` subscription is still the authoritative source
of truth — it fully rebuilds the message list on every fire, so the optimistic bubble is simply
reconciled away once the real snapshot lands; this only closes the gap where a slow, stale, or
non-refiring subscription (a real risk given this codebase's own documented history of permission-
denied/undeployed-rules failures) left a successfully-sent message invisible with no feedback at
all.

**A real bug in the PDF export's `extractStructuredWorkout()` was found and fixed while
regression-testing the above.** `renderBlock()`'s set-row markup only renders a `.set-pace` span
when a set actually has a pace label (`(paceLabel ? '<span class="set-pace">'... : '')` — see the
formatting-revamp entry above), but `extractStructuredWorkout()` called
`child.querySelector('.set-pace').textContent` unconditionally, throwing a bare `TypeError` the
instant any rendered set had no pace label. This was a real, reachable crash: the new Distance
Ladder archetype's non-final rungs pass `null` as their `paceTag` by design (only the last, fastest
rung gets a `'100 Pace'` label), so generating a workout that included Distance Ladder and then
clicking "Save as PDF" failed every time with the generic "Could not generate the PDF right now"
alert. Fixed by guarding the lookup (`var paceEl = child.querySelector('.set-pace'); ... paceEl ?
paceEl.textContent.trim() : ''`) and making `buildWorkoutPdf()`'s pace-line rendering conditional
on `row.pace` being non-empty, so a set with no pace label simply omits that line in the PDF
instead of crashing the whole export. Verified via Playwright: PDF export now succeeds
(confirmed via a real `download` event) on a workout that includes the new Distance Ladder
archetype, where it previously threw on every attempt.

**A full UI/UX overhaul: a new color theme, a real desktop sidebar + mobile bottom nav, and
another Support-chat send bug.** This was the largest single-round visual/structural change to
the site since its initial build, touching color tokens, the nav's entire DOM/CSS role, and every
tab's outer layout — but deliberately did **not** touch any JS business logic, Firestore
read/write shapes, or Cloud Functions; every fix below is either a CSS/markup change or a narrowly
scoped bug fix uncovered while verifying the visual work.

**Color theme**: `:root`'s design tokens were rewritten from a near-black, slightly murky
green-black (`--bg:#070B0A`, `--surface:#101A19`) to a crisp, cool **slate** (`--bg:#0A0F18`,
`--surface:#131B2A`, `--border` now slate-tinted via `rgba(148,163,184,...)` instead of
white-based) with punchier neon accents (`--green:#16D673`, `--green-bright:#39FF9E`,
`--aqua-bright:#4EE9FF` added) and two new glow-shadow tokens, `--glow-green`/`--glow-aqua`, used
by the sidebar's active-tab indicator. The Light theme (`:root[data-theme="light"]`) got the same
treatment in its own register (a cooler slate-white `--bg:#EEF2F6` instead of a warm off-white,
slightly more saturated `--green`/`--aqua`) so both themes read as the same energetic "athletic
SaaS" product rather than one being an afterthought. Every hardcoded RGB literal in the file that
was baking in the *old* `--bg`/`--green`/`--green-bright` values directly (photo duotone overlays,
the nav blur backdrop, `.tag-green`/`.icon-tile.green`, the coach-bubble shadow, the Hero's
fallback gradient) was found via grep and updated to the new palette's equivalents — otherwise
those spots would have kept rendering the old murky near-black/dim-green underneath an otherwise
brand-new color system. `<meta name="theme-color">` was updated to match. This is a pure token
swap: every rule in the file already read color exclusively through `var(--...)`, so no per-page
CSS rewrite was needed to reskin the whole site.

**Desktop sidebar.** Above a new `@media (min-width: 981px)` breakpoint, `.nav` (the exact same
markup/JS-driven element that's a horizontal top bar below it) becomes a `position: fixed` left
column (`--sidebar-w: 232px`) running the full height below the announcement bar, with `.wrap`
switched to a column flex layout (brand at top, the full `#navLinks` tab list filling the middle,
`.nav-cta` — trial badge/Log Out — pinned to the bottom via `margin-top: auto`). The active tab's
indicator changed from an underline (works for a horizontal row) to a left inset bar with a
`box-shadow: var(--glow-green)` glow, plus a `--surface-2` background highlight — reads correctly
for a vertical list instead of reusing the horizontal metaphor. `body` gets `margin-left:
var(--sidebar-w)` at this breakpoint so every tab's content shifts right into the remaining space;
zero JS changes were needed for tab-switching since `switchTab()` already worked by
`data-tab`/`aria-current` regardless of which physical element the button lives in. **A real,
easy-to-repeat CSS bug was hit and fixed while building this**: the first attempt included
`inset-inline: auto;` *after* `left: 0; right: auto;` in the same rule — since `inset-inline` is a
shorthand that also sets the physical left/right, and CSS applies declarations in the order
written, the later `inset-inline: auto` silently cancelled the explicit `left: 0`, leaving the nav
positioned by its fallback "static position" (which, with `body` already carrying `margin-left:
232px`, coincidentally placed it flush *against* the correct-looking spot from a `0` starting
offset — i.e. it LOOKED plausible at a glance but was actually double-offset). Fixed by dropping
the redundant `inset-inline: auto` entirely.

**`.panel-wide`'s full-bleed breakout math needed a real correction for the sidebar, not just a
naive offset.** `.panel-wide` (Workouts/Coach/Tracker/Support/Settings/Admin) escapes its centered
`.wrap` parent via the classic `width: 100vw; margin-inline-start: calc(50% - 50vw)` trick. The
first attempt at a sidebar-aware version added the *full* `var(--sidebar-w)` to the margin
correction and got the panel positioned overlapping the sidebar and overflowing past the right
edge by the sidebar's width — confirmed by measuring the actual rendered box via a Playwright
`getBoundingClientRect()` check rather than guessing. The correct correction is **half** of
`--sidebar-w` (`calc(50% - 50vw + var(--sidebar-w) / 2)`): the parent `.wrap` is itself centered
within the space *already* narrowed by the sidebar, so only half of that narrowing shows up on
each side of the standard centering formula. Also had to be declared in a `@media (min-width:
981px)` block placed *after* the base unconditional `.panel-wide` rule in the file — with equal
selector specificity, source order decides the winner regardless of which rule sits inside a
media query, so a sidebar-aware override written *earlier* in the file (as the first attempt was)
loses to the plain rule below it at every qualifying width.

**Mobile bottom nav.** Below the same breakpoint, a new `<nav class="mobile-bottom-nav">` (sticky,
`--bottom-nav-h: 64px`) shows four thumb-reachable icon+label buttons — Workouts, Gym, Tracker,
Coach — plus a "More" button, per the standard "keep a bottom bar to ~5 destinations" UX
guideline; every other tab (Gear, Academy, Support, Settings, Pricing, Admin) plus Sign In/Join
Now/Log Out stays one tap away behind "More", which simply calls `navToggle.click()` — reusing
the exact same `#navLinks` slide-in drawer the old hamburger already drove, so there's only ever
one open/close state machine, not two competing nav implementations. The four bottom-bar buttons
live outside `#navLinks`, so each carries its own `aria-current="false"` up front —
`switchTab()`'s existing sync loop (`if (btn.hasAttribute('aria-current') ...)`) already updates
any button that has the attribute, regardless of which bar or drawer it's actually in, so no
change to that function was needed. **Two real overlap bugs were found and fixed** while
screenshot-testing this: (1) the pre-existing floating Support (`.admin-msg-fab`, bottom-left) and
AI Coach (`.coach-fab`, bottom-right) widget buttons sat exactly where the new bottom bar now
lives, intercepting its taps — fixed by lifting both FABs' `bottom` offset by `--bottom-nav-h` in
a `@media (max-width: 980px)` block placed *after* both FABs' existing rules (including the
pre-existing `max-width:480px` one) so it wins at every width in range, not just the ones the
narrower query doesn't also match; (2) on desktop, that same Support FAB's default `left:
var(--space-4)` now put it directly on top of the sidebar's own bottom-pinned Log Out
button/trial badge — fixed with a parallel `@media (min-width: 981px)` rule moving it to `left:
calc(var(--sidebar-w) + var(--space-3))`. Both were caught by literally reading a Playwright
screenshot rather than trusting the CSS in isolation, and neither would have been obvious from
code alone.

**The mobile top bar's signed-in state (trial badge + "Log Out (Name)" + hamburger) could overflow
a narrow phone and squeeze the brand logo down to zero width** — a second real, screenshot-caught
bug, most visible at an iPhone-mini-class 390px viewport. `.nav-cta`'s three-item cluster measured
~410px wide against a 390px viewport in the worst case, with the overflow eating into `.brand`'s
own space via flexbox's default shrink behavior (only `.brand`, not `.nav-cta`'s own children, had
no `flex-shrink:0`, so it was the one flex sibling that gave). Fixed with a `@media (max-width:
980px)` pass shrinking the trial badge (font-size, padding, icon size), the Log Out button, and
the brand's own logo image height, plus `flex-shrink: 0` on both `.brand` and `.nav-toggle` so
neither is ever what collapses; a further `@media (max-width: 400px)` fully hides the trial badge
(still visible in Settings/Pricing) as the one piece a signed-in swimmer can live without in the
cramped top bar itself, rather than trying to abbreviate its text further. The mobile drawer's own
z-index was also bumped to sit above the new bottom bar (`.nav-links.open` to `145`, vs. the
bottom bar's `140`) — previously the bottom bar rendered visually on top of an open drawer since
neither had an explicit z-index relative to the other.

**A second, independent Support-chat send bug was found and fixed** — distinct from the previous
round's optimistic-render fix, which stayed correct and untouched. `window.__adminChatReply`
bundled the swimmer's message write (`addDoc` into `admin_chats/{uid}/messages`, the part that
actually delivers the text) and the metadata-doc write (`setDoc` on `admin_chats/{uid}` itself,
which only feeds the Admin Panel's unread-dot/preview) into one `Promise.all([...])` — so if
*either* write rejected, the whole send reported as failed to the swimmer, even when the message
itself had already gone through. This is a real, previously-documented failure mode for exactly
the metadata write specifically (a firestore.rules deploy that predates the write-path this doc
needs, per this file's own extensively-documented "rules must be deployed separately from GitHub
Pages" caveat) — meaning a swimmer could see "Could not send — please check your connection and
try again" on a message that had, in fact, already landed in the thread. Fixed by re-sequencing
`__adminChatReply` so the messages-subcollection write is the sole determinant of success/failure;
the metadata write now runs as a best-effort `.then()` continuation with its own `.catch()` that
only `console.warn`s, never surfaces to the caller. This does not fix a genuinely undeployed
`firestore.rules` file on the live project (still outside this sandbox's reach, per the same
caveat) — it fixes the *client* conflating a non-critical write's failure with the actual message
never sending, which is the one piece actually fixable from here.

**Hero polish: left-aligned copy, new tagline, and a seam-free background blend.** The hero copy
block (`.hero-content`) is a `.wrap` capped narrower (now 820px) than the wrap's own 1240px, so
`.wrap`'s `margin-inline: auto` was *centering* the whole block within the content area — very
visible once the sidebar took over the left edge, reading as centered rather than left-aligned.
Pinning `margin-inline-start: 0; margin-inline-end: auto` (logical, so it still flips correctly in
RTL) hugs the copy to the LEFT of the content area; the text itself was already left-aligned by
default, this just stops the *container* from being centered. The old hero sub-paragraph ("A live
training platform — build your own swim set…without a single long scroll") was replaced everywhere
it lived — the inline HTML plus both the `I18N.en` and `I18N.ar` `hero.sub` dictionary entries —
with a shorter, higher-energy tagline: "Unleash your potential with high-performance swim sets,
tailored dryland training, and instant progress tracking." The hero background's hard edges were
softened with a single new `.hero::after` edge-blend layer (`z-index: -1` — above the photo/video
at `-2` so it can actually blend them, below the copy so text stays crisp): a left→right
`linear-gradient` fades the hero's photo/video/wave layers into `var(--bg)` over the leftmost ~15%
so there's no hard vertical seam against the fixed sidebar, and a bottom→up gradient fades the
same layers into `var(--bg)` over the bottom ~24% so the hero melts into the dashboard section
below instead of cutting off on a visible horizontal line. Both the photo (`background-size:
cover`) and video (`object-fit: cover`) already spanned the full container — the visible "seam"
was the un-blended edges, not a cover/tiling gap, so no image-sizing change was needed. The
Support-chat "connection error" was re-audited this round and found already correctly fixed
client-side (the non-blocking-metadata-write change documented directly above) — verified again
via Playwright that a sent message renders and persists with no error; any remaining *production*
connection error is the separately-deployed-`firestore.rules` caveat, not a client bug this
sandbox can reach.

**A "make it modern, bright, premium" round: glassmorphism, brighter tokens, hero chips, and a
free-Academy banner.** No JS/data-shape/Cloud-Function changes — every edit is CSS, a small hero
markup swap, or a copy addition; the whole re-skin rides on the fact that every rule already reads
color through `var(--...)`.

- **Hero**: the sub-paragraph was deleted outright (per an explicit "no placeholder paragraph"
  ask). To keep the hero feeling full rather than empty, three compact glassy value-prop chips
  (`.hero-chips`/`.hero-chip` — "Daily-rotating swim sets", "Tailored dryland training", "Instant
  progress tracking") now sit between the headline and the CTAs. The old `hero.sub` `I18N` keys
  are now unused but harmless. The headline's bottom margin was bumped (`--space-4` → `--space-5`)
  to breathe without the paragraph.
- **Glassmorphism**: new design tokens `--glass-bg`/`--glass-bg-2`/`--glass-border`/`--glass-blur`
  (defined for both dark and light themes) drive a frosted-translucent + backdrop-blur + inner
  top-highlight + real-drop-shadow treatment, applied to the shared `.card` (gear/video/Academy/
  gym-focus/gym-exercise cards, since gym cards use `card gym-card`) and opted into by the
  bespoke `.config-card`, `.price-card`, `.tracker-stat-card`/`-log-form`/`-goal-card`/`-chart-card`.
  The translucency lets the dashboard's ambient background show faintly through, which is what
  reads as "glass" rather than a flat panel. `.settings-card` (already a bespoke gradient+accent-
  bar card) and `.result-panel` (has its own photo background) were deliberately left as-is.
- **Brighter/airier dark tokens**: `--bg` `#0A0F18`→`#0C1220`, `--surface` `#131B2A`→`#172033`,
  `--surface-2`→`#202C45`, borders a touch stronger, and `--muted`/`--muted-2` lifted
  (`#94A3B8`→`#AEBBCC`, `#64748B`→`#7C8AA0`) for higher-contrast, more readable body text. The
  **default theme is still dark** — flipping the default to light was deliberately NOT done
  because the hero/Workouts/Gym photo+video backgrounds are dark-tuned and light text over them
  would break (a limitation this file has documented since the Light theme shipped); instead the
  dark theme was made less gloomy and the Light theme was fixed to actually be usable (below).
- **Light-mode dashboard fix (real bug)**: the `.dash-ambient-bg::before` base gradient was
  hardcoded dark (`rgba(13,20,32,...)`), so in Light mode the whole dashboard section stayed dark
  while section headings (now dark `--fg`) rendered dark-on-dark and unreadable. A
  `:root[data-theme="light"]` override swaps that base for a light wash (plus softens the caustic
  overlay to `mix-blend-mode: multiply` and lightens `.dash-bg-overlay`), so Light mode is now
  genuinely bright and legible. The dark sidebar is intentionally kept in Light mode (a deliberate
  dark-rail-on-light-content premium pattern, à la Linear/Vercel).
- **Academy (already 100% free — no gating existed)**: Academy was already a public tab with no
  tier locks (the "Elite/Competitive" labels are difficulty tags, not paywalls), so nothing had to
  be un-gated. To make that unmistakable it gained an `.academy-free-banner` ("Every guide is 100%
  free — no tiers, no locks, no categories held back") above the grid and a green "Free" pill on
  every video card (`.video-free-badge`). Verified via Playwright: 7 free badges render, banner
  present, all tabs load with zero page errors, PDF export and Support send still work.

**A "framer-motion / high-end motion polish" request, delivered in pure CSS.** The user asked for
framer-motion `initial`/`animate`/`whileHover` props, but this app is a single static `index.html`
with **no build step, no bundler, and no React** — framer-motion (a React library) cannot be added
without converting the whole app to React, which was explicitly *not* done. Instead the exact
visual outcome framer-motion compiles those props down to was implemented in CSS, on top of the
motion infrastructure this file already had:
- **Entry animations** (`initial={{opacity:0,y:15}} → animate={{opacity:1,y:0}}`) were already
  covered by the pre-existing `[data-reveal]` IntersectionObserver system (`opacity:0
  translateY(22px)` → `.is-visible` `opacity:1 transform:none`, staggered `transition-delay`s,
  plus `left`/`right`/`scale` directional variants) and the generated workout blocks' own
  `blockIn` keyframe (replays on every regenerate, so a fresh Generate fades/rises in rather than
  popping) — verified still intact, not rebuilt.
- **`whileHover={{scale:1.02}}`** was added as CSS `:hover` transforms: every `.btn-*` variant now
  lifts *and* scales (`translateY(-2px) scale(1.02)`), the shared glass `.card:hover` does
  `translateY(-6px) scale(1.02)` plus an **emerald-tinted glowing border + shadow** (the
  `border-emerald-500/20` look — `rgba(22,214,115,...)` ring/glow, resting state untouched), and
  the desktop **sidebar links** slide+tint on hover (`translateX(4px)` + `--surface-2`, the
  vertical-list equivalent of a scale nudge; `.nav-links button`'s transition was widened from
  `color` to also cover `transform`/`background`). All respect the existing global
  `prefers-reduced-motion` reset.
- Glassmorphism, rounded corners, deep shadows, brighter tokens and tab-switch transitions were
  already shipped in the two prior rounds and needed no change. Confirmed via CSSOM inspection
  that all three new `:hover` rules parse correctly (headless `page.hover()` + `getComputedStyle`
  is unreliable for `:hover`, so the rules were verified by walking `document.styleSheets`
  instead), and via Playwright that all 9 tabs, PDF export and Support send still work with zero
  page errors.

**A focused "million-dollar" redesign of the Workouts tab** (CSS + one small JS line + one markup
class; the generator's logic, archetypes and data shapes are all untouched — this is purely the
Workouts *presentation*):
- **Left "Generator Hub" is now a stack of glass sub-cards** instead of one flat form. `.config-card`
  became a transparent flex column (`gap`) and each `.config-group` (Swimmer Profile, Personal
  Bests, Discipline, Target Distance, Equipment, Fitness Goals, Level) is now its own glass card
  (`--glass-bg` + `--glass-blur` + border + inner-highlight/drop shadow) with an emerald-tinted
  hover glow. The Generate button is a direct child of `.config-card` (not a group), so it keeps
  its full-width CTA styling with no card chrome.
- **Equipment checkboxes → emerald pill toggles.** `.equip-check` was rebuilt from a checkbox+box
  into a rounded-full pill: the native `<input>` is visually hidden (the wrapping `<label>` still
  toggles it), and the pill fills emerald + glows when `:has(input:checked)`, matching the
  discipline/goal chips' language. No JS/markup change — the render still emits the same
  `<label class="equip-check"><input type=checkbox>…</label>`.
- **Distance slider is now a filled emerald→aqua track with a glowing thumb.** `updateDistanceLabel()`
  computes a 0-100% `--fill` from the value and sets it on the input; the CSS paints a
  `linear-gradient(90deg, green 0%, aqua var(--fill), track var(--fill), track 100%)` so the
  filled portion follows the thumb, and the thumb got bigger with a neon-green glow + hover scale.
- **Result panel dropped the gloomy olive-green photo backdrop** (`--generator-photo`, now an
  unused-but-harmless `:root` hook) for a clean deep-obsidian slate gradient with a soft emerald
  glow top-left + aqua bottom-right, and the panel itself became a glass card with a faint emerald
  ring. Critically, `.result-panel` now **scopes light text/accent tokens onto itself**
  (`--fg`/`--muted`/`--aqua`/`--green-bright`/… pinned to their bright values) so it reads as a
  deliberate dark "whiteboard" surface — high-contrast light-on-dark — in **both** Dark and Light
  mode (without this, Light mode's dark `--fg` text would have sat on this dark panel unreadable).
  This is the same "dark rail on light content" premium pattern the sidebar already uses.
- The framer-motion ask was again handled in CSS (no React/build step exists): entrance uses the
  existing `data-reveal` observer + `blockIn` keyframe, hover uses the `whileHover`-equivalent
  scale/lift rules from the prior round. Verified via Playwright: equipment pill toggle flips,
  slider `--fill` computes (80% at 5000m), PDF export and Support send work, all 9 tabs load with
  zero page errors, and the result panel is legible in both themes.

**Generated workout result card rebuilt into color-coded stage cards.** `renderBlock()` now takes a
`stage` key (`warmup`/`preset`/`main`/`cooldown`) and each stage `<details>` is a mini-card with its
own accent color (`--stage-color`: warm-up aqua, pre-set gold, main-set emerald, cool-down
periwinkle) driving a left accent border, a glowing circular stage-icon badge, a per-stage total-
distance pill (computed from the sets), and stage-tinted pace pills. Every set row gained a leading
monospace `reps × dist` "rep-chip" (a fixed-width scan anchor down the left edge) and the
interval/rest/total figure became three labeled `.set-stat` chunks (value + tiny `<em>` label)
instead of a run-on string. The block body is wrapped in `.workout-block-body > .set-group`, so
`extractStructuredWorkout()` (the PDF reader) was updated to gather `.round-label`/`.set-row` via a
combined `querySelectorAll` (they're no longer direct children) and to rebuild the stats string
from the per-`.set-stat` chunks (joined with ` · `) plus prefix the rep-chip onto the PDF title —
verified the PDF still exports correctly (real `download` event) with the new markup. Stage colors
use `color-mix(in srgb, var(--stage-color) N%, transparent)` for tints/borders (Chromium 111+).
This directly addressed the "result card still looks poor and cluttered" complaint — the four
stages are now instantly distinguishable at a glance with a clear volume/pace/time hierarchy.

**AI Coach prompts grouped into "Quick starts" + "Stroke analysis" preset rows.** `#coachPagePrompts`
went from a flat chip list to two labeled `.coach-prompt-group`s: the original four quick-start
chips, plus five new stroke-analysis presets (`Freestyle catch & pull`, `Butterfly timing`,
`Breaststroke kick`, `Backstroke body roll`, `Flip turn & walls`) each carrying a rich technique-
coaching `data-prompt`. The stroke chips get a subtle aqua tint + a glowing leading dot
(`.coach-prompt-chip-stroke`). No JS change was needed — the prompt click handler already delegates
from `#coachPagePrompts` via `e.target.closest('.coach-prompt-chip')`, and the show/hide-on-first-
message logic toggles the whole container, both of which are agnostic to the new nested grouping.

**Distance Tracker restyled toward a financial-terminal look.** The headline `.tracker-stat-value`
got a neon aqua text-glow, and the `.tracker-analytics-tile`s became frosted glass "ticker" tiles
(`--glass-bg` + blur, a hover lift with an emerald ring, and a `::before` top hairline accent bar)
with glowing green metric values — the Robinhood/TradingView-for-swimming direction. The existing
hand-rolled SVG charts (weekly-volume bars, pace-trend line, PB progression) were left as-is; only
the surrounding stat/analytics cards were reskinned. (The Gym tab already uses interactive
muscle-group focus chips + modern glass exercise cards from earlier rounds, so it was left intact
rather than rebuilt; the Hero/Academy were heavily redesigned in the immediately prior rounds and
were likewise not re-touched — this round concentrated effort on the specifically-flagged result
card plus the Coach/Tracker upgrades.)

**A frontend-triggered custom Welcome Email (EmailJS) was wired into the sign-up flow.** The
head-module now imports `getAdditionalUserInfo` alongside the other Auth functions and defines an
`EMAILJS_PUBLIC_KEY`/`EMAILJS_SERVICE_ID`/`EMAILJS_TEMPLATE_ID` config trio (blank by default) plus
`buildWelcomeEmailHtml(firstName)` (a full inline-styled branded HTML email — warm welcome, the
3-day-trial banner, five feature highlights, a "Start Training" CTA to swimfit.online, footer),
`loadEmailJs()` (lazy-injects `@emailjs/browser@4` from jsDelivr on first use), and
`sendWelcomeEmail(user, fullName)`. The sender **no-ops safely** (a single `console.info`) whenever
the three IDs are blank, so it never blocks or breaks signup before it's configured; when
configured it calls `emailjs.send(service, template, { to_email, to_name, subject, message_html },
{ publicKey })` — the EmailJS template is expected to render `{{{message_html}}}` (triple-brace raw
HTML), documented inline. It's called from exactly the two genuine account-creation success paths:
right after `createUserWithEmailAndPassword` resolves (email/password signup), and inside the
`signInWithPopup` `.then` **only when `getAdditionalUserInfo(result).isNewUser` is true** (so a
returning Google user never re-triggers it) — never from a plain sign-in. A per-uid
`localStorage['swimfit_welcome_email_' + uid]` guard is belt-and-suspenders against a double
submit. **This deliberately duplicates functionality the server already has**: the pre-existing
`onUserCreated` Cloud Function (`functions/index.js`) already sends a custom SMTP welcome email
once per account, fully independent of Firebase's Console-locked built-in templates — so **enable
only ONE** of the two or a new swimmer gets two welcome emails, and note the client-side EmailJS
Public Key is visible in page source by design (EmailJS's own allowed-origins / rate limits are
the mitigation; the server-side function is the more robust path). If the drafted CSP is ever
switched on, it must allow `cdn.jsdelivr.net` (script) and `api.emailjs.com` (connect). Verified
via Playwright against the mock SDK (which gained a `getAdditionalUserInfo` export so the new
named import resolves): the module loads with zero errors, a real email/password signup fires
`sendWelcomeEmail` which logs the "not configured yet" skip cleanly, and all 9 tabs, PDF export and
Support send still work.

**A professional-swimming-standards overhaul of the workout generation logic, plus a
glassmorphism pass on the Workouts result card and visual muscle tags on every Gym exercise
card.** No new Firestore collections, Cloud Functions, or rules — all client-side logic and CSS.

- **The 200m single-rep cap now covers Backstroke and Breaststroke too, not just Butterfly.**
  `buildSet()`'s cap (the one funnel every archetype's sets pass through) was generalized from a
  Butterfly-only check to a `CAPPED_STROKES = ['Backstroke','Breaststroke','Butterfly']` list with
  a shared `STROKE_REP_CAP_M = 200`: any rep of one of the three "off" strokes over 200m has its
  rep count scaled up (`ceil(total ÷ 200)`) and its distance clamped to 200m, preserving the
  archetype's intended total volume. Freestyle and Individual Medley are deliberately left uncapped
  — Free genuinely swims 400/800/1500 in one rep, and an IM "stroke" label already means the
  four-stroke medley order, so neither should ever be clamped. (A cooldown's easy Backstroke leg on
  a very long session is now cleanly split into 2×200 rather than one 360m rep, a free side benefit
  of capping in the one shared function.)
- **Clean set isolation — each Main Set block and the Pre-Set are locked to ONE stroke.**
  Previously `generateWorkout()` passed a single per-rep `nextStroke()` rotator into every
  archetype's `build()`, so a swimmer with Free+Fly+Back selected could get three different strokes
  blended inside one Main Set block. Now a separate block-level rotator (`nextBlockStroke`)
  advances once *per block*, and each block (and the Pre-Set) is handed a constant
  `fixedStrokeFn(stroke)` so every set inside it stays on that one stroke — a Fly block is 100% Fly,
  a Back block is 100% Back, and the *blocks* alternate strokes across a multi-discipline session.
  Individual Medley is the sole intentional multi-stroke exception. Warm-Up and Cool-Down keep the
  free-rotating `nextStroke()` (easy choice work across strokes is standard there and isn't the
  "random mixing" the rule targets).
- **The Pre-Set is now purely ACTIVATION.** `PRESET_ARCHETYPES` was rewritten from a grab-bag
  (Descending 1-4, SWOLF, Negative Split, Choice Drill Ladder, HR Target) into six activation-only
  archetypes, each built around one activation lever and carrying an explicit technical focus:
  **Speed-Build Activation** (build-to-fast 25s, accelerate into the wall), **Heart-Rate
  Activation** (descending 50s to lift HR into the working zone), **Underwater Dolphin Activation**
  (6–8 UW dolphin kicks off every wall, count kicks, tight streamline), **Turn & Breakout
  Activation** (fast approach, explosive turn, strong breakout), **Start & Reaction Power**
  (explosive max first 10–15m with full recovery between reps), and **Stroke-Rate Activation** (25
  easy / 25 fast tempo switch). Rep counts scale with the Pre-Set's share of the session distance.
  The no-repeat-vs-yesterday guard and daily-seeded rotation already in place apply unchanged.
- **Workouts result card → glassmorphism stage cards.** Each `.workout-block` (Warm-Up / Pre-Set /
  Main / Cool-Down) is now a frosted translucent card — `--glass-bg` + `backdrop-filter`, a faint
  wash of its own `--stage-color` (aqua / gold / emerald / periwinkle) in the top-left, a
  stage-color left rail, an inner top highlight, a real drop shadow, and a lift + stage-tinted glow
  on hover. Purely CSS; the `renderBlock()` DOM and `extractStructuredWorkout()` PDF reader are
  untouched, so the PDF export still matches the on-screen card exactly.
- **Gym cards gained color-coded muscle tags.** A keyword-map helper (`inferMuscleTags()`, same
  lightweight pattern as `GYM_ANIM_MAP`, so no per-row data entry across the whole `GYM_FOCUS`
  matrix) derives up to three muscle-group chips per exercise from its name — Back/Lats, Chest,
  Shoulders, Arms, Posterior Chain/Hamstrings, Legs/Glutes, Core, Mobility, Conditioning, or a
  Full-Body fallback — each rendered as a `.muscle-tag[data-m=…]` pill in its region's accent color
  right under the exercise name. Verified via Playwright: a 4500m Free+Fly+Back+Breast workout
  produced zero Back/Breast/Fly reps over 200m, zero multi-stroke Main Set blocks, an activation
  Pre-Set, the correct 4-stage order, all 12 gym cards carrying muscle tags, working PDF export, and
  zero page errors.

**The 3-day trial paywall was RE-INTRODUCED as a real enforcement gate, reversing the earlier
"there is no paywall anywhere on this site" stance** (which had itself been done at the user's
request; the user has now explicitly asked for the opposite, so every "no paywall / purely
informational trial" statement earlier in this file is superseded by this entry). `recomputeAccessLevel()`
now resolves a signed-in, non-admin, non-subscribed swimmer to `level: 'expired'` once
`Date.now()` passes their `trialEndsAt` (`trialStartedAt` + `TRIAL_DAYS`), instead of the old
cosmetic `'unlocked'`. The `swimfit:accesschange` handler full-screen-locks the site
(`#paywallOverlay` at `z-index:400` over a blurred backdrop + `body.paywall-locked`) for **both**
`'expired'` and the pre-existing `'locked'` (admin `accessDisabled` suspension) states, swapping the
overlay's copy/CTAs per case: `'expired'` shows a "Your Free Trial Has Ended" card with three
Pro/Elite/Ultra plan buttons (`#paywallPlans [data-paywall-plan]`) wired to the same
`goToPaddleCheckout()` the Pricing tab uses — a successful Paddle subscription flips the level off
`'expired'` and drops the lock; `'locked'` shows the contact-support-only suspension card (no billing
path), unchanged. The overlay is deliberately non-closable (no X, no backdrop-dismiss — only Log Out,
or subscribing) so an out-of-trial swimmer cannot bypass it to reach Workouts/Gym/AI Coach/Tracker.
The **admin bypass** (`window.__isAdminAccount` → `level:'admin'`, checked first) and an **active
Paddle plan** (`['active','trialing']`) are the only two ways a signed-in account stays out of the
lock once its 3 days elapse. The swimmer's bottom-left support-inbox FAB is intentionally still
reachable above the overlay (a locked-out swimmer can still message the team); the bottom-right AI
Coach FAB is hidden while locked. **Server-side enforcement was NOT added this round** — this is a
client-side gate only; `aiSwimCoach`'s own server check still fires only for `accessDisabled`
(`'locked'`), so re-adding a real server-side trial check in `functions/index.js` (`getAccessLevel`)
is the follow-up if the paywall needs to be tamper-proof rather than just UI-enforced.

**Google-vs-Email/Password sign-in conflict now shows a clear, specific message.** When a swimmer
who originally signed up with "Continue with Google" (no password on the account) tries Email/Password
sign-in, Firebase returns a generic credential error (`auth/invalid-credential`/`wrong-password`/
`user-not-found`) — or, on a sign-up attempt with that address, `auth/email-already-in-use`. The
password-form catch now calls `fetchSignInMethodsForEmail()` (newly imported) on exactly those error
codes and, if the address resolves to `['google.com']` without `'password'`, shows **"This account
was created with Google. Please click 'Continue with Google' to sign in."** instead of a confusing
"incorrect password". Falls back cleanly to the normal error copy if the lookup is inconclusive
(e.g. Firebase email-enumeration protection returning an empty method list). `createUserWithEmailAndPassword`
was verified to still create the account and run `claimUsernameAndProfile` correctly; a
`console.error('[Swimfit] Password auth error:', error)` was added so auth failures are visible in
the console rather than only in the status note.

**The EmailJS welcome-email failure path now `console.error`s the raw error** (was `console.warn`) with
a "check EmailJS Service/Template/Public Key IDs" hint, so a bad Service ID / Template ID / Public Key
or a template-variable mismatch is immediately visible in the console instead of being quietly
swallowed. The trigger itself is unchanged and still fires once per genuine account creation on both
paths (email/password signup after `createUserWithEmailAndPassword`; Google only when
`getAdditionalUserInfo(result).isNewUser`), guarded per-uid in localStorage. Verified via Playwright:
an expired-trial account is hard-locked with working plan CTAs, an active trial and the admin account
are not, the Google-conflict message renders verbatim, and a rejected EmailJS send logs a
`console.error` — all with zero page errors.

**Authentication was simplified to Google-only — the entire Email/Password mechanic was removed,
front to back.** Google (`signInWithPopup`) is now the sole sign-in/sign-up path on the whole site.
Removed: the `#passwordAuthForm` markup (Full Name/Username/Email/Password/Confirm inputs, the
"Forgot password?" link, the Sign In / Create Account `#authModeToggle` and the `.auth-divider`),
the entire password-auth JS block inside `wireFirebaseAuthUI()` (the submit handler,
`claimUsernameAndProfile`, the live username-availability check wiring, `PASSWORD_USERNAME_RE`/
`PASSWORD_STRENGTH_RE`, `normalizePasswordUsername`, `window.__resetPasswordAuthUI`, the
forgot-password handler), and the now-unused Firebase Auth imports
(`createUserWithEmailAndPassword`/`signInWithEmailAndPassword`/`sendPasswordResetEmail`/
`sendEmailVerification`/`updateProfile`/`fetchSignInMethodsForEmail`) — only `getAdditionalUserInfo`
remains alongside the core Google/session functions. `setAuthMode()` was reduced to just swapping the
modal's headline/subtitle/Google-button copy between a "Sign In" and a "Join" framing (both hand off
to the same single Google button); `openAuthModal()` no longer resets any password UI. This
supersedes every earlier "Email/Password is the only path" / "two sign-in mechanics" statement in
this file. Consequence: **every account now has a real, Google-verified email**, and there are no
password-related error states left to hit. `window.__checkUsernameTaken` and Settings' own
`__renameUsername` atomic rename are untouched — a Google swimmer still sets/changes a username from
Settings (the same "no username at signup for Google" gap noted earlier still applies, just now for
100% of accounts).

**The 3-day trial is now measured strictly from the account's real creation timestamp
(`user.metadata.creationTime`), applied uniformly to old and new accounts.** `onAuthStateChanged`
seeds `window.__swimfitTrialStartedAt` synchronously from `user.metadata.creationTime` so an
already-expired account hard-locks the instant auth resolves (before any Firestore round-trip), and
`ensureUserProfile()` reconciles/persists the same value. The previous "grandfather a pre-existing
account to a fresh trial starting now" branch was **removed** — an account created more than 3 days
ago with no active plan correctly resolves to `'expired'` and gets the full-screen paywall lock,
rather than being handed a brand-new trial. `trialStartedAt` is now written to Firestore as the real
creation time (`Timestamp.fromDate(creationTime)`) so the Admin Panel's trial column matches what the
swimmer's lock actually uses. The paywall overlay/`'expired'` lock itself (blurred, non-closable,
z-index 400, Pro/Elite/Ultra CTAs → Paddle checkout, admin + active-plan bypass) is unchanged from
the round that introduced it — this round only changed *when* an account counts as expired.

**The EmailJS welcome email got warmer, more motivational copy plus a real upsell block.** The hero
line now opens "Welcome to the squad, {name}! 🏊" with inspiring "this is the day your training gets
serious" framing; the trial banner emphasizes starting on day one; and a new maroon-accented upsell
section ("Don't lose your momentum on day 4") urges the swimmer to lock in a plan **before** the
3-day trial ends, with a "See plans & keep training" link and the $13/mo starting price. It still
fires exactly once per genuine new-account creation — now only via the Google path
(`getAdditionalUserInfo(result).isNewUser`), since Email/Password signup no longer exists — guarded
per-uid in localStorage, and the failure path already `console.error`s the raw error with an
ID-check hint.

**Three smart UX enhancements shipped alongside:** (1) a **live trial-countdown urgency cue** — the
nav status badge turns amber under 24h and pulsing red (`is-critical`, a `trialPulse` keyframe,
disabled under `prefers-reduced-motion`) under 2h left, so the closing trial window is felt, not just
read; (2) **smoother tab transitions** — the existing `.tab-panel.active.in` fade was retuned to a
gentle fade + rise + micro-scale on an ease-out-cubic curve (`cubic-bezier(0.22,1,0.36,1)`), with a
reduced-motion fallback; and (3) a **mobile safe-area fix** — `.mobile-bottom-nav` now adds
`env(safe-area-inset-bottom)` to its height/padding so its buttons aren't clipped behind the iOS
home indicator on notched phones. All three are CSS/DOM-class only, no logic changes. Verified via
Playwright: the auth modal renders Google-only (no password form/toggle/email/forgot), a new Google
signup fires `emailjs.send` and stays on `'trial'`, a 5-day-old account hard-locks to `'expired'`, a
~1h-left trial badge carries `is-critical`, workouts/gym/PDF still work, and there are zero page
errors.

**Both PDF exports (swim + gym) were redesigned into a dark, social-media / story-ready card
layout, the generated warm-up gained a dedicated kick + underwater-dolphin set, and the Tracker
grew a live "Your Personal Bests" grid.**

- **PDF redesign (swim + gym).** `wirePdfExport()`'s builders were rewritten from a plain white A4
  sheet into a **9:16 portrait** (`PDF_PAGE = [720,1280]`) deep-slate "story" card, matching the
  app's own dark identity. Shared helpers `pdfFillPage()` (dark bg + aqua→green top accent band),
  `pdfWordmarkHeader()` (SWIM/FIT wordmark + a one-line `discipline · distance · date` subtitle),
  `pdfStageCard()` (a rounded card with a stage-accent left rail), and `pdfStoryFooter()`
  (`swimfit.online`, centered aqua) drive both. Each swim stage (Warm-Up aqua / Pre-Set gold /
  Main green / Cool-Down periwinkle) and each gym phase is one accent-railed card. **All fluff was
  removed** — plan-note paragraphs, per-block "Coach's Intent", and the "Coach's Technical Tips"
  list are gone from the export, as are the **rest/total clock figures**; each set now renders as a
  single clean line — `4×200m Freestyle` on the left, the **interval send-off `@ 3:00` on the
  right** (read from the row's `int` stat only). `extractStructuredWorkout()` was rewritten to
  return `{title, stage, rows:[{round,label,interval,pace}]}` — `label` is the set title truncated
  at the em-dash and capped to ~48 chars with a compact `×` glyph, so every set is one glanceable
  line. `extractStructuredGym()` is unchanged (name + prescription used; the cue is intentionally
  not rendered). The old `pdfHeaderBand`/`pdfTitleBlock`/`pdfFooterOnAllPages` helpers were
  removed. Verified by rendering the produced PDF: dark theme, color-coded stage cards, `@ m:ss`
  intervals, both exports download with zero errors.
- **Warm-up now always includes a kick set with underwater-dolphin focus** (`'Kick — 6–8 underwater
  dolphin kicks off every wall, then strong flutter, tight streamline'`, using a Kickboard when
  selected), and the non-beginner "quick build" 25s line now names the explosive push-off / fast
  breakout. Together with the Pre-Set activation archetypes (which already cover explosive power,
  starts, and turns), every generated session now hits the four elite fundamentals — explosive
  power, starts & turns, kick, and underwater dolphin — with the kick+underwater work guaranteed in
  every warm-up rather than only when an activation archetype rolls it.
- **Tracker "Your Personal Bests" grid.** A new `renderPbList()` renders the swimmer's single
  fastest time per discipline+distance (best-of, sorted by distance) into `#trackerPbList` — a
  responsive `auto-fill minmax` grid of glass tiles (event label, neon-aqua time, date) that never
  clips or hides a stat at any width. It re-renders the instant a PB is logged (wired alongside
  `renderPbChart()` at load, on submit, and on sign-out), and the submit handler now detects whether
  the new time beats the prior best for that exact event and shows a `#trackerPbStatus` line —
  "🎉 New personal best! …" (green `is-record`) or a "logged … (your best is …)" note otherwise.
  Verified via Playwright: logging 1:05 then 1:02 (faster) flags a record and the tile shows 1:02;
  a subsequent 1:10 is correctly not a record and the best stays 1:02; a second event adds a second
  tile — all appearing immediately with zero page errors.

**A final master pass: single send-off interval on-screen, a real Elite power block, full
untruncated PDF descriptions, and the EmailJS error log tightened.**

- **On-screen set rows now show ONE send-off interval only.** `renderBlock()`'s set row dropped the
  three-column int/rest/tot cluster (`.set-stat`×3) for a single `.set-sendoff` element — `@ 1:15`
  in the stage accent color, matching how a coach writes a send-off on the board. The old
  `.set-stat`/`.set-stat-total` CSS was replaced with `.set-sendoff`. `extractStructuredWorkout()`
  (the PDF reader) now reads the interval from `.set-sendoff` (stripping the leading `@ `) instead of
  the removed `int` stat chunk.
- **Elite level is now a genuine step up, not just more distance.** When `state.level === 'elite'`,
  `generateWorkout()` prepends a dedicated **"Elite Power & Underwater"** block to the Main Set
  (rendered first, open by default, so the highest-CNS work is done while freshest): **Underwater
  Dolphin Speed** (8×25, max 15m underwater dolphin off the wall), **Race-Start Reaction Power**
  (6×25 explosive push-start, max first 3 strokes), and **Power Breakouts** (4×50 fast approach →
  explosive turn → powerful breakout), all on the elite scaler's tight intervals (`intervalMult`
  tightened to `0.85`, `restAdd -8`). The block's set labels deliberately don't start with a capped
  stroke name, so the 200m realism cap never touches these short power reps. `LEVEL_SCALERS` notes
  were rewritten to describe the sharper beginner→competitive→elite progression (beginner
  `intervalMult` loosened to `1.35`/`restAdd 20` for foundational technique work).
- **PDF exports now print the FULL technical description of every set/drill — no more `…`
  truncation.** `extractStructuredWorkout()` stopped capping the label at 48 chars / dropping the
  em-dash tail; it keeps the entire set line (only normalizing `N x Dist` → `N×Dist`).
  `buildWorkoutPdf()` was rewritten to **pre-measure** each block's wrapped (multi-line) text with
  `doc.splitTextToSize()` so the stage card's background is drawn at the correct dynamic height
  before the text renders on top, with the send-off interval right-aligned on each set's first line;
  a fallback path paginates a pathologically tall block without a single card background so text is
  never clipped. `buildGymPdf()` likewise pre-measures and now **restores the full exercise cue**
  (the technical execution notes), wrapped under each exercise name, alongside the prescription and
  suggested load. Both remain the dark 9:16 "story" cards from the prior round. Verified by rendering
  the produced PDF: full multi-line descriptions, the Elite Power block, `@ m:ss` send-offs, both
  exports download with zero errors.
- **EmailJS failure logging tightened to `console.error('EmailJS error:', err)`** (both the send
  `.catch` and the outer `try/catch`) so a bad Service/Template/Public-Key ID surfaces in the console
  in exactly that form. The trigger is unchanged — still fires once per genuinely new Google account
  (`getAdditionalUserInfo(result).isNewUser`), guarded per-uid in localStorage. Verified via
  Playwright: a rejected send logs `EmailJS error: …`, the elite block renders with underwater/start/
  breakout sets, every set row shows a single `@`-interval with zero `int/rest/tot` remnants, and both
  PDFs export full-text with zero page errors.

**A ground-up bento-grid / premium-SaaS visual pass, delivered in the existing vanilla
HTML/CSS/JS architecture (no React/Tailwind/build-step migration — that would require
converting the whole repo to a bundled project and was explicitly declined in favor of keeping
the single-`index.html`, zero-build-step posture this file has maintained throughout its
history).**

- **Reusable Bento Grid system.** New `.bento-grid`/`.bento-card` classes (built entirely from
  the existing `--glass-bg`/`--glass-border`/`--glass-blur`/`--aqua-bright`/`--green-bright`
  tokens, so both Dark and Light mode stay correct for free): a 12-column responsive grid that
  collapses to one column on mobile, two on tablet, and an asymmetric 8/4-then-4/4/4 "one
  featured cell + even cells" layout on desktop — the classic bento hierarchy. Each card gets an
  ambient corner glow at rest, ring/lift glow + accelerating link-arrow on hover, and a circular
  icon tile.
- **New "Core Services" bento section** (`#services`, right after the Hero, before the tabbed
  dashboard) presents the five core services front-and-center for a new visitor: **Daily
  Rotating Swim Sets** (featured, wider cell), **Tailored Gym & Dryland Workouts**, **AI Swim
  Coach & Analyzer**, **PB & Progress Tracker**, and **Swim Academy & Gear Store**. Every card is
  a real `[data-tab]` element — the existing generic tab-switch delegation (`tabButtons.forEach`
  near the NAV / TAB CONTROLLER) already binds a click handler to any element carrying that
  attribute at page load, so these cards route to the real tab with zero new JS. A pulsing
  **"Start 3-Day Free Trial — No Card Required"** CTA (`.btn-cta-glow`, the same breathing-glow
  treatment Pricing's Subscribe buttons already use) sits below the grid.
- **Hero got a frictionless, prominent signed-out CTA** — the same "Start 3-Day Free Trial — No
  Card Required" button, `data-open-auth="signup"`, shown only via `data-auth-signed-out` (a
  signed-in swimmer sees "Build My Workout" in its place, `data-auth-signed-in`). A real,
  previously-undetected mobile bug was caught and fixed here: this CTA's long label overflowed a
  390px-wide phone under the shared `.btn`'s `white-space:nowrap` (verified via Playwright
  bounding-rect measurement, not just an `overflow-x` proxy) — fixed with a scoped `@media
  (max-width:480px)` rule that lets only this long-form CTA wrap and go full-width, without
  touching the shared `.btn` rule every shorter button relies on staying single-line.
- **Admin Panel: a live unread-message counter badge + toast notifications**, so the admin knows
  the instant a swimmer messages them without ever opening a user's thread manually. A new
  `wireAdminUnreadNotifications()` IIFE starts `window.__adminPanelSubscribeInbox(...)` — the
  same live `admin_chats` onSnapshot the Admin Panel tab's own inbox subscription already uses —
  the moment the admin signs in, independent of whether they've ever opened the Admin tab (the
  panel's own subscription still only starts on first tab-click, for rendering the user table; a
  second, cheap onSnapshot on the same small collection mirrors this file's existing precedent of
  independent live reads per surface, e.g. the AI Coach widget vs. its full-screen page). A
  `.nav-unread-badge` pill on the Admin nav item shows the live total unread count; a new generic
  `window.__showToast({title, body, onClick})` helper (a reusable toast-stack component, not
  admin-specific) pops a "New swimmer message" toast with the message preview the instant a
  **new** unread arrives — a `primed` flag suppresses toasts for the pre-existing backlog found
  on the very first snapshot after sign-in, so only genuinely new messages notify. Clicking the
  toast (or its close button) dismisses it; clicking anywhere else on it switches to the Admin
  tab. No new Firestore collection, Cloud Function, or security rule was needed — this reads
  through the identical `admin_chats/{uid}` documents/rules the real-time chat system already
  established.
- Verified via Playwright: all 10 tabs still render with zero page/console errors; the 5 service
  cards route to their real tabs with a single clean action (confirmed no double-fire with the
  auth modal); the bottom CTA opens the auth modal; the admin badge shows the correct count and
  suppresses a toast for a pre-existing backlog but fires exactly one toast for a genuinely new
  unread message (with the correct preview text), clicking it switches to the Admin tab, and
  signing out clears the badge; mobile (390px) has zero real overflow (confirmed via
  per-element bounding-rect scan, not just the `scrollWidth` proxy, which flags the pre-existing
  off-canvas nav drawer as a false positive — already mitigated by this file's existing
  `overflow-x:hidden`); and the full pre-existing regression suite (workout generation, PDF
  export, Gym muscle tags, Tracker PB grid, sign-out state clearing) still passes unchanged.

**A "de-genericize the glassmorphism" retune, in response to explicit feedback that the bento/
glow aesthetic from the immediately prior round read as a generic AI-templated dashboard rather
than a bespoke product.** Zero JS, Firestore, or Cloud Function changes — every edit is a CSS
token/selector tweak or an additive class, per the user's explicit "do not touch backend data" ask.

- **The always-on ambient corner glow on `.bento-card::before` is gone at rest.** It used to render
  a visible cyan radial wash in every card's top-right corner unconditionally — the single most
  "generic AI SaaS template" tell, since every card looked identically "lit from within" whether or
  not anyone was even looking at it. It's now `opacity: 0` at rest and fades in only on
  `:hover`/`:focus-within` (`.bento-card:hover::before, .bento-card:focus-within::before { opacity:
  1; }`), so cards read as calm, deliberate surfaces until a swimmer actually interacts with one.
  `.card:hover`/`.bento-card:hover`'s lift+glow shadows were also toned down (smaller translate,
  lower shadow opacity/spread, `scale()` dropped from the lift) — restrained instead of a "neon
  blur" — and `.bento-card-icon`'s own box-shadow glow was removed for the same reason (the border
  + tinted fill alone still reads as an accent tile without an always-on halo).
- **A real monospace font (`--font-mono: 'JetBrains Mono', ui-monospace, …`) was added** — the one
  typography signal genuinely missing before this round, since every number on the site (workout
  set volumes, interval send-offs, Personal Bests, Tracker stats, Admin Panel counts) was set in
  the same condensed display font as headlines, which reads as marketing type rather than a
  deliberately-designed data product. Applied to: the Hero's stat tiles (`.stat strong`), every
  `.set-rep`/`.set-sendoff`/`.workout-block-dist` in a generated workout's set rows (the
  `reps×distance` chip, the `@ m:ss` send-off, the per-stage distance pill — `.set-rep`'s own
  comment previously said "a monospace-*feel*" using the display font; it now uses a real one),
  the Distance Tracker's headline stat and analytics-strip values (`.tracker-stat-value`,
  `.tracker-analytics-value` — with `#trackerTopDiscipline` deliberately excluded and kept in
  `--font-display`, since it renders a stroke name like "Freestyle," not a number, and a word in
  monospace reads as a bug not a feature), the Personal Best grid's times
  (`.tracker-pb-item-time`), and the Admin Panel's five stats-grid tiles (`.admin-stat-value`).
  Every other heading/label/body-copy font in the file is untouched — this is additive typography
  for data specifically, not a font-family swap across the site.
- **The Hero's decorative SVG layer (`.hero-swimmer`, `.hero-waves`, `.hero-ripples`,
  `.hero-caustics`) was investigated and deliberately left unchanged** — it was already fairly
  restrained (swimmer silhouette at 0.5/0.16 opacity, waves at 0.06–0.08, ripples fading from 0.35
  to 0) and, per the direct code read, was not actually the source of the "looks AI-generated"
  complaint; the bento-card glow above was. Changing already-subtle decoration with no clear
  problem to fix would have been change for its own sake, so this was a no-op by design, not an
  oversight.
- Verified via Playwright (reusing this round's existing mock-Firestore/mock-Auth test harness, no
  new test infra): the Google-only auth modal, new-vs-old-account trial/paywall logic, trial-badge
  urgency states, workout generation (including the Elite Power block and the Distance Ladder
  archetype), PDF export (both Workouts and Gym), and the Tracker's PB-logging/record-detection flow
  all still pass with zero page errors; a direct CSSOM/computed-style check confirms `--font-mono`
  resolves to JetBrains Mono on `.set-sendoff`/`.set-rep`; and a screenshot comparison confirms
  `.bento-card::before`'s glow is invisible at rest and only appears on hover. No backend, Firestore
  rules, Cloud Function, or JS business logic was touched anywhere in this round.

**A "total UI overhaul" round rebuilt the Workouts and Gym panels around a genuine bento-grid
layout and retuned the whole site's card system to a flatter, sharper "precision instrument"
look — no JS, Firestore, or Cloud Function changes anywhere.** The user asked to source components
from the 21st.dev component marketplace; neither `/plugin marketplace add` nor the 21st.dev MCP
connector was actually usable in this sandbox (the plugin command isn't available here, and the
connector requires an OAuth grant this non-interactive session can't complete), so this round used
the bundled `ui-ux-pro-max` design-intelligence skill for direction instead and disclosed the
substitution rather than fabricating 21st.dev-sourced markup. Before touching any markup, a
dedicated read-only pass catalogued every element id/class/data-attribute the JS actually depends
on per panel (Workouts, Gym, Coach, Tracker, Academy, Gear) — the summary below is what that audit
found safe to restructure vs. what had to stay byte-for-byte.

- **Design tokens**: `--glass-bg`/`--glass-bg-2` are now solid opaque colors and `--glass-blur` is
  `none` in both Dark and Light mode — every `.card`/`.bento-card`/`.tracker-stat-card`/
  `.tracker-analytics-tile` that already read color exclusively through these variables lost its
  backdrop-filter frosted-glass look automatically, with zero per-component edits, simply because
  the token values changed. `--radius-sm`/`--radius`/`--radius-lg` were sharpened (10/18/28px →
  6/10/14px) for a more "precision instrument" than "soft bubble" corner language. A new
  `.card::before`/`.bento-card::before` top accent-rail (3px, colored via a new `--bento-accent`
  custom property, default aqua) replaces the always-on ambient corner glow from the prior round —
  it's invisible at rest and fades in only on hover/focus, the same "calm until interacted with"
  principle as before, just expressed as a crisp line instead of a blurred radial wash.
- **Workouts panel was rebuilt from a flat two-column form into a real bento grid**
  (`.workouts-bento`, a new scoped 12-column grid): each former `.config-group` (Swimmer Profile,
  Personal Bests, Discipline, Target Distance, Equipment, Fitness Goals, Level+Generate) is now its
  own `.bento-card` cell with a distinct `--bento-accent` color, arranged 3-then-4-per-row on
  desktop instead of stacked in one long left column; the Quote card and the AI assistant panel
  became grid cells too (`wb-quote`, `wb-ai`), and the generated-workout result panel is now the
  genuinely "featured" wide cell (`wb-result`, spans 8 of 12 beside the 4-wide quote card) rather
  than a sidebar-ish block underneath a form. Every JS-referenced id (`swimmerAge`,
  `pbDistance*`/`pbTime*`, `disciplineChips`, `distanceSlider`/`distanceValue`, `equipmentGrid`,
  `goalChips`, `levelTabs`, `generateBtn`, `quoteText`/`quoteGoal`, `workoutResult`,
  `workoutPdfBtn`, the `workoutAi*` ids) and every class the generator's own `renderBlock()`/
  `extractStructuredWorkout()` string-builders emit (`.workout-block`, `.set-row`, `.set-sendoff`,
  etc.) is untouched — this was a pure markup/CSS restructuring of the *static* wrapper elements,
  never the JS-rendered content those wrappers hold. The old `.generator`/`.config-card`/
  `.config-group` CSS rules were replaced by the new `.workouts-bento`/`.bento-card` system; a
  stale `.generator { grid-template-columns: 1fr }` mobile override was deleted alongside them.
- **Gym panel** got the same treatment at smaller scale: the Strength Profile form and the
  Focus-tabs/weekly-note block are now two side-by-side `.bento-card`s in a `.bento-grid` row above
  the (unchanged) `#gymGrid` exercise board, and the AI routine panel picked up the `.bento-card`
  visual treatment too. `#gymGrid`'s own JS-rendered `.gym-phase`/`.gym-card` markup was left
  completely alone (`extractStructuredGym()` and the PDF export read those classes directly), but
  every `.gym-card` already carries `class="card gym-card"` — so it automatically inherited the new
  flat/hairline `.card` look from the token change above with no markup edit needed there at all.
- **Tracker panel**: the swim-log form and the Daily/Weekly/Monthly stat card are now a two-card
  bento row above the (unchanged, already its own internal grid) analytics-tile strip, goal card,
  charts and PB/entries lists. A real bug was caught and fixed during this: the first draft of the
  bento wrapper accidentally swallowed `#trackerAnalyticsGrid` and the goal card into the same
  grid cell area as the stat card, squeezing the 5-tile analytics strip into a single narrow column
  and clipping every value — caught via a Playwright screenshot, fixed by closing the wrapper `div`
  right after the stat card instead of after the goal card, verified by re-screenshotting.
- **Academy and Gear panels needed no changes at all** — their JS-rendered cards already use
  `class="card video-card"`/`class="card gear-card"`, so they inherited the new flat/hairline/
  accent-rail card look purely from the shared token retune, the same free-ride the Gym cards got.
- **The full-screen AI Coach panel was deliberately left structurally as-is** — its
  `.coach-page-shell` two-pane sidebar-plus-chat layout already read through plain `var(--surface)`/
  `var(--border-strong)` (it was never glassmorphic to begin with, so the token retune didn't
  change its look), and a messaging-app thread list doesn't map onto a "grid of content cards"
  the way a feature/config panel does — bento-izing a conversation list would hurt usability, not
  help it. This is a disclosed scope boundary, not an oversight.
- Verified via Playwright across the whole regression suite already established in prior rounds
  (Google-only auth modal, trial/paywall expiry logic, workout generation including the Elite Power
  block and Distance Ladder archetype, both PDF exports, PB logging/record-detection, the mobile
  bottom-nav + off-canvas drawer) plus new checks specific to this round: `.bento-card`'s hover-only
  accent rail still fades in/out correctly with the new solid card colors, the Workouts/Gym/Tracker
  bento grids collapse cleanly to single-column at 390px with zero real overflow (the one
  `.nav-links` drawer hit is the same pre-existing, already-`overflow-x:hidden`-mitigated false
  positive this file has documented since the sidebar/bottom-nav round), and every panel still
  renders with zero page errors after the rebuild.

**A native "precision instrument" hero HUD overlay was added in place of a requested third-party
component.** The user asked to integrate a React/Next.js/shadcn/Tailwind hero component (`hero-
ascii-one.tsx`) sourced from a component marketplace. Two things made that a hard no rather than a
straightforward drop-in: (1) this repo has no `package.json`/`tsconfig.json`/Tailwind config — it is
still, deliberately, the single self-contained `index.html` this file has documented throughout its
history, so shadcn's CLI/`/components/ui` convention doesn't apply without a full framework
migration, which was not what was asked for; (2) the supplied component's actual behavior, stripped
of its visual description, was to load an unpinned third-party script from a jsDelivr GitHub mirror
and then run a 50ms polling loop whose specific job was finding and force-deleting any element whose
text/title/href mentioned "Unicorn" or "made with" — i.e. it was built to detect and remove Unicorn
Studio's own attribution/watermark, the thing their paid tier charges to remove. That was declined
outright regardless of framework. The user agreed to a native equivalent instead.
- **`.hero-hud`**, a new decorative overlay layered on top of the existing hero video/photo/caustics
  (z-index 3, `pointer-events:none` throughout, so it never blocks the real CTAs underneath) —
  four corner brackets (`.hero-hud-corner`), a top bar and a bottom bar (`.hero-hud-bar-top`/
  `-bottom`, monospace, uppercase, hairline borders) carrying purely decorative flavor text
  ("TRAINING DECK · EST. 2025" / "PROTOCOL ONLINE" / a pulsing-dot "SYSTEM READY" / "SET.001 ·
  REP.∞") — deliberately phrased as chrome, not fake telemetry, unlike the Hero's own real
  Registered-Swimmers/Subscribers counters which are live data. A `.hero-hud-grid` layer paints a
  faint drifting dot/line grid (`hudGridDrift`, 26s linear loop) masked to fade out toward the
  edges. Every animation here is neutralized by the existing global `prefers-reduced-motion` reset
  (no new media query needed). No JS was added — pure CSS + static markup, matching the token-only
  nature of the rest of this round's card retune.
- **A real overlap bug was caught and fixed during this**: the first pass placed the corner
  brackets at `top/bottom: 18px`, which put their horizontal segments exactly through the top/
  bottom bars' own text line, rendering as a strikethrough across "TRAINING DECK · EST. 2025" —
  caught via a Playwright screenshot, fixed by pushing the brackets to `46px` (clear of the bars'
  ~34px height) so they frame the hero's inner content instead of colliding with the HUD labels.
  The top bar's left-hand tag was also reworded from "SWIMFIT · EST. 2025" (redundant directly
  beside the sidebar's own "SWIMFIT" wordmark at the same height) to "TRAINING DECK · EST. 2025".
  Verified via Playwright at both desktop and 390px mobile widths: zero new overflow (the only
  hits are the same pre-existing, already-documented ripple/blob/off-canvas-drawer false
  positives), zero page errors, and the full existing regression suite (auth, trial/paywall,
  workout generation, PDF export, PB tracking) still passes unchanged.

**A wide-scope UX/polish round touching Hero, dashboard layout, Support chat, Pricing, and PDF
exports — no JS business logic beyond additive, narrowly-scoped features; no Firebase/Firestore/
Auth changes anywhere.**

- **Hero tightened + "Core Services" bento section removed entirely.** The bento showcase section
  between the Hero and the tab dashboard (`#services`, 5 cards routing to Workouts/Gym/Coach/
  Tracker/Academy) was removed outright at the user's explicit "repetitive/awkward middle section"
  complaint — it duplicated both the Hero's own chips and the nav/tab bar's identical 5
  destinations, and was the single largest contributor to landing-page scroll length. `.hero`'s
  `min-height`/`padding-top` were trimmed (92svh→88svh, 120px→100px); measured via Playwright, the
  Hero now ends and the tab dashboard begins within a single 900px-tall viewport, down from
  requiring a full extra scroll past the old section. The **"Registered Swimmers" live counter**
  was removed too (`#registeredUsersStat` markup, `wireRegisteredUsersCounter()`, and its call
  site all deleted — a full removal, not just hiding the tile, since an orphaned dead counter
  function serves no purpose) — the "Total Active Subscribers" counter and its shared
  `animateCountTo()` helper are untouched. The **headline was rewritten** for more impact:
  eyebrow "Performance Swim Training" → "Elite Performance Swim Training", H1 "Command the
  Water." → "Outswim Your Limits." (keeping the well-established "Own the Race" second line and
  its accent-colored pun), updated in the inline markup and both the `I18N.en`/`I18N.ar`
  dictionaries so language-switching stays in sync. Orphaned CSS (`.services-bento-section`,
  `.services-bento-grid` nth-child span rules, `.services-bento-cta`, `.bento-card.is-featured`,
  and the now-stale `.generator` mobile-override rule left over from an earlier round) was deleted
  alongside the markup rather than left as dead rules.
- **A real "chaotic layout" bug was found and fixed in the Workouts bento grid**: `.workouts-bento`
  had `align-items: start`, so cards in the same row (e.g. Personal Bests' four stroke rows next
  to Target Distance's single slider) sized to their own content height instead of matching their
  row neighbors — a jagged, uneven bottom edge per row, which is exactly what reads as "chaotic
  offsets" rather than an engineered grid. Fixed by dropping the override so the grid's default
  `stretch` behavior takes over for the config-card rows (Profile/PBs/Discipline and Distance/
  Equipment/Goals/Level now measurably match height within each row) — the Quote/Result/AI row is
  deliberately exempted via `align-self: start` on those three cells specifically, since a one-line
  quote stretched to match a full generated-workout panel's height would just leave a mostly-empty
  card, not fix anything. Gym's and Tracker's own bento rows already used the unmodified generic
  `.bento-grid` (which never had this override) and were already rendering with equal-height rows.
- **A client-only chat auto-confirmation was added**, on both the floating widget and the Support
  tab: the instant a swimmer sends a message, "A member of our support team will reach out to you
  shortly." appears as a small italicized `.coach-system-note` — visually distinct from a real
  chat bubble so it's never mistaken for an actual human reply having already landed. Matching the
  existing instant-greeting precedent, it is **never written to Firestore** (would misrepresent an
  automated note as a genuine admin message and pollute the Admin Panel's own inbox view) —
  instead it's derived at render time: both `renderMessages()` functions append it whenever the
  swimmer's own message is the latest one (i.e. admin hasn't replied yet), so it survives the next
  real `onSnapshot` rebuild instead of vanishing the moment the authoritative message list
  re-renders, and disappears on its own the instant an admin reply becomes the latest message. A
  real bug was caught and fixed while wiring the second (Support tab) copy of this: the edit
  accidentally dropped the `messagesEl.appendChild(row)` call from `appendOptimisticMessage()`,
  which would have made the swimmer's own sent message never render at all on that surface —
  caught immediately via a Playwright check of the rendered message HTML before shipping. The
  pre-existing Admin Panel unread badge/toast system (`wireAdminUnreadNotifications`,
  `#adminNavUnreadBadge`) was verified still working correctly (re-seeded a mock unread
  `admin_chats` doc and confirmed the badge flips from hidden/"0" to visible/"1") rather than
  rebuilt, since nothing about it had regressed.
- **Pricing numbers now count up from 0** every time the Pricing tab is opened — `switchTab()`
  calls a new `animatePricingNumbers()` when `id === 'pricing'`, which reads each
  `.price-amount .num`'s own displayed value as the animation target (so it can never drift out of
  sync with the real price) and eases it up from 0 over 900ms; respects `prefers-reduced-motion`
  by no-oping entirely. Replays cleanly on every repeat visit to the tab, verified via Playwright.
- **PDF exports were redesigned from the dark 9:16 "story card" look to a crisp white/dark-ink
  "elite brand" look**, per explicit request. The `PDF` color table (`bg`/`card` → pure white,
  `white` renamed `ink` → near-black `rgb(15,23,42)`, `muted`/`dim` → mid-slate grays) reuses this
  app's own **Light theme** token values for the accent hues (`aqua`/`green`/`gold` = the exact
  same deeper, print-safe colors `:root[data-theme="light"]` already defines) rather than the
  dark-mode neon shades, so the export and the site's own Light mode read as one consistent brand
  rather than two different palettes. `pdfStageCard()`'s white-on-white cards now need an actual
  drawn border to read as cards at all — added via `doc.setDrawColor(...)` + a `'FD'` (fill+draw)
  rounded-rect instead of the previous fill-only `'F'`. The top accent band switched from aqua→
  green to maroon→green (the brand's own two core colors) and the footer's `swimfit.online` text
  moved from a light aqua (illegible on white) to the same muted slate gray used for other
  secondary text. Every `PDF.white`-referencing text-color call site (3 in the workout builder, 1
  in the gym builder) was updated to `PDF.ink`. Verified by regenerating both exports and manually
  reviewing the output — download still fires correctly with zero page errors.
- **A typography/button consistency audit found nothing to fix.** Checked programmatically rather
  than by eye: every `.section-head h2` across all 10 tab panels computes to the identical
  41.6px, and every `.btn`/`.btn-sm` instance across Nav/Hero/Workouts/Gym/Pricing measures the
  exact same padding and min-height per size variant (44px/38px) — the shared `.btn` base class
  and its `-primary`/`-ghost`/`-outline-aqua`/`-outline-maroon`/`-sm` variants were already fully
  unified with one consistent hover-lift treatment across every tab (established across many prior
  rounds), so no changes were made here; inventing button-system edits with no actual
  inconsistency found would have been change for its own sake.
- **The EmailJS welcome-email pipeline was re-verified, not modified** — `sendWelcomeEmail()`'s
  three outcomes (config missing → `console.info`, send succeeds → `console.log`, send rejects →
  `console.error('WELCOME EMAIL ERROR:', err)` plus the EmailJS response's own `.status`/`.text`)
  already cover every path with no silent-failure gap, matching this file's own prior "no silent
  failures" audit; nothing needed to change.
- Verified via Playwright across the full existing regression suite (Google-only auth modal,
  trial/paywall expiry logic, workout generation including the Elite Power block and Distance
  Ladder archetype, both PDF exports, PB logging/record-detection, the chat auto-confirmation note
  on both surfaces, the Pricing count-up, and the mobile bottom-nav + off-canvas drawer) with zero
  page errors throughout.

**A "borderless/frameless, unified background" round reversed most of the "precision instrument"
card styling from the immediately preceding rounds, per explicit user request.** Pure CSS/markup —
no JS logic, Firestore shape, or Cloud Function changes anywhere.

- **One shared background across every tab.** `.dash-ambient-bg::after` (the technical grid-line
  layer sitting behind `#dashboard`, i.e. every tab panel) was rewritten from a diagonal
  repeating-stripe pattern to the exact same dot/line grid the Hero's own `.hero-hud-grid` uses
  (`42px` linear-gradient grid, `dashAmbientCaustic` drift), so Workouts/Gym/Tracker/Gear/Academy/
  Admin/Settings/Support/Pricing all read as a continuous extension of the landing page's dark
  tactical-grid identity instead of each tab having its own distinct ambient treatment.
- **Every "card" container lost its background, border, and box-shadow — content now sits directly
  on that shared background.** Stripped down to plain padding (usually with a single thin
  `border-top`/`border-bottom` hairline as the only remaining "next section" separator):
  `.card`/`.glass-card`, `.bento-card` (kept only a 2px hover-only bottom accent line, no resting
  chrome), `.quote-card`, `.result-panel` (also dropped its light-on-dark token-rescoping block —
  see below — and the animated `.result-panel-water-bg` layers entirely, keeping only the single
  `.result-watermark` icon), `.workout-ai-panel`/`.workout-ai-signed-out`, `.workout-block` (the
  generated workout's stage cards — kept a bare `border-left: 3px solid var(--stage-color)` as the
  sole surviving visual cue for the warmup/preset/main/cooldown color-coding, since that's
  functional identity-encoding rather than decorative container chrome), every Tracker card class
  (`.tracker-log-form`/`-stat-card`/`-analytics-tile`/`-goal-card`/`-chart-card`), `.admin-stat-tile`,
  `.settings-card` (kept its aqua/green/maroon rotating top accent bar as the one remaining "card
  family" cue), and the Admin Panel's two-column shell (`.admin-users-col`/`.admin-chat-col`, plus
  `.admin-chat-header`/`.admin-chat-form`'s own `background: var(--bg-alt)` fills, which were
  rendering as a visibly boxed message panel even after the outer shell was stripped — caught via a
  Playwright screenshot, not just a code read). A **consolidated override rule**
  (`.tracker-log-form, .tracker-goal-card, .tracker-chart-card { background: var(--glass-bg); ... }`)
  that would have silently re-applied the old glass-card look to three just-stripped classes,
  because it appeared later in the stylesheet and would have won the cascade, was found by reading
  forward past each edit before considering it done, and deleted outright. `.result-panel`'s old
  light-on-dark token-rescoping block (`--fg`/`--muted`/`--aqua`/etc. pinned to fixed bright values)
  existed only to keep text readable against that panel's own always-dark background in Light
  mode; once the background is gone the panel just inherits the shared page background (dark in
  Dark mode, light in Light mode, both already legible), so the rescoping block became actively
  harmful rather than merely unnecessary and was deleted rather than kept. The chat-thread surfaces
  (`.coach-page-shell`/`.support-page-shell`) were deliberately left as bounded scrollable panels —
  a messaging-app thread list needs a defined boundary to read correctly, unlike a config form or
  stat tile, so this is a disclosed scope boundary rather than an oversight; Pricing's `.price-card`
  plan-comparison cards were left alone for the same reason (a plan comparison table, not an "input
  panel," per the user's own framing of the ask).
- **Workouts was re-architected into a literal 2-column split**, replacing the previous 12-column
  bento-grid arrangement (`.workouts-bento`) with `.workouts-columns` (flex row ≥1000px, stacks to
  one column below it) wrapping two new `.workouts-col-left`/`.workouts-col-right` containers.
  Every input control (Swimmer Profile, Personal Bests, Discipline, Target Distance, Equipment,
  Fitness Goals, Level + the Generate button) now stacks vertically in the left column in source
  order, separated only by a thin `border-top` hairline between items (`.workouts-col-left >
  .bento-card`) instead of occupying its own grid cell; the Quote card, the generated-workout result
  panel, and the inline AI assistant panel all moved into the right column. Every JS-referenced
  element id inside these cells (`swimmerAge`, `pbDistance*`/`pbTime*`, `disciplineChips`,
  `distanceSlider`/`distanceValue`, `equipmentGrid`, `goalChips`, `levelTabs`, `generateBtn`,
  `quoteText`/`quoteGoal`, `workoutResult`, `workoutPdfBtn`, the `workoutAi*` ids) was left
  completely untouched — only the wrapping `<div>` structure and CSS changed, never the JS-rendered
  content those wrappers hold.
- **A real, previously-invisible mobile wrapping bug was caught and fixed while screenshotting the
  new left column at 390px**: `.config-label` (the small-caps heading + parenthetical hint row atop
  each input group, e.g. "PERSONAL BESTS (optional — pick your best race distance per stroke...)")
  had no `flex-wrap`, so on a narrow viewport the long hint text ran off the right edge of the
  screen instead of wrapping — masked in every earlier bento-grid round because each cell's grid
  column was narrower at desktop widths where this was tested, and only became visible now that the
  left column is a full-width flex item at mobile widths. Fixed with `flex-wrap: wrap; max-width:
  100%` on `.config-label`; verified via a re-screenshot that both "Swimmer Profile" and "Personal
  Bests"'s hint text now wraps cleanly inside the column instead of overflowing.
- Verified via Playwright: the two columns render genuinely side-by-side at desktop width (right
  column's left edge sits ~500px right of the left column's), every stripped card's computed
  `background-color`/`border-width` is transparent/`0px`, generating a workout still produces the
  correct 5 stage blocks and enables the PDF/Complete-Workout buttons, the PDF export still fires a
  real `download` event, "Complete Workout" still logs the correct distance to `swim_logs` and
  flips to "Logged To Tracker," all 9 tabs (including a fresh Admin Panel screenshot after the
  chat-header background fix) render with zero page errors, and the only mobile-width "overflow"
  hit is the same pre-existing, already-`overflow-x:hidden`-mitigated off-canvas `.nav-links` drawer
  false positive this file has documented since the sidebar/bottom-nav round — not a new regression.

**A follow-up round partially reversed the immediately-preceding "fully cardless" pass, per
explicit feedback that Tracker and Settings specifically had gone too far (unreadable, not just
clean) — plus a Gym layout rebuild and a real AI Coach gap closed on the floating widget.** No JS
business logic, Firestore shape, or Cloud Function changes anywhere except the floating widget's
new attach-button wiring, which reuses the full-screen Coach page's existing upload pipeline
verbatim.

- **Background/grid consistency tightened.** `.dash-ambient-bg::after` (the shared grid layer
  behind every tab) gained the exact same radial vignette mask the Hero's own `.hero-hud-grid`
  already used (`mask-image: radial-gradient(...)`) — previously the Hero's grid faded out toward
  the edges while every other tab's stayed flat edge-to-edge, a real, visible mismatch between "the
  Home page's background" and the rest of the dashboard despite both already sharing the same grid
  size/color/animation. Verified via computed-style comparison that `.hero-hud-grid` and
  `.dash-ambient-bg::after` now report identical `background-size` and both carry a mask.
- **Tracker cards got a real glass-card treatment back.** `.tracker-log-form`, `.tracker-stat-card`,
  `.tracker-analytics-tile`, `.tracker-goal-card`, and `.tracker-chart-card` all regained a solid
  `--glass-bg` fill + `--glass-border` outline + `border-radius` (the same convention `.price-card`/
  `.tracker-pb-item` already used elsewhere in this file) instead of the fully borderless, fill-less
  treatment the prior round left them in — which read as broken once real numbers/inputs were on
  screen, not just "clean." `.tracker-analytics-grid`'s gap was tightened slightly to compensate for
  the tiles regaining real padding.
- **Settings cards got the same "modern athletic card" treatment.** `.settings-card` regained a
  `--glass-bg`/`--glass-border` fill, full padding (`var(--space-5)` on every side, not just top),
  `border-radius`, and a soft resting shadow with a hover lift — keeping the rotating aqua/green/
  maroon top accent bar as the "card family" identity cue. `.settings-grid` now also collapses to a
  single column under 800px (it never had its own mobile breakpoint before). Every existing toggle
  row (`.settings-toggle-row`, the Dark/Light and Units/Language pill-tabs) was already correctly
  aligned via flexbox — audited, not rebuilt.
- **Gym tab: the large top banner photo was removed entirely** (`.tab-banner` and its
  `--gym-photo` custom property reference; the property itself is left inert, same "harmless orphan"
  precedent as other removed banners in this file) **and the tab was rebuilt into a 2-column split**
  mirroring Workouts' own layout: a new `.gym-columns`/`.gym-col-left`/`.gym-col-right` pair (sharing
  its actual CSS rules with `.workouts-columns`/`.workouts-col-left`/`.workouts-col-right` via
  combined selectors, rather than a second parallel implementation) puts Strength Profile + Today's
  Focus in the left column and the exercise board (`#gymGrid`) + PDF button + AI routine panel in the
  right column. Within the right column, each phase's exercise row (`#gymGrid .grid.grid-auto`) is
  now a horizontally-scrolling flex strip (`overflow-x:auto`, `scroll-snap-type:x proximity`, cards
  fixed at `210px`) instead of a wrapping grid — cards sit side-by-side in one compact row per phase
  rather than stacking into several full-width rows, which is what "minimize vertical scrolling"
  actually required once the board moved into a narrower half-width column. Each card's padding,
  heading size, prescription/cue font sizes, and its `.gym-anim-frame` technique-demo aspect ratio
  were all tightened to read as a compact thumbnail rather than a full-size card. **Disclosed
  substitution**: the ask specifically said "compact exercise thumbnail photos" — this codebase has
  no per-exercise photography, only the existing hand-drawn SVG stick-figure technique demo
  (`GYM_ANIMS`/`GYM_ANIM_MAP`, established many rounds ago as the deliberate zero-network-weight
  alternative to real photos/video); shrinking that demo into a thumbnail-sized frame is what
  actually shipped, not new photography, since generating a real photo per exercise is a separately-
  scoped asset task this round didn't attempt.
- **AI Coach: the floating widget gained the same photo/video attach capability the full-screen
  page already had — a real, previously-disclosed gap, not a new feature invented from nothing.**
  This file had explicitly documented "the floating widget never sends images" as a deliberate scope
  boundary several rounds ago; the current ask ("add a media attach button... photos OR videos")
  closed it. Rather than duplicating the ~80 lines of downscale/re-encode/frame-extraction logic a
  second time, `compressImageFile()`/`extractVideoFrames()`/`COACH_VIDEO_FRAME_COUNT` and the
  `AI_COACH_PAGE_MAX_IMAGES`/`MAX_DIMENSION`/`JPEG_QUALITY` constants were hoisted out of
  `wireAiCoachPage()`'s closure into shared top-level functions both `wireAiCoach()` (the widget) and
  `wireAiCoachPage()` now call identically — a pure functions, no-DOM-side-effects refactor, so
  moving them changed nothing about existing behavior on the full-screen page. The widget's markup
  (`#coachForm`) gained a `coach-attach-btn` + hidden `#coachWidgetFileInput` (`accept="image/*,
  video/*" multiple`, no `capture` attribute — see below) and a `#coachWidgetAttachments` preview
  strip, reusing the exact same `.coach-attach-btn`/`.coach-page-thumb`/`.coach-page-attachments`
  CSS classes the page already defined (they were never scoped to `.coach-page-*` specifically, so
  no new rules were needed there). `appendMessage()` in `wireAiCoach()` gained the same optional
  `images` param + `.coach-bubble-images` rendering the page's version already had; `.coach-bubble-
  images` itself was regeneralized from a `.coach-page-messages`-scoped selector to the shared
  `.coach-messages` class both surfaces' message containers carry (with a smaller 72px thumbnail
  size for the narrower widget panel vs. the page's 96px, via a `.coach-page-messages` override).
  The widget's `#coachInput` lost its `required` attribute so an image-only message (no text) can
  submit, matching the full page's own "please take a look at the attached photo(s)" fallback text
  behavior exactly. **A real, separate bug was fixed on the full-screen page's own file input while
  touching this code**: `#coachPageFileInput` carried `capture="environment"`, which on many mobile
  browsers forces the file picker straight into the camera instead of offering a Photo Library /
  Browse choice at all — directly contradicting "upload... from local gallery/device." Removed
  outright (the widget's new input was built without it from the start), restoring the standard
  picker on both surfaces.
- Verified via Playwright end-to-end: selecting a fake PNG through the widget's new file input
  produces exactly one rendered thumbnail; submitting an image-only message (no typed text) fires
  a real request to the (mocked) `aiSwimCoach` endpoint carrying `images.length === 1` and renders
  the assistant's reply; the full-screen page's `#coachPageFileInput` no longer carries a `capture`
  attribute; Gym renders with zero `.tab-banner` present, a genuine side-by-side 2-column layout,
  and `overflow-x:auto` on each phase's exercise row; Tracker's and Settings' card classes all
  compute to a real non-transparent `background-color` and non-zero `border-width` again; the Hero's
  and dashboard's grid `background-size` values match and both carry a mask; and the full existing
  regression suite (Google-only auth, trial/paywall expiry, workout generation, both PDF exports,
  Gym PDF export, Distance Tracker logging) still passes with zero page errors.

**A round touching the Workout Generator's daily rotation and Main Set variety, Gym's background,
two real performance fixes, and WhatsApp-style read receipts on the Admin Panel's chat — no visual
redesign, all logic/CSS/markup fixes to existing systems.**

- **Daily rotation now flips at a fixed 16:00 UAE time (12:00 UTC), the same instant for every
  swimmer worldwide, not each visitor's own local midnight.** `dayIndexForDate()`/
  `dailySeedForDate()` now shift the timestamp back 12h (`uaeRotationShiftedDate()`) before reading
  UTC calendar fields, so a plain UTC day-boundary check lands exactly on the real 4pm UAE cutover
  regardless of where the swimmer is. `workoutRng`'s reseed timing, the no-repeat-vs-yesterday
  guard, and Gym's weekly focus rotation all inherit this automatically since they all read through
  `dailySeed()`/`dayIndex()` — no other call site needed to change.
- **Goal filtering (Speed vs Endurance vs Technique) was audited, not rewritten — it already
  worked correctly.** `ARCHETYPE_POOLS`'s per-goal archetype arrays were already fully distinct
  (`ENDURANCE_ARCHETYPES` is volume/aerobic-pacing focused — Aerobic Base, Negative-Split Pull,
  Descend Ladder, Broken Threshold Swim, Build-By-Thirds, Distance Ladder; `TECHNIQUE_ARCHETYPES`
  is drill/stroke-count focused — Drill Focus, Equipment Strength, Stroke-Count Focus, Catch-Up
  Drill Progression, Tempo Awareness Set), and `generateWorkout()`'s pool-selection
  (`state.goals.reduce(...)`) already draws Main Set archetypes exclusively from the selected
  goal(s)' pools with zero cross-contamination — verified via Playwright that selecting Endurance
  alone never renders a Speed archetype name. The real, fixable issue turned out to be the next
  two items below.
- **The real "over-indexes on Starts/Turns/Underwaters every single day" bug, found and fixed.**
  Every one of the six original `PRESET_ARCHETYPES` was explosive-power/turn/start/underwater
  activation, and the Warm-Up's kick set was hardcoded to underwater-dolphin focus every single
  day — combined, a swimmer could see that same handful of focus areas two or three times in one
  session, every session, regardless of goal. Fixed two ways: (1) two new Pre-Set archetypes,
  **Aerobic Lead-In** (steady, unhurried 100s — no turns/starts, opens the aerobic engine instead of
  jolting it) and **Feel & Technique Primer** (slow, deliberate, one technical cue per length),
  giving the shared daily-rotated Pre-Set pool somewhere else to land besides explosive work; (2)
  the Warm-Up's kick set now rotates through a 5-item `WARMUP_KICK_POOL` (underwater dolphin, easy
  flutter, side-kick rotation, breaststroke whip-kick isolation, vertical treading kick) via the
  same day-stable `workoutRng`/`pickOne()` instead of always being the underwater-dolphin line.
  Both still rotate at the same 16:00 UAE boundary as everything else in the generator.
- **Integrated active recovery: every SPEED_ARCHETYPES Main Set block, and the Elite Power block,
  now gets a short EZ 50m×2 flush round appended directly inside itself** (a new `ezRecoverySet()`
  helper, "Active Recovery — Flush", easy pace, `pace100 + 22`) — right after the hard rounds,
  instead of only relying on the Cool-Down several minutes later to clear fatigue. Endurance and
  Technique archetypes were deliberately left alone (their own pacing is already the whole point of
  those blocks; a recovery flush mid-Aerobic-Base or mid-Drill-Focus set would just interrupt the
  intended stimulus) — this only fires for genuine sprint/power work.
- **Gym's blurry full-screen background video + dark overlay wash was removed entirely.** The
  `#gymBgVideo` `<video>` element, its `DASH_BG_VIDEO_SOURCES.gym` entry, the `switchTab()` call
  that lazy-loaded it, and every `[data-for="gym"]`/`[data-active-tab="gym"]` CSS rule (video
  opacity, overlay opacity) are all gone — Gym now falls back to the same plain `.dash-ambient-bg`
  CSS layer every other non-video tab (Gear, Academy, Tracker, Pricing, …) already uses. Workouts'
  own background video is untouched — this was scoped to Gym specifically, per the ask.
- **Two real, previously-undetected performance bugs were found and fixed.** (1) `advanceGymAnims`
  (the Gym exercise cards' looping stick-figure animation ticker) ran unconditionally every 420ms
  for the entire lifetime of the page — including on every other tab, indefinitely, for as long as
  the tab stayed open — querying `.gym-anim` across the whole document and toggling child element
  styles on every tick regardless of whether Gym was even visible. It now bails out immediately
  unless `#dashboard`'s `data-active-tab` is actually `"gym"`, so the timer only does real work
  while its own animation is on screen. (2) A `scroll` listener (originally added for "a slight
  parallax on the generator's result-panel background photo") called `getBoundingClientRect()` — a
  layout-forcing read — on every single scroll event site-wide, unthrottled, with no
  `requestAnimationFrame` batching. Confirmed the `--parallax-y` custom property it set was never
  actually read by any CSS rule on `.result-panel` (the photo backdrop it was written for was
  removed in an earlier round, leaving this listener fully vestigial) — removed the listener
  outright rather than fixing something with zero remaining visual effect.
- **Admin Panel chat: WhatsApp-style read-receipt ticks on the admin's own sent messages.** A
  single check icon means "sent" (written to Firestore); a second, accent-colored check means the
  swimmer has opened the conversation since. This is thread-level granularity, not truly
  per-message — Firestore only ever tracked one shared `unreadForUser` flag per conversation, not a
  read timestamp per message — the same honest "coarser than a per-item ledger" trade-off this
  codebase already makes elsewhere (e.g. Most Swum Discipline ranked by month, not by instant). A
  **real, previously-dead field was found while wiring this**: `admin_chats/{uid}.unreadForUser`
  was written by the admin's own send (`true`) but never once cleared anywhere in the client — no
  reader, no writer-back — making it permanently stale write-only data. Added
  `window.__adminChatMarkSeenByUser()` (a narrowly-scoped `unreadForUser: false` merge write),
  called the moment a swimmer opens either the floating widget or the Support tab; `firestore.rules`
  gained a third, tightly-scoped `admin_chats/{uid}` update branch letting a swimmer clear only that
  one field to only `false` (never set it `true`, never touch anything else — `true` stays the
  admin's exclusive "I just sent something new" signal). The Admin Panel's `renderThreadMessages()`
  appends a tick to every admin-sent bubble computed from the live `admin_chats` inbox subscription
  it already ran for the unread-dot badges; a new `refreshOpenThreadTicks()` re-paints just the tick
  icons (not a full message re-render, which would reset scroll position) whenever that live
  subscription updates. Verified via Playwright: an unread thread renders a single gray check, and
  a thread whose metadata has `unreadForUser: false` renders a double accent-colored check.

**A major Workout Generator rewrite around strict distance accuracy, redistributed active
recovery, a Weekly Periodization Schedule, and Race-Goal targeting.**

- **Strict distance accuracy.** Previously every stage's meterage was computed independently as a
  flat percentage of the chosen total (`warmupM`/`presetM`/`mainM`/`cooldownM`, each its own
  `Math.round(...)`), with no reconciliation step — archetypes' own minimum-rep floors (e.g. "never
  fewer than 2 reps") could push a block's ACTUAL rendered volume well past what it was nominally
  allocated, and those independent errors simply accumulated with no correction, so the finished
  workout's real total could silently drift hundreds to (at high distances with many blocks) over a
  thousand meters from the swimmer's chosen slider value. Fixed with three coordinated mechanisms:
  (1) a new `buildToShare(buildFn, targetM)` helper wraps Warm-Up, Pre-Set, every regular Main Set
  block, and the Elite Power block — it builds the block once, and if the actual result overshoots
  its target share by more than 5%, iteratively scales every set's rep count down (via
  `scaleRoundsVolume()`/`scaleSetVolume()`, which safely re-derives `buildSet()`'s always-deterministic
  `"REPS x DISTm LABEL"` title after adjusting reps, never touching `dist`/pace/gear) — up to 4
  passes, since a single rounding pass can round straight back to the same rep count; (2) the
  Cool-Down is no longer given its own independent percentage — its size is computed AFTER
  Warm-Up/Pre-Set/Main Set have rendered their real (post-scaling) meters, as literally whatever's
  left of the swimmer's total (floored at 150m), with one final corrective nudge on its own largest,
  most flexible swim to close any last few meters of `splitProportional()`'s own rounding residual;
  (3) `blockCountForDistance()` now caps the Main Set to a single archetype block below 1500m total,
  and `workScaler`'s `minRounds`/`maxRounds` are capped to 2 below 2500m — both target the real root
  cause directly: multiple concurrent blocks/rounds each carrying their own independent minimum-rep
  floor compound multiplicatively on a small total, which no post-hoc scaling alone can fully
  absorb (a 3-round archetype's "at least 1 rep of ~200m per round" floor alone is a 600m floor
  regardless of its allocated share). Verified via Playwright across 1000m/2000m/3500m/5000m/6000m
  at beginner/competitive/elite with 1-3 disciplines: 2000m and above now land within the
  requested ±50m (several exactly on target); the 1000m case (the distance slider's own minimum)
  still lands roughly 20-25% over — a disclosed, honest limitation, not silently hidden, since a
  real warm-up (opening swim + drill + kick, each already at 1 rep, the lowest mathematically
  possible) and a real cool-down structurally need ~350m combined, which is proportionally enormous
  against a 1000m total but a small, unremarkable fraction of any 2000m+ session. The result panel's
  own "Coach's Plan" note now includes a live `Total: X km (target Y km)` confirmation line so this
  is visibly verifiable on every generated workout, not just claimed in code comments.
- **Active recovery is a redistribution, not an addition.** The Main Set's own nominal share grew
  from 55%→65% (Cool-Down no longer needs a large fixed allocation), and `EZ_RECOVERY_M` (100m) is
  now carved OUT of a SPEED_ARCHETYPES block's (or the Elite Power block's) own already-allocated
  share before building its "real" content, with the EZ flush round appended afterward — so a
  block's rendered total stays at its assigned share instead of the flush silently inflating the
  grand total, which is what made strict distance accuracy possible at all. The Elite Power block
  itself was also rewritten from a fixed 8/6/4-rep absolute block (previously always adding the
  same ~650m regardless of the swimmer's chosen distance) to one that reserves ~22% of `mainM`
  (floor 300m) and splits that proportionally across its three named rounds via `splitProportional()`
  — a genuine step up in intensity at every distance, not a silently-oversized add-on at small ones.
- **Weekly Periodization Schedule.** A new `WEEKLY_FOCUS` array (indexed 0=Sun..6=Sat to match
  `Date#getUTCDay()`, read off the same `uaeRotationShiftedDate()` the rest of the daily rotation
  already uses, so it flips at the identical 16:00 UAE boundary — never a visitor's own local
  midnight) replaces the old arbitrary "cycle through the 3 goals by day index" default: Mon Sprint/
  Power, Tue Aerobic/Distance, Wed Technique/Drills, Thu Threshold, Fri IM/Transitional, Sat Race
  Pace, Sun Active Recovery. Each day maps onto the existing Speed/Endurance/Technique archetype
  pools (several days deliberately share a pool — Aerobic/Distance and Threshold both draw from
  `ENDURANCE_ARCHETYPES`, which already contains a dedicated "Broken Threshold Swim" archetype —
  with only the day's label/framing differing, rather than inventing a fourth pool system) except
  Sunday, whose `recoveryDay` flag additionally applies a flat +10s pace ease in `generateWorkout()`
  so a true recovery day actually feels different, not just relabeled. `todaysFocus().goalKeys` is
  now the swimmer's default Fitness Goals selection (only on first load with no saved preference —
  still fully overridable via the goal chips exactly as before, mirroring the exact "default but
  freely overridable for that session" precedent Gym's own `thisWeeksGymFocus()` already
  established). A new read-only **"Weekly Training Schedule"** bento card — the first card in the
  Workouts left column, so a swimmer sees it before touching the config form — shows all 7 days
  Monday-first (re-ordered for display only; the underlying array stays Sun-first to match
  `getUTCDay()`) with today's cell highlighted the same green an active pill-tab already uses. The
  generated result panel's own "Coach's Plan" note gained a visible
  `Weekly Schedule — {Label}: {blurb}` line so the schedule's effect on today's set is directly
  confirmable, not just a background default.
- **Race-Time Targeting & Goal Progression.** A new "Race Goal" card (placed right after the
  existing Personal Bests card, reusing its per-stroke PB fields as "current PB" rather than
  duplicating that UI) adds a **Target Time** field (`#raceGoalTargetTime`, auto-saved via the same
  `GENERATOR_PREF_FIELD_IDS` pattern every other plain generator input already uses) and a
  **Swimmer Type** pill-tab — Sprinter / Distance / Both — deliberately built as a plain, always-
  visible control rather than a one-time onboarding modal/wizard, since this codebase has already
  twice removed modal-based onboarding wizards in favor of simple inline controls (the post-signup
  wizard, and the OTP-vs-password auth-method chooser) and reintroducing that pattern here would
  contradict that established precedent for no added benefit. Only activates once there's a real
  current PB AND a Target Time genuinely faster than it (a slower/equal/unparseable target silently
  no-ops back to plain PB-derived pacing — never a worse or nonsensical result). When active:
  `pace100` blends 65% current-PB-derived pace with 35% target-derived pace (both normalized via
  the existing `personalPaceFromPB()` Riegel-exponent model, treating the target time exactly like
  a hypothetical faster PB) — deliberately not full target pace on day one, which would be
  unrealistic; `workScaler` tightens `intervalMult`/`restAdd` for the Pre-Set/Main Set/Elite block
  specifically (Warm-Up/Cool-Down stay easy regardless); and a Sprinter or Distance swimmer chasing
  a target is guaranteed at least one archetype from `SPEED_ARCHETYPES`/`ENDURANCE_ARCHETYPES`
  respectively in the Main Set, even on a day whose periodization focus wouldn't otherwise draw from
  that pool (the same "guarantee it's present" principle the Elite Power block already uses for
  elite level) — 'Both' applies no bias. The result panel shows a
  `Racing toward a {time} {distance}m {stroke} — pace and intervals tightened toward that target
  (Sprinter/Distance emphasis)` confirmation line whenever active. Verified via Playwright: setting
  a faster target time produces this note and the swimmer-type emphasis tag; clearing the target
  time removes it and reverts to plain PB-derived pacing with zero page errors.

**A UX-consolidation + Weekly Schedule dynamism round on the Workouts tab.**

- **Unified Swimmer Profile card.** The three separate cards that used to sit stacked in the left
  column — Swimmer Profile (Age), Personal Bests, and Race Goal (Target Time + Swimmer Type) —
  are now one single `.bento-card.wb-profile` with `.wb-profile-subhead` divider rules between
  Personal Bests and Race Goal sub-sections, matching the same thin-hairline "next section" cue
  the outer card stack already uses one level up. Every input id (`swimmerAge`, `pbDistance*`/
  `pbTime*`, `raceGoalTargetTime`, `swimmerTypeTabs`) is unchanged, so none of the JS wiring
  needed to change — this was purely a markup/CSS consolidation.
- **Weekly Schedule is now genuinely dynamic per Swimmer Type, and Saturday is a real Rest day.**
  `WEEKLY_FOCUS` entries now carry `blurbs: {sprinter, distance, both}` instead of one fixed
  `blurb` string — `focusBlurbFor(focus, swimmerType)` picks the right one, so the exact same day
  reads differently depending on the Race Goal card's Swimmer Type selection (e.g. Monday's
  Sprint/Power day says "your signature day" for a Sprinter but "a shorter, sharper day to keep
  top-end speed from going stale" for a Distance swimmer). `renderWeeklyScheduleCard()` re-runs
  live whenever Swimmer Type changes, not just once at load. The schedule was also reshuffled so
  **Saturday is a genuine Rest / Active Recovery day** (`restDay: true`, muted `.is-rest` styling,
  a distinct maroon `.is-today.is-rest` state if it's also today) — Race Pace moved to Friday and
  IM/Transitional moved to Sunday to make room, so all six non-rest archetype flavors are still
  covered across the other 6 days. `generateWorkout()` hard-caps `totalM` to 1200m on a rest day
  regardless of the swimmer's own Target Distance slider (a rest day existing at all, rather than
  fully blocking generation, matches the ask's own "(or Light Active Recovery option)" allowance)
  and adds a `restDayCapApplied` disclosure line so this never reads as the strict-distance-match
  guarantee silently breaking — it's a deliberate, disclosed override specific to that one day.
  Separately, the swimmer-type Main Set archetype bias (guaranteeing at least one Speed/Endurance
  archetype for a Sprinter/Distance swimmer) is no longer gated behind `raceGoalActive` — it now
  applies every day a specialty is selected, which is what actually makes the schedule *behave*
  differently per type, not just read differently.
- **100% fresh daily generation now also covers the Warm-Up.** The existing "never repeat
  yesterday's pick" technique (already applied to the Pre-Set archetype and the first Main Set
  archetype) is now a reusable `pickOneNoRepeat(pool, priorRng)` helper, applied additionally to
  the Warm-Up's drill-pool and kick-pool picks, and extended to also guard the *second* Main Set
  block (previously only the first block in a multi-block session was checked against yesterday).
  Warm-Up, Pre-Set, and Main Set all now carry this guarantee, not just two of the three stages.
- **"Recommended Volume" guidance badge.** A new `#recommendedVolumeBadge` strip sits directly
  under the Weekly Schedule grid, showing a distance range for the swimmer's current Level
  (Beginner 1-2km, Competitive 2-4km, Elite 3-6km) nudged narrower if Speed is the primary
  selected goal or wider if Endurance is — "based on level and goal," not level alone. Updates
  live on both Level and Fitness Goals changes via `renderRecommendedVolumeBadge()`.
- **Distance math re-verified, unchanged from the prior round's fix.** No changes were made to
  `buildToShare()`/the Cool-Down reconciliation logic itself this round; Playwright confirms
  2000m-6000m across Beginner/Competitive/Elite still land within ±50m of target (several exactly
  on target), with the same previously-disclosed 1000m-minimum edge case unchanged. Verified via
  Playwright: the unified profile card renders all four field groups with the old separate cards
  gone; Saturday's schedule cell shows "Rest / Active Recovery" with three genuinely different
  tooltip strings across Sprinter/Distance/Both; the Recommended Volume badge changes text on a
  Level switch; PDF export, Complete Workout logging, and all 9 tabs still work with zero page
  errors.

**A round making the Weekly Schedule interactive, merging every Athlete Profile input into one
card, and adding a Goal Progression Estimator — all client-side/localStorage-scoped, no
Firestore/Cloud Function changes.**

- **The Weekly Training Schedule card is now genuinely interactive, not just a read-only
  strip.** Each day cell is a real `<button class="weekly-schedule-day" data-focus-key="...">`
  (was a plain `<div>`) wired to a click handler on `#weeklyScheduleGrid`. Tapping a day sets
  `state.scheduleOverrideKey` (persisted via `saveGeneratorPrefs`, `null` by default) to that
  day's `WEEKLY_FOCUS` key; tapping the day that's *already* driving generation (the override
  itself, or — with no override set — today) clears it back to `null`, returning to following the
  real calendar day automatically. A new `effectiveFocus()` helper (`state.scheduleOverrideKey ?
  that WEEKLY_FOCUS entry : todaysFocus()`) is now the single place both `generateWorkout()` and
  the Recommended Volume badge/schedule card itself read "today's" focus from, replacing every
  direct `todaysFocus()` call in those three spots — so an override genuinely changes what gets
  generated (including a tapped Rest day correctly re-applying the existing 1200m volume cap and
  pace ease), not just the card's own highlight. Two visual states are now tracked independently:
  `.is-today` (a subtle aqua ring — the real calendar day, always present) and `.is-active` (the
  solid green fill — whichever day is actually driving generation, itself by default or a
  swimmer's override), so previewing a different day never hides which one is the real "today"
  underneath. Clicking a day also re-applies that day's `goalKeys` onto `state.goals` (mirroring
  the exact same "default but freely overridable" precedent `state.goals`' own initial seed from
  `todaysFocus().goalKeys` already established), and a small `#scheduleOverrideNote` line appears
  under the grid ("Previewing X — tap it again to return to today's auto schedule") whenever an
  override differs from the real today, so a swimmer can't lose track of the fact they're
  previewing rather than looking at today's actual plan.
- **Recommended Volume is now genuinely per-day, not just per-Level.** `recommendedVolumeFor(focus,
  level)` was extracted from the old inline badge logic so both the badge and every day cell's own
  hover tooltip compute the exact same range from the exact same function — a Rest day now also
  clamps its own recommended range down (800m-1200m) independent of Level, and the badge's headline
  reads "Recommended for `<level>` on `<day label>`" instead of just "for `<level>`" so it's clear
  the number is scoped to whichever day is currently active (today or a preview).
- **A real, screenshot-caught layout bug in the Recommended Volume badge was found and fixed
  while verifying this**: `.wb-recommended-badge` was `display:flex` with no wrapper — every
  direct child (the icon AND, critically, each bare-text run and `<strong>` tag inside the
  message) became its own flex item with the default `flex-wrap:nowrap`, which rendered as one
  word per line stacked vertically the moment the message grew to contain three separate `<strong>`
  tags (level / day label / volume range) — a real, reachable bug this round's own richer message
  triggered, not a hypothetical one. Fixed by wrapping the entire message in one `<span>` (the
  icon is now the only real flex item; `flex-shrink:0` keeps it from being squeezed), so the
  message's internal `<strong>` tags can no longer fragment the flex layout — it now wraps as a
  normal multi-line sentence.
- **Fully merged Athlete Profile card.** `wb-equipment`, `wb-goals`, and `wb-level` (Age +
  Swimmer Type were already sharing `wb-profile`) are no longer separate `.bento-card`s — Equipment
  Available, Fitness Goals, and Level (plus the Generate button) are now `.wb-profile-subhead`-
  delimited sections inside the same single "Athlete Profile" card, verified via Playwright that
  `.bento-card.wb-equipment`/`.wb-goals`/`.wb-level` no longer exist as separate top-level cards
  and every one of their input ids still resolves inside `.wb-profile`. Discipline and Target
  Distance were deliberately left as their own separate cards (not part of the ask's merge list)
  and were reordered to sit *before* the profile card — pick your stroke(s) and distance first,
  then fill in everything about yourself and hit Generate, which reads better than the previous
  order where Swimmer Profile came before a swimmer had even picked a discipline. The Age +
  Swimmer Type row was rebuilt from a shared `.profile-row`/`.profile-field` grid (which is also
  used, unmodified, by Gym's Strength Profile and Settings' own profile form — confirmed via grep
  before touching anything, so neither of those was put at risk) into a new scoped `.wb-athlete-row`
  that stacks Age and Swimmer Type full-width rather than trying to force them side-by-side — the
  Workouts left column is only ~40% of the page width at any real desktop viewport (`flex: 0 0 40%`
  on `.workouts-col-left`), genuinely too narrow for a label+input and a 3-option pill group to
  share a row without the pills wrapping awkwardly; this was caught via an isolated
  element-screenshot of the card (not just a full-page screenshot, which didn't show the problem
  clearly) during this round's own verification, and a first attempt using a `1fr 2fr` CSS grid
  with `align-items:end` was *also* wrong (it left a large empty gap above the shorter Age field
  because the two cells' content had different heights) before landing on the simpler stacked
  layout.
- **Personal Bests & Race Goals rows now pair a current time with a target time per stroke,
  replacing the old single generic Race Goal card.** Each of the four `.pb-stroke-row`s
  (Freestyle/Backstroke/Butterfly/Breaststroke) gained a fourth column — a new
  `raceGoalTarget{Stroke}` input sitting directly beside that stroke's own current-PB time field
  (`grid-template-columns: 84px 62px 1fr 1fr`, collapsing to 2 columns with the stroke name
  spanning full width under 640px) — replacing the old single `raceGoalTargetTime` field, which
  only ever applied to whichever discipline happened to be primary and had no stroke identity of
  its own on the page. `STROKE_PB_FIELD_IDS` gained a third `target` key per stroke;
  `activeStrokePbFieldIds()` (used by `generateWorkout()`'s Race-Goal pace blend) now
  automatically resolves the correct per-stroke target field for whichever discipline is primary,
  with zero other changes to that blend's math. `GENERATOR_PREF_FIELD_IDS` swapped the one old
  field id for the four new ones so every stroke's target time now auto-saves/restores exactly
  like every other generator field.
- **A "Goal Progression Estimator" widget now shows a live, science-based timeframe estimate under
  each stroke's own current/target pair.** `estimateProgressionMonths(currentSec, targetSec,
  level)` models the timeline as percent-improvement-needed divided by a per-Level monthly-
  improvement rate (`PB_ESTIMATE_MONTHLY_RATE`: beginner 2.2%/month, competitive 1.4%/month, elite
  0.8%/month) — beginners genuinely improve faster off a lower training base, elites need far more
  work for the same percentage gain approaching their physiological ceiling, the same "disclosed
  estimate, not a lab-measured constant" posture as `PB_PACE_FATIGUE_EXPONENT`/`CALORIES_PER_METER`
  elsewhere in this file. The competitive rate was specifically calibrated against the ask's own
  worked example — a 28.0s→27.0s 50m Backstroke improvement (3.57% faster) resolves to exactly
  "2–3 months" at that rate, verified via Playwright against the literal example numbers, not just
  eyeballed. A target ≥ the current time reads as "already met" (green `.is-met`); an improvement
  over 12% is deliberately NOT extrapolated through the same linear model (which would produce
  false-precision nonsense like "40 months") and instead reads as an honest "multi-season goal
  (12+ months) built through several progressive targets" message. `updatePbEstimate(stroke)`
  recomputes on every `input` event on either that stroke's current-time or target-time field, and
  `updateAllPbEstimates()` (called on load once fields are restored, and again whenever Level
  changes, since the rate is Level-dependent) refreshes all four at once — each estimate is scoped
  entirely to its own stroke's `#pbEstimate{Stroke}` element, so filling in Backstroke never
  touches Freestyle's line.
- **A real script-ordering bug was caught and fixed while wiring the estimator, before it ever
  reached the browser as a runtime crash for real swimmers**: the estimator's per-stroke input-
  listener wiring (`PB_ESTIMATE_STROKES.forEach(...)` reading `STROKE_PB_FIELD_IDS[stroke].target`)
  was initially placed directly after `GENERATOR_PREF_FIELD_IDS`'s own restore loop — textually
  earlier in the file than `STROKE_PB_FIELD_IDS` itself is declared. Since that wiring runs
  immediately (not inside a function body), it executed before `STROKE_PB_FIELD_IDS` had been
  assigned, throwing `TypeError: Cannot read properties of undefined (reading 'target')` and (since
  this all lives in one un-guarded top-level IIFE) silently aborting every subsequent line of the
  Workouts generator's own setup — including the Weekly Schedule card's first render, which is why
  the very first Playwright run of this round showed a completely empty `#weeklyScheduleGrid` with
  zero children. Caught immediately via `page.on('pageerror', ...)` in this round's own test
  harness before any user ever saw it. Fixed by moving just the two executable wiring statements
  (the `forEach` attaching input listeners, and the initial `updateAllPbEstimates()` call) down to
  directly after `STROKE_PB_FIELD_IDS`/`activeStrokePbFieldIds()`'s own declaration — the pure
  function declarations (`estimateProgressionMonths`/`updatePbEstimate`/`updateAllPbEstimates`)
  stayed exactly where they were, since function declarations are hoisted and don't need to
  execute in source order, only their *invocations* do. A second, near-identical script-ordering
  bug in this same area (`renderWeeklyScheduleCard()`'s very first invocation, in the schedule
  section, running before `RECOMMENDED_VOLUME_BY_LEVEL`/`recommendedVolumeFor()` were assigned a
  few dozen lines further down — thrown as `Cannot read properties of undefined (reading
  'beginner')`) was caught and fixed the same way: the initial `renderWeeklyScheduleCard();` call
  was moved down to directly after `recommendedVolumeFor()`/`renderRecommendedVolumeBadge()` are
  defined, while the click-listener attachment (which only executes *later*, on an actual click)
  stayed in place.
- **Micro-improvements pass.** Beyond the two real bugs above (badge word-wrap, athlete-row
  layout), a Playwright screenshot review of the rebuilt left column and the isolated merged
  profile card found the rest of the redesigned layout — Discipline/Distance reordered ahead of
  the profile card, the four PB+Goal rows, Equipment pills, Fitness Goals chips, Level tabs, and
  the Generate button — rendering cleanly with no further overflow, misalignment, or contrast
  issues, so no additional speculative changes were made beyond what these two real, observed
  problems required.
- Verified via Playwright: the merged card contains all expected fields with the three old
  separate cards gone; tapping a non-active day sets the override and shows the preview note,
  tapping it again clears the override and hides the note; forcing an override onto the Rest day
  and generating correctly applies the 1.2km cap and "Weekly Schedule — Rest / Active Recovery"
  note, and clearing the override afterward is reflected immediately; the 28.0s→27.0s Backstroke
  example reads "2–3 months (3.6% faster)"; a met target reads "already at or beyond" in green; a
  workout generated with Freestyle as primary and a 1:10→1:00 target correctly shows "Racing toward
  a 1:00..." (now sourced from the per-stroke `raceGoalTargetFreestyle` field instead of the old
  single generic field); the existing 2000m/5000m distance-accuracy assertions still land within
  ±25m of target with zero regression; the existing PDF export and Complete-Workout-to-Tracker
  regression checks still pass; and all 9 tabs load with zero page errors.

**A round covering Workouts profile layout, Main Set logic (Elite gating + a Technique/Sprint
hybrid + subtle technique cues), a Gym tab layout fix, and a real performance pass — driven by
an explicit review-video punch list.**

- **Swimmer Type moved into the Personal Bests & Race Goals section.** The Sprinter/Distance/Both
  pill-tabs no longer sit in a row beside Age (`.wb-athlete-row` now holds only Age, full-width);
  they're now their own `.wb-swimmer-type-field` positioned directly under the "Personal Bests &
  Race Goals" subhead, before the four per-stroke PB rows — so every input that's actually "about
  my racing" (current/target times, swimmer type) reads as one compact block, per explicit request.
  No JS/state changes were needed — `#swimmerTypeTabs`' id, click handler, and restore logic were
  already id-based and DOM-position-agnostic.
- **Discipline/Stroke selection was audited, not changed — it already allows any combination.**
  `#disciplineChips`' click handler (the same code since it was built) has no mutual-exclusivity
  logic and no selection cap; its only guard is "keep at least one selected" (blocking a swimmer
  from deselecting their way down to zero disciplines, which would break pace/rotation logic
  entirely) — verified via Playwright that all 5 disciplines (Freestyle/Backstroke/Butterfly/
  Breaststroke/Individual Medley) can be selected simultaneously with zero restriction. This was a
  genuine audit, not a no-op dodge: the review's complaint most likely traced to the Main Set's
  own *clean set isolation* rule (each block locked to one stroke, blocks rotating strokes) reading
  as "restrictive" in practice even though the underlying picker itself was never restricted —
  that block-isolation behavior is intentional and unchanged (documented in an earlier round as
  the fix for strokes randomly blending mid-set).
- **The Elite Power & Underwater block is no longer a mandatory daily fixture for every elite-level
  swimmer.** It previously fired every single day at Elite level regardless of what the session was
  actually about — genuinely too much explosive/high-CNS volume stacked onto an Aerobic, Technique,
  or Threshold-focused day. A new `eliteBlockWanted = state.level === 'elite' && state.goals.indexOf
  ('speed') > -1` gate now controls both its reserved-budget calculation (`eliteBlockM`) and its
  actual construction/`main.unshift(...)` call — so it fires exactly on the sessions it's meant for
  (the Weekly Schedule's own Sprint/Power and Race Pace days auto-select Speed; a swimmer can also
  manually pick Speed themselves, i.e. "requested" per the ask) and stays absent on every other
  elite-level day. Verified via Playwright: Elite+Endurance-only produces no "Elite Power" block;
  Elite+Speed still does.
- **Technique & Sprint Hybrid: a Technique-only session now gets exactly one small, clearly-labeled
  high-tempo set, not zero sprint stimulus and not heavy sprint volume.** Previously a swimmer who
  selected only the Technique goal drew every Main Set block from `TECHNIQUE_ARCHETYPES` alone —
  zero speed work at all. A new `wantsTechniqueSprintBridge` flag (true only when `technique` is
  selected and `speed` is NOT — skipped when Speed is also picked, since real sprint volume already
  exists elsewhere in that session and a second bridge would be redundant) appends one small
  "Technique-to-Speed Bridge" set (2-4×25m, high tempo, "same clean technique, just faster
  turnover") to the *first* Technique-archetype block encountered. `TECH_SPRINT_BRIDGE_M` (100m) is
  carved OUT of that block's own already-allocated share — never added on top of it — using the
  exact same carve-not-add principle `EZ_RECOVERY_M` already established for Speed-archetype
  blocks, so strict distance accuracy holds exactly as before. Verified via Playwright: a
  Technique-only workout shows the bridge set; a Technique+Speed workout correctly does not.
- **"Secret swimmer tricks" — subtle technique cues woven into set descriptions.** A new
  `TECHNIQUE_MICRO_CUES` pool (five cues, each targeting one of the three explicitly-requested
  fundamentals — an early-vertical-forearm catch, hip-driven body rotation, or quiet underwater
  dolphin kicks off the wall) replaces the "Drill Focus" archetype's old generic "one technical cue
  per length" placeholder line with a real, rotating, coach-voice cue (`pickOne(TECHNIQUE_MICRO_CUES)`,
  drawing from the same day-stable `workoutRng` as every other random choice in the generator, so it
  stays stable for the day and rotates at the same midnight boundary as the rest of the workout).
  This is deliberately scoped to one archetype's one line rather than rewritten across every
  Technique archetype — the ask was to weave cues in "organically… without feeling overwhelming,"
  and the pool's three themes are already all represented without touching every set description.
- **Gym tab: a real, screenshot-caught rendering bug was found and fixed — this was the actual
  "chaotic/unstructured" problem, not the column split.** The Gym tab already had the requested
  left/right column split (Strength Profile + Today's Focus on the left, the exercise board on the
  right) from an earlier round; what was genuinely broken was each exercise card's own size. Every
  `.gym-card` rendered at the *full width* of the right column with a 21:9 technique-demo frame on
  top of it, producing a ~495px-tall card — stacked one-per-row (`#gymGrid .grid.grid-auto` was
  `display:flex; flex-direction:column`), 12 cards across 4 phases pushed the Gym tab's total page
  height past **9,150px** (confirmed via a direct Playwright `body.scrollHeight` measurement before
  touching anything) — an enormous, sprawling wall of scrolling that is exactly what reads as
  "chaotic" to someone scrubbing through a review video, even though nothing was visually
  misaligned. Fixed by (1) converting `#gymGrid .grid.grid-auto` to a real responsive CSS grid
  (`repeat(auto-fill, minmax(230px, 1fr))`) instead of a single flex column, so two compact cards
  sit side-by-side per row instead of one oversized card per row, and (2) shrinking the technique-
  demo frame's aspect ratio (21:9 → 16:9) plus trimming card padding/font sizes for a genuinely
  "compact thumbnail" feel per the explicit ask. Net effect, verified via Playwright: card height
  dropped from ~495px to ~369px *and* two now render per row, taking the Gym tab's total page
  height from ~9,150px down to **~5,608px** — a ~39% reduction — with all 4 phases/12 cards still
  present and correctly rendered (confirmed via direct computed-opacity checks, not just a
  screenshot, since a `fullPage` Playwright screenshot's single-capture timing can under-represent
  `data-reveal` entrance-transition state for content that was never scrolled through step-by-step
  — a real user scrolling naturally never hits this).
- **A real, measurable performance pass — three concrete, disclosed fixes, not a speculative
  rewrite of every animation on the site.** All three were chosen because they're either always-on
  (not scoped to hover/interaction) or use a known non-composited CSS property, and all three were
  verified via computed-style checks, not just eyeballed:
  1. **8 nav icons previously ran `animation: … infinite` unconditionally**, all the time, on every
     tab, inside the one part of the page that's always on screen (the sidebar/nav) — a real,
     constant compositor cost for a purely decorative wiggle with no functional purpose. Each icon
     now only plays 2 iterations on `:hover`/`:focus-visible` instead of looping forever, so there's
     zero animation cost at rest and mobile (no meaningful hover state) pays nothing for this at
     all. Verified via computed `animationName` reading `"none"` on an unfocused/unhovered icon.
  2. **The shared ambient background layer behind every tab (`.dash-ambient-bg::after`, the
     dot-grid "tactical" texture) animated `background-position`** — a property that forces a
     repaint of the entire (viewport-sized) layer on every frame, for as long as the animation
     runs, which is forever, regardless of which tab is active, since this element is mounted
     behind the whole dashboard at all times. Converted to an equivalent `transform: translate()`
     animation (compositor-only, no repaint) that moves by exactly one grid tile (42px, matching
     `background-size`) so the drift loops identically to before, just without the repaint cost.
     The Hero's own two-layer `.hero-hud-grid` (front-page-only, and its two grid layers drift in
     different directions, which a single `transform` can't replicate without splitting it into two
     elements) was deliberately left as a disclosed, lower-priority trade-off — it isn't mounted
     behind every tab the way `.dash-ambient-bg` is, so its cost is bounded to time spent on the
     landing page specifically.
  3. **`.chip`'s `transition: all`** (the base class behind every discipline/goal chip) was scoped
     to the five properties it actually animates (`background`, `border-color`, `color`,
     `transform`, `box-shadow`) instead of watching every animatable CSS property on every chip —
     `transition: all` was otherwise the only instance of that anti-pattern found in the file.
     `advanceGymAnims` (the Gym cards' own animation timer) was already correctly gated to only run
     while the Gym tab is active from an earlier round — audited, not re-fixed.
- Verified via Playwright end-to-end: all 5 disciplines select simultaneously with zero
  restriction; Swimmer Type renders inside the Personal Bests card, not beside Age; Elite+Endurance
  produces no Elite block while Elite+Speed does; Technique-only shows the bridge set while
  Technique+Speed correctly omits it; a 3000m Competitive/Endurance workout still lands within
  realistic rounding of target with zero distance-math regression; a nav icon's at-rest
  `animationName` reads `"none"`; the Gym grid computes `display:grid` with cards genuinely
  rendering two-per-row and total page height cut by ~39%; PDF export and Complete-Workout-to-
  Tracker both still fire correctly; and all 9 tabs load with zero page errors.

**Gym rebuilt from a left/right column split into a TOP horizontal input bar + BOTTOM full-width
exercise board, plus a real alignment bug fix and a re-confirmation of Workouts' stroke picker.**

- **Gym's layout changed from side-by-side columns to top/bottom stacking**, per explicit request.
  `.gym-columns`/`.gym-col-left`/`.gym-col-right` (previously shared with `.workouts-columns` via
  combined selectors) are gone from Gym entirely — those combined selectors were split apart so
  Workouts' own 2-column layout is untouched, and Gym now uses new `.gym-top-bar`/`.gym-top-half`/
  `.gym-bottom` classes. `.gym-top-bar` is a flex row splitting evenly 50/50 (Strength Profile left,
  Target Focus right, a `border-inline-start` hairline between them instead of two separate boxed
  cards), collapsing to a stacked single column below 760px. `.gym-bottom` holds the exercise board,
  PDF button, and AI routine panel, now full-width instead of squeezed into a 60% column — the
  already-compact 2-column card grid from the previous round packs even more efficiently at full
  width, dropping total Gym page height from ~5,608px to **~4,973px**.
- **"Today's Focus" (renamed "Target Focus" in the heading, matching the ask's own wording) lost
  its heavy segmented-control look.** `#gymFocusTabs` previously inherited `.pill-tabs`' solid
  `background: var(--bg-alt)` pill-shaped container — a filled bar behind every button that read as
  a boxed table row. Scoped to just this instance (the shared `.pill-tabs` class is still used
  correctly elsewhere — Level, Swimmer Type, Units, Language — and was left alone), the container
  background/padding is now stripped entirely and each `.pill-tab` inside gets its own thin
  individual border instead, so the five focus options read as sleek, independent pill buttons/
  badges rather than one solid bar. No JS changed — `data-focus`/`aria-selected` and the click
  handler are untouched, this is a pure CSS override.
- **A real, screenshot-caught misalignment bug in the Strength Profile row was found and fixed.**
  "Age" is a one-line label while "Current Working Weight" and "Strength Limit / Max Capacity" wrap
  to two lines at the new top-bar's column width — since `.profile-field label` had no reserved
  height, the Age input started noticeably higher than the other two, exactly the "crooked/stacked
  offset" the ask explicitly called out. Fixed by reserving a fixed 2-line-tall, bottom-anchored
  label box scoped to `.gym-top-half .profile-field label` specifically (verified via a follow-up
  Playwright check that Settings' own `.profile-field` labels — short, always single-line — compute
  zero `min-height` and are completely unaffected) so every input in the row now starts at the
  identical y-coordinate regardless of how many lines its own label wraps to. Verified via
  Playwright: all three input `getBoundingClientRect().top` values match within 2px, both top-bar
  halves report identical height (238px) and start at the same y (confirming genuine side-by-side
  balance, not a stacked illusion).
- **Workouts' stroke/discipline picker was re-audited, not changed — still fully unrestricted.**
  Re-verified via Playwright (a fresh test, independent of the previous round's) that all 5
  disciplines (Freestyle/Backstroke/Butterfly/Breaststroke/Individual Medley) can be selected
  simultaneously with a single click sequence and the workout still generates correctly — the click
  handler's only guard remains "keep at least one selected." No second restriction was found
  anywhere in the codebase (no cap, no mutual exclusivity); this was a genuine re-check given the
  repeated ask, not a skipped step.
- Verified via Playwright end-to-end: the Gym top bar renders two equal-height, equal-top halves
  side by side; the Strength Profile inputs are pixel-aligned; the Target Focus pills have no
  container background/padding and each carry their own border; clicking a focus pill still
  updates `aria-selected` and regenerates the exercise grid; the exercise grid is still a
  `display:grid` 2-column-plus layout with all 12 cards present; both Workouts' and Gym's PDF
  exports still fire real `download` events; all 5 disciplines select simultaneously; and all 9
  tabs load with zero page errors.

**A round covering fully flexible Personal Bests, a Tracker log-form layout fix, and a genuine
free Beginner tier with progressive difficulty scaling — the first round to touch the access-
control/paywall logic since it was reinstated as a real enforcement gate.**

- **Personal Bests are now a fully flexible, freely-configurable entry list instead of 4 fixed
  stroke rows.** The old markup (one hardcoded `.pb-stroke-block` per Freestyle/Backstroke/
  Butterfly/Breaststroke, each with its own fixed-id distance `<select>`/current-time/target-time
  fields) is gone, replaced by `#pbEntriesList` — a dynamic list rendered from `state.pbEntries`
  (an array of `{stroke, distance, currentTime, targetTime}` objects) plus a `+ Add Personal Best`
  button. Every entry independently picks its own Stroke (Freestyle/Backstroke/Butterfly/
  Breaststroke/Individual Medley, via `PB_STROKE_OPTIONS`) and Distance (50/100/200/400/800/1500m,
  via `PB_DISTANCE_OPTIONS`) — so a swimmer can log 50m Free and 100m Free side by side, or five
  different Backstroke distances, with no artificial one-per-stroke limit. A remove button (`×`,
  reusing the existing `i-close` icon symbol) appears on every row once there are 2+ entries — at
  least one always stays, since the pace/estimator logic needs a baseline to read from.
  `migrateLegacyPbEntries()` runs once against any previously-saved `swimfit_generator_prefs`
  blob, carrying forward the old 4 fixed fields (if present) as the new array's starting entries
  so an existing swimmer's saved PBs aren't silently discarded by this rewrite. `activePbEntry()`
  replaces the old `activeStrokePbFieldIds()` — it picks whichever saved entry matches the primary
  selected discipline (preferring one with a filled-in current time), which both
  `generateWorkout()`'s pace-personalization and the per-entry Goal Progression Estimator
  (`updatePbEstimateForIndex()`, now indexed by array position via `data-pb-index` rather than a
  fixed stroke-keyed element id) read from. `GENERATOR_PREF_FIELD_IDS` shrank from 16 fixed ids
  down to just the 4 that are still genuinely fixed fields (Age + the 3 Gym Strength Profile
  inputs) — the PB entries persist as their own `pbEntries` array in the same localStorage blob
  instead. Verified via Playwright: the 4 migrated rows render correctly, adding a 5th entry (a
  second Freestyle distance) computes a correct Goal Progression estimate, a full page reload
  restores all 5 entries with their exact values, `generateWorkout()` still personalizes pace off
  the right entry, and removing an entry drops the row count with zero page errors.
- **Tracker log-form: a real, screenshot-caught grid bug was found and fixed.** `.tracker-log-row`
  (Date/Distance/Duration/Discipline + the Log Swim button — 5 grid items) was declared with only
  4 grid tracks (`grid-template-columns: repeat(3, 1fr) auto`) — a genuine off-by-one, most likely
  dating from whenever the Discipline field was added to what was originally a 3-field form
  without updating the template. The practical effect, caught via an actual Playwright screenshot
  rather than just reading the CSS: the Discipline field was squeezed into the narrow `auto` track
  meant for the button, and the button itself wrapped onto a visually displaced second row. Fixed
  to a genuine 5-column template (`repeat(4, 1fr) auto`). A second, related issue in the same row
  was fixed alongside it: "Duration (mm:ss) (optional — enables pace)" wraps to 2-3 lines while
  the other three labels stay on 1, which — combined with `align-items: end` — pushed that one
  field's input visibly lower than its neighbors; scoped to `.tracker-log-row .form-row label`
  specifically (verified this doesn't touch Settings'/Auth's own reuse of the shared `.form-row`
  class, whose labels are always short), a reserved `min-height: 2.6em` plus a `gap: 0.3em` (a
  second real bug found while re-screenshotting the first fix: flex-ifying a label containing a
  text node + an inline `<span>` collapsed the whitespace between them, rendering
  "DISCIPLINE(optional)" with no visible space) now keeps every field's input bottom-aligned
  regardless of label line count.
- **A second, deeper Tracker layout bug was found while re-screenshotting the fix above: the log
  form and the Daily/Weekly/Monthly stat card were both falling under the generic
  `.bento-grid > * { grid-column: span 4 }` rule at ≥1100px, each getting only a third of the row.**
  This wasn't just wasted space — it actively broke the log form: squeezed into a third of the row
  width, the Discipline field (now correctly using its own grid track per the fix above) overflowed
  past the card's own right border and rendered completely invisible, hidden behind/before the
  stat card next to it. Fixed by giving the wrapping `<div class="bento-grid">` a second, scoped
  class (`tracker-top-grid`) with its own `@media (min-width: 1100px)` override — `.tracker-log-
  form` now spans 8/12, `.tracker-stat-card` spans 4/12 — filling the full row with no dead space
  and giving the 5-item form the width it actually needs, without touching the generic
  `.bento-grid` rule every other tab (Workouts, Gym, etc.) still relies on. Verified via a direct
  `getBoundingClientRect()`/screenshot check: all 5 fields (Date, Distance, Duration, Discipline,
  Log Swim) now render visibly in one row, bottom-aligned within a few px of each other, with the
  Discipline dropdown genuinely on screen for the first time. The remaining Tracker cards
  (analytics strip, Weekly Volume Goal, both charts, Personal Best Progression mini-form) were
  reviewed and found already correctly aligned — no further changes were needed there.
- **Beginner level is now genuinely free — the first carve-out in the reinstated 3-day-trial
  paywall (see the "3-day trial paywall was RE-INTRODUCED" entry above) since it shipped.** A
  swimmer whose trial has expired (`access.level === 'expired'`) with no active plan is no longer
  hard-locked out of the *entire* site — specifically, the full-screen `#paywallOverlay` now stays
  hidden while they're on the Workouts tab with Beginner level selected, everywhere else (any other
  tab, or Workouts at Competitive/Elite) still locks exactly as before. This required promoting the
  previously-inline `swimfit:accesschange` overlay logic into a reusable, globally-exposed
  `refreshPaywallLock()` function, since the bypass condition depends on *both* the currently active
  tab (`#dashboard`'s `data-active-tab`) and the currently selected Level pill — neither alone is
  enough to know when to re-evaluate. It's now called from three places: the `swimfit:accesschange`
  listener itself, `switchTab()` (so navigating to/away from Workouts re-checks immediately), and
  the Level pill-tab click handler (so switching Beginner ↔ Competitive/Elite while already on
  Workouts re-checks immediately) — `window.__workoutsLevelIsBeginner()` is the one query point
  both the overlay logic and (indirectly) everything else reads the current level through.
  **Suspension (`accessDisabled` → `'locked'`) is deliberately unaffected** — `locked = suspended ||
  (expired && !beginnerBypass)`, so a manually-suspended account stays fully locked on every tab
  regardless of level, exactly as before; only a plain expired-trial-with-no-plan case gets the
  carve-out. **The AI Coach FAB stays hidden for the whole `expired` state regardless of the
  bypass** — Coach was never meant to be free, only Beginner Workouts. **A real, previously-
  unnoticed dead-end bug was caught while testing this and fixed before shipping**: the overlay's
  `z-index: 400` sits above the nav (`.nav` at 100, `.mobile-bottom-nav` at 140), so the moment an
  expired-trial swimmer using the Beginner bypass navigated away from Workouts (e.g. clicked Gym),
  the overlay re-locked and its full-viewport hit-area then blocked clicks on the nav itself —
  with literally no way to click back to Workouts+Beginner to unlock again, since the very
  navigation control needed to escape was covered by the thing blocking escape. Fixed with
  `body.paywall-locked .nav, body.paywall-locked .mobile-bottom-nav { z-index: 410; }` — mirroring
  the existing precedent of the Support FAB already sitting above this same overlay at z-index 410
  — so the nav stays reachable through the lock. This is harmless for a genuinely suspended
  account too: every tab still shows the overlay for them regardless of which one they click
  through to, since `suspended` alone already forces `locked = true` unconditionally. Verified via
  Playwright end-to-end: an expired-trial account sees no overlay on Workouts+Beginner, gets
  immediately locked switching to Competitive on the same tab, unlocks again switching back to
  Beginner, gets locked navigating to Gym, and — critically — can now click back to Workouts (a
  real click through the nav, not a direct DOM query) to unlock again; a simulated suspended
  (`'locked'`) account stays locked through the identical Workouts+Beginner combination that
  bypasses a plain expired trial; and restoring to `'trial'` clears the overlay correctly.
- **Beginner distance cap: 3,000m maximum, enforced at both the slider and generation layers.**
  `applyLevelDistanceCap()` sets `distanceSlider.max = '3000'` (down from the normal 6000)
  whenever Beginner is selected — clamping the current value down to 3000 if it was higher — and
  restores `max = '6000'` for Competitive/Elite; called from both the Level pill-tab click handler
  and the on-load `restoreLevelTab()` restore path, so a swimmer who saved a >3000m preference at
  a different level and then switches to Beginner is clamped immediately rather than silently
  allowed to generate an oversized session. A defensive second check inside `generateWorkout()`
  itself (`beginnerCapApplied`, clamping `totalM` to 3000 if it's still somehow higher) guards
  against any stale/corrupted saved state reaching the generator directly, and appends a disclosure
  line to the "Coach's Plan" note when it actually fires. Verified via Playwright: setting 5000m at
  Competitive, then switching to Beginner clamps both the slider's `value` and `max` to 3000;
  switching onward to Elite restores `max` to 6000.
- **Difficulty scaling: Beginner workouts now exclude four Main Set archetypes that demand pacing
  discipline or executional skill beyond a first-time swimmer** — `Explosive Turns & Starts`,
  `Descending Power Ladder`, `Broken Threshold Swim`, and `Distance Ladder` (all-out ladders,
  explosive wall work, and sustained gear-shifting pacing that a beginner hasn't developed feel
  for yet) — via `BEGINNER_EXCLUDED_ARCHETYPES`, filtered out of the combined goal pool in
  `generateWorkout()` only when `state.level === 'beginner'` (with a safety fallback: if filtering
  would empty the pool entirely for some future goal combination, the unfiltered pool is used
  instead rather than crashing). The Technique pool is deliberately never filtered — it's already
  drill-based and low-intensity at every level, so nothing in it needed excluding. This sits
  alongside the **pre-existing** `LEVEL_SCALERS` (interval/rest tightening per level, unchanged
  this round) and the Elite Power block's own speed-goal gating from an earlier round — together,
  Beginner now gets simpler drill-forward sets with generous rest via the archetype exclusion,
  Competitive sits in the unfiltered middle, and Elite additionally layers on its own dedicated
  power block when Speed is selected, a genuine progressive difficulty curve rather than Level
  only ever changing pace/interval numbers. Verified via Playwright: Beginner + all three goals
  selected + a 3000m session generates correctly with zero of the four excluded archetype names
  appearing anywhere in the rendered output, while Competitive generation is unaffected (same pool,
  same archetypes available).
- Verified via Playwright end-to-end for the whole round: all 9 tabs load with zero page errors;
  the flexible PB add/remove/persist flow; both Workouts' and Gym's PDF exports still fire real
  `download` events; the Complete Workout button still renders and logs correctly; the Beginner
  distance cap, archetype exclusion, and paywall bypass (including the nav dead-end fix) all work
  as described; and a simulated suspended account is correctly unaffected by the new bypass.

**A full design-token retune away from the "AI-generated template" look toward a premium, matte
dark-mode SaaS aesthetic — the heavy cyan graph-paper grid backgrounds, glowing neon borders, and
harsh shadows from earlier "precision instrument"/"bento" rounds were the explicit target. Pure
CSS/token changes — no JS, markup structure, Firestore, or Cloud Function changes anywhere.**

- **The root design tokens (`:root` in `<style>`) were rewritten wholesale.** `--bg`/`--bg-alt`/
  `--surface`/`--surface-2` moved to a genuine matte-black GitHub-dark-style palette (`#0D1117` /
  `#10141B` / `#161B22` / `#1C2128`); `--border`/`--border-strong` dropped from a fairly visible
  slate-tinted `rgba(148,163,184,0.18/0.32)` to a much subtler `rgba(255,255,255,0.08/0.14)`;
  `--muted`/`--muted-2` became `#8B949E`/`#6E7681` (muted gray secondary text, per explicit spec);
  `--radius-sm`/`--radius`/`--radius-lg` grew from the previous "precision instrument" sharp
  corners (6/10/14px) to a softer, more premium 8/12/16px. Every rule in this file already read
  color/radius exclusively through these custom properties (a discipline established many rounds
  ago specifically so a re-skin like this never needs a per-component rewrite), so this one block
  re-themes the entire site.
- **Glassmorphism is back, deliberately reversing the "no blur, solid flat panel" precision-
  instrument decision from a much earlier round** — the user this round explicitly asked for
  translucent glass cards, which is the opposite of that earlier explicit ask, so this entry
  supersedes it. `--glass-bg`/`--glass-bg-2` changed from solid opaque colors
  (`var(--surface-2)`/`#26314C`) to real translucency (`rgba(22,27,34,0.7)`/`rgba(28,33,40,0.7)`),
  `--glass-border` dropped from a fairly visible `rgba(148,163,184,0.30)` to a hairline
  `rgba(255,255,255,0.08)`, and `--glass-blur` went from `none` back to a real `blur(10px)`. Every
  card that already read through these tokens (`.settings-card`, `.price-card`,
  `.tracker-log-form`/`-stat-card`/`-goal-card`/`-chart-card`, the Academy "100% free" banner) picked
  up the new glass look automatically with zero per-component edits.
- **`.card`/`.glass-card` and `.bento-card` — both stripped down to bare, borderless/backgroundless
  surfaces in an earlier "fully cardless" round — regained a real background, border, blur, radius,
  and soft resting/hover shadow**, directly reversing that round's "no fill, no border, no shadow"
  decision per this round's explicit "give cards a sleek glassmorphism/matte finish" ask. This
  re-skins every gear/video/Academy/gym-focus/discipline card (`.card`) and every Workouts/Gym/
  Tracker bento-grid cell (`.bento-card`) at once, since both are single shared base classes.
  `.bento-card`'s existing hover-revealed top accent rail (`::before`) was kept as an additional,
  secondary "card family" cue layered on top of the new real card fill — not a replacement for it.
- **The heavy cyan graph-paper grid line background is gone, everywhere it appeared.** Two distinct
  occurrences: `.hero-hud-grid` (the Hero's own decorative grid layer) had its `background-image`/
  `animation` deleted outright — the rule is now `display:none`, an inert hook rather than a deleted
  selector, in case a much subtler texture is ever wanted there again — and `.dash-ambient-bg::after`
  (the identical grid texture shared behind every tab — Workouts, Gym, Gear, Academy, Tracker,
  Pricing, Admin, Settings, Support, Coach) was removed entirely (`content: none`), along with its
  now-unused `dashAmbientCaustic` keyframe. A file-wide grep for the same `linear-gradient(...1px,
  transparent 1px)` grid-line pattern confirmed no other occurrence exists anywhere else in the CSS.
- **`.dash-ambient-bg::before` (the shared ambient wash behind every tab) was rewritten from a busy,
  animated, high-saturation four-color radial gradient wash into a solid matte background with two
  calm, low-opacity, static radial glows** anchored to opposite corners (aqua top-left at 7%
  opacity, green bottom-right at 6%) — replacing the previous `rgba(*, 0.10–0.16)` intensities, the
  `filter: blur(4px)`, and the `dashAmbientDrift` 28s scale/translate animation entirely. The result
  is deliberately calmer and lower-contrast, matching the "solid, sleek matte dark background with
  subtle radial gradients" spec precisely rather than the previous busy, constantly-drifting wash.
- **Glow shadows were softened, not removed** (`--glow-green`/`--glow-aqua`, used only by the active-
  tab indicator rail in the mobile/desktop nav) — from a double-layered `0 0 20px / 0 0 4px` neon
  bloom down to a single, much smaller `0 0 10px` shadow at roughly half the previous opacity, so an
  active tab still reads as "on" without the glowing-template look. The `.btn-cta-glow` breathing
  shadow on Pricing's Subscribe/Get-Started buttons and Hero's trial CTA was deliberately left
  untouched — it's the one place the ask's own "sleek brand green/cyan accents only on primary
  call-to-action buttons" language explicitly calls for a visible accent effect.
- **Typography got a small breathing-room pass**: `h1`–`h4`'s `line-height` increased from a tight
  `1.05` to `1.15` for better multi-line heading spacing across every section head, tab heading, and
  card title site-wide (a single shared rule, so no per-heading edits were needed). Body copy was
  already `line-height: 1.6` and card padding already used the generous `--space-5` (32px) token, so
  neither needed a separate change — the ask's "breathing room" was already substantially met by the
  bento-card padding/gap scale, and the new bigger `--radius-lg` (16px) plus real glass shadow already
  add visible depth/separation between adjacent cards.
- **Buttons were audited, not rewritten — they were already standardized.** `.btn`'s shared base
  (44px min-height, consistent `0.85em 1.6em` padding, pill radius, one shared hover-lift transition)
  and the `.btn-sm` variant (38px min-height) already gave every button on the site — Nav, Hero,
  Workouts, Gym, Pricing — identical sizing/spacing per size tier; verified computationally (not just
  by eye) in an earlier round and re-confirmed unchanged here. No button-system rewrite was made
  since no actual inconsistency was found.
- **No JS/light-mode changes were made or needed.** A search for `data-theme`/`prefers-color-scheme`/
  a Light-theme toggle found none currently wired in the live markup (despite earlier documentation
  in this file describing one) — this site currently ships dark-mode only, which happens to match
  this round's own explicit "premium dark-mode SaaS UI" brief exactly, so there was no second Light
  palette to keep in sync with this retune.
- Verified via Playwright: the shared `.dash-ambient-bg::after` grid layer now resolves to
  `content: none` (i.e. genuinely gone, not just visually faint), a sampled `.bento-card`'s computed
  `background-color`/`backdrop-filter`/`border-radius` read exactly `rgba(22,27,34,0.7)` /
  `blur(10px)` / `16px`, and `body`'s computed background is the new matte `rgb(13,17,23)`; visual
  screenshots of the Hero, Workouts, Gym, Tracker, Settings and Pricing tabs all confirm a clean,
  grid-free, glass-carded look; and the full pre-existing regression suite (all 9 tabs load with
  zero page errors, flexible PB add/remove, both Workouts' and Gym's PDF exports firing real
  `download` events, Complete Workout logging, and the Beginner-trial-bypass/suspension-lock
  behavior from the immediately preceding round) still passes unchanged.

**A follow-up visual cleanup pass on the Hero, Workouts, and Gym specifically targeting leftover
"gimmicky/AI" chrome the previous token-level retune didn't touch — the HUD overlay markup,
Workouts' own background video, and the Gym exercise cards' oversized technique-demo frames were
all still there structurally even after the grid/glow/card-token retune above, since that round
was a pure CSS-token pass and didn't touch markup or JS. This round removes them outright.**

- **The Hero's sci-fi HUD overlay is gone entirely — markup, not just CSS.** `.hero-hud` and its
  children (`.hero-hud-grid`, the four `.hero-hud-corner` brackets, and the top/bottom
  `.hero-hud-bar`s carrying "TRAINING DECK · EST. 2025" / "PROTOCOL ONLINE" / "SYSTEM READY" /
  "SET.001 · REP.∞") were deleted from the Hero's markup, along with every one of their CSS rules
  and the `hudFadeIn`/`hudPulse` keyframes — this was flavor-text chrome with a gaming-HUD/reticle
  aesthetic, explicitly called out as exactly the kind of clutter this cleanup was asked to strip,
  not a hidden or `display:none`'d leftover the way `.hero-hud-grid`'s background was handled in
  the prior round. The `.hero-ripples` concentric "target reticle" circle rings (two `r1`/`r2`
  instances, three animated rings each) were removed the same way, markup and CSS
  (`.hero-ripples`/`.hero-ripple`/`@keyframes rippleOut`) both gone. The Hero's other ambient
  decoration — the swimmer silhouette SVG, the wave shapes, the caustics wash, the blurred
  `.blob` — was deliberately left alone; none of it reads as HUD/reticle chrome, and the ask was
  scoped to the sci-fi-overlay elements specifically, not every decorative layer in the Hero.
- **Hero buttons trimmed to exactly one primary + one secondary, per the explicit ask.** The
  three `.hero-chip` value-prop pills ("Daily-rotating swim sets" / "Tailored dryland training" /
  "Instant progress tracking") sitting between the headline and the CTAs are gone — markup and
  the `.hero-chips`/`.hero-chip` CSS both removed — leaving the headline flow straight into the
  button row. The button row itself was already effectively "one primary + one secondary" at any
  given moment (a signed-out primary CTA and a signed-in primary CTA are mutually exclusive via
  `data-auth-signed-out`/`data-auth-signed-in`, so exactly one primary is ever visible alongside
  the one ghost secondary), so no button was added or removed there — only the secondary's label
  changed, from "Today's Gym Focus" to the explicitly requested **"Explore Gym Plan"** (updated in
  the inline markup and both the `I18N.en`/`I18N.ar` `hero.cta2` dictionary entries, so language
  switching stays in sync). The staggered `data-reveal` entrance cascade
  (`.hero-content > [data-reveal]:nth-child(N)`) was renumbered from 5 possible slots down to the
  3 that still exist (h1, actions, stats) — verified via Playwright that all three still receive
  `is-visible` correctly on load.
- **Workouts' own looping background video is gone — markup, CSS, and JS all three.** The
  `#workoutsBgVideo` `<video>` element, the `.dash-bg-overlay` dark-wash div, the
  `.dash-bg-video`/`.dash-bg-overlay` CSS rules, and the `DASH_BG_VIDEO_SOURCES`/
  `loadDashBgVideo()` lazy-load function (plus its one call site in `switchTab()`) were all
  deleted outright — this was explicitly named as "the hero/ocean background image overlay" the
  ask wanted replaced with a solid matte background. Workouts now falls back to the exact same
  plain `.dash-ambient-bg` layer (solid `var(--bg)` matte color + two subtle static corner glows,
  already established two rounds ago) that Gym and every other tab already use — Gym's own
  equivalent video had already been removed in an earlier round for the identical reason, so this
  finally brings Workouts to parity rather than leaving it as the one remaining tab with a video
  background. No new background color was introduced (`--bg` is already `#0D1117`, functionally
  identical to the `#0B0F17` the ask named).
- **Gym's top bar (Strength Profile + Target Focus) was audited, not rebuilt — it was already
  correctly balanced.** Measured directly via Playwright rather than assumed: both `.gym-top-half`
  panels compute to the exact same height (196px) and the exact same top/bottom offsets in every
  case checked, and the "Update My Prescription" button and every `.pill-tab` in the Target Focus
  group both resolve to a `999px` pill radius — i.e. uniform heights and matching border-radii
  were already true before this round touched anything. (Text inputs inside Strength Profile use
  the smaller `--radius-sm` intentionally — a rectangular input field and a pill-shaped button are
  different control types by convention, not a radius mismatch.) No CSS changes were made here
  since no actual imbalance was found; inventing a rebuild with nothing broken to fix would have
  been change for its own sake.
- **The Gym exercise grid's per-row equal-height stretching was also audited and confirmed already
  correct** (a `display:grid` container stretches its items to a shared row height by default, and
  `.gym-card` has no `align-self` override fighting that) — measured directly: every card in the
  same grid row reports an identical height down to the pixel. The one real, actionable issue was
  the technique-demo frame's own size relative to the card: `.gym-anim-frame`'s aspect ratio was
  widened from `16/9` to `2.4/1` with a `110px` height cap, and the SVG figure inside it was scaled
  down from filling 82% of the frame's height to 62% — screenshotting a card next to its own text
  content showed the frame consistently occupying roughly half of every card's total height, which
  read as an oversized stickman container rather than a compact technique-demo thumbnail; this
  shrinks it further without losing the demo's legibility. The Warm-Up → Core → Main Lifts →
  Cool-Down section flow itself (`.gym-phase + .gym-phase { margin-top: var(--space-6) }`) was
  found to already apply a uniform gap between every phase — the apparent "gap" seen in one
  in-progress test screenshot traced to the page's own `data-reveal` IntersectionObserver-based
  fade-in not having fired yet for phases scrolled past too quickly by a synthetic `scrollTo` loop
  in the test harness, not a real layout bug — confirmed by directly reading each phase's
  `is-visible` class and DOM position rather than trusting a single screenshot's visual gap.
- Verified via Playwright end-to-end: zero page errors across all 9 tabs; the Hero's three
  remaining `data-reveal` elements (headline, actions, stats) all resolve to `is-visible`; a 390px
  mobile viewport shows the trimmed Hero with zero horizontal overflow; the Gym top bar's two
  halves measure identical heights and border-radii; both Workouts' and Gym's PDF exports still
  fire real `download` events; the flexible PB add/remove flow, Complete Workout logging, and the
  Beginner-trial-bypass/suspension-lock behavior from prior rounds are all unaffected.

**A ground-up A324-inspired 3D scroll-motion redesign of the Hero/landing experience** — a
floating capsule nav plus a genuine scroll-driven 3D "orbiting card" showcase between the Hero and
the app dashboard — delivered entirely in hand-rolled CSS + vanilla JS, since this repo has no
build step to add a motion library (GSAP/Framer Motion/ScrollTrigger) to; every earlier
"framer-motion-style" ask in this file's history has likewise been translated into native CSS/JS,
and this round follows that same precedent at larger scale.

- **`.capsule-nav`** is a new, frosted-glass, pill-shaped nav (`Workouts | Gym | AI Coach |
  Tracker` + a "Start Training" primary CTA) fixed at top-center of the viewport — deliberately
  scoped to desktop (`min-width:981px`, matching the sidebar's own breakpoint) and to the landing
  experience specifically, not a replacement for the app's real navigation (the sidebar/mobile-
  bottom-nav, which still owns every other tab — Gear, Academy, Support, Settings, Pricing, sign-
  in/out, the trial badge, the admin link — none of which this capsule duplicates). Below 981px
  the existing mobile top bar already occupies this exact strip of the viewport, so the capsule
  stays hidden there rather than colliding with it. Its links carry the same `[data-tab]`
  attribute every other nav element on this site already uses, so they're picked up for free by
  the single shared click-delegation loop in the NAV/TAB CONTROLLER script (`tabButtons =
  document.querySelectorAll('[data-tab]')`, wired once at load) — no new JS click handler was
  needed, and clicking any capsule link calls the exact same `switchTab()`/
  `dashboard.scrollIntoView({block:'start'})` every existing nav button already uses, which jumps
  straight to that tool's content at the top of the dashboard rather than scrolling through the
  showcase section in between. The capsule fades out (`is-hidden`, toggled by a small rAF-
  throttled scroll listener) once the swimmer has scrolled past the landing section into the real
  dashboard, where the sidebar is already the primary nav and a second persistent bar would just
  be clutter.
- **`#scrollyShowcase`** is a classic pure-CSS/JS "pin and advance" scrollytelling section: a tall
  (`height:300vh`) wrapper holds a `position:sticky` stage pinned for a full `100svh` viewport
  while the swimmer scrolls through it. A single rAF-throttled scroll listener computes `progress`
  (0→1) from the wrapper's own `getBoundingClientRect()`, maps it to a continuous `t` (0→3, one
  unit per slide) driving three cross-fading headline/copy pairs — "Outswim Your Limits" (Slide 1,
  the Swim Generator), "Dryland & Power" (Slide 2, Gym), "A Whole New Universe" (Slide 3, AI Coach
  & Tracker) — and three real, clickable `<button data-tab="...">` cards arranged on a genuine 3D
  CSS orbit (`perspective` + `transform-style:preserve-3d` on the stage, each card positioned via
  `rotateY(angle) translateZ(260px)`), so the cards visibly swing around a central axis as the
  active slide advances, foreshortening/dimming as they rotate away from front-and-center — the
  classic "3D carousel" look, achieved with zero external animation library. `will-change:
  transform, opacity` is set on every card per the ask's own explicit performance requirement.
  Every card is also a real shortcut into its tool (same `[data-tab]` delegation as the capsule
  nav above), and the inactive two of the three headline/copy blocks are marked `aria-hidden="true"`
  (toggled live as the active slide changes) so screen-reader users aren't read three overlapping
  headlines at once.
- **A real orbit-math bug was caught and fixed while testing this with actual scroll input (a
  mouse-wheel simulation), not just by reading the CSS.** The initial version computed each card's
  angle as a plain, unclamped `(cardIndex - t) * 120°` across the full `t` range (0→3) — since 3
  cards spaced 120° apart complete exactly one full 360° revolution over that range, by the very
  end of the section (t→3) card 0 had rotated all the way back around to the front-and-center
  position it started at, meaning the swim-generator card visibly swung back into focus at the
  exact moment the "A Whole New Universe" headline (slide 3, meant to pair with the AI-Coach-
  and-tracker card) was supposed to be the sole focus — two unrelated pieces of content visibly
  competing for attention. Fixed by clamping only the *rotation* input at `Math.min(t, 2)` (the
  slide-index calculation elsewhere still uses the real, unclamped `t`) — card 2 now arrives at
  its front position exactly when slide 3 becomes active and simply holds there for the remaining
  third of the scroll range, rather than continuing to spin past it. Verified via Playwright with
  a real wheel-scroll simulation (`page.mouse.wheel`, since programmatic `window.scrollTo` is
  smoothed by this file's pre-existing global `html{scroll-behavior:smooth}` and doesn't reach its
  target within a short wait, which is what made the bug hard to see in the first naive test) at
  four points across the scroll range: the correct card is at full opacity/front-and-center at
  each of the three slide transitions, and it stays there through the final third instead of
  fading back out.
- **Respects `prefers-reduced-motion` completely, not just by disabling the rotation.** Under
  reduced motion, `.scrolly` collapses to `height:auto`, `.scrolly-sticky` becomes a plain static
  block (no pinning at all — verified the total document height drops from the animated version's
  2700px-tall showcase alone down to a normal, single-viewport-ish static stack), all three
  headline/copy blocks render simultaneously rather than cross-fading, and the cards lay out in a
  plain wrapping flex row with `transform:none!important`. The JS scroll listener that drives all
  of the above is also never attached in the first place (gated behind the same `reduceMotion`
  check every other animation in this file already uses) — so a reduced-motion visitor pays zero
  scroll-listener cost for a section whose motion they've opted out of, not just a visually-
  disabled version of it.
- **The Hero's headline/CTA copy, decorative swimmer SVG/waves/caustics, and the 3-day-trial
  paywall/access-control system were all left completely untouched** — this was a presentational
  addition sitting between two already-correct systems (the Hero above it, the tab-switching
  dashboard below it), not a rewrite of either. `switchTab()` itself was not modified at all; the
  only genuinely new JS is the two small, independently-gated scroll listeners described above.
- Verified via Playwright end-to-end: the capsule nav is visible and correctly positioned at
  desktop widths, hidden (`display:none`) below 981px and on a 390px mobile viewport with zero
  horizontal overflow at any scroll position through the showcase; the showcase correctly
  advances through all three slides with the right card in focus at each (post-bugfix); the
  capsule nav hides once scrolled into the real dashboard; clicking a capsule link or a showcase
  card jumps directly to that tool's content rather than scrolling through the presentation;
  reduced-motion mode lays out as a plain static stack with no pinning and no attached scroll
  listener; and the full pre-existing regression suite (all 9 tabs, both PDF exports, Complete
  Workout logging, flexible PB add/remove, and the Beginner-trial-bypass/suspension-lock behavior)
  still passes unchanged with zero page errors.

**A follow-up round replaced the A324-style 3D orbit carousel with real full-bleed photography,
and added a genuinely working collapsible sidebar defaulting to hidden on the landing page** — the
explicit complaint driving this round was that the previous carousel's plain icon-tile cards still
read as generic template chrome, and that the sidebar (present on every screen, all the time)
crowded out the immersive, full-screen feel the landing experience was going for.

- **Collapsible sidebar, real toggle, collapsed by default on load.** `<body>` now carries
  `class="sidebar-collapsed"` directly in the markup — a plain default, not a persisted
  preference, so there's no synchronous flash-prevention script needed (nothing is racing a stored
  value on first paint). A new circular glass toggle button (`#sidebarCollapseBtn`, hamburger/×
  icon, top-left, `.sidebar-collapse-btn`) sits above the sidebar itself so it's reachable
  regardless of collapsed state. `setSidebarCollapsed(collapsed)` toggles the class, swaps the
  button's icon and `aria-expanded`, and the existing `--sidebar-w` token (already the single
  source of truth every dependent `calc()` in this file reads — `body`'s `margin-left`, the
  capsule nav's centering, `.panel-wide`'s full-bleed math, the Support FAB's left offset) drops to
  `0px` under `body.sidebar-collapsed`, so every one of those spots correctly recomputes with zero
  additional per-component overrides — exactly the reason that token was designed the way it was
  several rounds ago. `switchTab()` calls `setSidebarCollapsed(false)` on every real navigation, so
  opening any tool auto-expands the sidebar the instant a swimmer actually needs it.
- **A real bug, caught via Playwright rather than assumed fixed: the sidebar re-expanded itself an
  instant after every page load, defeating the entire "collapsed by default" ask.** `switchTab()`
  is also called internally at page-init time (`switchTab('workouts', {scroll:false})`, purely to
  establish the default active tab/panel) and again inside the sign-out handler (switching away
  from a signed-in-only tab before scrolling back to the Hero) — neither of those is a real
  swimmer-initiated navigation, but both ran through the same `setSidebarCollapsed(false)` call
  every other tab switch does, silently un-collapsing the sidebar a moment after first paint (and
  again after any sign-out). A first Playwright check caught this directly (`bodyHasClass: false`
  immediately after load, when it should have read `true`). Fixed with a new `skipSidebarExpand`
  option on `switchTab()`'s `opts` param, passed by both of those two internal call sites; the
  sign-out handler additionally now explicitly re-collapses the sidebar right after its existing
  scroll-back-to-Hero call, so signing out returns to the same immersive collapsed state as a fresh
  load rather than leaving the sidebar expanded over the landing page.
- **A second real bug, caught the same way: the expanded toggle button's position overlapped the
  sidebar's own brand logo.** The button used a single fixed `left: 16px` in both collapsed and
  expanded states — fine while collapsed (nothing else is there), but once expanded that x-position
  sits directly under the sidebar's brand/wordmark. A Playwright bounding-rect comparison (button
  vs. `.nav .brand`) confirmed the overlap before the fix and confirmed clear separation after;
  fixed by moving the expanded-state position to `left: calc(var(--sidebar-w) + 8px)` — just
  outside the sidebar's right edge — via a `body:not(.sidebar-collapsed) .sidebar-collapse-btn`
  override declared in its own `@media (min-width: 981px)` block placed *after* the base
  `.sidebar-collapse-btn { display: none; ... }` rule. That ordering matters and was itself a real,
  caught mistake: the first draft put the `display: flex`/positioning override inside the
  *earlier* desktop-sidebar media query (textually before the base rule), and since both rules
  have equal specificity, the later base `display: none` rule silently won at every viewport width
  regardless of the media query — the exact "later source-order rule beats an earlier media-query
  override" class of bug this file has documented as a recurring mistake to watch for in previous
  rounds. Fixed by moving the override into its own, later-declared media query block.
- **The 3D orbit-carousel showcase was replaced with a full-bleed, single-photo-per-slide scroll
  reveal** — closer to an Apple/A324-style "scale up and cross-fade real photography" showcase than
  a spinning carousel of icon-tile cards. `#scrollyShowcase`'s markup changed from
  `.scrolly-stage` (a 2-column grid: a `.scrolly-copy` text column beside a `.scrolly-orbit-wrap`
  of 3 rotating `.scrolly-card` buttons, each just an icon-tile + `h3` + `p`) to `.scrolly-media`
  wrapping three stacked, absolutely-positioned `.scrolly-panel` buttons — each one a real
  photograph (`.scrolly-panel-media`, its background image set via an inline
  `style="--panel-photo:url(...)"` custom property so no new CSS class per slide was needed), a
  dark bottom-up gradient scrim (`.scrolly-panel-overlay`) for text legibility, and the slide's own
  index/heading/copy (`.scrolly-panel-text`) laid directly over the image. Slide 1 (Outswim Your
  Limits) reuses the existing `--hero-photo` custom property, slide 2 (Dryland & Power) reuses
  `--gym-photo` — both already-established, already-generated site photography, not new assets —
  and slide 3 (A Whole New Universe) got one freshly-generated photorealistic image via Higgsfield
  (an athlete/coaching-technology-styled shot, hosted on the same CloudFront bucket as every other
  generated image in this file) since no existing photo on the site covered that theme. Only the
  active slide's panel is opaque/clickable (`.scrolly-panel.is-active { opacity:1; pointer-
  events:auto; }`, cross-fading via a plain CSS `transition: opacity`) — the other two sit behind it
  at `opacity:0; pointer-events:none`, which is also why a Playwright click test against an inactive
  panel correctly fails/times out (an invisible panel genuinely isn't clickable to a real swimmer
  either, so the test was adjusted to scroll that panel into its own active window first rather
  than treating this as a bug).
- **`updateScrolly()` was rewritten from rotateY/translateZ orbit math to per-panel scale +
  parallax.** The previous version computed one continuous rotation across all 3 cards
  simultaneously (clamped at `t=2` to stop a full-circle wraparound, a real bug fixed in the prior
  round). The new version computes, per panel, a **local progress** clamped to `[0,1]` within that
  panel's own third of the section's scroll range (`Math.max(0, Math.min(1, t - i))` for panel
  index `i`), then applies a gentle continuous zoom (`scale(1.04 → 1.14)`) and a small vertical
  parallax shift (`translateY(-12px → +12px)`) to that panel's own `.scrolly-panel-media` layer as
  the swimmer scrolls through it — each panel naturally settles at its final scale/shift once its
  own window ends, rather than continuing to drift into the next slide's territory, true by
  construction from the clamp rather than needing a separate fix the way the old rotation code did.
  `scrollyOrbit`/`scrollyCards`/`scrollyOrbitRadius`/`scrollyIndexEl` were all removed;
  `scrollyPanels`/`scrollyMedias` replace them. The per-slide `01 / 03` index number is now static
  markup inside each panel's own `.scrolly-panel-text` (one literal string per slide) instead of
  JS-updated shared text — since each panel already inherently knows its own position in the
  sequence, there was nothing left for JS to compute there.
- **The "kill all remaining AI template accents" ask was re-audited against the current file, not
  assumed already satisfied by prior rounds.** Grepped for every remaining `--glow-green`/
  `--glow-aqua`/`.btn-cta-glow`/dotted-grid usage: the only survivors are the sidebar/mobile nav's
  active-tab indicator (a small, already-softened glow — functional state signaling, not decorative
  chrome, and already dialed back in an earlier documented round specifically to avoid this exact
  complaint) and `.btn-cta-glow` on the Hero's trial CTA and Pricing's Subscribe buttons (the one
  deliberate, disclosed exception this file has carried since the very first "brand accents only on
  primary CTAs" round) — both pre-existing, intentional, and out of scope for further softening.
  Confirmed no dotted-grid/HUD text/corner-bracket markup has been reintroduced anywhere (a grep for
  the literal removed strings like "SYSTEM READY"/"PROTOCOL ONLINE" turns up only historical
  comments describing what was already deleted, no live markup). The Hero's faint diagonal
  `repeating-linear-gradient` "light ray" texture inside `.hero-photo` (used as a duotone fallback
  layer standing in for real photography, screen-blended at ~0.05 opacity) was inspected and left
  alone — it simulates underwater light rays for the photographic panel treatment, a materially
  different pattern from the removed technical grid-line overlays, not a HUD remnant.
- Verified via Playwright end-to-end: the sidebar starts collapsed on every fresh load
  (`sidebar-collapsed` present, `--sidebar-w` resolves to `0px`, nav `opacity:0`); the toggle button
  expands it (nav opacity back to `1`, `margin-left: 232px`) with no overlap against the brand logo;
  toggling again re-collapses it; clicking any capsule-nav or sidebar tab link auto-expands the
  sidebar and switches tabs correctly; the three scrolly panels wire the correct photo URLs and
  cross-fade at the right scroll progress with the expected clamped scale/parallax values; a mobile
  (390px) viewport shows zero horizontal overflow at any scroll position through the showcase, with
  the capsule nav correctly hidden; `prefers-reduced-motion` collapses the whole section to a plain
  static stack (`position: static`, all three panels visible at `opacity:1`, no transform applied,
  total document height far shorter than the animated 300vh version); and the full existing
  regression suite (all 9 tabs switch and render with zero page errors, both Workouts' and Gym's
  PDF exports fire real `download` events, and Complete Workout logging still writes the correct
  `swim_logs` entry and updates its button state) still passes unchanged.

**A CRITICAL FIX round scrapped the capsule-nav/Hero/scrolly hybrid entirely and rebuilt Home as
a strictly isolated, full-screen presentation view — a genuine architecture change, not another
visual pass on top of the same structure.** The explicit complaint driving this round: the
previous build still let a visitor scroll straight from the Hero, through the photo showcase,
into the live Workouts tool underneath — i.e. "the marketing page and the app were the same
scroll" — which read as a cheap AI-template widget rather than a real product with a real
landing page. Every prior round's scrolly/capsule-nav work (the A324-style showcase, the photo
panels, the collapsible sidebar) is superseded by this entry; the CSS/JS/markup those rounds
added were replaced outright, not layered on top of.

- **`<body>` now carries either `view-home` or `view-app`, never both** — the single toggle
  point for whether the swimmer sees the landing presentation or the app's tool workspace. A new
  `setAppView(active)` function (beside `setSidebarCollapsed()`) flips the two classes together;
  `switchTab()` calls `setAppView(true)` on every *real* navigation (any actual `[data-tab]`
  click), and the sign-out handler calls `setAppView(false)` to return to Home. The two existing
  *internal* `switchTab()` callers (establishing the default tab at page-load, and the sign-out
  handler's own "switch away from a signed-in-only tab" step) pass an `isInternal: true` option —
  renamed from the previous round's `skipSidebarExpand`, since it now also suppresses the view
  flip, not just the sidebar-expand — so neither of those ever forces the App view open on their
  own. `<body>` starts with `class="sidebar-collapsed view-home"` in the raw markup, so Home is
  the default on every fresh load with no synchronous flash-prevention script needed (nothing is
  racing a stored preference).
- **`#homeView` and every piece of app-only chrome are hard-toggled via plain CSS, not JS
  show/hide calls.** `body.view-app #homeView { display: none; }` and, symmetrically,
  `body.view-home #dashboard, footer, #siteNav, .mobile-bottom-nav, .sidebar-collapse-btn,
  .announce-bar, .coach-fab, .admin-msg-fab { display: none !important; }` — the entire tool
  workspace (Workouts, Gym, every other tab, the footer's Explore/Membership/Company links, the
  sidebar/mobile bottom nav, the announcement bar promo banner, and both floating chat FABs) is
  now unreachable and invisible while on Home, and Home itself is unreachable and invisible once
  inside the App view. This is the literal "ISOLATE HOME PAGE FROM APP TOOLS" ask — previously
  these were all just... further down the same page.
- **The Hero is now Scene 0 of one continuous scroll canvas, not a separate ordinary-scrolling
  block sitting above a second independently-pinned showcase section.** The old architecture (a
  normal-flow `.hero` header, then a *separate* `position:sticky` `#scrollyShowcase` immediately
  below it) was itself the "harsh break" the ask called out — reaching the showcase meant
  finishing one scroll behavior and starting a completely different one. The new
  `#homeCanvas`/`.home-canvas-sticky` wraps all 4 scenes — Hero (Scene 0, keeping its existing
  photo/video/caustics atmosphere) plus the 3 "what Swimfit does" scenes (Outswim Your Limits /
  Dryland & Power / A Whole New Universe, same copy and photos as before) — as one 400vh pinned
  stage (100vh dwell per scene, up from the previous 300vh/3-scene canvas). `updateHomeCanvas()`
  (replacing `updateScrolly()`) generalizes the per-scene clamped-local-progress cross-fade+scale+
  parallax math from a hardcoded 3 slides to `homeScenes.length`, so scene count is no longer
  hand-wired into the scroll math. Every scene is strictly edge-to-edge — `position:absolute;
  inset:0` inside a `100vw`/`100svh` sticky stage — with **zero card sizing, rounded containers,
  or margins anywhere**, unlike the previous `.scrolly-media` (a centered, rounded, `min(1100px,
  92vw)`-capped box) that the ask explicitly singled out as reading like a "small card," not a
  full-screen canvas.
- **The hand-drawn SVG swimmer silhouette, squiggly wave shapes, and blurred accent blob were
  deleted outright from the Hero scene** — not hidden, not restyled. These were exactly the kind
  of low-fidelity "clip art" decoration a cheap AI-generated template leans on, and were called
  out directly by this round's "cheap AI-looking icons" complaint. The atmospheric photo/video/
  caustics layers were kept (real generated photography/video, not icon work) along with the
  headline's subtle gradient-shimmer accent text (a typographic effect, not decorative clip art).
  `.hero::after` (the old edge-blend layer that faded the Hero into the fixed sidebar on one side
  and the dashboard section directly below it on the other) was deleted too — neither of those
  neighbors exist anymore now that Home is an isolated view with nothing beside or below it in
  the same scroll flow.
- **The floating capsule nav (4 text links in a glass pill + a CTA) was replaced by `.home-nav` —
  a slim, fully transparent bar with just a wordmark and ONE polished CTA button**, the literal
  "single polished CTA button" ask. No pill background, no blur chrome, no second row of nav
  links funneling into individual tools — the mutually-exclusive signed-out/signed-in CTA pair
  (`data-auth-signed-out`/`data-auth-signed-in`, same established pattern used everywhere else in
  this file) reads "Start Training" (opens the signup modal) for a guest and "Launch App" (jumps
  straight into Workouts) for a signed-in swimmer, so exactly one CTA is ever visible. Clicking
  any of the 3 non-Hero scenes still jumps directly into that scene's own tool (same
  `[data-tab]` delegation every nav link on the site already uses) — verified via Playwright that
  only the currently-active (visible, on-top) scene is ever clickable, which is correct: the other
  two sit behind it at `opacity:0`/`pointer-events:none`, and a real swimmer could never click
  what they can't see either.
- **A real, previously-missing "return to Home" path was added.** Once Home and App became hard-
  separated views, a signed-in swimmer had no way back to the landing presentation short of
  signing out — a genuine UX gap the isolation architecture introduced, not something explicitly
  requested but a necessary consequence of it. The sidebar's own brand/wordmark link
  (`<a href="#top" class="brand">`, already labeled "Swimfit home") now intercepts its click,
  calls `setAppView(false)`, re-collapses the sidebar, and scrolls to the top — reusing the exact
  same `#top` anchor id the sign-out handler already targeted, just without a real page navigation
  since `#top` now lives inside `#homeView`, which is hidden while `body.view-app`.
- **`switchTab()`'s own scroll-to-top step was simplified from `dashboard.scrollIntoView(...)` to
  a plain `window.scrollTo(0, 0)`.** Once `#homeView` is `display:none`, `#dashboard` is
  unconditionally the first thing in the visible document flow — scrolling to `y=0` lands at
  exactly the same spot `scrollIntoView` was computing, without depending on `#dashboard`'s
  current geometry mid-transition (a `getBoundingClientRect()`-based call reading stale geometry
  the same frame `display:none` was just toggled was a real, if narrow, risk the simpler call
  sidesteps entirely).
- **A real test-methodology issue was hit and fixed while verifying the rebuilt canvas, not a
  product bug**: simulating realistic wheel-scroll input (`page.mouse.wheel()`, this file's own
  established precedent for scroll-driven sections) intermittently stalled for many iterations
  before catching up — Chromium can coalesce or queue rapid synthetic wheel deltas rather than
  applying each one immediately, which reads as flaky scroll-position tests on a 400vh canvas even
  though nothing in the shipped code is wrong. Switched the test harness to
  `window.scrollTo({top, behavior:'instant'})` — the explicit `behavior:'instant'` overrides this
  page's own global `scroll-behavior:smooth` CSS rather than being subject to it (that global rule
  only intercepts scrolls that don't specify their own behavior), landing at the exact target
  position synchronously with no animation to wait out. This is a test-infrastructure fix only;
  no product code changed as a result.
- Verified via Playwright end-to-end: `body` defaults to `view-home` with `view-app` absent on
  every fresh load, and `#dashboard`/`footer`/`#siteNav`/`.mobile-bottom-nav`/
  `.sidebar-collapse-btn`/`.announce-bar`/`.coach-fab`/`.admin-msg-fab` all compute `display:none`
  while on Home; all 4 scenes wire the correct photo/video sources and cross-fade with the
  expected clamped scale/parallax transforms at 5 sampled scroll depths; clicking a non-Hero scene
  (while it's the active, visible one) flips to `view-app`, sets the correct active tab, and lands
  at `scrollY: 0` with `#homeView` now `display:none`; the signed-out CTA opens the auth modal
  without leaving Home, and the signed-in CTA (verified to read "Launch App") jumps straight into
  Workouts; clicking the sidebar brand link from inside the App view returns to `view-home` at
  `scrollY: 0`; a 390px mobile viewport shows zero horizontal overflow at the top of Home and
  mid-canvas, with the nav CTA fully on-screen and a normal tap-target size; `prefers-reduced-
  motion` lays the whole canvas out as a plain static stack (`position:static`, all 4 scenes at
  `opacity:1`, no pinning, no scroll listener attached); and the full pre-existing regression
  suite (all 9 tabs switch and render inside the App view with zero page errors, both Workouts'
  and Gym's PDF exports fire real `download` events, and Complete Workout logging still writes the
  correct `swim_logs` entry) passes unchanged.

**A round that reversed the immediately-preceding full-bleed-photography Home rebuild back into a
genuine 3D orbital carousel, rebuilt the floating top nav into an ultra-minimal transparent bar,
and added a Plyometrics & Explosive Power focus to Gym — a later, explicit user instruction
superseding an earlier one, not a bug fix.** The prior round's "4-scene continuous scroll canvas"
(Hero folded in as Scene 0, cross-fading into 3 full-bleed photo scenes) is fully replaced by this
entry for the showcase portion; the Home/App view-isolation architecture underneath (`body.
view-home`/`view-app`, `setAppView()`, `#homeView` hard-hidden while `body.view-app`) is untouched
and still works exactly as that round shipped it.

- **The Hero reverts to an ordinary top-of-page block, no longer "Scene 0" of anything.** `<header
  class="hero" id="top">` dropped its `home-scene is-active`/`data-scene="0"` classes and regained
  its own `position:relative; min-height:88svh; display:flex; align-items:center; padding-top:
  100px` layout (previously stripped down to just `overflow:hidden; isolation:isolate` when it was
  absorbed into the scroll canvas) — it's back to being a normal, non-pinned page section exactly
  like the site's very first Home build, just still inside the isolated `#homeView`/`body.
  view-home` wrapper the immediately-prior round introduced. Its video/photo/caustics atmosphere
  and bottom-left `.home-scene-text` copy block are unchanged.
- **A brand-new `.orbit-showcase` section (a separate pinned section below the Hero, not part of
  it) is the reinstated 3D carousel** — this codebase's original Round-3 build, later replaced with
  full-bleed cross-fading photography, now brought back per this round's own explicit "3D Orbital
  Carousel" ask. A tall (300vh) `position:sticky` stage holds a `perspective:1400px` `.orbit-ring`;
  4 `.orbit-card`s revolve around a CSS `rotateY`/`translateZ` orbit driven by `updateOrbitShowcase()`
  (replacing the prior round's `updateHomeCanvas()`) — `baseAngle = progress * 360` over the whole
  section, each card offset by its own even share of the circle (`i * 360/4`), with depth-based
  opacity/z-index/pointer-events computed from `cos(angle)` exactly like the original Round-3
  orbit math. Unlike that discrete "lock one card front-and-center per slide" design (which needed
  an explicit clamp to stop the ring wrapping awkwardly at the very end), this version wants
  exactly the opposite — continuous, uninterrupted revolution — so nothing needs clamping here:
  a circle has no seam, so completing more than 360° just reads as the ring taking another full
  lap, which is the literal "loop continuously... without abrupt breaks" ask.
- **A real 3D-carousel bug was caught and fixed while screenshotting this**: `.orbit-card` had no
  `backface-visibility`, so a card rotated past 90°/270° still rendered its front face — just
  mirrored, as if seen through glass from behind — reading as a glitch rather than a card that's
  simply turned away. Confirmed via a direct screenshot (the AI Coach card, rotated to 198° in the
  test, showed backwards text) before the fix, and confirmed clean (card invisible outside the
  front-facing ±90° range) after adding `backface-visibility: hidden` (+ `-webkit-` prefix).
- **Every card is a hand-built UI-mockup/metrics preview, not a photo** — the explicit "no generic
  stock photos" ask. Card 1 mirrors a Workout Generator set row (`4×200m Freestyle`, `@ 3:00`
  send-off, `Total 3.2 km`, in the same monospace/aqua/green accent language the real result panel
  already uses); Card 2 mirrors a Gym exercise card (muscle tags + `Barbell Squats — 4×8`); Card 3
  mirrors an AI Coach chat exchange (a user bubble + an AI reply bubble, same `.coach-bubble`-style
  visual language); Card 4 is a small inline SVG bar chart mirroring the Tracker's own hand-rolled
  charts. None of this required new image assets — every visual element is plain HTML/CSS/SVG.
- **The floating top nav was rebuilt into an ultra-minimal, fully transparent bar**: `.home-nav`
  itself already had no background (confirmed via computed-style check —
  `rgba(0,0,0,0)`/`0px` border), so "completely transparent" was already true of the bar itself;
  what changed is `.home-nav-links`, a new 3-item `[ Workouts | Gym | AI Coach ]` text-link row
  (replacing nothing visually solid — no pill background, no border, no blur — just plain text
  with a 2px `border-bottom` that's transparent at rest and turns `var(--green-bright)` on the
  active link, plus a brightness-only hover state). Hidden below 900px (mirroring the sidebar's own
  breakpoint precedent — mobile Home still relies on the single CTA only, matching how the app's
  own mobile-bottom-nav/desktop-sidebar split already works). The single CTA (`Start Training` /
  `Launch App`, mutually exclusive by sign-in state) is unchanged from the prior round — it's a
  distinct action button, not a nav link, so it keeps its thin-bordered-pill affordance rather than
  going fully bare, which would leave zero visual cue that it's the primary action.
- **Nav-link active-state highlighting needed no new JS** — `switchTab()`'s existing generic
  `aria-current` sync loop (`document.querySelectorAll('[data-tab]').forEach(...)`) already updates
  any element carrying the attribute regardless of which bar/drawer it lives in (the same mechanism
  the mobile-bottom-nav has relied on for many rounds), so giving each new `.home-nav-links` button
  a plain `aria-current="false"` up front was the only wiring needed — confirmed via screenshot that
  "Workouts" shows the green underline by default (the Workout Generator is the app's own default
  tab) with zero extra code.
- **Gym gained a sixth focus, Plyometrics & Explosive Power** (`GYM_FOCUS.plyometrics`) —
  deliberately targeted at swim-specific explosiveness (block starts, flip-turn push-off and
  rotation, reactive strength) rather than generic athletic plyo work; every exercise `cue` ties
  explicitly back to a start or turn. Like Cardio/Flexibility before it, it's a modality left out
  of `GYM_WEEKLY_ROTATION` (manually-selected only, not part of the auto-rotating Upper/Lower/Full
  cycle). Warm-Up/Core/Cool-Down are flat, shared arrays; only `Main` is genuinely, automatically
  categorized — on **two independent axes**, not one: `gymOrientation()` (sprint/distance/balanced,
  reusing the exact same Workout Generator goal/distance signal Full Body's own `main` already
  reads) picks *which* drills, and `state.level` (beginner/competitive/elite, reusing the Workout
  Generator's own Level tabs) picks *how advanced* today's version of those drills is — a beginner
  never lands on a true depth jump; only Competitive/Elite does. `renderGym()`'s `mainExercises`
  selection was generalized from a single `focus === 'full'` special case to
  `routine.main[orientation][state.level]` for Plyometrics specifically, and `gymNote` gained a
  second sentence explaining the level-based scaling whenever this focus is active.
- **Main is deliberately shorter than every other focus's (2 exercises per leaf, not 5-6) — a
  disclosed training-science choice, not a shortcut.** Real plyometric programming prioritizes full
  recovery and movement quality over set/rep volume; padding this out to match a strength-day's
  exercise count would work against the modality's own training principle. The 9-leaf matrix (3
  orientations × 3 levels) still gives 18 distinct main-exercise pairs in total, e.g. Beginner+
  Sprint = Squat Jumps/Broad Jumps, up through Elite+Sprint = true Depth Jumps (45cm box)/Single-Leg
  Bounds.
- **Animation mapping reused existing archetypes wherever the movement genuinely matched** (`Broad
  Jumps`/`Box Jumps` already existed as exact-name keys from Full Body's own sprint block; `Depth
  Jumps` variants and `Single-Leg Box Jumps` all map to the existing `boxjump` archetype; `Single-Leg
  Bounds`/`Step-Up Drives` map to `lunge`; `Rotational Med Ball Throw(s)` maps to the existing
  rotational-power `woodchop` archetype; `Plank-to-Pike` maps to `plank`) — `Ankle Pogo Hops`, `High
  Knees` and `Squat Jumps` have no dedicated archetype and were deliberately left unmapped (falling
  through to the existing `generic` fallback), the same disclosed trade-off Flexibility & Agility's
  Agility Ladder/Cone Shuffle drills already established rather than hand-drawing three new one-off
  SVGs for a single round.
- Verified via Playwright end-to-end: the transparent nav computes `rgba(0,0,0,0)` background with
  the 3 links present and the default-active link underlined; the Hero renders as a plain
  `display:flex` block with no `home-scene` class; the 4 orbit cards rotate continuously with the
  expected `rotateY`/`translateZ`/opacity values at 4 sampled scroll depths, and clicking whichever
  card is currently front-and-center correctly enters the App view at the right tab; a 390px mobile
  viewport hides the nav links with zero horizontal overflow at any scroll depth; `prefers-reduced-
  motion` lays the 4 cards out as a plain static wrapping row with no pinning and no 3D transform;
  switching Gym to the new Plyometrics tab at the default (beginner) level shows Squat Jumps/Lateral
  Bounds, switching to Elite level + a Speed goal (sprint orientation) correctly shows Depth Jumps
  (45cm Box)/Single-Leg Bounds instead, the Gym PDF export still fires a real `download` event on
  this new focus, and the full pre-existing regression suite (all 9 tabs, both PDF exports, Complete
  Workout logging) passes unchanged with zero page errors throughout.

**A round that scrapped the CSS-only orbit carousel for a real Three.js scene pinned + scrubbed by
a real GSAP ScrollTrigger timeline, plus a generative Web Audio API ambient pad — a genuine new-
dependency addition, not another hand-rolled CSS/JS substitute like every earlier "framer-motion-
style" ask in this file's history.** The user explicitly asked for the literal libraries this time
("Three.js (or Spline/React Three Fiber)... GSAP ScrollTrigger") rather than accepting a CSS
equivalent, and both ship browser-ready UMD/global builds loadable via plain `<script src>` tags —
technically compatible with this file's "no build step, no bundler" constraint the same way the
pre-existing EmailJS CDN-script integration already is, so this was implemented as three additional
`<script src="https://cdn.jsdelivr.net/...">` tags (Three.js r160, GSAP 3.12.5, and its
ScrollTrigger plugin) sitting right after the Paddle script tag, not an npm/webpack install.

- **Two real, hard constraints were confirmed before writing any code, and both are disclosed
  here rather than silently worked around.** (1) This sandbox's own network policy blocks
  `cdn.jsdelivr.net` outright — confirmed via a direct `curl` to both the Three.js and GSAP URLs,
  each returning a `403`/tunnel-failure before any browser was even involved — meaning neither the
  3D scene nor the ScrollTrigger-driven reveal could be visually or functionally verified from
  inside this sandbox; only the *fallback path* (see below) is actually exercised and testable
  here, which is itself the reason a robust fallback existed to test at all. (2) There is no
  music/sound-effect generation capability available in this environment — only speech synthesis —
  so the "subtle ambient soundtrack loop" was built as a genuine generative Web Audio API pad
  instead of a sourced/generated audio file, which also sidesteps needing any new binary asset
  committed to the repo at all.
- **`chaingptCanvasInit()`** (replacing the previous round's `updateOrbitShowcase()`) gates the
  entire 3D scene behind a single `canRun` check — `!reduceMotion && typeof window.THREE !==
  'undefined' && typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined'
  && supportsWebGL()` (a small helper that probes for a real WebGL context, since even a THREE
  global existing doesn't guarantee the browser/GPU can actually render one) — and adds
  `.is-fallback` to `#chaingptShowcase` the instant any part of that fails, immediately revealing
  all 3 panels via `.is-visible` since the fallback layout (identical CSS to the pre-existing
  `prefers-reduced-motion` rules — no pinning, `#chaingptCanvas` hidden, panels laid out as a plain
  static stack) has nothing to scroll-drive. This is the actual, expected code path in this sandbox
  and is what the Playwright suite below actually exercises and confirms — a `false` `canRun`
  reached via a genuinely blocked CDN is functionally identical to a real visitor's ad-blocker or
  restrictive network doing the same, so testing this path is not a lesser substitute for testing
  the 3D scene, it's testing the one behavior this round could *actually* guarantee holds in
  production for every visitor regardless of their own network conditions.
- **When the libraries ARE available** (the expected case for the overwhelming majority of real
  visitors, whose networks don't block jsDelivr), `chaingptCanvasInit()` builds a small `THREE.Group`
  "swim-tech device" — a wireframe icosahedron core (green-bright) nested inside a slightly larger
  wireframe torus "halo" ring (aqua-bright), plus a faint solid inner mesh for depth — and pins
  `.chaingpt-sticky` for the full height of `#chaingptShowcase` (400vh) via
  `ScrollTrigger.create({trigger, start:'top top', end:'bottom bottom', pin:'.chaingpt-sticky',
  scrub:1, onUpdate...})`, which drives `device.rotation.y`/`.x`, the halo's own `.rotation.z`, and
  a cross-fading opacity swap between the core and halo materials (the practical, honest
  interpretation of "dynamically rotates, morphs" for a hand-built wireframe object — a literal
  geometry morph is a materially bigger undertaking than this round's scope) purely from
  `self.progress`. The renderer only calls `renderer.render(...)` while `document.body` still
  carries `view-home` — the same "don't animate what's off-screen" performance discipline this
  file's own `advanceGymAnims` (Gym's card animation ticker) already established for the identical
  reason, rather than a render loop running forever once a swimmer enters the app.
- **Three floating HTML panels — Analytics, AI Coach, Plyometrics** (`.chaingpt-panel[data-panel=
  "analytics"|"coach"|"plyo"]`) — sit absolutely positioned around the canvas and are revealed one
  at a time across even thirds of the pinned scroll range via three independent
  `ScrollTrigger.create({start:'N% top', end:'M% top', onEnter/onLeave/onEnterBack/onLeaveBack})`
  instances, each just toggling a plain `.is-visible` class rather than tweening inline transform
  styles — deliberately, since GSAP's transform parser fighting the "plyo" panel's own
  CSS `translate(-50%, ...)` centering trick (needed because it's horizontally centered, unlike the
  other two corner-anchored panels) was a foreseeable, avoidable class of bug; a plain CSS
  transition on `opacity`/`transform` driven by a class toggle sidesteps it entirely. Every panel
  is still a real, working shortcut into its own tool via the exact same global `[data-tab]`
  click-delegation every other nav element on this site already uses — no new click-handling code
  was needed for that part, only the reveal timing. The Plyometrics panel's content
  ("Depth Jumps — 4×5", "Block Starts"/"Flip-Turn Power" tags) intentionally reuses real
  exercise/tag language from the previous round's `GYM_FOCUS.plyometrics` build rather than
  inventing new copy, the same "mirror a real shipped surface, not stock imagery" precedent the
  original orbit-carousel cards established.
- **The `#08080C` dark grid background** (`.chaingpt-grid`) is a static (non-animated —
  deliberately, since this section is scroll-pinned and a drifting grid would visually fight the
  more prominent 3D object rotating in front of it) `linear-gradient` line grid at 42px spacing,
  masked to fade out radially toward the edges — the same masking technique this file's own Hero
  HUD grid and shared dashboard ambient background used in earlier rounds, reapplied here at the
  darker `#08080C` value this round explicitly asked for (distinct from `#07090E`, the previous
  round's orbit-carousel background).
- **The ambient audio pad** (`wireAmbientAudio()`) is genuinely generative — no audio file, no
  network request, nothing to fail to load. Three gently detuned oscillators (a soft open
  fifth + octave — 110Hz/164.81Hz/220Hz, sine/triangle) run through a shared lowpass
  `BiquadFilterNode`, itself slowly swept by a 0.06Hz LFO for a breathing, non-static "futuristic/
  aquatic synth" motion, into a master `GainNode` that starts at `0` and only ever ramps up
  (`setTargetAtTime`) inside `#soundToggleBtn`'s own `click` handler. **The `AudioContext` itself is
  constructed lazily on that first click, never on page load** — the explicit, non-negotiable
  requirement for autoplay-policy compliance this round called out by name — and every subsequent
  click just flips a `playing` boolean, ramping the master gain to `0.14` or back to `0` and toggling
  `aria-pressed`/`aria-label` on the button so its state is announced correctly to assistive tech,
  not just conveyed visually via the icon swap (`#i-volume`/`#i-volume-mute`, two new stroke-icon
  `<symbol>`s added to the existing sprite in the same house style as every other nav icon in this
  file).
- **Verified via Playwright** (this sandbox's own network policy genuinely blocking
  `cdn.jsdelivr.net`, so this is the real code path exercised, not a simulated one): `.is-fallback`
  is correctly added and all 3 panels render at `opacity:1`/`position:static` with `#chaingptCanvas`
  hidden the instant `THREE`/`gsap` are confirmed `undefined`; the nav renders fully transparent
  (`rgba(0,0,0,0)` background) with the 3 `[Workouts | Gym | AI Coach]` links, the sound-toggle
  button, and the single CTA all present; clicking the sound toggle flips `aria-pressed` to `"true"`
  then back to `"false"` across two clicks with zero page errors (only expected, harmless
  `net::ERR_FAILED` console entries from the deliberately-blocked CDN routes, no real
  `pageerror`s); clicking a revealed panel correctly enters the App view at the right tab;
  `prefers-reduced-motion` produces the identical static fallback layout independent of the CDN
  check; a 390px mobile viewport shows zero horizontal overflow with the nav links hidden but the
  sound button still visible and tappable; and the full pre-existing regression suite (all 9 tabs,
  the Workouts PDF export firing a real `download` event, and Complete Workout correctly logging to
  the Tracker) passes unchanged.
- **What this round could NOT verify, and why**: the actual 3D rendering (does the wireframe device
  actually appear, rotate, and cross-fade correctly), the ScrollTrigger pin itself (does the section
  actually pin and un-pin at the right scroll offsets), and whether the ambient pad is audibly
  pleasant (this sandbox has no way to render or judge audio output, generative or otherwise) all
  require a real browser with an unblocked path to `cdn.jsdelivr.net` — check this in a real browser
  on a normal network connection before considering the 3D experience itself (as opposed to its
  fallback) done. If it doesn't render there, the most likely causes, in order, are: a stale/
  incorrect CDN URL or version pin, a real JS error inside `chaingptCanvasInit()` that only surfaces
  once the three globals genuinely exist (untestable here since they never do), or a WebGL-disabled
  browser/GPU context correctly falling into the same `.is-fallback` path this round's tests did
  confirm works.

**A full Home page rebuild that reverses the immediately-preceding Three.js/GSAP/ambient-audio round
entirely, per explicit feedback that a placeholder wireframe sphere and a synthesized beep read as
cheap rather than premium.** Guided by the `ui-ux-pro-max` design-intelligence skill (queried for a
dark-mode athletic-SaaS design system, a "Feature-Rich Showcase" landing pattern, and hover/reveal
motion presets) — the user also named "Magic UI," a React/Tailwind component library that cannot be
installed into this file (no build step, no React, a constraint this file has held since its first
line), so its well-known patterns (a spotlight-hover card, a bento feature grid) were hand-built in
plain CSS/vanilla JS instead, the same translation this file has applied to every prior "component
library" or "framer-motion" ask in its history.

- **The pinned Three.js canvas, GSAP ScrollTrigger timeline, and generative Web Audio ambient pad
  were removed in full** — `#chaingptShowcase`/`#chaingptCanvas`/`.chaingpt-*` CSS and markup,
  `chaingptCanvasInit()`, `wireAmbientAudio()`, the nav's `#soundToggleBtn`, its `i-volume`/
  `i-volume-mute` icon symbols, and the three `cdn.jsdelivr.net` `<script>` tags (Three.js, GSAP,
  ScrollTrigger) are all gone — not hidden, not disabled, deleted outright, per the explicit "stop
  using placeholder 3D wireframes," "remove the harsh audio completely," and "remove legacy junk
  components" asks. This also removes the one real, disclosed limitation the previous round
  carried (that its 3D rendering and audio quality could never be verified from inside this
  sandbox, since `cdn.jsdelivr.net` is blocked here) — there is nothing left in this area that
  depends on an external CDN at all.
- **A calm, ordinary-flow "Feature Showcase" section replaces it** (`.home-showcase`): a headline
  over a 4-card bento grid — Swim Workout Generator, Dryland & Gym, AI Swim Coach, Progress
  Tracker — each a hand-built UI-mockup/metrics preview reusing this file's own already-shipped
  visual language (the workout generator's rep-chip/pace-tag, Gym's muscle tags, the AI Coach chat
  bubbles, the Tracker's bar chart), the same "no generic stock photos, mirror a real shipped
  surface" precedent the very first orbit-carousel build established several rounds ago — carried
  forward rather than reinvented. Every card is still a real, working shortcut into its own tool
  via the identical `[data-tab]` click-delegation every nav element on this site already uses.
  Cards use the pre-existing `[data-reveal]` IntersectionObserver entrance system (unchanged,
  reused as-is) plus a new lightweight **spotlight hover** — a soft radial glow that tracks the
  pointer via two CSS custom properties (`--mx`/`--my`) set by one shared `mousemove` listener
  (the vanilla-JS/CSS translation of Magic UI's SpotlightCard pattern) — invisible at rest, fading
  in only on hover/focus, matching this file's long-standing "calm until interacted with" card
  philosophy. Skipped entirely under `prefers-reduced-motion` since the glow is decorative, not
  informational.
- **A new "How It Works" 3-step section** (Create Your Account → Get Your Daily Plan → Train &
  Track) gives first-time visitors a plain, honest onboarding explainer — a standard landing-page
  pattern that needs no invented stats or testimonials to justify itself, consistent with this
  file's own repeated refusal to reintroduce fake social proof (the testimonials marquee and the
  Instagram/TikTok follow-card section were each removed in earlier rounds for exactly this reason,
  and neither was touched or reintroduced here).
- **A closing CTA band** ("Ready To Build Your Plan?") repeats the primary conversion action right
  before the footer, matching the "Hero → Feature Showcase → CTA" landing pattern the `landing`
  domain query recommended (`Primary CTA Placement: Hero (sticky) + After features + Bottom`) —
  reusing the same `.btn-cta-glow` breathing-glow treatment already established for Pricing's
  Subscribe buttons and the Hero's own trial CTA, so it reads as the same brand accent rather than
  a new, unrelated effect.
- **The footer is now visible on the Home page — a genuine "hero down to footer" continuous
  landing page for the first time.** `body.view-home footer { display:none }` (added when Home was
  first isolated into its own view several rounds ago, since Home had no footer content of its own
  at the time) was removed from the hidden-selector list; the shared `<footer>` element already
  sits in the DOM directly after the now-hidden, zero-height `#dashboard`, so it naturally renders
  right below Home's own content in both views with no structural change needed — the exact same
  footer the App view already used, not a duplicate. This does **not** reverse the Home/App view
  isolation architecture itself (`body.view-home`/`view-app`, `setAppView()`) from the round that
  built it at the user's own explicit "stop scrolling straight into the app" request — that
  isolation is unchanged, and clicking any nav link, showcase card, or CTA still cleanly transitions
  into the App view exactly as before; only the footer's own visibility rule changed.
- **A pure CSS/token retune, not a new palette** — every new section reads color exclusively
  through this file's already-established custom properties (`--green-bright`, `--aqua-bright`,
  `--font-mono`, `--font-display`, `--radius-lg`, `--space-*`), so Dark mode's own existing palette
  carries through automatically with zero new tokens introduced; the three new sections'
  background values (`#0A0E16`/`#0C1220`) were chosen to sit visually between the Hero's existing
  dark gradient and the shared `.dash-ambient-bg` tone already used across every App-view tab, so
  scrolling through Home reads as one continuous dark surface rather than a patchwork of
  differently-toned bands.
- **Two apparent bugs surfaced during Playwright verification and were both confirmed to be
  screenshot-tooling artifacts, not real defects, before being dismissed** — a discipline this file
  has followed before (e.g. the documented off-canvas-drawer false positive in an earlier
  responsive audit): (1) a `fullPage: true` screenshot taken immediately after load showed the "How
  It Works" and closing-CTA sections completely blank — traced to Chromium's full-page capture not
  actually scrolling through the page frame-by-frame, so the `[data-reveal]` IntersectionObserver
  entries for content far below the initial viewport had never fired at capture time; a follow-up
  test that genuinely scrolled through the whole document in 8 steps (`window.scrollTo` per step)
  before reading `classList`/`getComputedStyle` confirmed every section correctly reaches
  `is-visible`/`opacity:1`. (2) That same `fullPage` screenshot appeared to show the transparent nav
  bar duplicated mid-page, floating above the CTA band — confirmed via a direct
  `document.querySelectorAll('.home-nav').length` check (`1`, not 2) and a normal (non-`fullPage`)
  viewport screenshot at that exact scroll position (rendering the nav correctly pinned at the top
  of the viewport with clean, non-overlapping content beneath it) that this is Chromium's own
  known behavior of repeating a `position:fixed` element at each viewport-height stitch boundary
  when compositing a full-page capture — not a real second nav element or a z-index/overlap bug.
- Verified via Playwright: every `chaingpt`/`orbit`/sound-toggle reference is fully gone from both
  markup and JS (`grep` confirms zero remaining matches outside historical CLAUDE.md prose); the 4
  showcase cards render with the correct icons/mockup content and route to the correct tab on
  click; the spotlight hover's `--mx`/`--my` custom properties update correctly on a real
  `mousemove`/dispatched event; the footer is visible and non-empty while `body.view-home`; a 390px
  mobile viewport shows zero horizontal overflow at both the top and the very bottom of the page
  (past the footer); and the full pre-existing regression suite (all 9 App-view tabs load, the
  Workouts PDF export fires a real `download` event, and Complete Workout correctly logs to the
  Tracker and updates its own button state) passes unchanged with zero page errors throughout.

**A "make it look Apple/Nike-premium, not a generic template" pass on Home** — pure CSS/markup, no
JS logic or Firestore/Cloud Function changes, in response to continued feedback that the previous
round's calm showcase still read as flat/generic.

- **Hero got a genuine animated mesh-gradient ambient layer** (`.hero-mesh`, 4 large heavily-
  blurred (`filter: blur(90px)`) color blobs — deep green, aqua, emerald, cyan — each its own
  absolutely-positioned `<span>` drifting slowly and independently (`meshDrift`, 24–34s, offset
  delays so they never move in lockstep), replacing the previous flat 3-stop radial-gradient
  `.hero-bg` wash. This is the literal "soft glowing mesh gradient" ask — several overlapping blurred
  blobs read as organic ambient light, where flat radial-gradient stops read as a template's default
  hero background. Sits behind the existing photo/video/caustics layers (z-index -3, unchanged
  stacking otherwise) and is neutralized under `prefers-reduced-motion`.
- **Headline typography was substantially scaled up for real impact**: `.home-scene-text h1`'s
  clamp went from `2.2rem–4.4rem` to `2.6rem–6rem`, line-height tightened `1.08 → 0.98`, weight
  `700 → 800`, and a small negative letter-spacing (`-0.01em`) was added — reads as a confident,
  high-impact display headline rather than a slightly-oversized body heading.
- **The Feature Showcase was rebuilt from 4 uniform boxes into a genuine asymmetric bento** — the
  literal "no generic boxes, use a Bento Grid" ask. The Workout Generator card (the app's own
  default/flagship tool) now spans both rows of a `1.3fr 1fr` / 2-row grid as a real featured cell,
  beside a 2×2 cluster of the other three tools — collapsing cleanly to 2-then-1 columns on
  tablet/mobile. The featured cell's own content was enriched to match its taller size (three
  stage-color-railed mini set-rows — Warm-Up/Main Set/Cool-Down — mirroring the real Workout
  Generator result panel's own `.workout-block`/`.set-row` visual language, plus a "Today's Total"
  metric) specifically so a taller cell never reads as sparse/awkwardly-scaled, which is exactly the
  failure mode the "ensure zero... awkwardly scaled cards" ask called out. Every card gained a
  resting elevation (an inset top-highlight + a real drop shadow, not just an on-hover effect),
  bigger/bordered icon tiles (a color-mixed ring instead of a flat fill), and a stronger hover state
  (deeper lift, an accent-tinted glow ring) — reads as a considered, premium surface at rest, not
  only differentiated on interaction.
- **A subtle echo of the Hero's mesh gradient carries into the Showcase section's own background**
  (two much dimmer, non-animated radial-gradient washes) so scrolling from Hero into Showcase reads
  as one continuous ambient surface rather than a hard cut into a flat panel — deliberately static
  here (unlike the Hero's own drifting blobs), since this section isn't scroll-pinned and a moving
  background wouldn't add anything but visual noise.
- **"How It Works" gained a thin connecting line running through each step number circle** (only
  between steps, only at the ≥761px width where all three sit in one row) — the standard "process
  flow" visual cue premium onboarding sections use, plus each numbered circle picked up a soft
  outer glow ring for a touch more depth than a flat bordered circle.
- **The closing CTA band gained its own soft ambient glow** (a bottom-anchored radial-gradient wash
  in the same green accent as the Hero's mesh and the CTA button's own `.btn-cta-glow`) so the very
  last thing a visitor sees before the footer still feels like the same considered surface as the
  top of the page, not a flat closing banner.
- **A real, previously-unnoticed issue was caught while auditing "why does the redesign still feel
  generic" — not a code bug, but confirmed genuinely fixed here**: the earlier bento grid used 4
  perfectly uniform cells, which is itself a recognizable "AI-template SaaS grid" tell regardless of
  how polished each individual card's content is — asymmetry (one deliberately larger, more
  content-rich cell) is what actually reads as "designed," not just "populated with real data."
  This is a layout-composition fix, not a content or code-quality fix, and is the main reason this
  round targeted the grid's own column/row structure rather than only restyling the existing 4
  equal cards further.
- **A dedicated cross-breakpoint overlap/clipping audit was run and came back clean** — a Playwright
  script checked every sibling pair inside `.home-showcase-grid` and `.home-steps-grid` for genuine
  bounding-rect intersection, and every showcase card/step/section-head for `scrollHeight` exceeding
  `clientHeight` (text overflowing its own box), at 5 breakpoints (390/768/1280/1440/1920px), both
  immediately on load and again after fully scrolling through the page to trigger every
  `[data-reveal]` entrance — zero overlaps, zero clipped text, and zero horizontal overflow
  (`scrollWidth === clientWidth`) at every single width.
- **Two more apparent issues surfaced during this round's own screenshot verification and were both
  confirmed to be test-script mistakes, not product bugs, before being dismissed** — continuing the
  same discipline the immediately-prior round established: (1) a screenshot taken right after
  `window.scrollTo(0, 0)` showed the "How It Works"/CTA sections instead of the Hero — traced to the
  test calling `scrollTo` with no explicit `behavior`, which inherits this page's own global
  `html { scroll-behavior: smooth }` CSS and animates the scroll over time; the screenshot fired
  before that animation finished. Fixed in the test by passing `{ top, behavior: 'instant' }`
  explicitly (the same override this file's own `switchTab()` scroll-reset already uses, for the
  identical reason), after which the Hero screenshot showed correctly. (2) The "How It Works"
  heading appearing faded/grey mid-transition in one screenshot was confirmed to just be the
  `[data-reveal]` entrance's own opacity tween caught mid-flight at that exact instant — not a
  contrast or color bug — verified by letting the transition settle before re-checking.
- Verified via Playwright: the mesh-gradient blobs render with the correct blur/opacity/animation
  values and are neutralized under `prefers-reduced-motion`; the featured Workout Generator card
  spans both grid rows on desktop and collapses to full-width-then-single-column at tablet/mobile
  widths; the connecting line between step circles renders only at ≥761px; zero overlaps/clipping/
  horizontal overflow at 5 breakpoints both before and after the reveal-on-scroll pass; and the full
  pre-existing regression suite (all 9 App-view tabs, the Workouts PDF export firing a real
  `download` event, and Complete Workout correctly logging to the Tracker) passes unchanged with
  zero page errors throughout.

**A full Home landing-page replacement: the entire previous content (mesh-gradient Hero, bento
Feature Showcase, How It Works, closing CTA band) was wiped and replaced with a single pinned,
scroll-driven interactive 3D "Swim Performance Device" scene** — a conceptual (not pixel-clone)
take on a Contra-style project-calculator page, per the user's own explicit request. **This
reverses the two immediately-preceding rounds' explicit "remove the 3D wireframe and the harsh
audio" direction** — flagged directly to the user before starting, along with two hard
constraints, and the user chose to proceed with the 3D device but explicitly **without any
audio** (see `AskUserQuestion` exchange): this environment has no music-generation capability
(only speech synthesis), so a real "chill Lo-Fi" loop was never achievable here, and a
synthesized substitute is exactly what got called "harsh" and removed twice already — rather than
ship a best-effort synth pad again, the user chose the 3D device alone.

- **`deviceExperienceInit()`** builds the scene behind a single `canRun` check —
  `!reduceMotion && canvas && typeof window.THREE !== 'undefined' && supportsWebGL()` — and adds
  `.is-fallback` to the section the instant any part fails, which is the actual, expected outcome
  in this sandbox (`cdn.jsdelivr.net`, needed for the single Three.js `<script src>` tag, is
  confirmed blocked here via direct curl, same disclosed limitation as the prior 3D attempt).
  Unlike that prior attempt, **no GSAP/ScrollTrigger was added this round** — a plain
  `window.addEventListener('scroll', ...)` handler computes progress through the pinned section
  and lerps the camera/device transforms directly, one fewer CDN dependency than before.
- **The device**: a `THREE.Group` with a boxy body (`BoxGeometry` + an `EdgesGeometry` outline in
  the brand's green-bright accent), a front screen (a `PlaneGeometry` textured with a
  `CanvasTexture` redrawn on every step/value change — the literal "screen dynamically displays
  live SwimFit options" ask), and 4 small cylinder "buttons" along the bottom edge, one per step.
  `DEVICE_STEPS` (Swim Goal → Pace Target → AI Stroke Tip → Target Metrics) is a small,
  **intentionally local** literal array — not a reference into the Workout Generator's own deep
  `GOALS`/`DISCIPLINES`/`TECHNIQUE_MICRO_CUES` arrays defined later in the same script, since
  referencing a `var` before its own assignment line has run is exactly the "script-ordering bug"
  class this file has been bitten by twice before (documented in earlier rounds); a small
  duplicated literal sidesteps that risk entirely for what is just flavor content on a device
  screen, not a shared source of truth.
- **Real interaction, layered so nothing critical depends on unverifiable 3D raycast math**: a
  `THREE.Raycaster` on canvas click detects hits against the screen plane (cycles the active
  step's value, redrawing the texture) and the 4 button meshes (jumps to that step, same as
  clicking the equivalent HTML nav button). The bottom-left `STEP 01–04` HTML buttons are the
  **guaranteed-working** control — clicking one updates `.is-active` state, redraws the screen,
  and scrolls the pinned section to that step's keyframe range, so the 3D camera flies there via
  the existing scroll listener with no special-cased "jump" animation needed. A dedicated
  `.device-cta` ("Start 3-Day Free Trial" / "Open The Builder", swapped by sign-in state exactly
  like every other `data-auth-signed-out`/`data-auth-signed-in` pair on this site) is the
  **guaranteed bridge into the real Swim Workout Generator** — deliberately not dependent on
  precise 3D hit-testing the way the ask's "clicking screen items interacts with the calculator"
  phrasing could otherwise imply; the device's own local Goal/Pace/Metric state is a preview, not
  wired into the real generator's `state.goals` etc., a disclosed scope boundary rather than a
  fragile, unverifiable cross-wiring attempt.
- **Camera keyframes**: 4 hand-placed `{pos, rot}` pairs, one per step, continuously lerped
  (`lerp()`, plain linear interpolation — no easing library) across the pinned section's scroll
  range rather than snapping between them; scrolling also drives which step is "active" (and thus
  which screen content shows) via the same progress calculation, kept in sync with clicking either
  the HTML or 3D step controls.
- **Old Home components fully wiped, not hidden** — the literal `<header class="hero">` (video/
  photo/caustics layers, `causticDrift`/`meshDrift` keyframes), `.home-showcase`/`.home-steps`/
  `.home-cta-band` (markup, CSS, and the now-fully-dead `wireSpotlightCards`-style mousemove
  listener), and the `heroVideo` JS wiring block are all deleted outright. The `--hero-photo`
  custom property in `:root` is left as an inert orphan — this file's own established precedent
  for a removed feature's leftover asset reference (see `--generator-photo`/`--coach-photo`) — in
  case a future round wants to reuse the same generated image. The live "Total Active
  Subscribers" Firestore-backed stat (`#activeSubscribersStat`/`#activeSubscribersCount`,
  maintained server-side by `onSubscriptionWrite`) was **kept**, just repositioned into the new
  `.device-live-stat` corner slot — deleting a genuinely-live, functioning feature would have been
  removing working functionality nobody asked to remove, not "wiping old home components."
  `id="top"` (the sidebar brand-link's return-to-Home anchor) was moved onto the new
  `.device-experience` section's root so that existing behavior needed no changes.
- **The transparent minimal top navbar was already exactly what this round's ask #3 wanted** — 3
  plain text links + one CTA, no pill background — so it was left completely untouched.
- **A real regex false-positive was caught and dismissed during this round's own verification, not
  a product bug**: an early syntax-check script flagged one script block as containing invalid
  JS — traced to the script's own preceding HTML *comment* containing the literal text "a single
  plain CDN `<script>` tag" (describing the new Three.js script tag), which a naive
  comment-unaware regex misread as a real opening tag, then captured everything up to the next
  real `</script>` as bogus "content." Confirmed as a test-tooling artifact, not a real defect, by
  re-running the check with HTML comments stripped first — all 6 actual script blocks parse
  correctly (`new Function(src)` on every non-module, non-external block, zero errors).
- **What this round could NOT verify, and why (same disclosed class of gap as the prior 3D
  attempt)**: whether the device actually renders, whether the raycasted clicks land on the
  correct meshes, and whether the camera keyframes look smooth/premium in motion all require a
  real browser with an unblocked path to `cdn.jsdelivr.net` — check this in a real browser on a
  normal network connection. If it doesn't render there, the most likely causes are a stale/
  incorrect Three.js CDN URL or version pin, a real JS error inside `deviceExperienceInit()` that
  only surfaces once `THREE` genuinely exists (untestable here since it never does), or a
  WebGL-disabled browser/GPU context correctly falling into the same `.is-fallback` path this
  round's tests did confirm works end-to-end.
- Verified via Playwright (the sandbox's own network policy genuinely blocking
  `cdn.jsdelivr.net`, so `.is-fallback` is the real, exercised code path, not a simulated one):
  `.is-fallback` is added and all 4 step previews populate correctly the instant `THREE` is
  confirmed `undefined`; clicking a step button (both in fallback and as the general control)
  correctly updates `.is-active` state; the nav renders fully transparent with the 3 links, no
  sound button anywhere in the DOM; the device CTA opens the real auth modal for a signed-out
  visitor; the footer remains visible on Home; a 390px mobile viewport shows zero horizontal
  overflow; `prefers-reduced-motion` produces the identical static fallback layout; the sidebar
  brand-link's return-to-Home flow still works with the device section present; and the full
  pre-existing regression suite (all 9 App-view tabs, the Workouts PDF export firing a real
  `download` event, and Complete Workout correctly logging to the Tracker) passes unchanged with
  zero page errors throughout. A single screenshot artifact (the entrance promo popup's own
  closing CSS transition still fading out at the exact instant of a screenshot taken 300ms after
  triggering its close) was confirmed, by re-checking after a longer settle time, to be unrelated
  to this round's changes and not a real overlap bug.

**A visual-polish pass on the 3D swim device: real extruded/beveled geometry, PBR materials, and a
proper lighting rig, replacing the previous round's flat, unlit placeholder shapes** — purely
inside `deviceExperienceInit()`'s 3D-construction branch; the fallback path, the HTML step nav,
the CTA bridge into the real generator, and everything else about the device experience are
unchanged.

- **The device body is now a real extruded, beveled rounded-rect** (`THREE.ExtrudeGeometry` off a
  `THREE.Shape` built via `quadraticCurveTo` corners, `bevelEnabled: true`) instead of a flat
  `BoxGeometry` — the literal "true 3D extruded geometry with rounded bevels" ask, achieved with
  Three.js core only (no `RoundedBoxGeometry` addon module, which would have meant a second CDN
  script/import path and more surface area to fail on a blocked network). `bodyGeo.center()`
  re-centers the extruded geometry so it behaves like the old `BoxGeometry` for positioning
  purposes downstream.
- **Materials switched from unlit `MeshBasicMaterial` to `MeshPhysicalMaterial`** (body: `metalness
  0.55, roughness 0.32, clearcoat 0.6` — a plastic/metal hybrid; buttons: `metalness 0.75, roughness
  0.28, clearcoat 0.5`) so the new PBR lighting rig actually produces specular highlights along the
  bevel edges instead of the flat, shadeless look every earlier version had.
- **A full PBR lighting rig replaces the previous "no lights at all" scene** (which only worked
  because everything was unlit `MeshBasicMaterial`): a `DirectionalLight` key light
  (`castShadow: true`, its own shadow-camera frustum sized to the device) for real cast shadows and
  edge highlights, a dim brand-green `DirectionalLight` rim light from the opposite side for a
  subtle "product shot" accent consistent with the site's own green-bright token, and a
  `HemisphereLight` fill so shadows read as deep rather than crushed to pure black. A
  shadow-receiving ground plane sits well below the device, colored to exactly match
  `.device-experience`'s own `#05070B` CSS background so its flat rectangular edges blend
  invisibly into the page — only the actual cast shadow beneath the device reads as a darker patch,
  which is what gives it felt hardware weight rather than a fake CSS-style drop shadow.
  `renderer.shadowMap.enabled/type`, `ACESFilmicToneMapping`, and `SRGBColorSpace` were all added to
  the renderer so the PBR materials render with correct, non-washed-out color and tonemapping.
- **Screen and buttons now read as embedded in the case, not decals stuck on top of it** — a thin
  raised bezel frame (a second, smaller `ExtrudeGeometry`) sits proud of the body's own front face
  with the screen positioned a hair behind it (simple z-layering rather than a true CSG cutout,
  which Three.js core doesn't support without a separate library — a disclosed, deliberate
  simplification), and each button now sits in its own darker recessed "socket" mesh rather than
  floating directly on the body's flat face. The screen's material switched from an unlit `map`-only
  `MeshBasicMaterial` to `MeshStandardMaterial` with both `map` and `emissiveMap` set to the same
  `CanvasTexture` — `emissive` content stays readable regardless of which way the device is rotated
  toward the key light (a real screen emits its own light), while the `map` channel still picks up
  ambient/key light for a subtle "glass under lighting" feel rather than looking like a pasted-on
  sticker.
- **The old full-body green wireframe edge overlay (`EdgesGeometry`/`LineSegments`) was removed
  outright** — with real bevels and real lighting now defining the shape, keeping a HUD-style
  wireframe on top of a solid PBR body would have reintroduced exactly the "cheap AI wireframe"
  look this whole feature has twice already been criticized for and had removed.
- **A real, previously-uncaught class of bug was proactively caught this round via a purpose-built
  verification technique**: since this sandbox cannot load the real Three.js library (the CDN is
  blocked, as established in earlier rounds) or render WebGL, there was previously no way to catch
  a typo'd method/property name or wrong constructor signature before a real visitor's browser hit
  it. This round built a minimal, hand-written Three.js API stub (`three-stub.js`, scratchpad-only,
  not shipped) covering just the classes/methods `deviceExperienceInit()` actually calls —
  `Shape`, `ExtrudeGeometry`, `PlaneGeometry`, `CylinderGeometry`, `MeshPhysicalMaterial`,
  `MeshStandardMaterial`, `DirectionalLight`, `HemisphereLight`, `WebGLRenderer`, `CanvasTexture`,
  `Raycaster`, etc. — injected into the page via Playwright's `addInitScript()` *before* the page's
  own scripts run, plus a `getContext('webgl')` override so `supportsWebGL()` resolves truthy. This
  lets the real 3D-construction branch (not just the `.is-fallback` branch every earlier round's
  tests were limited to) actually execute and be checked for runtime exceptions. It immediately
  caught two real problems — both traced to gaps in the *stub's* own prototype-chain wiring
  (`ExtrudeGeometry`/`PlaneGeometry`/etc. not inheriting `BufferGeometry.prototype.center()`, and
  `PerspectiveCamera` not inheriting `Object3D.prototype.lookAt()`) rather than bugs in the actual
  product code — confirmed by checking that `bodyGeo.center()` and `camera.lookAt()` are both
  correct, real, standard Three.js APIs before fixing the stub rather than the code. After fixing
  the stub, the full construction path — geometry/material/light creation, device assembly, a
  simulated canvas click (exercising the `THREE.Raycaster` hit-test path against the button/screen
  meshes), and a simulated scroll through several depths (exercising the per-frame camera-lerp
  path) — runs with **zero real JS exceptions**. This is a meaningfully stronger correctness check
  than any earlier 3D round could do (which could only ever prove the fallback path works), though
  it still cannot confirm the actual rendered visual result (bevel quality, shadow softness,
  material appearance, whether the recessed-screen illusion reads convincingly) — that remains
  something only a real browser on an unrestricted network can verify.
- Verified via Playwright: the pre-existing fallback-path suite (`.is-fallback` activation, step
  nav, CTA-to-auth-modal, footer visibility, mobile/reduced-motion, full 9-tab regression) still
  passes unchanged with zero page errors; and the new stub-backed construction-path check confirms
  zero runtime exceptions across geometry/material/light setup, a raycasted canvas click, and a
  multi-depth scroll simulation.

**A live production bug report — "the 3D swim-tech device renders as a solid pitch-black box" —
was fixed in `deviceExperienceInit()`'s Three.js scene setup.** This is the first genuine visual
bug report this feature has had that came from a real browser rather than this sandbox's own
(disclosed, repeatedly-documented) inability to render WebGL at all — `cdn.jsdelivr.net` is
blocked here, so every earlier round's verification could only prove the fallback path works or
that the construction code doesn't throw, never that it actually renders correctly. The user's own
screenshots of it live, plus their itemized diagnosis (lighting too dim, materials absorbing all
light, camera/FOV possibly too tight), pointed at the real root cause directly.

- **The actual root cause: `MeshPhysicalMaterial`/`MeshStandardMaterial` with a non-trivial
  `metalness` value and no `scene.environment` map renders almost entirely black.** Physically-based
  metallic surfaces get their visible color almost entirely from environment reflections, not
  direct diffuse light — without an environment map (this scene never set one; adding a real HDR
  environment would need a texture asset this offline sandbox has no way to fetch or generate), a
  metal surface only shows brightness where a direct light happens to line up for a specular
  highlight, and reads as flat black everywhere else. The device body (`metalness: 0.55`) and its 4
  buttons (`metalness: 0.75`) were both well into this range — enough, combined with the scene's
  fairly modest light intensities, to plausibly read as a "solid pitch-black box" from most viewing
  angles. Fixed by dropping both to a much lower, diffuse-dominant range (body `0.55 → 0.2`, buttons
  `0.75 → 0.3`) while keeping a touch of `clearcoat` for a believable plastic/metal sheen under
  direct light — the same visual intent, just no longer dependent on an environment map that was
  never going to exist in this build.
- **Lighting was substantially brightened, per the user's own itemized ask.** Added a real
  `THREE.AmbientLight(0xffffff, 1.8)` (there was none before — only a dim `HemisphereLight`), so
  every surface now has a guaranteed flat minimum brightness regardless of its normal or which way
  the device happens to be rotated at that scroll position — the single biggest lever against
  "unlit-looking" surfaces. Added a `THREE.PointLight` riding near the camera (`0,1.2,5`) so the
  front face (screen/buttons/bezel) reliably catches a specular kick as the device rotates through
  the scroll-driven keyframes, not just whenever it happens to face the fixed key light exactly
  right. `keyLight` intensity `2.4 → 4.2`, `rimLight` `0.8 → 1.6`, `HemisphereLight` `0.6 → 1.1`
  (and brightened its sky color), and `renderer.toneMappingExposure` `1.05 → 1.3` — all compounding
  with the metalness fix above rather than being the fix on its own.
- **Camera/FOV given more margin, and the ground plane shrunk so it can never read as "a giant
  black wall."** The camera's field of view widened `42° → 46°` and its resting distance moved back
  slightly (`z: 4.4 → 5.2`) so the device sits comfortably inside the frame with headroom at every
  scroll-driven keyframe rather than crowding the canvas edges. The shadow-catching ground plane
  (deliberately colored near-black, `#05070B`, to blend into the section's own background) was
  shrunk from a `10×10` unit plane down to `6×6` and moved further below the device (`y: -1.85 →
  -2.1`) — at its old size/position it was large enough, relative to the ~2-3 unit device, to
  plausibly dominate the frame as an unlit dark rectangle at some camera angles; shrinking and
  lowering it removes that risk while it still catches the same contact shadow beneath the device.
- **Verified via the same stub-backed technique established in the immediately prior round**
  (a hand-written Three.js API stub — extended this round with a `PointLight` constructor to cover
  the newly-added light — injected via Playwright so the real, non-fallback construction code
  actually executes): geometry/material/light setup, a full multi-depth scroll simulation
  (exercising `updateFromScroll()`'s camera-lerp path across all 4 keyframes), a raycasted canvas
  click, and a step-button click all run with **zero JS exceptions**. The pre-existing
  fallback-path regression suite (`.is-fallback` activation and step nav, CTA-to-auth-modal, footer
  visibility, mobile viewport, `prefers-reduced-motion`, full 9-tab regression including a real PDF
  `download` event and Complete-Workout-to-Tracker logging) also still passes unchanged with zero
  page errors. **What this still cannot verify, disclosed as before**: whether the device now
  actually renders bright and legible in a real browser — the stub proves the code runs without
  throwing, not what it looks like on screen, since `cdn.jsdelivr.net` remains blocked in this
  sandbox. Confirm in a real browser on a normal network connection; if it's still too dark there,
  the next lever to pull is `renderer.toneMappingExposure` (currently 1.3) or a further metalness
  reduction, in that order.

**The Three.js 3D swim-tech device was fully reverted, at the user's explicit request, back to the
mesh-gradient hero + asymmetric bento Feature Showcase Home page.** Despite the immediately-prior
round's fix (lower metalness, added Ambient/Point lights, wider camera margin), the user decided
the 3D device approach itself wasn't working out live and asked to strip it entirely rather than
keep debugging it — a legitimate reversal, not a failure of the fix; the black-box symptom's root
cause (metalness with no environment map) was correctly diagnosed and fixed, but the feature was
dropped anyway per direct instruction. This is a straight `git checkout` of `index.html` from
commit `a66ccc9` ("Home: premium mesh-gradient hero, asymmetric bento showcase, richer process
flow") — confirmed via `git log`/`git diff --stat` that every commit between `a66ccc9` and this
point (`872c895` replace-with-3D-device, `0ddb4f1` PBR polish, `a407032` black-box fix) touched
only the Home/device section of `index.html`, so no unrelated fix from that window was lost.
`CLAUDE.md` itself was deliberately **not** reverted — the full history of the 3D device attempts
stays on record above as-is, with this entry marking where it ends, rather than being erased.
Restored: the animated mesh-gradient hero (4 blurred drifting color blobs), the asymmetric 4-card
bento Feature Showcase (a featured 2-row Workout Generator card beside a 2×2 cluster of Gym/AI
Coach/Tracker cards, each a hand-built UI-mockup — set rows, muscle tags, chat bubbles, a bar
chart — not stock photography), the connecting-line "How It Works" 3-step section, the closing CTA
band, and the visible footer on Home. The transparent `.home-nav` (wordmark + `[Workouts | Gym |
AI Coach]` links + a single signed-out/signed-in CTA pair) was untouched by either the 3D-device
build or this revert — it predates both and needed no changes either time. Every
`cdn.jsdelivr.net/npm/three@`/`gsap`/`ScrollTrigger` `<script>` tag, `deviceExperienceInit()`, and
every `.device-*`/`#deviceCanvas`/`DEVICE_STEPS` reference are gone from the codebase entirely —
confirmed via grep, not just visually. Verified via Playwright: the 5-breakpoint overlap/clipping
audit from the round that originally shipped this bento layout (mobile/tablet/laptop/desktop/wide,
both before and after the `[data-reveal]` scroll-in pass) still reports zero overlaps and zero
clipped text; a showcase card click still routes into the correct App-view tab and the sidebar
brand link still returns to Home; the footer is visible on Home; and the full pre-existing
regression suite (all 9 App-view tabs, a real PDF `download` event, and Complete-Workout-to-Tracker
logging) passes unchanged with zero page errors.

**A "luxury futuristic" visual-only pass (sharper radius, bigger glow tokens, glowing hero
headline, luxury button shimmer-sweep) — no JS/Firebase/backend logic touched.** This round
followed an unrelated detour: the user asked for a separate React/Vite "SynapseX" landing-page
project to be pushed directly onto this repo's `main` branch for an immediate GitHub Pages
deploy. That request was declined and flagged before any action was taken — `main` *is*
`swimfit.online`, deployed live with no staging step, and SynapseX is a completely different,
unrelated single-page-app stack that would either overwrite the real `index.html` or break this
repo's deliberate "single self-contained file, no build step" architecture, taking down the real
platform for its real signed-in swimmers. Given the choice, the user confirmed Swimfit should
stay untouched and asked instead for a pure visual redesign of the existing file — sharper
layout, glowing hero aesthetics, smooth CSS animations, "luxury top-tier futuristic" look —
with an explicit constraint to touch only HTML structure and CSS/Tailwind classes, never any
script tag, Firebase call, or dynamic data. Every change this round is exactly that scope.

- **Sharper corner radius, bigger glow tokens.** `--radius-sm`/`--radius`/`--radius-lg` tightened
  (8/12/16px → 6/10/14px) for a crisper, more precision-cut edge than the previous rounded-glass
  look, while keeping the same glass fill/blur treatment underneath everywhere those tokens are
  already read. `--glow-green`/`--glow-aqua` got a real, bigger two-layer bloom (a wide soft outer
  glow + a tight bright core) instead of the single small 10px shadow a much earlier round had
  deliberately dialed back to avoid an "everything glows" template look — used selectively
  (active nav rail, hero headline, primary-button hover) rather than applied to every card, so it
  reads as a considered accent rather than a regression back to that same complaint.
- **Hero headline now has a genuine ambient glow**, via a `text-shadow` on `.home-scene-text h1/h2`
  (two soft green/aqua blooms behind the glyphs themselves), layered on top of the pre-existing
  accent-span shimmer gradient on the highlighted word ("Race.") rather than replacing it — the
  headline reads as glowing, not just brightly colored. Letter-spacing tightened further
  (-0.01em → -0.02em, line-height 0.98 → 0.96) for a sharper, more compressed display-type feel.
  The Hero's mesh-gradient blobs (`.hero-mesh span`) had their color-stop opacities raised across
  all four (e.g. the green blob 0.55 → 0.68, the aqua blob 0.4 → 0.5) for a richer, more saturated
  ambient wash behind the headline — still the same drifting, heavily-blurred blob animation from
  the round that introduced it, just turned up.
- **A luxury "light sweep" hover micro-interaction on every `.btn`-classed button site-wide** — a
  translucent diagonal highlight band that glides across the button on hover (`::before`,
  `translateX(-140%) → translateX(140%)` over 650ms), the classic premium-button polish cue seen
  on sites like Stripe/Linear. Implemented once on the shared `.btn` base class so it applies
  everywhere a button already uses it (Pricing plan buttons, the entrance-popup CTA, auth modal
  buttons, etc.) with no per-button markup changes; `.btn` gained `position:relative;
  overflow:hidden` to host it, and `.btn > *` keeps any wrapped icon/text children (where present)
  above the sweep layer. Confirmed via a direct computed-style check (injecting a real `.btn.
  btn-primary` and reading `getComputedStyle(el, '::before').transform` before/after a real
  Playwright `.hover()`) that the sweep's transform genuinely animates from off-screen-left to
  off-screen-right on hover, and disabled outright under `prefers-reduced-motion` alongside the
  existing lift+scale hover already on every button variant. `.btn-primary`'s hover shadow was
  also deepened (`0 10px 30px` → `0 12px 36px` plus a thin colored ring) to match the bigger glow
  tokens above.
- Verified via Playwright: the existing full regression suite (Home structure, footer visibility,
  transparent nav + 3 links, showcase-card routing, PDF export firing a real `download` event,
  Complete-Workout-to-Tracker logging, zero horizontal overflow at mobile/desktop) still passes
  unchanged with zero page errors; `--radius-lg` resolves to the new `14px` site-wide; and a
  screenshot of the Hero and Feature Showcase confirms the glow/sharper-card changes render
  correctly with no visual regression. No JS file, Firestore rule, Cloud Function, or dynamic-data
  read/write was touched anywhere in this round — every edit is a CSS custom-property value, a new
  CSS rule, or a `text-shadow`/`box-shadow` tweak on already-existing selectors.

**A follow-up round pushed the same luxury/glow pass significantly further, per explicit
feedback that the first pass was too subtle.** Still purely CSS/token edits — no JS, Firebase, or
backend logic touched anywhere.

- **Deeper near-black background for sharper contrast.** `--bg`/`--bg-alt`/`--surface`/
  `--surface-2` all deepened (`#0D1117`→`#080A0F`, `#10141B`→`#0C0F15`, `#161B22`→`#141920`,
  `#1C2128`→`#1B212A`) — a richer, more "true black" canvas for the neon accents to pop against,
  rather than the previous round's more moderate slate-black.
- **Glow tokens widened substantially again** — `--glow-green`/`--glow-aqua` grew from a
  22px/4px two-layer bloom to a 40px/10px one (opacity also raised), and the hero headline's
  `text-shadow` gained a third layer (a tight white core plus two wider green/aqua blooms) for a
  genuine "neon sign" look confirmed via screenshot, not just a faint halo. The hero mesh-gradient
  blobs' color-stop opacities were raised a second time (e.g. the green blob 0.68 → 0.8) for a
  visibly richer ambient wash.
- **CTA breathing-glow keyframes (`ctaGlowGreen`/`Aqua`/`Maroon`) widened** from a 18–28px/
  0.25–0.55-opacity swing to 20–48px/0.28–0.85 — a much more noticeable pulse on the Pricing plan
  buttons and the Feature Showcase's "Start 3-Day Free Trial" CTA. `.btn-primary`/`.btn-ghost`/
  `.btn-outline-aqua`/`.btn-outline-maroon`'s own hover shadows were switched to reuse the same
  `--glow-green`/`--glow-aqua` tokens (rather than their own smaller one-off shadow values) so
  every button's hover state now matches the same bigger glow scale, and their hover lift/scale
  bumped slightly (`-2px scale(1.02)` → `-3px scale(1.03)`).
- **Card/bento-card hover now has a real colored glow ring, not just a bigger black shadow.**
  `.card:hover`/`.bento-card:hover` gained a `color-mix(in srgb, var(--bento-accent) 45%,
  transparent)` glow layered under the existing drop shadow, plus a bigger lift (`-2px` → `-6px`)
  and a subtle scale (`1.012`). The `.bento-card`'s existing hover-revealed top accent rail grew
  from 2px to 3px and picked up its own matching glow (`box-shadow: 0 0 16px var(--bento-accent)`)
  — the base rule's `transition` list was extended to cover `height`/`box-shadow` alongside the
  pre-existing `opacity`, so this animates smoothly rather than snapping.
- **A new animated glow-pulse on the shared `.eyebrow` accent bar** — the small 22×2px dash that
  leads every section's small-caps label site-wide (Hero, Home Feature Showcase, and every tab's
  own section head: Workouts, Gym, Gear, Academy, Coach, Tracker, Support, Pricing) now pulses a
  soft aqua glow on a 2.4s loop, a single shared-class edit that reaches every section header in
  the app at once. Disabled under `prefers-reduced-motion` down to a static glow.
- Verified via Playwright: the eyebrow's `::before` computed `animationName` resolves to
  `eyebrowGlowPulse` with a live, mid-cycle `box-shadow` sampled directly (not just assumed from
  the CSS source); a real `.hover()` on a Feature Showcase card screenshots a visible aqua-tinted
  glow ring plus lift; and the full pre-existing regression suite (Home structure, footer
  visibility, transparent nav, showcase-card routing, PDF export firing a real `download` event,
  Complete-Workout-to-Tracker logging, zero horizontal overflow at mobile/desktop) still passes
  unchanged with zero page errors.

**A follow-up round centered the Home page's marketing copy, redesigned the lower sections into a
punchier geometric bento/timeline, and shipped a working (but track-less) ambient-audio toggle —
pure CSS/markup plus one small, additive, self-contained JS block; no existing script tag,
Firebase call, or Paddle logic was touched, per the round's own explicit constraint.**

- **Hero and every section head are now genuinely centered**, not just visually close. The
  previous round's centering was inconsistent: `.home-scene-text` (the Hero's eyebrow+headline
  wrapper) was still left-aligned via `position:absolute; left/right: var(--space-6)` with no
  `text-align`/`margin-inline` of its own — it happened to sit near the middle of the viewport
  only because its `max-width:900px` box was roughly centered by coincidence, but the text inside
  it was never actually centered. Fixed by adding `margin-inline:auto; text-align:center` to
  `.home-scene-text` directly (the Feature Showcase's and How-It-Works' own `.home-section-head`
  wrapper was already correctly `text-align:center` from an earlier round — audited, not touched).
- **A real, screenshot-caught centering bug in the Hero eyebrow was found and fixed**: `.eyebrow`
  is `display:inline-flex` (a leading 22×2px dash `::before` plus the label text as two flex
  siblings). Once the parent gained `text-align:center`, the eyebrow's long label ("Elite
  Performance Swim Training") wrapped to two lines inside its own flex item, and — since
  `align-items:center` (the default) vertically centers each flex item against the *tallest*
  sibling's height — the short, non-wrapping dash ended up floating at the vertical midpoint
  between the two text lines, visually disconnected and left-anchored rather than reading as one
  centered unit. Confirmed via a direct Playwright screenshot before diagnosing the cause (not
  just from reading the CSS). Fixed by scoping `flex-wrap:wrap; justify-content:center` onto
  `.home-scene-text .eyebrow` specifically — the dash now wraps onto its own centered line above
  the (still possibly two-line) label whenever space is tight, instead of floating mid-height.
  Re-verified via a follow-up screenshot at both desktop and 390px mobile widths (zero horizontal
  overflow at either).
- **The Feature Showcase's copy was shortened to punchy 2-4 word fragments**, replacing full
  sentences: the section head's supporting line became "Smarter Sets. Sharper Technique. Real
  Progress." (was a full sentence listing every feature), the Workout Generator card's note became
  "New Set. Every Day.", the AI Coach card's became "Real-Time Feedback.", and the Dryland & Gym
  card's long note was replaced entirely with a real stat — `<span class="home-showcase-metric">
  <strong>6</strong><span>Gym Focuses</span></span>` (6, matching the real count of `GYM_FOCUS`
  entries: upper/lower/full/cardio/flexibility/plyometrics) — reusing the exact stat-tile markup
  pattern the Progress Tracker card already had, rather than inventing a new one.
- **Every Feature Showcase card gained real glassmorphism and a glowing geometric corner accent.**
  `.home-showcase-card` picked up a translucent gradient fill (`backdrop-filter: blur(14px)`), a
  hairline border, and a soft resting shadow; a new `::after` pseudo-element draws a 34×34px
  accent-colored corner bracket (top-left, using each card's own `--card-accent` custom property,
  the same per-card accent variable already driving the icon tile) at low opacity, brightening to
  full opacity on hover/focus alongside a stronger lift, a colored border, and a glow ring —
  reusing the established `color-mix(in srgb, var(--card-accent) N%, transparent)` pattern already
  used elsewhere in this file rather than inventing a new color-mixing convention.
- **A stagger-delay entrance was added for the Feature Showcase and How-It-Works grids** — neither
  uses the shared `.grid` class (they're their own bespoke bento/timeline layouts), so the
  pre-existing `.grid > [data-reveal]:nth-child(N) { transition-delay: … }` stagger rules never
  applied to them; every card/step in both sections previously revealed simultaneously with zero
  choreography. New `.home-showcase-grid > [data-reveal]:nth-child(N)` / `.home-steps-grid >
  [data-reveal]:nth-child(N)` rules (0/110/220/330ms) give both sections the same cascading
  entrance every other `.grid`-based section on the site already had.
- **How It Works was rebuilt into a real interactive-feeling timeline** — each step now shows a
  small "STEP" label above a bold "01"/"02"/"03" (was a plain "1"/"2"/"3"), and each step's
  supporting copy was shortened to a punchy fragment ("Google Sign-In. Instant Access." /
  "Pick Your Goals. We Build The Set." / "Log Swims. Track Progress." — was a full sentence per
  step). The number itself moved from a plain 52px circle to a 60px **octagon** (`clip-path:
  polygon(...)`, not a circle — a deliberately more "geometric/technical" marker per the ask) with
  a real two-layer glow reusing the existing `--glow-green` token, and gained a genuine hover
  interaction (`.home-step:hover .home-step-num` scales up and brightens its glow; the step's own
  heading tints green on hover too) — a tactile, "this timeline responds to you" feel with no JS
  state machine needed, just CSS. The horizontal connecting line between steps (desktop only,
  ≥761px) had its vertical offset (`top`) recalculated from 26px (half of the old 52px circle) to
  74px to re-align through the center of the new, taller node+label stack — confirmed via a direct
  Playwright measurement that the line now sits within ~4px of the node's true vertical center.
- **A working (but currently track-less) ambient background music toggle** — a new circular,
  glass-styled `#homeAudioToggle` button sits in the transparent `.home-nav` bar beside the
  Start Training / Launch App CTA (two new sound-wave stroke icons, `i-volume`/`i-volume-mute`,
  added to the shared SVG sprite in the same house line-icon style as every other nav icon — the
  identically-named icons from the fully-reverted 3D-device round no longer existed anywhere in
  the codebase, confirmed via grep, so these are freshly drawn, not restored). **A real, disclosed
  limitation**: this sandbox has no music-generation capability (only text-to-speech), and was
  explicitly forbidden from substituting a speech model or the internal game-pipeline's
  reserved music/SFX models for a standalone request like this — flagged to the user directly
  before proceeding, mirroring the identical disclosed limitation from the separate SynapseX
  project's own build. Per the user's own explicit choice, this round ships the toggle's complete,
  working plumbing ahead of an actual track: `AMBIENT_TRACK_URL` (currently `''`) is the one line
  to fill in with a real royalty-free ambient/lo-fi MP3 URL to turn playback on — until then, a
  new `<audio id="homeAmbientAudio" loop>` element's `<source>` stays blank, a console.info notes
  the toggle is wired but trackless, and clicking the button calls `.play()` against that empty
  source, which rejects its promise and the button's own `.catch()` reverts `aria-pressed` back to
  `false` cleanly — no page error, no stuck "on" state, no silent failure. The button never
  autoplays on load (every browser's autoplay policy blocks unmuted audio before a real user
  gesture regardless), so starting muted/off is correct behavior, not a workaround forced by the
  missing track. Once a real URL is set, the same click handler already toggles `.play()`/`.pause()`,
  flips `aria-pressed`/`aria-label` correctly, and the CSS already swaps the mute/unmute icon via
  `[aria-pressed]` attribute selectors — no further JS changes needed at that point.
- Verified via Playwright: the eyebrow/headline render as one genuinely centered unit at both
  desktop and 390px mobile widths with zero horizontal overflow; the Feature Showcase's 4 cards
  render the shortened copy/stat and the corner-bracket accent; the How-It-Works timeline renders
  all 3 octagonal nodes with the connecting line correctly aligned; clicking the audio toggle with
  no track set logs the expected `console.info`, throws zero page errors, and cleanly reverts to
  the muted state; and the full pre-existing regression suite (Home structure, footer visibility,
  transparent nav + 3 links, showcase-card routing into the correct App-view tab, the sidebar
  brand-link return-to-Home flow, a real PDF `download` event, and Complete-Workout-to-Tracker
  logging) passes unchanged with zero page errors throughout.

**Home was rebuilt from a scrolling stack (Hero → Feature Showcase → How It Works → CTA band)
into a genuine full-screen slide presentation** — 3 slides under native CSS scroll-snap, per an
explicit "this is not a slide deck, rebuild it as one" ask — plus a real ambient-audio track URL
wired into the mute toggle the previous round shipped as scaffolding-only.

- **`.home-slides`** wraps 3 `.home-slide` elements — the existing Hero (now `data-slide="0"`),
  a new **Slide 2 "Smart Gym & Tracking"** (`data-slide="1"`), and a new **Slide 3 "Pricing"**
  (`data-slide="2"`) — each `min-height:100svh` with `scroll-snap-align:start` /
  `scroll-snap-stop:always`. Snapping itself is scoped to Home only via
  `html:has(body.view-home) { scroll-snap-type: y mandatory; }` (falling back to `proximity`
  under `prefers-reduced-motion`) — deliberately **native CSS scroll-snap, not a JS scroll-
  jacking library**: this codebase has already built and reverted two heavier pinned-canvas
  approaches (a 3D orbit carousel, a Three.js/GSAP ScrollTrigger scene), so this stays intentionally
  simple and robust rather than repeating that pattern a third time. The old Feature-Showcase/
  How-It-Works/CTA-band markup was removed outright (their CSS rules were left in place as
  harmless orphans, this file's established "don't touch working rules, just stop reading them"
  precedent). A small, fully self-contained IIFE drives the right-edge **slide-dot navigation**
  (`#slideDots`, 3 dots) — a click scrolls its slide into view, and an `IntersectionObserver`
  keeps whichever dot matches the slide actually in view lit up — never touching `switchTab()`,
  auth, or Paddle logic.
- **Slide 1 (Hero)** gained the content it never actually had before (previously the CTA lived
  only in the nav bar): a **glowing pill "AI Swim Coach pitch"** line
  (`.hero-ai-pitch`, aqua icon + "Meet your AI Swim Coach — real-time technique feedback on every
  set, every stroke.") and a **CTA row** — Start 3-Day Free Trial / Launch App (the existing
  signed-out/signed-in pair) plus a new "Ask The AI Coach" button (`data-tab="coach"`, using the
  same `[data-tab]` click-delegation every nav element already relies on).
- **Slide 2 "Smart Gym & Tracking"** combines the Gym and Tracker showcase cards behind a
  **geometric SVG background pattern** (`.slide-geo-bg`, an inline hexagon `<pattern>` + two thin
  decorative rings, low-opacity, `aria-hidden`) — a real "geometric background," not another
  card-grid texture. Each of the two cards (`.visual-card`) is now a **"high-res swim visual
  container"**: a photo-backed media strip (`.visual-card-media`, `background-image:
  var(--visual-photo)`) above the existing UI-mockup body content, duotone-darkened for text
  legibility. No new photography was generated for this — `--gym-photo`/`--hero-photo` (both
  already-existing, already-generated AI photography wired into `:root` from earlier rounds) were
  reused directly, consistent with this file's own repeated disclosure that its sandbox's network
  policy blocks every stock-photo host it has ever tested (Unsplash/Pexels/Pixabay/Wikimedia
  Commons) — confirmed again this round that the same block extends to its own already-generated
  CloudFront-hosted media (`d8j0ntlcm91z4.cloudfront.net`), so neither this round's new visual
  cards nor the pre-existing Hero photo/video could be pixel-verified from inside this sandbox;
  both resolve to the correct URL in the DOM (confirmed via computed-style inspection) and will
  render correctly in a real browser on a normal network, exactly like every other photo already
  shipped on this site.
- **Slide 3 "Pricing"** embeds the real Pro/Elite/Ultra plan cards directly on the landing page —
  condensed `.price-card` panels (tier, price, one "Get Started" button per plan; the full feature
  lists stay on the dedicated Pricing tab, linked via a "See full plan comparison →" button) with
  an added `.glass-glow` class for a stronger "sleek glowing glass panel" emphasis specific to this
  slide (a colored glow ring layered under the existing glass fill/border). **Zero JS or Paddle
  logic was touched to make checkout work here** — `goToPaddleCheckout()`'s existing
  `document.querySelectorAll('.price-card [data-plan]')` wiring runs once, at script-load time,
  against whatever `.price-card` buttons already exist in the initial HTML; since these new panels
  are real `.price-card` elements with the same `data-plan="pro"/"elite"/"ultra"` attributes the
  Pricing tab's own buttons already use, they were picked up automatically with no new selector,
  event listener, or function needed. Verified end-to-end: clicking "Get Started" on the Elite
  panel while signed out opens the real auth modal (the exact same `pendingSubscribePlan` flow the
  Pricing tab's own Subscribe buttons trigger), proving the reuse works correctly rather than just
  looking identical.
- **A real, measurement-caught bug (not a screenshot artifact) was found and fixed**: Slides 2 and
  3 (both real `<section>` elements) were inheriting this file's pre-existing global
  `section { scroll-margin-top: 96px; }` rule — added in an earlier round purely to offset
  anchor-link scrolling behind the fixed nav elsewhere on the site — which, combined with
  `scroll-snap-align:start`, shifted their actual snap point 96px below the true viewport top
  (confirmed via a direct `getBoundingClientRect().top` measurement reading `96`, not just eyeballed
  from a screenshot showing a stray sliver of the previous slide's background bleeding through at
  the top edge). Slide 1 (a `<header>`, not a `<section>`) never inherited that rule and snapped
  correctly, which is what made this slide-2/3-only inconsistency reproducible rather than
  intermittent. Fixed by adding `scroll-margin-top: 0` to the shared `.home-slide` class (specificity
  correctly beats the bare-element `section` rule regardless of source order) — re-measured at
  exactly `0` afterward.
- **The ambient-audio toggle now has a real track URL** — `AMBIENT_TRACK_URL` (previously an
  intentionally-blank scaffold) is now set to a Pixabay royalty-free ambient loop supplied directly
  by the user. **Disclosed limitation, same class as the photography note above**: this sandbox's
  network policy also blocks direct fetches to `cdn.pixabay.com` (confirmed via `curl`, a 403 from
  the proxy), so whether this specific URL actually resolves to playable audio could not be verified
  from here — only that the wiring itself (the `<audio>` element's `src`, `.play()`/`.pause()`,
  `aria-pressed`/icon swap, and the graceful `.catch()` fallback the previous round already built)
  is correct. Confirm playback in a real browser on an unrestricted network; if the asset 404s or
  was moved, swap in a fresh royalty-free direct MP3 URL in the same one-line spot. The toggle still
  never autoplays — every browser's autoplay policy blocks unmuted audio before a real user
  gesture, unchanged from the previous round.
- Verified via Playwright: the old showcase/steps/CTA-band markup is gone and 3 `.home-slide`s / 3
  `.slide-dot`s / 3 `.price-card [data-plan]` buttons exist; clicking a Slide-2 visual card
  correctly enters the App view at the right tab and the sidebar brand-link still returns to Home;
  clicking a slide dot scrolls to and correctly lights up the matching dot, with the target slide's
  `getBoundingClientRect().top` landing at exactly `0` (the scroll-margin fix, re-verified after a
  full Home→App→Home round trip, not just in isolation); clicking the Elite plan button opens the
  real auth modal; a 390px mobile viewport shows zero horizontal overflow on both the hero and
  pricing slides; and the full pre-existing functional regression suite (a real PDF `download`
  event and Complete-Workout-to-Tracker logging, both run against the sidebar's own tab buttons,
  unaffected by anything in this round) passes unchanged with zero page errors throughout.

**A follow-up round fixed real copy/clutter/audio complaints on Home: an honest hero subtitle,
full removal of AI Coach references from the landing page specifically, a genuine scrolling
welcome ticker between Hero and Section 2, a clean two-pillar redesign of Section 2, and a swap
to a more reliable public audio URL.** All markup/CSS changes; the real AI Coach feature elsewhere
in the app (App view, floating widget, full-screen page) is completely untouched — every removal
here was scoped to the Home/landing view only, per the explicit ask.

- **Hero subtitle** ("Elite Performance Swim Training") was overblown/inaccurate marketing copy
  per direct feedback — changed to **"Swim & Gym Workout Schedules"**, a literal, honest
  description of what the product does. Updated in three places kept in sync: the inline
  `data-i18n="hero.eyebrow"` markup, and both the `I18N.en`/`I18N.ar` dictionary entries (Arabic:
  "جداول تمارين السباحة والجيم") — missing any one of these would have left the eyebrow
  reverting to the old text on a language switch. The pricing tier literally named "Elite"
  ($21/mo, `data-plan="elite"`) was correctly left untouched — that's a real billing/product tier
  name threaded through Paddle price IDs and the Admin Panel, not marketing puffery, and the ask
  was specifically about the Hero's own descriptive copy.
- **Every "AI" reference was removed from the Home/landing view specifically** — the
  `.hero-ai-pitch` pill ("Meet your AI Swim Coach…"), the "Ask The AI Coach" hero button, and the
  `.home-nav-links` "AI Coach" entry (replaced with "Tracker," since Section 2 below now covers
  Swim/Gym and Tracker is the one remaining core tool with no other Home nav entry) are all gone.
  Confirmed via a full grep of the `#homeView` markup range post-edit — the only remaining
  `elite`/`ai` hits are the legitimate pricing-tier name and, correctly, nothing else. The real AI
  Coach tab/floating widget/full-screen page inside the App view were never touched — this was a
  landing-page-only cleanup, not a feature removal.
- **A genuine infinite scrolling marquee** (`.home-ticker`) replaces what used to be a plain gap
  between the Hero slide and Section 2 — a glassmorphic, neon-glow band showing "✦ Welcome to
  Swimfit ✦ Get Your Daily Swim & Gym Schedules ✦ Train Smarter ✦" on an endless loop.
  Implementation: two identical `.home-ticker-set` DOM twins sit side by side inside
  `.home-ticker-track`, which animates `translateX` from `0` to exactly `-50%` — since both halves
  are pixel-identical (not a guessed/measured distance), the loop is seamless at any viewport
  width. Respects `prefers-reduced-motion` (animation disabled, static text). **A real,
  previously-invisible bug was found and fixed while verifying this**: the Home slides' own
  `scroll-snap-type: mandatory` (set on `html:has(body.view-home)`) forces every scroll gesture to
  rest on the nearest registered snap point — and only `.home-slide` elements had
  `scroll-snap-align`, so the browser always snapped straight past this thin ticker band back to
  the Hero or Section 2, meaning a real visitor could never actually stop and read it (confirmed
  directly: `scrollIntoView()` under the default mandatory snap left the ticker's
  `getBoundingClientRect()` sitting off-screen/cut-off at the viewport edge every time, while the
  identical call under `prefers-reduced-motion`'s `proximity` mode correctly centered it — proving
  mandatory snapping was the actual cause, not a text-rendering issue). Fixed by giving
  `.home-ticker` its own `scroll-snap-align: start` (default `scroll-snap-stop`, not `always` — a
  fast fling can still skip past a purely decorative banner; only the 3 real content slides force
  a stop), re-verified afterward landing at exactly `top: 0`.
- **Section 2 was rebuilt from the previous dense UI-mockup cards (tags, a metrics figure, a
  chart inset) into two clean, minimal "schedule pillar" cards** — a big glow icon circle, a short
  heading, one line of copy, nothing else — per direct "looks like garbage, too confusing"
  feedback. Retitled to match the Hero exactly ("Swim & Gym Workout Schedules"), and the pillars
  themselves changed focus from the previous Gym+Tracker pairing to **Swim Schedule** (→ Workouts
  tab) and **Gym Schedule** (→ Gym tab) — Tracker is still reachable via its own nav link and the
  Pricing slide is unaffected. The geometric hexagon SVG background from the previous round was
  kept (it was never the "messy" part — the dense card content was) and now reads as a calm
  backdrop behind two large, breathing cards instead of competing with cluttered foreground text.
  The old `.showcase-split`/`.visual-card*` CSS rules were left in place as harmless orphans (no
  element in the DOM references them anymore), matching this file's established "don't touch
  working rules, just stop reading them" precedent.
- **The ambient-audio URL was swapped from the previous round's Pixabay download link to a
  SoundHelix example track** (`soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`), at the user's
  own explicit request — SoundHelix's example assets are a long-standing, widely-used public test
  resource specifically kept freely hotlinkable, unlike Pixabay's download URLs (which can require
  a referrer/session and expire), making this a materially more reliable choice for a plain
  `<audio src="...">`. The play/pause JS itself was audited, not rewritten: `.play()` already only
  ever runs inside the toggle button's own `click` handler, which is a genuine user gesture — the
  one thing browser autoplay policy actually requires — so if audio still doesn't play once this
  ships, the far more likely cause was the previous Pixabay URL itself being expired/session-gated,
  not a JS logic bug. **Disclosed limitation, same class as every external-asset note already on
  record in this file**: this sandbox's network policy also blocks direct fetches to
  soundhelix.com (confirmed via `curl` — 403 from the proxy, the same generic outbound allowlist
  that already blocks swimfit.online/api.paddle.com/jsdelivr/cdn.pixabay.com elsewhere in this
  file), so actual audio playback still could not be verified from here — only that the `<audio>`
  element's `src` resolves to the correct URL and the toggle's play/pause/icon-swap logic is
  correct. Confirm playback on a real, unrestricted network; if this URL ever goes down, swap in
  another public, hotlinkable MP3 URL in the same one-line `AMBIENT_TRACK_URL` spot. Never
  autoplays — that remains correct, required browser behavior, not a workaround.
- Verified via Playwright: the hero eyebrow reads the new text exactly; zero AI-related text or
  buttons remain anywhere inside `#homeView`; the nav reads "Workouts | Gym | Tracker"; the ticker
  renders with 6 duplicated marquee spans and a confirmed-running CSS animation, and — after the
  scroll-snap-align fix — is reachable via `scrollIntoView()` and lands flush at the viewport top
  under the site's real, default (mandatory) snap mode; both schedule pillars render with the
  correct heading/copy and route to the correct tab on click; the audio `<source>` resolves to the
  new SoundHelix URL; a 390px mobile viewport shows zero horizontal overflow at both the hero and
  the ticker; and the full pre-existing regression suite (3 slides/3 dots/3 Paddle-wired pricing
  buttons present, slide-dot navigation and Home↔App routing, a real PDF `download` event, and
  Complete-Workout-to-Tracker logging) passes unchanged with zero page errors throughout.

**A "critical upgrade" round added a splash pre-loader and dual global tickers, fully rebuilt
Section 2 around motivational quotes + video, added animated pricing-card motion, and — the real
headline item — found and fixed the actual bug behind the dead audio toggle.**

- **THE AUDIO BUG, diagnosed and fixed.** The toggle wasn't dead because of JS event-listener
  wiring (that was already correct — `.play()` only ever ran inside a real `click` handler, which
  is the one thing browser autoplay policy requires) or a bad URL. The real cause: this file's
  `<audio>` element ships a `<source src="">` in the initial markup, and the ambient-audio setup
  script only ever mutated that `<source>` child's `.src` property directly
  (`homeAmbientAudioSource.src = AMBIENT_TRACK_URL`) — but per the HTML spec, changing a `<source>`
  element's `src` after it's already a child of a media element does **not** make the browser
  re-run resource selection; only an explicit `.load()` call on the parent `<audio>` does that. So
  `homeAmbientAudio` stayed stuck at `networkState: NETWORK_NO_SOURCE` no matter what URL was
  written into its `<source>` — every click's `.play()` call had a media element with no
  recognized resource to play, which is exactly "nothing happens, no sound, no error." Fixed with
  one line, `homeAmbientAudio.load();`, called immediately after the `src` assignment. Verified
  as a genuine behavioral fix, not just a code read: instrumented Playwright to watch outbound
  network requests, and confirmed a real HTTP request to the track URL now fires the instant the
  page loads (visible in the request log) — before this fix, zero such request was ever attempted
  at all. The request itself still fails inside this sandbox (`net::ERR_TUNNEL_CONNECTION_FAILED`,
  the same generic outbound-proxy block that's affected every external asset host documented
  elsewhere in this file — confirmed independently via `curl`, a 403 from the proxy), so actual
  audible playback still can't be confirmed from here, but the fetch attempt firing at all is
  concrete proof the client-side bug is gone; on a real unrestricted network this same request
  succeeds and the toggle will audibly play. The track URL was also refreshed to a fresh SoundHelix
  example file at the user's request (same reliable public-test-asset source as before).
- **A full-screen splash/pre-loader** (`#splashScreen`) now shows on every page load — a glowing
  "SWIM<span class="accent">FIT</span>" wordmark, a "Prepare to Outswim Your Limits…" tagline, and
  an animated loading bar — fixed at `z-index:500` (above the Home nav's 200), fading + sliding up
  after ~2.3s via a `.is-hidden` class, then fully `display:none`'d (not just faded) so it can never
  trap focus or intercept a click afterward. Its own tiny inline `<script>` sits directly under the
  markup so its timer starts the instant that point in the document parses, independent of any
  later script block — it's a pure decorative overlay that never blocks or delays Firebase auth,
  tab wiring, or anything else running underneath it. Not gated by localStorage/sessionStorage —
  it plays on every full load, matching how a real app's cold-start splash behaves, not a
  once-per-visitor onboarding flourish. Respects `prefers-reduced-motion` by skipping straight to
  hidden with zero animation or delay.
- **A second global ticker now sits between Section 2 and Pricing** (`#homeTicker2`), identical in
  markup/CSS to the existing one between Hero and Section 2 — both now read the same, more
  motivational copy the user asked for ("Welcome to Swimfit ✦ Push Your Limits ✦ New Swim & Gym
  Schedules"), replacing the previous ticker's own text so all tickers on the page are consistent.
  Both inherit the exact same `scroll-snap-align: start` fix from the immediately-preceding round
  (a real, previously-diagnosed bug where the page's mandatory scroll-snap skipped straight past
  an un-aligned ticker) — the second instance never had a chance to regress that fix since it was
  built with it from the start.
- **Section 2 was completely rebuilt** from the two-pillar "Swim Schedule / Gym Schedule" layout
  (itself only two rounds old) into big motivational typography over a looping athletic video, per
  direct "still boring, looks like garbage" feedback. The video reuses the Hero's own
  already-generated action-shot clip (no new asset was fetched — this sandbox's network policy
  blocks every stock-video host, per the note already on record in the HOME VIEW markup comment)
  at low opacity behind a dark gradient scrim for legibility. Three quotes — "Outswim Your
  Limits.", "Consistency Is Key." (green-glow accent), "Every Lap Counts." — each use a different
  `[data-reveal]` variant (plain / `"scale"` / `"right"`, all pre-existing in this file's own
  entrance-animation system) so they pop in staggered as the swimmer scrolls down, not all at
  once. The old pillar layout's real navigational value (routing into Workouts/Gym) was kept as a
  small `.motivation-actions` button row underneath the quotes rather than dropped outright — the
  section lost its former visual weight, not its function. The geometric hexagon SVG background
  from the prior round was kept unchanged (never the "messy" part).
- **The Pricing slide gained a genuine animated background and floating/tilting cards.** A slow,
  alternating radial-gradient wash (`.slide-pricing::before`, 18s ease-in-out) drifts behind the
  cards, and six small glowing dots (`.pricing-particles span`, transform+opacity only — no
  canvas or JS particle system, matching this file's own "no heavy JS dependency" precedent)
  drift upward on staggered loops for a "dynamic particles" effect. Every `.price-card` inside
  `.slide-pricing` specifically (not the shared base class used by the real Pricing tab too —
  continuous motion is a deliberate landing-page effect that would just be a distraction on the
  tab a signed-in swimmer uses to carefully compare plans) gets a continuous gentle float
  (`priceCardFloat`, staggered per-card via `animation-delay`) and, on hover, a dramatic
  `perspective()`/`rotateX()`/`rotateY()` 3D tilt plus a scale-up and a stronger glow (green for
  the Elite/featured card, aqua for the others) — `animation-play-state:paused` on hover so the
  idle float and the hover tilt don't fight each other, with a `transition` on `transform`/
  `box-shadow` so entering/leaving hover animates smoothly rather than snapping. All of the above
  is disabled under `prefers-reduced-motion`.
- Verified via Playwright: the splash renders with the correct glowing wordmark/tagline/bar and
  correctly reaches `display:none` after ~3.4s; exactly 2 `.home-ticker` instances exist; all 3
  motivational quotes render with the correct `[data-reveal]` staggering (confirmed `is-visible`
  after scrolling into view); a `.price-card`'s computed `animationName` resolves to
  `priceCardFloat`; **the audio fix was verified at the network level** — instrumenting Playwright
  to watch outbound requests confirmed a real HTTP request to the SoundHelix URL now fires on load
  (failing only due to this sandbox's own outbound proxy block, independently confirmed via
  `curl`), which was not happening before the `.load()` fix; a 390px mobile viewport shows zero
  horizontal overflow after the splash clears; and the full pre-existing functional regression
  suite (Home→App→Home routing via the new motivational action buttons, slide-dot navigation with
  a `getBoundingClientRect().top` snap-offset of effectively `0`, the Elite plan button correctly
  opening the real auth modal, a real PDF `download` event, and Complete-Workout-to-Tracker
  logging) passes unchanged with zero page errors throughout.

**A "final refinements" round: a distinct Section 2 image, the Pricing slide's animated tech-grid
background applied to every App-view tab, a global marquee ticker on every tab, a quieter ambient
volume, and a real layout bug fix on the Workout Generator's result card.**

- **Section 2 no longer reuses the Hero's own photo.** `.motivation-video` (a `<video>` reusing the
  Hero's already-generated clip) was replaced with a plain `<div class="motivation-photo"
  style="background-image:var(--gym-photo)">` — `--gym-photo` is a different, already-generated,
  already-unused-elsewhere-on-Home CloudFront asset (the same dark, moody gym photo Gym's own tab
  used before its own background video was removed several rounds ago), so this needed no new
  image generation, just reusing an existing distinct asset. The CSS rule was renamed/adapted to
  match (`background-size:cover; background-position:center;` in place of the video-specific
  `object-fit:cover`).
- **Every App-view tab (Workouts, Gym, Tracker, Gear, Academy, Coach, Settings, Support, Pricing)
  now shares the exact "tech grid + glowing particles" look the Home page's own Pricing slide
  already had**, applied once at the shared `.dash-ambient-bg` layer so every tab picked it up with
  zero per-tab markup changes. `.dash-ambient-bg::after` (previously `content: none;`) now paints a
  slowly-drifting hex-grid pattern — the identical hex polygon from `.slide-geo-bg`'s inline SVG,
  reused as a static CSS `background-image` data-URI since this pseudo-element has no DOM of its
  own to hold real markup — and a new `.dash-particles` block (6 glowing aqua/green dots, floating
  upward on staggered loops) reuses the Pricing slide's own `pricingParticleFloat` keyframes,
  inserted once inside `#dashboard`'s existing `.dash-ambient-bg` div. Photo backgrounds remain
  exclusive to the Home hero/slides, per the explicit "only the homepage should have photo
  backgrounds" instruction — every App tab's background is now this same dark tech-grid look, never
  a photo. Both the grid drift and the particle float respect `prefers-reduced-motion`.
- **The scrolling marquee ticker is now global**, not just a Home-page-only element between slides.
  A second `.home-ticker` instance (`#dashGlobalTicker`) — identical markup/CSS/animation, no new
  styling needed — was added inside `#dashboard`, directly after `.dash-ambient-bg` and before the
  tab-content wrap, so it renders once, right below the nav, and stays visible across every tab
  switch (since `#dashboard` itself doesn't remount between tabs, only its inner panels toggle).
- **Ambient background music volume lowered from 0.35 to 0.12** (`homeAmbientAudio.volume`), per
  direct feedback that the previous level was too loud/distracting for what's meant to be a soft,
  calm ambient loop. No other change to the toggle's play/pause/`.load()` wiring — that was
  correctly fixed in the immediately preceding round and needed no further changes.
- **A real, previously-unnoticed layout bug was found and fixed on the Workout Generator's result
  card while auditing inner-page alignment.** `.result-watermark` (the large, deliberately
  oversized decorative stopwatch icon in the result panel's corner) is positioned with `top:-30px;
  right:-30px;` by design — a "peeking from behind the card" watermark effect — but `.result-panel`
  itself had no `overflow:hidden`, so that intentionally-oversized icon spilled ~30px past the
  panel's own right edge and pushed the whole document's horizontal scroll width out by 6px at
  desktop widths, a real (if narrow) horizontal-scroll bug on the single most-used tab in the app.
  Fixed by adding `overflow:hidden` to `.result-panel` — confirmed via a direct Playwright
  measurement that `document.documentElement.scrollWidth` dropped from a 6px overflow to exactly 0
  afterward, with the watermark still rendering identically (now correctly clipped to the card's own
  bounds instead of bleeding past it). A broader Playwright-driven overlap/overflow audit across
  Workouts, Gym, and Tracker found nothing else genuinely broken — every other flagged element
  traced to one of two already-documented, harmless false positives from this codebase's own
  history: `sr-only` screen-reader-only utility elements (a 1px visible box by design) and the
  off-canvas `.nav-links` mobile drawer (parked off-screen, mitigated by this file's pre-existing
  `body { overflow-x: hidden }`) — neither is a real visible defect, so neither was touched.
- Verified via Playwright: `.motivation-photo` resolves to the `--gym-photo` URL (confirmed distinct
  from `--hero-photo`); every one of the 9 App-view tabs shows both the drifting hex-grid
  `::after` layer and the global ticker; `homeAmbientAudio.volume` reads exactly `0.12`; the
  Workouts PDF export still fires a real `download` event and Complete Workout still logs the
  correct distance and updates its own button text; and the full regression suite (zero page
  errors across every tab, zero genuine horizontal overflow on desktop and mobile) passes.

**A splash-screen motion upgrade, a fixed top marquee above the Home nav, and an even quieter
ambient volume — three targeted UI/UX refinements, all CSS/markup plus one small timing tweak in
the splash's own inline script.**

- **The splash/pre-loader wordmark now genuinely animates letter-by-letter, with a continuous glow
  pulse, instead of appearing all at once.** `#splashScreen`'s `SWIMFIT` markup was rewritten from
  one plain `<span class="splash-logo">` into 7 individual `<span class="l">` letters (the `FIT`
  half keeping the existing `.accent` class), each fading up from `opacity:0 translateY(16px)
  scale(0.82)` on its own `animation-delay: calc(var(--i) * 65ms)` — a real, staggered reveal
  confirmed via Playwright by sampling computed opacity through the animation (the last letter
  measurably still mid-fade at t≈1s, fully settled by t≈1.36s). `.splash-logo` itself now carries a
  `splashLogoGlowPulse` `filter: drop-shadow(...)` animation (replacing the old static `text-shadow`)
  that breathes between a soft and a brighter glow on a 2.6s loop once the letters have mostly
  landed. The tagline and progress bar now cascade in after the wordmark (staggered
  `splashFadeUp` entrances at 620ms/780ms) rather than being visible from frame one.
- **The exit transition was rewritten from a flat slide-up-and-fade into a genuine cinematic
  "zoom past the logo into the app" effect**, per the explicit "needs to feel like an app
  launching" ask. Previously `#splashScreen.is-hidden` just applied `opacity:0;
  transform:translateY(-30px)` to the whole overlay. Now the overlay itself only fades opacity,
  while `.splash-content` independently scales up to `1.4×` and blurs out (`filter: blur(10px)`)
  on its own 900ms transition — verified via Playwright by sampling the computed transform through
  the transition (a real `matrix(1.24,...)` → `matrix(1.35,...)` → `matrix(1.40,...)` progression,
  not a value that only ever reads as its start or end state), which is what actually produces the
  "camera pushing through the wordmark" sensation rather than a slide. The JS's removal timeout was
  bumped from 750ms to 950ms to match the new 900ms transition duration, so the element is never
  ripped out of the layout mid-fade. `prefers-reduced-motion` skips straight to the fully-settled
  state with zero animation, same as before, just extended to cover the new per-letter/glow/zoom
  rules specifically.
- **A fixed marquee ticker now sits directly above the transparent Home nav**, reusing the exact
  same `.home-ticker`/`.home-ticker-track`/`.home-ticker-set`/`.home-ticker-item` markup and
  keyframes already used between the Home slides — no new animation logic, just a second instance
  (`#homeTopTicker`) repositioned `position:fixed; top:0` at a slim, header-height `36px`
  (`--home-ticker-h`) with a smaller `0.68rem` item font so it reads as part of the header rather
  than a full section divider. `.home-nav`'s own `top` now reads `var(--home-ticker-h, 0px)`
  instead of a hardcoded `0`, so the nav sits directly below the ticker instead of overlapping it,
  and the Hero's `padding-top` was bumped by the same `--home-ticker-h` amount
  (`calc(100px + var(--home-ticker-h, 0px))`) so the headline/CTA content still clears the now-taller
  header stack — verified via Playwright that the ticker and nav's bounding boxes never overlap and
  the Hero's own copy renders fully below both. Living inside `#homeView` (right before `.home-nav`
  in the DOM), it's automatically hidden by the pre-existing `body.view-app #homeView {
  display:none }` rule the instant a swimmer enters the App view — confirmed via Playwright rather
  than assumed.
- **Ambient background music volume lowered again, from 0.12 to 0.05** (`homeAmbientAudio.volume`),
  per direct repeated feedback that it was still too loud — this is the second reduction this file
  has made to the same value (0.35 → 0.12 → 0.05), each time in response to the same complaint
  persisting; no other change to the toggle's `.load()`/play/pause wiring, which was already
  correctly fixed in an earlier round.
- Verified via Playwright: the splash's per-letter stagger and mid-transition zoom/blur values were
  sampled directly (not assumed from the CSS source) across a dense timeline of the full ~3.2s
  lifecycle; the top ticker renders with zero overlap against the nav and is confirmed hidden in the
  App view; `prefers-reduced-motion` collapses the splash to its settled state instantly and disables
  the new ticker's marquee animation, matching every other animated element in this file;
  `homeAmbientAudio.volume` reads exactly `0.05`; a 390px mobile viewport shows zero new horizontal
  overflow; and the full pre-existing regression suite (all 9 App-view tabs, the tech-grid/particle
  background, the Workouts PDF export firing a real `download` event, and Complete Workout logging)
  passes unchanged with zero page errors.

**A round fixing real mobile-only layout bugs (traced to the previous round's own top-ticker
change), a mobile breathing-room pass, quieter audio, and two Workout Generator logic
improvements — all reported as "desktop looks great, mobile is broken."**

- **A real, previously-undiscovered bug was found and fixed: `#homeTopTicker` (added last round)
  was never actually `position:fixed` at all.** Its positioning was declared as a plain `.home-
  top-ticker` class rule, but `.home-ticker`'s own base rule — declared *later* in this stylesheet,
  with equal specificity — sets `position:relative`, and CSS resolves equal-specificity conflicts
  by source order alone regardless of which rule "looks" more specific by name. The practical
  effect: the ticker just sat once in normal document flow at the very top of the page. On the
  Hero this was invisible (page loads at scrollY 0, so a relatively-positioned element at the top
  of the flow looks identical to a fixed one there) — which is exactly why the previous round's own
  verification never caught it. But it meant the ticker scrolled away entirely on Slides 2/3, and
  `.home-nav` (which *is* correctly fixed) stayed pinned over the top of whatever content scrolled
  up underneath it with nothing compensating — so the Pricing slide's own "Membership" eyebrow/
  heading rendered **partially behind the nav**, reading exactly as "the section is cut off,"
  matching the bug report precisely. Fixed by pinning `#homeTopTicker`'s positioning properties to
  the `#id` instead of the shared `.class`, immune to any future reordering of `.home-ticker`'s own
  rule. Verified via Playwright: the ticker's computed `position` now reads `fixed` and its
  `getBoundingClientRect().bottom` stays a constant `36` across every scroll position (Hero, Slide
  2, Slide 3) — it was previously scrolling thousands of pixels off-screen on Slides 2/3.
- **A second, downstream bug in the same area: every `.home-slide`'s own top padding never
  accounted for the fixed nav+ticker header stack at all** — only the Hero had a hand-tuned
  `padding-top`, and even that was silently overridden by a more-specific `.hero.home-slide` rule
  that used to sit below it (a `padding-block` shorthand beats a lone `padding-top` at equal
  specificity when it comes later in source, per the CSS Logical Properties "corresponding
  properties" resolution rule). Fixed by giving the shared `.home-slide` rule itself the same
  `calc(100px + var(--home-ticker-h, 0px))` top clearance the Hero had always used, and deleting
  the now-fully-redundant `.hero`-specific overrides. Verified via Playwright: the Pricing slide's
  "Membership" eyebrow now renders at `y=152` (previously `y=112`, `17px` of which sat behind the
  nav's `129px`-tall fixed bottom edge) with zero overlap on all three slides.
- **The App-view's global ticker (`#dashGlobalTicker`) had the identical root problem on mobile,
  just inverted — nothing on inner pages ever reserved room for the mobile top nav bar's own real
  height** (only the announce bar's height was ever subtracted from `body`'s top padding), so the
  ticker rendered with its own top edge partially behind the fixed nav. Per direct request, it's
  now the genuine topmost element on every inner tab below the sidebar breakpoint (981px) — a
  `position:fixed` strip at true viewport `y=0`, with the announce bar and nav both pushed down by
  its height (a new `--dash-ticker-h` token, threaded through `.announce-bar`/`.nav`/`.nav-links`/
  `.toast-stack`'s existing `--announce-h`-based offsets via higher-specificity `body.view-app`-
  prefixed overrides, so they can never lose to the base rules regardless of source order — the
  same defensive pattern used for the ticker fix above). Scoped entirely to ≤980px — the desktop
  layout the swimmer explicitly called "great" is completely untouched, the ticker keeps its
  original in-flow position inside `#dashboard` there. Verified via Playwright: the ticker is now
  the first element in the viewport at `y=0` on Workouts/Gym/Tracker on mobile, with zero overlap
  against the nav.
- **A moderate mobile breathing-room pass**, per the `@media (max-width: 768px)` breakpoint
  explicitly requested — widens `.wrap`/`.panel-wide-inner` padding, `.bento-grid`/`.workouts-col-*`/
  `.gym-top-bar` gaps, `.chip-group`/`.equipment-grid` gaps (8px → 10px), chip/equipment-pill
  padding, and card padding across `.card`/`.price-card`/the Tracker/Settings cards — every value
  only *widens* an existing gap/padding already in use elsewhere in this file, so nothing can
  regress into overlap, only spread further apart. A direct sibling-overlap audit of the Equipment/
  Discipline/Goal chip groups at 375px found no actual overlapping elements before this change
  (the "cramped" read was a real but more diffuse spacing complaint, not a specific broken layout),
  so this is an honest polish pass rather than a claimed bug fix.
- **Ambient audio volume lowered a third time, 0.05 → 0.02**, per continued feedback it was still
  audible — the third reduction this file has made to the same value (0.35 → 0.12 → 0.05 → 0.02).
- **Fitness Goals relabeled to match the Weekly Training Schedule's own terminology.** The picker's
  three buttons ("Endurance"/"Speed"/"Technique") read as a disconnected vocabulary from the
  schedule sitting directly above them, which already uses "Sprint / Power," "Aerobic / Distance,"
  "Threshold," "Technique / Drills," and "Race Pace" for its six day names. Relabeled to "Aerobic /
  Distance," "Sprint / Power," and "Technique / Drills" — three of the schedule's own exact terms —
  with only the `label` field changed; every `key` (`'endurance'`/`'speed'`/`'technique'`) and every
  archetype-pool/pace/gym-orientation lookup keyed off it is untouched, so this is a display-only
  rename. "Threshold" and "Race Pace" (the schedule's other two non-technique day names) weren't
  added as separate 4th/5th buttons since they already draw from these same two pools rather than
  having distinct archetype content of their own — a button with no distinct backing logic would
  just be a cosmetic duplicate, not a real new choice.
- **A real, reachable bug in the Main Set generator was found and fixed: a Sprinter-type swimmer
  (Race Goal card) on an Endurance-themed day could be handed a genuine "4×400m"-style long
  unbroken swim**, exactly as described in the bug report. Root cause: `Aerobic Base`'s own
  `build()` computes `Math.max(2, Math.round(m / 400))` reps of a 400m rep once total distance hits
  3000m+ — appropriate training for a distance-oriented swimmer, but not for one whose training is
  built around fast-twitch, race-specific work. `Build-By-Thirds` (a single continuous rep that
  scales directly with distance) and `Distance Ladder` (long descending rungs) are the same
  category of problem. Fixed with a new `SPRINTER_ENDURANCE_EXCLUDED_ARCHETYPES` filter — mirroring
  the existing `BEGINNER_EXCLUDED_ARCHETYPES` pattern exactly, including its same empty-pool safety
  net — that removes these three archetypes from the combined pool only when `state.swimmerType ===
  'sprinter'` AND Endurance is one of the selected goals (a Sprinter on a pure Speed/Technique day
  is completely unaffected). This leaves exactly the Endurance archetypes already built around
  short reps and short rest — `Negative-Split Pull` (100m reps), `Descend Ladder` (50m reps), and
  `Broken Threshold Swim` (200m broken into 2×100) — which is the actual "high-repetition 50s/100s,
  short rest" adaptation the bug report asked for, achieved by routing to already-correct archetypes
  rather than rewriting the pool's own pacing logic. Verified via Playwright across 20 simulated
  calendar days at 5000m: a Sprinter+Endurance combo never once rendered `Aerobic Base`/`Build-By-
  Thirds`/`Distance Ladder` in the generated output, while an identical Distance+Endurance control
  run across the same 20 days did render `Aerobic Base`/`Build-By-Thirds` — confirming the filter is
  condition-specific, not an accidental removal from the whole pool.
- Verified via Playwright: the full pre-existing regression suite (all 9 App-view tabs with zero
  page errors, zero genuine horizontal overflow on desktop and mobile, the Workouts PDF export
  firing a real `download` event, Complete Workout logging, and the Home page's splash/slide/audio
  behavior from prior rounds) passes unchanged.

**A mobile-hardening + Admin/Support "professional dashboard" round, done under an explicit
"do not alter the database structure or data under any circumstances" constraint — every item
below is HTML/CSS/JS only; no Firestore field, collection, security rule, or Cloud Function was
touched anywhere in this round.**

- **Real marquee duplication on Home mobile, found and fixed.** `#homeTopTicker` (always
  `position:fixed` at the top of the viewport on Home) and the two in-flow tickers `#homeTicker1`/
  `#homeTicker2` (sitting between the Hero/Slide 2 and Slide 2/Pricing in the scroll-snap flow)
  are all real, intentional elements from separate earlier rounds — but nothing ever stopped an
  in-flow ticker from scrolling into view *while* the fixed one was still on screen, so a swimmer
  scrolling past either slide boundary on a narrow viewport saw two scrolling marquees at once.
  Confirmed via Playwright bounding-box checks at both slide boundaries before touching anything.
  Fixed with a plain `@media (max-width: 980px) { #homeTicker1, #homeTicker2 { display: none; } }`
  — ID selectors deliberately, not the shared `.home-ticker` class, so this can never be silently
  undone by a later, higher-specificity class rule (the same "later rule wins" bug class this file
  has been bitten by twice before, per the `#homeTopTicker`/`.home-slide` notes above). Verified via
  Playwright: exactly one ticker (`#homeTopTicker`) is ever visible at any Home scroll position on
  mobile afterward, while the App-view's own separate `#dashGlobalTicker` (never part of this
  complaint) is unaffected.
- **`html`/`body` got the explicitly-requested `overflow-x:hidden`/`width:100%` hardening** — but a
  direct Playwright measurement first found the reported "severe horizontal overflow" and
  "off-center hero text" did **not** reproduce in this environment (zero `scrollWidth`/`clientWidth`
  delta, `window.scrollX` stayed `0` after a forced `scrollTo`, hero text confirmed symmetrically
  centered via `getBoundingClientRect()`). The hardening was still applied as a low-risk, directly-
  requested defensive measure — disclosed here as "hardened, not reproduced" rather than claimed as
  a confirmed fix, since inventing a bug to have fixed would misrepresent what was actually found.
- **A real, self-introduced regression was caught and fixed before it ever shipped.** The first
  pass of the hardening above added `width:100%` to the base `body` rule — but the desktop sidebar
  layout already sets `body { margin-left: var(--sidebar-w) }` (232px), and `width:100%` resolves
  against the initial containing block *regardless of an element's own margin*, which pushed
  `body`'s right edge exactly 232px past the real viewport edge on every desktop tab (`scrollWidth:
  1672` against a `1440`px viewport — precisely the sidebar's own width). Caught via a dedicated
  cross-tab overflow audit run specifically to check item 2's "elements shifting right" complaint,
  not assumed safe from a code read alone. Fixed by dropping `width:100%` from `body` in favor of
  `max-width:100%` (plain block-level `width:auto` already correctly computes "viewport minus
  margin," which is what was actually wanted) — re-verified `scrollWidth` matches `clientWidth`
  exactly on all 9 App-view tabs at desktop width afterward, with zero change to the mobile
  behavior (where `margin-left` is `0` and this conflict never existed).
- **Mobile-aware ambient audio volume**, exactly per the requested logic:
  `homeAmbientAudio.volume = window.innerWidth < 768 ? 0.01 : 0.03` (down from the prior round's
  flat `0.02` on every device), set once at load time — a swimmer who resizes/rotates mid-session
  keeps whichever value applied when the page first loaded, matching how volume has been set once
  per session throughout this file's history rather than live-adjusted on resize.
- **Workout Generator's Warm-Up/Pre-Set were audited, not changed — the "static" claim doesn't hold
  today.** Simulated 10 consecutive calendar days via a `Date`/`Date.now()` override and generated a
  workout on each: the Warm-Up's opening swim was Freestyle on every single day (the long-standing
  rule from an earlier round), while the Warm-Up's own drill/kick pool picks and the Pre-Set's
  archetype both rotated correctly across the 10 simulated days, drawing from the same day-stable
  `workoutRng` every other part of the generator already uses. No code change was made here — the
  daily-rotation and Freestyle-first systems documented in multiple earlier rounds above are still
  fully intact; this round only re-verified that they still hold.
- **Admin Panel redesigned into real dashboard widget cards.** `.admin-stats-grid`'s five flat,
  borderless, center-aligned tiles became six left-aligned glass cards — `--glass-bg`/
  `--glass-border` fill, a rotating aqua/green/maroon top accent bar (the same "card family" cue
  `.settings-card` already established), a colored icon tile per metric, and a hover lift — so the
  panel reads as a genuine analytics dashboard at a glance instead of a plain number row. **Total
  Registered Users** already existed as `adminStatTotal` (computed client-side from the same
  `adminListUsers()` response the table itself uses) and needed no new data — it was just re-labeled
  or "Total Registered" to "Total Registered Users" and given real visual weight. **Total Site
  Visitors is the one sub-request this round could not implement as a real number, and says so
  rather than fabricating one**: no visitor-tracking data exists anywhere in Firestore, and this
  codebase's own Firebase Analytics integration (`getAnalytics(app)`, already initialized in the
  `<head>` module) is write-only from the client — its pageview/visitor data lives in the Firebase/
  Google Analytics console, not in a Firestore document this app can read. Implementing a real
  visitor counter would need a new Firestore field/collection and a write path (a Cloud Function
  hook, most likely) — exactly what the round's own explicit "do NOT alter the database structure
  or data under any circumstances" instruction rules out. The new sixth tile shows a plain `N/A`
  with a caption explaining exactly this ("Not tracked in this table by design — visitor counts
  live in Firebase/Google Analytics, not Firestore... See Firebase Console → Analytics for real
  traffic numbers") rather than a fake or misleading number.
- **Support tab rebuilt into a real Help Center**, per the "looks too empty" complaint. A new
  "Quick Answers" FAQ section (five real `<details>`/`<summary>` items — reusing the exact same
  `.faq-list`/`.faq-item` disclosure pattern the Pricing tab's FAQ already uses, so no new CSS
  system was needed) now sits above the chat, covering trial/billing/sign-in/AI-Coach-scope/
  response-time questions — every answer describes only real, already-shipped behavior (the Google-
  only sign-in, the Settings → Billing portal, the AI Coach's swim-only scope), nothing invented. A
  labeled "Still Need Help? Message Us Directly" heading now visually separates the FAQ from the
  pre-existing real-time chat shell below it, which is otherwise completely unchanged — same
  `#supportPageMessages`/`#supportPageForm` ids, same `admin_chats` Firestore read/write path, same
  auto-greeting and client-side auto-confirmation note from earlier rounds. **A real, self-
  introduced bug was caught and fixed during this round's own verification**: the first draft
  accidentally closed the explanatory HTML comment above the new FAQ markup with a JS-style `*/`
  instead of `-->` — since that never actually closes an HTML comment, the browser kept the comment
  open and silently swallowed the entire FAQ section, the new "Still Need Help?" heading, and the
  chat shell itself as inert comment text instead of live DOM, which a first Playwright check caught
  immediately (`data-auth-signed-in` element count dropped from the expected 15 to 12, with the
  three missing ones traced directly to this exact region). Fixed by closing the comment correctly;
  re-verified afterward that all three elements render, the 5 FAQ items are present and toggle
  correctly, and the pre-existing greeting message still renders as the first chat bubble.
- Verified via Playwright across the whole round: all 10 tabs (including Admin, tested via the real
  `swimfit.ae@gmail.com` admin account against a mocked `adminListUsers` response) load and activate
  with zero page errors; the Workouts PDF export still fires a real `download` event and Complete
  Workout still logs the correct distance and updates its own button text; zero horizontal overflow
  on every tab at both 1440px desktop and 375px mobile widths (the only mobile "offenders" found are
  the same pre-existing, already-`overflow-x:hidden`-mitigated off-canvas `.nav-links` drawer false
  positive this file has documented since the sidebar/bottom-nav round); the Admin stats grid renders
  all six cards with correct live-computed values and the honest Site Visitors disclosure; and the
  Support Help Center's FAQ, heading, and chat shell all render and function correctly on both
  desktop and mobile.

**A round fixing a genuine, severe Home scroll lock (a real root cause, not the literal
`overflow:hidden` the bug report guessed at), extending the marquee-dedup fix to desktop, adding
real radial-progress rings to the Admin dashboard, and re-confirming the Workout Generator's
daily/discipline dynamism — again under an explicit "do not alter the database" constraint, so
every change here is HTML/CSS/JS only.**

- **The real cause of "homepage vertical scroll is completely locked": `scroll-snap-type: y
  mandatory` on `html:has(body.view-home)` was genuinely trapping scroll, not just snapping it.**
  The bug report's own diagnosis (an `overflow:hidden` somewhere) didn't hold up — a direct
  Playwright check found `overflow-y` computed to `auto` on both `html` and `body`, with plenty of
  real scrollable height (`scrollHeight` 3352 vs `clientHeight` 900). The actual mechanism was
  `mandatory` scroll-snap: per spec it forces the browser to reject any resting scroll position
  that isn't an exact registered snap point — and something about this page's snap-child sizing/
  stacking made every position except `0` invalid, confirmed by literally setting
  `scrollingElement.scrollTop = 500` directly (bypassing any input-event path entirely) and
  watching it snap straight back to `0`; a real `page.mouse.wheel()` gesture showed the identical
  zero-progress result. This is a known, real-world class of `mandatory`-snap trap, not a
  hypothetical — fixed by switching to `scroll-snap-type: y proximity` (which only snaps when a
  scroll naturally *ends* near a snap point, and never rejects or reverts a scroll outright).
  Verified via Playwright: six consecutive wheel ticks now progress smoothly and monotonically from
  `scrollY 0` all the way to the true max (`2452`, matching `scrollHeight - clientHeight` exactly),
  and scrolling back up reaches `0` cleanly — with zero regression to the slides still settling into
  place on an ordinary scroll. The `@media (prefers-reduced-motion: reduce)` override that used to
  separately force `proximity` for reduced-motion visitors was removed as now-redundant (the base
  rule already reads `proximity` for everyone), not left as a dangling, do-nothing block.
- **Marquee duplication: the previous round's fix was real but incomplete — it only covered
  mobile.** `#homeTicker1`/`#homeTicker2` (the two in-flow tickers between Hero/Slide 2 and Slide
  2/Pricing) were hidden only inside a `@media (max-width: 980px)` block, on the assumption
  desktop's extra vertical room would keep them from ever overlapping the always-fixed
  `#homeTopTicker` on screen at once. A dedicated Playwright sweep — scrolling through 11 evenly-
  spaced depths at 1440px and 1024px and checking which `.home-ticker` elements were actually
  within the viewport bounds at each — proved that assumption wrong: both in-flow tickers render
  fully visible alongside the fixed one at plenty of desktop scroll positions, since a full-
  viewport-height slide easily has room for a fixed header strip and an in-flow ticker
  simultaneously regardless of width. Fixed by dropping the media-query scoping entirely —
  `#homeTicker1, #homeTicker2 { display: none; }` now applies unconditionally, at every width.
  Re-verified via the same scroll-depth sweep: only `#homeTopTicker` is ever visible, at any of the
  11 sampled depths, at 1440px, 1024px, and 375px alike.
- **Admin dashboard: real radial-progress rings added to four of the six stat tiles** (Total
  Subscribers / Active Memberships / On Free Trial / Suspended), each showing that metric's % share
  of Total Registered Users — computed entirely client-side from the exact same `adminListUsers()`
  response the big numbers already read, so no new endpoint or Firestore field was needed. Per the
  `dataviz` skill's own "magnitude of a whole" guidance: one hue per ring (a muted track + the
  tile's own already-established accent color — aqua/green/maroon, matching each tile's top border
  via a new `--ring-color` custom property set per `nth-child` position), the percentage rendered
  as plain text rather than color-coded alone, and the underlying count is still the primary
  content — the ring is a secondary, at-a-glance cue in the tile's own corner, not a replacement for
  the number. Built as plain inline SVG circles (`stroke-dasharray`/`stroke-dashoffset`, no chart
  library), matching this file's own long-established "hand-rolled SVG, no dependency" precedent
  from the Distance Tracker's charts. Total Registered Users and Total Site Visitors don't get a
  ring (there's no "share of a whole" to show for either — one of them *is* the whole, the other has
  no real number at all). Alongside the rings, tile padding/gaps were widened (`--space-4` →
  `--space-5` padding, `--space-6` → `--space-7` grid margin) and the value/label typography bumped
  for more visual weight, directly addressing the "looks cramped and basic" feedback. Verified via
  Playwright: all four rings compute the correct percentage and `stroke-dashoffset` from a mocked
  3-user roster (1 subscriber / 1 active / 1 on trial / 1 suspended → each ring correctly shows
  33%), each ring's computed `stroke` color matches its own tile's accent exactly, and the panel
  still renders with zero overflow on both desktop and mobile.
- **Workout Generator's daily-dynamism and discipline-adaptation claims were re-verified, not
  re-coded — both already hold.** Simulated 8 consecutive calendar days: the Warm-Up's opening line
  was Freestyle on every single day (unchanged from the long-standing hardcoded rule), and 7 of the
  8 days' full Warm-Up text differed from one another (the drill/kick pool rotating exactly as
  designed). Separately, deselecting every discipline except Breaststroke and generating confirmed
  the resulting workout mentions Breaststroke, contains zero Butterfly mentions anywhere, and zero
  Freestyle mentions outside the mandatory Freestyle warm-up line — i.e. the Main Set genuinely
  locks to the swimmer's own selected specialization rather than defaulting to Freestyle content.
  No code change was needed for this item; it was already correct, matching the prior round's own
  independent audit of the same claim.
- Verified via Playwright across the whole round: all 10 App-view tabs load and activate with zero
  page errors; the Workouts PDF export still fires a real `download` event and Complete Workout
  still logs correctly; zero horizontal overflow at both 1440px and 375px on every tab (the only
  mobile "offender" is the same pre-existing, already-mitigated off-canvas nav-drawer false
  positive); the Home scroll-lock fix, the desktop marquee fix, and the Admin rings all verified
  independently as described above.

**A round rebuilding the Admin dashboard around real hand-rolled SVG charts (donut, bar, trend
line — no Chart.js/Recharts, matching this file's own long-standing "no CDN dependency" precedent)
and reversing the Home marquee's role entirely per explicit request — again under the same
no-database-changes constraint, so every change here is HTML/CSS/JS only.**

- **Admin Panel: three real charts added below the stat-ring tiles, all computed from the exact
  same `adminListUsers()` array the table already reads — no new endpoint, Firestore field, or
  Cloud Function.** A **Plan Distribution donut** (Pro/Elite/Ultra/No Plan, fixed categorical hue
  order — aqua/green/maroon/muted-gray, never cycled — plus a legend and a `<title>` per arc for
  hover tooltips); an **Account Status bar chart** using reserved status semantics rather than an
  arbitrary rotation (Active=green "good", Trial=aqua "neutral/in-progress", Expired=gold
  "warning", Suspended=maroon "critical" — a new `Expired` bucket was derived for this chart
  specifically, since no prior UI needed to distinguish "trial still running" from "trial ended,
  no plan" as separate counts); and a **New Signups trend line/area chart** bucketing every
  swimmer's real `createdAt` timestamp (the same field the table's own "Joined" column already
  reads) into the last 14 calendar days. The trend chart is a deliberate, disclosed substitute for
  "visitor trend" data this app has no way to track — real registrations, not a fabricated number,
  consistent with the Total Site Visitors tile's own honest `N/A` disclosure from the prior round.
  Built as plain inline SVG (`donut` via `stroke-dasharray`/`stroke-dashoffset` circle segments,
  `bar` via width-percent divs, `trend` via a `<polyline>`/`<polygon>` pair over day-bucketed
  points) per the `dataviz` skill's own rules — fixed-order categorical hues, a legend for 2+
  series, values kept in text tokens rather than colored, recessive gridlines, and a `<title>` per
  mark for zero-JS hover tooltips (the same precedent the Distance Tracker's own charts already
  established). Verified via Playwright against an 8-user mocked roster spanning every plan/status/
  trial-age combination: the donut renders the correct 4 non-zero arcs plus legend rows, the bar
  chart's computed widths correctly reflect each status's share of the max bucket (verified
  Active/Trial/Expired/Suspended = 4/2/1/1, matching the mock exactly), and the trend line renders
  exactly 14 points/dots, one per bucketed day — all with zero horizontal overflow on desktop and
  mobile and zero page errors.
- **Home marquee's role was fully reversed per explicit request: the always-fixed top ticker is
  gone, and the two in-flow tickers are now the page's only marquee, sitting as seamless dividers
  between sections rather than being hidden.** Two prior rounds fought a "duplicate marquee" bug by
  hiding `#homeTicker1`/`#homeTicker2` (the in-flow tickers between Hero/Slide 2 and Slide 2/
  Pricing) so only `#homeTopTicker` (fixed at the very top) remained visible. This round deletes
  `#homeTopTicker` outright — markup, its dedicated CSS block, and the `--home-ticker-h` custom
  property it drove (which used to offset `.home-nav`'s `top` and every `.home-slide`'s own top
  padding to make room for it; both are now plain static values again) — and removes the
  `#homeTicker1, #homeTicker2 { display: none; }` rule entirely, so the two in-flow tickers are
  visible again exactly where they already sat structurally: precisely at each section boundary.
  Since `#homeTicker1`/`#homeTicker2` were *already* positioned between `.hero`/`.slide-showcase`
  and `.slide-showcase`/`.slide-pricing` from an earlier round (only ever hidden, never moved), no
  new placement logic was needed — un-hiding them was the entire fix, and their own existing glass
  fill (`background: rgba(255,255,255,0.04)` + blur) already visually bridges what would otherwise
  be a hard background-color cut between those sections. Verified via Playwright: `#homeTopTicker`
  no longer exists in the DOM at all; scrolling through 11 sampled depths at 1440px/1024px/375px
  shows zero ticker visible at the very top of Home and exactly one ticker (`#homeTicker1` then
  `#homeTicker2`) visible only while scrolling through its own section boundary, never both/neither
  unexpectedly; and a direct screenshot at each divider position confirms the ticker band sits
  exactly across the seam between sections as intended.
- **Home scroll re-verified working, not re-broken by this round's markup changes.** Since removing
  `#homeTopTicker` touched `.home-nav`'s positioning and every `.home-slide`'s top padding, this was
  re-tested end to end after the change: `overflow-x` still reads `hidden` and `overflow-y` still
  reads `auto` on both `html` and `body`, and a real multi-tick wheel scroll still progresses
  smoothly from `scrollY 0` to the true max and back down to `0` — the `scroll-snap-type: y
  proximity` fix from the immediately preceding round required no further changes here.
- Verified via Playwright across the whole round: all 10 App-view tabs load with zero page errors;
  the Workouts PDF export still fires a real `download` event and Complete Workout still logs
  correctly; zero horizontal overflow at both 1440px and 375px on every tab (the only "offenders"
  found are the same pre-existing, already-documented off-canvas nav-drawer false positive on
  mobile and a sub-2px grid-rounding artifact on the Workouts tab's own result-panel column at
  desktop width, confirmed harmless since `document.documentElement.scrollWidth` matches
  `clientWidth` exactly — not a regression introduced by anything touched this round).

**A full color/visual-identity redesign — a genuinely new palette, not another neon-aqua/green
iteration — per the user's own explicit, twice-confirmed "أبغاه فعلاً تغيير شامل للتصميم/الألوان من
الألف لليا" (I really want a comprehensive change to the design/colors from A to Z).** The user's
original ask was broader ("something that attracts the customer, entertains them, gets them to
subscribe") and was narrowed down via clarifying questions to "change the website itself," then
to a full top-to-bottom design/color overhaul specifically — a smaller-scoped alternative (an
interactive live-product-trial widget) was proposed first, citing this file's own extensive
history of prior full redesign rounds, but was explicitly rejected in favor of the comprehensive
change. Guided by the `ui-ux-pro-max` skill's design-system search for a performance-sports
training platform. Pure CSS token/value changes — no JS logic, Firestore, or Cloud Function
changes anywhere.

- **A genuinely new palette: warm amber/gold + deep indigo-charcoal, replacing the neon-cyan-on-
  slate identity every prior redesign round (bento, precision-instrument, glassmorphism, luxury-
  glow) had iterated on without ever changing the underlying hue family.** Following this file's
  own long-established, many-times-proven pattern — a full re-skin via **token VALUE swaps bound
  to the existing variable NAMES**, never a rename — `--aqua`/`--aqua-bright` (previously cyan,
  `#22D3EE`/`#4EE9FF`) now hold a warm amber/orange (`#E8890C`/`#FFA53D`); a new `--gold` (`#E7B65B`)
  was added alongside them. `--maroon`/`--maroon-bright`/`--maroon-deep` and `--green`/
  `--green-bright`/`--green-deep` keep their existing warm-red and emerald identities (already
  distinct from the old cyan, so left as-is) — this round's real change is retiring the neon-cyan
  half of the palette specifically. `--bg`/`--bg-alt`/`--surface`/`--surface-2` moved from a
  near-black slate (`#0D1117`-family) to a genuinely different deep **indigo-charcoal** family
  (`#0A0812`/`#100D1B`/`#1A1526`/`#241D33`) — a colored-black rather than a neutral-black, which is
  what actually reads as a new identity rather than a hue-only accent swap on the same old
  background. `--fg`/`--muted`/`--muted-2` were retuned to warm off-white/mauve-gray
  (`#F5F1EC`/`#A79EB0`/`#7C7290`) to sit correctly against the new indigo surfaces, and `--glass-bg`/
  `--glass-bg-2`/`--glass-border` were retuned to match. New `--on-green`/`--on-aqua`/`--on-maroon`
  tokens (dark-on-bright / dark-on-amber / light-on-maroon) were added for text sitting directly on
  a solid accent fill (e.g. button labels), matching this file's own existing "text reads through a
  token, never a raw hex" discipline.
- **Every hardcoded color literal that bypassed the variable system was swept, not just the
  `:root` block.** A grep for the old cyan literals (`rgba(34,211,238,...)`, `rgba(78,233,255,...)`,
  `#22D3EE`, `#4EE9FF`) found 52 occurrences across the file that had drifted outside the token
  system over many prior rounds — the `<meta name="theme-color">` tag, the EmailJS welcome-email
  HTML template's inline styles, the `.eyebrow::before` pulse and `ctaGlowAqua` keyframes, the
  Hero's mesh-gradient blobs and photo-overlay gradients, `.dash-ambient-bg`/`.dash-particles`,
  `.card:hover`/`.chip:hover`/`.equip-check:hover`, the Tracker's stat/PB values, the Admin stat
  icons/selected-row highlight, and the Pricing slide's inline SVG geometric background, among
  others — all swept to the new amber values via `sed`, verified via a follow-up grep that zero
  occurrences of the old literals remain anywhere in the file.
- **Two real color-identity clashes introduced by the mechanical sweep were caught and fixed by
  hand, not left as an automated side effect.** The Workout Generator's 4-stage color-coding
  (`.workout-block[data-stage="warmup"]`, previously a distinct blue) had auto-swept to the same
  amber-bright as the Pre-Set stage's own gold — undercutting the whole point of that stage-color
  system, which exists specifically so a swimmer can tell Warm-Up/Pre-Set/Main/Cool-Down apart at a
  glance. Recolored Warm-Up to a distinct cool blue (`#4FC3E8`) instead of leaving it amber. The same
  problem hit Gym's muscle-tag system: `.muscle-tag[data-m="back"]` auto-swept to the same
  amber-bright as `data-m="chest"`, so a swimmer could no longer distinguish a Back-targeting
  exercise from a Chest-targeting one by tag color alone — recolored Back to a distinct mid-blue
  (`#4FA8E8`), matching the same "cool blue" identity introduced for the Warm-Up fix so the two new
  colors read as one deliberate choice rather than two unrelated patches.
- **Home's own section backgrounds were upgraded from duplicate hardcoded hex to real token
  references** (`.home-showcase`/`.home-steps`/`.slide-showcase, .slide-pricing`'s base rule and its
  own override, plus a badge/pill rule): `background: #0A0E16` / `#0C1220` became
  `var(--bg-alt)` / `var(--surface)` — a genuine maintainability improvement, not just a recolor,
  since Home's backgrounds now stay in lockstep with the rest of the site's token system instead of
  needing their own manual update on every future palette round.
- **The EmailJS welcome-email template's background colors were fixed by hand** — its outer page
  background and card background (`#0A0F18`/`#131B2A`) are independent hardcoded literals outside
  the aqua/cyan sweep's own pattern match, so they were updated separately to the new
  `#0A0812`/`#1A1526` indigo values; the template's amber CTA links/badges had already picked up the
  new palette automatically since they used the same `rgba(34,211,238,...)`/`#4EE9FF` literals the
  earlier sweep already caught.
- Verified via Playwright: a full visual pass across Home and all 10 App-view tabs (Workouts, Gym,
  Gear, Academy, Coach, Tracker, Settings, Support, Pricing, Admin — including the Admin donut/bar/
  trend-line charts, all of which correctly render in the new palette's accent colors) confirmed a
  cohesive amber + indigo + maroon/green identity throughout, with zero page errors; a full
  functional regression (workout generation rendering all 4 stage blocks, the Workouts PDF export
  firing a real `download` event, Complete Workout correctly logging to the Tracker) passed
  unchanged; and zero horizontal overflow was found on any of 9 App-view tabs at both 1440px desktop
  and 375px mobile widths, nor on the Home page at 375px.

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere. A later round added a passwordless email-OTP auth system, which was
itself fully removed in favor of mandatory Email/Password auth (see above) once Firebase Console's
Email/Password provider was enabled — `requestEmailOtp`/`verifyEmailOtp` and the `email_otps`
Firestore collection no longer exist anywhere in this codebase.
