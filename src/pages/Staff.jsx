import { useEffect, useState } from 'react'
import { api } from '../api.js'

export default function Staff({ yo }) {
  const [staff, setStaff] = useState([])
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  async function cargar() {
    setStaff(await api('staff'))
  }
  useEffect(() => { cargar() }, [])

  async function invitar(e) {
    e.preventDefault()
    setError('')
    try {
      await api('staff', { method: 'POST', body: { email, nombre: nombre.trim() || null } })
      setEmail('')
      setNombre('')
      cargar()
    } catch (err) {
      setError(err.error === 'ya_existe' ? 'Ese email ya está en la lista.' : 'No se pudo agregar.')
    }
  }

  async function alternarActivo(fila) {
    await api(`staff/${encodeURIComponent(fila.email)}`, {
      method: 'PUT',
      body: { activo: !fila.activo },
    })
    cargar()
  }

  async function quitar(fila) {
    if (!confirm(`¿Quitar a ${fila.email} del staff?`)) return
    await api(`staff/${encodeURIComponent(fila.email)}`, { method: 'DELETE' })
    cargar()
  }

  return (
    <div className="contenido">
      <h2>Staff</h2>
      <p className="suave">
        Todos los del staff tienen acceso completo a la app. Para sumar a alguien:
        agregá su email acá y pedile que ingrese con ese email; en el primer
        ingreso la app le pide crear su contraseña.
      </p>

      <form className="tarjeta" onSubmit={invitar}>
        <div className="grid2">
          <div className="campo">
            <label>Email *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn" style={{ width: '100%' }}>Agregar al staff</button>
      </form>

      {staff.map((s) => (
        <div key={s.email} className="jugador-item" style={{ cursor: 'default' }}>
          <div className="avatar">{(s.nombre || s.email)[0].toUpperCase()}</div>
          <div className="crece">
            <div style={{ fontWeight: 600 }}>{s.nombre || s.email}</div>
            <div className="mini">
              {s.email}
              {!s.tiene_clave && ' · todavía no ingresó por primera vez'}
            </div>
          </div>
          {!s.activo && <span className="badge inactivo">suspendido</span>}
          {s.email !== yo.email && (
            <>
              <button className="btn sec chico" onClick={() => alternarActivo(s)}>
                {s.activo ? 'Suspender' : 'Reactivar'}
              </button>
              <button className="btn peligro chico" onClick={() => quitar(s)}>Quitar</button>
            </>
          )}
          {s.email === yo.email && <span className="badge activo">vos</span>}
        </div>
      ))}
    </div>
  )
}
