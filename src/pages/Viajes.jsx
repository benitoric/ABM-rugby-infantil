import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { irA, leerHash, suscribir } from '../navegacion.js'
import {
  abrevPuestos, descargarCSV, edad, estadoViaje, etiquetaMedioPago, fechaCorta,
  fechasViaje, fichaMedica, nombreCompleto, nombreStaff, papelesCompletos, pesos,
  MEDIOS_PAGO, PAPELES_VIAJE,
} from '../helpers.js'

// Giras a otras provincias. La posición vive en el hash:
// #/viajes (listado) y #/viajes/<id>/<vista> (un viaje, en una de sus vistas).
const VISTAS = [
  { id: 'jugadores', label: 'Jugadores' },
  { id: 'alojamiento', label: 'Alojados' },
  { id: 'managers', label: 'Managers' },
  { id: 'datos', label: 'Datos' },
]

const hoy = () => new Date().toISOString().slice(0, 10)

const iniciales = (j) => `${(j.nombre || '?')[0]}${(j.apellido || '')[0] || ''}`.toUpperCase()

// "Casa 3 · Flia. Pérez" / "Casa 3"
function nombreCasa(g) {
  if (!g) return ''
  return g.familia_nombre ? `Casa ${g.numero} · Flia. ${g.familia_nombre}` : `Casa ${g.numero}`
}

// Teléfono como link para llamar desde el celular
function Telefono({ numero }) {
  if (!numero) return null
  return <a href={`tel:${numero.replace(/[^\d+]/g, '')}`}>{numero}</a>
}

export default function Viajes({ yo }) {
  const [viajes, setViajes] = useState(null)
  const [staff, setStaff] = useState([])
  const [creando, setCreando] = useState(false)
  const [viajeId, setViajeId] = useState(() => leerHash()[1] || null)

  useEffect(() => suscribir(() => {
    const [seccion, id] = leerHash()
    if (seccion === 'viajes') setViajeId(id || null)
  }), [])

  async function cargar() {
    setViajes(await api('viajes'))
  }
  useEffect(() => {
    cargar().catch(() => setViajes([]))
    api('staff').then(setStaff).catch(() => { /* sin staff se puede seguir */ })
  }, [])

  if (viajeId) {
    return (
      <DetalleViaje
        id={viajeId}
        yo={yo}
        staff={staff}
        onVolver={() => irA('viajes')}
        onCambio={() => cargar().catch(() => {})}
      />
    )
  }

  if (!viajes) return <div className="vacio">Cargando…</div>

  const dia = hoy()
  const proximos = viajes.filter((v) => (v.fecha_regreso || v.fecha_salida) >= dia)
    .sort((a, b) => a.fecha_salida.localeCompare(b.fecha_salida))
  const pasados = viajes.filter((v) => (v.fecha_regreso || v.fecha_salida) < dia)

  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Viajes</h2>
        <button className="btn" onClick={() => setCreando(true)}>+ Nuevo viaje</button>
      </div>
      <p className="suave">
        Giras de la división a otras provincias: quiénes viajan, en qué casa de
        familia se aloja cada grupo y lo que siguen los managers (pagos y papeles).
      </p>

      {!viajes.length && (
        <div className="vacio">Todavía no hay viajes cargados. Creá el primero.</div>
      )}

      {proximos.length > 0 && <h3>Próximos y en curso</h3>}
      {proximos.map((v) => <TarjetaViaje key={v.id} v={v} />)}

      {pasados.length > 0 && <h3>Realizados</h3>}
      {pasados.map((v) => <TarjetaViaje key={v.id} v={v} />)}

      {creando && (
        <FormViaje
          staff={staff}
          onCerrar={() => setCreando(false)}
          onGuardado={(d) => {
            setCreando(false)
            cargar().catch(() => {})
            irA('viajes', d.viaje.id)
          }}
        />
      )}
    </div>
  )
}

function TarjetaViaje({ v }) {
  const estado = estadoViaje(v)
  const esperado = v.precio != null ? v.precio * v.jugadores : null
  return (
    <button className="tarjeta viaje-item" onClick={() => irA('viajes', v.id)}>
      <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
        <div className="crece" style={{ minWidth: 0 }}>
          <div className="viaje-nombre">{v.nombre}</div>
          <div className="mini">
            {[v.destino, v.club_anfitrion].filter(Boolean).join(' · ')}
            {(v.destino || v.club_anfitrion) ? ' · ' : ''}{fechasViaje(v)}
          </div>
        </div>
        <span className={`badge viaje-${estado.clave}`}>{estado.texto}</span>
      </div>
      <div className="mini viaje-resumen">
        👥 {v.jugadores} {v.jugadores === 1 ? 'jugador' : 'jugadores'}
        {' · '}🏠 {v.grupos} {v.grupos === 1 ? 'casa' : 'casas'}
        {v.sin_alojar > 0 && v.jugadores > 0 && <span className="pendiente"> · {v.sin_alojar} sin alojar</span>}
        {v.papeles_pendientes > 0 && <span className="pendiente"> · {v.papeles_pendientes} con papeles pendientes</span>}
        {esperado != null && (
          <span> · 💰 {pesos(v.cobrado)} de {pesos(esperado)}</span>
        )}
      </div>
    </button>
  )
}

// ---------- alta y edición del viaje ----------
function FormViaje({ viaje = null, staffElegido = [], staff, onCerrar, onGuardado }) {
  const [f, setF] = useState(() => ({
    nombre: viaje?.nombre || '',
    destino: viaje?.destino || '',
    club_anfitrion: viaje?.club_anfitrion || '',
    fecha_salida: viaje?.fecha_salida || hoy(),
    fecha_regreso: viaje?.fecha_regreso || '',
    precio: viaje?.precio == null ? '' : String(viaje.precio),
    cuotas: viaje?.cuotas == null ? '' : String(viaje.cuotas),
    notas: viaje?.notas || '',
    staff_emails: staffElegido.map((s) => s.email),
  }))
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const editar = (c) => setF({ ...f, ...c })

  // Los activos del staff, más cualquiera ya elegido aunque esté suspendido
  const candidatos = staff.filter((s) => s.activo || f.staff_emails.includes(s.email))

  function alternarStaff(email) {
    editar({
      staff_emails: f.staff_emails.includes(email)
        ? f.staff_emails.filter((e) => e !== email)
        : [...f.staff_emails, email],
    })
  }

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (f.fecha_regreso && f.fecha_regreso < f.fecha_salida) {
      setError('La fecha de regreso no puede ser anterior a la de salida.')
      return
    }
    setGuardando(true)
    try {
      const cuerpo = {
        ...f,
        precio: f.precio === '' ? null : Number(f.precio),
        cuotas: f.cuotas === '' ? null : Number(f.cuotas),
        fecha_regreso: f.fecha_regreso || null,
      }
      const d = viaje
        ? await api(`viajes/${viaje.id}`, { method: 'PUT', body: cuerpo })
        : await api('viajes', { method: 'POST', body: cuerpo })
      onGuardado(d)
    } catch (err) {
      setError(err.error === 'faltan_datos' ? 'Falta el nombre del viaje.'
        : err.error === 'fecha_invalida' ? 'Revisá las fechas.'
        : 'No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>{viaje ? 'Editar viaje' : 'Nuevo viaje'}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="campo">
          <label>Nombre *</label>
          <input autoFocus required placeholder="Gira a Salta 2026" value={f.nombre}
                 onChange={(e) => editar({ nombre: e.target.value })} />
        </div>
        <div className="grid2">
          <div className="campo">
            <label>Destino</label>
            <input placeholder="Salta" value={f.destino}
                   onChange={(e) => editar({ destino: e.target.value })} />
          </div>
          <div className="campo">
            <label>Club anfitrión</label>
            <input placeholder="Jockey Club" value={f.club_anfitrion}
                   onChange={(e) => editar({ club_anfitrion: e.target.value })} />
          </div>
        </div>
        <div className="grid2">
          <div className="campo">
            <label>Salida *</label>
            <input type="date" required value={f.fecha_salida}
                   onChange={(e) => editar({ fecha_salida: e.target.value })} />
          </div>
          <div className="campo">
            <label>Regreso</label>
            <input type="date" min={f.fecha_salida} value={f.fecha_regreso}
                   onChange={(e) => editar({ fecha_regreso: e.target.value })} />
          </div>
        </div>
        <div className="grid2">
          <div className="campo">
            <label>Precio por jugador ($)</label>
            <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0"
                   value={f.precio} onChange={(e) => editar({ precio: e.target.value })} />
          </div>
          <div className="campo">
            <label>Cuotas</label>
            <input type="number" min="1" max="24" step="1" inputMode="numeric" placeholder="1"
                   value={f.cuotas} onChange={(e) => editar({ cuotas: e.target.value })} />
          </div>
        </div>
        {f.precio !== '' && Number(f.cuotas) > 1 && (
          <p className="mini" style={{ marginTop: -6, marginBottom: 10 }}>
            {f.cuotas} cuotas de {pesos(Number(f.precio) / Number(f.cuotas))}
          </p>
        )}
        <div className="campo">
          <label>Notas</label>
          <textarea placeholder="Horario de salida, qué llevar, transporte…" value={f.notas}
                    onChange={(e) => editar({ notas: e.target.value })} />
        </div>
        {candidatos.length > 0 && (
          <div className="campo">
            <label>Staff que viaja</label>
            <div className="fila">
              {candidatos.map((s) => (
                <button
                  key={s.email}
                  type="button"
                  className={`chip${f.staff_emails.includes(s.email) ? ' activo' : ''}`}
                  onClick={() => alternarStaff(s.email)}
                >
                  {nombreStaff(s)}
                </button>
              ))}
            </div>
          </div>
        )}
        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={guardando}>
          {guardando ? 'Guardando…' : viaje ? 'Guardar cambios' : 'Crear viaje'}
        </button>
      </form>
    </div>
  )
}

// ---------- un viaje ----------
function DetalleViaje({ id, yo, staff, onVolver, onCambio }) {
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)
  const [vistaHash, setVistaHash] = useState(() => leerHash()[2] || 'jugadores')
  useEffect(() => suscribir(() => setVistaHash(leerHash()[2] || 'jugadores')), [])
  const vista = VISTAS.some((v) => v.id === vistaHash) ? vistaHash : 'jugadores'
  const setVista = (v) => irA('viajes', id, v === 'jugadores' ? null : v)

  useEffect(() => {
    setDatos(null)
    setError('')
    api(`viajes/${id}`).then(setDatos).catch((e) => {
      setError(e.error === 'no_existe' ? 'Ese viaje ya no existe.' : 'No se pudo cargar el viaje.')
    })
  }, [id])

  // Toda escritura devuelve el detalle actualizado: se pisa el estado entero
  // y se avisa al listado para que refresque sus contadores
  async function mutar(ruta, opciones) {
    const d = await api(ruta, opciones)
    setDatos(d)
    onCambio()
    return d
  }

  // Cambios chicos de un jugador del viaje (checklist, casa, observaciones):
  // se aplican en pantalla al toque y se mandan atrás; si falla, se recarga
  async function actualizarJugador(jugadorId, cambios) {
    setDatos((d) => d && {
      ...d,
      jugadores: d.jugadores.map((j) => (j.jugador_id === jugadorId ? { ...j, ...cambios } : j)),
    })
    try {
      await api(`viajes/${id}/jugadores/${jugadorId}`, { method: 'PUT', body: cambios })
      onCambio()
    } catch {
      api(`viajes/${id}`).then(setDatos).catch(() => {})
    }
  }

  if (error) {
    return (
      <div className="contenido">
        <button className="btn sec chico" style={{ alignSelf: 'flex-start' }} onClick={onVolver}>
          ← Viajes
        </button>
        <div className="vacio">{error}</div>
      </div>
    )
  }
  if (!datos) return <div className="vacio">Cargando…</div>

  const { viaje, jugadores, grupos, pagos } = datos
  const estado = estadoViaje(viaje)
  const sinAlojar = jugadores.filter((j) => !j.grupo_id)
  const conPapeles = jugadores.filter(papelesCompletos)
  const cobrado = pagos.reduce((s, p) => s + p.monto, 0)
  const esperado = viaje.precio != null ? viaje.precio * jugadores.length : null

  return (
    <div className="contenido">
      <div className="fila entre no-imprimir">
        <button className="btn sec chico" onClick={onVolver}>← Viajes</button>
        <span className={`badge viaje-${estado.clave}`}>{estado.texto}</span>
      </div>

      <div className="tarjeta">
        <h2>{viaje.nombre}</h2>
        <div className="suave">
          {[viaje.destino, viaje.club_anfitrion].filter(Boolean).join(' · ')}
          {(viaje.destino || viaje.club_anfitrion) ? ' · ' : ''}{fechasViaje(viaje)}
        </div>
        <div className="stat-grid no-imprimir" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="valor">{jugadores.length}</div>
            <div className="etiqueta">viajan</div>
          </div>
          <div className="stat">
            <div className="valor">{grupos.length}</div>
            <div className="etiqueta">casas</div>
          </div>
          <div className="stat">
            <div className={`valor${sinAlojar.length && jugadores.length ? ' alerta' : ''}`}>
              {sinAlojar.length}
            </div>
            <div className="etiqueta">sin alojar</div>
          </div>
          <div className="stat">
            <div className={`valor${conPapeles.length < jugadores.length ? ' alerta' : ''}`}>
              {conPapeles.length}/{jugadores.length}
            </div>
            <div className="etiqueta">papeles ok</div>
          </div>
          {esperado != null && (
            <div className="stat">
              <div className={`valor${cobrado < esperado ? ' alerta' : ''}`}>
                {Math.round(esperado ? (cobrado / esperado) * 100 : 100)}%
              </div>
              <div className="etiqueta">cobrado</div>
            </div>
          )}
        </div>
      </div>

      <div className="seg compacto no-imprimir">
        {VISTAS.map((v) => (
          <button key={v.id} className={vista === v.id ? 'activo' : ''} onClick={() => setVista(v.id)}>
            {v.label}
          </button>
        ))}
      </div>

      {vista === 'jugadores' && (
        <VistaJugadores datos={datos} mutar={mutar} />
      )}
      {vista === 'alojamiento' && (
        <VistaAlojamiento datos={datos} mutar={mutar} actualizarJugador={actualizarJugador} />
      )}
      {vista === 'managers' && (
        <VistaManagers datos={datos} mutar={mutar} actualizarJugador={actualizarJugador} />
      )}
      {vista === 'datos' && (
        <VistaDatos
          datos={datos}
          yo={yo}
          onEditar={() => setEditando(true)}
          onBorrar={async () => {
            if (!confirm(`¿Borrar el viaje "${viaje.nombre}" con sus jugadores, casas y pagos?`)) return
            await api(`viajes/${id}`, { method: 'DELETE' })
            onCambio()
            onVolver()
          }}
        />
      )}

      {editando && (
        <FormViaje
          viaje={viaje}
          staffElegido={datos.staff}
          staff={staff}
          onCerrar={() => setEditando(false)}
          onGuardado={(d) => { setEditando(false); setDatos(d); onCambio() }}
        />
      )}
    </div>
  )
}

// ---------- vista: quiénes viajan ----------
function VistaJugadores({ datos, mutar }) {
  const { viaje, jugadores, grupos } = datos
  const [eligiendo, setEligiendo] = useState(false)
  const casa = (j) => grupos.find((g) => g.id === j.grupo_id)

  function descargar() {
    const filas = [[
      'Apellido', 'Nombre', 'DNI', 'Fecha nac.', 'Edad', 'Tutor', 'Tel. tutor', 'Casa', 'Familia',
      ...PAPELES_VIAJE.map((p) => p.label), 'Pagado', 'Falta', 'Observaciones',
    ]]
    for (const j of jugadores) {
      const g = casa(j)
      filas.push([
        j.apellido, j.nombre, j.dni || '', fechaCorta(j.fecha_nacimiento), edad(j.fecha_nacimiento) ?? '',
        j.tutor_nombre || '', j.tutor_telefono || '', g ? `Casa ${g.numero}` : '', g?.familia_nombre || '',
        ...PAPELES_VIAJE.map((p) => (j[p.clave] ? 'Sí' : 'No')),
        j.pagado, viaje.precio == null ? '' : Math.max(0, viaje.precio - j.pagado),
        j.observaciones || '',
      ])
    }
    descargarCSV(`${viaje.nombre} - jugadores.csv`, filas)
  }

  return (
    <>
      <div className="fila entre no-imprimir">
        <h3>Viajan {jugadores.length} {jugadores.length === 1 ? 'jugador' : 'jugadores'}</h3>
        <div className="fila" style={{ gap: 6 }}>
          {jugadores.length > 0 && (
            <button className="btn sec chico" onClick={descargar}>⬇ CSV</button>
          )}
          <button className="btn chico" onClick={() => setEligiendo(true)}>
            {jugadores.length ? 'Editar lista' : '+ Elegir jugadores'}
          </button>
        </div>
      </div>

      {!jugadores.length && (
        <div className="vacio">
          Todavía no hay jugadores en este viaje. Elegí quiénes van.
        </div>
      )}

      {jugadores.map((j) => {
        const g = casa(j)
        const ficha = fichaMedica(j)
        return (
          <div key={j.jugador_id} className="jugador-item compacto">
            <div className="avatar">{iniciales(j)}</div>
            <div className="crece" style={{ minWidth: 0 }}>
              <div className="nombre-jugador">{nombreCompleto(j)}</div>
              <div className="mini">
                {[abrevPuestos(j), edad(j.fecha_nacimiento) != null ? `${edad(j.fecha_nacimiento)} años` : null]
                  .filter(Boolean).map((t) => `${t} · `).join('')}
                {g ? nombreCasa(g) : <span className="pendiente">sin alojar</span>}
              </div>
              {j.tutor_telefono && (
                <div className="mini">
                  {j.tutor_nombre ? `${j.tutor_nombre} · ` : ''}<Telefono numero={j.tutor_telefono} />
                </div>
              )}
            </div>
            <div className="etiquetas" style={{ justifyContent: 'flex-end' }}>
              <span className={`badge ${ficha.clase}`} title={ficha.texto}>
                {ficha.clase === 'medica-ok' ? 'Ficha ✓' : ficha.clase === 'medica-pronto' ? 'Ficha vence' : 'Sin ficha'}
              </span>
              {papelesCompletos(j)
                ? <span className="badge activo">Papeles ✓</span>
                : <span className="badge medica-no">Papeles</span>}
            </div>
          </div>
        )
      })}

      {eligiendo && (
        <ModalSeleccion
          elegidos={jugadores.map((j) => j.jugador_id)}
          onCerrar={() => setEligiendo(false)}
          onGuardar={async (ids) => {
            await mutar(`viajes/${viaje.id}/jugadores`, { method: 'PUT', body: { jugador_ids: ids } })
            setEligiendo(false)
          }}
        />
      )}
    </>
  )
}

// Elección de quiénes viajan sobre el plantel completo (los dados de baja
// no aparecen, salvo que ya estuvieran en el viaje)
function ModalSeleccion({ elegidos, onCerrar, onGuardar }) {
  const [plantel, setPlantel] = useState(null)
  const [sel, setSel] = useState(() => new Set(elegidos))
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api('jugadores').then(setPlantel).catch(() => setPlantel([]))
  }, [])

  const visibles = useMemo(() => {
    if (!plantel) return []
    const q = busqueda.trim().toLowerCase()
    return plantel
      .filter((j) => j.estado !== 'inactivo' || sel.has(j.id))
      .filter((j) => !q || nombreCompleto(j).toLowerCase().includes(q))
  }, [plantel, busqueda, sel])

  function alternar(id) {
    const s = new Set(sel)
    if (s.has(id)) s.delete(id); else s.add(id)
    setSel(s)
  }

  function marcarTodos() {
    const s = new Set(sel)
    for (const j of plantel) if (j.estado !== 'inactivo') s.add(j.id)
    setSel(s)
  }

  async function guardar() {
    setGuardando(true)
    setError('')
    try {
      await onGuardar([...sel])
    } catch (err) {
      setError(err.error === 'tiene_pagos'
        ? 'Hay jugadores con pagos cargados: para sacarlos del viaje, primero borrá sus pagos desde Managers.'
        : 'No se pudo guardar la lista.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>¿Quiénes viajan? <span className="mini">({sel.size})</span></h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="fila" style={{ marginBottom: 8 }}>
          <input
            className="crece"
            placeholder="Buscar…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 8 }}
          />
          <button className="btn sec chico" onClick={marcarTodos} disabled={!plantel}>Todos</button>
          <button className="btn sec chico" onClick={() => setSel(new Set())}>Ninguno</button>
        </div>
        {!plantel && <div className="vacio">Cargando plantel…</div>}
        <div className="lista-seleccion">
          {visibles.map((j) => (
            <label key={j.id} className={`opcion-seleccion${sel.has(j.id) ? ' activa' : ''}`}>
              <input type="checkbox" checked={sel.has(j.id)} onChange={() => alternar(j.id)} />
              <span className="crece">
                {nombreCompleto(j)}
                {j.estado === 'lesionado' && <span className="badge lesionado" style={{ marginLeft: 6 }}>lesionado</span>}
                {j.estado === 'inactivo' && <span className="badge inactivo" style={{ marginLeft: 6 }}>baja</span>}
              </span>
              <span className="mini">{abrevPuestos(j)}</span>
            </label>
          ))}
        </div>
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        <button className="btn" style={{ width: '100%', marginTop: 10 }} disabled={guardando || !plantel}
                onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar lista'}
        </button>
      </div>
    </div>
  )
}

// ---------- vista: grupos de alojados ----------
function VistaAlojamiento({ datos, mutar, actualizarJugador }) {
  const { viaje, jugadores, grupos } = datos
  const [formGrupo, setFormGrupo] = useState(null) // 'nuevo' | grupo en edición
  const sinAlojar = jugadores.filter((j) => !j.grupo_id)
  const miembros = (g) => jugadores.filter((j) => j.grupo_id === g.id)

  function descargar() {
    const filas = [['Casa', 'Familia', 'Teléfono', 'Dirección', 'Notas de la casa',
      'Jugador', 'Tutor', 'Tel. tutor', 'Observaciones del jugador']]
    for (const g of grupos) {
      const del = miembros(g)
      if (!del.length) {
        filas.push([`Casa ${g.numero}`, g.familia_nombre || '', g.familia_telefono || '',
          g.familia_direccion || '', g.familia_notas || '', '', '', '', ''])
      }
      for (const j of del) {
        filas.push([`Casa ${g.numero}`, g.familia_nombre || '', g.familia_telefono || '',
          g.familia_direccion || '', g.familia_notas || '', nombreCompleto(j),
          j.tutor_nombre || '', j.tutor_telefono || '', j.observaciones || ''])
      }
    }
    for (const j of sinAlojar) {
      filas.push(['Sin alojar', '', '', '', '', nombreCompleto(j),
        j.tutor_nombre || '', j.tutor_telefono || '', j.observaciones || ''])
    }
    descargarCSV(`${viaje.nombre} - alojamiento.csv`, filas)
  }

  return (
    <>
      <div className="fila entre no-imprimir">
        <h3>Alojamiento</h3>
        <div className="fila" style={{ gap: 6 }}>
          {grupos.length > 0 && (
            <>
              <button className="btn sec chico" onClick={() => window.print()}>🖨 Imprimir</button>
              <button className="btn sec chico" onClick={descargar}>⬇ CSV</button>
            </>
          )}
          <button className="btn chico" onClick={() => setFormGrupo('nuevo')}>+ Nueva casa</button>
        </div>
      </div>
      <p className="mini no-imprimir" style={{ marginTop: -6 }}>
        Cada casa es una familia del club anfitrión que recibe a uno o más
        chicos. Las observaciones de cada jugador (alergias, medicación) se
        cargan desde Managers y salen acá para la familia que lo recibe.
      </p>

      {!jugadores.length && (
        <div className="vacio">Primero elegí quiénes viajan, desde la vista Jugadores.</div>
      )}

      {sinAlojar.length > 0 && (
        <div className="tarjeta aviso-faltas">
          <h3>Sin alojar ({sinAlojar.length})</h3>
          {sinAlojar.map((j) => (
            <div key={j.jugador_id} className="casa-miembro">
              <span className="crece">{nombreCompleto(j)}</span>
              {grupos.length > 0 && (
                <select
                  className="no-imprimir"
                  value=""
                  onChange={(e) => e.target.value && actualizarJugador(j.jugador_id, { grupo_id: e.target.value })}
                >
                  <option value="">Alojar en…</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.id}>{nombreCasa(g)} ({miembros(g).length})</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {!grupos.length && (
            <p className="mini" style={{ marginTop: 6 }}>Creá la primera casa para empezar a repartirlos.</p>
          )}
        </div>
      )}

      {grupos.map((g) => {
        const del = miembros(g)
        return (
          <div key={g.id} className="tarjeta viaje-casa">
            <div className="fila entre" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <div className="crece" style={{ minWidth: 0 }}>
                <h3>🏠 {nombreCasa(g)}</h3>
                {(g.familia_telefono || g.familia_direccion) && (
                  <div className="mini">
                    {g.familia_telefono && <Telefono numero={g.familia_telefono} />}
                    {g.familia_telefono && g.familia_direccion ? ' · ' : ''}
                    {g.familia_direccion}
                  </div>
                )}
                {g.familia_notas && <div className="mini">{g.familia_notas}</div>}
                {!g.familia_nombre && !g.familia_telefono && (
                  <div className="mini pendiente">Faltan los datos de la familia</div>
                )}
              </div>
              <div className="fila no-imprimir" style={{ flexWrap: 'nowrap', gap: 6 }}>
                <button className="btn sec chico" onClick={() => setFormGrupo(g)}>Editar</button>
                <button
                  className="btn peligro chico"
                  onClick={async () => {
                    if (del.length && !confirm(`¿Borrar la casa ${g.numero}? Sus ${del.length} chicos quedan sin alojar.`)) return
                    await mutar(`viajes/${viaje.id}/grupos/${g.id}`, { method: 'DELETE' })
                  }}
                >
                  Borrar
                </button>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              {!del.length && <div className="mini">Todavía no tiene chicos asignados.</div>}
              {del.map((j) => (
                <div key={j.jugador_id} className="casa-miembro">
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: '0.65rem' }}>{iniciales(j)}</div>
                  <div className="crece" style={{ minWidth: 0 }}>
                    <div>{nombreCompleto(j)}</div>
                    <div className="mini">
                      {j.tutor_nombre ? `${j.tutor_nombre} · ` : ''}<Telefono numero={j.tutor_telefono} />
                      {j.observaciones && <span> · ⚠️ {j.observaciones}</span>}
                    </div>
                  </div>
                  <button className="btn sec chico no-imprimir"
                          onClick={() => actualizarJugador(j.jugador_id, { grupo_id: null })}>
                    Quitar
                  </button>
                </div>
              ))}
              {sinAlojar.length > 0 && (
                <select
                  className="no-imprimir"
                  style={{ marginTop: 8, width: '100%', border: '1px solid var(--borde)', borderRadius: 8, padding: 8 }}
                  value=""
                  onChange={(e) => e.target.value && actualizarJugador(e.target.value, { grupo_id: g.id })}
                >
                  <option value="">+ Agregar a esta casa…</option>
                  {sinAlojar.map((j) => (
                    <option key={j.jugador_id} value={j.jugador_id}>{nombreCompleto(j)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )
      })}

      {formGrupo && (
        <FormGrupo
          grupo={formGrupo === 'nuevo' ? null : formGrupo}
          sinAlojar={sinAlojar}
          onCerrar={() => setFormGrupo(null)}
          onGuardar={async (cuerpo) => {
            if (formGrupo === 'nuevo') {
              await mutar(`viajes/${viaje.id}/grupos`, { method: 'POST', body: cuerpo })
            } else {
              await mutar(`viajes/${viaje.id}/grupos/${formGrupo.id}`, { method: 'PUT', body: cuerpo })
            }
            setFormGrupo(null)
          }}
        />
      )}
    </>
  )
}

function FormGrupo({ grupo, sinAlojar, onCerrar, onGuardar }) {
  const [f, setF] = useState(() => ({
    familia_nombre: grupo?.familia_nombre || '',
    familia_telefono: grupo?.familia_telefono || '',
    familia_direccion: grupo?.familia_direccion || '',
    familia_notas: grupo?.familia_notas || '',
  }))
  const [ids, setIds] = useState(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const editar = (c) => setF({ ...f, ...c })

  function alternar(id) {
    const s = new Set(ids)
    if (s.has(id)) s.delete(id); else s.add(id)
    setIds(s)
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      await onGuardar(grupo ? f : { ...f, jugador_ids: [...ids] })
    } catch {
      setError('No se pudo guardar.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 8 }}>
          <h3>{grupo ? `Casa ${grupo.numero}` : 'Nueva casa'}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <div className="campo">
          <label>Familia que recibe</label>
          <input autoFocus placeholder="Apellido de la familia" value={f.familia_nombre}
                 onChange={(e) => editar({ familia_nombre: e.target.value })} />
        </div>
        <div className="campo">
          <label>Teléfono</label>
          <input type="tel" placeholder="381 555 5555" value={f.familia_telefono}
                 onChange={(e) => editar({ familia_telefono: e.target.value })} />
        </div>
        <div className="campo">
          <label>Dirección</label>
          <input placeholder="Calle, número, barrio" value={f.familia_direccion}
                 onChange={(e) => editar({ familia_direccion: e.target.value })} />
        </div>
        <div className="campo">
          <label>Notas de la casa</label>
          <textarea placeholder="Mascotas, otros chicos en la casa, cómo llegar…" value={f.familia_notas}
                    onChange={(e) => editar({ familia_notas: e.target.value })} />
        </div>
        {!grupo && sinAlojar.length > 0 && (
          <div className="campo">
            <label>Chicos que se alojan acá ({ids.size})</label>
            <div className="lista-seleccion">
              {sinAlojar.map((j) => (
                <label key={j.jugador_id} className={`opcion-seleccion${ids.has(j.jugador_id) ? ' activa' : ''}`}>
                  <input type="checkbox" checked={ids.has(j.jugador_id)} onChange={() => alternar(j.jugador_id)} />
                  <span className="crece">{nombreCompleto(j)}</span>
                </label>
              ))}
            </div>
          </div>
        )}
        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={guardando}>
          {guardando ? 'Guardando…' : grupo ? 'Guardar cambios' : 'Crear casa'}
        </button>
      </form>
    </div>
  )
}

// ---------- vista: managers (cobros y papeles) ----------
function VistaManagers({ datos, mutar, actualizarJugador }) {
  const { viaje, jugadores, pagos } = datos
  const [filtro, setFiltro] = useState('todos')
  const [abierto, setAbierto] = useState(null) // jugador_id con el detalle abierto
  const precio = viaje.precio
  const cobrado = pagos.reduce((s, p) => s + p.monto, 0)
  const esperado = precio != null ? precio * jugadores.length : null

  const falta = (j) => (precio == null ? null : Math.max(0, precio - j.pagado))
  const pendiente = (j) => !papelesCompletos(j) || (falta(j) != null && falta(j) > 0)
  const visibles = filtro === 'pendientes' ? jugadores.filter(pendiente) : jugadores

  return (
    <>
      <div className="tarjeta">
        <h3>Cobro del viaje</h3>
        {precio == null ? (
          <p className="mini" style={{ marginTop: 4 }}>
            Sin precio cargado: cargalo desde Datos → Editar para ver cuánto falta cobrar.
          </p>
        ) : (
          <>
            <div className="mini" style={{ marginTop: 4 }}>
              {pesos(precio)} por jugador
              {viaje.cuotas > 1 && ` · ${viaje.cuotas} cuotas de ${pesos(precio / viaje.cuotas)}`}
            </div>
            <div className="stat-grid dinero" style={{ marginTop: 10 }}>
              <div className="stat">
                <div className="valor">{pesos(cobrado)}</div>
                <div className="etiqueta">cobrado</div>
              </div>
              <div className="stat">
                <div className={`valor${esperado - cobrado > 0 ? ' alerta' : ''}`}>{pesos(Math.max(0, esperado - cobrado))}</div>
                <div className="etiqueta">falta</div>
              </div>
              <div className="stat">
                <div className="valor">{pesos(esperado)}</div>
                <div className="etiqueta">total</div>
              </div>
            </div>
            <BarraPago pagado={cobrado} total={esperado} />
          </>
        )}
        <div className="mini" style={{ marginTop: 10 }}>
          <b>Papeles entregados:</b>{' '}
          {PAPELES_VIAJE.map((p, i) => (
            <span key={p.clave}>
              {i > 0 && ' · '}
              {p.abrev} {jugadores.filter((j) => j[p.clave]).length}/{jugadores.length}
            </span>
          ))}
        </div>
      </div>

      {jugadores.length > 0 && (
        <div className="seg">
          <button className={filtro === 'todos' ? 'activo' : ''} onClick={() => setFiltro('todos')}>
            Todos ({jugadores.length})
          </button>
          <button className={filtro === 'pendientes' ? 'activo' : ''} onClick={() => setFiltro('pendientes')}>
            Con pendientes ({jugadores.filter(pendiente).length})
          </button>
        </div>
      )}

      {!jugadores.length && (
        <div className="vacio">Primero elegí quiénes viajan, desde la vista Jugadores.</div>
      )}
      {jugadores.length > 0 && !visibles.length && (
        <div className="vacio">🎉 Están todos al día.</div>
      )}

      {visibles.map((j) => (
        <FilaManager
          key={j.jugador_id}
          j={j}
          viaje={viaje}
          pagos={pagos.filter((p) => p.jugador_id === j.jugador_id)}
          abierto={abierto === j.jugador_id}
          onAbrir={() => setAbierto(abierto === j.jugador_id ? null : j.jugador_id)}
          actualizar={(c) => actualizarJugador(j.jugador_id, c)}
          mutar={mutar}
        />
      ))}
    </>
  )
}

function BarraPago({ pagado, total }) {
  if (!total) return null
  const pct = Math.min(100, Math.round((pagado / total) * 100))
  return (
    <div className="barra-pago" style={{ marginTop: 8 }} title={`${pct}%`}>
      <span className={pct >= 100 ? '' : 'parcial'} style={{ width: `${pct}%` }} />
    </div>
  )
}

function FilaManager({ j, viaje, pagos, abierto, onAbrir, actualizar, mutar }) {
  const precio = viaje.precio
  const falta = precio == null ? null : Math.max(0, precio - j.pagado)
  const [obs, setObs] = useState(j.observaciones || '')
  useEffect(() => { setObs(j.observaciones || '') }, [j.observaciones])
  const [cargandoPago, setCargandoPago] = useState(false)

  return (
    <div className="tarjeta viaje-manager">
      <div className="fila entre" style={{ flexWrap: 'nowrap' }}>
        <div className="crece" style={{ minWidth: 0 }}>
          <div className="nombre-jugador">{nombreCompleto(j)}</div>
          <div className="mini">
            {precio == null
              ? (j.pagado > 0 ? `Pagó ${pesos(j.pagado)}` : 'Sin pagos')
              : falta > 0
                ? <>Pagó {pesos(j.pagado)} · <span className="pendiente">falta {pesos(falta)}</span></>
                : <span className="ok">Pagó todo ({pesos(j.pagado)})</span>}
            {j.cantidad_pagos > 0 && ` · ${j.cantidad_pagos} ${j.cantidad_pagos === 1 ? 'pago' : 'pagos'}`}
          </div>
        </div>
        <button className="btn sec chico" onClick={onAbrir}>{abierto ? 'Cerrar' : 'Detalle'}</button>
      </div>
      {precio != null && <BarraPago pagado={j.pagado} total={precio} />}

      <div className="papeles" style={{ marginTop: 8 }}>
        {PAPELES_VIAJE.map((p) => (
          <button
            key={p.clave}
            className={`chip${j[p.clave] ? ' activo' : ''}`}
            title={p.label}
            onClick={() => actualizar({ [p.clave]: !j[p.clave] })}
          >
            {j[p.clave] ? '✓ ' : ''}{p.abrev}
          </button>
        ))}
        {j.tiene_dni_app && !j.dni_copia && (
          <span className="mini" title="El DNI está escaneado en la ficha del jugador">📎 DNI en la app</span>
        )}
      </div>

      {abierto && (
        <div style={{ marginTop: 10 }}>
          <FormPago
            j={j}
            viaje={viaje}
            cargando={cargandoPago}
            onGuardar={async (cuerpo) => {
              setCargandoPago(true)
              try {
                await mutar(`viajes/${viaje.id}/pagos`, { method: 'POST', body: { ...cuerpo, jugador_id: j.jugador_id } })
              } finally {
                setCargandoPago(false)
              }
            }}
          />
          {pagos.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {pagos.map((p) => (
                <div key={p.id} className="casa-miembro">
                  <div className="crece">
                    <b>{pesos(p.monto)}</b>{p.concepto ? ` · ${p.concepto}` : ''}
                    <div className="mini">
                      {fechaCorta(p.fecha)}
                      {p.medio ? ` · ${etiquetaMedioPago(p.medio)}` : ''}
                      {p.registrado_por ? ` · ${p.registrado_por}` : ''}
                    </div>
                  </div>
                  <button
                    className="btn peligro chico"
                    onClick={async () => {
                      if (!confirm(`¿Borrar el pago de ${pesos(p.monto)}?`)) return
                      await mutar(`viajes/${viaje.id}/pagos/${p.id}`, { method: 'DELETE' })
                    }}
                  >
                    Borrar
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="campo" style={{ marginTop: 10 }}>
            <label>Observaciones para el viaje (alergias, medicación, comidas)</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              onBlur={() => { if (obs !== (j.observaciones || '')) actualizar({ observaciones: obs || null }) }}
            />
            <span className="mini">Se guardan solas al salir del campo y salen en la hoja de alojamiento.</span>
          </div>
        </div>
      )}
    </div>
  )
}

function FormPago({ j, viaje, cargando, onGuardar }) {
  const cuota = viaje.cuotas > 1 && viaje.precio != null ? viaje.precio / viaje.cuotas : null
  const [f, setF] = useState(() => ({
    monto: cuota != null ? String(Math.round(cuota * 100) / 100) : '',
    fecha: hoy(),
    concepto: viaje.cuotas > 1 ? `Cuota ${Math.min(viaje.cuotas, j.cantidad_pagos + 1)}` : '',
    medio: '',
  }))
  const [error, setError] = useState('')
  const editar = (c) => setF({ ...f, ...c })

  async function guardar(e) {
    e.preventDefault()
    setError('')
    if (!(Number(f.monto) > 0)) { setError('Ingresá el monto.'); return }
    try {
      await onGuardar({
        monto: Number(f.monto), fecha: f.fecha, concepto: f.concepto.trim() || null, medio: f.medio || null,
      })
      setF({
        monto: cuota != null ? String(Math.round(cuota * 100) / 100) : '',
        fecha: hoy(),
        concepto: viaje.cuotas > 1 ? `Cuota ${Math.min(viaje.cuotas, j.cantidad_pagos + 2)}` : '',
        medio: f.medio,
      })
    } catch {
      setError('No se pudo registrar el pago.')
    }
  }

  return (
    <form onSubmit={guardar} className="form-pago">
      <div className="grid2">
        <div className="campo">
          <label>Monto ($)</label>
          <input type="number" min="0.01" step="0.01" inputMode="decimal" required value={f.monto}
                 onChange={(e) => editar({ monto: e.target.value })} />
        </div>
        <div className="campo">
          <label>Fecha</label>
          <input type="date" value={f.fecha} onChange={(e) => editar({ fecha: e.target.value })} />
        </div>
      </div>
      <div className="grid2">
        <div className="campo">
          <label>Concepto</label>
          <input placeholder="Seña, cuota 1, saldo…" value={f.concepto}
                 onChange={(e) => editar({ concepto: e.target.value })} />
        </div>
        <div className="campo">
          <label>Medio</label>
          <select value={f.medio} onChange={(e) => editar({ medio: e.target.value })}>
            <option value="">Sin indicar</option>
            {MEDIOS_PAGO.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      </div>
      {error && <div className="error" style={{ marginBottom: 8 }}>{error}</div>}
      <button className="btn chico" disabled={cargando}>{cargando ? 'Guardando…' : '+ Registrar pago'}</button>
    </form>
  )
}

// ---------- vista: datos del viaje ----------
function VistaDatos({ datos, yo, onEditar, onBorrar }) {
  const { viaje, staff } = datos
  return (
    <>
      <div className="tarjeta">
        <div className="fila entre">
          <h3>Datos del viaje</h3>
          <button className="btn chico" onClick={onEditar}>Editar</button>
        </div>
        <dl className="datos-viaje">
          <dt>Destino</dt><dd>{viaje.destino || '—'}</dd>
          <dt>Club anfitrión</dt><dd>{viaje.club_anfitrion || '—'}</dd>
          <dt>Salida</dt><dd>{fechaCorta(viaje.fecha_salida)}</dd>
          <dt>Regreso</dt><dd>{viaje.fecha_regreso ? fechaCorta(viaje.fecha_regreso) : '—'}</dd>
          <dt>Precio</dt>
          <dd>
            {viaje.precio == null ? '—' : pesos(viaje.precio)}
            {viaje.precio != null && viaje.cuotas > 1 && ` en ${viaje.cuotas} cuotas de ${pesos(viaje.precio / viaje.cuotas)}`}
          </dd>
          <dt>Staff que viaja</dt>
          <dd>{staff.length ? staff.map(nombreStaff).join(', ') : '—'}</dd>
          <dt>Notas</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{viaje.notas || '—'}</dd>
        </dl>
        <div className="mini" style={{ marginTop: 8 }}>
          Creado por {viaje.creado_por || '—'}
        </div>
      </div>
      {yo.admin && (
        <div className="tarjeta">
          <h3>Zona de riesgo</h3>
          <p className="mini" style={{ margin: '4px 0 8px' }}>
            Borra el viaje con su lista de jugadores, las casas y todos los pagos registrados.
          </p>
          <button className="btn peligro chico" onClick={onBorrar}>Borrar viaje</button>
        </div>
      )}
    </>
  )
}
