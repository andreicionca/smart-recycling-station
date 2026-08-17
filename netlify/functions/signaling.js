import { getStore } from "@netlify/blobs";

const SESSION_TTL_MS = 15 * 60 * 1000;
const ALLOWED_TYPES = new Set(["offer", "answer"]);
const jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function validCode(code) {
  return typeof code === "string" && /^\d{4}$/.test(code);
}

function key(code, type) {
  return `sessions/${code}/${type}`;
}

export default async function handler(request) {
  const store = getStore({ name: "smart-recycling-signaling", consistency: "strong" });

  try {
    if (request.method === "GET") {
      const url = new URL(request.url);
      const code = url.searchParams.get("code");
      const type = url.searchParams.get("type");
      if (!validCode(code) || !ALLOWED_TYPES.has(type)) return json({ error: "Parametri de signaling invalizi." }, 400);

      const session = await store.get(key(code, "session"), { type: "json" });
      if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) return json({ error: "Sesiunea nu există sau a expirat." }, 404);

      const value = await store.get(key(code, type), { type: "json" });
      return value ? json({ value }) : json({ error: "Semnalul nu este încă disponibil." }, 404);
    }

    if (request.method !== "POST") return json({ error: "Metodă nepermisă." }, 405);
    const body = await request.json();
    const { action, code, type, value } = body || {};
    if (!validCode(code)) return json({ error: "Codul sesiunii trebuie să aibă 4 cifre." }, 400);

    if (action === "create") {
      const sessionKey = key(code, "session");
      const existing = await store.get(sessionKey, { type: "json" });
      if (existing && Date.now() - existing.createdAt <= SESSION_TTL_MS) return json({ error: "Codul este deja folosit. Generează alt cod." }, 409);
      if (existing) {
        await Promise.all([store.delete(sessionKey), store.delete(key(code, "offer")), store.delete(key(code, "answer"))]);
      }
      const { modified } = await store.setJSON(sessionKey, { createdAt: Date.now() }, { onlyIfNew: true });
      return modified ? json({ ok: true, expiresIn: SESSION_TTL_MS }) : json({ error: "Codul este deja folosit." }, 409);
    }

    const session = await store.get(key(code, "session"), { type: "json" });
    if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) return json({ error: "Sesiunea nu există sau a expirat." }, 404);

    if (action === "put") {
      if (!ALLOWED_TYPES.has(type) || !value || !["offer", "answer"].includes(value.type) || typeof value.sdp !== "string") {
        return json({ error: "Descriere WebRTC invalidă." }, 400);
      }
      if (value.sdp.length > 100_000) return json({ error: "Descriere WebRTC prea mare." }, 413);
      await store.setJSON(key(code, type), { type: value.type, sdp: value.sdp });
      return json({ ok: true });
    }

    if (action === "clear") {
      await Promise.all([store.delete(key(code, "offer")), store.delete(key(code, "answer"))]);
      return json({ ok: true });
    }

    return json({ error: "Acțiune necunoscută." }, 400);
  } catch (error) {
    console.error("Signaling error", error);
    return json({ error: "Serviciul temporar de conectare nu este disponibil." }, 500);
  }
}

export const config = { path: "/.netlify/functions/signaling" };
