'use strict';

// ---------- Estado ----------
let allTracks = [];      // todas as musicas
let view = [];           // musicas apos filtro de busca (o que aparece na grade)
let selected = -1;       // indice na "view" com o cursor
let playing = -1;        // indice na "view" tocando agora (ou -1)
let playingId = null;    // id da faixa tocando (estavel entre buscas/ordenacoes)
let shuffle = false;
let repeat = 'off';      // 'off' | 'all' | 'one'
let sfxOn = true;
let currentFolder = null;
let downloading = false;
let queue = [];              // fila de reproducao (biblioteca filtrada OU uma playlist)
let selectedGenre = null;    // genero selecionado na barra (null = todos)
let playlists = [];          // [{ id, name, paths: [] }]
let genreOverrides = {};     // { caminhoDoArquivo: genero }
let activePlaylistId = null; // playlist aberta na aba Playlists

const audio = document.getElementById('audio');

// ---------- Atalhos DOM ----------
const $ = (id) => document.getElementById(id);
const grid = $('grid');
const emptyEl = $('empty');
const npCover = $('npCover');
const npTitle = $('npTitle');
const npArtist = $('npArtist');
const npAlbum = $('npAlbum');
const progress = $('progress');
const progressFill = $('progressFill');
const progressKnob = $('progressKnob');
const curTime = $('curTime');
const durTime = $('durTime');
const playBtn = $('playBtn');
const shuffleBtn = $('shuffleBtn');
const repeatBtn = $('repeatBtn');
const searchInput = $('search');
const statusEl = $('status');
const folderPathEl = $('folderPath');

// ---------- Efeitos sonoros (WebAudio, sem arquivos) ----------
let audioCtx = null;
function blip(freq = 660, dur = 0.06, type = 'sine', gain = 0.05) {
  if (!sfxOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.start(now);
    osc.stop(now + dur);
  } catch {}
}
const sfxMove = () => blip(720, 0.05, 'sine', 0.04);
const sfxSelect = () => blip(520, 0.09, 'triangle', 0.06);

// ---------- Utilidades ----------
function fmtTime(s) {
  if (!s || !isFinite(s)) return '0:00';
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const sec = String(s % 60).padStart(2, '0');
  return `${m}:${sec}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Relogio (barra superior) ----------
function updateClock() {
  const now = new Date();
  $('clock').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  $('date').textContent = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
updateClock();
setInterval(updateClock, 1000 * 15);
setInterval(updateClock, 1000); // segundos tambem, barato

// ---------- Generos ----------
function genreOf(t) {
  return (genreOverrides[t.path] || t.genre || '').trim();
}

function renderGenreBar() {
  const bar = $('genreBar');
  if (!bar) return;
  const set = new Map(); // genero -> contagem
  let semGenero = 0;
  allTracks.forEach((t) => {
    const g = genreOf(t);
    if (g) set.set(g, (set.get(g) || 0) + 1);
    else semGenero++;
  });
  const genres = [...set.keys()].sort((a, b) => a.localeCompare(b));
  // se o genero filtrado sumiu, volta para "Todos"
  if (selectedGenre && selectedGenre !== '__none__' && !set.has(selectedGenre)) selectedGenre = null;
  if (selectedGenre === '__none__' && !semGenero) selectedGenre = null;
  bar.innerHTML = '';
  if (!allTracks.length) return;

  const mk = (label, value) => {
    const c = document.createElement('button');
    c.className = 'chip' + (selectedGenre === value ? ' active' : '');
    c.textContent = label;
    c.addEventListener('click', () => {
      selectedGenre = (selectedGenre === value) ? null : value;
      renderGenreBar();
      applyFilter();
      sfxMove();
    });
    bar.appendChild(c);
  };
  mk('Todos', null);
  genres.forEach((g) => mk(g, g));
  if (semGenero) mk('Sem gênero', '__none__');
}

// ---------- Grade ----------
function applyFilter() {
  const q = searchInput.value.trim().toLowerCase();
  view = allTracks.filter((t) => {
    const okSearch = !q || (t.title + ' ' + t.artist + ' ' + t.album).toLowerCase().includes(q);
    let okGenre = true;
    if (selectedGenre === '__none__') okGenre = !genreOf(t);
    else if (selectedGenre) okGenre = genreOf(t) === selectedGenre;
    return okSearch && okGenre;
  });
  // mantem selecao razoavel
  if (selected >= view.length) selected = view.length - 1;
  renderGrid();
}

function renderGrid() {
  emptyEl.style.display = allTracks.length ? 'none' : 'flex';
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  view.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    if (i === selected) card.classList.add('selected');
    if (playingId !== null && t.id === playingId) card.classList.add('playing');

    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (t.cover) {
      thumb.style.backgroundImage = `url("${t.cover}")`;
      thumb.textContent = '';
    } else {
      thumb.textContent = '♪';
    }
    const eq = document.createElement('div');
    eq.className = 'eq';
    eq.innerHTML = '<i></i><i></i><i></i>';
    thumb.appendChild(eq);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = t.title;

    card.appendChild(thumb);
    card.appendChild(label);

    card.addEventListener('click', () => {
      selectIndex(i, false);
      sfxSelect();
    });
    card.addEventListener('dblclick', () => playFromList(view, i));
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      selectIndex(i, false);
      openCardMenu(e.clientX, e.clientY, view[i]);
    });

    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

function cards() {
  return grid.querySelectorAll('.card');
}

function selectIndex(i, playAlso) {
  if (i < 0 || i >= view.length) return;
  selected = i;
  const list = cards();
  list.forEach((c) => c.classList.remove('selected'));
  const el = list[i];
  if (el) {
    el.classList.add('selected');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    updatePreview(view[i]);
  }
  if (playAlso) playFromList(view, i);
}

// Numero de colunas atual (para navegar com setas cima/baixo)
function getColumns() {
  const list = cards();
  if (!list.length) return 1;
  const firstTop = list[0].offsetTop;
  let cols = 0;
  for (const c of list) {
    if (c.offsetTop === firstTop) cols++;
    else break;
  }
  return Math.max(1, cols);
}

// ---------- Preview (tela de cima) ----------
function updatePreview(t) {
  if (!t) return;
  if (t.cover) {
    npCover.style.backgroundImage = `url("${t.cover}")`;
    npCover.classList.remove('placeholder');
    npCover.innerHTML = '';
  } else {
    npCover.style.backgroundImage = '';
    npCover.classList.add('placeholder');
    npCover.innerHTML = '<span>♫</span>';
  }
  npTitle.textContent = t.title;
  npArtist.textContent = t.artist;
  npAlbum.textContent = t.album || '';
}

// ---------- Reproducao (baseada em fila) ----------
// Define a fila de reproducao e toca o item i dessa fila.
function playFromList(list, i) {
  queue = list.slice();
  playAt(i);
}

function playAt(i) {
  if (i < 0 || i >= queue.length) return;
  playing = i;
  const t = queue[i];
  playingId = t.id;
  audio.src = t.mediaUrl;
  audio.play().catch((e) => { statusEl.textContent = 'Erro ao tocar: ' + e.message; });
  updatePreview(t);
  playBtn.innerHTML = '&#10074;&#10074;'; // pause
  // sincroniza cursor na biblioteca, se a faixa estiver visivel
  const vi = view.findIndex((x) => x.id === t.id);
  if (vi >= 0) selected = vi;
  renderGrid();
  renderPlaylistSongs();
  sfxSelect();
}

function togglePlay() {
  if (playingId === null || !audio.src) {
    if (view.length) playFromList(view, selected >= 0 ? selected : 0);
    return;
  }
  if (audio.paused) {
    audio.play();
    playBtn.innerHTML = '&#10074;&#10074;';
  } else {
    audio.pause();
    playBtn.innerHTML = '&#9654;';
  }
}

function currentPos() {
  // posicao da faixa tocando dentro da fila atual (-1 se nao estiver)
  return playingId === null ? -1 : queue.findIndex((t) => t.id === playingId);
}

function nextTrack(auto = false) {
  if (!queue.length) return;
  if (repeat === 'one' && auto) { audio.currentTime = 0; audio.play(); return; }
  const cur = currentPos();
  let n;
  if (shuffle) {
    if (queue.length === 1) n = 0;
    else { do { n = Math.floor(Math.random() * queue.length); } while (n === cur); }
  } else {
    n = cur + 1;
    if (n >= queue.length) {
      if (repeat === 'all' || !auto) n = 0;
      else { // fim da fila sem repeat
        audio.pause();
        playBtn.innerHTML = '&#9654;';
        return;
      }
    }
  }
  playAt(n);
}

function prevTrack() {
  if (!queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const cur = currentPos();
  let p = cur - 1;
  if (p < 0) p = queue.length - 1;
  playAt(p);
}

// ---------- Eventos de audio ----------
audio.addEventListener('timeupdate', () => {
  const d = audio.duration || 0;
  const pct = d ? (audio.currentTime / d) * 100 : 0;
  progressFill.style.width = pct + '%';
  progressKnob.style.left = pct + '%';
  curTime.textContent = fmtTime(audio.currentTime);
  durTime.textContent = fmtTime(d);
});
audio.addEventListener('ended', () => nextTrack(true));
audio.addEventListener('play', () => { playBtn.innerHTML = '&#10074;&#10074;'; });
audio.addEventListener('pause', () => { playBtn.innerHTML = '&#9654;'; });

// Seek clicando na barra
progress.addEventListener('click', (e) => {
  const rect = progress.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  if (audio.duration) audio.currentTime = ratio * audio.duration;
});

// ---------- Controles ----------
playBtn.addEventListener('click', togglePlay);
$('prevBtn').addEventListener('click', prevTrack);
$('nextBtn').addEventListener('click', () => nextTrack(false));
shuffleBtn.addEventListener('click', () => {
  shuffle = !shuffle;
  shuffleBtn.classList.toggle('active', shuffle);
  save();
  sfxSelect();
});
repeatBtn.addEventListener('click', () => {
  repeat = repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off';
  repeatBtn.classList.toggle('active', repeat !== 'off');
  repeatBtn.textContent = repeat === 'one' ? '🔂' : '🔁';
  save();
  sfxSelect();
});

$('volume').addEventListener('input', (e) => {
  audio.volume = parseFloat(e.target.value);
  save();
});

$('sfxToggle').addEventListener('click', () => {
  sfxOn = !sfxOn;
  $('sfxToggle').textContent = 'Sons: ' + (sfxOn ? 'ON' : 'OFF');
  save();
});

// ---------- Teclado (navegacao estilo 3DS) ----------
window.addEventListener('keydown', (e) => {
  const ae = document.activeElement;
  const modalOpen = !$('modalOverlay').hidden;
  const typing = modalOpen || (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName));
  if (e.key === ' ' && !typing) { e.preventDefault(); togglePlay(); return; }
  if (typing && e.key !== 'Escape') return;
  if (e.key === 'Escape') { searchInput.blur(); return; }
  if (!view.length) return;

  const cols = getColumns();
  if (e.key === 'ArrowRight') { e.preventDefault(); if (selected < view.length - 1) { selectIndex(selected + 1); sfxMove(); } }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); if (selected > 0) { selectIndex(selected - 1); sfxMove(); } }
  else if (e.key === 'ArrowDown') { e.preventDefault(); const n = Math.min(view.length - 1, selected + cols); if (n !== selected) { selectIndex(n); sfxMove(); } }
  else if (e.key === 'ArrowUp') { e.preventDefault(); const n = Math.max(0, selected - cols); if (n !== selected) { selectIndex(n); sfxMove(); } }
  else if (e.key === 'Enter') { e.preventDefault(); if (selected >= 0) playFromList(view, selected); }
});

// atalho: "/" foca a busca
window.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput) { e.preventDefault(); searchInput.focus(); }
});

searchInput.addEventListener('input', applyFilter);

// ---------- Pasta / scan ----------
async function chooseFolder() {
  const folder = await window.api.pickFolder();
  if (folder) await loadFolder(folder);
}
$('chooseFolder').addEventListener('click', chooseFolder);
$('emptyChoose').addEventListener('click', chooseFolder);

const reloadCurrent = () => { if (currentFolder) { loadFolder(currentFolder); sfxSelect(); } };
$('reloadFolder').addEventListener('click', reloadCurrent);
$('emptyReload').addEventListener('click', reloadCurrent);

async function loadFolder(folder) {
  allTracks = [];
  view = [];
  selected = -1;
  playing = -1;
  playingId = null;
  currentFolder = folder;
  updateDlFolder();
  renderGrid();
  folderPathEl.textContent = folder;
  statusEl.textContent = 'Lendo músicas...';
  emptyEl.style.display = 'none';
  let count = 0;
  try {
    const total = await window.api.scanFolder(folder);
    count = total;
  } catch (e) {
    statusEl.textContent = 'Erro ao ler pasta: ' + e.message;
    return;
  }
  // ordena por artista > album > nº da faixa > titulo
  allTracks.sort((a, b) =>
    a.artist.localeCompare(b.artist) ||
    a.album.localeCompare(b.album) ||
    ((a.trackNo || 0) - (b.trackNo || 0)) ||
    a.title.localeCompare(b.title));
  renderGenreBar();
  applyFilter();
  renderPlaylistList();
  if (activePlaylistId) openPlaylist(activePlaylistId);
  if (view.length) selectIndex(0, false);
  statusEl.textContent = `${allTracks.length} música(s)`;
}

// recebe faixas conforme sao lidas (streaming)
window.api.onTrackFound((track) => {
  allTracks.push(track);
  // atualiza a grade de forma incremental durante o scan
  if (!searchInput.value.trim()) {
    view = allTracks.slice();
    renderGrid();
  }
  statusEl.textContent = 'Lendo músicas... ' + allTracks.length;
});

// ---------- Config persistente ----------
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.saveConfig({
      volume: audio.volume,
      shuffle, repeat, sfx: sfxOn
    });
  }, 250);
}

async function init() {
  const cfg = await window.api.getConfig();
  if (typeof cfg.volume === 'number') { audio.volume = cfg.volume; $('volume').value = cfg.volume; }
  else audio.volume = 0.9;
  if (cfg.shuffle) { shuffle = true; shuffleBtn.classList.add('active'); }
  if (cfg.repeat && cfg.repeat !== 'off') {
    repeat = cfg.repeat;
    repeatBtn.classList.add('active');
    repeatBtn.textContent = repeat === 'one' ? '🔂' : '🔁';
  }
  if (cfg.sfx === false) { sfxOn = false; $('sfxToggle').textContent = 'Sons: OFF'; }
  if (Array.isArray(cfg.playlists)) playlists = cfg.playlists;
  if (cfg.genreOverrides && typeof cfg.genreOverrides === 'object') genreOverrides = cfg.genreOverrides;
  renderPlaylistList();
  // pasta padrao = subpasta "music" do proprio app (a menos que o usuario tenha escolhido outra)
  const folder = cfg.folder || await window.api.getDefaultFolder();
  currentFolder = folder;
  await loadFolder(folder);
  updateDlFolder();
  refreshTools();
}

// ============================================================
//  Abas
// ============================================================
const tabLib = $('tabLib');
const tabPl = $('tabPl');
const tabDl = $('tabDl');
const viewLib = $('viewLib');
const viewPl = $('viewPl');
const viewDl = $('viewDl');

function switchTab(which) {
  tabLib.classList.toggle('active', which === 'lib');
  tabPl.classList.toggle('active', which === 'pl');
  tabDl.classList.toggle('active', which === 'dl');
  viewLib.hidden = which !== 'lib';
  viewPl.hidden = which !== 'pl';
  viewDl.hidden = which !== 'dl';
  sfxSelect();
  if (which === 'dl') refreshTools();
  if (which === 'pl') {
    renderPlaylistList();
    if (!activePlaylistId && playlists.length) openPlaylist(playlists[0].id);
  }
}
tabLib.addEventListener('click', () => switchTab('lib'));
tabPl.addEventListener('click', () => switchTab('pl'));
tabDl.addEventListener('click', () => switchTab('dl'));

// ============================================================
//  Download
// ============================================================
const dlLinks = $('dlLinks');
const dlStart = $('dlStart');
const dlLog = $('dlLog');
const dlQuality = $('dlQuality');
const dlFolderEl = $('dlFolder');
const dlToolStatus = $('dlToolStatus');

function updateDlFolder() {
  dlFolderEl.textContent = currentFolder || '(nenhuma)';
}

async function refreshTools() {
  const t = await window.api.getTools();
  const missing = [];
  if (!t.ytdlp) missing.push('yt-dlp');
  if (!t.ffmpeg && !t.ffmpegDir) missing.push('ffmpeg');
  if (!t.spotdl) missing.push('spotDL (Spotify)');
  if (missing.length === 0) {
    dlToolStatus.textContent = '✓ Ferramentas prontas';
    dlToolStatus.className = 'dl-toolstatus ok';
  } else {
    dlToolStatus.textContent = '⚠ Faltando: ' + missing.join(', ');
    dlToolStatus.className = 'dl-toolstatus bad';
  }
  return t;
}

function logLine(text, cls) {
  const div = document.createElement('div');
  if (cls) div.className = cls;
  div.textContent = text;
  dlLog.appendChild(div);
  dlLog.scrollTop = dlLog.scrollHeight;
}

// eventos de progresso vindos do processo principal
window.api.onDlLog((msg) => {
  if (msg.type === 'start') {
    const tag = msg.kind === 'spotify' ? '[Spotify]' : '[YouTube]';
    logLine(`\n▶ (${msg.index + 1}/${msg.total}) ${tag} ${msg.link}`, 'dl-item');
  } else if (msg.type === 'line') {
    logLine(msg.line);
  } else if (msg.type === 'itemdone') {
    logLine(msg.ok ? '✓ Concluído' : '✗ Falhou (veja as mensagens acima)', msg.ok ? 'dl-ok' : 'dl-err');
  } else if (msg.type === 'alldone') {
    logLine(`\n=== Fim: ${msg.okCount}/${msg.total} baixada(s) com sucesso ===`, 'dl-ok');
  }
});

async function startDownload() {
  if (downloading) return;
  const raw = dlLinks.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) { logLine('Cole pelo menos um link.', 'dl-err'); return; }
  if (!currentFolder) {
    logLine('Escolha primeiro a pasta de destino (botão "Trocar pasta").', 'dl-err');
    return;
  }
  const tools = await refreshTools();
  const hasSpotify = raw.some((l) => /open\.spotify\.com|spotify:/i.test(l));
  if (!tools.ytdlp) { logLine('yt-dlp não encontrado. Reabra o app após a instalação das ferramentas.', 'dl-err'); return; }
  if (hasSpotify && !tools.spotdl) { logLine('spotDL não encontrado (necessário para links do Spotify).', 'dl-err'); return; }

  downloading = true;
  dlStart.disabled = true;
  dlStart.textContent = 'Baixando...';
  try {
    await window.api.download({ links: raw, quality: dlQuality.value, folder: currentFolder });
    // recarrega a biblioteca para mostrar as novas músicas
    if (currentFolder) await loadFolder(currentFolder);
  } catch (e) {
    logLine('Erro: ' + e.message, 'dl-err');
  } finally {
    downloading = false;
    dlStart.disabled = false;
    dlStart.innerHTML = '⬇ Baixar';
  }
}
dlStart.addEventListener('click', startDownload);

$('dlChooseFolder').addEventListener('click', async () => {
  const folder = await window.api.pickFolder();
  if (folder) {
    currentFolder = folder;
    updateDlFolder();
    folderPathEl.textContent = folder;
  }
});

// ============================================================
//  Playlists + Menu de contexto + Modais
// ============================================================
const uid = () => 'pl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const persistPlaylists = () => window.api.saveConfig({ playlists });
const persistGenres = () => window.api.saveConfig({ genreOverrides });
const trackByPath = (p) => allTracks.find((t) => t.path === p) || null;

function renderPlaylistList() {
  const list = $('plList');
  if (!list) return;
  list.innerHTML = '';
  if (!playlists.length) {
    const hint = document.createElement('div');
    hint.style.cssText = 'padding:12px;color:var(--ink-soft);font-size:12px';
    hint.textContent = 'Nenhuma playlist ainda. Clique em "＋ Nova".';
    list.appendChild(hint);
    return;
  }
  playlists.forEach((pl) => {
    const row = document.createElement('div');
    row.className = 'pl-item' + (pl.id === activePlaylistId ? ' active' : '');
    const ico = document.createElement('span'); ico.className = 'pl-ico'; ico.textContent = '≡';
    const name = document.createElement('span'); name.className = 'pl-name'; name.textContent = pl.name;
    const count = document.createElement('span'); count.className = 'pl-count'; count.textContent = pl.paths.length;
    row.append(ico, name, count);
    row.addEventListener('click', () => { openPlaylist(pl.id); sfxSelect(); });
    list.appendChild(row);
  });
}

function openPlaylist(id) {
  activePlaylistId = id;
  const pl = playlists.find((p) => p.id === id);
  $('plEmpty').hidden = !!pl;
  $('plDetail').hidden = !pl;
  if (pl) $('plTitle').textContent = pl.name;
  renderPlaylistList();
  renderPlaylistSongs();
}

const playlistTracks = (pl) => pl.paths.map(trackByPath).filter(Boolean);

function renderPlaylistSongs() {
  const box = $('plSongs');
  if (!box) return;
  const pl = playlists.find((p) => p.id === activePlaylistId);
  if (!pl) { box.innerHTML = ''; return; }
  box.innerHTML = '';
  const tracks = playlistTracks(pl);
  if (!tracks.length) {
    const e = document.createElement('div');
    e.style.cssText = 'padding:16px;color:var(--ink-soft);font-size:13px';
    e.textContent = 'Playlist vazia. Adicione músicas pela Biblioteca (clique direito › Adicionar à playlist).';
    box.appendChild(e);
    return;
  }
  tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'pl-song' + (t.id === playingId ? ' playing' : '');
    const th = document.createElement('div'); th.className = 'ps-thumb';
    if (t.cover) th.style.backgroundImage = `url("${t.cover}")`; else th.textContent = '♪';
    const info = document.createElement('div'); info.className = 'ps-info';
    const tt = document.createElement('div'); tt.className = 'ps-title'; tt.textContent = t.title;
    const sub = document.createElement('div'); sub.className = 'ps-sub';
    sub.textContent = t.artist + (genreOf(t) ? ' • ' + genreOf(t) : '');
    info.append(tt, sub);
    const rm = document.createElement('button'); rm.className = 'ps-remove'; rm.textContent = '✕'; rm.title = 'Remover da playlist';
    rm.addEventListener('click', (ev) => { ev.stopPropagation(); removeFromPlaylist(pl.id, t.path); });
    row.append(th, info, rm);
    row.addEventListener('dblclick', () => playFromList(tracks, i));
    box.appendChild(row);
  });
}

function addToPlaylist(id, path) {
  const pl = playlists.find((p) => p.id === id);
  if (!pl || pl.paths.includes(path)) return;
  pl.paths.push(path);
  persistPlaylists();
  renderPlaylistList();
  if (activePlaylistId === id) renderPlaylistSongs();
}

function removeFromPlaylist(id, path) {
  const pl = playlists.find((p) => p.id === id);
  if (!pl) return;
  pl.paths = pl.paths.filter((p) => p !== path);
  persistPlaylists();
  renderPlaylistList();
  renderPlaylistSongs();
}

async function newPlaylist(firstPath) {
  const name = await modalInput({ title: 'Nova playlist', placeholder: 'Nome da playlist' });
  if (!name) return null;
  const pl = { id: uid(), name: name.trim(), paths: firstPath ? [firstPath] : [] };
  playlists.push(pl);
  persistPlaylists();
  renderPlaylistList();
  return pl;
}

$('plNew').addEventListener('click', async () => { const pl = await newPlaylist(); if (pl) openPlaylist(pl.id); });
$('plPlay').addEventListener('click', () => {
  const pl = playlists.find((p) => p.id === activePlaylistId);
  if (!pl) return;
  const tracks = playlistTracks(pl);
  if (tracks.length) playFromList(tracks, 0);
});
$('plRename').addEventListener('click', async () => {
  const pl = playlists.find((p) => p.id === activePlaylistId);
  if (!pl) return;
  const name = await modalInput({ title: 'Renomear playlist', value: pl.name });
  if (name) { pl.name = name.trim(); persistPlaylists(); openPlaylist(pl.id); }
});
$('plDelete').addEventListener('click', async () => {
  const pl = playlists.find((p) => p.id === activePlaylistId);
  if (!pl) return;
  const ok = await modalConfirm({ title: 'Excluir playlist', text: `Excluir "${pl.name}"? As músicas continuam na Biblioteca.`, okText: 'Excluir' });
  if (!ok) return;
  playlists = playlists.filter((p) => p.id !== pl.id);
  activePlaylistId = null;
  persistPlaylists();
  $('plDetail').hidden = true;
  $('plEmpty').hidden = false;
  renderPlaylistList();
});

// ---- Menu de contexto ----
const ctxMenu = $('ctxMenu');
function closeCtx() { ctxMenu.hidden = true; ctxMenu.innerHTML = ''; }
window.addEventListener('click', closeCtx);
window.addEventListener('scroll', closeCtx, true);
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCtx(); });

function ctxItem(label, fn, cls) {
  const it = document.createElement('div');
  it.className = 'ctx-item' + (cls ? ' ' + cls : '');
  it.textContent = label;
  it.addEventListener('click', (e) => { e.stopPropagation(); closeCtx(); fn(); });
  return it;
}

function openCardMenu(x, y, track) {
  ctxMenu.innerHTML = '';
  ctxMenu.appendChild(ctxItem('▶  Tocar', () => playFromList(view, view.findIndex((t) => t.id === track.id))));
  ctxMenu.appendChild(ctxItem('＋  Adicionar à playlist…', () => choosePlaylistFor(track.path)));
  ctxMenu.appendChild(ctxItem('🏷  Definir gênero…', () => setGenreFor(track)));
  ctxMenu.hidden = false;
  const mw = 210;
  const mh = ctxMenu.offsetHeight || 150;
  ctxMenu.style.left = Math.min(x, window.innerWidth - mw - 8) + 'px';
  ctxMenu.style.top = Math.min(y, window.innerHeight - mh - 8) + 'px';
}

async function choosePlaylistFor(path) {
  const rows = playlists.map((pl) => ({
    label: `${pl.name}  (${pl.paths.length})`,
    value: pl.id,
    disabled: pl.paths.includes(path)
  }));
  const res = await modalChoose({ title: 'Adicionar à playlist', rows, extraLabel: '＋ Nova playlist…', extraValue: '__new__' });
  if (!res) return;
  if (res === '__new__') { const pl = await newPlaylist(path); if (pl) renderPlaylistList(); }
  else addToPlaylist(res, path);
}

async function setGenreFor(track) {
  const suggestions = [...new Set(allTracks.map(genreOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const g = await modalGenre({ current: genreOf(track), suggestions });
  if (g === null) return;
  const val = g.trim();
  if (val) genreOverrides[track.path] = val;
  else delete genreOverrides[track.path];
  persistGenres();
  renderGenreBar();
  applyFilter();
  renderPlaylistSongs();
}

// ---- Modais ----
const overlay = $('modalOverlay');
const modalBox = $('modalBox');
function closeModal() { overlay.hidden = true; modalBox.innerHTML = ''; }
overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

function modalInput({ title, value = '', placeholder = '' }) {
  return new Promise((resolve) => {
    modalBox.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = title;
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = value; inp.placeholder = placeholder;
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancelar';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'OK';
    const done = (v) => { closeModal(); resolve(v); };
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(inp.value.trim() ? inp.value : null));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); });
    actions.append(cancel, ok);
    modalBox.append(h, inp, actions);
    overlay.hidden = false;
    setTimeout(() => inp.focus(), 30);
  });
}

function modalConfirm({ title, text, okText = 'OK' }) {
  return new Promise((resolve) => {
    modalBox.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = title;
    const p = document.createElement('div'); p.style.cssText = 'font-size:14px;color:var(--ink)'; p.textContent = text;
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancelar';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = okText;
    const done = (v) => { closeModal(); resolve(v); };
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    actions.append(cancel, ok);
    modalBox.append(h, p, actions);
    overlay.hidden = false;
  });
}

function modalChoose({ title, rows, extraLabel, extraValue }) {
  return new Promise((resolve) => {
    modalBox.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = title;
    const list = document.createElement('div'); list.className = 'modal-list';
    const done = (v) => { closeModal(); resolve(v); };
    if (!rows.length) {
      const none = document.createElement('div');
      none.style.cssText = 'padding:10px;color:var(--ink-soft);font-size:13px';
      none.textContent = 'Nenhuma playlist ainda — crie uma abaixo.';
      list.appendChild(none);
    }
    rows.forEach((r) => {
      const row = document.createElement('div'); row.className = 'mrow';
      row.textContent = r.label + (r.disabled ? '   ✓ já contém' : '');
      if (r.disabled) row.style.opacity = '0.5';
      else row.addEventListener('click', () => done(r.value));
      list.appendChild(row);
    });
    if (extraLabel) {
      const row = document.createElement('div'); row.className = 'mrow';
      row.style.fontWeight = 'bold'; row.style.color = 'var(--accent-deep)';
      row.textContent = extraLabel;
      row.addEventListener('click', () => done(extraValue));
      list.appendChild(row);
    }
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const cancel = document.createElement('button'); cancel.textContent = 'Fechar';
    cancel.addEventListener('click', () => done(null));
    actions.append(cancel);
    modalBox.append(h, list, actions);
    overlay.hidden = false;
  });
}

function modalGenre({ current, suggestions }) {
  return new Promise((resolve) => {
    modalBox.innerHTML = '';
    const h = document.createElement('h3'); h.textContent = 'Definir gênero';
    const inp = document.createElement('input'); inp.type = 'text'; inp.value = current || ''; inp.placeholder = 'Ex.: Rock, MPB, Lofi...';
    const chips = document.createElement('div'); chips.className = 'modal-chips';
    suggestions.forEach((s) => {
      const c = document.createElement('button'); c.className = 'chip'; c.textContent = s;
      c.addEventListener('click', () => { inp.value = s; });
      chips.appendChild(c);
    });
    const actions = document.createElement('div'); actions.className = 'modal-actions';
    const clear = document.createElement('button'); clear.textContent = 'Limpar';
    const cancel = document.createElement('button'); cancel.textContent = 'Cancelar';
    const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'Salvar';
    const done = (v) => { closeModal(); resolve(v); };
    clear.addEventListener('click', () => done(''));
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(inp.value));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok.click(); if (e.key === 'Escape') cancel.click(); });
    actions.append(clear, cancel, ok);
    modalBox.append(h, inp, chips, actions);
    overlay.hidden = false;
    setTimeout(() => inp.focus(), 30);
  });
}

init();
