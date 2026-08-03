import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { fechaCorta, nombreCompleto } from '../helpers.js'

const MAX_TIEMPOS = 6

export default function Partidos() {
  const [partidos, setPartidos] = useState([])
  const [partidoId, setPartidoId] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from('rugby_eventos')
        .select('*')
        .eq('tipo', 'partido')
        .order('fecha', { ascending: false })
      setPartidos(data || [])
      if (data?.length) setPartidoId(data[0].id)
      setCargando(false)
    }
    cargar()
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
      <div className="campo">
        <label>Partido</label>
        <select value={partidoId} onChange={(e) => setPartidoId(e.target.value)}>
          {partidos.map((p) => (
            <option key={p.id} value={p.id}>
              {fechaCorta(p.fecha)}{p.rival ? ` vs ${p.rival}` : ''}
            </option>
          ))}
        </select>
      </div>
      {partido && <ArmadoPartido key={partido.id} partido={partido} />}
    </div>
  )
}

function ArmadoPartido({ partido }) {
  const [bloques, setBloques] = useState([])
  const [jugadores, setJugadores] = useState([])
  const [asistencia, setAsistencia] = useState({}) // jugador_id -> estado
  const [asignacion, setAsignacion] = useState({}) // jugador_id -> bloque_id
  const [tiempos, setTiempos] = useState([]) // todos los tiempos de ambos bloques
  const [enCancha, setEnCancha] = useState({}) // tiempo_id -> Set(jugador_id)
  const [vista, setVista] = useState('bloques') // 'bloques' | id de bloque
  const [tiempoSel, setTiempoSel] = useState({}) // bloque_id -> tiempo_id
  const [listo, setListo] = useState(false)

  useEffect(() => {
    async function cargar() {
      // Asegurar que existan los 2 bloques del club
      await supabase.from('rugby_bloques').upsert(
        [
          { evento_id: partido.id, numero: 1, nombre: 'Bloque 1' },
          { evento_id: partido.id, numero: 2, nombre: 'Bloque 2' },
        ],
        { onConflict: 'evento_id,numero', ignoreDuplicates: true },
      )
      const { data: bls } = await supabase
        .from('rugby_bloques').select('*').eq('evento_id', partido.id).order('numero')

      // Asegurar 4 tiempos iniciales por bloque
      const filasTiempos = []
      for (const b of bls) {
        for (let n = 1; n <= 4; n++) filasTiempos.push({ bloque_id: b.id, numero: n })
      }
      await supabase.from('rugby_tiempos').upsert(filasTiempos, {
        onConflict: 'bloque_id,numero', ignoreDuplicates: true,
      })

      const bloqueIds = bls.map((b) => b.id)
      const [{ data: js }, { data: asis }, { data: bj }, { data: ts }] = await Promise.all([
        supabase.from('rugby_jugadores').select('*').neq('estado', 'inactivo')
          .order('apellido').order('nombre'),
        supabase.from('rugby_asistencias').select('*').eq('evento_id', partido.id),
        supabase.from('rugby_bloque_jugadores').select('*').in('bloque_id', bloqueIds),
        supabase.from('rugby_tiempos').select('*').in('bloque_id', bloqueIds).order('numero'),
      ])

      const { data: tj } = await supabase
        .from('rugby_tiempo_jugadores').select('*')
        .in('tiempo_id', (ts || []).map((t) => t.id))

      setBloques(bls || [])
      setJugadores(js || [])
      const mAsis = {}
      for (const a of asis || []) mAsis[a.jugador_id] = a.estado
      setAsistencia(mAsis)
      const mAsig = {}
      for (const f of bj || []) mAsig[f.jugador_id] = f.bloque_id
      setAsignacion(mAsig)
      setTiempos(ts || [])
      const mCancha = {}
      for (const f of tj || []) {
        if (!mCancha[f.tiempo_id]) mCancha[f.tiempo_id] = new Set()
        mCancha[f.tiempo_id].add(f.jugador_id)
      }
      setEnCancha(mCancha)
      const sel = {}
      for (const b of bls) {
        const primero = (ts || []).find((t) => t.bloque_id === b.id)
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
    // sacar de cualquier bloque (y de sus tiempos, para no dejar datos colgados)
    if (actual) {
      await supabase.from('rugby_bloque_jugadores').delete()
        .eq('jugador_id', jugadorId).eq('bloque_id', actual)
      const tiemposDelBloque = tiempos.filter((t) => t.bloque_id === actual).map((t) => t.id)
      if (tiemposDelBloque.length) {
        await supabase.from('rugby_tiempo_jugadores').delete()
          .eq('jugador_id', jugadorId).in('tiempo_id', tiemposDelBloque)
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
    }
    if (nuevo) {
      await supabase.from('rugby_bloque_jugadores').insert({ bloque_id: nuevo, jugador_id: jugadorId })
    }
  }

  async function toggleEnCancha(tiempoId, jugadorId) {
    const set = enCancha[tiempoId] || new Set()
    const estaba = set.has(jugadorId)
    setEnCancha((m) => {
      const copia = { ...m, [tiempoId]: new Set(m[tiempoId] || []) }
      if (estaba) copia[tiempoId].delete(jugadorId)
      else copia[tiempoId].add(jugadorId)
      return copia
    })
    if (estaba) {
      await supabase.from('rugby_tiempo_jugadores').delete()
        .eq('tiempo_id', tiempoId).eq('jugador_id', jugadorId)
    } else {
      await supabase.from('rugby_tiempo_jugadores').insert({ tiempo_id: tiempoId, jugador_id: jugadorId })
    }
  }

  async function agregarTiempo(bloqueId) {
    const delBloque = tiempos.filter((t) => t.bloque_id === bloqueId)
    if (delBloque.length >= MAX_TIEMPOS) return
    const numero = Math.max(...delBloque.map((t) => t.numero)) + 1
    const { data } = await supabase.from('rugby_tiempos')
      .insert({ bloque_id: bloqueId, numero }).select().single()
    if (data) setTiempos((ts) => [...ts, data].sort((a, b) => a.numero - b.numero))
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
      <div className="seg">
        <button className={vista === 'bloques' ? 'activo' : ''} onClick={() => setVista('bloques')}>
          Armar bloques
        </button>
        {bloques.map((b) => (
          <button key={b.id} className={vista === b.id ? 'activo' : ''} onClick={() => setVista(b.id)}>
            {b.nombre || `Bloque ${b.numero}`} ({conteoBloque(b.id)})
          </button>
        ))}
      </div>

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

      {bloques.map((b) => vista === b.id && (
        <VistaBloque
          key={b.id}
          bloque={b}
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

function VistaBloque({ bloque, jugadores, tiempos, tiempoSel, onSelTiempo, enCancha, onToggle, onAgregarTiempo }) {
  if (!jugadores.length) {
    return (
      <div className="vacio">
        Este bloque no tiene jugadores. Asignalos en "Armar bloques".
      </div>
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
