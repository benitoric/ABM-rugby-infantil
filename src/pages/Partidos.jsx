import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import {
  abrevAptitudes, abrevPuestos, APTITUDES, DIFICULTADES, etiquetaDificultad, etiquetaMotivo,
  etiquetaPartido, etiquetaPuestos, fechaCorta, FORMACION, nombreCompleto, nombreStaff,
  puedeJugarDe, puestoFormacion, tipoJugador,
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
  // confirmacion: lo que avisaron en la semana (sección Asistencia).
  // asistencia: el control efectivo del día, tomado en la cancha.
  const [confirmacion, setConfirmacion] = useState({})
  const [asistencia, setAsistencia] = useState({})
  // condicion: golpeado/lesionado durante el partido (queda fuera de juego)
  const [condicion, setCondicion] = useState({})
  const [asignacion, setAsignacion] = useState({})
  const [staff, setStaff] = useState([])
  const [confirmacionStaff, setConfirmacionStaff] = useState({})
  const [asignacionStaff, setAsignacionStaff] = useState({})
  const [presenciaStaff, setPresenciaStaff] = useState({})
  const [tiempos, setTiempos] = useState([])
  const [enCancha, setEnCancha] = useState({})
  const [vista, setVista] = useState('bloques')
  const [tiempoSel, setTiempoSel] = useState({})
  const [editandoBloque, setEditandoBloque] = useState(null)
  const [sugerencia, setSugerencia] = useState(null)
  const [califs, setCalifs] = useState(null)
  const [publicando, setPublicando] = useState(false)
  const [listo, setListo] = useState(false)
  const [sugerencias, recargarSugerencias] = useSugerencias()

  useEffect(() => {
    async function cargar() {
      const [datos, js, conf, sf, confSf, asisDia] = await Promise.all([
        api(`partido/${partido.id}`),
        api('jugadores'),
        api(`eventos/${partido.id}/asistencias`),
        api('staff'),
        api(`eventos/${partido.id}/asistencias-staff`),
        api(`eventos/${partido.id}/asistencias-partido`),
      ])
      setBloques(datos.bloques)
      setTiempos(datos.tiempos)
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      setStaff(sf.filter((s) => s.activo))

      const mConf = {}
      for (const a of conf) mConf[a.jugador_id] = a.estado
      setConfirmacion(mConf)

      const mAsis = {}
      const mCond = {}
      for (const a of asisDia) {
        mAsis[a.jugador_id] = a.estado
        if (a.condicion) mCond[a.jugador_id] = a.condicion
      }
      setAsistencia(mAsis)
      setCondicion(mCond)

      const mConfSf = {}
      for (const a of confSf) mConfSf[a.staff_email] = a.estado
      setConfirmacionStaff(mConfSf)

      const mAsig = {}
      for (const f of datos.asignaciones) mAsig[f.jugador_id] = f.bloque_id
      setAsignacion(mAsig)

      const mAsigSf = {}
      const mPresSf = {}
      for (const f of datos.staff || []) {
        mAsigSf[f.staff_email] = f.bloque_id
        if (f.presente !== null) mPresSf[f.staff_email] = f.presente
      }
      setAsignacionStaff(mAsigSf)
      setPresenciaStaff(mPresSf)

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

  // Control de asistencia del día del partido (asistencias_partido), tomado
  // en la cancha por el staff de cada bloque. Al marcar a alguien que no
  // vino, sale de los tiempos ya cargados para que los equipos queden solo
  // con los que efectivamente están.
  async function marcarAsistencia(jugadorId, estado) {
    const nuevo = asistencia[jugadorId] === estado ? null : estado
    setAsistencia((m) => ({ ...m, [jugadorId]: nuevo }))
    if (nuevo !== 'presente') {
      setEnCancha((m) => {
        const copia = { ...m }
        for (const t of tiempos) {
          if (copia[t.id]?.[jugadorId]) {
            copia[t.id] = { ...copia[t.id] }
            delete copia[t.id][jugadorId]
          }
        }
        return copia
      })
      for (const t of tiempos) {
        if (enCancha[t.id]?.[jugadorId]) {
          await api('partido/cancha', {
            method: 'POST',
            body: { tiempo_id: t.id, jugador_id: jugadorId, dentro: false },
          })
        }
      }
    }
    await api(`eventos/${partido.id}/asistencias-partido`, {
      method: 'PUT',
      body: { marcas: [{ jugador_id: jugadorId, estado: nuevo }] },
    })
  }

  // Golpe o lesión en pleno partido: el jugador queda fuera de juego y no se
  // lo considera más para los equipos. Sale de los tiempos posteriores al que
  // se está viendo; lo que ya jugó queda registrado. Al desmarcarlo vuelve a
  // estar disponible.
  async function marcarCondicion(jugadorId, nuevaCondicion, desdeNumero) {
    const actual = condicion[jugadorId] || null
    const nuevo = actual === nuevaCondicion ? null : nuevaCondicion
    setCondicion((m) => {
      const copia = { ...m }
      if (nuevo) copia[jugadorId] = nuevo
      else delete copia[jugadorId]
      return copia
    })
    if (nuevo) {
      const posteriores = tiempos.filter((t) => t.numero > desdeNumero)
      setEnCancha((m) => {
        const copia = { ...m }
        for (const t of posteriores) {
          if (copia[t.id]?.[jugadorId]) {
            copia[t.id] = { ...copia[t.id] }
            delete copia[t.id][jugadorId]
          }
        }
        return copia
      })
      for (const t of posteriores) {
        if (enCancha[t.id]?.[jugadorId]) {
          await api('partido/cancha', {
            method: 'POST',
            body: { tiempo_id: t.id, jugador_id: jugadorId, dentro: false },
          })
        }
      }
    }
    await api(`eventos/${partido.id}/asistencias-partido`, {
      method: 'PUT',
      body: { marcas: [{ jugador_id: jugadorId, estado: 'presente', condicion: nuevo }] },
    })
  }

  async function marcarPresenciaStaff(email, presente) {
    const nuevo = presenciaStaff[email] === presente ? null : presente
    setPresenciaStaff((m) => {
      const copia = { ...m }
      if (nuevo === null) delete copia[email]
      else copia[email] = nuevo
      return copia
    })
    await api('partido/staff-presente', {
      method: 'POST',
      body: { evento_id: partido.id, staff_email: email, presente: nuevo },
    })
  }

  async function asignarStaff(email, bloqueId) {
    const nuevo = asignacionStaff[email] === bloqueId ? null : bloqueId
    setAsignacionStaff((m) => ({ ...m, [email]: nuevo }))
    await api('partido/asignar-staff', {
      method: 'POST',
      body: { evento_id: partido.id, staff_email: email, bloque_id: nuevo },
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

  // Pide al servidor una propuesta de reparto entre bloques. Los bloques se
  // arman en la semana con los que confirmaron que van (sección Asistencia).
  async function sugerirBloques() {
    const confirmados = jugadores.filter((j) => confirmacion[j.id] === 'presente')
    const elegibles = confirmados.filter((j) => j.estado !== 'lesionado')
    if (elegibles.length < 2) {
      alert('Todavía no hay jugadores confirmados para repartir. Marcalos en la sección Asistencia.')
      return
    }
    const r = await api('partido/sugerir-bloques', {
      method: 'POST',
      body: { evento_id: partido.id, jugador_ids: elegibles.map((j) => j.id) },
    })
    setCalifs(r.califs)
    setSugerencia(r)
  }

  async function aplicarSugerencia() {
    const propuesta = sugerencia.asignacion
    const cambios = Object.keys({ ...asignacion, ...propuesta })
      .filter((jid) => (asignacion[jid] || null) !== (propuesta[jid] || null))
      .map((jid) => [jid, propuesta[jid] || null])
    setSugerencia(null)
    setAsignacion((m) => {
      const copia = { ...m }
      for (const [jid, bid] of cambios) copia[jid] = bid
      return copia
    })
    // el que cambia de bloque sale de los tiempos que tuviera cargados
    setEnCancha((m) => {
      const copia = { ...m }
      for (const [jid] of cambios) {
        for (const t of tiempos) {
          if (copia[t.id]?.[jid]) {
            copia[t.id] = { ...copia[t.id] }
            delete copia[t.id][jid]
          }
        }
      }
      return copia
    })
    for (const [jid, bid] of cambios) {
      await api('partido/asignar', {
        method: 'POST',
        body: { evento_id: partido.id, jugador_id: jid, bloque_id: bid },
      })
    }
  }

  // Reemplaza el equipo completo de un tiempo (para aplicar una sugerencia)
  async function reemplazarTiempo(tiempoId, equipo) {
    setEnCancha((m) => ({
      ...m,
      [tiempoId]: Object.fromEntries(equipo.map((e) => [
        e.jugador_id, { puesto: e.prestado ? null : (e.puesto ?? null), prestado: !!e.prestado },
      ])),
    }))
    await api('partido/tiempo-equipo', { method: 'POST', body: { tiempo_id: tiempoId, equipo } })
  }

  // Borra de una vez todas las marcas del control del día (jugadores y
  // staff), incluidas las condiciones de golpeado/lesionado. Los equipos
  // cargados en los tiempos no se tocan.
  async function limpiarAsistencia() {
    const marcados = Object.keys(asistencia).filter((jid) => asistencia[jid])
    const staffMarcado = Object.keys(presenciaStaff)
    if (!marcados.length && !staffMarcado.length) return
    if (!confirm('¿Borrar todas las marcas de asistencia del día (jugadores y staff)?')) return
    setAsistencia({})
    setCondicion({})
    setPresenciaStaff({})
    if (marcados.length) {
      await api(`eventos/${partido.id}/asistencias-partido`, {
        method: 'PUT',
        body: { marcas: marcados.map((jid) => ({ jugador_id: jid, estado: null })) },
      })
    }
    for (const email of staffMarcado) {
      await api('partido/staff-presente', {
        method: 'POST',
        body: { evento_id: partido.id, staff_email: email, presente: null },
      })
    }
  }

  // Borra de una vez el armado completo de los bloques (y sus tiempos)
  async function limpiarBloques() {
    const asignados = Object.values(asignacion).filter(Boolean).length
    if (!asignados) return
    if (!confirm(`¿Sacar a los ${asignados} jugadores de los bloques? También se vacían los tiempos cargados.`)) return
    setAsignacion({})
    setEnCancha({})
    setSugerencia(null)
    await api('partido/limpiar-bloques', { method: 'POST', body: { evento_id: partido.id } })
  }

  async function agregarTiempo(bloqueId) {
    const delBloque = tiempos.filter((t) => t.bloque_id === bloqueId)
    if (delBloque.length >= MAX_TIEMPOS) return
    const nuevo = await api('partido/tiempo', { method: 'POST', body: { bloque_id: bloqueId } })
    setTiempos((ts) => [...ts, nuevo].sort((a, b) => a.numero - b.numero))
  }

  const ordenados = useMemo(() => {
    const prioridad = (j) => (confirmacion[j.id] === 'presente' ? 0 : 1)
    return [...jugadores].sort((x, y) =>
      prioridad(x) - prioridad(y) ||
      x.apellido.localeCompare(y.apellido) ||
      x.nombre.localeCompare(y.nombre))
  }, [jugadores, confirmacion])

  if (!listo) return <div className="vacio">Preparando bloques…</div>

  // En la solapa de cada bloque: presentes sobre convocados una vez tomada
  // la asistencia (antes, solo la cantidad de convocados)
  const conteoBloque = (bloqueId) => {
    const del = jugadores.filter((j) => asignacion[j.id] === bloqueId)
    const presentes = del.filter((j) => asistencia[j.id] === 'presente').length
    return presentes ? `${presentes}/${del.length}` : del.length
  }

  return (
    <>
      {/* Las solapas siguen la secuencia del proceso: armar bloques en la
          semana, tomar asistencia en la cancha, armar los equipos, imprimir */}
      <div className="seg no-imprimir">
        <button className={vista === 'bloques' ? 'activo' : ''} onClick={() => setVista('bloques')}>
          Armar bloques
        </button>
        <button className={vista === 'presentes' ? 'activo' : ''} onClick={() => setVista('presentes')}>
          ✅ Tomar asistencia ({jugadores.filter((j) => asistencia[j.id] === 'presente').length})
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

      {vista === 'presentes' && (
        <ControlAsistencia
          bloques={bloques}
          jugadores={ordenados}
          asignacion={asignacion}
          asistencia={asistencia}
          confirmacion={confirmacion}
          condicion={condicion}
          onMarcar={marcarAsistencia}
          staff={staff}
          asignacionStaff={asignacionStaff}
          confirmacionStaff={confirmacionStaff}
          presenciaStaff={presenciaStaff}
          onMarcarStaff={marcarPresenciaStaff}
          onLimpiar={limpiarAsistencia}
        />
      )}

      {vista === 'planilla' && (
        <Planilla
          partido={partido}
          bloques={bloques}
          jugadores={ordenados}
          asignacion={asignacion}
          asistencia={asistencia}
          confirmacion={confirmacion}
          tiempos={tiempos}
          enCancha={enCancha}
          staff={staff}
          asignacionStaff={asignacionStaff}
        />
      )}

      {vista === 'bloques' && (
        <>
          <div className="fila entre">
            <p className="mini crece" style={{ margin: 0 }}>
              Asigná cada jugador a un bloque. Aparecen los que confirmaron que
              van (sección Asistencia). Tocá de nuevo el mismo botón para
              sacarlo del bloque.
            </p>
            {!sugerencia && (
              <div className="fila" style={{ gap: 6 }}>
                {/* El reparto automático equilibra dos bloques; con más, el
                    armado se hace a mano */}
                {bloques.length === 2 ? (
                  <button className="btn chico" onClick={sugerirBloques}>✨ Sugerir armado</button>
                ) : (
                  <span className="mini">Armado automático: solo con 2 bloques.</span>
                )}
                <button className="btn sec chico" onClick={limpiarBloques}>🧹 Limpiar</button>
                <button className="btn sec chico" onClick={() => setPublicando(true)}>📣 Publicar</button>
              </div>
            )}
          </div>

          {publicando && (
            <Publicacion
              partido={partido}
              bloques={bloques}
              jugadores={jugadores}
              asignacion={asignacion}
              staff={staff}
              asignacionStaff={asignacionStaff}
              onCerrar={() => setPublicando(false)}
            />
          )}

          {sugerencia && (
            <div className="tarjeta" style={{ borderLeft: '4px solid var(--primario)' }}>
              <div className="fila entre">
                <b>Propuesta de armado</b>
                <div className="fila" style={{ gap: 6 }}>
                  <button className="btn chico" onClick={aplicarSugerencia}>Aplicar</button>
                  <button className="btn sec chico" onClick={() => setSugerencia(null)}>Descartar</button>
                </div>
              </div>
              <p className="mini" style={{ margin: '6px 0 0' }}>
                Balancea fuerza (última evaluación), forwards/backs y aptitudes.
                {sugerencia.sesgo !== 0 && ` Por la dificultad de los rivales, el Bloque ${sugerencia.sesgo > 0 ? bloques[1].numero : bloques[0].numero} queda ~${Math.abs(sugerencia.sesgo).toFixed(1)} pts más fuerte.`}
                {' '}Podés retocarla con los botones de cada bloque antes de aplicar.
              </p>
              {sugerencia.sin_evaluacion.length > 0 && (
                <p className="mini" style={{ margin: '6px 0 0', color: 'var(--warn)' }}>
                  Sin evaluación (se les asume la mediana del grupo):{' '}
                  {sugerencia.sin_evaluacion
                    .map((id) => jugadores.find((j) => j.id === id)?.apellido)
                    .filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          )}

          {califs && (
            <BalanceBloques
              bloques={bloques}
              jugadores={jugadores}
              asignacion={sugerencia ? sugerencia.asignacion : asignacion}
              califs={califs}
            />
          )}

          {!ordenados.some((j) => confirmacion[j.id] === 'presente' || asignacion[j.id]) && (
            <div className="vacio">
              Nadie confirmó asistencia todavía. Marcá a los que avisaron que
              van en la sección Asistencia y volvé para armar los bloques.
            </div>
          )}

          {/* Solo los que confirmaron en la sección Asistencia (más los que ya
              estén asignados a un bloque, para no ocultar un armado hecho) */}
          {ordenados
            .filter((j) => confirmacion[j.id] === 'presente' || asignacion[j.id])
            .map((j) => {
            const confirmado = confirmacion[j.id] === 'presente'
            const asignado = sugerencia
              ? sugerencia.asignacion[j.id] || null
              : asignacion[j.id] || null
            return (
              <div key={j.id} className="jugador-item" style={{ cursor: 'default', opacity: confirmado ? 1 : 0.6 }}>
                <div className="crece">
                  <div style={{ fontWeight: 600 }}>
                    {nombreCompleto(j)}
                    {etiquetaPuestos(j) && <span className="mini"> · {etiquetaPuestos(j)}</span>}
                  </div>
                  <div className="mini">
                    {confirmado ? 'Confirmó que va' : (confirmacion[j.id] === 'ausente' ? '⚠️ Avisó que no va' : '⚠️ Sin confirmar')}
                    {j.estado === 'lesionado' ? ' · 🤕 lesionado' : ''}
                    {abrevAptitudes(j) ? ` · ${abrevAptitudes(j)}` : ''}
                    {califs?.[j.id] !== undefined && ` · ★${califs[j.id].toFixed(1)}`}
                  </div>
                </div>
                <div className="bloque-botones">
                  {bloques.map((b) => (
                    <button
                      key={b.id}
                      className={`bloque-btn ${asignado === b.id ? 'sel' : ''} ${sugerencia && asignado === b.id && (asignacion[j.id] || null) !== b.id ? 'prop' : ''}`}
                      onClick={() => {
                        if (!sugerencia) return asignar(j.id, b.id)
                        // con la propuesta abierta, los botones editan la propuesta
                        setSugerencia((s) => ({
                          ...s,
                          asignacion: { ...s.asignacion, [j.id]: s.asignacion[j.id] === b.id ? null : b.id },
                        }))
                      }}
                    >
                      B{b.numero}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          <h3 style={{ marginTop: 16 }}>Staff a cargo</h3>
          <p className="mini">
            Los bloques suelen jugarse en canchas y horarios distintos: repartí
            también al cuerpo técnico. Aparecen los que confirmaron asistencia
            al partido en la sección Asistencia.
          </p>
          {(() => {
            const confirmados = staff.filter((s) => confirmacionStaff[s.email] === 'presente')
            const sinConfirmar = staff.length - confirmados.length
            return (
              <>
                {!confirmados.length && (
                  <div className="vacio">
                    Ningún miembro del staff confirmó asistencia todavía.
                    Marcalos en la sección Asistencia.
                  </div>
                )}
                {confirmados.map((s) => (
                  <div key={s.email} className="jugador-item" style={{ cursor: 'default' }}>
                    <div className="crece">
                      <div style={{ fontWeight: 600 }}>{nombreStaff(s)}</div>
                      <div className="mini">{s.rol || 'Sin rol'}</div>
                    </div>
                    <div className="bloque-botones">
                      {bloques.map((b) => (
                        <button
                          key={b.id}
                          className={`bloque-btn ${asignacionStaff[s.email] === b.id ? 'sel' : ''}`}
                          onClick={() => asignarStaff(s.email, b.id)}
                        >
                          B{b.numero}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {sinConfirmar > 0 && (
                  <p className="mini">
                    Sin confirmar: {staff.filter((s) => confirmacionStaff[s.email] !== 'presente').map(nombreStaff).join(' · ')}
                  </p>
                )}
              </>
            )
          })()}
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

      {bloques.map((b) => {
        if (vista !== b.id) return null
        // Los equipos se arman con los que efectivamente llegaron. Si todavía
        // no se tomó asistencia (nadie marcado presente), se trabaja con el
        // plantel completo y se avisa, igual que hace el servidor.
        const delBloque = ordenados.filter((j) => asignacion[j.id] === b.id)
        const presentes = delBloque.filter((j) => asistencia[j.id] === 'presente')
        const sinTomar = presentes.length === 0
        return (
        <VistaBloque
          key={b.id}
          bloque={b}
          onEditar={() => setEditandoBloque({ ...b })}
          onActualizado={(nuevo) => setBloques((bs) => bs.map((x) => (x.id === nuevo.id ? nuevo : x)))}
          jugadores={sinTomar ? delBloque : presentes}
          ausentes={sinTomar ? [] : delBloque.filter((j) => asistencia[j.id] !== 'presente')}
          confirmacion={confirmacion}
          condicion={condicion}
          onCondicion={marcarCondicion}
          asistenciaSinTomar={sinTomar && delBloque.length > 0}
          staff={staff.filter((s) => asignacionStaff[s.email] === b.id && presenciaStaff[s.email] !== false)}
          onIrAPresentes={() => setVista('presentes')}
          tiempos={tiempos.filter((t) => t.bloque_id === b.id)}
          tiempoSel={tiempoSel[b.id]}
          onSelTiempo={(tid) => setTiempoSel((m) => ({ ...m, [b.id]: tid }))}
          enCancha={enCancha}
          onMover={moverEnCancha}
          onReemplazar={reemplazarTiempo}
          onAgregarTiempo={() => agregarTiempo(b.id)}
        />
        )
      })}
    </>
  )
}

// Control de asistencia del día de partido. Los bloques se arman la víspera
// con los que avisaron que venían, así que lo primero al llegar a la cancha
// es confirmar quién está: los equipos de cada tiempo salen de acá.
// Control de asistencia del día del partido: el staff de cada bloque marca
// quién de los convocados se presentó a jugar. La confirmación anticipada se
// toma en la sección Asistencia durante la semana; acá solo se compara.
function ControlAsistencia({
  bloques, jugadores, asignacion, asistencia, confirmacion, condicion = {}, onMarcar,
  staff, asignacionStaff, confirmacionStaff, presenciaStaff, onMarcarStaff, onLimpiar,
}) {
  // Los convocados: asignados a un bloque, más los confirmados sin bloque
  const convocados = jugadores.filter((j) =>
    asignacion[j.id] || confirmacion[j.id] === 'presente')
  const presentes = convocados.filter((j) => asistencia[j.id] === 'presente')
  const marcados = convocados.filter((j) => asistencia[j.id]).length
  // El rastro: confirmaron en la semana y el día del partido no aparecieron
  const faltaronTrasConfirmar = convocados.filter((j) =>
    confirmacion[j.id] === 'presente' && asistencia[j.id] === 'ausente')

  const fila = (clave, nombre, detalle, estado, marcar, alerta) => (
    <div
      key={clave}
      className="jugador-item"
      style={{
        cursor: 'default',
        opacity: estado ? 1 : 0.65,
        borderLeft: alerta ? '4px solid var(--warn)' : undefined,
      }}
    >
      <div className="crece">
        <div style={{ fontWeight: 600 }}>{alerta ? '⚠️ ' : ''}{nombre}</div>
        <div className="mini">{detalle}</div>
      </div>
      <div className="bloque-botones">
        <button
          className={`bloque-btn ${estado === 'presente' ? 'sel ok' : ''}`}
          onClick={() => marcar('presente')}
        >
          Vino
        </button>
        <button
          className={`bloque-btn ${estado === 'ausente' ? 'sel no' : ''}`}
          onClick={() => marcar('ausente')}
        >
          Faltó
        </button>
      </div>
    </div>
  )

  const etiquetaConfirmacion = (jid) => {
    if (confirmacion[jid] === 'presente') return 'confirmó que venía'
    if (confirmacion[jid] === 'ausente') return 'había avisado que no venía'
    return 'sin confirmación previa'
  }

  const grupo = (titulo, subtitulo, lista) => (
    <div key={titulo}>
      <h3 style={{ marginTop: 16 }}>{titulo}</h3>
      {subtitulo && <p className="mini">{subtitulo}</p>}
      {!lista.length && <p className="mini">Sin jugadores convocados.</p>}
      {lista.map((j) => fila(
        j.id,
        nombreCompleto(j),
        [
          etiquetaPuestos(j) || null,
          condicion[j.id] === 'golpeado' ? '🤕 golpeado en el partido' : null,
          condicion[j.id] === 'lesionado' ? '🚑 lesionado en el partido' : null,
          etiquetaConfirmacion(j.id),
          j.estado === 'lesionado' ? '🤕 lesionado' : null,
        ].filter(Boolean).join(' · '),
        asistencia[j.id],
        (estado) => onMarcar(j.id, estado),
        confirmacion[j.id] === 'presente' && asistencia[j.id] === 'ausente',
      ))}
    </div>
  )

  return (
    <>
      <div className="tarjeta fila entre">
        <div>
          <div className="mini">Presentes en la cancha</div>
          <div className="contador">{presentes.length} de {convocados.length}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mini" style={{ color: marcados < convocados.length ? 'var(--warn)' : 'var(--ok)' }}>
            {marcados < convocados.length
              ? `Faltan marcar ${convocados.length - marcados}`
              : '✓ Todos marcados'}
          </div>
          <button className="btn sec chico" style={{ marginTop: 6 }} onClick={onLimpiar}>
            🧹 Limpiar
          </button>
        </div>
      </div>

      <p className="mini">
        El día del partido: cada staff marca quién de su bloque se presentó a
        jugar. Los equipos de cada tiempo se arman solo con los presentes; si
        marcás a alguien como ausente, sale de los tiempos que ya tuviera
        cargados. La confirmación previa se toma en la sección Asistencia.
      </p>

      {faltaronTrasConfirmar.length > 0 && (
        <p className="aviso">
          ⚠️ Confirmaron que venían y no aparecieron ({faltaronTrasConfirmar.length}):{' '}
          {faltaronTrasConfirmar.map((j) => nombreCompleto(j)).join(' · ')}
        </p>
      )}

      {bloques.map((b) => grupo(
        `${b.nombre || `Bloque ${b.numero}`}${b.rival ? ` vs ${b.rival}` : ''}`,
        b.hora_convocatoria ? `Convocatoria ${b.hora_convocatoria.slice(0, 5)} hs${b.lugar ? ` · ${b.lugar}` : ''}` : b.lugar,
        convocados.filter((j) => asignacion[j.id] === b.id),
      ))}

      {convocados.some((j) => !asignacion[j.id]) && grupo(
        'Confirmados sin bloque',
        'Confirmaron que venían pero no fueron asignados a ningún bloque.',
        convocados.filter((j) => !asignacion[j.id]),
      )}

      <h3 style={{ marginTop: 16 }}>Staff</h3>
      {(() => {
        const staffConvocado = staff.filter((s) =>
          asignacionStaff[s.email] || confirmacionStaff[s.email] === 'presente')
        if (!staffConvocado.length) {
          return <p className="mini">Nadie del staff confirmado ni asignado a un bloque.</p>
        }
        return staffConvocado.map((s) => {
          const bl = bloques.find((b) => b.id === asignacionStaff[s.email])
          const estado = presenciaStaff[s.email] === true ? 'presente'
            : presenciaStaff[s.email] === false ? 'ausente' : null
          return fila(
            s.email,
            nombreStaff(s),
            [s.rol || 'Sin rol', bl ? `B${bl.numero}` : 'sin bloque'].join(' · '),
            estado,
            (e) => onMarcarStaff(s.email, e === 'presente'),
            confirmacionStaff[s.email] === 'presente' && presenciaStaff[s.email] === false,
          )
        })
      })()}
    </>
  )
}

// ---------- publicación para el grupo de padres ----------
// Dibuja UNA placa con todos los bloques del partido, en un canvas, y la
// devuelve como PNG. Angosta y a una columna, pensada para leerse en el
// celular (WhatsApp), con los colores institucionales del club.
function dibujarPlaca({ fecha, secciones }) {
  // WhatsApp reduce las imágenes a ~1600 px en el lado mayor, así que la
  // clave para que el texto se lea es que la placa sea BAJA: los bloques van
  // lado a lado (uno por columna) y el texto ocupa una fracción grande del
  // alto. Se dibuja al doble de resolución para el zoom.
  const W = 1080
  const M = 40
  const SEP = 28
  const AZUL = '#123a80'
  const AZUL_CLARO = '#1a4a9e'
  const DORADO = '#ffd200'
  const FILA = 52
  const ESCALA = 2

  const columnas = Math.min(secciones.length, 2)
  const anchoCol = (W - 2 * M - (columnas - 1) * SEP) / columnas

  // Alto de una sección: banda 70 + datos 104 + título 80 + jugadores +
  // (título 80 + staff)
  const altoSeccion = (s) =>
    70 + 104 + 80 + s.jugadores.length * FILA +
    (s.staff.length ? 80 + s.staff.length * FILA : 0)
  // Filas de a 2 columnas
  const filasSecciones = []
  for (let i = 0; i < secciones.length; i += columnas) {
    filasSecciones.push(secciones.slice(i, i + columnas))
  }
  let H = 262
  for (const fila of filasSecciones) {
    H += Math.max(...fila.map(altoSeccion)) + 36
  }
  H += 30

  const c = document.createElement('canvas')
  c.width = W * ESCALA
  c.height = H * ESCALA
  const ctx = c.getContext('2d')
  ctx.scale(ESCALA, ESCALA)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // texto que se achica solo si no entra en el ancho disponible
  const texto = (t, x, y, maxAncho, tamanio, negrita = false, color = '#1c2028') => {
    let tam = tamanio
    ctx.fillStyle = color
    do {
      ctx.font = `${negrita ? 'bold ' : ''}${tam}px system-ui, sans-serif`
      if (ctx.measureText(t).width <= maxAncho) break
      tam -= 1
    } while (tam > 16)
    ctx.fillText(t, x, y)
  }

  // franja superior azul con el encabezado institucional
  const franja = ctx.createLinearGradient(0, 0, 0, 224)
  franja.addColorStop(0, AZUL_CLARO)
  franja.addColorStop(1, AZUL)
  ctx.fillStyle = franja
  ctx.fillRect(0, 0, W, 224)
  ctx.fillStyle = DORADO
  ctx.fillRect(0, 224, W, 8)

  ctx.textAlign = 'center'
  texto('🏉 Tucumán Lawn Tennis Club', W / 2, 84, W - 2 * M, 46, true, '#ffffff')
  texto('División M12 (clase 2014)', W / 2, 144, W - 2 * M, 36, true, DORADO)
  const f = new Date(fecha + 'T00:00:00')
  const dia = f.toLocaleDateString('es-AR', { weekday: 'long' })
  texto(`${dia[0].toUpperCase()}${dia.slice(1)} ${fechaCorta(fecha)}`, W / 2, 196, W - 2 * M, 32, false, '#dbe4ff')

  // una sección (bloque) dibujada dentro de su columna
  const seccion = (s, x, y) => {
    ctx.fillStyle = AZUL
    ctx.fillRect(x, y, anchoCol, 70)
    ctx.textAlign = 'center'
    texto(
      `Bloque ${s.bloque.numero}${s.bloque.rival ? ` vs ${s.bloque.rival}` : ''}`,
      x + anchoCol / 2, y + 48, anchoCol - 30, 34, true, '#ffffff')
    y += 70
    texto(`📍 ${s.bloque.lugar || 'Lugar a confirmar'}`, x + anchoCol / 2, y + 42, anchoCol - 16, 28)
    texto(
      s.bloque.hora_convocatoria
        ? `⏰ Convocatoria: ${s.bloque.hora_convocatoria.slice(0, 5)} hs`
        : '⏰ Horario a confirmar',
      x + anchoCol / 2, y + 86, anchoCol - 16, 28)
    y += 104

    const lista = (titulo, nombres) => {
      ctx.textAlign = 'left'
      texto(titulo, x, y + 36, anchoCol, 30, true, AZUL)
      ctx.fillStyle = DORADO
      ctx.fillRect(x, y + 50, anchoCol, 5)
      y += 80
      nombres.forEach((nombre, i) => {
        if (i % 2 === 0) {
          ctx.fillStyle = '#f4f6fa'
          ctx.fillRect(x, y - 4, anchoCol, FILA - 4)
        }
        texto(nombre, x + 12, y + 32, anchoCol - 24, 29)
        y += FILA
      })
    }

    lista(`Jugadores (${s.jugadores.length})`,
      s.jugadores.map((j, i) => `${i + 1}. ${j.apellido.toUpperCase()}, ${j.nombre}`))
    if (s.staff.length) {
      lista('Staff a cargo', s.staff.map((st) => {
        const ap = (st.apellido || '').toUpperCase()
        return ap ? `${ap}, ${st.nombre}` : st.nombre || st.email
      }))
    }
  }

  let y = 262
  for (const fila of filasSecciones) {
    fila.forEach((s, i) => seccion(s, M + i * (anchoCol + SEP), y))
    y += Math.max(...fila.map(altoSeccion)) + 36
  }

  // pie dorado
  ctx.fillStyle = DORADO
  ctx.fillRect(0, H - 12, W, 12)

  return c.toDataURL('image/png')
}

function Publicacion({ partido, bloques, jugadores, asignacion, staff, asignacionStaff, onCerrar }) {
  const placa = useMemo(() => {
    const secciones = bloques
      .filter((b) => !b.suspendido)
      .map((b) => ({
        bloque: b,
        jugadores: jugadores
          .filter((j) => asignacion[j.id] === b.id)
          .sort((x, y) => nombreCompleto(x).localeCompare(nombreCompleto(y), 'es')),
        staff: staff
          .filter((s) => asignacionStaff[s.email] === b.id)
          .sort((x, y) => nombreStaff(x).localeCompare(nombreStaff(y), 'es')),
      }))
      .filter((s) => s.jugadores.length)
    if (!secciones.length) return null
    return {
      url: dibujarPlaca({ fecha: partido.fecha, secciones }),
      nombre: `bloques-${partido.fecha}.png`,
      sinStaff: secciones.filter((s) => !s.staff.length).map((s) => s.bloque.numero),
    }
  }, [bloques, jugadores, asignacion, staff, asignacionStaff, partido.fecha])

  async function compartir() {
    const blob = await (await fetch(placa.url)).blob()
    const archivo = new File([blob], placa.nombre, { type: 'image/png' })
    if (navigator.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo] })
        return
      } catch { /* cancelado por el usuario o sin permiso: cae a descarga */ }
    }
    const a = document.createElement('a')
    a.href = placa.url
    a.download = placa.nombre
    a.click()
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 10 }}>
          <h3>📣 Publicar para el grupo de padres</h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        {!placa && (
          <div className="vacio">
            Ningún bloque tiene jugadores asignados todavía. Armá los bloques y
            volvé a publicar.
          </div>
        )}
        {placa && (
          <>
            <img
              src={placa.url}
              alt="Placa del día de partido"
              style={{ width: '100%', borderRadius: 10, border: '1px solid var(--borde)' }}
            />
            {placa.sinStaff.length > 0 && (
              <p className="mini" style={{ color: 'var(--warn)', margin: '4px 0 0' }}>
                ⚠️ Sin staff asignado en {placa.sinStaff.map((n) => `B${n}`).join(' y ')}:
                la placa sale sin esa sección.
              </p>
            )}
            <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={compartir}>
              📤 Compartir
            </button>
          </>
        )}
        <p className="mini" style={{ marginTop: 8 }}>
          En el celular, "Compartir" abre directo WhatsApp; en la computadora
          descarga la imagen para mandarla a mano.
        </p>
      </div>
    </div>
  )
}

// Comparación en vivo del balance de los dos bloques según una asignación
// (la vigente o la propuesta): fuerza media, puestos y aptitudes.
function BalanceBloques({ bloques, jugadores, asignacion, califs }) {
  const stats = bloques.map((bl) => {
    const del = jugadores.filter((j) => asignacion[j.id] === bl.id)
    const conNota = del.filter((j) => califs[j.id] !== undefined)
    const fuerza = conNota.length
      ? conNota.reduce((s, j) => s + califs[j.id], 0) / conNota.length
      : null
    const c = (t) => del.filter((j) => tipoJugador(j) === t).length
    return {
      bl,
      n: del.length,
      fuerza,
      fw: c('Forward'),
      back: c('Back'),
      mx: c('Mixto'),
      apts: APTITUDES.map((a) => del.filter((j) => (j.aptitudes || []).includes(a.value)).length),
    }
  })
  const fila = (nombre, valor) => (
    <tr>
      <td className="mini">{nombre}</td>
      {stats.map((s) => <td key={s.bl.id} style={{ textAlign: 'center' }}>{valor(s)}</td>)}
    </tr>
  )
  return (
    <div className="tarjeta">
      <table style={{ width: '100%' }}>
        <thead>
          <tr>
            <th></th>
            {stats.map((s) => (
              <th key={s.bl.id} style={{ textAlign: 'center' }}>
                B{s.bl.numero}{s.bl.rival ? ` vs ${s.bl.rival}` : ''}
                {s.bl.dificultad ? ` (${etiquetaDificultad(s.bl.dificultad).toLowerCase()})` : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fila('Jugadores', (s) => <b>{s.n}</b>)}
          {fila('Fuerza media', (s) => (s.fuerza === null ? '—' : <b>★{s.fuerza.toFixed(1)}</b>))}
          {fila('Forwards / Backs', (s) => `${s.fw} / ${s.back}${s.mx ? ` +${s.mx} mixto${s.mx > 1 ? 's' : ''}` : ''}`)}
          {fila('Cond / Pen / Def', (s) => s.apts.join(' / '))}
        </tbody>
      </table>
    </div>
  )
}

function Planilla({ partido, bloques, jugadores, asignacion, asistencia = {}, confirmacion = {}, tiempos, enCancha, staff = [], asignacionStaff = {} }) {
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
          const todos = jugadores.filter((j) => asignacion[j.id] === bl.id)
          const presentes = todos.filter((j) => asistencia[j.id] === 'presente')
          // Si no se tomó asistencia, la planilla lista el plantel completo
          const delBloque = presentes.length ? presentes : todos
          const faltaron = presentes.length ? todos.filter((j) => asistencia[j.id] !== 'presente') : []
          const staffBloque = staff.filter((s) => asignacionStaff[s.email] === bl.id)
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
              {staffBloque.length > 0 && (
                <p className="mini">Staff: {staffBloque.map(nombreStaff).join(' · ')}</p>
              )}
              {faltaron.length > 0 && (
                <p className="mini">
                  No vinieron: {faltaron.map((j) =>
                    `${nombreCompleto(j)}${confirmacion[j.id] === 'presente' ? ' (había confirmado)' : ''}`).join(' · ')}
                </p>
              )}
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

function VistaBloque({ bloque, onEditar, onActualizado, jugadores, ausentes = [], confirmacion = {}, condicion = {}, onCondicion, asistenciaSinTomar, staff = [], onIrAPresentes, tiempos, tiempoSel, onSelTiempo, enCancha, onMover, onReemplazar, onAgregarTiempo }) {
  const [sel, setSel] = useState(null)
  const [nPrestar, setNPrestar] = useState(0)
  const [sugiriendo, setSugiriendo] = useState(false)

  // Selección inversa: primero el puesto vacante, después el jugador que entra
  const [puestoSel, setPuestoSel] = useState(null)

  useEffect(() => { setSel(null); setPuestoSel(null) }, [tiempoSel])

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
          {staff.length > 0 && (
            <div className="mini">🧑‍🏫 {staff.map(nombreStaff).join(' · ')}</div>
          )}
        </div>
        <button className="btn sec chico" onClick={onEditar}>Editar datos</button>
      </div>
      {asistenciaSinTomar && (
        <p className="aviso">
          ⚠️ Todavía no tomaste asistencia: se está trabajando con el plantel
          completo del bloque.{' '}
          <button className="btn sec chico" onClick={onIrAPresentes}>Tomar asistencia</button>
        </p>
      )}
      {ausentes.length > 0 && (
        <p className="mini" style={{ color: 'var(--warn)' }}>
          🚫 No vinieron ({ausentes.length}):{' '}
          {ausentes.map((j) => `${j.apellido}${confirmacion[j.id] === 'presente' ? ' (había confirmado)' : ''}`).join(', ')}
        </p>
      )}
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
          {ausentes.length
            ? 'Ningún jugador de este bloque figura como presente. Revisá la asistencia.'
            : 'Este bloque no tiene jugadores. Asignalos en "Armar bloques".'}
        </div>
        <BalancePartido bloque={bloque} onActualizado={onActualizado} />
      </>
    )
  }

  const tiempo = tiempos.find((t) => t.id === tiempoSel) || tiempos[0]
  const mapa = (tiempo && enCancha[tiempo.id]) || {}

  // cuántos tiempos jugó cada jugador en este bloque (prestado también cuenta)
  const jugados = {}
  // y cuántos ANTES del tiempo a la vista: alimenta la barrita de progresión
  // pintada en cada jugador (jugó 1 de 4 tiempos → 25% pintado)
  const jugadosPrevios = {}
  for (const t of tiempos) {
    for (const jid of Object.keys(enCancha[t.id] || {})) {
      jugados[jid] = (jugados[jid] || 0) + 1
      if (t.numero < tiempo?.numero) jugadosPrevios[jid] = (jugadosPrevios[jid] || 0) + 1
    }
  }
  const progreso = (jid) => (jugadosPrevios[jid] || 0) / (tiempos.length || 1)
  // Los que están fuera de juego no cuentan para los avisos de equidad: ya no
  // pueden sumar tiempos hasta que vuelvan
  const disponibles = jugadores.filter((j) => !condicion[j.id])
  const sinJugar = disponibles.filter((j) => !jugados[j.id])

  const ocupante = {}
  for (const j of jugadores) {
    const e = mapa[j.id]
    if (e && !e.prestado && e.puesto) ocupante[e.puesto] = j
  }
  const prestados = jugadores.filter((j) => mapa[j.id]?.prestado)
  const sinPuesto = jugadores.filter((j) => mapa[j.id] && !mapa[j.id].prestado && !mapa[j.id].puesto)
  // Golpeados y lesionados: quedan fuera de juego, aparte del banco
  const fueraDeJuego = jugadores.filter((j) => condicion[j.id])
  const banco = jugadores.filter((j) => !mapa[j.id] && !condicion[j.id])
  const jSel = jugadores.find((j) => j.id === sel) || null
  const enJuego = jugadores.filter((j) => mapa[j.id] && !mapa[j.id].prestado)

  function tocarPuesto(num) {
    const oc = ocupante[num]
    if (!jSel) {
      if (oc) {
        setSel(oc.id)
        setPuestoSel(null)
      } else {
        // puesto vacante: queda elegido y el banco resalta a los que
        // pueden ocuparlo
        setPuestoSel(puestoSel === num ? null : num)
      }
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
    if (puestoSel) {
      // con un puesto vacante elegido, el toque manda al jugador ahí directo
      setPuestoSel(null)
      onMover(tiempo.id, [{ jugador_id: jid, dentro: true, puesto: puestoSel }])
      return
    }
    setSel(sel === jid ? null : jid)
  }

  function accionSel(cambio) {
    const jid = jSel.id
    setSel(null)
    onMover(tiempo.id, [{ jugador_id: jid, ...cambio }])
  }

  function accionCondicion(nueva) {
    const jid = jSel.id
    setSel(null)
    onCondicion(jid, nueva, tiempo.numero)
  }

  // préstamos al rival de hoy, por jugador, en este bloque
  const prestadosHoy = {}
  for (const t of tiempos) {
    for (const [jid, e] of Object.entries(enCancha[t.id] || {})) {
      if (e.prestado) prestadosHoy[jid] = (prestadosHoy[jid] || 0) + 1
    }
  }

  // Pide y aplica la sugerencia SOLO para el tiempo a la vista: lo anterior
  // no se toca y lo siguiente se decide cuando llegue
  async function sugerirEquipos() {
    if (!tiempo || sugiriendo) return
    setSugiriendo(true)
    try {
      const r = await api('partido/sugerir-tiempos', {
        method: 'POST',
        body: { bloque_id: bloque.id, desde_numero: tiempo.numero, prestamos_por_tiempo: nPrestar },
      })
      if (r.tiempos[tiempo.id]) await onReemplazar(tiempo.id, r.tiempos[tiempo.id].equipo)
    } finally {
      setSugiriendo(false)
    }
  }

  // Vacía el equipo del tiempo a la vista
  async function limpiarTiempo() {
    if (!tiempo) return
    if (!confirm(`¿Vaciar el equipo del tiempo T${tiempo.numero}?`)) return
    setSel(null)
    setPuestoSel(null)
    await onReemplazar(tiempo.id, [])
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
        avisos.push(`${oc.apellido} (${etiquetaPuestos(oc) || tipoJugador(oc)}) está de ${f.num} (${f.label}).`)
      }
      if (f.conductor && !(oc.aptitudes || []).includes('conduccion')) {
        avisos.push(`El ${f.num} (${oc.apellido}) no tiene aptitud de conducción.`)
      }
    }
    if (sinPuesto.length) {
      avisos.push(`En cancha sin puesto asignado: ${sinPuesto.map((j) => j.apellido).join(', ')}.`)
    }
    // Quedó marcado fuera de juego pero sigue figurando en este tiempo
    const tocadosEnCancha = enJuego.filter((j) => condicion[j.id])
    for (const j of tocadosEnCancha) {
      avisos.push(`${j.apellido} está ${condicion[j.id]} y todavía figura en cancha en este tiempo.`)
    }
  }
  // Premisas de la jornada completa (equidad de tiempos y rotación de préstamos)
  const tiemposConDatos = tiempos.filter((t) => Object.keys(enCancha[t.id] || {}).length)
  if (tiemposConDatos.length >= 2 && disponibles.length) {
    const promedio = disponibles.reduce((s, j) => s + (jugados[j.id] || 0), 0) / disponibles.length
    const rezagados = disponibles.filter((j) => (jugados[j.id] || 0) <= promedio - 1)
    if (rezagados.length) {
      avisos.push(`${rezagados.map((j) => j.apellido).join(', ')}: van abajo del promedio de tiempos (${promedio.toFixed(1)}).`)
    }
  }
  const masPrestado = jugadores.reduce((mejor, j) =>
    ((prestadosHoy[j.id] || 0) > (prestadosHoy[mejor?.id] || 0) ? j : mejor), null)
  if (masPrestado && prestadosHoy[masPrestado.id] >= 2 &&
      jugadores.some((j) => !prestadosHoy[j.id])) {
    avisos.push(`${masPrestado.apellido} ya fue prestado ${prestadosHoy[masPrestado.id]} veces hoy y otros ninguna.`)
  }

  const chipJugador = (j, extra = '') => {
    const clases = ['chip-jugador']
    if (sel === j.id) clases.push('sel')
    // con un puesto vacante elegido, se destacan los que pueden ocuparlo
    if (puestoSel) clases.push(puedeJugarDe(j, puestoSel) ? 'apto' : 'noapto')
    return (
      <button key={j.id} className={clases.join(' ')} onClick={() => tocarJugador(j.id)}>
        <b>{j.apellido}</b>
        <span className="mini">
          {abrevPuestos(j) ? `${abrevPuestos(j).length > 10 ? tipoJugador(j)[0] : abrevPuestos(j)}` : '·'} · {jugados[j.id] || 0}t
          {abrevAptitudes(j) ? ` · ${abrevAptitudes(j)}` : ''}{extra}
        </span>
        <span className="progreso" style={{ width: `${progreso(j.id) * 100}%` }} />
      </button>
    )
  }

  const celda = (f) => {
    const oc = ocupante[f.num]
    const alerta = oc && (!puedeJugarDe(oc, f.num) || !!condicion[oc.id] ||
      (f.conductor && !(oc.aptitudes || []).includes('conduccion')))
    const clases = ['puesto-celda']
    if (!oc) clases.push('vacia')
    if ((sel && oc?.id === sel) || puestoSel === f.num) clases.push('sel')
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
        {oc && <span className="progreso" style={{ width: `${progreso(oc.id) * 100}%` }} />}
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

      <div className="tarjeta fila entre">
        <label className="mini fila crece" style={{ gap: 6, alignItems: 'center' }}>
          Prestar al rival:
          <select value={nPrestar} onChange={(e) => setNPrestar(Number(e.target.value))} style={{ width: 'auto' }}>
            {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <div className="fila" style={{ gap: 6 }}>
          <button className="btn chico" disabled={sugiriendo} onClick={sugerirEquipos}>
            {sugiriendo ? 'Armando…' : `✨ Sugerir T${tiempo?.numero}`}
          </button>
          <button className="btn sec chico" onClick={limpiarTiempo}>🧹 Limpiar</button>
        </div>
      </div>

      {avisos.length > 0 && (
        <div className="aviso">
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}
      {avisos.length === 0 && enJuego.length === 13 && (
        <p className="mini" style={{ color: 'var(--ok)' }}>✓ Formación completa, sin observaciones.</p>
      )}

      {/* Panel de acciones fijo abajo (con el celular en la mano, al costado
          de la cancha, el pulgar llega ahí y nunca queda cortado) */}
      {jSel && (
        <div className="barra-sel">
          <div className="fila entre" style={{ width: '100%' }}>
            <div className="crece">
              <b>{nombreCompleto(jSel)}</b>
              <div className="mini">Tocá un puesto para ubicarlo, o…</div>
            </div>
            <button className="btn sec chico" onClick={() => setSel(null)}>✕</button>
          </div>
          <div className="barra-sel-acciones">
            {mapa[jSel.id] && (
              <button className="btn sec" onClick={() => accionSel({ dentro: false })}>Al banco</button>
            )}
            {!mapa[jSel.id]?.prestado && (
              <button className="btn sec" onClick={() => accionSel({ dentro: true, prestado: true })}>
                🤝 Prestar
              </button>
            )}
            <button className="btn sec" onClick={() => accionCondicion('golpeado')}>
              {condicion[jSel.id] === 'golpeado' ? '↩ Vuelve' : '🤕 Golpeado'}
            </button>
            <button className="btn sec" onClick={() => accionCondicion('lesionado')}>
              {condicion[jSel.id] === 'lesionado' ? '↩ Vuelve' : '🚑 Lesionado'}
            </button>
          </div>
        </div>
      )}
      {!jSel && puestoSel && (
        <div className="barra-sel">
          <div className="fila entre" style={{ width: '100%' }}>
            <div className="crece">
              <b>{puestoSel} · {puestoFormacion(puestoSel)?.label}</b>
              <div className="mini">Tocá al jugador que entra (resaltados los que juegan ahí).</div>
            </div>
            <button className="btn sec chico" onClick={() => setPuestoSel(null)}>✕</button>
          </div>
        </div>
      )}
      {(jSel || puestoSel) && <div className="barra-sel-espacio" />}

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

      {fueraDeJuego.length > 0 && (
        <div className="tarjeta" style={{ borderLeft: '4px solid var(--bad)' }}>
          <div className="mini" style={{ marginBottom: 6 }}>
            🤕 Fuera de juego ({fueraDeJuego.length}) — no entran en los equipos hasta que vuelvan
          </div>
          {fueraDeJuego.map((j) => (
            <div key={j.id} className="fila entre" style={{ marginTop: 6 }}>
              <div className="crece">
                <b style={{ fontSize: '0.9rem' }}>{nombreCompleto(j)}</b>
                <div className="mini">
                  {condicion[j.id] === 'lesionado' ? '🚑 Lesionado · queda para seguimiento' : '🤕 Golpeado'}
                  {' · '}{jugados[j.id] || 0} {jugados[j.id] === 1 ? 'tiempo' : 'tiempos'}
                </div>
              </div>
              <button
                className="btn sec chico"
                onClick={() => onCondicion(j.id, condicion[j.id], tiempo.numero)}
              >
                ↩ Vuelve a jugar
              </button>
            </div>
          ))}
        </div>
      )}

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
