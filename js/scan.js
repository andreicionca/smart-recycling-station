(function () {
  'use strict';

  /*
   * Duratele sunt exprimate în milisecunde.
   * Modifică valorile de aici pentru a controla animația.
   */
  const SCAN_TIMING = {
    detecting: 1500,
    identified: 1000,
    holdStill: 1500,
    countdownStep: 1000,
    captured: 450,
    finished: 1200,
    error: 1200,
  };

  const $ = (selector) => document.querySelector(selector);
  const video = $('#localVideo');
  const cameraStage = $('.camera-stage');
  const placeholder = $('#cameraPlaceholder');
  const startButton = $('#startDetection');
  const connectButton = $('#connectButton');
  const codeInput = $('#sessionCode');
  const scanMessage = $('#scanMessage');
  const scanProgress = $('#scanProgress');
  const scannerStatus = $('#scannerStatus');
  const systemStatus = $('#scannerSystemStatus');
  const canvas = $('#captureCanvas');
  const toast = $('#toast');

  let stream;
  let peer;
  let channel;
  let sessionCode;
  let connecting = false;
  let scanning = false;
  let reconnectTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');

    clearTimeout(showToast.timer);

    showToast.timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  function setSystem(text, tone = 'warning') {
    systemStatus.innerHTML = `<i></i> ${text}`;

    systemStatus.style.color =
      tone === 'ok' ? 'var(--green)' : tone === 'error' ? 'var(--red)' : 'var(--yellow)';
  }

  function updateReadyState() {
    const ready = Boolean(stream && channel?.readyState === 'open' && !scanning);

    startButton.disabled = !ready;

    if (ready) {
      scannerStatus.textContent = 'SISTEM PREGĂTIT';
      setSystem('Sistem pregătit', 'ok');
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setSystem('Camera nu este disponibilă', 'error');
      showToast('CAMERA NU ESTE DISPONIBILĂ pe acest browser.');
      return;
    }

    stream?.getTracks().forEach((track) => track.stop());

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      video.srcObject = stream;
      await video.play();

      placeholder.hidden = true;
      setSystem('Cameră activă', 'ok');
      updateReadyState();
    } catch (error) {
      placeholder.hidden = false;
      placeholder.innerHTML = '<span>⚠</span><b>CAMERA NU POATE FI PORNITĂ</b>';

      setSystem('Acces cameră refuzat', 'error');

      showToast(
        error.name === 'NotAllowedError'
          ? 'Permite accesul la cameră din setările browserului.'
          : 'Camera este ocupată sau indisponibilă.'
      );
    }
  }

  function cleanupPeer() {
    clearTimeout(reconnectTimer);

    channel?.close();
    peer?.close();

    channel = null;
    peer = null;

    updateReadyState();
  }

  async function connect({ reconnect = false } = {}) {
    const code = (reconnect ? sessionCode : codeInput.value).replace(/\D/g, '');

    if (code.length !== 4) {
      showToast('Introdu codul complet de 4 cifre afișat pe laptop.');
      return;
    }

    if (!stream) {
      showToast('Camera trebuie pornită înainte de conectare.');
      return;
    }

    if (connecting) return;

    connecting = true;
    sessionCode = code;

    connectButton.disabled = true;
    connectButton.textContent = reconnect ? 'RECONECTEZ...' : 'CONECTEZ...';

    setSystem('Conectare la laptop...', 'warning');
    cleanupPeer();

    try {
      peer = StationRTC.createPeer();

      stream.getTracks().forEach((track) => {
        peer.addTrack(track, stream);
      });

      channel = peer.createDataChannel('station-state', { ordered: true });

      channel.onopen = () => {
        connecting = false;

        connectButton.textContent = 'CONECTAT';
        connectButton.disabled = true;
        codeInput.disabled = true;

        setSystem('Conectat la ecran', 'ok');

        StationRTC.sendMessage(channel, {
          type: 'state',
          state: 'READY',
        });

        updateReadyState();
      };

      channel.onclose = () => {
        handleConnectionLoss();
      };

      peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(peer.connectionState)) {
          handleConnectionLoss();
        }
      };

      const offer = await peer.createOffer();

      await peer.setLocalDescription(offer);
      await StationRTC.waitForIceGathering(peer);

      await StationRTC.putSignal(code, 'offer', peer.localDescription);

      const answer = await StationRTC.pollFor(code, 'answer', { timeoutMs: 45000 });

      if (!peer || peer.signalingState === 'closed') {
        return;
      }

      await peer.setRemoteDescription(answer);
    } catch (error) {
      connecting = false;

      connectButton.disabled = false;
      connectButton.textContent = 'CONECTEAZĂ';
      codeInput.disabled = false;

      setSystem('Conectare nereușită', 'error');

      showToast(error.message || 'Telefonul nu s-a putut conecta la laptop.');

      cleanupPeer();
    }
  }

  function handleConnectionLoss() {
    if (!sessionCode || connecting) return;

    startButton.disabled = true;

    setSystem('Conexiune pierdută', 'error');
    scannerStatus.textContent = 'REÎNCERC CONECTAREA...';

    connectButton.textContent = 'RECONECTEZ...';

    connectButton.disabled = true;
    codeInput.disabled = true;

    clearTimeout(reconnectTimer);

    reconnectTimer = setTimeout(() => {
      connect({ reconnect: true });
    }, 2500);
  }

  function sendState(state, details = {}) {
    StationRTC.sendMessage(channel, {
      type: 'state',
      state,
      ...details,
    });
  }

  function setStep(step) {
    document.querySelectorAll('.process-steps div').forEach((element, index) => {
      element.classList.toggle('active', index + 1 === step);

      element.classList.toggle('complete', index + 1 < step);
    });
  }

  async function showSequence(text, step, progress, duration) {
    scanMessage.textContent = text;
    scanMessage.classList.add('show');

    scannerStatus.textContent = text.toUpperCase();

    scanProgress.style.width = `${progress}%`;

    setStep(step);

    await StationRTC.wait(duration);
  }

  function captureFrame() {
    if (!video.videoWidth || !video.videoHeight) {
      throw new Error('Fluxul camerei nu este pregătit.');
    }

    const maxSide = 1024;

    const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));

    canvas.width = Math.round(video.videoWidth * scale);

    canvas.height = Math.round(video.videoHeight * scale);

    const context = canvas.getContext('2d', { alpha: false });

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.82);
  }

  async function analyze(image) {
    const response = await fetch('/.netlify/functions/analyze-image', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ image }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Analiza AI nu a putut fi finalizată.');
    }

    return data;
  }

  async function runScan() {
    if (scanning || startButton.disabled) {
      return;
    }

    scanning = true;
    startButton.disabled = true;
    startButton.classList.add('busy');

    startButton.innerHTML = '<span>●</span> DETECȚIE ÎN CURS';

    cameraStage.classList.add('scanning');

    try {
      sendState('DETECTING', {
        displayMessage: 'Detectez obiectul...',
        detail: 'Procesare vision activă',
      });

      await showSequence('Detectez obiectul...', 1, 15, SCAN_TIMING.detecting);

      sendState('DETECTING', {
        displayMessage: 'Obiect identificat',
        detail: 'Obiectul a fost localizat',
      });

      await showSequence('Obiect identificat', 2, 35, SCAN_TIMING.identified);

      sendState('DETECTING', {
        displayMessage: 'Menține obiectul nemișcat',
        detail: 'Pregătesc captura automată',
      });

      await showSequence('Menține obiectul nemișcat', 3, 52, SCAN_TIMING.holdStill);

      sendState('SCANNING', {
        displayMessage: 'Scanare... 3',
        detail: 'Menține obiectul nemișcat',
      });

      await showSequence('Scanare... 3', 4, 68, SCAN_TIMING.countdownStep);

      sendState('SCANNING', {
        displayMessage: 'Scanare... 2',
        detail: 'Menține obiectul nemișcat',
      });

      await showSequence('Scanare... 2', 4, 80, SCAN_TIMING.countdownStep);

      sendState('SCANNING', {
        displayMessage: 'Scanare... 1',
        detail: 'Captura urmează imediat',
      });

      await showSequence('Scanare... 1', 4, 92, SCAN_TIMING.countdownStep);

      const image = captureFrame();

      scannerStatus.textContent = 'IMAGINE CAPTURATĂ';

      scanMessage.textContent = 'IMAGINE CAPTURATĂ';

      scanProgress.style.width = '100%';

      sendState('CAPTURED');

      await StationRTC.wait(SCAN_TIMING.captured);

      scannerStatus.textContent = 'ANALIZEZ CU AI...';

      scanMessage.textContent = 'ANALIZEZ CU AI...';

      sendState('ANALYZING');

      const result = await analyze(image);

      sendState('RESULT', { result });

      scannerStatus.textContent = 'SCANARE FINALIZATĂ';

      scanMessage.textContent = 'SCANARE FINALIZATĂ';

      setSystem('Scanare finalizată', 'ok');

      await StationRTC.wait(SCAN_TIMING.finished);
    } catch (error) {
      sendState('ERROR', {
        message: error.message || 'Analiza AI nu a putut fi finalizată.',
      });

      scannerStatus.textContent = 'ANALIZA AI NU A PUTUT FI FINALIZATĂ';

      scanMessage.textContent = 'EROARE ANALIZĂ';

      setSystem('Eroare de analiză', 'error');

      showToast(error.message || 'ANALIZA AI NU A PUTUT FI FINALIZATĂ');

      await StationRTC.wait(SCAN_TIMING.error);
    } finally {
      scanning = false;

      cameraStage.classList.remove('scanning');

      scanMessage.classList.remove('show');

      scanProgress.style.width = '0';

      setStep(1);

      startButton.classList.remove('busy');

      startButton.innerHTML = '<span>▶</span> PORNEȘTE DETECȚIA';

      updateReadyState();
    }
  }

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
  });

  codeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      connect();
    }
  });

  connectButton.addEventListener('click', () => connect());

  startButton.addEventListener('click', runScan);

  $('#cameraRetry').addEventListener('click', startCamera);

  window.addEventListener('beforeunload', () => {
    cleanupPeer();

    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  });

  const codeFromUrl = new URLSearchParams(location.search).get('code');

  if (/^\d{4}$/.test(codeFromUrl || '')) {
    codeInput.value = codeFromUrl;
  }

  startCamera();
})();
