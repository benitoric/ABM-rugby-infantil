// Reporte de los tests físicos: convierte las mediciones de los chicos en
// los números que leen los entrenadores —promedios, ranking, evolución y la
// comparación con una referencia externa por edad.
//
// Vive aparte de la pantalla porque el PDF y la vista tienen que contar lo
// mismo: los dos leen de acá. La referencia externa (OMS, normas
// internacionales) la resuelve src/referencias.js; este módulo solo le pasa
// el valor y la edad exacta del chico el día de la medición.

import { diferencia, progreso, TESTS_POR_VALUE } from './tests.js'
import { puestoPrincipal, tipoJugador, PUESTOS } from './helpers.js'
import { compararConReferencia, imcDe, medianaReferencia } from './referencias.js'

const DIAS_TALLA = 90

// La talla del chico más cercana a una fecha, si la hay dentro de la ventana
function tallaCercana(mediciones, jugadorId, fecha) {
  const dias = (a, b) => Math.abs(new Date(a) - new Date(b)) / 86400000
  let mejor = null
  for (const m of mediciones) {
    if (m.jugador_id !== jugadorId || m.test !== 'talla') continue
    const d = dias(m.fecha, fecha)
    if (d <= DIAS_TALLA && (!mejor || d < mejor.d)) mejor = { fecha: m.fecha, valor: m.valor, d }
  }
  return mejor
}

// Edad en meses cumplidos entre dos fechas 'YYYY-MM-DD'. Las referencias por
// edad se leen con la edad del día de la medición, no la de hoy: un chico
// medido en marzo a los 11 y 2 meses se compara con 11 y 2 meses.
export function edadEnMeses(fechaNacimiento, fecha) {
  if (!fechaNacimiento || !fecha) return null
  const [an, mn, dn] = fechaNacimiento.split('-').map(Number)
  const [a, m, d] = fecha.split('-').map(Number)
  let meses = (a - an) * 12 + (m - mn)
  if (d < dn) meses -= 1
  return meses >= 0 ? meses : null
}

export const edadEnAnios = (meses) => (meses == null ? null : Math.floor(meses / 12))

// Texto corto de la edad: "11 a 7 m"
export function textoEdad(meses) {
  if (meses == null) return 'sin fecha de nac.'
  const a = Math.floor(meses / 12)
  const m = meses % 12
  return m ? `${a} a ${m} m` : `${a} años`
}

const redondear = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

function estadisticas(valores) {
  if (!valores.length) return null
  const orden = [...valores].sort((x, y) => x - y)
  const n = orden.length
  const suma = orden.reduce((a, b) => a + b, 0)
  const promedio = suma / n
  const mediana = n % 2 ? orden[(n - 1) / 2] : (orden[n / 2 - 1] + orden[n / 2]) / 2
  const desvio = n > 1
    ? Math.sqrt(orden.reduce((a, v) => a + (v - promedio) ** 2, 0) / (n - 1))
    : 0
  return {
    n, promedio: redondear(promedio, 2), mediana: redondear(mediana, 2),
    min: orden[0], max: orden[n - 1], desvio: redondear(desvio, 2),
  }
}

// El reporte de un test para un período. `mediciones` son todas las filas
// que devuelve stats/tests (de todos los tests); acá se filtran.
//
// Por chico cuenta UNA medición: la última dentro del período. La anterior
// (de cualquier fecha, incluso antes del período) sirve para la evolución.
export function resumirTest(test, mediciones, { desde, hasta }) {
  const t = TESTS_POR_VALUE[test]
  if (!t) return null
  const delTest = mediciones.filter((m) => m.test === test)

  // Última medición por chico dentro del período y la inmediata anterior
  const porJugador = new Map()
  for (const m of delTest) {
    if (!porJugador.has(m.jugador_id)) porJugador.set(m.jugador_id, [])
    porJugador.get(m.jugador_id).push(m)
  }

  const filas = []
  for (const [, lista] of porJugador) {
    // vienen ordenadas por fecha asc desde la API
    const enPeriodo = lista.filter((m) => m.fecha >= desde && m.fecha <= hasta)
    if (!enPeriodo.length) continue
    const ultima = enPeriodo[enPeriodo.length - 1]
    const anterior = [...lista].reverse().find((m) => m.fecha < ultima.fecha) || null
    const edadMeses = edadEnMeses(ultima.fecha_nacimiento, ultima.fecha)
    // El peso se compara a través del IMC, que necesita la talla del mismo
    // chico cerca de esa fecha (hasta 90 días)
    const talla = test === 'peso' ? tallaCercana(mediciones, ultima.jugador_id, ultima.fecha) : null
    const referencia = compararConReferencia(test, ultima.valor, edadMeses, { talla: talla?.valor })
    filas.push({
      imc: test === 'peso' ? imcDe(ultima.valor, talla?.valor) : null,
      tallaUsada: talla,
      // La línea (forward/back/mixto), el puesto principal y todos los puestos
      // en los que puede jugar, como en la ficha
      tipo: tipoJugador(ultima),
      puesto: puestoPrincipal(ultima),
      puestos: ultima.puestos || [],
      jugador_id: ultima.jugador_id,
      nombre: ultima.nombre,
      apellido: ultima.apellido,
      fecha: ultima.fecha,
      valor: ultima.valor,
      semaforo: ultima.semaforo,
      semaforo_auto: ultima.semaforo_auto,
      edadMeses,
      edadAnios: edadEnAnios(edadMeses),
      anterior: anterior ? { fecha: anterior.fecha, valor: anterior.valor } : null,
      progreso: anterior ? progreso(test, ultima.valor, anterior.valor) : null,
      diferencia: anterior ? diferencia(test, ultima.valor, anterior.valor) : null,
      referencia, // { percentil, z, fuente } o null
    })
  }

  // Orden: en los tests con lado bueno, del mejor al peor (eso es el ranking);
  // en peso y talla no hay ranking que valga, así que van por apellido.
  const orden = t.mejor === 'mayor'
    ? (a, b) => b.valor - a.valor
    : t.mejor === 'menor'
      ? (a, b) => a.valor - b.valor
      : (a, b) => `${a.apellido} ${a.nombre}`.localeCompare(`${b.apellido} ${b.nombre}`, 'es')
  filas.sort(orden)
  if (t.mejor) {
    // Empate = misma posición
    let pos = 0
    filas.forEach((f, i) => {
      if (i === 0 || f.valor !== filas[i - 1].valor) pos = i + 1
      f.posicion = pos
    })
  }

  const valores = filas.map((f) => f.valor)
  const grupo = estadisticas(valores)

  // Estadísticas de un subconjunto, con el percentil mediano de referencia
  // cuando hay con qué calcularlo
  function resumenDe(suyas) {
    const base = estadisticas(suyas.map((f) => f.valor))
    const refs = suyas.filter((f) => f.referencia).map((f) => f.referencia.percentil)
    return { ...base, percentilMediana: refs.length ? Math.round(estadisticas(refs).mediana) : null }
  }

  // Por línea: forwards, backs y los que juegan en las dos. Es la comparación
  // que piden los entrenadores: un pilar y un wing no corren lo mismo.
  const porLinea = [['Forward', 'Forwards'], ['Back', 'Backs'], ['Mixto', 'Mixtos']]
    .map(([tipo, label]) => ({ tipo, label, ...resumenDe(filas.filter((f) => f.tipo === tipo)) }))
    .filter((g) => g.n)
  const sinLinea = filas.filter((f) => !f.tipo).length

  // Por puesto principal, en el orden del catálogo (1 al 15)
  const porPuesto = PUESTOS
    .map((p) => ({ puesto: p.value, label: p.label, plural: p.plural, abrev: p.abrev, ...resumenDe(filas.filter((f) => f.puesto === p.value)) }))
    .filter((g) => g.n)
  const sinPuesto = filas.filter((f) => !f.puesto).length

  // Por edad cumplida: con pocos chicos por edad el promedio es orientativo,
  // pero es la única comparación justa entre un chico de 11 y uno de 12
  const porEdad = []
  for (const edad of [...new Set(filas.map((f) => f.edadAnios).filter((e) => e != null))].sort()) {
    const suyas = filas.filter((f) => f.edadAnios === edad)
    porEdad.push({ edad, ...resumenDe(suyas) })
  }
  const sinEdad = filas.filter((f) => f.edadAnios == null).length

  // Semáforo del grupo
  const semaforos = { verde: 0, amarillo: 0, rojo: 0, sin: 0 }
  for (const f of filas) semaforos[f.semaforo || 'sin'] += 1

  // Evolución: cuántos mejoraron, empeoraron o siguen igual respecto de su
  // medición anterior (solo en tests con lado bueno)
  const evolucion = t.mejor
    ? {
        conAnterior: filas.filter((f) => f.anterior).length,
        mejoraron: filas.filter((f) => f.progreso === 'sube').length,
        empeoraron: filas.filter((f) => f.progreso === 'baja').length,
        iguales: filas.filter((f) => f.anterior && !f.progreso).length,
      }
    : null

  // Contra la referencia externa: dónde cae cada chico y el grupo entero
  const conRef = filas.filter((f) => f.referencia)
  const comparacion = conRef.length
    ? {
        n: conRef.length,
        sinReferencia: filas.length - conRef.length,
        fuente: conRef[0].referencia.fuente,
        percentilPromedio: redondear(conRef.reduce((a, f) => a + f.referencia.percentil, 0) / conRef.length, 0),
        percentilMediana: redondear(estadisticas(conRef.map((f) => f.referencia.percentil)).mediana, 0),
        bajoP25: conRef.filter((f) => f.referencia.percentil < 25).length,
        entreP25yP75: conRef.filter((f) => f.referencia.percentil >= 25 && f.referencia.percentil <= 75).length,
        sobreP75: conRef.filter((f) => f.referencia.percentil > 75).length,
      }
    : null

  // El promedio del grupo contra el "chico típico" de la referencia a la
  // edad promedio del grupo (solo donde la referencia da una mediana directa)
  const edades = filas.map((f) => f.edadMeses).filter((e) => e != null)
  const edadPromedioMeses = edades.length ? Math.round(edades.reduce((a, b) => a + b, 0) / edades.length) : null
  const medianaRef = medianaReferencia(test, edadPromedioMeses)

  return {
    test: t,
    desde, hasta,
    edadPromedioMeses,
    medianaReferencia: medianaRef,
    filas,
    grupo,
    porEdad,
    sinEdad,
    porLinea,
    sinLinea,
    porPuesto,
    sinPuesto,
    semaforos,
    evolucion,
    comparacion,
  }
}

// Ranking por puesto para el PDF: en cada puesto entran solo los que lo
// tienen como puesto principal (el mismo criterio que la tabla por puesto),
// ordenados igual que el ranking general y con la posición recalculada
// dentro del puesto. El que tiene varios puestos y ninguno elegido como
// principal no entra en ninguno.
export function rankingPorPuesto(resumen) {
  const t = resumen.test
  return PUESTOS
    .map((p) => {
      const suyos = resumen.filas
        .filter((f) => f.puesto === p.value)
        .map((f) => ({ ...f }))
      if (t.mejor) {
        let pos = 0
        suyos.forEach((f, i) => {
          if (i === 0 || f.valor !== suyos[i - 1].valor) pos = i + 1
          f.posicion = pos
        })
      }
      return { puesto: p.value, label: p.label, plural: p.plural, abrev: p.abrev, filas: suyos }
    })
    .filter((g) => g.filas.length)
}
