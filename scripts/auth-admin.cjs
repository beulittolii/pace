/** Operator-only tool. Credentials use ADC, never browser code or CLI password arguments. */
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline/promises');
const projectId = process.env.PACE_FIREBASE_PROJECT;
const command = process.argv[2];
if (!projectId || !['migrate','admin','reset-password'].includes(command)) {
  console.error('Set PACE_FIREBASE_PROJECT; run: node scripts/auth-admin.cjs migrate [--apply] | admin | reset-password'); process.exit(1);
}
initializeApp({ projectId, credential: applicationDefault() });
const db = getFirestore(), auth = getAuth();
function splitAcademic(kind, items) {
  const grouped = new Map();
  const add = (id,key,item) => {
    id=Number(id);
    if (!Number.isSafeInteger(id) || id<1) throw Error(`Unassigned academic record in ${kind}; resolve before migration.`);
    if (!grouped.has(id)) grouped.set(id,Array.isArray(items)?[]:{});
    if (Array.isArray(items)) grouped.get(id).push(item);else grouped.get(id)[key]=item;
  };
  if (Array.isArray(items)) items.forEach(item=>add(item.studentId,null,item));
  else Object.entries(items||{}).forEach(([key,item])=>add(kind==='academicTargetUnivs'?key:item.studentId,key,item));
  return [...grouped].map(([studentId,items])=>({id:`${kind}_${studentId}`,data:{kind,studentId,items}}));
}
async function migrate() {
  const students=await db.collection('students').get(),academic=await db.collection('academicData').get();
  const rows=academic.docs.flatMap(s=>splitAcademic(s.id,s.data().items));
  console.log(`Profiles: ${students.size}; scoped academic documents: ${rows.length}.`);
  if (!process.argv.includes('--apply')) {console.log('Dry run only. Use --apply during a maintenance window after reviewing this count.');return;}
  const backupDir=process.env.PACE_AUTH_BACKUP_DIR || '/private/tmp/pace-auth-backups';
  await fs.mkdir(backupDir,{recursive:true,mode:0o700});
  const backup=path.join(backupDir,`${projectId}-${Date.now()}.json`);
  await fs.writeFile(backup,JSON.stringify({projectId,students:students.docs.map(s=>({id:s.id,data:s.data()})),academicData:academic.docs.map(s=>({id:s.id,data:s.data()}))},null,2),{mode:0o600,flag:'wx'});
  // Create-only makes reruns safe: never overwrite records students have edited since migration.
  for (const row of rows) {
    try {await db.collection('academicRecords').doc(row.id).create({...row.data,updatedAt:FieldValue.serverTimestamp()});}
    catch(e) {if(e.code!==6) throw e;}
  }
  for(const student of students.docs) await student.ref.update({password:FieldValue.delete(),loginId:FieldValue.delete()});
  console.log(`Migration complete. Protected backup: ${backup}`);
}
async function passwordPrompt() {
  if (!process.stdin.isTTY) throw Error('Use an interactive terminal; passwords are never command arguments.');
  process.stdout.write('New password (hidden, 8–64 characters): ');
  const input=process.stdin;input.setRawMode(true);input.resume();input.setEncoding('utf8');
  return new Promise((resolve,reject)=>{
    let password='';
    const cleanup=()=>{input.off('data',read);input.setRawMode(false);input.pause();process.stdout.write('\n');};
    function read(chunk){for(const c of chunk){if(c==='\u0003'){cleanup();reject(Error('Cancelled'));return;}if(c==='\r'||c==='\n'){cleanup();resolve(password);return;}if(c==='\u007f')password=password.slice(0,-1);else password+=c;}}
    input.on('data',read);
  });
}
async function manageUser() {
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const loginId=(await rl.question('Login ID: ')).trim().toLowerCase();rl.close();
  if(!/^[a-z0-9_]{4,20}$/.test(loginId)) throw Error('Use 4–20 lowercase letters, digits or underscores.');
  const password=await passwordPrompt();if(password.length<8||password.length>64)throw Error('Password must be 8–64 characters.');
  const email=`${loginId}@accounts.pace.invalid`;
  let user;
  try {user=await auth.getUserByEmail(email);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
  if(command==='reset-password') {
    if(!user)throw Error('Account not found.');
    await auth.updateUser(user.uid,{password});await auth.revokeRefreshTokens(user.uid);
    console.log('Password reset; refresh tokens revoked. Existing ID tokens expire within their normal lifetime.');
  } else {
    if(user)throw Error('Account already exists. Bootstrap with an unused administrator ID.');
    user=await auth.createUser({email,password,displayName:'관리자'});
    await db.collection('admins').doc(user.uid).set({enabled:true,createdAt:FieldValue.serverTimestamp()});
    console.log('Administrator created. Sign in with the chosen ID.');
  }
}
(command==='migrate'?migrate():manageUser()).catch(e=>{console.error(e.message);process.exitCode=1;});
