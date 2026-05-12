/**
 * app.js — Main orchestrator for Session Debrief AI
 * All code wrapped in DOMContentLoaded to ensure DOM is fully ready.
 */

/* ── State ───────────────────────────────────── */
const App = {
  apiKey:        null,
  parsedCSV:     null,
  currentStats:  null,
  currentNotes:  '',
  currentReport: null,
};

/* ── Helpers ─────────────────────────────────── */
const $ = id => document.getElementById(id);
const show = el => el && (el.hidden = false);
const hide = el => el && (el.hidden = true);

/* ── Tab Switching (global for inline onclick) ── */
window.switchTab = function(tab) {
  ['new','diary'].forEach(t => {
    const capT = t.charAt(0).toUpperCase() + t.slice(1);
    const tabEl   = $('tab'   + capT);
    const panelEl = $('panel' + capT);
    if (tabEl)   tabEl.classList.toggle('active',   t === tab);
    if (panelEl) panelEl.classList.toggle('active', t === tab);
  });
  if (tab === 'diary') renderDiaryList();
};

window.closeSetupModal = () => hide($('setupModal'));
window.closeLoginModal = () => hide($('loginModal'));

/* ═══════════════════════════════════════════════
   INIT — runs when DOM is ready
═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

  /* ── PIN UX helper ─────────────────────────── */
  function initPinInputs(inputs) {
    inputs.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/\D/g, '').slice(-1);
        if (inp.value && i < inputs.length - 1) inputs[i + 1].focus();
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
      });
    });
  }
  initPinInputs([...document.querySelectorAll('#setupPins .pin-input')]);
  initPinInputs([...document.querySelectorAll('#loginPins .pin-input')]);

  /* ── Key Status UI ─────────────────────────── */
  function updateKeyUI() {
    const dot   = $('keyDot');
    const label = $('keyLabel');
    if (Vault.isUnlocked()) {
      App.apiKey = Vault.getUnlockedKey();
      dot.className = 'status-dot active';
      label.textContent = 'API Key loaded';
    } else if (Vault.hasStoredKey()) {
      App.apiKey = null;
      dot.className = 'status-dot';
      label.textContent = 'Key saved — enter PIN';
      openLoginModal();
    } else {
      App.apiKey = null;
      dot.className = 'status-dot error';
      label.textContent = 'No API Key';
    }
    updateAnalyzeBtn();
  }

  function updateAnalyzeBtn() {
    const btn = $('btnAnalyze');
    if (btn) btn.disabled = !App.apiKey || !App.currentStats;
  }

  $('keyBar').addEventListener('click', () => {
    if (Vault.hasStoredKey() && !Vault.isUnlocked()) openLoginModal();
    else openSetupModal();
  });

  /* ── Setup Modal ───────────────────────────── */
  window.openSetupModal = function() {
    show($('setupModal'));
    $('modalApiKeyInput').value = '';
    $('setupError').textContent = '';
    [...document.querySelectorAll('#setupPins .pin-input')].forEach(p => p.value = '');
    $('btnClearKey').style.display = Vault.hasStoredKey() ? 'block' : 'none';
    setTimeout(() => $('modalApiKeyInput').focus(), 50);
  };

  $('btnClearKey')?.addEventListener('click', () => {
    if (!confirm('Are you sure you want to delete your saved API Key? You will need to enter it again.')) return;
    Vault.clearKey();
    App.apiKey = null;
    window.closeSetupModal();
    updateKeyUI();
  });

  $('btnToggleKey').addEventListener('click', () => {
    const i = $('modalApiKeyInput');
    i.type = i.type === 'password' ? 'text' : 'password';
  });

  $('btnSaveKey').addEventListener('click', () => {
    const key = $('modalApiKeyInput').value.trim();
    const pin = [...document.querySelectorAll('#setupPins .pin-input')].map(p => p.value).join('');
    if (!key.startsWith('AIza') || key.length < 30) {
      $('setupError').textContent = 'Key must start with AIza (Gemini API Key)'; return;
    }
    if (pin.length !== 4) { $('setupError').textContent = 'Enter a 4-digit PIN'; return; }
    if (!Vault.saveKey(key, pin)) { $('setupError').textContent = 'Encryption error'; return; }
    App.apiKey = key;
    window.closeSetupModal();
    updateKeyUI();
  });

  /* ── Login Modal ───────────────────────────── */
  function openLoginModal() {
    show($('loginModal'));
    $('loginError').textContent = '';
    [...document.querySelectorAll('#loginPins .pin-input')].forEach(p => p.value = '');
    setTimeout(() => document.querySelector('#loginPins .pin-input')?.focus(), 50);
  }

  $('btnUnlock').addEventListener('click', () => {
    const pin = [...document.querySelectorAll('#loginPins .pin-input')].map(p => p.value).join('');
    if (pin.length !== 4) { $('loginError').textContent = 'Incomplete PIN'; return; }
    const key = Vault.loadKey(pin);
    if (!key) { $('loginError').textContent = 'Incorrect PIN'; return; }
    App.apiKey = key;
    window.closeLoginModal();
    updateKeyUI();
  });

  /* ── CSV Drop Zone ─────────────────────────── */
  const dropZone = $('dropZone');
  const csvInput = $('csvFileInput');

  dropZone.addEventListener('click',    () => csvInput.click());
  dropZone.addEventListener('keydown',  e  => { if (e.key === 'Enter' || e.key === ' ') csvInput.click(); });
  dropZone.addEventListener('dragover', e  => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave',()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop',     e  => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) loadCSVFile(f);
  });
  csvInput.addEventListener('change', e => { if (e.target.files[0]) loadCSVFile(e.target.files[0]); });

  function loadCSVFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = Papa.parse(e.target.result, { header: true, skipEmptyLines: true, dynamicTyping: true });
        if (!result.data.length) throw new Error('Empty CSV');
        App.parsedCSV = { text: e.target.result, fields: result.meta.fields };
        showFileBadge(file.name);
        populateColMap(result.meta.fields);
      } catch(err) { alert('Could not parse CSV: ' + err.message); }
    };
    reader.readAsText(file);
  }

  function showFileBadge(name) {
    const badge = $('fileBadge');
    badge.innerHTML = `<span class="file-badge">📄 ${name} <button onclick="removeCSV()" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:4px;">✕</button></span>`;
    show(badge);
    show($('colMapSection'));
  }

  window.removeCSV = function() {
    App.parsedCSV = null; App.currentStats = null;
    hide($('fileBadge')); hide($('colMapSection'));
    hide($('statsSection')); hide($('stepNotes'));
    updateAnalyzeBtn();
  };

  function populateColMap(fields) {
    ['colPnl','colPrice','colTime'].forEach(id => {
      const sel = $(id);
      sel.innerHTML = '<option value="">— select —</option>' +
        fields.map(f => `<option value="${f}">${f}</option>`).join('');
    });
    const pnlG   = fields.find(f => /pnl|profit|net|gain|p&l/i.test(f));
    const priceG = fields.find(f => /price|entry|open/i.test(f));
    const timeG  = fields.find(f => /time|date|hour|ts/i.test(f));
    if (pnlG)   $('colPnl').value   = pnlG;
    if (priceG) $('colPrice').value = priceG;
    if (timeG)  $('colTime').value  = timeG;
  }

  $('btnCalcStats').addEventListener('click', () => {
    const pnlCol   = $('colPnl').value;
    const priceCol = $('colPrice').value;
    const timeCol  = $('colTime').value;
    if (!pnlCol) { alert('Please select the PnL column.'); return; }
    try {
      const { stats } = Analyzer.processCSV(App.parsedCSV.text, { pnl: pnlCol, price: priceCol, time: timeCol });
      App.currentStats = stats;
      renderStats(stats);
      show($('statsSection'));
      show($('stepNotes'));
      updateAnalyzeBtn();
    } catch(err) { alert('Stats error: ' + err.message); }
  });

  function renderStats(s) {
    const pnlColor = s.totalPnL >= 0 ? 'green' : 'red';
    $('statsGrid').innerHTML = [
      { label: 'Total PnL',    value: (s.totalPnL >= 0 ? '+' : '') + s.totalPnL, color: pnlColor },
      { label: 'Win Rate',     value: s.winRate + '%',  color: s.winRate >= 50 ? 'green' : 'red' },
      { label: 'Trades',       value: s.tradeCount,     color: s.overtrading ? 'yellow' : '' },
      { label: 'Best Trade',   value: '+' + s.bestTrade, color: 'green' },
      { label: 'Worst Trade',  value: s.worstTrade,     color: 'red' },
      { label: 'Max Drawdown', value: '-' + s.maxDrawdown, color: 'red' },
      { label: 'Avg Win',      value: '+' + s.avgWin,   color: 'green' },
      { label: 'R:R Ratio',    value: s.rrRatio,        color: (s.rrRatio !== 'N/A' && s.rrRatio >= 2) ? 'green' : (s.rrRatio !== 'N/A' && s.rrRatio >= 1) ? 'yellow' : 'red' },
    ].map(item => `<div class="stat-card"><div class="stat-value ${item.color}">${item.value}</div><div class="stat-label">${item.label}</div></div>`).join('');
    $('statsDate').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  }

  /* ── Run AI Analysis ───────────────────────── */
  $('btnAnalyze').addEventListener('click', runAnalysis);

  async function runAnalysis() {
    if (!App.apiKey || !App.currentStats) return;
    App.currentNotes = $('notesInput').value.trim();
    hide($('stepUpload')); hide($('statsSection')); hide($('stepNotes'));
    showLoadingSection();
    showInterstitial();
  }

  function showLoadingSection() {
    show($('loadingSection'));
    const msgs = ['Analyzing emotional patterns…','Detecting trading sins…','Preparing brutal verdict…','Finalizing action plan…'];
    let i = 0;
    $('loadingSection')._iv = setInterval(() => { $('loadingSub').textContent = msgs[i++ % msgs.length]; }, 1400);
  }

  function hideLoadingSection() {
    const iv = $('loadingSection')._iv;
    if (iv) clearInterval(iv);
    hide($('loadingSection'));
  }

  /* ── Interstitial Ad ───────────────────────── */
  function showInterstitial() {
    show($('interstitialAd'));
    let t = 5;
    $('adCountdown').textContent = '0' + t;
    $('btnSkipAd').textContent = 'Wait…';
    $('btnSkipAd').disabled = true;

    const iv = setInterval(() => {
      t--;
      $('adCountdown').textContent = t > 0 ? '0' + t : '00';
      if (t <= 0) {
        clearInterval(iv);
        $('btnSkipAd').disabled = false;
        $('btnSkipAd').textContent = 'Continue to Analysis →';
      }
    }, 1000);

    $('btnSkipAd').onclick = async () => {
      if ($('btnSkipAd').disabled) return;
      hide($('interstitialAd'));
      await callGemini();
    };
  }

  async function callGemini() {
    try {
      const report = await GeminiAPI.analyze(App.currentStats, App.currentNotes, App.apiKey);
      App.currentReport = report;
      Diary.save({ id: Date.now(), date: new Date().toISOString(), stats: App.currentStats, notes: App.currentNotes, report });
      hideLoadingSection();
      renderResults(report);
    } catch(err) {
      hideLoadingSection();
      show($('stepUpload')); show($('statsSection')); show($('stepNotes'));
      alert('⚠ ' + err.message);
    }
  }

  /* ── Results ───────────────────────────────── */
  function gradeLabel(s) {
    if (s >= 90) return 'INSTITUTIONAL GRADE';
    if (s >= 70) return 'ACCEPTABLE';
    if (s >= 50) return 'NEEDS WORK';
    if (s >= 30) return 'DANGEROUS';
    return 'ACCOUNT RISK';
  }

  function renderResults(report) {
    show($('resultsSection'));
    const score = report.discipline_score ?? 50;
    animateGauge(score);
    $('gaugeGrade').textContent = gradeLabel(score);
    $('verdictBrief').textContent = score >= 70 ? 'Solid session. Stay consistent.' : score >= 50 ? 'Acceptable but fixable.' : 'Serious issues detected today.';
    $('brutalSummary').textContent = report.brutal_summary || '—';
    const sins = report.detected_sins || [];
    $('sinsList').innerHTML = sins.length
      ? sins.map(s => `<li class="sin-item"><div class="sin-name">⚠ ${s.sin}</div><div class="sin-evidence">${s.evidence}</div></li>`).join('')
      : '<li class="sin-item"><div class="sin-name" style="color:var(--green)">✓ No major sins detected</div></li>';
    $('actionPlan').textContent = report.action_plan_tomorrow || '—';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function animateGauge(score) {
    const fill   = $('gaugeFill');
    const label  = $('gaugeScore');
    const circum = 251.2;
    const color  = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    fill.style.stroke = color;
    label.style.color = color;
    let cur = 0;
    const iv = setInterval(() => {
      cur = Math.min(cur + score / 40, score);
      label.textContent = Math.round(cur);
      fill.style.strokeDashoffset = circum - (cur / 100) * circum;
      if (cur >= score) clearInterval(iv);
    }, 20);
  }

  $('btnNewAnalysis').addEventListener('click', () => {
    App.parsedCSV = null; App.currentStats = null; App.currentReport = null;
    hide($('resultsSection'));
    show($('stepUpload'));
    $('notesInput').value = '';
    hide($('fileBadge')); hide($('colMapSection'));
    hide($('statsSection')); hide($('stepNotes'));
    updateAnalyzeBtn();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ── Share / html2canvas ───────────────────── */
  $('btnShare').addEventListener('click', async () => {
    if (!App.currentReport) return;
    const r = App.currentReport;
    const score = r.discipline_score ?? 0;
    const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const ticket = document.createElement('div');
    ticket.style.cssText = 'position:fixed;left:-9999px;top:0;width:520px;padding:32px;background:#0a0d14;font-family:Inter,sans-serif;border:1px solid #1e2d3d;border-radius:12px;';
    ticket.innerHTML = `
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
        <div style="font-size:3rem;font-weight:800;color:${color}">${score}</div>
        <div>
          <div style="font-size:1rem;font-weight:700;color:#e2e8f0">Session Debrief AI</div>
          <div style="font-size:12px;color:#94a3b8">${gradeLabel(score)}</div>
        </div>
      </div>
      <div style="font-size:.9rem;color:#e2e8f0;line-height:1.6;background:#111827;border-left:3px solid ${color};padding:12px 16px;border-radius:0 8px 8px 0;margin-bottom:16px;">"${r.brutal_summary}"</div>
      <div style="font-size:11px;color:#475569;text-align:right;">Generated at gcarnf04.github.io</div>
    `;
    document.body.appendChild(ticket);
    try {
      const canvas = await html2canvas(ticket, { backgroundColor: '#0a0d14', scale: 2 });
      ticket.remove();
      const a = document.createElement('a');
      a.download = `debrief_${new Date().toISOString().slice(0,10)}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();
    } catch(e) { ticket.remove(); alert('Export failed: ' + e.message); }
  });

  /* ── Diary List ────────────────────────────── */
  function renderDiaryList() {
    const entries = Diary.getAll();
    const container = $('diaryList');
    hide($('diaryDetail'));
    show(container);

    if (!entries.length) {
      container.innerHTML = `<div class="empty-state">
        <svg viewBox="0 0 48 48" fill="none" width="48" height="48"><rect x="8" y="6" width="32" height="36" rx="4" stroke="#94a3b8" stroke-width="2"/><path d="M16 16h16M16 22h16M16 28h10" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round"/></svg>
        <h3>No sessions yet</h3>
        <p>Run your first analysis to start building your diary.</p>
      </div>`;
      return;
    }

    let html = '<div class="diary-list">';
    entries.forEach((entry, idx) => {
      const score = entry.report?.discipline_score ?? '?';
      const cls   = score >= 70 ? 'green' : score >= 50 ? 'yellow' : 'red';
      const date  = new Date(entry.date).toLocaleDateString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
      const sub   = (entry.report?.brutal_summary || 'No summary').slice(0, 80) + '…';
      html += `<div class="diary-item" onclick="openDiaryEntry(${entry.id})">
        <div class="diary-score ${cls}">${score}</div>
        <div class="diary-info">
          <div class="diary-date">${date}</div>
          <div class="diary-sub">${sub}</div>
        </div>
        <div class="diary-arrow">›</div>
      </div>`;
      if ((idx + 1) % 5 === 0 && idx < entries.length - 1) {
        html += `<div class="ad-banner"><!-- INSERTA AQUÍ TU SCRIPT DE GOOGLE ADSENSE --> Advertisement</div>`;
      }
    });
    html += '</div>';
    container.innerHTML = html;
  }

  window.openDiaryEntry = function(id) {
    const entry = Diary.getById(id);
    if (!entry) return;
    hide($('diaryList'));
    show($('diaryDetail'));
    const r = entry.report || {};
    const score = r.discipline_score ?? '?';
    const color = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const sins  = (r.detected_sins || []).map(s => `<li class="sin-item"><div class="sin-name">⚠ ${s.sin}</div><div class="sin-evidence">${s.evidence}</div></li>`).join('');
    const date  = new Date(entry.date).toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    const s = entry.stats || {};
    $('diaryDetailContent').innerHTML = `
      <div class="card mb-16" style="text-align:center;">
        <div style="font-size:3rem;font-weight:800;color:${color}">${score}</div>
        <div style="font-size:13px;color:var(--text-2)">${date}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:4px;">${gradeLabel(score)}</div>
      </div>
      <div class="report-card">
        <div class="report-section"><h3>⚡ Brutal Summary</h3><div class="brutal-summary">${r.brutal_summary || '—'}</div></div>
        <div class="report-section"><h3>🔴 Trading Sins</h3><ul class="sins-list">${sins || '<li class="sin-item"><div class="sin-name" style="color:var(--green)">✓ None detected</div></li>'}</ul></div>
        <div class="report-section"><h3>✅ Action Plan</h3><div class="action-plan">${r.action_plan_tomorrow || '—'}</div></div>
        ${s.tradeCount ? `<div class="report-section"><h3>📊 Stats</h3><div class="stats-grid">
          <div class="stat-card"><div class="stat-value ${s.totalPnL>=0?'green':'red'}">${s.totalPnL>=0?'+':''}${s.totalPnL}</div><div class="stat-label">Total PnL</div></div>
          <div class="stat-card"><div class="stat-value ${s.winRate>=50?'green':'red'}">${s.winRate}%</div><div class="stat-label">Win Rate</div></div>
          <div class="stat-card"><div class="stat-value">${s.tradeCount}</div><div class="stat-label">Trades</div></div>
          <div class="stat-card"><div class="stat-value red">-${s.maxDrawdown}</div><div class="stat-label">Max DD</div></div>
        </div></div>` : ''}
        ${entry.notes ? `<div class="report-section"><h3>📝 Notes</h3><div class="brutal-summary" style="border-color:var(--text-3)">${entry.notes}</div></div>` : ''}
      </div>
      <button class="btn-danger btn-ghost btn-sm mt-16" onclick="deleteEntry(${entry.id})">🗑 Delete entry</button>
    `;
  };

  window.deleteEntry = function(id) {
    if (!confirm('Delete this diary entry permanently?')) return;
    Diary.remove(id);
    hide($('diaryDetail'));
    show($('diaryList'));
    renderDiaryList();
  };

  $('btnBackDiary').addEventListener('click', () => {
    hide($('diaryDetail')); show($('diaryList'));
  });

  /* ── Export / Import ───────────────────────── */
  $('btnExport').addEventListener('click', () => Diary.exportJSON());
  $('importInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const count = await Diary.importJSON(file);
      alert(`✓ Imported ${count} sessions successfully.`);
      renderDiaryList();
    } catch(err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  });

  /* ── Bootstrap ─────────────────────────────── */
  updateKeyUI();
  renderDiaryList(); // pre-render so it's ready if user switches tab immediately

}); // end DOMContentLoaded
