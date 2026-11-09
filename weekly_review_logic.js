/** 주간 복습의 순수 출제·채점 규칙. 일정 날짜는 KST 달력 날짜로 취급한다. */
const WeeklyReviewLogic = {
  clone: value => JSON.parse(JSON.stringify(value)),
  norm: value => String(value || '').trim().toLowerCase(),
  key(word) { return this.norm(word.en); },
  dateOffset(date, offset) { return new Date(Date.parse(`${date}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10); },
  monday(date) { const day = new Date(`${date}T00:00:00Z`).getUTCDay(); return this.dateOffset(date, -((day + 6) % 7)); },
  id(studentId, monday) { return `weekly_review_${Number(studentId)}_${monday}`; },
  available(test, now = new Date()) { return !['LOCKED', 'NO_ERRORS', 'EXCLUDED'].includes(test.reviewStage) && test.status !== 'REVIEW_DATA_NEEDED' && Boolean(test.questions?.length) && now.getTime() >= Date.parse(`${test.date}T00:00:00+09:00`); },
  mutable(test) { return test?.reviewStage === 'LOCKED' || test?.status === 'REVIEW_DATA_NEEDED'; },
  samePreparation(a, b) { return JSON.stringify([a.reviewStage, a.status, a.sourceTestIds, a.completedDays, a.assignedDays, a.unresolvedCount, a.weekdayCompletion, a.excludedWeekdays, a.requiredDays]) === JSON.stringify([b.reviewStage, b.status, b.sourceTestIds, b.completedDays, b.assignedDays, b.unresolvedCount, b.weekdayCompletion, b.excludedWeekdays, b.requiredDays]); },
  shuffle(values) { const shuffled = [...values]; for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; } return shuffled; },
  normalizeExcludedWeekdays(days = []) {
    if (!Array.isArray(days) || days.some(day => !Number.isInteger(day) || day < 0 || day > 4)) throw new Error('제외할 요일을 확인해주세요.');
    return [...new Set(days)].sort((a,b) => a-b);
  },
  eligible(tests, results, studentId, monday, excludedWeekdays = []) {
    const weekdays = Array.from({ length: 5 }, (_, i) => i).filter(i => !excludedWeekdays.includes(i)).map(i => this.dateOffset(monday, i));
    const sources = tests.filter(t => t.type === 'VOCAB' && Number(t.studentId) === Number(studentId) && weekdays.includes(t.date));
    if (!weekdays.every(date => sources.some(t => t.date === date))) return null;
    if (!sources.every(t => (t.status === 'PASS' || t.retestStatus === 'RETEST_PASS') && !results.some(r => r.testId === t.id && AppData.getVocabDirections(t).includes(Number(r.direction)) && Number(r.direction) === 4 && (!r.passed || !r.gradedByAdmin)))) return null;
    return sources;
  },
  weekdayCompletion(tests, results, studentId, monday) {
    return Array.from({ length: 5 }, (_, i) => {
      const date = this.dateOffset(monday, i);
      const daily = tests.filter(t => t.type === 'VOCAB' && Number(t.studentId) === Number(studentId) && t.date === date);
      return daily.length > 0 && daily.every(t => (t.status === 'PASS' || t.retestStatus === 'RETEST_PASS') && !results.some(r => r.testId === t.id && AppData.getVocabDirections(t).includes(Number(r.direction)) && Number(r.direction) === 4 && (!r.passed || !r.gradedByAdmin)));
    });
  },
  prepare({ tests, results, sets, studentId, monday, excludedWeekdays = [] }) {
    excludedWeekdays = this.normalizeExcludedWeekdays(excludedWeekdays);
    const requiredDays = 5 - excludedWeekdays.length;
    const scheduled = tests.filter(t => t.type === 'VOCAB' && Number(t.studentId) === Number(studentId) && this.monday(t.date) === monday);
    if (!scheduled.length) return null;
    const weekdays = Array.from({ length: 5 }, (_, i) => this.dateOffset(monday, i));
    const assignedDays = weekdays.filter((date, i) => !excludedWeekdays.includes(i) && scheduled.some(t => t.date === date)).length;
    const weekdayCompletion = this.weekdayCompletion(tests, results, studentId, monday);
    const completedDays = weekdayCompletion.filter((complete, i) => complete && !excludedWeekdays.includes(i)).length;
    const placeholder = {
      id: this.id(studentId, monday), type: 'VOCAB_REVIEW', studentId: Number(studentId), title: '주간 복습',
      date: this.dateOffset(monday, 5), time: '00:00', endTime: '23:59', allowLate: true,
      status: 'SCHEDULED', reviewStage: 'LOCKED', weekStart: monday, weekEnd: this.dateOffset(monday, 4),
      scope: `${monday} ~ ${this.dateOffset(monday, 4)}`, cutoff: '모든 오답 해결', questions: [],
      sourceTestIds: scheduled.map(t => t.id).sort(), completedDays, assignedDays, weekdayCompletion, excludedWeekdays, requiredDays, unresolvedCount: 0,
      reviewVersion: 1, createdAt: new Date().toISOString()
    };
    if (!requiredDays) return { ...placeholder, status: 'PASS', reviewStage: 'EXCLUDED' };
    if (completedDays < requiredDays) return placeholder;
    const generated = this.build({ tests, results, sets, studentId, monday, excludedWeekdays });
    if (!generated) return { ...placeholder, status: 'PASS', reviewStage: 'NO_ERRORS' };
    return { ...generated, sourceTestIds: [...generated.sourceTestIds].sort(), completedDays, assignedDays, weekdayCompletion, excludedWeekdays, requiredDays, reviewStage: generated.status === 'REVIEW_DATA_NEEDED' ? 'DATA_NEEDED' : 'READY' };
  },
  // 동일 응시를 관리자 채점으로 여러 번 저장했으면 최종 스냅샷 한 번만 사용한다.
  attempts(result) {
    const map = new Map();
    for (const attempt of [...(result.reviewHistory || []), ...(result.attempts || []), result]) {
      if (!attempt.completedAt && !attempt.startedAt && attempt !== result) continue;
      const key = `${attempt.startedAt || attempt.completedAt || 'legacy'}|${attempt.completedAt || ''}`;
      map.set(key, { ...attempt, direction: Number(result.direction), resultId: result.id || '', testId: result.testId });
    }
    return [...map.values()].filter(a => !a.waitingGrading || a.gradedByAdmin);
  },
  resolve(detail, words) {
    if (detail.word?.en && detail.word?.ko) return words.find(w => this.key(w) === this.key(detail.word) && this.norm(w.ko) === this.norm(detail.word.ko));
    const question = this.norm(detail.question), correct = this.norm(detail.correct);
    const found = words.filter(w => question === this.norm(`${w.en} (${w.ko})`) || correct === this.norm(`${w.en} (${w.ko})`) || correct === this.norm(`${w.en} : ${w.ko}`) ||
      (question === this.norm(w.en) && correct === this.norm(w.ko)) || (question === this.norm(w.ko) && correct === this.norm(w.en)) ||
      (question === this.norm(w.defEn) && w.defEn && correct === this.norm(w.en)));
    const unique = [...new Map(found.map(w => [`${this.norm(w.en)}\u0000${this.norm(w.ko)}`, w])).values()];
    return unique.length === 1 ? unique[0] : null;
  },
  build({ tests, results, sets, studentId, monday, excludedWeekdays = [] }) {
    const sources = this.eligible(tests, results, studentId, monday, excludedWeekdays);
    if (!sources) return null;
    const candidates = new Map(), allWords = new Map(sets.flatMap(s => (s.words || []).filter(w => this.norm(w.en) && this.norm(w.ko)).map(w => [this.key(w), w])));
    let wrongEvents = 0, unresolved = 0;
    for (const test of sources) {
      const ids = test.vocabSetIds?.length ? test.vocabSetIds : [test.vocabSetId];
      const words = sets.filter(s => ids.includes(s.id)).flatMap(s => (s.words || []).filter(w => this.norm(w.en) && this.norm(w.ko)).map(w => ({ ...w, setId: s.id })));
      words.forEach(w => allWords.set(this.key(w), w));
      const directions = AppData.getVocabDirections(test);
      for (const result of results.filter(r => r.testId === test.id && Number(r.studentId) === Number(studentId) && directions.includes(Number(r.direction)))) {
        for (const attempt of this.attempts(result)) {
          const details = attempt.questionDetails?.length ? attempt.questionDetails : (attempt.wrongAnswers || []).map(d => ({ ...d, isCorrect: false }));
          const seen = new Set();
          for (const detail of details) {
            const wrong = detail.isCorrect === false;
            if (wrong) wrongEvents++;
            const word = this.resolve(detail, words);
            if (!word) { if (wrong) unresolved++; continue; }
            const key = this.key(word);
            if (seen.has(key)) continue;
            seen.add(key);
            const candidate = candidates.get(key) || { word, mistakes: 0, latest: '', spelling: false, sources: [] };
            candidate.sources.push({ testId: test.id, resultId: result.id || '', startedAt: attempt.startedAt || '', completedAt: attempt.completedAt || '', direction: Number(result.direction), setId: word.setId });
            if (wrong) {
              candidate.mistakes++;
              candidate.latest = [candidate.latest, attempt.completedAt || attempt.startedAt || ''].sort().pop();
              const dir = Number(result.direction);
              if (dir === 3 || dir === 5 || (dir === 4 && !(detail.spellingCorrect === true || this.norm(detail.spellingInput || detail.answer?.split(' / ')[0]) === this.norm(word.en)))) candidate.spelling = true;
            }
            candidates.set(key, candidate);
          }
        }
      }
    }
    if (!wrongEvents) return null;
    const wrong = [...candidates.values()].filter(c => c.mistakes).sort((a,b) => b.mistakes - a.mistakes || b.latest.localeCompare(a.latest) || this.key(a.word).localeCompare(this.key(b.word))).slice(0,30);
    const correct = unresolved ? [] : this.shuffle([...candidates.values()].filter(c => !c.mistakes)).slice(0,10);
    let missingChoices = false;
    const questions = [...wrong, ...correct].map((c, i) => {
      let mode = c.mistakes ? (c.spelling ? 'SPELLING' : 'CHOICE') : ((i - wrong.length) % 2 ? 'SPELLING' : 'CHOICE');
      if (!c.mistakes) {
        const supportsChoice = c.sources.some(s => s.direction === 2 || s.direction === 4);
        const supportsSpelling = c.sources.some(s => [3, 4, 5].includes(s.direction));
        if (!supportsChoice) mode = 'SPELLING';
        else if (!supportsSpelling) mode = 'CHOICE';
      }
      const alternatives = [...new Set([...allWords.values()].map(w => w.ko).filter(ko => this.norm(ko) !== this.norm(c.word.ko)))];
      if (mode === 'CHOICE' && alternatives.length < 4) missingChoices = true;
      return { id: `w${i + 1}`, word: this.clone(c.word), mode, choices: mode === 'CHOICE' ? this.shuffle([c.word.ko, ...this.shuffle(alternatives).slice(0,4)]) : [], mistakeCount: c.mistakes, sources: c.sources };
    });
    return { id: this.id(studentId, monday), type: 'VOCAB_REVIEW', studentId: Number(studentId), title: '주간 복습', date: this.dateOffset(monday,5), time: '00:00', endTime: '23:59', allowLate: true, status: wrong.length && !missingChoices ? 'SCHEDULED' : 'REVIEW_DATA_NEEDED', weekStart: monday, weekEnd: this.dateOffset(monday,4), scope: `${monday} ~ ${this.dateOffset(monday,4)}`, cutoff: '모든 오답 해결', questions: missingChoices ? [] : questions, blockedReason: missingChoices ? '5지선다 선택지를 구성할 원본 단어가 부족합니다.' : !wrong.length ? '오답 기록을 원본 단어와 연결할 수 없습니다.' : '', sourceTestIds: sources.map(t => t.id), unresolvedCount: unresolved, reviewVersion: 1, createdAt: new Date().toISOString() };
  },
  grade(questions, answers, convert = value => value) {
    const details = questions.map(q => {
      const answer = String(answers[q.id] ?? '').trim();
      const correct = q.mode === 'CHOICE' ? answer === q.word.ko : Boolean(answer) && (this.norm(answer) === this.norm(q.word.en) || this.norm(convert(answer)) === this.norm(q.word.en));
      return { questionId: q.id, answer, correct };
    });
    return { details, score: Math.round(details.filter(d => d.correct).length / details.length * 100), remainingIds: details.filter(d => !d.correct).map(d => d.questionId) };
  }
};
