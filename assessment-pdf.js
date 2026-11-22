(function (root) {
  const limit = 5_242_880;
  let active;
  let ui;

  function bind() {
    if (ui) return ui;
    ui = Object.fromEntries(['Area', 'Status', 'Input', 'Choose', 'Drop', 'Open', 'Delete'].map(name =>
      [name.toLowerCase(), document.getElementById(`assessmentPdf${name}`)]));
    ui.choose.addEventListener('click', () => ui.input.click());
    ui.input.addEventListener('change', () => {
      const files = Array.from(ui.input.files || []);
      ui.input.value = '';
      if (files.length) void upload(files);
    });
    const fileDrag = event => Array.from(event.dataTransfer?.types || []).includes('Files');
    ui.drop.addEventListener('dragover', event => {
      if (!fileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = active?.busy ? 'none' : 'copy';
    });
    ui.drop.addEventListener('drop', event => {
      const files = Array.from(event.dataTransfer?.files || []);
      if (!files.length && !fileDrag(event)) return;
      event.preventDefault();
      if (!ui.drop.hidden) void upload(files);
    });
    ui.open.addEventListener('click', () => void openPdf());
    ui.delete.addEventListener('click', () => void remove());
    return ui;
  }

  function isCurrent(view) {
    const pace = root.PaceAuth;
    return active === view && pace.auth?.currentUser?.uid === view.user.uid && pace.generation === view.generation
      && !pace.admin && pace.member?.studentId === view.studentId;
  }

  function render(view, message) {
    if (!isCurrent(view)) return;
    ui.status.textContent = message;
    ui.choose.textContent = view.saved ? '교체' : 'PDF 첨부';
    ui.open.hidden = ui.delete.hidden = !view.saved;
    ui.drop.hidden = !view.desktop;
    ui.choose.disabled = ui.open.disabled = ui.delete.disabled = view.busy;
  }

  async function request(view, method, file) {
    const token = await view.user.getIdToken();
    if (!isCurrent(view)) throw Error('stale');
    const headers = { Authorization: `Bearer ${token}` };
    if (file) headers['Content-Type'] = 'application/pdf';
    return root.fetch(view.url, { method, body: file, headers, cache: 'no-store', signal: view.abort.signal });
  }

  async function action(view, progress, work, onError) {
    view.busy = true;
    render(view, progress);
    let message;
    try { message = await work(); }
    catch { onError?.(); message = 'PDF 첨부를 처리하지 못했어요. 잠시 후 다시 시도해주세요.'; }
    view.busy = false;
    render(view, message);
  }

  async function upload(files) {
    const view = active;
    if (!view || view.busy || !isCurrent(view)) return;
    if (files.length !== 1) return render(view, 'PDF는 1개만 첨부할 수 있어요.');
    const [file] = files;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) return render(view, 'PDF 파일만 첨부할 수 있어요.');
    if (file.size > limit || !file.size) return render(view, '내용이 있는 5MB 이하의 PDF만 첨부할 수 있어요.');
    if (view.saved === null) return render(view, '첨부 상태를 확인하지 못했어요. 수행평가 상세를 다시 열어주세요.');
    if (view.saved && !root.confirm('기존 PDF를 새 파일로 교체할까요?')) return;
    return action(view, 'PDF를 올리는 중이에요…', async () => {
      const response = await request(view, 'PUT', file);
      if (response.status === 413) return '5MB 이하의 PDF만 첨부할 수 있어요.';
      if (response.status === 415) return 'PDF 파일 형식을 확인해주세요.';
      if (!response.ok) throw Error('upload');
      view.saved = true;
      return 'PDF를 첨부했어요.';
    });
  }

  async function openPdf() {
    const view = active;
    if (!view?.saved || view.busy || !isCurrent(view)) return;
    const tab = root.open('about:blank', '_blank');
    if (!tab) return render(view, '파일을 열려면 이 사이트의 팝업을 허용해주세요.');
    tab.opener = null;
    tab.document.body.textContent = 'PDF를 여는 중이에요…';
    view.pendingTab = tab;
    return action(view, 'PDF를 여는 중이에요…', async () => {
      const response = await request(view, 'GET');
      if (response.status === 404) {
        tab.close(); view.pendingTab = null; view.saved = false;
        return '첨부 PDF가 없어요.';
      }
      if (!response.ok) throw Error('download');
      const blob = await response.blob();
      if (!isCurrent(view) || tab.closed) { tab.close(); view.pendingTab = null; return ''; }
      const objectUrl = URL.createObjectURL(blob);
      tab.location.href = objectUrl;
      view.pendingTab = null;
      setTimeout(() => URL.revokeObjectURL(objectUrl), 300_000);
      return '첨부 PDF 1개';
    }, () => { tab.close(); view.pendingTab = null; });
  }

  async function remove() {
    const view = active;
    if (!view?.saved || view.busy || !isCurrent(view) || !root.confirm('첨부한 PDF를 삭제할까요?')) return;
    return action(view, 'PDF를 삭제하는 중이에요…', async () => {
      const response = await request(view, 'DELETE');
      if (!response.ok) throw Error('delete');
      view.saved = false;
      return '첨부 PDF를 삭제했어요.';
    });
  }

  function clear() {
    active?.abort.abort();
    active?.pendingTab?.close();
    active = null;
    if (ui) { ui.area.hidden = true; ui.input.value = ''; }
  }

  async function mount({ assessmentId, studentId, isAdmin, calendarOnly }) {
    clear();
    const pace = root.PaceAuth;
    const user = pace?.auth?.currentUser;
    if (!user || isAdmin || calendarOnly || pace.admin || pace.member?.studentId !== studentId || !root.PACE_PDF_ENDPOINT) return;
    const url = new URL(root.PACE_PDF_ENDPOINT);
    url.searchParams.set('id', assessmentId);
    bind();
    ui.area.hidden = false;
    const view = active = { user, studentId, url, generation: pace.generation, abort: new AbortController(), saved: null,
      desktop: root.matchMedia('(hover: hover) and (pointer: fine)').matches };
    return action(view, '첨부 PDF를 확인하는 중이에요…', async () => {
      const response = await request(view, 'HEAD');
      if (!response.ok && response.status !== 404) throw Error('status');
      view.saved = response.ok;
      return view.saved ? '첨부 PDF 1개' : 'PDF 1개 · 최대 5MB';
    });
  }

  root.AssessmentPdf = { mount, clear };
})(window);
