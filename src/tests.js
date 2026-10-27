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
    // Se cuentan las vueltas completadas: más vueltas, mejor
    unidad: 'vueltas',
    decimales: 0,
    mejor: 'mayor',
    ayuda: 'Cantidad de vueltas completadas, en número entero (ej.: 42).',
  },
  {
    value: 'salto_largo',
    label: 'Salto en largo',
    abrev: 'Salto',
    unidad: 'cm',
    decimales: 0,
    mejor: 'mayor',
    ayuda: 'Distancia del salto sin carrera, en centímetros.',
  },
  {
    value: 'velocidad_20m',
    label: 'Velocidad 20m',
    abrev: 'Velocidad',
    unidad: 's',
    decimales: 2,
    mejor: 'menor',
    ayuda: 'Segundos con centésimas (ej.: 3.42).',
  },
  // Peso y talla son antropométricos, no una performance: no hay un lado
  // "bueno" hacia el que mejorar, así que el cambio se muestra sin color.
  {
    value: 'peso',
    label: 'Peso',
    abrev: 'Peso',
    unidad: 'kg',
    decimales: 1,
    mejor: null,
    ayuda: 'Kilos con un decimal (ej.: 38.5).',
  },
  {
    value: 'talla',
    label: 'Talla',
    abrev: 'Talla',
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
// Son los dos valores con los que la app pinta sola cada medición: `verde` es
// el borde del verde y `amarillo` el del amarillo; de qué lado queda cada
// rango lo decide el `mejor` del test. No están en el código: los configura el
// cuerpo técnico desde la pantalla de tests y viven en la tabla cortes_tests,
// porque cambian por categoría y por temporada. Las funciones de acá reciben
// el mapa { test: { verde, amarillo } } tal como viene de la base.
//
// Un test sin cortes cargados no se pinta solo: ahí el color lo pone el PF a
// mano, o no lo pone.
//
// Solo se pueden configurar los tests que tienen un lado bueno (`mejor`): el
// peso y la talla no son una performance, así que no llevan semáforo.
// ---------------------------------------------------------------------------

// Con los que arranca la división (los que venía usando el cuerpo técnico).
// Se siembran una sola vez al crear la tabla; de ahí en más mandan los de la
// base, que es lo que el PF edita.
export const CORTES_POR_DEFECTO = {
  salto_largo: { verde: 150, amarillo: 120 },
  velocidad_20m: { verde: 4.00, amarillo: 4.40 },
}

// Un test admite cortes si tiene hacia dónde mejorar
export const admiteCortes = (test) => !!TESTS_POR_VALUE[test]?.mejor

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
// Acepta coma o punto como decimal, y redondea a los decimales del test.
export function parsearValor(test, texto) {
  const t = TESTS_POR_VALUE[test]
  if (!t) return null
  const crudo = String(texto ?? '').trim().replace(',', '.')
  if (!crudo) return null
  const n = Number(crudo)
  if (!Number.isFinite(n) || n <= 0) return null
  return redondear(n, t.decimales)
}

// Número guardado → texto para mostrar (sin la unidad)
export function formatearValor(test, valor) {
  const t = TESTS_POR_VALUE[test]
  if (valor == null || !t) return ''
  return Number(valor).toFixed(t.decimales)
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
  return `${dif > 0 ? '+' : '−'}${conUnidad(test, Math.abs(dif))}`
}

// IMC a partir del peso (kg) y la talla (cm) más recientes. Es un dato de
// contexto para el PF, no una valoración: en chicos de 12 años el IMC se lee
// por percentil de edad, así que la app lo muestra sin semaforizarlo.
export function imc(pesoKg, tallaCm) {
  if (!pesoKg || !tallaCm) return null
  const m = Number(tallaCm) / 100
  return redondear(Number(pesoKg) / (m * m), 1)
}

// Color que le corresponde a una medición según los cortes cargados.
// Devuelve null en los tests que no tienen cortes.
export function semaforoSugerido(test, valor, cortes) {
  const t = TESTS_POR_VALUE[test]
  const c = cortes?.[test]
  if (!t || !c || valor == null) return null
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  if (t.mejor === 'mayor') {
    if (n >= c.verde) return 'verde'
    return n >= c.amarillo ? 'amarillo' : 'rojo'
  }
  if (n <= c.verde) return 'verde'
  return n <= c.amarillo ? 'amarillo' : 'rojo'
}

export const tieneCortes = (test, cortes) => !!cortes?.[test]

// Los tres rangos escritos, para mostrarle al PF con qué criterio se pinta.
// El paso es la unidad más chica que el test puede anotar (1 cm, 0.01 s), así
// el borde de cada rango se lee con el mismo detalle con el que se carga.
export function rangosSemaforo(test, cortes) {
  const t = TESTS_POR_VALUE[test]
  const c = cortes?.[test]
  if (!t || !c) return []
  const paso = 1 / 10 ** t.decimales
  const v = (n) => conUnidad(test, redondear(n, t.decimales))
  if (t.mejor === 'mayor') {
    return [
      { semaforo: 'verde', texto: `${v(c.verde)} o más` },
      { semaforo: 'amarillo', texto: `${v(c.amarillo)} a ${v(c.verde - paso)}` },
      { semaforo: 'rojo', texto: `menos de ${v(c.amarillo)}` },
    ]
  }
  return [
    { semaforo: 'verde', texto: `${v(c.verde)} o menos` },
    { semaforo: 'amarillo', texto: `${v(c.verde + paso)} a ${v(c.amarillo)}` },
    { semaforo: 'rojo', texto: `más de ${v(c.amarillo)}` },
  ]
}

// Valida y normaliza un par de cortes para un test. Devuelve null si el test
// no admite semáforo, si falta un número o si los dos bordes están al revés
// (el verde tiene que ser mejor que el amarillo, hacia donde mejore el test).
export function cortesValidos(test, verde, amarillo) {
  const t = TESTS_POR_VALUE[test]
  if (!t?.mejor) return null
  const v = Number(verde)
  const a = Number(amarillo)
  if (!Number.isFinite(v) || !Number.isFinite(a) || v <= 0 || a <= 0) return null
  if (t.mejor === 'mayor' ? v <= a : v >= a) return null
  return { verde: redondear(v, t.decimales), amarillo: redondear(a, t.decimales) }
}

// Cómo pedirle cada borde al PF, según hacia dónde mejora el test
export function etiquetasDeCortes(test) {
  const t = TESTS_POR_VALUE[test]
  if (!t?.mejor) return null
  const u = t.unidad ? ` (${t.unidad})` : ''
  return t.mejor === 'mayor'
    ? { verde: `Verde desde${u}`, amarillo: `Amarillo desde${u}` }
    : { verde: `Verde hasta${u}`, amarillo: `Amarillo hasta${u}` }
}

function redondear(n, decimales) {
  const f = 10 ** decimales
  return Math.round(n * f) / f
}
