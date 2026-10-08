// Deterministic tests for the community read path of edufeed-embed.js
// (spec: "Sharing and reading community content in edufeed", kind 30818
// naddr1qvzqqqrcvgpzp0wzr7fmrcktw4sgemxh5zsq5auh08vnvlwf0x9anusn7pkft0zgqyv8wumn8ghj7un9d3shjtn9v36kvet9vshx7un89uqzzetyw4nx2ety943k7mtdw4hxjare943k7mn5v4h8gttndpshy6twvu34uam8).
// Runs the real script against in-memory fake relays:  node embed/test/communities.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'edufeed-embed.js'), 'utf8');

// --- fake relays --------------------------------------------------------------
const STORE = {};            // relay url → events
const LOG = [];              // every REQ: [relay, filter]
function matches(ev, f) {
  if (f.ids && !f.ids.includes(ev.id)) return false;
  if (f.kinds && !f.kinds.includes(ev.kind)) return false;
  if (f.authors && !f.authors.includes(ev.pubkey)) return false;
  if (f.until != null && ev.created_at > f.until) return false;
  if (f.since != null && ev.created_at < f.since) return false;
  for (const k of Object.keys(f)) if (k[0] === '#' && !ev.tags.some(t => t[0] === k.slice(1) && f[k].includes(t[1]))) return false;
  return true;
}
class FakeWS {
  constructor(url) { this.url = url; this.subs = {}; setTimeout(() => { if (STORE[url]) this.onopen && this.onopen(); else this.onerror && this.onerror(new Error('no such relay')); }, 0); }
  send(msg) {
    const [type, sub, filter] = JSON.parse(msg);
    if (type !== 'REQ') return;
    LOG.push([this.url, filter]);
    const evs = STORE[this.url].filter(e => matches(e, filter)).sort((a, b) => b.created_at - a.created_at).slice(0, filter.limit || 500);
    setTimeout(() => { for (const e of evs) this.onmessage({ data: JSON.stringify(['EVENT', sub, e]) }); this.onmessage({ data: JSON.stringify(['EOSE', sub]) }); }, 0);
  }
  close() {}
}
let seq = 0;
const hex = (n, len = 64) => n.toString(16).padStart(len, '0');
const key = (name) => hex([...name].reduce((h, c) => h * 31 + c.charCodeAt(0), 7) % 2 ** 40);
function ev(kind, pubkey, tags, opts = {}) {
  return { id: hex(++seq), kind, pubkey, created_at: opts.created_at ?? 1000 + seq, tags, content: opts.content ?? '' };
}
function put(relay, ...evs) { (STORE[relay] = STORE[relay] || []).push(...evs); }
function reset() { for (const k in STORE) delete STORE[k]; LOG.length = 0; }

// --- load the script with a stub DOM -------------------------------------------
global.window = {};
global.WebSocket = FakeWS;
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
global.document = { readyState: 'complete', querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), head: { appendChild() {} } };
// a fresh script instance per mount: the script caches community definitions per page
function freshEmbed() {
  const win = {};
  new Function('window', 'document', 'WebSocket', 'CustomEvent', src)(win, global.document, FakeWS, global.CustomEvent);
  return win.EdufeedEmbed;
}
function mount(opts) {
  return new Promise((resolve, reject) => {
    const listeners = {};
    const el = { dataset: {}, classList: { add() {} }, innerHTML: '', addEventListener: (t, fn) => (listeners[t] = fn), dispatchEvent: (e) => listeners[e.type] && listeners[e.type](e), querySelector: () => null };
    el.addEventListener('edufeed:loaded', e => resolve(e.detail.items));
    setTimeout(() => reject(new Error('timeout; html=' + el.innerHTML.slice(0, 80))), 5000);
    freshEmbed().mount(el, opts);
  });
}
const titles = (items) => items.map(i => i.title).sort();

// --- fixtures ------------------------------------------------------------------
const EVENTS = 'wss://relay.edufeed.org', AMB = 'wss://amb-relay.edufeed.org', RPI = 'wss://relay-rpi.edufeed.org', GROUPS = 'wss://groups.example';
const C = key('community'), ADMIN = key('admin'), PUB = key('publisher'), MEMBER = key('member'), OUTSIDER = key('outsider'), MOD2 = key('moderator2');
const cal = (pubkey, title, extra = [], opts) => ev(31923, pubkey, [['d', title], ['title', title], ['start', '4102444800'], ...extra], opts);
const mat = (pubkey, title, extra = []) => ev(30142, pubkey, [['d', title], ['name', title], ...extra]);
function community(extraTags, opts = {}) {
  return ev(10222, C, [['r', EVENTS], ...extraTags], { created_at: 500, ...opts });
}
function roster() { // 39001 roles + 39002 members
  return [ev(39001, key('grouprelay'), [['d', 'g1'], ['p', ADMIN, 'admin'], ['p', PUB, 'publisher']]), ev(39002, key('grouprelay'), [['d', 'g1'], ['p', MEMBER]])];
}
function baseRelays() { put(AMB); put(RPI); }

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('open community: everything with the h tag, reposts and legacy 30222 included', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['content', 'Calendar'], ['k', '31923']]), cal(OUTSIDER, 'direct', [['h', C]]), cal(OUTSIDER, 'no-h'));
  const shared = cal(OUTSIDER, 'reposted'); put(EVENTS, shared);
  put(AMB, ev(16, MEMBER, [['a', `31923:${OUTSIDER}:reposted`, EVENTS], ['k', '31923'], ['h', C]]));
  const legacy = cal(OUTSIDER, 'legacy'); put(EVENTS, legacy, ev(30222, MEMBER, [['d', 'x'], ['p', C], ['k', '31923'], ['e', legacy.id]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['direct', 'legacy', 'reposted']);
});

test('moderated, access members: author or sharer must be in 39002 ∪ 39001; community key always passes', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']]),
    cal(MEMBER, 'by-member', [['h', C]]), cal(PUB, 'by-role-holder', [['h', C]]), cal(OUTSIDER, 'by-outsider', [['h', C]]), cal(C, 'by-community', [['h', C]]));
  const shared = cal(OUTSIDER, 'outsider-shared-by-member'); put(EVENTS, shared);
  put(AMB, ev(16, MEMBER, [['a', `31923:${OUTSIDER}:outsider-shared-by-member`], ['k', '31923'], ['h', C]]));
  const shared2 = cal(OUTSIDER, 'outsider-shared-by-outsider'); put(EVENTS, shared2);
  put(AMB, ev(16, OUTSIDER, [['a', `31923:${OUTSIDER}:outsider-shared-by-outsider`], ['k', '31923'], ['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['by-community', 'by-member', 'by-role-holder', 'outsider-shared-by-member']);
});

test('access role <role>: only holders of that role in 39001', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923'], ['access', 'role', 'publisher']]),
    cal(MEMBER, 'member', [['h', C]]), cal(PUB, 'publisher', [['h', C]]), cal(ADMIN, 'admin-without-role', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['publisher']);
});

test('access tags on an open community (no membership pointer) are ignored', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['content', 'Calendar'], ['k', '31923'], ['access', 'members']]), cal(OUTSIDER, 'anyone', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['anyone']);
});

test('malformed access tag leaves the section open; first access tag wins', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923'], ['access', 'whatever'], ['access', 'members']]), cal(OUTSIDER, 'anyone', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['anyone']);
});

test('unreachable roster: gated section shows the community key only', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['membership', 'g1', 'wss://down.example'], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']]), cal(MEMBER, 'member', [['h', C]]), cal(C, 'owner', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['owner']);
});

test('kind 30223 override by a current moderator, newer than the definition, replaces the sections', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923']]), cal(OUTSIDER, 'outsider', [['h', C]]), cal(MEMBER, 'member', [['h', C]]));
  put(RPI, ev(30223, ADMIN, [['d', C], ['h', C], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']], { created_at: 600 }));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['member']);
});

test('overrides that are older than the definition, by a non-moderator, or with a wrong d are ignored; newest valid wins', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923']]), cal(OUTSIDER, 'outsider', [['h', C]]), cal(MEMBER, 'member', [['h', C]]), cal(PUB, 'publisher', [['h', C]]));
  put(RPI,
    ev(30223, ADMIN, [['d', C], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']], { created_at: 400 }),       // older than 10222
    ev(30223, PUB, [['d', C], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']], { created_at: 700 }),         // publisher is not a moderator
    ev(30223, ADMIN, [['d', 'wrong'], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']], { created_at: 700 }), // wrong d
    ev(30223, ADMIN, [['d', C], ['content', 'Calendar'], ['k', '31923'], ['access', 'role', 'publisher']], { created_at: 650 }),
    ev(30223, ADMIN, [['d', C], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']], { created_at: 640 }));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['publisher']);
});

test('strict: a kind outside the declared sections yields nothing; without strict it is shown', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['strict', 'content'], ['content', 'Learning'], ['k', '30142']]), cal(OUTSIDER, 'event', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), []);
  reset(); baseRelays();
  put(EVENTS, community([['content', 'Learning'], ['k', '30142']]), cal(OUTSIDER, 'event', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['event']);
});

test('closed community: publisher window via a 30000:<community>:publishers list', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['concord', 'area', EVENTS], ['content', 'Calendar'], ['k', '31923'], ['a', `30000:${C}:publishers`, EVENTS]]),
    ev(30000, C, [['d', 'publishers'], ['p', PUB]]), cal(PUB, 'by-publisher', [['h', C]]), cal(MEMBER, 'by-non-publisher', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['by-publisher']);
});

test('legacy badge gate 30009: holders are the p tags of the issuer\'s kind 8 awards', async () => {
  reset(); baseRelays();
  const badge = `30009:${ADMIN}:helper`;
  put(EVENTS, community([['content', 'Calendar'], ['k', '31923'], ['a', badge]]), ev(8, ADMIN, [['a', badge], ['p', MEMBER]]), cal(MEMBER, 'holder', [['h', C]]), cal(OUTSIDER, 'no-badge', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['holder']);
});

test('section-scoped and enforced relays are queried for content', async () => {
  reset(); baseRelays();
  const SCOPED = 'wss://scoped.example', ENF = 'wss://enforced.example'; put(SCOPED, cal(OUTSIDER, 'from-scoped', [['h', C]])); put(ENF, cal(OUTSIDER, 'from-enforced', [['h', C]]));
  put(EVENTS, community([['r', ENF, 'enforced'], ['content', 'Calendar'], ['k', '31923'], ['r', SCOPED, 'content']]), cal(OUTSIDER, 'from-default', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['from-default', 'from-enforced', 'from-scoped']);
  assert.ok(LOG.some(([r, f]) => r === SCOPED && f['#h']), 'scoped relay was queried for h-tagged content');
});

test('several communities: an item is judged per community and shown if any allows it', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  const C2 = key('community2');
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Calendar'], ['k', '31923'], ['access', 'members']]),
    ev(10222, C2, [['content', 'Calendar'], ['k', '31923']]),
    cal(OUTSIDER, 'both', [['h', C], ['h', C2]]), cal(OUTSIDER, 'only-gated', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: [C, C2] })), ['both']);
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), []);
});

test('no kind 10222: treated as an open community', async () => {
  reset(); baseRelays(); put(EVENTS, cal(OUTSIDER, 'direct', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['direct']);
});

test('addressable content: the newest version per coordinate wins, sharers merge', async () => {
  reset(); baseRelays();
  put(EVENTS, community([['content', 'Calendar'], ['k', '31923']]), ev(31923, OUTSIDER, [['d', 'same'], ['title', 'old'], ['start', '4102444800'], ['h', C]], { created_at: 10 }));
  put(RPI, ev(31923, OUTSIDER, [['d', 'same'], ['title', 'new'], ['start', '4102444800'], ['h', C]], { created_at: 20 }));
  put(EVENTS, ev(10222, C, [['r', RPI], ['content', 'Calendar'], ['k', '31923']], { created_at: 600 }));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: C })), ['new']);
});

test('materials: community + search intersects the relay search with the community content', async () => {
  reset(); baseRelays(); put(GROUPS, ...roster());
  put(EVENTS, community([['membership', 'g1', GROUPS], ['content', 'Learning'], ['k', '30142'], ['access', 'members']]));
  put(AMB, mat(MEMBER, 'Advent in der Schule', [['h', C]]), mat(OUTSIDER, 'Advent outsider', [['h', C]]), mat(MEMBER, 'Ostern', [['h', C]]));
  assert.deepEqual(titles(await mount({ type: 'materials', community: C, search: 'Advent' })).filter(t => /Advent/.test(t)), ['Advent in der Schule']);
});

test('invalid keys yield nothing rather than the unfiltered feed', async () => {
  reset(); baseRelays(); put(EVENTS, cal(OUTSIDER, 'public'));
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', community: 'garbage' })), []);
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all', author: 'garbage' })), []);
  assert.deepEqual(titles(await mount({ type: 'events', when: 'all' })), ['public']);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message.split('\n').join('\n       ')); }
}
console.log(failed ? `${failed} of ${tests.length} failed` : `${tests.length} tests passed`);
process.exit(failed ? 1 : 0);
