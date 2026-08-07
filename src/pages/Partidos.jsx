import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import {
  abrevAptitudes, DIFICULTADES, etiquetaDificultad, etiquetaMotivo, etiquetaPartido, fechaCorta,
  FORMACION, nombreCompleto, puedeJugarDe,
} from '../helpers.js'
import { CampoSugerido, useSugerencias } from '../sugerencias.jsx'

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
            {f.prestados > 0 && <span className="mini"> ({f.prestados} prestado{f.prestados > 1 ? 's' : ''})</span>}
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
  const [sugerencias, recargarSugerencias] = useSugerencias()

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

      // enCancha: tiempo_id → { jugador_id → { puesto, prestado } }
      const mCancha = {}
      for (const f of datos.en_cancha) {
        if (!mCancha[f.tiempo_id]) mCancha[f.tiempo_id] = {}
        mCancha[f.tiempo_id][f.jugador_id] = { puesto: f.puesto, prestado: f.prestado }
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
          if (copia[tid]?.[jugadorId]) {
            copia[tid] = { ...copia[tid] }
            delete copia[tid][jugadorId]
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

  // Aplica una tanda de movimientos sobre un tiempo (poner, sacar, cambiar
  // puesto, prestar). Optimista: primero el estado, después la API en orden
  // (el orden importa en los intercambios de puesto).
  async function moverEnCancha(tiempoId, cambios) {
    setEnCancha((m) => {
      const t = { ...(m[tiempoId] || {}) }
      for (const c of cambios) {
        if (!c.dentro) { delete t[c.jugador_id]; continue }
        t[c.jugador_id] = { puesto: c.prestado ? null : (c.puesto ?? null), prestado: !!c.prestado }
        if (c.puesto && !c.prestado) {
          for (const [jid, e] of Object.entries(t)) {
            if (jid !== c.jugador_id && e.puesto === c.puesto) t[jid] = { ...e, puesto: null }
          }
        }
      }
      return { ...m, [tiempoId]: t }
    })
    for (const c of cambios) {
      await api('partido/cancha', { method: 'POST', body: { tiempo_id: tiempoId, ...c } })
    }
  }

  async function agregarTiempo(bloqueId) {
    const delBloque = tiempos.filter((t) => t.bloque_id === bloqueId)
    if (delBloque.length >= MAX_TIEMPOS) return
    const nuevo = await api('partido/tiempo', { method: 'POST', body: { bloque_id: bloqueId } })
    setTiempos((ts) => [...ts, nuevo].sort((a, b) => a.numero - b.numero))
  }

  const ordenados = useMemo(() => {
    const prioridad = (j) => (asistencia[j.id] === 'presente' ? 0 : 1)
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
            {b.suspendido ? '⛔ ' : ''}{b.nombre || `Bloque ${b.numero}`} ({conteoBloque(b.id)})
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
            const presente = asistencia[j.id] === 'presente'
            return (
              <div key={j.id} className="jugador-item" style={{ cursor: 'default', opacity: presente ? 1 : 0.6 }}>
                <div className="crece">
                  <div style={{ fontWeight: 600 }}>
                    {nombreCompleto(j)}
                    {j.posicion && <span className="mini"> · {j.posicion}</span>}
                  </div>
                  <div className="mini">
                    {presente ? 'Presente' : 'Ausente'}
                    {j.estado === 'lesionado' ? ' · 🤕 lesionado' : ''}
                    {abrevAptitudes(j) ? ` · ${abrevAptitudes(j)}` : ''}
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
                  dificultad: editandoBloque.dificultad || null,
                  lugar: editandoBloque.lugar?.trim() || null,
                  hora_convocatoria: editandoBloque.hora_convocatoria || null,
                },
              })
              setBloques((bs) => bs.map((x) => (x.id === actualizado.id ? actualizado : x)))
              setEditandoBloque(null)
              recargarSugerencias()
            }}
          >
            <div className="fila entre" style={{ marginBottom: 12 }}>
              <h3>{editandoBloque.nombre || `Bloque ${editandoBloque.numero}`}</h3>
              <button type="button" className="btn sec chico" onClick={() => setEditandoBloque(null)}>Cerrar</button>
            </div>
            <div className="campo">
              <label>Rival</label>
              <CampoSugerido
                placeholder="Ej.: Tucumán Rugby"
                value={editandoBloque.rival || ''}
                opciones={sugerencias.rivales}
                onChange={(v) => setEditandoBloque({ ...editandoBloque, rival: v })}
              />
            </div>
            <div className="campo">
              <label>Grado de dificultad</label>
              <div className="seg">
                {DIFICULTADES.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={editandoBloque.dificultad === d.value ? 'activo' : ''}
                    onClick={() => setEditandoBloque({
                      ...editandoBloque,
                      dificultad: editandoBloque.dificultad === d.value ? '' : d.value,
                    })}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid2">
              <div className="campo">
                <label>Hora de convocatoria</label>
                <input type="time" value={editandoBloque.hora_convocatoria?.slice(0, 5) || ''}
                  onChange={(e) => setEditandoBloque({ ...editandoBloque, hora_convocatoria: e.target.value })} />
              </div>
              <div className="campo">
                <label>Lugar de juego</label>
                <CampoSugerido
                  placeholder="Ej.: sede Marcos Paz"
                  value={editandoBloque.lugar || ''}
                  opciones={sugerencias.lugares}
                  onChange={(v) => setEditandoBloque({ ...editandoBloque, lugar: v })}
                />
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
          onActualizado={(nuevo) => setBloques((bs) => bs.map((x) => (x.id === nuevo.id ? nuevo : x)))}
          jugadores={ordenados.filter((j) => asignacion[j.id] === b.id)}
          tiempos={tiempos.filter((t) => t.bloque_id === b.id)}
          tiempoSel={tiempoSel[b.id]}
          onSelTiempo={(tid) => setTiempoSel((m) => ({ ...m, [b.id]: tid }))}
          enCancha={enCancha}
          onMover={moverEnCancha}
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
            tiemposBloque.filter((t) => (enCancha[t.id] || {})[jid]).length
          return (
            <div key={bl.id}>
              <h3>
                {bl.nombre || `Bloque ${bl.numero}`} vs {bl.rival || 'a definir'} ({delBloque.length} jugadores)
                {bl.suspendido ? ' · SUSPENDIDO' : ''}
              </h3>
              <p className="mini">
                {bl.hora_convocatoria ? `Convocatoria: ${bl.hora_convocatoria.slice(0, 5)} hs` : ''}
                {bl.lugar ? `${bl.hora_convocatoria ? ' · ' : ''}${bl.lugar}` : ''}
                {bl.dificultad ? ` · Dificultad: ${etiquetaDificultad(bl.dificultad)}` : ''}
                {bl.suspendido ? ` · Suspendido: ${etiquetaMotivo(bl.motivo_suspension)}${bl.nota_suspension ? ` (${bl.nota_suspension})` : ''}` : ''}
              </p>
              {!delBloque.length && <p className="mini">Sin jugadores asignados.</p>}
              {delBloque.length > 0 && (
                <>
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
                          {tiemposBloque.map((t) => {
                            const e = (enCancha[t.id] || {})[j.id]
                            return <td key={t.id}>{e ? (e.prestado ? 'P' : (e.puesto || '✔')) : ''}</td>
                          })}
                          <td><b>{jugados(j.id)}</b></td>
                        </tr>
                      ))}
                      <tr>
                        <td><b>En cancha</b></td>
                        {tiemposBloque.map((t) => (
                          <td key={t.id}>
                            <b>{Object.values(enCancha[t.id] || {}).filter((e) => !e.prestado).length}</b>
                          </td>
                        ))}
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mini">
                    Número = camiseta · ✔ = en cancha sin puesto · P = prestado al rival.
                  </p>
                  <h4>Formación por tiempo</h4>
                  <table>
                    <thead>
                      <tr>
                        <th>Puesto</th>
                        {tiemposBloque.map((t) => <th key={t.id}>T{t.numero}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {FORMACION.map((f) => (
                        <tr key={f.num}>
                          <td><b>{f.num}</b> {f.label}</td>
                          {tiemposBloque.map((t) => {
                            const oc = delBloque.find((j) => {
                              const e = (enCancha[t.id] || {})[j.id]
                              return e && !e.prestado && e.puesto === f.num
                            })
                            return <td key={t.id}>{oc ? oc.apellido : ''}</td>
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td>Prestados</td>
                        {tiemposBloque.map((t) => (
                          <td key={t.id}>
                            {delBloque
                              .filter((j) => (enCancha[t.id] || {})[j.id]?.prestado)
                              .map((j) => j.apellido).join(', ')}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </>
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

function Estrellas({ valor, onCambiar }) {
  return (
    <div className="estrellas-sel">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          title={`${n} de 5`}
          onClick={() => onCambiar(n === valor ? null : n)}
        >
          {n <= (valor || 0) ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

function BalancePartido({ bloque, onActualizado }) {
  const [cronica, setCronica] = useState(bloque.cronica || '')
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    setCronica(bloque.cronica || '')
    setGuardado(false)
  }, [bloque.id])

  async function guardar(cambios) {
    const nuevo = await api(`partido/bloque/${bloque.id}`, { method: 'PUT', body: cambios })
    onActualizado(nuevo)
  }

  const cronicaCambiada = cronica !== (bloque.cronica || '')

  return (
    <div className="tarjeta">
      <div className="fila entre">
        <div>
          <h3>Balance del partido</h3>
          <p className="mini">¿Cómo jugó el bloque? (sin puntaje: es rugby infantil 😉)</p>
        </div>
        <Estrellas valor={bloque.valoracion} onCambiar={(v) => guardar({ valoracion: v })} />
      </div>
      <div className="campo" style={{ marginTop: 8, marginBottom: 0 }}>
        <label>Incidentes y situaciones a destacar</label>
        <textarea
          placeholder="Ej.: golpe en la rodilla de Juan (avisado al tutor); gran actitud del equipo en el segundo tiempo; devolver camiseta N° 8…"
          value={cronica}
          onChange={(e) => { setCronica(e.target.value); setGuardado(false) }}
        />
        {(cronicaCambiada || guardado) && (
          <button
            className="btn chico"
            style={{ marginTop: 6, alignSelf: 'flex-end' }}
            disabled={!cronicaCambiada}
            onClick={async () => { await guardar({ cronica: cronica.trim() || null }); setGuardado(true) }}
          >
            {guardado && !cronicaCambiada ? '✓ Guardado' : 'Guardar crónica'}
          </button>
        )}
      </div>
    </div>
  )
}

function VistaBloque({ bloque, onEditar, onActualizado, jugadores, tiempos, tiempoSel, onSelTiempo, enCancha, onMover, onAgregarTiempo }) {
  const [sel, setSel] = useState(null)

  useEffect(() => setSel(null), [tiempoSel])

  const infoBloque = (
    <>
      <div className="tarjeta fila entre">
        <div className="crece">
          <b>vs {bloque.rival || 'rival a definir'}</b>
          {bloque.dificultad && (
            <span className={`badge dificultad-${bloque.dificultad}`}>
              {etiquetaDificultad(bloque.dificultad)}
            </span>
          )}
          <div className="mini">
            {bloque.hora_convocatoria ? `Convocatoria: ${bloque.hora_convocatoria.slice(0, 5)} hs` : 'Sin hora de convocatoria'}
            {bloque.lugar ? ` · ${bloque.lugar}` : ' · sin lugar definido'}
          </div>
        </div>
        <button className="btn sec chico" onClick={onEditar}>Editar datos</button>
      </div>
      {bloque.suspendido && (
        <p className="aviso">
          ⛔ Bloque suspendido · {etiquetaMotivo(bloque.motivo_suspension)}
          {bloque.nota_suspension ? ` · ${bloque.nota_suspension}` : ''}
        </p>
      )}
    </>
  )

  if (!jugadores.length) {
    return (
      <>
        {infoBloque}
        <div className="vacio">
          Este bloque no tiene jugadores. Asignalos en "Armar bloques".
        </div>
        <BalancePartido bloque={bloque} onActualizado={onActualizado} />
      </>
    )
  }

  const tiempo = tiempos.find((t) => t.id === tiempoSel) || tiempos[0]
  const mapa = (tiempo && enCancha[tiempo.id]) || {}

  // cuántos tiempos jugó cada jugador en este bloque (prestado también cuenta)
  const jugados = {}
  for (const t of tiempos) {
    for (const jid of Object.keys(enCancha[t.id] || {})) jugados[jid] = (jugados[jid] || 0) + 1
  }
  const sinJugar = jugadores.filter((j) => !jugados[j.id])

  const ocupante = {}
  for (const j of jugadores) {
    const e = mapa[j.id]
    if (e && !e.prestado && e.puesto) ocupante[e.puesto] = j
  }
  const prestados = jugadores.filter((j) => mapa[j.id]?.prestado)
  const sinPuesto = jugadores.filter((j) => mapa[j.id] && !mapa[j.id].prestado && !mapa[j.id].puesto)
  const banco = jugadores.filter((j) => !mapa[j.id])
  const jSel = jugadores.find((j) => j.id === sel) || null
  const enJuego = jugadores.filter((j) => mapa[j.id] && !mapa[j.id].prestado)

  function tocarPuesto(num) {
    const oc = ocupante[num]
    if (!jSel) {
      if (oc) setSel(oc.id)
      return
    }
    if (oc?.id === jSel.id) { setSel(null); return }
    const origen = mapa[jSel.id]
    const cambios = [{ jugador_id: jSel.id, dentro: true, puesto: num }]
    if (oc) {
      // si el elegido venía de otro puesto se intercambian; si venía del
      // banco (o prestado, o sin puesto), el que estaba sale al banco
      if (origen && !origen.prestado && origen.puesto) {
        cambios.push({ jugador_id: oc.id, dentro: true, puesto: origen.puesto })
      } else {
        cambios.push({ jugador_id: oc.id, dentro: false })
      }
    }
    setSel(null)
    onMover(tiempo.id, cambios)
  }

  function tocarJugador(jid) {
    setSel(sel === jid ? null : jid)
  }

  function accionSel(cambio) {
    const jid = jSel.id
    setSel(null)
    onMover(tiempo.id, [{ jugador_id: jid, ...cambio }])
  }

  // Premisas que no se están cumpliendo en el tiempo a la vista
  const avisos = []
  if (tiempo) {
    if (enJuego.length !== 13) {
      avisos.push(`Hay ${enJuego.length} jugadores en cancha: deberían ser 13.`)
    }
    for (const f of FORMACION) {
      const oc = ocupante[f.num]
      if (!oc) continue
      if (!puedeJugarDe(oc, f.num)) {
        avisos.push(`${oc.apellido} es ${oc.posicion} y está de ${f.num} (${f.label}).`)
      }
      if (f.conductor && !(oc.aptitudes || []).includes('conduccion')) {
        avisos.push(`El ${f.num} (${oc.apellido}) no tiene aptitud de conducción.`)
      }
    }
    if (sinPuesto.length) {
      avisos.push(`En cancha sin puesto asignado: ${sinPuesto.map((j) => j.apellido).join(', ')}.`)
    }
  }

  const chipJugador = (j, extra = '') => (
    <button
      key={j.id}
      className={`chip-jugador ${sel === j.id ? 'sel' : ''}`}
      onClick={() => tocarJugador(j.id)}
    >
      <b>{j.apellido}</b>
      <span className="mini">
        {j.posicion ? `${j.posicion[0]}` : '·'} · {jugados[j.id] || 0}t
        {abrevAptitudes(j) ? ` · ${abrevAptitudes(j)}` : ''}{extra}
      </span>
    </button>
  )

  const celda = (f) => {
    const oc = ocupante[f.num]
    const alerta = oc && (!puedeJugarDe(oc, f.num) ||
      (f.conductor && !(oc.aptitudes || []).includes('conduccion')))
    const clases = ['puesto-celda']
    if (!oc) clases.push('vacia')
    if (sel && oc?.id === sel) clases.push('sel')
    else if (jSel) clases.push('destino')
    if (alerta) clases.push('alerta')
    return (
      <button key={f.num} className={clases.join(' ')} onClick={() => tocarPuesto(f.num)}>
        <span className="puesto-num">{f.num}</span>
        <span className="crece">
          <span className="mini">{f.label}{f.conductor ? ' · Cond' : ''}</span>
          <b>{oc ? nombreCompleto(oc) : '—'}</b>
        </span>
        {alerta && <span>⚠️</span>}
      </button>
    )
  }

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

      {avisos.length > 0 && (
        <div className="aviso">
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}
      {avisos.length === 0 && enJuego.length === 13 && (
        <p className="mini" style={{ color: 'var(--ok)' }}>✓ Formación completa, sin observaciones.</p>
      )}

      <div className={`barra-sel ${jSel ? '' : 'oculta'}`}>
        {jSel && (
          <>
            <div className="crece">
              <b>{nombreCompleto(jSel)}</b>
              <div className="mini">Tocá un puesto para ubicarlo, o…</div>
            </div>
            {mapa[jSel.id] && (
              <button className="btn sec chico" onClick={() => accionSel({ dentro: false })}>Al banco</button>
            )}
            {!mapa[jSel.id]?.prestado && (
              <button className="btn sec chico" onClick={() => accionSel({ dentro: true, prestado: true })}>
                Prestar al rival
              </button>
            )}
            <button className="btn sec chico" onClick={() => setSel(null)}>✕</button>
          </>
        )}
      </div>

      <div className="formacion">
        <div>
          <div className="mini formacion-titulo">Forwards</div>
          {FORMACION.filter((f) => f.tipo === 'forward').map(celda)}
        </div>
        <div>
          <div className="mini formacion-titulo">Backs</div>
          {FORMACION.filter((f) => f.tipo === 'back').map(celda)}
        </div>
      </div>

      {sinPuesto.length > 0 && (
        <div className="tarjeta">
          <div className="mini" style={{ marginBottom: 6 }}>En cancha sin puesto (tocá para ubicar)</div>
          <div className="banco-lista">{sinPuesto.map((j) => chipJugador(j))}</div>
        </div>
      )}

      <div className="tarjeta">
        <div className="fila entre" style={{ marginBottom: 6 }}>
          <div className="mini">Banco · Tiempo {tiempo?.numero} ({banco.length})</div>
          {sinJugar.length > 0 ? (
            <div className="mini" style={{ color: 'var(--warn)' }}>
              ⚠️ Sin jugar: {sinJugar.map((j) => j.apellido).join(', ')}
            </div>
          ) : (
            <div className="mini" style={{ color: 'var(--ok)' }}>✓ Todos jugaron al menos un tiempo</div>
          )}
        </div>
        {banco.length === 0 && <p className="mini">Sin jugadores en el banco.</p>}
        <div className="banco-lista">{banco.map((j) => chipJugador(j))}</div>
      </div>

      <div className="tarjeta">
        <div className="mini" style={{ marginBottom: 6 }}>
          🤝 Prestados al rival este tiempo ({prestados.length}) — les cuenta como tiempo jugado
        </div>
        {prestados.length === 0 && <p className="mini">Nadie prestado. Elegí un jugador y tocá "Prestar al rival".</p>}
        <div className="banco-lista">{prestados.map((j) => chipJugador(j))}</div>
      </div>

      <p className="mini">
        Tocá un jugador (del banco o de un puesto) y después el lugar de destino.
        Si el destino está ocupado, intercambian; desde el banco, el que estaba sale.
      </p>

      <BalancePartido bloque={bloque} onActualizado={onActualizado} />
    </>
  )
}
