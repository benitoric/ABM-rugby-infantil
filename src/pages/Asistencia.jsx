import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { descargarCSV, fechaCorta, nombreCompleto, ESTADOS_ASISTENCIA } from '../helpers.js'

export default function Asistencia() {
  const [eventos, setEventos] = useState([])
  const [eventoSel, setEventoSel] = useState(null)
  const [creando, setCreando] = useState(null)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    setEventos(await api('eventos'))
    setCargando(false)
  }
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  if (eventoSel) {
    return <TomarAsistencia evento={eventoSel} onVolver={() => { setEventoSel(null); cargar() }} />
  }

  const hoy = new Date().toISOString().slice(0, 10)

  async function descargarResumen() {
    const stats = await api('stats/asistencia')
    const pct = (p, t) => (t ? `${Math.round((100 * p) / t)}%` : '—')
    descargarCSV('asistencia-resumen.csv', [
      ['Jugador', 'Entrenamientos asistidos', 'Entrenamientos totales', '% Entren.', 'Partidos asistidos', 'Partidos totales', '% Partidos'],
      ...stats.map((s) => [
        `${s.apellido}, ${s.nombre}`,
        s.entrenamientos_presentes, s.entrenamientos_total, pct(s.entrenamientos_presentes, s.entrenamientos_total),
        s.partidos_presentes, s.partidos_total, pct(s.partidos_presentes, s.partidos_total),
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Eventos</h2>
        <div className="fila">
          <button className="btn sec" onClick={descargarResumen}>Resumen CSV</button>
          <button
            className="btn"
            onClick={() => setCreando({ tipo: 'entrenamiento', fecha: hoy, hora: '', rival: '', lugar: '', notas: '' })}
          >
            + Nuevo evento
          </button>
        </div>
      </div>

      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && eventos.length === 0 && (
        <div className="vacio">
          Todavía no hay eventos. Creá un entrenamiento o partido para tomar asistencia.
        </div>
      )}

      {eventos.map((ev) => (
        <button key={ev.id} className="jugador-item" onClick={() => setEventoSel(ev)}>
          <div className="avatar">{ev.tipo === 'partido' ? '🏉' : '🏋️'}</div>
          <div className="crece">
            <div style={{ fontWeight: 600 }}>
              {ev.tipo === 'partido' ? `Partido${ev.rival ? ` vs ${ev.rival}` : ''}` : 'Entrenamiento'}
            </div>
            <div className="mini">
              {fechaCorta(ev.fecha)}
              {ev.hora ? ` · ${ev.hora.slice(0, 5)} hs` : ''}
              {ev.lugar ? ` · ${ev.lugar}` : ''}
            </div>
          </div>
          <span className="mini">→</span>
        </button>
      ))}

      {creando && (
        <div className="modal-fondo" onClick={() => setCreando(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const ev = await api('eventos', {
                method: 'POST',
                body: {
                  tipo: creando.tipo,
                  fecha: creando.fecha,
                  hora: creando.hora || null,
                  rival: creando.tipo === 'partido' ? creando.rival?.trim() || null : null,
                  lugar: creando.lugar?.trim() || null,
                  notas: creando.notas?.trim() || null,
                },
              })
              setCreando(null)
              await cargar()
              setEventoSel(ev)
            }}
          >
            <div className="fila entre" style={{ marginBottom: 12 }}>
              <h3>Nuevo evento</h3>
              <button type="button" className="btn sec chico" onClick={() => setCreando(null)}>Cerrar</button>
            </div>

            <div className="campo">
              <label>Tipo</label>
              <div className="seg">
                <button type="button" className={creando.tipo === 'entrenamiento' ? 'activo' : ''}
                  onClick={() => setCreando({ ...creando, tipo: 'entrenamiento' })}>Entrenamiento</button>
                <button type="button" className={creando.tipo === 'partido' ? 'activo' : ''}
                  onClick={() => setCreando({ ...creando, tipo: 'partido' })}>Partido</button>
              </div>
            </div>

            <div className="grid2">
              <div className="campo">
                <label>Fecha</label>
                <input type="date" required value={creando.fecha}
                  onChange={(e) => setCreando({ ...creando, fecha: e.target.value })} />
              </div>
              <div className="campo">
                <label>Hora</label>
                <input type="time" value={creando.hora}
                  onChange={(e) => setCreando({ ...creando, hora: e.target.value })} />
              </div>
            </div>

            {creando.tipo === 'partido' && (
              <div className="campo">
                <label>Rival</label>
                <input placeholder="Ej.: Tucumán Rugby" value={creando.rival}
                  onChange={(e) => setCreando({ ...creando, rival: e.target.value })} />
              </div>
            )}
            <div className="campo">
              <label>Lugar</label>
              <input placeholder="Ej.: cancha 2 TLT" value={creando.lugar}
                onChange={(e) => setCreando({ ...creando, lugar: e.target.value })} />
            </div>
            <div className="campo">
              <label>Notas</label>
              <textarea value={creando.notas}
                onChange={(e) => setCreando({ ...creando, notas: e.target.value })} />
            </div>

            <button className="btn" style={{ width: '100%' }}>Crear evento</button>
          </form>
        </div>
      )}
    </div>
  )
}

function TomarAsistencia({ evento, onVolver }) {
  const [jugadores, setJugadores] = useState([])
  const [marcas, setMarcas] = useState({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargar() {
      const [js, asis] = await Promise.all([
        api('jugadores'),
        api(`eventos/${evento.id}/asistencias`),
      ])
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      const m = {}
      for (const a of asis) m[a.jugador_id] = a.estado
      setMarcas(m)
      setCargando(false)
    }
    cargar()
  }, [evento.id])

  async function marcar(jugadorId, estado) {
    const anterior = marcas[jugadorId]
    const nuevo = anterior === estado ? null : estado
    setMarcas((m) => ({ ...m, [jugadorId]: nuevo }))
    await api(`eventos/${evento.id}/asistencias`, {
      method: 'PUT',
      body: { marcas: [{ jugador_id: jugadorId, estado: nuevo }] },
    })
  }

  async function marcarTodosPresentes() {
    const nuevas = {}
    for (const j of jugadores) nuevas[j.id] = marcas[j.id] || 'presente'
    setMarcas(nuevas)
    await api(`eventos/${evento.id}/asistencias`, {
      method: 'PUT',
      body: { marcas: jugadores.map((j) => ({ jugador_id: j.id, estado: nuevas[j.id] })) },
    })
  }

  async function borrarEvento() {
    if (!confirm('¿Borrar este evento y su asistencia (y bloques/tiempos si es partido)?')) return
    await api(`eventos/${evento.id}`, { method: 'DELETE' })
    onVolver()
  }

  const conteo = Object.values(marcas).filter(Boolean).reduce((acc, e) => {
    acc[e] = (acc[e] || 0) + 1
    return acc
  }, {})

  function descargarEvento() {
    const titulo = evento.tipo === 'partido' ? `partido${evento.rival ? `-vs-${evento.rival}` : ''}` : 'entrenamiento'
    descargarCSV(`asistencia-${titulo}-${evento.fecha}.csv`, [
      ['Jugador', 'Asistencia'],
      ...jugadores.map((j) => [
        nombreCompleto(j),
        ESTADOS_ASISTENCIA.find((e) => e.value === marcas[j.id])?.title || 'Sin marcar',
      ]),
    ])
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <div className="fila">
          <button className="btn sec chico" onClick={descargarEvento}>Descargar CSV</button>
          <button className="btn peligro chico" onClick={borrarEvento}>Borrar evento</button>
        </div>
      </div>

      <div className="tarjeta">
        <h2>
          {evento.tipo === 'partido' ? `Partido${evento.rival ? ` vs ${evento.rival}` : ''}` : 'Entrenamiento'}
        </h2>
        <div className="suave">
          {fechaCorta(evento.fecha)}
          {evento.hora ? ` · ${evento.hora.slice(0, 5)} hs` : ''}
          {evento.lugar ? ` · ${evento.lugar}` : ''}
        </div>
        {evento.notas && <p className="mini" style={{ marginTop: 6 }}>📝 {evento.notas}</p>}
        <div className="fila" style={{ marginTop: 8 }}>
          {ESTADOS_ASISTENCIA.map((e) => (
            <span key={e.value} className="mini">
              <b style={{ color: e.color }}>{e.label}</b> {e.title}: {conteo[e.value] || 0}
            </span>
          ))}
        </div>
      </div>

      <button className="btn sec" onClick={marcarTodosPresentes}>
        Marcar presentes a todos los que faltan marcar
      </button>

      {cargando && <div className="vacio">Cargando…</div>}
      {jugadores.map((j) => (
        <div key={j.id} className="jugador-item" style={{ cursor: 'default' }}>
          <div className="crece">
            <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
            {j.estado === 'lesionado' && <span className="badge lesionado">lesionado</span>}
          </div>
          <div className="asis-botones">
            {ESTADOS_ASISTENCIA.map((e) => (
              <button
                key={e.value}
                className={`asis-btn ${marcas[j.id] === e.value ? 'sel' : ''}`}
                style={marcas[j.id] === e.value ? { background: e.color } : {}}
                title={e.title}
                onClick={() => marcar(j.id, e.value)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
