const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const {validLists} = require('./lists');

// Serialize operations that read and then change shared state, including timers.
function createMutationQueue() {
  let queue = Promise.resolve();
  return operation => {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
}

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

// Commit changes in order and publish the new snapshot only after it reaches disk.
function createSettingsSaver({ read, commit, write, writable = () => true, onError = () => {} }) {
  let queue = Promise.resolve();
  return (patch = {}, replace = false) => {
    const operation = async () => {
      if (!writable()) return { success: false, error: 'Settings could not be read safely. The original file has been kept; check its permissions before saving changes.' };
      const next = replace ? { ...patch } : { ...read(), ...patch };
      try {
        await write(next);
        commit(next);
        return { success: true };
      } catch (error) {
        onError(error);
        return { success: false, error: 'Could not save settings on this computer. Check that the settings folder is writable and there is free disk space, then try again.' };
      }
    };
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  };
}

function validNotebook(value) {
  return value && !Array.isArray(value) && typeof value === 'object' &&
    validLists(value.lists) &&
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

module.exports = { createWriter, createSettingsSaver, createMutationQueue, validNotebook, migrateInterfaceSettings };
