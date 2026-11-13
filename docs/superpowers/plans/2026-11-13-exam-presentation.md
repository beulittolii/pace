# Exam Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 화면을 보존하면서 계정 공통 시험 모드와 승인된 A 시험지형 모션 문법·복습 화면을 구현한다.

**Architecture:** 학생의 examMode를 공통 시작 선택기에서 확인하고 응시 세션에 고정한다. 기존 렌더러는 유지하고 모션만 독립된 렌더러·CSS에서 표시한다. 동일한 출제 데이터, 빈칸 키, 답안 상태와 기존 제출/채점 메서드를 재사용한다.

**Tech Stack:** 기존 JavaScript/Firebase Auth/Firestore, Node test runner, Playwright, Firestore emulator.

**Spec:** `docs/superpowers/specs/2026-11-13-exam-presentation-design.md`

## Global Constraints
- 기존 모드는 현재 화면·문항 배치·입력 방식·제출 흐름을 그대로 유지한다. 새 CSS와 머리말은 기존 화면에 적용하지 않는다.
- 선택한 모드는 문법·복습 공통이다. 계정에 저장하여 새로고침·다른 기기에서도 유지한다.
- 공부용 PDF와 개념 시험의 원문·예문·해석·순서 및 빈칸 ID는 유지한다. 시험지 장식은 공통 개념 본문 바깥에 둔다.
- 모션 문법 실전만 실제 10문항을 한 페이지에 표시한다. 기존 모드의 한 문항씩 응시를 바꾸지 않는다.
- 합격 기준·수동 채점·응시 시각·재시험·복습 회차·시험 중 이탈 정책을 보존한다.
- 모션 스타일은 독립된 루트 아래에만 적용한다. 상용 폰트를 임의로 내려받거나 포함하지 않는다.
- 현재 작업 폴더에서 직접 구현한다. 사용자 파일을 보존하며 커밋·푸시·운영 배포는 포함하지 않는다.

## Review Focus
- 기존 계정의 examMode 부재/알 수 없는 값과 학생 전환: 최초 선택을 요구하되 취소/실패 때 시험을 시작하지 않는다. Tasks 1, 2.
- 기존 모드: 변경 전 화면/DOM/한 문항씩 실전 진행이 그대로이고 모션 CSS가 새어들지 않는다. Tasks 2, 4.
- 저장 도중 로그아웃·계정 연결 변경·중복 시작: 다른 학생의 설정/답안에 영향을 주지 않는다. Tasks 1, 2, 4.
- 시험 중 프로필 또는 클라우드 설정 갱신: 현재 답안과 문제 순서를 유지하고 다음 응시에만 반영한다. Tasks 2, 3.
- 애니메이션 취소·동작 줄이기·제출 실패: 입력 불가/inert/스크롤 잠금이 남지 않고 기존 재시도 및 이탈 정책이 유지된다. Tasks 2, 3, 4.

---

### Task 1: 계정 설정 저장과 최초 공통 선택

**Files:** Create `exam_mode.js`, `tests/exam-mode.test.cjs`; modify `auth.js`, `index.html`, `auth.css`, `firestore.rules`, `firestore-rules.html`, `tests/auth.test.cjs`, `tests/auth-rules.test.cjs`, `package.json`.

**Interfaces:** `ExamPresentation.getMode(student) -> 'classic' | 'motion' | null` 검증, `ExamPresentation.ensureMode(studentId) -> Promise<mode | null>` 최초 선택/저장/취소, `ExamPresentation.cancelPending()` 이탈 시 정리. `PaceAuth.persistExamMode(mode) -> Promise<mode>` 공통 본인 계정 저장, `PaceAuth.saveExamMode(event)` 프로필 폼 저장. 학생 선택 필드는 `examMode`; 최초 대화상자 ID `examModeDialog`; 프로필 탭/폼 ID `examModeSettingsTab`, `examModeSettingsForm`.

- [x] `getMode`가 classic/motion만 인정하고 부재·잘못된 값을 null로 처리하는 테스트, 저장 성공/실패/로그인 세대 변경 및 다른 학생 연결 거절 테스트를 작성한다. 예: `assert.equal(getMode({examMode:'classic'}), 'classic'); assert.equal(getMode({examMode:'other'}), null)`.
- [x] `node --test tests/exam-mode.test.cjs tests/auth.test.cjs` 실행하여 새 기능 부재에 따른 실패를 확인한다.
- [x] 공통 선택창과 프로필 탭을 구현한다. 실제 저장 성공 후 로컬 학생 캐시를 갱신하며 실패 시 선택을 유지한다. 기존 탭 이동/저장 잠금/접근성을 보존한다. 새 테스트를 npm test에 포함한다.
- [x] 규칙 테스트를 먼저 추가한다: 본인 classic/motion 저장 성공, 타인·연결 중·임의 문자열·null·역할/성적/계정 필드 동시 변조 실패, 기존 target 저장 성공. `npm run test:auth-rules`에서 새 저장 허용 케이스의 실패를 확인한다.
- [x] 학생 update 규칙에 examMode만 추가하고 값은 classic/motion으로 제한한다. target 검증과 다른 필드 보호를 유지하고 `firestore-rules.html`의 복사 내용과 일치시킨다.
- [x] 위 단위/규칙 테스트와 `npm test`가 모두 통과함을 확인한다. Java 미설치 시 임시 휴대용 Java 21을 사용하고 검증 환경을 기록한다.

### Task 2: 독립된 모션 시험지 셸과 시작 분기

**Files:** Create `exam_motion.js`, `exam_motion.css`, `tests/exam-motion.test.cjs`; modify `grammar.js`, `weekly_review.js`, `app.js`, `auth.js`, `index.html`, `package.json` 및 스크립트를 수동 로드하는 관련 브라우저 fixture.

**Interfaces:** `ExamMotionPaper.open({kind, title, content})`는 실제 입력 본문을 가진 전용 루트를 열고 한 번 출력한다. `ExamMotionPaper.replaceContent(content)`는 애니메이션 없이 같은 종이 본문을 교체한다. `ExamMotionPaper.close()`는 프레임/타이머/inert/스크롤을 복구한다. `ExamMotionPaper.header(kind, title, instructions)`는 간결한 공통 머리말을 반환한다. 시작 시 기존 grammar/weeklyReview 세션에 `presentationMode`를 한 번 저장한다.

- [x] 최초 선택 취소/실패 시 grammarStartedAt 및 복습 세션이 생기지 않는 테스트, classic 분기의 기존 DOM 유지, 모드 고정/변경된 설정의 다음 응시 적용 테스트를 작성한다.
- [x] 해당 새 단위/브라우저 테스트를 실행하여 시작 분기와 셸 부재로 실패함을 확인한다.
- [x] 문법·복습 시작에서 ensureMode를 먼저 확인하고, 돌아왔을 때 동일 학생/시험/로그인 상태인지 재검증한다. classic은 원래 호출 경로, motion은 전용 셸로 연결한다. 로딩/저장 중 중복 시작을 방지하고 모든 종료/로그아웃 경로에서 필요한 정리를 수행한다.
- [x] 시안의 고정 배출구·급지·인쇄 마스크를 실제 입력 DOM에 구현한다. 프레임/타이머는 한 인스턴스에서 관리하고, 시작 완료 때만 입력을 허용한다. 동작 줄이기에서는 즉시 또는 짧게 전환한다. 원본 전체 헤더·성명·일자 표는 만들지 않는다.
- [x] 머리말은 부제목 문법 테스트/복습 테스트와 단원명/주간 단어 복습만 표시한다. desktop 제목 36px·부제목 13px, mobile 제목 28px·부제목 11px을 기준으로 한다. 별도 글머리표 안내를 제공한다. 개념 본문은 GrammarPaper를 그대로 사용한다.
- [x] `npm test`, 기존 grammar/weekly/auth 브라우저 테스트, 신규 시작/종료/동작 줄이기 테스트를 실행한다. 기존 브라우저 fixture는 명시적 classic 설정을 넣어 기존 동작 회귀를 계속 검증한다.

### Task 3: 시험지형 선택지와 실제 문법·복습 응시 연결

**Files:** Modify `exam_motion.js`, `exam_motion.css`, `grammar.js`, `weekly_review.js`, `tests/grammar.test.cjs`, `tests/weekly-review.test.cjs`, `tests/exam-motion.test.cjs`; create `tests/exam-motion-browser.cjs`; modify `package.json`.

**Interfaces:** 모션 문법 개념은 기존 `renderGrammarText` 키/답안 콜백을 쓴다. 문법 실전은 10개 질문을 같은 DOM에 렌더링하고 선택 시 `session.answers.practice[index]`를 갱신하며 기존 `submitGrammarPractice()`로 제출한다. 복습은 기존 `setWeeklyReviewAnswer(id,value)` / `submitWeeklyReview()`를 사용한다. 표시 및 progress 갱신은 답안 DOM을 재생성하지 않는다.

- [x] 42개 관계대명사/34개 가정법 빈칸의 원문/키 보존, 10문항·50개 선택지 동시 표시, 두 단/모바일 문항 순서, 미응답 확인·전송 실패 후 답 유지, 동일 80점 기준 테스트를 작성한다. 복습의 객관식·스펠링·오답 회차/성적 보존도 새 모드에서 테스트한다.
- [x] `node --test tests/exam-motion.test.cjs tests/grammar.test.cjs tests/weekly-review.test.cjs` 실행, 기능 부재에 따른 실패를 확인한다.
- [x] A 시험지형만 구현한다. ①~⑤와 선택된 원 번호는 라디오 하나의 시각 표현이며 원래 input의 키보드/포커스/그룹 의미를 유지한다. 선택지는 줄별 배경·테두리 없이 왼쪽 15px/모바일 16px 정도 여백을 둔다. 문법 실전은 1~5 / 6~10 두 단, 모바일 1~10 한 단으로 배치하고 끝에서 일괄 제출한다.
- [x] 복습은 같은 시험지형 선지, 뜻 박스와 넓은 한 줄 영어 입력란을 사용한다. 자동 대문자·맞춤법·자동완성을 끄고 정답 길이 힌트를 노출하지 않는다. 입력란 아래 추가 밑줄을 만들지 않는다.
- [x] 공통 개념 원문과 PDF 동일성을 검증하고, 실제 시작→개념→실전→제출→기존 결과/해설·수동 채점, 복습 시작→제출→오답 재응시를 격리된 클라우드 fixture로 검증한다. 입력/단계 전환/결과 진입에서 출력 연출을 반복하지 않는다.
- [x] `npm test` 및 신규 모션 브라우저 테스트가 통과함을 확인한다. 모바일 터치 영역·가로 넘침·키보드 라디오 선택·제출 실패 후 답안 유지를 확인한다.

### Task 4: 상세 결과·다운로드 정리와 전체 회귀

**Files:** Modify `grammar.js`, `pace.css`, `tests/grammar.test.cjs`, `tests/grammar-browser.cjs`, `tests/auth-browser.cjs`, `tests/exam-motion-browser.cjs`, `index.html`, `README.md`.

**Interfaces:** 기존 `grammarStatus`, `GrammarLogic.latest`, 결과·수동 채점 버튼과 공부용 PDF 경로를 유지한다. 최신 결과 행에서 순번은 제거한다. PDF 링크는 `<a download>`로 유지하면서 파일 아이콘·이름·형식을 담은 버튼 스타일을 제공한다.

- [x] 최신 개념/실전 점수·통과/미달/채점 대기·미배정, 역할별 답안/채점 동작, PDF 다운로드, 좁은 모달에서 줄바꿈/넘침 테스트를 작성한다. 기존 함수 소비 결과를 검증하고 클래스 문자열 자체만 검사하지 않는다.
- [x] 새 UI 테스트 실행으로 기존의 큰 카드/링크 표현이 요구와 다름을 확인하고, 상세 모달에만 성적표형 행과 다운로드 버튼을 적용한다. 다른 시험/복습 상세 카드에는 스타일을 누출하지 않는다.
- [x] 실제 파일 의존 순서와 스크립트 캐시 버전을 갱신하고 README에 공통 모드·기존 보존·설정 변경 및 보안 규칙 적용 필요를 문서화한다. 사용자용 업데이트 공지는 임의로 추가하지 않는다.
- [x] `npm test`, `npm run test:auth-rules`, `npm run test:auth-browser`, `npm run test:grammar-browser`, `node tests/weekly-review-browser.cjs`, 신규 모션 브라우저 테스트를 실행한다. 필요한 Tailwind fixture는 임시 경로에 두고 `TAILWIND_SCRIPT_PATH`로 지정한다.
- [x] 390/768/1360px 스크린샷과 이전 classic 화면의 DOM/레이아웃을 비교한다. 신규 계정·기존 계정·학생 전환·저장 실패·동작 줄이기·빠른 재시작을 재검증하고 `git diff --check`를 실행한다.
- [x] 전체 변경을 독립 검토받고 중요한 발견은 재현 테스트 RED→GREEN으로 수정한다. 검증 결과·미검증 사항·파일 경로를 전달한다. 커밋과 실제 사이트/Firestore 규칙 배포는 별도 요청을 기다린다.
