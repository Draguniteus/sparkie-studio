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
    // 1. Get user location — browser-supplied lat/lon required
    const { searchParams } = new URL(req.url)
    const qLat = searchParams.get('lat')
    const qLon = searchParams.get('lon')

    if (!qLat || !qLon) {
      return NextResponse.json(
        { error: 'Location required. Please allow location access in your browser.' },
        { status: 400 }
      )
    }

    let lat = parseFloat(qLat)
    let lon = parseFloat(qLon)
    let city = 'Your area', region = '', country = ''

    if (isNaN(lat) || isNaN(lon)) {
      return NextResponse.json(
        { error: 'Invalid coordinates supplied.' },
        { status: 400 }
      )
    }

    // Reverse-geocode to get city name
    try {
      const rgRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
        { headers: { 'User-Agent': 'SparkyStudio/1.0' } }
      )
      const rg = await rgRes.json()
      city = rg.address?.city || rg.address?.town || rg.address?.village || rg.address?.county || 'Your area'
      region = rg.address?.state || ''
      country = rg.address?.country_code?.toUpperCase() || ''
    } catch { /* use 'Your area' default */ }

    // 2. Fetch weather from open-meteo (free, no API key)
    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
    weatherUrl.searchParams.set('latitude',  String(lat))
    weatherUrl.searchParams.set('longitude', String(lon))
    weatherUrl.searchParams.set('current', [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'weather_code', 'wind_speed_10m', 'wind_direction_10m',
      'uv_index', 'precipitation', 'cloud_cover',
    ].join(','))
    weatherUrl.searchParams.set('hourly', 'temperature_2m,precipitation_probability,weather_code')
    weatherUrl.searchParams.set('daily', [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'precipitation_sum', 'wind_speed_10m_max', 'sunrise', 'sunset',
    ].join(','))
    weatherUrl.searchParams.set('temperature_unit', 'celsius')
    weatherUrl.searchParams.set('wind_speed_unit', 'mph')
    weatherUrl.searchParams.set('precipitation_unit', 'inch')
    weatherUrl.searchParams.set('timezone', 'auto')
    weatherUrl.searchParams.set('forecast_days', '7')

    const wxRes = await fetch(weatherUrl.toString())
    if (!wxRes.ok) throw new Error(`open-meteo ${wxRes.status}`)
    const wx = await wxRes.json()

    const cur = wx.current
    const daily = wx.daily
    const hourly = wx.hourly

    // Build 7-day forecast
    const forecast = (daily.time as string[]).map((date: string, i: number) => ({
      date,
      high: cToF(daily.temperature_2m_max[i]),
      low:  cToF(daily.temperature_2m_min[i]),
      condition: wmoDescription(daily.weather_code[i]),
      precipitation: daily.precipitation_sum[i],
      windMax: daily.wind_speed_10m_max[i],
      sunrise: daily.sunrise[i],
      sunset:  daily.sunset[i],
    }))

    // Build next 12h hourly
    const nowHour = new Date().getHours()
    const hourlySlice = (hourly.time as string[])
      .map((t: string, i: number) => ({
        time: t,
        temp: cToF(hourly.temperature_2m[i]),
        pop:  hourly.precipitation_probability[i],
        condition: wmoDescription(hourly.weather_code[i]),
      }))
      .filter((_: {time: string; temp: number; pop: number; condition: string}, i: number) => {
        const h = new Date(hourly.time[i]).getHours()
        return i < 24 // next 24 hours
      })
      .slice(0, 12)

    return NextResponse.json({
      location: { city, region, country, lat, lon },
      current: {
        tempF:         cToF(cur.temperature_2m),
        feelsLikeF:    cToF(cur.apparent_temperature),
        humidity:      cur.relative_humidity_2m,
        condition:     wmoDescription(cur.weather_code),
        windMph:       cur.wind_speed_10m,
        windDir:       windDirection(cur.wind_direction_10m),
        uvIndex:       cur.uv_index,
        uvRisk:        uvRisk(cur.uv_index),
        precipitation: cur.precipitation,
        cloudCover:    cur.cloud_cover,
      },
      forecast,
      hourly: hourlySlice,
      timezone: wx.timezone,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
