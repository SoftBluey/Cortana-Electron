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

if(typeof module==='object'&&module.exports)module.exports = { formatShortcut, parseShortcut };

else globalThis.CortanaShortcuts = { formatShortcut, parseShortcut };
})();
