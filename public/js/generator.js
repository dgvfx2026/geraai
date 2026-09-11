// GeraAI — generator.js
// Motor de geração de prompts e imagens. Chama /api/generate (proxy seguro).

const API_URL = '/api/generate';

async function callAPI(action, payload) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload })
  });

  const data = await res.json();

  if (!res.ok) {
    if (data.error === 'rate_limit') {
      const lang = document.documentElement.lang || 'pt';
      throw new Error(lang === 'pt' ? data.message_pt : data.message_en);
    }
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return data;
}

/**
 * Gera um prompt profissional com base nos parâmetros fornecidos.
 * @param {Object} params
 * @param {string} params.idea - Ideia em linguagem natural
 * @param {string} params.category - 'image' | 'text' | 'video' | 'code'
 * @param {string} params.style - Ex: 'Realista', 'Cinematográfico', etc.
 * @param {string} params.depth - 'basic' | 'professional' | 'ultra'
 * @returns {Promise<{pt: string, en: string, tips: string[]}>}
 */
export async function generatePrompt({ idea, category, style, depth }) {
  return callAPI('generate_prompt', { idea, category, style, depth });
}

/**
 * Gera uma imagem usando Gemini 3.1 Flash Image (Nano Banana 2).
 * @param {string} prompt - Prompt em inglês para melhor resultado
 * @returns {Promise<{imageBase64: string, mimeType: string}>}
 */
export async function generateImage(prompt) {
  return callAPI('generate_image', { prompt });
}

/**
 * Otimiza um prompt existente.
 * @param {string} prompt - Prompt original (pode ser fraco/incompleto)
 * @param {string} category - Categoria do prompt
 * @returns {Promise<{original, optimized_pt, optimized_en, improvements, score_before, score_after}>}
 */
export async function optimizePrompt(prompt, category) {
  return callAPI('optimize_prompt', { prompt, category });
}
