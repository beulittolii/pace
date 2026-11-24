# PACE 자동 로그인 대기 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장된 세션을 확인하고 복구하는 동안 상태를 표시하고 수동 로그인을 잠근다.

**Architecture:** 초기 HTML에서 대기 상태를 렌더링한다. `PaceAuth.boot()`가 Firebase의 첫 인증 결과를 기준으로 로딩 상태와 컨트롤 잠금을 관리하고, `PaceAuth.enter()`는 기존 역할별 로딩 화면과 화면 전환을 재사용한다.

**Tech Stack:** HTML, CSS, JavaScript, Firebase Auth, Node test runner, Playwright.

**Spec:** [PACE 자동 로그인 대기 화면](../specs/2026-11-24-auto-login-loading-design.md)

## Global Constraints

- 상태 문구는 `로그인 상태 확인 중…`, `자동 로그인 중…`이다.
- 확인 문구는 300ms부터, 자동 로그인 문구는 저장된 세션 확인 즉시 표시한다.
- 수동 로그인 버튼의 `로그인 중…` 표시와 Firebase 세션 저장 방식은 유지한다.
- 새 의존성을 추가하지 않는다.

## Review Focus

- 스크립트 로드 전에도 폼이 잠겨 있어야 한다.
- 세션 없음과 Firebase 초기 연결 실패는 모두 잠금을 풀어야 한다.
- 저장된 세션의 데이터 로드 실패는 로그인 화면과 오류를 보여야 한다.
- 초대 코드 연결이 필요한 계정에서는 대기 화면이 입력을 가리지 않아야 한다.
- 키보드나 직접 `login()` 호출도 대기 중 수동 로그인을 시작하지 않아야 한다.

---

### Task 1: 초기 인증 상태와 입력 잠금

**Files:** `index.html` (초기 상태 문구와 컨트롤), `style.css` (로딩 화면 안내), `app.js` (부팅과 스켈레톤), `auth.js` (입력 잠금과 진입), `auth-data.js` (첫 인증 결과), `tests/auth-browser.cjs` / `tests/auth.test.cjs` (회귀 테스트).

**Interfaces:** `App.showLoadingSkeleton(role = 'login', message = '')`, `PaceAuth.setLoginRestorePending(pending)` 및 `PaceAuth.enter(showHome = true, loadingMessage = '')`. 기존 인자와 수동 로그인 호출을 유지한다.

- [ ] **Step 1: Write failing tests.** Playwright에서 스크립트 실행 전과 첫 인증 콜백을 지연한 상태에 `로그인 상태 확인 중…`과 컨트롤 비활성화를 검증한다. 저장된 사용자와 지연된 데이터의 조합에서 `자동 로그인 중…` 문구 및 입력 잠금을 검증하고, 로드 완료 후 역할 대시보드를 확인한다. 세션 없음, 초기 연결 실패, 데이터 실패, 초대 코드 전환을 검증한다. Node 테스트에서 대기 중 `login()` 호출이 Firebase에 도달하지 않음을 확인한다. 기존 수동 로그인 테스트는 세션이 없는 부팅을 완료한 후 실행한다.
- [ ] **Step 2: Verify red.** `node --test tests/auth.test.cjs`와 `npm run test:auth-browser`를 실행해 구현되지 않은 입력 잠금 또는 로딩 문구에서 실패하는지 확인한다.
- [ ] **Step 3: Implement.** HTML 초기 상태부터 로그인 컨트롤과 회원가입을 비활성화한다. 초기 Firebase 준비와 콜백을 기다리는 동안 `로그인 상태 확인 중…`을 기존 스켈레톤에 표시한다. 첫 유효한 콜백의 저장된 사용자 처리에만 `자동 로그인 중…` 문구를 전달하고, 권한 및 데이터 로드가 끝날 때까지 유지한다. 부팅 실패를 포함해 잠금 해제를 보장하고, 자동 복구 실패 시 기존 오류 문구를 표시한다. 연결 화면과 성공 시 기존 화면 전환을 유지한다. 변경한 기존 정적 파일의 쿼리 버전을 갱신한다.
- [ ] **Step 4: Verify green.** `npm test`, `npm run test:auth-browser`, `git diff --check`를 실행한다. 브라우저 테스트에 로컬 Chrome과 Tailwind 스크립트 경로가 필요하면 `CHROME_PATH`, `TAILWIND_SCRIPT_PATH`를 사용한다.
- [ ] **Step 5: Commit after verification.** 관련 파일만 스테이징하고 `feat: show automatic login progress`로 커밋한다.
