/* Bridge existing learning modules to authenticated, scoped Firestore reads. */
Object.assign(PaceAuth, {
  scoped(ref) {
    if (ref.type !== 'collection' || this.admin) return ref;
    if (!this.member) throw Error('가입을 완료한 뒤 이용해주세요.');
    const f = this.raw, id = this.member.studentId;
    if (ref.path === 'students') return f.query(ref, f.where('id','==',id));
    if (['tests','vocabTestResults','textMemorizeResults','academicRecords'].includes(ref.path)) return f.query(ref,f.where('studentId','==',id));
    return ref;
  },
  academicQuery(kind) {
    const f = this.raw;
    const filters = [f.where('kind','==',kind)];
    if (!this.admin) filters.push(f.where('studentId','==',this.member.studentId));
    return f.query(f.collection(this.db,'academicRecords'), ...filters);
  },
  academicSnapshot(kind, snapshot) {
    const object = ['academicTargetUnivs','specialScienceResults'].includes(kind);
    const safeRows = snapshot.docs.map(s => {
      const row = s.data(), id = row.studentId;
      if (kind === 'academicTargetUnivs') return { [String(id)]: row.items?.[String(id)] || [] };
      if (object) return Object.fromEntries(Object.entries(row.items || {}).map(([key,item]) => [key,{...item,studentId:id}]));
      return (row.items || []).map(item => ({...item,studentId:id}));
    });
    const items = object ? Object.assign({}, ...safeRows) : safeRows.flat();
    return { exists: () => true, data: () => ({ items }), metadata: snapshot.metadata };
  },
  async saveAcademic(kind, data) {
    const f = this.raw, grouped = new Map();
    const items = data.items || [];
    const add = (id, key, item) => {
      id = Number(id);
      if (!Number.isSafeInteger(id)) throw Error('학생을 확인할 수 없는 학업 기록입니다.');
      if (!this.admin && id !== this.member.studentId) throw Error('본인의 학업 기록만 수정할 수 있어요.');
      if (!grouped.has(id)) grouped.set(id,Array.isArray(items) ? [] : {});
      if (Array.isArray(items)) grouped.get(id).push(item); else grouped.get(id)[key] = item;
    };
    if (Array.isArray(items)) items.forEach(item => add(item.studentId,null,item));
    else Object.entries(items).forEach(([key,item]) => add(kind === 'academicTargetUnivs' ? key : item.studentId,key,item));
    const existing = await f.getDocs(this.academicQuery(kind));
    existing.docs.forEach(s => { if (!grouped.has(s.data().studentId)) grouped.set(s.data().studentId,Array.isArray(items) ? [] : {}); });
    for (const [id, values] of grouped) await f.setDoc(this.ref('academicRecords',`${kind}_${id}`),{kind,studentId:id,items:values,updatedAt:f.serverTimestamp()});
  },
  installBridge() {
    if (this.bridgeInstalled) return;
    this.bridgeInstalled = true;
    const f = this.raw;
    const academicKind = ref => ref?.path?.startsWith('academicData/') ? ref.id : null;
    window.firebaseFns = {
      ...f,
      getDocs: ref => f.getDocs(this.scoped(ref)),
      getDoc: async ref => {
        const generation = this.generation;
        const result = academicKind(ref) ? this.academicSnapshot(ref.id,await f.getDocs(this.academicQuery(ref.id))) : await f.getDoc(ref);
        if (this.generation !== generation) throw Error('로그인 상태가 변경되었어요.');
        return result;
      },
      setDoc: (ref,data,...args) => academicKind(ref) ? this.saveAcademic(ref.id,data) : f.setDoc(ref,data,...args),
      onSnapshot: (ref,...args) => {
        const generation = this.generation;
        args = args.map(arg => typeof arg !== 'function' ? arg : (...values) => { if (this.generation === generation) arg(...values); });
        let stop;
        if (academicKind(ref)) {
          const next = args[0];
          stop = f.onSnapshot(this.academicQuery(ref.id),snapshot => next(this.academicSnapshot(ref.id,snapshot)),args[1]);
        } else stop = f.onSnapshot(this.scoped(ref),...args);
        this.unsubscribers.push(stop); return stop;
      }
    };
  },
  async loadData() {
    this.unsubscribers.splice(0).forEach(stop => stop());
    this.installBridge();
    const f = window.firebaseFns, generation = this.generation;
    const collections = ['students','tests','vocabSets','vocabTestResults','textMemorizeResults'];
    const snapshots = await Promise.all(collections.map(c => f.getDocs(f.collection(this.db,c))));
    if (this.generation !== generation) throw Error('로그인 상태가 변경되었어요.');
    snapshots.forEach((snapshot,i) => {
      const c = collections[i];
      FirebaseStore[c] = snapshot.docs.map(s => ({...s.data(),id:s.data().id ?? s.id}));
      FirebaseStore.reviewSourcesReady[c] = true;
      if (c === 'students') FirebaseStore[c].sort((a,b) => a.id-b.id);
    });
    if (!this.admin && !FirebaseStore.students.some(s => s.id === this.member.studentId && s.accountUid === this.auth.currentUser.uid)) {
      throw Error('연결된 학생 프로필을 찾을 수 없어요. 관리자에게 문의해주세요.');
    }
    FirebaseStore.studentsLoaded = true; FirebaseStore.testsLoaded = true;
    if (typeof AcademicManager !== 'undefined') {
      if (!await AcademicManager.pullCloudDataToLocal(false)) throw Error('학업 기록을 불러오지 못했어요. 다시 로그인해주세요.');
      AcademicManager.listenToCloudAcademicData();
    }
    // No legacy seeding, cross-student caches, or background cleanup on sign-in.
    const loadingUid = this.auth.currentUser.uid;
    collections.forEach(c => {
      this.unsubscribers.push(this.raw.onSnapshot(this.scoped(this.raw.collection(this.db,c)), snapshot => {
        if (this.generation !== generation || this.auth.currentUser?.uid !== loadingUid || (!this.member && !this.admin)) return;
        FirebaseStore[c] = snapshot.docs.map(s => ({...s.data(),id:s.data().id ?? s.id}));
        if (App.state.view !== 'landing') AppData.refreshCloudScreens();
      }, error => App.toast(this.error(error),'error')));
    });
  },
  async boot() {
    this.clearData();
    try {
      await this.ready();
      this.installBridge();
      this.observedUid = null;
      this.f.onAuthStateChanged(this.auth, async user => {
        const uid = user?.uid || null;
        if (uid !== (this.auth.currentUser?.uid || null)) return;
        if (this.managed) { this.observedUid = uid; return; }
        if (this.observedUid === uid) return;
        this.observedUid = uid;
        try {
          if (user) await this.enter();
          else { this.clearData(); this.close(); await App.showLanding(); }
        } catch (error) {
          this.clearData();
          const el = document.getElementById('loginError');
          el.textContent = this.error(error); el.classList.remove('hidden');
        }
      });
    } catch(error) {
      const el = document.getElementById('loginError'); el.textContent = this.error(error); el.classList.remove('hidden');
    }
  }
});

// Existing profile editor now edits learning profiles, never passwords.
const paceOriginalStudentEditor = App.renderAdminStudentsTab.bind(App);
App.renderAdminStudentsTab = function () {
  paceOriginalStudentEditor();
  const grid = document.getElementById('adminStudentsEditGrid');
  if (!grid) return;
  if (!document.getElementById('paceAccountAdmin')) {
    const panel = document.createElement('div'); panel.id='paceAccountAdmin'; panel.className='pace-account-panel'; grid.prepend(panel);
  }
  PaceAuth.renderAdmin();
};

