<p align="center">
  <img src="icon.png" width="120" alt="VulpiDL">
</p>

<h1 align="center">VulpiDL</h1>

<p align="center">
  sample grabber and audio tool for producers
</p>

<p align="center">
  <a href="https://github.com/d-ord/vulpidl/actions/workflows/build.yml"><img src="https://github.com/d-ord/vulpidl/actions/workflows/build.yml/badge.svg" alt="build"></a>
  <a href="https://github.com/d-ord/vulpidl/releases/latest"><img src="https://img.shields.io/github/v/release/d-ord/vulpidl?color=ad83ee" alt="release"></a>
  <a href="https://github.com/d-ord/vulpidl/releases"><img src="https://img.shields.io/github/downloads/d-ord/vulpidl/total?color=00ddff" alt="downloads"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/d-ord/vulpidl?color=44ff66" alt="license"></a>
</p>

<p align="center">
  <a href="https://github.com/d-ord/vulpidl/releases">download</a>
</p>

---

grab audio from youtube, search and preview tracks, analyze BPM and key, separate stems with AI, and manage your sample library. everything in one app.

### features

- **grab** - paste a url, pick format/quality/sample rate, trim, and download
- **search** - search youtube directly from the app
- **library** - browse your samples, preview with waveform, manage files
- **analyze** - detect BPM and musical key from any audio file (experimental)
- **stems** - AI stem separation with demucs (vocals/instrumental split)
- **queue** - track all your downloads with live progress
- **themes** - dark and light mode

### install

grab the latest installer from [releases](https://github.com/d-ord/vulpidl/releases). yt-dlp and ffmpeg are bundled, no extra setup needed.

for arch uesrs, you can download the program through the AUR with ```yay -S vulpidl-bin```

for AI stem separation, you also need python and demucs:
```
pip install demucs
```

### build from source

```bash
git clone https://github.com/d-ord/vulpidl.git
cd vulpidl
npm install
npm run setup     # downloads yt-dlp, ffmpeg, ffprobe
npm start         # run in dev mode
```

build installers:
```bash
npm run dist:win    # windows (.exe)
npm run dist:mac    # macos (.dmg)
npm run dist:linux  # linux (.AppImage, .deb, .pacman)
```

### custom protocol

vulpidl registers the `vulpidl://` protocol. browsers and other apps can open links like:
```
vulpidl://youtube.com/watch?v=dQw4w9WgXcQ
```

### license

MIT

---

### disclaimer:

this software is not affiliated with or endorsed by any content platform.
users are responsible for complying with applicable laws and terms of service.

