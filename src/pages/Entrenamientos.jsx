import { useEffect, useState } from 'react'
import { api } from '../api.js'
import {
  descargarCSV, etiquetaPartido, fechaCorta, horarioEvento, lineaBloque, MODALIDADES,
  nombreCompleto, nombreStaff, resumenPorPuesto, suspensionEvento,
} from '../helpers.js'
import { useSugerencias } from '../sugerencias.jsx'
import { FormEvento, PanelSuspension } from './Evento.jsx'
import TestsFisicos from './TestsFisicos.jsx'
import TrabajoFisico from './TrabajoFisico.jsx'
import PlanTecnico from './PlanTecnico.jsx'
import EstadisticaFisica from './EstadisticaFisica.jsx'
import GraficoAsistencia from './GraficoAsistencia.jsx'
import GraficoTecnica from './GraficoTecnica.jsx'

// Pestañas de un entrenamiento. El partido no las lleva: su día vive entero
// en la sección Partidos.
// Las etiquetas van cortas para que las cuatro entren sin recortarse en un
// celular angosto; el título de cada pestaña se completa adentro.
const VISTAS_ENTRENAMIENTO = [
  { id: 'asistencia', label: '📋 Asist.' },
  { id: 'tecnica', label: '🏉 Técnica' },
  { id: 'fisico', label: '🏃 Físico' },
  { id: 'tests', label: '⏱ Tests' },
]

export default function Entrenamientos({ yo }) {
  const [eventos, setEventos] = useState([])
  const [eventoSel, setEventoSel] = useState(null)
  const [verEstadisticaFisica, setVerEstadisticaFisica] = useState(false)
  const [creando, setCreando] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [sugerencias, recargarSugerencias] = useSugerencias()

  // Esta pantalla es solo de entrenamientos: los partidos viven enteros en la
  // sección Partidos, desde su convocatoria hasta la planilla.
  async function cargar() {
    const todos = await api('eventos')
    setEventos(todos.filter((e) => e.tipo === 'entrenamiento'))
    setCargando(false)
  }
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  if (eventoSel) {
    return <TomarAsistencia evento={eventoSel} onVolver={() => { setEventoSel(null); cargar() }} />
  }

  if (verEstadisticaFisica) {
    return <EstadisticaFisica yo={yo} onVolver={() => setVerEstadisticaFisica(false)} />
  }

  async function descargarResumen() {
    const stats = await api('stats/asistencia')
    const pct = (v) => (v == null ? '—' : `${v}%`)
    descargarCSV('asistencia-resumen.csv', [
      ['Jugador', 'Entrenamientos asistidos', 'Entrenamientos totales', '% Entren.', 'Partidos asistidos', 'Partidos totales', '% Partidos', '% Total'],
      ...stats.map((s) => [
        `${s.apellido}, ${s.nombre}`,
        s.entrenamientos_presentes, s.entrenamientos_total, pct(s.entrenamientos),
        s.partidos_presentes, s.partidos_total, pct(s.partidos),
        pct(s.total),
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Entrenamientos</h2>
        <div className="fila">
          <button className="btn sec" onClick={() => setVerEstadisticaFisica(true)}>📊 Física</button>
          <button className="btn sec" onClick={descargarResumen}>Resumen CSV</button>
          <button
            className="btn"
            onClick={() => setCreando(true)}
          >
            + Nuevo entrenamiento
          </button>
        </div>
      </div>

      <GraficoAsistencia />
      <GraficoTecnica />

      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && eventos.length === 0 && (
        <div className="vacio">
          Todavía no hay entrenamientos. Creá uno para tomar asistencia.
        </div>
      )}

      {eventos.map((ev) => {
        const susp = suspensionEvento(ev)
        return (
          <button
            key={ev.id}
            className="jugador-item"
            style={susp.estado === 'total' ? { opacity: 0.7 } : undefined}
            onClick={() => setEventoSel(ev)}
          >
            <div className="avatar">🏋️</div>
            <div className="crece">
              <div style={{ fontWeight: 600 }}>
                Entrenamiento
                {ev.modalidad && <span className={`badge ${ev.modalidad}`}>{MODALIDADES[ev.modalidad]}</span>}
                {susp.estado && <span className={`badge susp-${susp.estado}`}>⛔ {susp.texto}</span>}
              </div>
              <div className="mini">
                {fechaCorta(ev.fecha)}
                {horarioEvento(ev) ? ` · ${horarioEvento(ev)}` : ''}
                {ev.lugar ? ` · ${ev.lugar}` : ''}
              </div>
            </div>
            <span className="mini">→</span>
          </button>
        )
      })}

      {creando && (
        <FormEvento
          sugerencias={sugerencias}
          onCerrar={() => setCreando(null)}
          onGuardado={async (ev) => {
            setCreando(null)
            await cargar()
            recargarSugerencias()
            setEventoSel(ev)
          }}
        />
      )}
    </div>
  )
}

// Reporte en vivo de los presentes: cuántos forwards y cuántos backs hay, y
// dentro de cada línea cuántos de cada puesto principal. Se actualiza con
// cada marca, para ver mientras se toma asistencia con qué se cuenta hoy.
//
// El que se golpeó o se lesionó ese día ya no está para entrenar, así que se
// descuenta de los puestos y se avisa aparte; en la asistencia sigue contando
// como presente, porque vino.
function ReportePuestos({ jugadores, marcas, condicion = {} }) {
  const presentes = jugadores.filter((j) => marcas[j.id] === 'presente')
  const fuera = presentes.filter((j) => condicion[j.id])
  const { lineas, sinDefinir, total } = resumenPorPuesto(
    presentes.filter((j) => !condicion[j.id]))
  const nombres = (lista) => lista.map(nombreCompleto).join('\n')
  const cuantos = (cond, emoji, uno, varios) => {
    const n = fuera.filter((j) => condicion[j.id] === cond).length
    return n ? `${emoji} ${n} ${n === 1 ? uno : varios}` : null
  }
  const aviso = [
    cuantos('golpeado', '🤕', 'golpeado', 'golpeados'),
    cuantos('lesionado', '🚑', 'lesionado', 'lesionados'),
  ].filter(Boolean).join(' y ')
  const uno = fuera.length === 1

  return (
    <div className="tarjeta reporte-puestos">
      <div className="fila entre">
        <h3>Presentes por puesto</h3>
        <span className="mini">{total} de {jugadores.length}</span>
      </div>
      {fuera.length > 0 && (
        <p className="mini reporte-fuera" title={nombres(fuera)}>
          {aviso}, {uno ? 'descontado' : 'descontados'} de los puestos
          (en la asistencia {uno ? 'sigue presente' : 'siguen presentes'}):{' '}
          {fuera.map((j) => j.apellido).join(', ')}.
        </p>
      )}
      <div className="grid2">
        {lineas.map((l) => (
          <div key={l.clave}>
            <div className={`reporte-linea ${l.clave}`}>
              <span>{l.label}</span>
              <b>{l.total}</b>
            </div>
            {l.puestos.map((p) => (
              <div
                key={p.value}
                className={`reporte-fila${p.jugadores.length ? '' : ' cero'}`}
                title={nombres(p.jugadores)}
              >
                <span>{p.label}</span>
                <b>{p.jugadores.length}</b>
              </div>
            ))}
            {l.sinPuesto.length > 0 && (
              <div className="reporte-fila" title={nombres(l.sinPuesto)}>
                <span>Sin puesto principal</span>
                <b>{l.sinPuesto.length}</b>
              </div>
            )}
          </div>
        ))}
      </div>
      {sinDefinir.length > 0 && (
        <p className="mini" style={{ marginTop: 6 }} title={nombres(sinDefinir)}>
          {sinDefinir.length} sin puesto cargado (no suman a ninguna línea):{' '}
          {sinDefinir.map((j) => j.apellido).join(', ')}
        </p>
      )}
    </div>
  )
}

function TomarAsistencia({ evento: eventoInicial, onVolver }) {
  const [evento, setEvento] = useState(eventoInicial)
  const [jugadores, setJugadores] = useState([])
  const [marcas, setMarcas] = useState({})
  // golpeado/lesionado durante el evento; el modal se abre desde cada fila
  const [condicion, setCondicion] = useState({})
  const [condicionDe, setCondicionDe] = useState(null)
  // Edición de los datos del evento (fecha, horario, lugar, bloques, notas)
  const [editando, setEditando] = useState(false)
  const [sugerencias, recargarSugerencias] = useSugerencias()
  const [staff, setStaff] = useState([])
  const [marcasStaff, setMarcasStaff] = useState({})
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  // Pestaña abierta del entrenamiento (asistencia / trabajo físico / tests)
  const [vista, setVista] = useState('asistencia')

  useEffect(() => {
    async function cargar() {
      const [js, asis, st, asisStaff] = await Promise.all([
        api('jugadores'),
        api(`eventos/${evento.id}/asistencias`),
        api('staff'),
        api(`eventos/${evento.id}/asistencias-staff`),
      ])
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      const m = {}
      const mc = {}
      for (const a of asis) {
        m[a.jugador_id] = a.estado
        if (a.condicion) mc[a.jugador_id] = a.condicion
      }
      setMarcas(m)
      setCondicion(mc)
      setStaff(st.filter((s) => s.activo))
      const ms = {}
      for (const a of asisStaff) ms[a.staff_email] = a.estado
      setMarcasStaff(ms)
      setCargando(false)
    }
    setErrorCarga(null)
    setCargando(true)
    cargar().catch((e) => {
      setErrorCarga(e)
      setCargando(false)
    })
  }, [evento.id, intento])

  // Ausente por defecto: tocar al jugador alterna presente/ausente
  async function marcar(jugadorId) {
    const previo = marcas[jugadorId]
    const nuevo = previo === 'presente' ? 'ausente' : 'presente'
    // Solo un presente puede estar golpeado o lesionado: al pasarlo a ausente
    // se limpia la condición (si no, quedaría marcada sin forma de sacarla).
    const previaCondicion = condicion[jugadorId] || null
    const limpiarCondicion = nuevo === 'ausente' && previaCondicion
    setMarcas((m) => ({ ...m, [jugadorId]: nuevo }))
    if (limpiarCondicion) {
      setCondicion((m) => {
        const copia = { ...m }
        delete copia[jugadorId]
        return copia
      })
    }
    try {
      await api(`eventos/${evento.id}/asistencias`, {
        method: 'PUT',
        body: {
          marcas: [limpiarCondicion
            ? { jugador_id: jugadorId, estado: nuevo, condicion: null }
            : { jugador_id: jugadorId, estado: nuevo }],
        },
      })
    } catch {
      setMarcas((m) => ({ ...m, [jugadorId]: previo }))
      if (limpiarCondicion) {
        setCondicion((m) => ({ ...m, [jugadorId]: previaCondicion }))
      }
      alert('No se pudo guardar la marca. Probá de nuevo.')
    }
  }

  // Golpe o lesión durante el evento. Marca al jugador como presente (si se
  // golpeó, estuvo) y guarda la condición; 'lesionado' queda además pendiente
  // de seguimiento en la sección Jugadores.
  async function marcarCondicion(jugadorId, nueva) {
    const previa = condicion[jugadorId] || null
    const previoEstado = marcas[jugadorId]
    setCondicion((m) => {
      const copia = { ...m }
      if (nueva) copia[jugadorId] = nueva
      else delete copia[jugadorId]
      return copia
    })
    if (nueva) setMarcas((m) => ({ ...m, [jugadorId]: 'presente' }))
    setCondicionDe(null)
    try {
      await api(`eventos/${evento.id}/asistencias`, {
        method: 'PUT',
        body: {
          marcas: [{
            jugador_id: jugadorId,
            estado: nueva ? 'presente' : previoEstado || 'presente',
            condicion: nueva,
          }],
        },
      })
    } catch {
      setCondicion((m) => {
        const copia = { ...m }
        if (previa) copia[jugadorId] = previa
        else delete copia[jugadorId]
        return copia
      })
      setMarcas((m) => ({ ...m, [jugadorId]: previoEstado }))
      alert('No se pudo guardar. Probá de nuevo.')
    }
  }

  async function marcarStaff(email) {
    const previo = marcasStaff[email]
    const nuevo = previo === 'presente' ? 'ausente' : 'presente'
    setMarcasStaff((m) => ({ ...m, [email]: nuevo }))
    try {
      await api(`eventos/${evento.id}/asistencias-staff`, {
        method: 'PUT',
        body: { marcas: [{ staff_email: email, estado: nuevo }] },
      })
    } catch {
      setMarcasStaff((m) => ({ ...m, [email]: previo }))
      alert('No se pudo guardar la marca. Probá de nuevo.')
    }
  }

  async function marcarTodosPresentes() {
    const nuevas = {}
    for (const j of jugadores) nuevas[j.id] = 'presente'
    setMarcas(nuevas)
    await api(`eventos/${evento.id}/asistencias`, {
      method: 'PUT',
      body: { marcas: jugadores.map((j) => ({ jugador_id: j.id, estado: 'presente' })) },
    })
  }

  async function borrarEvento() {
    if (!confirm('¿Borrar este evento y su asistencia (y bloques/tiempos si es partido)?')) return
    await api(`eventos/${evento.id}`, { method: 'DELETE' })
    onVolver()
  }

  const presentes = jugadores.filter((j) => marcas[j.id] === 'presente').length
  const suspension = suspensionEvento(evento)

  const esEntrenamiento = evento.tipo === 'entrenamiento'

  function descargarEvento() {
    const esPartido = evento.tipo === 'partido'
    const titulo = esPartido ? 'partido' : 'entrenamiento'
    // La columna de condición es del entrenamiento: en el partido se toma en
    // la cancha y no viaja en esta pantalla.
    const conCondicion = (fila, valor) => (esPartido ? fila : [...fila, valor])
    descargarCSV(`asistencia-${titulo}-${evento.fecha}.csv`, [
      conCondicion(['Jugador', 'Asistencia'], 'Condición'),
      ...jugadores.map((j) => conCondicion(
        [nombreCompleto(j), marcas[j.id] === 'presente' ? 'Presente' : 'Ausente'],
        condicion[j.id] === 'lesionado' ? 'Lesionado'
          : condicion[j.id] === 'golpeado' ? 'Golpeado' : '',
      )),
      ['Staff', 'Asistencia'],
      ...staff.map((s) => [
        nombreStaff(s),
        marcasStaff[s.email] === 'presente' ? 'Presente' : 'Ausente',
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <div className="fila">
          <button className="btn sec chico" onClick={() => setEditando(true)}>Editar</button>
          <button className="btn sec chico" onClick={descargarEvento}>Descargar CSV</button>
          <button className="btn peligro chico" onClick={borrarEvento}>Borrar evento</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>
          {evento.tipo === 'partido' ? etiquetaPartido(evento) : 'Entrenamiento'}
          {evento.modalidad && <span className={`badge ${evento.modalidad}`}>{MODALIDADES[evento.modalidad]}</span>}
        </h2>
        <div className="suave">
          {fechaCorta(evento.fecha)}
          {horarioEvento(evento) ? ` · ${horarioEvento(evento)}` : ''}
          {evento.lugar ? ` · ${evento.lugar}` : ''}
        </div>
        {evento.tipo === 'partido' && (evento.bloques || []).map((bl) => (
          <div key={bl.numero} className="mini">{lineaBloque(bl)}</div>
        ))}
        {evento.notas && <p className="mini" style={{ marginTop: 6 }}>📝 {evento.notas}</p>}
        {suspension.estado && (
          <p className="aviso" style={{ marginTop: 8 }}>
            ⛔ {suspension.texto}. {suspension.estado === 'total'
              ? 'No se toma asistencia ni cuenta para los porcentajes.'
              : 'El otro bloque se juega normalmente.'}
          </p>
        )}
        <div className="fila" style={{ marginTop: 8 }}>
          <span className="mini"><b style={{ color: 'var(--ok)' }}>Presentes: {presentes}</b></span>
          <span className="mini"><b style={{ color: 'var(--bad)' }}>Ausentes: {jugadores.length - presentes}</b></span>
        </div>
      </div>

      {esEntrenamiento && (
        <nav className="sub-nav">
          {VISTAS_ENTRENAMIENTO.map((v) => (
            <button
              key={v.id}
              className={vista === v.id ? 'activo' : ''}
              // Volver a asistencia recarga las marcas: el PF pudo medir a
              // alguien que todavía no estaba anotado
              onClick={() => { setVista(v.id); if (v.id === 'asistencia') setIntento((n) => n + 1) }}
            >
              {v.label}
            </button>
          ))}
        </nav>
      )}

      {esEntrenamiento && vista === 'tecnica' && <PlanTecnico evento={evento} />}
      {esEntrenamiento && vista === 'fisico' && <TrabajoFisico evento={evento} />}
      {esEntrenamiento && vista === 'tests' && <TestsFisicos evento={evento} />}

      {vista === 'asistencia' && <>
      <PanelSuspension evento={evento} onCambio={setEvento} />

      {suspension.estado === 'total' && (
        <div className="vacio">
          Evento suspendido: no hace falta tomar asistencia. Si al final se hizo,
          reactivalo arriba y marcá a los presentes.
        </div>
      )}

      {suspension.estado !== 'total' && (
        <>
          <p className="mini">
            Todos arrancan como ausentes: tocá a los que vinieron y quedan marcados
            presentes (tocá de nuevo para deshacer).
          </p>

          <button className="btn sec" onClick={marcarTodosPresentes}>
            Marcar presentes a todos
          </button>

          {!cargando && !errorCarga && jugadores.length > 0 && (
            <ReportePuestos jugadores={jugadores} marcas={marcas} condicion={condicion} />
          )}

          {cargando && <div className="vacio">Cargando…</div>}
          {errorCarga && (
            <div className="vacio">
              <p>No se pudo cargar el listado{errorCarga.detalle ? `: ${errorCarga.detalle}` : '.'}</p>
              <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {jugadores.map((j) => {
            const presente = marcas[j.id] === 'presente'
            const cond = condicion[j.id]
            return (
              <div key={j.id} className="fila-asistencia">
                <button
                  className="jugador-item compacto crece"
                  style={presente ? { borderLeft: '4px solid var(--ok)' } : { opacity: 0.65 }}
                  onClick={() => marcar(j.id)}
                >
                  <div className="crece">
                    <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
                    {j.estado === 'lesionado' && <span className="badge lesionado">lesionado</span>}
                    {cond && (
                      <div className="mini">
                        {cond === 'lesionado'
                          ? '🚑 lesionado · queda para seguimiento'
                          : '🤕 golpeado'}
                      </div>
                    )}
                  </div>
                  <span style={{ fontWeight: 800, color: presente ? 'var(--ok)' : 'var(--bad)' }}>
                    {presente ? 'PRESENTE ✓' : 'AUSENTE'}
                  </span>
                </button>
                {/* Solo para los presentes: al ausente no se le puede haber
                    golpeado nada. En los partidos la condición se toma en la
                    cancha, desde "Día de partido". */}
                {evento.tipo !== 'partido' && presente && (
                  <button
                    className={`btn ${cond ? 'peligro' : 'sec'} chico`}
                    title="Se golpeó o se lesionó"
                    onClick={() => setCondicionDe(j)}
                  >
                    🚑
                  </button>
                )}
              </div>
            )
          })}

          {!cargando && staff.length > 0 && (
            <>
              <div className="fila entre" style={{ marginTop: 12 }}>
                <h3>Staff</h3>
                <span className="mini">
                  <b style={{ color: 'var(--ok)' }}>
                    Presentes: {staff.filter((s) => marcasStaff[s.email] === 'presente').length}
                  </b>
                  {' / '}{staff.length}
                </span>
              </div>
              {staff.map((s) => {
                const presente = marcasStaff[s.email] === 'presente'
                return (
                  <button
                    key={s.email}
                    className="jugador-item compacto"
                    style={presente ? { borderLeft: '4px solid var(--ok)' } : { opacity: 0.65 }}
                    onClick={() => marcarStaff(s.email)}
                  >
                    <div className="crece">
                      <div style={{ fontWeight: 600 }}>{nombreStaff(s)}</div>
                      {s.rol && <div className="mini">{s.rol}</div>}
                    </div>
                    <span style={{ fontWeight: 800, color: presente ? 'var(--ok)' : 'var(--bad)' }}>
                      {presente ? 'PRESENTE ✓' : 'AUSENTE'}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </>
      )}

      {editando && (
        <FormEvento
          evento={evento}
          sugerencias={sugerencias}
          onCerrar={() => setEditando(false)}
          onGuardado={(ev) => {
            setEvento(ev)
            setEditando(false)
            recargarSugerencias()
          }}
        />
      )}

      {condicionDe && (
        <div className="modal-fondo" onClick={() => setCondicionDe(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="fila entre" style={{ marginBottom: 4 }}>
              <h3>{nombreCompleto(condicionDe)}</h3>
              <button className="btn sec chico" onClick={() => setCondicionDe(null)}>Cerrar</button>
            </div>
            <p className="mini" style={{ marginBottom: 10 }}>¿Cómo terminó el entrenamiento?</p>
            {[
              { valor: null, titulo: '✓ En condiciones', detalle: 'Terminó bien, sin golpes.' },
              { valor: 'golpeado', titulo: '🤕 Golpeado', detalle: 'Se golpeó y paró, pero no hace falta seguimiento.' },
              {
                valor: 'lesionado',
                titulo: '🚑 Lesionado',
                detalle: 'Queda como recordatorio en Jugadores para cargarle la lesión en la ficha.',
              },
            ].map((op) => {
              const actual = (condicion[condicionDe.id] || null) === op.valor
              return (
                <button
                  key={op.titulo}
                  className={`opcion-condicion${actual ? ' activa' : ''}`}
                  onClick={() => marcarCondicion(condicionDe.id, op.valor)}
                >
                  <b>{op.titulo}{actual ? ' · actual' : ''}</b>
                  <span className="mini">{op.detalle}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
      </>}
    </div>
  )
}
