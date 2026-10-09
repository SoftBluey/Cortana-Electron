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
if(typeof module==='object'&&module.exports)module.exports = { defaultVoice, resolveVoice };

else globalThis.CortanaVoicePolicy = { defaultVoice, resolveVoice };
})();
