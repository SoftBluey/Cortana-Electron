(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CortanaWeather = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const keyword = '(?:weather(?:\\s+forecast)?|forecast)';
  const prefix = '(?:(?:what|how)(?:[\u0027\u2019]s|\\s+is)\\s+|(?:show|tell|give)(?:\\s+me)?\\s+|(?:check|get)\\s+(?:me\\s+)?)?';
  const term = '(?:(?:the|my)\\s+)?(?:(?:local|current|today[\u0027\u2019]?s)\\s+)?' + keyword;
  const local = '(?:like|right\\s+now|now|today|here|near\\s+me|in\\s+my\\s+(?:area|city|location))';
  const generic = prefix + term + '(?:\\s+' + local + '){0,3}';
  const explicit = prefix + term + '(?:\\s+like)?(?:\\s+(?:today|now))?\\s+(?:(?:in|for|of|at)\\s+)?(.+?)';
  const suffix = '(?!(?:what|how|show|tell|give|get|check|remind|set|create|write|search|open|play)\\b)(.+?)\\s+' + keyword + '(?:\\s+(?:today|now))?';
  const wrap = value => new RegExp('^\\s*(?!what(?:[\u0027\u2019]s|\\s+is)\\s+weather[?!.]*\\s*$)(?:' + value + ')[?!.]*\\s*$', 'i');
  const genericPattern = wrap(generic), explicitPattern = wrap(explicit), suffixPattern = wrap(suffix);
  const commandPattern = wrap(generic + '|' + explicit + '|' + suffix);
  function parse(query) {
    const text = query.trim().replace(/\s+/g, ' ').replace(/[?!.]+$/, '');
    if (genericPattern.test(text)) return { location: null };
    const match = text.match(explicitPattern) || text.match(suffixPattern);
    if (!match) return null;
    if (/\b(?:tomorrow|tonight|next week|this weekend)\b/i.test(text)) return { unsupportedPeriod: true };
    const location = match[1].trim().replace(/\s+(?:today|right now|now)$/i, '');
    // A missing place or personal location phrase must never become a city lookup.
    if (/^(?:in|for|of|at|like(?: in| for)?)$/i.test(location)) return { location: '' };
    if (/^(?:my|me|the|local|current|today|today['\u2019]s|now|right now|here|near me|my (?:area|city|location))$/i.test(location)) return { location: null };
    return { location };
  }
  return { commandPattern, parse };
});
