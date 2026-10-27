// Catálogo de los tests físicos que toman los PF en los entrenamientos.
//
// A diferencia de la evaluación periódica (src/evaluacion.js), que es una
// mirada subjetiva de 1 a 5 sobre muchas variables, acá cada test es una
// medición objetiva y suelta: se toma cuando el PF lo decide, de a un test
// por vez. Junto al número queda el semáforo con la valoración del PF.
//
// Este archivo lo comparten el frontend y el router (no toca el DOM): así la
// lista de tests válidos y la conversión de unidades es la misma de los dos
// lados.

export const TESTS = [
  {
    value: 'resistencia',
    label: 'Resistencia 10x20m',
    abrev: 'Resistencia',
    // Se anota en minutos y segundos; se guarda siempre en segundos
    formato: 'tiempo',
    unidad: '',
    decimales: 2,
    mejor: 'menor',
    ayuda: 'Tiempo total del circuito, en minutos y segundos (ej.: 3:05 o 3:05.40).',
  },
  {
    value: 'salto_largo',
    label: 'Salto en largo',
    abrev: 'Salto',
    formato: 'numero',
    unidad: 'cm',
    decimales: 0,
    mejor: 'mayor',
    // Verde desde 150 cm, amarillo desde 120, rojo abajo de eso
    cortes: { verde: 150, amarillo: 120 },
    ayuda: 'Distancia del salto sin carrera, en centímetros.',
  },
  {
    value: 'velocidad_20m',
    label: 'Velocidad 20m',
    abrev: 'Velocidad',
    formato: 'numero',
    unidad: 's',
    decimales: 2,
    mejor: 'menor',
    // Verde hasta 4.00 s, amarillo hasta 4.40, rojo arriba de eso
    cortes: { verde: 4.00, amarillo: 4.40 },
    ayuda: 'Segundos con centésimas (ej.: 3.42).',
  },
  // Peso y talla son antropométricos, no una performance: no hay un lado
  // "bueno" hacia el que mejorar, así que el cambio se muestra sin color.
  {
    value: 'peso',
    label: 'Peso',
    abrev: 'Peso',
    formato: 'numero',
    unidad: 'kg',
    decimales: 1,
    mejor: null,
    ayuda: 'Kilos con un decimal (ej.: 38.5).',
  },
  {
    value: 'talla',
    label: 'Talla',
    abrev: 'Talla',
    formato: 'numero',
    unidad: 'cm',
    decimales: 0,
    mejor: null,
    ayuda: 'Altura en centímetros (ej.: 145).',
  },
]

export const TESTS_POR_VALUE = Object.fromEntries(TESTS.map((t) => [t.value, t]))

export const CLAVES_TEST = TESTS.map((t) => t.value)

// ---------------------------------------------------------------------------
// Cortes del semáforo
//
// Los `cortes` de cada test son los valores con los que la app propone el
// color sola, apenas se carga la medición. Están pensados para la M12: son
// los que usa el cuerpo técnico de la división, no una tabla universal, así
// que si la app se usa en otra categoría hay que revisarlos.
//
// Un test sin `cortes` (la resistencia, el peso y la talla) no propone nada:
// ahí el color lo pone el PF a mano, o no lo pone.
// ---------------------------------------------------------------------------

// Valoración del PF junto a la medición. Siempre opcional: primero se anota
// el número (que es lo que apura en la cancha) y el color puede ir después.
export const SEMAFOROS = [
  { value: 'verde', label: 'Muy bueno', ico: '🟢', color: 'var(--ok)' },
  { value: 'amarillo', label: 'Regular', ico: '🟡', color: 'var(--warn)' },
  { value: 'rojo', label: 'Malo', ico: '🔴', color: 'var(--bad)' },
]

export const CLAVES_SEMAFORO = SEMAFOROS.map((s) => s.value)

export const semaforo = (v) => SEMAFOROS.find((s) => s.value === v) || null

// Texto escrito por el PF → número guardado. Devuelve null si no se entiende.
// En los tests de tiempo acepta mm:ss, mm:ss.cc y también los segundos
// pelados (un circuito que se hizo en menos de un minuto).
export function parsearValor(test, texto) {
  const t = TESTS_POR_VALUE[test]
  if (!t) return null
  const crudo = String(texto ?? '').trim().replace(',', '.')
  if (!crudo) return null
  if (t.formato === 'tiempo' && crudo.includes(':')) {
    const [min, seg] = crudo.split(':')
    const m = Number(min)
    const s = Number(seg)
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null
    return redondear(m * 60 + s, 2)
  }
  const n = Number(crudo)
  if (!Number.isFinite(n) || n <= 0) return null
  return redondear(n, t.decimales)
}

// Número guardado → texto para mostrar (sin la unidad)
export function formatearValor(test, valor) {
  const t = TESTS_POR_VALUE[test]
  if (valor == null || !t) return ''
  const n = Number(valor)
  if (t.formato === 'tiempo') {
    const min = Math.floor(n / 60)
    const seg = n - min * 60
    const centesimas = Math.round((seg - Math.floor(seg)) * 100)
    const base = `${min}:${String(Math.floor(seg)).padStart(2, '0')}`
    return centesimas ? `${base}.${String(centesimas).padStart(2, '0')}` : base
  }
  return n.toFixed(t.decimales)
}

// Valor con su unidad, para las tarjetas y el historial
export function conUnidad(test, valor) {
  const t = TESTS_POR_VALUE[test]
  if (valor == null || !t) return '—'
  return t.unidad ? `${formatearValor(test, valor)} ${t.unidad}` : formatearValor(test, valor)
}

// Cómo le fue respecto de la medición anterior: 'sube' (mejoró), 'baja'
// (empeoró) o null cuando no hay con qué comparar o el test no tiene un lado
// bueno (peso y talla).
export function progreso(test, actual, anterior) {
  const t = TESTS_POR_VALUE[test]
  if (!t?.mejor || actual == null || anterior == null) return null
  const dif = Number(actual) - Number(anterior)
  if (!dif) return null
  const mejoro = t.mejor === 'menor' ? dif < 0 : dif > 0
  return mejoro ? 'sube' : 'baja'
}

// Diferencia contra la medición anterior, ya formateada y con signo
export function diferencia(test, actual, anterior) {
  if (actual == null || anterior == null) return null
  const dif = redondear(Number(actual) - Number(anterior), 2)
  if (!dif) return null
  const t = TESTS_POR_VALUE[test]
  // En los tiempos la diferencia se lee mejor en segundos que en mm:ss
  const abs = t?.formato === 'tiempo'
    ? `${Math.abs(dif).toFixed(2)} s`
    : conUnidad(test, Math.abs(dif))
  return `${dif > 0 ? '+' : '−'}${abs}`
}

// IMC a partir del peso (kg) y la talla (cm) más recientes. Es un dato de
// contexto para el PF, no una valoración: en chicos de 12 años el IMC se lee
// por percentil de edad, así que la app lo muestra sin semaforizarlo.
export function imc(pesoKg, tallaCm) {
  if (!pesoKg || !tallaCm) return null
  const m = Number(tallaCm) / 100
  return redondear(Number(pesoKg) / (m * m), 1)
}

// Color que le corresponde a una medición según la tabla de la división.
// Devuelve null en los tests que no tienen cortes cargados.
export function semaforoSugerido(test, valor) {
  const t = TESTS_POR_VALUE[test]
  if (!t?.cortes || valor == null) return null
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  if (t.mejor === 'mayor') {
    if (n >= t.cortes.verde) return 'verde'
    return n >= t.cortes.amarillo ? 'amarillo' : 'rojo'
  }
  if (n <= t.cortes.verde) return 'verde'
  return n <= t.cortes.amarillo ? 'amarillo' : 'rojo'
}

export const tieneCortes = (test) => !!TESTS_POR_VALUE[test]?.cortes

// Los tres rangos escritos, para mostrarle al PF con qué criterio se pinta.
// El paso es la unidad más chica que el test puede anotar (1 cm, 0.01 s), así
// el borde de cada rango se lee con el mismo detalle con el que se carga.
export function rangosSemaforo(test) {
  const t = TESTS_POR_VALUE[test]
  if (!t?.cortes) return []
  const paso = 1 / 10 ** t.decimales
  const v = (n) => conUnidad(test, redondear(n, t.decimales))
  if (t.mejor === 'mayor') {
    return [
      { semaforo: 'verde', texto: `${v(t.cortes.verde)} o más` },
      { semaforo: 'amarillo', texto: `${v(t.cortes.amarillo)} a ${v(t.cortes.verde - paso)}` },
      { semaforo: 'rojo', texto: `menos de ${v(t.cortes.amarillo)}` },
    ]
  }
  return [
    { semaforo: 'verde', texto: `${v(t.cortes.verde)} o menos` },
    { semaforo: 'amarillo', texto: `${v(t.cortes.verde + paso)} a ${v(t.cortes.amarillo)}` },
    { semaforo: 'rojo', texto: `más de ${v(t.cortes.amarillo)}` },
  ]
}

function redondear(n, decimales) {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}
