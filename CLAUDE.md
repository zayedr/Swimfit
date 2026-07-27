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

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere. A later round added a passwordless email-OTP auth system, which was
itself fully removed in favor of mandatory Email/Password auth (see above) once Firebase Console's
Email/Password provider was enabled — `requestEmailOtp`/`verifyEmailOtp` and the `email_otps`
Firestore collection no longer exist anywhere in this codebase.
