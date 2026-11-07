import { onRequestPost } from '../functions/api/telegram.js';

const env = { TELEGRAM_BOT_TOKEN: 'TEST_TOKEN', TELEGRAM_CHAT_ID: '12345' };
const request = (payload, headers = {}) => new Request('https://example.pages.dev/api/telegram', {
  method: 'POST',
  headers: { Origin: 'https://example.pages.dev', 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(payload)
});

let telegramCalls = 0;
globalThis.fetch = async () => {
  telegramCalls++;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

const cases = [
  ['accept valid same-origin payload', request({ kind: 'form', message: 'test' }, {}), env, 200],
  ['reject foreign origin', request({ kind: 'form', message: 'test' }, { Origin: 'https://attacker.example' }), env, 403],
  ['reject unsupported event kind', request({ kind: 'unknown', message: 'test' }), env, 400],
  ['reject missing secrets', request({ kind: 'form', message: 'test' }), {}, 503],
  ['reject non-JSON content type', request({ kind: 'form', message: 'test' }, { 'Content-Type': 'text/plain' }), env, 415],
  ['reject message above 3900 characters', request({ kind: 'form', message: 'x'.repeat(3901) }), env, 400]
];

let failed = 0;
for (const [name, req, vars, expected] of cases) {
  const response = await onRequestPost({ request: req, env: vars });
  const passed = response.status === expected;
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name} (expected ${expected}, got ${response.status})`);
  if (!passed) failed++;
}
console.log(`Mock Telegram API calls: ${telegramCalls} (only the valid request should call it)`);
if (telegramCalls !== 1) failed++;
if (failed) process.exitCode = 1;
