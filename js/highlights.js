// Continuous match recording + key-moment tagging for the post-fight
// highlight reel. All methods are safe no-ops when captureStream/
// MediaRecorder aren't supported.
(function () {
  const MIME_CANDIDATES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const type of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  class HighlightRecorder {
    constructor() {
      this.isSupported =
        typeof MediaRecorder !== 'undefined' &&
        typeof HTMLCanvasElement !== 'undefined' &&
        !!HTMLCanvasElement.prototype.captureStream;
      this._recorder = null;
      this._stream = null;
      this._chunks = [];
      this._marks = [];
      this._startTime = 0;
      this._blobUrl = null;
    }

    start(canvas) {
      if (!this.isSupported || this._recorder) return;
      this._chunks = [];
      this._marks = [];
      this._startTime = performance.now();
      const mimeType = pickMimeType();
      try {
        // captureStream can throw SecurityError under some privacy/
        // fingerprinting protections; treat that like unsupported.
        this._stream = canvas.captureStream(30);
        this._recorder = mimeType
          ? new MediaRecorder(this._stream, { mimeType })
          : new MediaRecorder(this._stream);
      } catch (err) {
        this.isSupported = false;
        this._recorder = null;
        this._stream = null;
        return;
      }
      this._recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) this._chunks.push(e.data);
      };
      this._recorder.start(1000);
    }

    mark(type, padStartMs, padEndMs) {
      if (!this.isSupported || !this._recorder) return;
      const t = performance.now() - this._startTime;
      const start = Math.max(0, t - (padStartMs == null ? 400 : padStartMs));
      const end = t + (padEndMs == null ? 800 : padEndMs);
      this._marks.push({ type, start, end });
    }

    stop() {
      if (!this.isSupported || !this._recorder) {
        return Promise.resolve({ blobUrl: null, marks: [] });
      }
      const recorder = this._recorder;
      const marks = this._marks.slice();
      this._recorder = null;
      return new Promise(resolve => {
        recorder.onstop = () => {
          const blob = new Blob(this._chunks, { type: recorder.mimeType || 'video/webm' });
          this._chunks = [];
          this._blobUrl = blob.size > 0 ? URL.createObjectURL(blob) : null;
          if (this._stream) {
            this._stream.getTracks().forEach(tr => tr.stop());
            this._stream = null;
          }
          resolve({ blobUrl: this._blobUrl, marks });
        };
        try {
          recorder.stop();
        } catch (e) {
          // Recorder was already inactive (e.g. disposed mid-fight);
          // onstop will never fire, so resolve with what we have.
          resolve({ blobUrl: null, marks });
        }
      });
    }

    dispose() {
      if (this._recorder) {
        try { this._recorder.stop(); } catch (e) { /* already inactive */ }
        this._recorder = null;
      }
      if (this._blobUrl) {
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = null;
      }
      this._marks = [];
      this._chunks = [];
      if (this._stream) {
        this._stream.getTracks().forEach(tr => tr.stop());
        this._stream = null;
      }
    }
  }

  window.HighlightRecorder = HighlightRecorder;
})();
