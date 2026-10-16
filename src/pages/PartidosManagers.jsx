import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { irA, leerHash, reponer, suscribir } from '../navegacion.js'
import { etiquetaPartido, fechaCorta } from '../helpers.js'
import { Convocatoria, ultimoCreado } from './Partidos.jsx'

// Menú Partidos para los managers (alcance administrativo): solo la solapa
// Convocatoria, para marcar quién avisó que va. Todo sale de `convocatoria/...`
// en la API, que no devuelve nada más del partido (bloques, asistencia del
// día, tiempos) ni deja suspenderlo, editarlo o borrarlo.
export default function PartidosManagers() {
  const [partidos, setPartidos] = useState(null)
  const [partidoId, setPartidoId] = useState('')

  useEffect(() => {
    api('convocatoria').then((ps) => {
      setPartidos(ps)
      if (!ps.length) return
      // El del hash manda (recarga o link directo); si no, el último creado
      const [, hashId] = leerHash()
      const elegido = (ps.some((x) => x.id === hashId) && hashId) || ultimoCreado(ps).id
      reponer('partidos', elegido)
      setPartidoId(elegido)
    }).catch(() => setPartidos([]))
  }, [])

  // Botón "atrás" o link directo: el partido sale del hash
  useEffect(() => suscribir(() => {
    const [seccion, id] = leerHash()
    if (seccion === 'partidos' && id) setPartidoId(id)
  }), [])

  if (!partidos) return <div className="vacio">Cargando…</div>

  if (!partidos.length) {
    return (
      <div className="contenido">
        <h2>Partidos</h2>
        <div className="vacio">Todavía no hay partidos cargados.</div>
      </div>
    )
  }

  const partido = partidos.find((p) => p.id === partidoId)

  return (
    <div className="contenido">
      <div className="campo">
        <label>Partido</label>
        <select value={partidoId} onChange={(e) => irA('partidos', e.target.value)}>
          {partidos.map((p) => (
            <option key={p.id} value={p.id}>
              {fechaCorta(p.fecha)} · {etiquetaPartido(p)}
            </option>
          ))}
        </select>
      </div>
      {partido && <ConvocatoriaManagers key={partido.id} partido={partido} />}
    </div>
  )
}

function ConvocatoriaManagers({ partido }) {
  const [jugadores, setJugadores] = useState(null)
  const [confirmacion, setConfirmacion] = useState({})

  async function cargar() {
    const d = await api(`convocatoria/${partido.id}`)
    const m = {}
    for (const c of d.confirmaciones) m[c.jugador_id] = c.estado
    setConfirmacion(m)
    setJugadores(d.jugadores)
  }

  useEffect(() => {
    cargar().catch(() => setJugadores([]))
    // Al volver a la app se trae lo que hayan marcado otros
    const alVolver = () => { if (!document.hidden) cargar().catch(() => {}) }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [partido.id])

  // Misma lógica que en la pantalla de los entrenadores: se aplica al toque y
  // se vuelve atrás si el servidor no lo guardó
  async function marcar(jugadorId, estado) {
    const previo = confirmacion[jugadorId] || null
    const aplicar = (valor) => setConfirmacion((m) => {
      const c = { ...m }
      if (valor) c[jugadorId] = valor
      else delete c[jugadorId]
      return c
    })
    aplicar(estado)
    try {
      await api(`convocatoria/${partido.id}`, {
        method: 'PUT',
        body: { marcas: [{ jugador_id: jugadorId, estado: estado || null }] },
      })
    } catch {
      aplicar(previo)
      alert('No se pudo guardar la convocatoria. Probá de nuevo.')
    }
  }

  if (!jugadores) return <div className="vacio">Cargando convocatoria…</div>

  return (
    <Convocatoria
      soloConvocar
      partido={partido}
      jugadores={jugadores}
      confirmacion={confirmacion}
      onConfirmar={marcar}
    />
  )
}
