/**
 * gemini.js — Gemini 2.5 Flash Lite integration for Session Debrief AI
 * Sends ONLY the stats summary + emotional notes. NEVER the raw CSV.
 */
const GeminiAPI = (() => {
  const MODEL = 'gemini-2.5-flash-lite';
  const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const SYSTEM_PROMPT = `You are an institutional prop trading mentor — brutally honest, sarcastic, and zero-tolerance for excuses. You receive a trading session summary (statistics + emotional notes) and you produce a disciplined psychological debrief.

RESPOND ENTIRELY IN ENGLISH. No Spanish, no other languages.

You MUST respond with ONLY valid JSON matching this exact schema:
{
  "discipline_score": <integer 0-100>,
  "brutal_summary": "<2-3 sentence ruthless verdict on the trader's behavior today>",
  "detected_sins": [
    {"sin": "<sin name>", "evidence": "<specific evidence from the data>"}
  ],
  "action_plan_tomorrow": "<concrete, specific action plan for the next session>"
}

Scoring guide:
- 90-100: Institutional grade discipline. Rare.
- 70-89: Acceptable. Minor emotional leaks.
- 50-69: Average retail behavior. Significant issues.
- 30-49: Dangerous. Emotional trading detected.
- 0-29: Account destruction mode. Intervention required.

Common sins to detect: FOMO entries, revenge trading after losses, position sizing violations, holding losers too long, cutting winners too early, overtrading (too many trades), trading outside the plan, ignoring stop losses.

Be specific. Reference the actual numbers. Be merciless but constructive.`;

  async function analyze(statsSummary, emotionalNotes, apiKey) {
    const url = `${API_BASE}/${MODEL}:generateContent?key=${apiKey}`;

    const userContent = `TRADING SESSION DATA:

Statistics:
${JSON.stringify(statsSummary, null, 2)}

Trader's emotional notes:
"${emotionalNotes || 'No notes provided.'}"

Produce the debrief JSON now.`;

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userContent }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 1024,
        temperature: 0.9,
      }
    };

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${resp.status}`;
      throw new Error(categorizeError(resp.status, msg));
    }

    const data = await resp.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    try {
      return JSON.parse(raw);
    } catch(e) {
      throw new Error('AI returned malformed JSON. Please try again.');
    }
  }

  function categorizeError(status, msg) {
    if (status === 400 && msg.includes('API key')) return 'Invalid API key. Check your Gemini key.';
    if (status === 429) return 'Rate limit reached. Wait a moment and retry.';
    if (status === 500) return 'Gemini server error. Try again in a few seconds.';
    return `API error: ${msg}`;
  }

  return { analyze };
})();
