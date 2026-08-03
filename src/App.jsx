import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient.js'
import Login from './pages/Login.jsx'
import Jugadores from './pages/Jugadores.jsx'
import Asistencia from './pages/Asistencia.jsx'
import Partidos from './pages/Partidos.jsx'
import Staff from './pages/Staff.jsx'

const TABS = [
  { id: 'jugadores', label: 'Jugadores', ico: '👥' },
  { id: 'asistencia', label: 'Asistencia', ico: '📋' },
  { id: 'partidos', label: 'Día de partido', ico: '🏉' },
  { id: 'staff', label: 'Staff', ico: '🧑‍🏫' },
]

export default function App() {
  const [sesion, setSesion] = useState(undefined) // undefined = cargando
  const [staff, setStaff] = useState(undefined) // fila de rugby_staff del usuario
  const [tab, setTab] = useState('jugadores')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSesion(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Al loguearse, buscar (y reclamar si hace falta) la invitación de staff
  useEffect(() => {
    if (!sesion) { setStaff(undefined); return }
    let cancelado = false
    async function verificar() {
      const email = (sesion.user.email || '').toLowerCase()
      const { data: fila } = await supabase
        .from('rugby_staff')
        .select('*')
        .eq('email', email)
        .maybeSingle()
      if (cancelado) return
      if (fila && !fila.user_id) {
        // invitación pendiente: vincular esta cuenta
        const { data: reclamada } = await supabase
          .from('rugby_staff')
          .update({ user_id: sesion.user.id })
          .eq('email', email)
          .is('user_id', null)
          .select()
          .maybeSingle()
        if (!cancelado) setStaff(reclamada || null)
      } else {
        setStaff(fila || null)
      }
    }
    verificar()
    return () => { cancelado = true }
  }, [sesion])

  if (sesion === undefined) return <div className="vacio">Cargando…</div>
  if (!sesion) return <Login />

  if (staff === undefined) return <div className="vacio">Verificando acceso…</div>

  if (!staff || !staff.activo) {
    return (
      <div className="login-wrap">
        <div className="login-caja">
          <h1>Acceso no autorizado</h1>
          <p className="suave">
            Tu cuenta ({sesion.user.email}) no está habilitada como staff de la
            división M12. Pedile a un miembro del staff que te agregue desde la
            pestaña "Staff".
          </p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>Rugby M12</h1>
          <div className="sub">Tucumán Lawn Tennis · {staff.nombre || sesion.user.email}</div>
        </div>
        <button onClick={() => supabase.auth.signOut()}>Salir</button>
      </header>

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'activo' : ''}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'jugadores' && <Jugadores />}
      {tab === 'asistencia' && <Asistencia />}
      {tab === 'partidos' && <Partidos />}
      {tab === 'staff' && <Staff yo={staff} />}
    </div>
  )
}
