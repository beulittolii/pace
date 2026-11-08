/** 주차별 고정 문서와 제출 회차 번호로 중복 생성·중복 제출을 방지한다. */
Object.assign(AppData, {
  getWeeklyReviewResult(id) { return this.getTests().find(t => t.id === id)?.weeklyReviewResult || (FirebaseStore.vocabReviewResults || []).find(r => r.id === id) || null; },
  cacheWeeklyReview(test, result) {
    if (result) FirebaseStore.vocabReviewResults = [...(FirebaseStore.vocabReviewResults || []).filter(r => r.id !== result.id), result];
    this.cacheGrammarTests([test]);
  },
  isWeeklyReviewDeleted(id, studentId) {
    return Boolean((FirebaseStore.students || []).find(s => Number(s.id) === Number(studentId))?.deletedWeeklyReviewIds?.includes(id));
  },
  queueWeeklyReviews() {
    if (this._weeklyReviewRunning) { this._weeklyReviewDirty = true; return; }
    if (this._weeklyReviewTimer || !this.isFirebaseReady()) return;
    if (!['tests','vocabSets','vocabTestResults'].every(key => FirebaseStore.reviewSourcesReady?.[key])) return;
    this._weeklyReviewTimer = setTimeout(async () => {
      this._weeklyReviewTimer = null;
      this._weeklyReviewRunning = true;
      try {
        const tests = this.getTests();
        const weeks = new Map();
        for (const t of tests.filter(t => t.type === 'VOCAB')) {
          if (!App.state.isAdminLoggedIn && Number(t.studentId) !== Number(App.state.selectedStudentId)) continue;
          const monday = WeeklyReviewLogic.monday(t.date);
          weeks.set(WeeklyReviewLogic.id(t.studentId, monday), { studentId: t.studentId, monday });
        }
        for (const [id, group] of weeks) {
          if (this.isWeeklyReviewDeleted(id, group.studentId)) continue;
          if (tests.some(t => t.id === id && !WeeklyReviewLogic.mutable(t))) continue;
          const existing = tests.find(t => t.id === id);
          const proposal = WeeklyReviewLogic.prepare({ tests, results: this.getVocabTestResults(), sets: this.getVocabSets(), ...group, excludedWeekdays: existing?.excludedWeekdays || [] });
          if (!proposal) continue;
          if (existing && WeeklyReviewLogic.samePreparation(existing, proposal)) continue;
          await this.createWeeklyReview(group);
        }
      } catch (error) { console.warn('주간 복습 생성 실패. 다음 동기화 시 다시 확인합니다.', error); }
      finally {
        this._weeklyReviewRunning = false;
        if (this._weeklyReviewDirty) { this._weeklyReviewDirty = false; this.queueWeeklyReviews(); }
      }
    }, 250);
  },
  async configureWeeklyReviewDays(id, excludedWeekdays) {
    if (!App.state.isAdminLoggedIn) throw new Error('관리자만 제외 요일을 변경할 수 있습니다.');
    const test = this.getTests().find(t => t.id === id && t.type === 'VOCAB_REVIEW');
    if (!test) throw new Error('복습 시험을 찾을 수 없습니다.');
    return this.createWeeklyReview({ studentId: test.studentId, monday: test.weekStart, reviewId: id, excludedWeekdays: WeeklyReviewLogic.normalizeExcludedWeekdays(excludedWeekdays) });
  },
  async deleteWeeklyReview(id) {
    if (!App.state.isAdminLoggedIn) throw new Error('관리자만 주간 복습을 삭제할 수 있습니다.');
    if (!this.isFirebaseReady()) throw new Error('클라우드 연결 후 다시 시도해주세요.');
    const target = this.getTests().find(t => t.id === id && t.type === 'VOCAB_REVIEW');
    if (!target) throw new Error('복습 시험을 찾을 수 없습니다.');
    const { doc, runTransaction } = window.firebaseFns;
    const student = await runTransaction(window.firebaseDB, async tx => {
      const ref = doc(window.firebaseDB, 'tests', id);
      const studentRef = doc(window.firebaseDB, 'students', String(target.studentId));
      const snapshot = await tx.get(ref);
      const profile = await tx.get(studentRef);
      if (!profile.exists()) throw new Error('학생 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.');
      if (snapshot.exists() && (snapshot.data().type !== 'VOCAB_REVIEW' || Number(snapshot.data().studentId) !== Number(target.studentId))) throw new Error('시험 정보가 변경되었습니다. 새로고침 후 다시 시도해주세요.');
      // 원본 단어 일정은 남아 있어도 삭제한 복습 ID를 다시 자동 생성하지 않는다.
      const updated = { ...profile.data(), deletedWeeklyReviewIds: [...new Set([...(profile.data().deletedWeeklyReviewIds || []), id])] };
      tx.set(studentRef, updated);
      tx.delete(ref);
      return { ...updated, id: target.studentId };
    });
    FirebaseStore.students = [...(FirebaseStore.students || []).filter(s => Number(s.id) !== Number(student.id)), student].sort((a,b) => Number(a.id) - Number(b.id));
    FirebaseStore.vocabReviewResults = (FirebaseStore.vocabReviewResults || []).filter(result => result.id !== id);
    FirebaseStore.tests = this.getTests().filter(t => t.id !== id);
    this.cacheGrammarTests([]);
  },
  async createWeeklyReview({ studentId, monday, reviewId, excludedWeekdays }) {
    if (!this.isFirebaseReady()) throw new Error('클라우드 연결이 필요합니다.');
    const { doc, runTransaction } = window.firebaseFns;
    const configuring = excludedWeekdays !== undefined;
    if (configuring && !App.state.isAdminLoggedIn) throw new Error('관리자만 제외 요일을 변경할 수 있습니다.');
    if (configuring) excludedWeekdays = WeeklyReviewLogic.normalizeExcludedWeekdays(excludedWeekdays);
    const id = reviewId || WeeklyReviewLogic.id(studentId, monday);
    const sourceTests = this.getTests().filter(t => t.type === 'VOCAB' && Number(t.studentId) === Number(studentId) && WeeklyReviewLogic.monday(t.date) === monday);
    const sourceResults = this.getVocabTestResults().filter(r => sourceTests.some(t => t.id === r.testId) && Number(r.studentId) === Number(studentId));
    const availableSets = this.getVocabSets();
    const sets = availableSets.filter(s => sourceTests.some(t => (t.vocabSetIds?.length ? t.vocabSetIds : [t.vocabSetId]).includes(s.id)));
    // 원본 세트가 작아도 뜻 오답의 5지선다 형식을 유지할 수 있도록 선택지 자료만 보충한다.
    if (new Set(sets.flatMap(s => (s.words || []).map(w => w.ko))).size < 5) {
      const supplemental = availableSets.find(s => !sets.some(source => source.id === s.id) && new Set((s.words || []).map(w => w.ko)).size >= 5);
      if (supplemental) sets.push(supplemental);
    }
    const saved = await runTransaction(window.firebaseDB, async tx => {
      const ref = doc(window.firebaseDB, 'tests', id);
      const profile = await tx.get(doc(window.firebaseDB, 'students', String(studentId)));
      if (profile.exists() && profile.data().deletedWeeklyReviewIds?.includes(id)) {
        if (configuring) throw new Error('관리자가 삭제한 주간 복습입니다.');
        return null;
      }
      const existing = await tx.get(ref);
      const current = existing.exists() ? existing.data() : null;
      if (configuring) {
        if (!current || current.type !== 'VOCAB_REVIEW' || Number(current.studentId) !== Number(studentId) || current.weekStart !== monday) throw new Error('복습 시험 정보를 확인해주세요.');
        if (current.isPreview) {
          // 체험판은 원본 평일 시험이 없어도 설정을 확인할 수 있다. 문항과 제출 성적은 그대로 보존한다.
          const weekdayCompletion = current.weekdayCompletion || WeeklyReviewLogic.weekdayCompletion(this.getTests(), this.getVocabTestResults(), studentId, monday);
          const updated = {
            ...current, excludedWeekdays, requiredDays: 5 - excludedWeekdays.length, weekdayCompletion,
            completedDays: weekdayCompletion.filter((complete, i) => complete && !excludedWeekdays.includes(i)).length,
            reviewStage: excludedWeekdays.length === 5 ? 'EXCLUDED' : current.reviewStage === 'EXCLUDED' ? 'READY' : current.reviewStage || 'READY',
            status: excludedWeekdays.length === 5 || current.weeklyReviewResult?.completed ? 'PASS' : 'SCHEDULED'
          };
          tx.set(ref, updated);
          return updated;
        }
        if (current.weeklyReviewResult?.rounds?.length) throw new Error('이미 제출한 복습은 응시 기록 보존을 위해 제외 요일을 변경할 수 없습니다.');
        if (JSON.stringify(current.excludedWeekdays || []) === JSON.stringify(excludedWeekdays)) return current;
      } else if (current && !WeeklyReviewLogic.mutable(current)) return current;
      // 서버의 최종 채점/통과 상태를 다시 읽으며 변경 충돌 시 Firestore가 재시도한다.
      const tests = [], results = [], liveSets = [];
      for (const test of sourceTests) {
        const snapshot = await tx.get(doc(window.firebaseDB, 'tests', test.id));
        if (snapshot.exists()) tests.push({ ...snapshot.data(), id: test.id });
      }
      for (const result of sourceResults) {
        const rid = result.id || this.getVocabTestResultDocumentId(result);
        const snapshot = await tx.get(doc(window.firebaseDB, 'vocabTestResults', rid));
        if (snapshot.exists()) results.push({ ...snapshot.data(), id: rid });
      }
      for (const set of sets) {
        const snapshot = await tx.get(doc(window.firebaseDB, 'vocabSets', set.id));
        liveSets.push(snapshot.exists() ? { ...snapshot.data(), id: set.id } : set);
      }
      const test = WeeklyReviewLogic.prepare({ tests, results, sets: liveSets, studentId, monday, excludedWeekdays: configuring ? excludedWeekdays : current?.excludedWeekdays || [] });
      if (!test) {
        if (configuring) throw new Error('원본 단어 일정이 없는 체험용 복습은 제외 요일을 변경할 수 없습니다.');
        return null;
      }
      test.id = id;
      test.reviewRevision = (current?.reviewRevision || 1) + (configuring ? 1 : 0);
      if (existing.exists()) {
        if (WeeklyReviewLogic.samePreparation(existing.data(), test)) return existing.data();
        test.createdAt = existing.data().createdAt || test.createdAt;
        if (test.reviewStage === 'READY') test.unlockedAt = new Date().toISOString();
      }
      tx.set(ref, test);
      return test;
    });
    if (saved) this.cacheWeeklyReview(saved);
    return saved;
  },
  async submitWeeklyReviewRound(id, roundNumber, answers, revision = 1) {
    if (!this.isFirebaseReady()) throw new Error('연결을 확인한 뒤 다시 제출해주세요.');
    const { doc, runTransaction } = window.firebaseFns;
    const saved = await runTransaction(window.firebaseDB, async tx => {
      const testRef = doc(window.firebaseDB, 'tests', id);
      const testSnapshot = await tx.get(testRef);
      if (!testSnapshot.exists()) throw new Error('복습 시험을 찾을 수 없습니다.');
      const test = testSnapshot.data(), previous = test.weeklyReviewResult || null;
      if ((test.reviewRevision || 1) !== revision) throw new Error('관리자가 복습 범위를 변경했습니다. 복습을 다시 열어주세요.');
      if (test.type !== 'VOCAB_REVIEW' || !WeeklyReviewLogic.available(test) || test.status === 'REVIEW_DATA_NEEDED') throw new Error('아직 응시할 수 없습니다.');
      if (!App.state.isAdminLoggedIn && Number(App.state.selectedStudentId) !== Number(test.studentId)) throw new Error('본인의 복습만 제출할 수 있습니다.');
      if ((previous?.rounds.length || 0) >= roundNumber) return { test, result: previous }; // 재전송은 기존 결과를 반환
      if (roundNumber !== (previous?.rounds.length || 0) + 1 || previous?.completed) throw new Error('복습 진행 정보가 변경되었습니다. 다시 열어주세요.');
      const ids = previous?.remainingIds || test.questions.map(q => q.id);
      const questions = test.questions.filter(q => ids.includes(q.id));
      const grade = WeeklyReviewLogic.grade(questions, answers, value => App.convertKorToEng(value));
      const result = { id, studentId: test.studentId, firstScore: previous?.firstScore ?? grade.score, initialWrongCount: previous?.initialWrongCount ?? grade.remainingIds.length, remainingIds: grade.remainingIds, completed: !grade.remainingIds.length, rounds: [...(previous?.rounds || []), { number: roundNumber, ...grade, submittedAt: new Date().toISOString() }] };
      test.status = result.completed ? 'PASS' : 'SCHEDULED';
      test.score = result.firstScore;
      test.weeklyReviewResult = result;
      tx.set(testRef, test);
      return { test, result };
    });
    this.cacheWeeklyReview(saved.test, saved.result);
    return saved.result;
  }
});
