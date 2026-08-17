import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 5173);
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '128kb' }));

function isGreeting(text) {
  return /^(hi|hello|hey|heyy|hiya|salam|salaam|assalam[- ]o[- ]alaikum|aoa|good\s+(morning|afternoon|evening|night)|hola|bonjour|hallo|مرحبا|سلام|ہیلو|नमस्ते|你好|こんにちは|안녕하세요)\s*[!.?]*$/iu.test(
    String(text || '').trim()
  );
}

function round(n) { return Math.round(Number(n || 0)); }

// Deterministic, fast, offline-first answers derived straight from the live
// weather payload the client sends up. This mirrors the "fast-local" path in
// the Bitcoin dashboard's AI assistant.
function localAnswer(message, weather) {
  const q = String(message || '').trim().toLowerCase();
  const c = weather?.current || {};
  const daily = weather?.daily || [];
  const city = weather?.city || 'your location';
  const unit = weather?.unit === 'metric' ? '°C' : '°F';
  const today = daily[0];

  if (isGreeting(q)) {
    const t = round(c.temperature);
    const unitStr = unit === 'metric' ? '°C' : '°F';
    const cond = (c.condition || 'clear').toLowerCase();
    const hasData = c.temperature !== undefined && c.temperature !== null;
    if (hasData) {
      return `Hey! 👋 It's currently ${t}${unitStr} and ${cond} in ${city}. Ask me about rain chances, wind, what to wear, sunrise/sunset, or the week's forecast!`;
    }
    return `Hey! 👋 I'm your Weather assistant for ${city}. Ask me about rain chances, wind, what to wear, sunrise/sunset, or the week's forecast!`;
  }

  if (/umbrella|rain\s*today|will it rain|chance of rain/i.test(q)) {
    const chance = today?.precipChance ?? 0;
    if (chance >= 50) return `Yes — bring an umbrella. There's a ${chance}% chance of precipitation in ${city} today.`;
    if (chance >= 20) return `Maybe pack a light umbrella — ${city} has about a ${chance}% chance of rain today.`;
    return `You should be fine without one — only a ${chance}% chance of rain in ${city} today.`;
  }

  if (/what.*wear|dress|jacket|coat/i.test(q)) {
    const t = round(c.temperature);
    if (t <= (unit === '°F' ? 40 : 4)) return `It's ${t}${unit} in ${city} — wear a heavy coat, gloves, and layer up.`;
    if (t <= (unit === '°F' ? 60 : 15)) return `It's ${t}${unit} in ${city} — a jacket or light coat is a good call.`;
    if (t <= (unit === '°F' ? 75 : 24)) return `It's a mild ${t}${unit} in ${city} — a light layer should be enough.`;
    return `It's ${t}${unit} in ${city} — dress light, it's warm out.`;
  }

  if (/wind/i.test(q)) {
    return `Wind in ${city} is currently ${round(c.windSpeed)} ${weather?.unit === 'metric' ? 'km/h' : 'mph'} from the ${c.windDir || '—'}.`;
  }

  if (/humid/i.test(q)) {
    return `Humidity in ${city} is currently ${round(c.humidity)}%.`;
  }

  if (/pressure|barometer/i.test(q)) {
    return `Barometric pressure in ${city} is ${Number(c.pressure || 0).toFixed(2)} inHg right now.`;
  }

  if (/sunrise/i.test(q)) {
    return `Sunrise in ${city} today is at ${today?.sunrise || '—'}.`;
  }

  if (/sunset/i.test(q)) {
    return `Sunset in ${city} today is at ${today?.sunset || '—'}.`;
  }

  if (/tomorrow/i.test(q)) {
    const d = daily[1];
    if (!d) return `I don't have tomorrow's data loaded yet — try refreshing the forecast.`;
    return `Tomorrow in ${city}: ${d.condition}, high of ${round(d.high)}${unit} and a low of ${round(d.low)}${unit}, with a ${d.precipChance}% chance of rain.`;
  }

  if (/weekend/i.test(q)) {
    const weekendDays = daily.filter(d => d.isWeekend).slice(0, 2);
    if (!weekendDays.length) return `I don't have the weekend forecast loaded yet.`;
    return weekendDays.map(d => `${d.label}: ${d.condition}, ${round(d.high)}${unit}/${round(d.low)}${unit}`).join(' · ');
  }

  if (/hottest|warmest/i.test(q)) {
    const max = daily.reduce((a, b) => (b.high > (a?.high ?? -999) ? b : a), null);
    if (!max) return `Forecast data isn't loaded yet.`;
    return `${max.label} looks like the warmest day this week in ${city}, topping out at ${round(max.high)}${unit}.`;
  }

  if (/coldest|coolest/i.test(q)) {
    const min = daily.reduce((a, b) => (b.low < (a?.low ?? 999) ? b : a), null);
    if (!min) return `Forecast data isn't loaded yet.`;
    return `${min.label} looks like the coolest day this week in ${city}, dropping to ${round(min.low)}${unit}.`;
  }

  if (/temp|hot|cold|degree/i.test(q)) {
    return `It's currently ${round(c.temperature)}${unit} in ${city}, feels like ${round(c.feelsLike)}${unit}. Today's range is ${round(today?.low)}${unit}–${round(today?.high)}${unit}.`;
  }

  if (/week|forecast|next.*days/i.test(q)) {
    return daily.slice(0, 5).map(d => `${d.label}: ${d.condition}, ${round(d.high)}${unit}/${round(d.low)}${unit}`).join(' · ');
  }

  return `Right now in ${city}: ${c.condition}, ${round(c.temperature)}${unit === 'metric' ? '°C' : '°F'}. Ask me about rain chances, wind, sunrise/sunset, or the coming week.`;
}

function buildSystemPrompt(weather) {
  return `You are the Weather AI assistant embedded in a live weather dashboard.
Answer briefly and conversationally, grounded ONLY in the JSON snapshot below. If asked something the data can't answer, say so plainly rather than guessing.
Match the user's language (English, Roman Urdu, Urdu, etc.).

LIVE WEATHER SNAPSHOT:
${JSON.stringify(weather, null, 2)}`;
}

function normalizeHistory(conversation) {
  return (Array.isArray(conversation) ? conversation : [])
    .slice(-8)
    .map(item => ({
      role: item?.role === 'bot' ? 'model' : 'user',
      parts: [{ text: String(item?.text || '') }]
    }))
    .filter(item => item.parts[0].text.trim());
}

async function callGemini(message, weather, conversation) {
  const contents = [
    ...normalizeHistory(conversation),
    { role: 'user', parts: [{ text: String(message || '').trim() }] }
  ];

  const body = {
    systemInstruction: { parts: [{ text: buildSystemPrompt(weather) }] },
    contents,
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify(body)
    }
  );

  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || `Gemini request failed with ${response.status}`);

  const reply = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!reply) throw new Error('Gemini returned an empty response.');
  return reply;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ai: Boolean(GEMINI_API_KEY), model: GEMINI_MODEL });
});

app.post('/api/ai', async (req, res) => {
  const { message, weather, conversation = [] } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // Greetings always get the fast friendly local reply — no need for Gemini.
  if (isGreeting(message)) {
    const greetReply = localAnswer(message, weather);
    return res.json({ reply: greetReply, provider: 'local-greeting' });
  }

  const fastReply = localAnswer(message, weather);

  if (!GEMINI_API_KEY) {
    return res.json({ reply: fastReply, provider: 'local-fallback' });
  }

  try {
    const reply = await callGemini(message, weather, conversation);
    return res.json({ reply, provider: 'gemini', model: GEMINI_MODEL });
  } catch (error) {
    console.error('Gemini error:', error?.message || error);
    return res.json({ reply: fastReply, provider: 'local-fallback', warning: error?.message || 'Gemini unavailable.' });
  }
});

const distPath = path.join(__dirname, 'dist');
const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(distPath);

if (isProduction && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((_req, res) => { res.sendFile(path.join(distPath, 'index.html')); });
} else {
  const vite = await createViteServer({ root: __dirname, server: { middlewareMode: true, hmr: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(PORT, () => {
  console.log(`Weather Hub running at http://localhost:${PORT}`);
  console.log(GEMINI_API_KEY ? `AI enabled: ${GEMINI_MODEL}` : 'AI running on local fallback — add GEMINI_API_KEY to .env to enable Gemini for open-ended questions.');
});
