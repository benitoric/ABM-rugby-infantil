import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import {
  intensidad, minutosTotales, GRUPOS_FISICOS, INTENSIDADES, MAX_MINUTOS, MINUTOS_BLOQUE,
} from '../trabajoFisico.js'

// Escala baja/media/alta, la misma de la planilla en papel. Se usa para la
// intensidad de cada variable y para la carga general de la sesión.
function Intensidad({ valor, onCambiar, chico = false }) {
  return (
    <div className="fila" style={{ gap: 4, flexWrap: 'nowrap' }}>
      {INTENSIDADES.map((i) => (
        <button
          key={i.value}
          type="button"
          className={`chip intensidad-${i.value}${valor === i.value ? ' activo' : ''}`}
          aria-pressed={valor === i.value}
          aria-label={i.label}
          onClick={() => onCambiar(valor === i.value ? null : i.value)}
        >
          {chico ? i.abrev : i.label}
        </button>
      ))}
    </div>
  )
}

// Una variable de la planilla: minutos e intensidad. Los minutos se guardan al
// salir del campo y la intensidad al tocarla, sin botón de guardar.
function FilaVariable({ variable, dato, onCambiar }) {
  const [texto, setTexto] = useState(() => (dato?.minutos ? String(dato.minutos) : ''))
  const [error, setError] = useState(false)

  // Si la planilla se recarga (o la pisa otro PF), el campo sigue al dato
  const guardados = dato?.minutos ?? null
  useEffect(() => {
    setTexto(guardados ? String(guardados) : '')
    setError(false)
  }, [guardados])

  function confirmar() {
    const crudo = texto.trim()
    if (!crudo) {
      setError(false)
      if (guardados) onCambiar({ ...dato, minutos: null })
      return
    }
    const n = Number(crudo)
    if (!Number.isInteger(n) || n <= 0 || n > MAX_MINUTOS) { setError(true); return }
    setError(false)
    if (n !== guardados) onCambiar({ ...dato, minutos: n })
  }

  const trabajada = !!(dato?.minutos || dato?.intensidad)

  return (
    <div className={`fila-test${trabajada ? ' cargada' : ''}`}>
      <div className="fila-test-nombre" style={{ fontWeight: 600 }}>{variable.label}</div>
      <div className="fila-test-dato">
        <input
          className={error ? 'invalido' : ''}
          type="text"
          inputMode="numeric"
          placeholder="—"
          aria-label={`Minutos de ${variable.label}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          style={{ width: 56 }}
        />
        <span className="mini">min</span>
      </div>
      <Intensidad
        chico
        valor={dato?.intensidad || null}
        onCambiar={(i) => onCambiar({ ...dato, intensidad: i })}
      />
    </div>
  )
}

// Planilla del PF dentro del entrenamiento: qué se trabajó en la primera media
// hora, cuántos minutos y con qué intensidad.
export default function TrabajoFisico({ evento }) {
  const [plan, setPlan] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [guardando, setGuardando] = useState(false)
  // El texto de observaciones se guarda al salir del campo: sin esto, volver a
  // guardar lo mismo al perder el foco dispararía un PUT por cada clic
  const obsGuardadas = useRef('')

  useEffect(() => {
    async function cargar() {
      const d = await api(`eventos/${evento.id}/trabajo-fisico`)
      setPlan(d)
      setObservaciones(d.observaciones || '')
      obsGuardadas.current = d.observaciones || ''
      setCargando(false)
    }
    setErrorCarga(null)
    setCargando(true)
    cargar().catch((e) => { setErrorCarga(e); setCargando(false) })
  }, [evento.id, intento])

  // La planilla se guarda entera en cada cambio: es una sola fila y son ocho
  // variables, así que sale más simple que ir campo por campo.
  async function guardar(cambios) {
    const previo = plan
    const nuevo = { ...plan, ...cambios }
    setPlan(nuevo)
    setGuardando(true)
    try {
      const d = await api(`eventos/${evento.id}/trabajo-fisico`, {
        method: 'PUT',
        body: {
          variables: nuevo.variables,
          carga: nuevo.carga,
          observaciones: nuevo.observaciones,
        },
      })
      setPlan(d)
      obsGuardadas.current = d.observaciones || ''
    } catch {
      setPlan(previo)
      setObservaciones(previo.observaciones || '')
      alert('No se pudo guardar la planilla. Probá de nuevo.')
    }
    setGuardando(false)
  }

  function cambiarVariable(clave, dato) {
    const variables = { ...plan.variables }
    if (dato.minutos || dato.intensidad) {
      variables[clave] = { minutos: dato.minutos || null, intensidad: dato.intensidad || null }
    } else {
      delete variables[clave]
    }
    guardar({ variables })
  }

  if (cargando) return <div className="vacio">Cargando…</div>
  if (errorCarga) {
    return (
      <div className="vacio">
        <p>No se pudo cargar la planilla{errorCarga.detalle ? `: ${errorCarga.detalle}` : '.'}</p>
        <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setIntento((n) => n + 1)}>
          Reintentar
        </button>
      </div>
    )
  }

  const total = minutosTotales(plan.variables)
  const cuantas = Object.keys(plan.variables || {}).length

  return (
    <>
      <h3>Trabajo físico del día</h3>
      <p className="mini">
        Lo que se trabajó en la primera media hora. Anotá los minutos y la
        intensidad de cada variable; se guarda solo, sin botón.
      </p>

      <div className="fila entre" style={{ marginTop: 4 }}>
        <span className="mini">
          <b>{cuantas}</b> {cuantas === 1 ? 'variable' : 'variables'}
          {total > 0 && <> · <b>{total} min</b> de ~{MINUTOS_BLOQUE}</>}
        </span>
        {guardando && <span className="mini">Guardando…</span>}
      </div>

      {GRUPOS_FISICOS.map((g) => (
        <div key={g.value}>
          <div className="eval-area-titulo">
            <span>{g.label}</span>
            <span>{g.variables.filter((v) => plan.variables?.[v.value]).length}/{g.variables.length}</span>
          </div>
          {g.variables.map((v) => (
            <FilaVariable
              key={v.value}
              variable={v}
              dato={plan.variables?.[v.value]}
              onCambiar={(dato) => cambiarVariable(v.value, dato)}
            />
          ))}
        </div>
      ))}

      <div className="tarjeta" style={{ marginTop: 12 }}>
        <div className="campo">
          <label>Carga general de la sesión</label>
          <Intensidad valor={plan.carga} onCambiar={(c) => guardar({ carga: c })} />
        </div>
        <div className="campo" style={{ marginBottom: 0 }}>
          <label>Observaciones</label>
          <textarea
            placeholder="Ej.: cancha pesada por la lluvia; se acortó el circuito…"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            onBlur={() => {
              const t = observaciones.trim()
              if (t !== obsGuardadas.current) guardar({ observaciones: t || null })
            }}
          />
        </div>
      </div>

      {plan.autor_email && (
        <p className="mini">Última carga: {plan.autor_email}</p>
      )}
    </>
  )
}
