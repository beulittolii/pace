/* Account-scoped presentation preference. A first choice is saved before starting. */
(function (root) {
  const getMode = student => ['classic', 'motion'].includes(student?.examMode) ? student.examMode : null;
  if (typeof module !== 'undefined') module.exports = { getMode };
  if (!root.document) return;
  root.ExamPresentation = {
    getMode,
    choices(name, mode) {
      return [{ value: 'classic', title: '기존', description: '기존 화면과 응시 방식 그대로' }, { value: 'motion', title: '모션 디자인', description: '출력되는 종이 위에서 시험지처럼 응시' }].map(item => `<label class="exam-mode-choice"><input type="radio" name="${name}" value="${item.value}" ${mode === item.value ? 'checked' : ''}><span class="exam-mode-mini ${item.value}" aria-hidden="true"><span></span></span><strong>${item.title}</strong><small>${item.description}</small></label>`).join('');
    },
    sameIdentity(token) {
      const auth = root.PaceAuth;
      return auth?.auth?.currentUser?.uid === token.uid && auth.generation === token.generation && Number(auth.member?.studentId) === token.studentId;
    },
    async ensureMode(studentId) {
      const student = AppData.getStudentById(studentId), mode = getMode(student);
      if (mode) return mode;
      if (this.pending?.studentId === Number(studentId)) return this.pending.promise;
      this.cancelPending();
      const auth = root.PaceAuth;
      const token = { studentId: Number(studentId), uid: auth?.auth?.currentUser?.uid, generation: auth?.generation };
      if (!token.uid || !this.sameIdentity(token) || student?.accountUid !== token.uid || student.linking) throw Error('계정과 학생 프로필 연결을 확인해주세요.');
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      this.pending = { ...token, promise, resolve, opener: document.activeElement, saving: false };
      document.getElementById('examModeChoices').innerHTML = this.choices('initialExamMode', null);
      document.getElementById('examModeMessage').textContent = '';
      document.getElementById('examModeDialog').showModal();
      return promise;
    },
    async confirm() {
      const pending = this.pending;
      if (!pending || pending.saving) return;
      const mode = document.querySelector('[name="initialExamMode"]:checked')?.value;
      const message = document.getElementById('examModeMessage');
      if (!getMode({ examMode: mode })) { message.textContent = '시험 모드를 선택해주세요.'; return; }
      if (!this.sameIdentity(pending)) { this.cancelPending(); return; }
      pending.saving = true;
      const controls = [...document.getElementById('examModeDialog').querySelectorAll('input, button')];
      controls.forEach(control => { control.disabled = true; });
      try {
        await root.PaceAuth.persistExamMode(mode);
        if (this.pending !== pending) return;
        if (!this.sameIdentity(pending)) { this.cancelPending(); return; }
        this.pending = null;
        document.getElementById('examModeDialog').close();
        pending.opener?.focus(); pending.resolve(mode);
      } catch (error) {
        if (this.pending !== pending) return;
        if (!this.sameIdentity(pending)) { this.cancelPending(); return; }
        message.textContent = root.PaceAuth.error(error);
      }
      finally { pending.saving = false; controls.forEach(control => { control.disabled = false; }); }
    },
    cancelPending() {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      document.getElementById('examModeDialog').close();
      pending.resolve(null); pending.opener?.focus();
    },
    renderProfile() {
      const student = AppData.getStudentById(root.PaceAuth?.member?.studentId);
      document.getElementById('examModeSettingsOptions').innerHTML = this.choices('profileExamMode', getMode(student));
      document.getElementById('examModeSettingsMessage').textContent = '';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
