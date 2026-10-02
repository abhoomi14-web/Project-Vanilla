(() => {
  const video = document.querySelector('#video');
  const canvas = document.querySelector('#overlay');
  const context = canvas.getContext('2d');
  const toggle = document.querySelector('#camera-toggle');
  const placeholder = document.querySelector('#placeholder');
  const scanLine = document.querySelector('#scan-line');
  const liveBadge = document.querySelector('#live-badge');
  const statusTitle = document.querySelector('#status-title');
  const statusCopy = document.querySelector('#status-copy');
  const emotionName = document.querySelector('#emotion-name');
  const confidence = document.querySelector('#confidence');
  const confidenceMeter = document.querySelector('#confidence-meter');
  const bars = [...document.querySelectorAll('[data-emotion]')];
  let stream = null;
  let running = false;
  let human = null;
  let animationFrame = null;
  let lastReading = null;

  const config = {
    backend: 'webgl',
    debug: false,
    warmup: 'face',
    cacheModels: false,
    modelBasePath: 'https://vladmandic.github.io/human-models/models/',
    cacheSensitivity: 0.45,
    filter: { enabled: true, equalization: false, flip: false },
    face: {
      enabled: true,
      detector: { rotation: false, maxDetected: 1 },
      mesh: { enabled: true },
      attention: { enabled: false },
      iris: { enabled: false },
      description: { enabled: false },
      emotion: { enabled: true },
      antispoof: { enabled: false },
      liveness: { enabled: false }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    segmentation: { enabled: false },
    gesture: { enabled: false }
  };

  function setStatus(title, copy) {
    statusTitle.textContent = title;
    statusCopy.textContent = copy;
  }

  function normalizeEmotion(name) {
    const aliases = { surprised: 'surprise', fearful: 'fear', disgusted: 'disgust' };
    return aliases[name] || name;
  }

  function resetResults(message = 'Waiting') {
    lastReading = null;
    emotionName.textContent = message;
    confidence.textContent = '—';
    confidenceMeter.style.width = '0%';
    bars.forEach(row => { row.querySelector('i').style.width = '0%'; row.querySelector('b').textContent = '0%'; });
  }

  function renderResults(face) {
    const emotions = Array.isArray(face?.emotion) ? [...face.emotion].sort((a, b) => b.score - a.score) : [];
    if (!emotions.length) { resetResults('No face'); setStatus('Looking for a face', 'Center your face and use even lighting.'); return; }
    const best = emotions[0];
    const percent = Math.round(best.score * 100);
    lastReading = { emotion: best.emotion, confidence: percent, detectedAt: new Date().toISOString() };
    emotionName.textContent = best.emotion;
    confidence.textContent = `${percent}%`;
    confidenceMeter.style.width = `${percent}%`;
    setStatus('Expression detected', `${best.emotion} is the strongest visible signal.`);
    const scores = Object.fromEntries(emotions.map(item => [normalizeEmotion(item.emotion), Math.round(item.score * 100)]));
    bars.forEach(row => {
      const value = scores[row.dataset.emotion] || 0;
      row.querySelector('i').style.width = `${value}%`;
      row.querySelector('b').textContent = `${value}%`;
    });
  }

  function drawFace(face) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!face?.box) return;
    const [x, y, width, height] = face.box;
    context.strokeStyle = '#6bdcff'; context.lineWidth = Math.max(2, canvas.width / 320); context.setLineDash([12, 8]);
    context.strokeRect(x, y, width, height); context.setLineDash([]);
  }

  async function detectionLoop() {
    if (!running) return;
    try {
      const result = await human.detect(video);
      const face = result.face?.[0];
      drawFace(face);
      renderResults(face);
    } catch (error) {
      setStatus('Analysis paused', 'The model hit a temporary problem. Trying again…');
    }
    if (running) animationFrame = requestAnimationFrame(detectionLoop);
  }

  async function startCamera() {
    toggle.disabled = true;
    setStatus('Loading AI model', 'The first start can take a moment.');
    try {
      const HumanConstructor = window.Human?.Human || window.Human;
      if (typeof HumanConstructor !== 'function') throw new Error('The AI library could not be loaded. Check your internet connection.');
      if (!human) {
        human = new HumanConstructor(config);
        await human.load();
        await human.warmup();
      }
      setStatus('Requesting camera', 'Choose Allow in the browser prompt.');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
      video.srcObject = stream;
      await video.play();
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      running = true;
      placeholder.hidden = true; scanLine.hidden = false; liveBadge.hidden = false;
      toggle.textContent = 'Stop camera'; toggle.classList.add('stop'); toggle.disabled = false;
      setStatus('Camera is live', 'Hold still while the model finds your expression.');
      detectionLoop();
    } catch (error) {
      toggle.disabled = false;
      toggle.textContent = 'Try again';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setStatus('Camera access is blocked', 'Use the camera icon beside the address to choose Allow, then try again.');
      } else if (error.name === 'NotFoundError') {
        setStatus('No camera found', 'Connect or enable a camera, then try again.');
      } else {
        human = null;
        setStatus('AI model couldn’t load', 'Check your internet connection, then try again.');
        console.error('Pulse AI startup failed:', error);
      }
    }
  }

  function stopCamera() {
    running = false;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    stream?.getTracks().forEach(track => track.stop());
    stream = null; video.srcObject = null;
    context.clearRect(0, 0, canvas.width, canvas.height);
    placeholder.hidden = false; scanLine.hidden = true; liveBadge.hidden = true;
    toggle.textContent = 'Start camera'; toggle.classList.remove('stop');
    setStatus('Camera stopped', 'Start it again whenever you’re ready.');
    resetResults();
  }

  toggle.addEventListener('click', () => running ? stopCamera() : startCamera());
  window.addEventListener('pagehide', stopCamera);

  const modelContext = document.modelContext;
  if (modelContext?.registerTool) {
    const lifecycle = new AbortController();
    Promise.resolve(modelContext.registerTool({
      name: 'read_current_expression', title: 'Read current expression',
      description: 'Read the latest visible facial-expression estimate from Pulse AI without starting the camera.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return lastReading ? { status: 'detected', ...lastReading } : { status: running ? 'searching' : 'camera_off' }; }
    }, { signal: lifecycle.signal })).catch(() => {});
  }
})();
