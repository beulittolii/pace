# Adaptive vocabulary stage layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make remaining vocabulary modes fill the available width without blank tracks.
**Architecture:** Use CSS implicit equal-width columns for actual rendered cards; reset to a single column on mobile. Remove conflicting fixed grid utilities in both renderers.
**Tech Stack:** Static JavaScript/CSS, Node test runner, Playwright, GitHub Pages.
**Spec:** `docs/superpowers/specs/2026-11-10-vocab-stage-layout-design.md`

## Global Constraints
- Preserve current colors, typography, exclusion rules, attempts and grading.
- One/two/three cards fill the whole row equally; mobile uses one column.
- Leave unrelated untracked files untouched; use a feature branch in the existing checkout.

## Review Focus
- Excluding the first or middle card must not leave a grid hole.
- Detail CSS must not override adaptive columns with its existing fixed repeat(3).
- Student list utility classes must not force three columns.
- At 640px and below, reset column flow as well as the column template.
- Passed, locked and available cards must retain equal widths and correct final dividers.

### Task 1: Adaptive stage grid
**Files:** `app.js`, `pace.css`, `index.html`, `tests/vocab-modes-browser.cjs`.
**Interfaces:** Existing `.pace-schedule-stages > .pace-vocab-card` DOM and `App.renderStudentVocabSection` / `App.openVocabTestScheduleModal`; no new JavaScript interface.
- [x] Extend the isolated browser test to load actual styles and assert card bounds fill the grid for all seven enabled-mode combinations, both renderers, widths 1280/768/640/390. Assert equal widths, contiguous columns/rows, no final divider, no overflow.
- [x] Run `node tests/vocab-modes-browser.cjs`; expect a full-width assertion failure with one enabled card.
- [x] Remove fixed three-column classes and use implicit equal columns; preserve detail styling and reset flow on mobile. Bump CSS/JS cache tokens.
- [x] Run browser test and `npm test`; expect all pass. Run PACE/weekly/grammar browser regressions.
- [ ] Fresh review, fix important findings with failing regression tests, then commit, fast-forward main and push as explicitly requested.
- [ ] Verify successful Pages deployment and matching published HTML/CSS/JS.

## Progress
- Baseline: 106/106 unit tests pass; unrelated untracked files preserved.
- Browser RED: single spelling card was 214px inside 642px of available space. GREEN: all 56 layout cases (7 combinations × 4 widths × 2 renderers) pass; desktop/mobile screenshots visually checked. Unit tests remain 106/106.
- Fresh review: ready to merge, no critical/important/minor findings. Vocabulary layout, PACE, weekly review and grammar browser suites pass. Commit/deployment evidence will be reported at release completion.
