const ALLOWED_CATEGORIES = new Set(['PLASTIC', 'PAPER', 'OTHER', 'HUMAN_CHECK']);
const DEMO_CATEGORIES = [
  { category: 'PLASTIC', reason: 'Mod demo: obiect simulat din plastic.' },
  { category: 'PAPER', reason: 'Mod demo: obiect simulat din hârtie sau carton.' },
  { category: 'BIO', reason: 'Mod demo: obiect simulat din produse biodegradabile.' },
  { category: 'OTHER', reason: 'Mod demo: obiect simulat din alt material.' },
  { category: 'HUMAN_CHECK', reason: 'Mod demo: clasificarea necesită verificarea operatorului.' },
];
const jsonHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: jsonHeaders });
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const content of item.content || []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

function validateResult(result) {
  return (
    result &&
    ALLOWED_CATEGORIES.has(result.category) &&
    typeof result.reason === 'string' &&
    result.reason.trim().length > 0
  );
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Metodă nepermisă.' }, 405);

  try {
    const body = await request.json();
    const image = body?.image;
    if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
      return json({ error: 'Imaginea trimisă nu este validă.' }, 400);
    }
    if (image.length > 5_500_000)
      return json({ error: 'Imaginea este prea mare pentru analiză.' }, 413);

    if (String(process.env.DEMO_MODE).toLowerCase() === 'true') {
      await new Promise((resolve) => setTimeout(resolve, 850));
      const result = DEMO_CATEGORIES[Math.floor(Math.random() * DEMO_CATEGORIES.length)];
      return json({ ...result, demo: true });
    }

    if (!process.env.OPENAI_API_KEY)
      return json(
        {
          error:
            'Cheia API pentru AI nu este configurată. Activează DEMO_MODE sau setează OPENAI_API_KEY.',
        },
        503
      );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let aiResponse;
    try {
      aiResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'content-type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          max_output_tokens: 180,
          input: [
            {
              role: 'system',
              content:
                'Ești componenta vision a unei stații educaționale de reciclare. Analizează numai obiectul principal din zona centrală. Alege exact o categorie: PLASTIC pentru obiecte predominant din plastic; PAPER pentru hârtie sau carton; BIO pentru deșeuri organice; OTHER pentru metal, sticlă, textile, ori orice alt material; HUMAN_CHECK dacă obiectul nu este vizibil clar, sunt mai multe obiecte, materialul este mixt sau există ambiguitate. Nu ghici. Nu inventa categorii. Scrie motivul în limba română, într-o singură propoziție scurtă.Dacă subiectul principal al imaginii este o persoană sau o față umană,folosește category HUMAN_CHECK și special_case FACE. Nu identifica persoana și nu deduce vârsta, sexul sau alte caracteristici.Pentru toate celelalte imagini folosește special_case NONE.',
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Clasifică obiectul principal pentru compartimentul corect.',
                },
                { type: 'input_image', image_url: image, detail: 'low' },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'recycling_classification',
              strict: true,
              schema: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['PLASTIC', 'PAPER', 'BIO', 'OTHER', 'HUMAN_CHECK'],
                  },
                  special_case: {
                    type: 'string',
                    enum: ['NONE', 'FACE'],
                  },
                  reason: { type: 'string' },
                },
                required: ['category', 'special_case', 'reason'],
                additionalProperties: false,
              },
            },
          },
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    const apiData = await aiResponse.json().catch(() => ({}));
    if (!aiResponse.ok) {
      console.error('AI API error', aiResponse.status, apiData?.error?.message || 'Unknown error');
      return json({ error: 'Serviciul AI nu a putut analiza imaginea.' }, 502);
    }

    const outputText = extractOutputText(apiData);
    if (!outputText)
      return json({ error: 'Modelul AI nu a returnat un rezultat utilizabil.' }, 502);

    let result;
    try {
      result = JSON.parse(outputText);
    } catch (_) {
      return json({ error: 'Modelul AI a returnat un răspuns invalid.' }, 502);
    }
    if (!validateResult(result))
      return json({ error: 'Categoria returnată de AI nu este permisă.' }, 502);

    return json({ category: result.category, reason: result.reason.trim() });
  } catch (error) {
    console.error('Analyze image error', error);
    if (error.name === 'AbortError')
      return json({ error: 'Analiza AI a durat prea mult și a fost oprită.' }, 504);
    return json({ error: 'Analiza AI nu a putut fi finalizată.' }, 500);
  }
}

export const config = { path: '/.netlify/functions/analyze-image' };
