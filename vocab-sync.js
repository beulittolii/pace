/* Durable vocabulary outbox. Keys are scoped to Firebase UID and survive logout. */
(function () {
  'use strict';
  const prefix = 'pace_vocab_outbox_v1:';
  const owner = () => {
    const auth = window.PaceAuth;
    const uid = auth?.auth?.currentUser?.uid;
    return uid && (auth.admin || auth.member) ? uid : null;
  };
  const keyFor = uid => prefix + uid;
  const read = uid => {
    const items = [];
    for (let i=0; i<localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(keyFor(uid) + ':')) items.push(JSON.parse(localStorage.getItem(key)));
    }
    return items.sort((a,b)=>String(a.result.completedAt).localeCompare(String(b.result.completedAt)));
  };
  // One immutable key per submission: two tabs never overwrite each other's queue.
  const store = (uid, entry) => localStorage.setItem(keyFor(uid) + ':' + entry.token, JSON.stringify(entry));
  const remove = (uid, entry) => localStorage.removeItem(keyFor(uid) + ':' + entry.token);
  const attemptKey = a => JSON.stringify([a.startedAt || a.completedAt, a.completedAt]);
  function merge(remote, local) {
    if (!remote) return local;
    const latest = String(remote.completedAt || '') > String(local.completedAt || '') ||
      (remote.completedAt === local.completedAt && remote.gradedByAdmin && !local.gradedByAdmin) ? remote : local;
    const attempts = new Map();
    for (const row of [remote, local]) {
      for (const a of row.attempts || []) {
        const previous = attempts.get(attemptKey(a));
        if (!previous?.gradedByAdmin || a.gradedByAdmin) attempts.set(attemptKey(a), a);
      }
    }
    const review = new Map();
    for (const a of [...(remote.reviewHistory || []), ...(local.reviewHistory || [])]) review.set(attemptKey(a), a);
    return {...latest, attempts:[...attempts.values()].sort((a,b)=>String(a.completedAt).localeCompare(String(b.completedAt))), reviewHistory:[...review.values()]};
  }
  let running = null;
  Object.assign(AppData, {
    pendingVocabResults() {
      const uid = owner();
      return uid ? read(uid) : [];
    },
    mergePendingVocabResults(rows) {
      const items = new Map(rows.map(r=>[this.getVocabTestResultDocumentId(r), r]));
      for (const entry of this.pendingVocabResults()) {
        if (!window.PaceAuth.admin && Number(entry.result.studentId) !== Number(window.PaceAuth.member.studentId)) continue;
        items.set(entry.id, merge(items.get(entry.id), entry.result));
      }
      return [...items.values()];
    },
    queueVocabResult(result) {
      const uid = owner();
      if (!uid) throw Error('로그인을 확인해주세요. 결과를 저장하려면 다시 로그인해야 해요.');
      const id = this.getVocabTestResultDocumentId(result);
      const items = read(uid);
      const previous = items.filter(e=>e.id===id).reduce((value,e)=>merge(value,e.result),null);
      const entry = JSON.parse(JSON.stringify({id, token:crypto.randomUUID(), result:merge(previous,result)}, (k,v)=>v===undefined?null:v));
      store(uid, entry);
      this.updateVocabSyncStatus();
      void this.flushPendingVocabResults();
      return result;
    },
    updateVocabSyncStatus() {
      const el = document.getElementById('vocabSyncStatus');
      if (!el) return;
      const count = this.pendingVocabResults().length;
      el.textContent = count ? `기기에 저장했어요 · 서버 동기화 대기 ${count}건. 연결되면 자동으로 저장해요.` : '서버에 저장했어요.';
    },
    async flushPendingVocabResults() {
      const uid = owner();
      if (!uid || navigator.onLine === false) return;
      if (running) return running;
      running = (async () => {
        for (const entry of read(uid)) {
          if (owner() !== uid) break;
          try {
            const auth = window.PaceAuth;
            if (!auth.admin && Number(entry.result.studentId) !== Number(auth.member.studentId)) continue;
            const f = auth.raw;
            const ref = f.doc(auth.db, 'vocabTestResults', entry.id);
            const saved = await this.withCloudTimeout(f.runTransaction(auth.db, async tx => {
              if (owner() !== uid) throw Error('로그인 상태가 변경되었어요.');
              const snapshot = await tx.get(ref);
              if (entry.result.testId) {
                const schedule = await tx.get(f.doc(auth.db,'tests',entry.result.testId));
                if (!schedule.exists()) throw Error('시험 일정이 삭제되었어요. 보관한 결과는 유지됩니다.');
              }
              const result = merge(snapshot.exists() ? snapshot.data() : null, entry.result);
              tx.set(ref, result);
              return result;
            }), '단어 결과 동기화');
            if (owner() !== uid) break;
            const rows = FirebaseStore.vocabTestResults.filter(r=>this.getVocabTestResultDocumentId(r)!==entry.id);
            FirebaseStore.vocabTestResults = [...rows, saved];
            // Keep the queue until the corresponding schedule is also updated.
            if (entry.result.testId) {
              // Always load the server's current schedule instead of replaying a stale whole document.
              const testRef = f.doc(auth.db,'tests',entry.result.testId);
              const snapshot = await this.withCloudTimeout(f.getDoc(testRef), '시험 일정 확인');
              if (owner() !== uid) break;
              if (!snapshot.exists()) throw Error('시험 일정을 찾지 못했어요.');
              const test = {...snapshot.data(),id:entry.result.testId};
              FirebaseStore.tests = [...FirebaseStore.tests.filter(t=>t.id!==test.id),test];
              await this.withCloudTimeout(App.updateVocabScheduleStatus(test.id), '시험 상태 동기화');
              if (owner() !== uid) break;
            }
            // A newer attempt may have been queued while this write was in flight.
            remove(uid, entry);
          } catch (error) {
            console.warn('단어 결과는 기기에 보관 중입니다. 동기화를 재시도합니다.', error);
            break;
          }
        }
      })().catch(error => console.warn('단어 결과 동기화 대기:', error)).finally(() => {
        running = null;
        this.updateVocabSyncStatus();
      });
      return running;
    }
  });
  let recovering = false;
  async function resume() {
    if (navigator.onLine === false) return;
    const auth = window.PaceAuth;
    try {
      // An offline reload can leave Firebase signed in before profile reads succeed.
      if (!owner() && auth?.auth?.currentUser && !auth.busy && !auth.managed && !recovering && read(auth.auth.currentUser.uid).length) {
        recovering = true;
        try { await auth.enter(); } finally { recovering = false; }
      }
      await AppData.flushPendingVocabResults();
    } catch (error) { console.warn('보관된 단어 결과 복구 대기:', error); }
  }
  window.addEventListener('online', ()=>void resume());
  window.addEventListener('storage', e=>{
    if (e.key?.startsWith(prefix)) { AppData.updateVocabSyncStatus(); void AppData.flushPendingVocabResults(); }
  });
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState==='visible') void resume();
  });
  // Also retries server/permission recovery while the browser remains online.
  setInterval(()=>void resume(), 30000);
})();
