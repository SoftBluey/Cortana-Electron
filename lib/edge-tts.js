const { randomUUID } = require('node:crypto');
const { WebSocket } = require('ws');
const { EdgeTTS: BaseEdgeTTS } = require('node-edge-tts');
const { TRUSTED_CLIENT_TOKEN, CHROMIUM_FULL_VERSION, SEC_MS_GEC_VERSION_V2,
  generateSecMsGecToken_V2 } = require('node-edge-tts/dist/drm');

// node-edge-tts 1.2.12 supplies the v2 protocol and bounded synthesis, but its
// api.msedgeservices.com endpoint returned HTTP 200 instead of a WebSocket.
// Keep the established read-aloud endpoint used by rany2/edge-tts, with v2 and
// a fresh ConnectionId. Pin the library while this internal connection override
// is needed; retain its synthesis, escaping, frame parsing and stream cleanup.
// https://github.com/rany2/edge-tts/blob/master/src/edge_tts/communicate.py
class EdgeTTS extends BaseEdgeTTS {
  constructor(options, connect = (url, options) => new WebSocket(url, options)) {
    super(options);
    this.connect = connect;
  }

  _connectWebSocket() {
    const url = new URL('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1');
    url.searchParams.set('TrustedClientToken', TRUSTED_CLIENT_TOKEN);
    url.searchParams.set('ConnectionId', randomUUID().replaceAll('-', ''));
    url.searchParams.set('Sec-MS-GEC', generateSecMsGecToken_V2());
    url.searchParams.set('Sec-MS-GEC-Version', SEC_MS_GEC_VERSION_V2);
    const major = CHROMIUM_FULL_VERSION.split('.')[0];
    return new Promise((resolve, reject) => {
      const socket = this.connect(url.toString(), {
        handshakeTimeout: this.timeout,
        origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        headers: {
          'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`,
          'Pragma': 'no-cache', 'Cache-Control': 'no-cache', 'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      const opened = () => resolve(socket);
      const failed = error => reject(error);
      socket.once('open', opened);
      // Keep this listener until close, including errors raised by termination.
      socket.on('error', failed);
      socket.once('close', () => {
        socket.off('open', opened); socket.off('error', failed);
        reject(new Error('Edge speech connection closed before it was ready.'));
      });
    });
  }
}

module.exports = { EdgeTTS };
