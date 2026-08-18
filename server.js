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
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-pro-preview';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

app.use(cors());
app.use(express.json({ limit: '256kb' }));

function isGreeting(text) {
  return /^(hi|hello|hey+|hiya|yo|salam|salaam|assalam[- ]o[- ]alaikum|aoa|good\s+(morning|afternoon|evening|night)|hola|bonjour|hallo|مرحبا|سلام|ہیلو|नमस्ते|你好|こんにちは|안녕하세요)\s*[!.?]*$/iu.test(
    String(text || '').trim()
  );
}

function round(n) { return Math.round(Number(n || 0)); }

function describeHumidity(h) {
  if (h >= 80) return 'very high (oppressively humid)';
  if (h >= 60) return 'moderately high (feels sticky)';
  if (h >= 40) return 'comfortable';
  if (h >= 20) return 'low (dry air)';
  return 'very low (extremely dry)';
}

function describeWind(speed, unit) {
  const kmh = unit === 'metric' ? speed : speed * 1.60934;
  if (kmh >= 89) return 'storm-force (dangerous, stay indoors)';
  if (kmh >= 62) return 'strong gale (very difficult to walk against)';
  if (kmh >= 39) return 'fresh gale (twigs break, walking impeded)';
  if (kmh >= 29) return 'strong breeze (large branches move)';
  if (kmh >= 20) return 'fresh breeze (small trees sway)';
  if (kmh >= 12) return 'gentle breeze (leaves rustle)';
  if (kmh >= 6) return 'light breeze (wind felt on face)';
  return 'calm';
}

function feelDescription(feels, temp, unit) {
  const diff = feels - temp;
  if (Math.abs(diff) <= 1) return 'feels exactly as expected';
  if (diff > 0) return `feels warmer than the actual temperature due to humidity`;
  return `feels colder than the actual temperature due to wind chill`;
}

function uvRisk(uv) {
  if (!uv && uv !== 0) return null;
  if (uv <= 2) return 'low — no protection needed';
  if (uv <= 5) return 'moderate — wear sunscreen if outside for long';
  if (uv <= 7) return 'high — wear SPF 30+, hat, and sunglasses';
  if (uv <= 10) return 'very high — minimise outdoor exposure 10am–4pm';
  return 'extreme — avoid outdoor exposure; protective clothing essential';
}

function precipDescription(chance) {
  if (chance >= 80) return 'almost certain';
  if (chance >= 60) return 'likely';
  if (chance >= 40) return 'possible';
  if (chance >= 20) return 'slight chance';
  return 'very unlikely';
}

// ── Rich, mature local answer engine ─────────────────────────────────────────
function localAnswer(message, weather) {
  const q = String(message || '').trim().toLowerCase();
  const c = weather?.current || {};
  const daily = weather?.daily || [];
  const city = weather?.city || 'your location';
  const isMetric = weather?.unit === 'metric';
  const unit = isMetric ? '°C' : '°F';
  const speedUnit = isMetric ? 'km/h' : 'mph';
  const today = daily[0];
  const tomorrow = daily[1];

  // ── Greeting ────────────────────────────────────────────────────────────────
  if (isGreeting(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const cond = (c.condition || 'clear').toLowerCase();
    const hasData = c.temperature !== undefined && c.temperature !== null;
    if (hasData) {
      const extra = today?.precipChance >= 40
        ? ` There's a ${today.precipChance}% chance of rain today, so keep an umbrella handy.`
        : '';
      return `Hello! 👋 Right now in **${city}** it's **${t}${unit}** and ${cond}, feeling like ${feels}${unit}.${extra} I'm your weather expert — ask me anything about current conditions, forecasts, what to wear, air quality, UV index, or planning around the weather.`;
    }
    return `Hello! 👋 I'm your Weather AI for **${city}**. I can help with real-time conditions, the weekly forecast, clothing recommendations, rain probability, wind analysis, UV index, and much more. What would you like to know?`;
  }

  // ── Current conditions (comprehensive) ───────────────────────────────────
  if (/^(what'?s|what is|how'?s|how is|current|right now|outside|conditions)\b.*?(weather|condition|temp|like)/i.test(q) || /^weather$/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const hum = round(c.humidity);
    const wind = round(c.windSpeed);
    const precip = today?.precipChance ?? 0;
    const uvText = uvRisk(c.uv) ? ` UV index is ${c.uv} — ${uvRisk(c.uv)}.` : '';
    return `**Current conditions in ${city}:**\n\n🌡️ **${t}${unit}** (feels like ${feels}${unit}) — ${feelDescription(feels, t, unit)}\n☁️ Condition: **${c.condition || 'Clear'}**\n💧 Humidity: ${hum}% — ${describeHumidity(hum)}\n💨 Wind: ${wind} ${speedUnit} from the ${c.windDir || '—'} — ${describeWind(wind, weather?.unit)}\n🌧️ Rain today: ${precip}% — ${precipDescription(precip)}${uvText}`;
  }

  // ── Rain / Umbrella ───────────────────────────────────────────────────────
  if (/umbrella|will it rain|rain today|chance of rain|is it going to rain|rain forecast|precipitation/i.test(q)) {
    const chance = today?.precipChance ?? 0;
    const weekly = daily.slice(0, 7).filter(d => (d.precipChance ?? 0) >= 40);
    const weeklyNote = weekly.length
      ? ` Looking at this week, rain is expected on: ${weekly.map(d => `${d.label} (${d.precipChance}%)`).join(', ')}.`
      : ' The rest of the week looks mostly dry.';
    if (chance >= 70) return `☔ **Yes, definitely bring an umbrella.** There's a **${chance}% chance of precipitation** in ${city} today — that's high enough to expect actual rain.${weeklyNote}`;
    if (chance >= 40) return `🌂 **Probably a good idea to pack an umbrella.** Rain probability in ${city} today is **${chance}%** — noticeably likely. It may not pour all day, but you could get caught in a shower.${weeklyNote}`;
    if (chance >= 15) return `🌦️ **Rain is possible but not likely** — ${chance}% chance in ${city} today. You could skip the umbrella, but a compact one wouldn't hurt if you'll be out for hours.${weeklyNote}`;
    return `☀️ **No umbrella needed.** Only a **${chance}%** chance of precipitation in ${city} today — essentially negligible.${weeklyNote}`;
  }

  // ── What to wear ─────────────────────────────────────────────────────────
  if (/what.*wear|dress|outfit|clothing|jacket|coat|attire|how.*dress/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const hum = round(c.humidity);
    const rain = today?.precipChance ?? 0;
    const rainNote = rain >= 40 ? '\n🌂 **Waterproof layer recommended** — there\'s a decent chance of rain today.' : '';
    const humNote = hum >= 70 ? '\n💧 High humidity — choose breathable fabrics like cotton or linen.' : '';

    let outfit;
    if (feels <= (isMetric ? 0 : 32)) {
      outfit = '🧥 **Heavy winter coat**, thermal underlayer, warm hat, scarf, and insulated gloves. Frostbite risk if exposed skin — cover up fully.';
    } else if (feels <= (isMetric ? 8 : 46)) {
      outfit = '🧥 **Heavy coat or parka** with a warm mid-layer (fleece or wool sweater). Gloves and a hat are a smart idea.';
    } else if (feels <= (isMetric ? 15 : 59)) {
      outfit = '🧣 **Light to medium jacket** (denim jacket, bomber, or hoodie). Long trousers recommended. You won\'t need heavy gear, but a jacket is essential.';
    } else if (feels <= (isMetric ? 22 : 72)) {
      outfit = '👕 **Light layers** — a long-sleeve shirt or thin cardigan works well. Jeans or chinos are comfortable at this temperature.';
    } else if (feels <= (isMetric ? 28 : 82)) {
      outfit = '👗 **Light, casual clothes** — t-shirt, light trousers or shorts. Very comfortable weather; no jacket needed.';
    } else {
      outfit = '🩳 **Minimal, breathable clothing** — light cotton or moisture-wicking fabrics. Stay hydrated and seek shade during peak heat hours.';
    }
    return `**Clothing advice for ${city} (${t}${unit}, feels like ${feels}${unit}):**\n\n${outfit}${rainNote}${humNote}`;
  }

  // ── Temperature ───────────────────────────────────────────────────────────
  if (/\btemp(erature)?\b|how hot|how cold|how warm|degrees|thermometer/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const hi = round(today?.high);
    const lo = round(today?.low);
    return `**Temperature in ${city}:**\n\n🌡️ Currently **${t}${unit}** — feels like **${feels}${unit}** (${feelDescription(feels, t, isMetric ? 'metric' : 'imperial')})\n📈 Today's high: **${hi}${unit}** · 📉 Low: **${lo}${unit}**\n\nThe ${hi - lo}${unit} swing today is ${(hi - lo) > (isMetric ? 12 : 22) ? 'quite large — dress in layers' : 'relatively mild'}.`;
  }

  // ── Wind ─────────────────────────────────────────────────────────────────
  if (/wind|breeze|gust|gale|storm/i.test(q)) {
    const speed = round(c.windSpeed);
    const dir = c.windDir || '—';
    const desc = describeWind(speed, weather?.unit);
    const danger = speed > (isMetric ? 60 : 37) ? '\n⚠️ **Strong winds** — avoid driving high-sided vehicles and secure loose outdoor items.' : '';
    return `**Wind conditions in ${city}:**\n\n💨 **${speed} ${speedUnit}** from the **${dir}**\n📊 Classification: ${desc}${danger}\n\nWind direction from the ${dir} means ${dir.includes('N') ? 'cooler air moving in' : dir.includes('S') ? 'warmer air from the south' : 'variable temperatures possible'}.`;
  }

  // ── Humidity ─────────────────────────────────────────────────────────────
  if (/humid(ity)?|moisture|damp|muggy|sticky|dry air/i.test(q)) {
    const h = round(c.humidity);
    const desc = describeHumidity(h);
    const dewPoint = round(c.temperature - ((100 - h) / 5));
    const advice = h >= 70
      ? 'Stay cool, choose breathable fabrics, and stay hydrated. High humidity makes heat feel more intense.'
      : h <= 30
        ? 'Dry air can cause skin irritation and dehydration. Use moisturiser and drink plenty of water.'
        : 'Conditions are comfortable for most outdoor activities.';
    return `**Humidity in ${city}:**\n\n💧 **${h}%** — ${desc}\n🌡️ Estimated dew point: **${dewPoint}${unit}**\n\n💡 ${advice}`;
  }

  // ── Pressure ─────────────────────────────────────────────────────────────
  if (/pressure|barometer|barometric|hpa|mb|millibars/i.test(q)) {
    const p = Number(c.pressure || 0);
    const trend = p < 1000 ? 'low — stormy or unsettled weather likely' : p < 1013 ? 'slightly below normal — change possible' : p < 1025 ? 'normal — stable conditions' : 'high — settled, fair weather expected';
    return `**Barometric pressure in ${city}:**\n\n📊 **${p.toFixed(1)} hPa** (${(p * 0.02953).toFixed(2)} inHg)\n📈 Reading: ${trend}\n\nRapid pressure drops signal approaching storms; rising pressure indicates clearing skies.`;
  }

  // ── UV Index ─────────────────────────────────────────────────────────────
  if (/uv|ultraviolet|sunburn|sun protection|spf/i.test(q)) {
    const uv = c.uv;
    if (!uv && uv !== 0) return `UV index data isn't available in the current weather snapshot for ${city}. Generally, UV is highest between 10am and 4pm — apply SPF 30+ if you'll be outdoors.`;
    const risk = uvRisk(uv);
    return `**UV Index in ${city}:**\n\n☀️ UV Index: **${uv}** — ${risk}\n\n💡 Peak UV hours are typically **10am–4pm**. Even on cloudy days, up to 80% of UV rays reach the ground.`;
  }

  // ── Sunrise / Sunset ─────────────────────────────────────────────────────
  if (/sunrise|dawn|first light/i.test(q)) {
    const sr = today?.sunrise || '—';
    return `🌅 **Sunrise in ${city}** today: **${sr}**\n\nGolden hour (best for photography) lasts about 30–60 minutes after sunrise.`;
  }
  if (/sunset|dusk|golden hour|nightfall/i.test(q)) {
    const ss = today?.sunset || '—';
    return `🌇 **Sunset in ${city}** today: **${ss}**\n\nGolden hour begins roughly 60 minutes before sunset — ideal for outdoor photography and evening walks.`;
  }

  // ── Tomorrow ─────────────────────────────────────────────────────────────
  if (/tomorrow/i.test(q)) {
    const d = tomorrow;
    if (!d) return `Tomorrow's forecast isn't loaded yet for ${city}. Try refreshing the app.`;
    const precip = d.precipChance ?? 0;
    const advice = precip >= 40 ? 'Expect rain — have a jacket and umbrella ready.' : 'Looks like a relatively dry day.';
    return `**Tomorrow's forecast for ${city}:**\n\n☁️ ${d.condition}\n📈 High: **${round(d.high)}${unit}** · 📉 Low: **${round(d.low)}${unit}**\n🌧️ Rain probability: **${precip}%** — ${precipDescription(precip)}\n\n💡 ${advice}`;
  }

  // ── Weekend ───────────────────────────────────────────────────────────────
  if (/weekend|saturday|sunday/i.test(q)) {
    const weekendDays = daily.filter(d => d.isWeekend).slice(0, 2);
    if (!weekendDays.length) return `Weekend forecast data isn't available yet for ${city}.`;
    const lines = weekendDays.map(d => `**${d.label}:** ${d.condition} · High ${round(d.high)}${unit} / Low ${round(d.low)}${unit} · Rain: ${d.precipChance ?? 0}%`).join('\n');
    const outdoor = weekendDays.every(d => (d.precipChance ?? 0) < 30 && round(d.high) > (isMetric ? 15 : 59)) ? 'Looks like a great weekend for outdoor activities! 🎉' : 'You may want to plan indoor options as a backup.';
    return `**Weekend forecast for ${city}:**\n\n${lines}\n\n💡 ${outdoor}`;
  }

  // ── Weekly forecast ───────────────────────────────────────────────────────
  if (/week|7.?day|next.*day|forecast|coming day/i.test(q)) {
    if (!daily.length) return `Weekly forecast data isn't loaded yet for ${city}.`;
    const lines = daily.slice(0, 7).map(d => `**${d.label}:** ${d.condition} · ${round(d.high)}${unit}/${round(d.low)}${unit} · 🌧️ ${d.precipChance ?? 0}%`).join('\n');
    const maxDay = daily.slice(0, 7).reduce((a, b) => b.high > (a?.high ?? -999) ? b : a, null);
    const minDay = daily.slice(0, 7).reduce((a, b) => b.low < (a?.low ?? 999) ? b : a, null);
    return `**7-Day Forecast for ${city}:**\n\n${lines}\n\n🔥 Hottest: **${maxDay?.label}** at ${round(maxDay?.high)}${unit}\n❄️ Coldest night: **${minDay?.label}** dropping to ${round(minDay?.low)}${unit}`;
  }

  // ── Hottest / Warmest ─────────────────────────────────────────────────────
  if (/hottest|warmest|highest temp/i.test(q)) {
    const max = daily.reduce((a, b) => b.high > (a?.high ?? -999) ? b : a, null);
    if (!max) return `Forecast data isn't loaded yet for ${city}.`;
    return `🔥 **${max.label}** is the hottest day in the forecast for ${city}, with a high of **${round(max.high)}${unit}**. Plan outdoor activities early morning or late evening to avoid peak heat.`;
  }

  // ── Coldest / Coolest ─────────────────────────────────────────────────────
  if (/coldest|coolest|lowest temp|coldest night/i.test(q)) {
    const min = daily.reduce((a, b) => b.low < (a?.low ?? 999) ? b : a, null);
    if (!min) return `Forecast data isn't loaded yet for ${city}.`;
    return `❄️ **${min.label}** is the coldest night in the forecast for ${city}, dropping to **${round(min.low)}${unit}**. ${round(min.low) <= (isMetric ? 0 : 32) ? 'Freezing temperatures expected — protect pipes and plants.' : 'Layer up if you\'re going out at night.'}`;
  }

  // ── Visibility / Fog ─────────────────────────────────────────────────────
  if (/visib|fog|mist|haze/i.test(q)) {
    const v = c.visibility;
    if (!v && v !== 0) return `Visibility data isn't in the current snapshot for ${city}. Check conditions outside — fog and mist are most common in early mornings and after rain.`;
    const vKm = isMetric ? v : v * 1.60934;
    const desc = vKm < 1 ? 'very poor (dense fog — drive extremely carefully)' : vKm < 4 ? 'poor (foggy — use low-beam headlights)' : vKm < 10 ? 'moderate (light haze)' : 'good (clear sightlines)';
    return `**Visibility in ${city}:** ${v} ${isMetric ? 'km' : 'mi'} — ${desc}`;
  }

  // ── Is it safe to go outside / outdoor activity ───────────────────────────
  if (/safe.*outside|go outside|outdoor|picnic|hike|run|jog|exercise|sport|play.*outside/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const rain = today?.precipChance ?? 0;
    const wind = round(c.windSpeed);
    const windDanger = wind > (isMetric ? 60 : 37);
    const uvVal = c.uv;
    const uvHigh = uvVal && uvVal >= 6;
    const issues = [];
    if (rain >= 60) issues.push('heavy rain likely');
    if (windDanger) issues.push('dangerous wind speeds');
    if (uvHigh) issues.push(`very high UV index (${uvVal})`);
    if (feels > (isMetric ? 38 : 100)) issues.push('extreme heat — heat stroke risk');
    if (feels < (isMetric ? -10 : 14)) issues.push('extreme cold — frostbite risk');

    if (issues.length) {
      return `⚠️ **Caution advised for outdoor activity in ${city}:** ${issues.join(', ')}.\n\nCurrent: ${t}${unit} (feels like ${feels}${unit}), wind ${wind} ${speedUnit}, rain chance ${rain}%. Consider rescheduling or taking appropriate precautions.`;
    }
    return `✅ **Conditions look good for outdoor activity in ${city}!**\n\nIt's ${t}${unit} (feels like ${feels}${unit}), wind is ${wind} ${speedUnit}, and rain chance is just ${rain}%. ${today?.sunrise && today?.sunset ? `Daylight from ${today.sunrise} to ${today.sunset}.` : ''} Enjoy your time outside! 🌿`;
  }

  // ── Air quality ───────────────────────────────────────────────────────────
  if (/air quality|aqi|pollution|smog|particulate|pm2|pm10/i.test(q)) {
    const aqi = c.aqi;
    if (!aqi && aqi !== 0) return `Air quality index (AQI) data isn't currently available in the weather snapshot for ${city}. For accurate AQI readings, I'd recommend checking IQAir, AirVisual, or your local environmental agency.`;
    const desc = aqi <= 50 ? 'Good — air quality is satisfactory' : aqi <= 100 ? 'Moderate — acceptable but unusually sensitive people may be affected' : aqi <= 150 ? 'Unhealthy for Sensitive Groups — reduce prolonged outdoor exertion' : aqi <= 200 ? 'Unhealthy — everyone may experience effects' : 'Very Unhealthy — health alert, avoid outdoor activity';
    return `**Air Quality in ${city}:** AQI **${aqi}** — ${desc}.`;
  }

  // ── Snow / Frost / Ice ────────────────────────────────────────────────────
  if (/snow|frost|ice|frozen|blizzard|sleet/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const freezing = isMetric ? 0 : 32;
    if (t > freezing + (isMetric ? 5 : 9) && feels > freezing) {
      return `❄️ **No snow or frost expected in ${city}** based on current data. At ${t}${unit} (feels like ${feels}${unit}), temperatures are well above freezing. ${(c.condition || '').toLowerCase().includes('snow') ? 'However, the condition shows snow — this may be residual or at elevation.' : ''}`;
    }
    if (feels <= freezing) {
      return `🌨️ **Freezing conditions in ${city}.** Temperature feels like ${feels}${unit} — at or below freezing. ${(today?.precipChance ?? 0) >= 30 ? 'With a ' + today.precipChance + '% precipitation chance, snow or sleet is possible.' : 'Frost and ice on roads are likely — drive carefully and watch for black ice.'} Wear full winter gear.`;
    }
    return `🌡️ **Near-freezing in ${city}** — it's ${t}${unit}, feels like ${feels}${unit}. Frost overnight is possible, especially on clear nights. Check conditions before early morning travel.`;
  }

  // ── Heat / Heatwave ───────────────────────────────────────────────────────
  if (/heat wave|heatwave|extreme heat|too hot|very hot/i.test(q)) {
    const t = round(c.temperature);
    const feels = round(c.feelsLike);
    const threshold = isMetric ? 35 : 95;
    if (feels >= threshold) {
      return `🌡️ **Extreme heat in ${city}!** At ${t}${unit} (feels like ${feels}${unit}), this is potentially dangerous.\n\n⚠️ **Stay safe:**\n• Drink at least 2–3 litres of water per day\n• Avoid sun exposure 11am–4pm\n• Wear light-coloured, loose clothing\n• Never leave children or pets in parked cars\n• Check on elderly neighbours`;
    }
    return `🌞 **It's warm in ${city}** — ${t}${unit} (feels like ${feels}${unit}), but not at dangerous heatwave levels. Stay hydrated and take breaks in the shade if active.`;
  }

  // ── Generic / Unknown ─────────────────────────────────────────────────────
  const t = round(c.temperature);
  const feels = round(c.feelsLike);
  const rain = today?.precipChance ?? 0;
  const wind = round(c.windSpeed);
  return `**${city} right now:** ${c.condition || 'Clear'} · **${t}${unit}** (feels like ${feels}${unit}) · 💧 ${round(c.humidity)}% humidity · 💨 ${wind} ${speedUnit} · 🌧️ ${rain}% rain chance\n\nI can answer questions about temperature, rain, wind, humidity, UV index, what to wear, the weekly forecast, sunrise/sunset, outdoor safety, and more. Just ask!`;
}

// ── Expert system prompt ──────────────────────────────────────────────────────
function buildSystemPrompt(weather) {
  const isMetric = weather?.unit === 'metric';
  const c = weather?.current || {};
  const daily = weather?.daily || [];
  const now = new Date().toLocaleString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `You are **WeatherAI** — an expert meteorologist and personal weather assistant embedded in a live weather dashboard. You have deep knowledge of atmospheric science, climate patterns, and practical weather advice.

## Your Personality
- Warm, confident, and knowledgeable — like a trusted local meteorologist
- You give **complete, useful answers** — never one-liners for complex questions
- You proactively add relevant context (e.g., if asked about rain, mention UV too if it's high)
- You are empathetic — acknowledge if weather is uncomfortable and offer practical solutions
- You match the user's language exactly (English, Roman Urdu, Urdu, French, etc.)

## Answer Quality Standards
- **Always be specific** — use the actual numbers from the snapshot, not vague terms
- **Explain the "why"** when relevant (e.g., "feels colder due to wind chill")
- **Give actionable advice** for health, safety, clothing, travel, and outdoor activities
- **Use rich formatting**: bold key data, use emoji sparingly for readability
- For multi-part questions, answer each part clearly
- For questions outside the weather data, use your meteorological knowledge but clearly state it's general knowledge, not live data

## What You Can Answer
1. **Live conditions** — temperature, humidity, wind, pressure, UV, visibility, conditions
2. **Forecasts** — hourly, daily, weekly patterns
3. **Health & safety** — heat stroke risk, cold exposure, UV protection, air quality
4. **Practical advice** — what to wear, umbrella decisions, outdoor planning
5. **Astronomical** — sunrise, sunset, golden hour, moon phase
6. **General meteorology** — how weather systems work, why pressure drops, etc.
7. **Travel & events** — is it good weather for a picnic, hike, outdoor wedding, etc.

## Constraints
- Base all **quantitative** answers strictly on the live snapshot below
- If data for a specific metric is missing, say so clearly and offer general guidance
- Never fabricate data or invent numbers not present in the snapshot
- Do NOT ask unnecessary clarifying questions — make reasonable assumptions and answer
- Keep responses **concise but complete** — aim for 3–8 lines, more only when needed

## Current Date & Time (UTC)
${now}

## LIVE WEATHER SNAPSHOT FOR ${(weather?.city || 'the user\'s location').toUpperCase()}
\`\`\`json
${JSON.stringify(weather, null, 2)}
\`\`\`
`;
}

function normalizeHistory(conversation) {
  return (Array.isArray(conversation) ? conversation : [])
    .slice(-10)
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
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 2048,
      topP: 0.95,
      topK: 64
    }
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify(body)
    }
  );

  const json = await response.json();
  if (!response.ok) throw new Error(json?.error?.message || `Gemini ${response.status}: ${JSON.stringify(json?.error)}`);

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

  if (!GEMINI_API_KEY) {
    return res.json({ reply: localAnswer(message, weather), provider: 'local-fallback' });
  }

  try {
    const reply = await callGemini(message, weather, conversation);
    return res.json({ reply, provider: 'gemini', model: GEMINI_MODEL });
  } catch (error) {
    console.error('Gemini error:', error?.message || error);
    // Fall back to rich local answer — never fail silently
    return res.json({ reply: localAnswer(message, weather), provider: 'local-fallback', warning: error?.message || 'Gemini unavailable.' });
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
  console.log(GEMINI_API_KEY ? `✅ AI enabled: ${GEMINI_MODEL}` : '⚠️  AI running on local fallback — add GEMINI_API_KEY to .env to enable Gemini.');
});
