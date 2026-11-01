// Buscador de lugares en el mapa: de un texto ("country Vilago") a puntos
// candidatos. Usa Nominatim, el buscador gratuito de OpenStreetMap, directo
// desde el navegador (sin clave ni cuenta). Sus reglas de uso piden pocas
// consultas: acá sale una sola cuando alguien ubica un barrio nuevo, nunca
// en lote. Lo que propone no se guarda solo: una persona lo confirma o corre
// el pin (ver Zonas.jsx).
//
// Para cambiar de buscador (por ejemplo, a Google) alcanza con reescribir
// esta función: devuelve [{ nombre, detalle, lat, lng }].
import { RECUADRO_TUCUMAN, nombreSugerido } from './lugares.js'

const URL_BUSCADOR = 'https://nominatim.openstreetmap.org/search'

async function consultar(q, { acotado }) {
  const r = RECUADRO_TUCUMAN
  const params = new URLSearchParams({
    q, format: 'jsonv2', limit: '6', countrycodes: 'ar', 'accept-language': 'es',
    viewbox: `${r.oeste},${r.norte},${r.este},${r.sur}`,
    bounded: acotado ? '1' : '0',
  })
  const res = await fetch(`${URL_BUSCADOR}?${params}`)
  if (!res.ok) throw new Error(`buscador ${res.status}`)
  const filas = await res.json()
  return filas.map((f) => {
    const partes = String(f.display_name || '').split(',').map((s) => s.trim())
    return {
      nombre: f.name || partes[0],
      detalle: partes.slice(1, 4).join(', '),
      lat: Number(f.lat),
      lng: Number(f.lon),
    }
  }).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
}

// Prueba primero dentro del Gran Tucumán con el texto limpio ("Vilago") y
// con el texto entero; si no aparece nada, en toda la provincia.
export async function buscarLugar(texto) {
  const limpio = nombreSugerido(texto)
  const intentos = [
    [limpio, { acotado: true }],
    [texto, { acotado: true }],
    [`${limpio}, Tucumán`, { acotado: false }],
  ]
  const vistos = new Set()
  for (const [q, op] of intentos) {
    if (!q?.trim() || vistos.has(q + op.acotado)) continue
    vistos.add(q + op.acotado)
    const candidatos = await consultar(q, op)
    if (candidatos.length) return candidatos
  }
  return []
}
