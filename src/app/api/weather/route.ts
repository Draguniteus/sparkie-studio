import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// ─── Helpers ────────────────────────────────────────────────────────────────

function wmoDescription(code: number): string {
  const map: Record<number, string> = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'foggy', 48: 'icy fog',
    51: 'light drizzle', 53: 'moderate drizzle', 55: 'heavy drizzle',
    61: 'light rain', 63: 'moderate rain', 65: 'heavy rain',
    71: 'light snow', 73: 'moderate snow', 75: 'heavy snow',
    77: 'snow grains',
    80: 'light showers', 81: 'moderate showers', 82: 'heavy showers',
    85: 'light snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm',
  }
  return map[code] ?? 'unknown conditions'
}

function windDirection(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  return dirs[Math.round(deg / 45) % 8]
}

function uvRisk(uv: number): string {
  if (uv <= 2) return 'low'
  if (uv <= 5) return 'moderate'
  if (uv <= 7) return 'high'
  if (uv <= 10) return 'very high'
  return 'extreme'
}

function cToF(c: number): number {
  return Math.round(c * 9 / 5 + 32)
}

// ─── Route ─────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    // 1. Get user location via IP (no key needed)
    const forwarded = req.headers.get('x-forwarded-for')
    const ip = forwarded ? forwarded.split(',')[0].trim() : null

    let lat = 36.8529, lon = -75.9780, city = 'Virginia Beach', region = 'VA', country = 'US'

    if (ip && ip !== '127.0.0.1' && !ip.startsWith('::')) {
      try {
        const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=lat,lon,city,regionName,countryCode`)
        const geo = await geoRes.json()
        if (geo.lat) {
          lat = geo.lat; lon = geo.lon
          city = geo.city; region = geo.regionName; country = geo.countryCode
        }
      } catch { /* fallback to default */ }
    }

    // 2. Fetch weather from open-meteo (free, no API key)
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,` +
      `precipitation,weather_code,wind_speed_10m,wind_direction_10m,` +
      `surface_pressure,visibility,uv_index` +
      `&hourly=precipitation_probability` +
      `&temperature_unit=celsius` +
      `&wind_speed_unit=mph` +
      `&precipitation_unit=inch` +
      `&forecast_days=1`

    const wRes = await fetch(weatherUrl)
    const w = await wRes.json()
    const c = w.current

    const tempC = Math.round(c.temperature_2m)
    const tempF = cToF(tempC)
    const feelsC = Math.round(c.apparent_temperature)
    const feelsF = cToF(feelsC)
    const humidity = Math.round(c.relative_humidity_2m)
    const windSpeed = Math.round(c.wind_speed_10m)
    const windDir = windDirection(c.wind_direction_10m)
    const pressure = (c.surface_pressure * 0.02953).toFixed(2)  // hPa → inHg
    const pressureHpa = Math.round(c.surface_pressure)
    const visibilityMi = Math.round((c.visibility ?? 10000) / 1000 * 0.621)
    const uv = (c.uv_index ?? 0).toFixed(1)
    const condition = wmoDescription(c.weather_code)
    const precip = c.precipitation > 0 ? `${c.precipitation}"` : 'None'

    // Get next-hour precip probability
    const now = new Date()
    const hourIndex = now.getHours()
    const precipProb = w.hourly?.precipitation_probability?.[hourIndex] ?? 0

    // Format local time
    const localTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })

    // ─── Reporter-style report ───────────────────────────────────────────────
    const report = `**${city}, ${region} Weather Update** — brought to you by Sparkie Studio — ${localTime} local time.

🌡️ **Temperature:** ${tempF}°F (${tempC}°C), feels like ${feelsF}°F
🌤️ **Sky:** ${condition.charAt(0).toUpperCase() + condition.slice(1)}
🌧️ **Precipitation:** ${precip === 'None' ? 'None right now' : precip}${precipProb > 20 ? `; ${precipProb}% chance in the next hour` : ''}
💧 **Humidity:** ${humidity}%
💨 **Wind:** ${windDir} at ${windSpeed} mph
🔵 **Pressure:** ${pressure} inHg (${pressureHpa} hPa)
👁️ **Visibility:** ${visibilityMi} mile${visibilityMi !== 1 ? 's' : ''}
☀️ **UV Index:** ${uv} (${uvRisk(parseFloat(uv))})

${getOutfitTip(tempF, condition, precipProb)}`

    return NextResponse.json({ report, city, region, tempF, tempC, condition })

  } catch (err) {
    console.error('[weather]', err)
    return NextResponse.json(
      { report: "Couldn't fetch weather right now. Try again in a moment.", error: true },
      { status: 500 }
    )
  }
}

function getOutfitTip(tempF: number, condition: string, precipProb: number): string {
  const tips: string[] = []
  if (precipProb > 40 || condition.includes('rain') || condition.includes('drizzle')) {
    tips.push("☂️ Grab an umbrella — rain is likely.")
  } else if (precipProb > 20) {
    tips.push("🌂 Light jacket recommended — some showers possible.")
  }
  if (tempF <= 32) tips.push("🧥 Bundle up — it's freezing out there!")
  else if (tempF <= 50) tips.push("🧣 Keep a jacket handy.")
  else if (tempF <= 65) tips.push("🧥 Light jacket weather.")
  else if (tempF >= 90) tips.push("🥤 Stay hydrated — it's hot!")

  if (condition.includes('snow')) tips.push("❄️ Watch for slippery roads.")
  if (condition.includes('thunder')) tips.push("⚡ Stay indoors if possible.")

  return tips.length > 0 ? tips.join(' ') : "✅ Looks like a nice day out there!"
}
