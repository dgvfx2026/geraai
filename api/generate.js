// GeraAI — Vercel Serverless Function
// Proxy seguro para Gemini API. A chave NUNCA fica exposta no frontend.
// Configurar no Vercel: Settings > Environment Variables > GEMINI_API_KEY

const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 8;       // max 8 req/min por IP

const rateLimitMap = new Map();

function getRateLimitEntry(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    const newEntry = { windowStart: now, count: 0 };
    rateLimitMap.set(ip, newEntry);
    return newEntry;
  }
  return entry;
}

// Limpa entradas antigas a cada 5 min para não vazar memória
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 5) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export default async function handler(req, res) {
  // CORS — permite o frontend chamar esta função
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting por IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const entry = getRateLimitEntry(ip);
  entry.count++;

  if (entry.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - entry.windowStart)) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'rate_limit',
      message_pt: `Muitas requisições. Aguarde ${retryAfter} segundos.`,
      message_en: `Too many requests. Please wait ${retryAfter} seconds.`,
      retryAfter
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured on server.' });
  }

  const { action, payload } = req.body || {};

  if (!action || !payload) {
    return res.status(400).json({ error: 'Missing action or payload.' });
  }

  try {
    if (action === 'generate_prompt') {
      return await handleGeneratePrompt(req, res, apiKey, payload);
    } else if (action === 'generate_image') {
      return await handleGenerateImage(req, res, apiKey, payload);
    } else if (action === 'optimize_prompt') {
      return await handleOptimizePrompt(req, res, apiKey, payload);
    } else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('GeraAI API error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}

// ─── Gerador de Prompts ─────────────────────────────────────────────────────

async function handleGeneratePrompt(req, res, apiKey, payload) {
  const { idea, category, style, depth, language } = payload;

  if (!idea) return res.status(400).json({ error: 'Missing idea.' });

  const systemPrompts = {
    image: {
      basic: `You are a professional prompt engineer specializing in AI image generation. 
Generate a high-quality prompt in BOTH Portuguese (Brazil) and English for the following AI image tool.
The prompt must be detailed, descriptive, and follow best practices for the specified tool.
Include: subject, environment/background, lighting, mood, style, camera/technical specs if applicable.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2"] }`,

      professional: `You are a world-class prompt engineer with deep expertise in AI image generation.
Create a professional-grade prompt in BOTH Portuguese (Brazil) and English.
Include: precise subject description, composition rules (rule of thirds, leading lines), lighting setup (3-point, rembrandt, etc.), color palette, mood, artistic style references, technical camera specs, negative elements to avoid.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3"] }`,

      ultra: `You are the world's foremost expert in AI image generation prompt engineering.
Create an ultra-detailed, cinematic-quality prompt in BOTH Portuguese (Brazil) and English.
Include ALL of: precise subject with micro-details, full composition breakdown, multi-layer lighting description, specific color grading, mood & atmosphere, art direction references (specific artists, films, eras), technical specs (camera, lens, f-stop, ISO, shutter speed), post-processing style, negative prompts, aspect ratio recommendation.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3", "tip4"] }`
    },
    text: {
      basic: `You are an expert prompt engineer for large language models (LLMs).
Generate a clear, effective prompt in BOTH Portuguese (Brazil) and English.
Include: role/persona assignment, context, specific instructions, expected output format.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2"] }`,

      professional: `You are a master prompt engineer specializing in LLMs like ChatGPT, Claude, and Gemini.
Create a professional, structured prompt in BOTH Portuguese (Brazil) and English using advanced techniques.
Include: expert persona, chain-of-thought instructions, constraints, output format specification, examples if helpful, temperature/style guidance.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3"] }`,

      ultra: `You are the world's top expert in LLM prompt engineering, having designed prompts for Fortune 500 companies.
Create an ultra-precise system prompt + user prompt in BOTH Portuguese (Brazil) and English.
Include: expert persona with credentials, step-by-step reasoning instructions, few-shot examples, output constraints, format specification, validation criteria, edge case handling.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3", "tip4"] }`
    },
    video: {
      basic: `You are a prompt engineer specializing in AI video generation tools like Sora, Runway, and Veo.
Generate a clear video generation prompt in BOTH Portuguese (Brazil) and English.
Include: scene description, camera movement, mood, duration/pacing.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2"] }`,

      professional: `You are a professional AI video director and prompt engineer.
Create a detailed video generation prompt in BOTH Portuguese (Brazil) and English.
Include: scene setup, subject action, camera movement (pan, dolly, zoom, crane), lighting, color grade, transition style, audio/music mood suggestion, pacing.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3"] }`,

      ultra: `You are an Oscar-winning cinematographer turned AI video prompt engineer.
Create a cinematic-level video prompt in BOTH Portuguese (Brazil) and English.
Include: full scene breakdown (establishing/medium/close), camera choreography, lighting design, color science, VFX notes, sound design direction, director reference, specific frame rate and resolution recommendations.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3", "tip4"] }`
    },
    code: {
      basic: `You are a senior software engineer and prompt engineer for AI coding tools like Cursor and GitHub Copilot.
Generate a clear, effective coding prompt in BOTH Portuguese (Brazil) and English.
Include: context, specific requirements, expected output.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2"] }`,

      professional: `You are a principal engineer at a top tech company, expert in AI coding tool prompt engineering.
Create a professional coding prompt in BOTH Portuguese (Brazil) and English.
Include: technical context, architecture pattern, code style guidelines, edge cases to handle, testing requirements, performance considerations.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3"] }`,

      ultra: `You are a CTO and systems architect with 20 years experience, expert in AI-assisted development.
Create a comprehensive technical prompt in BOTH Portuguese (Brazil) and English.
Include: full technical spec, architecture decisions, design patterns, security considerations, scalability requirements, testing strategy (unit/integration/e2e), documentation requirements, performance benchmarks, deployment considerations.
Format your response as valid JSON: { "pt": "...", "en": "...", "tips": ["tip1", "tip2", "tip3", "tip4"] }`
    }
  };

  const cat = category || 'image';
  const dep = depth || 'professional';
  const systemPrompt = systemPrompts[cat]?.[dep] || systemPrompts.image.professional;

  const styleNote = style && style !== 'none'
    ? `\n\nApply this style to the prompt: ${style}`
    : '';

  const userMessage = `Generate a prompt for this idea: "${idea}"${styleNote}\n\nRemember to respond ONLY with valid JSON, no markdown, no explanation outside the JSON.`;

  const MODEL = 'gemini-2.0-flash';

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 2048 }
      })
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.json();
    const detail = err?.error?.message || JSON.stringify(err);
    return res.status(geminiRes.status).json({
      error: `Gemini API error (${geminiRes.status}): ${detail}`,
      detail: err
    });
  }

  const geminiData = await geminiRes.json();
  const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Parse JSON da resposta (remove possíveis markdown code blocks)
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return res.status(500).json({ error: 'Invalid response format from AI', raw: rawText });
  }

  const result = JSON.parse(jsonMatch[0]);
  return res.status(200).json({ success: true, ...result });
}

// ─── Gerador de Imagens ──────────────────────────────────────────────────────

async function handleGenerateImage(req, res, apiKey, payload) {
  const { prompt } = payload;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt.' });

  const IMAGE_MODEL = 'gemini-2.0-flash-exp';

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `Generate a high-quality image based on this prompt: ${prompt}` }]
        }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 1
        }
      })
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.json();
    const detail = err?.error?.message || JSON.stringify(err);
    return res.status(geminiRes.status).json({
      error: `Gemini Image API error (${geminiRes.status}): ${detail}`,
      detail: err
    });
  }

  const data = await geminiRes.json();
  const parts = data.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith('image/')) {
      return res.status(200).json({
        success: true,
        imageBase64: part.inlineData.data,
        mimeType: part.inlineData.mimeType
      });
    }
  }

  return res.status(500).json({ error: 'No image generated by API.' });
}

// ─── Otimizador de Prompts ───────────────────────────────────────────────────

async function handleOptimizePrompt(req, res, apiKey, payload) {
  const { prompt, category } = payload;
  if (!prompt) return res.status(400).json({ error: 'Missing prompt.' });

  const systemPrompt = `You are a world-class prompt engineer. Your job is to take a weak, basic, or incomplete prompt and transform it into a professional, highly effective prompt.

Analyze what's missing and add: specificity, context, style, technical details, and structure.

Respond ONLY with valid JSON in this format:
{
  "original": "the original prompt as provided",
  "optimized_pt": "the improved prompt in Portuguese (Brazil)",
  "optimized_en": "the improved prompt in English",
  "improvements": ["improvement1", "improvement2", "improvement3"],
  "score_before": 3,
  "score_after": 9
}
Score is from 1-10. No markdown, no explanation outside JSON.`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [{ text: `Optimize this ${category || 'image'} prompt: "${prompt}"` }]
        }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
      })
    }
  );

  if (!geminiRes.ok) {
    const err = await geminiRes.json();
    const detail = err?.error?.message || JSON.stringify(err);
    return res.status(geminiRes.status).json({
      error: `Gemini API error (${geminiRes.status}): ${detail}`,
      detail: err
    });
  }

  const data = await geminiRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    return res.status(500).json({ error: 'Invalid response format', raw: rawText });
  }

  const result = JSON.parse(jsonMatch[0]);
  return res.status(200).json({ success: true, ...result });
}
