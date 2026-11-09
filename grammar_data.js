/** 가정법 원문과 출제 데이터. 배정 시 복사하여 출제 당시 버전을 보존한다. */
const GRAMMAR_UNIT = {
  id: 'subjunctive', version: 1, title: '가정법', cutoff: 80,
  // {{정답}} 부분만 입력칸으로 바꾸며 나머지 원문은 그대로 표시한다.
  definition: '현재 또는 과거의 {{실제 사실}}과 {{정반대}}되는 일, 혹은 실현 가능성이 {{희박한}} 일을 머릿속으로 {{가정}}하거나 {{상상}}하여 표현하는 어법',
  sections: [
    { title: '① 가정법 과거', description: '{{현재}} 사실의 {{반대}} 혹은 실현 불가능한 상상',
      formula: 'If + S + {{과거동사}}(be동사는 {{were}}), S + {{would / could / might}} + {{동사원형}}',
      example: '예) If I {{had}} wings, I {{would fly}} to you.', translation: '지금 날개가 있다면 너에게 날아갈 텐데. → 사실 날개 없음' },
    { title: '② 가정법 과거완료', description: '{{과거}} 사실의 반대나 {{후회}}, 아쉬움 표현',
      formula: 'If + S + {{had p.p.}}, S + would / could / might + {{have p.p.}}',
      example: '예) If I {{had checked}} the schedule, I {{would not have missed}} the train.', translation: '그때 시간표를 확인했더라면 기차를 놓치지 않았을 텐데. → 확인 안 해서 놓침' },
    { title: '③ If 생략 및 도치 구문', description: '가정법 구문에서 {{if}} 생략 후 {{주어와 동사}} {{도치}}',
      example: '예) {{Were I}} you, I would accept the offer. (=If I {{were}} you, I would accept the offer.)', translation: '내가 너였다면, 그 제안을 받아들였을 텐데.' }
  ],
  expressions: [
    { group: 'I wish', formula: '+ {{과거동사}}', example: 'I wish I {{lived}} near the beach.' },
    { group: 'I wish', formula: '+ {{had p.p.}}', example: 'I wish I {{had studied}} harder for the test.' },
    { group: 'as if / as though', formula: '+ {{과거동사}}', example: 'He talks as if he {{knew}} everything.' },
    { group: 'as if / as though', formula: '+ {{had p.p.}}', example: 'She looked as if she {{had seen}} a ghost.' },
    { group: 'It is time', formula: '+ {{과거동사}}', example: 'It is time you {{went}} to bed.' }
  ],
  questions: [
    { id: 'g1', type: 'CHOICE', question: '다음 상황에 맞게 빈칸에 들어갈 말을 고르시오.', passage: 'I do not have enough money now. If I _____ enough money, I would buy this laptop.', choices: ['have', 'had', 'will have', 'have had', 'had had'], answer: 2, explanation: '현재 돈이 없다는 사실의 반대이므로 가정법 과거를 쓴다. if절에는 과거동사 had가 필요하다.' },
    { id: 'g2', type: 'CHOICE', question: '다음 상황을 가정법으로 바르게 표현한 문장을 고르시오.', passage: 'Jina cannot join the school band because she is too busy now.', choices: ['If Jina is not busy, she could join the band.', 'If Jina had not been busy, she could have joined the band.', 'If Jina were not busy, she can join the band.', 'If Jina were not busy, she could join the band.', 'If Jina will not be busy, she would join the band.'], answer: 4, explanation: '현재 바쁘기 때문에 참여하지 못한다는 사실의 반대이다. If + S + were ..., S + could + 동사원형 형태가 알맞다.' },
    { id: 'g3', type: 'CHOICE', question: '다음 상황을 고려할 때 빈칸에 들어갈 말로 가장 적절한 것은?', passage: 'Minho left his umbrella at home yesterday, so he got wet. If he had taken his umbrella, he _____ wet.', choices: ['would not get', 'will not get', 'would not have gotten', 'had not gotten', 'does not get'], answer: 3, explanation: '어제의 사실을 반대로 가정하므로 가정법 과거완료이다. 주절은 would not have p.p.가 된다.' },
    { id: 'g4', type: 'CHOICE', question: '과거의 사실에 대한 후회를 나타내도록 빈칸에 들어갈 말을 고르시오.', passage: 'We missed the beginning of the movie last night. If we _____ home earlier, we could have seen the whole movie.', choices: ['leave', 'left', 'have left', 'would leave', 'had left'], answer: 5, explanation: '지난밤 더 일찍 출발하지 않았다는 사실의 반대이다. if절에는 had left를 쓴다.' },
    { id: 'g5', type: 'CHOICE', question: '다음 문장에서 if를 생략한 문장으로 옳은 것은?', passage: 'If I were in your position, I would tell the truth.', choices: ['Were I in your position, I would tell the truth.', 'I were in your position, I would tell the truth.', 'Was I in your position, I would tell the truth.', 'Were in your position I, I would tell the truth.', 'Would I in your position, I tell the truth.'], answer: 1, explanation: 'if를 생략하면 were를 주어 앞으로 이동한다. Were I ...가 If I were ...와 같은 뜻이다.' },
    { id: 'g6', type: 'CHOICE', question: '두 문장의 뜻이 같아지도록 빈칸에 들어갈 말을 고르시오.', passage: 'If she had known about the meeting, she would have attended it.\n= _____ about the meeting, she would have attended it.', choices: ['Did she know', 'She had known', 'Were she known', 'Had she known', 'Would she know'], answer: 4, explanation: '가정법 과거완료에서 if를 생략하면 had가 주어 앞으로 이동한다. Had she known ...이 된다.' },
    { id: 'g7', type: 'CHOICE', question: '현재 상황에 대한 소망을 나타내는 문장을 완성하시오.', passage: 'I live far from school, so it takes an hour to get there. I wish I _____ closer to school.', choices: ['live', 'lived', 'will live', 'had lived', 'have lived'], answer: 2, explanation: '현재 학교에서 멀리 산다는 사실의 반대 소망이므로 I wish 뒤에 과거동사 lived를 쓴다.' },
    { id: 'g8', type: 'CHOICE', question: '어제 한 행동에 대한 후회를 바르게 표현한 것을 고르시오.', passage: 'I did not save my report before the computer crashed yesterday. I wish I _____ it.', choices: ['save', 'saved', 'had saved', 'will save', 'would save'], answer: 3, explanation: '과거에 저장하지 않은 일을 후회하므로 I wish + S + had p.p.를 쓴다.' },
    { id: 'g9', type: 'CHOICE', question: '괄호 안의 상황을 고려하여 (A), (B)에 들어갈 말을 바르게 짝지은 것은?', passage: 'Tom talks as if he (A) _____ the answer. (In fact, he does not know it.)\nYesterday, Amy looked as though she (B) _____ a ghost. (She had not actually seen one.)', choices: ['knows — saw', 'had known — sees', 'knows — had seen', 'knew — sees', 'knew — had seen'], answer: 5, explanation: '현재 안다는 듯 말하는 것은 as if + 과거동사 knew, 과거에 이미 유령을 본 듯 보였다는 것은 as though + had p.p.인 had seen을 쓴다.' },
    { id: 'g10', type: 'CHOICE', question: '다음 대화의 빈칸에 들어갈 말로 알맞은 것은?', passage: 'A: It is almost midnight, and you have school tomorrow.\nB: You are right. It is time I _____ to bed.', choices: ['went', 'go', 'will go', 'have gone', 'had gone'], answer: 1, explanation: 'It is time + 주어 + 과거동사는 이제 ~할 때라는 뜻이다. 현재 자야 할 때임을 나타내지만 went를 쓴다.' }
  ]
};

const GrammarLogic = {
  parts: ['concept', 'practice'],
  label(part) { return part === 'concept' ? '개념' : '실전'; },
  clone(value) { return JSON.parse(JSON.stringify(value)); },
  blanks(content) {
    const fields = [{ key: 'definition', text: content.definition }];
    content.sections.forEach((s, i) => ['description', 'formula', 'example'].forEach(k => {
      if (s[k]) fields.push({ key: `s${i}_${k}`, text: s[k] });
    }));
    content.expressions.forEach((s, i) => ['formula', 'example'].forEach(k => fields.push({ key: `e${i}_${k}`, text: s[k] })));
    return fields.flatMap(field => [...field.text.matchAll(/\{\{(.*?)\}\}/g)].map((match, i) => ({ id: `${field.key}_${i}`, answer: match[1], context: field.text.replace(/\{\{(.*?)\}\}/g, '$1') })));
  },
  missing(content, answers) { return this.blanks(content).filter(b => !String(answers[b.id] || '').trim()).length; },
  partState(test, part) {
    if (!test.grammarParts.includes(part)) return 'UNASSIGNED';
    const result = test.grammarResults?.[part];
    if (result?.waitingGrading) return 'PENDING';
    if (result) return result.passed ? 'PASS' : 'FAIL';
    if (test.grammarStartedAt && (part === 'concept' || test.grammarStage === 'practice')) return 'IN_PROGRESS';
    return 'SCHEDULED';
  },
  latest(tests, studentId, unitId) {
    const attempts = tests.filter(t => t.type === 'GRAMMAR' && Number(t.studentId) === Number(studentId) && t.grammarUnitId === unitId)
      .sort((a, b) => (a.grammarSequence || 0) - (b.grammarSequence || 0));
    return Object.fromEntries(this.parts.map(part => [part, attempts.filter(t => t.grammarParts.includes(part)).at(-1) || null]));
  },
  schedulePartState(test, part, tests) {
    const state = this.partState(test, part);
    if (state !== 'FAIL') return state;
    const rootId = test.grammarRootId || test.id;
    const chain = tests.filter(t => t.type === 'GRAMMAR'
      && (t.grammarRootId || t.id) === rootId
      && Number(t.studentId) === Number(test.studentId)
      && t.grammarUnitId === test.grammarUnitId);
    const latest = this.latest(chain, test.studentId, test.grammarUnitId)[part];
    return latest && (latest.grammarSequence || 0) > (test.grammarSequence || 0)
      && this.partState(latest, part) === 'PASS' ? 'PASS' : state;
  },
  eligible(tests, studentId, unitId) {
    const latest = this.latest(tests, studentId, unitId);
    return this.parts.filter(part => latest[part] && this.partState(latest[part], part) === 'FAIL');
  },
  gradePractice(content, answers) {
    const questions = content.questions;
    if (questions.length !== 10 || questions.some((q, i) => answers[i] != null && answers[i] !== '' && (!Number.isInteger(answers[i]) || answers[i] < 1 || answers[i] > 5))) throw new Error('10문제의 답안을 확인해주세요.');
    const correctCount = questions.filter((q, i) => answers[i] === q.answer).length;
    return { score: correctCount * 10, passed: correctCount >= 8, correctCount, totalCount: 10, cutoffScore: 80, answers: Object.fromEntries(questions.map((_, i) => [i, answers[i] || null])), completedAt: new Date().toISOString() };
  },
  exactConceptAnswer(value, answer) { return String(value || '').trim() === String(answer).trim(); },
  gradeConcept(content, answers, marks) {
    const blanks = this.blanks(content);
    if (blanks.some(b => String(answers[b.id] || '').trim() && !this.exactConceptAnswer(answers[b.id], b.answer) && typeof marks[b.id] !== 'boolean')) throw new Error('모든 빈칸의 정오를 판정해주세요.');
    const effectiveMarks = Object.fromEntries(blanks.map(b => [b.id, Boolean(String(answers[b.id] || '').trim()) && (this.exactConceptAnswer(answers[b.id], b.answer) || marks[b.id] === true)]));
    const correctCount = Object.values(effectiveMarks).filter(Boolean).length;
    const score = Math.round(correctCount / blanks.length * 100);
    return { answers: this.clone(answers), marks: effectiveMarks, score, correctCount, totalCount: blanks.length, passed: score >= 80, waitingGrading: false, cutoffScore: 80, gradedAt: new Date().toISOString() };
  }
};
