import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { edad, nombreCompleto } from '../helpers.js'
import Ficha from './Ficha.jsx'

const VACIO = {
  nombre: '', apellido: '', fecha_nacimiento: '', dni: '', posicion: '',
  estado: 'activo', tutor_nombre: '', tutor_telefono: '',
  ficha_medica_vigente: false, observaciones: '',
}

export default function Jugadores() {
  const [jugadores, setJugadores] = useState([])
  const [filtro, setFiltro] = useState('activo')
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState(null) // objeto jugador o VACIO
  const [fichaDe, setFichaDe] = useState(null)
  const [cargando, setCargando] = useState(true)

  async function cargar() {
    const { data } = await supabase
      .from('rugby_jugadores')
      .select('*')
      .order('apellido')
      .order('nombre')
    setJugadores(data || [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const visibles = jugadores.filter((j) => {
    if (filtro !== 'todos' && j.estado !== filtro) return false
    const q = busqueda.trim().toLowerCase()
    if (!q) return true
    return `${j.nombre} ${j.apellido} ${j.dni || ''}`.toLowerCase().includes(q)
  })

  if (fichaDe) {
    return (
      <Ficha
        jugadorId={fichaDe}
        onVolver={() => { setFichaDe(null); cargar() }}
      />
    )
  }

  return (
    <div className="contenido">
      <div className="fila entre">
        <h2>Jugadores ({visibles.length})</h2>
        <button className="btn" onClick={() => setEditando({ ...VACIO })}>+ Nuevo</button>
      </div>

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

      {visibles.map((j) => (
        <button key={j.id} className="jugador-item" onClick={() => setFichaDe(j.id)}>
          <div className="avatar">{j.nombre[0]}{j.apellido[0]}</div>
          <div className="crece">
            <div style={{ fontWeight: 600 }}>{nombreCompleto(j)}</div>
            <div className="mini">
              {edad(j.fecha_nacimiento) != null ? `${edad(j.fecha_nacimiento)} años` : 'sin fecha de nac.'}
              {j.posicion ? ` · ${j.posicion}` : ''}
            </div>
          </div>
          {j.estado !== 'activo' && <span className={`badge ${j.estado}`}>{j.estado}</span>}
          <span className={`badge ${j.ficha_medica_vigente ? 'medica-ok' : 'medica-no'}`}>
            {j.ficha_medica_vigente ? 'Ficha médica ✓' : 'Sin ficha médica'}
          </span>
        </button>
      ))}

      {editando && (
        <FormJugador
          inicial={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar() }}
        />
      )}
    </div>
  )
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
    const datos = {
      nombre: f.nombre.trim(),
      apellido: f.apellido.trim(),
      fecha_nacimiento: f.fecha_nacimiento || null,
      dni: f.dni?.trim() || null,
      posicion: f.posicion?.trim() || null,
      estado: f.estado,
      tutor_nombre: f.tutor_nombre?.trim() || null,
      tutor_telefono: f.tutor_telefono?.trim() || null,
      ficha_medica_vigente: !!f.ficha_medica_vigente,
      observaciones: f.observaciones?.trim() || null,
    }
    const q = esNuevo
      ? supabase.from('rugby_jugadores').insert(datos)
      : supabase.from('rugby_jugadores').update(datos).eq('id', f.id)
    const { error } = await q
    if (error) { setError(error.message); setGuardando(false); return }
    onGuardado()
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

        <div className="campo">
          <label className="fila" style={{ flexDirection: 'row', alignItems: 'center' }}>
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
