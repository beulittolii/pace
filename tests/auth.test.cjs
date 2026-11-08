const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateCode, validateAccount, normalizeCode, normalizeId } = require('../auth.js');
test('invites are six uppercase letters/digits and always include both', () => {
  const codes = new Set();
  for (let i=0;i<10000;i++) {
    const code = generateCode();
    assert.match(code,/^[A-Z0-9]{6}$/); assert.match(code,/[A-Z]/); assert.match(code,/[0-9]/);
    codes.add(code);
  }
  assert.ok(codes.size > 9950);
});
test('account validation and normalization', () => {
  assert.equal(normalizeCode(' a1b2c3 '),'A1B2C3'); assert.equal(normalizeId(' Student_1 '),'student_1');
  const account = {name:'학생',loginId:'student_1',password:'my-password',confirmation:'my-password'};
  assert.doesNotThrow(() => validateAccount(account));
  for (const change of [{name:''},{loginId:'ab'},{loginId:'ADMIN'},{password:'1234'},{confirmation:'different'}]) assert.throws(() => validateAccount({...account,...change}));
});
