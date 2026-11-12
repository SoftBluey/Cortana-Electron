(function(){
// Chromium's voice names differ between Windows installations. Prefer the
// regular Zira voice; keep Desktop as a last-resort alias rather than a default.
function defaultVoice(voices) {
  return voices.find(voice => /zira/i.test(voice.name) && !/desktop/i.test(voice.name)) ||
    voices.find(voice => /zira/i.test(voice.name)) || voices[0] || null;
}
function resolveVoice(voices, preferred) {
  return voices.find(voice => voice.name === preferred) || defaultVoice(voices);
}
function waitForVoices(synthesis, { signal, timeout = 2000 } = {}) {
  if (signal?.aborted) return Promise.resolve([]);
  const voices = synthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise(resolve => {
    const finish = voices => {
      clearTimeout(timer);
      synthesis.removeEventListener('voiceschanged', changed);
      signal?.removeEventListener('abort', aborted);
      resolve(voices);
    };
    const changed = () => { const voices = synthesis.getVoices(); if (voices.length) finish(voices); };
    const aborted = () => finish([]);
    const timer = setTimeout(() => finish(synthesis.getVoices()), timeout);
    synthesis.addEventListener('voiceschanged', changed);
    signal?.addEventListener('abort', aborted, { once: true });
    // Recheck after subscribing so readiness cannot fall between the two reads.
    if (signal?.aborted) aborted(); else changed();
  });
}
if(typeof module==='object'&&module.exports)module.exports = { defaultVoice, resolveVoice, waitForVoices };

else globalThis.CortanaVoicePolicy = { defaultVoice, resolveVoice, waitForVoices };
})();
