import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Menu, Plus, X, Search, Bot, Send, Settings, Bell, User, HelpCircle,
  MapPin, Gauge, Maximize2, ChevronRight, RefreshCw, Sun, Moon,
  Cloud, CloudSun, CloudMoon, CloudRain, CloudRainWind, CloudSnow, CloudLightning,
  CloudFog, CloudDrizzle, Thermometer, Check, Loader2, Trash2, Navigation,
  Droplets, Sunrise, Sunset, LocateFixed
} from 'lucide-react';
import './styles.css';

/* ------------------------------------------------------------------ */
/* Constants & lookups                                                 */
/* ------------------------------------------------------------------ */

const ICONS = {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudFog, CloudDrizzle,
  CloudRain, CloudRainWind, CloudSnow, CloudLightning
};

const WMAP = {
  0: { label: 'Clear', day: 'Sun', night: 'Moon' },
  1: { label: 'Mostly Clear', day: 'Sun', night: 'Moon' },
  2: { label: 'Partly Cloudy', day: 'CloudSun', night: 'CloudMoon' },
  3: { label: 'Overcast', day: 'Cloud', night: 'Cloud' },
  45: { label: 'Fog', day: 'CloudFog', night: 'CloudFog' },
  48: { label: 'Icy Fog', day: 'CloudFog', night: 'CloudFog' },
  51: { label: 'Light Drizzle', day: 'CloudDrizzle', night: 'CloudDrizzle' },
  53: { label: 'Drizzle', day: 'CloudDrizzle', night: 'CloudDrizzle' },
  55: { label: 'Heavy Drizzle', day: 'CloudDrizzle', night: 'CloudDrizzle' },
  56: { label: 'Freezing Drizzle', day: 'CloudDrizzle', night: 'CloudDrizzle' },
  57: { label: 'Freezing Drizzle', day: 'CloudDrizzle', night: 'CloudDrizzle' },
  61: { label: 'Light Rain', day: 'CloudRain', night: 'CloudRain' },
  63: { label: 'Rain', day: 'CloudRain', night: 'CloudRain' },
  65: { label: 'Heavy Rain', day: 'CloudRainWind', night: 'CloudRainWind' },
  66: { label: 'Freezing Rain', day: 'CloudRain', night: 'CloudRain' },
  67: { label: 'Freezing Rain', day: 'CloudRain', night: 'CloudRain' },
  71: { label: 'Light Snow', day: 'CloudSnow', night: 'CloudSnow' },
  73: { label: 'Snow', day: 'CloudSnow', night: 'CloudSnow' },
  75: { label: 'Heavy Snow', day: 'CloudSnow', night: 'CloudSnow' },
  77: { label: 'Snow Grains', day: 'CloudSnow', night: 'CloudSnow' },
  80: { label: 'Rain Showers', day: 'CloudRain', night: 'CloudRain' },
  81: { label: 'Rain Showers', day: 'CloudRain', night: 'CloudRain' },
  82: { label: 'Violent Showers', day: 'CloudRainWind', night: 'CloudRainWind' },
  85: { label: 'Snow Showers', day: 'CloudSnow', night: 'CloudSnow' },
  86: { label: 'Snow Showers', day: 'CloudSnow', night: 'CloudSnow' },
  95: { label: 'Thunderstorm', day: 'CloudLightning', night: 'CloudLightning' },
  96: { label: 'Thunderstorm & Hail', day: 'CloudLightning', night: 'CloudLightning' },
  99: { label: 'Severe Thunderstorm', day: 'CloudLightning', night: 'CloudLightning' }
};

const DEFAULT_CITY = { id: 'newyork', name: 'New York', admin1: 'NY', country: 'United States', lat: 40.7128, lon: -74.006 };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const round = (n) => Math.round(Number(n || 0));
const conditionOf = (code, isDay) => WMAP[code] || WMAP[isDay ? 1 : 0];
const iconFor = (code, isDay) => ICONS[conditionOf(code, isDay)[isDay ? 'day' : 'night']] || Cloud;
const degToCompass = (deg) => COMPASS[Math.round((Number(deg || 0) % 360) / 22.5) % 16];
const hpaToInHg = (hpa) => (Number(hpa || 0) * 0.02953).toFixed(2);
const cityKey = (c) => c.id || `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;

function weekdayLabel(dateStr, idx) {
  if (idx === 0) return 'Today';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function timeLabel(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '--';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function hourLabel(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '');
}

/* ------------------------------------------------------------------ */
/* Live data (Open-Meteo — free, no API key required)                  */
/* ------------------------------------------------------------------ */

async function geocodeCity(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Search failed');
  const j = await r.json();
  return (j.results || []).map(res => ({
    id: `${res.id}`,
    name: res.name,
    admin1: res.admin1 || '',
    country: res.country || '',
    lat: res.latitude,
    lon: res.longitude
  }));
}

async function fetchForecast(lat, lon, unit) {
  const tempUnit = unit === 'metric' ? 'celsius' : 'fahrenheit';
  const windUnit = unit === 'metric' ? 'kmh' : 'mph';
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: 10,
    temperature_unit: tempUnit,
    wind_speed_unit: windUnit
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!r.ok) throw new Error('Forecast request failed');
  return r.json();
}

function normalizeWeather(raw, city, unit) {
  const now = new Date();
  const nowHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), 0, 0, 0);
  const hourlyTimes = raw.hourly?.time || [];
  let nowIdx = hourlyTimes.findIndex(t => new Date(t) >= nowHourStart);
  if (nowIdx < 0) nowIdx = 0;

  const hourly = hourlyTimes.slice(nowIdx, nowIdx + 24).map((t, i) => {
    const idx = nowIdx + i;
    return {
      time: t,
      label: i === 0 ? 'Now' : hourLabel(t),
      temp: raw.hourly.temperature_2m[idx],
      code: raw.hourly.weather_code[idx],
      isDay: raw.hourly.is_day[idx] === 1,
      precipChance: raw.hourly.precipitation_probability?.[idx] ?? 0
    };
  });

  // Four ~6h look-ahead windows, styled like the "Evening / Night / Overnight / Early Morn" strip.
  const precipWindowLabels = ['Evening', 'Night', 'Overnight', 'Early Morn'];
  const precipWindows = precipWindowLabels.map((label, w) => {
    const slice = hourlyTimes.slice(nowIdx + w * 6, nowIdx + w * 6 + 6);
    const probs = slice.map((_, i) => raw.hourly.precipitation_probability?.[nowIdx + w * 6 + i] ?? 0);
    const max = probs.length ? Math.max(...probs) : 0;
    return { label, chance: max };
  });

  const daily = (raw.daily?.time || []).map((d, i) => ({
    date: d,
    label: weekdayLabel(d, i),
    code: raw.daily.weather_code[i],
    high: raw.daily.temperature_2m_max[i],
    low: raw.daily.temperature_2m_min[i],
    precipChance: raw.daily.precipitation_probability_max?.[i] ?? 0,
    sunrise: timeLabel(raw.daily.sunrise[i]),
    sunset: timeLabel(raw.daily.sunset[i]),
    isWeekend: [0, 6].includes(new Date(`${d}T00:00:00`).getDay())
  }));

  const cur = raw.current || {};
  const cond = conditionOf(cur.weather_code, cur.is_day === 1);

  return {
    city: city.name,
    admin1: city.admin1,
    country: city.country,
    lat: city.lat,
    lon: city.lon,
    timezone: raw.timezone,
    tzAbbr: raw.timezone_abbreviation,
    unit,
    fetchedAt: Date.now(),
    current: {
      temperature: cur.temperature_2m,
      feelsLike: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      windSpeed: cur.wind_speed_10m,
      windDir: degToCompass(cur.wind_direction_10m),
      windDeg: cur.wind_direction_10m,
      pressure: hpaToInHg(cur.surface_pressure),
      condition: cond.label,
      code: cur.weather_code,
      isDay: cur.is_day === 1
    },
    hourly,
    precipWindows,
    daily
  };
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function ConditionIcon({ code, isDay, size = 22, className = '' }) {
  const Icon = iconFor(code, isDay);
  return <Icon size={size} className={className} strokeWidth={1.6} />;
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="rw-toast">
      <div className="rw-toast-icon"><Check size={14} /></div>
      <div><b>{toast.title}</b><small>{toast.text}</small></div>
    </div>
  );
}

function Modal({ title, subtitle, onClose, children, wide = false }) {
  return (
    <div className="rw-modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`rw-modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="rw-modal-head">
          <div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>
          <button className="rw-icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="rw-modal-body">{children}</div>
      </div>
    </div>
  );
}

function skyVariant(code, isDay) {
  if (isDay === false) return 'night';
  if (code === 0 || code === 1) return 'clear';
  if (code === 2 || code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code >= 71 && code <= 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'clear';
}

function Skyline({ code, isDay = true }) {
  const variant = skyVariant(code, isDay);
  return (
    <div className={`rw-sky variant-${variant}`} aria-hidden="true">
      <div className="rw-sky-gradient" />
      <div className="rw-clouds" />
      <div className="rw-clouds rw-clouds-2" />
      <div className="rw-stars" />
      <svg className="rw-skyline" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <g className="rw-buildings-far">
          <rect x="0" y="150" width="70" height="170" /><rect x="80" y="120" width="50" height="200" />
          <rect x="140" y="170" width="90" height="150" /><rect x="240" y="100" width="60" height="220" />
          <rect x="310" y="150" width="70" height="170" /><rect x="390" y="130" width="55" height="190" />
          <rect x="455" y="180" width="80" height="140" /><rect x="545" y="110" width="65" height="210" />
          <rect x="620" y="160" width="90" height="160" /><rect x="720" y="140" width="60" height="180" />
          <rect x="790" y="170" width="75" height="150" /><rect x="875" y="100" width="55" height="220" />
          <rect x="940" y="150" width="90" height="170" /><rect x="1040" y="130" width="65" height="190" />
          <rect x="1115" y="175" width="80" height="145" /><rect x="1205" y="110" width="60" height="210" />
          <rect x="1275" y="160" width="90" height="160" /><rect x="1375" y="140" width="65" height="180" />
        </g>
        <g className="rw-buildings-near">
          <rect x="20" y="210" width="90" height="110" /><rect x="130" y="230" width="60" height="90" />
          <rect x="210" y="190" width="110" height="130" /><rect x="340" y="240" width="70" height="80" />
          <rect x="430" y="200" width="95" height="120" /><rect x="545" y="225" width="65" height="95" />
          <rect x="630" y="195" width="105" height="125" /><rect x="755" y="235" width="75" height="85" />
          <rect x="850" y="205" width="90" height="115" /><rect x="960" y="225" width="70" height="95" />
          <rect x="1050" y="190" width="100" height="130" /><rect x="1170" y="230" width="65" height="90" />
          <rect x="1255" y="200" width="95" height="120" /><rect x="1370" y="225" width="70" height="95" />
        </g>
        <g className="rw-windows">
          <rect x="35" y="225" width="7" height="9" /><rect x="55" y="245" width="7" height="9" /><rect x="75" y="260" width="7" height="9" />
          <rect x="225" y="210" width="7" height="9" /><rect x="250" y="235" width="7" height="9" /><rect x="280" y="255" width="7" height="9" /><rect x="300" y="215" width="7" height="9" />
          <rect x="450" y="220" width="7" height="9" /><rect x="475" y="245" width="7" height="9" /><rect x="500" y="265" width="7" height="9" />
          <rect x="655" y="215" width="7" height="9" /><rect x="680" y="240" width="7" height="9" /><rect x="705" y="260" width="7" height="9" />
          <rect x="870" y="225" width="7" height="9" /><rect x="895" y="250" width="7" height="9" />
          <rect x="1070" y="210" width="7" height="9" /><rect x="1095" y="235" width="7" height="9" /><rect x="1120" y="260" width="7" height="9" />
          <rect x="1275" y="220" width="7" height="9" /><rect x="1300" y="245" width="7" height="9" />
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Weather panels                                                      */
/* ------------------------------------------------------------------ */

function PanelHeader({ city, clock, onMenu, onAdd }) {
  return (
    <div className="rw-panel-head">
      <button className="rw-icon-btn" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button>
      <div className="rw-panel-title">
        <b>{city}</b>
        <small>{clock}</small>
      </div>
      <button className="rw-icon-btn" onClick={onAdd} aria-label="Add city"><Plus size={20} /></button>
    </div>
  );
}

function WeatherPanel({ weather, clock, onMenu, onAdd, unit, onExpandMap }) {
  const u = unit === 'metric' ? '°' : '°';
  if (!weather) return <PanelSkeleton onMenu={onMenu} onAdd={onAdd} />;
  const { current, hourly, daily, precipWindows } = weather;
  const list = daily.slice(0, 7);
  const speedUnit = unit === 'metric' ? 'km/h' : 'mph';
  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${weather.lon - 0.35}%2C${weather.lat - 0.22}%2C${weather.lon + 0.35}%2C${weather.lat + 0.22}&layer=mapnik&marker=${weather.lat}%2C${weather.lon}`;

  return (
    <section className="rw-panel">
      <PanelHeader city={weather.city} clock={clock} onMenu={onMenu} onAdd={onAdd} />

      <div className="rw-now">
        <div className="rw-now-condition">
          <ConditionIcon code={current.code} isDay={current.isDay} size={20} />
          <span>{current.condition}</span>
        </div>
        <div className="rw-now-range">
          <span><Sun size={13} /> {round(daily[0]?.high)}{u}</span>
          <span><Moon size={13} /> {round(daily[0]?.low)}{u}</span>
        </div>
        <div className="rw-now-temp">{round(current.temperature)}<sup>{u}</sup></div>
        <div className="rw-now-feels">Feels like {round(current.feelsLike)}{u}</div>
      </div>

      <div className="rw-cards-grid">
        <div className="rw-card rw-forecast-card">
          <div className="rw-card-heading">Forecast</div>

          <div className="rw-hourly-strip">
            {hourly.map((h, i) => (
              <div className="rw-hourly-item" key={h.time + i}>
                <span className="rw-hourly-time">{h.label}</span>
                <ConditionIcon code={h.code} isDay={h.isDay} size={18} />
                <span className="rw-hourly-temp">{round(h.temp)}{u}</span>
              </div>
            ))}
          </div>

          <div className="rw-daily-list">
            {list.map((d, i) => (
              <div className="rw-daily-row" key={d.date}>
                <span className="rw-daily-name">{d.label}</span>
                <ConditionIcon code={d.code} isDay={true} size={18} className="rw-daily-icon" />
                <span className="rw-daily-high">{round(d.high)}{u}</span>
                <span className="rw-daily-low">{round(d.low)}{u}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rw-cards-col">
          <div className="rw-card rw-map-card">
            <div className="rw-card-heading">Map</div>
            <div className="rw-map-frame">
              <iframe title="Location map" src={mapSrc} loading="lazy" />
              <button className="rw-map-expand" onClick={onExpandMap} aria-label="Expand map"><Maximize2 size={15} /></button>
            </div>
          </div>

          <div className="rw-card">
            <div className="rw-card-heading">Wind &amp; Pressure</div>
            <div className="rw-wind-row">
              <div className="rw-wind-compass" style={{ '--rot': `${current.windDeg || 0}deg` }}>
                <Navigation size={26} />
              </div>
              <div className="rw-wind-info">
                <span className="rw-wind-label">Wind</span>
                <span className="rw-wind-value">{round(current.windSpeed)}<small>{speedUnit}</small> {current.windDir}</span>
              </div>
              <div className="rw-baro-info">
                <span className="rw-wind-label"><Gauge size={13} /> Barometer</span>
                <span className="rw-wind-value">{current.pressure}<small>inHg</small></span>
              </div>
            </div>
          </div>

          <div className="rw-card">
            <div className="rw-card-heading">Precipitation</div>
            <div className="rw-precip-row">
              {precipWindows.map(p => (
                <div className="rw-precip-item" key={p.label}>
                  <span className="rw-precip-pct">{p.chance}%</span>
                  <Droplets size={16} />
                  <span className="rw-precip-label">{p.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rw-card rw-sun-card">
            <div className="rw-sun-item"><Sunrise size={16} /><div><b>{daily[0]?.sunrise}</b><small>Sunrise</small></div></div>
            <div className="rw-sun-item"><Sunset size={16} /><div><b>{daily[0]?.sunset}</b><small>Sunset</small></div></div>
            <div className="rw-sun-item"><Droplets size={16} /><div><b>{round(current.humidity)}%</b><small>Humidity</small></div></div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PanelSkeleton({ onMenu, onAdd }) {
  return (
    <section className="rw-panel">
      <PanelHeader city="Loading…" clock="" onMenu={onMenu} onAdd={onAdd} />
      <div className="rw-loading"><Loader2 className="rw-spin" size={26} /><span>Fetching live weather…</span></div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar / search / settings / chat                                  */
/* ------------------------------------------------------------------ */

function Sidebar({ open, onClose, cities, activeId, onSelect, onRemove, onOpenSearch, onNav }) {
  return (
    <>
      <div className={`rw-drawer-backdrop ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`rw-drawer ${open ? 'open' : ''}`}>
        <div className="rw-drawer-head">
          <b>Weather</b>
          <button className="rw-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <button className="rw-drawer-search" onClick={onOpenSearch}><Search size={15} /> Search for a city</button>
        <div className="rw-drawer-section">Saved Locations</div>
        <div className="rw-drawer-list">
          {cities.map(c => (
            <div className={`rw-drawer-city ${cityKey(c) === activeId ? 'active' : ''}`} key={cityKey(c)} onClick={() => onSelect(c)}>
              <MapPin size={15} />
              <div><b>{c.name}</b><small>{[c.admin1, c.country].filter(Boolean).join(', ')}</small></div>
              {cities.length > 1 && (
                <button className="rw-icon-btn small" onClick={(e) => { e.stopPropagation(); onRemove(c); }} aria-label="Remove city">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="rw-drawer-section">Menu</div>
        <div className="rw-drawer-nav">
          <button onClick={() => onNav('settings')}><Settings size={16} /> Settings</button>
          <button onClick={() => onNav('notifications')}><Bell size={16} /> Alerts</button>
          <button onClick={() => onNav('help')}><HelpCircle size={16} /> Help</button>
          <button onClick={() => onNav('profile')}><User size={16} /> Profile</button>
        </div>
      </aside>
    </>
  );
}

function SearchModal({ onClose, onPick }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await geocodeCity(q.trim());
        setResults(r);
        setErr(r.length ? '' : 'No matching cities found.');
      } catch {
        setErr('Search failed — check your connection.');
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer.current);
  }, [q]);

  return (
    <Modal title="Add a location" subtitle="Search any city worldwide for live weather." onClose={onClose}>
      <div className="rw-search-box">
        <Search size={16} />
        <input autoFocus placeholder="e.g. Lahore, Tokyo, Paris…" value={q} onChange={e => setQ(e.target.value)} />
        {loading && <Loader2 className="rw-spin" size={16} />}
      </div>
      {err && <div className="rw-search-empty">{err}</div>}
      <div className="rw-search-results">
        {results.map(c => (
          <button key={c.id} className="rw-search-result" onClick={() => onPick(c)}>
            <MapPin size={15} />
            <div><b>{c.name}</b><small>{[c.admin1, c.country].filter(Boolean).join(', ')}</small></div>
            <ChevronRight size={15} />
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ChatWidget({ open, setOpen, messages, input, setInput, onSend, loading }) {
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight; }, [messages, loading, open]);
  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  return (
    <>
      <button className="rw-chat-fab" onClick={() => setOpen(v => !v)} aria-label="Toggle weather assistant">
        {open ? <X size={22} /> : <Bot size={22} />}
      </button>
      {open && (
        <div className="rw-chat-panel">
          <div className="rw-chat-head">
            <div className="rw-chat-avatar"><Bot size={16} /></div>
            <div><b>Weather AI</b><small>Ask about rain, wind, or what to wear</small></div>
          </div>
          <div className="rw-chat-body" ref={bodyRef}>
            {messages.map((m, i) => (
              <div key={i} className={`rw-msg ${m.role}`}>{m.text}</div>
            ))}
            {loading && <div className="rw-msg bot rw-typing"><span /><span /><span /></div>}
          </div>
          <form className="rw-chat-input" onSubmit={e => { e.preventDefault(); onSend(input); }}>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Will it rain today?" />
            <button type="submit" aria-label="Send"><Send size={16} /></button>
          </form>
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */

function App() {
  const [cities, setCities] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rw-cities') || 'null') || [DEFAULT_CITY]; }
    catch { return [DEFAULT_CITY]; }
  });
  const [activeId, setActiveId] = useState(() => localStorage.getItem('rw-active') || cityKey(DEFAULT_CITY));
  const [unit, setUnit] = useState(() => localStorage.getItem('rw-unit') || 'imperial');
  const [weatherByCity, setWeatherByCity] = useState({});
  const [loadingActive, setLoadingActive] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [clockTick, setClockTick] = useState(0);
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rw-notifications') || '[]'); } catch { return []; }
  });

  const activeCity = useMemo(() => cities.find(c => cityKey(c) === activeId) || cities[0], [cities, activeId]);
  const weather = weatherByCity[activeId];

  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Hi! I\u2019m the Weather assistant. Ask me about rain chances, wind, sunrise/sunset, or what to wear today.' }
  ]);

  const notify = useCallback((title, text) => {
    setToast({ title, text });
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => setToast(null), 3200);
  }, []);

  const addNotification = useCallback((title, text) => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title, text, time: new Date().toISOString(), read: false };
    setNotifications(prev => [item, ...prev].slice(0, 20));
  }, []);

  useEffect(() => { localStorage.setItem('rw-cities', JSON.stringify(cities)); }, [cities]);
  useEffect(() => { localStorage.setItem('rw-active', activeId); }, [activeId]);
  useEffect(() => { localStorage.setItem('rw-unit', unit); }, [unit]);
  useEffect(() => { localStorage.setItem('rw-notifications', JSON.stringify(notifications)); }, [notifications]);

  // Local clock — ticks every 30s, formatted per city timezone.
  useEffect(() => {
    const t = setInterval(() => setClockTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const clockFor = useCallback((w) => {
    if (!w) return '';
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: w.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date());
      return `${parts} ${w.tzAbbr || ''}`.trim();
    } catch { return ''; }
  }, []);

  const loadCity = useCallback(async (city, { silent } = {}) => {
    const key = cityKey(city);
    if (!silent) setLoadingActive(true);
    try {
      const raw = await fetchForecast(city.lat, city.lon, unit);
      const norm = normalizeWeather(raw, city, unit);
      setWeatherByCity(prev => ({ ...prev, [key]: norm }));
      if (norm.precipWindows.some(p => p.chance >= 60) && !silent) {
        addNotification('Rain likely soon', `${norm.city} has a high chance of rain in the coming hours.`);
      }
      return norm;
    } catch (e) {
      notify('Unable to fetch weather', 'Check your connection and try refreshing.');
    } finally {
      if (!silent) setLoadingActive(false);
    }
  }, [unit, notify, addNotification]);

  // Load active city whenever it or the unit changes.
  useEffect(() => {
    if (activeCity) loadCity(activeCity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, unit]);

  // Background auto-refresh every 10 minutes.
  useEffect(() => {
    const t = setInterval(() => { if (activeCity) loadCity(activeCity, { silent: true }); }, 10 * 60 * 1000);
    return () => clearInterval(t);
  }, [activeCity, loadCity]);

  const selectCity = (city) => {
    const key = cityKey(city);
    setActiveId(key);
    setSidebarOpen(false);
    notify(`Switched to ${city.name}`, 'Loading the latest conditions.');
  };

  const addCity = (city) => {
    const key = cityKey(city);
    setCities(prev => (prev.some(c => cityKey(c) === key) ? prev : [...prev, { ...city, id: key }]));
    setActiveId(key);
    setSearchOpen(false);
    setSidebarOpen(false);
    notify('Location added', `${city.name} is now in your saved list.`);
  };

  const removeCity = (city) => {
    const key = cityKey(city);
    setCities(prev => {
      const next = prev.filter(c => cityKey(c) !== key);
      if (activeId === key && next.length) setActiveId(cityKey(next[0]));
      return next;
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return notify('Not supported', 'Geolocation isn\u2019t available in this browser.');
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      const city = { id: `me-${latitude.toFixed(2)}-${longitude.toFixed(2)}`, name: 'My Location', admin1: '', country: '', lat: latitude, lon: longitude };
      addCity(city);
    }, () => notify('Location unavailable', 'Could not read your device location.'));
  };

  const resolveWeatherTarget = useCallback(async (text) => {
    // Returns { weatherData, detectedCity } — detectedCity is non-null only when a
    // different city was successfully fetched; null means we fell back to current.
    const query = String(text || '').trim();
    if (!query) return { weatherData: weather, detectedCity: null };

    const lower = query.toLowerCase();

    // 1. Check saved cities first (exact name match)
    const savedMatch = cities.find(city => {
      const named = city.name?.toLowerCase() || '';
      return named.length > 1 && lower.includes(named);
    });

    if (savedMatch) {
      const key = cityKey(savedMatch);
      // Always use silent:true to avoid loading-state re-renders mid-async
      const data = weatherByCity[key] || await loadCity(savedMatch, { silent: true });
      return { weatherData: data || weather, detectedCity: savedMatch.name };
    }

    // 2. Extract city name from known question patterns
    //    "what is temperature of lahore now" → "lahore"
    //    "weather in london" → "london"
    //    "karachi ka weather" → "karachi"
    const patterns = [
      /(?:weather|temperature|temp|forecast|rain|climate|humidity|wind)\s+(?:of|in|at|for|near)\s+([a-zA-Z][a-zA-Z\s-]+?)(?:\s+(?:now|today|tomorrow|tonight|this week|right now|currently))?\s*\??$/i,
      /(?:of|in|at|for|near)\s+([a-zA-Z][a-zA-Z\s-]+?)(?:\s+(?:now|today|tomorrow|tonight|this week|right now|currently))?\s*\??$/i,
      /^([a-zA-Z][a-zA-Z\s-]+?)\s+(?:ka|ki|ke|kya|mai|mein|main|men)\s+(?:weather|temperature|temp|forecast|rain|humidity|wind)/i,
      /^(?:what(?:'s|\s+is)?|how(?:'s|\s+is)?|show|tell|get|check)\s+(?:the\s+)?(?:weather|temperature|temp|forecast|rain|humidity|wind)\s+(?:of|in|at|for|near)\s+([a-zA-Z][a-zA-Z\s-]+?)(?:\s+(?:now|today|tomorrow|tonight))?\s*\??$/i,
    ];

    let cityCandidate = '';
    for (const pat of patterns) {
      const match = lower.match(pat);
      if (match && match[1]) {
        cityCandidate = match[1].trim();
        if (cityCandidate.length > 1) break;
      }
    }

    // 3. If pattern didn't work, strip stop-words and use what's left
    if (!cityCandidate) {
      const stopWords = /\b(what|whats|how|is|are|was|will|does|do|can|the|a|an|it|of|in|at|for|on|to|from|with|by|and|but|not|no|yes|rain|wind|weather|temperature|temp|forecast|hot|cold|warm|cool|humid|snow|degree|degrees|celsius|fahrenheit|wear|today|tomorrow|now|tonight|please|tell|show|get|give|feels|feel|very|really|right|currently|about|near)\b/gi;
      cityCandidate = lower
        .replace(stopWords, ' ')
        .replace(/[^a-zA-Z\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    if (!cityCandidate || cityCandidate.length < 2) return { weatherData: weather, detectedCity: null };

    // 4. Geocode the extracted city name
    try {
      const geocoded = await geocodeCity(cityCandidate);
      const city = geocoded[0];
      if (!city) return { weatherData: weather, detectedCity: `❌ ${cityCandidate}` };
      const key = cityKey(city);
      // silent:true prevents loading-state flicker and re-render issues
      const data = weatherByCity[key] || await loadCity(city, { silent: true });
      return { weatherData: data || weather, detectedCity: city.name };
    } catch {
      return { weatherData: weather, detectedCity: `❌ ${cityCandidate}` };
    }
  }, [cities, loadCity, weather, weatherByCity]);

  const buildWeatherPayload = useCallback((w) => {
    if (!w) return null;
    return {
      city: w.city,
      unit: w.unit,
      current: {
        temperature: w.current.temperature,
        feelsLike: w.current.feelsLike,
        humidity: w.current.humidity,
        windSpeed: w.current.windSpeed,
        windDir: w.current.windDir,
        pressure: w.current.pressure,
        condition: w.current.condition
      },
      daily: w.daily.map(d => ({
        label: d.label, condition: conditionOf(d.code, true).label, high: d.high, low: d.low,
        precipChance: d.precipChance, sunrise: d.sunrise, sunset: d.sunset, isWeekend: d.isWeekend
      }))
    };
  }, []);

  const sendChat = async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed) return;
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setChatInput('');
    setChatLoading(true);
    try {
      // Greetings must skip city resolution — otherwise "hi" gets geocoded as a city!
      const isGreetingMsg = /^(hi|hello|hey+|hiya|yo|salam|salaam|assalam[- ]?o?[- ]?alaikum|aoa|good\s*(morning|afternoon|evening|night)|hola|bonjour|hallo|مرحبا|سلام|ہیلو)\s*[!.?]*$/i.test(trimmed);

      const { weatherData: targetWeather, detectedCity } = isGreetingMsg
        ? { weatherData: weather, detectedCity: null }
        : await resolveWeatherTarget(trimmed);

      // If we detected a city name but failed to fetch it (prefixed with ❌), tell the user clearly.
      if (detectedCity && detectedCity.startsWith('❌')) {
        const badCity = detectedCity.slice(2).trim();
        setMessages(prev => [...prev, { role: 'bot', text: `Sorry, I couldn't find weather data for "${badCity}". Check the spelling or try a larger nearby city.` }]);
        return;
      }

      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          weather: buildWeatherPayload(targetWeather || weather),
          conversation: messages.slice(-8)
        })
      });
      const j = await r.json();
      setMessages(prev => [...prev, { role: 'bot', text: j.reply || 'Sorry, I couldn\u2019t fetch that just now.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: 'The assistant is offline right now \u2014 try again in a moment.' }]);
    } finally {
      setChatLoading(false);
    }
  };

  const clock = clockFor(weather);

  return (
    <div className="rw-app">
      <Skyline code={weather?.current?.code} isDay={weather?.current?.isDay ?? true} />

      <div className="rw-topbar">
        <div className="rw-brand"><CloudSun size={18} /> Weather</div>
        <div className="rw-topbar-actions">
          <div className="rw-unit-toggle">
            <button className={unit === 'imperial' ? 'active' : ''} onClick={() => setUnit('imperial')}>°F</button>
            <button className={unit === 'metric' ? 'active' : ''} onClick={() => setUnit('metric')}>°C</button>
          </div>
          <button className="rw-icon-btn" onClick={useMyLocation} aria-label="Use my location"><LocateFixed size={18} /></button>
          <button className="rw-icon-btn" onClick={() => setModal('notifications')} aria-label="Alerts">
            <Bell size={18} />
            {notifications.some(n => !n.read) && <span className="rw-dot" />}
          </button>
        </div>
      </div>

      <main className="rw-panels">
        <div className="rw-panel-slot">
          <WeatherPanel
            weather={loadingActive && !weather ? null : weather}
            clock={clock}
            unit={unit}
            onMenu={() => setSidebarOpen(true)}
            onAdd={() => setSearchOpen(true)}
            onExpandMap={() => window.open(`https://www.openstreetmap.org/?mlat=${activeCity?.lat}&mlon=${activeCity?.lon}#map=11/${activeCity?.lat}/${activeCity?.lon}`, '_blank')}
          />
        </div>
      </main>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        cities={cities}
        activeId={activeId}
        onSelect={selectCity}
        onRemove={removeCity}
        onOpenSearch={() => { setSidebarOpen(false); setSearchOpen(true); }}
        onNav={(id) => { setSidebarOpen(false); setModal(id); }}
      />

      {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} onPick={addCity} />}

      {modal === 'settings' && (
        <Modal title="Settings" subtitle="Customize your Weather workspace." onClose={() => setModal(null)}>
          <div className="rw-settings-list">
            <button onClick={() => setUnit(u => u === 'imperial' ? 'metric' : 'imperial')}>
              <span><Thermometer size={18} /><div><b>Units</b><small>Temperature &amp; wind speed.</small></div></span>
              <strong>{unit === 'imperial' ? 'IMPERIAL (°F)' : 'METRIC (°C)'}</strong>
            </button>
            <button onClick={() => { if (activeCity) loadCity(activeCity); notify('Refreshed', 'Latest conditions loaded.'); }}>
              <span><RefreshCw size={18} /><div><b>Refresh now</b><small>Pull the latest live data.</small></div></span>
              <strong>SYNC</strong>
            </button>
            <button onClick={useMyLocation}>
              <span><LocateFixed size={18} /><div><b>Use my location</b><small>Add your current position as a city.</small></div></span>
              <strong>LOCATE</strong>
            </button>
          </div>
        </Modal>
      )}

      {modal === 'help' && (
        <Modal title="Help Center" subtitle="Getting the most out of Weather" onClose={() => setModal(null)}>
          <div className="rw-help-grid">
            <div><Bot size={18} /><b>Weather AI</b><p>Ask about rain, wind, sunrise/sunset, or what to wear.</p></div>
            <div><Search size={18} /><b>Add Cities</b><p>Search any city worldwide and switch between them instantly.</p></div>
            <div><Bell size={18} /><b>Rain Alerts</b><p>Get notified when a high chance of rain is coming.</p></div>
            <div><Settings size={18} /><b>Units</b><p>Toggle between °F/mph and °C/km/h any time.</p></div>
          </div>
        </Modal>
      )}

      {modal === 'notifications' && (
        <Modal title="Alerts" subtitle="Weather notifications & activity." onClose={() => { setModal(null); setNotifications(prev => prev.map(n => ({ ...n, read: true }))); }}>
          <div className="rw-notif-list">
            {notifications.length === 0
              ? <div className="rw-empty"><Bell size={20} /><h4>No alerts yet</h4><p>We\u2019ll let you know when rain is on the way.</p></div>
              : notifications.map(n => (
                <div className="rw-notif-item" key={n.id}>
                  <span className="rw-notif-dot" />
                  <div><b>{n.title}</b><small>{n.text}</small><time>{new Date(n.time).toLocaleString()}</time></div>
                </div>
              ))}
          </div>
        </Modal>
      )}

      {modal === 'profile' && (
        <Modal title="Account Profile" subtitle="Weather workspace profile." onClose={() => setModal(null)}>
          <div className="rw-profile-card">
            <div className="rw-profile-avatar">W</div>
            <div><h4>Weather Hub</h4><p>Personal multi-city forecast workspace</p></div>
          </div>
        </Modal>
      )}

      <ChatWidget
        open={chatOpen}
        setOpen={setChatOpen}
        messages={messages}
        input={chatInput}
        setInput={setChatInput}
        onSend={sendChat}
        loading={chatLoading}
      />

      <Toast toast={toast} />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
