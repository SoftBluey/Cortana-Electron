(function(){
function normalizeEndpoint(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('AI API URL must use http or https without embedded credentials.');
  let pathname = url.pathname.replace(/\/+$/, '');
  if (!pathname.endsWith('/chat/completions')) {
    if (!/\/v\d+(?:beta)?(?:\/openai)?$/.test(pathname)) pathname += '/v1';
    pathname += '/chat/completions';
  }
  url.pathname = pathname;
  url.hash = '';
  return url;
}

function isLoopback(value) {
  try { return /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])$/i.test(new URL(value).hostname); }
  catch (_) { return false; }
}

if(typeof module==='object'&&module.exports)module.exports = { normalizeEndpoint, isLoopback };

else globalThis.CortanaEndpoint = { normalizeEndpoint, isLoopback };
})();
