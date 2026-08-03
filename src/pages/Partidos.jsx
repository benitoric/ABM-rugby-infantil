import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { etiquetaPartido, fechaCorta, lineaBloque, nombreCompleto } from '../helpers.js'

const MAX_TIEMPOS = 6

export default function Partidos() {
  const [partidos, setPartidos] = useState([])
  const [partidoId, setPartidoId] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const eventos = await api('eventos')
      const ps = eventos.filter((e) => e.tipo === 'partido')
      setPartidos(ps)
      if (ps.length) setPartidoId(ps[0].id)
      setCargando(false)
    }
    cargar().catch(() => setCargando(false))
  }, [])

  if (cargando) return <div className="vacio">Cargando…</div>

  if (!partidos.length) {
    return (
      <div className="contenido">
        <h2>Día de partido</h2>
        <div className="vacio">
          No hay partidos creados. Primero creá un evento de tipo "Partido" en la
          pestaña Asistencia.
        </div>
      </div>
    )
  }

  const partido = partidos.find((p) => p.id === partidoId)

  return (
    <div className="contenido">
      <div className="campo no-imprimir">
        <label>Partido</label>
        <select value={partidoId} onChange={(e) => setPartidoId(e.target.value)}>
          {partidos.map((p) => (
            <option key={p.id} value={p.id}>
              {fechaCorta(p.fecha)} · {etiquetaPartido(p)}
            </option>
          ))}
        </select>
      </div>
      {partido && <ArmadoPartido key={partido.id} partido={partido} />}
      <RotacionAnual />
    </div>
  )
}

function RotacionAnual() {
  const [filas, setFilas] = useState(null)
  const anio = new Date().getFullYear()

  async function abrir(e) {
    if (e.target.open && !filas) setFilas(await api(`stats/tiempos?anio=${anio}`))
  }

  return (
    <details className="tarjeta no-imprimir" onToggle={abrir}>
      <summary>📊 Tiempos jugados en {anio} (para equilibrar rotaciones)</summary>
      {!filas && <p className="mini" style={{ marginTop: 8 }}>Cargando…</p>}
      {filas && !filas.length && <p className="mini" style={{ marginTop: 8 }}>Sin datos todavía.</p>}
      {filas && filas.map((f) => (
        <div key={f.id} className="fila entre" style={{ marginTop: 6 }}>
          <span style={{ fontSize: '0.9rem' }}>{f.apellido}, {f.nombre}</span>
          <b style={{ color: f.tiempos === 0 ? 'var(--warn)' : 'var(--verde-oscuro)' }}>
            {f.tiempos} {f.tiempos === 1 ? 'tiempo' : 'tiempos'}
          </b>
        </div>
      ))}
      <p className="mini" style={{ marginTop: 8 }}>
        Ordenado de menor a mayor: los de arriba son los que menos jugaron en el año.
      </p>
    </details>
  )
}

function ArmadoPartido({ partido }) {
  const [bloques, setBloques] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [asistencia, setAsistencia] = useState({})
  const [asignacion, setAsignacion] = useState({})
  const [tiempos, setTiempos] = useState([])
  const [enCancha, setEnCancha] = useState({})
  const [vista, setVista] = useState('bloques')
  const [tiempoSel, setTiempoSel] = useState({})
  const [editandoBloque, setEditandoBloque] = useState(null)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [datos, js, asis] = await Promise.all([
        api(`partido/${partido.id}`),
        api('jugadores'),
        api(`eventos/${partido.id}/asistencias`),
      ])
      setBloques(datos.bloques)
      setTiempos(datos.tiempos)
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))

      const mAsis = {}
      for (const a of asis) mAsis[a.jugador_id] = a.estado
      setAsistencia(mAsis)

      const mAsig = {}
      for (const f of datos.asignaciones) mAsig[f.jugador_id] = f.bloque_id
      setAsignacion(mAsig)

      const mCancha = {}
      for (const f of datos.en_cancha) {
        if (!mCancha[f.tiempo_id]) mCancha[f.tiempo_id] = new Set()
        mCancha[f.tiempo_id].add(f.jugador_id)
      }
      setEnCancha(mCancha)

      const sel = {}
      for (const b of datos.bloques) {
        const primero = datos.tiempos.find((t) => t.bloque_id === b.id)
        if (primero) sel[b.id] = primero.id
      }
      setTiempoSel(sel)
      setListo(true)
    }
    cargar()
  }, [partido.id])

  async function asignar(jugadorId, bloqueId) {
    const actual = asignacion[jugadorId]
    const nuevo = actual === bloqueId ? null : bloqueId
    setAsignacion((m) => ({ ...m, [jugadorId]: nuevo }))
    if (actual) {
      // al sacarlo del bloque también sale de los tiempos de ese bloque
      const tiemposDelBloque = tiempos.filter((t) => t.bloque_id === actual).map((t) => t.id)
      setEnCancha((m) => {
        const copia = { ...m }
        for (const tid of tiemposDelBloque) {
          if (copia[tid]?.has(jugadorId)) {
            copia[tid] = new Set(copia[tid])
            copia[tid].delete(jugadorId)
          }
        }
        return copia
      })
    }
    await api('partido/asignar', {
      method: 'POST',
      body: { evento_id: partido.id, jugador_id: jugadorId, bloque_id: nuevo },
    })
  }

  async function toggleEnCancha(tiempoId, jugadorId) {
    const estaba = (enCancha[tiempoId] || new Set()).has(jugadorId)
    setEnCancha((m) => {
      const copia = { ...m, [tiempoId]: new Set(m[tiempoId] || []) }
      if (estaba) copia[tiempoId].delete(jugadorId)
      else copia[tiempoId].add(jugadorId)
      return copia
    })
    await api('partido/cancha', {
      method: 'POST',
      body: { tiempo_id: tiempoId, jugador_id: jugadorId, dentro: !estaba },
    })
  }

  async function agregarTiempo(bloqueId) {
    const delBloque = tiempos.filter((t) => t.bloque_id === bloqueId)
    if (delBloque.length >= MAX_TIEMPOS) return
    const nuevo = await api('partido/tiempo', { method: 'POST', body: { bloque_id: bloqueId } })
    setTiempos((ts) => [...ts, nuevo].sort((a, b) => a.numero - b.numero))
  }

  const ordenados = useMemo(() => {
    const prioridad = (j) => {
      const a = asistencia[j.id]
      if (a === 'presente' || a === 'tarde') return 0
      if (!a) return 1
      return 2
    }
    return [...jugadores].sort((x, y) =>
      prioridad(x) - prioridad(y) ||
      x.apellido.localeCompare(y.apellido) ||
      x.nombre.localeCompare(y.nombre))
  }, [jugadores, asistencia])

  if (!listo) return <div className="vacio">Preparando bloques…</div>

  const conteoBloque = (bloqueId) =>
    Object.values(asignacion).filter((b) => b === bloqueId).length

  return (
    <>
      <div className="seg no-imprimir">
        <button className={vista === 'bloques' ? 'activo' : ''} onClick={() => setVista('bloques')}>
          Armar bloques
        </button>
        {bloques.map((b) => (
          <button key={b.id} className={vista === b.id ? 'activo' : ''} onClick={() => setVista(b.id)}>
            {b.nombre || `Bloque ${b.numero}`} ({conteoBloque(b.id)})
          </button>
        ))}
        <button className={vista === 'planilla' ? 'activo' : ''} onClick={() => setVista('planilla')}>
          🖨 Planilla
        </button>
      </div>

      {vista === 'planilla' && (
        <Planilla
          partido={partido}
          bloques={bloques}
          jugadores={ordenados}
          asignacion={asignacion}
          tiempos={tiempos}
          enCancha={enCancha}
        />
      )}

      {vista === 'bloques' && (
        <>
          <p className="mini">
            Asigná cada jugador a un bloque. Los presentes aparecen primero.
            Tocá de nuevo el mismo botón para sacarlo del bloque.
          </p>
          {ordenados.map((j) => {
            const a = asistencia[j.id]
            const apagado = a === 'ausente' || a === 'justificado'
            return (
              <div key={j.id} className="jugador-item" style={{ cursor: 'default', opacity: apagado ? 0.5 : 1 }}>
                <div className="crece">
                  <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
                  <div className="mini">
                    {a ? `Asistencia: ${a}` : 'Sin marcar asistencia'}
                    {j.estado === 'lesionado' ? ' · 🤕 lesionado' : ''}
                  </div>
                </div>
                <div className="bloque-botones">
                  {bloques.map((b) => (
                    <button
                      key={b.id}
                      className={`bloque-btn ${asignacion[j.id] === b.id ? 'sel' : ''}`}
                      onClick={() => asignar(j.id, b.id)}
                    >
                      B{b.numero}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </>
      )}

      {editandoBloque && (
        <div className="modal-fondo" onClick={() => setEditandoBloque(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const actualizado = await api(`partido/bloque/${editandoBloque.id}`, {
                method: 'PUT',
                body: {
                  rival: editandoBloque.rival?.trim() || null,
                  lugar: editandoBloque.lugar?.trim() || null,
                  hora_convocatoria: editandoBloque.hora_convocatoria || null,
                },
              })
              setBloques((bs) => bs.map((x) => (x.id === actualizado.id ? actualizado : x)))
              setEditandoBloque(null)
            }}
          >
            <div className="fila entre" style={{ marginBottom: 12 }}>
              <h3>{editandoBloque.nombre || `Bloque ${editandoBloque.numero}`}</h3>
              <button type="button" className="btn sec chico" onClick={() => setEditandoBloque(null)}>Cerrar</button>
            </div>
            <div className="campo">
              <label>Rival</label>
              <input value={editandoBloque.rival || ''}
                onChange={(e) => setEditandoBloque({ ...editandoBloque, rival: e.target.value })} />
            </div>
            <div className="grid2">
              <div className="campo">
                <label>Hora de convocatoria</label>
                <input type="time" value={editandoBloque.hora_convocatoria?.slice(0, 5) || ''}
                  onChange={(e) => setEditandoBloque({ ...editandoBloque, hora_convocatoria: e.target.value })} />
              </div>
              <div className="campo">
                <label>Lugar de juego</label>
                <input value={editandoBloque.lugar || ''}
                  onChange={(e) => setEditandoBloque({ ...editandoBloque, lugar: e.target.value })} />
              </div>
            </div>
            <button className="btn" style={{ width: '100%' }}>Guardar</button>
          </form>
        </div>
      )}

      {bloques.map((b) => vista === b.id && (
        <VistaBloque
          key={b.id}
          bloque={b}
          onEditar={() => setEditandoBloque({ ...b })}
          jugadores={ordenados.filter((j) => asignacion[j.id] === b.id)}
          tiempos={tiempos.filter((t) => t.bloque_id === b.id)}
          tiempoSel={tiempoSel[b.id]}
          onSelTiempo={(tid) => setTiempoSel((m) => ({ ...m, [b.id]: tid }))}
          enCancha={enCancha}
          onToggle={toggleEnCancha}
          onAgregarTiempo={() => agregarTiempo(b.id)}
        />
      ))}
    </>
  )
}

function Planilla({ partido, bloques, jugadores, asignacion, tiempos, enCancha }) {
  return (
    <div className="planilla">
      <div className="fila entre no-imprimir">
        <p className="mini crece">
          Vista para llevar a la cancha: imprimila o guardala como PDF desde el
          diálogo de impresión.
        </p>
        <button className="btn" onClick={() => window.print()}>Imprimir</button>
      </div>

      <div className="tarjeta">
        <h2>🏉 Rugby M12 · Día de partido · {fechaCorta(partido.fecha)}</h2>

        {bloques.map((bl) => {
          const delBloque = jugadores.filter((j) => asignacion[j.id] === bl.id)
          const tiemposBloque = tiempos.filter((t) => t.bloque_id === bl.id)
          const jugados = (jid) =>
            tiemposBloque.filter((t) => (enCancha[t.id] || new Set()).has(jid)).length
          return (
            <div key={bl.id}>
              <h3>
                {bl.nombre || `Bloque ${bl.numero}`} vs {bl.rival || 'a definir'} ({delBloque.length} jugadores)
              </h3>
              <p className="mini">
                {bl.hora_convocatoria ? `Convocatoria: ${bl.hora_convocatoria.slice(0, 5)} hs` : ''}
                {bl.lugar ? `${bl.hora_convocatoria ? ' · ' : ''}${bl.lugar}` : ''}
              </p>
              {!delBloque.length && <p className="mini">Sin jugadores asignados.</p>}
              {delBloque.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Jugador</th>
                      {tiemposBloque.map((t) => <th key={t.id}>T{t.numero}</th>)}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {delBloque.map((j) => (
                      <tr key={j.id}>
                        <td>{nombreCompleto(j)}</td>
                        {tiemposBloque.map((t) => (
                          <td key={t.id}>{(enCancha[t.id] || new Set()).has(j.id) ? '✔' : ''}</td>
                        ))}
                        <td><b>{jugados(j.id)}</b></td>
                      </tr>
                    ))}
                    <tr>
                      <td><b>En cancha</b></td>
                      {tiemposBloque.map((t) => (
                        <td key={t.id}><b>{(enCancha[t.id] || new Set()).size}</b></td>
                      ))}
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )
        })}

        <p className="mini" style={{ marginTop: 10 }}>
          Sin bloque: {jugadores.filter((j) => !asignacion[j.id]).map(nombreCompleto).join(' · ') || '—'}
        </p>
      </div>
    </div>
  )
}

function VistaBloque({ bloque, onEditar, jugadores, tiempos, tiempoSel, onSelTiempo, enCancha, onToggle, onAgregarTiempo }) {
  const infoBloque = (
    <div className="tarjeta fila entre">
      <div className="crece">
        <b>vs {bloque.rival || 'rival a definir'}</b>
        <div className="mini">
          {bloque.hora_convocatoria ? `Convocatoria: ${bloque.hora_convocatoria.slice(0, 5)} hs` : 'Sin hora de convocatoria'}
          {bloque.lugar ? ` · ${bloque.lugar}` : ' · sin lugar definido'}
        </div>
      </div>
      <button className="btn sec chico" onClick={onEditar}>Editar datos</button>
    </div>
  )

  if (!jugadores.length) {
    return (
      <>
        {infoBloque}
        <div className="vacio">
          Este bloque no tiene jugadores. Asignalos en "Armar bloques".
        </div>
      </>
    )
  }

  const tiempo = tiempos.find((t) => t.id === tiempoSel) || tiempos[0]
  const set = (tiempo && enCancha[tiempo.id]) || new Set()

  // cuántos tiempos jugó cada jugador en este bloque
  const jugados = {}
  for (const t of tiempos) {
    for (const jid of enCancha[t.id] || []) jugados[jid] = (jugados[jid] || 0) + 1
  }
  const sinJugar = jugadores.filter((j) => !jugados[j.id])

  return (
    <>
      {infoBloque}
      <div className="fila entre">
        <div className="seg crece">
          {tiempos.map((t) => (
            <button key={t.id} className={tiempo?.id === t.id ? 'activo' : ''} onClick={() => onSelTiempo(t.id)}>
              T{t.numero}
            </button>
          ))}
        </div>
        {tiempos.length < MAX_TIEMPOS && (
          <button className="btn sec chico" onClick={onAgregarTiempo}>+ Tiempo</button>
        )}
      </div>

      <div className="tarjeta fila entre">
        <div>
          <div className="mini">En cancha · Tiempo {tiempo?.numero}</div>
          <div className="contador">{set.size} jugadores</div>
        </div>
        {sinJugar.length > 0 && (
          <div className="mini" style={{ color: 'var(--warn)', maxWidth: '55%' }}>
            ⚠️ Sin jugar todavía: {sinJugar.map((j) => j.apellido).join(', ')}
          </div>
        )}
        {sinJugar.length === 0 && (
          <div className="mini" style={{ color: 'var(--ok)' }}>✓ Todos jugaron al menos un tiempo</div>
        )}
      </div>

      <p className="mini">Tocá un jugador para ponerlo o sacarlo de la cancha en este tiempo.</p>

      {jugadores.map((j) => {
        const dentro = set.has(j.id)
        return (
          <button
            key={j.id}
            className="jugador-item"
            style={dentro ? { borderLeft: '4px solid var(--ok)' } : { opacity: 0.75 }}
            onClick={() => tiempo && onToggle(tiempo.id, j.id)}
          >
            <div className="crece">
              <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
              <div className="mini">
                {jugados[j.id] || 0} {jugados[j.id] === 1 ? 'tiempo jugado' : 'tiempos jugados'} en este bloque
                {!jugados[j.id] && ' ⚠️'}
              </div>
            </div>
            <span style={{ fontWeight: 800, color: dentro ? 'var(--ok)' : 'var(--texto-suave)' }}>
              {dentro ? 'EN CANCHA' : 'Banco'}
            </span>
          </button>
        )
      })}
    </>
  )
}
