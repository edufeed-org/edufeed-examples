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
 *   data-author     hex pubkey or npub — only items signed by this key (one person)
 *   data-community  hex pubkey or npub of an Edufeed community (kind 10222) — only items
 *                   shared into that community (h-tag), regardless of who signed them.
 *                   Combinable with data-author ("only X's items in community Y").
 *   events only (the widget loads all calendar events of the relay in pages of
 *   500 and filters/sorts them here, since relays cannot filter by start date):
 *     data-when     "upcoming" | "all" | "past"  (default upcoming; upcoming lists
 *                   today's and future events first, then still-running ones
 *                   that started on an earlier day)
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
    var filter = { kinds: o.kinds, limit: EVENTS_PAGE };
    if (o.author) filter.authors = [o.author];
    if (o.community) filter['#h'] = [o.community];
    // Relays cannot filter by start, so fetch all events (paged) and filter here.
    query(o.relay, filter, function (err, evs) {
      if (err) return cb(err);
      var now = new Date();
      var list = evs.map(enrichEvent).filter(function (e) { return e.start; }).filter(function (e) {
        if (o.when === 'upcoming') return e.until >= now;
        if (o.when === 'past') return e.until < now;
        return true;
      });
      var today = new Date(now); today.setHours(0, 0, 0, 0);
      if (o.when === 'past') list.sort(function (a, b) { return b.start - a.start; });
      else if (o.when === 'upcoming') list.sort(function (a, b) {
        // today's and future events first (soonest start), then events that
        // started on an earlier day and are still running (long courses)
        var ra = a.start < today ? 1 : 0, rb = b.start < today ? 1 : 0;
        return (ra - rb) || (a.start - b.start);
      });
      else list.sort(function (a, b) { return a.start - b.start; });
      cb(null, list.slice(0, o.limit));
    }, EVENTS_MAX_PAGES);
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
    // amb-relay.edufeed.org answers "#h" + "search" in one REQ with nothing (2026-10),
    // so a community-scoped search runs two REQs and intersects by id client side.
    var splitCommunity = !!(o.community && o.search);
    var clientFilter = !!(o.subject || o.language || splitCommunity);
    var filter = { kinds: [30142], limit: clientFilter ? RELAY_MAX : Math.min(o.limit, RELAY_MAX) };
    if (o.author) filter.authors = [o.author];
    if (o.community && !splitCommunity) filter['#h'] = [o.community];
    if (o.search) filter.search = o.search;
    if (o.keyword) filter['#t'] = [o.keyword];
    var communityIds = null;
    if (splitCommunity) {
      var cf = { kinds: [30142], '#h': [o.community], limit: RELAY_MAX };
      if (o.author) cf.authors = [o.author];
      query(o.relay, cf, function (err, evs) {
        if (err) return cb(err);
        communityIds = {}; for (var i = 0; i < evs.length; i++) communityIds[evs[i].id] = 1;
        run();
      });
    } else run();
    function run() { query(o.relay, filter, function (err, evs) {
      if (err) return cb(err);
      var list = evs.map(enrichMaterial).filter(function (r) {
        if (communityIds && !communityIds[r.id]) return false;
        if (o.subject && r.subjects.map(function (s) { return s.toLowerCase(); }).indexOf(o.subject.toLowerCase()) < 0) return false;
        if (o.language && r.language.toLowerCase() !== o.language.toLowerCase()) return false;
        return true;
      });
      if (!o.search) list.sort(function (a, b) { return (b.datePublished || '').localeCompare(a.datePublished || '') || b.created_at - a.created_at; });
      cb(null, list.slice(0, o.limit));
    }); }
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
      placeholder: d.placeholder, min: d.min
    };
    for (var k in (overrides || {})) o[k] = overrides[k];
    o.type = ['materials', 'search'].indexOf(o.type) >= 0 ? o.type : 'events';
    o.relay = o.relay || DEFAULT_RELAY[o.type === 'events' ? 'events' : 'materials'];
    o.min = Math.max(1, parseInt(o.min, 10) || 2);
    o.limit = Math.max(1, Math.min(RELAY_MAX, parseInt(o.limit, 10) || 12));
    o.layout = o.layout === 'list' ? 'list' : 'cards';
    o.t = I18N[o.lang] || I18N.de;
    o.author = toHexPubkey(o.author);
    o.community = toHexPubkey(o.community);
    o.when = ['upcoming', 'all', 'past'].indexOf(o.when) >= 0 ? o.when : 'upcoming';
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

  window.EdufeedEmbed = { mount: mount, mountAll: mountAll, version: '0.3.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountAll(); });
  else mountAll();
})();
