import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCompacta, fechaCorta, nombreCompleto } from '../helpers.js'
import {
  conUnidad, diferencia, formatearValor, imc, parsearValor, progreso, semaforo,
  SEMAFOROS, TESTS, TESTS_POR_VALUE,
} from '../tests.js'

// Clave de una medición dentro del estado local de la pantalla de carga
const clave = (jugadorId, test) => `${jugadorId}|${test}`

// Los tres colores con los que el PF valora la medición. Sin color también se
// guarda: primero el número, que es lo que apura en la cancha.
function Semaforo({ valor, onCambiar, deshabilitado }) {
  return (
    <div className="semaforo">
      {SEMAFOROS.map((s) => (
        <button
          key={s.value}
          type="button"
          className={`semaforo-luz${valor === s.value ? ' on' : ''}`}
          disabled={deshabilitado}
          title={s.label}
          aria-label={s.label}
          aria-pressed={valor === s.value}
          onClick={() => onCambiar(valor === s.value ? null : s.value)}
        >
          {s.ico}
        </button>
      ))}
    </div>
  )
}

// Una fila de carga: el número se guarda al salir del campo y el color al
// tocarlo, sin botón de guardar (mismo criterio que la toma de asistencia).
function FilaTest({ jugador, test, medicion, previa, onGuardar }) {
  const t = TESTS_POR_VALUE[test]
  const [texto, setTexto] = useState(() => formatearValor(test, medicion?.valor))
  const [error, setError] = useState(false)

  // Al cambiar de test la fila muestra la medición de ese otro test
  useEffect(() => {
    setTexto(formatearValor(test, medicion?.valor))
    setError(false)
  }, [test, jugador.id])

  function confirmar() {
    const crudo = texto.trim()
    // Vaciar el campo borra la medición (se cargó a quien no era)
    if (!crudo) {
      setError(false)
      if (medicion) onGuardar(jugador.id, null, null)
      return
    }
    const valor = parsearValor(test, crudo)
    if (valor == null) { setError(true); return }
    setError(false)
    setTexto(formatearValor(test, valor))
    if (valor !== medicion?.valor) onGuardar(jugador.id, valor, medicion?.semaforo || null)
  }

  const cambio = medicion && previa
    ? { texto: diferencia(test, medicion.valor, previa.valor), como: progreso(test, medicion.valor, previa.valor) }
    : null

  return (
    <div className={`fila-test${medicion ? ' cargada' : ''}`}>
      <div className="fila-test-nombre">
        <div style={{ fontWeight: 600 }}>{nombreCompleto(jugador)}</div>
        {previa && (
          <div className="mini">
            ant. {conUnidad(test, previa.valor)} · {fechaCompacta(previa.fecha)}
            {cambio?.texto && (
              <span className={`eval-delta ${cambio.como || ''}`}>
                {' '}{cambio.texto}{cambio.como === 'sube' ? ' ▲' : cambio.como === 'baja' ? ' ▼' : ''}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="fila-test-dato">
        <input
          className={error ? 'invalido' : ''}
          type="text"
          inputMode="decimal"
          placeholder={t.formato === 'tiempo' ? 'm:ss' : '—'}
          aria-label={`${t.label} de ${nombreCompleto(jugador)}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        />
        {t.unidad && <span className="mini">{t.unidad}</span>}
      </div>
      <Semaforo
        valor={medicion?.semaforo || null}
        deshabilitado={!medicion}
        onCambiar={(s) => onGuardar(jugador.id, medicion.valor, s)}
      />
    </div>
  )
}

// Pantalla de carga en tanda: un test por vez, los presentes del día en una
// sola lista. Así el PF carga a todo el plantel de un scroll.
export default function TestsFisicos({ evento, onVolver }) {
  const [test, setTest] = useState(TESTS[0].value)
  const [jugadores, setJugadores] = useState([])
  const [presentes, setPresentes] = useState(new Set())
  const [mediciones, setMediciones] = useState({})
  const [previas, setPrevias] = useState({})
  const [soloPresentes, setSoloPresentes] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    async function cargar() {
      const [js, asis, datos] = await Promise.all([
        api('jugadores'),
        api(`eventos/${evento.id}/asistencias`),
        api(`eventos/${evento.id}/tests`),
      ])
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      setPresentes(new Set(asis.filter((a) => a.estado === 'presente').map((a) => a.jugador_id)))
      const m = {}
      for (const x of datos.tests) m[clave(x.jugador_id, x.test)] = x
      setMediciones(m)
      const p = {}
      for (const x of datos.previas) p[clave(x.jugador_id, x.test)] = x
      setPrevias(p)
      setCargando(false)
    }
    setErrorCarga(null)
    setCargando(true)
    cargar().catch((e) => { setErrorCarga(e); setCargando(false) })
  }, [evento.id, intento])

  // Guarda una medición (valor null la borra) con vuelta atrás si falla
  async function guardar(jugadorId, valor, sem) {
    const k = clave(jugadorId, test)
    const previo = mediciones[k]
    setMediciones((m) => {
      const copia = { ...m }
      if (valor == null) delete copia[k]
      else copia[k] = { ...copia[k], jugador_id: jugadorId, test, valor, semaforo: sem || null }
      return copia
    })
    try {
      const r = await api(`eventos/${evento.id}/tests`, {
        method: 'PUT',
        body: { marcas: [{ jugador_id: jugadorId, test, valor, semaforo: sem || null }] },
      })
      const guardada = r?.guardadas?.[0]
      if (guardada) setMediciones((m) => ({ ...m, [k]: guardada }))
    } catch {
      setMediciones((m) => {
        const copia = { ...m }
        if (previo) copia[k] = previo
        else delete copia[k]
        return copia
      })
      alert('No se pudo guardar la medición. Probá de nuevo.')
    }
  }

  const t = TESTS_POR_VALUE[test]
  const visibles = soloPresentes ? jugadores.filter((j) => presentes.has(j.id)) : jugadores
  const cargados = visibles.filter((j) => mediciones[clave(j.id, test)]).length

  return (
    <>
      {/* Embebida como pestaña del entrenamiento no lleva su propio "Volver":
          la vuelta al listado de eventos ya está arriba de las pestañas. */}
      {onVolver && (
        <div className="fila entre">
          <button className="btn sec chico" onClick={onVolver}>← Volver</button>
          <span className="mini">{fechaCorta(evento.fecha)}</span>
        </div>
      )}

      <div className="tarjeta">
        <h3>Tests físicos</h3>
        <p className="mini" style={{ marginTop: 2 }}>
          Elegí el test y cargá a los que midieron hoy. Cada medición se guarda
          sola al salir del campo; el color es opcional y se puede poner después.
        </p>
        <div className="chips" style={{ marginTop: 10 }}>
          {TESTS.map((x) => (
            <button
              key={x.value}
              type="button"
              className={`chip${test === x.value ? ' activo' : ''}`}
              onClick={() => setTest(x.value)}
            >
              {x.abrev}
            </button>
          ))}
        </div>
        <p className="mini" style={{ marginTop: 8 }}>{t.ayuda}</p>
      </div>

      <div className="fila entre">
        <h3>{t.label}</h3>
        <span className="mini"><b>{cargados}</b> / {visibles.length} cargados</span>
      </div>

      <button className="btn sec" onClick={() => setSoloPresentes((v) => !v)}>
        {soloPresentes ? 'Ver todo el plantel' : 'Ver solo los presentes de hoy'}
      </button>

      {cargando && <div className="vacio">Cargando…</div>}
      {errorCarga && (
        <div className="vacio">
          <p>No se pudo cargar el listado{errorCarga.detalle ? `: ${errorCarga.detalle}` : '.'}</p>
          <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {!cargando && !errorCarga && visibles.length === 0 && (
        <div className="vacio">
          {soloPresentes
            ? 'Todavía no hay nadie marcado presente en este entrenamiento. Tomá la asistencia primero, o mirá todo el plantel.'
            : 'No hay jugadores activos cargados.'}
        </div>
      )}

      {visibles.map((j) => (
        <FilaTest
          key={j.id}
          jugador={j}
          test={test}
          medicion={mediciones[clave(j.id, test)]}
          previa={previas[clave(j.id, test)]}
          onGuardar={guardar}
        />
      ))}
    </>
  )
}

// Curva chica de un test en la ficha: la evolución de un vistazo, sin ejes.
// Las mediciones vienen de la más nueva a la más vieja.
function Curva({ test, historial }) {
  const puntos = [...historial].reverse()
  if (puntos.length < 2) return null
  const W = 220
  const H = 40
  const valores = puntos.map((x) => Number(x.valor))
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const x = (i) => (i * W) / (puntos.length - 1)
  const y = (v) => H - 4 - ((v - min) / rango) * (H - 8)
  const t = TESTS_POR_VALUE[test]

  return (
    <svg
      className="curva-test"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Evolución de ${t.label} en ${puntos.length} mediciones`}
    >
      <polyline
        points={valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
        fill="none"
        stroke="var(--primario)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {valores.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === valores.length - 1 ? 3.5 : 2.5}
          fill={i === valores.length - 1 ? 'var(--primario)' : '#fff'}
          stroke="var(--primario)" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

// Una tarjeta por test en la ficha: la última medición, cuánto cambió y el
// historial completo plegado.
function TarjetaTest({ test, historial, onBorrar }) {
  const t = TESTS_POR_VALUE[test]
  const [ultima, anterior] = historial
  const sem = semaforo(ultima.semaforo)
  const como = progreso(test, ultima.valor, anterior?.valor)
  const dif = diferencia(test, ultima.valor, anterior?.valor)

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <b style={{ fontSize: '0.9rem' }}>{t.label}</b>
        <span className="mini">{fechaCorta(ultima.fecha)}</span>
      </div>
      <div className="fila" style={{ gap: 8, marginTop: 4, alignItems: 'baseline' }}>
        <span className="test-valor">{conUnidad(test, ultima.valor)}</span>
        {sem && <span className={`badge semaforo-${sem.value}`}>{sem.ico} {sem.label}</span>}
        {dif && (
          <span className={`eval-delta ${como || ''}`}>
            {dif}{como === 'sube' ? ' ▲' : como === 'baja' ? ' ▼' : ''}
            <span className="mini"> vs. {fechaCompacta(anterior.fecha)}</span>
          </span>
        )}
      </div>
      {ultima.nota && <p style={{ fontSize: '0.88rem', marginTop: 6 }}>{ultima.nota}</p>}

      <Curva test={test} historial={historial} />

      <details style={{ marginTop: 6 }}>
        <summary className="mini" style={{ cursor: 'pointer' }}>
          Ver las {historial.length} {historial.length === 1 ? 'medición' : 'mediciones'}
        </summary>
        <table className="grafico-tabla">
          <thead>
            <tr><th>Fecha</th><th>Medición</th><th>Valoración</th><th /></tr>
          </thead>
          <tbody>
            {historial.map((m) => {
              const s = semaforo(m.semaforo)
              return (
                <tr key={m.id}>
                  <td title={m.autor_email || ''}>{fechaCorta(m.fecha)}</td>
                  <td>{conUnidad(test, m.valor)}</td>
                  <td>{s ? `${s.ico} ${s.label}` : '—'}</td>
                  <td>
                    <button className="btn peligro chico" onClick={() => onBorrar(m)}>Borrar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </details>
    </div>
  )
}

// Formulario de carga suelta desde la ficha: el que faltó el día del test y
// se lo miden aparte.
function FormTest({ jugadorId, onCerrar, onGuardado }) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [fecha, setFecha] = useState(hoy)
  const [test, setTest] = useState(TESTS[0].value)
  const [texto, setTexto] = useState('')
  const [sem, setSem] = useState(null)
  const [nota, setNota] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const t = TESTS_POR_VALUE[test]

  async function guardar(e) {
    e.preventDefault()
    const valor = parsearValor(test, texto)
    if (valor == null) { setError(`Medición inválida. ${t.ayuda}`); return }
    setGuardando(true)
    setError('')
    try {
      await api('tests', {
        method: 'POST',
        body: { jugador_id: jugadorId, fecha, test, valor, semaforo: sem, nota: nota.trim() || null },
      })
      onGuardado()
    } catch {
      setError('No se pudo guardar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <div className="grid2">
        <div className="campo">
          <label>Fecha</label>
          <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="campo">
          <label>Test</label>
          <select value={test} onChange={(e) => { setTest(e.target.value); setError('') }}>
            {TESTS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </div>
      </div>
      <div className="campo">
        <label>Medición {t.unidad ? `(${t.unidad})` : ''}</label>
        <input
          type="text"
          inputMode="decimal"
          required
          placeholder={t.formato === 'tiempo' ? 'm:ss' : ''}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        <span className="mini">{t.ayuda}</span>
      </div>
      <div className="campo">
        <label>Valoración (opcional)</label>
        <Semaforo valor={sem} onCambiar={setSem} />
      </div>
      <div className="campo">
        <label>Nota (opcional)</label>
        <input
          type="text"
          placeholder="Ej.: venía de una molestia en el gemelo"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
      {error && <div className="error">{error}</div>}
      <div className="fila">
        <button className="btn crece" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar medición'}
        </button>
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
      </div>
    </form>
  )
}

// Sección de tests físicos dentro de la ficha del jugador
export function TestsDeJugador({ jugadorId, tests, onCambio }) {
  const [cargando, setCargando] = useState(false)

  // Las mediciones vienen de la más nueva a la más vieja; se agrupan por test
  const porTest = TESTS
    .map((t) => ({ test: t.value, historial: tests.filter((m) => m.test === t.value) }))
    .filter((g) => g.historial.length > 0)

  const ultimoPeso = tests.find((m) => m.test === 'peso')
  const ultimaTalla = tests.find((m) => m.test === 'talla')
  const indice = imc(ultimoPeso?.valor, ultimaTalla?.valor)

  async function borrar(m) {
    if (!confirm(`¿Borrar la medición de ${TESTS_POR_VALUE[m.test].label} del ${fechaCorta(m.fecha)}?`)) return
    try {
      await api(`tests/${m.id}`, { method: 'DELETE' })
      onCambio()
    } catch (e) {
      alert(e?.error === 'solo_autor'
        ? 'Esta medición la cargó otra persona: solo el autor o la cabeza de división pueden borrarla.'
        : 'No se pudo borrar la medición.')
    }
  }

  return (
    <>
      <div className="fila entre">
        <h3>Tests físicos</h3>
        <button className="btn chico" onClick={() => setCargando(true)}>+ Cargar test</button>
      </div>

      {indice != null && (
        <p className="mini">
          IMC {indice} · {ultimoPeso.fecha === ultimaTalla.fecha
            ? `con el peso y la talla del ${fechaCompacta(ultimoPeso.fecha)}`
            : `con el peso del ${fechaCompacta(ultimoPeso.fecha)} y la talla del ${fechaCompacta(ultimaTalla.fecha)}`}.
          En chicos se lee por percentil de edad, así que va sin semáforo.
        </p>
      )}

      {cargando && (
        <FormTest
          jugadorId={jugadorId}
          onCerrar={() => setCargando(false)}
          onGuardado={() => { setCargando(false); onCambio() }}
        />
      )}

      {porTest.length === 0 && !cargando && (
        <div className="vacio">
          Sin tests físicos todavía. Los PF los cargan desde el entrenamiento,
          en <b>⏱ Tests físicos</b>; acá se puede cargar una medición suelta.
        </div>
      )}

      {porTest.map((g) => (
        <TarjetaTest key={g.test} test={g.test} historial={g.historial} onBorrar={borrar} />
      ))}
    </>
  )
}
