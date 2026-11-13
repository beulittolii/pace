/** 문법 학습·시험 공통 원문. {{정답}}만 시험에서 빈칸으로 바꾼다. */
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

const GRAMMAR_UNITS = {
  subjunctive: GRAMMAR_UNIT,
  'relative-pronouns': {
    id: 'relative-pronouns', version: 1, title: '관계대명사', cutoff: 80,
    studyPdf: '관계대명사_개념학습.pdf',
    definitionHeading: '#관계대명사', sectionsHeading: '#관계대명사의 핵심 개념', expressionsHeading: '⑧ 문장 적용 체크',
    definition: '두 문장을 연결하는 {{접속사}}와 명사를 대신하는 {{대명사}}의 역할을 함께 한다. 관계대명사가 이끄는 절은 앞의 명사인 {{선행사}}를 수식하며, 관계대명사는 그 절 안에서 {{주어}}, {{목적어}}, 소유를 나타내는 말의 역할을 한다.',
    sections: [
      { id: 'subject', title: '① 주격 관계대명사: who / which',
        description: '관계사절에서 {{주어}} 역할을 한다. 선행사가 사람이면 {{who}}, 사물·동물이면 {{which}}를 쓴다. 제한적 용법에서는 that도 가능하다.',
        formula: '선행사 + 주격 관계대명사 + {{동사}} ~ (관계대명사 뒤에 주어를 중복해서 쓰지 않는다.)',
        example: '예) I know a girl {{who}} speaks French. / This is a robot {{which}} cleans the floor.',
        translation: '나는 프랑스어를 하는 소녀를 안다. / 이것은 바닥을 청소하는 로봇이다.' },
      { id: 'object', title: '② 목적격 관계대명사와 생략',
        description: '관계사절에서 {{목적어}} 역할을 한다. 사람은 who / whom / that, 사물·동물은 which / that을 쓴다. 제한적 용법의 목적격은 {{생략}}할 수 있다. 단, 전치사 바로 뒤에서는 생략하지 않는다.',
        formula: '선행사 + (목적격 관계대명사) + {{주어}} + 동사 ~ / 주격·소유격 관계대명사만 단독으로 생략하는 것은 불가',
        example: '예) The book ({{which}}) you lent me was interesting.',
        translation: '네가 나에게 빌려준 책은 재미있었다. → you lent me 뒤에서 목적어 the book이 빠진 구조' },
      { id: 'possessive', title: '③ 소유격 관계대명사: whose',
        description: '관계사절에서 소유 관계를 나타내며, 선행사가 사람 또는 사물일 때 모두 {{whose}}를 쓸 수 있다. whose 바로 뒤에는 {{명사}}가 온다.',
        formula: '선행사 + {{whose + 명사}} + 나머지 말 ~',
        example: '예) I met a boy {{whose}} mother is a pilot.',
        translation: '나는 어머니가 조종사인 소년을 만났다. → whose mother = the boy’s mother' },
      { id: 'that', title: '④ 관계대명사 that과 사용 제한',
        description: 'that은 사람·사물의 주격·목적격에 쓴다. 선행사가 {{사람과 사물}}을 함께 가리킬 때, all / everything 등일 때, 최상급·서수의 수식을 받을 때 주로 that을 쓴다.',
        formula: '{{전치사 바로 뒤}}와 {{쉼표 뒤}}에는 관계대명사 that을 쓰지 않는다. that에는 소유격 형태가 없다.',
        example: '예) Look at the boy and the dog {{that}} are running together.',
        translation: '함께 달리고 있는 소년과 개를 봐라. → 사람과 동물을 함께 가리키는 선행사' },
      { id: 'preposition', title: '⑤ 전치사 + 관계대명사',
        description: '전치사 바로 뒤에는 사람이면 {{whom}}, 사물이면 {{which}}를 쓴다. 이때 관계대명사는 {{생략할 수 없다}}.',
        formula: '전치사 + whom / which + 주어 + 동사 ~ / 전치사를 절 끝에 두면 제한적 용법의 목적격 관계대명사는 생략 가능',
        example: '예) This is the house in {{which}} she lives. (= This is the house (which / that) she lives in.)',
        translation: '이것은 그녀가 사는 집이다. → in which는 가능하지만 in that은 불가' },
      { id: 'continuing', title: '⑥ 계속적 용법: 쉼표 뒤의 추가 설명',
        description: '선행사를 한정하는 제한적 용법과 달리, {{쉼표}} 뒤에서 선행사에 대한 정보를 덧붙인다. who / whom / which / whose를 쓰며, {{that}}은 쓰지 않고 관계대명사를 생략하지 않는다.',
        formula: '선행사 + , + 관계대명사 ~ / which는 앞 문장 {{전체}}를 받을 수도 있다.',
        example: '예) Mina missed the bus, {{which}} made her late.',
        translation: '미나는 버스를 놓쳤고, 그 일 때문에 늦었다. → which = 미나가 버스를 놓친 일 전체' },
      { id: 'what', title: '⑦ 선행사를 포함하는 관계대명사 what',
        description: 'what은 {{선행사}}를 포함하며, {{the thing(s) which / that}}의 뜻이다. 앞에 별도의 선행사를 쓰지 않고, what절은 문장에서 주어·목적어·보어 역할을 한다.',
        formula: 'what + 불완전한 절 (절 안에 {{주어 또는 목적어}}가 빠져 있다.) / 선행사 + what은 불가',
        example: '예) {{What}} he said was true. (= The thing that he said was true.)',
        translation: '그가 말한 것은 사실이었다. → what절 전체가 주어이며, he said의 목적어가 빠져 있다.' }
    ],
    expressions: [
      { group: '문장 합치기', formula: '두 문장에서 {{같은 명사}}를 찾아 뒤 문장의 역할에 맞는 관계대명사로 바꾼다.', example: 'I have a friend. He lives in Busan. → I have a friend {{who}} lives in Busan.' },
      { group: '중복 금지', formula: '관계대명사가 대신한 {{주어·목적어}}를 절 안에 다시 쓰지 않는다.', example: 'This is the book which I bought. (O) / This is the book which I bought {{it}}. (X)' },
      { group: '수 일치', formula: '주격 관계대명사 뒤 동사의 수는 {{선행사}}에 맞춘다.', example: 'a student who {{studies}} hard / students who {{study}} hard' }
    ],
    questions: [
      { id: 'rp1', sectionId: 'subject', type: 'CHOICE', question: '빈칸에 들어갈 말로 가장 적절한 것은?', passage: 'The woman _____ teaches us science is very kind.', choices: ['which', 'whose', 'who', 'whom', 'what'], answer: 3, explanation: '선행사 The woman은 사람이고 관계사절에서 teaches의 주어가 빠져 있으므로 주격 who가 알맞다. whom은 목적격, whose는 소유격이다.' },
      { id: 'rp2', sectionId: 'subject', type: 'CHOICE', question: '빈칸에 들어갈 말로 가장 적절한 것은?', passage: 'I bought a camera _____ takes clear pictures.', choices: ['which', 'who', 'whom', 'whose', 'what'], answer: 1, explanation: '선행사 a camera는 사물이고 takes의 주어가 필요하므로 주격 which를 쓴다. what 앞에는 별도의 선행사를 쓰지 않는다.' },
      { id: 'rp3', sectionId: 'object', type: 'CHOICE', question: '관계대명사를 생략한 문장 중 어법상 옳은 것은?', passage: '', choices: ['I know a boy lives next door.', 'The girl mother is a doctor is my friend.', 'This is the book I bought it yesterday.', 'The teacher to I spoke was kind.', 'The movie we watched yesterday was exciting.'], answer: 5, explanation: '⑤는 목적격 관계대명사 which / that을 생략한 문장이다. ①은 주격 who / that, ②는 소유격 whose, ④는 전치사 뒤 whom이 필요하여 단독 생략할 수 없다. ③은 목적어 it을 중복해서 썼다.' },
      { id: 'rp4', sectionId: 'possessive', type: 'CHOICE', question: '빈칸에 들어갈 말로 가장 적절한 것은?', passage: 'I have a friend _____ father works at this hospital.', choices: ['who', 'which', 'whom', 'whose', 'what'], answer: 4, explanation: '친구의 아버지라는 소유 관계를 나타내며 빈칸 뒤에 명사 father가 있으므로 whose가 알맞다. whose father는 the friend’s father를 대신한다.' },
      { id: 'rp5', sectionId: 'that', type: 'CHOICE', question: '사람과 사물을 함께 가리키는 선행사를 고려하여 빈칸에 가장 적절한 말을 고르시오.', passage: 'The people and the cars _____ filled the street made it hard to walk.', choices: ['who', 'that', 'whom', 'whose', 'what'], answer: 2, explanation: '선행사가 사람(the people)과 사물(the cars)을 함께 가리키므로 관계대명사 that을 쓴다. 관계사절에서 filled의 주어 역할을 한다.' },
      { id: 'rp6', sectionId: 'continuing', type: 'CHOICE', question: '앞 문장 전체를 받아 추가 설명하도록 빈칸에 들어갈 말을 고르시오.', passage: 'Jisu won first prize, _____ surprised everyone.', choices: ['that', 'what', 'whose', 'which', 'whom'], answer: 4, explanation: '쉼표 뒤의 which가 지수가 1등상을 받았다는 앞 문장 전체를 받아 추가 설명한다. 계속적 용법에는 that을 쓰지 않으며 관계대명사를 생략하지 않는다.' },
      { id: 'rp7', sectionId: 'preposition', type: 'CHOICE', question: '전치사 바로 뒤에 쓰일 말로 가장 적절한 것은?', passage: 'The scientist with _____ I worked won an award.', choices: ['whose', 'that', 'which', 'what', 'whom'], answer: 5, explanation: '선행사 The scientist는 사람이다. 전치사 with 바로 뒤에는 목적격 whom을 쓰며, that을 쓰거나 관계대명사를 생략할 수 없다.' },
      { id: 'rp8', sectionId: 'preposition', type: 'CHOICE', question: '두 문장의 뜻이 같아지도록 빈칸에 들어갈 말을 고르시오.', passage: 'This is the chair (which) I sat on.\n= This is the chair on _____ I sat.', choices: ['whom', 'which', 'that', 'whose', 'what'], answer: 2, explanation: '선행사 the chair는 사물이므로 전치사 on 바로 뒤에 which를 쓴다. 전치사가 절 끝에 있을 때는 목적격 관계대명사를 생략할 수 있지만, 전치사 바로 뒤에서는 생략할 수 없다.' },
      { id: 'rp9', sectionId: 'what', type: 'CHOICE', question: '‘그가 말한 것은 사실이었다.’라는 뜻이 되도록 빈칸에 들어갈 말을 고르시오.', passage: '_____ he said was true.', choices: ['Which', 'Who', 'What', 'Whose', 'Whom'], answer: 3, explanation: '별도의 선행사 없이 ‘~한 것’을 나타내므로 선행사를 포함하는 What을 쓴다. What he said 전체가 주어이며 he said에는 목적어가 빠져 있다. What = the thing which / that이다.' },
      { id: 'rp10', sectionId: 'checks', type: 'CHOICE', question: '(A), (B)에 들어갈 말을 바르게 짝지은 것은?', passage: 'The student who (A) _____ hard is my brother.\nThe students who (B) _____ hard are in the library.', choices: ['studies — study', 'study — studies', 'studies — studies', 'study — study', 'studying — studying'], answer: 1, explanation: '주격 관계대명사 뒤 동사의 수는 선행사에 맞춘다. (A)의 선행사 The student는 단수이므로 studies, (B)의 선행사 The students는 복수이므로 study가 알맞다.' }
    ]
  }
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
