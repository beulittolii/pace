/* PACE identity. Firebase Auth owns credentials; Firestore rules own authorization. */
(function (root) {
  'use strict';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const normalizeId = value => String(value || '').trim().toLowerCase();
  const normalizeCode = value => String(value || '').trim().toUpperCase();
  function generateCode(random = root.crypto) {
    for (;;) {
      let code = '';
      while (code.length < 6) {
        const bytes = random.getRandomValues(new Uint8Array(12));
        for (const byte of bytes) {
          if (byte < 252 && code.length < 6) code += alphabet[byte % 36];
        }
      }
      if (/[A-Z]/.test(code) && /[0-9]/.test(code)) return code;
    }
  }
  function validateAccount({ name, loginId, password, confirmation }) {
    if (!name?.trim() || name.trim().length > 40) throw Error('이름을 1~40자로 입력해주세요.');
    if (!/^[a-z0-9_]{4,20}$/.test(normalizeId(loginId))) throw Error('아이디는 영문·숫자·밑줄 4~20자로 입력해주세요.');
    if (['admin', 'administrator', 'teacher'].includes(normalizeId(loginId))) throw Error('사용할 수 없는 아이디예요.');
    if (password.length < 8 || password.length > 64) throw Error('비밀번호는 8~64자로 입력해주세요.');
    if (password !== confirmation) throw Error('비밀번호가 서로 달라요.');
  }
  const core = { generateCode, normalizeId, normalizeCode, validateAccount };
  if (typeof module !== 'undefined') module.exports = core;
  if (!root.document) return;
  const Auth = root.PaceAuth = {
    ...core, member: null, admin: false, busy: false, managed: false, unsubscribers: [],
    email(id) { return `${normalizeId(id)}@accounts.pace.invalid`; },
    error(error) {
      const messages = {
        'auth/invalid-credential': '아이디 또는 비밀번호를 확인해주세요.',
        'auth/wrong-password': '아이디 또는 비밀번호를 확인해주세요.',
        'auth/user-not-found': '아이디 또는 비밀번호를 확인해주세요.',
        'auth/email-already-in-use': '이미 사용 중인 아이디예요. 로그인하거나 다른 아이디를 입력해주세요.',
        'auth/network-request-failed': '인터넷 연결을 확인하고 다시 시도해주세요.',
        'auth/too-many-requests': '요청이 많아요. 잠시 후 다시 시도해주세요.',
        'auth/operation-not-allowed': '회원가입 서비스를 준비 중이에요. 관리자에게 문의해주세요.',
        'permission-denied': '권한 또는 초대 코드 상태를 확인해주세요. 관리자 설정이 필요할 수 있어요.',
        'resource-exhausted': '무료 서비스 사용량 한도에 도달했어요. 잠시 후 다시 시도해주세요.'
      };
      return messages[error.code] || error.message || '다시 시도해주세요.';
    },
    async ready() {
      if (!await AppData.waitForFirebase(10000) || !root.firebaseAuthFns) throw Error('인증 서버에 연결하지 못했어요. 새로고침해주세요.');
      this.f = root.firebaseAuthFns; this.db = root.firebaseDB; this.auth = root.firebaseAuth;
      this.raw ||= { ...root.firebaseFns };
    },
    ref(collection, id) { return this.raw.doc(this.db, collection, String(id)); },
    clearData() {
      this.generation = (this.generation || 0) + 1;
      this.unsubscribers.splice(0).forEach(stop => stop());
      for (const key of Object.keys(localStorage)) if (/^(yem_|eng_tutoring_)/.test(key)) localStorage.removeItem(key);
      for (const key of ['students','tests','vocabSets','vocabTestResults','textMemorizeResults','vocabReviewResults']) FirebaseStore[key] = [];
      FirebaseStore.studentsLoaded = true; FirebaseStore.testsLoaded = true;
      FirebaseStore.reviewSourcesReady = {};
      clearTimeout(AppData._weeklyReviewTimer); AppData._weeklyReviewTimer = null;
      App.state.specialScienceResults = {}; App.state.specialScienceResultsStudentId = null;
      this.member = null; this.admin = false;
      AppData.updateVocabSyncStatus?.();
      App.state.isAdminLoggedIn = false; App.state.isStudentLoggedIn = false;
    },
    async identity(user) {
      this.member = null; this.admin = false;
      if (!user) return;
      const generation = this.generation;
      const [admin, member] = await Promise.all([
        this.raw.getDoc(this.ref('admins', user.uid)), this.raw.getDoc(this.ref('members', user.uid))
      ]);
      if (this.generation !== generation || this.auth.currentUser?.uid !== user.uid) throw Error('로그인 상태가 변경되었어요.');
      this.admin = admin.exists() && admin.data().enabled === true;
      this.member = member.exists() ? member.data() : null;
    },
    setLoginPasswordVisible(visible) {
      const input = document.getElementById('studentLoginPassword');
      const button = document.getElementById('loginPasswordToggle');
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', visible ? '비밀번호 숨기기' : '비밀번호 표시');
      button.setAttribute('aria-pressed', String(visible));
      button.querySelector('i').className = visible ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    },
    toggleLoginPassword() {
      this.setLoginPasswordVisible(document.getElementById('studentLoginPassword').type === 'password');
    },
    setLoginLoading(loading) {
      const form = document.querySelector('#landingView form');
      const button = document.querySelector('#landingView form button[type=submit]');
      button.disabled = loading;
      button.querySelector('span').textContent = loading ? '로그인 중…' : '로그인';
      button.querySelector('i').className = loading ? 'pace-login-spinner' : 'fa-solid fa-right-to-bracket';
      if (loading) form.setAttribute('aria-busy', 'true');
      else form.removeAttribute('aria-busy');
    },
    async login(event) {
      event?.preventDefault();
      if (this.busy) return;
      const error = document.getElementById('loginError');
      this.busy = true; this.setLoginLoading(true); error.classList.add('hidden');
      let authenticated = false;
      try {
        await this.ready();
        await this.f.setPersistence(this.auth, document.getElementById('rememberLogin').checked ? this.f.browserLocalPersistence : this.f.inMemoryPersistence);
        this.managed = true;
        await this.f.signInWithEmailAndPassword(this.auth, this.email(document.getElementById('studentLoginId').value), document.getElementById('studentLoginPassword').value);
        authenticated = true;
        document.getElementById('studentLoginPassword').value = '';
        this.setLoginPasswordVisible(false);
        this.observedUid = this.auth.currentUser.uid;
        await this.enter();
      } catch (e) {
        if (authenticated) { this.clearData(); this.close(); await App.showLanding(); }
        error.textContent = this.error(e); error.classList.remove('hidden');
      }
      finally { this.managed = false; this.busy = false; this.setLoginLoading(false); }
    },
    async enter(showHome = true) {
      if (showHome) App.showLoadingSkeleton();
      try {
        this.clearData();
        await this.identity(this.auth.currentUser);
        if (!this.admin && !this.member) { this.open(2); return; }
        if (showHome) App.showLoadingSkeleton(this.admin ? 'admin' : 'student');
        await this.loadData();
        if (showHome) this.home();
        this.watchMembership();
      } finally { if (showHome) App.finishInitialLoading(); }
    },
    home() {
      this.close();
      App.state.isAdminLoggedIn = this.admin;
      App.state.isStudentLoggedIn = !this.admin && !!this.member;
      if (this.admin) App.showAdminDashboard();
      else if (this.member) { App.state.selectedStudentId = this.member.studentId; App.selectStudent(this.member.studentId); }
    },
    watchMembership() {
      if (this.admin || !this.member) return;
      this.unsubscribers.push(this.raw.onSnapshot(this.ref('members', this.auth.currentUser.uid), snap => {
        if (!snap.exists()) { this.logout(); return; }
        if (snap.data().studentId !== this.member?.studentId) this.enter().catch(e => App.toast(this.error(e), 'error'));
      }));
    },
    openProfileSettings(tab = 'goal') {
      if (!this.auth?.currentUser) { App.toast('로그인 후 프로필을 설정해주세요.', 'error'); return; }
      const dialog = document.getElementById('passwordSettingsDialog');
      if (dialog.open) { this.switchProfileTab(tab); return; }
      this.passwordSettingsOpener = document.activeElement;
      document.getElementById('passwordSettingsForm').reset();
      document.getElementById('passwordSettingsMessage').textContent = '';
      document.getElementById('goalSettingsMessage').textContent = '';
      document.getElementById('learningGoal').value = AppData.getStudentById(this.member?.studentId)?.target || '';
      AcademicManager.prepareTargetUnivEditor(this.member?.studentId);
      this.switchProfileTab(tab, false);
      dialog.showModal();
      document.getElementById(tab === 'goal' ? 'learningGoal' : tab === 'university' ? 'universitySettingsTab' : 'currentPassword').focus();
    },
    openPasswordSettings() { this.openProfileSettings('password'); },
    switchProfileTab(tab, focus = true) {
      if (this.passwordBusy || this.goalBusy || this.universityBusy) return;
      if (!['goal', 'university', 'password'].includes(tab)) return;
      document.getElementById('passwordSettingsDialog').classList.toggle('pace-profile-university', tab === 'university');
      for (const name of ['goal', 'university', 'password']) {
        const active = name === tab, button = document.getElementById(`${name}SettingsTab`);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
        document.getElementById(`${name}SettingsForm`).hidden = !active;
      }
      if (tab !== 'password') document.getElementById('passwordSettingsForm').reset();
      if (focus) document.getElementById(`${tab}SettingsTab`).focus();
    },
    profileTabKeydown(event, tab) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const tabs = ['goal', 'university', 'password'];
      const next = (tabs.indexOf(tab) + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      this.switchProfileTab(event.key === 'Home' ? 'goal' : event.key === 'End' ? 'password' : tabs[next]);
    },
    async saveGoal(event) {
      event?.preventDefault();
      if (this.goalBusy || this.passwordBusy || this.universityBusy) return;
      const form = document.getElementById('goalSettingsForm');
      const message = document.getElementById('goalSettingsMessage');
      const target = document.getElementById('learningGoal').value.trim();
      message.textContent = '';
      if (target.length > 200) { message.textContent = '목표는 200자 이내로 입력해주세요.'; return; }
      this.goalBusy = true;
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('textarea, button').forEach(el => el.disabled = true);
      let saved = false;
      try {
        await this.ready();
        const user = this.auth.currentUser, id = this.member?.studentId, generation = this.generation;
        const student = AppData.getStudentById(id);
        if (!user || !student || student.accountUid !== user.uid || student.linking) throw Error('계정과 학생 프로필 연결을 확인해주세요.');
        await this.raw.updateDoc(this.ref('students', id), { target });
        if (this.generation !== generation || this.auth.currentUser?.uid !== user.uid || this.member?.studentId !== id) throw Error('로그인 상태가 변경되었어요.');
        const current = FirebaseStore.students.find(item => item.id === id);
        if (current) current.target = target;
        AppData.refreshCloudScreens();
        saved = true;
      } catch (error) {
        message.textContent = this.error(error);
      } finally {
        this.goalBusy = false;
        form.removeAttribute('aria-busy');
        form.querySelectorAll('textarea, button').forEach(el => el.disabled = false);
      }
      if (saved) { this.closePasswordSettings(); App.toast(target ? '학습 목표가 저장되었어요.' : '학습 목표를 지웠어요.', 'success'); }
    },
    closePasswordSettings() {
      if (this.passwordBusy || this.goalBusy || this.universityBusy) return;
      document.getElementById('passwordSettingsDialog').close();
      document.getElementById('passwordSettingsForm').reset();
      this.passwordSettingsOpener?.focus();
    },
    async changePassword(event) {
      event?.preventDefault();
      if (this.passwordBusy || this.goalBusy || this.universityBusy) return;
      const form = document.getElementById('passwordSettingsForm');
      const message = document.getElementById('passwordSettingsMessage');
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmation = document.getElementById('confirmNewPassword').value;
      message.textContent = '';
      if (!currentPassword) { message.textContent = '현재 비밀번호를 입력해주세요.'; return; }
      if (newPassword.length < 8 || newPassword.length > 64) { message.textContent = '새 비밀번호는 8~64자로 입력해주세요.'; return; }
      if (newPassword !== confirmation) { message.textContent = '새 비밀번호가 서로 달라요.'; return; }
      if (currentPassword === newPassword) { message.textContent = '현재 비밀번호와 다른 새 비밀번호를 입력해주세요.'; return; }
      this.passwordBusy = true;
      form.setAttribute('aria-busy', 'true');
      form.querySelectorAll('input, button').forEach(el => el.disabled = true);
      let changed = false;
      try {
        await this.ready();
        const user = this.auth.currentUser;
        if (!user?.email) throw Error('다시 로그인한 후 변경해주세요.');
        const credential = this.f.EmailAuthProvider.credential(user.email, currentPassword);
        await this.f.reauthenticateWithCredential(user, credential);
        if (this.auth.currentUser?.uid !== user.uid) throw Error('로그인 상태가 변경되었어요. 다시 로그인해주세요.');
        await this.f.updatePassword(user, newPassword);
        changed = true;
      } catch (e) {
        const messages = {
          'auth/invalid-credential': '현재 비밀번호를 확인해주세요.',
          'auth/wrong-password': '현재 비밀번호를 확인해주세요.',
          'auth/weak-password': '더 안전한 새 비밀번호를 입력해주세요.',
          'auth/password-does-not-meet-requirements': '새 비밀번호가 보안 조건을 충족하지 않아요.',
          'auth/requires-recent-login': '다시 로그인한 후 변경해주세요.'
        };
        message.textContent = messages[e.code] || this.error(e);
      } finally {
        this.passwordBusy = false;
        form.removeAttribute('aria-busy');
        form.querySelectorAll('input, button').forEach(el => el.disabled = false);
      }
      if (changed) { this.closePasswordSettings(); App.toast('비밀번호가 변경되었어요.', 'success'); }
    },
    async logout() {
      this.managed = true; this.observedUid = null;
      try { await this.f.signOut(this.auth); this.clearData(); this.close(); document.querySelector('#landingView form').reset(); this.setLoginPasswordVisible(false); await App.showLanding(); }
      finally { this.managed = false; }
    },
    open(step = 0) {
      if (this.member || this.admin) { this.home(); return; }
      this.step = this.auth?.currentUser ? 2 : step;
      document.getElementById('signupView').hidden = false;
      document.getElementById('landingView').classList.add('hidden');
      this.renderStep();
    },
    close() { document.getElementById('signupView').hidden = true; document.getElementById('signupForm').reset(); },
    async backToLogin() {
      if (this.busy) return;
      if (this.auth?.currentUser && !this.member && !this.admin) await this.logout();
      else { this.close(); document.getElementById('landingView').classList.remove('hidden'); App.focusLoginInput(); }
    },
    renderStep(back = false) {
      const form = document.getElementById('signupForm');
      form.querySelectorAll('[data-step]').forEach(el => {
        el.hidden = Number(el.dataset.step) !== this.step;
        if (!el.hidden) { el.classList.remove('signup-forward','signup-back'); void el.offsetWidth; el.classList.add(back ? 'signup-back' : 'signup-forward'); }
        el.querySelectorAll('input').forEach(input => input.disabled = el.hidden);
      });
      document.getElementById('signupProgress').textContent = this.step === 3 ? 'WELCOME TO PACE' : `${this.step + 1} / 3`;
      document.getElementById('signupProgressBar').style.width = `${Math.min(100, (this.step + 1) / 3 * 100)}%`;
      document.getElementById('signupError').textContent = '';
      document.getElementById('signupBack').hidden = this.step !== 1 && !(this.step === 2 && !this.auth?.currentUser);
      document.querySelector(`[data-step="${this.step}"] h2`)?.focus();
    },
    previous() { if (!this.busy && this.step > 0) { this.step--; this.renderStep(true); } },
    async next(event) {
      event.preventDefault();
      if (this.busy) return;
      const form = document.getElementById('signupForm');
      const values = Object.fromEntries(new FormData(form));
      try {
        if (this.step === 0) { this.step = 1; this.renderStep(); return; }
        if (this.step === 1) { validateAccount(values); this.step = 2; this.renderStep(); return; }
        if (this.step === 3) { this.home(); return; }
        const code = normalizeCode(document.getElementById('inviteCode').value);
        if (!/^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6}$/.test(code)) throw Error('영문 대문자와 숫자가 섞인 6자리 코드를 입력해주세요.');
        this.busy = true; this.managed = true; form.setAttribute('aria-busy','true');
        document.getElementById('signupError').classList.add('signup-loading');
        form.querySelectorAll('button').forEach(button => button.disabled = true);
        document.getElementById('signupError').textContent = '가입을 완료하고 있어요…';
        await this.ready();
        if (!this.auth.currentUser) {
          const account = Object.fromEntries([...form.querySelectorAll('input[name]')].map(input => [input.name,input.value]));
          validateAccount(account);
          await this.f.setPersistence(this.auth, this.f.browserSessionPersistence);
          const result = await this.f.createUserWithEmailAndPassword(this.auth, this.email(account.loginId), account.password);
          await this.f.updateProfile(result.user, { displayName: account.name.trim() });
          form.querySelectorAll('input[name=password],input[name=confirmation]').forEach(input => input.value = '');
        }
        await this.redeem(code);
        await this.enter(false);
        document.getElementById('signupCompleteName').textContent = `${this.member.name}님,`;
        this.step = 3; this.renderStep();
      } catch (e) { document.getElementById('signupError').textContent = this.error(e); }
      finally { this.busy = false; this.managed = false; form.removeAttribute('aria-busy'); document.getElementById('signupError').classList.remove('signup-loading'); form.querySelectorAll('button').forEach(button => button.disabled = false); }
    },
    async redeem(code) {
      const user = this.auth.currentUser;
      const name = user.displayName || document.getElementById('signupName').value.trim();
      if (!name) throw Error('이름을 입력한 후 다시 시도해주세요.');
      const f = this.raw, uid = user.uid;
      // Numeric IDs preserve existing calendar and exam interfaces. The transaction checks collision.
      let id = 1000000000000 + Number.parseInt(uid.split('').reduce((h,c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0), 10);
      await f.runTransaction(this.db, async tx => {
        const memberRef = this.ref('members', uid), inviteRef = this.ref('invites', code);
        const member = await tx.get(memberRef);
        if (member.exists()) return;
        const invite = await tx.get(inviteRef);
        if (!invite.exists() || invite.data().status !== 'unused') throw Error('사용할 수 없는 초대 코드예요. 선생님에게 확인해주세요.');
        let studentRef = this.ref('students', id);
        while ((await tx.get(studentRef)).exists()) { id++; studentRef = this.ref('students', id); }
        const loginId = user.email.split('@')[0];
        tx.set(memberRef, { uid, name, loginId, studentId: id, inviteCode: code, createdAt: f.serverTimestamp() });
        tx.set(studentRef, { id, name, target: '', accessMode: 'FULL', accountUid: uid, newAccount: true });
        tx.update(inviteRef, { status: 'used', usedBy: uid, usedAt: f.serverTimestamp() });
      });
    },
    async issueCode() {
      if (this.issuing) return;
      this.issuing = true;
      try {
        if (!this.admin) throw Error('관리자만 발급할 수 있어요.');
        for (;;) {
          const code = generateCode();
          const made = await this.raw.runTransaction(this.db, async tx => {
            const ref = this.ref('invites', code);
            if ((await tx.get(ref)).exists()) return false;
            tx.set(ref, { code, status: 'unused', createdAt: this.raw.serverTimestamp(), createdBy: this.auth.currentUser.uid }); return true;
          });
          if (made) { await this.renderAdmin(); document.getElementById('latestInvite').textContent = `새 초대 코드: ${code}`; break; }
        }
      } catch (e) { App.toast(this.error(e), 'error'); }
      finally { this.issuing = false; }
    },
    async cancelCode(code) {
      try { await this.raw.runTransaction(this.db, async tx => {
        const ref = this.ref('invites', code), snap = await tx.get(ref);
        if (snap.data()?.status !== 'unused') throw Error('이미 사용되었거나 취소된 코드예요.');
        tx.update(ref, { status: 'cancelled' });
      }); await this.renderAdmin(); } catch (e) { App.toast(this.error(e), 'error'); }
    },
    async copyCode(code) {
      try { await navigator.clipboard.writeText(code); App.toast('초대 코드를 복사했어요.', 'success'); }
      catch { App.toast(`복사할 코드: ${code}`, 'info'); }
    },
    async renderAdmin() {
      const container = document.getElementById('paceAccountAdmin');
      if (!container || !this.admin) return;
      try {
        const [invites, members] = await Promise.all(['invites','members'].map(c => this.raw.getDocs(this.raw.collection(this.db,c))));
        this.members = members.docs.map(s => ({ ...s.data(), uid: s.id }));
        const esc = value => App.escapeHtml(String(value ?? ''));
        const codes = invites.docs.map(s => s.data()).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        container.innerHTML = `<div class="pace-account-heading"><div><span class="pace-kicker">INVITE TO PACE</span><h3>초대 코드 관리</h3></div><button class="signup-primary" onclick="PaceAuth.issueCode()">초대 코드 발급</button></div><p id="latestInvite" role="status">코드 하나로 한 명을 초대할 수 있어요.</p><div class="invite-list">${codes.map(c => `<div class="invite-row"><strong>${esc(c.code)}</strong><span>${({ unused:'미사용',used:'사용 완료',cancelled:'취소' })[c.status]}${c.usedBy ? ` · ${esc(this.members.find(m => m.uid === c.usedBy)?.name || '회원')}` : ''}</span><small>${c.createdAt?.toDate ? esc(c.createdAt.toDate().toLocaleDateString('ko-KR')) : ''}</small>${c.status === 'unused' ? `<button onclick="PaceAuth.copyCode('${esc(c.code)}')">복사</button><button onclick="PaceAuth.cancelCode('${esc(c.code)}')">취소</button>` : ''}</div>`).join('') || '<p>아직 발급한 코드가 없어요.</p>'}</div><h3>가입 회원 · 기존 학생 연결</h3>${this.members.map(m => `<div class="invite-row"><strong>${esc(m.name)}</strong><span>${esc(m.loginId)}</span><select aria-label="${esc(m.name)} 학생 연결" id="link_${esc(m.uid)}"><option value="">기존 학생 선택</option>${AppData.getStudents().filter(s => !s.accountUid && s.id !== m.studentId).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button onclick="PaceAuth.linkStudent('${esc(m.uid)}')">연결</button></div>`).join('') || '<p>아직 가입한 회원이 없어요.</p>'}`;
      } catch (e) { container.textContent = this.error(e); }
    },
    async linkStudent(uid) {
      const id = Number(document.getElementById(`link_${uid}`).value);
      if (!id) return;
      try {
        const f = this.raw, memberRef = this.ref('members',uid);
        const member = (await f.getDoc(memberRef)).data();
        if (!member) throw Error('회원을 찾을 수 없어요.');
        // Freeze this profile before checking all dependent records, preventing concurrent writes.
        await f.updateDoc(this.ref('students',member.studentId), { linking: true });
        try {
          for (const c of ['tests','vocabTestResults','textMemorizeResults']) {
            const records = await f.getDocs(f.query(f.collection(this.db,c),f.where('studentId','==',member.studentId),f.limit(1)));
            if (!records.empty) throw Error('새 프로필에 학습 기록이 있어요. 자동으로 합치지 않았습니다.');
          }
          const academic = await f.getDocs(f.query(f.collection(this.db,'academicRecords'),f.where('studentId','==',member.studentId)));
          if (academic.docs.some(s => { const items = s.data().items; return Array.isArray(items) ? items.length : Object.keys(items || {}).length; })) throw Error('새 프로필에 학업 기록이 있어 연결할 수 없어요.');
          await f.runTransaction(this.db, async tx => {
            const current = await tx.get(memberRef), oldRef = this.ref('students',member.studentId), old = await tx.get(oldRef);
            const targetRef = this.ref('students',id), target = await tx.get(targetRef);
            if (current.data()?.studentId !== member.studentId || !old.data()?.newAccount || !target.exists() || target.data().accountUid) throw Error('이미 연결되었거나 변경된 학생이에요.');
            tx.update(memberRef, { studentId:id, name:target.data().name });
            tx.update(targetRef, { accountUid:uid }); tx.delete(oldRef);
          });
        } finally { const old = await f.getDoc(this.ref('students',member.studentId)); if (old.exists()) await f.updateDoc(old.ref,{linking:false}); }
        await this.loadData(); await this.renderAdmin(); App.toast('기존 학습 기록을 연결했어요.', 'success');
      } catch (e) { App.toast(this.error(e), 'error'); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
