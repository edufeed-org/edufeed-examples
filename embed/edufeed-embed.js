/*!
 * edufeed-embed.js — drop-in widget that renders Edufeed calendar events (NIP-52)
 * and learning resources (NIP-AMB, kind 30142) into any HTML page.
 *
 * No build step, no dependencies, no iframe. Read-only.
 *
 *   <div data-edufeed="events" data-limit="5"></div>
 *   <div data-edufeed="materials" data-subject="Religion"></div>
 *   <script src="https://edufeed-org.github.io/edufeed-examples/embed/edufeed-embed.js"></script>
 *
 * Attributes (all optional):
 *   data-relay      WebSocket URL. Default: wss://relay.edufeed.org (events),
 *                   wss://amb-relay.edufeed.org (materials)
 *   data-limit      max items to show (default 12, relay max 250)
 *   data-layout     "cards" | "list"  (default cards)
 *   data-lang       UI language "de" | "en" (default de)
 *   data-author     hex pubkey or npub — only items by this author
 *   events only:
 *     data-when     "upcoming" | "all" | "past"  (default upcoming)
 *     data-kinds    comma list, default "31922,31923"
 *   materials only:
 *     data-search   full-text search (NIP-50, server side)
 *     data-keyword  exact keyword / t-tag
 *     data-subject  subject label, e.g. "Religion" (client side, prefLabel:de)
 *     data-language inLanguage code, e.g. "de"
 *
 * Programmatic: EdufeedEmbed.mount(element, { type: 'events', limit: 5 })
 * Source: https://github.com/edufeed-org/edufeed-examples
 */
(function () {
  'use strict';

  var DEFAULT_RELAY = { events: 'wss://relay.edufeed.org', materials: 'wss://amb-relay.edufeed.org' };
  var RELAY_MAX = 250;
  var TIMEOUT_MS = 15000;

  var I18N = {
    de: { loading: 'Lade Daten von Edufeed…', error: 'Daten konnten nicht geladen werden.', empty: 'Nichts gefunden.',
          allday: 'ganztägig', noimage: 'kein Bild', free: 'kostenlos',
          wkd: ['So','Mo','Di','Mi','Do','Fr','Sa'],
          mon: ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'] },
    en: { loading: 'Loading from Edufeed…', error: 'Could not load data.', empty: 'Nothing found.',
          allday: 'all day', noimage: 'no image', free: 'free',
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
    return bytes.map(function (b) { return pad2(b.toString(16)); }).join('');
  }
  function toHexPubkey(a) {
    if (!a) return null;
    a = a.trim();
    if (/^[0-9a-f]{64}$/i.test(a)) return a.toLowerCase();
    return npubToHex(a);
  }

  // --- network: one REQ, collect until EOSE --------------------------------
  function query(relay, filter, cb) {
    var ws, done = false, events = [], subId = 'ef-' + Math.random().toString(36).slice(2, 9);
    var seen = {};
    function finish(err) {
      if (done) return; done = true; clearTimeout(timer);
      try { ws.close(); } catch (e) {}
      cb(err, events);
    }
    try { ws = new WebSocket(relay); } catch (e) { return cb(e, []); }
    var timer = setTimeout(function () { finish(events.length ? null : new Error('timeout')); }, TIMEOUT_MS);
    ws.onopen = function () { ws.send(JSON.stringify(['REQ', subId, filter])); };
    ws.onmessage = function (m) {
      var f; try { f = JSON.parse(m.data); } catch (e) { return; }
      if (f[0] === 'EVENT' && f[1] === subId) {
        if (!seen[f[2].id]) { seen[f[2].id] = 1; events.push(f[2]); }
      } else if (f[0] === 'EOSE' && f[1] === subId) {
        try { ws.send(JSON.stringify(['CLOSE', subId])); } catch (e) {}
        finish(null);
      } else if (f[0] === 'CLOSED' && f[1] === subId) {
        finish(new Error(f[2] || 'closed'));
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
    return {
      id: ev.id, kind: ev.kind,
      title: tag(ev, 'title') || '(ohne Titel)',
      summary: tag(ev, 'summary') || ev.content || '',
      location: tag(ev, 'location') || '',
      image: tag(ev, 'image'),
      link: tags(ev, 'r').map(safeUrl).filter(Boolean)[0] || null,
      start: parseDate(ev, 'start'), end: parseDate(ev, 'end')
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
    var filter = { kinds: o.kinds, limit: RELAY_MAX };
    if (o.author) filter.authors = [o.author];
    query(o.relay, filter, function (err, evs) {
      if (err) return cb(err);
      var now = new Date();
      var list = evs.map(enrichEvent).filter(function (e) { return e.start; }).filter(function (e) {
        var ref = e.end || e.start;
        if (o.when === 'upcoming') return ref >= now;
        if (o.when === 'past') return ref < now;
        return true;
      });
      list.sort(function (a, b) { return o.when === 'past' ? b.start - a.start : a.start - b.start; });
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
    var clientFilter = !!(o.subject || o.language);
    var filter = { kinds: [30142], limit: clientFilter ? RELAY_MAX : Math.min(o.limit, RELAY_MAX) };
    if (o.author) filter.authors = [o.author];
    if (o.search) filter.search = o.search;
    if (o.keyword) filter['#t'] = [o.keyword];
    query(o.relay, filter, function (err, evs) {
      if (err) return cb(err);
      var list = evs.map(enrichMaterial).filter(function (r) {
        if (o.subject && r.subjects.map(function (s) { return s.toLowerCase(); }).indexOf(o.subject.toLowerCase()) < 0) return false;
        if (o.language && r.language.toLowerCase() !== o.language.toLowerCase()) return false;
        return true;
      });
      if (!o.search) list.sort(function (a, b) { return (b.datePublished || '').localeCompare(a.datePublished || '') || b.created_at - a.created_at; });
      cb(null, list.slice(0, o.limit));
    });
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
      type: d.edufeed || 'events', relay: d.relay, limit: d.limit, layout: d.layout, lang: d.lang, author: d.author,
      when: d.when, kinds: d.kinds, search: d.search, keyword: d.keyword, subject: d.subject, language: d.language
    };
    for (var k in (overrides || {})) o[k] = overrides[k];
    o.type = o.type === 'materials' ? 'materials' : 'events';
    o.relay = o.relay || DEFAULT_RELAY[o.type];
    o.limit = Math.max(1, Math.min(RELAY_MAX, parseInt(o.limit, 10) || 12));
    o.layout = o.layout === 'list' ? 'list' : 'cards';
    o.t = I18N[o.lang] || I18N.de;
    o.author = toHexPubkey(o.author);
    o.when = ['upcoming', 'all', 'past'].indexOf(o.when) >= 0 ? o.when : 'upcoming';
    o.kinds = String(o.kinds || '31922,31923').split(',').map(Number).filter(function (n) { return n === 31922 || n === 31923; });
    if (!o.kinds.length) o.kinds = [31922, 31923];
    return o;
  }
  function mount(el, overrides) {
    injectCss();
    var o = optsFrom(el, overrides);
    el.classList.add('ef-embed');
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

  window.EdufeedEmbed = { mount: mount, mountAll: mountAll, version: '0.1.0' };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mountAll(); });
  else mountAll();
})();
