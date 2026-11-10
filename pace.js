/** PACE presentation: read existing student data without changing grading or storage. */
Object.assign(App, {
  paceStudent() {
    if (!this.state.isAdminLoggedIn && !this.state.isStudentLoggedIn) return null;
    return AppData.getStudentById(this.state.selectedStudentId) || null;
  },
  paceReview(tests) {
    const monday = WeeklyReviewLogic.monday(this.getTodayDateString());
    const reviews = tests.filter(test => test.type === 'VOCAB_REVIEW');
    const current = reviews.filter(test => test.weekStart === monday);
    return (current.length ? current : reviews.filter(test => test.date <= this.getTodayDateString()))
      .sort((a, b) => Number(Boolean(a.isPreview)) - Number(Boolean(b.isPreview)) || String(b.date).localeCompare(String(a.date)))[0] || null;
  },
  renderPaceHome() {
    const student = this.paceStudent(), banner = document.getElementById('studentBanner');
    if (!student || !banner) return;
    const e = value => this.escapeHtml(String(value ?? ''));
    const tests = AppData.getTestsByStudentId(student.id), review = this.paceReview(tests);
    const grammar = this.grammarStatistics(tests);
    const regular = tests.filter(test => test.type !== 'GRAMMAR');
    const total = regular.length + grammar.total;
    const done = regular.filter(test => test.status === 'PASS' || test.retestStatus === 'RETEST_PASS' || (test.type === 'PRACTICE' && test.practiceResult)).length + grammar.passed;
    const finished = review && (AppData.getWeeklyReviewResult(review.id)?.completed || ['NO_ERRORS', 'EXCLUDED'].includes(review.reviewStage));
    const reviewLabel = !review ? '아직 배정된 복습이 없어요' : finished ? '복습 결과 확인하기' : review.reviewStage === 'LOCKED' ? '복습 준비 현황 보기' : '주간 복습 시작하기';
    const university = (AcademicManager.getTargetUnivs()[student.id] || []).find(item => item.rank === 1);
    const goal = student.target?.trim();
    const universityGoal = university?.name ? `${university.name}${university.major ? ' · ' + university.major : ''}` : '';
    const canEditGoal = !this.state.isAdminLoggedIn && this.state.isStudentLoggedIn;
    banner.innerHTML = `<div class="pace-home-heading"><div><span class="pace-kicker">MY LEARNING SPACE</span><h2>${e(student.name)}님의<br>오늘도, 한 걸음.</h2><p class="pace-home-goal">${goal ? `<span>나의 목표</span> ${e(goal)}` : '나만의 속도로 쌓아가는 배움'}</p>${universityGoal ? `<p>${e(universityGoal)}</p>` : ''}${canEditGoal ? `<button type="button" class="pace-profile-action" onclick="PaceAuth.openProfileSettings()">${goal ? '목표 수정' : '학습 목표 설정'}</button><span class="pace-profile-divider" aria-hidden="true">·</span>` : ''}<button type="button" class="pace-profile-action" onclick="AcademicManager.openTargetUnivModal(App.state.selectedStudentId)">목표 대학 설정</button></div><div class="pace-home-date"><span>${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })}</span><small>YOUR OWN PACE.</small></div></div>
      <div class="pace-home-panels"><section class="pace-focus"><div class="pace-panel-top"><span>01 / WEEKLY REVIEW</span><span>이번 주 복습</span></div><div class="pace-focus-body"><h3>배운 것을,<br>내 것으로.</h3><p>${review ? '한 번 더 떠올리면 더 오래 남습니다.' : '복습 일정이 준비되면 여기서 확인할 수 있어요.'}</p></div><button type="button" ${review ? '' : 'disabled'} onclick="App.openPaceReview()">${reviewLabel} <span aria-hidden="true">↗</span></button></section><section class="pace-progress"><div class="pace-panel-top"><span>02 / YOUR PROGRESS</span><span>학습 기록</span></div><div class="pace-progress-body"><strong>${String(done).padStart(2, '0')}<small> / ${String(total).padStart(2, '0')}</small></strong><p>완료한 학습 · 작은 성취가 쌓이고 있어요.</p></div><button type="button" onclick="App.showPaceLearningReport()">나의 성적 살펴보기 <span aria-hidden="true">↗</span></button></section></div>`;
  },
  openPaceReview() {
    const student = this.paceStudent();
    if (!student) return;
    const review = this.paceReview(AppData.getTestsByStudentId(student.id));
    if (review) this.openWeeklyReviewModal(review.id);
  },
  paceScoreRecords(studentId) {
    const tests = AppData.getTestsByStudentId(studentId).filter(test => test.type === 'VOCAB');
    const byId = new Map(tests.map(test => [test.id, test]));
    const latest = new Map(), hasResult = new Set();
    const timestamp = result => String(result.updatedAt || result.completedAt || '');
    for (const result of AppData.getVocabTestResults()) {
      if (Number(result.studentId) !== Number(studentId) || !byId.has(result.testId)) continue;
      hasResult.add(result.testId);
      const key = `${result.testId}:${result.direction}`;
      if (!latest.has(key) || timestamp(result) >= timestamp(latest.get(key))) latest.set(key, result);
    }
    const records = [];
    for (const result of latest.values()) {
      if (result.waitingGrading && !result.gradedByAdmin) continue;
      if (result.score === null || result.score === undefined || String(result.score).trim() === '') continue;
      const score = Number(result.score);
      if (!Number.isFinite(score) || score < 0 || score > 100) continue;
      const test = byId.get(result.testId);
      records.push({ title: `${test.title} · ${this.getVocabDirectionShortLabel(Number(result.direction))}`, date: test.date, score, timestamp: timestamp(result) || test.date });
    }
    // Legacy manually graded schedules have no structured result. Only a single
    // unambiguous score is eligible; combined display strings are not averaged.
    for (const test of tests) {
      if (hasResult.has(test.id) || !['PASS', 'FAIL'].includes(test.status)) continue;
      const match = String(test.score ?? '').match(/^\s*(\d+(?:\.\d+)?)\s*(?:점)?(?:\s*\([^)]*\))?\s*$/);
      if (match && Number(match[1]) <= 100) records.push({ title: test.title, date: test.date, score: Number(match[1]), timestamp: test.date });
    }
    return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },
  async showPaceLearningReport() {
    if (!this.paceStudent()) return;
    if (!(await this.checkAndConfirmVocabTestExit())) return;
    this.closeAllModals();
    this.clearVocabQuestionTimer();
    for (const id of ['landingView', 'studentDashboardView', 'adminDashboardView', 'vocabTestView', 'practiceTestView', 'textMemorizePaperView', 'grammarTestView', 'weeklyReviewView']) document.getElementById(id)?.classList.add('hidden');
    this.state.view = 'paceReport';
    this.updateHeaderActions();
    this.renderPaceReport();
    window.scrollTo({ top: 0 });
  },
  renderPaceReport() {
    const student = this.paceStudent();
    if (!student) return;
    const records = this.paceScoreRecords(student.id), e = value => this.escapeHtml(String(value ?? ''));
    const average = records.length ? Math.round(records.reduce((sum, result) => sum + result.score, 0) / records.length) : null;
    document.getElementById('paceReportView').innerHTML = `<div class="pace-report"><header class="grammar-result-heading"><div><p class="pace-kicker">LEARNING REPORT / ${e(this.getTodayDateString())}</p><h1>쌓인 노력은,<br>숫자로 남아요.</h1><p class="grammar-result-subtitle">${e(student.name)}님의 채점이 완료된 단어 학습 기록입니다.</p></div><button type="button" class="grammar-result-back" onclick="App.selectStudent(App.state.selectedStudentId)">학습공간으로 돌아가기 ↗</button></header><div class="grammar-result-panels"><section class="grammar-result-panel pace-report-primary"><div class="pace-panel-top"><span>01 / AVERAGE</span><span>채점 완료 결과 평균</span></div><div class="grammar-result-main"><h2>${records.length ? 'YOUR RECORD.' : 'YOUR NEXT STEP.'}</h2><div class="pace-report-score">${average ?? '—'}${average === null ? '' : '<span>점</span>'}</div><p>${records.length ? '꾸준함이 만든 오늘의 결과.' : '첫 번째 학습 기록을 기다리고 있어요.'}</p></div><div class="grammar-result-panel-bottom"><span>시험 유형별 최신 채점 결과 ${records.length}건 기준</span><span>KEEP YOUR PACE.</span></div></section><section class="grammar-result-panel pace-report-history"><div class="pace-panel-top"><span>02 / HISTORY</span><span>한 걸음씩 쌓은 기록</span></div><div class="pace-history">${records.length ? records.map((result, index) => `<div><span class="pace-history-index">${String(index + 1).padStart(2, '0')}</span><div><h3>${e(result.title)}</h3><p>${e(result.date)}</p></div><strong>${result.score}<small>점</small></strong></div>`).join('') : '<p class="pace-report-empty">아직 채점이 완료된 단어 시험이 없습니다.<br>학습을 마치면 이곳에 기록이 쌓입니다.</p>'}</div><div class="grammar-result-panel-bottom"><span>다음 한 걸음도 나의 속도로.</span></div></section></div></div>`;
  }
});
