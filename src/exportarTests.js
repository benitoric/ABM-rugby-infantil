// Exportación de los tests físicos a una planilla Excel (.xlsx de verdad, no
// CSV: así los números llegan como números y las fechas como fechas, sin
// depender del idioma del Excel que la abre).
//
// Tres hojas:
//  - Mediciones: una fila por medición, con el chico, su línea y puesto, la
//    edad del día del test, el valor, el semáforo (y si lo puso la tabla o el
//    PF), la nota y quién la cargó. Es la historia completa, dados de baja
//    incluidos, para filtrar y armar tablas dinámicas.
//  - Última por jugador: una fila por chico con la última medición de cada
//    test y su fecha, para ver el plantel de un vistazo.
//  - Criterios: los cortes del semáforo vigentes, para que la planilla
//    explique sus colores.
import { ESTADOS, PUESTOS, puestoPrincipal, tipoJugador } from './helpers.js'
import { edadEnMeses, textoEdad } from './estadisticaTests.js'
import { rangosSemaforo, semaforo, TESTS, TESTS_POR_VALUE, velocidadMS } from './tests.js'
import { generarXLSX } from './xlsx.js'

const PUESTO_LABEL = Object.fromEntries(PUESTOS.map((p) => [p.value, p.label]))

export function hojaMediciones(mediciones) {
  return {
    nombre: 'Mediciones',
    columnas: [
      { titulo: 'Apellido', ancho: 16 }, { titulo: 'Nombre', ancho: 14 },
      { titulo: 'Estado', ancho: 11 }, { titulo: 'Línea', ancho: 9 },
      { titulo: 'Puesto principal', ancho: 16 }, { titulo: 'Fecha', ancho: 11 },
      { titulo: 'Edad al medir', ancho: 13 }, { titulo: 'Test', ancho: 18 },
      { titulo: 'Valor', ancho: 9 }, { titulo: 'Unidad', ancho: 8 },
      { titulo: 'Velocidad (m/s)', ancho: 14 }, { titulo: 'Semáforo', ancho: 10 },
      { titulo: 'Color puesto por', ancho: 15 }, { titulo: 'Nota', ancho: 30 },
      { titulo: 'Cargada por', ancho: 20 }, { titulo: 'Cargada el', ancho: 11 },
    ],
    filas: mediciones.map((m) => {
      const t = TESTS_POR_VALUE[m.test]
      return [
        m.apellido, m.nombre,
        ESTADOS[m.estado] || m.estado || '',
        tipoJugador(m) || '',
        PUESTO_LABEL[puestoPrincipal(m)] || '',
        { fecha: m.fecha },
        edad(m),
        t?.label || m.test,
        Number(m.valor), t?.unidad || '',
        m.test === 'velocidad_20m' ? velocidadMS(m.valor) : null,
        semaforo(m.semaforo)?.label || '',
        m.semaforo ? (m.semaforo_auto ? 'Tabla' : 'PF') : '',
        m.nota || '',
        m.autor_nombre || m.autor_email || '',
        m.cargada_en ? { fecha: m.cargada_en } : null,
      ]
    }),
  }
}

// Edad del día de la medición; sin fecha de nacimiento la celda queda vacía
function edad(m) {
  const meses = edadEnMeses(m.fecha_nacimiento, m.fecha)
  return meses == null ? '' : textoEdad(meses)
}

export function hojaUltimas(mediciones) {
  const porJugador = new Map()
  for (const m of mediciones) {
    if (!porJugador.has(m.jugador_id)) porJugador.set(m.jugador_id, { jugador: m, ultimas: {} })
    const u = porJugador.get(m.jugador_id).ultimas
    if (!u[m.test] || m.fecha >= u[m.test].fecha) u[m.test] = m
  }
  const jugadores = [...porJugador.values()]
    .sort((a, b) => `${a.jugador.apellido} ${a.jugador.nombre}`.localeCompare(`${b.jugador.apellido} ${b.jugador.nombre}`))
  return {
    nombre: 'Última por jugador',
    columnas: [
      { titulo: 'Apellido', ancho: 16 }, { titulo: 'Nombre', ancho: 14 },
      { titulo: 'Estado', ancho: 11 }, { titulo: 'Puesto principal', ancho: 16 },
      ...TESTS.flatMap((t) => [
        { titulo: `${t.abrev} (${t.unidad})`, ancho: 13 },
        { titulo: `Fecha ${t.abrev.toLowerCase()}`, ancho: 11 },
      ]),
    ],
    filas: jugadores.map(({ jugador, ultimas }) => [
      jugador.apellido, jugador.nombre,
      ESTADOS[jugador.estado] || jugador.estado || '',
      PUESTO_LABEL[puestoPrincipal(jugador)] || '',
      ...TESTS.flatMap((t) => {
        const m = ultimas[t.value]
        return m ? [Number(m.valor), { fecha: m.fecha }] : [null, null]
      }),
    ]),
  }
}

export function hojaCriterios(cortes) {
  const filas = []
  for (const t of TESTS) {
    const rangos = rangosSemaforo(t.value, cortes)
    if (!rangos.length) continue
    for (const r of rangos) filas.push([t.label, semaforo(r.semaforo)?.label || r.semaforo, r.texto])
  }
  return {
    nombre: 'Criterios',
    columnas: [{ titulo: 'Test', ancho: 18 }, { titulo: 'Semáforo', ancho: 10 }, { titulo: 'Rango', ancho: 22 }],
    filas,
  }
}

export function armarPlanillaTests({ mediciones, cortes }) {
  return generarXLSX([hojaMediciones(mediciones), hojaUltimas(mediciones), hojaCriterios(cortes)])
}

export function nombrePlanillaTests() {
  return `tests-fisicos-${new Date().toISOString().slice(0, 10)}.xlsx`
}
