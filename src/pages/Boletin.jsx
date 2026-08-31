import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { compartirArchivo } from '../pdf.js'
import {
  contraElPromedio, diaCorto, generarBoletinPDF, mensajeDelMes, mesCorto,
  nombreArchivoBoletin, nombreDelJugador, puestosDelJugador, textoLesion,
  tituloDelMes, ultimosMeses,
} from '../boletin.js'

// Boletín mensual de desempeño, escrito para el propio jugador. Solo
// asistencia y rugby jugado: nunca muestra nada de las evaluaciones.
export default function Boletin({ jugadorId = null, yo, onVolver }) {
  const meses = ultimosMeses(12)
  const [mes, setMes] = useState(meses[0])
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [verDe, setVerDe] = useState(jugadorId)
  const [compartiendo, setCompartiendo] = useState('')

  async function cargar(m = mes) {
    setCargando(true)
    setError('')
    try {
      const ruta = jugadorId ? `boletin/${jugadorId}?mes=${m}` : `boletin?mes=${m}`
      setDatos(await api(ruta))
    } catch {
      setError('No se pudo armar el boletín. Probá de nuevo.')
    }
    setCargando(false)
  }
  useEffect(() => { cargar() }, [mes])

  async function compartir(b = null) {
    const lista = b ? [b] : datos.jugadores
    if (!lista.length) return
    setCompartiendo(b ? b.jugador.id : 'todos')
    try {
      const blob = generarBoletinPDF({
        mes: datos.mes,
        division: datos.division,
        jugadores: lista,
        generadoPor: yo?.nombre || yo?.email,
      })
      await compartirArchivo(
        blob,
        nombreArchivoBoletin(datos.mes, b),
        b ? `Boletín de ${nombreDelJugador(b)} · ${tituloDelMes(datos.mes)}`
          : `Boletines de ${tituloDelMes(datos.mes)}`)
    } catch {
      setError('No se pudo generar el PDF.')
    }
    setCompartiendo('')
  }

  const elegido = datos?.jugadores.find((b) => b.jugador.id === verDe) ||
    (jugadorId ? datos?.jugadores[0] : null)

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Volver</button>
        <select
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: '6px 8px' }}
        >
          {meses.map((m) => <option key={m} value={m}>{tituloDelMes(m)}</option>)}
        </select>
      </div>

      {cargando && <div className="vacio">Armando el boletín…</div>}
      {error && <div className="error">{error}</div>}

      {!cargando && datos && !datos.jugadores.length && (
        <div className="vacio">No hay jugadores activos para este mes.</div>
      )}

      {!cargando && datos && datos.division.eventos === 0 && (
        <div className="vacio">
          En {tituloDelMes(datos.mes).toLowerCase()} no hubo eventos con asistencia
          tomada, así que todavía no hay nada para contar.
        </div>
      )}

      {!cargando && datos && datos.division.eventos > 0 && !elegido && (
        <>
          <div className="tarjeta">
            <h3>Boletines de {tituloDelMes(datos.mes).toLowerCase()}</h3>
            <p className="mini" style={{ margin: '4px 0 8px' }}>
              {datos.division.eventos} eventos con asistencia tomada ·
              promedio de la división {datos.division.promedio}% ·
              {' '}{datos.jugadores.length} jugadores.
              {!datos.division.hay_ranking && ' Mes con pocos eventos: sale sin ranking ni distinciones.'}
            </p>
            <button
              className="btn"
              style={{ width: '100%' }}
              disabled={compartiendo === 'todos'}
              onClick={() => compartir()}
            >
              {compartiendo === 'todos' ? 'Armando el PDF…' : '📄 Un PDF con todos (una hoja cada uno)'}
            </button>
          </div>

          {datos.jugadores.map((b) => (
            <button key={b.jugador.id} className="jugador-item" onClick={() => setVerDe(b.jugador.id)}>
              <div className="avatar">{b.jugador.nombre[0]}{b.jugador.apellido[0]}</div>
              <div className="crece">
                <div style={{ fontWeight: 600 }}>{b.jugador.apellido}, {b.jugador.nombre}</div>
                <div className="mini">
                  {b.asistencia.total == null ? 'sin eventos' : `${b.asistencia.total}% de asistencia`}
                  {b.puesto_ranking ? ` · ${b.puesto_ranking}.º de ${b.de_cuantos}` : ''}
                  {b.distinciones.length ? ` · ${b.distinciones.length} ${b.distinciones.length === 1 ? 'distinción' : 'distinciones'}` : ''}
                </div>
              </div>
              <span className="mini">→</span>
            </button>
          ))}
        </>
      )}

      {!cargando && elegido && (
        <>
          {!jugadorId && (
            <button className="btn sec chico" onClick={() => setVerDe(null)}>
              ← Todos los jugadores
            </button>
          )}
          <Hoja b={elegido} mes={datos.mes} division={datos.division} />
          <button
            className="btn"
            style={{ width: '100%' }}
            disabled={compartiendo === elegido.jugador.id}
            onClick={() => compartir(elegido)}
          >
            {compartiendo === elegido.jugador.id ? 'Armando el PDF…' : '📤 Compartir el PDF'}
          </button>
        </>
      )}
    </div>
  )
}

// La hoja tal como sale impresa, para revisarla antes de compartirla
function Hoja({ b, mes, division }) {
  const a = b.asistencia
  const { principal, otros } = puestosDelJugador(b)
  const lesion = textoLesion(b)
  const diferencia = contraElPromedio(b, division.promedio)
  const arriba = a.total != null && division.promedio != null && a.total >= division.promedio

  return (
    <div className="tarjeta hoja-boletin">
      <div className="boletin-cabecera">
        <div>
          <div className="boletin-kicker">Boletín del mes</div>
          <h2>{tituloDelMes(mes)}</h2>
        </div>
        <div className="mini">Rugby M12 · Tucumán Lawn Tennis</div>
      </div>

      <div className="fila entre" style={{ marginTop: 12 }}>
        <h3 style={{ fontSize: '1.15rem' }}>{nombreDelJugador(b)}</h3>
        <span className="mini">
          {[principal, otros.length ? `también: ${otros.join(', ')}` : null].filter(Boolean).join(' · ')}
        </span>
      </div>

      {lesion && <div className="boletin-nota">{lesion}</div>}

      <div className="stat-grid" style={{ marginTop: 12 }}>
        <div className="stat">
          <div className="valor">{a.total == null ? '—' : `${a.total}%`}</div>
          <div className="etiqueta">Asistencia total</div>
          <div className="mini">{a.presentes} de {a.contables}</div>
        </div>
        <div className="stat">
          <div className="valor">{a.entrenamientos == null ? '—' : `${a.entrenamientos}%`}</div>
          <div className="etiqueta">Entrenamientos</div>
          <div className="mini">{a.entrenamientos_presentes} de {a.entrenamientos_contables}</div>
        </div>
        <div className="stat">
          <div className="valor">{a.partidos == null ? '—' : `${a.partidos}%`}</div>
          <div className="etiqueta">Partidos</div>
          <div className="mini">{a.partidos_presentes} de {a.partidos_contables}</div>
        </div>
        <div className="stat">
          <div className="valor">{b.puesto_ranking ? `${b.puesto_ranking}.º` : '—'}</div>
          <div className="etiqueta">En la división</div>
          <div className="mini">entre {b.de_cuantos} jugadores</div>
        </div>
      </div>

      <h4 className="boletin-titulo">Vos y el resto de la M12</h4>
      <Barra rotulo="Vos" valor={a.total} propia />
      <Barra rotulo="Promedio de la división" valor={division.promedio} />
      {diferencia && (
        <div className="mini" style={{ marginTop: 4, fontWeight: 700, color: arriba ? 'var(--ok)' : 'var(--warn)' }}>
          {diferencia}
        </div>
      )}
      {b.anio.total != null && (
        <div className="mini" style={{ marginTop: 4 }}>
          En el año: vos <b>{b.anio.total}%</b>, la división {b.anio.promedio_division}%
          {b.anio.puesto ? <> · vas <b>{b.anio.puesto}.º de {b.anio.de_cuantos}</b></> : null}
        </div>
      )}

      <h4 className="boletin-titulo">Cómo venís mes a mes</h4>
      <div className="boletin-meses">
        {b.evolucion.map((m) => (
          <div key={m.mes} className={`boletin-mes ${m.mes === mes ? 'actual' : ''}`}>
            <span className="pct">{m.jugador == null ? '—' : `${m.jugador}%`}</span>
            <span className="par">
              <span className="vos" style={{ height: `${(m.jugador || 0) * 0.46}px` }} />
              <span className="division" style={{ height: `${(m.division || 0) * 0.46}px` }} />
            </span>
            <span className="nombre">{mesCorto(m.mes)}</span>
          </div>
        ))}
      </div>

      {b.distinciones.length > 0 && (
        <>
          <h4 className="boletin-titulo">Lo que te ganaste</h4>
          <div className="boletin-medallas">
            {b.distinciones.map((d) => (
              <div key={d.tipo} className="boletin-medalla">
                <span className="marca">{d.marca}</span>
                <span className="texto"><b>{d.titulo}</b><small>{d.detalle}</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="boletin-dos">
        <div>
          <h4 className="boletin-titulo">Tu rugby de este mes</h4>
          <Lista filas={[
            ['Partidos jugados', b.juego.partidos_jugados],
            ['Tiempos en cancha', b.juego.tiempos_posibles
              ? `${b.juego.tiempos_jugados} de ${b.juego.tiempos_posibles}`
              : b.juego.tiempos_jugados],
            ['Camisetas que usaste', b.juego.camisetas.length
              ? b.juego.camisetas.map((c) => `${c.puesto} (${c.tiempos})`).join(' · ') : '—'],
            ['Prestado al rival', b.juego.prestado === 0 ? 'ninguna vez'
              : b.juego.prestado === 1 ? '1 vez' : `${b.juego.prestado} veces`],
            ['Capitán en el año', b.juego.capitanias_anio],
          ]} />
        </div>
        <div>
          <h4 className="boletin-titulo">Puntualidad y avisos</h4>
          <Lista filas={[
            ['Llegadas tarde', b.puntualidad.tarde.length
              ? `${b.puntualidad.tarde.length} · ${b.puntualidad.tarde.map(diaCorto).join(' · ')}` : 'ninguna'],
            ['Dijiste que ibas al partido y no fuiste', b.puntualidad.falto_avisando.length
              ? `${b.puntualidad.falto_avisando.length} · ${b.puntualidad.falto_avisando.map((f) => diaCorto(f.fecha)).join(' · ')}`
              : 'ninguna vez'],
            ['Golpes en el mes', b.puntualidad.golpes.length
              ? `${b.puntualidad.golpes.length} · ${b.puntualidad.golpes.map((g) => diaCorto(g.fecha)).join(' · ')}`
              : 'ninguno'],
          ]} />
        </div>
      </div>

      <h4 className="boletin-titulo">Día por día</h4>
      <div className="boletin-agenda">
        {b.dias.map((d) => (
          <div key={d.fecha + d.tipo} className="boletin-dia">
            <span className="fecha">{diaCorto(d.fecha)}</span>
            <span className="crece" style={{ minWidth: 0 }}>
              {d.tipo === 'partido' ? `Partido${d.rival ? ` vs ${d.rival}` : ''}` : 'Entrenamiento'}
              {apuntesDelDia(d) && <div className="apunte">{apuntesDelDia(d)}</div>}
            </span>
            <span className={`marca ${d.excluido ? 'lesion' : d.presente ? 'fue' : 'falto'}`}>
              {d.excluido ? 'Lesión' : d.presente ? 'Sí' : 'No'}
            </span>
          </div>
        ))}
      </div>

      <div className="boletin-pie">{mensajeDelMes(b, division)}</div>
    </div>
  )
}

function apuntesDelDia(d) {
  const apuntes = []
  if (d.tarde) apuntes.push('llegaste tarde')
  if (d.falto_avisando) apuntes.push('habías avisado que ibas')
  if (d.capitan) apuntes.push('capitán')
  if (d.tiempos) apuntes.push(`${d.tiempos} ${d.tiempos === 1 ? 'tiempo' : 'tiempos'}`)
  return apuntes.join(' · ')
}

function Barra({ rotulo, valor, propia = false }) {
  return (
    <div className="boletin-barra">
      <span className={propia ? 'quien propia' : 'quien'}>{rotulo}</span>
      <span className="pista">
        <span className={propia ? 'relleno' : 'relleno suave'} style={{ width: `${valor || 0}%` }} />
      </span>
      <span className="cifra">{valor == null ? '—' : `${valor}%`}</span>
    </div>
  )
}

function Lista({ filas }) {
  return (
    <div className="boletin-lista">
      {filas.map(([rotulo, valor]) => (
        <div key={rotulo}>
          <span className="rot">{rotulo}</span>
          <span className="val">{valor}</span>
        </div>
      ))}
    </div>
  )
}
