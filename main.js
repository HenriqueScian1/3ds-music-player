const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

// Fixa a pasta de configuracao para ser a mesma no modo dev e no app instalado
// (senao o app empacotado usaria outra pasta e nao acharia a config das ferramentas).
app.setPath('userData', path.join(app.getPath('appData'), 'local-music-player-3ds'));

// Extensoes de audio suportadas
const AUDIO_EXT = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.wav', '.wma']);

const configPath = () => path.join(app.getPath('userData'), 'config.json');

function readConfig() {
  try {
    // remove BOM se existir, senao JSON.parse falha
    const raw = fs.readFileSync(configPath(), 'utf8').replace(/^﻿/, '');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error('Nao foi possivel salvar config:', e);
  }
}

// Protocolo customizado para servir arquivos de audio locais (com suporte a seek/range).
// Precisa ser registrado ANTES do app ficar pronto.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true }
  }
]);

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 800,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: '#cdeaf6',
    title: '3DS Music Player',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    try {
      const u = new URL(request.url);
      const p = u.searchParams.get('p');
      if (!p) return new Response('missing path', { status: 400 });
      return net.fetch(pathToFileURL(p).toString());
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// music-metadata e ESM puro; carregamos via import dinamico dentro do CommonJS.
let mmPromise = null;
function getMM() {
  if (!mmPromise) mmPromise = import('music-metadata');
  return mmPromise;
}

async function walk(dir, out, depth = 0) {
  if (depth > 12) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('.')) continue;
      await walk(full, out, depth + 1);
    } else if (AUDIO_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(full);
    }
  }
}

// Pasta de musicas padrao: uma subpasta "music" dentro da propria pasta do app.
// Em dev = <raiz do projeto>/music ; empacotado = <pasta do .exe>/music.
function defaultMusicDir() {
  const base = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath();
  return path.join(base, 'music');
}

ipcMain.handle('default-folder', () => {
  const d = defaultMusicDir();
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
});

ipcMain.handle('get-config', () => readConfig());

ipcMain.handle('save-config', (e, cfg) => {
  const cur = readConfig();
  const merged = { ...cur, ...cfg };
  writeConfig(merged);
  return merged;
});

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (res.canceled || !res.filePaths.length) return null;
  const folder = res.filePaths[0];
  const cur = readConfig();
  writeConfig({ ...cur, folder });
  return folder;
});

ipcMain.handle('scan-folder', async (event, dir) => {
  const files = [];
  await walk(dir, files);
  const mm = await getMM();
  let id = 0;
  for (const file of files) {
    let common = {};
    let format = {};
    try {
      const md = await mm.parseFile(file, { duration: true });
      common = md.common || {};
      format = md.format || {};
    } catch {
      // arquivo ilegivel: seguimos com os dados que temos
    }
    let cover = null;
    const pic = common.picture && common.picture[0];
    if (pic && pic.data) {
      try {
        const b64 = Buffer.from(pic.data).toString('base64');
        cover = `data:${pic.format || 'image/jpeg'};base64,${b64}`;
      } catch {}
    }
    const track = {
      id: id++,
      path: file,
      mediaUrl: 'media://audio/?p=' + encodeURIComponent(file),
      title: common.title || path.basename(file, path.extname(file)),
      artist: common.artist || 'Artista desconhecido',
      album: common.album || '',
      genre: (common.genre && common.genre[0]) || '',
      trackNo: (common.track && common.track.no) || null,
      duration: format.duration || 0,
      cover
    };
    if (mainWindow && !mainWindow.isDestroyed() && !event.sender.isDestroyed()) {
      event.sender.send('track-found', track);
    }
  }
  return files.length;
});

// ============================================================
//  DOWNLOAD (YouTube via yt-dlp, Spotify via spotDL)
// ============================================================

const exists = (p) => {
  try { return !!p && fs.existsSync(p); } catch { return false; }
};

// Procura um executavel nas pastas do PATH (yt-dlp/spotdl/ffmpeg).
function whichTool(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      if (exists(full)) return full;
    }
  }
  return null;
}

// Resolve as ferramentas: primeiro o que estiver salvo na config, senao busca no PATH.
// Assim funciona em qualquer maquina onde o usuario instalou yt-dlp/spotDL/ffmpeg.
function detectTools() {
  const t = (readConfig().tools) || {};
  const ytdlp = exists(t.ytdlp) ? t.ytdlp : whichTool('yt-dlp');
  const spotdl = exists(t.spotdl) ? t.spotdl : whichTool('spotdl');
  const ffmpeg = exists(t.ffmpeg) ? t.ffmpeg : whichTool('ffmpeg');
  const ffmpegDir = exists(t.ffmpegDir) ? t.ffmpegDir : (ffmpeg ? path.dirname(ffmpeg) : null);
  const scriptsDir = exists(t.scriptsDir) ? t.scriptsDir
    : (ytdlp ? path.dirname(ytdlp) : (spotdl ? path.dirname(spotdl) : null));
  return { ytdlp, spotdl, ffmpeg, ffmpegDir, scriptsDir };
}

// Retorna a disponibilidade das ferramentas (para a interface).
ipcMain.handle('get-tools', () => detectTools());

function classify(link) {
  return /open\.spotify\.com|spotify:/i.test(link) ? 'spotify' : 'youtube';
}

function buildEnv(tools) {
  const extra = [];
  if (tools.ffmpegDir) extra.push(tools.ffmpegDir);
  if (tools.scriptsDir) extra.push(tools.scriptsDir);
  const cur = process.env.PATH || process.env.Path || '';
  return { ...process.env, PATH: extra.concat(cur).join(path.delimiter) };
}

function runOne(kind, link, quality, folder, tools, env, onLine) {
  return new Promise((resolve) => {
    let cmd, args;
    const q = String(quality || '320').replace(/\D/g, '') || '320';

    if (kind === 'spotify') {
      cmd = exists(tools.spotdl) ? tools.spotdl : 'spotdl';
      args = [
        'download', link,
        '--format', 'mp3',
        '--bitrate', q + 'k',
        '--output', path.join(folder, '{artist} - {title}.{output-ext}')
      ];
      if (exists(tools.ffmpeg)) args.push('--ffmpeg', tools.ffmpeg);
    } else {
      cmd = exists(tools.ytdlp) ? tools.ytdlp : 'yt-dlp';
      const isPlaylist = /[?&]list=/.test(link) || /\/playlist/i.test(link);
      args = [
        '-x', '--audio-format', 'mp3', '--audio-quality', q + 'K',
        '--embed-thumbnail', '--embed-metadata', '--add-metadata',
        '--windows-filenames', '--newline', '--no-part',
        '-o', path.join(folder, '%(title)s.%(ext)s'),
        link
      ];
      if (!isPlaylist) args.push('--no-playlist');
      if (tools.ffmpegDir) args.push('--ffmpeg-location', tools.ffmpegDir);
    }

    let child;
    try {
      child = spawn(cmd, args, { cwd: folder, env, windowsHide: true });
    } catch (e) {
      onLine('ERRO ao iniciar ' + cmd + ': ' + e.message);
      return resolve(false);
    }
    const feed = (buf) => buf.toString().split(/\r?\n/).forEach((l) => { const s = l.trim(); if (s) onLine(s); });
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', (e) => { onLine('ERRO: ' + e.message); resolve(false); });
    child.on('close', (code) => resolve(code === 0));
  });
}

ipcMain.handle('download', async (event, payload) => {
  const { links, quality, folder } = payload || {};
  if (!folder) return { ok: false, error: 'Pasta de destino nao definida.' };
  const tools = detectTools();
  const env = buildEnv(tools);
  const send = (type, data) => {
    if (mainWindow && !mainWindow.isDestroyed() && !event.sender.isDestroyed()) {
      event.sender.send('dl-log', { type, ...data });
    }
  };

  const list = (links || []).map((s) => s.trim()).filter(Boolean);
  let okCount = 0;
  for (let i = 0; i < list.length; i++) {
    const link = list[i];
    const kind = classify(link);
    send('start', { index: i, total: list.length, link, kind });
    const ok = await runOne(kind, link, quality, folder, tools, env,
      (line) => send('line', { index: i, line }));
    if (ok) okCount++;
    send('itemdone', { index: i, link, ok });
  }
  send('alldone', { okCount, total: list.length });
  return { ok: true, okCount, total: list.length };
});
