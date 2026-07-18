# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository contains a single self-contained `index.html` — no build step, bundler, or
package manager — styled and scripted inline. It is the live Swimfit site, deployed to
`swimfit.com` via GitHub Pages from `main`. Development happens on the branch
`claude/claude-md-docs-4sek0o`, merged to `main` only when explicitly requested.

The site is an app-like dashboard: a persistent Hero + About section followed by a tabbed
shell (Disciplines, Workouts, Gym, Gear, Academy, Community, Profile/Swimmer Dashboard,
Pricing). Authentication and account data are **entirely self-contained** — there is no
external auth provider or third-party integration of any kind. The Swimmer Dashboard /
Profile tab implements its own login flow (username + password + a simulated on-screen OTP,
password hashed client-side with `SubtleCrypto`/SHA-256) with session and profile data
persisted in `localStorage`. This is a client-side demo/prototype security layer, not
production-grade auth — there is no backend, so it is honest about that limitation directly
in its own UI.

There are no build, lint, or test commands — verify changes by serving the file locally
(e.g. `python3 -m http.server`) and testing in a browser (Playwright is available in this
environment for automated checks).

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain. All "Sign In" / "My Account" / "Join Pro/Elite/Ultra" affordances now route
to the internal Profile tab instead of any external checkout or login URL.
