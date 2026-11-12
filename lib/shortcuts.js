(function(){
function formatShortcut(value) {
  return String(value || '').split('+').map(part => ({
    CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl',
    Super: 'Windows', Meta: 'Windows', Return: 'Enter', Esc: 'Escape',
  })[part] || part).join('+');
}

function parseShortcut(value) {
  return String(value || '').trim().split('+').map(part => {
    const key = part.trim();
    return ({ ctrl: 'Control', windows: 'Super', win: 'Super', enter: 'Return',
      shift: 'Shift', alt: 'Alt', escape: 'Escape' })[key.toLowerCase()] || key;
  }).join('+');
}

function captureShortcut(event) {
  if (event.repeat || event.isComposing || event.getModifierState?.('AltGraph')) return '';
  const modifiers = [];
  if (event.ctrlKey) modifiers.push('Control');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  if (event.metaKey) modifiers.push('Super');
  const functionKey = /^F(?:[1-9]|1\d|2[0-4])$/.test(event.key);
  if (!functionKey && !event.ctrlKey && !event.altKey && !event.metaKey) return '';

  const key = ({
    ' ': 'Space', Enter: 'Return', '+': 'Plus',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  })[event.key] || event.key;
  if (!functionKey && !/^[a-z0-9]$/i.test(key) &&
      !['Space', 'Return', 'Plus', 'Up', 'Down', 'Left', 'Right', 'Home', 'End',
        'PageUp', 'PageDown', 'Insert', 'Delete', 'Backspace'].includes(key)) return '';
  return [...modifiers, key.length === 1 ? key.toUpperCase() : key].join('+');
}

if(typeof module==='object'&&module.exports)module.exports = { formatShortcut, parseShortcut, captureShortcut };

else globalThis.CortanaShortcuts = { formatShortcut, parseShortcut, captureShortcut };
})();
