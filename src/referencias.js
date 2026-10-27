// Comparación de una medición con una referencia externa, por edad.
//
// Dos tipos de referencia:
//  · LMS mensual (OMS/CDC): para talla e IMC. De la edad en meses salen L, M
//    y S, y de ahí el puntaje z y el percentil del chico.
//  · Centiles por año cumplido (normas internacionales de tests de campo):
//    para salto, velocidad y resistencia. El percentil se interpola entre los
//    centiles publicados.
//
// La referencia es siempre de VARONES: la app es de una división masculina y
// no guarda el sexo del jugador. Si eso cambia, acá es donde se elige la
// tabla.
//
// Todo lo que devuelve lleva la `fuente`, porque un número comparado contra
// algo que no se dice de dónde salió no sirve para un entrenador.

import { TESTS_POR_VALUE } from './tests.js'
import { FUENTE_CRECIMIENTO, IMC_VARONES, TALLA_VARONES } from './referencias/crecimiento.js'
import { RESISTENCIA_VARONES, SALTO_VARONES, VELOCIDAD_VARONES } from './referencias/rendimiento.js'

// Función de distribución normal estándar (Abramowitz & Stegun 26.2.17, error < 1e-7)
function normalAcumulada(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poli = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const cola = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poli
  return z >= 0 ? 1 - cola : cola
}

const aPercentil = (z) => Math.round(normalAcumulada(z) * 100)

// Fila LMS del mes cumplido (las tablas van mes a mes)
function filaLMS(tabla, meses) {
  if (meses == null || !tabla.length) return null
  return tabla.find((f) => f[0] === meses) || null
}

// Puntaje z según el método LMS (Cole). Para el IMC la OMS limita el z más
// allá de ±3 con un tramo lineal, así un valor extremo no se dispara.
function zLMS(valor, [, L, M, S], { acotar = false } = {}) {
  const z = L === 0 ? Math.log(valor / M) / S : ((valor / M) ** L - 1) / (L * S)
  if (!acotar || Math.abs(z) <= 3) return z
  const sd = (k) => M * (1 + L * S * k) ** (1 / L)
  return z > 3
    ? 3 + (valor - sd(3)) / (sd(3) - sd(2))
    : -3 + (valor - sd(-3)) / (sd(-2) - sd(-3))
}

// Percentil interpolado dentro de los centiles publicados para esa edad.
// Fuera de los extremos se informa el extremo (P<5 → 5, P>95 → 95).
function percentilEnCentiles(valor, centiles, mejor) {
  const puntos = Object.entries(centiles)
    .map(([p, v]) => [Number(p), Number(v)])
    .sort((a, b) => a[0] - b[0])
  if (puntos.length < 2) return null
  // En los tests donde menos es mejor, los centiles vienen decrecientes en
  // valor: se invierte la lectura
  const crece = mejor === 'mayor'
  const antes = crece ? (v, lim) => v <= lim : (v, lim) => v >= lim
  if (antes(valor, puntos[0][1])) return puntos[0][0]
  const ultimo = puntos[puntos.length - 1]
  if (!antes(valor, ultimo[1])) return ultimo[0]
  for (let i = 1; i < puntos.length; i++) {
    const [p0, v0] = puntos[i - 1]
    const [p1, v1] = puntos[i]
    const dentro = crece ? valor <= v1 : valor >= v1
    if (dentro) {
      const frac = v1 === v0 ? 0 : (valor - v0) / (v1 - v0)
      return Math.round(p0 + frac * (p1 - p0))
    }
  }
  return ultimo[0]
}

// Tablas de rendimiento por test
const RENDIMIENTO = {
  salto_largo: SALTO_VARONES,
  velocidad_20m: VELOCIDAD_VARONES,
  resistencia: RESISTENCIA_VARONES,
}

// Qué referencia tiene cada test (para que la pantalla diga de dónde sale o
// que no hay), sin calcular nada
export function fuenteDe(test) {
  if (test === 'talla' || test === 'peso') return TALLA_VARONES.length ? FUENTE_CRECIMIENTO : null
  return RENDIMIENTO[test]?.fuente && Object.keys(RENDIMIENTO[test].centiles).length
    ? RENDIMIENTO[test].fuente
    : null
}

// IMC a partir de peso (kg) y talla (cm)
export const imcDe = (pesoKg, tallaCm) => (pesoKg && tallaCm
  ? Math.round((pesoKg / (tallaCm / 100) ** 2) * 10) / 10
  : null)

// Compara una medición con su referencia. Devuelve { percentil, z, fuente,
// detalle } o null si no hay referencia para ese test, falta la edad, o (en
// el peso) falta la talla con la que calcular el IMC.
//
// `extra.talla` es la talla del chico cercana a la fecha del peso.
export function compararConReferencia(test, valor, edadMeses, extra = {}) {
  if (valor == null || edadMeses == null) return null
  const t = TESTS_POR_VALUE[test]
  if (!t) return null

  if (test === 'talla') {
    const fila = filaLMS(TALLA_VARONES, edadMeses)
    if (!fila) return null
    const z = zLMS(valor, fila)
    return { percentil: aPercentil(z), z: Math.round(z * 100) / 100, fuente: FUENTE_CRECIMIENTO, indicador: 'talla para la edad' }
  }

  if (test === 'peso') {
    // El peso solo no se compara a esta edad: la OMS referencia el IMC
    const imc = imcDe(valor, extra.talla)
    const fila = filaLMS(IMC_VARONES, edadMeses)
    if (!imc || !fila) return null
    const z = zLMS(imc, fila, { acotar: true })
    return { percentil: aPercentil(z), z: Math.round(z * 100) / 100, fuente: FUENTE_CRECIMIENTO, indicador: 'IMC para la edad', imc }
  }

  const ref = RENDIMIENTO[test]
  if (!ref?.fuente) return null
  const centiles = ref.centiles[Math.floor(edadMeses / 12)]
  if (!centiles) return null
  const percentil = percentilEnCentiles(valor, centiles, t.mejor)
  if (percentil == null) return null
  return { percentil, z: null, fuente: ref.fuente, indicador: `edad ${Math.floor(edadMeses / 12)}` }
}

// La mediana de la referencia para una edad: el "chico típico" contra el que
// se lee el promedio del grupo
export function medianaReferencia(test, edadMeses) {
  if (edadMeses == null) return null
  if (test === 'talla') return filaLMS(TALLA_VARONES, edadMeses)?.[2] ?? null
  if (test === 'peso') return null
  const centiles = RENDIMIENTO[test]?.centiles?.[Math.floor(edadMeses / 12)]
  return centiles?.[50] ?? null
}
