# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

This repository is currently **empty** (no tracked files besides `.git`). The prior
codebase — a single static `index.html` page for the Swimfit site, deployed to
`swimfit.com` via GitHub Pages (see the old `CNAME` file in history) — was removed
in commits `589b8f7`, `b46bda6`, and `f70e7e0`, which deleted `index.html`, the
`.claude/skills/ui-ux-pro-max` skill directory, and `.mcp.json` respectively. Those
deletions are already merged into `main`.

Before writing new code here, confirm with the user whether the deletion was
intentional and whether the site is being rebuilt from scratch or restored from
git history (`git show a75c894:index.html` has the last full version of the page).

## History for context

The site (when present) was a single self-contained `index.html` — no build step,
bundler, or package manager — styled and scripted inline, covering marketing
sections plus login/signup screens wired to MemberSpace for authentication.
Iteration happened as direct edits/redesigns to that one file (e.g. "Apply Bold
Athletic redesign", "Full premium visual + motion redesign") committed straight
to `main`, with the MemberSpace integration treated as a fixed boundary not to be
touched by visual redesigns.

There are no build, lint, or test commands — there is nothing to build or test
against right now.
