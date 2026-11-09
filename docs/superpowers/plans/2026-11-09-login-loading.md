# Login Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 버튼 로딩 → 기존 스켈레톤 → 데이터 준비 후 실제 화면 전환을 구현한다.

**Architecture:** App의 일회성 스켈레톤을 재표시 가능한 수명주기로 바꾼다. PaceAuth.login은 인증 대기 중 버튼 로딩을 표시하고, 인증 후 enter의 데이터 준비 동안 스켈레톤을 표시한다. 성공·오류·가입 분기를 모두 정리한다.

**Tech Stack:** Vanilla JavaScript, Firebase Auth/Firestore, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-login-loading-design.md`

## Global Constraints
- 기존 JavaScript/Firebase 구조를 유지하며 의존성을 추가하지 않는다.
- 기존 스켈레톤 HTML/CSS와 학생·관리자 변형을 재사용한다.
- 인위적인 최소 대기 시간을 넣지 않는다.
- 서버 인증 방식 변경, 새 로딩 화면 디자인, 배포는 범위 밖이다.

## Review Focus
- 실패 후 재시도: 버튼과 스켈레톤이 정리되어 다시 로그인할 수 있어야 한다.
- 이전 종료 타이머가 실행 중일 때 재표시: 새 스켈레톤을 제거하거나 숨기지 않아야 한다.
- 학생·관리자·미가입 계정: 각 화면 또는 초대 코드 단계로 정확히 전환해야 한다.
- 초기 진입 및 자동 로그인: 기존 초기화가 로그인 중 스켈레톤을 닫지 않아야 한다.
- 모바일·키보드·동작 줄이기: 화면 넘침 없이 상태를 전달하고 로딩 중 숨은 폼 조작을 막아야 한다.

---

### Task 1: 단계별 로그인 로딩과 재사용 가능한 스켈레톤

**Files:**
- Modify: `app.js` (스켈레톤 수명주기), `auth.js` (로그인 상태와 정리), `index.html` (버튼 상태 마크업), `auth.css` (버튼 스피너), `style.css` (필요한 스켈레톤 표시 상태만)
- Test: `tests/auth.test.cjs`, `tests/auth-browser.cjs`

**Interfaces:**
- Consumes: `PaceAuth.login(event)`, `PaceAuth.enter(showHome = true)`, `PaceAuth.identity(user)`, `PaceAuth.loadData()`, 기존 `#initialLoadingSkeleton` 및 역할별 클래스.
- Produces: `App.showLoadingSkeleton(role = 'login')`, `App.finishInitialLoading()` (기존 호출 호환 유지), `PaceAuth.setLoginLoading(loading)`.
- 스켈레톤은 최초 숨김 시 제거하지 않고 보관하며, 재표시 때 이전 종료 타이머를 취소한다. CSS의 화면 숨김 선택자와 hidden 상태를 일치시킨다.

- [ ] **Step 1: Write failing authentication state tests**
  `tests/auth.test.cjs`의 loginFixture를 확장하여 지연 가능한 인증·데이터 Promise와 버튼 label/icon/aria 상태를 제공한다. 검증: 인증 대기 중 `로그인 중…`/스피너/disabled/aria-busy, 아직 스켈레톤 없음; 인증 후 데이터 대기 중 스켈레톤 표시; 준비된 실제 화면 뒤 해제. 인증 실패와 데이터 실패 후 버튼 복원·오류 표시·재시도, 중복 제출 한 번만 인증, 역할 및 미가입 분기도 검증한다.

- [ ] **Step 2: Verify tests fail**
  Run: `node --test tests/auth.test.cjs`. Expected: 새 로딩 상태 검증 실패, 기존 테스트 통과.

- [ ] **Step 3: Implement loading lifecycle and login phases**
  명시된 인터페이스를 구현한다. 인증 직후 스켈레톤을 표시하고 역할 확인 후 변형을 갱신한다. 로그인 호출이 소유한 로딩만 finally에서 해제하고, 실제 화면 또는 가입 화면 전환 이후 해제한다. 데이터 오류 시 로그인 화면과 오류가 보이도록 복구한다. 초기 종료 타이머를 취소하며 기존 boot/enter 호출의 동작은 보존한다. 로딩 상태는 접근 가능한 텍스트로 전달하고 숨은 폼은 조작할 수 없게 한다.

- [ ] **Step 4: Verify authentication tests pass**
  Run: `node --test tests/auth.test.cjs`. Expected: 모든 테스트 통과.

- [ ] **Step 5: Add browser regression tests**
  `tests/auth-browser.cjs`에서 제어 가능한 인증·데이터 응답으로 버튼 로딩 → 스켈레톤 → 화면 전환을 검증한다. 성공·인증 실패·데이터 실패 후 재시도, 학생/관리자/초대 코드 분기, 종료 타이머 경합, 초기 화면 및 자동 로그인 비회귀를 검증한다. 390/768/1440px와 reduced motion에서 가시성·키보드 차단·화면 넘침을 확인한다. 기존 외부 Tailwind 테스트 파일 의존성은 실행 전 확인하고, 새 산출물은 승인된 임시 디렉터리에 둔다.

- [ ] **Step 6: Run full verification and review**
  Run: `npm test`, `npm run test:auth-browser` (필요한 Tailwind fixture를 `TAILWIND_SCRIPT_PATH`로 전달), 변경 JavaScript의 `node --check`, `git diff --check`. Expected: 모두 통과. 브라우저 실행 의존성이 없으면 제약을 명시하고 성공으로 주장하지 않는다. diff를 승인된 흐름과 대조하고 사용자 기존 미추적 파일은 보존한다.

- [ ] **Step 7: Record completion**
  검증 결과와 수정 파일을 보고한다. 커밋·배포 등 추가 통합 작업은 사용자 요청이 있을 때 진행한다.
