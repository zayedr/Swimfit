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
fails to load) + About section, followed by a tabbed shell: Disciplines, Workouts, Gym, Gear,
Academy, AI Coach, Distance Tracker, Pricing. Workouts and Gym each get their own full-screen looping background video
(swimmer/pool and dryland-gym respectively, lazy-loaded on first visit to that tab); the
other four tabs share a CSS-only ambient water animation instead. A prior round built out a
full Community feed and a Profile/Swimmer Dashboard (with a client-side simulated
password+OTP auth layer); both were deliberately removed in full to simplify the site back
down to a pure content/training-tool experience — don't re-introduce nav links, footer
links, or JS for either without being asked.

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
(`SIGNED_IN_ONLY_TABS = ['coach', 'tracker', 'admin']`) additionally switches away from a
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
over the identical endpoint, with its own in-memory chat history. Both surfaces let a
swimmer attach up to 3 photos per message (workout log pages, gear, technique/posture
stills); images are downscaled client-side to a 1600px longest edge and re-encoded as JPEG
on a canvas before upload. `aiSwimCoach` accepts an optional `images` array
(`{mediaType, data}` per image, base64-encoded, validated server-side against a media-type
allowlist, a per-image size cap, and a per-message count cap) and forwards them to Claude as
multimodal content blocks alongside the text turn — the floating widget never sends images,
so this is purely additive.

The full-screen Coach page has three gate states, all driven by `window.renderCoachPageGate()`
on every `swimfit:accesschange`: signed-out (`data-auth-signed-out`, unchanged), `locked`
(trial expired, no active plan — `#coachPageLockedPrompt`, a Coach-specific "Upgrade to Pro"
prompt; belt-and-suspenders, since the site-wide `#paywallOverlay` already blocks a locked
swimmer from reaching any tab at all before this ever renders), and everyone else who isn't
Elite/Ultra/trial/admin (`#coachPageTierLock`, unchanged "upgrade to Elite" prompt — Pro keeps
the floating widget only). The chat itself got a pass toward feeling like a real product:
consecutive messages from the same sender are visually grouped (tighter spacing, softened inner
corner — `coach-msg-grouped`, tracked via a `lastRenderedRole` variable in `wireAiCoachPage`),
and an empty conversation shows four suggested-prompt chips (`#coachPagePrompts` — "Build a
taper plan", "Explain lactate threshold", etc.) that hide the moment either a real message is
sent or persisted history loads in, so they only ever appear alongside the canned welcome
message on a genuinely fresh conversation.

**Trial + subscription tier system.** Every new account gets a strict 7-day free trial starting
at signup (`users/{uid}.trialStartedAt`, see above). The nav's trial badge shows a real, live
countdown rather than a static day count — days+hours while more than a day remains, then
hours+minutes, then just minutes, computed from `access.trialEndsAt` on every
`swimfit:accesschange` and kept current by a 30-second recompute interval (`recomputeAccessLevel`
was previously on a 5-minute timer; tightened this round so the displayed countdown never drifts
far from real wall-clock time). The instant the countdown reaches zero, `recomputeAccessLevel`
resolves the swimmer to `'locked'` and the full-screen `#paywallOverlay` takes over — there is no
grace window. Once the trial lapses, access depends on the swimmer's Paddle plan: `paddleWebhook` (`functions/index.js`)
resolves each event's Paddle **product** id (not price id — see the Paddle risk note below) to
a plan key (`pro`/`elite`/`ultra`) via `PADDLE_PLAN_BY_PRODUCT_ID` and writes `{plan, status,
...}` onto `paddle_subscriptions/{uid}`; an `active`/`trialing` status counts as paid. The
resolved access level — `'trial' | 'pro' | 'elite' | 'ultra' | 'locked' | 'admin'` — is computed
in two places that must stay in sync: client-side in index.html
(`recomputeAccessLevel`/`window.__swimfitAccess`, reactive via an `onSnapshot` on
`paddle_subscriptions/{uid}` plus the 30-second re-check timer noted above, broadcast as a
`swimfit:accesschange` DOM event) and server-side in `functions/index.js`
(`getAccessLevel(uid, email)`, Admin-SDK reads only — never trusts anything the client claims).
`getAccessLevel` checks `isAdminEmail(email)` and returns `'admin'` immediately, before any
Firestore read, so the admin override lives in exactly one place rather than being duplicated
(and potentially forgotten) at each call site — `aiSwimCoach` is currently the only caller. A
`'locked'` swimmer (trial expired, no active plan) sees a full-screen `#paywallOverlay` that
blocks the whole dashboard; the one Cloud Function that actually costs money, `aiSwimCoach`,
independently re-derives access level and rejects the call outright when locked, and rejects
`images` specifically for the `pro` plan (Pro gets the floating widget only — no full-screen
page, no saved history, no photo upload; enforced both client-side via
`coachPageTierAllowed()` and server-side, since that's a real API-cost boundary). Workouts'
"Elite" training level (a pre-existing difficulty tier, distinct from the *subscription* tier
of the same name) is gated the same way: `tierAllowsEliteLevel()` replaces the generated set
with a `.tier-lock-card` upgrade prompt for `pro`, and shows a "you're previewing this on
trial" nudge instead of real content for trial swimmers. Gym workouts, Technique Academy
videos, and the new Distance Tracker tab are **not** tier-gated — open to any signed-in
swimmer regardless of plan, matching how they always worked before this system existed.
Elite/Ultra/trial (and the admin account below) get a persisted AI Coach transcript on the
full-screen page — `coach_history/{uid}` (text only, capped at 60 entries; image bytes are
never persisted, only sent per-request) — loaded once per sign-in and upserted after each
exchange; Pro never reaches that surface, so it has no persisted history by construction.

There's a single hardcoded house account, `swimfit.ae@gmail.com` (the `ADMIN_EMAILS` array in
`functions/index.js`, kept in sync with the `SWIMFIT_ADMIN_EMAIL` constant in index.html's
module `<script>`), that always resolves to access level `'admin'` — full Ultra-equivalent
access everywhere above, trial/subscription status irrelevant. Signing in as that address
shows an "Ultra Access" nav badge and short-circuits the Subscribe buttons (both the Pricing
tab's and the paywall overlay's) with a friendly alert instead of opening real Paddle checkout.

That same address also unlocks a hidden **Admin Panel** tab (`data-tab="admin"`,
`#panel-admin`, nav entry shown/hidden via `[data-admin-only]`). It lists every registered
swimmer (`adminListUsers`, capped at the 300 most recent) with their name, email, resolved plan,
and join date, and lets the admin grant/clear a manual plan override per swimmer
(`adminSetUserPlan`, writes `paddle_subscriptions/{uid}` with `source: 'admin_grant'` — same
shape `paddleWebhook` writes, so it's picked up identically by
`getAccessLevel`/`recomputeAccessLevel`). `adminListUsers` was hardened this round: a
`safeMillis()` helper guards every `.toMillis()` call (a doc missing a timestamp field no longer
throws), and each swimmer's subscription/chat sub-lookups run in their own isolated `try/catch`
so one malformed record can't 500 the entire list — the previous "Could not load the user list"
failure mode was traced to this class of issue, on top of the general `invoker: 'public'`
redeploy caveat noted above. Every `admin*`
Cloud Function independently re-verifies the caller's ID token and `isAdminEmail()` — none of
this is expressed as a Firestore rule, since "list every user" or "write any user's plan" is
exactly the kind of cross-user privilege that's safer funneled through a server-verified
endpoint than trusted to a security-rules expression. Direct messaging is a per-swimmer thread
at `admin_chats/{uid}/messages` — the admin's side reads/sends via `adminGetThread`/
`adminSendMessage` (Admin SDK), while the swimmer's own side (a floating inbox widget, mirrored
from the AI Coach fab but bottom-left) reads/replies straight through Firestore in real time,
gated by ordinary owner-only rules (`sender` must be `'user'` on their own writes). The
swimmer's inbox widget sits above the paywall overlay in z-order deliberately — a locked-out
swimmer can still read and reply to a support message from the team.

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
`aiSwimCoach` already does for every caller). Every Gym exercise card also gained a "Watch
Technique" block (`.gym-video-frame`, redesigned this round from a plain `.gym-watch-btn` text
link into a full 21:9 video-frame placeholder with a centered play button and label) that opens
the same `#videoModal` "Coming Soon" placeholder already used for in-production Academy videos,
rather than a second bespoke modal — every exercise (Arm Circles, Jumping Jacks, Planks, etc.)
gets one.

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

Between the persistent About section and the tabbed shell, the landing page carries five
conversion-focused sections: a dismissible top **announcement bar** (`#announceBar`, launch
promo code, `localStorage`-persisted dismissal via a synchronous flash-prevention script in
`<head>` so returning visitors never see a layout shift — the fixed `--announce-h` custom
property drives the nav's `top` offset and `body`'s `padding-top` together, never JS-measured);
an **Offers Strip** (`#offersStrip`, right after About — two eye-catching cards for the 7-day
free trial and Ultra's 2-months-free annual pricing, separate from the SWIM20 launch code in
the announcement bar above); an **App Preview** (`#appPreview`, a static browser-chrome-framed
mockup of the weekly distance chart / goal ring / specialization chips a signed-in swimmer
would actually see); **Social Proof** (`#socialProof`, an infinite-scrolling testimonial
marquee plus branded Instagram/TikTok follow cards linking to `@swimfit.ae`); and a **Plan
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

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere. A later round added a passwordless email-OTP auth system, which was
itself fully removed in favor of mandatory Email/Password auth (see above) once Firebase Console's
Email/Password provider was enabled — `requestEmailOtp`/`verifyEmailOtp` and the `email_otps`
Firestore collection no longer exist anywhere in this codebase.
