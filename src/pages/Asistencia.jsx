import { useEffect, useState } from 'react'
import { api } from '../api.js'
import {
  descargarCSV, DIFICULTADES, esDiaDeRutina, etiquetaPartido, fechaCorta, horarioEvento, lineaBloque,
  MODALIDADES, MOTIVOS_SUSPENSION, nombreCompleto, nombreStaff, RUTINA, suspensionEvento,
} from '../helpers.js'
import { CampoSugerido, useSugerencias } from '../sugerencias.jsx'

const BLOQUE_VACIO = { rival: '', dificultad: '', lugar: '', hora_convocatoria: '' }

// Cantidad de bloques de un partido: lo normal son 2, pero puede haber más
// (el tope lo comparte el check de la tabla bloques y la API)
const CANTIDADES_BLOQUE = [1, 2, 3, 4, 5, 6]

export default function Asistencia() {
  const [eventos, setEventos] = useState([])
  const [eventoSel, setEventoSel] = useState(null)
  const [creando, setCreando] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [sugerencias, recargarSugerencias] = useSugerencias()

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
            onClick={() => setCreando({
              tipo: 'entrenamiento', modalidad: 'rutina', fecha: hoy, hora: '', hora_fin: '',
              lugar: '', notas: '', bloques: [{ ...BLOQUE_VACIO }, { ...BLOQUE_VACIO }],
            })}
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

      {eventos.map((ev) => {
        const susp = suspensionEvento(ev)
        return (
          <button
            key={ev.id}
            className="jugador-item"
            style={susp.estado === 'total' ? { opacity: 0.7 } : undefined}
            onClick={() => setEventoSel(ev)}
          >
            <div className="avatar">{ev.tipo === 'partido' ? '🏉' : '🏋️'}</div>
            <div className="crece">
              <div style={{ fontWeight: 600 }}>
                {ev.tipo === 'partido' ? etiquetaPartido(ev) : 'Entrenamiento'}
                {ev.modalidad && <span className={`badge ${ev.modalidad}`}>{MODALIDADES[ev.modalidad]}</span>}
                {susp.estado && <span className={`badge susp-${susp.estado}`}>⛔ {susp.texto}</span>}
              </div>
              <div className="mini">
                {fechaCorta(ev.fecha)}
                {horarioEvento(ev) ? ` · ${horarioEvento(ev)}` : ''}
                {ev.lugar ? ` · ${ev.lugar}` : ''}
              </div>
              {ev.tipo === 'partido' && (ev.bloques || []).map((bl) => (
                <div key={bl.numero} className="mini">{lineaBloque(bl)}</div>
              ))}
            </div>
            <span className="mini">→</span>
          </button>
        )
      })}

      {creando && (
        <div className="modal-fondo" onClick={() => setCreando(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={async (e) => {
              e.preventDefault()
              const esPartido = creando.tipo === 'partido'
              const bloque = (d, i) => ({
                numero: i + 1,
                rival: d.rival?.trim() || null,
                dificultad: d.dificultad || null,
                lugar: d.lugar?.trim() || null,
                hora_convocatoria: d.hora_convocatoria || null,
              })
              const esRutina = !esPartido && creando.modalidad === 'rutina'
              const ev = await api('eventos', {
                method: 'POST',
                body: {
                  tipo: creando.tipo,
                  modalidad: esPartido ? null : creando.modalidad,
                  fecha: creando.fecha,
                  hora: esPartido ? null : (esRutina ? RUTINA.hora : creando.hora || null),
                  hora_fin: esPartido ? null : (esRutina ? RUTINA.hora_fin : creando.hora_fin || null),
                  lugar: esPartido ? null : creando.lugar?.trim() || null,
                  notas: creando.notas?.trim() || null,
                  bloques: esPartido ? creando.bloques.map(bloque) : undefined,
                },
              })
              setCreando(null)
              await cargar()
              recargarSugerencias()
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

            {creando.tipo === 'entrenamiento' && (
              <>
                <div className="campo">
                  <label>Modalidad</label>
                  <div className="seg">
                    <button type="button" className={creando.modalidad === 'rutina' ? 'activo' : ''}
                      onClick={() => setCreando({ ...creando, modalidad: 'rutina' })}>De rutina</button>
                    <button type="button" className={creando.modalidad === 'extra' ? 'activo' : ''}
                      onClick={() => setCreando({ ...creando, modalidad: 'extra' })}>Extra</button>
                  </div>
                  <p className="mini">
                    {creando.modalidad === 'rutina'
                      ? `Lunes y miércoles de ${RUTINA.hora} a ${RUTINA.hora_fin} hs.`
                      : 'Cualquier entrenamiento fuera del horario habitual.'}
                  </p>
                </div>

                <div className="campo">
                  <label>Fecha</label>
                  <input type="date" required value={creando.fecha}
                    onChange={(e) => setCreando({ ...creando, fecha: e.target.value })} />
                </div>
                {creando.modalidad === 'extra' && (
                  <div className="grid2">
                    <div className="campo">
                      <label>Hora de inicio</label>
                      <input type="time" value={creando.hora}
                        onChange={(e) => setCreando({ ...creando, hora: e.target.value })} />
                    </div>
                    <div className="campo">
                      <label>Hora de fin</label>
                      <input type="time" value={creando.hora_fin}
                        onChange={(e) => setCreando({ ...creando, hora_fin: e.target.value })} />
                    </div>
                  </div>
                )}
                {creando.modalidad === 'rutina' && !esDiaDeRutina(creando.fecha) && (
                  <p className="aviso" style={{ marginBottom: 10 }}>
                    ⚠️ La fecha elegida no cae lunes ni miércoles. Si es un entrenamiento
                    fuera del horario habitual, marcalo como "Extra".
                  </p>
                )}
                <div className="campo">
                  <label>Lugar</label>
                  <CampoSugerido
                    placeholder="Ej.: cancha 2 TLT"
                    value={creando.lugar}
                    opciones={sugerencias.lugares}
                    onChange={(v) => setCreando({ ...creando, lugar: v })}
                  />
                </div>
              </>
            )}

            {creando.tipo === 'partido' && (
              <>
                <div className="campo">
                  <label>Fecha</label>
                  <input type="date" required value={creando.fecha}
                    onChange={(e) => setCreando({ ...creando, fecha: e.target.value })} />
                </div>
                <div className="campo">
                  <label>Cantidad de bloques</label>
                  <div className="seg">
                    {CANTIDADES_BLOQUE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={creando.bloques.length === n ? 'activo' : ''}
                        // Al cambiar la cantidad se conserva lo ya escrito en
                        // los bloques que quedan.
                        onClick={() => setCreando({
                          ...creando,
                          bloques: Array.from({ length: n }, (_, i) =>
                            creando.bloques[i] || { ...BLOQUE_VACIO }),
                        })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mini">Lo habitual son 2, pero el partido puede tener más.</p>
                </div>

                {creando.bloques.map((bl, i) => {
                  // Cambia un campo del bloque i, dejando los demás como están
                  const editar = (cambios) => setCreando({
                    ...creando,
                    bloques: creando.bloques.map((x, j) => (j === i ? { ...x, ...cambios } : x)),
                  })
                  return (
                    <div key={i} className="tarjeta" style={{ marginBottom: 10 }}>
                      <h3 style={{ marginBottom: 8 }}>Bloque {i + 1}</h3>
                      <div className="campo">
                        <label>Rival</label>
                        <CampoSugerido
                          placeholder="Ej.: Tucumán Rugby"
                          value={bl.rival}
                          opciones={sugerencias.rivales}
                          onChange={(v) => editar({ rival: v })}
                        />
                      </div>
                      <div className="campo">
                        <label>Grado de dificultad</label>
                        <div className="seg">
                          {DIFICULTADES.map((d) => (
                            <button
                              key={d.value}
                              type="button"
                              className={bl.dificultad === d.value ? 'activo' : ''}
                              // tocar la opción elegida la saca (queda sin indicar)
                              onClick={() => editar({ dificultad: bl.dificultad === d.value ? '' : d.value })}
                            >
                              {d.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid2">
                        <div className="campo">
                          <label>Hora de convocatoria</label>
                          <input type="time" value={bl.hora_convocatoria}
                            onChange={(e) => editar({ hora_convocatoria: e.target.value })} />
                        </div>
                        <div className="campo">
                          <label>Lugar de juego</label>
                          <CampoSugerido
                            placeholder="Ej.: sede Marcos Paz"
                            value={bl.lugar}
                            opciones={sugerencias.lugares}
                            onChange={(v) => editar({ lugar: v })}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
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

function TomarAsistencia({ evento: eventoInicial, onVolver }) {
  const [evento, setEvento] = useState(eventoInicial)
  const [jugadores, setJugadores] = useState([])
  const [marcas, setMarcas] = useState({})
  const [staff, setStaff] = useState([])
  const [marcasStaff, setMarcasStaff] = useState({})
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    async function cargar() {
      const [js, asis, st, asisStaff] = await Promise.all([
        api('jugadores'),
        api(`eventos/${evento.id}/asistencias`),
        api('staff'),
        api(`eventos/${evento.id}/asistencias-staff`),
      ])
      setJugadores(js.filter((j) => j.estado !== 'inactivo'))
      const m = {}
      for (const a of asis) m[a.jugador_id] = a.estado
      setMarcas(m)
      setStaff(st.filter((s) => s.activo))
      const ms = {}
      for (const a of asisStaff) ms[a.staff_email] = a.estado
      setMarcasStaff(ms)
      setCargando(false)
    }
    setErrorCarga(null)
    setCargando(true)
    cargar().catch((e) => {
      setErrorCarga(e)
      setCargando(false)
    })
  }, [evento.id, intento])

  // Ausente por defecto: tocar al jugador alterna presente/ausente
  async function marcar(jugadorId) {
    const previo = marcas[jugadorId]
    const nuevo = previo === 'presente' ? 'ausente' : 'presente'
    setMarcas((m) => ({ ...m, [jugadorId]: nuevo }))
    try {
      await api(`eventos/${evento.id}/asistencias`, {
        method: 'PUT',
        body: { marcas: [{ jugador_id: jugadorId, estado: nuevo }] },
      })
    } catch {
      setMarcas((m) => ({ ...m, [jugadorId]: previo }))
      alert('No se pudo guardar la marca. Probá de nuevo.')
    }
  }

  async function marcarStaff(email) {
    const previo = marcasStaff[email]
    const nuevo = previo === 'presente' ? 'ausente' : 'presente'
    setMarcasStaff((m) => ({ ...m, [email]: nuevo }))
    try {
      await api(`eventos/${evento.id}/asistencias-staff`, {
        method: 'PUT',
        body: { marcas: [{ staff_email: email, estado: nuevo }] },
      })
    } catch {
      setMarcasStaff((m) => ({ ...m, [email]: previo }))
      alert('No se pudo guardar la marca. Probá de nuevo.')
    }
  }

  async function marcarTodosPresentes() {
    const nuevas = {}
    for (const j of jugadores) nuevas[j.id] = 'presente'
    setMarcas(nuevas)
    await api(`eventos/${evento.id}/asistencias`, {
      method: 'PUT',
      body: { marcas: jugadores.map((j) => ({ jugador_id: j.id, estado: 'presente' })) },
    })
  }

  async function borrarEvento() {
    if (!confirm('¿Borrar este evento y su asistencia (y bloques/tiempos si es partido)?')) return
    await api(`eventos/${evento.id}`, { method: 'DELETE' })
    onVolver()
  }

  const presentes = jugadores.filter((j) => marcas[j.id] === 'presente').length
  const suspension = suspensionEvento(evento)

  function descargarEvento() {
    const titulo = evento.tipo === 'partido' ? 'partido' : 'entrenamiento'
    descargarCSV(`asistencia-${titulo}-${evento.fecha}.csv`, [
      ['Jugador', 'Asistencia'],
      ...jugadores.map((j) => [
        nombreCompleto(j),
        marcas[j.id] === 'presente' ? 'Presente' : 'Ausente',
      ]),
      ['Staff', 'Asistencia'],
      ...staff.map((s) => [
        nombreStaff(s),
        marcasStaff[s.email] === 'presente' ? 'Presente' : 'Ausente',
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
          {evento.tipo === 'partido' ? etiquetaPartido(evento) : 'Entrenamiento'}
          {evento.modalidad && <span className={`badge ${evento.modalidad}`}>{MODALIDADES[evento.modalidad]}</span>}
        </h2>
        <div className="suave">
          {fechaCorta(evento.fecha)}
          {horarioEvento(evento) ? ` · ${horarioEvento(evento)}` : ''}
          {evento.lugar ? ` · ${evento.lugar}` : ''}
        </div>
        {evento.tipo === 'partido' && (evento.bloques || []).map((bl) => (
          <div key={bl.numero} className="mini">{lineaBloque(bl)}</div>
        ))}
        {evento.notas && <p className="mini" style={{ marginTop: 6 }}>📝 {evento.notas}</p>}
        {suspension.estado && (
          <p className="aviso" style={{ marginTop: 8 }}>
            ⛔ {suspension.texto}. {suspension.estado === 'total'
              ? 'No se toma asistencia ni cuenta para los porcentajes.'
              : 'El otro bloque se juega normalmente.'}
          </p>
        )}
        <div className="fila" style={{ marginTop: 8 }}>
          <span className="mini"><b style={{ color: 'var(--ok)' }}>Presentes: {presentes}</b></span>
          <span className="mini"><b style={{ color: 'var(--bad)' }}>Ausentes: {jugadores.length - presentes}</b></span>
        </div>
      </div>

      <PanelSuspension evento={evento} onCambio={setEvento} />

      {suspension.estado === 'total' && (
        <div className="vacio">
          Evento suspendido: no hace falta tomar asistencia. Si al final se hizo,
          reactivalo arriba y marcá a los presentes.
        </div>
      )}

      {suspension.estado !== 'total' && (
        <>
          <p className="mini">
            Todos arrancan como ausentes: tocá a los que vinieron y quedan marcados
            presentes (tocá de nuevo para deshacer).
          </p>

          <button className="btn sec" onClick={marcarTodosPresentes}>
            Marcar presentes a todos
          </button>

          {cargando && <div className="vacio">Cargando…</div>}
          {errorCarga && (
            <div className="vacio">
              <p>No se pudo cargar el listado{errorCarga.detalle ? `: ${errorCarga.detalle}` : '.'}</p>
              <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setIntento((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          )}
          {jugadores.map((j) => {
            const presente = marcas[j.id] === 'presente'
            return (
              <button
                key={j.id}
                className="jugador-item compacto"
                style={presente ? { borderLeft: '4px solid var(--ok)' } : { opacity: 0.65 }}
                onClick={() => marcar(j.id)}
              >
                <div className="crece">
                  <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
                  {j.estado === 'lesionado' && <span className="badge lesionado">lesionado</span>}
                </div>
                <span style={{ fontWeight: 800, color: presente ? 'var(--ok)' : 'var(--bad)' }}>
                  {presente ? 'PRESENTE ✓' : 'AUSENTE'}
                </span>
              </button>
            )
          })}

          {!cargando && staff.length > 0 && (
            <>
              <div className="fila entre" style={{ marginTop: 12 }}>
                <h3>Staff</h3>
                <span className="mini">
                  <b style={{ color: 'var(--ok)' }}>
                    Presentes: {staff.filter((s) => marcasStaff[s.email] === 'presente').length}
                  </b>
                  {' / '}{staff.length}
                </span>
              </div>
              {staff.map((s) => {
                const presente = marcasStaff[s.email] === 'presente'
                return (
                  <button
                    key={s.email}
                    className="jugador-item compacto"
                    style={presente ? { borderLeft: '4px solid var(--ok)' } : { opacity: 0.65 }}
                    onClick={() => marcarStaff(s.email)}
                  >
                    <div className="crece">
                      <div style={{ fontWeight: 600 }}>{nombreStaff(s)}</div>
                      {s.rol && <div className="mini">{s.rol}</div>}
                    </div>
                    <span style={{ fontWeight: 800, color: presente ? 'var(--ok)' : 'var(--bad)' }}>
                      {presente ? 'PRESENTE ✓' : 'AUSENTE'}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </>
      )}
    </div>
  )
}

// Suspensión del evento. En un entrenamiento se suspende todo; en un partido,
// bloque por bloque (puede caerse uno solo y jugarse el otro).
function PanelSuspension({ evento, onCambio }) {
  const esPartido = evento.tipo === 'partido'

  async function guardarEvento(cambios) {
    onCambio(await api(`eventos/${evento.id}`, { method: 'PUT', body: cambios }))
  }

  async function guardarBloque(bloqueId, cambios) {
    const nuevo = await api(`partido/bloque/${bloqueId}`, { method: 'PUT', body: cambios })
    onCambio({
      ...evento,
      bloques: (evento.bloques || []).map((x) => (x.id === nuevo.id ? nuevo : x)),
    })
  }

  return (
    <div className="tarjeta">
      <h3>Suspensión</h3>
      {esPartido ? (
        <>
          <p className="mini">
            Se puede suspender un bloque solo: el otro sigue jugándose y cuenta
            para la asistencia.
          </p>
          {(evento.bloques || []).map((bl) => (
            <FormSuspension
              key={bl.id}
              titulo={`Bloque ${bl.numero}${bl.rival ? ` · vs ${bl.rival}` : ''}`}
              item={bl}
              onGuardar={(cambios) => guardarBloque(bl.id, cambios)}
            />
          ))}
          {!(evento.bloques || []).length && (
            <p className="mini">Abrí el partido en "Día de partido" para generar los bloques.</p>
          )}
        </>
      ) : (
        <FormSuspension titulo="Entrenamiento" item={evento} onGuardar={guardarEvento} />
      )}
    </div>
  )
}

function FormSuspension({ titulo, item, onGuardar }) {
  const [abierto, setAbierto] = useState(false)
  const [motivo, setMotivo] = useState(item.motivo_suspension || 'clima')
  const [nota, setNota] = useState(item.nota_suspension || '')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setMotivo(item.motivo_suspension || 'clima')
    setNota(item.nota_suspension || '')
    setAbierto(false)
  }, [item.suspendido, item.motivo_suspension, item.nota_suspension])

  const cambiado = motivo !== (item.motivo_suspension || 'clima') ||
    nota.trim() !== (item.nota_suspension || '')

  async function accion(cambios) {
    setGuardando(true)
    try {
      await onGuardar(cambios)
    } catch {
      alert('No se pudo guardar. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="suspension-item">
      <div className="fila entre">
        <b>{titulo}</b>
        <span className={`badge ${item.suspendido ? 'susp-total' : 'activo'}`}>
          {item.suspendido ? '⛔ Suspendido' : 'Se realiza'}
        </span>
      </div>

      {!item.suspendido && !abierto && (
        <button className="btn sec chico" style={{ marginTop: 8 }} onClick={() => setAbierto(true)}>
          Suspender
        </button>
      )}

      {(item.suspendido || abierto) && (
        <>
          <div className="campo" style={{ marginTop: 8 }}>
            <label>Motivo</label>
            <select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
              {MOTIVOS_SUSPENSION.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Notas</label>
            <textarea
              placeholder="Ej.: cancha anegada, se recupera el viernes"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
          <div className="fila">
            {item.suspendido ? (
              <>
                <button
                  className="btn chico"
                  disabled={!cambiado || guardando}
                  onClick={() => accion({ motivo_suspension: motivo, nota_suspension: nota.trim() || null })}
                >
                  Guardar cambios
                </button>
                <button className="btn sec chico" disabled={guardando}
                  onClick={() => accion({ suspendido: false })}>
                  Reactivar
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn peligro chico"
                  disabled={guardando}
                  onClick={() => accion({
                    suspendido: true,
                    motivo_suspension: motivo,
                    nota_suspension: nota.trim() || null,
                  })}
                >
                  Confirmar suspensión
                </button>
                <button className="btn sec chico" onClick={() => setAbierto(false)}>Cancelar</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
