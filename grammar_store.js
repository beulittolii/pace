/** 문법 시험 전용 트랜잭션. 저장 성공 전에는 화면의 시험/단계를 변경하지 않는다. */
Object.assign(AppData, {
  cacheGrammarTests(records) {
    const recordsById = new Map(records.map(t => [t.id, t]));
    FirebaseStore.tests = [...this.getTests().filter(t => !recordsById.has(t.id)), ...records];
    setLocalCache(LOCAL_CACHE_KEYS.tests, FirebaseStore.tests);
    this.refreshCloudScreens();
  },

  async updateGrammarTest(id, update) {
    if (!this.isFirebaseReady()) throw new Error('클라우드 연결 후 다시 저장해주세요.');
    const { doc, runTransaction } = window.firebaseFns;
    const ref = doc(window.firebaseDB, 'tests', id);
    const saved = await runTransaction(window.firebaseDB, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('시험을 찾을 수 없습니다.');
      const test = GrammarLogic.clone(snapshot.data());
      if (test.type !== 'GRAMMAR') throw new Error('문법 시험이 아닙니다.');
      update(test);
      test.grammarUpdatedAt = new Date().toISOString();
      transaction.set(ref, test);
      return test;
    });
    this.cacheGrammarTests([saved]);
    return saved;
  },

  async deleteGrammarTest(id) {
    if (!App.state.isAdminLoggedIn) throw new Error('관리자만 삭제할 수 있습니다.');
    if (!this.isFirebaseReady()) throw new Error('클라우드 연결 후 다시 시도해주세요.');
    const target = this.getTests().find(t => t.id === id && t.type === 'GRAMMAR');
    if (!target) throw new Error('시험을 찾을 수 없습니다.');
    const related = this.getTests().filter(t => t.type === 'GRAMMAR' && t.grammarRootId === target.grammarRootId);
    const root = related.find(t => t.id === target.grammarRootId);
    if (!root) throw new Error('최초 시험을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.');
    const deleting = id === root.id ? related : [target];
    const { doc, runTransaction } = window.firebaseFns;
    const updatedRoot = await runTransaction(window.firebaseDB, async transaction => {
      const snapshots = await Promise.all(related.map(t => transaction.get(doc(window.firebaseDB, 'tests', t.id))));
      const current = snapshots.filter(s => s.exists()).map(s => s.data());
      const currentRoot = current.find(t => t.id === root.id);
      if (!currentRoot || currentRoot.grammarLastSequence !== root.grammarLastSequence) throw new Error('시험 목록이 변경되었습니다. 새로고침 후 다시 시도해주세요.');
      const remaining = current.filter(t => !deleting.some(d => d.id === t.id));
      let nextRoot = null;
      if (id !== root.id) {
        const latest = GrammarLogic.latest(remaining, root.studentId, root.grammarUnitId);
        nextRoot = { ...currentRoot, grammarLatest: Object.fromEntries(GrammarLogic.parts.map(p => [p, latest[p]?.id || root.id])) };
        transaction.set(doc(window.firebaseDB, 'tests', root.id), nextRoot);
      }
      deleting.forEach(t => transaction.delete(doc(window.firebaseDB, 'tests', t.id)));
      return nextRoot;
    });
    FirebaseStore.tests = this.getTests().filter(t => !deleting.some(d => d.id === t.id));
    if (updatedRoot) this.cacheGrammarTests([updatedRoot]);
    else { setLocalCache(LOCAL_CACHE_KEYS.tests, FirebaseStore.tests); this.refreshCloudScreens(); }
  },

  async assignGrammarTest({ studentId, date, time, endTime, parts, note, unitId = 'subjunctive' }) {
    if (!this.isFirebaseReady()) throw new Error('클라우드 연결 후 다시 배정해주세요.');
    if (!App.state.isAdminLoggedIn) throw new Error('관리자만 배정할 수 있습니다.');
    if (!shouldKeepTest({ date })) throw new Error('등록 가능한 날짜를 선택해주세요.');
    if (!Object.hasOwn(GRAMMAR_UNITS, unitId)) throw new Error('배정할 문법 단원을 확인해주세요.');
    const unit = GRAMMAR_UNITS[unitId];
    if (!parts.length || parts.some(p => !GrammarLogic.parts.includes(p))) throw new Error('배정할 영역을 선택해주세요.');
    const { doc, runTransaction } = window.firebaseFns;
    const rootId = `grammar_${unit.id}_student_${Number(studentId)}`;
    const rootRef = doc(window.firebaseDB, 'tests', rootId);
    const nextId = `grammar_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const records = await runTransaction(window.firebaseDB, async transaction => {
      const rootSnapshot = await transaction.get(rootRef);
      const root = rootSnapshot.exists() ? rootSnapshot.data() : null;
      if (!root && (parts.length !== 2 || !GrammarLogic.parts.every(p => parts.includes(p)))) throw new Error('최초 시험은 개념과 실전을 함께 배정해야 합니다.');
      if (root) {
        // 최신 영역별 시험 문서를 직접 읽어 오래된 화면에서도 중복 재시험을 막는다.
        for (const part of parts) {
          const latestId = root.grammarLatest?.[part] || rootId;
          const latest = latestId === rootId ? root : (await transaction.get(doc(window.firebaseDB, 'tests', latestId))).data();
          if (!latest || GrammarLogic.partState(latest, part) !== 'FAIL') throw new Error(`${GrammarLogic.label(part)}은 미달이 확정된 경우에만 재배정할 수 있습니다.`);
        }
      }
      const id = root ? nextId : rootId;
      const sequence = root ? (root.grammarLastSequence || 0) + 1 : 0;
      const test = {
        id, studentId: Number(studentId), type: 'GRAMMAR', title: `${root?.grammarContent?.title || unit.title} 문법 테스트${root ? ' · 재시험' : ''}`,
        date, time, endTime, scope: parts.map(p => GrammarLogic.label(p)).join(' + '), cutoff: '개념·실전 각각 80점 이상', cutoffScore: 80,
        status: 'SCHEDULED', score: '', retestStatus: 'NONE', retestDate: '', teacherNote: note || '',
        grammarUnitId: unit.id, grammarVersion: root?.grammarVersion || unit.version,
        grammarContent: GrammarLogic.clone(root?.grammarContent || unit),
        grammarRootId: rootId, grammarSequence: sequence, grammarParts: [...parts],
        grammarStage: parts.includes('concept') ? 'concept' : 'practice', grammarResults: {},
        grammarCreatedAt: new Date().toISOString()
      };
      const latest = { ...(root?.grammarLatest || {}) };
      parts.forEach(part => { latest[part] = id; });
      if (root) {
        const updatedRoot = { ...root, grammarLatest: latest, grammarLastSequence: sequence };
        transaction.set(rootRef, updatedRoot);
        transaction.set(doc(window.firebaseDB, 'tests', id), test);
        return [updatedRoot, test];
      }
      test.grammarLatest = latest;
      test.grammarLastSequence = sequence;
      transaction.set(rootRef, test);
      return [test];
    });
    this.cacheGrammarTests(records);
    return records.at(-1);
  }
});
