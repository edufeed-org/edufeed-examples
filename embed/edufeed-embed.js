/*!
 * edufeed-embed.js — drop-in widget that renders Edufeed calendar events (NIP-52)
 * and learning resources (NIP-AMB, kind 30142) into any HTML page.
 *
 * No build step, no dependencies, no iframe. Read-only.
 *
 *   <div data-edufeed="events" data-limit="5"></div>
 *   <div data-edufeed="materials" data-subject="Religion"></div>
 *   <div data-edufeed="search" data-placeholder="Material suchen…"></div>
 *   <script src="https://edufeed-org.github.io/edufeed-examples/embed/edufeed-embed.js"></script>
 *
 * Attributes (all optional):
 *   data-relay      WebSocket URL. Default: wss://relay.edufeed.org (events),
 *                   wss://amb-relay.edufeed.org (materials)
 *   data-limit      max items to show (default 12, max 250)
 *   data-layout     "cards" | "list"  (default cards)
 *   data-lang       UI language "de" | "en" (default de)
 *   data-author     hex pubkey or npub — only items signed by this key (one person).
 *                   Several keys, comma separated, mean "any of them".
 *   data-community  hex pubkey or npub of an Edufeed community (kind 10222) — the
 *                   community's content as its page would show it (spec "Sharing and
 *                   reading community content"): h-tagged items, kind 6/16 reposts and
 *                   legacy kind 30222 shares, filtered by the community's access rules
 *                   (NIP-29 roster, publisher window, badges) and section overrides.
 *                   Several keys, comma separated, mean "any of them".
 *                   Combinable with data-author ("only X's items in community Y").
 *   events only (the widget loads all calendar events of the relay in pages of
 *   500 and filters/sorts them here, since relays cannot filter by start date):
 *     data-when     "upcoming" | "today" | "past" | "all"  (default upcoming; upcoming
 *                   lists today's and future events first, then still-running ones
 *                   that started on an earlier day; today = everything taking place today)
 *     data-days     with upcoming: only the next N days; with past: only the last N days
 *     data-from     YYYY-MM-DD — fixed range instead of data-when; data-to is inclusive
 *     data-to       and optional (default: open end)
 *     data-kinds    comma list, default "31922,31923"
 *   materials and search:
 *     data-search   full-text search (NIP-50, server side); for "search" the initial query
 *     data-keyword  exact keyword / t-tag
 *     data-subject  subject label, e.g. "Religion" (client side, prefLabel:de)
 *     data-language inLanguage code, e.g. "de"
 *   search only (interactive search box over materials):
 *     data-placeholder  placeholder text of the input field
 *     data-min          minimum characters before searching (default 2)
 *
 * Programmatic: EdufeedEmbed.mount(element, { type: 'events', limit: 5 })
 * Source: https://github.com/edufeed-org/edufeed-examples
 */
(function () {
  'use strict';

  var DEFAULT_RELAY = { events: 'wss://relay.edufeed.org', materials: 'wss://amb-relay.edufeed.org' };
  var RELAY_MAX = 250;          // per-REQ cap of amb-relay.edufeed.org (materials)
  var EVENTS_PAGE = 500;        // per-REQ cap of relay.edufeed.org (events)
  var EVENTS_MAX_PAGES = 20;    // events: up to 20 x 500 = 10 000 events per widget
  var TIMEOUT_MS = 15000;       // per page

  var I18N = {
    de: { loading: 'Lade Daten von Edufeed…', error: 'Daten konnten nicht geladen werden.', empty: 'Nichts gefunden.',
          allday: 'ganztägig', noimage: 'kein Bild', free: 'kostenlos',
          placeholder: 'Lernmaterial suchen…', searchBtn: 'Suchen', hint: 'Suchbegriff eingeben – z. B. Advent, Schöpfung, Demokratie',
          hits: function (n) { return n === 1 ? '1 Treffer' : n + ' Treffer'; },
          wkd: ['So','Mo','Di','Mi','Do','Fr','Sa'],
          mon: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'] },
    en: { loading: 'Loading from Edufeed…', error: 'Could not load data.', empty: 'Nothing found.',
          allday: 'all day', noimage: 'no image', free: 'free',
          placeholder: 'Search learning resources…', searchBtn: 'Search', hint: 'Type a search term – e.g. climate, democracy',
          hits: function (n) { return n === 1 ? '1 result' : n + ' results'; },
          wkd: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
          mon: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] }
  };

  var CSS = '\
.ef-embed{font-family:inherit;color:inherit;line-height:1.45;box-sizing:border-box}\
.ef-embed *,.ef-embed *::before,.ef-embed *::after{box-sizing:border-box}\
.ef-embed a{color:inherit;text-decoration:none}\
.ef-embed .ef-status{color:#6b7280;font-size:.9em;padding:12px;border:1px dashed #d1d5db;border-radius:8px;text-align:center}\
.ef-embed .ef-status.ef-error{color:#b8344a;border-color:#b8344a}\
.ef-embed .ef-cards{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}\
.ef-embed .ef-card{display:flex;flex-direction:column;border:1px solid #e3dfd4;border-radius:10px;background:#fff;color:#1f2533;overflow:hidden;transition:border-color .12s,transform .12s}\
.ef-embed a.ef-card:hover{border-color:#2a5db0;transform:translateY(-2px)}\
.ef-embed .ef-thumb{width:100%;aspect-ratio:4/3;background:#f3f1ea center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#9aa0ad;font-size:12px;border-bottom:1px solid #e3dfd4}\
.ef-embed .ef-body{padding:11px 13px 13px;display:flex;flex-direction:column;gap:5px;flex-grow:1}\
.ef-embed .ef-title{margin:0;font-size:15px;font-weight:600;line-height:1.3}\
.ef-embed .ef-when{font-size:12px;font-weight:600;color:#2a5db0;text-transform:uppercase;letter-spacing:.04em}\
.ef-embed .ef-desc{font-size:13px;color:#5f6776;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}\
.ef-embed .ef-meta{margin-top:auto;display:flex;flex-wrap:wrap;gap:5px;font-size:11.5px;color:#5f6776;padding-top:4px}\
.ef-embed .ef-badge{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;background:#eaf0fa;color:#2a5db0;font-weight:600}\
.ef-embed .ef-badge.ef-cc{background:#f0eee3;color:#b8651b}\
.ef-embed .ef-list{border:1px solid #e3dfd4;border-radius:10px;background:#fff;color:#1f2533;overflow:hidden}\
.ef-embed .ef-row{display:grid;grid-template-columns:64px 1fr;gap:12px;padding:10px 14px;border-bottom:1px solid #e3dfd4;align-items:center}\
.ef-embed .ef-row:last-child{border-bottom:0}\
.ef-embed a.ef-row:hover{background:#f3f1ea}\
.ef-embed .ef-row .ef-date{text-align:center;line-height:1.1}\
.ef-embed .ef-row .ef-date b{display:block;font-size:22px;color:#2a5db0}\
.ef-embed .ef-row .ef-date span{font-size:11px;color:#5f6776;text-transform:uppercase}\
.ef-embed .ef-row .ef-lthumb{width:64px;height:48px;border-radius:4px;background:#f3f1ea center/cover no-repeat}\
.ef-embed .ef-row .ef-title{font-size:14px}\
.ef-embed .ef-search{display:flex;gap:8px;margin-bottom:12px}\
.ef-embed .ef-search input{flex:1;min-width:0;font:inherit;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#1f2533}\
.ef-embed .ef-search input:focus{outline:2px solid #2a5db0;outline-offset:0;border-color:#2a5db0}\
.ef-embed .ef-search button{font:inherit;font-weight:600;padding:8px 16px;border:0;border-radius:8px;background:#2a5db0;color:#fff;cursor:pointer}\
.ef-embed .ef-search button:hover{background:#234d93}\
.ef-embed .ef-count{font-size:12.5px;color:#6b7280;margin:0 0 8px}\
.ef-embed .ef-row .ef-sub{font-size:12.5px;color:#5f6776;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\
';

  // --- utilities -----------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).replace(/\s+$/, '') + '…' : s; }
  function safeUrl(u) {
    if (!u) return null;
    try { var x = new URL(u); return (x.protocol === 'http:' || x.protocol === 'https:') ? x.toString() : null; }
    catch (e) { return null; }
  }
  function tag(ev, name) { for (var i = 0; i < ev.tags.length; i++) if (ev.tags[i][0] === name) return ev.tags[i][1]; return null; }
  function tags(ev, name) { var out = []; for (var i = 0; i < ev.tags.length; i++) if (ev.tags[i][0] === name) out.push(ev.tags[i][1]); return out; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // "YYYY-MM-DD" (local midnight) or a Date → Date, else null
  function parseDay(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v) ? null : v;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v).trim());
    if (!m) { warn('ignoring date', JSON.stringify(v), '– expected YYYY-MM-DD'); return null; }
    return new Date(+m[1], +m[2] - 1, +m[3]);
  }

  // bech32 npub → hex (NIP-19), so data-author accepts both forms
  var B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function npubToHex(s) {
    s = s.toLowerCase();
    if (s.indexOf('npub1') !== 0) return null;
    var data = s.slice(5, -6), bits = 0, acc = 0, bytes = [];
    for (var i = 0; i < data.length; i++) {
      var v = B32.indexOf(data[i]); if (v < 0) return null;
      acc = (acc << 5) | v; bits += 5;
      if (bits >= 8) { bits -= 8; bytes.push((acc >> bits) & 255); }
    }
    if (bytes.length !== 32) return null;
    return bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function toHexPubkey(a) {
    if (!a) return null;
    a = a.trim();
    if (/^[0-9a-f]{64}$/i.test(a)) return a.toLowerCase();
    return npubToHex(a);
  }
  // "npub1…, hex, npub1…" or an array → array of hex keys. null when nothing was
  // given; an empty array when something was given but no key is valid (the
  // widget then shows nothing rather than the unfiltered feed).
  function toHexPubkeys(v) {
    if (!v || (Array.isArray(v) && !v.length)) return null;
    var parts = Array.isArray(v) ? v : String(v).split(/[\s,]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) { var h = toHexPubkey(parts[i]); if (h && out.indexOf(h) < 0) out.push(h); }
    if (!out.length) warn('no valid key in', JSON.stringify(v), '– expected npub1… or 64 hex characters');
    return out;
  }

  // --- network: REQ, collect until EOSE, optionally page backwards ------------
  // A relay answers `limit` with the most recently *created* events, not the
  // ones happening next, and caps every REQ (relay.edufeed.org: 500). With
  // pages > 1, after each EOSE another REQ is sent on the same socket with
  // until = oldest created_at seen so far, until a page brings nothing new
  // or `pages` is reached. Dedup by id.
  function query(relay, filter, cb, pages) {
    var ws, done = false, events = [], base = 'ef-' + Math.random().toString(36).slice(2, 9);
    var seen = {}, subId, page = 0, pageNew = 0, oldest = null, timer;
    pages = pages || 1;
    function finish(err) {
      if (done) return; done = true; clearTimeout(timer);
      try { ws.close(); } catch (e) {}
      cb(err, events);
    }
    function send() {
      page++; pageNew = 0; subId = base + '-' + page;
      var f = {}; for (var k in filter) f[k] = filter[k];
      if (oldest !== null) f.until = oldest;
      clearTimeout(timer);
      timer = setTimeout(function () { finish(events.length ? null : new Error('timeout')); }, TIMEOUT_MS);
      ws.send(JSON.stringify(['REQ', subId, f]));
    }
    try { ws = new WebSocket(relay); } catch (e) { return cb(e, []); }
    timer = setTimeout(function () { finish(new Error('timeout')); }, TIMEOUT_MS);
    ws.onopen = send;
    ws.onmessage = function (m) {
      var f; try { f = JSON.parse(m.data); } catch (e) { return; }
      if (f[0] === 'EVENT' && f[1] === subId) {
        var ev = f[2];
        if (!seen[ev.id]) { seen[ev.id] = 1; events.push(ev); pageNew++; }
        if (oldest === null || ev.created_at < oldest) oldest = ev.created_at;
      } else if (f[0] === 'EOSE' && f[1] === subId) {
        try { ws.send(JSON.stringify(['CLOSE', subId])); } catch (e) {}
        if (page < pages && pageNew > 0) send(); else finish(null);
      } else if (f[0] === 'CLOSED' && f[1] === subId) {
        finish(events.length ? null : new Error(f[2] || 'closed'));
      }
    };
    ws.onerror = function () { finish(new Error('websocket error')); };
    ws.onclose = function () { finish(events.length ? null : new Error('connection closed')); };
  }

  // --- communities (Communikey: "Sharing and reading community content") ------
  // A community is a key that published a kind 10222. Reading it, per the spec:
  //  1. load the definition; type = concord → closed, membership → moderated,
  //     neither → open; parse the content sections (strict = exhaustive)
  //  2. moderated: apply a kind 30223 section override by a current moderator
  //  3. gather content from three sources: h-tagged events, kind 6/16 reposts
  //     and legacy kind 30222 targeted publications; resolve their references
  //  4. resolve each section's allowed authors against the roster as it is now
  //  5. keep an item only if its author, or the sharer of a repost, is allowed
  var COMMUNITY_RELAYS = ['wss://relay.edufeed.org', 'wss://relay-rpi.edufeed.org']; // kinds 10222, 30222, 30223
  var SHARE_RELAYS = ['wss://amb-relay.edufeed.org', 'wss://relay.edufeed.org'];     // kind 6/16 reposts (sharer's outbox + app relays)
  var MOD_ROLES = { admin: 1, king: 1, moderator: 1 };
  var CHUNK = 50;

  function uniq(arr) { var out = [], seen = {}; for (var i = 0; i < arr.length; i++) if (arr[i] && !seen[arr[i]]) { seen[arr[i]] = 1; out.push(arr[i]); } return out; }
  function warn() { if (window.console && console.warn) console.warn.apply(console, ['edufeed-embed:'].concat([].slice.call(arguments))); }
  // run fn(item, done) for every item in parallel, then cb()
  function each(items, fn, cb) {
    var n = items.length; if (!n) return cb();
    for (var i = 0; i < items.length; i++) fn(items[i], function () { if (--n === 0) cb(); });
  }
  // same REQ on several relays, merged and deduped by id; fails only if every relay fails
  function queryMany(relays, filter, cb, pages) {
    relays = uniq(relays);
    var all = [], seen = {}, errs = 0;
    each(relays, function (relay, done) {
      query(relay, filter, function (err, evs) {
        if (err) errs++;
        else for (var i = 0; i < evs.length; i++) if (!seen[evs[i].id]) { seen[evs[i].id] = 1; all.push(evs[i]); }
        done();
      }, pages);
    }, function () { cb(errs === relays.length ? new Error('no relay answered') : null, all); });
  }
  // several filters, in chunks, on several relays
  function queryChunks(relays, filters, cb) {
    var all = [], seen = {};
    each(filters, function (f, done) {
      queryMany(relays, f, function (err, evs) {
        if (!err) for (var i = 0; i < evs.length; i++) if (!seen[evs[i].id]) { seen[evs[i].id] = 1; all.push(evs[i]); }
        done();
      });
    }, function () { cb(null, all); });
  }
  function chunk(arr, n) { var out = []; for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
  // newest event; same-second ties go to the lower id
  function newest(evs) {
    var best = null;
    for (var i = 0; i < evs.length; i++) if (!best || evs[i].created_at > best.created_at || (evs[i].created_at === best.created_at && evs[i].id < best.id)) best = evs[i];
    return best;
  }
  function coord(ev) { return ev.kind + ':' + ev.pubkey + ':' + (tag(ev, 'd') || ''); }
  // addressable kinds (30000–39999): keep only the newest event per coordinate
  function dedupeAddressable(evs) {
    var byCoord = {}, out = [];
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (ev.kind < 30000 || ev.kind >= 40000) { out.push(ev); continue; }
      var c = coord(ev), cur = byCoord[c];
      if (!cur) byCoord[c] = ev;
      else if (ev.created_at > cur.created_at || (ev.created_at === cur.created_at && ev.id < cur.id)) { ev._sharers = uniq((ev._sharers || []).concat(cur._sharers || [])); byCoord[c] = ev; }
      else cur._sharers = uniq((cur._sharers || []).concat(ev._sharers || []));
    }
    for (var k in byCoord) out.push(byCoord[k]);
    return out;
  }

  // Section block of a kind 10222 (full = true) or a kind 30223 override, where
  // only content / k / access count. A section's gate is its first access tag
  // (or, on the definition, a legacy `a` profile list / badge); `r … content`
  // scopes a relay to the section.
  function parseSections(tags, full) {
    var sections = [], cur = null;
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      if (t[0] === 'content') { cur = { name: t[1], kinds: [], gate: null, relays: [] }; sections.push(cur); continue; }
      if (!cur) continue;
      if (t[0] === 'k') cur.kinds.push(Number(t[1]));
      else if (t[0] === 'access' && !cur.gate) cur.gate = { type: 'access', value: t[1], role: t[2] };
      else if (full && t[0] === 'a' && !cur.gate && /^3000[09]:/.test(t[1] || '')) cur.gate = { type: 'list', coord: t[1], hint: t[2] };
      else if (full && t[0] === 'r' && t[2] === 'content' && t[1]) cur.relays.push(t[1]);
    }
    return sections;
  }
  function parseCommunity(ev) {
    var c = { pubkey: ev.pubkey, created_at: ev.created_at, type: 'open', strict: false, relays: [], enforced: [], membership: null, roster: null, sections: [] };
    var hasM = false, hasC = false;
    for (var i = 0; i < ev.tags.length; i++) {
      var t = ev.tags[i];
      if (t[0] === 'membership' && t[1]) { hasM = true; c.membership = { gid: t[1], relay: t[2] }; }
      else if (t[0] === 'concord') hasC = true;
      else if (t[0] === 'strict' && t[1] === 'content') c.strict = true;
      else if (t[0] === 'r' && t[1] && t[2] !== 'content') { c.relays.push(t[1]); if (t[2] === 'enforced') c.enforced.push(t[1]); }
    }
    c.type = hasM && hasC ? 'open' : hasC ? 'closed' : hasM ? 'moderated' : 'open'; // both pointers → treated as open
    c.sections = parseSections(ev.tags, true);
    return c;
  }
  // NIP-29 root group roster: members = 39002 ∪ everyone in 39001; roles from 39001
  function loadRoster(m, cb) {
    if (!m.relay) return cb(new Error('membership without relay'));
    query(m.relay, { kinds: [39001, 39002], '#d': [m.gid] }, function (err, evs) {
      if (err) return cb(err);
      var admins = newest(evs.filter(function (e) { return e.kind === 39001; }));
      var members = newest(evs.filter(function (e) { return e.kind === 39002; }));
      if (!admins && !members) return cb(new Error('group not found'));
      var r = { members: {}, roles: {}, mods: {} };
      if (members) tags(members, 'p').forEach(function (pk) { r.members[pk] = 1; });
      if (admins) for (var i = 0; i < admins.tags.length; i++) {
        var t = admins.tags[i]; if (t[0] !== 'p' || !t[1]) continue;
        r.members[t[1]] = 1; r.roles[t[1]] = t.slice(2);
        for (var j = 2; j < t.length; j++) if (MOD_ROLES[t[j]]) r.mods[t[1]] = 1;
      }
      cb(null, r);
    });
  }
  // kind 30223 by a current moderator, newer than the definition, newest wins
  function applyOverride(c, cb) {
    if (c.type !== 'moderated' || !c.roster) return cb();
    queryMany(COMMUNITY_RELAYS.concat(c.relays), { kinds: [30223], '#d': [c.pubkey] }, function (err, evs) {
      var valid = (evs || []).filter(function (e) { return tag(e, 'd') === c.pubkey && c.roster.mods[e.pubkey] && e.created_at > c.created_at; });
      var ov = newest(valid);
      if (ov) c.sections = parseSections(ov.tags, false);
      cb();
    });
  }
  var communityCache = {};
  function loadCommunity(pk, baseRelays, cb) {
    var slot = communityCache[pk];
    if (slot) { if (slot.c) return cb(slot.c); return slot.q.push(cb); }
    slot = communityCache[pk] = { c: null, q: [cb] };
    function done(c) { slot.c = c; var q = slot.q; slot.q = []; for (var i = 0; i < q.length; i++) q[i](c); }
    queryMany(COMMUNITY_RELAYS.concat(baseRelays), { kinds: [10222], authors: [pk] }, function (err, evs) {
      var def = newest(evs || []);
      if (!def) { warn('no community definition (kind 10222) for', pk, '– treating it as an open community'); return done(parseCommunity({ pubkey: pk, created_at: 0, tags: [] })); }
      var c = parseCommunity(def);
      if (c.type !== 'moderated') return done(c);
      loadRoster(c.membership, function (err, roster) {
        if (err) warn('roster of community', pk, 'unavailable (' + err.message + ') – gated sections show the community key only');
        c.roster = roster || null;
        applyOverride(c, function () { done(c); });
      });
    });
  }
  // allowed authors of a section: null = everyone, else a set; {} = community key only
  function resolveGate(c, gate, cb) {
    if (!gate) return cb(null);
    if (gate.type === 'access') {
      if (c.type !== 'moderated') return cb(null);         // no roster → open
      if (!c.roster) return cb({});                        // roster unavailable → owner only
      if (gate.value === 'members') return cb(c.roster.members);
      if (gate.value === 'role' && gate.role) { var set = {}; for (var pk in c.roster.roles) if (c.roster.roles[pk].indexOf(gate.role) >= 0) set[pk] = 1; return cb(set); }
      return cb(null);                                     // malformed → open
    }
    var p = gate.coord.split(':'), kind = Number(p[0]), author = p[1], d = p.slice(2).join(':');
    var relays = [gate.hint].concat(c.relays, COMMUNITY_RELAYS);
    if (kind === 30000) {
      queryMany(relays, { kinds: [30000], authors: [author], '#d': [d] }, function (err, evs) {
        var ev = newest(evs || []); if (!ev) return cb({});   // unreachable list → owner only
        var set = {}; tags(ev, 'p').forEach(function (pk) { set[pk] = 1; }); cb(set);
      });
    } else { // 30009 badge: holders are the p tags of the issuer's kind 8 awards
      queryMany(relays, { kinds: [8], authors: [author], '#a': [gate.coord] }, function (err, evs) {
        var set = {}; (evs || []).forEach(function (ev) { tags(ev, 'p').forEach(function (pk) { set[pk] = 1; }); }); cb(set);
      });
    }
  }
  // Content of one community for the given kinds: raw events, each with
  // _sharers (pubkeys that reposted it in), already filtered by access rules.
  function loadCommunityContent(c, kinds, baseRelays, pages, cb) {
    var byKind = {};
    c.sections.forEach(function (s) { s.kinds.forEach(function (k) { if (!byKind[k]) byKind[k] = s; }); });
    var wanted = c.strict ? kinds.filter(function (k) { return byKind[k]; }) : kinds;
    if (!wanted.length) return cb(null, []);
    var scoped = []; wanted.forEach(function (k) { if (byKind[k]) scoped = scoped.concat(byKind[k].relays); });
    var contentRelays = uniq(baseRelays.concat(scoped.length ? scoped : c.relays, c.enforced));
    var out = {}, refsA = {}, refsE = {};
    function add(ev, sharers) {
      if (wanted.indexOf(ev.kind) < 0) return;
      var e = out[ev.id] || (out[ev.id] = ev);
      e._sharers = uniq((e._sharers || []).concat(sharers || []));
    }
    function ref(map, key, sharer) {
      (map[key] || (map[key] = { sharers: [] })).sharers.push(sharer);
    }
    function collectRefs(ev) { // a repost / targeted publication → remember what it shares
      var k = tag(ev, 'k'); if (k && wanted.indexOf(Number(k)) < 0) return;
      ev.tags.forEach(function (t) {
        if (t[0] === 'a' && t[1] && wanted.indexOf(Number(t[1].split(':')[0])) >= 0) ref(refsA, t[1], ev.pubkey);
        else if (t[0] === 'e' && t[1]) ref(refsE, t[1], ev.pubkey);
      });
    }
    each([
      function (done) { // 1. original content carrying the h tag
        queryMany(contentRelays, { kinds: wanted, '#h': [c.pubkey], limit: pages > 1 ? EVENTS_PAGE : RELAY_MAX }, function (err, evs) { (evs || []).forEach(function (ev) { add(ev); }); done(); }, pages);
      },
      function (done) { // 2. NIP-18 reposts with h tags, on the sharers' outbox relays
        queryMany(uniq(SHARE_RELAYS.concat(c.relays, baseRelays)), { kinds: [6, 16], '#h': [c.pubkey], limit: EVENTS_PAGE }, function (err, evs) { (evs || []).forEach(collectRefs); done(); });
      },
      function (done) { // 3. legacy kind 30222 targeted publications
        queryMany(COMMUNITY_RELAYS.concat(c.relays), { kinds: [30222], '#p': [c.pubkey], '#k': wanted.map(String), limit: EVENTS_PAGE }, function (err, evs) { (evs || []).forEach(collectRefs); done(); });
      }
    ], function (fn, done) { fn(done); }, function () {
      // Resolve the shared references. The relay hints on reposts are NOT
      // followed: anyone can publish a repost, and the widget cannot verify
      // signatures, so it only talks to the community's and edufeed's relays.
      var aByKind = {}, ids = Object.keys(refsE);
      for (var a in refsA) { var p = a.split(':'); (aByKind[p[0]] = aByKind[p[0]] || { authors: [], ds: [] }); aByKind[p[0]].authors.push(p[1]); aByKind[p[0]].ds.push(p.slice(2).join(':')); }
      var filters = [];
      for (var k in aByKind) chunk(uniq(aByKind[k].authors), CHUNK).forEach(function (authors) { filters.push({ kinds: [Number(k)], authors: authors, '#d': uniq(aByKind[k].ds) }); });
      chunk(ids, 100).forEach(function (part) { filters.push({ ids: part }); });
      var relays = uniq(contentRelays.concat(SHARE_RELAYS));
      queryChunks(relays, filters, function (err, evs) {
        evs.forEach(function (ev) {
          var ra = refsA[coord(ev)], re = refsE[ev.id];
          if (ra) add(ev, ra.sharers);
          if (re) add(ev, re.sharers);
        });
        var list = []; for (var id in out) list.push(out[id]);
        list = dedupeAddressable(list);
        // access rules, one gate per section
        var gates = {}, secs = [];
        wanted.forEach(function (k) { var s = byKind[k]; if (s && secs.indexOf(s) < 0) secs.push(s); });
        each(secs, function (s, done) { resolveGate(c, s.gate, function (set) { gates[s.name] = set; done(); }); }, function () {
          var kept = list.filter(function (ev) {
            var s = byKind[ev.kind], allowed = s ? gates[s.name] : null;
            if (allowed === null || allowed === undefined) return true;
            if (ev.pubkey === c.pubkey || allowed[ev.pubkey]) return true;
            for (var i = 0; i < ev._sharers.length; i++) if (ev._sharers[i] === c.pubkey || allowed[ev._sharers[i]]) return true;
            return false;
          });
          cb(null, kept);
        });
      });
    });
  }
  // Raw events for a widget: plain relay query, or the union of its communities'
  // content. `extra` adds filter fields to the plain query (search, #t).
  function fetchContent(o, kinds, extra, pages, cb) {
    if ((o.author && !o.author.length) || (o.community && !o.community.length)) return cb(null, []);
    if (!o.community) {
      var filter = { kinds: kinds, limit: pages > 1 ? EVENTS_PAGE : Math.min(o.limit, RELAY_MAX) };
      if (o.author) filter.authors = o.author;
      for (var k in (extra || {})) filter[k] = extra[k];
      return query(o.relay, filter, cb, pages);
    }
    var all = [], seen = {}, errs = 0;
    each(o.community, function (pk, done) {
      loadCommunity(pk, [o.relay], function (c) {
        loadCommunityContent(c, kinds, [o.relay], pages, function (err, evs) {
          if (err) errs++;
          else evs.forEach(function (ev) { if (!seen[ev.id]) { seen[ev.id] = 1; all.push(ev); } });
          done();
        });
      });
    }, function () {
      if (errs === o.community.length) return cb(new Error('community content unavailable'));
      all = dedupeAddressable(all);
      if (o.author) all = all.filter(function (ev) { return o.author.indexOf(ev.pubkey) >= 0; });
      cb(null, all);
    });
  }

  // --- events (NIP-52) ------------------------------------------------------
  function parseDate(ev, name) {
    var s = tag(ev, name); if (!s) return null;
    if (ev.kind === 31922) {
      var p = s.split('-').map(Number);
      return (p[0] && p[1] && p[2]) ? new Date(p[0], p[1] - 1, p[2]) : null;
    }
    var n = Number(s); return isFinite(n) ? new Date(n * 1000) : null;
  }
  function enrichEvent(ev) {
    var start = parseDate(ev, 'start'), end = parseDate(ev, 'end');
    // Some source feeds emit an end before the start (often 00:00 of the same
    // day); such an end is meaningless, treat the event as having none.
    if (start && end && end < start) end = null;
    // `until`: when the event is over. Date-based events (31922) without an
    // end last the whole start day; NIP-52 end dates are exclusive.
    var until = end;
    if (start && ev.kind === 31922 && (!end || end.getTime() === start.getTime())) {
      until = new Date(start); until.setDate(until.getDate() + 1);
    }
    return {
      id: ev.id, kind: ev.kind,
      title: tag(ev, 'title') || '(ohne Titel)',
      summary: tag(ev, 'summary') || ev.content || '',
      location: tag(ev, 'location') || '',
      image: tag(ev, 'image'),
      link: tags(ev, 'r').map(safeUrl).filter(Boolean)[0] || null,
      start: start, end: end, until: until || start
    };
  }
  function fmtTime(d) { return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
  function fmtDate(d, t) { return t.wkd[d.getDay()] + ', ' + d.getDate() + '. ' + t.mon[d.getMonth()] + ' ' + d.getFullYear(); }
  function fmtWhen(e, t) {
    if (!e.start) return '';
    if (e.kind === 31922) {
      if (e.end && e.end.getTime() !== e.start.getTime()) {
        var x = new Date(e.end); x.setDate(x.getDate() - 1); // NIP-52 end is exclusive
        if (x.getTime() !== e.start.getTime()) return e.start.getDate() + '. ' + t.mon[e.start.getMonth()] + ' – ' + fmtDate(x, t);
      }
      return fmtDate(e.start, t);
    }
    return fmtDate(e.start, t) + ' · ' + fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '');
  }
  function loadEvents(o, cb) {
    // Relays cannot filter by start, so fetch all events (paged) and filter here.
    fetchContent(o, o.kinds, null, EVENTS_MAX_PAGES, function (err, evs) {
      if (err) return cb(err);
      var now = new Date(), today = new Date(now), tomorrow;
      today.setHours(0, 0, 0, 0); tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
      var DAY = 86400000;
      // An event takes place in [start, until); keep those overlapping the window.
      var lo = null, hi = null;
      if (o.when === 'upcoming') { lo = now; if (o.days) hi = new Date(now.getTime() + o.days * DAY); }
      else if (o.when === 'past') { hi = now; if (o.days) lo = new Date(now.getTime() - o.days * DAY); }
      else if (o.when === 'today') { lo = today; hi = tomorrow; }
      else if (o.when === 'range') { lo = o.from; hi = o.to ? new Date(o.to.getTime() + DAY) : null; }
      var list = evs.map(enrichEvent).filter(function (e) { return e.start; }).filter(function (e) {
        if (o.when === 'upcoming') return e.until >= lo && (!hi || e.start < hi);
        if (o.when === 'past') return e.until < hi && (!lo || e.until >= lo);
        if (lo && !(e.until > lo || e.start >= lo)) return false;   // ended before the window
        if (hi && e.start >= hi) return false;                      // starts after the window
        return true;
      });
      // Events starting inside the window first (soonest start), then those
      // that started before it and are still running (long courses).
      var edge = o.when === 'range' ? lo : o.when === 'all' ? null : today;
      if (o.when === 'past') list.sort(function (a, b) { return b.start - a.start; });
      else if (edge) list.sort(function (a, b) {
        var ra = a.start < edge ? 1 : 0, rb = b.start < edge ? 1 : 0;
        return (ra - rb) || (a.start - b.start);
      });
      else list.sort(function (a, b) { return a.start - b.start; });
      cb(null, list.slice(0, o.limit));
    });
  }
  function renderEvents(list, o) {
    var t = o.t;
    if (o.layout === 'list') {
      return '<div class="ef-list">' + list.map(function (e) {
        var tagName = e.link ? 'a' : 'div';
        return '<' + tagName + ' class="ef-row"' + (e.link ? ' href="' + esc(e.link) + '" target="_blank" rel="noopener"' : '') + '>' +
          '<div class="ef-date"><b>' + e.start.getDate() + '</b><span>' + t.mon[e.start.getMonth()] + (e.kind === 31923 ? ' · ' + fmtTime(e.start) : '') + '</span></div>' +
          '<div><div class="ef-title">' + esc(e.title) + '</div><div class="ef-sub">' + esc(e.location || trunc(e.summary, 120)) + '</div></div>' +
          '</' + tagName + '>';
      }).join('') + '</div>';
    }
    return '<div class="ef-cards">' + list.map(function (e) {
      var tagName = e.link ? 'a' : 'div';
      var img = safeUrl(e.image);
      return '<' + tagName + ' class="ef-card"' + (e.link ? ' href="' + esc(e.link) + '" target="_blank" rel="noopener"' : '') + '>' +
        (img ? '<div class="ef-thumb" style="background-image:url(\'' + esc(img) + '\')"></div>' : '') +
        '<div class="ef-body"><div class="ef-when">' + esc(fmtWhen(e, t)) + '</div>' +
        '<h3 class="ef-title">' + esc(e.title) + '</h3>' +
        (e.summary ? '<div class="ef-desc">' + esc(trunc(e.summary, 200)) + '</div>' : '') +
        '<div class="ef-meta">' + (e.location ? '<span>📍 ' + esc(e.location) + '</span>' : '') +
        (e.kind === 31922 ? '<span class="ef-badge">' + t.allday + '</span>' : '') + '</div></div>' +
        '</' + tagName + '>';
    }).join('') + '</div>';
  }

  // --- materials (NIP-AMB, kind 30142) --------------------------------------
  function shortLicense(u) {
    if (!u) return null;
    var m = u.match(/creativecommons\.org\/licenses\/([^/]+)\/([\d.]+)/);
    if (m) return 'CC ' + m[1].toUpperCase() + ' ' + m[2];
    if (/publicdomain\/zero/.test(u)) return 'CC0';
    if (/publicdomain\/mark/.test(u)) return 'Public Domain';
    return null;
  }
  function enrichMaterial(ev) {
    var d = tag(ev, 'd');
    return {
      id: ev.id, created_at: ev.created_at,
      title: tag(ev, 'name') || '(ohne Titel)',
      description: tag(ev, 'description') || ev.content || '',
      image: tag(ev, 'image'),
      link: safeUrl(tag(ev, 'id')) || safeUrl(tag(ev, 'encoding:contentUrl')) || safeUrl(d),
      language: tag(ev, 'inLanguage') || '',
      license: shortLicense(tag(ev, 'license:id')),
      free: tag(ev, 'isAccessibleForFree') === 'true',
      datePublished: tag(ev, 'datePublished') || tag(ev, 'dateCreated') || '',
      subject: tag(ev, 'about:prefLabel:de') || '',
      subjects: tags(ev, 'about:prefLabel:de'),
      type: tag(ev, 'learningResourceType:prefLabel:de') || '',
      creator: tag(ev, 'creator:name') || ''
    };
  }
  function loadMaterials(o, cb) {
    var extra = {};
    if (o.search) extra.search = o.search;
    if (o.keyword) extra['#t'] = [o.keyword];
    var clientFilter = !!(o.subject || o.language);
    var communityIds = null;
    if (o.community && o.search) {
      // A relay's full-text search cannot be combined with community content
      // (shares, access rules), so: search on the relay, then keep the hits
      // that belong to the community (up to 250 community items).
      var o2 = {}; for (var k in o) o2[k] = o[k]; o2.limit = RELAY_MAX;
      fetchContent(o2, [30142], null, 1, function (err, evs) {
        if (err) return cb(err);
        communityIds = {}; evs.forEach(function (ev) { communityIds[ev.id] = 1; });
        var o3 = {}; for (var k in o) o3[k] = o[k]; o3.community = null; o3.limit = RELAY_MAX;
        fetchContent(o3, [30142], extra, 1, finish);
      });
    } else if (o.community) {
      fetchContent(o, [30142], extra, 1, finish);
    } else {
      var o4 = {}; for (var k2 in o) o4[k2] = o[k2]; if (clientFilter) o4.limit = RELAY_MAX;
      fetchContent(o4, [30142], extra, 1, finish);
    }
    function finish(err, evs) {
      if (err) return cb(err);
      var list = evs.map(enrichMaterial).filter(function (r) {
        if (communityIds && !communityIds[r.id]) return false;
        if (o.subject && r.subjects.map(function (s) { return s.toLowerCase(); }).indexOf(o.subject.toLowerCase()) < 0) return false;
        if (o.language && r.language.toLowerCase() !== o.language.toLowerCase()) return false;
        return true;
      });
      if (!o.search) list.sort(function (a, b) { return (b.datePublished || '').localeCompare(a.datePublished || '') || b.created_at - a.created_at; });
      cb(null, list.slice(0, o.limit));
    }
  }
  function badges(r, t) {
    var out = [];
    if (r.license) out.push('<span class="ef-badge ef-cc">' + esc(r.license) + '</span>');
    if (r.type) out.push('<span class="ef-badge">' + esc(r.type) + '</span>');
    if (r.subject) out.push('<span class="ef-badge">' + esc(r.subject) + '</span>');
    return out.join('');
  }
  function renderMaterials(list, o) {
    var t = o.t;
    if (o.layout === 'list') {
      return '<div class="ef-list">' + list.map(function (r) {
        var tagName = r.link ? 'a' : 'div', img = safeUrl(r.image);
        return '<' + tagName + ' class="ef-row"' + (r.link ? ' href="' + esc(r.link) + '" target="_blank" rel="noopener"' : '') + '>' +
          '<div class="ef-lthumb"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '></div>' +
          '<div><div class="ef-title">' + esc(r.title) + '</div><div class="ef-sub">' + esc(r.subject ? r.subject + ' · ' : '') + esc(trunc(r.description, 120)) + '</div></div>' +
          '</' + tagName + '>';
      }).join('') + '</div>';
    }
    return '<div class="ef-cards">' + list.map(function (r) {
      var tagName = r.link ? 'a' : 'div', img = safeUrl(r.image);
      return '<' + tagName + ' class="ef-card"' + (r.link ? ' href="' + esc(r.link) + '" target="_blank" rel="noopener"' : '') + '>' +
        '<div class="ef-thumb"' + (img ? ' style="background-image:url(\'' + esc(img) + '\')"' : '') + '>' + (img ? '' : '<span>' + t.noimage + '</span>') + '</div>' +
        '<div class="ef-body"><h3 class="ef-title">' + esc(r.title) + '</h3>' +
        (r.description ? '<div class="ef-desc">' + esc(trunc(r.description, 160)) + '</div>' : '') +
        '<div class="ef-meta">' + badges(r, t) + '</div></div>' +
        '</' + tagName + '>';
    }).join('') + '</div>';
  }

  // --- mounting --------------------------------------------------------------
  var cssInjected = false;
  function injectCss() {
    if (cssInjected || typeof document === 'undefined') return;
    cssInjected = true;
    var st = document.createElement('style'); st.setAttribute('data-edufeed-embed', '');
    st.textContent = CSS; document.head.appendChild(st);
  }
  function optsFrom(el, overrides) {
    var d = el.dataset || {};
    var o = {
      type: d.edufeed || 'events', relay: d.relay, limit: d.limit, layout: d.layout, lang: d.lang, author: d.author, community: d.community,
      when: d.when, kinds: d.kinds, search: d.search, keyword: d.keyword, subject: d.subject, language: d.language,
      placeholder: d.placeholder, min: d.min, days: d.days, from: d.from, to: d.to
    };
    for (var k in (overrides || {})) o[k] = overrides[k];
    o.type = ['materials', 'search'].indexOf(o.type) >= 0 ? o.type : 'events';
    o.relay = o.relay || DEFAULT_RELAY[o.type === 'events' ? 'events' : 'materials'];
    o.min = Math.max(1, parseInt(o.min, 10) || 2);
    o.limit = Math.max(1, Math.min(RELAY_MAX, parseInt(o.limit, 10) || 12));
    o.layout = o.layout === 'list' ? 'list' : 'cards';
    o.t = I18N[o.lang] || I18N.de;
    o.author = toHexPubkeys(o.author);       // arrays of hex keys or null
    o.community = toHexPubkeys(o.community);
    o.when = ['upcoming', 'today', 'all', 'past'].indexOf(o.when) >= 0 ? o.when : 'upcoming';
    o.days = parseInt(o.days, 10) > 0 ? parseInt(o.days, 10) : null;
    o.from = parseDay(o.from); o.to = parseDay(o.to);
    if (o.from || o.to) o.when = 'range';
    o.kinds = String(o.kinds || '31922,31923').split(',').map(Number).filter(function (n) { return n === 31922 || n === 31923; });
    if (!o.kinds.length) o.kinds = [31922, 31923];
    return o;
  }
  // Interactive search box: input + live results from the relay's NIP-50 search.
  function mountSearch(el, o) {
    var t = o.t, timer = null, seq = 0;
    el.innerHTML = '<form class="ef-search" role="search"><input type="search" autocomplete="off" placeholder="' + esc(o.placeholder || t.placeholder) + '">' +
      '<button type="submit">' + t.searchBtn + '</button></form><div class="ef-results"><div class="ef-status">' + t.hint + '</div></div>';
    var form = el.querySelector('form'), input = el.querySelector('input'), out = el.querySelector('.ef-results');
    function run(q) {
      q = (q || '').trim();
      if (q.length < o.min) { out.innerHTML = '<div class="ef-status">' + t.hint + '</div>'; return; }
      var my = ++seq;
      out.innerHTML = '<div class="ef-status">' + t.loading + '</div>';
      var opts = {}; for (var k in o) opts[k] = o[k]; opts.search = q;
      loadMaterials(opts, function (err, list) {
        if (my !== seq) return; // a newer query is in flight
        if (err) { out.innerHTML = '<div class="ef-status ef-error">' + t.error + '</div>'; if (window.console) console.warn('edufeed-embed:', err); return; }
        out.innerHTML = list.length ? '<p class="ef-count">' + t.hits(list.length) + '</p>' + renderMaterials(list, o) : '<div class="ef-status">' + t.empty + '</div>';
        try { el.dispatchEvent(new CustomEvent('edufeed:loaded', { detail: { items: list, options: opts, query: q } })); } catch (e) {}
      });
    }
    form.addEventListener('submit', function (ev) { ev.preventDefault(); clearTimeout(timer); run(input.value); });
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { run(input.value); }, 400); });
    if (o.search) { input.value = o.search; run(o.search); }
    return el;
  }

  function mount(el, overrides) {
    injectCss();
    var o = optsFrom(el, overrides);
    el.classList.add('ef-embed');
    if (o.type === 'search') return mountSearch(el, o);
    el.innerHTML = '<div class="ef-status">' + o.t.loading + '</div>';
    var load = o.type === 'materials' ? loadMaterials : loadEvents;
    var render = o.type === 'materials' ? renderMaterials : renderEvents;
    load(o, function (err, list) {
      if (err) { el.innerHTML = '<div class="ef-status ef-error">' + o.t.error + '</div>'; if (window.console) console.warn('edufeed-embed:', err); return; }
      el.innerHTML = list.length ? render(list, o) : '<div class="ef-status">' + o.t.empty + '</div>';
      try { el.dispatchEvent(new CustomEvent('edufeed:loaded', { detail: { items: list, options: o } })); } catch (e) {}
    });
    return el;
  }
  function mountAll(root) {
    var nodes = (root || document).querySelectorAll('[data-edufeed]:not([data-ef-mounted])');
    for (var i = 0; i < nodes.length; i++) { nodes[i].setAttribute('data-ef-mounted', ''); mount(nodes[i]); }
    return nodes.length;
  }

  window.EdufeedEmbed = { mount: mount, mountAll: mountAll, version: '0.4.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountAll(); });
  else mountAll();
})();
