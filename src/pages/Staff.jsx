import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { ROLES_STAFF, nombreStaff } from '../helpers.js'
import Avisos from './Avisos.jsx'

export default function Staff({ yo }) {
  const [staff, setStaff] = useState([])
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [rol, setRol] = useState('')
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null) // email de la fila en edición
  const [edicion, setEdicion] = useState({ nombre: '', apellido: '' })

  async function cargar() {
    setStaff(await api('staff'))
  }
  useEffect(() => { cargar() }, [])

  async function invitar(e) {
    e.preventDefault()
    setError('')
    if (!rol) { setError('Elegí un rol antes de agregarlo.'); return }
    try {
      await api('staff', {
        method: 'POST',
        body: {
          email,
          nombre: nombre.trim() || null,
          apellido: apellido.trim() || null,
          rol,
        },
      })
      setEmail('')
      setNombre('')
      setApellido('')
      setRol('')
      cargar()
    } catch (err) {
      setError(err.error === 'ya_existe' ? 'Ese email ya está en la lista.'
        : err.error === 'rol_requerido' ? 'Elegí un rol antes de agregarlo.'
        : 'No se pudo agregar.')
    }
  }

  function empezarEdicion(fila) {
    setEditando(fila.email)
    setEdicion({ nombre: fila.nombre || '', apellido: fila.apellido || '' })
  }

  async function guardarEdicion(e) {
    e.preventDefault()
    await api(`staff/${editando}`, {
      method: 'PUT',
      body: {
        nombre: edicion.nombre.trim() || null,
        apellido: edicion.apellido.trim() || null,
      },
    })
    setEditando(null)
    cargar()
  }

  async function cambiarRol(fila, nuevoRol) {
    if (!nuevoRol) return
    await api(`staff/${fila.email}`, {
      method: 'PUT',
      body: { rol: nuevoRol },
    })
    cargar()
  }

  async function alternarActivo(fila) {
    await api(`staff/${fila.email}`, {
      method: 'PUT',
      body: { activo: !fila.activo },
    })
    cargar()
  }

  async function quitar(fila) {
    if (!confirm(`¿Quitar a ${fila.email} del staff?`)) return
    await api(`staff/${fila.email}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="contenido">
      <Avisos />

      <h2>Staff</h2>
      <p className="suave">
        Entrenadores, preparadores físicos y la cabeza de división ven toda la
        app. Los managers (principal y asistente) entran solo a lo
        administrativo: Padrón, Viajes y sus avisos; no ven asistencia,
        evaluaciones, entrenamientos ni partidos.
        {yo.admin && (
          <> Para sumar a alguien: agregá su email con su rol y pedile que ingrese
          con ese email; en el primer ingreso la app le pide crear su contraseña.</>
        )}
      </p>

      {yo.admin && (
        <form className="tarjeta" onSubmit={invitar}>
          <div className="campo">
            <label>Email *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="grid2">
            <div className="campo">
              <label>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="campo">
              <label>Apellido</label>
              <input value={apellido} onChange={(e) => setApellido(e.target.value)} />
            </div>
          </div>
          <div className="campo">
            <label>Rol *</label>
            <select required value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="">Elegí un rol</option>
              {ROLES_STAFF.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn" style={{ width: '100%' }}>Agregar al staff</button>
        </form>
      )}

      {staff.map((s) => (
        <div key={s.email} className="tarjeta">
          <div className="fila">
            <div className="avatar">{(s.nombre || s.email)[0].toUpperCase()}</div>
            <div className="crece">
              <div style={{ fontWeight: 600 }}>
                {nombreStaff(s)}
                {s.email === yo.email && <span className="badge activo" style={{ marginLeft: 6 }}>vos</span>}
                {!s.activo && <span className="badge inactivo" style={{ marginLeft: 6 }}>suspendido</span>}
              </div>
              <div className="mini">
                {s.email}
                {s.rol ? ` · ${s.rol}` : ' · sin rol'}
                {!s.tiene_clave && ' · todavía no ingresó por primera vez'}
              </div>
            </div>
            {yo.admin && editando !== s.email && (
              <button className="btn sec chico" onClick={() => empezarEdicion(s)}>Editar</button>
            )}
          </div>

          {yo.admin && editando === s.email && (
            <form onSubmit={guardarEdicion} style={{ marginTop: 10 }}>
              <div className="grid2">
                <div className="campo">
                  <label>Nombre</label>
                  <input
                    autoFocus
                    value={edicion.nombre}
                    onChange={(e) => setEdicion({ ...edicion, nombre: e.target.value })}
                  />
                </div>
                <div className="campo">
                  <label>Apellido</label>
                  <input
                    value={edicion.apellido}
                    onChange={(e) => setEdicion({ ...edicion, apellido: e.target.value })}
                  />
                </div>
              </div>
              <div className="fila">
                <button className="btn chico crece">Guardar</button>
                <button type="button" className="btn sec chico" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {yo.admin && (
            <div className="fila" style={{ marginTop: 10 }}>
              <select
                className="crece"
                style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 8 }}
                value={s.rol || ''}
                onChange={(e) => cambiarRol(s, e.target.value)}
              >
                {!s.rol && <option value="">Elegí un rol</option>}
                {ROLES_STAFF.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {s.email !== yo.email && (
                <>
                  <button className="btn sec chico" onClick={() => alternarActivo(s)}>
                    {s.activo ? 'Suspender' : 'Reactivar'}
                  </button>
                  <button className="btn peligro chico" onClick={() => quitar(s)}>Quitar</button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
