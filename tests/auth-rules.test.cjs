const {before,after,beforeEach,test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const f=require('firebase/firestore');
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-pace-auth',firestore:{rules:fs.readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});});
after(async()=>env?.cleanup());
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
 const db=c.firestore();
 await f.setDoc(f.doc(db,'admins','teacher'),{enabled:true});
 await f.setDoc(f.doc(db,'invites','AB12CD'),{code:'AB12CD',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()});
});});
function engine(uid){
 const db=env.authenticatedContext(uid,{email:`${uid}@accounts.pace.invalid`}).firestore();
 const auth=new Function('window',fs.readFileSync('auth.js','utf8')+';return window.PaceAuth;')({document:{},crypto:globalThis.crypto});
 auth.raw=f;auth.db=db;auth.auth={currentUser:{uid,email:`${uid}@accounts.pace.invalid`,displayName:'학생'}};
 return {auth,db};
}
test('actual redemption writes one member/profile and consumes the invitation',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const member=(await f.getDoc(f.doc(db,'members','student1'))).data();
 assert.equal(member.inviteCode,'AB12CD');assert.equal((await f.getDoc(f.doc(db,'students',String(member.studentId)))).data().accountUid,'student1');
 assert.equal((await f.getDoc(f.doc(db,'invites','AB12CD'))).data().status,'used');
 await auth.redeem('AB12CD'); // retry after response loss
 assert.equal((await f.getDoc(f.doc(db,'members','student1'))).data().studentId,member.studentId);
});
test('simultaneous redemption allows exactly one account',async()=>{
 const a=engine('student1'),b=engine('student2');
 const outcomes=await Promise.allSettled([a.auth.redeem('AB12CD'),b.auth.redeem('AB12CD')]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await env.withSecurityRulesDisabled(async c=>assert.equal((await f.getDocs(f.collection(c.firestore(),'members'))).size,1));
});
test('cancelled code and standalone member/profile writes are rejected',async()=>{
 const {auth,db}=engine('student1');
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'invites','AB12CD'),{status:'cancelled'}));
 await assert.rejects(()=>auth.redeem('AB12CD'));
 await assertFails(f.setDoc(f.doc(db,'members','student1'),{uid:'student1',studentId:1000000000001,inviteCode:'AB12CD'}));
 await assertFails(f.setDoc(f.doc(db,'students','1000000000001'),{id:1000000000001,accountUid:'student1'}));
});
test('unregistered accounts cannot enumerate codes, read learning data, or grant admin',async()=>{
 const {db}=engine('student1');
 await assertFails(f.getDocs(f.collection(db,'invites')));
 await assertFails(f.getDocs(f.collection(db,'students')));
 await assertFails(f.setDoc(f.doc(db,'admins','student1'),{enabled:true}));
 await assertFails(f.setDoc(f.doc(db,'invites','AA12BB'),{status:'unused'}));
 await assertFails(f.getDocs(f.collection(db,'academicRecords')));
});
test('teacher issues/cancels codes, but consumed codes cannot be reset',async()=>{
 const db=env.authenticatedContext('teacher').firestore();
 await assertSucceeds(f.setDoc(f.doc(db,'invites','ZZ99YY'),{code:'ZZ99YY',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()}));
 await assertFails(f.setDoc(f.doc(db,'invites','AAAAAA'),{code:'AAAAAA',status:'unused',createdBy:'teacher',createdAt:f.serverTimestamp()}));
 await assertSucceeds(f.updateDoc(f.doc(db,'invites','ZZ99YY'),{status:'cancelled'}));
 await engine('student1').auth.redeem('AB12CD');
 await assertFails(f.updateDoc(f.doc(db,'invites','AB12CD'),{status:'unused'}));
 await assertFails(f.deleteDoc(f.doc(db,'invites','AB12CD')));
});
test('members read only own records; client role flags cannot bypass rules',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 await env.withSecurityRulesDisabled(async c=>{const db=c.firestore();await f.setDoc(f.doc(db,'tests','own'),{studentId:id,type:'VOCAB',status:'SCHEDULED'});await f.setDoc(f.doc(db,'tests','other'),{studentId:42,type:'VOCAB'});});
 await assertSucceeds(f.getDocs(f.query(f.collection(db,'tests'),f.where('studentId','==',id))));
 await assertFails(f.getDocs(f.collection(db,'tests')));
 await assertFails(f.getDoc(f.doc(db,'tests','other')));
 await assertFails(f.updateDoc(f.doc(db,'tests','own'),{studentId:42}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','own'),{status:'PASS',score:90}));
 await env.withSecurityRulesDisabled(c=>f.updateDoc(f.doc(c.firestore(),'students',String(id)),{linking:true}));
 await assertFails(f.updateDoc(f.doc(db,'tests','own'),{score:100}));
});
test('academic storage and grammar/weekly writes remain scoped to the student',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 await assertSucceeds(f.setDoc(f.doc(db,'academicRecords',`academicSchoolGrades_${id}`),{studentId:id,kind:'academicSchoolGrades',items:[],updatedAt:f.serverTimestamp()}));
 await assertFails(f.setDoc(f.doc(db,'academicRecords','academicSchoolGrades_42'),{studentId:42,kind:'academicSchoolGrades',items:[]}));
 const review={id:`weekly_review_${id}_2026-11-02`,type:'VOCAB_REVIEW',studentId:id,weekStart:'2026-11-02',reviewStage:'LOCKED'};
 await assertSucceeds(f.setDoc(f.doc(db,'tests',review.id),review));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests',review.id),{reviewStage:'READY',questions:[],sourceTestIds:[],assignedDays:5,weekdayCompletion:[],unresolvedCount:0}));
 await env.withSecurityRulesDisabled(c=>f.setDoc(f.doc(c.firestore(),'tests','grammar'),{studentId:id,type:'GRAMMAR',grammarStage:'concept'}));
 await assertSucceeds(f.updateDoc(f.doc(db,'tests','grammar'),{grammarStartedAt:new Date().toISOString(),grammarResults:{},grammarStage:'practice'}));
});

test('only teachers can delete weekly reviews and modify automatic-regeneration suppression',async()=>{
 const {auth,db}=engine('student1');await auth.redeem('AB12CD');
 const id=(await f.getDoc(f.doc(db,'members','student1'))).data().studentId;
 const reviewId=`weekly_review_${id}_2026-11-02`;
 const teacher=env.authenticatedContext('teacher').firestore();
 await assertSucceeds(f.setDoc(f.doc(teacher,'tests',reviewId),{id:reviewId,type:'VOCAB_REVIEW',studentId:id,weekStart:'2026-11-02'}));
 await assertFails(f.deleteDoc(f.doc(db,'tests',reviewId)));
 await assertFails(f.updateDoc(f.doc(db,'students',String(id)),{deletedWeeklyReviewIds:[reviewId]}));
 const batch=f.writeBatch(teacher);
 batch.update(f.doc(teacher,'students',String(id)),{deletedWeeklyReviewIds:[reviewId]});
 batch.delete(f.doc(teacher,'tests',reviewId));
 await assertSucceeds(batch.commit());
 assert.deepEqual((await f.getDoc(f.doc(db,'students',String(id)))).data().deletedWeeklyReviewIds,[reviewId]);
 await assertFails(f.updateDoc(f.doc(db,'students',String(id)),{deletedWeeklyReviewIds:[]}));
});
