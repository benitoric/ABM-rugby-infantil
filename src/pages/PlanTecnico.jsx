import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCompacta } from '../helpers.js'
import {
  diasSinTrabajar, haceCuanto, minutosTotales, repartirMinutos, DIAS_ATRASO,
  GRUPOS_TECNICOS, MAX_MINUTOS, MINUTOS_TECNICA,
} from '../planTecnico.js'

// Lo que se viene haciendo con ese aspecto en el año, en un renglón: cuándo
// fue la última vez, cuántas veces y cuántos minutos lleva. Los que hace más
// de tres semanas que no se tocan van marcados, que es lo que hay que ver al
// armar el entrenamiento de hoy.
function HistoriaAspecto({ historia }) {
  if (!historia) return null
  if (!historia.veces) return <div className="mini">sin trabajar en {historia.anio}</div>
  const dias = diasSinTrabajar(historia.ultima)
  const atrasado = dias > DIAS_ATRASO
  return (
    <div
      className={`mini${atrasado ? ' atrasado' : ''}`}
      title={`Última vez: ${fechaCompacta(historia.ultima)}`}
    >
      {atrasado && '⚠ '}{haceCuanto(dias)} · {historia.veces}{' '}
      {historia.veces === 1 ? 'vez' : 'veces'} · {historia.minutos} min en {historia.anio}
    </div>
  )
}

// Una fila del plan: se toca el nombre para marcar o desmarcar el aspecto, y
// los minutos son opcionales. Sin minutos propios muestra en gris los que le
// tocan del reparto de la hora, así se ve el plan armado sin escribir nada.
function FilaAspecto({ aspecto, dato, reparto, historia, onCambiar, onRenombrar }) {
  const marcado = !!dato
  const [texto, setTexto] = useState(() => (dato?.minutos ? String(dato.minutos) : ''))
  const [error, setError] = useState(false)

  // Si el plan se recarga (o lo pisa otro entrenador), el campo sigue al dato
  const guardados = dato?.minutos ?? null
  useEffect(() => {
    setTexto(guardados ? String(guardados) : '')
    setError(false)
  }, [guardados])

  function confirmar() {
    const crudo = texto.trim()
    if (!crudo) {
      setError(false)
      if (guardados) onCambiar({ minutos: null })
      return
    }
    const n = Number(crudo)
    if (!Number.isInteger(n) || n <= 0 || n > MAX_MINUTOS) { setError(true); return }
    setError(false)
    if (n !== guardados) onCambiar({ minutos: n })
  }

  return (
    <div className={`fila-test${marcado ? ' cargada' : ''}`}>
      <button
        type="button"
        className="aspecto-nombre"
        aria-pressed={marcado}
        onClick={() => onCambiar(marcado ? null : { minutos: null })}
      >
        <span className="aspecto-tilde">{marcado ? '☑' : '☐'}</span>
        <span>
          {aspecto.label}
          <HistoriaAspecto historia={historia} />
        </span>
      </button>
      {marcado && (
        <div className="fila-test-dato">
          <input
            className={error ? 'invalido' : ''}
            type="text"
            inputMode="numeric"
            placeholder={reparto ? String(reparto.minutos) : '—'}
            aria-label={`Minutos de ${aspecto.label}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={confirmar}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            style={{ width: 56 }}
          />
          <span className="mini">min{reparto && !reparto.propios ? ' (repartidos)' : ''}</span>
        </div>
      )}
      {/* Solo los aspectos que sumó el club se pueden renombrar: los del
          catálogo fijo son los mismos para todos. */}
      {onRenombrar && (
        <button
          type="button"
          className="btn sec chico"
          title={`Cambiarle el nombre a ${aspecto.label}`}
          aria-label={`Cambiarle el nombre a ${aspecto.label}`}
          onClick={onRenombrar}
        >
          ✏️
        </button>
      )}
    </div>
  )
}

// Nombre y grupo de un aspecto propio del club: el mismo formulario sirve para
// darlo de alta y para corregirle el nombre más adelante.
function FormAspecto({ inicial, boton, ayuda, onGuardar, onCancelar }) {
  const [label, setLabel] = useState(inicial?.label || '')
  const [grupo, setGrupo] = useState(inicial?.grupo || GRUPOS_TECNICOS[0].value)
  const [guardando, setGuardando] = useState(false)

  return (
    <form
      className="tarjeta"
      style={{ marginTop: 10 }}
      onSubmit={async (e) => {
        e.preventDefault()
        const nombre = label.trim()
        if (!nombre) return
        setGuardando(true)
        try {
          await onGuardar(nombre, grupo)
        } catch (err) {
          alert(err?.error === 'aspecto_duplicado'
            ? 'Ya hay otro aspecto con ese nombre.'
            : 'No se pudo guardar. Probá de nuevo.')
        }
        setGuardando(false)
      }}
    >
      <div className="campo">
        <label>Nombre del aspecto</label>
        <input
          autoFocus
          placeholder="Ej.: kick off"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="campo">
        <label>Grupo</label>
        <div className="seg">
          {GRUPOS_TECNICOS.map((g) => (
            <button key={g.value} type="button" className={grupo === g.value ? 'activo' : ''}
              onClick={() => setGrupo(g.value)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <p className="mini" style={{ marginBottom: 8 }}>{ayuda}</p>
      <div className="fila">
        <button className="btn chico" disabled={guardando}>{boton}</button>
        <button type="button" className="btn sec chico" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

// Alta de un aspecto que no está en el catálogo. Queda guardado para los
// entrenamientos siguientes y se marca solo en el de hoy.
function AgregarAspecto({ onAgregado }) {
  const [abierto, setAbierto] = useState(false)

  if (!abierto) {
    return (
      <button className="btn sec chico" style={{ marginTop: 10 }} onClick={() => setAbierto(true)}>
        + Agregar aspecto
      </button>
    )
  }

  return (
    <FormAspecto
      boton="Agregar"
      ayuda="Queda en la lista para los próximos entrenamientos y se marca en el de hoy."
      onGuardar={async (label, grupo) => {
        await onAgregado(label, grupo)
        setAbierto(false)
      }}
      onCancelar={() => setAbierto(false)}
    />
  )
}

// Planificación técnica dentro del entrenamiento: qué se trabaja ese día y
// cuántos minutos lleva cada aspecto.
export default function PlanTecnico({ evento }) {
  const [plan, setPlan] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [guardando, setGuardando] = useState(false)

  // Historia del año por aspecto: cuántas veces, cuántos minutos y cuándo fue
  // la última vez. Viaja junto al plan para que la fila lo muestre al lado.
  const [historia, setHistoria] = useState(null)
  // Clave del aspecto propio que se está renombrando, si hay alguno
  const [editando, setEditando] = useState(null)

  useEffect(() => {
    async function cargar() {
      const anio = Number((evento.fecha || '').slice(0, 4)) || new Date().getFullYear()
      const [p, h] = await Promise.all([
        api(`eventos/${evento.id}/plan-tecnico`),
        // sin contar este mismo entrenamiento: la historia es la de antes de hoy
        api(`stats/plan-tecnico?anio=${anio}&excepto=${evento.id}`),
      ])
      setPlan(p)
      setHistoria(h)
      setCargando(false)
    }
    setErrorCarga(null)
    setCargando(true)
    cargar().catch((e) => { setErrorCarga(e); setCargando(false) })
  }, [evento.id, intento])

  // El plan se guarda entero en cada cambio: es una sola fila y son pocos
  // aspectos, así que sale más simple que ir campo por campo.
  async function guardar(aspectos) {
    const previo = plan
    setPlan({ ...plan, aspectos, sin_planificacion: !Object.keys(aspectos).length })
    setGuardando(true)
    try {
      const d = await api(`eventos/${evento.id}/plan-tecnico`, {
        method: 'PUT',
        body: { aspectos },
      })
      setPlan(d)
    } catch {
      setPlan(previo)
      alert('No se pudo guardar el plan. Probá de nuevo.')
    }
    setGuardando(false)
  }

  function cambiarAspecto(clave, dato) {
    const aspectos = { ...plan.aspectos }
    if (dato) aspectos[clave] = { minutos: dato.minutos || null }
    else delete aspectos[clave]
    guardar(aspectos)
  }

  // Corregirle el nombre a un aspecto del club. La clave no cambia, así que
  // el aspecto se sigue llamando distinto pero conserva toda su historia: lo
  // planificado en los entrenamientos anteriores queda como está.
  async function renombrarAspecto(clave, label, grupo) {
    const nuevo = await api(`aspectos-tecnicos/${clave}`, { method: 'PUT', body: { label, grupo } })
    setPlan((p) => ({ ...p, propios: p.propios.map((a) => (a.clave === clave ? nuevo : a)) }))
    setEditando(null)
  }

  async function agregarAspecto(label, grupo) {
    const nuevo = await api('aspectos-tecnicos', { method: 'POST', body: { label, grupo } })
    setPlan((p) => ({
      ...p,
      propios: p.propios.some((a) => a.clave === nuevo.clave) ? p.propios : [...p.propios, nuevo],
    }))
    await guardar({ ...plan.aspectos, [nuevo.clave]: { minutos: null } })
  }

  if (cargando) return <div className="vacio">Cargando…</div>
  if (errorCarga) {
    return (
      <div className="vacio">
        <p>No se pudo cargar el plan{errorCarga.detalle ? `: ${errorCarga.detalle}` : '.'}</p>
        <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setIntento((n) => n + 1)}>
          Reintentar
        </button>
      </div>
    )
  }

  const aspectos = plan.aspectos || {}
  const porAspecto = {}
  for (const a of historia?.aspectos || []) {
    porAspecto[a.clave] = { ...a, anio: historia.anio }
  }
  const reparto = repartirMinutos(aspectos)
  const marcados = Object.keys(aspectos).length
  const total = minutosTotales(aspectos)
  // Cada grupo lista los aspectos fijos del catálogo más los que sumó el staff
  const grupos = GRUPOS_TECNICOS.map((g) => ({
    ...g,
    aspectos: [...g.aspectos, ...(plan.propios || []).filter((a) => a.grupo === g.value)],
  }))

  return (
    <>
      <h3>Planificación técnica del día</h3>
      <p className="mini">
        Marcá qué se trabaja hoy. Los minutos son opcionales: los que no se
        cargan se reparten la hora de técnica. Se guarda solo, sin botón.
      </p>

      <div className="fila entre" style={{ marginTop: 4 }}>
        <span className="mini">
          <b>{marcados}</b> {marcados === 1 ? 'aspecto' : 'aspectos'}
          {marcados > 0 && <> · <b>{total} min</b> de ~{MINUTOS_TECNICA}</>}
        </span>
        {guardando && <span className="mini">Guardando…</span>}
      </div>

      <button
        type="button"
        className={`chip${plan.sin_planificacion ? ' activo' : ''}`}
        style={{ alignSelf: 'flex-start' }}
        aria-pressed={!!plan.sin_planificacion}
        // Marcarlo borra lo cargado; se marca solo al quedar sin aspectos
        onClick={() => {
          if (plan.sin_planificacion) return
          if (!confirm('¿Marcar el día como "sin planificación"? Se destildan los aspectos cargados.')) return
          guardar({})
        }}
      >
        {plan.sin_planificacion ? '☑' : '☐'} Sin planificación
      </button>

      {grupos.map((g) => (
        <div key={g.value}>
          <div className="eval-area-titulo">
            <span>{g.label}</span>
            <span>{g.aspectos.filter((a) => aspectos[a.value ?? a.clave]).length}/{g.aspectos.length}</span>
          </div>
          {g.aspectos.map((a) => {
            const clave = a.value ?? a.clave
            // Los del catálogo fijo traen `value`; los que sumó el club, no
            const propio = !a.value
            if (propio && editando === clave) {
              return (
                <FormAspecto
                  key={clave}
                  inicial={a}
                  boton="Guardar nombre"
                  ayuda="Cambia cómo se llama de acá en adelante, también en los entrenamientos ya cargados. Lo que se trabajó no se pierde."
                  onGuardar={(label, grupo) => renombrarAspecto(clave, label, grupo)}
                  onCancelar={() => setEditando(null)}
                />
              )
            }
            return (
              <FilaAspecto
                key={clave}
                aspecto={a}
                dato={aspectos[clave]}
                reparto={reparto[clave]}
                historia={porAspecto[clave]}
                onCambiar={(dato) => cambiarAspecto(clave, dato)}
                onRenombrar={propio ? () => setEditando(clave) : null}
              />
            )
          })}
        </div>
      ))}

      <AgregarAspecto onAgregado={agregarAspecto} />

      {plan.autor_email && <p className="mini">Última carga: {plan.autor_email}</p>}
    </>
  )
}
