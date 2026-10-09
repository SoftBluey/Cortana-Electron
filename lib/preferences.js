const fs = require('node:fs/promises');
const crypto = require('node:crypto');

// Serialize snapshots, so an older slow write cannot replace newer settings.
function createWriter() {
  let queue = Promise.resolve();
  return (filename, data) => {
    const write = async () => {
      const temporary = `${filename}.tmp.${crypto.randomUUID()}`;
      try { await fs.writeFile(temporary, data); await fs.rename(temporary, filename); }
      finally { await fs.unlink(temporary).catch(() => {}); }
    };
    const result = queue.then(write);
    queue = result.catch(() => {});
    return result;
  };
}

function validNotebook(value) {
  return value && !Array.isArray(value) && typeof value === 'object' &&
    typeof value.notes === 'string' && value.notes.length <= 20000 &&
    typeof value.introduced === 'boolean' && Array.isArray(value.todos) && value.todos.length <= 200 &&
    value.todos.every(item => item && typeof item.id === 'string' && item.id.length <= 64 &&
      typeof item.text === 'string' && item.text.trim().length > 0 && item.text.length <= 512 && typeof item.done === 'boolean') &&
    new Set(value.todos.map(item => item.id)).size === value.todos.length &&
    (value.profile === undefined || (value.profile && !Array.isArray(value.profile) &&
      ['name', 'home', 'work', 'weatherCity'].every(key => typeof value.profile[key] === 'string' &&
        value.profile[key].length <= ({ name: 80, home: 256, work: 256, weatherCity: 120 })[key])));
}

// The unpublished 7.x troubleshooting build muted listening cues by default.
// Restore the original cues once for v8, then respect subsequent mute choices.
function migrateInterfaceSettings(value) {
  if (Number.isInteger(value.interfaceRelease) && value.interfaceRelease >= 8) return value;
  return { ...value, listeningSounds: true, interfaceRelease: 8 };
}

module.exports = { createWriter, validNotebook, migrateInterfaceSettings };
