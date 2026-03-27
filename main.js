const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('path');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

if (process.platform === 'win32') app.setAppUserModelId('cat.dord.vulpidl');

let mainWindow;
let activeDownloads = new Map();

function vendorPath(bin) {
  const devPath = path.join(__dirname, 'vendor', bin);
  const prodPath = path.join(process.resourcesPath, 'vendor', bin);
  if (fs.existsSync(prodPath)) return prodPath;
  if (fs.existsSync(devPath)) return devPath;
  return bin;
}

const YTDLP = vendorPath(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const FFMPEG = vendorPath(process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const FFPROBE = vendorPath(process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');

const logDir = path.join(app.getPath('userData'), 'logs');

function ensureLogDir() {
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(logDir, `vulpidl-${date}.log`);
}

function log(level, context, message, data) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level.toUpperCase()}] [${context}] ${message}${data ? ' | ' + JSON.stringify(data) : ''}\n`;
  try {
    fs.appendFileSync(getLogPath(), line);
  } catch (e) {}
  if (level === 'error') console.error(`[${context}]`, message, data || '');
}

function logInfo(context, msg, data) { log('info', context, msg, data); }
function logError(context, msg, data) { log('error', context, msg, data); }
function logWarn(context, msg, data) { log('warn', context, msg, data); }

ipcMain.handle('get-log-path', () => getLogPath());
ipcMain.handle('get-log-dir', () => logDir);
ipcMain.handle('open-log-dir', () => {
  ensureLogDir();
  shell.openPath(logDir);
});

process.on('uncaughtException', (err) => {
  logError('process', `Uncaught exception: ${err.message}`, { stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logError('process', `Unhandled rejection: ${reason}`, { stack: reason?.stack });
});

const PROTOCOL = 'vulpidl';

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

function handleProtocolUrl(rawUrl) {
  if (!rawUrl || !rawUrl.startsWith(PROTOCOL + '://')) return;
  const target = rawUrl.replace(PROTOCOL + '://', '').replace(/\/$/, '');
  if (!target) return;
  const url = target.startsWith('http') ? target : 'https://' + target;
  logInfo('protocol', `Received protocol URL: ${url}`);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('protocol-url', url);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const protocolArg = argv.find(a => a.startsWith(PROTOCOL + '://'));
    if (protocolArg) handleProtocolUrl(protocolArg);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0d0a12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: nativeImage.createFromPath(path.join(__dirname, 'icon.png')),
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);
  logInfo('app', 'Window created', { version: app.getVersion() });

  const launchUrl = process.argv.find(a => a.startsWith(PROTOCOL + '://'));
  if (launchUrl) {
    mainWindow.webContents.once('did-finish-load', () => handleProtocolUrl(launchUrl));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('open-url', (_e, url) => handleProtocolUrl(url));

ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-folder', async (_e, folderPath) => {
  if (folderPath && fs.existsSync(folderPath)) shell.openPath(folderPath);
});

ipcMain.handle('fetch-info', async (_e, url) => {
  logInfo('fetch', `Fetching info for: ${url}`);
  return new Promise((resolve, reject) => {
    execFile(YTDLP, [
      '--dump-json', '--no-playlist', '--no-download', url,
    ], { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        logError('fetch', `Failed to fetch info for ${url}`, { stderr, error: err.message });
        return reject(stderr || err.message);
      }
      try {
        const info = JSON.parse(stdout);
        logInfo('fetch', `Fetched: ${info.title}`);
        resolve({
          title: info.title || 'Unknown',
          duration: info.duration || 0,
          thumbnail: info.thumbnail || '',
          uploader: info.uploader || 'Unknown',
          id: info.id || '',
          webpage_url: info.webpage_url || url,
        });
      } catch (e) {
        logError('fetch', 'Failed to parse video info', { stdout: stdout.slice(0, 200) });
        reject('Failed to parse video info');
      }
    });
  });
});

ipcMain.handle('search-yt', async (_e, query, count = 10) => {
  logInfo('search', `Searching: "${query}" (count=${count})`);
  return new Promise((resolve, reject) => {
    execFile(YTDLP, [
      `ytsearch${count}:${query}`, '--dump-json', '--no-download', '--flat-playlist',
    ], { timeout: 30000, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        logError('search', `Search failed for "${query}"`, { stderr, error: err.message });
        return reject(stderr || err.message);
      }
      try {
        const results = stdout.trim().split('\n')
          .filter(line => line.trim())
          .map(line => {
            const info = JSON.parse(line);
            return {
              title: info.title || 'Unknown',
              duration: info.duration || 0,
              url: info.url || info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
              uploader: info.uploader || info.channel || 'Unknown',
              id: info.id || '',
              thumbnail: info.thumbnails?.[0]?.url || '',
            };
          });
        logInfo('search', `Found ${results.length} results for "${query}"`);
        resolve(results);
      } catch (e) {
        logError('search', 'Failed to parse search results', { error: e.message });
        reject('Failed to parse search results');
      }
    });
  });
});

ipcMain.handle('download', async (_e, opts) => {
  const { url, outputDir, format, quality, sampleRate, channels, startTime, endTime, filename } = opts;
  const downloadId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  logInfo('download', `Starting download`, { url, format, outputDir, downloadId });

  return new Promise((resolve, reject) => {
    const args = [url, '-x', '--audio-format', format, '--no-playlist', '--newline', '--ffmpeg-location', path.dirname(FFMPEG)];

    if (quality && format === 'mp3') args.push('--audio-quality', quality);

    const ffmpegArgs = [];
    if (startTime) ffmpegArgs.push('-ss', startTime);
    if (endTime) ffmpegArgs.push('-to', endTime);
    if (sampleRate) ffmpegArgs.push('-ar', sampleRate.toString());
    if (channels) ffmpegArgs.push('-ac', channels.toString());
    if (ffmpegArgs.length > 0) args.push('--postprocessor-args', `ffmpeg:${ffmpegArgs.join(' ')}`);

    const safeName = filename ? filename.replace(/[<>:"/\\|?*]/g, '_') : '%(title)s.%(ext)s';
    args.push('-o', path.join(outputDir, safeName));
    logInfo('download', `yt-dlp args`, { args });

    const proc = spawn(YTDLP, args);
    activeDownloads.set(downloadId, proc);

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const dlMatch = trimmed.match(/\[download\]\s+([\d.]+)%/);
        if (dlMatch) {
          mainWindow?.webContents.send('download-progress', { id: downloadId, progress: parseFloat(dlMatch[1]), status: 'downloading' });
          continue;
        }
        if (trimmed.includes('[ExtractAudio]') || trimmed.includes('[ffmpeg]') || trimmed.includes('Post-process')) {
          mainWindow?.webContents.send('download-progress', { id: downloadId, progress: 100, status: 'processing' });
          continue;
        }
        const destMatch = trimmed.match(/\[(?:ExtractAudio|ffmpeg)\].*Destination:\s*(.+)/);
        if (destMatch) {
          mainWindow?.webContents.send('download-progress', { id: downloadId, progress: 100, status: 'processing', file: destMatch[1] });
        }
      }
    });

    proc.stderr.on('data', (data) => logWarn('download', `yt-dlp stderr: ${data.toString().trim()}`));

    proc.on('close', (code) => {
      activeDownloads.delete(downloadId);
      if (code === 0) {
        logInfo('download', `Download complete`, { downloadId });
        mainWindow?.webContents.send('download-progress', { id: downloadId, progress: 100, status: 'done' });
        resolve({ id: downloadId, success: true });
      } else {
        logError('download', `yt-dlp exited with code ${code}`, { downloadId });
        mainWindow?.webContents.send('download-progress', { id: downloadId, progress: 0, status: 'error' });
        reject(`yt-dlp exited with code ${code}`);
      }
    });

    proc.on('error', (err) => {
      activeDownloads.delete(downloadId);
      logError('download', `yt-dlp spawn error`, { error: err.message });
      reject(err.message);
    });

    mainWindow?.webContents.send('download-started', { id: downloadId });
  });
});

ipcMain.handle('cancel-download', async (_e, downloadId) => {
  const proc = activeDownloads.get(downloadId);
  if (proc) {
    proc.kill('SIGTERM');
    activeDownloads.delete(downloadId);
    logInfo('download', `Download cancelled`, { downloadId });
    return true;
  }
  return false;
});

ipcMain.handle('get-default-folder', () => {
  const samples = path.join(app.getPath('music'), 'VulpiDL');
  if (!fs.existsSync(samples)) fs.mkdirSync(samples, { recursive: true });
  return samples;
});

ipcMain.handle('show-in-folder', async (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
});

ipcMain.handle('pick-file', async (_e, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [{ name: 'Audio', extensions: ['wav', 'mp3', 'flac', 'aiff', 'ogg', 'm4a', 'aac', 'wma'] }],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('scan-library', async (_e, folderPath) => {
  const audioExts = new Set(['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg', '.m4a', '.aac', '.wma']);
  const files = [];

  function scanDir(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (audioExts.has(path.extname(entry.name).toLowerCase())) {
          const stat = fs.statSync(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            relativePath: path.relative(folderPath, fullPath),
            size: stat.size,
            modified: stat.mtimeMs,
            ext: path.extname(entry.name).toLowerCase().slice(1),
          });
        }
      }
    } catch (e) {
      logWarn('library', `Skipped inaccessible dir: ${dir}`, { error: e.message });
    }
  }

  scanDir(folderPath);
  files.sort((a, b) => b.modified - a.modified);
  logInfo('library', `Scanned ${files.length} audio files in ${folderPath}`);
  return files;
});

ipcMain.handle('probe-audio', async (_e, filePath) => {
  return new Promise((resolve, reject) => {
    execFile(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath,
    ], { timeout: 10000 }, (err, stdout) => {
      if (err) {
        logError('probe', `ffprobe failed for ${filePath}`, { error: err.message });
        return reject(err.message);
      }
      try {
        const info = JSON.parse(stdout);
        const audioStream = info.streams?.find(s => s.codec_type === 'audio') || {};
        resolve({
          duration: parseFloat(info.format?.duration || 0),
          sampleRate: parseInt(audioStream.sample_rate || 0),
          channels: parseInt(audioStream.channels || 0),
          bitRate: parseInt(info.format?.bit_rate || 0),
          codec: audioStream.codec_name || 'unknown',
        });
      } catch (e) {
        logError('probe', 'Failed to parse ffprobe output', { error: e.message });
        reject('Failed to probe audio');
      }
    });
  });
});

ipcMain.handle('delete-file', async (_e, filePath) => {
  try {
    fs.unlinkSync(filePath);
    logInfo('library', `Deleted file: ${filePath}`);
    return true;
  } catch (e) {
    logError('library', `Failed to delete file: ${filePath}`, { error: e.message });
    return false;
  }
});

let activeStemProcess = null;

ipcMain.handle('separate-stems', async (_e, opts) => {
  const { inputFile, outputDir, model } = opts;
  const demucsModel = model || 'htdemucs';
  logInfo('stems', `Starting stem separation`, { inputFile, outputDir, model: demucsModel });

  return new Promise((resolve, reject) => {
    // python -m demucs avoids shell quoting issues with paths on windows
    const args = [
      '-m', 'demucs',
      '-n', demucsModel,
      '-o', outputDir,
      '--two-stems', 'vocals',
      '--mp3', '--mp3-bitrate', '320',
      inputFile,
    ];

    logInfo('stems', `demucs args`, { args });

    const proc = spawn('python', args);
    activeStemProcess = proc;

    let stderrData = '';
    let stdoutData = '';
    const startTime = Date.now();

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      const pctMatch = text.match(/(\d+)%/);
      if (pctMatch) {
        mainWindow?.webContents.send('stems-progress', { progress: parseInt(pctMatch[1]), status: 'processing' });
      }
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdoutData += text;
      const pctMatch = text.match(/(\d+)%/);
      if (pctMatch) {
        mainWindow?.webContents.send('stems-progress', { progress: parseInt(pctMatch[1]), status: 'processing' });
      }
    });

    proc.on('close', (code) => {
      activeStemProcess = null;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logInfo('stems', `demucs exited`, { code, elapsed: elapsed + 's', stderr: stderrData.slice(-500) });

      if (code !== 0) {
        const isTorchCodecErr = stderrData.includes('torchcodec') || stdoutData.includes('torchcodec');
        const errMsg = isTorchCodecErr
          ? 'Demucs audio save failed (torchcodec issue). Try reinstalling: pip install --force-reinstall torchcodec'
          : `Demucs exited with code ${code}`;
        logError('stems', errMsg, { stderr: stderrData.slice(-1000), stdout: stdoutData.slice(-500) });
        mainWindow?.webContents.send('stems-progress', { progress: 0, status: 'error' });
        reject(`${errMsg}: ${stderrData.slice(-500)}`);
        return;
      }

      const trackName = path.basename(inputFile, path.extname(inputFile));
      const stemDir = path.join(outputDir, demucsModel, trackName);
      const stems = {};

      let actualStemDir = stemDir;
      if (!fs.existsSync(stemDir)) {
        const modelDir = path.join(outputDir, demucsModel);
        logWarn('stems', `Expected dir not found: ${stemDir}, searching ${modelDir}`);
        try {
          const dirs = fs.readdirSync(modelDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => path.join(modelDir, d.name));
          const sorted = dirs
            .map(d => ({ path: d, mtime: fs.statSync(d).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          if (sorted.length > 0) actualStemDir = sorted[0].path;
        } catch (e) {
          logWarn('stems', `Could not search model dir: ${modelDir}`, { error: e.message });
        }
      }

      try {
        const stemFiles = fs.readdirSync(actualStemDir);
        for (const f of stemFiles) {
          const ext = path.extname(f);
          if (['.mp3', '.wav', '.flac', '.ogg'].includes(ext.toLowerCase())) {
            const name = path.basename(f, ext);
            stems[name] = path.join(actualStemDir, f);
          }
        }
      } catch (e) {
        logWarn('stems', `Could not read stem output dir: ${actualStemDir}`, { error: e.message });
      }

      if (Object.keys(stems).length === 0) {
        logError('stems', `demucs produced no output files`, { elapsed: elapsed + 's', stderr: stderrData.slice(-1000) });
        mainWindow?.webContents.send('stems-progress', { progress: 0, status: 'error' });
        reject(`Demucs produced no output (ran for ${elapsed}s). Check logs for details.`);
        return;
      }

      logInfo('stems', `Separation complete`, { stems, outputDir: actualStemDir });
      mainWindow?.webContents.send('stems-progress', { progress: 100, status: 'done' });
      resolve({ success: true, stems, outputDir: actualStemDir });
    });

    proc.on('error', (err) => {
      activeStemProcess = null;
      logError('stems', `demucs spawn error`, { error: err.message, code: err.code });
      if (err.code === 'ENOENT') {
        logInfo('stems', 'Falling back to FFmpeg center-channel isolation');
        ffmpegStemFallback(inputFile, outputDir).then(resolve).catch(reject);
      } else {
        reject(err.message);
      }
    });
  });
});

async function ffmpegStemFallback(inputFile, outputDir) {
  const trackName = path.basename(inputFile, path.extname(inputFile));
  const instrumentalOut = path.join(outputDir, `${trackName}_instrumental.wav`);
  const vocalsOut = path.join(outputDir, `${trackName}_vocals.wav`);

  await new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-y', '-i', inputFile, '-af', 'pan=stereo|c0=c0-c1|c1=c1-c0', instrumentalOut]);
    proc.on('close', (code) => code === 0 ? resolve() : reject('FFmpeg instrumental extraction failed'));
    proc.on('error', (err) => {
      logError('stems', 'FFmpeg fallback error (instrumental)', { error: err.message });
      reject(err);
    });
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.match(/time=(\d{2}):(\d{2}):(\d{2})/)) {
        mainWindow?.webContents.send('stems-progress', { progress: 50, status: 'processing' });
      }
    });
  });

  await new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ['-y', '-i', inputFile, '-af', 'pan=mono|c0=c0+c1,aformat=channel_layouts=stereo', vocalsOut]);
    proc.on('close', (code) => code === 0 ? resolve() : reject('FFmpeg vocal extraction failed'));
    proc.on('error', (err) => {
      logError('stems', 'FFmpeg fallback error (vocals)', { error: err.message });
      reject(err);
    });
  });

  logInfo('stems', 'FFmpeg fallback separation complete', { instrumentalOut, vocalsOut });
  mainWindow?.webContents.send('stems-progress', { progress: 100, status: 'done' });
  return {
    success: true,
    stems: { vocals: vocalsOut, no_vocals: instrumentalOut },
    outputDir: outputDir,
    fallback: true,
  };
}

ipcMain.handle('cancel-stems', async () => {
  if (activeStemProcess) {
    activeStemProcess.kill('SIGTERM');
    activeStemProcess = null;
    logInfo('stems', 'Stem separation cancelled');
    return true;
  }
  return false;
});

ipcMain.handle('check-demucs', async () => {
  return new Promise((resolve) => {
    execFile('python', ['-m', 'demucs', '-h'], { timeout: 10000 }, (err) => {
      const available = !err;
      logInfo('stems', `demucs available: ${available}`);
      resolve(available);
    });
  });
});

ipcMain.handle('check-deps', async () => {
  const results = {};
  results.ytdlp = fs.existsSync(YTDLP) || await new Promise(r => execFile(YTDLP, ['--version'], { timeout: 5000 }, e => r(!e)));
  results.ffmpeg = fs.existsSync(FFMPEG) || await new Promise(r => execFile(FFMPEG, ['-version'], { timeout: 5000 }, e => r(!e)));
  results.ffprobe = fs.existsSync(FFPROBE) || await new Promise(r => execFile(FFPROBE, ['-version'], { timeout: 5000 }, e => r(!e)));
  results.python = await new Promise(r => execFile('python', ['--version'], { timeout: 5000 }, e => r(!e)));
  results.demucs = await new Promise(r => execFile('python', ['-m', 'demucs', '-h'], { timeout: 10000 }, e => r(!e)));
  logInfo('deps', 'Dependency check', results);
  return results;
});
