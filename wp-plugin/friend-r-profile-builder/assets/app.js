/* =================================================================
   Friendster Profile Builder — pure client-side, no backend
   - Form binds to a state object
   - Live preview re-renders on every change
   - Photo & background uploads compress in-browser
   - Music: Spotify embed (track/album/playlist URL)
   - "Share Screenshot" uses html2canvas + Web Share API (file)
   - State is autosaved to localStorage
================================================================= */

(function () {
  'use strict';

  // ---------------- Backend config (from WP wp_localize_script, optional) ----------------
  const CFG = (typeof window.FRPB_CFG === 'object' && window.FRPB_CFG) ? window.FRPB_CFG : {};
  const HAS_BACKEND = !!CFG.restUrl;
  const HAS_CLOUDINARY = !!(CFG.cloudinaryCloud && CFG.cloudinaryPreset);

  // ---------------- State ----------------
  const STORAGE_KEY = 'friendster-builder-v1';
  const LEAD_KEY = 'friendster-builder-lead-v1'; // {leadId, email}
  const defaultState = {
    full_name: 'Your Name',
    tagline: 'made of words, but trying to mean it',
    shoutout: '',
    username: '',
    gender: '',
    age: '',
    location: '',
    occupation: '',
    relationship_status: '',
    about_me: '',
    who_id_like_to_meet: '',
    interests: '',
    favorite_music: '',
    favorite_movies: '',
    favorite_books: '',
    music_url: '',
    photo_data: '',          // data URL (or empty)
    bg_data: '',             // data URL (or empty)
    theme_bg_color: '#0a0617',
    theme_box_color: '#1a1430',
    theme_text_color: '#e8e2ff',
    theme_heading_color: '#ffcc66',
    theme_link_color: '#ffb24a',
    glitter_html: '<a href="https://www.glitterfy.com/"><img src="https://img88.glitterfy.com/26120/glitterfy6115054T2963.gif" alt="Glitter Words" border="0" /></a><br /><a href="https://www.glitterfy.com/">[Glitterfy.com - *Glitter Words*]</a>'
  };

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...defaultState };
      return { ...defaultState, ...JSON.parse(raw) };
    } catch (_) {
      return { ...defaultState };
    }
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    flashSaveStatus();
  }

  // Visual save status indicator: "Saving..." → "Saved"
  let _saveStatusTimer = null;
  function flashSaveStatus() {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.classList.remove('saved');
    el.classList.add('saving');
    el.textContent = 'Saving…';
    clearTimeout(_saveStatusTimer);
    _saveStatusTimer = setTimeout(() => {
      el.classList.remove('saving');
      el.classList.add('saved');
      el.textContent = 'Saved';
    }, 500);
  }

  // ---------------- URL hash codec (URL-safe base64 of UTF-8 JSON) ----------------
  function encodeState(s) {
    const json = JSON.stringify(s);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  function decodeState(str) {
    let s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }
  function buildShareUrl() {
    // Prefer the slugged URL when we have a backend + a username
    if (HAS_BACKEND && state.username) {
      const base = CFG.pageUrl || (window.location.origin + window.location.pathname);
      return base + '?p=' + encodeURIComponent(state.username);
    }
    // Fallback: hash-encoded full state (works without backend)
    const base = window.location.origin + window.location.pathname;
    return base + '#p=' + encodeState(state);
  }

  // Validate that the user has typed a username. Returns true if OK,
  // otherwise focuses the username field, scrolls it into view, flags the hint,
  // and returns false so the caller can abort.
  function requireUsername() {
    const username = (state.username || '').trim();
    if (username.length >= 3) return true;
    const form = $('#profile-form');
    const input = form && form.elements.username;
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const hint = $('#username-hint');
      if (hint) {
        hint.classList.remove('username-status-ok');
        hint.classList.add('username-status-bad');
        hint.innerHTML = '&#x2717; Pick a username first (3+ chars). It becomes your share link.';
      }
    }
    showToast('Pick a username first.');
    return false;
  }

  // Save the profile to the backend (when configured + username set).
  // Returns the response object on success, null when no backend.
  // Backend assigns the final suffixed username — we update state.username with it.
  async function saveProfileToBackend() {
    if (!HAS_BACKEND) return null;
    if (!state.username || state.username.length < 3) {
      throw new Error('Pick a username first (at least 3 characters).');
    }
    const lead = loadLead();
    const leadIdInt = lead && lead.leadId ? (parseInt(lead.leadId, 10) || 0) : 0;
    const body = {
      lead_id: leadIdInt,
      username: state.username, // base; server appends _<rand4>
      display_name: state.full_name || state.username,
      page_url: CFG.pageUrl || (window.location.origin + window.location.pathname),
      state: state
    };
    const r = await apiPost('save-profile', body);
    if (r && r.ok && r.username) {
      // Adopt the server-assigned username (e.g. "melvic_a3k7") so the share URL is right
      state.username = r.username;
      saveState();
      // Also reflect it in the form input
      const inp = $('#profile-form') && $('#profile-form').elements.username;
      if (inp) inp.value = state.username;
    }
    return r;
  }
  function parseHashState() {
    const m = (window.location.hash || '').match(/[#&]p=([^&]+)/);
    if (!m) return null;
    try { return decodeState(decodeURIComponent(m[1])); } catch (_) { return null; }
  }

  // Pull `?p=...` from the query string. If it looks like a username (no equals/long base64),
  // we'll try to fetch from the backend.
  function parseSlugFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const p = params.get('p');
    if (!p) return null;
    // If it matches our username rules, treat as a username slug
    if (/^[a-z0-9_-]{3,32}$/i.test(p)) return p;
    return null;
  }
  async function fetchProfileBySlug(slug) {
    if (!HAS_BACKEND) return null;
    try {
      // Append a cache-buster — defends against any CDN / WP page cache that
      // would otherwise serve a stale REST response and skip the view_count bump.
      const r = await apiGet(`profile/${encodeURIComponent(slug)}?_=${Date.now()}`);
      if (r && r.ok && r.state) return r.state;
    } catch (_) { /* 404 etc */ }
    return null;
  }

  // ---------------- Backend API helpers ----------------
  function apiUrl(path) { return CFG.restUrl + path.replace(/^\//, ''); }

  async function apiPost(path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (CFG.nonce) headers['X-FRPB-Nonce'] = CFG.nonce;
    if (CFG.nonce) headers['X-WP-Nonce'] = CFG.nonce;
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {})
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, body: json });
    return json;
  }

  async function apiGet(path) {
    const res = await fetch(apiUrl(path), {
      headers: CFG.nonce ? { 'X-WP-Nonce': CFG.nonce } : {},
      cache: 'no-store' // ensure profile loads always hit the backend so view_count increments
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(json.message || 'Request failed'), { status: res.status, body: json });
    return json;
  }

  function loadLead() {
    try { return JSON.parse(localStorage.getItem(LEAD_KEY) || 'null'); } catch (_) { return null; }
  }
  function saveLead(lead) {
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(lead)); } catch (_) {}
  }

  // ---------------- Cloudinary upload ----------------
  async function uploadToCloudinary(blob, filename) {
    if (!HAS_CLOUDINARY) throw new Error('Cloudinary not configured');
    const fd = new FormData();
    fd.append('file', blob, filename || 'upload.jpg');
    fd.append('upload_preset', CFG.cloudinaryPreset);
    const url = `https://api.cloudinary.com/v1_1/${CFG.cloudinaryCloud}/image/upload`;
    const res = await fetch(url, { method: 'POST', body: fd });
    const json = await res.json();
    if (!res.ok || !json.secure_url) throw new Error(json.error?.message || 'Cloudinary upload failed');
    return json.secure_url;
  }
  // Convert a data URL (from compression) to a Blob
  function dataUrlToBlob(dataUrl) {
    const [meta, b64] = dataUrl.split(',');
    const mime = (meta.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  // ---------------- HTML sanitizer for embed code (Glitterfy etc.) ----------------
  // Permissive enough for 2003-era glitter banners (allows <font>, <marquee>, <blink>...)
  // Strict enough to block <script>, on* handlers, javascript:/data: URLs.
  const ALLOWED_TAGS = new Set([
    'a','img','br','p','span','div','b','strong','i','em','u',
    'font','marquee','center','blink','small','big','sup','sub'
  ]);
  const ALLOWED_ATTRS = {
    'a':       ['href','target','rel','title'],
    'img':     ['src','alt','border','width','height','title'],
    'font':    ['color','size','face'],
    'marquee': ['behavior','direction','scrollamount','width','height','loop'],
    'div':     [], 'span':    [], 'p':       [], 'br':      [],
    'b':       [], 'strong':  [], 'i':       [], 'em':      [], 'u':      [],
    'center':  [], 'blink':   [], 'small':   [], 'big':     [],
    'sup':     [], 'sub':     []
  };
  function sanitizeEmbedHTML(html) {
    if (!html || typeof html !== 'string') return '';
    let parsed;
    try {
      parsed = new DOMParser().parseFromString('<div id="root">' + html + '</div>', 'text/html');
    } catch (_) { return ''; }
    const root = parsed.getElementById('root');
    if (!root) return '';

    const walk = (node) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 1) {
          const tag = child.tagName.toLowerCase();
          if (!ALLOWED_TAGS.has(tag)) {
            // Unwrap: move children up before removing
            while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
            child.parentNode.removeChild(child);
            return;
          }
          const allowed = ALLOWED_ATTRS[tag] || [];
          Array.from(child.attributes).forEach((attr) => {
            const name = attr.name.toLowerCase();
            if (!allowed.includes(name)) {
              child.removeAttribute(attr.name);
              return;
            }
            if (name === 'href' || name === 'src') {
              const val = (attr.value || '').trim();
              if (/^javascript:/i.test(val) || /^vbscript:/i.test(val)) {
                child.removeAttribute(attr.name);
                return;
              }
              if (/^data:/i.test(val) && !/^data:image\//i.test(val)) {
                child.removeAttribute(attr.name);
                return;
              }
            }
          });
          if (tag === 'a' && child.hasAttribute('href')) {
            const href = child.getAttribute('href');
            if (/^https?:/i.test(href)) {
              child.setAttribute('target', '_blank');
              child.setAttribute('rel', 'noopener noreferrer');
            }
          }
          walk(child);
        } else if (child.nodeType === 8) {
          child.parentNode.removeChild(child); // strip comments
        }
      });
    };
    walk(root);
    return root.innerHTML;
  }

  // ---------------- DOM helpers ----------------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function nlToBr(s) { return esc(s).replace(/\n/g, '<br>'); }

  function showToast(msg, ms) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, ms || 2400);
  }

  // ---------------- YouTube oEmbed metadata cache ----------------
  // Fetch title/author/thumbnail so we can show a music-player-style widget
  // instead of the default video embed.
  const ytMetaCache = new Map();
  function getYouTubeMeta(url) {
    if (!url) return null;
    if (ytMetaCache.has(url)) return ytMetaCache.get(url);
    return null;
  }
  async function fetchYouTubeMeta(url) {
    if (!url) return null;
    if (ytMetaCache.has(url)) return ytMetaCache.get(url);
    ytMetaCache.set(url, null); // mark in-flight so we don't double-fetch
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      if (!res.ok) return null;
      const meta = await res.json();
      ytMetaCache.set(url, meta);
      return meta;
    } catch (_) {
      return null;
    }
  }

  // ---------------- Music URL parsing (YouTube + Spotify) ----------------
  function parseYouTubeId(url) {
    if (!url) return null;
    const patterns = [
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) return m[1];
    }
    return null;
  }
  function parseMusicUrl(url) {
    if (!url) return null;
    const ytId = parseYouTubeId(url);

    if (ytId) {
      // Always loop the single video. Playlist/radio params from the input URL
      // are intentionally ignored — visitors expect one song on repeat, not a queue.
      const params = new URLSearchParams({
        autoplay: '1', mute: '1',
        enablejsapi: '1', rel: '0',
        modestbranding: '1', playsinline: '1',
        loop: '1',
        playlist: ytId
      });
      return {
        type: 'youtube',
        id: ytId,
        embedUrl: `https://www.youtube.com/embed/${ytId}?${params.toString()}`
      };
    }
    const sp = url.match(/spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)/);
    if (sp) {
      return {
        type: 'spotify',
        id: sp[2],
        kind: sp[1],
        embedUrl: `https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=builder`
      };
    }
    return null;
  }

  // ---------------- Upload size limit ----------------
  const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB cap on input file size
  function checkFileSize(file) {
    if (!file) throw new Error('No file');
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Max is 5 MB — try a smaller version.`);
    }
  }

  // ---------------- Image compression ----------------
  function compressImage(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * maxDim / width);
            width = maxDim;
          } else {
            width = Math.round(width * maxDim / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const data = canvas.toDataURL('image/jpeg', quality);
          resolve(data);
        } catch (e) { reject(e); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  // ---------------- Render preview ----------------
  function render() {
    const root = $('#preview-frame');
    const pane = $('#preview-pane');
    const u = state;
    const photoSrc = u.photo_data || defaultPhotoSvg();
    const photoFilename = u.photo_data ? 'profile-photo.jpg' : 'no-photo.jpg';
    const firstName = (u.full_name || 'Me').split(' ')[0];
    const memberSince = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const profileViews = 1 + (((u.full_name || '').length * 137) % 4000);

    // Apply bg image/color to the PANE (so it fills the whole preview area, not just the page frame)
    if (pane) {
      pane.style.backgroundColor = u.theme_bg_color || '#f0eee6';
      pane.style.backgroundImage = u.bg_data ? `url('${u.bg_data}')` : 'none';
    }
    // Also apply to body in view-mode so the bg covers the full viewport edges
    if (document.body.classList.contains('view-mode')) {
      document.body.style.backgroundColor = u.theme_bg_color || '#f0eee6';
      document.body.style.backgroundImage = u.bg_data ? `url('${u.bg_data}')` : 'none';
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center top';
      document.body.style.backgroundAttachment = 'fixed';
    }

    const themeStyle = `
      <style>
        #preview-frame .pf-themed { color: ${u.theme_text_color}; padding: 0; }
        #preview-frame .pf-themed .pf-box { background: ${u.theme_box_color}e8; border: 1px dashed ${u.theme_heading_color}80; color: ${u.theme_text_color}; }
        #preview-frame .pf-themed .pf-header { background: ${u.theme_box_color}; color: ${u.theme_heading_color}; border-bottom: 1px solid ${u.theme_heading_color}40; }
        #preview-frame .pf-themed .pf-key, #preview-frame .pf-themed .pf-section-head, #preview-frame .pf-themed .pf-album-title { color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-val, #preview-frame .pf-themed .pf-info-table td, #preview-frame .pf-themed .pf-shoutout, #preview-frame .pf-themed .pf-recent { color: ${u.theme_text_color}; }
        #preview-frame .pf-themed a { color: ${u.theme_link_color}; }
        #preview-frame .pf-themed .pf-info-table th { color: ${u.theme_heading_color}; border-bottom-color: ${u.theme_heading_color}30; }
        #preview-frame .pf-themed .pf-info-table td { border-bottom-color: ${u.theme_heading_color}20; }
        #preview-frame .pf-themed .pf-shoutout, #preview-frame .pf-themed .pf-recent { background: ${u.theme_box_color}cc; border: 1px dashed ${u.theme_heading_color}80; }
        #preview-frame .pf-themed .pf-shoutout strong { color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-friend-cell .name { background: ${u.theme_heading_color}; color: ${u.theme_box_color}; border-color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-action-btn { background: ${u.theme_heading_color}; color: ${u.theme_box_color}; border-color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-section-head { border-bottom-color: ${u.theme_heading_color}40; }
        #preview-frame .pf-themed .pf-ad { background: ${u.theme_box_color}cc; color: ${u.theme_text_color}; border-color: ${u.theme_heading_color}40; }
        #preview-frame .pf-themed .pf-ad strong { color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-photo-name { color: ${u.theme_text_color}; opacity: 0.7; }
        #preview-frame .pf-themed .pf-topbar { background: ${u.theme_box_color}cc; color: ${u.theme_heading_color}; border-bottom: 1px solid ${u.theme_heading_color}40; }
        #preview-frame .pf-themed .pf-logo { color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-smiley { border-color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-smiley::before, #preview-frame .pf-themed .pf-smiley::after { background: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-smiley i { border-bottom-color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-utility, #preview-frame .pf-themed .pf-utility a { color: ${u.theme_link_color}; }
        #preview-frame .pf-themed .pf-search .lbl { color: ${u.theme_link_color}; }
        #preview-frame .pf-themed .pf-search select, #preview-frame .pf-themed .pf-search input { background: ${u.theme_box_color}; color: ${u.theme_text_color}; border-color: ${u.theme_heading_color}60; }
        #preview-frame .pf-themed .pf-navbar { background: ${u.theme_box_color}; border-color: ${u.theme_heading_color}40; }
        #preview-frame .pf-themed .pf-navbar a, #preview-frame .pf-themed .pf-navbar span.nav-item { color: ${u.theme_heading_color}; }
        #preview-frame .pf-themed .pf-footer { background: ${u.theme_box_color}cc; color: ${u.theme_text_color}aa; }
        #preview-frame .pf-themed .pf-footer a { color: ${u.theme_link_color}; }
      </style>`;

    const music = parseMusicUrl(u.music_url);

    const navItems = ['Home','Profile','Friends','Search','Video','Blogs','Love','Classifieds','Forums','Invite'];
    const navHtml = navItems.map((t,i) => {
      const sep = i ? '<span class="sep">|</span>' : '';
      const newTag = t === 'Love' ? '<span class="new">*NEW!</span>' : '';
      return `${sep}<span class="nav-item">${esc(t)}${newTag}</span>`;
    }).join('');

    const html = `
      ${themeStyle}
      <div class="pf-themed">
        <div class="pf-topbar">
          <div class="pf-topbar-row">
            <span class="pf-logo"><span class="pf-smiley"><i></i></span>friend_r</span>
            <div class="pf-utility">Messages <span class="sep">·</span> Settings <span class="sep">·</span> Help <span class="sep">·</span> Log Out</div>
          </div>
          <div class="pf-search">
            <span class="lbl">Search:</span>
            <select><option>Name</option></select>
            <input type="text" placeholder="email, first and last name, or first">
            <span class="pf-search-go">&#10148;</span>
          </div>
        </div>

        <div class="pf-navbar">${navHtml}</div>

        <div class="pf-body">
          <div class="pf-3col">
            <!-- LEFT -->
            <div>
              <div class="pf-box">
                <div class="pf-header">Profile Theme &mdash;</div>
                <div style="padding:10px;">
                  <div class="pf-photo-frame">
                    <img src="${esc(photoSrc)}" class="pf-photo">
                  </div>
                  <div class="pf-photo-name">${esc(photoFilename)}</div>
                  <div class="pf-action-grid">
                    <span class="pf-action-btn">View Messages</span>
                    <span class="pf-action-btn">Edit Blog</span>
                    <span class="pf-action-btn">Edit Friends</span>
                    <span class="pf-action-btn">Edit Comments</span>
                    <span class="pf-action-btn">Customize Page</span>
                    <span class="pf-action-btn">Edit Profile</span>
                    <span class="pf-action-btn" style="grid-column:1/-1;">Edit Photos</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- MIDDLE -->
            <div>
              <div class="pf-shoutout">
                ${u.shoutout ? `
                  <div><strong>${esc(firstName)}'s Shoutout!</strong></div>
                  <div class="pf-shoutout-text">&ldquo;${esc(u.shoutout)}&rdquo;</div>
                ` : `
                  <strong>Post a shoutout to your profile!</strong>
                  <span class="muted">(Create)</span>
                `}
              </div>
              <div class="pf-meta">
                <div><span class="pf-key">${esc(u.gender || '—')}${u.age ? ', ' + esc(u.age) : ''}${u.relationship_status ? ', ' + esc(u.relationship_status) : ''}</span></div>
                <div><span class="pf-key">Interested In:</span> <span class="pf-val">Friends</span></div>
                <div><span class="pf-key">Member Since:</span> <span class="pf-val">${esc(memberSince)}</span></div>
                <div><span class="pf-key">Profile Viewed:</span> <span class="pf-val">${profileViews} times</span></div>
                ${u.location ? `<div><span class="pf-key">Location:</span> <span class="pf-val">${esc(u.location)}</span></div>` : ''}
                ${u.occupation ? `<div><span class="pf-key">Occupation:</span> <span class="pf-val">${esc(u.occupation)}</span></div>` : ''}
                <div><span class="pf-key">Your URL:</span></div>
                <div style="padding-left:8px;"><span class="pf-val small">friend_r.me/${esc((u.full_name||'me').toLowerCase().replace(/[^a-z0-9]+/g,''))}</span></div>
                <div style="margin-top:8px;"><span class="pf-more-link">&raquo; More about ${esc(firstName)}</span></div>
              </div>
              <div class="pf-recent">
                <div><span class="pf-key">Recent Updates:</span> <span class="muted small">[visible to all]</span></div>
                <div class="muted small" style="padding:4px 0;">updated profile · just now</div>
              </div>
            </div>

            <!-- RIGHT -->
            <div>
              <div class="pf-section-head">${esc(firstName)}'s Friends</div>
              <div class="pf-friend-strip">
                ${fakeFriends.map(f => `
                  <div class="pf-friend-cell">
                    <img class="img" src="${fakeFriendAvatar(f)}" alt="${esc(f.name)}">
                    <div class="name">${esc(f.name)}</div>
                  </div>
                `).join('')}
              </div>
              <div class="pf-featured-row"><span>View All (${fakeFriends.length})</span><span>Edit Featured Friends</span></div>

              <div class="pf-section-head" style="margin-top:14px;">${esc(firstName)}'s Groups</div>
              <div class="pf-ad">
                <strong>Music Lovers United</strong>
                <div class="muted small">22 members · Public</div>
              </div>

              <div class="pf-ad" style="text-align:center;">
                <div class="muted small" style="margin-bottom:6px;">Sponsored</div>
                <a href="https://facebook.com/vcfyit" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; display:block;">
                  <div style="background:#3b5998; color:white; font-weight:bold; font-size:13px; padding:8px 4px; border-radius:3px; margin-bottom:4px;">
                    <span style="font-family:Georgia,serif; font-style:italic;">f</span>&nbsp; Follow me on Facebook
                  </div>
                  <div style="font-size:10px;">facebook.com/vcfyit</div>
                </a>
              </div>

              <div class="pf-ad" style="text-align:center;">
                <div class="muted small" style="margin-bottom:6px;">Sponsored</div>
                <a href="https://vcfyit.com" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; display:block;">
                  <div style="background:linear-gradient(135deg, #ec6428, #cc3300); color:white; font-weight:bold; font-size:13px; padding:8px 4px; border-radius:3px; margin-bottom:4px;">
                    <span style="display:inline-block; background:white; color:#cc3300; width:18px; height:18px; border-radius:2px; line-height:18px; font-weight:bold; font-family:Georgia,serif; margin-right:4px; vertical-align:middle; font-size:12px;">V</span>
                    Visit my Website
                  </div>
                  <div style="font-size:10px;">vcfyit.com</div>
                </a>
              </div>
            </div>
          </div>

          <!-- I'm currently listening to... -->
          ${(music || u.favorite_music) ? `
          <div class="pf-box" style="margin-top:14px;">
            <div class="pf-header">I'm currently listening to&hellip;</div>
            <div style="padding:12px;">
              ${music && music.type === 'youtube' ? (() => {
                const meta = getYouTubeMeta(u.music_url);
                const title = (meta && meta.title) || 'YouTube track';
                const author = (meta && meta.author_name) || '';
                const thumb = (meta && meta.thumbnail_url) || `https://img.youtube.com/vi/${music.id}/hqdefault.jpg`;
                return `
                  <div class="yt-player" data-yt-player>
                    <div class="yt-album-art">
                      <img src="${esc(thumb)}" alt="">
                      <button class="yt-overlay-btn" type="button" data-yt-control="toggle" aria-label="Play / Pause">&#9654;</button>
                    </div>
                    <div class="yt-track-info">
                      <div class="yt-title">${esc(title)}</div>
                      ${author ? `<div class="yt-author">${esc(author)}</div>` : ''}
                      <div class="yt-controls">
                        <span class="yt-eq"><span></span><span></span><span></span><span></span></span>
                        <span class="yt-source small muted">via YouTube</span>
                      </div>
                    </div>
                    <iframe class="yt-iframe-hidden" data-music data-music-type="youtube"
                      src="${esc(music.embedUrl)}"
                      allow="autoplay; encrypted-media"
                      tabindex="-1"
                      aria-hidden="true"></iframe>
                  </div>
                `;
              })() : ''}
              ${music && music.type === 'spotify' ? `
                <iframe data-music data-music-type="spotify"
                  src="${esc(music.embedUrl)}"
                  width="100%" height="152"
                  style="border:0; border-radius:6px; max-width:520px;"
                  allow="encrypted-media"
                  allowtransparency="true"></iframe>
              ` : ''}
              ${u.favorite_music ? `<div style="margin-top:8px;"><span class="muted small"><strong>Also into:</strong></span><div style="font-size:11px; line-height:1.5;">${esc(u.favorite_music)}</div></div>` : ''}
            </div>
          </div>` : ''}

          <!-- Glitter / Sparkle banner -->
          ${u.glitter_html ? `
          <div class="pf-glitter-banner">${sanitizeEmbedHTML(u.glitter_html)}</div>
          ` : ''}

          <!-- Photo Albums -->
          <div class="pf-box" style="margin-top:14px;">
            <div class="pf-header">${esc(firstName)}'s Photo Albums</div>
            <div style="padding:12px;">
              <div class="pf-album-grid">
                <div class="pf-album-tile">
                  <div class="pf-album-cover pf-album-cover-photo"><img src="${esc(photoSrc)}"></div>
                  <div class="pf-album-title">Profile Photo</div>
                  <div class="muted small">1 photo · Public</div>
                </div>
                <div class="pf-album-tile">
                  <div class="pf-album-cover-empty"></div>
                  <div class="pf-album-title muted">Vacation '08</div>
                  <div class="muted small">0 photos · Public</div>
                </div>
              </div>
            </div>
          </div>

          <!-- About + interests/etc -->
          <div class="pf-box" style="margin-top:14px;">
            <div class="pf-header">About ${esc(firstName)}${u.tagline ? ` &mdash; "<em>${esc(u.tagline)}</em>"` : ''}</div>
            <div style="padding:12px;">
              ${u.about_me ? `<p style="white-space:pre-wrap;">${nlToBr(u.about_me)}</p>` : '<p class="muted">Tell people about yourself.</p>'}
              <table class="pf-info-table">
                ${u.who_id_like_to_meet ? `<tr><th>Who I'd like to meet:</th><td>${nlToBr(u.who_id_like_to_meet)}</td></tr>` : ''}
                ${u.interests ? `<tr><th>Interests:</th><td>${esc(u.interests)}</td></tr>` : ''}
                ${u.favorite_music ? `<tr><th>Music:</th><td>${esc(u.favorite_music)}</td></tr>` : ''}
                ${u.favorite_movies ? `<tr><th>Movies:</th><td>${esc(u.favorite_movies)}</td></tr>` : ''}
                ${u.favorite_books ? `<tr><th>Books:</th><td>${esc(u.favorite_books)}</td></tr>` : ''}
              </table>
            </div>
          </div>

        </div>

        <div class="pf-footer">
          About Us <span class="sep">|</span> Contact Us <span class="sep">|</span> Help <span class="sep">|</span> Terms of Service <span class="sep">|</span> Privacy Policy
          <div class="muted small" style="margin-top:6px; line-height:1.5;">
            <strong>Fan-made recreation for entertainment only.</strong>
            Not affiliated with, endorsed by, or sponsored by the Friendster brand.
            Friendster&reg; and related marks are property of their respective owners.
          </div>
          <div class="muted small" style="margin-top:2px;">Copyright 2002&ndash;${new Date().getFullYear()} &middot; A nostalgia tribute by VCFY I.T. Solutions</div>
        </div>
      </div>
    `;
    root.innerHTML = html;
  }

  // ---------------- Fake "friends" for the right-column strip ----------------
  const fakeFriends = [
    { name: 'Jen',  bg: '#b89dd9', fg: '#fff' },     // purple
    { name: 'Mark', bg: '#3a6dd9', fg: '#fff' },     // blue
    { name: 'Sara', bg: '#f0a050', fg: '#fff' },     // orange
    { name: 'Rico', bg: '#cc3300', fg: '#fff' },     // red
    { name: 'Lily', bg: '#ffcc66', fg: '#5a3680' },  // yellow
    { name: 'Kev',  bg: '#7eb04a', fg: '#fff' }      // green
  ];
  function fakeFriendAvatar(f) {
    const initial = (f.name || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
      <rect width='100' height='100' fill='${f.bg}'/>
      <circle cx='50' cy='40' r='16' fill='${f.fg}' opacity='0.85'/>
      <path d='M 18 100 Q 18 65 50 65 Q 82 65 82 100 Z' fill='${f.fg}' opacity='0.85'/>
      <text x='50' y='52' font-family='Verdana,sans-serif' font-size='22' font-weight='bold' fill='${f.bg}' text-anchor='middle'>${initial}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ---------------- Default avatar SVG (data URL) ----------------
  function defaultPhotoSvg() {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
      <rect width='200' height='200' fill='#e8dcb8'/>
      <circle cx='100' cy='80' r='34' fill='#b89dd9'/>
      <path d='M 36 200 Q 36 130 100 130 Q 164 130 164 200 Z' fill='#b89dd9'/>
      <text x='100' y='195' font-family='Verdana' font-size='11' fill='#6b3fa0' text-anchor='middle' font-weight='bold'>no photo</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ---------------- Form binding ----------------
  function hydrateForm() {
    const form = $('#profile-form');
    Object.keys(state).forEach(key => {
      const el = form.elements[key];
      if (!el) return;
      if (el.type === 'file') return;
      el.value = state[key];
    });
  }

  function bindForm() {
    const form = $('#profile-form');
    form.addEventListener('input', (e) => {
      const el = e.target;
      if (!el.name) return;
      if (el.type === 'file') return;
      state[el.name] = el.value;
      saveState();
      render();
      // If the music URL changed and looks like YouTube, fetch oEmbed metadata
      if (el.name === 'music_url' && parseYouTubeId(el.value)) {
        fetchYouTubeMeta(el.value).then(() => render());
      }
    });

    // Photo upload — Cloudinary if configured, else inline data URL
    const photoInput = form.querySelector('input[data-photo]');
    photoInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        checkFileSize(file);
        showToast('Compressing photo…');
        const data = await compressImage(file, 400, 0.8);
        if (HAS_CLOUDINARY) {
          showToast('Uploading…');
          const url = await uploadToCloudinary(dataUrlToBlob(data), 'photo.jpg');
          state.photo_data = url;
        } else {
          state.photo_data = data;
        }
        saveState();
        render();
        showToast('Photo updated.');
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Photo upload failed.');
      }
    });

    // BG upload — Cloudinary if configured, else inline data URL
    const bgInput = form.querySelector('input[data-bg]');
    bgInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        checkFileSize(file);
        showToast('Compressing background…');
        const data = await compressImage(file, 1200, 0.7);
        if (HAS_CLOUDINARY) {
          showToast('Uploading…');
          const url = await uploadToCloudinary(dataUrlToBlob(data), 'bg.jpg');
          state.bg_data = url;
        } else {
          state.bg_data = data;
        }
        saveState();
        render();
        showToast('Background updated.');
      } catch (err) {
        console.error(err);
        showToast(err.message || 'Background upload failed.');
      }
    });
  }

  // ---------------- Username URL preview (no live uniqueness check — server appends _<rand4>) ----------------
  function bindUsernameField() {
    const form = $('#profile-form');
    if (!form) return;
    const input = form.elements.username;
    const hint = $('#username-hint');
    if (!input) return;

    const baseUrl = CFG.pageUrl || (window.location.origin + window.location.pathname);
    const updatePreview = () => {
      const v = (input.value || '').trim().toLowerCase();
      const sample = v ? `${v}_xxxx` : 'yourname_xxxx';
      hint.innerHTML = `Your share link will be: <code>${esc(baseUrl)}?p=${esc(sample)}</code><br><span class="muted small">We'll add a unique 4-character tag automatically &mdash; no need to worry about taken names.</span>`;
    };

    input.addEventListener('input', () => {
      const v = (input.value || '').trim().toLowerCase();
      input.value = v.replace(/[^a-z0-9_-]/g, '').slice(0, 27); // leave room for _xxxx suffix
      updatePreview();
    });

    updatePreview();
  }

  // ---------------- Email gate ----------------
  function showEmailGate() {
    const m = $('#email-gate');
    if (!m) return;
    m.hidden = false;
  }
  function hideEmailGate() {
    const m = $('#email-gate');
    if (m) m.hidden = true;
  }
  // Pending callback fired after the modal is closed (submit OR skip)
  let _emailModalCb = null;

  function bindEmailGate() {
    const form = $('#email-gate-form');
    const errorEl = $('#email-gate-error');
    const skipBtn = $('#email-skip-btn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      const fd = new FormData(form);
      const email = String(fd.get('email') || '').trim();
      const opt_in = !!fd.get('opt_in');
      if (!email) {
        // Treat empty submit as a skip — don't error
        skipModal();
        return;
      }
      try {
        const r = await apiPost('lead', { email, opt_in });
        if (r && r.lead_id) {
          saveLead({ leadId: r.lead_id, email, opt_in, fromModal: true });
          hideEmailGate();
          showToast('Saved your email — thanks!');
          fireCallback();
        } else {
          throw new Error('Bad response');
        }
      } catch (err) {
        console.error(err);
        errorEl.textContent = err.message || 'Something went wrong. Try again?';
        errorEl.hidden = false;
      }
    });

    if (skipBtn) {
      skipBtn.addEventListener('click', () => skipModal());
    }
  }

  function skipModal() {
    saveLead({ leadId: 0, email: '', opt_in: 0, skipped: true });
    hideEmailGate();
    fireCallback();
  }
  function fireCallback() {
    const cb = _emailModalCb;
    _emailModalCb = null;
    if (typeof cb === 'function') {
      try { cb(); } catch (e) { console.error(e); }
    }
  }

  // Show the email modal if the user hasn't decided yet, then run `cb()`.
  // If they've already decided (entered or skipped), run cb() immediately.
  function maybeAskForEmail(cb) {
    if (!HAS_BACKEND) return cb();
    if (loadLead()) return cb(); // already decided (lead saved or skip flag set)
    _emailModalCb = cb;
    showEmailGate();
  }

  // ---------------- Reset ----------------
  function bindReset() {
    $('#reset-btn').addEventListener('click', () => {
      if (!confirm('Reset profile to defaults? This will clear everything.')) return;
      state = JSON.parse(JSON.stringify(defaultState));
      saveState();
      hydrateForm();
      render();
      showToast('Profile reset.');
    });
  }

  // ---------------- Capture screenshot ----------------
  async function captureScreenshot() {
    if (typeof html2canvas === 'undefined') throw new Error('html2canvas not loaded');
    const target = $('#preview-pane');
    if (!target) throw new Error('no preview-pane');

    // Watermark added briefly inside the page frame so it's part of the screenshot
    const frame = $('#preview-frame');
    const watermark = document.createElement('div');
    watermark.className = 'pf-watermark';
    watermark.textContent = 'Make yours at ' + window.location.host + window.location.pathname;
    frame.appendChild(watermark);

    let canvas;
    try {
      canvas = await html2canvas(target, {
        backgroundColor: state.theme_bg_color || '#ffffff',
        useCORS: true,
        allowTaint: true,
        scale: window.devicePixelRatio > 1 ? 2 : 1.5,
        logging: false
      });
    } finally {
      if (frame.contains(watermark)) frame.removeChild(watermark);
    }

    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    const filename = ((state.full_name || 'my-friend-r-profile').toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'profile') + '.png';
    return { blob, filename };
  }

  // ---------------- Share modal ----------------
  async function openShareModal() {
    const modal = $('#share-modal');
    if (HAS_BACKEND) {
      if (!requireUsername()) return;
    }

    // Wrap the rest in the optional-email gate so it only fires once per device
    maybeAskForEmail(async () => {
      if (HAS_BACKEND) {
        try {
          showToast('Saving your profile…');
          await saveProfileToBackend();
        } catch (err) {
          console.error(err);
          showToast(err.message || 'Could not save profile.');
          return;
        }
      }
      _populateShareModal();
    });
  }

  function _populateShareModal() {
    const modal = $('#share-modal');
    const url = buildShareUrl();
    $('#share-url').value = url;
    const enc = encodeURIComponent(url);
    const text = encodeURIComponent('Made my friend_r profile! 💾');
    $('#share-twitter').href = `https://twitter.com/intent/tweet?text=${text}&url=${enc}`;
    $('#share-facebook').href = `https://www.facebook.com/sharer/sharer.php?u=${enc}`;
    $('#share-whatsapp').href = `https://api.whatsapp.com/send?text=${text}%20${enc}`;

    // Show "share image via system" only if Web Share API supports files
    const dummy = new File([new Blob(['x'])], 'x.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [dummy] })) {
      $('#native-share-btn').hidden = false;
    }
    modal.hidden = false;
  }
  function closeShareModal() { $('#share-modal').hidden = true; }

  function bindShare() {
    $('#share-btn').addEventListener('click', openShareModal);

    // Modal close handlers
    $$('[data-close]').forEach(el => el.addEventListener('click', closeShareModal));

    // Copy link
    $('#copy-link-btn').addEventListener('click', async () => {
      const input = $('#share-url');
      try {
        await navigator.clipboard.writeText(input.value);
        showToast('Link copied! Paste it anywhere.');
      } catch (_) {
        input.select();
        document.execCommand('copy');
        showToast('Link copied.');
      }
    });

    // Download screenshot
    $('#download-screenshot-btn').addEventListener('click', async () => {
      try {
        showToast('Capturing screenshot…');
        const { blob, filename } = await captureScreenshot();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Downloaded — drag it onto your post!');
      } catch (err) {
        console.error(err);
        showToast('Screenshot failed.');
      }
    });

    // Native share (image via system share sheet)
    $('#native-share-btn').addEventListener('click', async () => {
      try {
        showToast('Capturing screenshot…');
        const { blob, filename } = await captureScreenshot();
        const file = new File([blob], filename, { type: 'image/png' });
        const url = buildShareUrl();
        await navigator.share({
          files: [file],
          title: 'My friend_r Profile',
          text: 'Made my friend_r profile!',
          url: url
        });
        showToast('Shared!');
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        console.error(err);
        showToast('Share cancelled or unsupported.');
      }
    });
  }

  // ---------------- View mode toggle ----------------
  function bindViewMode() {
    const viewBtn = $('#view-mode-btn');
    if (!viewBtn) return;
    viewBtn.addEventListener('click', async () => {
      if (HAS_BACKEND) {
        if (!requireUsername()) return;
      }
      // Optional email modal: only shows once, on first Preview/Share click.
      maybeAskForEmail(async () => {
        if (HAS_BACKEND) {
          try {
            showToast('Saving your profile…');
            await saveProfileToBackend();
          } catch (err) {
            console.error(err);
            showToast(err.message || 'Could not save profile.');
            return;
          }
          try {
            const target = `?p=${encodeURIComponent(state.username)}`;
            window.history.pushState(null, '', target);
          } catch (_) {}
        } else {
          window.location.hash = 'p=' + encodeState(state);
        }
        enterViewMode();
      });
    });
  }
  function enterViewMode() {
    document.body.classList.add('view-mode');
    render();
    showIntroModal();
  }

  // ---------------- Intro modal (visitors of shared profiles) ----------------
  function showIntroModal() {
    const modal = $('#intro-modal');
    if (!modal) return;
    // Adapt the CTA text to whether music will play
    const btn = $('#intro-enter-btn');
    if (btn) {
      const hasMusic = !!parseMusicUrl(state.music_url);
      btn.innerHTML = hasMusic
        ? 'Enter Profile &amp; Play Music &raquo;'
        : 'Enter Profile &raquo;';
    }
    modal.hidden = false;
  }

  function ytPostMessage(iframe, func, args) {
    try {
      iframe.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: func, args: args || [] }),
        '*'
      );
    } catch (_) {}
  }

  function unmuteAllMusic() {
    // YouTube: unmute via postMessage
    $$('iframe[data-music-type="youtube"]').forEach(iframe => {
      ytPostMessage(iframe, 'unMute');
      ytPostMessage(iframe, 'setVolume', [60]);
      ytPostMessage(iframe, 'playVideo');
    });
    // Spotify: no programmatic play possible; visitor will see the player
  }

  // Play/pause toggle on the custom album-art overlay button
  function bindCustomPlayerControls() {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-yt-control]');
      if (!btn) return;
      e.preventDefault();
      const player = btn.closest('[data-yt-player]');
      if (!player) return;
      const iframe = player.querySelector('iframe[data-music-type="youtube"]');
      if (!iframe) return;

      const action = btn.getAttribute('data-yt-control');
      const playing = btn.classList.contains('is-playing');
      if (action === 'toggle') {
        if (playing) {
          ytPostMessage(iframe, 'pauseVideo');
          btn.classList.remove('is-playing');
          btn.innerHTML = '&#9654;';
        } else {
          ytPostMessage(iframe, 'unMute');
          ytPostMessage(iframe, 'setVolume', [60]);
          ytPostMessage(iframe, 'playVideo');
          btn.classList.add('is-playing');
          btn.innerHTML = '&#10074;&#10074;'; // pause icon
        }
      }
    });
  }

  function bindIntroModal() {
    const btn = $('#intro-enter-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const modal = $('#intro-modal');
      if (modal) modal.hidden = true;
      // The click itself is the user gesture — unmute now
      unmuteAllMusic();
      // Some browsers need a small grace period before postMessage works
      setTimeout(unmuteAllMusic, 600);
      setTimeout(unmuteAllMusic, 1500);
    });
  }

  // ---------------- Init ----------------
  document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for ?p=<username> — fetch profile from backend
    const slug = parseSlugFromQuery();
    if (slug && HAS_BACKEND) {
      const remoteState = await fetchProfileBySlug(slug);
      if (remoteState) {
        state = { ...defaultState, ...remoteState };
        document.body.classList.add('view-mode');
      }
    }
    // 2. Otherwise check for #p=<base64> — hash-encoded profile (fallback, backend-less)
    if (!document.body.classList.contains('view-mode')) {
      const hashState = parseHashState();
      if (hashState) {
        state = { ...defaultState, ...hashState };
        document.body.classList.add('view-mode');
      }
    }

    hydrateForm();
    render();
    bindForm();
    bindUsernameField();
    bindEmailGate();
    bindReset();
    bindShare();
    bindViewMode();
    bindIntroModal();
    bindCustomPlayerControls();

    // If a music URL is already set, fetch its metadata for the nicer player widget
    if (parseYouTubeId(state.music_url)) {
      fetchYouTubeMeta(state.music_url).then(() => render());
    }

    // 3. View-mode (visiting a shared profile) → show intro modal as before
    if (document.body.classList.contains('view-mode')) {
      showIntroModal();
      return;
    }

    // 4. Builder mode + backend configured → adopt logged-in WP user lead silently if any.
    //    No entry gate — the email modal now appears when the user clicks Preview/Share.
    if (HAS_BACKEND) {
      const validAutoLeadId = parseInt(CFG.autoLeadId, 10) || 0;

      // Clean up junk leads from earlier versions (leadId "0" or missing)
      const existing = loadLead();
      if (existing && !(parseInt(existing.leadId, 10) > 0) && !existing.skipped) {
        try { localStorage.removeItem(LEAD_KEY); } catch (_) {}
      }

      if (validAutoLeadId > 0 && !loadLead()) {
        saveLead({ leadId: validAutoLeadId, email: CFG.autoLeadEmail || '', opt_in: 0, autoFromWp: true });
      }
    }

    // Esc to close share modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeShareModal();
    });
  });
})();
