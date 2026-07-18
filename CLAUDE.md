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
Academy, Pricing. There is **no account system, no login, and no external auth or billing
integration of any kind** — "Join Pro/Elite/Ultra" on the Pricing tab opens a `mailto:` to
the team instead of any checkout flow. A prior round built out a full Community feed and a
Profile/Swimmer Dashboard (with a client-side simulated password+OTP auth layer); both were
deliberately removed in full to simplify the site back down to a pure content/training-tool
experience — don't re-introduce nav links, footer links, or JS for either without being asked.

There are no build, lint, or test commands — verify changes by serving the file locally
(e.g. `python3 -m http.server`) and testing in a browser (Playwright is available in this
environment for automated checks).

## History for context

An earlier version of the site (removed in commits `589b8f7`, `b46bda6`, `f70e7e0`, later
rebuilt from scratch) used MemberSpace for authentication and billing. MemberSpace has since
been **fully removed** from the codebase — no script tags, checkout links, or `data-ms-member`
attributes remain anywhere.
