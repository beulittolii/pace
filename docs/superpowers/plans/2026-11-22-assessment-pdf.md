# Assessment PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution or superpowers:subagent-driven-development if the user explicitly requests delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student attach, reopen, replace, and delete one private PDF per assessment on any signed-in device.

**Architecture:** Keep the existing Firebase Auth and Firestore model. A Supabase Edge Function authorizes every operation using the Firebase ID token and existing owner-scoped Firestore records, then speaks to a private Storage bucket using its server credential.

**Tech Stack:** Static PACE frontend, Firebase Auth and Firestore REST, Supabase Edge Functions and Storage, Node test runner.

**Spec:** `docs/superpowers/specs/2026-11-22-assessment-pdf-design.md`

## Global Constraints

- One PDF per assessment, maximum 5,242,880 bytes.
- Offer file picking on desktop and mobile; show the additional drop zone only on desktop-style fine-pointer/hover devices.
- Only the currently linked student has access. No public bucket, shareable download URLs, Firebase Blaze requirement, or browser-side privileged credentials.
- An attachments outage must not block existing PACE features.

## Review Focus

- Valid token from a different Firebase project: reject.
- A different owner, unlinked account, or deleted assessment: reject before touching Storage.
- Incorrect file signature or oversized body without a Content-Length header: reject.
- Multiple dropped files, a dropped non-PDF, or a touch-only device: reject invalid drops, prevent navigation from the drop zone, and retain file picking on mobile.
- Switching account or assessment while a request is in flight: discard stale result.
- Storage outage or a failed replacement: report it without clearing a good attachment or blocking the rest of PACE.

### Task 1: Private attachment service

**Files:** `supabase/functions/assessment-pdf/{index.ts,handler.mjs}`, `supabase/config.toml`, `supabase/migrations/20261122000000_assessment_pdfs.sql`, `tests/assessment-pdf-service.test.cjs`.

**Interface:** A function URL serving `GET ?id=<assessmentId>` (PDF bytes), `HEAD ?id=...` (presence), `PUT ?id=...` (raw PDF), and `DELETE ?id=...`, authenticated with the current Firebase bearer token. `buildHandler({authorize, storage, origins})` takes injectable adapters for tests, returns a Fetch handler, and exposes no client-controlled Storage paths.

- [ ] Write service tests for valid operations and replacement, wrong project, unlinked or wrong owner, missing assessment, 5 MiB boundary, oversized streamed body, invalid PDF magic, disallowed origin, and a storage failure.
- [ ] Run `node --test tests/assessment-pdf-service.test.cjs`; expect a missing-handler failure before implementation.
- [ ] Implement handler and adapters: verify Firebase signature/issuer/audience/expiry, read `members/{uid}`, `students/{studentId}`, and `academicRecords/academicAssessments_{studentId}` using the caller's token, check linked ownership and item ID, and create the private `assessment-pdfs` bucket with a PDF-only/5 MiB cap and no direct client policies. Set `Cache-Control: no-store` on responses carrying private data.
- [ ] Rerun the service tests; expect all cases to pass.

### Task 2: PACE assessment detail

**Files:** `assessment-pdf.js`, `assessment-pdf-config.js`, `index.html`, `tests/assessment-pdf-ui.test.cjs`, `package.json`.

**Interface:** `AssessmentPdf.mount({ assessmentId, studentId, isAdmin })` and `AssessmentPdf.clear()` attach the PDF controls to the existing assessment detail dialog. Config exposes the function URL only; empty config disables controls.

- [ ] Write UI tests for owner-only display, successful selection/open/replace/delete, over-limit feedback, failed replacement, disabling on missing config, and ignored responses after account/assessment changes. Assert that desktop single-file drops use the picker upload path, multi-file and non-PDF drops do not upload or navigate, replacing via drop requires confirmation, and touch-only views retain the picker without the drop zone.
- [ ] Run `node --test tests/assessment-pdf-ui.test.cjs`; expect a missing-client failure before implementation.
- [ ] Implement attachment controls, resolve auth from `PaceAuth`, use server authoritative status, reserve browser context when opening asynchronously, and keep attachment errors confined to the PDF region. Gate the drop area on `(hover: hover) and (pointer: fine)`, cancel default navigation within it on file drop, and share one validation/upload path with the file picker.
- [ ] Add the suites to `npm test`; run it and verify both new and existing suites pass.

### Task 3: Deployment and end-to-end checks

**Files:** `docs/assessment-pdf-setup.md`, `assessment-pdf-config.js`.

- [ ] Document dashboard/CLI access, origin configuration and the free plan's pausing, quota and backup constraints. Record how to identify and remove inaccessible files after assessment deletion without showing student data publicly.
- [ ] With operator-authorized project access, apply the migration, deploy the function and set the public endpoint for PACE. Do not require paid Firebase services or publish secret keys.
- [ ] Verify an authorized student can drag a test PDF onto the desktop detail dialog and open it in a separate mobile session; the mobile file picker still works, another student cannot read the PDF, self-delete succeeds, and an unavailable storage endpoint leaves existing assessment UI usable.
- [ ] Review the changes and report separately which local checks, live deployment, and mobile checks were actually completed. Keep unrelated working tree changes untouched.
