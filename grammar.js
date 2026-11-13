/** 문법 시험: 개념 잠금 → 실전, 독립 성적 및 선생님 수동 채점. */
Object.assign(App, {
  grammarTestById(id) { return AppData.getTests().find(t => t.id === id && t.type === 'GRAMMAR'); },
  grammarCanRead(test) { return Boolean(test && (this.state.isAdminLoggedIn || (this.state.isStudentLoggedIn && Number(test.studentId) === Number(this.state.selectedStudentId)))); },
  grammarStatus(test, part) {
    const state = GrammarLogic.partState(test, part);
    const result = test.grammarResults?.[part];
    const labels = { UNASSIGNED: '미배정', SCHEDULED: '미응시', IN_PROGRESS: '응시 중', PENDING: '채점 대기 중', PASS: '통과', FAIL: '미달' };
    return `${result?.score != null ? result.score + '점 · ' : ''}${labels[state]}`;
  },
  grammarSummary(test) {
    return test.grammarParts.map(part => `${GrammarLogic.label(part)} ${this.grammarStatus(test, part)}`).join(' / ');
  },
  grammarStatistics(tests) {
    const attempts = tests.filter(t => t.type === 'GRAMMAR');
    const units = new Map(attempts.map(t => [`${t.studentId}:${t.grammarUnitId}`, t]));
    return {
      total: attempts.reduce((sum, t) => sum + t.grammarParts.length, 0),
      passed: attempts.reduce((sum, t) => sum + t.grammarParts.filter(p => GrammarLogic.partState(t, p) === 'PASS').length, 0),
      failed: [...units.values()].reduce((sum, t) => sum + GrammarLogic.eligible(tests, t.studentId, t.grammarUnitId).length, 0)
    };
  },
  grammarBadge(test) {
    const tests = AppData.getTests();
    const states = test.grammarParts.map(part => GrammarLogic.schedulePartState(test, part, tests));
    const status = states.every(state => state === 'PASS') ? 'PASS' : states.includes('FAIL') ? 'FAIL' : 'SCHEDULED';
    const style = this.getTestBadgeStyle({ ...test, type: 'VOCAB', status }, false);
    return { ...style, tag: status === 'PASS' ? '완료' : this.grammarSummary(test) };
  },
  grammarButton(label, action, secondary = false) {
    return `<button type="button" onclick="${action}" class="grammar-button ${secondary ? 'grammar-button-secondary' : ''}">${label}</button>`;
  },
  grammarStudyLink(unitId) {
    const unit = Object.hasOwn(GRAMMAR_UNITS, unitId) ? GRAMMAR_UNITS[unitId] : null;
    return unit?.studyPdf ? `<a href="${this.escapeHtml(unit.studyPdf)}" download class="grammar-study-download"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 11v7m-3-3 3 3 3-3"/></svg><span><strong>${this.escapeHtml(unit.title)} 개념 학습지</strong><small>공부용 PDF 다운로드</small></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg></a>` : '';
  },

  initUnifiedGrammarForm() {
    const select = document.getElementById('formGrammarStudent');
    select.innerHTML = AppData.getStudents().map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('');
    select.value = this.state.adminSelectedStudentId;
    const unitSelect = document.getElementById('formGrammarUnit');
    unitSelect.innerHTML = Object.values(GRAMMAR_UNITS).map(unit => `<option value="${unit.id}">${this.escapeHtml(unit.title)}</option>`).join('');
    unitSelect.value = GRAMMAR_UNIT.id;
    this.renderGrammarAssignmentParts(true);
  },
  async saveUnifiedGrammarAssignment(event) {
    if (!this.state.isAdminLoggedIn || this._grammarAssignmentSaving) return;
    const studentId = Number(document.getElementById('formGrammarStudent').value);
    const date = document.getElementById('formDate').value;
    const time = document.getElementById('formTime').value || '00:00';
    const endTime = document.getElementById('formEndTime').value || '23:59';
    const note = document.getElementById('formTeacherNote').value.trim();
    if (!AppData.getStudentById(studentId) || !shouldKeepTest({ date }) || endTime < time) {
      this.toast('학생·날짜·응시 시간을 확인해주세요.', 'error'); return;
    }
    const button = document.querySelector('#adminTestFormModal button[type="submit"]');
    this._grammarAssignmentSaving = true;
    button.disabled = true;
    try {
      const parts = [...document.querySelectorAll('[name="formGrammarPart"]:checked')].map(el => el.value);
      const unitId = document.getElementById('formGrammarUnit').value;
      await AppData.assignGrammarTest({ studentId, date, time, endTime, parts, note, unitId });
      this.closeAdminTestFormModal();
      this.renderAdminTestsTab();
      this.toast('문법 시험 일정이 저장되었습니다.', 'success');
    } catch (error) { this.toast(error.message || '저장하지 못했습니다. 다시 시도해주세요.', 'error'); }
    finally { this._grammarAssignmentSaving = false; button.disabled = false; }
  },

  openGrammarAssignmentModal(testId = null, studentId = null, unitId = 'subjunctive') {
    if (!this.state.isAdminLoggedIn) return;
    this.closeAllModals();
    const test = testId ? this.grammarTestById(testId) : null;
    this._grammarAssignmentId = test?.id || null;
    document.getElementById('grammarAssignmentTitle').textContent = test ? '문법 시험 일정 수정' : '문법 테스트 배정';
    document.getElementById('grammarAssignmentStudent').innerHTML = AppData.getStudents().map(s => `<option value="${s.id}">${this.escapeHtml(s.name)}</option>`).join('');
    document.getElementById('grammarAssignmentStudent').value = test?.studentId || studentId || this.state.adminSelectedStudentId;
    document.getElementById('grammarAssignmentStudent').disabled = Boolean(test);
    const unitSelect = document.getElementById('grammarAssignmentUnit');
    unitSelect.innerHTML = Object.values(GRAMMAR_UNITS).map(unit => `<option value="${unit.id}">${this.escapeHtml(unit.title)}</option>`).join('');
    unitSelect.value = test?.grammarUnitId || unitId;
    unitSelect.disabled = Boolean(test);
    document.getElementById('grammarAssignmentDate').value = test?.date || this.getTodayDateString();
    document.getElementById('grammarAssignmentTime').value = test?.time || '00:00';
    document.getElementById('grammarAssignmentEndTime').value = test?.endTime || '23:59';
    document.getElementById('grammarAssignmentNote').value = test?.teacherNote || '';
    this.renderGrammarAssignmentParts();
    this.showModal('grammarAssignmentModal');
  },
  renderGrammarAssignmentParts(unified = false) {
    const studentId = Number(document.getElementById(unified ? 'formGrammarStudent' : 'grammarAssignmentStudent').value);
    const tests = AppData.getTests();
    const editing = unified ? null : this.grammarTestById(this._grammarAssignmentId);
    const unitId = editing?.grammarUnitId || document.getElementById(unified ? 'formGrammarUnit' : 'grammarAssignmentUnit').value;
    const unit = Object.hasOwn(GRAMMAR_UNITS, unitId) ? GRAMMAR_UNITS[unitId] : GRAMMAR_UNIT;
    const existing = tests.some(t => t.type === 'GRAMMAR' && Number(t.studentId) === studentId && t.grammarUnitId === unit.id);
    const eligible = GrammarLogic.eligible(tests, studentId, unit.id);
    document.getElementById(unified ? 'formGrammarParts' : 'grammarAssignmentParts').innerHTML = `<p class="text-sm font-bold mb-3">${this.escapeHtml(unit.title)} · 영역별 80점 이상 통과</p>
      ${this.grammarStudyLink(unit.id)}
      <p class="text-xs text-slate-500 mb-3">${editing ? '배정 영역과 출제 내용은 유지하고 일정·안내를 수정합니다.' : existing ? '미달이 확정된 영역만 다시 배정할 수 있습니다.' : '최초 시험은 개념과 실전이 함께 배정됩니다.'}</p>
      <div class="flex flex-wrap gap-4">${GrammarLogic.parts.map(part => {
        const enabled = !editing && existing && eligible.includes(part);
        const checked = editing ? editing.grammarParts.includes(part) : !existing || enabled;
        return `<label class="flex items-center gap-2 text-sm"><input type="checkbox" name="${unified ? 'formGrammarPart' : 'grammarPart'}" value="${part}" ${checked ? 'checked' : ''} ${enabled ? '' : 'disabled'}> ${GrammarLogic.label(part)}${existing && !editing && !enabled ? ' (재배정 불가)' : ''}</label>`;
      }).join('')}</div>`;
  },
  async saveGrammarAssignment(event) {
    event.preventDefault();
    if (!this.state.isAdminLoggedIn || this._grammarAssignmentSaving) return;
    const studentId = Number(document.getElementById('grammarAssignmentStudent').value);
    const date = document.getElementById('grammarAssignmentDate').value;
    const time = document.getElementById('grammarAssignmentTime').value || '00:00';
    const endTime = document.getElementById('grammarAssignmentEndTime').value || '23:59';
    const note = document.getElementById('grammarAssignmentNote').value.trim();
    if (!AppData.getStudentById(studentId) || !shouldKeepTest({ date }) || endTime < time) { this.toast('학생·날짜·응시 시간을 확인해주세요.', 'error'); return; }
    this._grammarAssignmentSaving = true;
    const button = document.getElementById('grammarAssignmentSave');
    button.disabled = true;
    try {
      if (this._grammarAssignmentId) {
        await AppData.updateGrammarTest(this._grammarAssignmentId, test => { Object.assign(test, { date, time, endTime, teacherNote: note }); });
      } else {
        const parts = [...document.querySelectorAll('[name="grammarPart"]:checked')].map(el => el.value);
        const unitId = document.getElementById('grammarAssignmentUnit').value;
        await AppData.assignGrammarTest({ studentId, date, time, endTime, parts, note, unitId });
      }
      this.hideModal('grammarAssignmentModal');
      this.renderAdminTestsTab();
      this.toast('문법 시험 일정이 저장되었습니다.', 'success');
    } catch (error) { this.toast(error.message || '저장하지 못했습니다. 다시 시도해주세요.', 'error'); }
    finally { this._grammarAssignmentSaving = false; button.disabled = false; }
  },

  openGrammarTestModal(id) {
    if (this.blockGrammarExit()) return;
    const test = this.grammarTestById(id);
    if (!this.grammarCanRead(test)) return;
    const student = AppData.getStudentById(test.studentId);
    const latest = GrammarLogic.latest(AppData.getTests(), test.studentId, test.grammarUnitId);
    const attempts = AppData.getTests().filter(t => t.type === 'GRAMMAR' && Number(t.studentId) === Number(test.studentId) && t.grammarUnitId === test.grammarUnitId)
      .sort((a, b) => (b.grammarSequence || 0) - (a.grammarSequence || 0));
    const isAdmin = Boolean(this.state.isAdminLoggedIn);
    const timeStatus = this.getTestTimeStatus(test);
    const timeDisplay = (test.time || '00:00').slice(0, 5) === '00:00' && (test.endTime || '23:59').slice(0, 5) === '23:59' ? '' : `${test.time || '00:00'} ~ ${test.endTime || '23:59'}`;
    document.getElementById('detailModalStudentBadge').textContent = `${student?.name || ''} 학생 · 문법 테스트`;
    document.getElementById('detailModalTitle').textContent = test.title;
    const actionClass = 'w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-black transition flex items-center justify-center gap-2 shadow-lg shadow-violet-200 cursor-pointer';
    const resultButton = (attempt, part, compact = false) => `<button type="button" onclick="App.${part === 'concept' && isAdmin ? 'openGrammarGrading' : 'openGrammarResult'}('${attempt.id}'${part === 'concept' && isAdmin ? '' : `, '${part}'`})" class="w-full py-2.5 rounded-xl bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-bold transition flex items-center justify-center gap-2 border border-violet-200"><i aria-hidden="true" class="fa-solid fa-${part === 'concept' && isAdmin ? 'clipboard-check' : 'file-circle-check'}"></i>${compact ? '' : GrammarLogic.label(part) + ' '}${part === 'concept' && isAdmin ? '채점 / 답안' : '결과 확인'}</button>`;
    document.getElementById('detailModalBody').innerHTML = `
      <div data-grammar-summary class="pace-schedule-facts grid grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><span class="text-slate-400 font-bold block mb-0.5">응시 가능 일시</span><strong class="text-slate-800 font-extrabold">${this.escapeHtml(test.date)}${timeDisplay ? ` (${this.escapeHtml(timeDisplay)})` : ''}</strong></div>
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><span class="text-slate-400 font-bold block mb-0.5">통과 커트라인</span><strong class="text-slate-800 font-extrabold">개념·실전 각각 80점 이상</strong></div>
      </div>
      <div class="space-y-2"><h4 class="text-xs font-bold text-slate-700">영역별 최신 결과</h4><div class="grammar-result-list" role="list">
        ${GrammarLogic.parts.map(part => {
          const current = latest[part];
          const state = current ? GrammarLogic.partState(current, part) : 'UNASSIGNED';
          const result = current?.grammarResults?.[part];
          const label = { PASS: '통과', FAIL: '미달', PENDING: '채점 대기', UNASSIGNED: '미배정', SCHEDULED: '미응시', IN_PROGRESS: '응시 중' }[state];
          return `<div data-grammar-result-widget="${part}" class="grammar-result-row" role="listitem"><h5>${GrammarLogic.label(part)}</h5><div class="grammar-result-score"><strong>${result?.score != null ? this.escapeHtml(String(result.score)) + '<small>점</small>' : '—'}</strong><span data-result-state="${state}">${label}</span></div><div class="grammar-result-action">${result ? resultButton(current, part, true) : '<span>응시 전</span>'}</div></div>`;
        }).join('')}</div>
      </div>
      ${this.grammarStudyLink(test.grammarUnitId)}
      ${test.teacherNote ? `<div class="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 whitespace-pre-wrap">${this.escapeHtml(test.teacherNote)}</div>` : ''}
      <div class="space-y-2.5 pt-2">
        ${!isAdmin && test.grammarStage !== 'done' ? (timeStatus.canStart ? `<button type="button" onclick="App.startGrammarTest('${id}')" class="${actionClass}"><i aria-hidden="true" class="fa-solid fa-pencil"></i>테스트 응시</button>` : `<button disabled class="w-full py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs font-bold flex items-center justify-center gap-2 cursor-not-allowed"><i aria-hidden="true" class="fa-solid fa-clock"></i>${this.escapeHtml(timeStatus.message || '현재 응시할 수 없습니다.')}</button>`) : ''}
        ${isAdmin ? `<button type="button" onclick="App.openGrammarAssignmentModal(null, ${test.studentId}, '${test.grammarUnitId}')" class="${actionClass}"><i aria-hidden="true" class="fa-solid fa-rotate-right"></i>문법 재시험 배정</button><div class="flex items-center gap-2 pt-1 border-t border-slate-100"><button type="button" onclick="App.openRescheduleModal('${id}')" class="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"><i aria-hidden="true" class="fa-solid fa-calendar-days"></i>일정 이동</button><button type="button" onclick="App.openExtendTestModal('${id}')" class="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"><i aria-hidden="true" class="fa-solid fa-clock-rotate-left"></i>시간 연장</button><button type="button" onclick="App.openGrammarAssignmentModal('${id}')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"><i aria-hidden="true" class="fa-solid fa-pen-to-square"></i>전체 수정</button></div>` : ''}
      </div>
      ${attempts.length > 1 ? `<details class="text-xs border border-slate-200 rounded-xl p-3 bg-slate-50"><summary class="cursor-pointer font-bold text-slate-700">응시 이력 · 영역별 결과 (${attempts.length}회)</summary><div class="space-y-3 mt-3">${attempts.map(attempt => `<div class="p-3 rounded-xl bg-white border border-slate-200 space-y-2"><strong class="text-slate-700">${attempt.grammarSequence ? '재시험 ' + attempt.grammarSequence : '최초 시험'} · ${this.escapeHtml(attempt.date)}</strong><p class="text-slate-500">${this.grammarSummary(attempt)}</p>${GrammarLogic.parts.filter(p => attempt.grammarResults?.[p]).map(part => resultButton(attempt, part)).join('')}</div>`).join('')}</div></details>` : ''}`;
    this.showModal('testDetailModal');
  },

  isGrammarExamActive() {
    return Boolean(this._grammarStarting || (this.state.grammarTest && this.state.grammarTest.test.grammarStage !== 'done'));
  },
  blockGrammarExit() {
    if (!this.isGrammarExamActive()) return false;
    this.toast('최종 답안을 제출한 뒤 시험 화면을 나갈 수 있습니다.', 'info');
    return true;
  },
  lockGrammarNavigation() {
    this._grammarHistoryGuard = `grammar_${Date.now()}`;
    try { history.pushState({ ...history.state, grammarExamGuard: this._grammarHistoryGuard }, ''); } catch (_) {}
    this.updateHeaderActions();
  },
  unlockGrammarNavigation() {
    this._grammarHistoryGuard = null;
    try {
      const state = { ...history.state };
      delete state.grammarExamGuard;
      history.replaceState(state, '');
    } catch (_) {}
    this.updateHeaderActions();
  },
  showGrammarView() {
    this.closeAllModals();
    this.clearVocabQuestionTimer();
    this.state.view = 'grammarTest';
    ['landingView', 'studentDashboardView', 'adminDashboardView', 'vocabTestView', 'practiceTestView', 'textMemorizePaperView'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('grammarTestView').classList.remove('hidden');
    this.updateHeaderActions();
  },
  async startGrammarTest(id) {
    const test = this.grammarTestById(id);
    if (this._grammarModeSelecting || this.blockGrammarExit() || !this.grammarCanRead(test) || this.state.isAdminLoggedIn) return;
    if (test.grammarStage === 'done') { this.openGrammarTestModal(id); return; }
    const timeStatus = this.getTestTimeStatus(test);
    if (!timeStatus.canStart) { this.toast(timeStatus.message, 'error'); return; }
    const selected = this.state.selectedStudentId, uid = window.PaceAuth?.auth?.currentUser?.uid, generation = window.PaceAuth?.generation;
    this._grammarModeSelecting = true;
    let mode;
    try { mode = await window.ExamPresentation.ensureMode(test.studentId); }
    catch (error) { this.toast(error.message, 'error'); return; }
    finally { this._grammarModeSelecting = false; }
    if (!mode || this.state.selectedStudentId !== selected || window.PaceAuth?.auth?.currentUser?.uid !== uid || window.PaceAuth?.generation !== generation || !this.grammarCanRead(this.grammarTestById(id)) || !this.getTestTimeStatus(this.grammarTestById(id)).canStart) return;
    this._grammarStarting = true;
    this.lockGrammarNavigation();
    try {
      const saved = await AppData.updateGrammarTest(id, current => {
        if (current.grammarStage === 'done') throw new Error('이미 제출한 시험입니다.');
        current.grammarStartedAt ||= new Date().toISOString();
        delete current.grammarDraft;
        delete current.grammarDraftSavedAt;
      });
      // 이전 버전의 임시 답안은 읽거나 복원하지 않는다.
      try { localStorage.removeItem(`yem_grammar_draft_${saved.studentId}_${saved.id}`); } catch (_) {}
      if (!this.state.isStudentLoggedIn || this.state.selectedStudentId !== selected || window.PaceAuth?.generation !== generation || window.PaceAuth?.auth?.currentUser?.uid !== uid) return;
      this.state.grammarTest = { test: saved, answers: { concept: {}, practice: {} }, index: 0, saving: false, presentationMode: mode };
      this.showGrammarView();
      this.renderGrammarExam();
      window.scrollTo({ top: 0 });
    } catch (error) {
      this.toast(error.message || '시험을 시작하지 못했습니다.', 'error');
    } finally {
      this._grammarStarting = false;
      if (!this.isGrammarExamActive()) this.unlockGrammarNavigation();
      else this.updateHeaderActions();
    }
  },
  renderGrammarText(text, key, answers, result = null) {
    let index = 0;
    return String(text || '').split(/(\{\{.*?\}\})/g).map(piece => {
      if (!piece.startsWith('{{')) return this.escapeHtml(piece);
      const id = `${key}_${index++}`;
      const width = Math.min(26, Math.max(9, piece.slice(2, -2).length + 3));
      if (result) {
        const correct = result.marks?.[id];
        return `<span class="grammar-review-blank ${result.waitingGrading ? '' : correct ? 'grammar-review-correct' : 'grammar-review-wrong'}" title="${result.waitingGrading ? '채점 대기 중' : correct ? '정답' : '정답: ' + this.escapeHtml(piece.slice(2, -2))}">${this.escapeHtml(answers[id] || '(미입력)')}${!result.waitingGrading && !correct ? `<small>정답: ${this.escapeHtml(piece.slice(2, -2))}</small>` : ''}</span>`;
      }
      const number = GrammarLogic.blanks(this.state.grammarTest.test.grammarContent).findIndex(blank => blank.id === id) + 1;
      return `<input type="text" class="grammar-blank" style="width:${width}ch" aria-label="${number}번 빈칸" data-grammar-blank="${id}" value="${this.escapeHtml(answers[id] || '')}" oninput="App.updateGrammarConcept('${id}', this.value)" autocomplete="off" spellcheck="false">`;
    }).join('');
  },
  renderGrammarProgress() {
    const session = this.state.grammarTest;
    if (!session) return;
    const conceptDone = Boolean(session.test.grammarResults?.concept);
    const conceptTotal = GrammarLogic.blanks(session.test.grammarContent).length;
    const conceptAnswered = conceptTotal - GrammarLogic.missing(session.test.grammarContent, session.answers.concept);
    const practiceAnswered = Object.values(session.answers.practice).filter(a => Number.isInteger(a) && a >= 1 && a <= 5).length;
    document.getElementById('grammarProgress').innerHTML = GrammarLogic.parts.map(part => {
      const assigned = session.test.grammarParts.includes(part);
      const done = part === 'concept' ? conceptDone : Boolean(session.test.grammarResults?.practice);
      const percent = !assigned ? 0 : done ? 100 : part === 'concept' ? Math.round(conceptAnswered / conceptTotal * 100) : practiceAnswered * 10;
      return `<div class="grammar-stage-progress ${session.test.grammarStage === part ? 'grammar-stage-active' : ''}" role="progressbar" aria-label="${GrammarLogic.label(part)} 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div class="grammar-stage-fill" style="width:${percent}%"></div><span>${GrammarLogic.label(part)}${!assigned ? ' · 미배정' : done ? ' · 완료' : ''}</span></div>`;
    }).join('');
    if (session.presentationMode === 'motion') window.ExamMotionPaper.updateGrammarProgress(session);
  },
  renderGrammarExam() {
    const session = this.state.grammarTest;
    if (!session) return;
    const { test, answers } = session;
    const content = test.grammarContent;
    const concept = test.grammarStage === 'concept';
    document.getElementById('grammarSubmissionStatus').textContent = '';
    this.renderGrammarProgress();
    if (session.presentationMode === 'motion') {
      document.getElementById('grammarTestView').classList.add('hidden');
      document.getElementById('grammarTestContent').innerHTML = '';
      window.ExamMotionPaper.renderGrammar(session);
      return;
    }
    if (concept) {
      document.getElementById('grammarTestContent').innerHTML = this.renderGrammarConceptPaper(test, answers.concept);
    } else if (test.grammarStage === 'practice') this.renderGrammarPractice();
  },
  renderGrammarConceptPaper(test, answers, result = null) {
    const content = test.grammarContent;
    const text = (value, key) => this.renderGrammarText(value, key, answers, result);
    return `<article class="grammar-paper glass-card rounded-2xl p-5 sm:p-8">
        ${GrammarPaper.render(content, text)}
        ${!result ? `        <div class="mt-5">${this.grammarButton(test.grammarParts.includes('practice') ? '실전으로 넘어가기' : '제출', 'App.submitGrammarConcept()')}</div>` : ''}
      </article>`;
  },
  updateGrammarConcept(id, value) {
    const session = this.state.grammarTest;
    if (!session || session.saving || session.test.grammarStage !== 'concept') return;
    session.answers.concept[id] = value;
    this.renderGrammarProgress();
  },
  updateGrammarChoice(index, value) {
    const session = this.state.grammarTest;
    if (!session || session.saving || session.test.grammarStage !== 'practice') return;
    session.answers.practice[index] = Number(value);
    if (session.presentationMode === 'motion') { this.renderGrammarProgress(); return; }
    this.renderGrammarPractice();
  },
  async submitGrammarConcept() {
    const session = this.state.grammarTest;
    if (!session || session.saving || session.test.grammarStage !== 'concept') return;
    const missing = GrammarLogic.missing(session.test.grammarContent, session.answers.concept);
    const hasPractice = session.test.grammarParts.includes('practice');
    if (missing && !confirm(`아직 답안을 입력하지 않은 빈칸이 ${missing}개 있습니다. ${hasPractice ? '실전으로 넘어가면' : '제출하면'} 개념 답안을 수정할 수 없습니다. ${hasPractice ? '넘어가시겠습니까?' : '제출하시겠습니까?'}`)) return;
    await this.commitGrammarStage(session, test => {
      if (test.grammarStage !== 'concept' || test.grammarResults.concept) throw new Error('이미 제출한 개념 답안입니다. 시험을 다시 열어주세요.');
      const answers = GrammarLogic.clone(session.answers.concept);
      test.grammarResults.concept = { answers, waitingGrading: true, score: null, passed: null, cutoffScore: 80, completedAt: new Date().toISOString() };
      delete test.grammarDraft;
      delete test.grammarDraftSavedAt;
      test.grammarStage = hasPractice ? 'practice' : 'done';
      test.status = 'SUBMITTED';
    });
  },
  async commitGrammarStage(session, update) {
    session.saving = true;
    document.getElementById('grammarTestContent').inert = true;
    document.getElementById('grammarSubmissionStatus').textContent = '답안 제출 중…';
    if (session.presentationMode === 'motion') window.ExamMotionPaper.setBusy(true, '답안 제출 중…');
    try {
      const saved = await AppData.updateGrammarTest(session.test.id, update);
      session.test = saved;
      session.answers.concept = {};
      if (saved.grammarStage === 'done') {
        await this.exitGrammarTest();
        this.openGrammarCompletion(saved.id);
      } else {
        this.renderGrammarExam();
        window.scrollTo({ top: 0 });
      }
    } catch (error) {
      document.getElementById('grammarSubmissionStatus').textContent = '제출 실패 · 답안을 유지했습니다';
      this.toast(error.message || '제출하지 못했습니다. 다시 시도해주세요.', 'error');
    } finally {
      session.saving = false; document.getElementById('grammarTestContent').inert = false;
      if (session.presentationMode === 'motion') window.ExamMotionPaper.setBusy(false, document.getElementById('grammarSubmissionStatus').textContent);
    }
  },
  renderGrammarPractice(index = null) {
    const session = this.state.grammarTest;
    if (!session || session.test.grammarStage !== 'practice') return;
    if (session.presentationMode === 'motion') { window.ExamMotionPaper.renderGrammar(session); return; }
    if (index != null) session.index = Math.max(0, Math.min(9, Number(index)));
    this.state.grammarPractice = { isGrammar: true, title: `${session.test.grammarContent.title} · 실전`, questions: session.test.grammarContent.questions, answers: session.answers.practice, cutoffScore: 80, currentIndex: session.index };
    document.getElementById('grammarPracticeTopInfo').classList.remove('hidden');
    this.renderPracticeQuestion(session.index);
    this.renderGrammarProgress();
  },
  async submitGrammarPractice() {
    const session = this.state.grammarTest;
    if (!session || session.saving || session.test.grammarStage !== 'practice') return;
    const missing = session.test.grammarContent.questions.filter((_, i) => !Number.isInteger(session.answers.practice[i])).length;
    if (missing && !confirm(`아직 풀지 않은 문제가 ${missing}문제 있습니다. 미응답 문제는 오답으로 처리됩니다. 제출하시겠습니까?`)) return;
    try {
      const result = GrammarLogic.gradePractice(session.test.grammarContent, session.answers.practice);
      await this.commitGrammarStage(session, test => {
        if (test.grammarStage !== 'practice' || test.grammarResults.practice) throw new Error('이미 제출한 실전 답안입니다. 시험을 다시 열어주세요.');
        test.grammarResults.practice = result;
        delete test.grammarDraft;
        delete test.grammarDraftSavedAt;
        test.grammarStage = 'done';
        test.status = 'SUBMITTED';
      });
    } catch (error) { this.toast(error.message, 'error'); }
  },
  async exitGrammarTest() {
    if (this.blockGrammarExit()) return;
    window.ExamMotionPaper?.close();
    this.state.grammarTest = null;
    this.state.grammarPractice = null;
    document.getElementById('grammarPracticeTopInfo').classList.add('hidden');
    this.unlockGrammarNavigation();
    if (this.state.isAdminLoggedIn) await this.showAdminDashboard();
    else await this.selectStudent(this.state.selectedStudentId);
  },

  openGrammarGrading(id) {
    const test = this.grammarTestById(id);
    if (!this.state.isAdminLoggedIn || !test?.grammarResults?.concept) return;
    this.closeAllModals();
    const result = test.grammarResults.concept;
    const marks = { ...(result.marks || {}) };
    GrammarLogic.blanks(test.grammarContent).forEach(b => {
      if (GrammarLogic.exactConceptAnswer(result.answers[b.id], b.answer)) marks[b.id] = true;
      else if (!String(result.answers[b.id] || '').trim()) marks[b.id] = false;
    });
    this._grammarGrading = { id, marks };
    this.renderGrammarGrading();
    this.showModal('grammarGradingModal');
  },
  renderGrammarGrading() {
    const state = this._grammarGrading;
    const test = this.grammarTestById(state.id);
    const answers = test.grammarResults.concept.answers;
    const blanks = GrammarLogic.blanks(test.grammarContent);
    const marked = blanks.filter(b => !String(answers[b.id] || '').trim() || typeof state.marks[b.id] === 'boolean').length;
    document.getElementById('grammarGradingSummary').textContent = `${AppData.getStudentById(test.studentId)?.name || ''} · ${test.date} · 자동 정답 ${blanks.filter(b => GrammarLogic.exactConceptAnswer(answers[b.id], b.answer)).length}개 · 검토/판정 ${marked} / ${blanks.length} · 커트라인 80점`;
    document.getElementById('grammarGradingItems').innerHTML = blanks.map((b, i) => {
      if (!String(answers[b.id] || '').trim() || GrammarLogic.exactConceptAnswer(answers[b.id], b.answer)) return '';
      const empty = false;
      return `<div class="grammar-history"><strong>${i + 1}. ${this.escapeHtml(b.context)}</strong><div class="grid sm:grid-cols-2 gap-2 my-3 text-sm"><p>학생 답안: <strong>${this.escapeHtml(answers[b.id] || '') || '(미입력 · 오답)'}</strong></p><p>모범답안: <strong>${this.escapeHtml(b.answer)}</strong></p></div>${empty ? '<p class="text-sm text-rose-700">미입력 답안은 오답으로 처리됩니다.</p>' : `<div class="flex gap-4 text-sm">${[true, false].map(value => `<label class="flex items-center gap-2"><input type="radio" name="grade_${b.id}" ${state.marks[b.id] === value ? 'checked' : ''} onchange="App.markGrammarBlank('${b.id}', ${value})">${value ? '정답' : '오답'}</label>`).join('')}</div>`}</div>`;
    }).join('');
    if (!document.getElementById('grammarGradingItems').innerHTML) document.getElementById('grammarGradingItems').innerHTML = '<p class="text-sm text-slate-500">검토할 답안이 없습니다. 일치 답안은 정답, 미입력은 오답으로 처리됩니다.</p>';
    document.getElementById('grammarGradingSave').disabled = marked !== blanks.length;
  },
  markGrammarBlank(id, value) {
    if (this._grammarGradingSaving) return;
    this._grammarGrading.marks[id] = value;
    const test = this.grammarTestById(this._grammarGrading.id);
    const blanks = GrammarLogic.blanks(test.grammarContent);
    const answers = test.grammarResults.concept.answers;
    const marked = blanks.filter(b => !String(answers[b.id] || '').trim() || typeof this._grammarGrading.marks[b.id] === 'boolean').length;
    document.getElementById('grammarGradingSummary').textContent = `판정 ${marked} / ${blanks.length} · 커트라인 80점`;
    document.getElementById('grammarGradingSave').disabled = marked !== blanks.length;
  },
  async saveGrammarGrading() {
    const state = this._grammarGrading;
    if (!this.state.isAdminLoggedIn || !state || this._grammarGradingSaving) return;
    this._grammarGradingSaving = true;
    document.getElementById('grammarGradingSave').disabled = true;
    try {
      await AppData.updateGrammarTest(state.id, test => {
        const result = test.grammarResults.concept;
        const graded = GrammarLogic.gradeConcept(test.grammarContent, result.answers, state.marks);
        test.grammarResults.concept = { ...result, ...graded };
      });
      this.hideModal('grammarGradingModal');
      this.toast('개념 채점 결과를 저장했습니다.', 'success');
      this.openGrammarTestModal(state.id);
    } catch (error) { this.toast(error.message || '채점 결과를 저장하지 못했습니다.', 'error'); }
    finally { this._grammarGradingSaving = false; document.getElementById('grammarGradingSave').disabled = false; }
  },
  syncGrammarResults() {
    const session = this.state.grammarTest;
    if (!session || session.saving || session.test.grammarStage !== 'practice') return;
    const latest = this.grammarTestById(session.test.id)?.grammarResults?.concept;
    if (latest) session.test.grammarResults.concept = GrammarLogic.clone(latest);
  },
  refreshGrammarCompletion() {
    if (this.state.view !== 'grammarResult' || !this._grammarCompletionId) return;
    const test = this.grammarTestById(this._grammarCompletionId);
    if (test && JSON.stringify(test.grammarResults) !== this._grammarCompletionSignature) this.openGrammarCompletion(test.id, { refresh: true });
  },
  openGrammarCompletion(id, { refresh = false } = {}) {
    const test = this.grammarTestById(id);
    if (!this.grammarCanRead(test)) return;
    const concept = test.grammarResults?.concept;
    const practice = test.grammarResults?.practice;
    this._grammarCompletionId = id;
    this._grammarCompletionSignature = JSON.stringify(test.grammarResults);
    if (!refresh) this.closeAllModals();
    this.state.view = 'grammarResult';
    ['landingView', 'studentDashboardView', 'adminDashboardView', 'vocabTestView', 'practiceTestView', 'textMemorizePaperView', 'grammarTestView'].forEach(view => document.getElementById(view)?.classList.add('hidden'));
    const student = AppData.getStudentById(test.studentId);
    const action = (part, label) => `<button type="button" class="grammar-result-action" onclick="App.openGrammarResult('${id}', '${part}')">${label}<span aria-hidden="true">↗</span></button>`;
    const scoredPanel = (part, result, index) => `<section data-grammar-score-part="${part}" class="grammar-result-panel grammar-result-practice ${result ? result.passed ? 'is-pass' : 'is-fail' : 'is-unassigned'}"><div class="grammar-result-panel-top"><span class="grammar-result-eyebrow">${index}</span><span class="grammar-result-tag">${GrammarLogic.label(part)}</span></div>
      <div class="grammar-result-main"><h2 class="grammar-completion-verdict">${result ? result.passed ? 'PASS' : 'FAIL' : '미배정'}</h2>${result ? `<p class="grammar-result-outcome">${result.passed ? '통과 기준을 달성했어요!' : '부족한 부분을 확인하고 다시 준비해 보세요.'}</p><div class="grammar-completion-score">${result.score}<span>점</span></div><p class="grammar-result-correct">${result.totalCount || (part === 'concept' ? GrammarLogic.blanks(test.grammarContent).length : 10)}문제 중 <strong>${result.correctCount}문제</strong> 정답</p><div class="grammar-result-score-track"><div style="width:${result.score}%"></div><span style="left:80%" title="통과 기준 80점"></span></div>` : '<p>이번 시험에는 실전이 포함되지 않았습니다.</p>'}</div>
      <div class="grammar-result-panel-bottom"><span>통과 기준 <strong>80점 이상</strong></span>${result ? action(part, part === 'concept' ? '개념 답안 확인' : '정답·해설 확인') : ''}</div></section>`;
    document.getElementById('grammarCompletionView').innerHTML = `
      <header class="grammar-result-heading"><div><p class="grammar-result-eyebrow">GRAMMAR TEST · ${this.escapeHtml(test.date)}</p><h1>시험을 마쳤어요.</h1><p class="grammar-result-subtitle">${this.escapeHtml(student?.name || '')} 학생의 ${this.escapeHtml(test.grammarContent.title)} 테스트 결과입니다.</p></div><button type="button" class="grammar-result-back" onclick="App.exitGrammarTest()">학습공간으로 돌아가기 <span aria-hidden="true">→</span></button></header>
      <div class="grammar-result-panels">
        ${concept && !concept.waitingGrading && concept.score != null ? scoredPanel('concept', concept, '01 / CONCEPT') : `
        <section data-grammar-score-part="concept" class="grammar-result-panel grammar-result-concept"><div class="grammar-result-panel-top"><span class="grammar-result-eyebrow">01 / CONCEPT</span><span class="grammar-result-tag">개념</span></div>
          <div class="grammar-result-main">${concept ? '<span class="grammar-result-symbol" aria-hidden="true"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>' : ''}<h2 class="grammar-completion-concept">${concept ? '채점 대기 중' : '미배정'}</h2><p>${concept ? '답안을 확인하고 있어요.<br>채점이 끝나면 점수와 통과 여부를 확인할 수 있습니다.' : '이번 시험에는 개념이 포함되지 않았습니다.'}</p></div>
          <div class="grammar-result-panel-bottom"><span>통과 기준 <strong>80점 이상</strong></span>${concept ? action('concept', '개념 답안 확인') : ''}</div>
        </section>`}
        ${scoredPanel('practice', practice, '02 / PRACTICE')}
      </div>`;
    document.getElementById('grammarCompletionView').classList.remove('hidden');
    if (!refresh) {
      this.updateHeaderActions();
      window.scrollTo({ top: 0 });
    }
  },

  async deleteGrammarTest(id) {
    if (!this.state.isAdminLoggedIn || this._grammarDeleting) return;
    const test = this.grammarTestById(id);
    if (!test) return;
    if (!confirm(test.id === test.grammarRootId ? '최초 문법 시험을 삭제하면 연결된 재시험과 성적도 모두 삭제됩니다. 삭제하시겠습니까?' : '이 문법 재시험과 해당 성적을 삭제하시겠습니까?')) return;
    this._grammarDeleting = true;
    try {
      await AppData.deleteGrammarTest(id);
      this.closeAllModals();
      this.renderAdminTestsTab();
      this.toast('문법 시험을 삭제했습니다.', 'success');
    } catch (error) { this.toast(error.message || '삭제하지 못했습니다.', 'error'); }
    finally { this._grammarDeleting = false; }
  },
  openGrammarResult(id, part) {
    const test = this.grammarTestById(id);
    if (!this.grammarCanRead(test) || !test.grammarResults?.[part]) return;
    const result = test.grammarResults[part];
    document.getElementById('grammarResultTitle').textContent = `${GrammarLogic.label(part)} · ${this.grammarStatus(test, part)}`;
    document.getElementById('grammarResultBody').innerHTML = `<div class="grammar-notice">${this.grammarStatus(test, part)} · 통과 기준 80점</div>` + (part === 'practice'
      ? test.grammarContent.questions.map((q, i) => `<article class="grammar-history ${result.answers[i] === q.answer ? 'grammar-pass' : 'grammar-fail'}"><h4>${i + 1}. ${this.escapeHtml(q.question)}</h4><p class="whitespace-pre-line my-3 text-sm">${this.escapeHtml(q.passage)}</p><ol class="text-sm space-y-1">${q.choices.map((c, n) => `<li>${['①', '②', '③', '④', '⑤'][n]} ${this.escapeHtml(c)}</li>`).join('')}</ol><p class="text-sm font-bold my-3">내 답: ${result.answers[i] || '미응답'} / 정답: ${q.answer}</p><p class="text-sm">${this.escapeHtml(q.explanation)}</p></article>`).join('')
      : this.renderGrammarConceptPaper(test, result.answers, result));
    this.showModal('grammarResultModal');
  },
  renderGrammarAdminRow(test) {
    const labels = { UNASSIGNED: '미배정', SCHEDULED: '미응시', IN_PROGRESS: '응시 중', PENDING: '채점 대기', PASS: '통과', FAIL: '불합격' };
    const tones = { IN_PROGRESS: 'blue', PENDING: 'amber', PASS: 'emerald', FAIL: 'rose' };
    return this.renderAdminExamRow(test, {
      open: `App.openGrammarTestModal('${test.id}')`,
      scope: test.grammarParts.map(part => GrammarLogic.label(part)).join(' + ') + (test.scope ? ` · ${test.scope}` : ''),
      cutoff: '각 영역 80점 이상',
      score: test.grammarParts.map(part => `${GrammarLogic.label(part)} ${test.grammarResults?.[part]?.score != null ? test.grammarResults[part].score + '점' : '-'}`).join(' · '),
      status: test.grammarParts.map(part => {
        const state = GrammarLogic.schedulePartState(test, part, AppData.getTests());
        const label = state === 'PASS' && GrammarLogic.partState(test, part) === 'FAIL' ? '재시험 통과' : labels[state] || '미응시';
        return `<div class="flex items-center gap-1.5 mb-1 last:mb-0"><span class="text-xs text-slate-500">${GrammarLogic.label(part)}</span>${this.renderAdminExamBadge(label, tones[state])}</div>`;
      }).join(''),
      actions: this.renderAdminExamAction('수정', `App.openGrammarAssignmentModal('${test.id}')`, 'fa-pen-to-square')
        + this.renderAdminExamAction('삭제', `App.deleteGrammarTest('${test.id}')`, 'fa-trash-can', 'rose')
    });
  }
});

// 앱 내 이동은 차단하고 브라우저 자체 이동에는 기본 이탈 경고를 표시한다.
window.addEventListener('beforeunload', event => {
  if (!App.isGrammarExamActive()) return;
  event.preventDefault();
  event.returnValue = '';
});
window.addEventListener('popstate', () => {
  if (!App.isGrammarExamActive()) return;
  try { history.pushState({ ...history.state, grammarExamGuard: App._grammarHistoryGuard }, ''); } catch (_) {}
  App.blockGrammarExit();
});
document.addEventListener('click', event => {
  if (!App.isGrammarExamActive()) return;
  const target = event.target instanceof Element ? event.target : event.target?.parentElement;
  if (target?.closest('#grammarTestView, #motionExamView')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  App.blockGrammarExit();
}, true);
