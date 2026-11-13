# Relative Pronouns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관계대명사 공부용 PDF와 동일 원문의 개념 빈칸 시험 및 실전 10문제를 PACE에 추가한다.

**Architecture:** `grammar_data.js`의 단원 레지스트리가 학습·시험의 유일한 원문이다. 공통 종이 렌더러에 정답 표시 또는 입력칸 콜백을 전달하여 학습지와 시험의 내용 및 순서를 일치시킨다. 배정 시 단원을 지정하고 기존 원문 스냅샷과 단원별 재시험 로직을 보존한다.

**Tech Stack:** 기존 일반 JavaScript, Node.js test runner, Playwright PDF 생성, pypdf 텍스트 검증.

**Spec:** `docs/superpowers/specs/2026-11-13-relative-pronouns-design.md`

## Global Constraints
- 공부용 PDF의 원문을 개념 시험지에 그대로 옮기고 빈칸만 뚫는다. 문장, 예문, 해석, 항목 순서는 바꾸지 않는다.
- 범위: who, which, that, 목적격·소유격, 생략, 전치사+관계대명사, 계속적 용법, what. 관계부사는 제외한다.
- 실전 5지선다 10문제, 정답·해설 포함. 기존 개념·실전 각각 80점 통과와 재시험 동작 유지.
- 기존 사용자 파일, 저장된 시험, 인증과 다른 시험 동작을 보존한다. 배포·실제 학생 배정은 하지 않는다.
- 사용자 요청 없는 커밋은 하지 않는다. 아래 체크리스트로 진행 상황을 기록한다.

## Review Focus
- 단원을 생략한 기존 호출은 가정법으로 동작한다. 알 수 없는 단원은 저장 전에 거절한다. Task 2에서 검증.
- 같은 학생의 서로 다른 단원은 최초 배정·실패·재시험 이력이 섞이지 않는다. Task 2에서 검증.
- 기존 스냅샷에 새 제목 메타데이터가 없어도 가정법 종이가 정상 표시된다. Task 1에서 검증.
- PDF와 시험은 빈칸 표현 외 모든 본문과 순서가 같다. HTML 특수문자도 동일하게 보인다. Tasks 1, 3에서 검증.
- 이미 배정된 시험 수정·재시험은 선택 UI 때문에 단원이나 원문이 바뀌지 않는다. Task 2에서 검증.

---

### Task 1: 관계대명사 원문과 공통 개념 종이

**Files:** Modify `grammar_data.js`, `grammar.js`, `index.html`; create `grammar_paper.js`; test `tests/grammar.test.cjs`.

**Interfaces:** `GRAMMAR_UNITS`는 id→기존 형식 단원 객체, 기존 `GRAMMAR_UNIT`는 가정법 호환 참조. `GrammarPaper.render(content, renderText)`는 본문 HTML을 반환하고 각 텍스트 필드에 기존 빈칸 키를 전달한다. `GrammarPaper.studyText(text)`는 토큰만 정답으로 치환한다. 단원별 `definitionHeading`, `sectionsHeading`, `expressionsHeading`은 선택 속성이며 없으면 기존 가정법 제목을 사용한다.

- [x] 빈칸 ID의 유일성, 정답 복원 시 동일 본문·순서, 특수문자 이스케이프, 구버전 가정법 렌더링, 관계대명사 10문제의 5개 선택지·정답 범위·해설 및 70/80/100점 경계 테스트를 작성한다.
- [x] `node --test tests/grammar.test.cjs` 실행, 새 인터페이스 부재로 실패함을 확인한다.
- [x] 관계대명사 원문과 10문제를 레지스트리에 추가한다. 주격·목적격·소유격, that의 제한, 생략, 전치사, 계속적 용법, what을 설명하고 각 실전 문제를 배운 항목에 연결한다. 복수 정답이 가능한 선택지를 피한다.
- [x] 공통 렌더러를 구현하고 `renderGrammarConceptPaper`에서 사용한다. 버튼과 진행 UI는 공통 본문 밖에 둔다. 새 스크립트를 데이터 다음, 앱 사용 전 로드한다.
- [x] `node --test tests/grammar.test.cjs` 실행, 기존·신규 테스트 통과를 확인한다.

### Task 2: 단원별 배정과 재시험 연결

**Files:** Modify `grammar_store.js`, `grammar.js`, `index.html`; test `tests/grammar.test.cjs`.

**Interfaces:** `AppData.assignGrammarTest({ studentId, date, time, endTime, parts, note, unitId = 'subjunctive' })`. 배정 UI의 단원 select ID는 `formGrammarUnit`, `grammarAssignmentUnit`. `App.renderGrammarAssignmentParts(unified = false)`는 해당 단원을 기준으로 배정 가능 영역과 PDF 링크를 표시한다.

- [x] 기본 가정법 배정, 잘못된 단원 거절, 두 단원의 독립 배정·재시험·스냅샷, 일정 수정 시 단원 유지 테스트를 작성한다. 양쪽 배정 폼이 unitId를 전달하고 재시험 버튼이 원 시험 단원을 전달하는지 검증한다.
- [x] `node --test tests/grammar.test.cjs` 실행, 단원 분리 테스트 실패를 확인한다.
- [x] 선택 단원으로 root ID·시험 제목·원문 스냅샷을 생성한다. 기존 root가 있으면 원문의 버전을 유지한다. 양쪽 폼에 단원 선택을 추가하고 기존 시험 수정 시 단원 변경을 막는다. 상세 재시험 버튼이 해당 단원을 연다.
- [x] `node --test tests/grammar.test.cjs` 실행, 모두 통과함을 확인한다.

### Task 3: 출력용 PDF 생성과 최종 확인

**Files:** Create `scripts/build-grammar-study.cjs`, `관계대명사_개념학습.pdf`; modify `package.json`, `grammar.js`, `index.html`; test `tests/grammar.test.cjs`.

**Interfaces:** `npm run build:grammar-study`가 Task 1의 관계대명사 데이터와 공통 렌더러를 사용하여 루트 PDF를 생성한다. 생성 스크립트는 외부 서비스 없이 기존 Playwright와 로컬 글꼴을 사용하고 브라우저를 finally에서 닫는다. `--html` 인자로 검증용 HTML을 표준 출력할 수 있다.

- [x] 생성 HTML과 시험 HTML의 본문 텍스트·순서 일치 테스트 및 학습지 다운로드 링크 존재 테스트를 작성한다. 빈칸 입력값 대신 정답을 복원하여 비교한다.
- [x] `node --test tests/grammar.test.cjs` 실행, 생성기 또는 다운로드 링크 부재로 실패함을 확인한다.
- [x] 생성기와 npm 명령을 구현하고 A4 인쇄용 CSS를 적용한다. PDF에 시험 입력칸·제출 버튼·정답 토큰이 노출되지 않도록 한다. 학습자료 링크와 변경된 스크립트 캐시 버전을 반영한다.
- [x] `npm run build:grammar-study` 실행, PDF를 생성한다. pypdf로 한글 제목·예문과 페이지 수를 확인하고 PDFKit으로 실제 PDF를 렌더링하여 잘림과 글꼴을 확인했다.
- [x] `npm test` 실행, 전체 통과를 확인한다. 브라우저에서 단원 선택·빈칸 시험·실전 화면·PDF 링크를 확인하되 실제 클라우드 데이터는 쓰지 않는다.
- [x] `git diff --check`, 변경 파일 목록을 확인하고 학습지 경로와 검증 결과를 사용자에게 전달한다.
