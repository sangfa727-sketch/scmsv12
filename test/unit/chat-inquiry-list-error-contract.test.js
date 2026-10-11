const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('inquiry ticket list failures remain errors instead of false empty states', () => {
  const api = fs.readFileSync(path.resolve(__dirname, '../../js/02L_api_chat.js'), 'utf8');
  const chat = fs.readFileSync(path.resolve(__dirname, '../../js/16_chat.js'), 'utf8');
  assert.ok(
    api.includes("if(res?.ok!==true) throw new Error(res?.error||'inquiry_list_failed')"),
    'the API must throw when the inquiry-list RPC does not confirm success'
  );
  assert.ok(
    chat.includes('catch(e){const box=document.getElementById(\'inquiryTicketList\')'),
    'the inquiry workspace must keep a visible error/retry path'
  );
  assert.ok(
    api.includes("async getInquiryTickets(status=null,limit=50)"),
    'the guard must apply to the inquiry list API'
  );
});
