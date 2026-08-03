import { useEffect, useState } from 'react'
import { api, getToken, setToken, onSesionExpirada } from './api.js'
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
  const [staff, setStaff] = useState(undefined) // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState('jugadores')

  useEffect(() => {
    onSesionExpirada(() => setStaff(null))
    if (!getToken()) { setStaff(null); return }
    api('me')
      .then(setStaff)
      .catch(() => { setToken(null); setStaff(null) })
  }, [])

  function salir() {
    setToken(null)
    setStaff(null)
  }

  if (staff === undefined) return <div className="vacio">Cargando…</div>
  if (!staff) return <Login onIngreso={setStaff} />

  return (
    <div className="app">
      <header className="header no-imprimir">
        <div>
          <h1>Rugby M12</h1>
          <div className="sub">Tucumán Lawn Tennis · {staff.nombre || staff.email}</div>
        </div>
        <button onClick={salir}>Salir</button>
      </header>

      <nav className="nav no-imprimir">
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
