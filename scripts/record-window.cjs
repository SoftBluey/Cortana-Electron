// Captures Electron's complete composited app view, with no desktop or audio stream.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

async function recordWindow(win, output, label) {
  if (!/^[a-z0-9_-]+$/i.test(label)) throw new Error('Use a simple recording label');
  const initial = await win.webContents.capturePage();
  const { width, height } = initial.getSize();
  if (width > 480 || height > 656) throw new Error('Demo recording expects the classic 360 x 640 window');
  const frameDir = path.join(output, `${label}-frames`);
  fs.mkdirSync(frameDir, { recursive: true });
  const timeline = path.join(output, `${label}.ffconcat`);
  const video = path.join(output, `${label}.mp4`);
  const ass = path.join(output, `${label}.ass`);
  const subtitles = path.join(output, `${label}.srt`);
  const ffmpeg = process.env.CORTANA_FFMPEG || 'ffmpeg.exe';
  let failed = null, rendered = null;
  const frames = [];
  const started = performance.now();
  let previous = null;
  let capturePending = null;
  const captions = [];
  const elapsed = () => (performance.now() - started) / 1000;
  const saveFrame = (image, at) => {
    const size = image.getSize();
    if (size.width !== width || size.height !== height) throw new Error('Recorded window size changed');
    const file = `${String(frames.length).padStart(6,'0')}.png`;
    fs.writeFileSync(path.join(frameDir,file), image.toPNG());
    frames.push({at,file});
  };
  saveFrame(initial,0);
  const timer = setInterval(() => {
    if (failed) return;
    if (!capturePending) {
      capturePending = win.webContents.capturePage().then(image => {
        saveFrame(image,elapsed());
      }).catch(error => { failed = error; }).finally(() => { capturePending = null; });
    }
  }, 1000 / 30);
  const caption = text => {
    const now = elapsed();
    if (previous) { previous.end = now; captions.push(previous); }
    previous = { start: now, text };
  };
  const stamp = (seconds, assFormat = false) => {
    const milliseconds = Math.round(seconds * 1000);
    const h = Math.floor(milliseconds / 3600000), m = Math.floor(milliseconds / 60000) % 60, s = Math.floor(milliseconds / 1000) % 60;
    return assFormat
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(Math.floor(milliseconds % 1000 / 10)).padStart(2,'0')}`
      : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(milliseconds % 1000).padStart(3,'0')}`;
  };
  return {
    caption,
    abort() { clearInterval(timer); rendered?.kill(); },
    async finish() {
      clearInterval(timer);
      if (capturePending) await capturePending;
      const duration = elapsed();
      if (previous) { previous.end = duration; captions.push(previous); }
      if (failed) throw failed;
      fs.writeFileSync(subtitles, captions.map((item, i) => `${i+1}\n${stamp(item.start)} --> ${stamp(item.end)}\n${item.text}\n`).join('\n'));
      const header = '[Script Info]\nScriptType: v4.00+\nPlayResX: 480\nPlayResY: 800\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Segoe UI,18,&H00FFFFFF,&H00FFFFFF,&H00101010,&H00101010,0,0,0,0,100,100,0,0,1,1,0,2,20,20,30,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
      fs.writeFileSync(ass, header + captions.map(item => `Dialogue: 0,${stamp(item.start,true)},${stamp(item.end,true)},Default,,0,0,0,,${item.text.replace(/[{}\\]/g,'').replace(/\n/g,'\\N')}\n`).join(''));
      const relativeDir = path.basename(frameDir);
      const concat = ['ffconcat version 1.0'];
      frames.forEach((frame,i) => {
        concat.push(`file '${relativeDir}/${frame.file}'`);
        concat.push(`duration ${Math.max(0.001,(frames[i+1]?.at ?? duration)-frame.at).toFixed(6)}`);
      });
      concat.push(`file '${relativeDir}/${frames.at(-1).file}'`);
      fs.writeFileSync(timeline,concat.join('\n')+'\n');
      rendered = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '1', '-i', timeline, '-vf',
        `fps=30,pad=480:800:(ow-iw)/2:16:color=0x101010,ass=${path.basename(ass)}`, '-t', String(duration), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video],
        { cwd: output, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let renderError = '';
      rendered.stderr.on('data', chunk => { renderError = (renderError + chunk).slice(-8000); });
      await new Promise((resolve,reject) => {
        rendered.on('error',reject);
        rendered.on('close', code => code === 0 ? resolve() : reject(new Error(renderError || `Render exit ${code}`)));
      });
      fs.writeFileSync(path.join(output, `${label}-recording.json`), JSON.stringify({ width, height, capturedFrames:frames.length, fps:30, duration, video, subtitles, captions, desktopCaptured:false, audioCaptured:false }, null, 2));
      return video;
    },
  };
}
module.exports = { recordWindow };
