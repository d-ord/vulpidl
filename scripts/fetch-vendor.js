const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const vendorDir = path.join(__dirname, '..', 'vendor');
if (!fs.existsSync(vendorDir)) fs.mkdirSync(vendorDir);

const platform = os.platform();

if (platform === 'win32') {
  console.log('downloading yt-dlp.exe...');
  execSync(`curl -L -o "${path.join(vendorDir, 'yt-dlp.exe')}" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"`, { stdio: 'inherit' });

  console.log('downloading ffmpeg...');
  const zipPath = path.join(vendorDir, 'ffmpeg.zip');
  execSync(`curl -L -o "${zipPath}" "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip"`, { stdio: 'inherit' });

  const extractDir = path.join(vendorDir, 'ffmpeg-master-latest-win64-lgpl');
  execSync(`tar -xf "${zipPath}" -C "${vendorDir}" "ffmpeg-master-latest-win64-lgpl/bin/ffmpeg.exe" "ffmpeg-master-latest-win64-lgpl/bin/ffprobe.exe"`, { stdio: 'inherit' });
  fs.renameSync(path.join(extractDir, 'bin', 'ffmpeg.exe'), path.join(vendorDir, 'ffmpeg.exe'));
  fs.renameSync(path.join(extractDir, 'bin', 'ffprobe.exe'), path.join(vendorDir, 'ffprobe.exe'));
  fs.rmSync(extractDir, { recursive: true });
  fs.unlinkSync(zipPath);

} else if (platform === 'linux') {
  console.log('downloading yt-dlp...');
  execSync(`curl -L -o "${path.join(vendorDir, 'yt-dlp')}" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"`, { stdio: 'inherit' });
  fs.chmodSync(path.join(vendorDir, 'yt-dlp'), 0o755);

  console.log('downloading ffmpeg...');
  const tarPath = path.join(vendorDir, 'ffmpeg.tar.xz');
  execSync(`curl -L -o "${tarPath}" "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-lgpl.tar.xz"`, { stdio: 'inherit' });
  execSync(`tar -xf "${tarPath}" -C "${vendorDir}" --strip-components=2 "ffmpeg-master-latest-linux64-lgpl/bin/ffmpeg" "ffmpeg-master-latest-linux64-lgpl/bin/ffprobe"`, { stdio: 'inherit' });
  fs.unlinkSync(tarPath);
  fs.chmodSync(path.join(vendorDir, 'ffmpeg'), 0o755);
  fs.chmodSync(path.join(vendorDir, 'ffprobe'), 0o755);

} else if (platform === 'darwin') {
  console.log('downloading yt-dlp...');
  execSync(`curl -L -o "${path.join(vendorDir, 'yt-dlp')}" "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"`, { stdio: 'inherit' });
  fs.chmodSync(path.join(vendorDir, 'yt-dlp'), 0o755);

  console.log('downloading ffmpeg...');
  const zipPath = path.join(vendorDir, 'ffmpeg.zip');
  execSync(`curl -L -o "${zipPath}" "https://evermeet.cx/ffmpeg/getrelease/zip"`, { stdio: 'inherit' });
  execSync(`unzip -o "${zipPath}" -d "${vendorDir}"`, { stdio: 'inherit' });
  fs.unlinkSync(zipPath);
  fs.chmodSync(path.join(vendorDir, 'ffmpeg'), 0o755);

  console.log('downloading ffprobe...');
  const zipPath2 = path.join(vendorDir, 'ffprobe.zip');
  execSync(`curl -L -o "${zipPath2}" "https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip"`, { stdio: 'inherit' });
  execSync(`unzip -o "${zipPath2}" -d "${vendorDir}"`, { stdio: 'inherit' });
  fs.unlinkSync(zipPath2);
  fs.chmodSync(path.join(vendorDir, 'ffprobe'), 0o755);
}

console.log('vendor binaries ready');
