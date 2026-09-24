import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'
import { edad, fechaCorta, fichaMedica, nombreCompleto } from '../helpers.js'
import { base64ABlob } from '../archivos.js'
import { irA, leerHash, suscribir } from '../navegacion.js'
import Documentos from './Documentos.jsx'

// Padrón administrativo: la vista de los chicos para los managers. Datos de
// contacto, DNI, fecha de nacimiento, ficha médica y los escaneos del DNI, y
// nada más: la API (`padron/...`) no devuelve asistencia, evaluaciones,
// lesiones, tests ni observaciones, así que acá no hay nada que ocultar.
export default function Padron() {
  const [lista, setLista] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarBajas, setMostrarBajas] = useState(false)
  const [jugadorId, setJugadorId] = useState(() => leerHash()[1] || null)
  // Ampliación de la foto del DNI: se baja el archivo completo recién al tocarla
  const [foto, setFoto] = useState(null)

  useEffect(() => suscribir(() => {
    const [seccion, id] = leerHash()
    if (seccion === 'padron') setJugadorId(id || null)
  }), [])

  async function cargar() {
    setLista(await api('padron'))
  }
  useEffect(() => { cargar().catch(() => setLista([])) }, [])

  async function abrirFoto(j) {
    setFoto({ jugador: j, url: null })
    try {
      const r = await api(`documentos/${j.documento_id}`)
      setFoto({ jugador: j, url: URL.createObjectURL(base64ABlob(r.datos, r.mime)) })
    } catch {
      setFoto(null)
    }
  }
  function cerrarFoto() {
    setFoto((f) => { if (f?.url) URL.revokeObjectURL(f.url); return null })
  }
  useEffect(() => {
    if (!foto) return
    const salir = (e) => { if (e.key === 'Escape') cerrarFoto() }
    document.addEventListener('keydown', salir)
    return () => document.removeEventListener('keydown', salir)
  }, [foto])

  const visibles = useMemo(() => {
    if (!lista) return []
    const q = busqueda.trim().toLowerCase()
    return lista
      .filter((j) => mostrarBajas || j.estado !== 'inactivo')
      .filter((j) => !q || nombreCompleto(j).toLowerCase().includes(q) || (j.dni || '').includes(q))
  }, [lista, busqueda, mostrarBajas])

  if (jugadorId) {
    return (
      <DetallePadron
        jugadorId={jugadorId}
        onVolver={() => irA('padron')}
        onCambio={() => cargar().catch(() => {})}
      />
    )
  }

  if (!lista) return <div className="vacio">Cargando…</div>

  const enPlantel = lista.filter((j) => j.estado !== 'inactivo')
  const sinFicha = enPlantel.filter((j) => ['medica-vencida', 'medica-no'].includes(fichaMedica(j).clase))
  const sinDni = enPlantel.filter((j) => !j.documentos)
  const bajas = lista.length - enPlantel.length

  return (
    <div className="contenido">
      <h2>Padrón</h2>
      <p className="suave">
        Datos administrativos de los chicos: contacto del tutor, DNI, fecha de
        nacimiento y ficha médica. Tocá a uno para editarlo o cargar el escaneo del DNI.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="valor">{enPlantel.length}</div>
          <div className="etiqueta">En el plantel</div>
        </div>
        <div className="stat">
          <div className="valor" style={sinFicha.length ? { color: 'var(--warn)' } : undefined}>{sinFicha.length}</div>
          <div className="etiqueta">Sin ficha médica</div>
        </div>
        <div className="stat">
          <div className="valor" style={sinDni.length ? { color: 'var(--warn)' } : undefined}>{sinDni.length}</div>
          <div className="etiqueta">Sin DNI escaneado</div>
        </div>
      </div>

      <div className="fila" style={{ marginBottom: 8 }}>
        <input
          className="crece"
          placeholder="Buscar por nombre o DNI…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 8 }}
        />
        {bajas > 0 && (
          <button className="btn sec chico" onClick={() => setMostrarBajas((v) => !v)}>
            {mostrarBajas ? 'Ocultar bajas' : `Ver bajas (${bajas})`}
          </button>
        )}
      </div>

      {!visibles.length && <div className="vacio">No hay jugadores que coincidan.</div>}

      {visibles.map((j) => {
        const fm = fichaMedica(j)
        return (
          <button key={j.id} className="jugador-item compacto" onClick={() => irA('padron', j.id)}>
            {j.miniatura ? (
              <img
                className="avatar-foto"
                src={`data:image/jpeg;base64,${j.miniatura}`}
                alt={`DNI de ${nombreCompleto(j)}`}
                title="Tocá para ampliar el DNI"
                onClick={(e) => { e.stopPropagation(); abrirFoto(j) }}
              />
            ) : (
              <div className="avatar">{j.nombre[0]}{j.apellido[0]}</div>
            )}
            <div className="crece" style={{ minWidth: 0 }}>
              <div className="nombre-jugador">
                {nombreCompleto(j)}
                {j.estado === 'inactivo' && <span className="badge inactivo" style={{ marginLeft: 6 }}>baja</span>}
              </div>
              <div className="mini">
                {j.dni ? `DNI ${j.dni}` : 'Sin DNI'}
                {edad(j.fecha_nacimiento) != null ? ` · ${edad(j.fecha_nacimiento)} años` : ''}
                {j.tutor_telefono ? ` · 📞 ${j.tutor_telefono}` : ''}
              </div>
            </div>
            <span className={`badge ${fm.clase}`}>{fm.texto}</span>
          </button>
        )
      })}

      {foto && (
        <div className="lightbox" onClick={cerrarFoto}>
          <button className="lightbox-cerrar" onClick={cerrarFoto} aria-label="Cerrar">✕</button>
          {foto.url ? (
            <img
              src={foto.url}
              alt={`DNI de ${nombreCompleto(foto.jugador)}`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="lightbox-cargando">Cargando…</div>
          )}
        </div>
      )}
    </div>
  )
}

// Un chico del padrón: sus datos administrativos, editables, y sus documentos
function DetallePadron({ jugadorId, onVolver, onCambio }) {
  const [j, setJ] = useState(null)
  const [documentos, setDocumentos] = useState([])
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(false)

  async function cargar() {
    try {
      const d = await api(`padron/${jugadorId}`)
      setJ(d.jugador)
      setDocumentos(d.documentos)
    } catch {
      setError('No se pudo cargar el jugador.')
    }
  }
  useEffect(() => { cargar() }, [jugadorId])

  if (error) {
    return (
      <div className="contenido">
        <button className="btn sec chico" onClick={onVolver}>← Padrón</button>
        <div className="error" style={{ marginTop: 10 }}>{error}</div>
      </div>
    )
  }
  if (!j) return <div className="vacio">Cargando…</div>

  const fm = fichaMedica(j)

  return (
    <div className="contenido">
      <div className="fila entre">
        <button className="btn sec chico" onClick={onVolver}>← Padrón</button>
        {!editando && <button className="btn chico" onClick={() => setEditando(true)}>Editar datos</button>}
      </div>

      <div className="tarjeta">
        <div className="fila">
          <div className="avatar" style={{ width: 52, height: 52, fontSize: '1.1rem' }}>
            {j.nombre[0]}{j.apellido[0]}
          </div>
          <div className="crece">
            <h2>{nombreCompleto(j)}</h2>
            <div className="suave">
              {edad(j.fecha_nacimiento) != null ? `${edad(j.fecha_nacimiento)} años · ` : ''}
              {j.fecha_nacimiento ? `nac. ${fechaCorta(j.fecha_nacimiento)}` : 'sin fecha de nacimiento'}
              {j.dni ? ` · DNI ${j.dni}` : ' · sin DNI'}
            </div>
            <div className="fila" style={{ marginTop: 6 }}>
              {j.estado === 'inactivo' && <span className="badge inactivo">Baja</span>}
              <span className={`badge ${fm.clase}`}>{fm.texto}</span>
            </div>
          </div>
        </div>
        <p className="suave" style={{ marginTop: 10 }}>
          Tutor: {j.tutor_nombre || '—'}
          {j.tutor_telefono && <> · <a href={`tel:${j.tutor_telefono}`}>{j.tutor_telefono}</a></>}
        </p>
      </div>

      {editando && (
        <FormPadron
          inicial={j}
          onCerrar={() => setEditando(false)}
          onGuardado={(nuevo) => {
            setJ(nuevo)
            setEditando(false)
            onCambio()
          }}
        />
      )}

      <Documentos
        jugadorId={jugadorId}
        documentos={documentos}
        onCambio={() => { cargar(); onCambio() }}
      />
    </div>
  )
}

// Solo los campos administrativos: nombre, estado y puestos los manejan los
// entrenadores desde la ficha (y la API del padrón tampoco los acepta).
function FormPadron({ inicial, onCerrar, onGuardado }) {
  const [f, setF] = useState({
    fecha_nacimiento: inicial.fecha_nacimiento || '',
    dni: inicial.dni || '',
    tutor_nombre: inicial.tutor_nombre || '',
    tutor_telefono: inicial.tutor_telefono || '',
    ficha_medica_vigente: !!inicial.ficha_medica_vigente,
    ficha_medica_vence: inicial.ficha_medica_vence || '',
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  function campo(k) {
    return {
      value: f[k] ?? '',
      onChange: (e) => setF({ ...f, [k]: e.target.value }),
    }
  }

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    setError('')
    try {
      const nuevo = await api(`padron/${inicial.id}`, { method: 'PUT', body: f })
      onGuardado(nuevo)
    } catch {
      setError('No se pudo guardar. Revisá los datos y probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <form className="tarjeta" onSubmit={guardar}>
      <div className="grid2">
        <div className="campo">
          <label>DNI</label>
          <input inputMode="numeric" {...campo('dni')} />
        </div>
        <div className="campo">
          <label>Fecha de nacimiento</label>
          <input type="date" {...campo('fecha_nacimiento')} />
        </div>
        <div className="campo">
          <label>Nombre del tutor</label>
          <input {...campo('tutor_nombre')} />
        </div>
        <div className="campo">
          <label>Teléfono del tutor</label>
          <input inputMode="tel" {...campo('tutor_telefono')} />
        </div>
      </div>

      <div className="grid2">
        <div className="campo">
          <label className="fila" style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24 }}>
            <input
              type="checkbox"
              style={{ width: 18, height: 18 }}
              checked={!!f.ficha_medica_vigente}
              onChange={(e) => setF({ ...f, ficha_medica_vigente: e.target.checked })}
            />
            Ficha médica vigente
          </label>
        </div>
        <div className="campo">
          <label>Vencimiento ficha médica</label>
          <input type="date" {...campo('ficha_medica_vence')} />
        </div>
      </div>

      {error && <div className="error">{error}</div>}
      <div className="fila">
        <button className="btn crece" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn sec" onClick={onCerrar}>Cancelar</button>
      </div>
    </form>
  )
}
