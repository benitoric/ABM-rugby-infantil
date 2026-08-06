import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { edad, estadoJugador, fechaCorta, fichaMedica, nombreCompleto, APTITUDES, AREAS, ESTADOS } from '../helpers.js'
import { FormJugador } from './Jugadores.jsx'
import { FormEvaluacion, TarjetaEvaluacion } from './Evaluacion.jsx'
import Documentos from './Documentos.jsx'

export default function Ficha({ jugadorId, onVolver }) {
  const [j, setJ] = useState(null)
  const [seguimientos, setSeguimientos] = useState([])
  const [evaluaciones, setEvaluaciones] = useState([])
  const [lesiones, setLesiones] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [stats, setStats] = useState(null)
  const [editando, setEditando] = useState(false)
  const [nuevo, setNuevo] = useState(null)
  const [evaluando, setEvaluando] = useState(false)
  const [nuevaLesion, setNuevaLesion] = useState(null)
  const [error, setError] = useState('')

  async function cargar() {
    const d = await api(`jugadores/${jugadorId}/detalle`)
    setJ(d.jugador)
    setSeguimientos(d.seguimientos)
    setEvaluaciones(d.evaluaciones || [])
    setLesiones(d.lesiones || [])
    setDocumentos(d.documentos || [])
    setStats(d.stats)
  }
  useEffect(() => { cargar() }, [jugadorId])

  async function guardarSeguimiento(e) {
    e.preventDefault()
    setError('')
    try {
      await api('seguimientos', {
        method: 'POST',
        body: {
          jugador_id: jugadorId,
          fecha: nuevo.fecha,
          area: nuevo.area,
          valoracion: nuevo.valoracion ? Number(nuevo.valoracion) : null,
          comentario: nuevo.comentario?.trim() || null,
        },
      })
      setNuevo(null)
      cargar()
    } catch {
      setError('No se pudo guardar la entrada.')
    }
  }

  async function borrarSeguimiento(id) {
    if (!confirm('¿Borrar esta entrada de seguimiento?')) return
    await api(`seguimientos/${id}`, { method: 'DELETE' })
    cargar()
  }

  async function darDeBaja() {
    if (!confirm(`¿Dar de baja a ${nombreCompleto(j)}? Queda como "inactivo" y conserva su historial.`)) return
    await api(`jugadores/${j.id}`, { method: 'PUT', body: { ...j, estado: 'inactivo' } })
    cargar()
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE a ${nombreCompleto(j)}? Se borra todo su historial (seguimiento, asistencias, tiempos). Esta acción no se puede deshacer.`)) return
    await api(`jugadores/${j.id}`, { method: 'DELETE' })
    onVolver()
  }

  if (!j) return <div className="vacio">Cargando…</div>

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <div className="fila">
          <button className="btn sec chico" onClick={() => setEditando(true)}>Editar</button>
          {j.estado !== 'inactivo' && (
            <button className="btn peligro chico" onClick={darDeBaja}>Dar de baja</button>
          )}
        </div>
      </div>

      <div className="tarjeta">
        <div className="fila">
          <div className="avatar" style={{ width: 52, height: 52, fontSize: '1.1rem' }}>
            {j.nombre[0]}{j.apellido[0]}
          </div>
          <div className="crece">
            <h2>{nombreCompleto(j)}</h2>
            <div className="suave">
              {edad(j.fecha_nacimiento) != null ? `${edad(j.fecha_nacimiento)} años · ` : ''}
              {j.fecha_nacimiento ? `nac. ${fechaCorta(j.fecha_nacimiento)}` : 'sin fecha de nacimiento'}
              {j.dni ? ` · DNI ${j.dni}` : ''}
            </div>
            <div className="fila" style={{ marginTop: 6 }}>
              <span className={`badge ${estadoJugador(j)}`}>{ESTADOS[estadoJugador(j)]}</span>
              <span className={`badge ${fichaMedica(j).clase}`}>{fichaMedica(j).texto}</span>
              {j.posicion && <span className={`badge puesto-${j.posicion.toLowerCase()}`}>{j.posicion}</span>}
              {lesiones.some((l) => !l.recuperado) && <span className="badge lesionado">🤕 lesión activa</span>}
            </div>
            {(j.aptitudes || []).length > 0 && (
              <div className="fila" style={{ marginTop: 6 }}>
                {APTITUDES.filter((a) => j.aptitudes.includes(a.value)).map((a) => (
                  <span key={a.value} className="badge aptitud">{a.label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        {(j.tutor_nombre || j.tutor_telefono) && (
          <p className="suave" style={{ marginTop: 10 }}>
            Tutor: {j.tutor_nombre || '—'}
            {j.tutor_telefono && <> · <a href={`tel:${j.tutor_telefono}`}>{j.tutor_telefono}</a></>}
          </p>
        )}
        {j.observaciones && <p className="suave" style={{ marginTop: 6 }}>📝 {j.observaciones}</p>}
      </div>

      {stats && (
        <div className="stat-grid">
          <div className="stat">
            <div className="valor">{stats.entrenamientos == null ? '—' : `${stats.entrenamientos}%`}</div>
            <div className="etiqueta">Asist. entren.</div>
          </div>
          <div className="stat">
            <div className="valor">{stats.partidos == null ? '—' : `${stats.partidos}%`}</div>
            <div className="etiqueta">Asist. partidos</div>
          </div>
          <div className="stat">
            <div className="valor">{stats.tiempos}</div>
            <div className="etiqueta">Tiempos jugados</div>
          </div>
        </div>
      )}

      <Documentos jugadorId={jugadorId} documentos={documentos} onCambio={cargar} />

      <div className="fila entre">
        <h3>Evaluación periódica</h3>
        <button className="btn chico" onClick={() => setEvaluando(true)}>+ Evaluar</button>
      </div>

      {evaluaciones.length === 0 && (
        <div className="vacio">
          Sin evaluaciones todavía. Se recomienda evaluar 2 o 3 veces al año
          (inicio, mitad y cierre de temporada).
        </div>
      )}

      {evaluaciones.map((ev, i) => (
        <TarjetaEvaluacion
          key={ev.id}
          ev={ev}
          anterior={evaluaciones[i + 1]}
          onBorrar={async (id) => {
            if (!confirm('¿Borrar esta evaluación completa?')) return
            await api(`evaluaciones/${id}`, { method: 'DELETE' })
            cargar()
          }}
        />
      ))}

      <div className="fila entre">
        <h3>Notas de seguimiento</h3>
        <button
          className="btn chico"
          onClick={() => setNuevo({ fecha: hoy, area: 'tecnica', valoracion: '', comentario: '' })}
        >
          + Nueva nota
        </button>
      </div>

      {nuevo && (
        <form className="tarjeta" onSubmit={guardarSeguimiento}>
          <div className="grid2">
            <div className="campo">
              <label>Fecha</label>
              <input type="date" required value={nuevo.fecha}
                onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
            </div>
            <div className="campo">
              <label>Área</label>
              <select value={nuevo.area} onChange={(e) => setNuevo({ ...nuevo, area: e.target.value })}>
                {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>
          <div className="campo">
            <label>Valoración (1 a 5, opcional)</label>
            <select value={nuevo.valoracion} onChange={(e) => setNuevo({ ...nuevo, valoracion: e.target.value })}>
              <option value="">Sin valoración</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Comentario</label>
            <textarea
              placeholder="Ej.: mejoró mucho el pase hacia la izquierda; trabajar el tackle de frente…"
              value={nuevo.comentario}
              onChange={(e) => setNuevo({ ...nuevo, comentario: e.target.value })}
            />
          </div>
          {error && <div className="error">{error}</div>}
          <div className="fila">
            <button className="btn crece">Guardar</button>
            <button type="button" className="btn sec" onClick={() => setNuevo(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {seguimientos.length === 0 && !nuevo && (
        <div className="vacio">Sin notas. Sirven para observaciones puntuales entre evaluaciones.</div>
      )}

      {seguimientos.map((s) => (
        <div key={s.id} className="seguimiento-item">
          <div className="fila entre">
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {AREAS.find((a) => a.value === s.area)?.label || s.area}
              {s.valoracion && <span className="estrellas"> {'★'.repeat(s.valoracion)}</span>}
            </span>
            <span className="mini">{fechaCorta(s.fecha)}</span>
          </div>
          {s.comentario && <p style={{ fontSize: '0.9rem', marginTop: 4 }}>{s.comentario}</p>}
          <div className="fila entre" style={{ marginTop: 4 }}>
            <span className="mini">{s.autor_email || ''}</span>
            <button className="btn peligro chico" onClick={() => borrarSeguimiento(s.id)}>Borrar</button>
          </div>
        </div>
      ))}

      <div className="fila entre">
        <h3>Lesiones</h3>
        <button
          className="btn chico"
          onClick={() => setNuevaLesion({ fecha: hoy, descripcion: '', fecha_retorno_estimada: '' })}
        >
          + Registrar lesión
        </button>
      </div>

      {nuevaLesion && (
        <form
          className="tarjeta"
          onSubmit={async (e) => {
            e.preventDefault()
            await api('lesiones', {
              method: 'POST',
              body: {
                jugador_id: jugadorId,
                fecha: nuevaLesion.fecha,
                descripcion: nuevaLesion.descripcion,
                fecha_retorno_estimada: nuevaLesion.fecha_retorno_estimada || null,
              },
            })
            setNuevaLesion(null)
            cargar()
          }}
        >
          <div className="grid2">
            <div className="campo">
              <label>Fecha de la lesión</label>
              <input type="date" required value={nuevaLesion.fecha}
                onChange={(e) => setNuevaLesion({ ...nuevaLesion, fecha: e.target.value })} />
            </div>
            <div className="campo">
              <label>Retorno estimado</label>
              <input type="date" value={nuevaLesion.fecha_retorno_estimada}
                onChange={(e) => setNuevaLesion({ ...nuevaLesion, fecha_retorno_estimada: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <label>Descripción *</label>
            <textarea required placeholder="Ej.: esguince de tobillo derecho en el entrenamiento"
              value={nuevaLesion.descripcion}
              onChange={(e) => setNuevaLesion({ ...nuevaLesion, descripcion: e.target.value })} />
          </div>
          <div className="fila">
            <button className="btn crece">Guardar lesión</button>
            <button type="button" className="btn sec" onClick={() => setNuevaLesion(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {lesiones.length === 0 && !nuevaLesion && (
        <div className="vacio">Sin lesiones registradas. 🙌</div>
      )}

      {lesiones.map((l) => (
        <div key={l.id} className="tarjeta" style={{ borderLeft: l.recuperado ? '3px solid var(--ok)' : '3px solid var(--bad)' }}>
          <div className="fila entre">
            <b style={{ fontSize: '0.9rem' }}>{l.recuperado ? '✅ Recuperado' : '🤕 En recuperación'}</b>
            <span className="mini">{fechaCorta(l.fecha)}</span>
          </div>
          <p style={{ fontSize: '0.9rem', marginTop: 4 }}>{l.descripcion}</p>
          {l.fecha_retorno_estimada && !l.recuperado && (
            <p className="mini" style={{ marginTop: 4 }}>Retorno estimado: {fechaCorta(l.fecha_retorno_estimada)}</p>
          )}
          <div className="fila" style={{ marginTop: 8 }}>
            <button
              className="btn sec chico"
              onClick={async () => {
                await api(`lesiones/${l.id}`, { method: 'PUT', body: { recuperado: !l.recuperado } })
                cargar()
              }}
            >
              {l.recuperado ? 'Reabrir' : 'Marcar recuperado'}
            </button>
            <button
              className="btn peligro chico"
              onClick={async () => {
                if (!confirm('¿Borrar este registro de lesión?')) return
                await api(`lesiones/${l.id}`, { method: 'DELETE' })
                cargar()
              }}
            >
              Borrar
            </button>
          </div>
        </div>
      ))}

      <div className="tarjeta">
        <h3>Zona peligrosa</h3>
        <p className="mini" style={{ margin: '6px 0 10px' }}>
          La baja normal es cambiar el estado a "inactivo" (conserva el historial).
          Eliminar borra al jugador y todo su historial de forma permanente.
        </p>
        <button className="btn peligro chico" onClick={eliminar}>Eliminar definitivamente</button>
      </div>

      {editando && (
        <FormJugador
          inicial={j}
          onCerrar={() => setEditando(false)}
          onGuardado={() => { setEditando(false); cargar() }}
        />
      )}

      {evaluando && (
        <FormEvaluacion
          jugador={j}
          anterior={evaluaciones[0]}
          onCerrar={() => setEvaluando(false)}
          onGuardado={() => { setEvaluando(false); cargar() }}
        />
      )}
    </div>
  )
}
