# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository contains a single self-contained `index.html` — no build step, bundler, or
package manager — styled and scripted inline. It is the live Swimfit site, deployed to
`swimfit.com` via GitHub Pages from `main`. Development happens on the branch
`claude/claude-md-docs-4sek0o`, merged to `main` only when explicitly requested.

The site is a marketing/training dashboard: a persistent Hero (with a looping background
video generated via image-to-video, falling back gracefully to a static photo layer if it
fails to load) + About section, followed by a tabbed shell: Disciplines, Workouts, Gym, Gear,
Academy, Pricing. Workouts and Gym each get their own full-screen looping background video
(swimmer/pool and dryland-gym respectively, lazy-loaded on first visit to that tab); the
other four tabs share a CSS-only ambient water animation instead. A prior round built out a
full Community feed and a Profile/Swimmer Dashboard (with a client-side simulated
password+OTP auth layer); both were deliberately removed in full to simplify the site back
down to a pure content/training-tool experience — don't re-introduce nav links, footer
links, or JS for either without being asked.

Auth is **real Firebase Authentication** (project `swimfi-ae`), wired in the `<script
type="module">` in `<head>`: Google Sign-In via `signInWithPopup`, plus a **real, typed
6-digit email OTP** — not Firebase's built-in email-link method. `requestEmailOtp` (Cloud
Function) generates the code, hashes+stores it in the server-only `email_otps/{email}`
Firestore collection with an expiry/attempt-lock/rate-limit, and emails it through Swimfit's
own SMTP; `verifyEmailOtp` checks the typed code against that hash, resolves the Firebase
Auth user for that email (creating one via the Admin SDK on first sign-in, so one email
always maps to exactly one account regardless of how it was created), and mints a custom
token that the client exchanges for a real session via `signInWithCustomToken`. Every
signed-in user gets a Firestore `users/{uid}` profile doc (client-written, merged on each
login). The Firebase Cloud Function `onUserCreated` (`functions/index.js`, 1st-gen Auth
trigger, fires for OTP-created accounts too) is the sole place that increments the public
`stats/counters.userCount` doc — exactly once per brand-new account — which the Hero's
"Registered Swimmers" stat tile reads live via `onSnapshot` and hides gracefully if
Firestore can't be reached; that same function sends a branded welcome email over SMTP
(secrets: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, skipped harmlessly if unset, also
reused by requestEmailOtp for the verification-code email). Firestore access is locked down
by `firestore.rules` (a user can only read/write their own profile; `stats/counters` is
public-read/no-client-write; `email_otps` is fully server-only, no client access at all).
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

There's a single hardcoded house account, `swimfit.ae@gmail.com` (the `ADMIN_EMAILS` array in
`functions/index.js`, kept in sync with the `SWIMFIT_ADMIN_EMAIL` constant in index.html's
module `<script>`), that always has full "Ultra" access. Since Academy videos and Gym workouts
were never actually paywalled in code (the "membership" copy on those tabs is marketing, not
enforcement), the only real server-side restriction to bypass was the AI Coach's daily
message cap — `aiSwimCoach` skips `checkAndIncrementCoachUsage` entirely when the verified ID
token's email matches, so it can never be spoofed by a client-supplied field. Client-side,
signing in as that address shows an "Ultra Access" nav badge, skips the Elite-tier upsell
banner on generated workouts, and short-circuits the Subscribe buttons with a friendly alert
instead of opening real Paddle checkout.

Right after a swimmer's first successful sign-in (Google or email-OTP — either path fires
`onAuthStateChanged` the same way), an onboarding modal collects Full Name, Country, Age,
Date of Birth, and a unique Username, gated on `users/{uid}.onboardingComplete` so it
re-prompts on a later sign-in if closed before finishing rather than skipping it forever.
Username uniqueness is enforced by a Firestore transaction claiming `usernames/{username}`
(doc ID = the normalized username) alongside the `users/{uid}` write — `firestore.rules`
only allows *creating* a `usernames/{username}` doc that doesn't already exist and forbids
update/delete entirely, so a username reservation is permanent and race-safe without needing
a Cloud Function.

Between the persistent About section and the tabbed shell, the landing page carries four
conversion-focused sections: a dismissible top **announcement bar** (`#announceBar`, launch
promo code, `localStorage`-persisted dismissal via a synchronous flash-prevention script in
`<head>` so returning visitors never see a layout shift — the fixed `--announce-h` custom
property drives the nav's `top` offset and `body`'s `padding-top` together, never JS-measured);
an **App Preview** (`#appPreview`, a static browser-chrome-framed mockup of the weekly
distance chart / goal ring / specialization chips a signed-in swimmer would actually see);
**Social Proof** (`#socialProof`, an infinite-scrolling testimonial marquee plus branded
Instagram/TikTok follow cards linking to `@swimfit.ae`); and a **Plan Sneak Peek**
(`#planPreview`, a Pro/Elite/Ultra pill-tab switcher that swaps a single preview card's price,
features and accent color client-side — its own "join" CTA only ever routes to the real
Pricing tab via `data-tab`, it never touches checkout directly, so it can't double-fire
alongside the real Subscribe buttons' `[data-plan]` handler).

There are no build, lint, or test commands — verify changes by serving the file locally
(e.g. `python3 -m http.server`) and testing in a browser (Playwright is available in this
environment for automated checks).

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere.
