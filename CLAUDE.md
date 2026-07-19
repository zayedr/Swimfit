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
type="module">` in `<head>`: Google Sign-In via `signInWithPopup`, plus passwordless email
sign-in via Firebase's native email-link flow (`sendSignInLinkToEmail` /
`signInWithEmailLink` — a secure single-use link mailed to the user's own Gmail, not a
custom OTP code). Every signed-in user gets a Firestore `users/{uid}` profile doc
(client-written, merged on each login). The Firebase Cloud Function `onUserCreated`
(`functions/index.js`, 1st-gen Auth trigger) is the sole place that increments the public
`stats/counters.userCount` doc — exactly once per brand-new account — which the Hero's
"Registered Swimmers" stat tile reads live via `onSnapshot` and hides gracefully if
Firestore can't be reached; that same function sends a branded welcome email over SMTP
(secrets: `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`, skipped harmlessly if unset).
Firestore access is locked down by `firestore.rules` (a user can only read/write their own
profile; `stats/counters` is public-read/no-client-write). "Join Pro/Elite/Ultra" on the
Pricing tab still opens a `mailto:` instead of any checkout flow, aside from the
Firebase-gated Paddle Billing checkout wired to the Subscribe buttons. A floating "AI Swim
Coach" chat widget (gated behind sign-in) calls the `aiSwimCoach` Cloud Function, which
proxies to the Claude API behind a strict swim-only system prompt and a per-user daily
message cap.

Right after a swimmer's first successful sign-in (Google or email-link — either path fires
`onAuthStateChanged` the same way), an onboarding modal collects Full Name, Country, Age,
Date of Birth, and a unique Username, gated on `users/{uid}.onboardingComplete` so it
re-prompts on a later sign-in if closed before finishing rather than skipping it forever.
Username uniqueness is enforced by a Firestore transaction claiming `usernames/{username}`
(doc ID = the normalized username) alongside the `users/{uid}` write — `firestore.rules`
only allows *creating* a `usernames/{username}` doc that doesn't already exist and forbids
update/delete entirely, so a username reservation is permanent and race-safe without needing
a Cloud Function.

There are no build, lint, or test commands — verify changes by serving the file locally
(e.g. `python3 -m http.server`) and testing in a browser (Playwright is available in this
environment for automated checks).

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere.
