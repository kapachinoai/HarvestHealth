// HarvestHealth — chat client
(() => {
  'use strict';

  const STORAGE_KEY = 'harvesthealth.chat.v1';
  const MAX_PHOTOS = 3;
  const MAX_DIMENSION = 1280; // resize photos before upload (saves data on slow networks)
  const JPEG_QUALITY = 0.8;

  const chatEl = document.getElementById('chat');
  const welcomeEl = document.getElementById('welcome');
  const form = document.getElementById('composer');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const photoBtn = document.getElementById('photoBtn');
  const photoInput = document.getElementById('photoInput');
  const previewsEl = document.getElementById('previews');
  const newChatBtn = document.getElementById('newChat');

  // Conversation sent to the server: [{ role, content }]
  let history = [];
  // Photos waiting to be sent: [{ dataUrl, mediaType, base64 }]
  let pendingPhotos = [];
  let busy = false;

  // -------------------------------------------------------------------------
  // Storage (photos are not saved, to keep storage small)
  // -------------------------------------------------------------------------
  function save() {
    try {
      const slim = history.map((m) => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map((b) =>
              b.type === 'image' ? { type: 'text', text: '[A photo was shared earlier.]' } : b
            )
          : m.content,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch { /* storage full or blocked — ignore */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Tiny, safe markdown renderer (headings, bold, italics, lists, paragraphs)
  // -------------------------------------------------------------------------
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function inline(s) {
    return escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>');
  }

  function renderMarkdown(text) {
    const lines = text.replace(/\r/g, '').split('\n');
    let html = '';
    let list = null; // 'ul' | 'ol'
    let para = [];

    const flushPara = () => {
      if (para.length) { html += `<p>${para.map(inline).join('<br>')}</p>`; para = []; }
    };
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };

    for (const line of lines) {
      const t = line.trim();
      let m;
      if (!t) { flushPara(); closeList(); continue; }
      if ((m = t.match(/^#{1,6}\s+(.*)$/))) {
        flushPara(); closeList();
        html += `<h3>${inline(m[1])}</h3>`;
      } else if ((m = t.match(/^[-*•]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
        html += `<li>${inline(m[1])}</li>`;
      } else if (/^(-{3,}|\*{3,})$/.test(t)) {
        flushPara(); closeList();
      } else {
        closeList();
        para.push(t);
      }
    }
    flushPara(); closeList();
    return html;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  function hideWelcome() { welcomeEl.hidden = true; }

  function scrollToBottom() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function textOf(content) {
    if (typeof content === 'string') return content;
    return content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  }

  function addUserMessage(text, photoUrls = []) {
    hideWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg user';
    if (photoUrls.length) {
      const ph = document.createElement('div');
      ph.className = 'msg-photos';
      for (const url of photoUrls) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Your photo';
        ph.appendChild(img);
      }
      wrap.appendChild(ph);
    }
    if (text) {
      const b = document.createElement('div');
      b.className = 'bubble';
      b.textContent = text;
      wrap.appendChild(b);
    }
    chatEl.appendChild(wrap);
    scrollToBottom();
  }

  function addBotMessage(text, { truncated = false } = {}) {
    hideWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    const b = document.createElement('div');
    b.className = 'bubble';
    b.innerHTML = renderMarkdown(text);
    wrap.appendChild(b);
    if (truncated) {
      const n = document.createElement('div');
      n.className = 'note';
      n.textContent = 'The answer was cut short. Ask "please continue" to see the rest.';
      wrap.appendChild(n);
    }
    chatEl.appendChild(wrap);
    scrollToBottom();
  }

  function addTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot';
    wrap.innerHTML = '<div class="bubble"><span class="typing" aria-label="HarvestHealth is typing"><span></span><span></span><span></span></span></div>';
    chatEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function addError(message, onRetry) {
    const wrap = document.createElement('div');
    wrap.className = 'msg bot error';
    const b = document.createElement('div');
    b.className = 'bubble';
    b.textContent = message;
    wrap.appendChild(b);
    if (onRetry) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'retry-btn';
      btn.textContent = 'Try again';
      btn.addEventListener('click', () => { wrap.remove(); onRetry(); });
      wrap.appendChild(btn);
    }
    chatEl.appendChild(wrap);
    scrollToBottom();
  }

  function renderHistory() {
    for (const m of history) {
      if (m.role === 'user') addUserMessage(textOf(m.content));
      else addBotMessage(textOf(m.content));
    }
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
        resolve({ dataUrl, mediaType: 'image/jpeg', base64: dataUrl.split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }

  function renderPreviews() {
    previewsEl.innerHTML = '';
    previewsEl.hidden = pendingPhotos.length === 0;
    pendingPhotos.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'preview';
      const img = document.createElement('img');
      img.src = p.dataUrl;
      img.alt = 'Photo to send';
      const x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', 'Remove photo');
      x.textContent = '×';
      x.addEventListener('click', () => { pendingPhotos.splice(i, 1); renderPreviews(); });
      d.append(img, x);
      previewsEl.appendChild(d);
    });
  }

  photoBtn.addEventListener('click', () => photoInput.click());

  photoInput.addEventListener('change', async () => {
    const files = Array.from(photoInput.files || []);
    photoInput.value = '';
    for (const file of files) {
      if (pendingPhotos.length >= MAX_PHOTOS) {
        addError(`You can send up to ${MAX_PHOTOS} photos at a time.`);
        break;
      }
      if (!file.type.startsWith('image/')) continue;
      try {
        pendingPhotos.push(await resizeImage(file));
      } catch {
        addError('That photo could not be opened. Please try another one.');
      }
    }
    renderPreviews();
  });

  // -------------------------------------------------------------------------
  // Sending
  // -------------------------------------------------------------------------
  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    photoBtn.disabled = v;
  }

  async function requestReply() {
    setBusy(true);
    const typing = addTyping();
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json().catch(() => ({}));
      typing.remove();

      if (!res.ok || !data.reply) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      history.push({ role: 'assistant', content: data.reply });
      save();
      addBotMessage(data.reply, { truncated: data.truncated });
    } catch (err) {
      typing.remove();
      const offline = !navigator.onLine || err instanceof TypeError;
      addError(
        offline ? 'No internet connection. Please check your network and try again.' : err.message,
        () => requestReply()
      );
    } finally {
      setBusy(false);
    }
  }

  function send(text) {
    if (busy) return;
    text = (text || '').trim();
    if (!text && pendingPhotos.length === 0) return;

    // If the last message was a failed user turn, replace it rather than stacking two user turns.
    if (history.length && history[history.length - 1].role === 'user') {
      history.pop();
      chatEl.querySelectorAll('.msg.error').forEach((el) => el.remove());
    }

    let content;
    if (pendingPhotos.length) {
      content = pendingPhotos.map((p) => ({
        type: 'image',
        source: { type: 'base64', media_type: p.mediaType, data: p.base64 },
      }));
      if (text) content.push({ type: 'text', text });
    } else {
      content = text;
    }

    addUserMessage(text, pendingPhotos.map((p) => p.dataUrl));
    history.push({ role: 'user', content });
    save();

    pendingPhotos = [];
    renderPreviews();
    input.value = '';
    autoGrow();
    requestReply();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    send(input.value);
  });

  // Enter sends on desktop; on phones Enter makes a new line.
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTouch && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 140) + 'px';
  }
  input.addEventListener('input', autoGrow);

  document.getElementById('suggestions').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) send(chip.textContent);
  });

  newChatBtn.addEventListener('click', () => {
    if (busy) return;
    if (history.length && !confirm('Start a new chat? This conversation will be cleared.')) return;
    history = [];
    pendingPhotos = [];
    renderPreviews();
    save();
    chatEl.querySelectorAll('.msg').forEach((el) => el.remove());
    welcomeEl.hidden = false;
    input.focus();
  });

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------
  history = load();
  // Drop a dangling user message left by a failed request
  if (history.length && history[history.length - 1].role === 'user') history.pop();
  renderHistory();
})();
