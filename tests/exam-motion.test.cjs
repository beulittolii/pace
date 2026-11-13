const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, { innerHTML: '', textContent: '', classList: { add() {}, remove() {} } }); return nodes.get(id); };
  const context = vm.createContext({ console, Date, Math, window: { addEventListener() {}, scrollTo() {} }, document: { addEventListener() {}, getElementById: node }, localStorage: { removeItem() {} } });
  const run = code => vm.runInContext(code, context);
  run(`const App={state:{isStudentLoggedIn:true,isAdminLoggedIn:false,selectedStudentId:1},getTestTimeStatus:()=>({canStart:true}),updateHeaderActions(){},toast(){},escapeHtml:v=>String(v)};
    const record={id:'g',type:'GRAMMAR',studentId:1,grammarStage:'concept',grammarParts:['concept','practice'],grammarResults:{},grammarContent:{title:'관계대명사'}};
    let writes=0;
    const AppData={getTests:()=>[record],getStudentById:()=>({id:1}),updateGrammarTest:async(id,update)=>{writes++;update(record);return record;}};
    window.ExamPresentation={ensureMode:async()=>null};
    const WeeklyReviewLogic={available:()=>true,shuffle:v=>v};`);
  for (const file of ['grammar.js', 'weekly_review.js']) run(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  // Keep unrelated visual methods outside these start-boundary unit tests.
  run('App.showGrammarView=()=>{};App.renderGrammarExam=()=>{};App.lockGrammarNavigation=()=>{};App.unlockGrammarNavigation=()=>{};');
  return { run, context, node };
}

test('cancelled first presentation choice does not write a grammar start', async () => {
  const f = fixture(); await f.run("App.startGrammarTest('g')");
  assert.equal(f.run('writes'), 0);
  assert.equal(f.run('App.state.grammarTest'), undefined);
});

test('student switches during first choice cannot start the previous student exam', async () => {
  const f = fixture();
  f.run('let release;window.ExamPresentation.ensureMode=()=>new Promise(resolve=>{release=resolve;});');
  const start = f.run("App.startGrammarTest('g')");
  assert.equal(f.run('typeof release'), 'function');
  f.run("App.state.selectedStudentId=2;release('motion');"); await start;
  assert.equal(f.run('writes'), 0);
});

test('motion shell uses a minimal escaped masthead and does not inject the old exam chrome', () => {
  const file = path.join(__dirname, '../exam_motion.js');
  assert.ok(fs.existsSync(file), 'motion shell must exist');
  const context = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const html = context.window.ExamMotionPaper.header('grammar', '관계<대명사>', ['안내 & 확인']);
  assert.match(html, /문법 테스트/); assert.match(html, /관계&lt;대명사&gt;/); assert.match(html, /<li>안내 &amp; 확인<\/li>/);
  assert.doesNotMatch(html, /PACE|CONCEPT|성명|응시일/);
});

module.exports = { fixture };

function renderFixture() {
  const f = fixture();
  for (const name of ['grammar_data.js', 'grammar_paper.js', 'exam_motion.js']) f.run(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
  return f;
}

test('motion practical renders all ten actual questions and fifty grouped choices in source order', () => {
  const f = renderFixture();
  assert.equal(f.run('typeof window.ExamMotionPaper.grammarContent'), 'function');
  f.run("const session={test:{grammarStage:'practice',grammarContent:GRAMMAR_UNITS['relative-pronouns']},answers:{practice:{0:3}}};");
  const html = f.run('window.ExamMotionPaper.grammarContent(session)');
  assert.equal((html.match(/data-motion-question=/g) || []).length, 10);
  assert.equal((html.match(/type="radio"/g) || []).length, 50);
  assert.equal((html.match(/ checked/g) || []).length, 1);
  assert.ok(html.indexOf('data-motion-question="4"') < html.indexOf('data-motion-question="5"'));
  assert.doesNotMatch(html, /다음 문항/);
  assert.match(html, /App.submitGrammarPractice/);
});

test('motion concepts keep the exact original common paper and every original blank key', () => {
  const f = renderFixture();
  assert.equal(f.run('typeof window.ExamMotionPaper.grammarContent'), 'function');
  for (const [id, expected] of [['subjunctive', 34], ['relative-pronouns', 42]]) {
    f.run(`App.state.grammarTest={test:{grammarStage:'concept',grammarContent:GRAMMAR_UNITS['${id}'],grammarParts:['concept','practice']},answers:{concept:{}}};`);
    const html = f.run('window.ExamMotionPaper.grammarContent(App.state.grammarTest)');
    const common = f.run('GrammarPaper.render(App.state.grammarTest.test.grammarContent,(text,key)=>App.renderGrammarText(text,key,{}))');
    assert.ok(html.includes(common));
    assert.equal((html.match(/data-grammar-blank=/g) || []).length, expected);
  }
});

test('motion weekly spelling has a wide input without revealing answer length and reuses review submission', () => {
  const f = renderFixture();
  assert.equal(f.run('typeof window.ExamMotionPaper.weeklyContent'), 'function');
  f.run("const review={round:1,answers:{},questions:[{id:'spelling1',mode:'SPELLING',word:{en:'opportunity',ko:'기회'}}]};");
  const html = f.run('window.ExamMotionPaper.weeklyContent(review)');
  assert.match(html, /기회/); assert.doesNotMatch(html, /opportunity|maxlength|size="11"/);
  assert.match(html, /autocapitalize="off"/); assert.match(html, /spellcheck="false"/);
  assert.match(html, /App.submitWeeklyReview/);
});
