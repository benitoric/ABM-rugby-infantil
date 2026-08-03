import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { edad, fechaCorta, nombreCompleto, AREAS } from '../helpers.js'
import { FormJugador } from './Jugadores.jsx'

export default function Ficha({ jugadorId, onVolver }) {
  const [j, setJ] = useState(null)
  const [seguimientos, setSeguimientos] = useState([])
  const [stats, setStats] = useState(null)
  const [editando, setEditando] = useState(false)
  const [nuevo, setNuevo] = useState(null) // form de seguimiento
  const [error, setError] = useState('')

  async function cargar() {
    const [{ data: jugador }, { data: segs }, { data: asis }, { data: tiempos }] = await Promise.all([
      supabase.from('rugby_jugadores').select('*').eq('id', jugadorId).single(),
      supabase.from('rugby_seguimientos').select('*').eq('jugador_id', jugadorId)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('rugby_asistencias').select('estado, rugby_eventos(tipo)').eq('jugador_id', jugadorId),
      supabase.from('rugby_tiempo_jugadores').select('tiempo_id').eq('jugador_id', jugadorId),
    ])
    setJ(jugador)
    setSeguimientos(segs || [])

    const deTipo = (tipo) => (asis || []).filter((a) => a.rugby_eventos?.tipo === tipo)
    const pct = (lista) => {
      if (!lista.length) return null
      const presentes = lista.filter((a) => a.estado === 'presente' || a.estado === 'tarde').length
      return Math.round((100 * presentes) / lista.length)
    }
    setStats({
      entrenamientos: pct(deTipo('entrenamiento')),
      partidos: pct(deTipo('partido')),
      tiempos: (tiempos || []).length,
    })
  }
  useEffect(() => { cargar() }, [jugadorId])

  async function guardarSeguimiento(e) {
    e.preventDefault()
    setError('')
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('rugby_seguimientos').insert({
      jugador_id: jugadorId,
      fecha: nuevo.fecha,
      area: nuevo.area,
      valoracion: nuevo.valoracion ? Number(nuevo.valoracion) : null,
      comentario: nuevo.comentario?.trim() || null,
      autor_email: userData?.user?.email || null,
    })
    if (error) { setError(error.message); return }
    setNuevo(null)
    cargar()
  }

  async function borrarSeguimiento(id) {
    if (!confirm('¿Borrar esta entrada de seguimiento?')) return
    await supabase.from('rugby_seguimientos').delete().eq('id', id)
    cargar()
  }

  async function darDeBaja() {
    if (!confirm(`¿Dar de baja a ${nombreCompleto(j)}? Queda como "inactivo" y conserva su historial.`)) return
    await supabase.from('rugby_jugadores').update({ estado: 'inactivo' }).eq('id', j.id)
    cargar()
  }

  async function eliminar() {
    if (!confirm(`¿Eliminar DEFINITIVAMENTE a ${nombreCompleto(j)}? Se borra todo su historial (seguimiento, asistencias, tiempos). Esta acción no se puede deshacer.`)) return
    await supabase.from('rugby_jugadores').delete().eq('id', j.id)
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
              <span className={`badge ${j.estado}`}>{j.estado}</span>
              <span className={`badge ${j.ficha_medica_vigente ? 'medica-ok' : 'medica-no'}`}>
                {j.ficha_medica_vigente ? 'Ficha médica ✓' : 'Sin ficha médica'}
              </span>
              {j.posicion && <span className="badge activo">{j.posicion}</span>}
            </div>
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

      <div className="fila entre">
        <h3>Seguimiento evolutivo</h3>
        <button
          className="btn chico"
          onClick={() => setNuevo({ fecha: hoy, area: 'tecnica', valoracion: '', comentario: '' })}
        >
          + Nueva entrada
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
        <div className="vacio">Todavía no hay entradas de seguimiento para este jugador.</div>
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
    </div>
  )
}
