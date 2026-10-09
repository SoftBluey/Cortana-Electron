// Output/camera changes must not bounce the default microphone session.
function inputFingerprint(devices) {
  return devices.filter(device => device.kind === 'audioinput')
    .map(device => `${device.deviceId}:${device.groupId}`).sort().join('|');
}
module.exports = { inputFingerprint };
