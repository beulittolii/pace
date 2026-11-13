/* A separate presentation surface; classic exam DOM and grading remain unchanged. */
(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  root.ExamMotionPaper = {
    escape,
    header(kind, title, instructions) {
      return `<header class="motion-masthead"><p>${kind === 'grammar' ? '문법 테스트' : '복습 테스트'}</p><h1>${escape(title)}</h1></header><ul class="motion-instructions">${instructions.map(line => `<li>${escape(line)}</li>`).join('')}</ul>`;
    },
    open({ kind, title, content }) {
      this.close();
      this.kind = kind;
      this.root = document.getElementById('motionExamView');
      this.root.innerHTML = `<div class="motion-tools">${kind === 'weekly' ? '<button type="button" onclick="App.leaveWeeklyReview()">나가기</button>' : '<span></span>'}<p id="motionSubmissionStatus" role="status" aria-live="polite"></p></div><div class="motion-scroll"><article id="motionExamPaper" class="motion-paper" tabindex="-1" aria-label="${escape(title)} 시험지">${content}</article></div><div class="motion-printer" aria-hidden="true"><div class="motion-slot"></div><div class="motion-head"></div><div class="motion-printer-case"></div></div>`;
      this.paper = document.getElementById('motionExamPaper');
      this.root.classList.remove('hidden');
      this.overflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      this.background = [...document.body.children].filter(element => element !== this.root && !['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)).map(element => [element, element.inert]);
      this.background.forEach(([element]) => { element.inert = true; });
      this.print();
    },
    print() {
      const token = this.sequence;
      this.printing = true; this.paper.inert = true;
      this.root.classList.add('is-feeding');
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.finishPrint(); return; }
      const edge = innerHeight - 27;
      const distance = Math.max(0, edge - this.paper.getBoundingClientRect().top + 3);
      const blocks = [...this.paper.querySelectorAll('.motion-masthead,.motion-instructions,.grammar-definition,.grammar-section,.motion-question,.motion-submit')];
      const geometry = blocks.map(element => ({ element, top: element.getBoundingClientRect().top, height: element.getBoundingClientRect().height }));
      this.inkBlocks = blocks;
      blocks.forEach(element => { element.style.clipPath = 'inset(0 0 100% 0)'; });
      this.paper.style.transform = `translate3d(0,${distance}px,0)`;
      const start = performance.now();
      const feed = t => t < .12 ? 0 : t < .30 ? (t - .12) / .18 * .19 : t < .36 ? .19 : t < .66 ? .19 + (t - .36) / .30 * .51 : t < .71 ? .70 : t < .94 ? .70 + (t - .71) / .23 * .30 : 1;
      const draw = now => {
        if (this.sequence !== token || !this.paper) return;
        const t = Math.min(1, (now - start) / 2400), offset = distance * (1 - feed(t));
        this.paper.style.transform = `translate3d(0,${offset}px,0)`;
        geometry.forEach(({ element, top, height }) => { element.style.clipPath = `inset(0 0 ${Math.max(0, Math.min(height, height - (edge - top - offset)))}px 0)`; });
        if (t < 1) this.frame = requestAnimationFrame(draw); else this.finishPrint();
      };
      this.frame = requestAnimationFrame(draw);
    },
    finishPrint() {
      cancelAnimationFrame(this.frame);
      if (!this.paper) return;
      this.printing = false; this.paper.inert = false; this.paper.style.transform = '';
      this.inkBlocks?.forEach(element => { element.style.clipPath = ''; });
      this.root.classList.remove('is-feeding');
      this.paper.focus({ preventScroll: true });
    },
    replaceContent(content) {
      this.finishPrint();
      this.paper.innerHTML = content;
      this.root.querySelector('.motion-scroll').scrollTop = 0;
    },
    setBusy(busy, message = '') {
      if (!this.paper) return;
      this.paper.inert = busy || this.printing;
      document.getElementById('motionSubmissionStatus').textContent = message;
    },
    close() {
      this.sequence = (this.sequence || 0) + 1;
      if (this.frame != null) cancelAnimationFrame(this.frame);
      if (!this.root) return;
      this.inkBlocks?.forEach(element => { element.style.clipPath = ''; });
      this.paper.inert = false;
      this.root.classList.add('hidden'); this.root.classList.remove('is-feeding');
      document.body.style.overflow = this.overflow || '';
      this.background?.forEach(([element, inert]) => { element.inert = inert; });
      this.root.innerHTML = ''; this.root = null; this.paper = null; this.printing = false; this.background = null;
    },
    renderGrammar(session) {
      const content = this.grammarContent(session);
      if (this.root) this.replaceContent(content); else this.open({ kind: 'grammar', title: session.test.grammarContent.title, content });
      this.updateGrammarProgress(session);
    },
    options(name, items, answer, handler) {
      return `<div class="motion-options">${items.map((item, i) => `<label><input type="radio" name="${escape(name)}" value="${escape(item.value)}" ${String(answer ?? '') === String(item.value) ? 'checked' : ''} onchange="${escape(handler)}"><span class="motion-option-number" aria-hidden="true"><span>${['①', '②', '③', '④', '⑤'][i]}</span><b>${['❶', '❷', '❸', '❹', '❺'][i]}</b></span><span class="motion-option-text">${escape(item.text)}</span></label>`).join('')}</div>`;
    },
    grammarContent(session) {
      const concept = session.test.grammarStage === 'concept';
      const heading = this.header('grammar', session.test.grammarContent.title, concept ? ['학습한 개념을 떠올리며 빈칸을 채우세요.', '실전으로 넘어간 뒤에는 개념 답안을 수정할 수 없습니다.'] : ['각 문항에서 가장 알맞은 답 하나를 고르세요.', '모든 문항을 확인한 뒤 답안을 제출하세요.']);
      if (concept) {
        const body = GrammarPaper.render(session.test.grammarContent, (text, key) => App.renderGrammarText(text, key, session.answers.concept));
        return heading + `<div class="motion-concept-body"><article class="grammar-paper">${body}</article></div><div class="motion-submit"><span id="motionAnsweredCount" aria-live="polite"></span><button type="button" onclick="App.submitGrammarConcept()">${session.test.grammarParts.includes('practice') ? '실전으로 넘어가기' : '답안 제출'}</button></div>`;
      }
      const questions = session.test.grammarContent.questions;
      const question = (q, i) => `<fieldset class="motion-question" data-motion-question="${i}"><legend><span>${i + 1}.</span> ${escape(q.question)}</legend>${q.passage ? `<div class="motion-passage">${escape(q.passage)}</div>` : ''}${this.options(`motionGrammar${i}`, q.choices.map((text, n) => ({ text, value: n + 1 })), session.answers.practice[i], `App.updateGrammarChoice(${i}, this.value)`)}</fieldset>`;
      return heading + `<div class="motion-columns"><div>${questions.slice(0, 5).map((q, i) => question(q, i)).join('')}</div><div>${questions.slice(5).map((q, i) => question(q, i + 5)).join('')}</div></div><div class="motion-submit"><span id="motionAnsweredCount" aria-live="polite"></span><button type="button" onclick="App.submitGrammarPractice()">답안 제출</button></div>`;
    },
    updateGrammarProgress(session) {
      const counter = document.getElementById('motionAnsweredCount');
      if (!counter) return;
      const concept = session.test.grammarStage === 'concept';
      const total = concept ? GrammarLogic.blanks(session.test.grammarContent).length : session.test.grammarContent.questions.length;
      const answered = concept ? total - GrammarLogic.missing(session.test.grammarContent, session.answers.concept) : Object.values(session.answers.practice).filter(value => Number.isInteger(value) && value >= 1 && value <= 5).length;
      counter.textContent = `${answered} / ${total}${concept ? '빈칸 작성' : '문항 선택'}`;
    },
    weeklyContent(state) {
      const heading = this.header('weekly', '주간 단어 복습', ['객관식은 가장 알맞은 답 하나를 고르세요.', '스펠링은 뜻을 보고 영어 단어를 직접 쓰세요.', '모든 문항을 확인한 뒤 답안을 제출하세요.']);
      const question = (q, i) => {
        const action = `App.setWeeklyReviewAnswer(${JSON.stringify(q.id)}, this.value)`;
        return `<fieldset class="motion-question" data-motion-review="${escape(q.id)}"><legend><span>${i + 1}.</span> ${q.mode === 'CHOICE' ? '다음 단어의 뜻으로 가장 알맞은 것은?' : '다음 뜻에 알맞은 영어 단어를 쓰시오.'}</legend>${q.mode === 'CHOICE'
          ? `<div class="motion-passage">${escape(q.word.en)}</div>${this.options(`motionReview${q.id}`, q.choices.map(text => ({ text, value: text })), state.answers[q.id], action)}`
          : `<div class="motion-meaning"><small>뜻</small><strong id="motionPrompt_${escape(q.id)}">${escape(q.word.ko)}</strong></div><label class="motion-spelling"><span>답안</span><input type="text" aria-labelledby="motionPrompt_${escape(q.id)}" value="${escape(state.answers[q.id] || '')}" placeholder="영어 단어를 입력하세요" autocomplete="off" autocapitalize="off" spellcheck="false" oninput="${escape(action)}"></label>`}</fieldset>`;
      };
      const midpoint = Math.ceil(state.questions.length / 2);
      return heading + `<form data-review-paper onsubmit="event.preventDefault()"><div class="motion-columns"><div>${state.questions.slice(0, midpoint).map((q, i) => question(q, i)).join('')}</div><div>${state.questions.slice(midpoint).map((q, i) => question(q, i + midpoint)).join('')}</div></div><div class="motion-submit"><span id="weeklyReviewAnsweredCount" aria-live="polite">0 / ${state.questions.length}문항 작성</span><button type="button" id="weeklyReviewSubmit" onclick="App.submitWeeklyReview()">답안 제출</button></div></form>`;
    },
    renderWeekly(state) {
      const content = this.weeklyContent(state);
      if (this.root) this.replaceContent(content); else this.open({ kind: 'weekly', title: '주간 단어 복습', content });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
