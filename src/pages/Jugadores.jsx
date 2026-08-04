import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { fechaCorta, nombreCompleto, APTITUDES } from '../helpers.js'
import Ficha from './Ficha.jsx'

const VACIO = {
  nombre: '', apellido: '', fecha_nacimiento: '', dni: '', posicion: '',
  aptitudes: [], estado: 'activo', tutor_nombre: '', tutor_telefono: '',
  ficha_medica_vigente: false, ficha_medica_vence: '', observaciones: '',
}

export default function Jugadores() {
  const [jugadores, setJugadores] = useState([])
  const [filtro, setFiltro] = useState('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null)
  const [fichaDe, setFichaDe] = useState(null)
  const [importando, setImportando] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [orden, setOrden] = useState({ campo: 'nombre', asc: true })

  async function cargar() {
    setJugadores(await api('jugadores'))
    setCargando(false)
  }
  useEffect(() => { cargar().catch(() => setCargando(false)) }, [])

  const visibles = jugadores.filter((j) => {
    if (filtro !== 'todos' && j.estado !== filtro) return false
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return `${j.nombre} ${j.apellido} ${j.dni || ''}`.toLowerCase().includes(q)
  })

  const RANGO_ESTADO = { activo: 0, lesionado: 1, inactivo: 2 }
  const ordenados = [...visibles].sort((a, b) => {
    let cmp = 0
    if (orden.campo === 'puesto') cmp = (a.posicion || 'zz').localeCompare(b.posicion || 'zz')
    else if (orden.campo === 'aptitudes') cmp = (a.aptitudes || []).length - (b.aptitudes || []).length
    else if (orden.campo === 'estado') cmp = RANGO_ESTADO[a.estado] - RANGO_ESTADO[b.estado]
    const desempate = nombreCompleto(a).localeCompare(nombreCompleto(b), 'es')
    return (orden.asc ? 1 : -1) * (cmp || desempate)
  })

  function encabezado(campo, texto) {
    const activo = orden.campo === campo
    return (
      <button
        className={`orden-btn ${activo ? 'activo' : ''}`}
        onClick={() => setOrden({ campo, asc: activo ? !orden.asc : true })}
      >
        {texto}{activo ? (orden.asc ? ' ▲' : ' ▼') : ''}
      </button>
    )
  }

  if (fichaDe) {
    return (
      <Ficha
        jugadorId={fichaDe}
        onVolver={() => { setFichaDe(null); cargar() }}
      />
    )
  }

  const activos = jugadores.filter((j) => j.estado !== 'inactivo')
  const mesActual = new Date().getMonth() + 1
  const cumples = activos
    .filter((j) => j.fecha_nacimiento && Number(j.fecha_nacimiento.split('-')[1]) === mesActual)
    .sort((a, b) => Number(a.fecha_nacimiento.split('-')[2]) - Number(b.fecha_nacimiento.split('-')[2]))
  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Jugadores ({visibles.length})</h2>
        <div className="fila">
          <button className="btn sec" onClick={() => setImportando(true)}>Importar lista</button>
          <button className="btn" onClick={() => setEditando({ ...VACIO })}>+ Nuevo</button>
        </div>
      </div>

      {cumples.length > 0 && (
        <div className="tarjeta">
          <h3>🎂 Cumpleaños de este mes</h3>
          {cumples.map((j) => (
            <div key={j.id} className="mini" style={{ marginTop: 4 }}>
              {Number(j.fecha_nacimiento.split('-')[2])}/{mesActual} — {nombreCompleto(j)} (cumple {new Date().getFullYear() - Number(j.fecha_nacimiento.split('-')[0])})
            </div>
          ))}
        </div>
      )}

      <input
        className="crece"
        style={{ border: '1px solid var(--borde)', borderRadius: 10, padding: 10 }}
        placeholder="Buscar por nombre, apellido o DNI…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      <div className="fila">
        {[['activo', 'Activos'], ['lesionado', 'Lesionados'], ['inactivo', 'Inactivos'], ['todos', 'Todos']].map(([v, l]) => (
          <button key={v} className={`chip ${filtro === v ? 'activo' : ''}`} onClick={() => setFiltro(v)}>
            {l}
          </button>
        ))}
      </div>

      {cargando && <div className="vacio">Cargando…</div>}
      {!cargando && visibles.length === 0 && (
        <div className="vacio">No hay jugadores en esta vista. Agregá el primero con "+ Nuevo".</div>
      )}

      {!cargando && visibles.length > 0 && (
        <div className="fila-jugador tabla-cab">
          {encabezado('nombre', 'Jugador')}
          {encabezado('puesto', 'Puesto')}
          {encabezado('aptitudes', 'Aptitudes')}
          {encabezado('estado', 'Estado')}
        </div>
      )}

      {ordenados.map((j) => (
        <button key={j.id} className="jugador-item compacto fila-jugador" onClick={() => setFichaDe(j.id)}>
          <div className="fila celda-nombre">
            <div className="avatar">{j.nombre[0]}{j.apellido[0]}</div>
            <div className="crece nombre-jugador">{nombreCompleto(j)}</div>
          </div>
          <div>
            {j.posicion && (
              <span className={`badge puesto-${j.posicion.toLowerCase()}`}>{j.posicion}</span>
            )}
          </div>
          <div className="etiquetas">
            {APTITUDES.filter((a) => (j.aptitudes || []).includes(a.value)).map((a) => (
              <span key={a.value} className="badge aptitud">{a.abrev}</span>
            ))}
          </div>
          <div>
            {j.estado === 'lesionado' && <span className="badge lesionado">🤕 Lesión</span>}
            {j.estado === 'inactivo' && <span className="badge inactivo">Inactivo</span>}
          </div>
        </button>
      ))}

      {editando && (
        <FormJugador
          inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }}
        />
      )}

      {importando && (
        <ImportarLista
          onCerrar={() => setImportando(false)}
          onImportado={() => { setImportando(false); cargar() }}
        />
      )}
    </div>
  )
}

function ImportarLista({ onCerrar, onImportado }) {
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const lineas = texto.split('\n').map(parsearLinea).filter(Boolean)
  const validos = lineas.filter((l) => !l.error)
  const invalidos = lineas.filter((l) => l.error)

  async function importar() {
    if (!validos.length) return
    setGuardando(true)
    setError('')
    try {
      await api('jugadores/lote', { method: 'POST', body: { jugadores: validos } })
      onImportado()
    } catch {
      setError('No se pudo importar. Probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="fila entre" style={{ marginBottom: 12 }}>
          <h3>Importar lista de jugadores</h3>
          <button className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="mini" style={{ marginBottom: 8 }}>
          <b>Opción 1 (recomendada):</b>{' '}
          <a href="plantilla-jugadores.xlsx" download>⬇ descargá la plantilla de Excel</a>,
          completala y pegá acá las filas copiadas (sin el encabezado): se cargan
          todos los datos de una (tutor, DNI, ficha médica, etc.).<br />
          <b>Opción 2:</b> escribí un jugador por línea: <b>Apellido, Nombre</b> ·{' '}
          <b>Nombre Apellido</b> · con fecha de nacimiento opcional después de punto
          y coma: <b>Pérez, Juan; 12/05/2014</b>
        </p>
        <div className="campo">
          <textarea
            style={{ minHeight: 140 }}
            placeholder={'Pérez, Juan; 12/05/2014\nGómez, Pedro\nLuis Díaz'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </div>
        {validos.length > 0 && (
          <div className="tarjeta" style={{ marginBottom: 10 }}>
            <b className="mini">Se van a crear {validos.length} jugadores:</b>
            {validos.map((l, i) => (
              <div key={i} className="mini">
                • {l.apellido}, {l.nombre}
                {l.fecha_nacimiento ? ` (nac. ${fechaCorta(l.fecha_nacimiento)})` : ''}
                {l.dni ? ` · DNI ${l.dni}` : ''}
                {l.posicion ? ` · ${l.posicion}` : ''}
                {l.tutor_nombre ? ` · tutor: ${l.tutor_nombre}` : ''}
                {l.ficha_medica_vence ? ` · ficha vence ${fechaCorta(l.ficha_medica_vence)}` : ''}
              </div>
            ))}
          </div>
        )}
        {invalidos.length > 0 && (
          <div className="error" style={{ marginBottom: 10 }}>
            Líneas que no se entienden (corregilas o se omiten): {invalidos.map((l) => `"${l.error}"`).join(', ')}
          </div>
        )}
        {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={!validos.length || guardando} onClick={importar}>
          {guardando ? 'Importando…' : `Importar ${validos.length} jugadores`}
        </button>
      </div>
    </div>
  )
}

function parsearFecha(texto) {
  const t = (texto || '').trim()
  if (!t) return null
  const dmy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dmy) {
    const anio = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    return `${anio}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  return undefined // formato no reconocido
}

function parsearLinea(linea) {
  const l = linea.replace(/\r$/, '')
  if (!l.trim()) return null

  // Filas copiadas desde Excel: columnas separadas por tabulaciones,
  // en el orden de la plantilla.
  if (l.includes('\t')) {
    const c = l.split('\t').map((s) => s.trim())
    const [apellido, nombre, fnac, dni, posicion, tutor, telefono, vence, obs] = c
    if (/^apellido$/i.test(apellido)) return null // encabezado pegado: se omite
    if (!apellido || !nombre) return { error: l.slice(0, 50) }
    const fecha = parsearFecha(fnac)
    const fichaVence = parsearFecha(vence)
    if (fecha === undefined || fichaVence === undefined) return { error: l.slice(0, 50) }
    return {
      nombre, apellido,
      fecha_nacimiento: fecha,
      dni: dni || null,
      posicion: posicion || null,
      tutor_nombre: tutor || null,
      tutor_telefono: telefono || null,
      ficha_medica_vence: fichaVence,
      observaciones: obs || null,
    }
  }

  // Formato de texto simple
  const [parte, extra] = l.trim().split(';').map((s) => s.trim())
  let nombre, apellido
  if (parte.includes(',')) {
    ;[apellido, nombre] = parte.split(',').map((s) => s.trim())
  } else {
    const t = parte.split(/\s+/)
    nombre = t[0]
    apellido = t.slice(1).join(' ')
  }
  if (!nombre || !apellido) return { error: l.trim() }
  let fecha = null
  if (extra) {
    fecha = parsearFecha(extra)
    if (!fecha) return { error: l.trim() }
  }
  return { nombre, apellido, fecha_nacimiento: fecha }
}

export function FormJugador({ inicial, onCerrar, onGuardado }) {
  const [f, setF] = useState(inicial)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const esNuevo = !f.id

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
      if (esNuevo) await api('jugadores', { method: 'POST', body: f })
      else await api(`jugadores/${f.id}`, { method: 'PUT', body: f })
      onGuardado()
    } catch (err) {
      setError('No se pudo guardar. Revisá los datos y probá de nuevo.')
      setGuardando(false)
    }
  }

  return (
    <div className="modal-fondo" onClick={onCerrar}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={guardar}>
        <div className="fila entre" style={{ marginBottom: 12 }}>
          <h3>{esNuevo ? 'Nuevo jugador' : 'Editar jugador'}</h3>
          <button type="button" className="btn sec chico" onClick={onCerrar}>Cerrar</button>
        </div>

        <div className="grid2">
          <div className="campo">
            <label>Nombre *</label>
            <input required {...campo('nombre')} />
          </div>
          <div className="campo">
            <label>Apellido *</label>
            <input required {...campo('apellido')} />
          </div>
          <div className="campo">
            <label>Fecha de nacimiento</label>
            <input type="date" {...campo('fecha_nacimiento')} />
          </div>
          <div className="campo">
            <label>DNI</label>
            <input inputMode="numeric" {...campo('dni')} />
          </div>
          <div className="campo">
            <label>Posición</label>
            <select {...campo('posicion')}>
              <option value="">Sin definir</option>
              <option>Forward</option>
              <option>Back</option>
              <option>Mixto</option>
            </select>
          </div>
          <div className="campo" style={{ gridColumn: '1 / -1' }}>
            <label>Aptitudes (marcá todas las que correspondan)</label>
            <div className="fila" style={{ gap: '4px 14px' }}>
              {APTITUDES.map((a) => (
                <label key={a.value} className="fila" style={{ gap: 6, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: 17, height: 17 }}
                    checked={(f.aptitudes || []).includes(a.value)}
                    onChange={(e) => {
                      const actuales = f.aptitudes || []
                      setF({
                        ...f,
                        aptitudes: e.target.checked
                          ? [...actuales, a.value]
                          : actuales.filter((x) => x !== a.value),
                      })
                    }}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
          <div className="campo">
            <label>Estado</label>
            <select {...campo('estado')}>
              <option value="activo">Activo</option>
              <option value="lesionado">Lesionado</option>
              <option value="inactivo">Inactivo (baja)</option>
            </select>
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

        <div className="campo">
          <label>Observaciones (salud, alergias, notas)</label>
          <textarea {...campo('observaciones')} />
        </div>

        {error && <div className="error">{error}</div>}
        <button className="btn" disabled={guardando} style={{ width: '100%' }}>
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </div>
  )
}
