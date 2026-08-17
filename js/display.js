(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const video = $('#remoteVideo');
  const videoWrap = $('.remote-video-wrap');
  const placeholder = $('#videoPlaceholder');
  const sessionCodeEl = $('#displaySessionCode');
  const onlinePill = $('#onlinePill');
  const liveBadge = $('#liveBadge');
  const connectionState = $('#connectionState');
  const cameraState = $('#cameraState');
  const connectionDot = $('#connectionDot');
  const cameraDot = $('#cameraDot');
  const aiDot = $('#aiDot');
  const aiState = $('#aiState');
  const resultPanel = $('#resultPanel');
  const stateBadge = $('#stateBadge');
  const resultIcon = $('#resultIcon');
  const displayKicker = $('#displayKicker');
  const displayState = $('#displayState');
  const displayInstruction = $('#displayInstruction');
  const displayReason = $('#displayReason');
  const confidenceLine = $('#confidenceLine');
  const confidenceValue = $('#confidenceValue');
  const remoteScanTitle = $('#remoteScanTitle');
  const remoteScanDetail = $('#remoteScanDetail');
  const toast = $('#toast');

  let sessionCode;
  let peer;
  let channel;
  let pollController;
  let connectionGeneration = 0;

  const resultMap = {
    PLASTIC: {
      icon: '♳',
      title: 'PLASTIC',
      instruction: 'Direcționează obiectul către compartimentul PLASTIC',
    },
    PAPER: {
      icon: '▤',
      title: 'HÂRTIE',
      instruction: 'Direcționează obiectul către compartimentul HÂRTIE',
    },
    BIO: {
      icon: '♧',
      title: 'BIODEGRADABIL',
      instruction: 'Direcționează obiectul către compartimentul BIODEGRADABIL',
    },
    OTHER: {
      icon: '♲',
      title: 'ALTELE',
      instruction: 'Direcționează obiectul către compartimentul ALTELE',
    },
    HUMAN_CHECK: {
      icon: '⚠',
      title: 'VERIFICARE UMANĂ',
      instruction: 'Operatorul trebuie să decidă compartimentul corect',
    },
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 4500);
  }

  function setConnection(connected, text) {
    onlinePill.className = `system-pill ${connected ? '' : 'warning'}`;
    onlinePill.innerHTML = `<i></i> ${connected ? 'SYSTEM ONLINE' : text || 'AȘTEPT CONEXIUNEA'}`;
    liveBadge.textContent = connected ? 'LIVE' : 'WAITING';
    liveBadge.style.color = connected ? 'var(--green)' : 'var(--yellow)';
    connectionState.textContent = connected ? 'ONLINE' : 'OFFLINE';
    cameraState.textContent = connected ? 'ONLINE' : 'ÎN AȘTEPTARE';
    connectionDot.classList.toggle('off', !connected);
    cameraDot.classList.toggle('off', !connected);
    placeholder.hidden = connected;
  }

  function setVideoEffect(state, payload = {}) {
    const effectState = ['DETECTING', 'SCANNING', 'CAPTURED', 'ANALYZING'].includes(state)
      ? state
      : 'IDLE';
    videoWrap.dataset.scanState = effectState;

    const copy = {
      DETECTING: ['DETECTEZ OBIECTUL...', 'Procesare vision activă'],
      SCANNING: ['SCANARE... 3 · 2 · 1', 'Menține obiectul nemișcat'],
      CAPTURED: ['IMAGINE CAPTURATĂ', 'Cadrul este pregătit pentru analiză'],
      ANALYZING: ['ANALIZEZ CU AI...', 'Clasificarea este în curs'],
    };

    if (copy[effectState]) {
      remoteScanTitle.textContent =
        payload.displayMessage || payload.message || copy[effectState][0];
      remoteScanDetail.textContent = payload.detail || copy[effectState][1];
    }

    const aiBusy = state === 'ANALYZING';
    aiState.textContent = aiBusy ? 'ANALIZĂ' : state === 'ERROR' ? 'EROARE' : 'STANDBY';
    aiDot.classList.toggle('busy', aiBusy);
    aiDot.classList.toggle('error', state === 'ERROR');
  }

  function clearCategory() {
    document.querySelectorAll('.category-grid div').forEach((el) => el.classList.remove('active'));
    delete resultPanel.dataset.category;
  }

  function renderState(state, payload = {}) {
    clearCategory();
    setVideoEffect(state, payload);
    resultPanel.dataset.state = state;
    stateBadge.textContent = state;
    confidenceLine.hidden = true;

    const states = {
      READY: [
        '♻',
        'SMART RECYCLING STATION',
        'SYSTEM ONLINE',
        'Aștept obiect...',
        'Sistemul este pregătit pentru următoarea scanare.',
      ],
      DETECTING: [
        '◎',
        'OBJECT DETECTION ACTIVE',
        'DETECTEZ OBIECTUL',
        'Procesare vision activă',
        'Poziția obiectului este verificată.',
      ],
      SCANNING: [
        '⌗',
        'OBJECT DETECTION ACTIVE',
        'SCANNING...',
        'Menține obiectul nemișcat',
        'Captura automată va fi realizată imediat.',
      ],
      CAPTURED: [
        '◉',
        'FRAME CAPTURED',
        'IMAGINE CAPTURATĂ',
        'Pregătesc analiza AI',
        'Imaginea există doar temporar în memorie.',
      ],
      ANALYZING: [
        '◇',
        'AI VISION MODEL',
        'AI ANALYSIS IN PROGRESS',
        'Clasific obiectul...',
        'AI-ul alege una dintre cele patru categorii permise.',
      ],
      ERROR: [
        '⚠',
        'SYSTEM ERROR',
        'ANALIZA AI NU A PUTUT FI FINALIZATĂ',
        'Verifică telefonul și încearcă din nou',
        payload.message || 'Serviciul AI nu a răspuns corect.',
      ],
    };

    const content = states[state] || states.READY;
    [
      resultIcon.textContent,
      displayKicker.textContent,
      displayState.textContent,
      displayInstruction.textContent,
      displayReason.textContent,
    ] = content;
  }

  function renderResult(result) {
    const category = resultMap[result?.category] ? result.category : 'HUMAN_CHECK';
    const view = resultMap[category];
    setVideoEffect('RESULT');
    aiState.textContent = 'FINALIZAT';
    if (result?.special_case === 'FACE') {
      clearCategory();

      resultPanel.dataset.state = 'RESULT';
      resultPanel.dataset.category = 'HUMAN_CHECK';

      stateBadge.textContent = 'SCAN COMPLETE';
      resultIcon.textContent = '👤';
      displayKicker.textContent = 'SCANARE SPECIALĂ';
      displayState.textContent = 'OPERATOR DETECTAT';
      displayInstruction.textContent = 'Nu te putem recicla!';
      displayReason.textContent = 'Te rugăm să introduci un obiect în zona de scanare.';

      confidenceLine.hidden = true;
      return;
    }
    resultPanel.dataset.state = 'RESULT';
    resultPanel.dataset.category = category;
    stateBadge.textContent = 'SCAN COMPLETE';
    resultIcon.textContent = view.icon;
    displayKicker.textContent = 'REZULTAT ANALIZĂ AI';
    displayState.textContent = view.title;
    displayInstruction.textContent = view.instruction;
    displayReason.textContent =
      category === 'HUMAN_CHECK'
        ? 'AI-ul nu poate clasifica obiectul cu suficientă siguranță. Operatorul trebuie să decidă.'
        : result.reason || 'Clasificare finalizată.';
    document.querySelector(`.category-grid [data-category="${category}"]`)?.classList.add('active');

    if (typeof result.confidence === 'number' && result.confidence >= 0 && result.confidence <= 1) {
      confidenceValue.textContent = `${Math.round(result.confidence * 100)}%`;
      confidenceLine.hidden = false;
    } else {
      confidenceLine.hidden = true;
    }
  }

  function handleMessage(event) {
    const message = StationRTC.safeParse(event);
    if (!message || message.type !== 'state') return;
    if (message.state === 'RESULT') renderResult(message.result);
    else renderState(message.state, message);
  }

  function cleanupPeer() {
    pollController?.abort();
    channel?.close();
    peer?.close();
    video.srcObject = null;
    videoWrap.dataset.scanState = 'IDLE';
    channel = null;
    peer = null;
  }

  async function generateSession() {
    cleanupPeer();
    setConnection(false, 'PREGĂTESC SESIUNEA');
    renderState('READY');
    let attempts = 0;

    while (attempts < 8) {
      attempts += 1;
      const code = String(Math.floor(1000 + Math.random() * 9000));
      try {
        await StationRTC.createSession(code);
        sessionCode = code;
        sessionCodeEl.textContent = code;
        await prepareReceiver();
        return;
      } catch (error) {
        if (attempts === 8) {
          showToast(error.message || 'Nu pot genera codul sesiunii.');
          onlinePill.className = 'system-pill error';
          onlinePill.innerHTML = '<i></i> EROARE SIGNALING';
        }
      }
    }
  }

  async function prepareReceiver() {
    const generation = ++connectionGeneration;
    cleanupPeer();
    pollController = new AbortController();
    setConnection(false, 'AȘTEPT TELEFONUL');

    try {
      peer = StationRTC.createPeer();
      peer.ontrack = (event) => {
        video.srcObject = event.streams[0];
        video.play().catch(() => {});
      };
      peer.ondatachannel = (event) => {
        channel = event.channel;
        channel.onmessage = handleMessage;
        channel.onopen = () => {
          setConnection(true);
          renderState('READY');
        };
        channel.onclose = () => handleConnectionLoss(generation);
      };
      peer.onconnectionstatechange = () => {
        if (['failed', 'disconnected'].includes(peer.connectionState))
          handleConnectionLoss(generation);
      };

      const offer = await StationRTC.pollFor(sessionCode, 'offer', {
        timeoutMs: 15 * 60 * 1000,
        signal: pollController.signal,
      });
      if (generation !== connectionGeneration) return;
      await peer.setRemoteDescription(offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await StationRTC.waitForIceGathering(peer);
      await StationRTC.putSignal(sessionCode, 'answer', peer.localDescription);
    } catch (error) {
      if (error.name === 'AbortError') return;
      showToast(error.message || 'Conexiunea WebRTC nu a putut fi inițializată.');
      setConnection(false, 'EROARE CONEXIUNE');
    }
  }

  function handleConnectionLoss(generation) {
    if (generation !== connectionGeneration) return;
    setConnection(false, 'CONEXIUNE PIERDUTĂ');
    renderState('ERROR', { message: 'CONEXIUNE PIERDUTĂ. Reîncerc conectarea...' });
    setTimeout(async () => {
      if (generation !== connectionGeneration) return;
      try {
        await StationRTC.clearSignals(sessionCode);
        await prepareReceiver();
      } catch (error) {
        showToast('Reconectarea automată nu a reușit. Generează un cod nou.');
      }
    }, 2200);
  }

  $('#newSessionButton').addEventListener('click', generateSession);
  $('#fullscreenButton').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) {
      showToast('Browserul nu permite modul fullscreen.');
    }
  });
  window.addEventListener('beforeunload', cleanupPeer);

  setInterval(() => {
    $('#clock').textContent = new Date().toLocaleTimeString('ro-RO');
  }, 1000);
  $('#clock').textContent = new Date().toLocaleTimeString('ro-RO');
  generateSession();
})();
