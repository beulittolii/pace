/**
 * 영어과외 관리 웹사이트 - 기본 데이터 및 저장소 관리
 *
 * 현재 구조: 모든 앱 데이터는 Firebase Cloud Firestore에 저장됩니다.
 * 기존 localStorage 데이터는 Firestore 컬렉션이 비어 있는 첫 실행 때만
 * 안전하게 이전한 뒤 제거합니다.
 *
 * Firestore 구조
 * students/
 *   1
 *   2
 *   3
 *   4
 *   5
 *   6
 */

const LEGACY_STORAGE_KEYS = {
  tests: 'eng_tutoring_tests',
  vocabSets: 'eng_tutoring_vocab_sets',
  vocabTestResults: 'eng_tutoring_vocab_test_results'
};
const TEACHER_LOGIN_ID = 'admin';

// 10월 31일 이전 시험은 영구적으로 정리하며, 이 날짜부터의 일정만 유지합니다.
const TEST_RETENTION_START_DATE = '2026-11-01';

function shouldKeepTest(test) {
  return Boolean(test && typeof test.date === 'string' && test.date >= TEST_RETENTION_START_DATE);
}

function retainFutureTests(tests) {
  return (Array.isArray(tests) ? tests : []).filter(shouldKeepTest);
}


// ========================================================
// 등록 학생 기본 프로필 목록 (1~6번 및 11~14번)
// ========================================================

const DEFAULT_STUDENTS = [
  {
    id: 1,
    name: '김단하',
    target: '내신 2등급',
    loginId: 'student1',

  },
  {
    id: 2,
    name: '김성헌',
    target: '내신 1등급',
    loginId: 'student2',

  },
  {
    id: 3,
    name: '김영빈',
    target: '내신 1등급',
    loginId: 'student3',

  },
  {
    id: 4,
    name: '백승조',
    target: '내신 2등급',
    loginId: 'student4',

  },
  {
    id: 5,
    name: '이상록',
    target: '내신 2등급',
    loginId: 'student5',

  },
  {
    id: 6,
    name: '조용준',
    target: '내신 2등급',
    loginId: 'student6',

  },
  {
    id: 11,
    name: '송규인',
    target: '내신 영어 100점',
    loginId: 'gyuin',

  },
  {
    id: 12,
    name: '강민수',
    target: '내신 영어 1등급',
    loginId: 'kangminsu',

  },
  {
    id: 13,
    name: '이현민',
    target: '내신 영어 2등급',
    loginId: 'gusals',

  },
  {
    id: 14,
    name: '테스트',
    target: '',
    loginId: 'test',

  }
];


// ========================================================
// YBM(박준언) 공통영어 2 본문 1과 (1~4문단) 실전 내신 킬러 10문항
// ========================================================

const YBM2_L1_PRACTICE_QUESTIONS = [
  {
    id: 'ybm2_l1_q1',
    type: 'CHOICE',
    question: '다음 글의 밑줄 친 ①~⑤ 중, 어법상 틀린 것은?',
    passage: `While scrolling through her social media one day, Gina was astonished when she saw the news headline, “The Heundeulbawi in Seoraksan National Park Has Fallen.” Gina immediately shared the shocking story with her close friends. Later, during the morning news on TV, a reporter ①**standing** next to the undamaged Heundeulbawi said, “Today’s Internet stories of the Heundeulbawi ②**being damaged** were fake.” Gina was embarrassed by the fact ③**which** she had spread the fake news. It reminded her of another incident of fake news that ④**had happened** a while ago. The news that a famous athlete had died became the number one issue online, but it turned out ⑤**to be** fake.`,
    choices: [
      'standing',
      'being damaged',
      'which',
      'had happened',
      'to be'
    ],
    answer: 3,
    explanation: '③번의 which 뒤에는 완전한 절(she had spread the fake news)이 이어지므로 관계대명사 which가 올 수 없으며, 추상명사 the fact와 동격을 이루는 접속사 that으로 고쳐야 합니다.\n(①은 a reporter를 수식하는 능동 분사, ②는 전치사 of의 목적어로 쓰인 수동형 동명사, ④는 과거 특정 시점 이전의 일을 나타내는 과거완료, ⑤는 turn out to be 구문으로 모두 적절합니다.)'
  },
  {
    id: 'ybm2_l1_q2',
    type: 'CHOICE',
    question: '다음 글의 밑줄 친 ①~⑤ 중, 문맥상 낱말의 쓰임이 적절하지 않은 것은?',
    passage: `The news that a famous athlete had died became the number one issue online, but it turned out to be fake. It had been made by content creators who sought people’s attention. They produced ①**provocative** false stories to make money by raising the number of views of their posts. At that time, Gina criticized those who had made and spread fake news because it had hurt the athlete and ②**confused** people. This time, however, Gina herself had ③**accidentally** contributed to the spread of fake news. Unfortunately, becoming an accidental distributor of fake news like Gina is not unusual. Fake news is a ④**deliberate** attempt to manipulate people by spreading ⑤**accurate** information.`,
    choices: [
      'provocative',
      'confused',
      'accidentally',
      'deliberate',
      'accurate'
    ],
    answer: 5,
    explanation: '가짜 뉴스는 사람들을 조종하기 위해 "부정확한 정보(inaccurate information)"를 퍼뜨리는 의도적인 시도이므로, ⑤의 accurate(정확한)는 문맥상 어색하며 inaccurate(부정확한) 또는 false로 고쳐야 합니다.\n(① provocative: 자극적인, ② confused: 혼란스럽게 한, ③ accidentally: 우발적으로, ④ deliberate: 의도적인)'
  },
  {
    id: 'ybm2_l1_q3',
    type: 'CHOICE',
    question: '다음 글의 빈칸에 들어갈 말로 가장 적절한 것은?',
    passage: `It is made by certain groups with the intention of attracting people’s attention, making profits, or gaining political benefits. It can confuse people, disturb society, and even seriously harm the public as well as all individuals involved. It is very common for fake news to spread __________________________________________________. For example, after an earthquake measuring 6.5 struck Ambon, Indonesia, in September 2019, thousands of residents did not return to their homes and were still in shelters for two weeks. This was because of fake news stories on social media that another earthquake followed by a tsunami was about to strike.`,
    choices: [
      'through official government press releases',
      'during states of emergency',
      'only among people who dislike social media',
      'when scientific facts are proven without doubt',
      'after the public has thoroughly verified the sources'
    ],
    answer: 2,
    explanation: '빈칸 뒤에 이어지는 인도네시아 암본 지진 발생 후 주민들이 대피소에 머물며 쓰나미 가짜 뉴스가 급속도로 퍼진 사례를 볼 때, 가짜 뉴스는 "비상사태 동안(during states of emergency)"에 퍼지는 것이 매우 흔하다는 내용이 가장 적절합니다.'
  },
  {
    id: 'ybm2_l1_q4',
    type: 'CHOICE',
    question: '위 글의 내용과 일치하지 않는 것은? (According to the passage, which of the following is NOT true?)',
    passage: `While scrolling through her social media one day, Gina was astonished when she saw the news headline, “The Heundeulbawi in Seoraksan National Park Has Fallen.” Gina immediately shared the shocking story with her close friends. Later, during the morning news on TV, a reporter standing next to the undamaged Heundeulbawi said, “Today’s Internet stories of the Heundeulbawi being damaged were fake.” Gina was embarrassed by the fact that she had spread the fake news. It reminded her of another incident of fake news that had happened a while ago. The news that a famous athlete had died became the number one issue online, but it turned out to be fake. It had been made by content creators who sought people’s attention. They produced provocative false stories to make money by raising the number of views of their posts. At that time, Gina criticized those who had made and spread fake news because it had hurt the athlete and confused people. This time, however, Gina herself had accidentally contributed to the spread of fake news.`,
    choices: [
      'Gina first learned about the falling of Heundeulbawi through a morning news broadcast on television.',
      'The television reporter confirmed that Heundeulbawi was completely undamaged.',
      'Content creators had created false rumors about a famous athlete’s death for financial gain through views.',
      'In the past, Gina condemned people who produced and circulated fake news.',
      'Gina felt embarrassed because she unintentionally participated in distributing misinformation.'
    ],
    answer: 1,
    explanation: '지나는 흔들바위가 떨어졌다는 소식을 TV 아침 뉴스가 아니라 소셜 미디어를 스크롤하다가 뉴스 헤드라인으로 처음 보았고(While scrolling through her social media one day, Gina was astonished when she saw the news headline...), 이후 TV 아침 뉴스에서는 해당 기사가 가짜였음을 기자가 전했습니다. 따라서 ①번은 본문 내용과 일치하지 않습니다.'
  },
  {
    id: 'ybm2_l1_q5',
    type: 'CHOICE',
    question: '위 글의 밑줄 친 [A]~[D]의 It에 대한 설명으로 가장 적절하지 않은 것은?',
    passage: `Unfortunately, becoming an accidental distributor of fake news like Gina is not unusual. Fake news is a deliberate attempt to manipulate people by spreading inaccurate information. **[A] It** is made by certain groups with the intention of attracting people’s attention, making profits, or gaining political benefits. **[B] It** can confuse people, disturb society, and even seriously harm the public as well as all individuals involved. **[C] It** is very common for fake news to spread during states of emergency. For example, after an earthquake measuring 6.5 struck Ambon, Indonesia, in September 2019, thousands of residents did not return to their homes and were still in shelters for two weeks. This was because of fake news stories on social media that another earthquake followed by a tsunami was about to strike. One of those messages said, “**[D] It**’s up to you if you want to believe me or not, but apparently Ambon is going to sink in the next few days.” Many displaced people were so anxious about aftershocks that the government had to announce that the information was fake.`,
    choices: [
      '[A]의 It은 앞 문장의 \'Fake news\'를 가리킨다.',
      '[B]의 It은 사람들을 혼란스럽게 하고 사회를 어지럽히는 \'Fake news\'를 가리킨다.',
      '[C]의 It은 형식상의 주어(가주어)이며, 진주어는 뒤에 나오는 to부정사구(to spread during states of emergency)이다.',
      '[D]의 It은 인도네시아 암본에서 발생한 \'규모 6.5의 지진\'을 직접 가리킨다.',
      '[D]의 It은 관용 표현 "It’s up to ~" (~는 당신에게 달려있다)에서 비인칭/상황을 나타내는 it이다.'
    ],
    answer: 4,
    explanation: '[D]의 "It’s up to you if you want to believe me or not"에서 \'It\'s up to ~\'는 \'~에게 달려 있다\'는 관용 표현으로, 믿고 안 믿고는 상대방의 선택에 달려있다는 의미입니다. 따라서 암본에서 발생한 6.5 지진을 가리킨다는 ④번의 설명은 옳지 않습니다.'
  },
  {
    id: 'ybm2_l1_q6',
    type: 'CHOICE',
    question: '주어진 글 다음에 이어질 글의 순서로 가장 적절한 것은?',
    passage: `While scrolling through her social media one day, Gina was astonished when she saw the news headline, “The Heundeulbawi in Seoraksan National Park Has Fallen.” Gina immediately shared the shocking story with her close friends.

<보기>
(A) It had been made by content creators who sought people’s attention. They produced provocative false stories to make money by raising the number of views of their posts.
(B) Later, during the morning news on TV, a reporter standing next to the undamaged Heundeulbawi said, “Today’s Internet stories of the Heundeulbawi being damaged were fake.” Gina was embarrassed by the fact that she had spread the fake news.
(C) This reminded her of another incident of fake news that had happened a while ago. The news that a famous athlete had died became the number one issue online, but it turned out to be fake. At that time, Gina had criticized those creators, but this time she herself had accidentally contributed to spreading false stories.`,
    choices: [
      '(A) - (C) - (B)',
      '(B) - (A) - (C)',
      '(B) - (C) - (A)',
      '(C) - (A) - (B)',
      '(C) - (B) - (A)'
    ],
    answer: 3,
    explanation: '주어진 글(지나가 흔들바위 헤드라인을 보고 친구들에게 공유함) 뒤에는 (B) TV 아침 뉴스에서 가짜 뉴스임을 알게 되고 당황했다는 내용이 와야 합니다. 그 다음 (C) 이것이 과거 유명 운동선수의 사망 가짜 뉴스 사건을 떠올리게 했다(It reminded her of another incident...)는 내용이 이어지며, 마지막으로 (A) 그 사건의 가짜 뉴스를 만든 배후(content creators who sought people\'s attention)에 대한 구체적 설명이 이어지는 것이 자연스럽습니다. 따라서 올바른 순서는 (B) - (C) - (A)입니다.'
  },
  {
    id: 'ybm2_l1_q7',
    type: 'CHOICE',
    question: '다음 글의 (A), (B), (C)의 각 네모 안에서 어법에 맞는 표현으로 가장 적절한 것은?',
    passage: `It is very common (A)[for / of] fake news to spread during states of emergency. For example, after an earthquake measuring 6.5 struck Ambon, Indonesia, in September 2019, thousands of residents did not return to their homes and were still in shelters for two weeks. This was because of fake news stories on social media (B)[that / what] another earthquake followed by a tsunami was about to strike. One of those messages said, “It’s up to you if you want to believe me or not, but apparently Ambon is going to sink in the next few days.” Many (C)[displacing / displaced] people were so anxious about aftershocks that the government had to announce that the information was fake.`,
    choices: [
      '(A) for  — (B) that — (C) displaced',
      '(A) for  — (B) what — (C) displacing',
      '(A) for  — (B) that — (C) displacing',
      '(A) of   — (B) what — (C) displaced',
      '(A) of   — (B) that — (C) displacing'
    ],
    answer: 1,
    explanation: '(A): to부정사(to spread)의 의미상 주어로 일반적인 사물/개념을 나타낼 때는 [for + 목적격]을 취하므로 for가 적절합니다.\n(B): 뒤에 완전한 절(another earthquake followed by a tsunami was about to strike)이 이어지므로 동격의 접속사 that이 올바릅니다.\n(C): 재난으로 인해 \'집을 잃고 난민이 된\' 사람들은 수동의 의미를 지니므로 과거분사 displaced가 people을 수식해야 합니다.'
  },
  {
    id: 'ybm2_l1_q8',
    type: 'SHORT',
    question: `다음 영영풀이에 해당하는 단어를 윗글에서 찾아 원형(한 단어의 영어)으로 쓰시오.

<영영풀이>
"done consciously and intentionally; on purpose rather than by accident"`,
    passage: `Unfortunately, becoming an accidental distributor of fake news like Gina is not unusual. Fake news is a deliberate attempt to manipulate people by spreading inaccurate information. It is made by certain groups with the intention of attracting people’s attention, making profits, or gaining political benefits. It can confuse people, disturb society, and even seriously harm the public as well as all individuals involved.`,
    choices: [],
    answer: 'deliberate',
    acceptableAnswers: ['deliberate', 'Deliberate'],
    explanation: '영영 풀이는 \'의도적인, 계획적인\'을 뜻하며, 윗글의 "Fake news is a deliberate attempt to manipulate people..."에서 이에 해당하는 단어는 deliberate입니다.'
  },
  {
    id: 'ybm2_l1_q9',
    type: 'ESSAY',
    question: `윗글의 빈칸 (A)에 들어갈 말을 <우리말> 뜻에 맞도록, <보기>의 단어들을 모두 활용하고 <조건>에 맞게 완전한 영어 문장으로 영작하시오.

<우리말>
"많은 이재민들이 여진에 대해 너무 불안해해서 정부는 그 정보가 가짜라고 발표해야만 했다."

<보기>
many / displace / people / were / so / anxious / about / aftershocks / that / the / government / had / to / announce / the / information / was / fake

<조건>
1. '너무 ~해서 ...하다'를 나타내는 「so + 형용사 + that절」 구문을 반드시 활용할 것.
2. <보기>의 단어 중 1단어(displace)의 어형을 문맥에 맞게 변형할 것.
3. <보기>에 주어진 18단어를 모두 활용하되, 필요한 단어 1단어(접속사)를 직접 추가하여 총 19단어의 완전한 문장으로 작성할 것 (대소문자 및 구두점 유의).`,
    passage: `It is very common for fake news to spread during states of emergency. For example, after an earthquake measuring 6.5 struck Ambon, Indonesia, in September 2019, thousands of residents did not return to their homes and were still in shelters for two weeks. This was because of fake news stories on social media that another earthquake followed by a tsunami was about to strike. One of those messages said, “It’s up to you if you want to believe me or not, but apparently Ambon is going to sink in the next few days.”\n[ (A) ____________________________________________________________________ ]`,
    choices: [],
    answer: 'Many displaced people were so anxious about aftershocks that the government had to announce that the information was fake.',
    acceptableAnswers: [
      'Many displaced people were so anxious about aftershocks that the government had to announce that the information was fake.',
      'Many displaced people were so anxious about aftershocks that the government had to announce that the information was fake'
    ],
    keywords: ['Many displaced people', 'so anxious about aftershocks that', 'the government had to announce that', 'the information was fake'],
    explanation: '「so + 형용사 + that + 주어 + 동사」 결과 구문과 과거분사 displaced의 명사 수식, 그리고 announce 뒤에 이끄는 목적어절 접속사 that(1단어 추가)을 결합한 실전 내신 서술형 문제입니다.\n- displace → displaced (어형 변화: 재난으로 인해 거처를 잃은 이재민들)\n- 접속사 that 1단어 추가 (so ~ that 결과절 외에 announce that 명사절에 필요한 접속사 that 직접 추가)\n- 완성 문장: Many displaced people were so anxious about aftershocks that the government had to announce that the information was fake. (총 19단어)'
  },
  {
    id: 'ybm2_l1_q10',
    type: 'ESSAY',
    question: `윗글의 빈칸 (A)에 들어갈 말을 <우리말> 뜻에 맞도록, <보기>의 단어들을 활용하여 <조건>에 맞게 완전한 영어 문장으로 영작하시오.

<우리말>
"지나는 자신이 가짜 뉴스를 퍼뜨렸었다는 사실에 당황했다."

<보기>
Gina / be / embarrass / by / the / fact / she / had / spread / the / fake / news

<조건>
1. 감정을 나타내는 분사 표현(수동태)과 「the fact that + 완전한 절」(동격의 that) 구조를 사용할 것.
2. 당황한 시점(과거)보다 가짜 뉴스를 퍼뜨린 시점이 더 앞선 과거임을 나타내는 시제(과거완료 had p.p.)를 반드시 적용할 것.
3. <보기>의 단어 중 필요한 단어는 어형을 변화시키고, 필요한 단어 1단어(접속사)를 직접 추가하여 총 13단어의 완전한 문장으로 작성할 것.`,
    passage: `While scrolling through her social media one day, Gina was astonished when she saw the news headline, “The Heundeulbawi in Seoraksan National Park Has Fallen.” Gina immediately shared the shocking story with her close friends. Later, during the morning news on TV, a reporter standing next to the undamaged Heundeulbawi said, “Today’s Internet stories of the Heundeulbawi being damaged were fake.”\n[ (A) ____________________________________________________________________ ]`,
    choices: [],
    answer: 'Gina was embarrassed by the fact that she had spread the fake news.',
    acceptableAnswers: [
      'Gina was embarrassed by the fact that she had spread the fake news.',
      'Gina was embarrassed by the fact that she had spread the fake news'
    ],
    keywords: ['Gina was embarrassed', 'by the fact that', 'had spread the fake news'],
    explanation: '1) Gina가 당황함을 느낀 수동태 표현: be + embarrass → was embarrassed\n2) \'~라는 사실에\': by the fact that (동격 접속사 that 1단어 추가)\n3) 당황한 과거 시점(was) 이전에 이미 가짜 뉴스를 퍼뜨렸으므로 대과거/과거완료(had p.p.): had spread\n따라서 완성 문장은 "Gina was embarrassed by the fact that she had spread the fake news." (총 13단어)입니다.'
  }
];


// ========================================================
// 기본 샘플 시험 데이터 생성
// ========================================================

function generateDefaultTests() {
  const today = new Date();

  // 날짜 헬퍼: YYYY-MM-DD
  const getDateStr = (dayOffset) => {
    const d = new Date(today);
    d.setDate(today.getDate() + dayOffset);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  };

  const allTests = [

    // ======================================================
    // 학생 1: 김단하
    // ======================================================

    {
      id: 'test_1_1',
      studentId: 1,
      title: '수능특강 영단어 Day 1-5 누적 테스트',
      date: getDateStr(-5),
      time: '18:00',
      scope: 'Day 1~5 표제어 150개 및 파생어 (총 40문항)',
      cutoff: '90점 이상 (36/40)',
      score: '95점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '어휘 암기 상태 매우 우수함. 파생어 형태 변화 문제도 완벽하게 풀어냄! 👏'
    },

    {
      id: 'test_1_2',
      studentId: 1,
      title: '천일문 핵심 구문독해 (관계사/분사구문)',
      date: getDateStr(-2),
      time: '19:00',
      scope: 'Unit 12~15 관계사절 수식 구조 직독직해 15문장 서술형',
      cutoff: '85점 이상',
      score: '78점',
      status: 'FAIL',
      retestStatus: 'RETEST_PENDING',
      retestDate: getDateStr(2),
      teacherNote: '복합관계대명사와 전치사+관계대명사 해석에서 감점 발생. 재시험 전 개념 요약노트 복습 필수!'
    },

    {
      id: 'practice_20260904_student_1',
      studentId: 1,
      title: '9/4(금) 문제풀이 테스트',
      date: '2026-09-04',
      time: '13:10',
      endTime: '13:30',
      scope: 'YBM(박준언) 공통영어 2 - Lesson 1 (1~4문단) 실전 내신 킬러 문제풀이 (총 10문항)',
      cutoff: '80점 이상',
      cutoffScore: 80,
      practiceCutoff: 80,
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: 'YBM(박준언) 공통영어 2 본문 1과 1~4문단 실전 내신 대비 테스트입니다. 어법, 어휘, 빈칸, 내용일치, 순서배열, 영영풀이 단답형 및 조건부 영작 서술형 2문항이 포함되어 있습니다. 제한시간(13:10~13:30) 내에 집중하여 풀어보세요!',
      type: 'PRACTICE',
      questions: YBM2_L1_PRACTICE_QUESTIONS,
      practiceResult: null,
      allowLate: false
    },


    // ======================================================
    // 학생 2: 김성헌
    // ======================================================

    {
      id: 'test_2_1',
      studentId: 2,
      title: '능률 하이퍼 보카 Day 10-15',
      date: getDateStr(-6),
      time: '17:00',
      scope: 'Day 10~15 중요 다의어 및 예문 빈칸 (총 50문항)',
      cutoff: '90점 이상',
      score: '92점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '성실하게 암기함. 다의어 문맥별 의미 파악 우수.'
    },

    {
      id: 'test_2_2',
      studentId: 2,
      title: '고1 2학기 중간고사 교과서 5과 본문 통암기',
      date: getDateStr(-1),
      time: '17:30',
      scope: '영어(능률김) 5과 본문 전체 영작 및 어법상 틀린 곳 고치기',
      cutoff: '95점 이상',
      score: '98점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '서술형 조건 영작까지 완벽하게 소화했습니다. 지금 페이스 유지하세요!'
    },

    {
      id: 'test_2_3',
      studentId: 2,
      title: '어법 끝 Start 챕터 4 (수일치 & 능동/수동)',
      date: getDateStr(3),
      time: '17:00',
      scope: '주어-동사 수일치 특수구문 및 4/5형식 수동태 실전 25제',
      cutoff: '85점 이상',
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '도치구문 수일치와 사역/지각동사 수동태 주의해서 준비해오기!'
    },


    // ======================================================
    // 학생 3: 김영빈
    // ======================================================

    {
      id: 'test_3_1',
      studentId: 3,
      title: '중3 내신 2학기 핵심 문법 (가정법 과거/과거완료)',
      date: getDateStr(-7),
      time: '16:00',
      scope: 'If 가정법 공식 적용 및 I wish / as if 가정법 전환 20문제',
      cutoff: '85점 이상',
      score: '88점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '시제 일치 개념을 잘 잡았습니다. 혼합가정법 예외만 한 번 더 체크!'
    },

    {
      id: 'test_3_2',
      studentId: 3,
      title: '워드마스터 중등 고난도 Day 21-25',
      date: getDateStr(-3),
      time: '16:30',
      scope: 'Day 21~25 표제어 120개 (스펠링 20 + 뜻 30)',
      cutoff: '90점 이상',
      score: '74점',
      status: 'FAIL',
      retestStatus: 'RETEST_PASS',
      retestDate: getDateStr(-1),
      teacherNote: '1차에서는 스펠링 실수가 많았으나, 재시험에서 96점으로 성실히 만회하여 통과!'
    },

    {
      id: 'test_3_3',
      studentId: 3,
      title: '천일문 기본편 Unit 31-35 구문 테스트',
      date: getDateStr(5),
      time: '16:00',
      scope: 'to부정사와 동명사의 의미상 주어 및 시제/수동 구문',
      cutoff: '80점 이상',
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '동명사의 의미상 주어(목적격/소유격) 표기법 유의하여 복습해올 것.'
    },


    // ======================================================
    // 학생 4: 백승조
    // ======================================================

    {
      id: 'test_4_1',
      studentId: 4,
      title: 'EBS 수능특강 라이트 영어독해 7-8강',
      date: getDateStr(-4),
      time: '19:30',
      scope: '7~8강 전 지문 변형문제 (어법, 순서배열, 문장삽입 12문항)',
      cutoff: '85점 이상',
      score: '91점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '글의 흐름과 논리적 단서(지시사, 대명사)를 잘 파악하고 있음.'
    },


    // ======================================================
    // 학생 5: 이상록
    // ======================================================

    {
      id: 'test_5_1',
      studentId: 5,
      title: '수능완성 영어 실전모의고사 1회',
      date: getDateStr(-8),
      time: '20:00',
      scope: '실전 70분 타임어택 모의고사 1회 전 문항',
      cutoff: '90점 이상 (1등급 컷)',
      score: '94점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '시간 관리 훌륭함! 오답 2문항(순서, 어법) 1:1 심층 피드백 완료.'
    },

    {
      id: 'test_5_2',
      studentId: 5,
      title: 'EBS 파이널 고난도 킬러 어법 50선',
      date: getDateStr(-2),
      time: '20:00',
      scope: '수능 29번 어법 유형 최근 10개년 기출 킬러 포인트',
      cutoff: '85점 이상',
      score: '80점',
      status: 'FAIL',
      retestStatus: 'RETEST_PENDING',
      retestDate: getDateStr(3),
      teacherNote: '대동사(do/be)와 형용사/부사 구별 문제 헷갈리지 않게 재시험 대비 철저히 하기!'
    },

    {
      id: 'test_5_3',
      studentId: 5,
      title: '수능완성 2회 및 6/9평 연계 지문 총정리',
      date: getDateStr(6),
      time: '20:00',
      scope: '주제/제목 및 장문독해 세트',
      cutoff: '90점 이상',
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '실전 수능과 동일한 환경으로 OMR 마킹 포함 시험 진행.'
    },


    // ======================================================
    // 학생 6: 조용준
    // ======================================================

    {
      id: 'test_6_1',
      studentId: 6,
      title: '중2 필수 기초영단어 500 (1차)',
      date: getDateStr(-6),
      time: '15:00',
      scope: '교과서 단어 Day 1-3 (총 60단어)',
      cutoff: '85점 이상 (51/60)',
      score: '87점',
      status: 'PASS',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '기초 단어를 성실히 외워왔습니다. 칭찬 스티커 2장 지급!'
    },

    {
      id: 'test_6_2',
      studentId: 6,
      title: '중학 영문법 3800제 (조동사 can, must, should)',
      date: getDateStr(2),
      time: '15:00',
      scope: '조동사의 부정문/의문문 만들기 및 관용표현 20문항',
      cutoff: '80점 이상',
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '조동사 뒤 동사원형 오는 규칙 잊지 말고 숙제 오답 정리해오기.'
    },

    // ======================================================
    // 학생 11: 송규인 (워드마스터 수능 2000 Day 12~40 일일 단어테스트)
    // ======================================================

    {
      id: 'vocab_wm2000_d12_13_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 12~13',
      date: '2026-10-22',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 12, Day 13 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_12',
      vocabSetIds: ['wm2000_day_12', 'wm2000_day_13'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d14_15_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 14~15',
      date: '2026-10-23',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 14, Day 15 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_14',
      vocabSetIds: ['wm2000_day_14', 'wm2000_day_15'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d16_17_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 16~17',
      date: '2026-10-24',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 16, Day 17 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_16',
      vocabSetIds: ['wm2000_day_16', 'wm2000_day_17'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d18_19_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 18~19',
      date: '2026-10-26',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 18, Day 19 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_18',
      vocabSetIds: ['wm2000_day_18', 'wm2000_day_19'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d20_21_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 20~21',
      date: '2026-10-27',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 20, Day 21 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_20',
      vocabSetIds: ['wm2000_day_20', 'wm2000_day_21'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d22_23_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 22~23',
      date: '2026-10-28',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 22, Day 23 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_22',
      vocabSetIds: ['wm2000_day_22', 'wm2000_day_23'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d24_25_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 24~25',
      date: '2026-10-29',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 24, Day 25 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_24',
      vocabSetIds: ['wm2000_day_24', 'wm2000_day_25'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d26_27_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 26~27',
      date: '2026-10-30',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 26, Day 27 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_26',
      vocabSetIds: ['wm2000_day_26', 'wm2000_day_27'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d28_29_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 28~29',
      date: '2026-10-31',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 28, Day 29 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_28',
      vocabSetIds: ['wm2000_day_28', 'wm2000_day_29'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d30_31_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 30~31',
      date: '2026-11-02',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 30, Day 31 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_30',
      vocabSetIds: ['wm2000_day_30', 'wm2000_day_31'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d32_33_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 32~33',
      date: '2026-11-03',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 32, Day 33 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_32',
      vocabSetIds: ['wm2000_day_32', 'wm2000_day_33'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d34_35_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 34~35',
      date: '2026-11-04',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 34, Day 35 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_34',
      vocabSetIds: ['wm2000_day_34', 'wm2000_day_35'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d36_37_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 36~37',
      date: '2026-11-05',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 36, Day 37 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_36',
      vocabSetIds: ['wm2000_day_36', 'wm2000_day_37'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d38_39_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 38~39',
      date: '2026-11-06',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 38, Day 39 (총 80단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_38',
      vocabSetIds: ['wm2000_day_38', 'wm2000_day_39'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    },
    {
      id: 'vocab_wm2000_d40_student_11',
      studentId: 11,
      title: '[워드마스터 수능 2000] Day 40',
      date: '2026-11-07',
      time: '18:00',
      endTime: '23:59',
      scope: '[워드마스터 수능 2000] Day 40 (총 40단어)',
      cutoff: '객관식 80점 · 스펠링 80점 · 통합 80점',
      cutoffScore: 80,
      vocabCutoff: 80,
      vocabCutoffs: { 2: 80, 3: 80, 4: 80 },
      vocabSetId: 'wm2000_day_40',
      vocabSetIds: ['wm2000_day_40'],
      score: '',
      status: 'SCHEDULED',
      retestStatus: 'NONE',
      retestDate: '',
      teacherNote: '워드마스터 수능 2000 단어 테스트입니다. 객관식, 스펠링, 통합 테스트 중 선택하여 응시하세요.',
      type: 'VOCAB',
      allowLate: false,
    }
  ];

  return allTests;
}


// ========================================================
// 단어 세트 기본 데이터 (워드마스터 2000 전체 50개 Day)
// 브라우저 초기 로딩 즉시 모든 학생에게 100% 가용 보장
// ========================================================

function getDefaultVocabSets() {
  const allSets = [];
  const allStudentIds = DEFAULT_STUDENTS.map(s => Number(s.id));

  // 2. 워드마스터 수능 2000 전체 50개 Day 세트
  if (typeof WORDMASTER_2000_SETS !== 'undefined' && Array.isArray(WORDMASTER_2000_SETS)) {
    WORDMASTER_2000_SETS.forEach(set => {
      allSets.push({
        ...set,
        book: (set.book || '워드마스터 수능 2000').trim(),
        studentIds: [...allStudentIds]
      });
    });
  }

  // 2-2. 워드마스터 고등 Basic 전체 30개 Day 세트
  if (typeof WORDMASTER_BASIC_SETS !== 'undefined' && Array.isArray(WORDMASTER_BASIC_SETS)) {
    WORDMASTER_BASIC_SETS.forEach(set => {
      allSets.push({
        ...set,
        book: (set.book || '워드마스터 고등 Basic').trim(),
        studentIds: [...allStudentIds]
      });
    });
  }

  // 3. YBM(박준언) 공통영어 2 단어 세트 (백발백중)
  if (typeof YBM_ENGLISH2_VOCAB_SETS !== 'undefined' && Array.isArray(YBM_ENGLISH2_VOCAB_SETS)) {
    YBM_ENGLISH2_VOCAB_SETS.forEach(set => {
      allSets.push({
        ...set,
        book: (set.book || '백발백중 공통영어 2').trim(),
        studentIds: [...allStudentIds]
      });
    });
  }

  return allSets;
}


// ========================================================
// 로컬 캐시 및 Firebase 데이터 스토어 (초고속 즉시 로딩 & 오프라인 완벽 보장)
// ========================================================

const LOCAL_CACHE_KEYS = {
  tests: 'yem_cache_tests_v4',
  students: 'yem_cache_students_v3',
  vocabSets: 'yem_cache_vocab_sets_v6'
};

function getLocalCache(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setLocalCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {}
}

// 송규인(id: 11) 학생 워드마스터 단어테스트 15개 일정 보정 함수
// - 이미 완료된 테스트(PASS, RETEST_PASS, 합격점수 등)는 기존 날짜 유지
// - 미완료 테스트는 2026-10-22부터 일요일을 건너뛰고 하루에 1개씩 순차 배정
const GYUIN_VOCAB_TEST_IDS = [
  'vocab_wm2000_d12_13_student_11',
  'vocab_wm2000_d14_15_student_11',
  'vocab_wm2000_d16_17_student_11',
  'vocab_wm2000_d18_19_student_11',
  'vocab_wm2000_d20_21_student_11',
  'vocab_wm2000_d22_23_student_11',
  'vocab_wm2000_d24_25_student_11',
  'vocab_wm2000_d26_27_student_11',
  'vocab_wm2000_d28_29_student_11',
  'vocab_wm2000_d30_31_student_11',
  'vocab_wm2000_d32_33_student_11',
  'vocab_wm2000_d34_35_student_11',
  'vocab_wm2000_d36_37_student_11',
  'vocab_wm2000_d38_39_student_11',
  'vocab_wm2000_d40_student_11'
];

function applyGyuinVocabSchedule(testsList) {
  if (!Array.isArray(testsList)) return false;

  const gyuinStudentId = 11;
  const isDone = (t) => {
    if (!t) return false;
    if (t.status === 'PASS' || t.retestStatus === 'RETEST_PASS') return true;
    if (t.practiceResult?.passed || t.vocabResult?.passed) return true;
    if (t.score !== '' && t.score != null && !isNaN(Number(t.score)) && Number(t.score) >= (t.cutoffScore || 80)) return true;
    return false;
  };

  const getNextDate = (dateStr) => {
    const parts = dateStr.split('-');
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // 일요일이면 월요일로
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  let nextDate = '2026-10-22';
  let modified = false;

  for (const tid of GYUIN_VOCAB_TEST_IDS) {
    const test = testsList.find(t => String(t.id) === tid || (Number(t.studentId) === gyuinStudentId && t.type === 'VOCAB' && String(t.id).includes(tid)));
    if (!test) continue;

    if (isDone(test)) {
      // 완료된 테스트는 기존 완료 날짜 유지
      continue;
    }

    if (test.date !== nextDate) {
      test.date = nextDate;
      modified = true;
    }
    nextDate = getNextDate(nextDate);
  }

  return modified;
}

const cachedTests = getLocalCache(LOCAL_CACHE_KEYS.tests);
const cachedStudents = getLocalCache(LOCAL_CACHE_KEYS.students);
const cachedVocabSets = getLocalCache(LOCAL_CACHE_KEYS.vocabSets);

const FirebaseStore = {
  students: Array.isArray(cachedStudents) && cachedStudents.length > 0 ? cachedStudents : [...DEFAULT_STUDENTS],
  tests: (() => {
    // 기본 시험을 자동 주입하지 않습니다. 클라우드에 실제로 저장된 11월 이후 일정만 사용합니다.
    return retainFutureTests(cachedTests);
  })(),
  vocabSets: (() => {
    const defSets = getDefaultVocabSets();
    if (!Array.isArray(cachedVocabSets) || cachedVocabSets.length === 0) return defSets;
    const defMap = new Map(defSets.map(s => [s.id, s]));
    cachedVocabSets.forEach(s => {
      if (s.id && s.id.startsWith('wm_basic_')) {
        const defSet = defMap.get(s.id);
        if (defSet && defSet.words) {
          s.words = defSet.words;
          s.book = defSet.book || '워드마스터 고등 Basic';
          s.title = defSet.title;
        }
      }
    });
    return cachedVocabSets;
  })(),
  vocabTestResults: [],
  vocabReviewResults: [],
  reviewSourcesReady: {},
  textMemorizeResults: [],
  studentsLoaded: false,
  testsLoaded: false,
  studentListenerStarted: false,
  testsListenerStarted: false,
  vocabSetsListenerStarted: false,
  vocabTestResultsListenerStarted: false,
  textMemorizeResultsListenerStarted: false,
  specialScienceResultsListenerStarted: false
};


// ========================================================
// Data Storage Helper Object
// ========================================================

const AppData = {

  async withCloudTimeout(operation, label, timeoutMs = 12000) {
    let timeoutId;
    try {
      return await Promise.race([
        operation,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`${label} 응답 시간이 초과되었습니다.`)), timeoutMs);
        })
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  },

  // ======================================================
  // Firebase 준비 확인
  // ======================================================

  isFirebaseReady() {
    return (
      typeof window !== 'undefined' &&
      !!window.firebaseDB &&
      !!window.firebaseFns
    );
  },

  async waitForFirebase(timeoutMs = 6000) {
    if (this.isFirebaseReady()) return true;

    return new Promise(resolve => {
      const startTime = Date.now();
      let timer = null;

      const onReady = () => {
        cleanup();
        resolve(true);
      };

      const cleanup = () => {
        if (timer) clearInterval(timer);
        if (typeof window !== 'undefined') {
          window.removeEventListener('firebase-ready', onReady);
        }
      };

      if (typeof window !== 'undefined') {
        window.addEventListener('firebase-ready', onReady);
      }

      timer = setInterval(() => {
        if (this.isFirebaseReady()) {
          cleanup();
          resolve(true);
        } else if (Date.now() - startTime > timeoutMs) {
          cleanup();
          console.warn('⚠️ Firebase 준비 대기 타임아웃');
          resolve(false);
        }
      }, 50);
    });
  },


  // ======================================================
  // 학생 목록 가져오기
  // ======================================================

  getStudents() {
    if (FirebaseStore.studentsLoaded && Array.isArray(FirebaseStore.students)) {
      return FirebaseStore.students;
    }
    if (Array.isArray(FirebaseStore.students) && FirebaseStore.students.length > 0) {
      return FirebaseStore.students;
    }
    return DEFAULT_STUDENTS;
  },


  // ======================================================
  // 학생 목록 Firestore 저장
  // ======================================================

  async saveStudents(students) {

    if (!this.isFirebaseReady()) {
      console.error('❌ Firebase가 준비되지 않았습니다.');
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    try {
      const { collection, getDocs } = window.firebaseFns;
      const existing = await getDocs(collection(window.firebaseDB, 'students'));
      const linked = new Map(existing.docs.filter(s => s.data().accountUid).map(s => [Number(s.data().id), s.data().accountUid]));
      if ([...linked.keys()].some(id => !students.some(s => Number(s.id) === id))) {
        throw new Error('가입 계정이 연결된 학생은 백업 복원이나 초기화로 삭제할 수 없습니다. 학생 관리에서 먼저 확인해주세요.');
      }
      students = students.map(({ password, loginId, accountUid, ...student }) => ({ ...student, ...(linked.has(Number(student.id)) ? { accountUid: linked.get(Number(student.id)) } : {}) }));
      FirebaseStore.students = [...students];
      FirebaseStore.studentsLoaded = true;

      // 현재 학생 목록으로 Firestore 컬렉션을 동기화합니다.
      // 목록에서 제거된 학생 문서도 함께 정리되어 학생 삭제가 반영됩니다.
      await this.replaceCollection(
        'students',
        students,
        student => student.id
      );

      console.log(
        `✅ Firestore 학생 데이터 저장 완료 (${students.length}명)`
      );

      return students;

    } catch (error) {

      console.error(
        '❌ Firestore 학생 데이터 저장 실패:',
        error
      );

      throw error;
    }
  },


  // ======================================================
  // Firestore에서 학생 목록 가져오기
  // ======================================================

  async loadStudentsFromFirestore() {

    if (!this.isFirebaseReady()) {
      console.error('❌ Firebase가 준비되지 않았습니다.');
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    try {

      const {
        collection,
        getDocs
      } = window.firebaseFns;

      const db = window.firebaseDB;

      console.log(
        '☁️ Firestore에서 학생 데이터를 불러오는 중...'
      );

      const snapshot = await this.withCloudTimeout(
        getDocs(collection(db, 'students')),
        '학생 데이터 클라우드 읽기'
      );

      const students = snapshot.docs.map(
        document => document.data()
      );

      // ID를 숫자로 정리
      students.forEach(student => {
        student.id = Number(student.id);
      });

      // ID 순서대로 정렬
      students.sort(
        (a, b) => a.id - b.id
      );

      FirebaseStore.students = students;
      FirebaseStore.studentsLoaded = true;

      console.log(
        `✅ Firestore에서 학생 ${students.length}명 로드 완료`
      );

      return students;

    } catch (error) {

      console.error(
        '❌ Firestore 학생 데이터 로드 실패:',
        error
      );

      throw error;
    }
  },


  // ======================================================
  // 학생 데이터 최초 초기화
  // ======================================================

  async initializeStudents() {
    return this.loadStudentsFromFirestore();
  },

  startStudentListener() {

    if (FirebaseStore.studentListenerStarted) {
      return;
    }

    if (!this.isFirebaseReady()) {
      console.error(
        '❌ Firebase가 준비되지 않아 listener를 시작할 수 없습니다.'
      );

      return;
    }

    try {

      const {
        collection,
        onSnapshot
      } = window.firebaseFns;

      const db = window.firebaseDB;

      onSnapshot(
        collection(db, 'students'),

        snapshot => {

          const students =
            snapshot.docs.map(
              document => document.data()
            );

          students.forEach(student => {
            student.id = Number(student.id);
          });

          students.sort(
            (a, b) => a.id - b.id
          );

          FirebaseStore.students = students;
          FirebaseStore.studentsLoaded = true;

          console.log(
            '🔄 학생 데이터 실시간 업데이트:',
            students
          );

          // 현재 화면 갱신
          this.refreshStudentScreens();

        },

        error => {

          console.error(
            '❌ 학생 데이터 실시간 동기화 실패:',
            error
          );

        }
      );

      FirebaseStore.studentListenerStarted = true;

      console.log(
        '👂 학생 데이터 실시간 감시 시작'
      );

    } catch (error) {

      console.error(
        '❌ 학생 listener 시작 실패:',
        error
      );
    }
  },


  // ======================================================
  // 학생 관련 화면 새로고침
  // ======================================================

  refreshStudentScreens() {
    if (typeof App === 'undefined' || !App.state) {
      return;
    }

    try {
      // 메인 학생 선택 화면 (랜딩 뷰일 때만)
      if (App.state.view === 'landing' && typeof App.renderLanding === 'function') {
        App.renderLanding();
      }

      // 학생 대시보드
      if (App.state.view === 'student' && typeof App.renderStudentDashboard === 'function') {
        App.renderStudentDashboard();
      }

      // 관리자 화면
      if (App.state.view === 'admin' && typeof App.renderAdminDashboard === 'function') {
        App.renderAdminDashboard();
      }
    } catch (error) {
      console.error('❌ 학생 화면 새로고침 실패:', error);
    }
  },


  // ======================================================
  // 특정 학생 가져오기
  // ======================================================

  getStudentById(id) {

    const students =
      this.getStudents();

    return students.find(
      s => s.id === Number(id)
    ) || null;
  },


  // ======================================================
  // 공통 Firestore 컬렉션 도우미
  // ======================================================

  getLegacyArray(key) {
    try {
      const raw = localStorage.getItem(key);
      const value = raw ? JSON.parse(raw) : null;
      return Array.isArray(value) ? value : null;
    } catch (error) {
      console.warn(`기존 ${key} 데이터를 읽지 못했습니다.`, error);
      return null;
    }
  },

  async loadCollection(collectionName, normalize = item => item) {
    if (!this.isFirebaseReady()) {
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    const { collection, getDocs } = window.firebaseFns;
    const snapshot = await this.withCloudTimeout(
      getDocs(collection(window.firebaseDB, collectionName)),
      `${collectionName} 클라우드 읽기`
    );
    if (!snapshot.metadata?.fromCache) {
      FirebaseStore.reviewSourcesReady ||= {};
      FirebaseStore.reviewSourcesReady[collectionName] = true;
    }
    return snapshot.docs.map(document => normalize({
      ...document.data(),
      id: document.data().id || document.id
    }));
  },

  async writeDocument(collectionName, id, data) {
    if (!this.isFirebaseReady()) {
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    const { collection, doc, setDoc } = window.firebaseFns;
    const cleanData = JSON.parse(JSON.stringify(data, (key, value) => value === undefined ? null : value));
    await setDoc(doc(collection(window.firebaseDB, collectionName), String(id)), cleanData);
  },

  async removeDocument(collectionName, id) {
    if (!this.isFirebaseReady()) {
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    const { collection, doc, deleteDoc } = window.firebaseFns;
    await deleteDoc(doc(collection(window.firebaseDB, collectionName), String(id)));
  },

  async replaceCollection(collectionName, items, getId) {
    if (!this.isFirebaseReady()) {
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    const { collection, doc, getDocs, setDoc, deleteDoc } = window.firebaseFns;
    const db = window.firebaseDB;
    const targetIds = new Set(items.map(item => String(getId(item))));
    const existing = await getDocs(collection(db, collectionName));

    // 대량 저장 시(예: 50개 단어 세트) 네트워크 타임아웃 및 Firestore 동시성 오류 방지를 위해 10개씩 청크 분할 저장
    for (let i = 0; i < items.length; i += 10) {
      const chunk = items.slice(i, i + 10);
      await Promise.all(chunk.map(item => {
        const cleanItem = JSON.parse(JSON.stringify(item, (key, value) => value === undefined ? null : value));
        return setDoc(doc(collection(db, collectionName), String(getId(item))), cleanItem);
      }));
    }

    const docsToDelete = existing.docs.filter(document => !targetIds.has(document.id));
    for (let i = 0; i < docsToDelete.length; i += 10) {
      const chunk = docsToDelete.slice(i, i + 10);
      await Promise.all(chunk.map(document => deleteDoc(document.ref)));
    }
  },

  startCollectionListener({ collectionName, cacheKey, listenerKey, normalize, sort }) {
    if (FirebaseStore[listenerKey] || !this.isFirebaseReady()) return;

    const { collection, onSnapshot } = window.firebaseFns;
    onSnapshot(collection(window.firebaseDB, collectionName), { includeMetadataChanges: true }, snapshot => {
      let items = snapshot.docs.map(document => normalize({
        ...document.data(),
        id: document.data().id || document.id
      }));
      if (sort) items.sort(sort);

      // 삭제 기준일 이전 시험은 어떤 경로로 다시 들어와도 즉시 화면·캐시·클라우드에서 제거합니다.
      if (cacheKey === 'tests') {
        const expiredTestIds = items.filter(test => !shouldKeepTest(test)).map(test => test.id);
        items = retainFutureTests(items);
        setLocalCache(LOCAL_CACHE_KEYS.tests, items);
        expiredTestIds.forEach(id => {
          this.removeDocument('tests', id).catch(error => console.warn(`만료 시험 삭제 실패 (${id}):`, error));
        });
      }

      // vocabSets 컬렉션 보호: Firestore에서 빈 배열이 오거나 워드마스터가 누락된 경우 기본 세트를 자동 병합하여 절대 소실되지 않도록 함
      if (cacheKey === 'vocabSets') {
        const defSets = getDefaultVocabSets();
        const defMap = new Map(defSets.map(s => [s.id, s]));
        const existingIds = new Set(items.map(s => s.id));
        defSets.forEach(defSet => {
          if (!existingIds.has(defSet.id)) {
            items.push(defSet);
          }
        });
        let needsCloudUpdate = false;
        // 워드마스터 고등 Basic 2022 개정판(Day 1: include...) 최신 정본 강제 갱신
        items.forEach(s => {
          if (s.id && s.id.startsWith('wm_basic_')) {
            const defSet = defMap.get(s.id);
            if (defSet && defSet.words) {
              if (s.id === 'wm_basic_day_01' && (!s.words || !s.words[0] || s.words[0].en.toLowerCase() !== 'include')) {
                needsCloudUpdate = true;
              }
              s.words = defSet.words;
              s.book = defSet.book || '워드마스터 고등 Basic';
              s.title = defSet.title;
            }
          }
        });
        // 모든 학생 ID 매핑 보장
        const currentStudentIds = (FirebaseStore.students || DEFAULT_STUDENTS).map(s => Number(s.id));
        items.forEach(s => {
          s.studentIds = (s.studentIds || []).filter(id => currentStudentIds.includes(Number(id)));
          if (s.book === '워드마스터 수능 2000' || (s.id && s.id.startsWith('wm2000_')) || s.book === '워드마스터 고등 Basic' || (s.id && s.id.startsWith('wm_basic_')) || (s.id && s.id.startsWith('ybm2_')) || s.book === '백발백중 공통영어 2') {
            if (!Array.isArray(s.studentIds)) s.studentIds = [];
            currentStudentIds.forEach(sid => {
              if (!s.studentIds.includes(sid)) s.studentIds.push(sid);
            });
          }
        });
        setLocalCache(LOCAL_CACHE_KEYS.vocabSets, items);
        if (needsCloudUpdate) {
          this.replaceCollection('vocabSets', items, set => set.id).catch(e => console.warn('Vocab sets auto-healing notice:', e));
        }
      }

      FirebaseStore[cacheKey] = items;
      if (!snapshot.metadata?.fromCache) {
        FirebaseStore.reviewSourcesReady ||= {};
        FirebaseStore.reviewSourcesReady[collectionName] = true;
      }
      if (cacheKey === 'tests') {
        FirebaseStore.vocabReviewResults = items.filter(t => t.weeklyReviewResult).map(t => t.weeklyReviewResult);
        FirebaseStore.testsLoaded = true;
        if (typeof App !== 'undefined' && typeof App.updateSyncStatus === 'function') {
          App.updateSyncStatus('synced', '최신 데이터 동기화 완료');
        }
      }
      this.refreshCloudScreens();
    }, error => {
      console.error(`Firestore ${collectionName} 실시간 동기화 실패:`, error);
    });

    FirebaseStore[listenerKey] = true;
  },

  refreshCloudScreens() {
    if (typeof App === 'undefined' || !App.state) return;

    this.queueWeeklyReviews?.();
    App.refreshWeeklyReviewModal?.();
    if (App.state.view === 'landing') App.renderLanding?.();
    if (App.state.view === 'student') App.renderStudentDashboard?.();
    if (App.state.view === 'admin') App.renderAdminDashboard?.();
    if (App.state.view === 'grammarTest') App.syncGrammarResults?.();
    if (App.state.view === 'grammarResult') App.refreshGrammarCompletion?.();
    if (App.state.view === 'paceReport') App.renderPaceReport?.();
  },

  reportCloudWriteError(label, error) {
    console.error(`${label} Firestore 저장 실패:`, error);
    if (typeof App !== 'undefined' && typeof App.toast === 'function') {
      App.toast(`${label} 저장에 실패했습니다. 인터넷 연결과 Firebase 권한을 확인해주세요.`, 'error');
    }
  },


  // ======================================================
  // 시험 / 단어 데이터 최초 초기화 및 실시간 동기화
  // ======================================================

  async initializeCloudData() {
    await this.waitForFirebase();

    const [loadedTests, vocabSets, vocabTestResults] = await Promise.all([
      this.loadCollection('tests', test => ({ ...test, studentId: Number(test.studentId) })).catch(e => {
        console.warn('tests 로드 실패 (로컬 유지):', e);
        return [];
      }),
      this.loadCollection('vocabSets', set => ({
        ...set,
        book: set.book || '기본 단어장',
        studentIds: (set.studentIds || []).map(Number)
      })).catch(e => {
        console.warn('vocabSets 로드 실패 (로컬 유지):', e);
        return [];
      }),
      this.loadCollection('vocabTestResults', result => ({
        ...result,
        studentId: Number(result.studentId),
        direction: Number(result.direction)
      })).catch(e => {
        console.warn('vocabTestResults 로드 실패:', e);
        return [];
      })
    ]);

    // 1. 10월 31일 이전 일정은 삭제하고, 기본/샘플 시험 자동 병합을 하지 않습니다.
    const tests = retainFutureTests(loadedTests);
    FirebaseStore.tests = tests;
    FirebaseStore.testsLoaded = true;
    setLocalCache(LOCAL_CACHE_KEYS.tests, FirebaseStore.tests);

    if (loadedTests.length !== tests.length) {
      await this.replaceCollection('tests', FirebaseStore.tests, test => test.id);
      console.log(`🧹 11월 이전 시험 ${loadedTests.length - tests.length}건을 클라우드에서 삭제했습니다.`);
    }

    FirebaseStore.vocabSets = vocabSets;
    FirebaseStore.vocabTestResults = vocabTestResults;
    FirebaseStore.vocabReviewResults = tests.filter(t => t.weeklyReviewResult).map(t => t.weeklyReviewResult);

    if (loadedTests.length === 0) {
      const legacyTests = this.getLegacyArray(LEGACY_STORAGE_KEYS.tests);
      const retainedLegacyTests = retainFutureTests(legacyTests);
      if (retainedLegacyTests.length > 0) {
        await this.saveTests(retainedLegacyTests);
      }
      localStorage.removeItem(LEGACY_STORAGE_KEYS.tests);
    }

    // 기본 단어 세트(워드마스터 2000 50개 Day + 워드마스터 고등 Basic 30개 Day) 전체 복원 및 학생 권한 보장
    try {
      const defSets = getDefaultVocabSets();
      const currentSets = FirebaseStore.vocabSets || [];
      const setMap = new Map();
      defSets.forEach(s => setMap.set(s.id, s));
      let wmBasicUpdated = false;
      currentSets.forEach(s => {
        const base = setMap.get(s.id);
        if (base) {
          if (s.id && s.id.startsWith('wm_basic_')) {
            // 워드마스터 고등 Basic은 2022 개정판 최신 정본 데이터(base.words)를 항상 우선 강제 적용
            if (!s.words || s.words.length === 0 || (s.id === 'wm_basic_day_01' && s.words[0]?.en?.toLowerCase() !== 'include')) {
              wmBasicUpdated = true;
            }
            setMap.set(s.id, { ...s, words: base.words, title: base.title, book: base.book });
          } else {
            setMap.set(s.id, { ...base, ...s });
          }
        } else {
          setMap.set(s.id, s);
        }
      });

      // 모든 등록 학생(1~6, 11~14 및 전체 등록 학생)에 대해 워드마스터 단어 세트 권한 보장
      const allStudentIds = this.getStudents().map(s => Number(s.id));
      setMap.forEach(s => {
        s.studentIds = (s.studentIds || []).filter(id => allStudentIds.includes(Number(id)));
        if (s.book === '워드마스터 수능 2000' || (s.id && s.id.startsWith('wm2000_')) || s.book === '워드마스터 고등 Basic' || (s.id && s.id.startsWith('wm_basic_')) || (s.id && s.id.startsWith('ybm2_')) || s.book === '백발백중 공통영어 2') {
          if (!Array.isArray(s.studentIds)) s.studentIds = [];
          allStudentIds.forEach(sid => {
            if (!s.studentIds.includes(sid)) s.studentIds.push(sid);
          });
        }
      });

      // 현재 단어 세트 목록
      const fullSets = Array.from(setMap.values());

      // 발음기호(IPA) 누락 자동 보강
      const wmIpaLookup = new Map();
      if (typeof WORDMASTER_2000_SETS !== 'undefined' && Array.isArray(WORDMASTER_2000_SETS)) {
        WORDMASTER_2000_SETS.forEach(s => {
          (s.words || []).forEach(w => {
            if (w.en && w.ipa) wmIpaLookup.set(w.en.trim().toLowerCase(), w.ipa);
          });
        });
      }
      if (typeof WORDMASTER_BASIC_SETS !== 'undefined' && Array.isArray(WORDMASTER_BASIC_SETS)) {
        WORDMASTER_BASIC_SETS.forEach(s => {
          (s.words || []).forEach(w => {
            if (w.en && w.ipa) wmIpaLookup.set(w.en.trim().toLowerCase(), w.ipa);
          });
        });
      }
      fullSets.forEach(s => {
        (s.words || []).forEach(w => {
          if (w.en && !w.ipa) {
            const foundIpa = wmIpaLookup.get(w.en.trim().toLowerCase());
            if (foundIpa) w.ipa = foundIpa;
          }
        });
      });

      const needsSync = currentSets.length < defSets.length || fullSets.length !== currentSets.length || wmBasicUpdated;
      FirebaseStore.vocabSets = fullSets;
      setLocalCache(LOCAL_CACHE_KEYS.vocabSets, fullSets);

      if (needsSync) {
        console.log('기본 단어 세트 전체가 성공적으로 복원 및 동기화되었습니다.');
        this.replaceCollection('vocabSets', FirebaseStore.vocabSets, set => set.id).catch(e => console.warn('Vocab sets auto-healing notice:', e));
      }
    } catch (vocabSyncErr) {
      console.warn('단어 세트 자동 복원 동기화 안내:', vocabSyncErr);
    }

    // 모든 학생의 단어 시험(VOCAB)에 대해 vocabSetId / vocabSetIds 누락 자동 탐지 및 원래 일정대로 완벽 자동 재연동
    try {
      const allVocabSets = this.getVocabSets();
      let testsRelinked = false;
      const testsList = FirebaseStore.tests || [];

      testsList.forEach(t => {
        if (t.type === 'GRAMMAR' || t.type === 'VOCAB_REVIEW') return;
        // 본문 암기(TEXT_MEMORIZE)는 절대로 다른 시험으로 변환하지 않고 유지
        if (t.type === 'TEXT_MEMORIZE' || (t.id && String(t.id).startsWith('tm_')) || (t.title && t.title.includes('본문')) || (Array.isArray(t.passageIds) && t.passageIds.length > 0)) {
          t.type = 'TEXT_MEMORIZE';
          delete t.vocabSetId;
          delete t.vocabSetIds;
          return;
        }

        // 문제풀이 시험(PRACTICE)은 절대로 단어 시험으로 변환하지 않음
        if (t.type === 'PRACTICE' || (t.title && t.title.includes('문제풀이'))) {
          t.type = 'PRACTICE';
          delete t.vocabSetId;
          delete t.vocabSetIds;
          return;
        }

        const isVocab = t.type === 'VOCAB' || (t.id && String(t.id).startsWith('vocab_')) || (t.title && (t.title.includes('워드마스터') || (t.title.includes('단어') && !t.title.includes('문제풀이'))));
        if (isVocab) {
          const currentSetIds = Array.isArray(t.vocabSetIds) && t.vocabSetIds.length > 0 ? t.vocabSetIds : (t.vocabSetId ? [t.vocabSetId] : []);
          const hasValidMatching = currentSetIds.length > 0 && currentSetIds.every(id => allVocabSets.some(s => s.id === id));

          if (!hasValidMatching) {
            const textToSearch = `${t.title || ''} ${t.scope || ''} ${t.id || ''}`;
            const dayMatches = [...textToSearch.matchAll(/Day\s*(\d+)/gi)];
            if (dayMatches.length > 0) {
              const extractedSetIds = [...new Set(dayMatches.map(m => `wm2000_day_${String(m[1]).padStart(2, '0')}`))];
              t.vocabSetIds = extractedSetIds;
              t.vocabSetId = extractedSetIds[0];
              t.type = 'VOCAB';
              testsRelinked = true;
            }
          }
        }
      });

      if (testsRelinked) {
        setLocalCache(LOCAL_CACHE_KEYS.tests, FirebaseStore.tests);
      }
    } catch (relinkErr) {
      console.warn('단어 시험 일정 자동 재연동 점검 안내:', relinkErr);
    }

    if (vocabTestResults.length === 0) {
      const legacyResults = this.getLegacyArray(LEGACY_STORAGE_KEYS.vocabTestResults);
      if (legacyResults) {
        await this.saveVocabTestResults(legacyResults);
        localStorage.removeItem(LEGACY_STORAGE_KEYS.vocabTestResults);
      }
    }

    // 이미 삭제된 단어 테스트에 남아 있는 고아 결과를 한 번 정리합니다.
    await this.cleanupOrphanVocabTestResults();

    // 최신 상태 로컬 캐시 갱신 및 화면 즉시 새로고침
    setLocalCache(LOCAL_CACHE_KEYS.tests, FirebaseStore.tests);
    this.refreshCloudScreens();

  },

  startCloudListeners() {
    this.startCollectionListener({
      collectionName: 'tests', cacheKey: 'tests', listenerKey: 'testsListenerStarted',
      normalize: test => ({ ...test, studentId: Number(test.studentId) }),
      sort: (a, b) => new Date(a.date) - new Date(b.date)
    });
    this.startCollectionListener({
      collectionName: 'vocabSets', cacheKey: 'vocabSets', listenerKey: 'vocabSetsListenerStarted',
      normalize: set => ({ ...set, studentIds: (set.studentIds || []).map(Number) })
    });
    this.startCollectionListener({
      collectionName: 'vocabTestResults', cacheKey: 'vocabTestResults', listenerKey: 'vocabTestResultsListenerStarted',
      normalize: result => ({ ...result, studentId: Number(result.studentId), direction: Number(result.direction) })
    });
    this.startCollectionListener({
      collectionName: 'textMemorizeResults', cacheKey: 'textMemorizeResults', listenerKey: 'textMemorizeResultsListenerStarted',
      normalize: result => ({ ...result, studentId: Number(result.studentId) })
    });
    this.startSpecialScienceResultsListener();
  },

  startSpecialScienceResultsListener() {
    if (FirebaseStore.specialScienceResultsListenerStarted || !this.isFirebaseReady()) return;

    const { doc, onSnapshot } = window.firebaseFns;
    onSnapshot(doc(window.firebaseDB, 'academicData', 'specialScienceResults'), () => {
      if (typeof App !== 'undefined' && App.state?.view === 'admin' && App.state.adminTab === 'tests') {
        const student = this.getStudentById(App.state.adminSelectedStudentId);
        App.renderAdminSpecialScienceResults?.(student);
      }
    }, error => {
      console.error('Firestore 지구과학 특별 테스트 실시간 동기화 실패:', error);
    });

    FirebaseStore.specialScienceResultsListenerStarted = true;
  },


  // ======================================================
  // 시험 목록 가져오기 (현재 시험)
  // ======================================================

  getTests() {
    let current = retainFutureTests(FirebaseStore.tests);

    if (current.length !== (FirebaseStore.tests || []).length) {
      FirebaseStore.tests = current;
      setLocalCache(LOCAL_CACHE_KEYS.tests, current);
    }
    return current;
  },


  // ======================================================
  // 시험 목록 저장
  // ======================================================

  async saveTests(tests) {
    FirebaseStore.tests = retainFutureTests(tests).map(test => ({ ...test, studentId: Number(test.studentId) }));
    await this.replaceCollection('tests', FirebaseStore.tests, test => test.id);
    return FirebaseStore.tests;
  },


  // ======================================================
  // 특정 학생의 시험 목록 (타입 불일치 방지 및 100% 매핑 보장)
  // ======================================================

  getTestsByStudentId(studentId) {
    const tests = this.getTests();
    const typeOrder = { 'PRACTICE': 1, 'TEXT_MEMORIZE': 2, 'REGULAR': 3, 'VOCAB': 4, 'GRAMMAR': 5 };
    return tests
      .filter(t => Number(t.studentId) === Number(studentId))
      .sort((a, b) => {
        const dateDiff = new Date(b.date) - new Date(a.date);
        if (dateDiff !== 0) return dateDiff;
        const ordA = typeOrder[a.type] || 5;
        const ordB = typeOrder[b.type] || 5;
        return ordA - ordB;
      });
  },


  // ======================================================
  // 시험 추가 또는 수정
  // ======================================================

  async saveOrUpdateTest(testData) {

    if (!shouldKeepTest(testData)) {
      const currentTests = retainFutureTests(this.getTests());
      FirebaseStore.tests = currentTests;
      setLocalCache(LOCAL_CACHE_KEYS.tests, currentTests);
      if (testData?.id) {
        await this.removeDocument('tests', testData.id).catch(() => {});
      }
      return null;
    }

    const tests =
      this.getTests();

    if (!testData.id) {

      testData.id =
        'test_' +
        Date.now() +
        '_' +
        Math.random()
          .toString(36)
          .substr(2, 5);

      tests.push(testData);

    } else {

      const idx =
        tests.findIndex(
          t => t.id === testData.id
        );

      if (idx >= 0) {

        tests[idx] = {
          ...tests[idx],
          ...testData
        };

      } else {

        tests.push(testData);

      }
    }

    FirebaseStore.tests = tests;
    try {
      await this.writeDocument('tests', testData.id, testData);
    } catch (error) {
      this.reportCloudWriteError('시험 일정', error);
      throw error;
    }

    this.queueWeeklyReviews?.();
    return testData;
  },


  // ======================================================
  // 시험 삭제
  // ======================================================

  async deleteTest(testId) {

    const existingTest =
      this.getTests().find(t => t.id === testId);

    if (!existingTest) {
      return;
    }

    if (existingTest.type === 'VOCAB_REVIEW') return this.deleteWeeklyReview(testId);

    // 단어 테스트 일정이면 연결된 응시 결과도 함께 삭제합니다.
    // 결과 문서는 testId를 기준으로 연결되어 있으므로
    // 같은 단어 세트를 사용하는 다른 시험의 결과는 건드리지 않습니다.
    try {
      await this.deleteVocabTestResultsByTestId(testId);
      await this.deleteTextMemorizeResultsByTestId(testId);
      await this.removeDocument('tests', testId);
    } catch (error) {
      this.reportCloudWriteError('시험 일정 또는 단어 테스트 결과', error);
      throw error;
    }

    FirebaseStore.tests =
      this.getTests().filter(
        t => t.id !== testId
      );

  },


  // ======================================================
  // 학생 정보 업데이트
  // ======================================================

  async updateStudent(studentData) {

    const students =
      this.getStudents();

    const idx =
      students.findIndex(
        s => s.id === Number(studentData.id)
      );

    if (idx >= 0) {

      students[idx] = {
        ...students[idx],
        ...studentData,
        id: Number(studentData.id)
      };

      await this.writeDocument('students', studentData.id, students[idx]);

      return students[idx];
    }

    return null;
  },


  // ======================================================
  // 학생 계정 추가 / 삭제
  // ======================================================

  async addStudent(studentData) {
    const { doc, runTransaction } = window.firebaseFns;
    const student = await runTransaction(window.firebaseDB, async tx => {
      let id = this.getStudents().reduce((max, student) => Math.max(max, Number(student.id) || 0), 0) + 1;
      let ref = doc(window.firebaseDB, 'students', String(id));
      while ((await tx.get(ref)).exists()) { id++; ref = doc(window.firebaseDB, 'students', String(id)); }
      const student = { id, name: studentData.name, target: studentData.target || '', accessMode: studentData.accessMode === 'CALENDAR_ONLY' ? 'CALENDAR_ONLY' : 'FULL' };
      tx.set(ref, student);
      return student;
    });
    FirebaseStore.students = [...this.getStudents().filter(s => s.id !== student.id), student];
    return student;
  },

  async deleteStudent(studentId) {
    const normalizedStudentId = Number(studentId);
    const students = this.getStudents();
    if (!students.some(student => student.id === normalizedStudentId)) {
      return false;
    }

    // 클라우드의 최신 문서로 정리합니다. 캐시 전체 덮어쓰기는 다른 학생의 변경을 유실시킬 수 있습니다.
    const { collection, getDocs, runTransaction } = window.firebaseFns;
    const db = window.firebaseDB;
    const collections = ['tests', 'vocabTestResults', 'textMemorizeResults', 'vocabSets', 'academicData', 'academicRecords', 'members'];
    const snapshots = await Promise.all(collections.map(name => getDocs(collection(db, name))));
    for (let i = 0; i < collections.length; i++) {
      const name = collections[i];
      for (const document of snapshots[i].docs) {
        await runTransaction(db, async tx => {
          const latest = await tx.get(document.ref);
          if (!latest.exists()) return;
          const value = latest.data();
          if (['tests', 'vocabTestResults', 'textMemorizeResults', 'academicRecords', 'members'].includes(name)) {
            if (Number(value.studentId) === normalizedStudentId) tx.delete(document.ref);
          } else if (name === 'vocabSets') {
            const ids = value.studentIds || [];
            const kept = ids.filter(id => Number(id) !== normalizedStudentId);
            if (kept.length !== ids.length) tx.update(document.ref, { studentIds: kept });
          } else if (value.items) {
            const isArray = Array.isArray(value.items);
            const entries = Object.entries(value.items).filter(([key, item]) =>
              !(item && typeof item === 'object' && Number(item.studentId) === normalizedStudentId) &&
              !(document.id === 'academicTargetUnivs' && Number(key) === normalizedStudentId));
            if (entries.length !== Object.keys(value.items).length) {
              const items = isArray ? entries.map(([, item]) => item) : Object.fromEntries(entries);
              const update = { items };
              if ('count' in value) update.count = entries.length;
              tx.update(document.ref, update);
            }
          }
        });
      }
    }
    // 종속 기록 정리가 실패하면 계정은 남겨 재시도할 수 있게 합니다.
    await this.removeDocument('students', normalizedStudentId);
    FirebaseStore.students = students.filter(student => student.id !== normalizedStudentId);
    for (const key of ['tests', 'vocabTestResults', 'textMemorizeResults']) {
      FirebaseStore[key] = (FirebaseStore[key] || []).filter(item => Number(item.studentId) !== normalizedStudentId);
    }
    FirebaseStore.vocabSets = this.getVocabSets().map(set => ({
      ...set, studentIds: (set.studentIds || []).filter(id => Number(id) !== normalizedStudentId)
    }));
    return true;
  },


  // ======================================================
  // 전체 데이터 초기화
  // ======================================================

  async resetToDefaults() {

    await this.saveStudents(
      DEFAULT_STUDENTS
    );

    const defTests = retainFutureTests(generateDefaultTests());

    await this.saveTests(defTests);
    await this.saveVocabSets(getDefaultVocabSets());
    await this.saveVocabTestResults([]);

  },


  // ======================================================
  // 데이터 백업 내보내기
  // ======================================================

  exportData() {

    return {

      version: '1.0',

      exportedAt:
        new Date().toISOString(),

      students:
        this.getStudents().map(({ password, loginId, accountUid, ...student }) => student),

      tests:
        this.getTests(),

      vocabSets:
        this.getVocabSets(),

      vocabTestResults:
        this.getVocabTestResults(),
      vocabReviewResults: this.getTests().filter(t => t.weeklyReviewResult).map(t => t.weeklyReviewResult)

    };

  },


  // ======================================================
  // 데이터 복원 가져오기
  // ======================================================

  async importData(importedObj) {

    if (
      importedObj &&
      Array.isArray(importedObj.students) &&
      Array.isArray(importedObj.tests)
    ) {

      await this.saveStudents(
        importedObj.students.map(({ password, loginId, accountUid, ...student }) => {
          const current = this.getStudentById(student.id);
          return { ...student, ...(current?.accountUid ? { accountUid: current.accountUid } : {}) };
        })
      );

      await this.saveTests(importedObj.tests);

      if (
        Array.isArray(
          importedObj.vocabSets
        )
      ) {

        await this.saveVocabSets(importedObj.vocabSets);
      } else {
        await this.saveVocabSets([]);

      }

      if (
        Array.isArray(
          importedObj.vocabTestResults
        )
      ) {

        await this.saveVocabTestResults(importedObj.vocabTestResults);

      } else {

        await this.saveVocabTestResults([]);

      }

      if (Array.isArray(importedObj.vocabReviewResults)) {
        for (const result of importedObj.vocabReviewResults) {
          const test = this.getTests().find(t => t.id === result.id && t.type === 'VOCAB_REVIEW');
          if (test && !test.weeklyReviewResult) await this.saveOrUpdateTest({ ...test, weeklyReviewResult: result });
        }
        FirebaseStore.vocabReviewResults = this.getTests().filter(t => t.weeklyReviewResult).map(t => t.weeklyReviewResult);
      }
      return true;

    }

    return false;
  },


  // ======================================================
  // 단어 세트
  // ======================================================

  getVocabSets() {
    const current = FirebaseStore.vocabSets;
    const defSets = getDefaultVocabSets();

    if (!Array.isArray(current) || current.length === 0) {
      FirebaseStore.vocabSets = defSets;
      return defSets;
    }

    const defMap = new Map(defSets.map(s => [s.id, s]));
    let modified = false;

    // 워드마스터 고등 Basic 2022 개정판(Day 1: include...) 최신 정본 데이터 즉시 보정
    current.forEach(s => {
      if (s.id && s.id.startsWith('wm_basic_')) {
        const defSet = defMap.get(s.id);
        if (defSet && defSet.words) {
          if (!s.words || s.words.length === 0 || (s.id === 'wm_basic_day_01' && s.words[0]?.en?.toLowerCase() !== 'include')) {
            s.words = defSet.words;
            s.book = defSet.book || '워드마스터 고등 Basic';
            s.title = defSet.title;
            modified = true;
          }
        }
      }
    });

    // 기본 세트(50개 Day + Basic 30개 Day) 중 하나라도 누락되어 있다면 자동 보강
    const currentIds = new Set(current.map(s => s.id));
    defSets.forEach(defSet => {
      if (!currentIds.has(defSet.id)) {
        current.push(defSet);
        modified = true;
      }
    });

    if (modified) {
      FirebaseStore.vocabSets = current;
      setLocalCache(LOCAL_CACHE_KEYS.vocabSets, current);
      this.replaceCollection('vocabSets', current, set => set.id).catch(() => {});
    }

    return current;
  },


  async saveVocabSets(sets) {
    FirebaseStore.vocabSets = sets.map(set => ({
      ...set,
      book: (set.book || '기본 단어장').trim(),
      studentIds: (set.studentIds || []).map(Number)
    }));
    await this.replaceCollection('vocabSets', FirebaseStore.vocabSets, set => set.id);
    return FirebaseStore.vocabSets;
  },


  async saveOrUpdateVocabSet(setData) {

    const sets =
      this.getVocabSets();

    if (!setData.id) {

      setData.id =
        'vocab_' +
        Date.now() +
        '_' +
        Math.random()
          .toString(36)
          .substr(2, 5);

      sets.push(setData);

    } else {

      const idx =
        sets.findIndex(
          s => s.id === setData.id
        );

      if (idx >= 0) {

        sets[idx] = {
          ...sets[idx],
          ...setData
        };

      } else {

        sets.push(setData);

      }
    }

    FirebaseStore.vocabSets = sets;
    try {
      await this.writeDocument('vocabSets', setData.id, setData);
    } catch (error) {
      this.reportCloudWriteError('단어 세트', error);
      throw error;
    }

    return setData;
  },


  async deleteVocabSet(setId) {

    let sets =
      this.getVocabSets();

    sets =
      sets.filter(
        s => s.id !== setId
      );

    FirebaseStore.vocabSets = sets;
    try {
      await this.removeDocument('vocabSets', setId);
    } catch (error) {
      this.reportCloudWriteError('단어 세트', error);
      throw error;
    }

  },


  getVocabSetsByStudentId(studentId) {
    const numId = Number(studentId);
    return this.getVocabSets().filter(s => {
      // 1. studentIds 목록에 학생 ID가 포함되어 있는 경우
      if (Array.isArray(s.studentIds) && s.studentIds.includes(numId)) {
        return true;
      }
      // 2. 워드마스터 2000, YBM 공통영어 2는 전교생 공통 교재이므로 무조건 접근 보장
      if (s.book === '워드마스터 수능 2000' || (s.id && s.id.startsWith('wm2000_')) || (s.id && s.id.startsWith('ybm2_')) || s.book === '백발백중 공통영어 2') {
        if (!Array.isArray(s.studentIds)) s.studentIds = [];
        if (!s.studentIds.includes(numId)) s.studentIds.push(numId);
        return true;
      }
      // 3. studentIds가 비어있는 세트도 기본 접근 허용
      if (!Array.isArray(s.studentIds) || s.studentIds.length === 0) {
        return true;
      }
      return false;
    });
  },


  // ======================================================
  // 단어 테스트 완료 이력
  // ======================================================

  getVocabTestResults() {
    return this.mergePendingVocabResults ? this.mergePendingVocabResults(FirebaseStore.vocabTestResults) : FirebaseStore.vocabTestResults;
  },


  getVocabTestResult(
    studentId,
    setId,
    direction,
    testId = null
  ) {

    return this
      .getVocabTestResults()
      .find(result =>

        Number(result.studentId) ===
          Number(studentId) &&

        Number(result.direction) ===
          Number(direction) &&

        (
          testId !== null
            ? result.testId === testId
            : result.setId === setId
        )

      ) || null;
  },


  getVocabTestResultDocumentId(result) {
    return [
      Number(result.studentId),
      encodeURIComponent(String(result.setId || 'set')),
      Number(result.direction),
      encodeURIComponent(String(result.testId || 'none'))
    ].join('_');
  },

  async saveVocabTestResults(results) {
    FirebaseStore.vocabTestResults = results.map(result => ({
      ...result,
      studentId: Number(result.studentId),
      direction: Number(result.direction)
    }));
    await this.replaceCollection(
      'vocabTestResults',
      FirebaseStore.vocabTestResults,
      result => this.getVocabTestResultDocumentId(result)
    );
    return FirebaseStore.vocabTestResults;
  },

  // 특정 단어 테스트 일정에 연결된 모든 응시 결과 삭제
  async deleteVocabTestResultsByTestId(testId) {
    const results = this.getVocabTestResults();
    const targetResults = results.filter(result => result.testId === testId);

    if (targetResults.length === 0) {
      return 0;
    }

    try {
      await Promise.all(
        targetResults.map(result =>
          this.removeDocument(
            'vocabTestResults',
            this.getVocabTestResultDocumentId(result)
          )
        )
      );
    } catch (error) {
      console.error('❌ 연결된 단어 테스트 결과 삭제 실패:', error);
      throw error;
    }

    FirebaseStore.vocabTestResults = results.filter(
      result => result.testId !== testId
    );

    return targetResults.length;
  },

  async cleanupOrphanVocabTestResults() {
    if (!FirebaseStore.reviewSourcesReady?.tests || !FirebaseStore.reviewSourcesReady?.vocabTestResults) return 0;
    const tests = this.getTests();
    const results = this.getVocabTestResults();
    const validTestIds = new Set(tests.map(test => test.id));
    const orphanResults = results.filter(
      result => result.testId && !validTestIds.has(result.testId)
    );

    if (orphanResults.length === 0) return 0;

    try {
      await Promise.all(
        orphanResults.map(result =>
          this.removeDocument(
            'vocabTestResults',
            this.getVocabTestResultDocumentId(result)
          )
        )
      );
    } catch (error) {
      console.error('❌ 고아 단어 테스트 결과 정리 실패:', error);
      return 0;
    }

    FirebaseStore.vocabTestResults = results.filter(
      result => !(result.testId && !validTestIds.has(result.testId))
    );

    console.log(`🧹 삭제된 시험에 연결된 단어 테스트 결과 ${orphanResults.length}건 정리 완료`);
    return orphanResults.length;
  },

  async saveVocabTestResult(resultData) {

    const results =
      this.getVocabTestResults();

    const index =
      results.findIndex(result =>

        Number(result.studentId) ===
          Number(resultData.studentId) &&

        Number(result.direction) ===
          Number(resultData.direction) &&

        (
          resultData.testId
            ? result.testId === resultData.testId
            : result.setId === resultData.setId
        )

      );

    const attempt = {
      questionDetails: resultData.questionDetails || [],
      waitingGrading: Boolean(resultData.waitingGrading),
      gradedByAdmin: Boolean(resultData.gradedByAdmin),

      score:
        resultData.score,

      correctCount:
        resultData.correctCount,

      total:
        resultData.total,

      passed:
        resultData.passed,

      wrongAnswers:
        resultData.wrongAnswers || [],

      startedAt:
        resultData.startedAt ||
        resultData.completedAt,

      completedAt:
        resultData.completedAt

    };


    if (index >= 0) {

      const previous =
        results[index];

      // 배포 전 기록도 다음 응시가 덮어쓰기 전에 마지막 상세 답안을 과거 회차에 보존한다.
      const history = (previous.attempts || []).map(item => ({ ...item }));
      const reviewHistory = [...(previous.reviewHistory || [])];
      if (previous.completedAt) {
        const previousIndex = history.findLastIndex(item => item.completedAt === previous.completedAt && (item.startedAt || item.completedAt) === (previous.startedAt || previous.completedAt));
        const previousSnapshot = {
          score: previous.score ?? 0, correctCount: previous.correctCount ?? 0, total: previous.total ?? 0,
          passed: Boolean(previous.passed), waitingGrading: Boolean(previous.waitingGrading), gradedByAdmin: Boolean(previous.gradedByAdmin),
          wrongAnswers: previous.wrongAnswers || [], questionDetails: previous.questionDetails || [],
          startedAt: previous.startedAt || previous.completedAt, completedAt: previous.completedAt
        };
        if (previousIndex >= 0) history[previousIndex] = { ...history[previousIndex], ...previousSnapshot };
        else if (previous.questionDetails?.length) reviewHistory.push(previousSnapshot);
      }

      results[index] = {

        ...previous,

        ...resultData,
        reviewHistory,

        attempts: [

          ...history,

          attempt

        ]

      };

    } else {

      results.push({

        ...resultData,

        attempts: [
          attempt
        ]

      });

    }


    FirebaseStore.vocabTestResults = results;
    const savedResult = results[index >= 0 ? index : results.length - 1];
    if (this.queueVocabResult) return this.queueVocabResult(savedResult);
    try {
      await this.writeDocument(
        'vocabTestResults',
        this.getVocabTestResultDocumentId(savedResult),
        savedResult
      );
    } catch (error) {
      this.reportCloudWriteError('단어 테스트 결과', error);
      throw error;
    }

    return resultData;

  },

  // ── 본문 암기 테스트 결과 ───────────────────────────────

  getTextMemorizeResults() {
    return FirebaseStore.textMemorizeResults || [];
  },

  getTextMemorizeResult(studentId, testId) {
    return this.getTextMemorizeResults()
      .find(r => r.studentId === Number(studentId) && r.testId === testId)
      || null;
  },

  getTextMemorizeResultDocId(result) {
    return `tm_${Number(result.studentId)}_${encodeURIComponent(String(result.testId || 'free'))}`;
  },

  async saveTextMemorizeResult(studentId, testId, rawResult) {
    const { score, correct, total, passed, completedAt, wrongCount, wrongList, mode, cutoffType, cutoffScore, maxWrong, userAnswers, examSentences } = rawResult || {};
    const results = this.getTextMemorizeResults().filter(
      r => !(r.studentId === Number(studentId) && r.testId === testId)
    );
    const newResult = {
      studentId: Number(studentId),
      testId,
      score: Math.round(score),
      correct,
      total,
      passed,
      wrongCount: wrongCount ?? (total - correct),
      wrongList: wrongList || [],
      mode: mode || 'CLOZE',
      cutoffType: cutoffType || 'SCORE',
      cutoffScore: cutoffScore ?? 80,
      maxWrong: maxWrong ?? 3,
      userAnswers: userAnswers || {},
      examSentences: examSentences || [],
      completedAt: completedAt || new Date().toISOString()
    };
    results.push(newResult);
    FirebaseStore.textMemorizeResults = results;

    // 연결된 시험 일정이 있으면 status 업데이트
    if (testId && passed) {
      const tests = this.getTests();
      const idx = tests.findIndex(t => t.id === testId && t.studentId === Number(studentId));
      if (idx >= 0) {
        tests[idx] = { ...tests[idx], status: 'PASS' };
        await this.saveTests(tests);
      }
    }

    try {
      await this.writeDocument(
        'textMemorizeResults',
        this.getTextMemorizeResultDocId(newResult),
        newResult
      );
    } catch (error) {
      this.reportCloudWriteError('본문 암기 결과', error);
      throw error;
    }
    return newResult;
  },

  async deleteTextMemorizeResultsByTestId(testId) {
    const results = await this.loadCollection('textMemorizeResults');
    await Promise.all(results.filter(r => r.testId === testId).map(result =>
      this.removeDocument('textMemorizeResults', result.id || this.getTextMemorizeResultDocId(result))
    ));
    FirebaseStore.textMemorizeResults = results.filter(r => r.testId !== testId);
  },

  // ── 지구과학 특별 테스트 결과 ───────────────────────────

  getSpecialScienceResultDocId(studentId, round) {
    return `special_science_${Number(studentId)}_${Number(round)}`;
  },

  async getSpecialScienceResultsByStudentId(studentId) {
    if (!this.isFirebaseReady()) {
      throw new Error('Firebase가 준비되지 않았습니다.');
    }

    // 기존 학업관리 데이터와 동일하게 허용된 academicData 문서 경로를 사용한다.
    const { doc, getDoc } = window.firebaseFns;
    const snapshot = await this.withCloudTimeout(
      getDoc(doc(window.firebaseDB, 'academicData', 'specialScienceResults')),
      '지구과학 특별 테스트 기록 읽기'
    );
    const items = snapshot.exists() ? Object.values(snapshot.data().items || {}) : [];

    return items.reduce((byRound, rawResult) => {
      const result = { ...rawResult, studentId: Number(rawResult.studentId), round: Number(rawResult.round) };
      if (result.studentId === Number(studentId) && result.round >= 1 && result.round <= 5) {
        byRound[result.round] = result;
      }
      return byRound;
    }, {});
  },

  async saveSpecialScienceResult(studentId, round, result) {
    const savedResult = {
      ...result,
      id: this.getSpecialScienceResultDocId(studentId, round),
      studentId: Number(studentId),
      round: Number(round),
      updatedAt: new Date().toISOString()
    };

    try {
      if (!this.isFirebaseReady()) {
        throw new Error('Firebase가 준비되지 않았습니다.');
      }
      const { doc, getDoc, setDoc } = window.firebaseFns;
      const ref = doc(window.firebaseDB, 'academicData', 'specialScienceResults');
      const snapshot = await this.withCloudTimeout(
        getDoc(ref),
        '지구과학 특별 테스트 기록 읽기'
      );
      const items = snapshot.exists() ? { ...(snapshot.data().items || {}) } : {};
      items[savedResult.id] = savedResult;
      await this.withCloudTimeout(
        setDoc(ref, { items, updatedAt: savedResult.updatedAt }, { merge: true }),
        '지구과학 특별 테스트 기록 저장'
      );
    } catch (error) {
      this.reportCloudWriteError('지구과학 특별 테스트 결과', error);
      throw error;
    }

    return savedResult;
  }

};
