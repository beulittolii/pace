const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function fixture() {
  const context = vm.createContext({ console, Date, Math, setTimeout, clearTimeout,
    localStorage: { getItem: () => null, setItem() {} } });
  const run = code => vm.runInContext(code, context);
  for (const file of ['wordmaster2000_data.js', 'wordmaster_basic_data.js', 'wordmaster_highest_data.js', 'ybm_english2_data.js', 'data.js']) run(read(file));
  run('const writes=[]; AppData.replaceCollection=async (name,items)=>writes.push({name,count:items.length});');
  return run;
}

test('Highest has 50 numbered Days with 30 unique, complete entries each', () => {
  const run = fixture();
  const sets = JSON.parse(run('JSON.stringify(WORDMASTER_HIGHEST_SETS)'));
  assert.equal(sets.length, 50);
  const english = new Set();
  sets.forEach((set, index) => {
    const day = String(index + 1).padStart(2, '0');
    assert.equal(set.id, `wm_highest_day_${day}`);
    assert.equal(set.title, `Day ${day}`);
    assert.equal(set.book, '워드마스터 하이스트');
    assert.equal(set.words.length, 30);
    set.words.forEach(word => {
      assert.match(word.en, /^[A-Za-z][A-Za-z ~'().-]*$/);
      assert.match(word.ko, /[가-힣]/);
      assert.doesNotMatch(word.ko, /[\n\r_�]/);
      assert.equal(typeof word.ipa, 'string');
      assert.equal(english.has(word.en), false, `Duplicate: ${word.en}`);
      english.add(word.en);
    });
  });
  assert.equal(english.size, 1500);
  for (const word of ['inclusive', 'adjacent', 'cumulative', 'alleviate', 'be stricken with', 'lay claim to']) {
    assert.ok(sets[0].words.some(w => w.en === word), `Day 01: ${word}`);
  }
  for (const word of ['analogy', 'conservation', 'municipal', 'spiral', 'waggle', 'match up with']) {
    assert.ok(sets[49].words.some(w => w.en === word), `Day 50: ${word}`);
  }
});

test('Highest is available on a fresh load alongside existing books', () => {
  const run = fixture();
  run('FirebaseStore.vocabSets=[]; FirebaseStore.students=[{id:10001}]; FirebaseStore.studentsLoaded=true;');
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm_highest_')).length"), 50);
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm2000_')).length"), 50);
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm_basic_')).length"), 30);
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm_highest_')).every(s=>s.studentIds.includes(10001))"), true);
  assert.equal(run('writes.length'), 0);
});

test('Highest uses verified textbook order across all 1500 words', () => {
  const run = fixture();
  const sets = JSON.parse(run('JSON.stringify(WORDMASTER_HIGHEST_SETS)'));
  assert.deepEqual(sets[0].words.map(w => w.en), [
    'inclusive', 'adjacent', 'cumulative', 'spur', 'alleviate', 'dispute',
    'viable', 'endeavor', 'submerge', 'decline', 'acquisition', 'remark',
    'obsess', 'friction', 'startle', 'overload', 'hazard', 'spoil',
    'standstill', 'allocation', 'domain', 'hover', 'curb', 'encompass',
    'fierce', 'detest', 'urban', 'howl', 'lay claim to', 'be stricken with'
  ]);
  // Full Day 01~50 order cross-checked against the public sources in the data header.
  // Existing spelling variants are retained; only ordering changes.
  const words = sets.flatMap(set => set.words.map(word => word.en));
  assert.equal(createHash('sha256').update(words.join('\n')).digest('hex'),
    '716f48bec2f6a86b76a930c8b1109d4105b7f810e35c683c3e8d892d1fa5286f');
  const permutations = JSON.parse(run('JSON.stringify(WORDMASTER_HIGHEST_BOOK_ORDER)'));
  assert.equal(permutations.length, 50);
  permutations.forEach(order => assert.deepEqual([...order].sort((a, b) => a - b),
    Array.from({ length: 30 }, (_, index) => index)));
});

test('Highest migrates all alphabetized cached Days without losing edits or repeated writes', () => {
  const run = fixture();
  run(`FirebaseStore.students=[];
    FirebaseStore.vocabSets=JSON.parse(JSON.stringify(getDefaultVocabSets()));
    const savedDays=FirebaseStore.vocabSets.filter(s=>s.id.startsWith('wm_highest_'));
    savedDays.forEach(s=>s.words.sort((a,b)=>a.en.localeCompare(b.en)));
    const editedWord=savedDays[0].words.find(w=>w.en==='inclusive');
    editedWord.ko='직접 수정한 뜻'; editedWord.ipa='custom'; editedWord.note='보존';
    savedDays[0].title='선생님 편집'; savedDays[0].studentIds=[12345];
    const previousResults=[{id:'saved-result',words:[{en:'acquisition',correct:true}]}];
    FirebaseStore.vocabTestResults=previousResults;
    AppData.getVocabSets();`);
  assert.equal(run(`savedDays.every((s,i)=>s.words.every((w,j)=>
    w.en===WORDMASTER_HIGHEST_SETS[i].words[j].en))`), true);
  assert.equal(run('savedDays[0].words[0]===editedWord'), true);
  assert.equal(run('editedWord.ko'), '직접 수정한 뜻');
  assert.equal(run('editedWord.ipa'), 'custom');
  assert.equal(run('editedWord.note'), '보존');
  assert.equal(run('savedDays[0].title'), '선생님 편집');
  assert.equal(run('savedDays[0].studentIds[0]'), 12345);
  assert.equal(run('FirebaseStore.vocabTestResults===previousResults'), true);
  assert.equal(run('writes.length'), 1);
  run('AppData.getVocabSets(); AppData.getVocabSets();');
  assert.equal(run('writes.length'), 1);
});

test('Highest preserves custom word membership and reapplies order after old cloud snapshots', () => {
  const run = fixture();
  run(`FirebaseStore.students=[]; FirebaseStore.vocabSets=JSON.parse(JSON.stringify(getDefaultVocabSets()));
    const edited=FirebaseStore.vocabSets.find(s=>s.id==='wm_highest_day_01');
    edited.words[0]={en:'custom-word',ko:'직접 추가'};
    const editedWords=edited.words;
    const oldCloud=JSON.parse(JSON.stringify(FirebaseStore.vocabSets));
    oldCloud.find(s=>s.id==='wm_highest_day_50').words.sort((a,b)=>a.en.localeCompare(b.en));
    AppData.getVocabSets();`);
  assert.equal(run('edited.words===editedWords'), true);
  assert.equal(run('writes.length'), 0);
  run('FirebaseStore.vocabSets=oldCloud; AppData.getVocabSets();');
  assert.equal(run("FirebaseStore.vocabSets.find(s=>s.id==='wm_highest_day_50').words[0].en"), 'mechanism');
  assert.equal(run("FirebaseStore.vocabSets.find(s=>s.id==='wm_highest_day_01').words[0].en"), 'custom-word');
  assert.equal(run('writes.length'), 1);
});

test('old caches gain missing Days without replacing custom sets or saved edits', () => {
  const run = fixture();
  run(`FirebaseStore.students=[{id:10001}]; FirebaseStore.studentsLoaded=true;
    const custom={id:'custom',book:'개인 단어장',words:[{en:'apple',ko:'사과'}],studentIds:[10001]};
    const edited={...getDefaultVocabSets().find(s=>s.id==='wm_highest_day_01'),title:'선생님 편집',studentIds:[]};
    FirebaseStore.vocabSets=[custom,edited];`);
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm_highest_')).length"), 50);
  assert.equal(run("AppData.getVocabSets().find(s=>s.id==='custom')===custom"), true);
  assert.equal(run("AppData.getVocabSets().find(s=>s.id==='wm_highest_day_01').title"), '선생님 편집');
  assert.equal(run("AppData.getVocabSets().find(s=>s.id==='wm_highest_day_01').studentIds.includes(10001)"), true);
  const count = run('AppData.getVocabSets().length');
  assert.equal(run('AppData.getVocabSets().length'), count);
  assert.equal(run('writes.length'), 1);
});

test('Highest restores after a cloud snapshot replaces the local collection', () => {
  const run = fixture();
  run('FirebaseStore.vocabSets=[]; AppData.getVocabSets(); FirebaseStore.vocabSets=[{id:"cloud-custom",words:[]}];');
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('wm_highest_')).length"), 50);
  assert.equal(run("AppData.getVocabSets().some(s=>s.id==='cloud-custom')"), true);
});

test('page loads Highest before the store and offers its book name', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="wordmaster_highest_data.js?') < html.indexOf('src="data.js?'));
  assert.match(html, /<option value="워드마스터 하이스트"><\/option>/);
});

test('exam selectors list all Highest Days and combine two Days into 60-word scope', () => {
  const run = fixture();
  run(`const window={}; const elements={
    formVocabSetId:{value:'wm_highest_day_01'},formVocabSetId2:{value:'wm_highest_day_02'},
    formVocabTotalWordsCount:{},formVocabSummaryBadge:{},formVocabSelectedListText:{}};
    const document={addEventListener(){},getElementById:id=>elements[id]||null,querySelector:()=>null};`);
  run(read('app.js'));
  run("App.renderFormVocabSetSelect('wm_highest_day_01','wm_highest_day_02')");
  const options = run('elements.formVocabSetId.innerHTML');
  assert.match(options, /워드마스터 하이스트 \(50개 세트\)/);
  assert.equal((options.match(/value="wm_highest_day_/g) || []).length, 50);
  assert.match(options, /Day 50 \(30단어\)/);
  assert.match(run('elements.formVocabTotalWordsCount.innerText'), /총 60단어 중 40단어 랜덤 출제/);
});

test('study modal opens single and multiple Highest Days, including static fallback', () => {
  const run = fixture();
  run(`const window={}; const document={addEventListener(){},getElementById:()=>null};`);
  run(read('app.js'));
  run(`for (const method of ['updateVocabStudyMeaningToggleBtn','updateVocabStudyModeButtons',
    'renderVocabStudyContent','renderVocabStudyFooter','showModal']) App[method]=()=>{};`);
  run("App.openVocabStudyModal('wm_highest_day_01')");
  assert.equal(run('App.state.vocabStudy.words.length'), 30);
  assert.equal(run('App.state.vocabStudy.words[0].en'), 'inclusive');
  assert.equal(run('App.state.vocabStudy.bookName'), '워드마스터 하이스트');
  run("App.openVocabStudyModal('wm_highest_day_01,wm_highest_day_50')");
  assert.equal(run('App.state.vocabStudy.words.length'), 60);
  assert.equal(run('App.state.vocabStudy.words[30].en'), 'mechanism');
  run("AppData.getVocabSets=()=>[]; App.openVocabStudyModal('wm_highest_day_50')");
  assert.equal(run('App.state.vocabStudy.words.length'), 30);
  assert.equal(run("App.state.vocabStudy.words.some(w=>w.en==='municipal')"), true);
  assert.equal(run('App.state.vocabStudy.words[0].en'), 'mechanism');
});

test('YBM lessons use verified unit names and retain publisher vocabulary order', () => {
  const run = fixture();
  const sets = JSON.parse(run('JSON.stringify(YBM_ENGLISH2_VOCAB_SETS)'));
  assert.deepEqual(sets.map(set => set.id), [
    'ybm2_lesson_01', 'ybm2_lesson_02', 'ybm2_lesson_03', 'ybm2_lesson_04'
  ]);
  const expected = [
    // YES24 2026년용 하권 미리보기 p.011~012: 필수 단어 42개 다음 필수 표현 9개.
    ['achievable', 'adversity', 'blessing', 'breath', 'clarity', 'confront',
      'constructive', 'cope', 'crucial', 'cultivate', 'defeated', 'despite',
      'disability', 'exceptional', 'fulfilled', 'gradually', 'imperfection',
      'judge', 'loss', 'medical', 'meditate', 'mindset', 'observe', 'obstacle',
      'opportunity', 'overcome', 'participate', 'particularly', 'passive',
      'potential', 'poverty', 'proceed', 'psychologist', 'realistic', 'regret',
      'reject', 'resilience', 'setback', 'strategy', 'suffering', 'surgery',
      'uncertainty', 'apply A to B', 'be known as', 'bounce back', 'break down into',
      'compete against', 'give it a try', 'look after', 'single out', 'take the form of'],
    ['accessible', 'affordable', 'awkward', 'bulky', 'capable', 'compatibility',
      'component', 'compromise', 'crucial', 'delicate', 'detect', 'determined',
      'diagnosis', 'distribute', 'emerge', 'enhance', 'establish', 'examine',
      'expand', 'external', 'eyepiece', 'high-resolution', 'illuminate', 'infectious',
      'instrument', 'magnification', 'mere', 'microscope', 'organism', 'particle',
      'portable', 'precision', 'project', 'publish', 'remain', 'resource', 'specimen',
      'structure', 'uniform', 'waterproof', 'be responsible for', 'come across',
      'come up with', 'for the benefit of', 'from side to side', 'in progress',
      'make a difference', 'meet requirements', 'settle on', 'take shape']
  ];
  sets.slice(2).forEach((set, index) => {
    assert.equal(set.lesson, index + 3);
    assert.equal(set.book, '백발백중 공통영어 2');
    assert.deepEqual(set.words.map(word => word.en), expected[index]);
    assert.equal(new Set(set.words.map(word => word.en)).size, set.words.length);
    for (const word of set.words) {
      assert.match(word.ko, /[가-힣]/);
      assert.doesNotMatch(word.ko, /[<>�]/);
      assert.equal(typeof word.defEn, 'string');
      assert.equal(typeof word.ipa, 'string');
    }
  });
  assert.equal(sets[2].title, 'Lesson 3. Rise Above Challenges');
  assert.equal(sets[3].title, 'Lesson 4. Creative Ideas for a Better World');
});

test('YBM definitions use the existing defEn format and leave unverified entries empty', () => {
  const run = fixture();
  const sets = JSON.parse(run('JSON.stringify(YBM_ENGLISH2_VOCAB_SETS.slice(2))'));
  const missing = [
    ['achievable', 'medical', 'realistic', 'setback', 'break down into', 'give it a try'],
    ['be responsible for', 'come up with', 'for the benefit of', 'from side to side',
      'make a difference', 'meet requirements', 'settle on']
  ];
  sets.forEach((set, index) => {
    assert.equal(set.words.filter(word => word.defEn).length, [45, 43][index]);
    assert.deepEqual(set.words.filter(word => !word.defEn).map(word => word.en), missing[index]);
    for (const word of set.words) {
      assert.doesNotMatch(word.defEn, /[가-힣<>\n]|^\[/);
    }
  });
  assert.equal(sets[0].words.find(word => word.en === 'imperfection').defEn,
    'a flaw or defect; lack of perfection');
  assert.equal(sets[1].words.find(word => word.en === 'microscope').defEn,
    'a scientific instrument used to magnify and observe very small objects');
});

test('old YBM caches gain lessons 3 and 4 without replacing edits or duplicating sets', () => {
  const run = fixture();
  run(`FirebaseStore.students=[{id:10001}]; FirebaseStore.studentsLoaded=true;
    const edited={...getDefaultVocabSets().find(s=>s.id==='ybm2_lesson_01'),title:'직접 수정한 제목'};
    const custom={id:'custom-ybm',book:'개인 단어장',words:[{en:'apple',ko:'사과'}],studentIds:[10001]};
    FirebaseStore.vocabSets=[edited,custom]; AppData.getVocabSets();`);
  assert.equal(run("AppData.getVocabSets().filter(s=>s.id.startsWith('ybm2_lesson_')).length"), 4);
  assert.equal(run("AppData.getVocabSets().find(s=>s.id==='ybm2_lesson_01')===edited"), true);
  assert.equal(run('edited.title'), '직접 수정한 제목');
  assert.equal(run("AppData.getVocabSets().find(s=>s.id==='custom-ybm')===custom"), true);
  assert.equal(run(`AppData.getVocabSetsByStudentId(10001).filter(s=>
    ['ybm2_lesson_03','ybm2_lesson_04'].includes(s.id)).length`), 2);
  assert.equal(run('writes.length'), 1);
  run('AppData.getVocabSets(); AppData.getVocabSets();');
  assert.equal(run('writes.length'), 1);
});

test('YBM lessons 3 and 4 are selectable for exams and combined vocabulary study', () => {
  const run = fixture();
  run(`const window={}; const elements={
    formVocabSetId:{value:'ybm2_lesson_03'},formVocabSetId2:{value:'ybm2_lesson_04'},
    formVocabTotalWordsCount:{},formVocabSummaryBadge:{},formVocabSelectedListText:{}};
    const document={addEventListener(){},getElementById:id=>elements[id]||null,querySelector:()=>null};`);
  run(read('app.js'));
  run("App.renderFormVocabSetSelect('ybm2_lesson_03','ybm2_lesson_04')");
  const options = run('elements.formVocabSetId.innerHTML');
  assert.match(options, /Lesson 3\. Rise Above Challenges \(51단어\)/);
  assert.match(options, /Lesson 4\. Creative Ideas for a Better World \(50단어\)/);
  assert.match(run('elements.formVocabTotalWordsCount.innerText'), /총 101단어/);
  run(`for (const method of ['updateVocabStudyMeaningToggleBtn','updateVocabStudyModeButtons',
    'renderVocabStudyContent','renderVocabStudyFooter','showModal']) App[method]=()=>{};`);
  run("App.openVocabStudyModal('ybm2_lesson_03,ybm2_lesson_04')");
  assert.equal(run('App.state.vocabStudy.words.length'), 101);
  assert.equal(run('App.state.vocabStudy.words.filter(w=>w.defEn).length'), 88);
  assert.ok(read('index.html').indexOf('src="ybm_english2_data.js?') < read('index.html').indexOf('src="data.js?'));
});

test('outdated YBM titles migrate once without changing vocabulary, assignments or results', () => {
  const run = fixture();
  run(`FirebaseStore.students=[];
    FirebaseStore.vocabSets=JSON.parse(JSON.stringify(getDefaultVocabSets()));
    const lesson3=FirebaseStore.vocabSets.find(s=>s.id==='ybm2_lesson_03');
    const lesson4=FirebaseStore.vocabSets.find(s=>s.id==='ybm2_lesson_04');
    lesson3.title='Lesson 3. Resilience';
    lesson4.title='Lesson 4. Creative Ideas for a Better Life';
    lesson3.studentIds=[12345];
    lesson3.words[0].ko='직접 수정한 뜻';
    lesson3.words[0].defEn='Teacher definition';
    const savedWords3=lesson3.words;
    const savedWords4=lesson4.words;
    const savedAssignments=lesson3.studentIds;
    const savedResults=[{id:'existing-result',setId:lesson3.id,score:100}];
    FirebaseStore.vocabTestResults=savedResults;
    const staleCloud=JSON.parse(JSON.stringify(FirebaseStore.vocabSets));
    AppData.getVocabSets();`);
  assert.equal(run('lesson3.title'), 'Lesson 3. Rise Above Challenges');
  assert.equal(run('lesson4.title'), 'Lesson 4. Creative Ideas for a Better World');
  assert.equal(run('lesson3.words===savedWords3 && lesson4.words===savedWords4'), true);
  assert.equal(run('lesson3.studentIds===savedAssignments'), true);
  assert.equal(run('lesson3.words[0].ko'), '직접 수정한 뜻');
  assert.equal(run('lesson3.words[0].defEn'), 'Teacher definition');
  assert.equal(run('FirebaseStore.vocabTestResults===savedResults'), true);
  assert.equal(run('writes.length'), 1);
  run('AppData.getVocabSets(); AppData.getVocabSets();');
  assert.equal(run('writes.length'), 1);
  run('FirebaseStore.vocabSets=staleCloud; AppData.getVocabSets();');
  assert.equal(run("FirebaseStore.vocabSets.find(s=>s.id==='ybm2_lesson_03').title"),
    'Lesson 3. Rise Above Challenges');
  assert.equal(run('writes.length'), 2);
});

test('YBM title migration leaves custom titles and unrelated sets unchanged', () => {
  const run = fixture();
  run(`FirebaseStore.students=[];
    FirebaseStore.vocabSets=JSON.parse(JSON.stringify(getDefaultVocabSets()));
    const lesson3=FirebaseStore.vocabSets.find(s=>s.id==='ybm2_lesson_03');
    const lesson4=FirebaseStore.vocabSets.find(s=>s.id==='ybm2_lesson_04');
    lesson3.title='선생님이 지정한 3과';
    lesson4.title='선생님이 지정한 4과';
    const custom={id:'custom',title:'Lesson 3. Resilience',words:[]};
    FirebaseStore.vocabSets.push(custom);
    AppData.getVocabSets();`);
  assert.equal(run('lesson3.title'), '선생님이 지정한 3과');
  assert.equal(run('lesson4.title'), '선생님이 지정한 4과');
  assert.equal(run('custom.title'), 'Lesson 3. Resilience');
  assert.equal(run('writes.length'), 0);
});
