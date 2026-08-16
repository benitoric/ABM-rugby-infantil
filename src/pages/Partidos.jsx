import { Fragment, useEffect, useMemo, useState } from 'react'
import { api, escrituraEnVuelo, marcaEscrituras } from '../api.js'
import { irA, leerHash, reponer, suscribir } from '../navegacion.js'
import {
  abrevAptitudes, abrevPuestos, APTITUDES, DIFICULTADES, etiquetaDificultad, etiquetaMotivo,
  etiquetaPartido, etiquetaPuestos, fechaCorta, FORMACION, nombreCompleto, nombreStaff,
  puedeJugarDe, puestoFormacion, puestoPrincipal, tipoJugador, PUESTOS,
} from '../helpers.js'
import { promediosResumen, valoresConsolidados } from '../evaluacion.js'
import { CampoSugerido, useSugerencias } from '../sugerencias.jsx'

const MAX_TIEMPOS = 6

// Cada cuánto se refresca solo el estado del partido mientras la vista está
// abierta y visible (además del refresco inmediato al volver a la app)
const INTERVALO_REFRESCO = 15000

// Última posición dentro de la pestaña (partido y vista), para retomarla al
// volver de otra pestaña, cuando el hash ya no la tiene
const CLAVE_PARTIDO = 'rugby_m12_partido'

function guardarPosicion(partidoId, vista) {
  try {
    localStorage.setItem(CLAVE_PARTIDO, [partidoId, vista].filter(Boolean).join('/'))
  } catch { /* modo privado */ }
}

function posicionGuardada() {
  try { return (localStorage.getItem(CLAVE_PARTIDO) || '').split('/') } catch { return [] }
}

export default function Partidos() {
  const [partidos, setPartidos] = useState([])
  const [partidoId, setPartidoId] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const eventos = await api('eventos')
      const ps = eventos.filter((e) => e.tipo === 'partido')
      setPartidos(ps)
      if (ps.length) {
        // El partido a mostrar: el del hash (recarga o link directo), si no
        // el último visitado (vuelta desde otra pestaña), si no el más nuevo
        const [, hashId, hashVista] = leerHash()
        const [guardadoId, guardadaVista] = posicionGuardada()
        const elegido =
          (ps.some((x) => x.id === hashId) && hashId) ||
          (ps.some((x) => x.id === guardadoId) && guardadoId) ||
          ps[0].id
        const vista = elegido === hashId ? hashVista : (elegido === guardadoId ? guardadaVista : null)
        reponer('partidos', elegido, vista)
        setPartidoId(elegido)
      }
      setCargando(false)
    }
    cargar().catch(() => setCargando(false))
  }, [])

  // Botón "atrás" o link directo: el partido sale del hash
  useEffect(() => suscribir(() => {
    const [seccion, id] = leerHash()
    if (seccion !== 'partidos' || !id) return
    if (partidos.some((x) => x.id === id)) setPartidoId(id)
  }), [partidos])

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

  // Partidos ya jugados con bloques todavía abiertos: recordatorio de cierre
  const hoy = new Date().toISOString().slice(0, 10)
  const abiertos = partidos.filter((p) =>
    p.fecha < hoy && !p.suspendido &&
    (p.bloques || []).some((bl) => !bl.suspendido && !bl.cerrado_en))

  return (
    <div className="contenido">
      {abiertos.length > 0 && (
        <div className="tarjeta aviso-lesion no-imprimir">
          <h3>🔓 {abiertos.length === 1 ? 'Hay un partido sin cerrar' : `Hay ${abiertos.length} partidos sin cerrar`}</h3>
          <p className="mini" style={{ margin: '4px 0 8px' }}>
            Cerrá los bloques para congelar la asistencia y los equipos.
          </p>
          {abiertos.map((p) => (
            <button key={p.id} className="asignado-item" onClick={() => irA('partidos', p.id)}>
              <span className="crece">{fechaCorta(p.fecha)} · {etiquetaPartido(p)}</span>
              <span className="mini">
                {(p.bloques || []).filter((bl) => !bl.suspendido && !bl.cerrado_en).map((bl) => `B${bl.numero}`).join(' y ')} →
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="campo no-imprimir">
        <label>Partido</label>
        <select value={partidoId} onChange={(e) => irA('partidos', e.target.value)}>
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
  // tarde: marcado "vino" pasada la convocatoria + 15' (presente sin prioridad)
  const [tarde, setTarde] = useState({})
  // condicion: golpeado/lesionado durante el partido (queda fuera de juego)
  const [condicion, setCondicion] = useState({})
  const [asignacion, setAsignacion] = useState({})
  const [staff, setStaff] = useState([])
  const [confirmacionStaff, setConfirmacionStaff] = useState({})
  const [asignacionStaff, setAsignacionStaff] = useState({})
  const [presenciaStaff, setPresenciaStaff] = useState({})
  const [tiempos, setTiempos] = useState([])
  const [enCancha, setEnCancha] = useState({})
  const [tiempoSel, setTiempoSel] = useState({})
  const [actualizado, setActualizado] = useState(null)
  const [refrescando, setRefrescando] = useState(false)
  const [editandoBloque, setEditandoBloque] = useState(null)
  const [sugerencia, setSugerencia] = useState(null)
  const [califs, setCalifs] = useState(null)
  const [publicando, setPublicando] = useState(false)
  const [vistaPrevia, setVistaPrevia] = useState(false)
  const [listo, setListo] = useState(false)
  const [sugerencias, recargarSugerencias] = useSugerencias()

  // La vista activa (armar / asistencia / bloque / planilla) vive en el hash:
  // sobrevive recargas y descartes de la PWA, y "atrás" vuelve a la anterior
  const [vistaHash, setVistaHash] = useState(() => leerHash()[2] || 'bloques')
  useEffect(() => suscribir(() => setVistaHash(leerHash()[2] || 'bloques')), [])
  const setVista = (v) => irA('partidos', partido.id, v === 'bloques' ? null : v)
  // Un id que no es de este partido (hash viejo) cae a la vista inicial
  const vista = ['bloques', 'presentes', 'planilla'].includes(vistaHash) ||
    bloques.some((b) => b.id === vistaHash) ? vistaHash : 'bloques'

  // Última posición, para retomarla al volver desde otra pestaña
  useEffect(() => {
    guardarPosicion(partido.id, vistaHash === 'bloques' ? null : vistaHash)
  }, [partido.id, vistaHash])

  // Vuelca al estado una foto del servidor (carga inicial o refresco). Lo que
  // es local de esta pantalla (vista, propuesta abierta, selección de tiempo)
  // no se toca; la selección de tiempo solo se completa donde falte.
  function aplicarEstado(datos) {
    setBloques(datos.bloques)
    setTiempos(datos.tiempos)

    const mConf = {}
    for (const a of datos.confirmaciones) mConf[a.jugador_id] = a.estado
    setConfirmacion(mConf)

    const mAsis = {}
    const mTarde = {}
    const mCond = {}
    for (const a of datos.asistencias_dia) {
      mAsis[a.jugador_id] = a.estado
      if (a.tarde) mTarde[a.jugador_id] = true
      if (a.condicion) mCond[a.jugador_id] = a.condicion
    }
    setAsistencia(mAsis)
    setTarde(mTarde)
    setCondicion(mCond)

    const mConfSf = {}
    for (const a of datos.confirmaciones_staff) mConfSf[a.staff_email] = a.estado
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

    // Cada bloque con un tiempo seleccionado; el que ya tenía uno lo conserva
    setTiempoSel((prev) => {
      const sel = {}
      for (const b of datos.bloques) {
        const delBloque = datos.tiempos.filter((t) => t.bloque_id === b.id)
        sel[b.id] = delBloque.some((t) => t.id === prev[b.id]) ? prev[b.id] : delBloque[0]?.id
      }
      return sel
    })
    setActualizado(Date.now())
  }

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
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      setStaff(sf.filter((s) => s.activo))
      aplicarEstado({
        ...datos,
        confirmaciones: conf,
        confirmaciones_staff: confSf,
        asistencias_dia: asisDia,
      })
      setListo(true)
    }
    cargar()
  }, [partido.id])

  // Con varios staff cargando marcas a la vez, lo que toca otro tiene que
  // aparecer solo: se trae una foto fresca al volver a la app y cada tanto.
  // Nunca mientras haya cambios propios en vuelo, para no pisarlos.
  async function refrescar(manual) {
    if (!manual && (document.hidden || escrituraEnVuelo())) return
    const marca = marcaEscrituras()
    if (manual) setRefrescando(true)
    try {
      const datos = await api(`partido/${partido.id}/estado`)
      // Si mientras viajaba el pedido salió una escritura propia, la foto
      // puede no incluirla: se descarta y el próximo refresco trae todo
      if (escrituraEnVuelo() || marcaEscrituras() !== marca) return
      if (datos.bloques.length) aplicarEstado(datos)
    } catch { /* sin señal: se reintenta en el próximo refresco */ }
    finally { if (manual) setRefrescando(false) }
  }

  useEffect(() => {
    if (!listo) return
    const id = setInterval(() => refrescar(false), INTERVALO_REFRESCO)
    // Volver a la app (desbloquear el teléfono, salir de WhatsApp): refresco al toque
    const alVolver = () => { if (!document.hidden) refrescar(false) }
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [listo])

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
    // ¿Llegó tarde? Se compara la hora de la marca "vino" con la hora de
    // convocatoria de su bloque + 15 minutos de tolerancia (solo si se está
    // marcando el mismo día del partido). Cuenta como presente a todos los
    // efectos, pero pierde prioridad al armar los equipos.
    let esTarde = false
    if (nuevo === 'presente') {
      const bl = bloques.find((x) => x.id === asignacion[jugadorId])
      const hoy = new Date().toISOString().slice(0, 10)
      if (bl?.hora_convocatoria && partido.fecha === hoy) {
        const [h, m] = bl.hora_convocatoria.split(':').map(Number)
        const limite = new Date()
        limite.setHours(h, m + 15, 0, 0)
        esTarde = new Date() > limite
      }
    }
    setTarde((t) => {
      const copia = { ...t }
      if (esTarde) copia[jugadorId] = true
      else delete copia[jugadorId]
      return copia
    })
    await api(`eventos/${partido.id}/asistencias-partido`, {
      method: 'PUT',
      body: { marcas: [{ jugador_id: jugadorId, estado: nuevo, tarde: esTarde }] },
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
    setTarde({})
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

  // Cierre del tiempo (con valoración rápida opcional) y del bloque. El
  // servidor congela todo lo cerrado; reabrir un bloque es solo de la
  // cabeza de división.
  async function cerrarTiempo(tiempoId, cerrado, valoracion) {
    const t = await api('partido/tiempo-cerrar', {
      method: 'POST',
      body: { tiempo_id: tiempoId, cerrado, valoracion: valoracion ?? null },
    })
    setTiempos((ts) => ts.map((x) => (x.id === t.id ? t : x)))
  }

  async function cerrarBloque(bloqueId, cerrado) {
    try {
      const bl = await api('partido/bloque-cerrar', {
        method: 'POST',
        body: { bloque_id: bloqueId, cerrado },
      })
      setBloques((bs) => bs.map((x) => (x.id === bl.id ? bl : x)))
    } catch (e) {
      alert(e?.error === 'solo_cabeza'
        ? 'Solo la cabeza de división puede reabrir un bloque cerrado.'
        : 'No se pudo cambiar el estado del bloque. Probá de nuevo.')
    }
  }

  async function agregarTiempo(bloqueId) {
    const delBloque = tiempos.filter((t) => t.bloque_id === bloqueId)
    if (delBloque.length >= MAX_TIEMPOS) return
    const nuevo = await api('partido/tiempo', { method: 'POST', body: { bloque_id: bloqueId } })
    setTiempos((ts) => [...ts, nuevo].sort((a, b) => a.numero - b.numero))
  }

  // Borra un tiempo agregado por error o que no se jugó. Los que venían
  // después corren un lugar, así la numeración queda seguida.
  async function borrarTiempo(tiempo) {
    const cargados = Object.keys(enCancha[tiempo.id] || {}).length
    if (!confirm(
      `¿Borrar el tiempo T${tiempo.numero}?\n\n` +
      (cargados
        ? `Tiene ${cargados} jugadores cargados y se pierde ese armado. `
        : 'Está vacío. ') +
      'Los tiempos siguientes se renumeran.'
    )) return
    try {
      await api(`partido/tiempo/${tiempo.id}`, { method: 'DELETE' })
    } catch (e) {
      alert(e?.error === 'hay_tiempos_cerrados_despues'
        ? 'No se puede borrar: hay tiempos ya cerrados después de este.'
        : e?.error === 'ultimo_tiempo'
          ? 'El bloque tiene que quedar con al menos un tiempo.'
          : 'No se pudo borrar el tiempo. Probá de nuevo.')
      return
    }
    setEnCancha((m) => {
      const copia = { ...m }
      delete copia[tiempo.id]
      return copia
    })
    setTiempos((ts) => ts
      .filter((t) => t.id !== tiempo.id)
      .map((t) => (t.bloque_id === tiempo.bloque_id && t.numero > tiempo.numero
        ? { ...t, numero: t.numero - 1 }
        : t)))
    // queda seleccionado el anterior (o el primero del bloque)
    setTiempoSel((m) => {
      const quedan = tiempos
        .filter((t) => t.bloque_id === tiempo.bloque_id && t.id !== tiempo.id)
        .sort((a, b) => a.numero - b.numero)
      const previo = [...quedan].reverse().find((t) => t.numero < tiempo.numero)
      return { ...m, [tiempo.bloque_id]: (previo || quedan[0])?.id }
    })
  }

  const ordenados = useMemo(() => {
    const prioridad = (j) => (confirmacion[j.id] === 'presente' ? 0 : 1)
    return [...jugadores].sort((x, y) =>
      prioridad(x) - prioridad(y) ||
      x.apellido.localeCompare(y.apellido) ||
      x.nombre.localeCompare(y.nombre))
  }, [jugadores, confirmacion])

  // Promedio de juego de la última evaluación: es el que ordena el plantel y
  // el que el servidor usa para balancear los bloques
  const juegoDe = (j) => promediosResumen(valoresConsolidados({
    valores: j.ultima_evaluacion_valores,
    valores_revisor: j.ultima_evaluacion_revisor,
  })).juego

  // Para armar bloques conviene ver el plantel por puesto y, dentro de cada
  // puesto, del mejor al peor promedio de juego: así se reparte de a pares.
  // Los puestos van en el orden de la formación (1 → 15) y los que todavía no
  // tienen principal elegido quedan al final.
  const porPuestoYJuego = useMemo(() => {
    const rango = (j) => {
      const i = PUESTOS.findIndex((pu) => pu.value === puestoPrincipal(j))
      return i < 0 ? PUESTOS.length : i
    }
    return [...jugadores].sort((x, y) =>
      rango(x) - rango(y) ||
      (juegoDe(y) ?? 0) - (juegoDe(x) ?? 0) ||
      x.apellido.localeCompare(y.apellido))
  }, [jugadores])

  // Los mismos jugadores partidos en secciones con el título de su puesto
  const gruposPorPuesto = useMemo(() => {
    const grupos = []
    const visibles = porPuestoYJuego.filter((j) =>
      confirmacion[j.id] === 'presente' || asignacion[j.id])
    for (const j of visibles) {
      const clave = puestoPrincipal(j) || 'sin'
      const ultimo = grupos[grupos.length - 1]
      if (ultimo?.clave === clave) {
        ultimo.jugadores.push(j)
        continue
      }
      grupos.push({
        clave,
        titulo: PUESTOS.find((pu) => pu.value === clave)?.plural || 'Sin puesto principal',
        jugadores: [j],
      })
    }
    return grupos
  }, [porPuestoYJuego, confirmacion, asignacion])

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

      <Frescura fecha={actualizado} refrescando={refrescando} onRefrescar={() => refrescar(true)} />

      {vista === 'presentes' && (
        <ControlAsistencia
          bloques={bloques}
          jugadores={ordenados}
          asignacion={asignacion}
          asistencia={asistencia}
          confirmacion={confirmacion}
          condicion={condicion}
          bloquesCerrados={new Set(bloques.filter((x) => x.cerrado_en).map((x) => x.id))}
          onMarcar={marcarAsistencia}
          staff={staff}
          asignacionStaff={asignacionStaff}
          confirmacionStaff={confirmacionStaff}
          tarde={tarde}
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
          condicion={condicion}
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
            <div className="fila" style={{ gap: 6, flexWrap: 'wrap' }}>
              {!sugerencia && (
                <>
                  {/* El reparto automático equilibra dos bloques; con más, el
                      armado se hace a mano */}
                  {bloques.length === 2 ? (
                    <button className="btn chico" onClick={sugerirBloques}>✨ Sugerir armado</button>
                  ) : (
                    <span className="mini">Armado automático: solo con 2 bloques.</span>
                  )}
                  <button className="btn sec chico" onClick={limpiarBloques}>🧹 Limpiar</button>
                  <button className="btn sec chico" onClick={() => setPublicando(true)}>📣 Publicar</button>
                </>
              )}
              {/* También sirve con una propuesta abierta: se ve cómo quedaría */}
              <button className="btn sec chico" onClick={() => setVistaPrevia(true)}>👁 Vista previa</button>
            </div>
          </div>

          {vistaPrevia && (
            <VistaPreviaBloques
              bloques={bloques}
              jugadores={jugadores}
              asignacion={sugerencia ? sugerencia.asignacion : asignacion}
              propuesta={!!sugerencia}
              juegoDe={juegoDe}
              onCerrar={() => setVistaPrevia(false)}
            />
          )}

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
                Balancea el promedio de juego (última evaluación), la cantidad
                de jugadores por puesto y las aptitudes.
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
              estén asignados a un bloque, para no ocultar un armado hecho),
              agrupados bajo el título de su puesto y de mejor a peor promedio
              de juego */}
          {gruposPorPuesto.map((g) => (
            <div key={g.clave}>
              <div className="mini puesto-grupo">
                {g.titulo} ({g.jugadores.length})
              </div>
              {g.jugadores.map((j) => {
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
                    {/* el promedio de juego es el que ordena y el que balancea */}
                    {juegoDe(j) != null
                      ? ` · juego ★${juegoDe(j).toFixed(1)}`
                      : ' · sin evaluar'}
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
            </div>
          ))}

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
        // Elegibles: SOLO los marcados "vino" en Tomar asistencia (sin marca
        // cuenta como faltó, igual que en el servidor)
        const delBloque = ordenados.filter((j) => asignacion[j.id] === b.id)
        const presentes = delBloque.filter((j) => asistencia[j.id] === 'presente')
        return (
        <VistaBloque
          key={b.id}
          bloque={b}
          onEditar={() => setEditandoBloque({ ...b })}
          onActualizado={(nuevo) => setBloques((bs) => bs.map((x) => (x.id === nuevo.id ? nuevo : x)))}
          jugadores={presentes}
          ausentes={delBloque.filter((j) => asistencia[j.id] !== 'presente')}
          confirmacion={confirmacion}
          tarde={tarde}
          condicion={condicion}
          onCondicion={marcarCondicion}
          asistenciaSinTomar={presentes.length === 0 && delBloque.length > 0}
          staff={staff.filter((s) => asignacionStaff[s.email] === b.id && presenciaStaff[s.email] !== false)}
          onIrAPresentes={() => setVista('presentes')}
          tiempos={tiempos.filter((t) => t.bloque_id === b.id)}
          tiempoSel={tiempoSel[b.id]}
          onSelTiempo={(tid) => setTiempoSel((m) => ({ ...m, [b.id]: tid }))}
          enCancha={enCancha}
          onMover={moverEnCancha}
          onReemplazar={reemplazarTiempo}
          onAgregarTiempo={() => agregarTiempo(b.id)}
          onBorrarTiempo={borrarTiempo}
          onCerrarTiempo={cerrarTiempo}
          onCerrarBloque={cerrarBloque}
        />
        )
      })}
    </>
  )
}

// Cuándo se trajo la última foto del servidor, con refresco a pedido: la
// referencia de frescura cuando varios staff cargan marcas a la vez
function Frescura({ fecha, refrescando, onRefrescar }) {
  // Tic periódico solo para que el "hace X s" no quede congelado
  const [, setTic] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTic((t) => t + 1), 5000)
    return () => clearInterval(id)
  }, [])
  if (!fecha) return null
  const seg = Math.max(0, Math.round((Date.now() - fecha) / 1000))
  const texto = seg < 10 ? 'Actualizado recién'
    : seg < 90 ? `Actualizado hace ${seg} s`
    : `Actualizado hace ${Math.round(seg / 60)} min`
  return (
    <div className="fila entre no-imprimir" style={{ margin: '2px 0 6px' }}>
      <span className="mini">🔄 {texto} · los cambios de otros aparecen solos</span>
      <button className="btn sec chico" disabled={refrescando} onClick={onRefrescar}>
        {refrescando ? 'Actualizando…' : 'Actualizar'}
      </button>
    </div>
  )
}

// Control de asistencia del día de partido. Los bloques se arman la víspera
// con los que avisaron que venían, así que lo primero al llegar a la cancha
// es confirmar quién está: los equipos de cada tiempo salen de acá.
// Control de asistencia del día del partido: el staff de cada bloque marca
// quién de los convocados se presentó a jugar. La confirmación anticipada se
// toma en la sección Asistencia durante la semana; acá solo se compara.
function ControlAsistencia({
  bloques, jugadores, asignacion, asistencia, confirmacion, tarde = {}, condicion = {},
  bloquesCerrados = new Set(), onMarcar,
  staff, asignacionStaff, confirmacionStaff, presenciaStaff, onMarcarStaff, onLimpiar,
}) {
  // Los convocados: asignados a un bloque, más los confirmados sin bloque
  const convocados = jugadores.filter((j) =>
    asignacion[j.id] || confirmacion[j.id] === 'presente')
  const presentes = convocados.filter((j) => asistencia[j.id] === 'presente')
  const sinMarcar = convocados.filter((j) => !asistencia[j.id]).length
  // El rastro: confirmaron en la semana y el día del partido no aparecieron
  const faltaronTrasConfirmar = convocados.filter((j) =>
    confirmacion[j.id] === 'presente' && asistencia[j.id] === 'ausente')

  const fila = (clave, nombre, detalle, estado, marcar, alerta, cerrado) => (
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
        <div className="mini">{cerrado ? `🔒 bloque cerrado · ${detalle}` : detalle}</div>
      </div>
      <div className="bloque-botones">
        <button
          className={`bloque-btn ${estado === 'presente' ? 'sel ok' : ''}`}
          disabled={cerrado}
          onClick={() => marcar('presente')}
        >
          Vino
        </button>
        {/* Faltó es el valor por defecto: sin marca se muestra igual */}
        <button
          className={`bloque-btn ${estado !== 'presente' ? 'sel no' : ''}`}
          disabled={cerrado}
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
          tarde[j.id] ? '🕑 llegó tarde' : null,
          condicion[j.id] === 'golpeado' ? '🤕 golpeado en el partido' : null,
          condicion[j.id] === 'lesionado' ? '🚑 lesionado en el partido' : null,
          etiquetaConfirmacion(j.id),
          j.estado === 'lesionado' ? '🤕 lesionado' : null,
        ].filter(Boolean).join(' · '),
        asistencia[j.id],
        (estado) => onMarcar(j.id, estado),
        confirmacion[j.id] === 'presente' && asistencia[j.id] === 'ausente',
        bloquesCerrados.has(asignacion[j.id]),
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
          <div className="mini" style={{ color: sinMarcar ? 'var(--warn)' : 'var(--ok)' }}>
            {sinMarcar
              ? `Sin marcar (cuentan como Faltó): ${sinMarcar}`
              : '✓ Todos marcados'}
          </div>
          <button className="btn sec chico" style={{ marginTop: 6 }} onClick={onLimpiar}>
            🧹 Limpiar
          </button>
        </div>
      </div>

      <p className="mini">
        El día del partido: cada staff marca quién de su bloque se presentó a
        jugar. Todos arrancan como "Faltó": alcanza con marcar a los que van
        llegando. Los equipos de cada tiempo se arman solo con los marcados
        "Vino"; una marca pasada la convocatoria + 15' queda como 🕑 llegó
        tarde (juega igual, pero pierde prioridad en el armado).
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
            bloquesCerrados.has(asignacionStaff[s.email]),
          )
        })
      })()}
    </>
  )
}

// Vista previa de cómo quedaron los bloques: cada uno con sus forwards y sus
// backs (según el puesto principal), del mejor al peor promedio de juego. Es
// la mirada de control antes de aplicar o publicar.
function VistaPreviaBloques({ bloques, jugadores, asignacion, propuesta, juegoDe, onCerrar }) {
  const tipoDe = (j) => {
    const principal = puestoPrincipal(j)
    const pu = PUESTOS.find((x) => x.value === principal)
    if (pu) return pu.tipo
    // sin principal elegido, al menos ubica la línea por la posición derivada
    const t = tipoJugador(j)
    if (t === 'Forward') return 'forward'
    if (t === 'Back') return 'back'
    return 'sin'
  }
  const promedio = (lista) => {
    const notas = lista.map(juegoDe).filter((n) => n != null)
    return notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null
  }
  const LINEAS = [
    { clave: 'forward', label: 'Forwards' },
    { clave: 'back', label: 'Backs' },
    { clave: 'sin', label: 'Sin puesto definido' },
  ]

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>👁 Vista previa {propuesta ? 'de la propuesta' : 'de los bloques'}</h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        {/* Los bloques van uno al lado del otro y las líneas alineadas entre
            sí: los forwards de un bloque quedan a la par de los del otro */}
        <div
          className="previa-grid"
          style={{ gridTemplateColumns: `repeat(${bloques.length}, minmax(0, 1fr))` }}
        >
          {bloques.map((bl) => {
            const del = jugadores.filter((j) => asignacion[j.id] === bl.id)
            const prom = promedio(del)
            return (
              <div key={bl.id} className="previa-cab">
                <b>{bl.nombre || `B${bl.numero}`}</b>
                {bl.rival && <div className="mini">vs {bl.rival}</div>}
                <div className="mini">
                  {del.length} jug.{prom != null ? ` · ★${prom.toFixed(1)}` : ''}
                </div>
              </div>
            )
          })}

          {LINEAS.map((linea) => {
            const porBloque = bloques.map((bl) => jugadores
              .filter((j) => asignacion[j.id] === bl.id && tipoDe(j) === linea.clave)
              .sort((x, y) => (juegoDe(y) ?? 0) - (juegoDe(x) ?? 0) ||
                x.apellido.localeCompare(y.apellido)))
            if (!porBloque.some((l) => l.length)) return null
            return (
              <Fragment key={linea.clave}>
                <div className="mini puesto-grupo previa-linea">{linea.label}</div>
                {porBloque.map((lista, i) => {
                  const promLinea = promedio(lista)
                  return (
                    <div key={bloques[i].id} className="previa-col">
                      <div className="mini" style={{ textAlign: 'center' }}>
                        {lista.length}{promLinea != null ? ` · ★${promLinea.toFixed(1)}` : ''}
                      </div>
                      {lista.map((j) => (
                        <div key={j.id} className="previa-jug">
                          <span className="crece" style={{ minWidth: 0 }}>
                            {j.apellido}
                            {abrevPuestos(j) && <span className="mini"> {abrevPuestos(j)}</span>}
                          </span>
                          <b>{juegoDe(j) != null ? juegoDe(j).toFixed(1) : '—'}</b>
                        </div>
                      ))}
                      {!lista.length && <div className="mini" style={{ textAlign: 'center' }}>—</div>}
                    </div>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
        <p className="mini" style={{ marginTop: 8 }}>
          Cada línea enfrentada entre bloques, ordenada por promedio de juego.
          El número de la derecha es ese promedio.
        </p>
      </div>
    </div>
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
    // Cada jugador cuenta por su puesto principal (el que de verdad juega);
    // aparte, los que lo tienen como secundario y pueden compensar un hueco
    const porPuesto = {}
    const secundarios = {}
    for (const j of del) {
      const clave = puestoPrincipal(j) || 'sin'
      porPuesto[clave] = (porPuesto[clave] || 0) + 1
      for (const otro of j.puestos || []) {
        if (otro !== clave) secundarios[otro] = (secundarios[otro] || 0) + 1
      }
    }
    return {
      bl,
      n: del.length,
      fuerza,
      porPuesto,
      secundarios,
      apts: APTITUDES.map((a) => del.filter((j) => (j.aptitudes || []).includes(a.value)).length),
    }
  })
  // Puestos presentes en cualquiera de los bloques, en el orden del catálogo
  const puestosEnJuego = PUESTOS.filter((pu) =>
    stats.some((s) => s.porPuesto[pu.value] || s.secundarios[pu.value]))
  const haySinPrincipal = stats.some((s) => s.porPuesto.sin)
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
          {fila('Promedio de juego', (s) => (s.fuerza === null ? '—' : <b>★{s.fuerza.toFixed(1)}</b>))}
          {fila('Cond / Pen / Def', (s) => s.apts.join(' / '))}
          <tr>
            <td className="mini" colSpan={stats.length + 1} style={{ paddingTop: 8 }}>
              <b>Por puesto principal</b>
            </td>
          </tr>
          {puestosEnJuego.map((pu) => {
            // El máximo de principales marca el nivel a igualar; el que está
            // por debajo se considera cubierto si tiene suplentes de sobra
            const maximo = Math.max(...stats.map((s) => s.porPuesto[pu.value] || 0))
            return (
              <tr key={pu.value}>
                <td className="mini">{pu.label}</td>
                {stats.map((s) => {
                  const propios = s.porPuesto[pu.value] || 0
                  const sec = s.secundarios[pu.value] || 0
                  const falta = maximo - propios
                  const cubierto = falta > 0 && sec >= falta
                  return (
                    <td
                      key={s.bl.id}
                      style={{
                        textAlign: 'center',
                        color: falta > 0 && !cubierto ? 'var(--warn)' : undefined,
                      }}
                      title={sec ? `${sec} con este puesto como secundario` : undefined}
                    >
                      {propios}
                      {sec > 0 && (
                        <span className="mini" style={{ color: 'var(--texto-suave)' }}> +{sec}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {haySinPrincipal && (
            <tr>
              <td className="mini" style={{ color: 'var(--texto-suave)' }}>Sin puesto principal</td>
              {stats.map((s) => (
                <td key={s.bl.id} style={{ textAlign: 'center' }}>{s.porPuesto.sin || 0}</td>
              ))}
            </tr>
          )}
          <tr>
            <td className="mini" colSpan={stats.length + 1} style={{ color: 'var(--texto-suave)' }}>
              El +n son los que tienen ese puesto como secundario y pueden
              compensar el hueco.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Planilla({ partido, bloques, jugadores, asignacion, asistencia = {}, confirmacion = {}, condicion = {}, tiempos, enCancha, staff = [], asignacionStaff = {} }) {
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
            <div key={bl.id} className="planilla-bloque">
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
                  <div className="planilla-seccion">
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
                  </div>
                  <div className="planilla-seccion">
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
                  </div>

                  <div className="planilla-seccion">
                    <h4>Ranking de tiempos jugados</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Jugador</th>
                          <th>Tiempos</th>
                          <th>Prestados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...delBloque]
                          .sort((x, y) => jugados(y.id) - jugados(x.id) ||
                            nombreCompleto(x).localeCompare(nombreCompleto(y), 'es'))
                          .map((j, i, orden) => {
                            // misma posición para los que empatan en tiempos
                            const puesto = orden.findIndex((o) => jugados(o.id) === jugados(j.id)) + 1
                            const prestados = tiemposBloque
                              .filter((t) => (enCancha[t.id] || {})[j.id]?.prestado).length
                            return (
                              <tr key={j.id}>
                                <td>{puesto}</td>
                                <td>{nombreCompleto(j)}</td>
                                <td><b>{jugados(j.id)}</b> de {tiemposBloque.length}</td>
                                <td>{prestados || ''}</td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div className="planilla-seccion">
                <h4>Golpeados y lesionados</h4>
                {(() => {
                  const tocados = delBloque.filter((j) => condicion[j.id])
                  if (!tocados.length) {
                    return <p className="mini">Sin golpeados ni lesionados.</p>
                  }
                  return (
                    <table>
                      <thead>
                        <tr>
                          <th>Jugador</th>
                          <th>Qué pasó</th>
                          <th>Tiempos jugados</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tocados.map((j) => (
                          <tr key={j.id}>
                            <td>{nombreCompleto(j)}</td>
                            <td>
                              {condicion[j.id] === 'lesionado'
                                ? '🚑 Lesionado · requiere seguimiento'
                                : '🤕 Golpeado · salió del juego'}
                            </td>
                            <td>{jugados(j.id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}

                <h4>Incidentes y situaciones a destacar</h4>
                {bl.cronica
                  ? <p style={{ whiteSpace: 'pre-wrap' }}>{bl.cronica}</p>
                  : <p className="mini">Sin incidentes.</p>}
              </div>
            </div>
          )
        })}

        <p className="mini planilla-seccion" style={{ marginTop: 10 }}>
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

function VistaBloque({ bloque, onEditar, onActualizado, jugadores, ausentes = [], confirmacion = {}, tarde = {}, condicion = {}, onCondicion, asistenciaSinTomar, staff = [], onIrAPresentes, tiempos, tiempoSel, onSelTiempo, enCancha, onMover, onReemplazar, onAgregarTiempo, onBorrarTiempo, onCerrarTiempo, onCerrarBloque }) {
  const [sel, setSel] = useState(null)
  const [nPrestar, setNPrestar] = useState(0)
  const [sugiriendo, setSugiriendo] = useState(false)
  // diálogos de cierre: del tiempo (con estrellas) y del bloque (checklist)
  const [cerrandoTiempo, setCerrandoTiempo] = useState(null)
  const [cerrandoBloque, setCerrandoBloque] = useState(false)
  const bloqueCerrado = !!bloque.cerrado_en

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
        {!bloqueCerrado && <button className="btn sec chico" onClick={onEditar}>Editar datos</button>}
      </div>
      {asistenciaSinTomar && (
        <p className="aviso">
          ⚠️ Nadie del bloque está marcado como "Vino" todavía: los equipos se
          arman solo con los presentes.{' '}
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
  const tiempoCerrado = !!tiempo?.cerrado_en
  const anterior = tiempo && tiempos.find((t) => t.numero === tiempo.numero - 1)
  const soloLectura = bloqueCerrado || tiempoCerrado
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
    if (soloLectura) return
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
    if (soloLectura) return
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

  // El panel amarillo guarda SOLO lo que hay que arreglar antes de cerrar el
  // tiempo: en un tiempo bien cargado queda vacío. Lo que es inevitable (un
  // puesto forzado) se marca en su celda, y lo que es balance de la jornada
  // (equidad y préstamos) se revisa al cerrar.
  const avisos = []
  if (tiempo) {
    if (enJuego.length !== 13) {
      const faltan = FORMACION.filter((f) => !ocupante[f.num])
      avisos.push(
        `Hay ${enJuego.length} en cancha (deberían ser 13)` +
        (faltan.length ? `: falta cubrir ${faltan.map((f) => f.num).join(', ')}.` : '.') +
        (sinPuesto.length ? ` Sin puesto: ${sinPuesto.map((j) => j.apellido).join(', ')}.` : ''))
    }
    // Quedó marcado fuera de juego pero sigue figurando en este tiempo
    for (const j of enJuego.filter((x) => condicion[x.id])) {
      avisos.push(`${j.apellido} está ${condicion[j.id]} y sigue en cancha.`)
    }
  }

  // ¿Por qué el puesto quedó forzado? Se explica dónde está cada especialista
  // del puesto. Ya no va al panel: se muestra al tocar al jugador.
  const justificacion = (() => {
    const fn = (f, oc) => {
      const especialistas = jugadores.filter((j) =>
        j.id !== oc.id && (j.puestos || []).includes(f.puesto))
      const faltaron = ausentes.filter((j) => (j.puestos || []).includes(f.puesto))
      if (!especialistas.length && !faltaron.length) {
        return 'nadie más del bloque juega ahí'
      }
      if (!especialistas.length) {
        return `${faltaron.map((j) => j.apellido).join(' y ')} ${faltaron.length === 1 ? 'juega ahí pero faltó' : 'juegan ahí pero faltaron'} hoy`
      }
      const motivo = (e) => {
        if (condicion[e.id] === 'lesionado') return `${e.apellido} está lesionado`
        if (condicion[e.id] === 'golpeado') return `${e.apellido} está golpeado`
        if (mapa[e.id]?.prestado) return `${e.apellido} está prestado al rival`
        if (mapa[e.id]?.puesto) return `${e.apellido} está de ${mapa[e.id].puesto}`
        if (mapa[e.id]) return `${e.apellido} está en cancha sin puesto`
        if ((jugadosPrevios[e.id] || 0) > (jugadosPrevios[oc.id] || 0)) {
          return `${e.apellido} descansa (ya jugó ${jugadosPrevios[e.id]} ${jugadosPrevios[e.id] === 1 ? 'tiempo' : 'tiempos'})`
        }
        if (tarde[e.id] && !tarde[oc.id]) return `${e.apellido} llegó tarde`
        return `${e.apellido} está en el banco (lo podés cambiar)`
      }
      return especialistas.map(motivo).join('; ')
    }
    return fn
  })()

  // Por qué este jugador está donde está: lo que antes era un aviso suelto,
  // ahora se lee al tocarlo
  const observacionDe = (j) => {
    const e = mapa[j.id]
    if (!e || e.prestado || !e.puesto) return null
    const f = FORMACION.find((x) => x.num === e.puesto)
    if (!f) return null
    if (!puedeJugarDe(j, f.num)) {
      return `Juega de ${f.num} (${f.label}) sin ser su puesto — ${justificacion(f, j)}.`
    }
    if (f.conductor && !(j.aptitudes || []).includes('conduccion')) {
      return `Es el ${f.num} y no tiene aptitud de conducción.`
    }
    return null
  }

  // Balance de la jornada: no es urgencia del momento, se revisa al cerrar
  const balance = []
  const tiemposConDatos = tiempos.filter((t) => Object.keys(enCancha[t.id] || {}).length)
  if (tiemposConDatos.length >= 2 && disponibles.length) {
    const promedio = disponibles.reduce((s, j) => s + (jugados[j.id] || 0), 0) / disponibles.length
    const rezagados = disponibles.filter((j) => (jugados[j.id] || 0) <= promedio - 1)
    if (rezagados.length) {
      balance.push(`${rezagados.map((j) => j.apellido).join(', ')}: van abajo del promedio de tiempos (${promedio.toFixed(1)}).`)
    }
  }
  const masPrestado = jugadores.reduce((mejor, j) =>
    ((prestadosHoy[j.id] || 0) > (prestadosHoy[mejor?.id] || 0) ? j : mejor), null)
  if (masPrestado && prestadosHoy[masPrestado.id] >= 2 &&
      jugadores.some((j) => !prestadosHoy[j.id])) {
    balance.push(`${masPrestado.apellido} ya fue prestado ${prestadosHoy[masPrestado.id]} veces hoy y otros ninguna.`)
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
          {abrevAptitudes(j) ? ` · ${abrevAptitudes(j)}` : ''}
          {tarde[j.id] ? ' · 🕑' : ''}{extra}
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
      {bloqueCerrado && (
        <p className="aviso" style={{ background: '#e0e7ff', color: '#3730a3' }}>
          🔒 Bloque cerrado el {bloque.cerrado_en.slice(0, 16).replace('T', ' ')} hs
          {bloque.cerrado_por ? ` por ${bloque.cerrado_por}` : ''}. Nada puede editarse.{' '}
          <button className="btn sec chico" onClick={() => onCerrarBloque(bloque.id, false)}>
            🔓 Reabrir
          </button>
        </p>
      )}

      <div className="fila entre">
        <div className="seg crece">
          {tiempos.map((t) => (
            <button key={t.id} className={tiempo?.id === t.id ? 'activo' : ''} onClick={() => onSelTiempo(t.id)}>
              T{t.numero}{t.cerrado_en ? ' ✓' : ''}
            </button>
          ))}
        </div>
        {!bloqueCerrado && (
          <div className="fila" style={{ gap: 6 }}>
            {/* Se borra el tiempo a la vista: solo si está abierto, no es el
                único y no hay tiempos ya cerrados después */}
            {!tiempoCerrado && tiempos.length > 1 &&
              !tiempos.some((t) => t.numero > tiempo.numero && t.cerrado_en) && (
              <button
                className="btn sec chico"
                title={`Borrar el tiempo T${tiempo.numero}`}
                onClick={() => onBorrarTiempo(tiempo)}
              >
                🗑 T{tiempo.numero}
              </button>
            )}
            {tiempos.length < MAX_TIEMPOS && (
              <button className="btn sec chico" onClick={onAgregarTiempo}>+ Tiempo</button>
            )}
          </div>
        )}
      </div>

      {tiempoCerrado && !bloqueCerrado && (
        <p className="aviso" style={{ background: '#e0e7ff', color: '#3730a3' }}>
          ✔ Tiempo T{tiempo.numero} cerrado
          {tiempo.valoracion ? ` · ${'★'.repeat(tiempo.valoracion)}` : ''}. Ya no se edita.{' '}
          <button className="btn sec chico" onClick={() => onCerrarTiempo(tiempo.id, false)}>
            Reabrir
          </button>
        </p>
      )}

      {!soloLectura && (
        <div className="tarjeta fila entre">
          <label className="mini fila crece" style={{ gap: 6, alignItems: 'center' }}>
            Prestar al rival:
            <select value={nPrestar} onChange={(e) => setNPrestar(Number(e.target.value))} style={{ width: 'auto' }}>
              {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="fila" style={{ gap: 6 }}>
            {anterior && !anterior.cerrado_en ? (
              <button
                className="btn chico"
                style={{ opacity: 0.55 }}
                onClick={() => {
                  alert(`Para armar el T${tiempo.numero} primero valorá y cerrá el T${anterior.numero}: así lo jugado queda confirmado.`)
                  onSelTiempo(anterior.id)
                }}
              >
                ✨ Sugerir T{tiempo?.numero}
              </button>
            ) : (
              <button className="btn chico" disabled={sugiriendo} onClick={sugerirEquipos}>
                {sugiriendo ? 'Armando…' : `✨ Sugerir T${tiempo?.numero}`}
              </button>
            )}
            <button className="btn sec chico" onClick={limpiarTiempo}>🧹 Limpiar</button>
            <button className="btn sec chico" onClick={() => setCerrandoTiempo(tiempo)}>
              ✔ Cerrar T{tiempo?.numero}
            </button>
          </div>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="aviso">
          {avisos.map((a, i) => <div key={i}>⚠️ {a}</div>)}
        </div>
      )}
      {avisos.length === 0 && enJuego.length === 13 && !tiempoCerrado && (
        <p className="mini" style={{ color: 'var(--ok)' }}>✓ Listo para cerrar el tiempo.</p>
      )}

      {/* Panel de acciones fijo abajo (con el celular en la mano, al costado
          de la cancha, el pulgar llega ahí y nunca queda cortado) */}
      {jSel && (
        <div className="barra-sel">
          <div className="fila entre" style={{ width: '100%' }}>
            <div className="crece">
              <b>{nombreCompleto(jSel)}</b>
              <div className="mini">
                {observacionDe(jSel) || 'Tocá un puesto para ubicarlo, o…'}
              </div>
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
          {FORMACION.some((f) => !ocupante[f.num]) && (
            <div className="barra-sel-puestos">
              <span className="mini">Puesto libre:</span>
              {FORMACION.filter((f) => !ocupante[f.num]).map((f) => (
                <button
                  key={f.num}
                  className={`puesto-btn ${puedeJugarDe(jSel, f.num) ? 'apto' : ''}`}
                  title={f.label}
                  onClick={() => accionSel({ dentro: true, puesto: f.num })}
                >
                  {f.num}
                </button>
              ))}
            </div>
          )}
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

      {!bloqueCerrado && <BalancePartido bloque={bloque} onActualizado={onActualizado} />}
      {bloqueCerrado && (
        <div className="tarjeta">
          <h3>Balance del partido 🔒</h3>
          <p className="mini">
            {bloque.valoracion ? `${'★'.repeat(bloque.valoracion)}${'☆'.repeat(5 - bloque.valoracion)}` : 'Sin valoración'}
          </p>
          {bloque.cronica && <p style={{ marginTop: 6 }}>{bloque.cronica}</p>}
        </div>
      )}

      {!bloqueCerrado && (
        <div className="tarjeta fila entre">
          <div className="crece">
            <b>Cierre del bloque</b>
            <div className="mini">
              Congela asistencia, equipos y datos. Reabrir queda solo en manos
              de la cabeza de división.
            </div>
          </div>
          <button className="btn" onClick={() => setCerrandoBloque(true)}>🔒 Cerrar bloque</button>
        </div>
      )}

      {cerrandoTiempo && (
        <CerrarTiempo
          tiempo={cerrandoTiempo}
          vacantes={FORMACION.filter((f) => !Object.values(enCancha[cerrandoTiempo.id] || {})
            .some((e) => !e.prestado && e.puesto === f.num))}
          balance={balance}
          onCerrar={async (valoracion) => {
            setCerrandoTiempo(null)
            setSel(null)
            setPuestoSel(null)
            await onCerrarTiempo(cerrandoTiempo.id, true, valoracion)
          }}
          onCancelar={() => setCerrandoTiempo(null)}
        />
      )}

      {cerrandoBloque && (
        <CerrarBloque
          bloque={bloque}
          tiempos={tiempos}
          enCancha={enCancha}
          jugadores={jugadores}
          condicion={condicion}
          asistenciaSinTomar={asistenciaSinTomar}
          onCerrar={async () => {
            setCerrandoBloque(false)
            setSel(null)
            setPuestoSel(null)
            await onCerrarBloque(bloque.id, true)
          }}
          onCancelar={() => setCerrandoBloque(false)}
        />
      )}
    </>
  )
}

// Diálogo de cierre de un tiempo: valoración rápida opcional y confirmación.
// Con puestos vacantes no se puede cerrar: la formación tiene que estar
// completa (el servidor también lo exige).
function CerrarTiempo({ tiempo, vacantes, balance = [], onCerrar, onCancelar }) {
  const [valoracion, setValoracion] = useState(tiempo.valoracion || null)
  return (
    <div className="modal-fondo" onClick={onCancelar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>✔ Cerrar el tiempo T{tiempo.numero}</h3>
        <p className="mini" style={{ margin: '6px 0' }}>
          Confirma que el T{tiempo.numero} se jugó tal como está cargado. Es la
          condición para armar el tiempo siguiente. Se puede reabrir mientras
          el bloque siga abierto.
        </p>
        {vacantes.length > 0 && (
          <p className="aviso">
            ⛔ No se puede cerrar con puestos vacantes:{' '}
            {vacantes.map((f) => `${f.num} (${f.label})`).join(', ')}. Completá
            la formación y volvé a intentar.
          </p>
        )}
        {/* El balance de la jornada se revisa acá, no mientras se arma */}
        {vacantes.length === 0 && balance.length > 0 && (
          <div className="aviso" style={{ marginTop: 8 }}>
            {balance.map((t, i) => <div key={i}>⚠️ {t}</div>)}
          </div>
        )}
        {vacantes.length === 0 && (
          <div className="fila entre" style={{ marginTop: 8 }}>
            <span className="mini">¿Cómo se jugó? (opcional)</span>
            <Estrellas valor={valoracion} onCambiar={setValoracion} />
          </div>
        )}
        <div className="fila" style={{ gap: 8, marginTop: 12 }}>
          {vacantes.length === 0 && (
            <button className="btn crece" onClick={() => onCerrar(valoracion)}>Cerrar T{tiempo.numero}</button>
          )}
          <button className={`btn sec ${vacantes.length ? 'crece' : ''}`} onClick={onCancelar}>
            {vacantes.length ? 'Volver a la formación' : 'Cancelar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Diálogo de cierre del bloque, con la checklist de lo que quedó pendiente.
// Avisa pero no bloquea: a veces el caos de la jornada manda.
function CerrarBloque({ bloque, tiempos, enCancha, jugadores, condicion, asistenciaSinTomar, onCerrar, onCancelar }) {
  const pendientes = []
  if (asistenciaSinTomar) pendientes.push('La asistencia del día no está tomada.')
  const sinCerrar = tiempos.filter((t) => !t.cerrado_en)
  if (sinCerrar.length) {
    pendientes.push(`Tiempos sin cerrar: ${sinCerrar.map((t) => `T${t.numero}`).join(', ')}.`)
  }
  const vacios = tiempos.filter((t) => !Object.keys(enCancha[t.id] || {}).length)
  if (vacios.length && vacios.length < tiempos.length) {
    pendientes.push(`Tiempos sin equipo cargado: ${vacios.map((t) => `T${t.numero}`).join(', ')}.`)
  }
  if (!bloque.valoracion) pendientes.push('Falta la valoración del bloque (estrellas).')
  if (!bloque.cronica) pendientes.push('Falta la crónica del partido.')
  const tocados = jugadores.filter((j) => condicion[j.id])
  if (tocados.length) {
    pendientes.push(`Golpeados/lesionados marcados: ${tocados.map((j) => j.apellido).join(', ')}.`)
  }
  return (
    <div className="modal-fondo" onClick={onCancelar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>🔒 Cerrar {bloque.nombre || `Bloque ${bloque.numero}`}</h3>
        <p className="mini" style={{ margin: '6px 0' }}>
          Congela la asistencia del día, los equipos de todos los tiempos y los
          datos del bloque. Después solo la cabeza de división puede reabrirlo.
        </p>
        {pendientes.length > 0 && (
          <div className="aviso" style={{ marginTop: 6 }}>
            {pendientes.map((t, i) => <div key={i}>⚠️ {t}</div>)}
          </div>
        )}
        {pendientes.length === 0 && (
          <p className="mini" style={{ color: 'var(--ok)' }}>✓ Todo en orden para cerrar.</p>
        )}
        <div className="fila" style={{ gap: 8, marginTop: 12 }}>
          <button className="btn crece" onClick={onCerrar}>
            {pendientes.length ? 'Cerrar igual' : 'Cerrar bloque'}
          </button>
          <button className="btn sec" onClick={onCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
