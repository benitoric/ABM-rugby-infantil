// Dónde viven los chicos: barrio o localidad, nunca el domicilio. El barrio se
// carga como texto libre ("country Vilago", "B° Norte", "Yerba Buena") y la
// app lo normaliza para reconocer el lugar. Cada lugar se ubica en el mapa una
// sola vez (la primera vez que aparece, confirmando o corrigiendo lo que
// propone el buscador de mapas) y queda aprendido con todas las formas en que
// se lo escribió: las siguientes se resuelven solas.
//
// Este módulo no toca el DOM: lo usan el servidor (server/lugares.js, para
// resolver el lugar de cada chico al guardar) y la pantalla de zonas.

// Dónde queda el club. Es un valor de arranque aproximado: quien administra lo
// corrige desde el mapa y queda guardado en `ajustes` (clave club_ubicacion).
export const CLUB_POR_DEFECTO = { lat: -26.8297, lng: -65.1868 }

// Recuadro del Gran Tucumán y alrededores, para que el buscador de mapas no
// proponga un "Barrio Norte" de otra provincia
export const RECUADRO_TUCUMAN = { oeste: -65.55, norte: -26.55, este: -64.9, sur: -27.15 }

// Anillos de distancia al club, en km (línea recta desde el centro del barrio)
export const ANILLOS = [
  { hasta: 3, etiqueta: 'Hasta 3 km' },
  { hasta: 7, etiqueta: 'De 3 a 7 km' },
  { hasta: 15, etiqueta: 'De 7 a 15 km' },
  { hasta: Infinity, etiqueta: 'Más de 15 km' },
]

// "Lejos": desde el tercer anillo. Es lo que se mira para valorar la
// asistencia y para proponer pooles.
export const KM_LEJOS = 7

// Palabras que no distinguen un lugar de otro: "Barrio Norte" y "B° Norte",
// "Country Vilago" y "Vilago" son lo mismo.
const RELLENO = new Set([
  'barrio', 'b', 'bo', 'bario', 'country', 'countri', 'club', 'de', 'campo', 'privado',
  'cerrado', 'urbanizacion', 'urb', 'complejo', 'loteo', 'el', 'la', 'los', 'las', 'del',
])

// Abreviaturas de uso común
const ABREVIATURAS = { yb: 'yerba buena', smt: 'san miguel de tucuman' }

// La forma canónica de un texto: minúsculas, sin tildes, sin signos y sin las
// palabras de relleno. Es la clave con la que se reconoce un lugar.
export function normalizar(texto) {
  const palabras = String(texto ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[°º]/g, ' ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((p) => ABREVIATURAS[p] || p)
    .join(' ')
    .split(' ')
  const utiles = palabras.filter((p) => !RELLENO.has(p))
  // Si todo era relleno ("Country Club") se queda con lo que había
  return (utiles.length ? utiles : palabras).join(' ').trim()
}

// Las claves con las que se busca un texto, en orden: el texto entero y, si
// trae aclaraciones ("Vilago, Yerba Buena", "Las Lomitas (YB)"), la primera
// parte sola.
export function clavesDe(texto) {
  const claves = []
  const entera = normalizar(texto)
  if (entera) claves.push(entera)
  const primera = normalizar(String(texto ?? '').split(/[,;(/]| - | en /)[0])
  if (primera && !claves.includes(primera)) claves.push(primera)
  return claves
}

// Nombre prolijo para proponer al crear un lugar: sin "barrio" ni "country"
// adelante y con mayúscula inicial ("country vilago" → "Vilago")
export function nombreSugerido(texto) {
  const limpio = String(texto ?? '').trim()
    .replace(/^(barrio|b°|bº|b\.|bo\.?|country|club de campo)\s+/i, '')
    .split(/[,;(]/)[0].trim()
  return limpio.replace(/(^|\s)(\p{L})/gu, (m, esp, l) => esp + l.toUpperCase())
}

// Distancia en km entre dos puntos {lat, lng}, en línea recta sobre la Tierra
export function distanciaKm(a, b) {
  if (!a || !b) return null
  const rad = (g) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

export function anilloDe(km) {
  if (km == null) return null
  return ANILLOS.findIndex((a) => km <= a.hasta)
}

// "2,4 km", "12 km": con un decimal solo por debajo de 10
export function textoKm(km) {
  if (km == null) return '—'
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`
}

// Distancia de edición entre dos claves (para sugerir "¿será Vilago?" ante un
// error de tipeo). Solo sugiere: nunca asigna sola.
function levenshtein(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]
    fila[0] = i
    for (let j = 1; j <= b.length; j++) {
      const guardado = fila[j]
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1))
      previo = guardado
    }
  }
  return fila[b.length]
}

// El lugar conocido más parecido a un texto que no se reconoció: por error de
// tipeo (una o dos letras de diferencia, según el largo) o porque una clave
// contiene a la otra palabra por palabra ("vilago" en "vilago yerba buena
// alta"). lugares: [{id, nombre, alias: [clave]}].
export function lugarParecido(texto, lugares) {
  const claves = clavesDe(texto)
  if (!claves.length) return null
  let mejor = null
  for (const l of lugares) {
    for (const alias of [normalizar(l.nombre), ...(l.alias || [])]) {
      if (!alias) continue
      for (const c of claves) {
        const tope = Math.min(c.length, alias.length) >= 8 ? 2 : Math.min(c.length, alias.length) >= 5 ? 1 : 0
        const d = levenshtein(c, alias)
        const contiene = (` ${c} `).includes(` ${alias} `) || (` ${alias} `).includes(` ${c} `)
        const puntaje = d <= tope ? d : contiene ? 3 : Infinity
        if (puntaje < (mejor?.puntaje ?? Infinity)) mejor = { lugar: l, puntaje }
      }
    }
  }
  return mejor?.lugar || null
}

// Agrupa los lugares con chicos en zonas para armar pooles: dos lugares van
// juntos si quedan a menos de `km` uno del otro (y por cadena, los vecinos de
// sus vecinos). Devuelve los grupos con más chicos primero.
// lugares: [{id, lat, lng, ...}] — solo los que tienen chicos.
export function zonasDePool(lugares, km = 2.5) {
  const grupo = new Map(lugares.map((l) => [l.id, l.id]))
  const raiz = (id) => (grupo.get(id) === id ? id : raiz(grupo.get(id)))
  for (let i = 0; i < lugares.length; i++) {
    for (let j = i + 1; j < lugares.length; j++) {
      if (distanciaKm(lugares[i], lugares[j]) <= km) {
        grupo.set(raiz(lugares[i].id), raiz(lugares[j].id))
      }
    }
  }
  const zonas = new Map()
  for (const l of lugares) {
    const r = raiz(l.id)
    if (!zonas.has(r)) zonas.set(r, [])
    zonas.get(r).push(l)
  }
  return [...zonas.values()]
}
