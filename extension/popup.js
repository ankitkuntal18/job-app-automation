// popup.js — Complete file
// All API calls now point to YOUR local backend at localhost:5000
// instead of the external autoapply.ranyor.com

document.addEventListener('DOMContentLoaded', function () {

  // ── DOM References ────────────────────────────────────────────────
  const collectBtn      = document.getElementById('collectBtn');
  const stopBtn         = document.getElementById('stopBtn');
  const downloadBtn     = document.getElementById('downloadBtn');
  const viewBtn         = document.getElementById('viewBtn');
  const clearBtn        = document.getElementById('clearBtn');
  const sendBtn         = document.getElementById('sendBtn');
  const senderEmail     = document.getElementById('senderEmail');
  const sendStatusEl    = document.getElementById('sendStatus');
  const statusEl        = document.getElementById('status');
  const progressBar     = document.getElementById('progressBar');
  const keywordInput    = document.getElementById('keywordInput');
  const addKeywordBtn   = document.getElementById('addKeywordBtn');
  const keywordTags     = document.getElementById('keywordTags');
  const noKeywordsMsg   = document.getElementById('noKeywordsMsg');
  const statHiring      = document.getElementById('statHiring');
  const statSkipped     = document.getElementById('statSkipped');
  const statScrolls     = document.getElementById('statScrolls');
  const statKeywords    = document.getElementById('statKeywords');
  const roleInput       = document.getElementById('roleInput');
  const locationInput   = document.getElementById('locationInput');
  const experienceInput = document.getElementById('experienceInput');
  const sendBtnIcon     = document.getElementById('sendBtnIcon');
  const sendEmailsBtn   = document.getElementById('sendEmailsBtn');

  // ── State ─────────────────────────────────────────────────────────
  let lastCollectedData = null;
  let customKeywords    = [];
  let targetCount       = 10;

  // ── YOUR LOCAL BACKEND URL ────────────────────────────────────────
  // This is the only URL you need — points to your Express server
  const BACKEND_URL = 'http://localhost:5000';

  // ── Init ──────────────────────────────────────────────────────────
  loadCustomKeywords();
  checkStoredData();

  // ── Event Listeners ───────────────────────────────────────────────
  collectBtn.addEventListener('click', collectPosts);
  stopBtn.addEventListener('click', stopCollection);
  downloadBtn.addEventListener('click', downloadJSON);
  viewBtn.addEventListener('click', viewPosts);
  clearBtn.addEventListener('click', clearData);
  sendBtn.addEventListener('click', sendToProcess);
  addKeywordBtn.addEventListener('click', addKeyword);
  keywordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addKeyword();
  });

  // ── Target Count Controls ─────────────────────────────────────────
  const targetInput = document.getElementById('targetCountInput');
  const decBtn      = document.getElementById('decCount');
  const incBtn      = document.getElementById('incCount');

  function updateTargetCount(val) {
    let n = parseInt(val);
    if (isNaN(n) || n < 1) n = 1;
    targetCount       = n;
    targetInput.value = n;
  }

  decBtn.addEventListener('click', () => updateTargetCount(targetCount - 1));
  incBtn.addEventListener('click', () => updateTargetCount(targetCount + 1));
  targetInput.addEventListener('change', (e) => updateTargetCount(e.target.value));
  targetInput.addEventListener('input',  (e) => {
    const n = parseInt(e.target.value);
    if (!isNaN(n)) targetCount = n;
  });

  // Quick-select buttons (10 / 20 / 30 / 40 / 50)
  document.querySelectorAll('.qs-btn').forEach(btn => {
    btn.addEventListener('click', () => updateTargetCount(btn.dataset.val));
  });

  // ── Restore saved inputs from Chrome storage ──────────────────────
  chrome.storage.local.get(
    ['savedEmail', 'savedRole', 'savedLocation', 'savedExperience'],
    (res) => {
      if (res.savedEmail)      senderEmail.value     = res.savedEmail;
      if (res.savedRole)       roleInput.value       = res.savedRole;
      if (res.savedLocation)   locationInput.value   = res.savedLocation;
      if (res.savedExperience) experienceInput.value = res.savedExperience;
    }
  );

  // Persist inputs as user types
  senderEmail.addEventListener('input', () =>
    chrome.storage.local.set({ savedEmail: senderEmail.value.trim() }));
  roleInput.addEventListener('input', () =>
    chrome.storage.local.set({ savedRole: roleInput.value.trim() }));
  locationInput.addEventListener('input', () =>
    chrome.storage.local.set({ savedLocation: locationInput.value.trim() }));
  experienceInput.addEventListener('input', () =>
    chrome.storage.local.set({ savedExperience: experienceInput.value.trim() }));

  // ── Listen for scroll progress messages from content.js ───────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action !== 'scrollProgress') return;
    const { collected, target, scrollRound, status } = msg;
    statScrolls.textContent = scrollRound;
    updateStats(collected, '…');
    if (status === 'scrolling') {
      showStatus(
        `<div class="spinner" style="display:inline-block;margin-right:6px"></div>
         Scroll #${scrollRound} — ${collected}/${target} posts found...`,
        'info'
      );
    } else if (status === 'extracting') {
      showStatus(
        `<div class="spinner" style="display:inline-block;margin-right:6px"></div>
         Extracting after scroll #${scrollRound} — ${collected}/${target} posts...`,
        'info'
      );
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  COLLECT POSTS
  //  Injects content.js into the LinkedIn tab, triggers auto-scroll
  //  and collection of hiring posts with recruiter emails.
  // ═══════════════════════════════════════════════════════════════════
  async function collectPosts() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab.url || !tab.url.includes('linkedin.com')) {
        showStatus('❌ Please navigate to <strong>LinkedIn.com</strong> first!', 'error');
        return;
      }

      collectBtn.disabled  = true;
      collectBtn.innerHTML = '<div class="spinner"></div> Collecting...';
      stopBtn.style.display = 'flex';
      showProgress(true);
      showStatus(`🔄 Starting auto-scroll to collect ${targetCount} hiring posts...`, 'info');
      updateStats('0', '…', '0');

      // Inject content.js into the LinkedIn tab
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files:  ['content.js']
        });
        console.log('✅ Content script injected');
      } catch (injectErr) {
        console.error('Injection error:', injectErr);
        showStatus('❌ Failed to inject collector. Try refreshing the LinkedIn page.', 'error');
        resetCollectBtn();
        return;
      }

      showStatus('🔄 Waiting for page to render posts...', 'info');
      await sleep(2000);

      // Ping content script to confirm it's alive
      try {
        await sendMessageWithTimeout(tab.id, { action: 'ping' }, 3000);
      } catch (_) {
        showStatus('⚠️ Content script not responding. Retrying...', 'warning');
        await sleep(1500);
      }

      showStatus('🔍 Scanning posts for hiring keywords + emails...', 'info');

      // Try up to 3 times to collect posts
      let response;
      let lastError;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await sendMessageWithTimeout(tab.id, {
            action:         'collectPosts',
            customKeywords,
            targetCount
          }, 120000); // 2 minute timeout (auto-scroll takes time)

          if (response && response.success) break;
          lastError = response?.message || 'Unknown error';
        } catch (err) {
          lastError = err.message;
          console.warn(`Attempt ${attempt} failed:`, err.message);
          if (attempt < 3) await sleep(1500);
        }
      }

      showProgress(false);

      // ── Handle collection failure ────────────────────────────────
      if (!response || !response.success) {
        const msg = lastError || 'No response from page';

        if (msg.includes('No post containers')) {
          showStatus(
            `⚠️ <strong>No post containers found.</strong><br>
            Try:<br>
            1. Scroll down manually to load posts first<br>
            2. Refresh the LinkedIn page<br>
            3. Make sure you're on the feed or search results page`,
            'warning'
          );
        } else if (msg.includes('No hiring posts')) {
          const skipped = response?.skipped || 0;
          showStatus(
            `ℹ️ <strong>No hiring posts with emails found</strong> (${skipped} posts scanned).<br>
            <small>Recruiters must include their email in the post text for this to work.</small><br>
            Try adding more custom keywords above.`,
            'info'
          );
          updateStats(0, skipped);
        } else {
          showStatus(`❌ ${msg}`, 'error');
        }
        resetCollectBtn();
        return;
      }

      // ── Collection success ────────────────────────────────────────
      lastCollectedData = response.data;
      enableDataButtons();
      updateStats(
        response.data.totalPosts,
        response.data.skippedPosts  || 0,
        response.data.scrollRounds  || '—'
      );
      showStatus(
        `✅ Collected <strong>${response.data.totalPosts}</strong> hiring posts in 
         <strong>${response.data.scrollRounds || 1}</strong> scroll rounds!
         <br><small style="opacity:0.7">${response.data.skippedPosts || 0} posts skipped (no email found)</small>`,
        'success'
      );

    } catch (error) {
      showProgress(false);
      console.error('Collection error:', error);
      showStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
      resetCollectBtn();
    }
  }

  function resetCollectBtn() {
    collectBtn.disabled  = false;
    collectBtn.innerHTML = '🚀 Collect Hiring Posts';
    stopBtn.style.display = 'none';
    showProgress(false);
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STOP COLLECTION
  // ═══════════════════════════════════════════════════════════════════
  async function stopCollection() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'stopCollect' });
    } catch (_) { }
    resetCollectBtn();
    showStatus('⏹ Collection stopped.', 'warning');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DOWNLOAD JSON
  //  Saves the collected posts as a .json file to your Downloads folder
  // ═══════════════════════════════════════════════════════════════════
  function downloadJSON() {
    if (!lastCollectedData) {
      showStatus('❌ No data to download', 'error');
      return;
    }
    try {
      const blob = new Blob(
        [JSON.stringify(lastCollectedData, null, 2)],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `linkedin-hiring-posts-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showStatus('✅ JSON file downloaded!', 'success');
    } catch (e) {
      showStatus('❌ Download failed: ' + e.message, 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  VIEW POSTS
  //  Opens a new tab showing all collected posts in a readable layout
  // ═══════════════════════════════════════════════════════════════════
  function viewPosts() {
    if (!lastCollectedData) {
      showStatus('❌ No data to view', 'error');
      return;
    }

    const posts     = lastCollectedData.posts || [];
    const postsHTML = posts.map((post, i) => `
      <div class="post-card">
        <div class="post-num">#${i + 1}</div>
        <div class="post-author">👤 ${esc(post.author || 'Unknown')}
          ${post.authorTitle
            ? `<span class="post-author-title">· ${esc(post.authorTitle)}</span>`
            : ''}
        </div>
        ${post.postedAt ? `<div class="post-meta">🕐 ${esc(post.postedAt)}</div>` : ''}

        ${post.email
          ? `<div class="post-email">📧 <strong>${esc(post.email)}</strong></div>`
          : '<div class="post-email no-email">❌ No email found</div>'}

        <div class="post-desc">${esc(post.description || '')}</div>

        <div class="post-stats">
          <span>❤️ ${post.likes  || 0}</span>
          <span>💬 ${post.comments || 0}</span>
          <span>🔄 ${post.shares  || 0}</span>
        </div>

        ${post.matchedKeywords && post.matchedKeywords.length
          ? `<div class="post-keywords">
               🔑 ${post.matchedKeywords.slice(0, 5)
                 .map(k => `<span class="kw-badge">${esc(k)}</span>`).join('')}
             </div>`
          : ''}

        ${post.postUrl
          ? `<a class="post-link" href="${esc(post.postUrl)}" target="_blank">
               🔗 View Original Post
             </a>`
          : ''}
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>LinkedIn Hiring Posts — ${lastCollectedData.totalPosts} results</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', sans-serif; background: #0a0f1e; color: #e8eaf0; padding: 24px; }
    .header { background: linear-gradient(135deg, #0077B5, #004182); border-radius: 14px; padding: 24px; margin-bottom: 24px; }
    .header h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: white; }
    .header .meta { font-size: 13px; color: rgba(255,255,255,0.7); display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px; }
    .controls { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
    .btn { padding: 10px 18px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all 0.2s; }
    .btn-green { background: #00897b; color: white; }
    .btn-green:hover { background: #00695c; }
    .search-box { flex: 1; min-width: 200px; background: #131929; border: 1px solid #1e2d45; border-radius: 8px; padding: 10px 14px; color: #e8eaf0; font-size: 13px; outline: none; }
    .search-box:focus { border-color: #0077B5; }
    .search-box::placeholder { color: #3a4a6b; }
    .posts-grid { display: flex; flex-direction: column; gap: 14px; }
    .post-card { background: #131929; border: 1px solid #1e2d45; border-radius: 12px; padding: 18px; transition: border-color 0.2s; }
    .post-card:hover { border-color: #0077B5; }
    .post-num { font-size: 11px; color: #3a4a6b; margin-bottom: 6px; font-weight: 600; }
    .post-author { font-size: 15px; font-weight: 600; color: #4fc3f7; margin-bottom: 4px; }
    .post-author-title { font-size: 12px; color: #6b7a99; font-weight: 400; }
    .post-meta { font-size: 11px; color: #6b7a99; margin-bottom: 8px; }
    .post-email { font-size: 13px; margin-bottom: 8px; color: #86efac; background: #052e16; border: 1px solid #166534; border-radius: 6px; padding: 6px 10px; display: inline-block; }
    .post-email.no-email { color: #fca5a5; background: #2d0a0a; border-color: #7f1d1d; }
    .post-desc { font-size: 13px; line-height: 1.6; color: #c8d0e0; margin: 10px 0; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow-y: auto; }
    .post-stats { display: flex; gap: 14px; font-size: 12px; color: #6b7a99; margin-bottom: 8px; }
    .post-keywords { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .kw-badge { background: #0d2137; border: 1px solid #0077B5; color: #4fc3f7; font-size: 10px; padding: 2px 7px; border-radius: 20px; }
    .post-link { font-size: 12px; color: #0077B5; text-decoration: none; display: inline-block; margin-top: 4px; }
    .post-link:hover { text-decoration: underline; }
    .no-results { text-align: center; padding: 60px 20px; color: #3a4a6b; font-size: 15px; }
    .count-badge { background: #0d2137; border: 1px solid #0077B5; color: #4fc3f7; font-size: 12px; padding: 4px 10px; border-radius: 20px; display: inline-block; margin-left: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>💼 LinkedIn Hiring Posts <span class="count-badge">${lastCollectedData.totalPosts} posts</span></h1>
    <div class="meta">
      <span>📅 ${new Date(lastCollectedData.collectedAt).toLocaleString()}</span>
      <span>🔍 ${lastCollectedData.pageType === 'search' ? 'Search Results' : 'Feed'}</span>
      <span>⏭ ${lastCollectedData.skippedPosts || 0} non-hiring skipped</span>
    </div>
  </div>
  <div class="controls">
    <input type="text" class="search-box" id="searchBox" placeholder="🔍 Filter posts by keyword or email..." oninput="filterPosts()">
    <button class="btn btn-green" onclick="downloadJSON()">💾 Download JSON</button>
  </div>
  <div class="posts-grid" id="postsGrid">
    ${postsHTML || '<div class="no-results">No posts to display</div>'}
  </div>
  <script>
    const allData  = ${JSON.stringify(lastCollectedData)};
    const allCards = Array.from(document.querySelectorAll('.post-card'));

    function filterPosts() {
      const q = document.getElementById('searchBox').value.toLowerCase();
      allCards.forEach(card => {
        card.style.display = card.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    }

    function downloadJSON() {
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'linkedin-hiring-posts-${new Date().toISOString().split('T')[0]}.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  <\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      showStatus('✅ Posts opened in new tab', 'success');
    } else {
      showStatus('❌ Popup blocked. Please allow popups for this extension.', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PROCESS JOBS  →  POST to YOUR backend /api/process-jobs
  //
  //  Sends the collected posts to your local Express backend.
  //  Backend uses OpenAI to generate a personalized email for each post
  //  and saves them all as "pending" jobs in jobs.json.
  // ═══════════════════════════════════════════════════════════════════
  async function sendToProcess() {
    const email = getEmail();
    if (!email) return;

    if (!lastCollectedData || !lastCollectedData.posts || lastCollectedData.posts.length === 0) {
      showSendStatus('❌ No collected posts. Click "Collect Hiring Posts" first.', 'error');
      return;
    }

    const role       = roleInput.value.trim()       || 'Software Engineer';
    const location   = locationInput.value.trim()   || '';
    const experience = experienceInput.value.trim() || '';

    // Only send the fields the backend needs — keep payload small
    const ALLOWED_KEYS = ['description', 'email', 'postUrl', 'postedAt', 'collectedAt', 'author', 'authorTitle'];
    const strippedPosts = lastCollectedData.posts.map(post => {
      const slim = {};
      ALLOWED_KEYS.forEach(k => { if (post[k] !== undefined) slim[k] = post[k]; });
      return slim;
    });

    // Build FormData exactly like the original extension sent it
    const jsonBlob = new Blob(
      [JSON.stringify({
        posts:        strippedPosts,
        totalPosts:   strippedPosts.length,
        collectedAt:  lastCollectedData.collectedAt,
        sourceUrl:    lastCollectedData.url
      })],
      { type: 'application/json' }
    );

    const formData = new FormData();
    formData.append('json_file',         jsonBlob, 'jobs.json');
    formData.append('email',             email);
    formData.append('roleAppliedFor',    role);
    formData.append('locationFilter',    location);
    formData.append('experienceFilter',  experience);

    sendBtn.disabled            = true;
    sendBtnIcon.textContent     = '⏳';
    showSendStatus('🔄 Sending to your local backend...', 'info');

    try {
      // ── CHANGED: points to YOUR backend ─────────────────────────
      const res  = await fetch(`${BACKEND_URL}/api/process-jobs`, {
        method: 'POST',
        body:   formData
      });

      const text = await res.text();
      let data;
      try   { data = JSON.parse(text); }
      catch (_) { data = { message: text }; }

      if (res.ok) {
        showSendStatus(
          `✅ <strong>Processed!</strong><br>
           <small>${data.added || strippedPosts.length} jobs queued · ${data.skipped || 0} skipped</small><br>
           <small style="color:#166534;">Now click "📧 Send Pending Emails" to fire them off.</small>`,
          'success'
        );
      } else {
        // Common error: backend not running
        if (res.status === 0 || text.includes('Failed to fetch')) {
          showSendStatus(
            `❌ Cannot connect to backend.<br>
             <small>Make sure you ran: <code>node index.js</code> in the backend folder.</small>`,
            'error'
          );
        } else {
          showSendStatus(
            `❌ Backend error ${res.status}: ${data.message || data.error || text.substring(0, 120)}`,
            'error'
          );
        }
      }

    } catch (err) {
      console.error('Process error:', err);
      // Network error = backend is not running
      showSendStatus(
        `❌ Cannot reach backend at ${BACKEND_URL}<br>
         <small>Start it with: <strong>node index.js</strong> in the backend folder.</small>`,
        'error'
      );
    } finally {
      sendBtn.disabled        = false;
      sendBtnIcon.textContent = '🚀';
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SEND PENDING EMAILS  →  POST to YOUR backend /api/send-emails
  //
  //  Tells your backend to go through all "pending" jobs in jobs.json
  //  and send each one via Gmail with the resume attached.
  // ═══════════════════════════════════════════════════════════════════
  if (sendEmailsBtn) {
    sendEmailsBtn.addEventListener('click', async () => {
      const email = getEmail();
      if (!email) return;

      sendEmailsBtn.disabled    = true;
      sendEmailsBtn.textContent = '⏳ Sending...';
      showSendStatus('🔄 Triggering email send from your backend...', 'info');

      try {
        // ── CHANGED: points to YOUR backend ─────────────────────────
        const res = await fetch(`${BACKEND_URL}/api/send-emails`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email })
        });

        const data = await res.json().catch(() => ({}));

        if (res.ok) {
          if (data.emails_sent === 0) {
            showSendStatus(
              `ℹ️ No pending emails found.<br>
               <small>Click "🚀 Process" first to queue jobs, then come back here.</small>`,
              'info'
            );
          } else {
            showSendStatus(
              `✅ <strong>Sent ${data.emails_sent} emails!</strong>
               ${data.failed ? `<br><small style="color:#dc2626">${data.failed} failed — check backend console</small>` : ''}`,
              'success'
            );
          }
        } else {
          showSendStatus(
            `❌ Error ${res.status}: ${data.message || data.error || 'Unknown error'}`,
            'error'
          );
        }

      } catch (err) {
        // Network error = backend is not running
        showSendStatus(
          `❌ Cannot reach backend at ${BACKEND_URL}<br>
           <small>Start it with: <strong>node index.js</strong> in the backend folder.</small>`,
          'error'
        );
      } finally {
        sendEmailsBtn.disabled    = false;
        sendEmailsBtn.textContent = '📧 Send Pending Emails';
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CLEAR DATA
  // ═══════════════════════════════════════════════════════════════════
  async function clearData() {
    await chrome.storage.local.remove(['linkedinPosts']);
    lastCollectedData         = null;
    downloadBtn.disabled      = true;
    viewBtn.disabled          = true;
    clearBtn.disabled         = true;
    sendBtn.disabled          = true;
    sendStatusEl.className    = 'send-status';
    updateStats('—', '—');
    showStatus('🗑 Stored data cleared.', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  KEYWORDS
  // ═══════════════════════════════════════════════════════════════════
  function loadCustomKeywords() {
    chrome.storage.local.get(['customKeywords'], (result) => {
      customKeywords = result.customKeywords || [];
      renderKeywordTags();
    });
  }

  function saveCustomKeywords() {
    chrome.storage.local.set({ customKeywords });
  }

  function addKeyword() {
    const val = keywordInput.value.trim().toLowerCase();
    if (!val) return;
    if (customKeywords.includes(val)) {
      showStatus(`⚠️ "${val}" is already in your list`, 'warning');
      keywordInput.value = '';
      return;
    }
    customKeywords.push(val);
    saveCustomKeywords();
    renderKeywordTags();
    keywordInput.value = '';
    updateKeywordStat();
  }

  function removeKeyword(kw) {
    customKeywords = customKeywords.filter(k => k !== kw);
    saveCustomKeywords();
    renderKeywordTags();
    updateKeywordStat();
  }

  function renderKeywordTags() {
    keywordTags.innerHTML = '';
    if (customKeywords.length === 0) {
      keywordTags.appendChild(noKeywordsMsg);
      noKeywordsMsg.style.display = 'inline';
    } else {
      noKeywordsMsg.style.display = 'none';
      customKeywords.forEach(kw => {
        const tag      = document.createElement('div');
        tag.className  = 'keyword-tag';
        tag.innerHTML  = `${kw} <span class="remove" data-kw="${kw}" title="Remove">×</span>`;
        tag.querySelector('.remove').addEventListener('click', () => removeKeyword(kw));
        keywordTags.appendChild(tag);
      });
    }
    updateKeywordStat();
  }

  function updateKeywordStat() {
    statKeywords.textContent = 34 + customKeywords.length;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  STORED DATA CHECK — on popup open, restore last session's data
  // ═══════════════════════════════════════════════════════════════════
  async function checkStoredData() {
    try {
      const result = await chrome.storage.local.get(['linkedinPosts']);
      if (result.linkedinPosts) {
        lastCollectedData = result.linkedinPosts;
        enableDataButtons();
        updateStats(
          lastCollectedData.totalPosts,
          lastCollectedData.skippedPosts || 0,
          lastCollectedData.scrollRounds || '—'
        );
        showStatus(
          `✅ Found <strong>${lastCollectedData.totalPosts}</strong> stored hiring posts from last session.`,
          'success'
        );
      }
    } catch (e) {
      console.log('No stored data found.');
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════

  function enableDataButtons() {
    downloadBtn.disabled = false;
    viewBtn.disabled     = false;
    clearBtn.disabled    = false;
    sendBtn.disabled     = false;
  }

  function updateStats(hiring, skipped, scrollRounds) {
    statHiring.textContent  = hiring  ?? '—';
    statSkipped.textContent = skipped ?? '—';
    if (scrollRounds !== undefined) statScrolls.textContent = scrollRounds;
  }

  function showStatus(message, type = 'info') {
    statusEl.innerHTML     = message;
    statusEl.className     = `status ${type}`;
    statusEl.style.display = 'block';
  }

  function showProgress(show) {
    progressBar.style.display = show ? 'block' : 'none';
  }

  function showSendStatus(message, type) {
    sendStatusEl.innerHTML  = message;
    sendStatusEl.className  = `send-status ${type}`;
  }

  function getEmail() {
    const email = senderEmail.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showSendStatus('❌ Please enter a valid email address first.', 'error');
      senderEmail.focus();
      return null;
    }
    return email;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function sendMessageWithTimeout(tabId, message, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Message timeout — content script took too long')),
        timeoutMs
      );
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  // Escape HTML special characters to prevent XSS in viewPosts()
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

});