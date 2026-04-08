/**
 * LLM Integration Helper
 * Uses Google Gemini API (free tier: 15 req/min, 1M tokens/min).
 * Reads GEMINI_API_KEY from environment. Falls back to a stub response if no key is set.
 * Get your free key at: https://aistudio.google.com/apikey
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function invokeLLM({ prompt, response_json_schema }) {
  if (!GEMINI_API_KEY) {
    console.warn('[invokeLLM] No GEMINI_API_KEY set — returning stub response');
    return buildStubResponse(response_json_schema);
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant. Respond only with valid JSON matching the requested schema. Do not include markdown fences or any text outside the JSON object.' }]
      },
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: response_json_schema,
        temperature: 0.7,
        maxOutputTokens: 2000
      }
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!content) {
    throw new Error('Gemini returned empty response');
  }

  return JSON.parse(content);
}

function buildStubResponse(schema) {
  if (!schema?.properties) return {};

  const stub = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    const typeDef = def as { type: string };
    if (typeDef.type === 'string') stub[key] = `[stub ${key}]`;
    else if (typeDef.type === 'number') stub[key] = 0;
    else if (typeDef.type === 'array') stub[key] = [];
    else if (typeDef.type === 'object') stub[key] = {};
    else stub[key] = null;
  }
  return stub;
}
