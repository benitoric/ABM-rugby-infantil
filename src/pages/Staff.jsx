import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Staff({ yo }) {
  const [staff, setStaff] = useState([])
  const [email, setEmail] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')

  async function cargar() {
    const { data } = await supabase.from('rugby_staff').select('*').order('created_at')
    setStaff(data || [])
  }
  useEffect(() => { cargar() }, [])

  async function invitar(e) {
    e.preventDefault()
    setError('')
    const { error } = await supabase.from('rugby_staff').insert({
      email: email.trim().toLowerCase(),
      nombre: nombre.trim() || null,
    })
    if (error) {
      setError(error.code === '23505' ? 'Ese email ya está en la lista.' : error.message)
      return
    }
    setEmail('')
    setNombre('')
    cargar()
  }

  async function alternarActivo(fila) {
    await supabase.from('rugby_staff').update({ activo: !fila.activo }).eq('email', fila.email)
    cargar()
  }

  async function quitar(fila) {
    if (!confirm(`¿Quitar a ${fila.email} del staff?`)) return
    await supabase.from('rugby_staff').delete().eq('email', fila.email)
    cargar()
  }

  return (
    <div className="contenido">
      <h2>Staff</h2>
      <p className="suave">
        Todos los del staff tienen acceso completo a la app. Para sumar a alguien:
        agregá su email acá y pedile que cree su cuenta desde la pantalla de ingreso
        con ese mismo email.
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
              {!s.user_id && ' · todavía no creó su cuenta'}
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
