# Weather Hub

A live, multi-city weather dashboard — built with the same stack and structure
as the Bitcoin dashboard (React + Vite + Express, with an AI chat assistant).
The two-panel layout (Today / Map & Details) replicates the reference
screenshot's look, adapted for laptop screens first and fully responsive down
to mobile.

## Features

- **Live weather data** — no API key needed. Powered by [Open-Meteo](https://open-meteo.com/) (current conditions, hourly, and 10-day forecast).
- **Two-panel layout** matching the reference design: "Today" (condition, big temperature, hourly strip, 5/10-day forecast) and "Map & Details" (embedded map, wind & pressure, precipitation windows, sunrise/sunset).
- **Search & save cities** — search any city worldwide, switch between saved locations, or use your device location.
- **°F / °C toggle**, with wind speed units switching automatically (mph / km/h).
- **AI weather assistant** (bottom-right chat) — answers questions like "will it rain today?", "what should I wear?", "what's the forecast this weekend?" straight from the live data. Falls back to Google Gemini for open-ended questions if you add an API key (optional).
- **Rain alerts, settings, help, and profile modals** — same navigation pattern as the Bitcoin dashboard.
- Fully responsive: two columns on desktop/laptop, tabbed single column on mobile.

## Running it

```bash
npm install
npm run dev
```

Then open **http://localhost:5173**.

## Optional: enabling Gemini for the chat assistant

The assistant works great out of the box using live weather data — no setup
required. If you want it to also handle open-ended questions via Gemini,
copy `.env.example` to `.env` and add your key:

```
GEMINI_API_KEY=your-key-here
```

## Production build

```bash
npm run build
npm run preview
```
