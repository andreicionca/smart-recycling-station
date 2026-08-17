/* Shared WebRTC + Netlify signaling helpers. No framework, no permanent data. */
(function () {
  "use strict";

  const SIGNAL_URL = "/.netlify/functions/signaling";
  const ICE_SERVERS = [{ urls: "stun:stun.cloudflare.com:3478" }];

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function request(action, payload = {}, method = "POST") {
    const response = await fetch(SIGNAL_URL, {
      method,
      headers: { "content-type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify({ action, ...payload }),
      cache: "no-store"
    });

    let data = {};
    try { data = await response.json(); } catch (_) { /* handled below */ }
    if (!response.ok) throw new Error(data.error || "Serviciul de conectare nu răspunde.");
    return data;
  }

  async function getSignal(code, type) {
    const response = await fetch(`${SIGNAL_URL}?code=${encodeURIComponent(code)}&type=${encodeURIComponent(type)}`, {
      cache: "no-store"
    });
    if (response.status === 404) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Nu pot citi datele conexiunii.");
    return data.value;
  }

  async function putSignal(code, type, value) {
    return request("put", { code, type, value });
  }

  async function clearSignals(code) {
    return request("clear", { code });
  }

  function createPeer() {
    return new RTCPeerConnection({ iceServers: ICE_SERVERS });
  }

  function waitForIceGathering(peer, timeoutMs = 8000) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const timeout = setTimeout(done, timeoutMs);
      function done() {
        clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
      function check() {
        if (peer.iceGatheringState === "complete") done();
      }
      peer.addEventListener("icegatheringstatechange", check);
    });
  }

  async function pollFor(code, type, { timeoutMs = 45000, intervalMs = 900, signal } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw new DOMException("Conectare anulată", "AbortError");
      const value = await getSignal(code, type);
      if (value) return value;
      await wait(intervalMs);
    }
    throw new Error("Conectarea a expirat. Verifică codul și încearcă din nou.");
  }

  function sendMessage(channel, message) {
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify({ ...message, sentAt: Date.now() }));
    return true;
  }

  function safeParse(event) {
    try { return JSON.parse(event.data); } catch (_) { return null; }
  }

  window.StationRTC = {
    createSession: (code) => request("create", { code }),
    putSignal,
    getSignal,
    clearSignals,
    createPeer,
    waitForIceGathering,
    pollFor,
    sendMessage,
    safeParse,
    wait
  };
})();
