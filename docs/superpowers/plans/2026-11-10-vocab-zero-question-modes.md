# Zero-question vocabulary modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Omit zero-question vocabulary modes throughout assignment, attempts, grading and weekly reviews.
**Architecture:** Centralize active-direction derivation in AppData; consume it from App and WeeklyReviewLogic. Preserve existing saved schemas.
**Tech Stack:** Static JavaScript, Node test runner, Playwright, GitHub Pages.
**Spec:** `docs/superpowers/specs/2026-11-10-vocab-zero-question-modes-design.md`

## Global Constraints
- Blank means existing default 40; explicit 0 excludes ordinary modes; positive counts remain integers 5–200.
- No new weekly-review integrated mode, dependencies, migration, or rewriting frozen/submitted reviews.
- Preserve legacy counts and English-definition-only behavior; leave unrelated files untouched.

## Review Focus
- Legacy missing/null counts and legacy flat count fields retain defaults.
- All-zero and invalid positive counts cannot save.
- Skipped middle/first stages and direct attempts respect exclusions.
- Excluded historical results cannot block PASS or review preparation.
- Mixed source modes for correct words cannot introduce an unsupported review type.

### Task 1: Assignment, display, attempts and grading
**Files:** Modify `data.js`, `app.js`, `index.html`, `package.json`; create `tests/vocab-modes.test.cjs`.
**Interfaces:** Produce `AppData.getVocabQuestionCount(test, direction) -> number` and `AppData.getVocabDirections(test) -> number[]`; default 40 and directions [2,3,4], English definitions [5].
- [x] Write failing tests for zero count persistence, form edit, validation, hidden buttons, prerequisite skipping, excluded direct attempts, summaries and active-only PASS.
- [x] Run `node --test tests/vocab-modes.test.cjs`; expect failures demonstrating current behavior.
- [x] Implement helpers and their UI/save/start/status consumers; allow zero in ordinary number inputs with guidance.
- [x] Run targeted tests and `npm test`; expect all pass.

### Task 2: Weekly review source restrictions
**Files:** Modify `weekly_review_logic.js`, `tests/weekly-review.test.cjs`, README; load `data.js` in isolated weekly fixture for shared helpers.
**Interfaces:** Consume Task 1 helpers; derive candidate review modes from actual source directions.
- [x] Write failing tests for choice-only/spelling-only correct and wrong words, excluded histories, mixed word sources, integrated/definition regressions and frozen paper preservation.
- [x] Run `node --test tests/weekly-review.test.cjs`; expect new restriction failures.
- [x] Filter active source results and limit correct-word question mode selection to supported modes; ignore excluded grading history for readiness.
- [x] Run targeted tests, complete suite and browser smoke tests; expect all pass.

### Task 3: Review and publish
- [x] Review whole diff using a fresh reviewer, address important findings with regression tests.
- [x] Confirm clean syntax, full test suite and browser flows; update plan progress.
- [ ] Commit only intended files (retain existing version hook), fast-forward main and push as requested.
- [ ] Verify the deployment serves the new commit and changed assets.

## Progress
- Baseline: 93/93 tests pass. Existing unrelated untracked documents/launchers preserved.
- Execution: inline on `feat/vocab-zero-question-modes` in the existing checkout; no new worktree created.
- Verification: 106/106 unit tests; vocabulary mode, weekly review, PACE and grammar browser tests pass; syntax checks and `git diff --check` pass.
- Weekly browser fixture now has a genuine spelling source instead of relying on unsupported automatic spelling questions from choice-only results.
- Fresh-context review: ready to merge, no critical/important/minor findings. Auth browser regression also passed. Commit/deployment evidence will be reported at release completion.
