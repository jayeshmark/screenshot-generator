'use strict';

/* Discord chat screenshot maker. Original code written for this project.
   No login, no backend. Everything renders in the browser. */

const isBrowser = typeof document !== 'undefined';
const STORE_KEY = 'chatshot.discord.v1';

let state = null;
let saveTimer = null;

function $(sel, root) { return (root || document).querySelector(sel); }
function $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

function uid() {
  return 'id' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

function dateStrOf(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayStr() { return dateStrOf(new Date()); }

function nowTimeStr() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* Small placeholder picture drawn for the sample conversation. */
const SAMPLE_IMAGE = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">' +
  '<rect width="480" height="270" fill="#8ecae6"/>' +
  '<circle cx="392" cy="52" r="30" fill="#ffd166"/>' +
  '<ellipse cx="120" cy="250" rx="230" ry="70" fill="#70c14b"/>' +
  '<ellipse cx="370" cy="255" rx="230" ry="60" fill="#4da53a"/>' +
  '<text x="24" y="44" font-family="sans-serif" font-size="26" fill="#ffffff">sample image</text>' +
  '</svg>'
);

function sampleState() {
  const today = todayStr();
  const yesterday = dateStrOf(new Date(Date.now() - 86400000));
  const alex = uid();
  const sam = uid();
  const bot = uid();
  const m1 = uid();
  const m2 = uid();
  const m3 = uid();
  const m4 = uid();
  const m5 = uid();
  const m6 = uid();
  return {
    layout: 'server',
    view: 'desktop',
    theme: 'dark',
    serverName: 'Pixel Cove',
    channelName: 'general',
    channelTopic: 'Say hello and be kind',
    dmPartnerId: alex,
    people: [
      { id: alex, name: 'Alex', color: '#5865f2', avatar: null, bot: false, status: 'online' },
      { id: sam, name: 'Sam', color: '#57f287', avatar: null, bot: false, status: 'idle' },
      { id: bot, name: 'ModBot', color: '#faa81a', avatar: null, bot: true, status: 'online' }
    ],
    messages: [
      { id: m1, authorId: alex, date: yesterday, time: '16:02', text: 'hey everyone, welcome to Pixel Cove!', reactions: [{ emoji: '👋', count: 3 }], replyTo: null, image: null, edited: false },
      { id: m2, authorId: alex, date: yesterday, time: '16:04', text: 'grab a role in #roles and say hello here', reactions: [], replyTo: null, image: null, edited: false },
      { id: m3, authorId: sam, date: today, time: '09:15', text: '@Alex thanks for the invite! **love** the setup here', reactions: [{ emoji: '❤️', count: 2 }], replyTo: null, image: null, edited: false },
      { id: m4, authorId: alex, date: today, time: '09:18', text: 'of course! check the pinned post when you get a chance', reactions: [], replyTo: m3, image: null, edited: false },
      { id: m5, authorId: bot, date: today, time: '09:18', text: 'welcome snippet:\n```js\nconsole.log("hello world");\n```', reactions: [], replyTo: null, image: null, edited: false },
      { id: m6, authorId: sam, date: today, time: '09:21', text: 'the guide is at `docs.example.com` and https://example.com/welcome', reactions: [{ emoji: '👍', count: 5 }], replyTo: null, image: SAMPLE_IMAGE, edited: false }
    ]
  };
}

/* ---------- time helpers ---------- */

function fmtTime12(timeStr) {
  const parts = String(timeStr || '12:00').split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parts[1] || '00';
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + String(m).padStart(2, '0') + ' ' + ap;
}

function dayLabel(dateStr) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date(dateStr + 'T12:00:00');
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

function headerTime(dateStr, timeStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const now = new Date();
  const strip = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
  const diff = Math.round((strip(now) - strip(d)) / 86400000);
  if (diff === 0) return 'Today at ' + fmtTime12(timeStr);
  if (diff === 1) return 'Yesterday at ' + fmtTime12(timeStr);
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}

function minutesBetween(a, b) {
  const pa = String(a || '00:00').split(':');
  const pb = String(b || '00:00').split(':');
  return (parseInt(pb[0], 10) * 60 + parseInt(pb[1], 10)) - (parseInt(pa[0], 10) * 60 + parseInt(pa[1], 10));
}

/* ---------- markdown subset ---------- */

function renderRich(text, people) {
  const stash = [];
  function stashIt(html) {
    stash.push(html);
    return '\u0001' + (stash.length - 1) + '\u0001';
  }
  let s = escapeHtml(text == null ? '' : String(text));
  s = s.replace(/```([a-zA-Z0-9_-]*)\n?([\s\S]*?)```/g, function (m, lang, code) {
    const cleaned = code.replace(/\n$/, '');
    return stashIt('<pre class="codeblock"><code>' + cleaned + '</code></pre>');
  });
  s = s.replace(/`([^`\n]+)`/g, function (m, code) {
    return stashIt('<code class="inlinecode">' + code + '</code>');
  });
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
    return stashIt('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
  });
  s = s.replace(/\*\*\*([^\*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  s = s.replace(/\*\*([^\*]+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+?)__/g, '<u>$1</u>');
  s = s.replace(/~~([^~]+?)~~/g, '<del>$1</del>');
  s = s.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
  s = s.replace(/(^|[\s(])_([^_\n]+?)_/g, '$1<em>$2</em>');
  const names = (people || []).map(function (p) { return p.name; }).filter(Boolean).sort(function (a, b) { return b.length - a.length; });
  names.push('everyone', 'here');
  if (names.length) {
    const pattern = names.map(function (n) { return n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|');
    const re = new RegExp('@(' + pattern + ')\\b', 'gi');
    s = s.replace(re, '<span class="mention">@$1</span>');
  }
  s = s.replace(/#([A-Za-z0-9_-]+)/g, '<span class="chanref">#$1</span>');
  s = s.replace(/https?:\/\/[^\s<]+/g, function (url) {
    return stashIt('<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');
  });
  s = s.replace(/\n/g, '<br>');
  s = s.replace(/\u0001(\d+)\u0001/g, function (m, i) { return stash[+i]; });
  return s;
}

function plainSnippet(text, len) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, '[code]')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length > len) s = s.slice(0, len - 1) + '…';
  return s;
}

/* ---------- grouping ---------- */

function computeGroups(messages) {
  const rows = [];
  let prev = null;
  messages.forEach(function (msg) {
    let divider = null;
    if (!prev || prev.date !== msg.date) divider = dayLabel(msg.date);
    let grouped = false;
    if (prev && !divider && prev.authorId === msg.authorId && !msg.replyTo) {
      const gap = minutesBetween(prev.time, msg.time);
      if (gap >= 0 && gap <= 7) grouped = true;
    }
    rows.push({ msg: msg, divider: divider, grouped: grouped });
    prev = msg;
  });
  return rows;
}

/* ---------- state ---------- */

function personById(id) {
  const found = state.people.find(function (p) { return p.id === id; });
  return found || state.people[0];
}

function statusLabel(status) {
  if (status === 'idle') return 'Idle';
  if (status === 'dnd') return 'Do not disturb';
  if (status === 'offline') return 'Offline';
  return 'Online';
}

function normalizeState(s) {
  const d = sampleState();
  const out = Object.assign({}, d, s);
  out.people = Array.isArray(s.people) && s.people.length ? s.people : d.people;
  out.messages = Array.isArray(s.messages) ? s.messages : d.messages;
  out.people = out.people.map(function (p) {
    return {
      id: p.id || uid(),
      name: p.name || 'Alex',
      color: p.color || '#5865f2',
      avatar: p.avatar || null,
      bot: !!p.bot,
      status: p.status || 'online'
    };
  });
  const ids = out.people.map(function (p) { return p.id; });
  out.messages = out.messages.map(function (m) {
    return {
      id: m.id || uid(),
      authorId: ids.indexOf(m.authorId) >= 0 ? m.authorId : ids[0],
      date: m.date || todayStr(),
      time: m.time || '12:00',
      text: m.text == null ? '' : String(m.text),
      reactions: Array.isArray(m.reactions) ? m.reactions : [],
      replyTo: m.replyTo || null,
      image: m.image || null,
      edited: !!m.edited
    };
  });
  const mids = out.messages.map(function (m) { return m.id; });
  out.messages.forEach(function (m) { if (m.replyTo && mids.indexOf(m.replyTo) < 0) m.replyTo = null; });
  if (ids.indexOf(out.dmPartnerId) < 0) out.dmPartnerId = ids[0];
  return out;
}

function load() {
  if (typeof localStorage === 'undefined') return sampleState();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.people) && parsed.people.length) return normalizeState(parsed);
    }
  } catch (err) { /* fall through to sample */ }
  return sampleState();
}

function setSaveStatus(text) {
  if (!isBrowser) return;
  const el = $('#saveStatus');
  if (el) el.textContent = text;
}

function save() {
  if (!isBrowser) return;
  setSaveStatus('Saving...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      setSaveStatus('All changes saved in this browser');
    } catch (err) {
      setSaveStatus('Could not save. Browser storage is full, but your work stays on this page.');
    }
  }, 300);
}

/* ---------- preview rendering ---------- */

function avatarHTML(person, sizeClass) {
  if (person.avatar) {
    return '<img class="avatar-img ' + sizeClass + '" src="' + escapeHtml(person.avatar) + '" alt="">';
  }
  return '<span class="avatar-init ' + sizeClass + '" style="background:' + escapeHtml(person.color || '#5865f2') + '">' + escapeHtml(initials(person.name)) + '</span>';
}

function messageRowHTML(row) {
  const msg = row.msg;
  const person = personById(msg.authorId);
  let html = '';
  if (row.divider) html += '<div class="divider"><span>' + escapeHtml(row.divider) + '</span></div>';
  const reply = msg.replyTo ? state.messages.find(function (m) { return m.id === msg.replyTo; }) : null;
  html += '<div class="msg' + (row.grouped ? ' grouped' : '') + '">';
  if (!row.grouped) {
    html += '<div class="msg-avatar">' + avatarHTML(person, 'av40') + '</div>';
  } else {
    html += '<div class="msg-time-gutter">' + escapeHtml(fmtTime12(msg.time)) + '</div>';
  }
  html += '<div class="msg-body">';
  if (reply) {
    const rp = personById(reply.authorId);
    html += '<div class="reply-ref">' + avatarHTML(rp, 'av16') +
      '<span class="reply-author">@' + escapeHtml(rp.name) + '</span>' +
      '<span class="reply-snippet">' + escapeHtml(plainSnippet(reply.text, 60)) + '</span></div>';
  }
  if (!row.grouped) {
    html += '<div class="msg-head"><span class="author" style="color:' + escapeHtml(person.color || '') + '">' + escapeHtml(person.name) + '</span>';
    if (person.bot) html += '<span class="bottag">BOT</span>';
    html += '<span class="msg-time">' + escapeHtml(headerTime(msg.date, msg.time)) + '</span></div>';
  }
  html += '<div class="msg-text">' + renderRich(msg.text, state.people) + (msg.edited ? ' <span class="edited">(edited)</span>' : '') + '</div>';
  if (msg.image) html += '<div class="attachment"><img src="' + escapeHtml(msg.image) + '" alt="attached image"></div>';
  if (msg.reactions && msg.reactions.length) {
    html += '<div class="reactions">' + msg.reactions.map(function (r) {
      return '<span class="reaction">' + escapeHtml(r.emoji) + (r.count ? ' <b>' + escapeHtml(String(r.count)) + '</b>' : '') + '</span>';
    }).join('') + '</div>';
  }
  html += '</div></div>';
  return html;
}

function railHTML() {
  return '<div class="rail"><div class="rail-icon" style="background:#5865f2">' + escapeHtml(initials(state.serverName)) + '</div>' +
    '<div class="rail-sep"></div><div class="rail-plus">+</div></div>';
}

function sidebarHTML() {
  const channels = [state.channelName, 'announcements', 'memes'];
  let list = '<div class="side-group">Text Channels</div>';
  channels.forEach(function (c, i) {
    list += '<div class="side-chan' + (i === 0 ? ' active' : '') + '"><span class="hash">#</span>' + escapeHtml(c) + '</div>';
  });
  list += '<div class="side-group">Voice Channels</div>';
  list += '<div class="side-chan"><span class="spk">🔊</span>Lobby</div>';
  list += '<div class="side-chan"><span class="spk">🔊</span>Gaming</div>';
  return '<div class="sidebar"><div class="server-head">' + escapeHtml(state.serverName) + '<span class="chev">⌄</span></div>' + list + '</div>';
}

function membersHTML() {
  const online = state.people.filter(function (p) { return p.status !== 'offline'; });
  const offline = state.people.filter(function (p) { return p.status === 'offline'; });
  function row(p) {
    return '<div class="member"><span class="member-av">' + avatarHTML(p, 'av32') +
      '<span class="dot dot-' + escapeHtml(p.status) + '"></span></span>' +
      '<span class="member-name" style="color:' + escapeHtml(p.color || '') + '">' + escapeHtml(p.name) + '</span>' +
      (p.bot ? '<span class="bottag">BOT</span>' : '') + '</div>';
  }
  let html = '<div class="members">';
  html += '<div class="member-group">Online · ' + online.length + '</div>' + online.map(row).join('');
  if (offline.length) html += '<div class="member-group">Offline · ' + offline.length + '</div>' + offline.map(row).join('');
  return html + '</div>';
}

function chatHTML(isMobile) {
  const rows = computeGroups(state.messages);
  let header = '';
  if (state.layout === 'server') {
    header = '<div class="chat-header">' +
      (isMobile ? '<span class="back-arrow">‹</span>' : '') +
      '<span class="hash">#</span><span class="ch-name">' + escapeHtml(state.channelName) + '</span>' +
      (state.channelTopic ? '<span class="ch-topic">' + escapeHtml(state.channelTopic) + '</span>' : '') +
      '</div>';
  } else {
    const partner = personById(state.dmPartnerId);
    header = '<div class="chat-header">' +
      (isMobile ? '<span class="back-arrow">‹</span>' : '') +
      avatarHTML(partner, 'av24') +
      '<span class="dm-name">' + escapeHtml(partner.name) + '</span>' +
      '<span class="dm-status">' + escapeHtml(statusLabel(partner.status)) + '</span>' +
      '</div>';
  }
  const inputHint = state.layout === 'server'
    ? 'Message #' + state.channelName
    : 'Message @' + personById(state.dmPartnerId).name;
  return '<div class="chat">' + header +
    '<div class="messages">' + rows.map(messageRowHTML).join('') + '</div>' +
    '<div class="inputbar"><span class="input-plus">+</span><span class="input-hint">' + escapeHtml(inputHint) + '</span><span class="input-icons">🎁 😊</span></div>' +
    '</div>';
}

function renderPreview() {
  if (!isBrowser) return;
  const root = $('#previewRoot');
  if (!root) return;
  const themeClass = state.theme === 'light' ? 'theme-light' : 'theme-dark';
  const viewClass = state.view === 'mobile' ? 'view-mobile' : 'view-desktop';
  const layoutClass = state.layout === 'dm' ? 'layout-dm' : 'layout-server';
  let inner = '';
  if (state.view === 'mobile') {
    inner = '<div class="phone"><div class="statusbar"><span>9:41</span>' +
      '<span class="status-icons"><span class="sig"><i></i><i></i><i></i><i></i></span><span class="batt"></span></span></div>' +
      chatHTML(true) + '</div>';
  } else if (state.layout === 'server') {
    inner = railHTML() + sidebarHTML() + chatHTML(false) + membersHTML();
  } else {
    inner = chatHTML(false);
  }
  root.innerHTML = '<div id="shot" class="shot ' + themeClass + ' ' + viewClass + ' ' + layoutClass + '">' + inner + '</div>';
}

/* ---------- editor panels ---------- */

function statusOptions(current) {
  return ['online', 'idle', 'dnd', 'offline'].map(function (s) {
    return '<option value="' + s + '"' + (s === current ? ' selected' : '') + '>' + statusLabel(s) + '</option>';
  }).join('');
}

function renderPeoplePanel() {
  const list = $('#peopleList');
  if (!list) return;
  list.innerHTML = state.people.map(function (p) {
    return '<div class="card" data-person="' + p.id + '">' +
      '<div class="card-head">' + avatarHTML(p, 'av40') +
      '<strong class="card-title">' + escapeHtml(p.name) + '</strong>' +
      '<button type="button" class="mini-btn" data-action="deletePerson">Remove</button></div>' +
      '<label class="field">Display name<input type="text" data-field="name" value="' + escapeHtml(p.name) + '" maxlength="32"></label>' +
      '<label class="field">Role color<input type="color" data-field="color" value="' + escapeHtml(p.color || '#5865f2') + '"></label>' +
      '<label class="field">Online status<select data-field="status">' + statusOptions(p.status) + '</select></label>' +
      '<label class="check"><input type="checkbox" data-field="bot"' + (p.bot ? ' checked' : '') + '> Show bot tag</label>' +
      '<label class="field">Avatar image<input type="file" accept="image/*" data-field="avatarFile"></label>' +
      (p.avatar ? '<button type="button" class="mini-btn" data-action="removeAvatar">Remove avatar</button>' : '') +
      '</div>';
  }).join('');
}

function syncPersonSelects() {
  $$('select[data-person-names]').forEach(function (sel) {
    Array.from(sel.options).forEach(function (opt) {
      const p = state.people.find(function (x) { return x.id === opt.value; });
      if (p) opt.textContent = p.name;
    });
  });
}

function renderMessagesPanel() {
  const list = $('#messageList');
  if (!list) return;
  list.innerHTML = state.messages.map(function (m, i) {
    const replyOptions = '<option value="">No reply</option>' + state.messages.map(function (other, j) {
      if (other.id === m.id) return '';
      return '<option value="' + other.id + '"' + (m.replyTo === other.id ? ' selected' : '') + '>' + (j + 1) + ' · ' + escapeHtml(personById(other.authorId).name) + ': ' + escapeHtml(plainSnippet(other.text, 24)) + '</option>';
    }).join('');
    const authorOptions = state.people.map(function (p) {
      return '<option value="' + p.id + '"' + (m.authorId === p.id ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
    }).join('');
    const reactionRows = (m.reactions || []).map(function (r, ri) {
      return '<div class="rx-row"><input type="text" data-rfield="emoji" data-rindex="' + ri + '" value="' + escapeHtml(r.emoji) + '" maxlength="8" aria-label="Emoji">' +
        '<input type="number" data-rfield="count" data-rindex="' + ri + '" value="' + escapeHtml(String(r.count == null ? '' : r.count)) + '" min="1" max="999" aria-label="Count">' +
        '<button type="button" class="mini-btn" data-action="removeReaction" data-rindex="' + ri + '">Remove</button></div>';
    }).join('');
    return '<div class="card" data-message="' + m.id + '">' +
      '<div class="card-head"><strong class="card-title">Message ' + (i + 1) + '</strong>' +
      '<span class="card-actions">' +
      '<button type="button" class="mini-btn" data-action="moveUp">Up</button>' +
      '<button type="button" class="mini-btn" data-action="moveDown">Down</button>' +
      '<button type="button" class="mini-btn" data-action="deleteMessage">Delete</button></span></div>' +
      '<label class="field">Author<select data-field="authorId" data-person-names>' + authorOptions + '</select></label>' +
      '<label class="field">Message<textarea data-field="text" rows="3">' + escapeHtml(m.text) + '</textarea></label>' +
      '<div class="field-row"><label class="field">Date<input type="date" data-field="date" value="' + escapeHtml(m.date) + '"></label>' +
      '<label class="field">Time<input type="time" data-field="time" value="' + escapeHtml(m.time) + '"></label></div>' +
      '<label class="field">Reply to<select data-field="replyTo">' + replyOptions + '</select></label>' +
      '<label class="check"><input type="checkbox" data-field="edited"' + (m.edited ? ' checked' : '') + '> Mark as edited</label>' +
      '<div class="field"><span class="field-label">Reactions</span>' + reactionRows +
      '<button type="button" class="mini-btn" data-action="addReaction">Add reaction</button></div>' +
      '<label class="field">Attached image<input type="file" accept="image/*" data-field="imageFile"></label>' +
      (m.image ? '<button type="button" class="mini-btn" data-action="removeImage">Remove image</button>' : '') +
      '</div>';
  }).join('');
}

function renderSettingsValues() {
  $('#serverName').value = state.serverName;
  $('#channelName').value = state.channelName;
  $('#channelTopic').value = state.channelTopic;
  const sel = $('#dmPartner');
  sel.innerHTML = state.people.map(function (p) {
    return '<option value="' + p.id + '"' + (p.id === state.dmPartnerId ? ' selected' : '') + '>' + escapeHtml(p.name) + '</option>';
  }).join('');
}

/* ---------- image handling ---------- */

function fileToDataURL(file, maxDim, cb) {
  const reader = new FileReader();
  reader.onload = function () {
    const img = new Image();
    img.onload = function () {
      if (!img.width || !img.height) { cb(reader.result); return; }
      let w = img.width;
      let h = img.height;
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      cb(c.toDataURL('image/png'));
    };
    img.onerror = function () { cb(reader.result); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

/* ---------- wiring ---------- */

function wirePeoplePanel() {
  const list = $('#peopleList');
  list.addEventListener('input', function (e) {
    const field = e.target.getAttribute('data-field');
    if (!field) return;
    const card = e.target.closest('[data-person]');
    if (!card) return;
    const person = state.people.find(function (p) { return p.id === card.getAttribute('data-person'); });
    if (!person) return;
    if (field === 'name') { person.name = e.target.value; syncPersonSelects(); }
    if (field === 'color') { person.color = e.target.value; }
    save();
    renderPreview();
  });
  list.addEventListener('change', function (e) {
    const field = e.target.getAttribute('data-field');
    const card = e.target.closest('[data-person]');
    if (!card) return;
    const person = state.people.find(function (p) { return p.id === card.getAttribute('data-person'); });
    if (!person) return;
    if (field === 'status') { person.status = e.target.value; }
    if (field === 'bot') { person.bot = e.target.checked; }
    if (field === 'avatarFile' && e.target.files && e.target.files[0]) {
      fileToDataURL(e.target.files[0], 128, function (url) {
        person.avatar = url;
        save();
        renderPeoplePanel();
        renderPreview();
      });
      return;
    }
    save();
    renderPreview();
  });
  list.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = e.target.closest('[data-person]');
    if (!card) return;
    const id = card.getAttribute('data-person');
    const person = state.people.find(function (p) { return p.id === id; });
    if (!person) return;
    const action = btn.getAttribute('data-action');
    if (action === 'removeAvatar') {
      person.avatar = null;
      save();
      renderPeoplePanel();
      renderPreview();
    }
    if (action === 'deletePerson') {
      if (state.people.length <= 1) {
        window.alert('Keep at least one person.');
        return;
      }
      state.people = state.people.filter(function (p) { return p.id !== id; });
      const fallback = state.people[0].id;
      state.messages.forEach(function (m) { if (m.authorId === id) m.authorId = fallback; });
      if (state.dmPartnerId === id) state.dmPartnerId = fallback;
      save();
      renderPeoplePanel();
      renderMessagesPanel();
      renderSettingsValues();
      renderPreview();
    }
  });
  $('#addPerson').addEventListener('click', function () {
    const palette = ['#5865f2', '#57f287', '#faa81a', '#eb459e', '#00a8fc', '#f23f43'];
    state.people.push({
      id: uid(),
      name: 'New person',
      color: palette[state.people.length % palette.length],
      avatar: null,
      bot: false,
      status: 'online'
    });
    save();
    renderPeoplePanel();
    renderMessagesPanel();
    renderSettingsValues();
    renderPreview();
  });
}

function wireMessagesPanel() {
  const list = $('#messageList');
  list.addEventListener('input', function (e) {
    const card = e.target.closest('[data-message]');
    if (!card) return;
    const msg = state.messages.find(function (m) { return m.id === card.getAttribute('data-message'); });
    if (!msg) return;
    const rfield = e.target.getAttribute('data-rfield');
    if (rfield) {
      const ri = parseInt(e.target.getAttribute('data-rindex'), 10);
      if (rfield === 'emoji') msg.reactions[ri].emoji = e.target.value;
      if (rfield === 'count') msg.reactions[ri].count = parseInt(e.target.value, 10) || '';
      save();
      renderPreview();
      return;
    }
    const field = e.target.getAttribute('data-field');
    if (!field) return;
    if (field === 'text') msg.text = e.target.value;
    if (field === 'date') msg.date = e.target.value;
    if (field === 'time') msg.time = e.target.value;
    save();
    renderPreview();
  });
  list.addEventListener('change', function (e) {
    const card = e.target.closest('[data-message]');
    if (!card) return;
    const msg = state.messages.find(function (m) { return m.id === card.getAttribute('data-message'); });
    if (!msg) return;
    const field = e.target.getAttribute('data-field');
    if (field === 'authorId') msg.authorId = e.target.value;
    if (field === 'replyTo') msg.replyTo = e.target.value || null;
    if (field === 'edited') msg.edited = e.target.checked;
    if (field === 'imageFile' && e.target.files && e.target.files[0]) {
      fileToDataURL(e.target.files[0], 800, function (url) {
        msg.image = url;
        save();
        renderMessagesPanel();
        renderPreview();
      });
      return;
    }
    save();
    renderPreview();
  });
  list.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const card = e.target.closest('[data-message]');
    if (!card) return;
    const id = card.getAttribute('data-message');
    const idx = state.messages.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return;
    const msg = state.messages[idx];
    const action = btn.getAttribute('data-action');
    if (action === 'deleteMessage') {
      state.messages.splice(idx, 1);
      state.messages.forEach(function (m) { if (m.replyTo === id) m.replyTo = null; });
    }
    if (action === 'moveUp' && idx > 0) {
      state.messages[idx - 1] = state.messages.splice(idx, 1, state.messages[idx - 1])[0];
    }
    if (action === 'moveDown' && idx < state.messages.length - 1) {
      state.messages[idx + 1] = state.messages.splice(idx, 1, state.messages[idx + 1])[0];
    }
    if (action === 'addReaction') msg.reactions.push({ emoji: '👍', count: 1 });
    if (action === 'removeReaction') msg.reactions.splice(parseInt(btn.getAttribute('data-rindex'), 10), 1);
    if (action === 'removeImage') msg.image = null;
    save();
    renderMessagesPanel();
    renderPreview();
  });
  $('#addMessage').addEventListener('click', function () {
    state.messages.push({
      id: uid(),
      authorId: state.people[0].id,
      date: todayStr(),
      time: nowTimeStr(),
      text: '',
      reactions: [],
      replyTo: null,
      image: null,
      edited: false
    });
    save();
    renderMessagesPanel();
    renderPreview();
  });
}

function wireSettings() {
  $('#serverName').addEventListener('input', function (e) {
    state.serverName = e.target.value;
    save();
    renderPreview();
  });
  $('#channelName').addEventListener('input', function (e) {
    state.channelName = e.target.value;
    save();
    renderPreview();
  });
  $('#channelTopic').addEventListener('input', function (e) {
    state.channelTopic = e.target.value;
    save();
    renderPreview();
  });
  $('#dmPartner').addEventListener('change', function (e) {
    state.dmPartnerId = e.target.value;
    save();
    renderPreview();
  });
  $('#resetBtn').addEventListener('click', function () {
    if (!window.confirm('Clear everything and load the sample conversation?')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
    state = sampleState();
    save();
    renderAll();
  });
}

function syncToolbar() {
  $$('[data-set]').forEach(function (btn) {
    btn.classList.toggle('active', state[btn.getAttribute('data-set')] === btn.getAttribute('data-value'));
  });
}

function wireToolbar() {
  $$('[data-set]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state[btn.getAttribute('data-set')] = btn.getAttribute('data-value');
      syncToolbar();
      save();
      renderPreview();
    });
  });
}

function wireTabs() {
  $$('.tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('.tab').forEach(function (b) { b.classList.toggle('active', b === btn); });
      $$('.tabbody').forEach(function (body) {
        body.classList.toggle('hidden', body.id !== 'tab-' + btn.getAttribute('data-tab'));
      });
    });
  });
}

/* ---------- export ---------- */

function setExportStatus(text) {
  const el = $('#exportStatus');
  if (el) el.textContent = text;
}

async function exportShot() {
  const node = document.getElementById('shot');
  if (!node) return;
  if (typeof htmlToImage === 'undefined') {
    setExportStatus('The image library did not load. Check your connection and refresh the page.');
    return;
  }
  const format = $('#formatSel').value;
  const scale = parseInt($('#scaleSel').value, 10) || 2;
  const btn = $('#exportBtn');
  btn.disabled = true;
  setExportStatus('Working on your image...');
  try {
    const bg = state.theme === 'light' ? '#ffffff' : '#313338';
    const canvas = await htmlToImage.toCanvas(node, { pixelRatio: scale, backgroundColor: bg, cacheBust: false });
    let mime = 'image/png';
    let ext = 'png';
    if (format === 'jpg') { mime = 'image/jpeg'; ext = 'jpg'; }
    if (format === 'webp') { mime = 'image/webp'; ext = 'webp'; }
    let blob = await new Promise(function (resolve) { canvas.toBlob(resolve, mime, 0.92); });
    if (!blob && format === 'webp') {
      blob = await new Promise(function (resolve) { canvas.toBlob(resolve, 'image/png'); });
      ext = 'png';
    }
    if (!blob) throw new Error('empty image');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'discord-chat.' + ext;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setExportStatus(ext === 'png' && format === 'webp' ? 'WebP is not supported in this browser, downloaded a PNG instead.' : 'Downloaded.');
  } catch (err) {
    setExportStatus('Export failed. Please try again.');
  } finally {
    btn.disabled = false;
  }
}

function wireExport() {
  $('#exportBtn').addEventListener('click', exportShot);
}

/* ---------- boot ---------- */

function renderAll() {
  syncToolbar();
  renderPeoplePanel();
  renderMessagesPanel();
  renderSettingsValues();
  renderPreview();
  setSaveStatus('All changes saved in this browser');
}

function init() {
  state = load();
  wireToolbar();
  wireTabs();
  wireSettings();
  wirePeoplePanel();
  wireMessagesPanel();
  wireExport();
  renderAll();
}

if (isBrowser) {
  document.addEventListener('DOMContentLoaded', init);
}
