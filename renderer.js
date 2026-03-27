const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let currentInfo = null;
let outputFolder = '';
const queue = [];
let libraryFiles = [];
let currentlyPlaying = null;
const audioEl = document.getElementById('audio-element');

async function init() {
  outputFolder = await window.api.getDefaultFolder();
  $('#output-folder').value = outputFolder;
  $('#stems-output').value = outputFolder;
  setupTabs();
  setupWindowControls();
  setupThemeToggle();
  setupGrab();
  setupSearch();
  setupSettings();
  setupTrim();
  setupFormatToggle();
  setupDownloadEvents();
  setupKeyboardShortcuts();
  setupLibrary();
  setupAnalyzer();
  setupStems();
  setupProtocolHandler();
}

function setupWindowControls() {
  $('#btn-min').addEventListener('click', () => window.api.minimize());
  $('#btn-max').addEventListener('click', () => window.api.maximize());
  $('#btn-close').addEventListener('click', () => window.api.close());
}

function setupThemeToggle() {
  const btn = $('#btn-theme');
  const saved = localStorage.getItem('vulpidl-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('vulpidl-theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = $('#btn-theme');
  btn.innerHTML = theme === 'dark'
    ? '<i class="bi bi-moon-fill"></i>'
    : '<i class="bi bi-sun-fill"></i>';
}

function setupProtocolHandler() {
  window.api.onProtocolUrl((url) => {
    $('#url-input').value = url;
    switchToTab('grab');
    fetchInfo();
  });
}

function setupTabs() {
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $(`#tab-${tab}`).classList.add('active');
      $(`#tab-${tab}`).style.animation = 'none';
      $(`#tab-${tab}`).offsetHeight;
      $(`#tab-${tab}`).style.animation = '';
      if (tab === 'library') refreshLibrary();
    });
  });
}

function switchToTab(tabName) {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`[data-tab="${tabName}"]`).classList.add('active');
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  $(`#tab-${tabName}`).classList.add('active');
}

function setupFormatToggle() {
  const formatSel = $('#sel-format');
  const qualityCard = $('#quality-card');

  function updateQualityVisibility() {
    qualityCard.style.display = formatSel.value === 'mp3' ? 'block' : 'none';
  }

  formatSel.addEventListener('change', updateQualityVisibility);
  updateQualityVisibility();
}

function setupTrim() {
  const chk = $('#chk-trim');
  const inputs = $('#trim-inputs');

  chk.addEventListener('change', () => {
    inputs.classList.toggle('hidden', !chk.checked);
  });

  $('#btn-calc-end').addEventListener('click', () => {
    const bpm = parseFloat($('#trim-bpm').value);
    const bars = parseInt($('#trim-bars').value);
    const startStr = $('#trim-start').value || '0:00';

    if (!bpm || !bars) {
      toast('Enter BPM and bars to calculate', 'error');
      return;
    }

    const startSec = parseTimestamp(startStr);
    const durationSec = (bars * 4 / bpm) * 60;
    const endSec = startSec + durationSec;

    $('#trim-end').value = formatTimestamp(endSec);
    toast(`${bars} bars @ ${bpm}bpm = ${durationSec.toFixed(2)}s`);
  });
}

function setupGrab() {
  const urlInput = $('#url-input');
  const btnFetch = $('#btn-fetch');

  urlInput.addEventListener('paste', () => {
    setTimeout(() => {
      if (urlInput.value.match(/^https?:\/\//)) fetchInfo();
    }, 100);
  });

  btnFetch.addEventListener('click', fetchInfo);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchInfo();
  });

  $('#btn-download').addEventListener('click', startDownload);
}

async function fetchInfo() {
  const url = $('#url-input').value.trim();
  if (!url) return;

  setStatus('busy', 'FETCHING');
  $('#btn-fetch').disabled = true;
  $('#btn-fetch').innerHTML = '<span class="spinner"></span>';

  try {
    const info = await window.api.fetchInfo(url);
    currentInfo = info;

    $('#info-preview').classList.remove('hidden');
    $('#info-title').textContent = info.title;
    $('#info-uploader').textContent = info.uploader;
    $('#info-duration').textContent = formatTimestamp(info.duration);
    if (info.thumbnail) {
      $('#info-thumb').style.backgroundImage = `url(${info.thumbnail})`;
    }

    $('#btn-download').disabled = false;
    setStatus('idle', 'READY');
    toast(`Fetched: ${info.title}`);
  } catch (err) {
    toast(`Fetch failed: ${err}`, 'error');
    setStatus('error', 'ERROR');
    setTimeout(() => setStatus('idle', 'IDLE'), 3000);
  } finally {
    $('#btn-fetch').disabled = false;
    $('#btn-fetch').innerHTML = '<i class="bi bi-arrow-down-circle"></i> FETCH';
  }
}

async function startDownload() {
  if (!currentInfo) return;

  const url = $('#url-input').value.trim();
  const format = $('#sel-format').value;
  const quality = format === 'mp3' ? $('#sel-quality').value : null;
  const sampleRate = $('#sel-samplerate').value || null;
  const channels = $('#sel-channels').value || null;

  let startTime = null, endTime = null;
  if ($('#chk-trim').checked) {
    startTime = $('#trim-start').value || null;
    endTime = $('#trim-end').value || null;
  }

  let filename = $('#custom-filename').value.trim();
  if (filename && !filename.includes('.')) filename += `.${format}`;

  const opts = {
    url, outputDir: outputFolder, format, quality,
    sampleRate, channels, startTime, endTime,
    filename: filename || null,
  };

  const queueItem = { id: null, title: currentInfo.title, status: 'downloading', progress: 0 };
  queue.push(queueItem);
  renderQueue();
  setStatus('busy', 'DOWNLOADING');
  switchToTab('queue');

  try {
    await window.api.download(opts);
  } catch (err) {
    queueItem.status = 'error';
    renderQueue();
    toast(`Download failed: ${err}`, 'error');
    setStatus('error', 'ERROR');
    setTimeout(() => setStatus('idle', 'IDLE'), 3000);
  }
}

function setupDownloadEvents() {
  window.api.onDownloadStarted((data) => {
    const pending = queue.find(q => q.id === null);
    if (pending) {
      pending.id = data.id;
      renderQueue();
    }
  });

  window.api.onDownloadProgress((data) => {
    const item = queue.find(q => q.id === data.id);
    if (!item) return;
    item.progress = data.progress;
    item.status = data.status;
    if (data.file) item.file = data.file;
    renderQueue();
    if (data.status === 'done') {
      setStatus('idle', 'IDLE');
      toast(`Done: ${item.title}`, 'success');
    }
  });
}

function renderQueue() {
  const container = $('#queue-list');
  if (queue.length === 0) {
    container.innerHTML = '<div class="queue-empty">no downloads yet</div>';
    return;
  }
  container.innerHTML = queue.map((item) => `
    <div class="queue-item">
      <div class="queue-item-header">
        <div class="queue-item-title">${escapeHtml(item.title)}</div>
        <span class="queue-item-status ${item.status}">${statusLabel(item.status)}</span>
      </div>
      <div class="queue-progress">
        <div class="queue-progress-bar ${item.status === 'done' ? 'done' : ''} ${item.status === 'error' ? 'error' : ''}"
             style="width: ${item.progress}%"></div>
      </div>
    </div>
  `).reverse().join('');
}

function statusLabel(status) {
  return { downloading: 'DOWNLOADING', processing: 'PROCESSING', done: 'COMPLETE', error: 'FAILED' }[status] || status.toUpperCase();
}

function setupSearch() {
  $('#btn-search').addEventListener('click', doSearch);
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

async function doSearch() {
  const query = $('#search-input').value.trim();
  if (!query) return;

  setStatus('busy', 'SEARCHING');
  $('#btn-search').disabled = true;
  $('#btn-search').innerHTML = '<span class="spinner"></span>';
  $('#search-results').innerHTML = '';

  try {
    const results = await window.api.searchYT(query, 12);
    renderSearchResults(results);
    setStatus('idle', 'IDLE');
  } catch (err) {
    toast(`Search failed: ${err}`, 'error');
    setStatus('error', 'ERROR');
    setTimeout(() => setStatus('idle', 'IDLE'), 3000);
  } finally {
    $('#btn-search').disabled = false;
    $('#btn-search').innerHTML = '<i class="bi bi-search"></i> SEARCH';
  }
}

function renderSearchResults(results) {
  const container = $('#search-results');
  if (!results.length) {
    container.innerHTML = '<div class="queue-empty">no results found</div>';
    return;
  }

  container.innerHTML = results.map(r => `
    <div class="result-item" data-url="${escapeHtml(r.url)}">
      <div class="result-thumb" style="background-image: url('${r.thumbnail}')"></div>
      <div class="result-info">
        <div class="result-title">${escapeHtml(r.title)}</div>
        <div class="result-meta">${escapeHtml(r.uploader)} &middot; ${formatTimestamp(r.duration)}</div>
      </div>
      <button class="result-grab">GRAB</button>
    </div>
  `).join('');

  container.querySelectorAll('.result-item').forEach(item => {
    const grabBtn = item.querySelector('.result-grab');
    grabBtn.addEventListener('click', (e) => { e.stopPropagation(); sendToGrab(item.dataset.url); });
    item.addEventListener('click', () => sendToGrab(item.dataset.url));
  });
}

function sendToGrab(url) {
  $('#url-input').value = url;
  switchToTab('grab');
  fetchInfo();
}

function setupSettings() {
  $('#btn-pick-folder').addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) {
      outputFolder = folder;
      $('#output-folder').value = folder;
      $('#stems-output').value = folder;
    }
  });

  $('#btn-open-folder').addEventListener('click', () => window.api.openFolder(outputFolder));

  window.api.getLogPath().then(p => { $('#log-path').value = p; });
  $('#btn-open-logs').addEventListener('click', () => window.api.openLogDir());

  $('#sel-fontsize').addEventListener('change', (e) => {
    document.documentElement.style.setProperty('--font-size', e.target.value + 'px');
    localStorage.setItem('ds-fontsize', e.target.value);
  });

  $('#sel-contrast').addEventListener('change', (e) => {
    document.body.classList.toggle('high-contrast', e.target.value === 'high');
    localStorage.setItem('ds-contrast', e.target.value);
  });

  $('#chk-reduced-motion').addEventListener('change', (e) => {
    document.body.classList.toggle('reduced-motion', e.target.checked);
    localStorage.setItem('ds-reducedmotion', e.target.checked);
  });

  const savedFont = localStorage.getItem('ds-fontsize');
  if (savedFont) {
    $('#sel-fontsize').value = savedFont;
    document.documentElement.style.setProperty('--font-size', savedFont + 'px');
  }
  const savedContrast = localStorage.getItem('ds-contrast');
  if (savedContrast) {
    $('#sel-contrast').value = savedContrast;
    document.body.classList.toggle('high-contrast', savedContrast === 'high');
  }
  const savedMotion = localStorage.getItem('ds-reducedmotion');
  if (savedMotion === 'true') {
    $('#chk-reduced-motion').checked = true;
    document.body.classList.add('reduced-motion');
  }
}

function setupLibrary() {
  $('#btn-refresh-lib').addEventListener('click', refreshLibrary);
  $('#btn-open-lib-folder').addEventListener('click', () => window.api.openFolder(outputFolder));
  $('#library-search').addEventListener('input', renderLibrary);

  audioEl.addEventListener('timeupdate', updatePlayerTime);
  audioEl.addEventListener('ended', () => {
    currentlyPlaying = null;
    $('#btn-player-play').innerHTML = '<i class="bi bi-play-fill"></i>';
    $$('.lib-item').forEach(el => el.classList.remove('playing'));
  });

  $('#btn-player-play').addEventListener('click', togglePlayback);
  $('#btn-player-stop').addEventListener('click', stopPlayback);
  $('#player-seek').addEventListener('input', (e) => {
    if (audioEl.duration) audioEl.currentTime = (e.target.value / 100) * audioEl.duration;
  });
}

async function refreshLibrary() {
  try {
    libraryFiles = await window.api.scanLibrary(outputFolder);
    renderLibrary();
  } catch (err) {
    toast('Failed to scan library', 'error');
  }
}

function renderLibrary() {
  const filter = $('#library-search').value.toLowerCase().trim();
  const filtered = filter
    ? libraryFiles.filter(f => f.name.toLowerCase().includes(filter))
    : libraryFiles;

  const totalSize = filtered.reduce((sum, f) => sum + f.size, 0);
  $('#lib-count').textContent = `${filtered.length} sample${filtered.length !== 1 ? 's' : ''}`;
  $('#lib-size').textContent = formatSize(totalSize);

  const container = $('#library-list');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="queue-empty">no samples found</div>';
    return;
  }

  // stems live in htdemucs/<trackname>/ subdirs, group em with their parent
  const stemPattern = /[/\\]htdemucs[_a-z]*[/\\]([^/\\]+)[/\\]([^/\\]+)$/i;
  const groups = new Map();
  const standalone = [];

  for (const f of filtered) {
    const match = f.path.match(stemPattern);
    if (match) {
      const parentName = match[1];
      if (!groups.has(parentName)) groups.set(parentName, { parent: null, stems: [] });
      groups.get(parentName).stems.push(f);
    } else {
      const baseName = f.name.replace(/\.[^.]+$/, '');
      if (groups.has(baseName)) {
        groups.get(baseName).parent = f;
      } else {
        groups.set('__standalone__' + f.path, { parent: f, stems: [] });
      }
    }
  }

  for (const [key, group] of groups) {
    if (!group.parent && !key.startsWith('__standalone__')) {
      for (const [sKey, sGroup] of groups) {
        if (sKey.startsWith('__standalone__') && sGroup.parent) {
          const baseName = sGroup.parent.name.replace(/\.[^.]+$/, '');
          if (baseName === key) {
            group.parent = sGroup.parent;
            groups.delete(sKey);
            break;
          }
        }
      }
    }
  }

  let html = '';
  for (const [key, group] of groups) {
    const hasStemChildren = group.stems.length > 0;

    if (group.parent) {
      if (hasStemChildren) {
        html += `
          <div class="lib-group-header" data-group="${escapeHtml(key)}">
            <span class="group-toggle"><i class="bi bi-chevron-down"></i></span>
            ${renderLibItem(group.parent)}
          </div>
          <div class="lib-group-children" data-group-children="${escapeHtml(key)}">
            ${group.stems.map(f => renderLibItemFull(f)).join('')}
          </div>`;
      } else {
        html += renderLibItemFull(group.parent);
      }
    }

    if (!group.parent && hasStemChildren) {
      html += `
        <div class="lib-group-header" data-group="${escapeHtml(key)}">
          <span class="group-toggle"><i class="bi bi-chevron-down"></i></span>
          <span class="lib-ext"><i class="bi bi-scissors"></i></span>
          <span class="lib-name">${escapeHtml(key)}</span>
          <span class="lib-meta">${group.stems.length} stems</span>
        </div>
        <div class="lib-group-children" data-group-children="${escapeHtml(key)}">
          ${group.stems.map(f => renderLibItemFull(f)).join('')}
        </div>`;
    }
  }

  container.innerHTML = html;
  wireUpLibraryActions(container);
  wireUpGroupToggles(container);
}

function renderLibItem(f) {
  return `
    <span class="lib-ext">${f.ext}</span>
    <span class="lib-name">${escapeHtml(f.name)}</span>
    <span class="lib-meta">${formatSize(f.size)}</span>
    <div class="lib-actions">
      <button class="lib-action-btn play-btn" title="Play" data-path="${escapeHtml(f.path)}"><i class="bi bi-play-fill"></i></button>
      <button class="lib-action-btn analyze-btn" title="Analyze" data-path="${escapeHtml(f.path)}"><i class="bi bi-activity"></i></button>
      <button class="lib-action-btn stems-btn" title="Stems" data-path="${escapeHtml(f.path)}"><i class="bi bi-scissors"></i></button>
      <button class="lib-action-btn folder-btn" title="Folder" data-path="${escapeHtml(f.path)}"><i class="bi bi-folder2-open"></i></button>
      <button class="lib-action-btn delete" title="Delete" data-path="${escapeHtml(f.path)}"><i class="bi bi-x-lg"></i></button>
    </div>`;
}

function renderLibItemFull(f) {
  return `
    <div class="lib-item ${currentlyPlaying === f.path ? 'playing' : ''}" data-path="${escapeHtml(f.path)}" role="listitem">
      <span class="lib-ext">${f.ext}</span>
      <span class="lib-name">${escapeHtml(f.name)}</span>
      <span class="lib-meta">${formatSize(f.size)}</span>
      <div class="lib-actions">
        <button class="lib-action-btn play-btn" title="Play"><i class="bi bi-play-fill"></i></button>
        <button class="lib-action-btn analyze-btn" title="Analyze"><i class="bi bi-activity"></i></button>
        <button class="lib-action-btn stems-btn" title="Stems"><i class="bi bi-scissors"></i></button>
        <button class="lib-action-btn folder-btn" title="Folder"><i class="bi bi-folder2-open"></i></button>
        <button class="lib-action-btn delete" title="Delete"><i class="bi bi-x-lg"></i></button>
      </div>
    </div>`;
}

function wireUpGroupToggles(container) {
  container.querySelectorAll('.lib-group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.lib-action-btn')) return;
      const groupKey = header.dataset.group;
      const children = container.querySelector(`[data-group-children="${groupKey}"]`);
      if (children) {
        header.classList.toggle('collapsed');
        children.classList.toggle('collapsed');
      }
    });
  });
}

function wireUpLibraryActions(container) {
  container.querySelectorAll('.lib-item').forEach(item => {
    const filePath = item.dataset.path;
    wireLibItemActions(item, filePath);
    item.addEventListener('dblclick', () => playFile(filePath));
  });

  container.querySelectorAll('.lib-group-header .lib-action-btn').forEach(btn => {
    const filePath = btn.dataset.path;
    if (!filePath) return;
    if (btn.classList.contains('play-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); playFile(filePath); });
    else if (btn.classList.contains('analyze-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); sendToAnalyze(filePath); });
    else if (btn.classList.contains('stems-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); sendToStems(filePath); });
    else if (btn.classList.contains('folder-btn')) btn.addEventListener('click', (e) => { e.stopPropagation(); window.api.showInFolder(filePath); });
    else if (btn.classList.contains('delete')) btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (currentlyPlaying === filePath) stopPlayback();
      const ok = await window.api.deleteFile(filePath);
      if (ok) { libraryFiles = libraryFiles.filter(f => f.path !== filePath); renderLibrary(); toast('Sample deleted'); }
    });
  });
}

function wireLibItemActions(item, filePath) {
  item.querySelector('.play-btn').addEventListener('click', (e) => { e.stopPropagation(); playFile(filePath); });
  item.querySelector('.analyze-btn').addEventListener('click', (e) => { e.stopPropagation(); sendToAnalyze(filePath); });
  item.querySelector('.stems-btn').addEventListener('click', (e) => { e.stopPropagation(); sendToStems(filePath); });
  item.querySelector('.folder-btn').addEventListener('click', (e) => { e.stopPropagation(); window.api.showInFolder(filePath); });
  item.querySelector('.delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (currentlyPlaying === filePath) stopPlayback();
    const ok = await window.api.deleteFile(filePath);
    if (ok) { libraryFiles = libraryFiles.filter(f => f.path !== filePath); renderLibrary(); toast('Sample deleted'); }
  });
}

function playFile(filePath) {
  if (currentlyPlaying === filePath) { togglePlayback(); return; }
  currentlyPlaying = filePath;
  audioEl.src = filePath;
  audioEl.play();
  $('#player-title').textContent = filePath.split(/[/\\]/).pop();
  $('#library-player').classList.remove('hidden');
  $('#btn-player-play').innerHTML = '<i class="bi bi-pause-fill"></i>';
  $$('.lib-item').forEach(el => el.classList.toggle('playing', el.dataset.path === filePath));
}

function togglePlayback() {
  if (audioEl.paused) {
    audioEl.play();
    $('#btn-player-play').innerHTML = '<i class="bi bi-pause-fill"></i>';
  } else {
    audioEl.pause();
    $('#btn-player-play').innerHTML = '<i class="bi bi-play-fill"></i>';
  }
}

function stopPlayback() {
  audioEl.pause();
  audioEl.currentTime = 0;
  currentlyPlaying = null;
  $('#btn-player-play').innerHTML = '<i class="bi bi-play-fill"></i>';
  $('#library-player').classList.add('hidden');
  $$('.lib-item').forEach(el => el.classList.remove('playing'));
}

function updatePlayerTime() {
  if (!audioEl.duration) return;
  $('#player-time').textContent = `${formatTimestamp(audioEl.currentTime)} / ${formatTimestamp(audioEl.duration)}`;
  $('#player-seek').value = (audioEl.currentTime / audioEl.duration) * 100;
}

function setupAnalyzer() {
  $('#btn-pick-analyze').addEventListener('click', async () => {
    const file = await window.api.pickFile();
    if (file) { $('#analyze-file').value = file; $('#btn-analyze').disabled = false; }
  });

  $('#btn-analyze').addEventListener('click', runAnalysis);

  const analyzeInput = $('#analyze-file');
  analyzeInput.closest('.input-group').addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  analyzeInput.closest('.input-group').addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) { analyzeInput.value = file.path; $('#btn-analyze').disabled = false; }
  });
}

function sendToAnalyze(filePath) {
  switchToTab('analyze');
  $('#analyze-file').value = filePath;
  $('#btn-analyze').disabled = false;
  runAnalysis();
}

async function runAnalysis() {
  const filePath = $('#analyze-file').value;
  if (!filePath) return;

  setStatus('busy', 'ANALYZING');
  $('#btn-analyze').disabled = true;
  $('#btn-analyze').innerHTML = '<span class="spinner"></span> ANALYZING...';

  try {
    const probe = await window.api.probeAudio(filePath);
    $('#result-duration').textContent = formatTimestamp(probe.duration);
    $('#result-samplerate').textContent = probe.sampleRate ? `${probe.sampleRate} Hz` : '--';
    $('#result-channels').textContent = probe.channels === 1 ? 'Mono' : probe.channels === 2 ? 'Stereo' : `${probe.channels}ch`;
    $('#result-codec').textContent = probe.codec.toUpperCase();

    const response = await fetch(filePath);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    drawWaveform(audioBuffer);

    const bpm = detectBPM(audioBuffer);
    $('#result-bpm').textContent = bpm ? Math.round(bpm) : '--';
    $('#result-bpm-confidence').textContent = bpm ? `~${bpm.toFixed(1)} BPM` : 'could not detect';

    const keyResult = detectKey(audioBuffer);
    $('#result-key').textContent = keyResult ? keyResult.key : '--';
    $('#result-key-type').textContent = keyResult ? `${keyResult.type} (${keyResult.confidence}% confidence)` : '';

    audioCtx.close();
    $('#analysis-results').classList.remove('hidden');
    setStatus('idle', 'IDLE');
    toast('Analysis complete', 'success');
  } catch (err) {
    toast(`Analysis failed: ${err}`, 'error');
    setStatus('error', 'ERROR');
    setTimeout(() => setStatus('idle', 'IDLE'), 3000);
  } finally {
    $('#btn-analyze').disabled = false;
    $('#btn-analyze').innerHTML = '<i class="bi bi-activity"></i> ANALYZE';
  }
}

function detectBPM(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const downsampleFactor = 4;
  const samples = [];
  for (let i = 0; i < channelData.length; i += downsampleFactor) samples.push(Math.abs(channelData[i]));
  const dsRate = sampleRate / downsampleFactor;

  const windowSize = Math.floor(dsRate * 0.02);
  const hopSize = Math.floor(windowSize / 2);
  const energies = [];
  for (let i = 0; i + windowSize < samples.length; i += hopSize) {
    let sum = 0;
    for (let j = 0; j < windowSize; j++) sum += samples[i + j] * samples[i + j];
    energies.push(sum / windowSize);
  }

  const onsets = [0];
  for (let i = 1; i < energies.length; i++) {
    const diff = energies[i] - energies[i - 1];
    onsets.push(diff > 0 ? diff : 0);
  }

  const minBPM = 60, maxBPM = 200;
  const energyRate = dsRate / hopSize;
  const minLag = Math.floor(energyRate * 60 / maxBPM);
  const maxLag = Math.floor(energyRate * 60 / minBPM);

  let bestLag = minLag, bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < onsets.length; lag++) {
    let corr = 0;
    const len = Math.min(onsets.length - lag, 2000);
    for (let i = 0; i < len; i++) corr += onsets[i] * onsets[i + lag];
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  let finalBPM = (energyRate * 60) / bestLag;
  while (finalBPM > 180) finalBPM /= 2;
  while (finalBPM < 60) finalBPM *= 2;
  return finalBPM;
}

// fft key detection w/ dual profile correlation (krumhansl-kessler + temperley)
function detectKey(audioBuffer) {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  const segmentDuration = 8;
  const segmentSamples = sampleRate * segmentDuration;
  const fftSize = 8192;
  const chromaAccum = new Float64Array(12);

  const numSegments = Math.min(8, Math.floor(channelData.length / segmentSamples));
  const step = Math.floor(channelData.length / (numSegments + 1));

  for (let seg = 0; seg < numSegments; seg++) {
    const offset = step * (seg + 1) - Math.floor(segmentSamples / 2);
    const start = Math.max(0, offset);
    const end = Math.min(channelData.length, start + segmentSamples);

    for (let winStart = start; winStart + fftSize <= end; winStart += fftSize / 2) {
      const windowed = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        const hannCoeff = 0.5 * (1 - Math.cos(2 * Math.PI * i / (fftSize - 1)));
        windowed[i] = channelData[winStart + i] * hannCoeff;
      }

      const spectrum = computeFFTMagnitude(windowed);

      for (let bin = 1; bin < spectrum.length; bin++) {
        const freq = bin * sampleRate / fftSize;
        if (freq < 65 || freq > 2100) continue;
        const noteNum = 12 * Math.log2(freq / 440) + 69;
        const chromaIdx = Math.round(noteNum) % 12;
        if (chromaIdx >= 0 && chromaIdx < 12) chromaAccum[chromaIdx] += spectrum[bin] * spectrum[bin];
      }
    }
  }

  const maxChroma = Math.max(...chromaAccum);
  if (maxChroma === 0) return null;
  const chroma = new Float64Array(12);
  for (let i = 0; i < 12; i++) chroma[i] = chromaAccum[i] / maxChroma;

  const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const minorProfile = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  const majorProfileT = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
  const minorProfileT = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

  let bestKey = 0, bestCorr = -Infinity, bestType = 'major';

  for (let shift = 0; shift < 12; shift++) {
    const rotatedMajor = rotateArray(majorProfile, shift);
    const rotatedMinor = rotateArray(minorProfile, shift);
    const rotatedMajorT = rotateArray(majorProfileT, shift);
    const rotatedMinorT = rotateArray(minorProfileT, shift);

    const majCorr = (pearsonCorrelation(chroma, rotatedMajor) + pearsonCorrelation(chroma, rotatedMajorT)) / 2;
    const minCorr = (pearsonCorrelation(chroma, rotatedMinor) + pearsonCorrelation(chroma, rotatedMinorT)) / 2;

    if (majCorr > bestCorr) { bestCorr = majCorr; bestKey = shift; bestType = 'major'; }
    if (minCorr > bestCorr) { bestCorr = minCorr; bestKey = shift; bestType = 'minor'; }
  }

  return {
    key: `${noteNames[bestKey]}${bestType === 'minor' ? 'm' : ''}`,
    type: bestType,
    confidence: Math.round(bestCorr * 100),
  };
}

function rotateArray(arr, shift) {
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) result[i] = arr[(i + shift) % arr.length];
  return result;
}

// radix-2 cooley-tukey fft, returns magnitude spectrum
function computeFFTMagnitude(signal) {
  const N = signal.length;
  const real = new Float64Array(N);
  const imag = new Float64Array(N);

  const bits = Math.log2(N);
  for (let i = 0; i < N; i++) {
    let rev = 0;
    for (let j = 0; j < bits; j++) rev = (rev << 1) | ((i >> j) & 1);
    real[rev] = signal[i];
  }

  for (let size = 2; size <= N; size *= 2) {
    const halfSize = size / 2;
    const angle = -2 * Math.PI / size;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);

    for (let i = 0; i < N; i += size) {
      let curReal = 1, curImag = 0;
      for (let j = 0; j < halfSize; j++) {
        const tReal = curReal * real[i + j + halfSize] - curImag * imag[i + j + halfSize];
        const tImag = curReal * imag[i + j + halfSize] + curImag * real[i + j + halfSize];
        real[i + j + halfSize] = real[i + j] - tReal;
        imag[i + j + halfSize] = imag[i + j] - tImag;
        real[i + j] += tReal;
        imag[i + j] += tImag;
        const newCurReal = curReal * wReal - curImag * wImag;
        curImag = curReal * wImag + curImag * wReal;
        curReal = newCurReal;
      }
    }
  }

  const mag = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  return mag;
}

function pearsonCorrelation(x, y) {
  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i]; sumY += y[i]; sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i]; sumY2 += y[i] * y[i];
  }
  const num = n * sumXY - sumX * sumY;
  const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return den === 0 ? 0 : num / den;
}

function drawWaveform(audioBuffer) {
  const canvas = $('#waveform-canvas');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const data = audioBuffer.getChannelData(0);
  const step = Math.ceil(data.length / width);
  const amp = height / 2;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ad83ee';

  ctx.clearRect(0, 0, width, height);

  ctx.beginPath();
  ctx.strokeStyle = accent + '20';
  ctx.moveTo(0, amp);
  ctx.lineTo(width, amp);
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;

  for (let i = 0; i < width; i++) {
    let min = 1.0, max = -1.0;
    for (let j = 0; j < step; j++) {
      const idx = (i * step) + j;
      if (idx < data.length) {
        if (data[idx] < min) min = data[idx];
        if (data[idx] > max) max = data[idx];
      }
    }
    ctx.moveTo(i, (1 + min) * amp);
    ctx.lineTo(i, (1 + max) * amp);
  }

  ctx.stroke();
}

async function setupStems() {
  const hasDemucs = await window.api.checkDemucs();
  const statusEl = $('#demucs-status');

  if (hasDemucs) {
    statusEl.className = 'stems-notice available';
    statusEl.textContent = 'demucs detected, AI stem separation ready';
  } else {
    statusEl.className = 'stems-notice unavailable';
    statusEl.innerHTML = `demucs not found, using basic ffmpeg isolation<br>
      <span style="font-size:10px;opacity:0.7;">
        to get AI separation, install python then run:<br>
        <code style="color:var(--accent);user-select:all;">pip install demucs</code>
      </span>`;
  }

  $('#btn-pick-stems').addEventListener('click', async () => {
    const file = await window.api.pickFile();
    if (file) { $('#stems-file').value = file; $('#btn-separate').disabled = false; }
  });

  $('#btn-pick-stems-out').addEventListener('click', async () => {
    const folder = await window.api.pickFolder();
    if (folder) $('#stems-output').value = folder;
  });

  $('#btn-separate').addEventListener('click', runStemSeparation);
  $('#btn-cancel-stems').addEventListener('click', () => window.api.cancelStems());

  window.api.onStemsProgress((data) => {
    $('#stems-progress-bar').style.width = `${data.progress}%`;
    if (data.status === 'processing') $('#stems-status-text').textContent = `Separating... ${data.progress}%`;
    else if (data.status === 'done') { $('#stems-status-text').textContent = 'Separation complete'; $('#stems-progress-bar').classList.add('done'); }
    else if (data.status === 'error') { $('#stems-status-text').textContent = 'Separation failed'; $('#stems-progress-bar').classList.add('error'); }
  });

  const stemsInput = $('#stems-file');
  stemsInput.closest('.input-group').addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  stemsInput.closest('.input-group').addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) { stemsInput.value = file.path; $('#btn-separate').disabled = false; }
  });
}

function sendToStems(filePath) {
  switchToTab('stems');
  $('#stems-file').value = filePath;
  $('#btn-separate').disabled = false;
}

async function runStemSeparation() {
  const inputFile = $('#stems-file').value;
  if (!inputFile) return;

  const stemsOutputDir = $('#stems-output').value || outputFolder;
  const model = $('#sel-stem-model').value;

  setStatus('busy', 'SEPARATING');
  $('#btn-separate').disabled = true;
  $('#btn-separate').innerHTML = '<span class="spinner"></span> SEPARATING...';
  $('#btn-cancel-stems').classList.remove('hidden');
  $('#stems-progress-section').classList.remove('hidden');
  $('#stems-output-section').classList.add('hidden');
  $('#stems-progress-bar').style.width = '0%';
  $('#stems-progress-bar').className = 'progress-fill';
  $('#stems-status-text').textContent = 'Preparing...';

  try {
    const result = await window.api.separateStems({ inputFile, outputDir: stemsOutputDir, model });

    const listEl = $('#stems-output-list');
    listEl.innerHTML = '';

    const stemIcons = { vocals: 'bi-mic-fill', no_vocals: 'bi-music-note-beamed', drums: 'bi-disc-fill', bass: 'bi-soundwave', other: 'bi-music-note' };
    const stemLabels = { vocals: 'Vocals', no_vocals: 'Instrumental', drums: 'Drums', bass: 'Bass', other: 'Other' };

    for (const [name, filePath] of Object.entries(result.stems)) {
      const stemEl = document.createElement('div');
      stemEl.className = 'stem-item';
      stemEl.innerHTML = `
        <span class="stem-icon"><i class="bi ${stemIcons[name] || 'bi-music-note'}"></i></span>
        <div class="stem-info">
          <div class="stem-name">${stemLabels[name] || name}</div>
          <div class="stem-path">${escapeHtml(filePath)}</div>
        </div>
        <div class="stem-actions">
          <button class="btn-small play-stem" data-path="${escapeHtml(filePath)}"><i class="bi bi-play-fill"></i> Play</button>
          <button class="btn-small show-stem" data-path="${escapeHtml(filePath)}"><i class="bi bi-folder2-open"></i></button>
        </div>
      `;
      listEl.appendChild(stemEl);
    }

    listEl.querySelectorAll('.play-stem').forEach(btn => btn.addEventListener('click', () => playFile(btn.dataset.path)));
    listEl.querySelectorAll('.show-stem').forEach(btn => btn.addEventListener('click', () => window.api.showInFolder(btn.dataset.path)));

    $('#stems-output-section').classList.remove('hidden');
    toast(result.fallback ? 'Separated using basic FFmpeg method (install demucs for better results)' : 'Stems separated successfully', 'success');
    setStatus('idle', 'IDLE');
  } catch (err) {
    toast(`Separation failed: ${err}`, 'error');
    setStatus('error', 'ERROR');
    setTimeout(() => setStatus('idle', 'IDLE'), 3000);
  } finally {
    $('#btn-separate').disabled = false;
    $('#btn-separate').innerHTML = '<i class="bi bi-scissors"></i> SEPARATE';
    $('#btn-cancel-stems').classList.add('hidden');
  }
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'v' && document.activeElement === $('#url-input')) {
      setTimeout(() => { if ($('#url-input').value.match(/^https?:\/\//)) fetchInfo(); }, 150);
    }
    if (e.ctrlKey && e.key === 'Enter' && !$('#btn-download').disabled) startDownload();
    if (e.ctrlKey && e.key >= '1' && e.key <= '7') {
      const tabs = ['grab', 'search', 'library', 'analyze', 'stems', 'queue', 'settings'];
      if (tabs[parseInt(e.key) - 1]) switchToTab(tabs[parseInt(e.key) - 1]);
    }
    if (e.key === ' ' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      e.preventDefault();
      if (currentlyPlaying) togglePlayback();
    }
  });
}

function setStatus(type, text) {
  const dot = $('.status-dot');
  dot.className = 'status-dot' + (type !== 'idle' ? ` ${type}` : '');
  $('.status-text').textContent = text;
}

function formatTimestamp(sec) {
  if (!sec || sec <= 0) return '0:00';
  return `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
}

function parseTimestamp(str) {
  if (!str) return 0;
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parseFloat(str) || 0;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

init();
