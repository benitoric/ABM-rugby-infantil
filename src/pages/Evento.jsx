import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { esDiaDeRutina, DIFICULTADES, MOTIVOS_SUSPENSION, RUTINA } from '../helpers.js'
import { CampoSugerido } from '../sugerencias.jsx'

// Alta, edición y suspensión de un evento. Lo comparten las dos pantallas que
// manejan eventos: Entrenamientos (que crea y edita entrenamientos) y Partidos
// (que hace lo propio con los partidos, desde la pestaña Convocatoria).

const BLOQUE_VACIO = { rival: '', dificultad: '', lugar: '', hora_convocatoria: '' }

// Cantidad de bloques de un partido: lo normal son 2, pero puede haber más
// (el tope lo comparte el check de la tabla bloques y la API)
const CANTIDADES_BLOQUE = [1, 2, 3, 4, 5, 6]

// Estado inicial del formulario: en blanco para un alta, o con los datos del
// evento que se está editando.
function estadoInicial(evento, tipo) {
  if (!evento) {
    return {
      tipo,
      modalidad: 'rutina',
      fecha: new Date().toISOString().slice(0, 10),
      hora: '',
      hora_fin: '',
      lugar: '',
      notas: '',
      plazas_manual: '',
      bloques: [{ ...BLOQUE_VACIO }, { ...BLOQUE_VACIO }],
    }
  }
  return {
    tipo: evento.tipo,
    // Los entrenamientos viejos no tienen modalidad: queda sin elegir hasta
    // que alguien la marque, en vez de inventarle una.
    modalidad: evento.modalidad || '',
    fecha: evento.fecha,
    hora: (evento.hora || '').slice(0, 5),
    hora_fin: (evento.hora_fin || '').slice(0, 5),
    lugar: evento.lugar || '',
    notas: evento.notas || '',
    plazas_manual: evento.plazas_manual == null ? '' : String(evento.plazas_manual),
    bloques: (evento.bloques || []).map((b) => ({
      id: b.id,
      cerrado: !!b.cerrado_en,
      rival: b.rival || '',
      dificultad: b.dificultad || '',
      lugar: b.lugar || '',
      hora_convocatoria: (b.hora_convocatoria || '').slice(0, 5),
    })),
  }
}

// Alta y edición de un evento. Con `evento` edita ese; sin él, crea uno nuevo.
// Al editar no se cambian el tipo ni la cantidad de bloques: de esa estructura
// ya cuelgan la asistencia, los equipos y los tiempos.
export function FormEvento({
  evento = null, tipo = 'entrenamiento', sugerencias, onCerrar, onGuardado,
}) {
  const editando = !!evento
  const [f, setF] = useState(() => estadoInicial(evento, tipo))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const esPartido = f.tipo === 'partido'
  const esRutina = !esPartido && f.modalidad === 'rutina'
  const editar = (cambios) => setF({ ...f, ...cambios })
  const editarBloque = (i, cambios) => setF({
    ...f,
    bloques: f.bloques.map((x, j) => (j === i ? { ...x, ...cambios } : x)),
  })

  // Campos del evento, con el horario fijo de la rutina ya resuelto
  function datosEvento() {
    return {
      modalidad: esPartido ? null : f.modalidad || null,
      fecha: f.fecha,
      hora: esPartido ? null : (esRutina ? RUTINA.hora : f.hora || null),
      hora_fin: esPartido ? null : (esRutina ? RUTINA.hora_fin : f.hora_fin || null),
      lugar: esPartido ? null : f.lugar?.trim() || null,
      notas: f.notas?.trim() || null,
      plazas_manual: f.plazas_manual === '' ? null : Number(f.plazas_manual),
    }
  }

  function datosBloque(d) {
    return {
      rival: d.rival?.trim() || null,
      dificultad: d.dificultad || null,
      lugar: d.lugar?.trim() || null,
      hora_convocatoria: d.hora_convocatoria || null,
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    setGuardando(true)
    try {
      if (!editando) {
        const ev = await api('eventos', {
          method: 'POST',
          body: {
            tipo: f.tipo,
            ...datosEvento(),
            bloques: esPartido ? f.bloques.map(datosBloque) : undefined,
          },
        })
        onGuardado(ev)
        return
      }
      // Primero los bloques que cambiaron (los intactos no se tocan, así un
      // bloque ya cerrado no molesta), y al final el evento, que vuelve con
      // los bloques al día.
      for (const [i, bl] of f.bloques.entries()) {
        const antes = datosBloque(estadoInicial(evento).bloques[i])
        const ahora = datosBloque(bl)
        const cambios = Object.fromEntries(
          Object.entries(ahora).filter(([k, v]) => v !== antes[k]))
        if (Object.keys(cambios).length) {
          await api(`partido/bloque/${bl.id}`, { method: 'PUT', body: cambios })
        }
      }
      onGuardado(await api(`eventos/${evento.id}`, { method: 'PUT', body: datosEvento() }))
    } catch (err) {
      setError(err?.error === 'bloque_cerrado'
        ? 'Ese bloque está cerrado: para cambiarle los datos hay que reabrirlo desde "Día de partido".'
        : 'No se pudo guardar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 12 }}>
          <h3>
            {editando ? 'Editar' : 'Nuevo'} {esPartido ? 'partido' : 'entrenamiento'}
          </h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>

        {!esPartido && (
          <>
            <div className="campo">
              <label>Modalidad</label>
              <div className="seg">
                <button type="button" className={esRutina ? 'activo' : ''}
                  onClick={() => editar({ modalidad: 'rutina' })}>De rutina</button>
                <button type="button" className={f.modalidad === 'extra' ? 'activo' : ''}
                  onClick={() => editar({ modalidad: 'extra' })}>Extra</button>
              </div>
              <p className="mini">
                {esRutina
                  ? `Lunes y miércoles de ${RUTINA.hora} a ${RUTINA.hora_fin} hs.`
                  : f.modalidad === 'extra'
                    ? 'Cualquier entrenamiento fuera del horario habitual.'
                    : 'Sin indicar. Elegí una para que quede clasificado.'}
              </p>
            </div>

            <div className="campo">
              <label>Fecha</label>
              <input type="date" required value={f.fecha}
                onChange={(e) => editar({ fecha: e.target.value })} />
            </div>
            {!esRutina && (
              <div className="grid2">
                <div className="campo">
                  <label>Hora de inicio</label>
                  <input type="time" value={f.hora}
                    onChange={(e) => editar({ hora: e.target.value })} />
                </div>
                <div className="campo">
                  <label>Hora de fin</label>
                  <input type="time" value={f.hora_fin}
                    onChange={(e) => editar({ hora_fin: e.target.value })} />
                </div>
              </div>
            )}
            {esRutina && !esDiaDeRutina(f.fecha) && (
              <p className="aviso" style={{ marginBottom: 10 }}>
                ⚠️ La fecha elegida no cae lunes ni miércoles. Si es un entrenamiento
                fuera del horario habitual, marcalo como "Extra".
              </p>
            )}
            <div className="campo">
              <label>Lugar</label>
              <CampoSugerido
                placeholder="Ej.: cancha 2 TLT"
                value={f.lugar}
                opciones={sugerencias.lugares}
                onChange={(v) => editar({ lugar: v })}
              />
            </div>
          </>
        )}

        {esPartido && (
          <>
            <div className="campo">
              <label>Fecha</label>
              <input type="date" required value={f.fecha}
                onChange={(e) => editar({ fecha: e.target.value })} />
            </div>
            <div className="campo">
              <label>Cantidad de bloques</label>
              {editando ? (
                <p className="mini">
                  {f.bloques.length} {f.bloques.length === 1 ? 'bloque' : 'bloques'} · no se
                  agregan ni se quitan después de creado el partido.
                </p>
              ) : (
                <>
                  <div className="seg">
                    {CANTIDADES_BLOQUE.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={f.bloques.length === n ? 'activo' : ''}
                        // Al cambiar la cantidad se conserva lo ya escrito en
                        // los bloques que quedan.
                        onClick={() => editar({
                          bloques: Array.from({ length: n }, (_, i) =>
                            f.bloques[i] || { ...BLOQUE_VACIO }),
                        })}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="mini">Lo habitual son 2, pero el partido puede tener más.</p>
                </>
              )}
            </div>

            {f.bloques.map((bl, i) => (
              <div key={bl.id || i} className="tarjeta" style={{ marginBottom: 10 }}>
                <h3 style={{ marginBottom: 8 }}>Bloque {i + 1}</h3>
                {bl.cerrado ? (
                  <p className="aviso">
                    🔒 Bloque cerrado. Sus datos ({bl.rival || 'sin rival'}
                    {bl.lugar ? ` · ${bl.lugar}` : ''}
                    {bl.hora_convocatoria ? ` · conv. ${bl.hora_convocatoria} hs` : ''})
                    quedan como están; para cambiarlos hay que reabrirlo desde "Día de partido".
                  </p>
                ) : (
                  <>
                    <div className="campo">
                      <label>Rival</label>
                      <CampoSugerido
                        placeholder="Ej.: Tucumán Rugby"
                        value={bl.rival}
                        opciones={sugerencias.rivales}
                        onChange={(v) => editarBloque(i, { rival: v })}
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
                            onClick={() => editarBloque(i, {
                              dificultad: bl.dificultad === d.value ? '' : d.value,
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
                        <input type="time" value={bl.hora_convocatoria}
                          onChange={(e) => editarBloque(i, { hora_convocatoria: e.target.value })} />
                      </div>
                      <div className="campo">
                        <label>Lugar de juego</label>
                        <CampoSugerido
                          placeholder="Ej.: sede Marcos Paz"
                          value={bl.lugar}
                          opciones={sugerencias.lugares}
                          onChange={(v) => editarBloque(i, { lugar: v })}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}

        <div className="campo">
          <label>Notas</label>
          <textarea value={f.notas} onChange={(e) => editar({ notas: e.target.value })} />
        </div>

        {editando && (
          <div className="campo">
            <label>Plantel de ese día (para el % de asistencia)</label>
            <input
              type="number"
              min="1"
              placeholder="Se calcula solo"
              value={f.plazas_manual}
              onChange={(e) => editar({ plazas_manual: e.target.value })}
            />
            <p className="mini">
              Cuántos jugadores había en condiciones de venir. Sale solo de los
              jugadores activos y sin lesión a esa fecha; completalo únicamente
              si ese día el plantel todavía no estaba cargado entero en la app y
              el porcentaje quedó distorsionado. Vacío vuelve al cálculo
              automático.
            </p>
          </div>
        )}

        {error && <p className="aviso" style={{ marginBottom: 10 }}>{error}</p>}

        <button className="btn" style={{ width: '100%' }} disabled={guardando}>
          {editando ? 'Guardar cambios' : `Crear ${esPartido ? 'partido' : 'entrenamiento'}`}
        </button>
      </form>
    </div>
  )
}

// Suspensión del evento. En un entrenamiento se suspende todo; en un partido,
// bloque por bloque (puede caerse uno solo y jugarse el otro).
export function PanelSuspension({ evento, onCambio }) {
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
