# 🎵 3DS Music Player

Reprodutor de música **local** para Windows com visual inspirado no **Home Menu do Nintendo 3DS**:
fundo azul em degradê com bolhas, cards arredondados como ícones de apps, barra superior com
relógio, e um cursor de seleção brilhante. Feito com [Electron](https://www.electronjs.org/).

## ✨ O que ele faz

- 📁 Lê uma pasta de músicas (e subpastas) e monta a biblioteca automaticamente
- 🖼️ Lê **capa do álbum**, título, artista e **gênero** das tags (`.mp3`, `.flac`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.wav`, `.wma`)
- 🎛️ "Tela de cima" mostra a música tocando; "tela de baixo" é a grade navegável por **mouse** ou **setas do teclado**
- 🏷️ **Filtro por gênero** e categorização manual (clique direito → "Definir gênero")
- 🗂️ **Playlists** — crie, edite e toque suas próprias listas
- ⬇️ Aba **Baixar** — cole links do **YouTube** ou **Spotify** e baixe em MP3 (opcional, requer ferramentas extras)
- 🔀 Aleatório, repetir, busca, volume e sons de navegação estilo 3DS

---

## ⬇️ Como baixar e rodar (passo a passo)

### Pré-requisito: Node.js

O app precisa do **Node.js** (uma vez só). No **PowerShell**:

```powershell
winget install OpenJS.NodeJS.LTS
```

> Não tem `winget`? Baixe o instalador em <https://nodejs.org> (versão **LTS**) e instale.
> **Feche e reabra** o terminal depois de instalar, para o `node` ser reconhecido.

Confira que instalou:

```powershell
node --version
```

### Passo 1 — Baixar o projeto

**Opção A (mais fácil, sem git):**
1. Nesta página do GitHub, clique no botão verde **`Code`** → **`Download ZIP`**
2. Extraia o ZIP para uma pasta à sua escolha (ex.: `D:\Local-Music-Player-3DS`)

**Opção B (com git):**
```powershell
git clone <URL-DO-SEU-REPOSITORIO>.git
```

### Passo 2 — Instalar as dependências

Abra o PowerShell **dentro da pasta do projeto** e rode:

```powershell
npm install
```

> **Se o app não abrir no passo seguinte** (erro do Electron), rode uma vez:
> ```powershell
> node node_modules/electron/install.js
> ```
> Isso força o download do binário do Electron (necessário em alguns PCs com segurança do npm).

### Passo 3 — Abrir o app

```powershell
npm start
```

### Passo 4 — Adicionar suas músicas

- Copie seus arquivos de áudio para a pasta **`music`** dentro do projeto
  (é a pasta padrão; você também pode escolher outra pasta pelo botão **📁 Pasta**)
- Clique em **🔄 Recarregar** (ou reabra o app) e as músicas aparecem na Biblioteca

Pronto! 🎉

---

## ⬇️ Aba "Baixar" — YouTube e Spotify (opcional)

Para usar a aba **Baixar**, instale estas ferramentas livres (uma vez). No PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS   # (se ainda não tiver)
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

Feche e reabra o terminal, então instale o yt-dlp e o spotDL:

```powershell
python -m pip install --upgrade yt-dlp spotdl
```

O app **detecta automaticamente** essas ferramentas pelo PATH. Abra a aba **Baixar** — deve
aparecer **"✓ Ferramentas prontas"**. Cole links (um por linha) e clique em Baixar; os MP3 vão
para a sua pasta de músicas, com capa e tags.

### Como funciona (importante)

- **YouTube** → `yt-dlp` + `ffmpeg` baixam e convertem o áudio.
- **Spotify** → o áudio do Spotify é protegido por DRM e **não** pode ser baixado direto. O `spotDL`
  lê os dados da faixa (título, artista, capa) e baixa a versão equivalente do YouTube.

> ⚠️ **Uso responsável:** baixar conteúdo protegido por direitos autorais pode violar os termos das
> plataformas e a lei de direitos autorais. Use para conteúdo que você tem direito de baixar
> (domínio público, Creative Commons, material próprio, ou uso pessoal onde for permitido). A
> responsabilidade pelo uso é sua.

---

## ⌨️ Atalhos de teclado

| Tecla            | Ação                          |
|------------------|-------------------------------|
| Setas ← → ↑ ↓    | Navegar pela grade            |
| Enter            | Tocar a música selecionada    |
| Espaço           | Tocar / Pausar                |
| `/`              | Focar a busca                 |
| Esc              | Sair da busca                 |
| Clique direito   | Menu: adicionar à playlist / definir gênero |

---

## 📦 Gerar um instalador `.exe` (opcional)

Para criar um instalador Windows (com atalho na área de trabalho):

```powershell
npm run dist
```

Gera em `dist\`:
- `3DS Music Player Setup 1.0.0.exe` — instalador
- `3DS-Music-Player-Portable-1.0.0.exe` — versão portátil (abre sem instalar)

Como o app **não é assinado digitalmente**, o Windows SmartScreen mostra um aviso azul: clique em
**"Mais informações" → "Executar assim mesmo"**.

> Numa máquina sem Modo de Desenvolvedor/admin, a primeira execução do build pode falhar ao extrair
> o `winCodeSign` (contém symlinks do macOS que o Windows não cria sem privilégio). Isso só afeta a
> assinatura, que não usamos. Solução: extrair esse componente **sem a pasta `darwin`** para
> `%LOCALAPPDATA%\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0`, e rodar o build de novo.

---

## 🗂️ Onde ficam os dados

- **Músicas:** na pasta `music` do projeto (ou na pasta que você escolher). Os áudios **não** vão
  para o GitHub (`.gitignore`).
- **Configuração** (playlists, gêneros manuais, volume, caminhos das ferramentas): em
  `%APPDATA%\local-music-player-3ds\config.json`. Fica no seu PC, **fora** do repositório.

## 🛠️ Tecnologias

Electron · music-metadata · yt-dlp · spotDL · ffmpeg

## Licença

MIT
