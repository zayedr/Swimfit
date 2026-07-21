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
(`SIGNED_IN_ONLY_TABS = ['coach', 'tracker', 'admin', 'settings']`) additionally switches away from a
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
`SIGNED_IN_ONLY_TABS` alongside Coach/Tracker/Admin) holds four cards: **Swimmer Profile** (Full
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

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere. A later round added a passwordless email-OTP auth system, which was
itself fully removed in favor of mandatory Email/Password auth (see above) once Firebase Console's
Email/Password provider was enabled — `requestEmailOtp`/`verifyEmailOtp` and the `email_otps`
Firestore collection no longer exist anywhere in this codebase.
