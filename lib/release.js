const RELEASES_ROOT = 'https://github.com/SoftBluey/Cortana-Electron/releases/tag/';

function releaseInfo(release, currentVersion) {
  const tag = release?.tag_name;
  if (release?.draft || release?.prerelease || typeof tag !== 'string' || !/^v?\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error('The latest release could not be verified.');
  }
  const remoteVersion = tag.replace(/^v/, '');
  const expectedUrl = RELEASES_ROOT + tag;
  if (release.html_url !== expectedUrl) throw new Error('The release link could not be verified.');
  const current = currentVersion.split('.').map(Number);
  const remote = remoteVersion.split('.').map(Number);
  const differing = remote.findIndex((part, index) => part !== current[index]);
  return { available: differing !== -1 && remote[differing] > current[differing],
    currentVersion, remoteVersion, releaseUrl: expectedUrl };
}

module.exports = { releaseInfo };
