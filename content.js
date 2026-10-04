(function () {
  'use strict';

  // Guard: prevent double-injection
  if (window.__caV2Loaded) return;
  window.__caV2Loaded = true;

  console.log('[Crossagent v2] loaded on', window.location.hostname);

  // ─── Config ───────────────────────────────────────────────────────────────
  const AGENTS = ['@claude', '@gemini', '@chatgpt', '@groq', '@perplexity', '@grok', '@mistral', '@copilot'];
  const BACKEND = 'https://pleasing-art-production-e68e.up.railway.app';

  const HOST = location.hostname;
  const SITE = HOST.includes('chatgpt.com') ? 'chatgpt'
    : HOST.includes('claude.ai') ? 'claude'
    : HOST.includes('gemini.google.com') ? 'gemini'
    : HOST.includes('perplexity.ai') ? 'perplexity'
    : HOST.includes('grok.com') ? 'grok'
    : HOST.includes('mistral.ai') ? 'mistral'
    : HOST.includes('copilot.microsoft.com') ? 'copilot'
    : 'ai';

  const SITE_LABEL = {
    chatgpt: 'ChatGPT', claude: 'Claude', gemini: 'Gemini',
    perplexity: 'Perplexity', grok: 'Grok', mistral: 'Mistral', copilot: 'Copilot', ai: 'AI'
  }[SITE];

  const AGENT_COLORS = {
    claude: '#da7756', chatgpt: '#10a37f', gemini: '#4285f4', groq: '#f55036',
    perplexity: '#20808d', grok: '#1d9bf0', mistral: '#ff7000', copilot: '#0078d4'
  };

  // ─── State ────────────────────────────────────────────────────────────────
  const chatHistory = [];
  let unreadCount = 0;
  let mentionPending = false;
  let agentRoles = {}; // { claude: 'Researcher', chatgpt: 'Coder', ... }

  // ─── Cross-tab persistence ────────────────────────────────────────────────
  let _saveTimer = null;
  function saveHistory() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async () => {
      try {
        const toSave = chatHistory.filter(e => e.type !== 'loading').slice(-60);
        await chrome.storage.local.set({ ca_history: JSON.stringify(toSave) });
      } catch {}
    }, 300);
  }

  async function loadHistory() {
    try {
      const stored = await chrome.storage.local.get(['ca_history']);
      if (!stored.ca_history) return;
      const entries = JSON.parse(stored.ca_history);
      if (!entries.length) return;
      chatHistory.push(...entries);
      renderHistory();
    } catch {}
  }

  async function clearHistory() {
    chatHistory.length = 0;
    try { await chrome.storage.local.remove('ca_history'); } catch {}
  }

  // ─── Role persistence ─────────────────────────────────────────────────────
  async function saveRoles() {
    try { await chrome.storage.local.set({ ca_roles: agentRoles }); } catch {}
  }

  async function loadRoles() {
    try {
      const stored = await chrome.storage.local.get(['ca_roles']);
      if (stored.ca_roles) agentRoles = stored.ca_roles;
    } catch {}
  }

  // ─── XSS-safe markdown ────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMd(raw) {
    const saved = [];
    let h = raw.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, _l, code) => {
      const i = saved.length;
      saved.push('<pre><code>' + esc(code.trim()) + '</code></pre>');
      return '\x00' + i + '\x00';
    }).replace(/`([^`\n]+)`/g, (_, c) => {
      const i = saved.length;
      saved.push('<code>' + esc(c) + '</code>');
      return '\x00' + i + '\x00';
    });
    h = esc(h);
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>').replace(/^## (.+)$/gm, '<h2>$1</h2>').replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    h = h.replace(/^((?:[ \t]*[-*+] .+\n?)+)/gm, m => '<ul>' + m.trim().split('\n').map(l => '<li>' + l.replace(/^[ \t]*[-*+] /, '') + '</li>').join('') + '</ul>');
    h = h.replace(/^((?:[ \t]*\d+\. .+\n?)+)/gm, m => '<ol>' + m.trim().split('\n').map(l => '<li>' + l.replace(/^[ \t]*\d+\. /, '') + '</li>').join('') + '</ol>');
    h = h.split(/\n{2,}/).map(b => { b = b.trim(); if (!b) return ''; if (/^(<(h[123]|ul|ol|pre)|\x00)/.test(b)) return b; return '<p>' + b.replace(/\n/g, '<br>') + '</p>'; }).join('\n');
    return h.replace(/\x00(\d+)\x00/g, (_, i) => saved[+i]);
  }

  // ─── Panel styles ─────────────────────────────────────────────────────────
  function ensureStyles() {
    if (document.getElementById('ca-v2-styles')) return;
    const s = document.createElement('style');
    s.id = 'ca-v2-styles';
    s.textContent = `
      @keyframes caIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes caDot{0%,80%,100%{transform:scale(.6);opacity:.3}40%{transform:scale(1);opacity:1}}
      #ca-panel{position:fixed;bottom:24px;right:24px;width:390px;max-width:calc(100vw - 32px);
        height:530px;max-height:calc(100vh - 48px);border-radius:16px;background:#18181b;color:#f4f4f5;
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.65;
        z-index:2147483647;box-shadow:0 24px 64px rgba(0,0,0,.75),0 4px 20px rgba(0,0,0,.5);
        display:flex;flex-direction:column;overflow:hidden;animation:caIn .22s cubic-bezier(.34,1.4,.64,1);}
      #ca-panel.ca-hide{display:none!important;}
      #ca-panel .ca-head{display:flex;align-items:center;justify-content:space-between;
        padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;}
      #ca-panel .ca-brand{display:flex;align-items:center;gap:8px;}
      #ca-panel .ca-bead{width:10px;height:10px;border-radius:50%;
        background:linear-gradient(135deg,#da7756,#4285f4);}
      #ca-panel .ca-title{font-size:11px;font-weight:700;letter-spacing:.1em;
        text-transform:uppercase;color:rgba(255,255,255,.85);}
      #ca-panel .ca-btns{display:flex;gap:5px;}
      #ca-panel .ca-btn{width:22px;height:22px;border-radius:50%;border:none;cursor:pointer;
        background:rgba(255,255,255,.08);color:rgba(255,255,255,.4);
        display:flex;align-items:center;justify-content:center;font-size:12px;transition:.15s;}
      #ca-panel .ca-btn:hover{background:rgba(255,255,255,.18);color:#fff;}
      #ca-panel .ca-msgs{flex:1;overflow-y:auto;padding:14px 12px;
        display:flex;flex-direction:column;gap:14px;min-height:0;}
      #ca-panel .ca-msgs::-webkit-scrollbar{width:3px;}
      #ca-panel .ca-msgs::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px;}
      #ca-panel .ca-empty{flex:1;display:flex;align-items:center;justify-content:center;
        text-align:center;color:rgba(255,255,255,.22);font-size:13px;padding:0 24px;line-height:1.8;}
      #ca-panel .ca-empty strong{color:rgba(255,255,255,.45);}
      #ca-panel .ca-ububble{display:flex;justify-content:flex-end;}
      #ca-panel .ca-umsg{background:rgba(255,255,255,.09);border-radius:14px 14px 3px 14px;
        padding:8px 13px;max-width:85%;font-size:13px;color:rgba(255,255,255,.8);word-break:break-word;}
      #ca-panel .ca-utag{font-size:9px;color:rgba(255,255,255,.28);display:block;margin-bottom:3px;
        text-transform:uppercase;letter-spacing:.08em;}
      #ca-panel .ca-amsg{display:flex;flex-direction:column;gap:5px;}
      #ca-panel .ca-ahead{display:flex;align-items:center;gap:6px;}
      #ca-panel .ca-adot{width:7px;height:7px;border-radius:50%;}
      #ca-panel .ca-aname{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;}
      #ca-panel .ca-abody{background:rgba(255,255,255,.05);border-radius:3px 14px 14px 14px;
        padding:10px 13px;font-size:13px;word-break:break-word;}
      #ca-panel .ca-anote{font-size:10px;color:rgba(255,255,255,.2);padding-left:2px;margin-top:2px;}
      #ca-panel .ca-aact{display:flex;gap:6px;margin-top:3px;}
      #ca-panel .ca-copy{font-size:10px;color:rgba(255,255,255,.28);background:none;border:none;
        cursor:pointer;padding:2px 6px;border-radius:4px;transition:.15s;}
      #ca-panel .ca-copy:hover{background:rgba(255,255,255,.08);color:rgba(255,255,255,.7);}
      #ca-panel .ca-spin{display:flex;align-items:center;gap:4px;padding:6px 2px;}
      #ca-panel .ca-dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.35);
        animation:caDot 1.2s ease-in-out infinite;}
      #ca-panel .ca-dot:nth-child(2){animation-delay:.2s;}
      #ca-panel .ca-dot:nth-child(3){animation-delay:.4s;}
      #ca-panel .ca-md p{margin:0 0 8px;}#ca-panel .ca-md p:last-child{margin-bottom:0;}
      #ca-panel .ca-md h1,#ca-panel .ca-md h2,#ca-panel .ca-md h3{font-weight:600;margin:10px 0 4px;color:#fff;}
      #ca-panel .ca-md h1{font-size:16px;}#ca-panel .ca-md h2{font-size:14px;}#ca-panel .ca-md h3{font-size:13px;}
      #ca-panel .ca-md code{background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px;
        font-family:'SF Mono',Monaco,Consolas,monospace;font-size:12px;}
      #ca-panel .ca-md pre{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.08);
        border-radius:8px;padding:10px 12px;overflow-x:auto;margin:8px 0;}
      #ca-panel .ca-md pre code{background:none;padding:0;}
      #ca-panel .ca-md ul,#ca-panel .ca-md ol{padding-left:16px;margin:0 0 8px;}
      #ca-panel .ca-md li{margin-bottom:2px;}#ca-panel .ca-md strong{font-weight:600;color:#fff;}
      #ca-panel .ca-irow{display:flex;gap:6px;padding:8px 10px;
        border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;align-items:flex-end;}
      #ca-panel .ca-input{flex:1;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
        border-radius:8px;color:#f4f4f5;font-size:13px;padding:7px 10px;resize:none;outline:none;
        font-family:inherit;line-height:1.4;min-height:34px;max-height:80px;overflow-y:auto;}
      #ca-panel .ca-input::placeholder{color:rgba(255,255,255,.25);}
      #ca-panel .ca-input:focus{border-color:rgba(255,255,255,.2);}
      #ca-panel .ca-send{background:rgba(255,255,255,.1);border:none;border-radius:8px;
        color:rgba(255,255,255,.7);font-size:18px;width:34px;height:34px;flex-shrink:0;
        cursor:pointer;transition:.15s;display:flex;align-items:center;justify-content:center;}
      #ca-panel .ca-send:hover{background:rgba(255,255,255,.18);color:#fff;}
      #ca-panel .ca-send:disabled{opacity:.4;cursor:default;}
      #ca-panel .ca-foot{padding:7px 14px;border-top:1px solid rgba(255,255,255,.06);flex-shrink:0;
        font-size:10px;color:rgba(255,255,255,.18);text-align:center;letter-spacing:.04em;}
      #ca-badge{position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;
        border:none;cursor:pointer;z-index:2147483647;
        background:linear-gradient(135deg,#da7756,#4285f4);
        box-shadow:0 4px 20px rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;
        font-size:10px;font-weight:800;color:#fff;letter-spacing:.06em;transition:.15s;}
      #ca-badge:hover{transform:scale(1.08);box-shadow:0 6px 28px rgba(0,0,0,.65);}
      #ca-badge .ca-bdot{position:absolute;top:-1px;right:-1px;width:14px;height:14px;
        background:#ef4444;border-radius:50%;font-size:8px;font-weight:700;color:#fff;
        display:none;align-items:center;justify-content:center;}
      #ca-panel .ca-tabs{display:flex;gap:0;border-bottom:1px solid rgba(255,255,255,.08);flex-shrink:0;}
      #ca-panel .ca-tab{flex:1;padding:8px 0;font-size:11px;font-weight:600;letter-spacing:.06em;
        text-transform:uppercase;border:none;background:none;color:rgba(255,255,255,.3);
        cursor:pointer;transition:.15s;border-bottom:2px solid transparent;margin-bottom:-1px;}
      #ca-panel .ca-tab:hover{color:rgba(255,255,255,.6);}
      #ca-panel .ca-tab.active{color:#fff;border-bottom-color:#fff;}
      #ca-panel .ca-mem-panel{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;min-height:0;}
      #ca-panel .ca-mem-panel::-webkit-scrollbar{width:3px;}
      #ca-panel .ca-mem-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px;}
      #ca-panel .ca-mem-card{background:rgba(255,255,255,.05);border-radius:10px;padding:10px 12px;
        display:flex;align-items:flex-start;gap:8px;}
      #ca-panel .ca-mem-type{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
        padding:2px 6px;border-radius:4px;flex-shrink:0;margin-top:1px;}
      #ca-panel .ca-mem-type.fact{background:rgba(66,133,244,.2);color:#4285f4;}
      #ca-panel .ca-mem-type.preference{background:rgba(218,119,86,.2);color:#da7756;}
      #ca-panel .ca-mem-type.episode{background:rgba(74,222,128,.15);color:#4ade80;}
      #ca-panel .ca-mem-content{font-size:12px;color:rgba(255,255,255,.75);flex:1;line-height:1.5;}
      #ca-panel .ca-mem-meta{font-size:10px;color:rgba(255,255,255,.2);margin-top:3px;}
      #ca-panel .ca-mem-del{background:none;border:none;cursor:pointer;color:rgba(255,255,255,.2);
        font-size:14px;padding:0 2px;flex-shrink:0;transition:.15s;line-height:1;}
      #ca-panel .ca-mem-del:hover{color:#ef4444;}
      #ca-panel .ca-mem-empty{flex:1;display:flex;align-items:center;justify-content:center;
        text-align:center;color:rgba(255,255,255,.22);font-size:12px;padding:0 24px;line-height:1.8;}
      #ca-panel .ca-mem-search{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
        border-radius:7px;color:#f4f4f5;font-size:12px;padding:6px 10px;outline:none;font-family:inherit;margin-bottom:8px;flex-shrink:0;}
      #ca-panel .ca-mem-search::placeholder{color:rgba(255,255,255,.2);}
      #ca-panel .ca-mem-group{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
        color:rgba(255,255,255,.3);padding:8px 0 5px;border-bottom:1px solid rgba(255,255,255,.06);margin-bottom:5px;}
      #ca-panel .ca-roles-panel{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:8px;min-height:0;}
      #ca-panel .ca-roles-panel::-webkit-scrollbar{width:3px;}
      #ca-panel .ca-roles-panel::-webkit-scrollbar-thumb{background:rgba(255,255,255,.12);border-radius:2px;}
      #ca-panel .ca-role-row{display:flex;align-items:center;justify-content:space-between;
        padding:9px 12px;background:rgba(255,255,255,.04);border-radius:9px;}
      #ca-panel .ca-role-agent{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:500;}
      #ca-panel .ca-role-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
      #ca-panel .ca-role-sel{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);
        border-radius:6px;color:#f4f4f5;font-size:12px;padding:4px 8px;outline:none;cursor:pointer;}
      #ca-panel .ca-role-sel:focus{border-color:rgba(255,255,255,.25);}
      #ca-panel .ca-roles-hint{font-size:11px;color:rgba(255,255,255,.2);text-align:center;padding:8px 0;line-height:1.7;margin-top:4px;}
    `;
    document.head.appendChild(s);
  }

  // ─── Entry rendering ──────────────────────────────────────────────────────
  function renderEntry(e) {
    if (e.type === 'user') {
      return `<div class="ca-ububble"><div class="ca-umsg"><span class="ca-utag">→ ${esc(e.agent || 'agent')}</span>${esc(e.text || '')}</div></div>`;
    }
    const color = AGENT_COLORS[(e.agent || '').toLowerCase()] || '#888';
    const name = esc(e.agent || 'Agent');
    if (e.type === 'loading') {
      return `<div class="ca-amsg"><div class="ca-ahead"><span class="ca-adot" style="background:${color}"></span><span class="ca-aname" style="color:${color}">${name}</span></div><div class="ca-abody"><div class="ca-spin"><span class="ca-dot"></span><span class="ca-dot"></span><span class="ca-dot"></span></div></div></div>`;
    }
    if (e.type === 'error') {
      return `<div class="ca-amsg"><div class="ca-ahead"><span class="ca-adot" style="background:#ef4444"></span><span class="ca-aname" style="color:#ef4444">${name}</span></div><div class="ca-abody" style="color:rgba(255,120,120,.9);font-size:12px;">${esc(e.text || '')}</div></div>`;
    }
    const note = e.note ? `<div class="ca-anote">✓ ${esc(e.note)}</div>` : '';
    return `<div class="ca-amsg" data-id="${e.id}"><div class="ca-ahead"><span class="ca-adot" style="background:${color}"></span><span class="ca-aname" style="color:${color}">${name}</span></div><div class="ca-abody"><div class="ca-md">${renderMd(e.text || '')}</div></div>${note}<div class="ca-aact"><button class="ca-copy" data-id="${e.id}">Copy</button></div></div>`;
  }

  // ─── Panel helpers ────────────────────────────────────────────────────────
  function scrollBottom(force) {
    const m = document.getElementById('ca-msgs');
    if (!m) return;
    if (force || m.scrollHeight - m.scrollTop - m.clientHeight < 120) m.scrollTop = m.scrollHeight;
  }

  function renderHistory() {
    const msgs = document.getElementById('ca-msgs');
    if (!msgs) return;
    if (!chatHistory.length) {
      msgs.innerHTML = `<div class="ca-empty"><p>Type <strong>@claude</strong>, <strong>@gemini</strong>, <strong>@groq</strong>, <strong>@grok</strong>, or <strong>@mistral</strong> in any AI chat — or use the box below.</p></div>`;
      return;
    }
    msgs.innerHTML = chatHistory.map(renderEntry).join('');
    msgs.querySelectorAll('.ca-copy').forEach(btn => {
      btn.addEventListener('click', ev => {
        const entry = chatHistory.find(m => m.id === ev.currentTarget.dataset.id);
        if (!entry?.text) return;
        navigator.clipboard.writeText(entry.text).then(() => {
          ev.currentTarget.textContent = 'Copied!';
          setTimeout(() => { ev.currentTarget.textContent = 'Copy'; }, 1500);
        });
      });
    });
    scrollBottom();
  }

  function addEntry(entry) {
    chatHistory.push(entry);
    if (document.getElementById('ca-panel')?.classList.contains('ca-hide')) {
      unreadCount++;
      const dot = document.querySelector('#ca-badge .ca-bdot');
      if (dot) { dot.textContent = unreadCount; dot.style.display = 'flex'; }
    }
    renderHistory();
  }

  function updateEntry(id, updates) {
    const idx = chatHistory.findIndex(m => m.id === id);
    if (idx !== -1) Object.assign(chatHistory[idx], updates);
    if (document.getElementById('ca-panel')?.classList.contains('ca-hide') && updates.type === 'agent') {
      unreadCount++;
      const dot = document.querySelector('#ca-badge .ca-bdot');
      if (dot) { dot.textContent = unreadCount; dot.style.display = 'flex'; }
    }
    renderHistory();
    if (updates.type === 'agent' || updates.type === 'error') saveHistory();
  }

  function ensurePanel() {
    ensureStyles();
    if (document.getElementById('ca-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'ca-panel';
    panel.innerHTML = `
      <div class="ca-head">
        <div class="ca-brand"><span class="ca-bead"></span><span class="ca-title">crossagent.si</span></div>
        <div class="ca-btns">
          <button class="ca-btn" id="ca-share" title="Paste panel context into chat input">↗</button>
          <button class="ca-btn" id="ca-min" title="Minimize">—</button>
          <button class="ca-btn" id="ca-cls" title="Clear &amp; close">✕</button>
        </div>
      </div>
      <div class="ca-tabs">
        <button class="ca-tab active" id="ca-tab-chat">Chat</button>
        <button class="ca-tab" id="ca-tab-mem">Memory</button>
        <button class="ca-tab" id="ca-tab-roles">Roles</button>
      </div>
      <div class="ca-msgs" id="ca-msgs"></div>
      <div class="ca-mem-panel" id="ca-mem-panel" style="display:none">
        <div class="ca-mem-empty" id="ca-mem-empty">Loading memories…</div>
      </div>
      <div class="ca-roles-panel" id="ca-roles-panel" style="display:none"></div>
      <div class="ca-irow" id="ca-irow">
        <textarea class="ca-input" placeholder="Ask @claude, @gemini, @groq…" rows="1"></textarea>
        <button class="ca-send" title="Send">↑</button>
      </div>
      <div class="ca-foot">@claude · @gemini · @groq · @grok · @mistral · @all · Alt+Shift+C</div>
    `;
    document.body.appendChild(panel);

    document.getElementById('ca-min').addEventListener('click', hidePanel);
    document.getElementById('ca-cls').addEventListener('click', closePanel);

    // ── Tab switching ──────────────────────────────────────────────────────
    function switchTab(active) {
      ['ca-tab-chat','ca-tab-mem','ca-tab-roles'].forEach(id => document.getElementById(id)?.classList.remove('active'));
      document.getElementById('ca-msgs').style.display = active === 'chat' ? '' : 'none';
      document.getElementById('ca-mem-panel').style.display = active === 'mem' ? '' : 'none';
      document.getElementById('ca-roles-panel').style.display = active === 'roles' ? '' : 'none';
      document.getElementById('ca-irow').style.display = active === 'chat' ? '' : 'none';
      document.getElementById(`ca-tab-${active}`)?.classList.add('active');
    }
    document.getElementById('ca-tab-chat').addEventListener('click', () => switchTab('chat'));
    document.getElementById('ca-tab-mem').addEventListener('click', () => { switchTab('mem'); loadMemoryTab(); });
    document.getElementById('ca-tab-roles').addEventListener('click', () => { switchTab('roles'); loadRolesTab(); });

    // ↗ Share: paste panel context into the site's main chat input
    document.getElementById('ca-share').addEventListener('click', () => {
      if (!chatHistory.length) return;
      const lines = ['[Crossagent context:'];
      chatHistory.forEach(e => {
        if (e.type === 'user') lines.push('You → ' + (e.agent || '') + ': ' + e.text);
        else if (e.type === 'agent') lines.push((e.agent || 'Agent') + ': ' + e.text);
      });
      lines.push(']');
      const ctx = lines.join('\n\n');

      // Find site's main input (contenteditable first, then textarea)
      const mainInput = [...document.querySelectorAll('[contenteditable="true"]')]
        .find(el => !el.closest('#ca-panel') && !el.closest('[data-testid="conversation-turn"]'))
        || [...document.querySelectorAll('textarea')]
          .find(el => !el.closest('#ca-panel'));
      if (!mainInput) return;

      if (mainInput.isContentEditable) {
        mainInput.focus();
        const existing = mainInput.textContent.trim();
        mainInput.textContent = (existing ? existing + '\n\n' : '') + ctx;
        mainInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
        // Move cursor to end
        const range = document.createRange();
        range.selectNodeContents(mainInput);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        const existing = mainInput.value.trim();
        const newVal = (existing ? existing + '\n\n' : '') + ctx;
        if (setter) setter.call(mainInput, newVal); else mainInput.value = newVal;
        mainInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
        mainInput.focus();
        mainInput.setSelectionRange(newVal.length, newVal.length);
      }
    });

    // Draggable header
    const head = panel.querySelector('.ca-head');
    head.style.cursor = 'grab';
    let drag = false, ox = 0, oy = 0;
    head.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      drag = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      head.style.cursor = 'grabbing'; e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!drag) return;
      panel.style.left = (e.clientX - ox) + 'px'; panel.style.top = (e.clientY - oy) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { if (drag) { drag = false; head.style.cursor = 'grab'; } });

    // Panel input
    const inp = panel.querySelector('.ca-input');
    const snd = panel.querySelector('.ca-send');
    async function sendFromPanel() {
      const txt = inp.value.trim();
      if (!txt || snd.disabled) return;
      const src = SITE_LABEL;

      // @all — broadcast to claude + gemini + groq simultaneously, then synthesize
      if (txt.toLowerCase().startsWith('@all ') || txt.toLowerCase() === '@all') {
        const msg = txt.replace(/^@all\s*/i, '').trim() || 'Hello';
        inp.value = ''; inp.style.height = 'auto'; snd.disabled = true;
        try { await broadcastToAll(msg, src); } finally { snd.disabled = false; inp.focus(); }
        return;
      }

      const mention = AGENTS.find(a => txt.toLowerCase().includes(a));
      let target, msg;
      if (mention) {
        target = mention.slice(1);
        msg = txt.replace(new RegExp(mention, 'gi'), '').trim() || 'Hello';
      } else {
        const last = [...chatHistory].reverse().find(e => e.agent && e.type !== 'user')?.agent;
        if (!last) { inp.placeholder = 'Use @claude, @gemini, @groq, or @all'; setTimeout(() => { inp.placeholder = 'Ask @claude, @gemini, @groq…'; }, 2500); return; }
        target = last; msg = txt;
      }
      inp.value = ''; inp.style.height = 'auto'; snd.disabled = true;
      try { await sendToAgent(target, msg, src); } finally { snd.disabled = false; inp.focus(); }
    }
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); sendFromPanel(); } });
    snd.addEventListener('click', sendFromPanel);
    inp.addEventListener('input', () => { inp.style.height = 'auto'; inp.style.height = Math.min(inp.scrollHeight, 80) + 'px'; });

    // Badge
    if (!document.getElementById('ca-badge')) {
      const badge = document.createElement('button');
      badge.id = 'ca-badge';
      badge.innerHTML = 'CA<span class="ca-bdot"></span>';
      badge.addEventListener('click', showPanel);
      document.body.appendChild(badge);
    }
  }

  async function broadcastToAll(message, src) {
    // All 7 native agents (no groq-only — native routing handles each)
    const BROADCAST_TARGETS = ['claude', 'chatgpt', 'gemini', 'perplexity', 'grok', 'mistral', 'copilot'];
    await Promise.allSettled(
      BROADCAST_TARGETS.map(agent => sendToAgent(agent, message, src))
    );
    // Synthesize with native Claude (chainDepth=1 prevents re-chaining)
    const responses = chatHistory
      .filter(e => e.type === 'agent' && BROADCAST_TARGETS.includes((e.agent || '').toLowerCase()))
      .slice(-BROADCAST_TARGETS.length);
    if (responses.length >= 2) {
      const stripHtml = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const synthMsg = responses.map(r => `${r.agent}: ${stripHtml(r.text)}`).join('\n\n');
      await sendToAgent('claude', `Synthesize these responses into one concise answer:\n\n${synthMsg}`, src, 1, false);
      const last = chatHistory[chatHistory.length - 1];
      if (last?.type === 'agent') last.note = (last.note ? last.note + ' · ' : '') + 'synthesis';
      renderHistory();
    }
  }

  async function loadMemoryTab() {
    const container = document.getElementById('ca-mem-panel');
    const empty = document.getElementById('ca-mem-empty');
    if (!container) return;

    // Add search input once
    if (!document.getElementById('ca-mem-search')) {
      const search = document.createElement('input');
      search.id = 'ca-mem-search';
      search.className = 'ca-mem-search';
      search.placeholder = 'Filter memories…';
      container.insertBefore(search, container.firstChild);
      search.addEventListener('input', () => filterMemories(search.value));
    }

    empty.textContent = 'Loading memories…';
    empty.style.display = 'flex';
    container.querySelectorAll('.ca-mem-card, .ca-mem-group').forEach(el => el.remove());

    let stored = {};
    try { stored = await chrome.storage.sync.get(['userId', 'backendUrl']); } catch {}
    const { userId, backendUrl } = stored;
    if (!userId) { empty.textContent = 'No user ID — add one in the extension popup.'; return; }
    const base = (backendUrl || BACKEND).replace(/\/$/, '');

    try {
      const data = await fetch(`${base}/memory/list?userId=${userId}`).then(r => r.json());
      const mems = data.memories || [];
      if (!mems.length) { empty.textContent = 'No memories yet — start chatting with agents!'; return; }
      empty.style.display = 'none';

      // Group by type
      const TYPE_ORDER = ['preference', 'fact', 'episode'];
      const groups = {};
      mems.forEach(m => { const t = m.mem_type || 'fact'; (groups[t] = groups[t] || []).push(m); });

      TYPE_ORDER.forEach(type => {
        if (!groups[type]?.length) return;
        const groupEl = document.createElement('div');
        groupEl.className = 'ca-mem-group';
        groupEl.dataset.type = type;
        groupEl.textContent = `${type}s · ${groups[type].length}`;
        container.appendChild(groupEl);

        groups[type].forEach(m => {
          const card = document.createElement('div');
          card.className = 'ca-mem-card';
          card.dataset.content = (m.content || '').toLowerCase();
          card.dataset.type = type;
          const src = m.src_agent || '?';
          const tgt = m.tgt_agent || '?';
          const date = m.created_at ? new Date(m.created_at).toLocaleDateString() : '';
          const srcColor = AGENT_COLORS[src.toLowerCase()] || '#888';
          card.innerHTML = `
            <span class="ca-mem-type ${type}">${type}</span>
            <div style="flex:1">
              <div class="ca-mem-content">${esc(m.content)}</div>
              <div class="ca-mem-meta">
                <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${srcColor};margin-right:4px;vertical-align:middle"></span>
                ${esc(src)} → ${esc(tgt)} · ${date}
              </div>
            </div>
            <button class="ca-mem-del" data-id="${m.id}" title="Forget">×</button>
          `;
          card.querySelector('.ca-mem-del').addEventListener('click', async ev => {
            const id = ev.currentTarget.dataset.id;
            try { await fetch(`${base}/memory/delete/${id}?userId=${userId}`, { method: 'DELETE' }); } catch {}
            card.remove();
            // Remove group header if now empty
            const remaining = [...container.querySelectorAll(`.ca-mem-card[data-type="${type}"]`)]
              .filter(c => c.style.display !== 'none');
            if (!remaining.length) groupEl.remove();
            if (!container.querySelectorAll('.ca-mem-card').length) {
              empty.textContent = 'All memories cleared.'; empty.style.display = 'flex';
            }
          });
          container.appendChild(card);
        });
      });
    } catch {
      empty.textContent = 'Could not load memories.';
    }
  }

  function filterMemories(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('#ca-mem-panel .ca-mem-card').forEach(card => {
      card.style.display = !q || (card.dataset.content || '').includes(q) ? '' : 'none';
    });
    document.querySelectorAll('#ca-mem-panel .ca-mem-group').forEach(groupEl => {
      const type = groupEl.dataset.type;
      const anyVisible = [...document.querySelectorAll(`#ca-mem-panel .ca-mem-card[data-type="${type}"]`)]
        .some(c => c.style.display !== 'none');
      groupEl.style.display = anyVisible ? '' : 'none';
    });
  }

  function loadRolesTab() {
    const container = document.getElementById('ca-roles-panel');
    if (!container) return;
    container.innerHTML = ''; // clear and re-render every time so selected values stay current

    const ROLE_AGENTS = [
      { key: 'claude',     label: 'Claude',     color: '#da7756' },
      { key: 'chatgpt',   label: 'ChatGPT',    color: '#10a37f' },
      { key: 'gemini',    label: 'Gemini',     color: '#4285f4' },
      { key: 'perplexity',label: 'Perplexity', color: '#20808d' },
      { key: 'grok',      label: 'Grok',       color: '#1d9bf0' },
      { key: 'mistral',   label: 'Mistral',    color: '#ff7000' },
      { key: 'copilot',   label: 'Copilot',    color: '#0078d4' },
    ];
    const ROLES = ['Auto', 'Writer', 'Coder', 'Researcher', 'Analyst', 'Summarizer', 'Translator'];

    ROLE_AGENTS.forEach(({ key, label, color }) => {
      const row = document.createElement('div');
      row.className = 'ca-role-row';
      row.innerHTML = `
        <div class="ca-role-agent">
          <span class="ca-role-dot" style="background:${color}"></span>
          <span>${label}</span>
        </div>
        <select class="ca-role-sel" data-agent="${key}">
          ${ROLES.map(r => `<option value="${r === 'Auto' ? '' : r}"${(agentRoles[key] || '') === (r === 'Auto' ? '' : r) ? ' selected' : ''}>${r}</option>`).join('')}
        </select>
      `;
      row.querySelector('select').addEventListener('change', async ev => {
        agentRoles[key] = ev.target.value;
        await saveRoles();
      });
      container.appendChild(row);
    });

    const hint = document.createElement('div');
    hint.className = 'ca-roles-hint';
    hint.innerHTML = 'Roles are injected as context when routing to each agent.<br>Auto = no role set.';
    container.appendChild(hint);
  }

  function showPanel() {
    ensurePanel();
    document.getElementById('ca-panel').classList.remove('ca-hide');
    const badge = document.getElementById('ca-badge');
    if (badge) badge.style.display = 'none';
    unreadCount = 0;
    const dot = document.querySelector('#ca-badge .ca-bdot');
    if (dot) dot.style.display = 'none';
    renderHistory();
    scrollBottom(true);
  }

  function hidePanel() {
    document.getElementById('ca-panel')?.classList.add('ca-hide');
    const badge = document.getElementById('ca-badge');
    if (badge) badge.style.display = 'flex';
  }

  function closePanel() {
    document.getElementById('ca-panel')?.remove();
    const badge = document.getElementById('ca-badge');
    if (badge) badge.style.display = 'none';
    unreadCount = 0;
    clearHistory(); // X button = intentional clear, wipes storage too
  }

  // ─── Thread context ───────────────────────────────────────────────────────
  // Each entry: primary selector first, then fallbacks separated by commas (querySelectorAll syntax)
  const THREAD_SELS = {
    chatgpt:    { u: '[data-message-author-role="user"]',    a: '[data-message-author-role="assistant"]' },
    claude:     { u: '[data-testid="user-message"]',          a: '[data-testid="assistant-message"]' },
    gemini:     { u: 'user-query,model-response-text-content', a: 'model-response,ms-chat-turn' },
    perplexity: { u: '[class*="UserMessage"],[data-testid="user-message"]', a: '[class*="AnswerBody"],[class*="answer"],[data-testid="answer"]' },
    grok:       { u: '[data-testid="user-turn"],[class*="user-turn"],[class*="UserTurn"]', a: '[data-testid="bot-turn"],[class*="bot-turn"],[class*="BotTurn"]' },
    mistral:    { u: '[class*="UserMessage"],[class*="user-message"]', a: '[class*="BotMessage"],[class*="bot-message"],[class*="assistant"]' },
    copilot:    { u: '[data-content="user-message"],[class*="user-message"]', a: '[data-content="ai-message"],[class*="ai-message"],[class*="assistant-message"]' },
    ai:         { u: '[role="user"]',                         a: '[role="assistant"]' },
  };
  const U_SEL = THREAD_SELS[SITE]?.u || THREAD_SELS.ai.u;
  const A_SEL = THREAD_SELS[SITE]?.a || THREAD_SELS.ai.a;

  function cleanText(el) {
    const t = el.querySelector('.markdown,.prose,[class*="markdown"],[class*="prose"]') || el;
    const c = t.cloneNode(true);
    c.querySelectorAll('button,svg,[aria-hidden],.sr-only').forEach(n => n.remove());
    return (c.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // ─── Native send (same-site agent bypass) ────────────────────────────────
  async function sendNative(message) {
    const input = [...document.querySelectorAll('[contenteditable="true"]')]
      .find(el => !el.closest('#ca-panel') && !el.closest('[data-testid="conversation-turn"]') && !el.closest('[data-message-author-role]'));
    if (!input) throw new Error(`${SITE_LABEL} input not found`);

    const prevCount = document.querySelectorAll(A_SEL).length;

    input.focus();
    // Primary: execCommand path (most reliable across ProseMirror/Lexical/contenteditable)
    document.execCommand('selectAll', false);
    document.execCommand('insertText', false, message);
    // Fire synthetic events so React state updates
    input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: message, inputType: 'insertText' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(res => setTimeout(res, 250));

    // Fallback: textContent assignment if execCommand missed (some sandboxed frames block it)
    if (!input.textContent.trim()) {
      input.textContent = message;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, data: message, inputType: 'insertText' }));
      await new Promise(res => setTimeout(res, 250));
    }

    // Move cursor to end so send button activates
    const r = document.createRange();
    r.selectNodeContents(input);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);

    console.log('[Crossagent] injecting to', SITE_LABEL, '| text length:', input.textContent.length);

    const sendBtn =
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[aria-label="Send Message"]') ||
      document.querySelector('[data-testid="send-button"]') ||
      document.querySelector('button[type="submit"]:not(#ca-panel *)') ||
      [...document.querySelectorAll('button')].find(b => {
        if (b.closest('#ca-panel')) return false;
        const br = b.getBoundingClientRect(), ir = input.getBoundingClientRect();
        return Math.abs(br.bottom - ir.bottom) < 80 && br.right > window.innerWidth * 0.55;
      });
    if (!sendBtn) throw new Error('Send button not found');
    sendBtn.click();

    // Wait for a new assistant element to appear
    const newEl = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { obs.disconnect(); reject(new Error('Timed out waiting for response')); }, 40000);
      const obs = new MutationObserver(() => {
        const msgs = [...document.querySelectorAll(A_SEL)];
        if (msgs.length > prevCount) { clearTimeout(t); obs.disconnect(); resolve(msgs[msgs.length - 1]); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    });

    // Wait for non-empty text, then wait for it to stabilise (streaming done)
    await new Promise(resolve => {
      let last = '', stable = 0;
      const check = () => {
        const t = newEl.textContent.trim();
        if (!t) { setTimeout(check, 300); return; } // not started yet
        if (t === last) { if (++stable >= 5) return resolve(); } // stable ~1s
        else { stable = 0; last = t; }
        setTimeout(check, 200);
      };
      setTimeout(check, 600);
    });

    return cleanText(newEl);
  }

  function getThread() {
    const uEls = [...document.querySelectorAll(U_SEL)];
    const aEls = [...document.querySelectorAll(A_SEL)];
    const all = [...uEls.map(el => ({ el, role: 'user' })), ...aEls.map(el => ({ el, role: 'assistant' }))]
      .sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const msgs = all.map(({ el, role }) => ({ role, content: cleanText(el).slice(0, 3000) })).filter(m => m.content);
    chatHistory.forEach(e => { if (e.type === 'agent' && e.text && e.agent) msgs.push({ role: 'assistant', content: `${e.agent.toUpperCase()} said: ${e.text.slice(0, 2000)}` }); });
    return msgs;
  }

  // ─── Relay call ───────────────────────────────────────────────────────────
  async function sendToAgent(targetAgent, message, sourceAgent, chainDepth = 0, skipThread = false) {
    const NATIVE_AGENTS = ['chatgpt','claude','gemini','perplexity','grok','mistral','copilot'];
    const target = targetAgent.toLowerCase();

    // Fetch user credentials once, used by all routing paths (native + API)
    let _stored = {};
    try { _stored = await chrome.storage.sync.get(['userId', 'userEmail', 'backendUrl']); } catch {}
    const userId = _stored.userId || 'anonymous';
    const userEmail = _stored.userEmail || '';
    const base = (_stored.backendUrl || BACKEND).replace(/\/$/, '');

    // Fire-and-forget: store conversation in Engram memory engine
    function storeMemory(agentResponse) {
      if (userId === 'anonymous' || !agentResponse || agentResponse.startsWith('Error:')) return;
      fetch(`${base}/memory/store`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userEmail, sourceAgent, targetAgent, message, response: agentResponse }),
      }).catch(() => {});
    }

    // Fetch relevant Engram memories to inject into native calls
    async function fetchMemoryCtx() {
      if (userId === 'anonymous') return '';
      try {
        const data = await fetch(`${base}/memory/search?userId=${encodeURIComponent(userId)}&q=${encodeURIComponent(message)}`)
          .then(r => r.json());
        const mems = (data.memories || []).slice(0, 5);
        if (!mems.length) return '';
        return '[Crossagent memory — from past sessions:\n' +
          mems.map(m => `- ${m.content}`).join('\n') + ']';
      } catch { return ''; }
    }

    // Build cross-agent context to inject with every native call
    const buildCtx = async () => {
      const role = agentRoles[target];
      const rolePrefix = role ? `[Act as a ${role}. Bring that perspective to your answer.]\n\n` : '';
      const memCtx = await fetchMemoryCtx();
      const ctx = chatHistory
        .filter(e => e.type === 'agent' && e.text && e.agent)
        .slice(-6)
        .map(e => `${e.agent}: ${e.text.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().slice(0,600)}`)
        .join('\n\n');
      const sessionCtx = ctx ? `[Crossagent — other AIs said:\n${ctx}]` : '';
      const prefix = [memCtx, sessionCtx].filter(Boolean).join('\n\n');
      return prefix ? `${rolePrefix}${prefix}\n\n${message}` : `${rolePrefix}${message}`;
    };

    // Same-site native routing (always prefer native — even for synthesis calls)
    if (target === SITE) {
      addEntry({ id: 'u' + Date.now(), type: 'user', agent: targetAgent, text: message });
      const lid = 'l' + Date.now();
      addEntry({ id: lid, type: 'loading', agent: targetAgent });
      try {
        const response = await sendNative(await buildCtx());
        updateEntry(lid, { type: 'agent', text: response, note: `native ${SITE_LABEL}` });
        storeMemory(response);
      } catch (err) {
        updateEntry(lid, { type: 'error', text: `Native ${SITE_LABEL} failed: ${err.message}` });
      }
      return;
    }

    // Cross-tab native routing: target is a different AI site the user has open (or we open)
    if (NATIVE_AGENTS.includes(target) && target !== SITE) {
      addEntry({ id: 'u' + Date.now(), type: 'user', agent: targetAgent, text: message });
      const lid = 'l' + Date.now();
      addEntry({ id: lid, type: 'loading', agent: targetAgent });
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'RELAY_NATIVE', targetSite: target, message: await buildCtx()
        });
        if (result?.error) throw new Error(result.error);

        if (result?.noConversation) {
          // Tab is on home page with no saved conversation — use API relay to avoid opening a new chat
          const data = await fetch(`${base}/relay`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userEmail, sourceAgent, targetAgent, message, thread: [] }),
          }).then(r => r.json());
          if (data.nativeRequired) throw new Error(`Start a conversation in ${targetAgent} first, then try again.`);
          if (data.error) throw new Error(data.error);
          const res = data.response || 'No response';
          updateEntry(lid, { type: 'agent', text: res, note: `api ${targetAgent}` });
          storeMemory(res);
          return;
        }

        updateEntry(lid, { type: 'agent', text: result.response, note: `native ${targetAgent}` });
        storeMemory(result.response);
      } catch (err) {
        updateEntry(lid, { type: 'error', text: `Could not reach ${targetAgent}: ${err.message}` });
      }
      return;
    }

    const thread = skipThread ? [] : getThread();
    addEntry({ id: 'u' + Date.now(), type: 'user', agent: targetAgent, text: message });
    const lid = 'l' + Date.now();
    addEntry({ id: lid, type: 'loading', agent: targetAgent });

    if (userId !== 'anonymous') {
      try {
        const u = await fetch(`${base}/memory/usage?userId=${userId}`).then(r => r.json());
        if (!u.allowed) { updateEntry(lid, { type: 'error', text: `Limit of ${u.limit} interactions reached this month.` }); return; }
      } catch {}
    }

    try { chrome.runtime.getURL(''); } catch { updateEntry(lid, { type: 'error', text: 'Extension was reloaded — refresh this page.' }); return; }

    let res, mem = 0;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const data = await fetch(`${base}/relay`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ userId, userEmail, sourceAgent, targetAgent, message, thread }),
      }).then(r => r.json());
      clearTimeout(timer);
      if (data.nativeRequired) {
        res = `Error: @${targetAgent} requires native routing — open ${targetAgent}.com in a tab first.`;
      } else {
        res = data.error ? `Error: ${data.error}` : data.response || 'No response received';
      }
      if (data.memoriesUsed) mem = data.memoriesUsed;
    } catch (err) {
      clearTimeout(timer);
      res = err.name === 'AbortError' ? 'Error: Backend took too long — try again.' : `Error: ${err.message}`;
    }

    let note = thread.length ? `read ${thread.length} ${SITE} msg${thread.length > 1 ? 's' : ''}` : '';
    if (mem) note = note ? `${note} · ${mem} mem${mem > 1 ? 'ories' : 'ory'}` : `${mem} mem${mem > 1 ? 'ories' : 'ory'}`;
    updateEntry(lid, { type: res.startsWith('Error:') ? 'error' : 'agent', text: res, note });

    // Auto-chain: if the response addresses another agent, forward just that part
    if (!res.startsWith('Error:') && chainDepth < 1) {
      const lower = res.toLowerCase();
      const ALL_AGENTS = ['claude', 'chatgpt', 'gemini', 'groq', 'grok', 'mistral', 'perplexity', 'copilot'];
      const addressed = ALL_AGENTS.find(name =>
        name !== targetAgent.toLowerCase() && (
          new RegExp(`^@${name}[:\\s]`, 'i').test(res) ||
          lower.startsWith('hey ' + name) ||
          lower.startsWith('hello ' + name) ||
          lower.startsWith('hi ' + name)
        )
      );
      if (addressed) {
        // Extract just the routed message (strip "@claude: " prefix if present)
        const prefixMatch = res.match(new RegExp(`^@${addressed}[:\\s]+`, 'i'));
        const relayMsg = prefixMatch ? res.slice(prefixMatch[0].length).trim() : res;
        await sendToAgent(addressed, relayMsg, targetAgent, chainDepth + 1, true);
      }
    }
  }

  // ─── Clear chat input ─────────────────────────────────────────────────────
  function clearInput(el) {
    el.focus();
    if (el.isContentEditable) {
      const r = document.createRange(); r.selectNodeContents(el);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('delete', false);
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(el, ''); else el.value = '';
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }

  // ─── Handle @mention from main chat ──────────────────────────────────────
  async function handleMention(el, text) {
    if (mentionPending) return;
    const mention = AGENTS.find(a => text.toLowerCase().includes(a));
    if (!mention) return;
    mentionPending = true;
    const targetAgent = mention.slice(1);
    const sourceAgent = SITE_LABEL;
    const message = text.replace(new RegExp(mention, 'gi'), '').trim() || 'Hello';
    clearInput(el);
    showPanel();
    try { await sendToAgent(targetAgent, message, sourceAgent); } finally { mentionPending = false; }
  }

  // ─── Keyboard: ESC + Alt+Shift+C ─────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const p = document.getElementById('ca-panel');
      if (p && !p.classList.contains('ca-hide')) { e.stopPropagation(); hidePanel(); }
      return;
    }
    if (e.altKey && e.shiftKey && e.key === 'C') {
      e.preventDefault(); e.stopPropagation();
      const p = document.getElementById('ca-panel');
      if (!p || p.classList.contains('ca-hide')) showPanel(); else hidePanel();
    }
  }, true);

  // ─── Main Enter interceptor — window capture fires before React ───────────
  window.addEventListener('keydown', e => {
    // If the extension was reloaded while this tab was open, chrome.runtime is dead.
    // Stop intercepting and let the page handle keystrokes normally.
    try { chrome.runtime.getURL(''); } catch { return; }

    if (e.key !== 'Enter' || e.shiftKey) return;
    const el = e.target;
    if (!el) return;
    if (el.classList && el.classList.contains('ca-input')) return; // our own textarea
    if (!el.isContentEditable && el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT') return;

    // Strip zero-width chars Lexical/ProseMirror may inject
    const text = (el.textContent || el.value || '').replace(/[​‌‍﻿]/g, '').trim();

    console.log('[Crossagent] Enter ↵ on', el.tagName, '| editable:', el.isContentEditable, '| text:', JSON.stringify(text.slice(0, 60)));

    // Natural language relay: "tell chatgpt to...", "ask gemini to...", "have claude say..."
    const RELAY_RE = /\b(?:can\s+you\s+)?(?:tell|ask|have|get)\s+(chatgpt|claude|gemini|groq|grok|mistral|perplexity|copilot)\s+(?:to\s+)?(.+)/i;
    const relayMatch = text.match(RELAY_RE);
    if (relayMatch && relayMatch[1].toLowerCase() !== SITE) {
      const targetAgent = relayMatch[1].toLowerCase();
      const relayMsg = relayMatch[2].replace(/[!?.]+$/, '').trim();
      console.log('[Crossagent] relay intent →', targetAgent, '|', relayMsg);
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      clearInput(el);
      showPanel();
      sendToAgent(targetAgent, relayMsg, SITE_LABEL);
      return;
    }

    if (AGENTS.some(a => text.toLowerCase().includes(a))) {
      console.log('[Crossagent] @mention found — intercepting');
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
      handleMention(el, text);
    }
  }, true);

  // ─── SPA navigation — keep history, just collapse the panel ─────────────
  function onNav() {
    document.getElementById('ca-panel')?.remove();
    const b = document.getElementById('ca-badge');
    if (b) { b.style.display = 'none'; const d = b.querySelector('.ca-bdot'); if (d) d.style.display = 'none'; }
  }
  const origPush = history.pushState.bind(history);
  history.pushState = (...a) => { origPush(...a); onNav(); };
  window.addEventListener('popstate', onNav);

  // ─── PING handler ─────────────────────────────────────────────────────────
  try {
    chrome.runtime.onMessage.addListener((msg, _, reply) => {
      if (msg.type === 'PING') { reply({ ready: true, site: SITE }); return; }
      if (msg.type === 'INJECT_NATIVE') {
        sendNative(msg.message)
          .then(response => reply({ response, conversationUrl: window.location.href }))
          .catch(err => reply({ error: err.message }));
        return true; // async
      }
    });
  } catch {
    // Extension context invalidated (reloaded while tab was open) — this instance is stale
  }

  // ─── First-run onboarding ─────────────────────────────────────────────────
  async function checkOnboarding() {
    try {
      const stored = await chrome.storage.local.get(['ca_onboarded']);
      if (!stored.ca_onboarded) showOnboarding();
    } catch {}
  }

  function showOnboarding() {
    ensureStyles();
    const overlay = document.createElement('div');
    overlay.id = 'ca-onboard';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:#18181b;border-radius:18px;padding:32px 28px;max-width:360px;width:90%;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 32px 80px rgba(0,0,0,.8);">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
          <div style="width:12px;height:12px;border-radius:50%;background:linear-gradient(135deg,#da7756,#4285f4);flex-shrink:0;"></div>
          <span style="font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.6);">crossagent.si</span>
        </div>
        <h2 style="font-size:20px;font-weight:700;margin-bottom:8px;line-height:1.3;">Tag any AI from inside any AI's chat.</h2>
        <p style="font-size:13px;color:rgba(255,255,255,.55);line-height:1.7;margin-bottom:20px;">Type <strong style="color:#f4f4f5">@claude</strong>, <strong style="color:#f4f4f5">@gemini</strong>, or any agent into the chat box and press Enter — Crossagent intercepts and routes it natively.<br><br>Or press <kbd style="background:rgba(255,255,255,.1);border-radius:4px;padding:2px 6px;font-size:11px;">Alt+Shift+C</kbd> to open the panel any time.</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
          ${[
            ['@claude', '#da7756', 'Routes to Claude natively — no API key'],
            ['@all', '#4285f4', 'Broadcasts to all 7 agents simultaneously'],
            ['@gemini', '#4285f4', 'Uses your logged-in Gemini account'],
          ].map(([cmd, color, desc]) => `<div style="background:rgba(255,255,255,.05);border-radius:9px;padding:10px 12px;display:flex;align-items:center;gap:10px;"><span style="font-family:monospace;font-size:12px;color:${color};font-weight:700;min-width:64px;">${cmd}</span><span style="font-size:12px;color:rgba(255,255,255,.45);">${desc}</span></div>`).join('')}
        </div>
        <button id="ca-onboard-ok" style="width:100%;background:#fff;color:#09090b;border:none;border-radius:10px;padding:11px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;">Got it — let's go</button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('ca-onboard-ok').addEventListener('click', () => {
      overlay.remove();
      chrome.storage.local.set({ ca_onboarded: true });
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.remove(); chrome.storage.local.set({ ca_onboarded: true }); } });
  }

  // Restore history and roles from previous session
  loadHistory();
  loadRoles();
  checkOnboarding();

})();
