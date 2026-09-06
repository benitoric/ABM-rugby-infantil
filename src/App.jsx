import { useEffect, useState } from 'react'
import { api, getToken, setToken, onSesionExpirada } from './api.js'
import { irA, leerHash, suscribir } from './navegacion.js'
import Login from './pages/Login.jsx'
import Jugadores from './pages/Jugadores.jsx'
import Entrenamientos from './pages/Entrenamientos.jsx'
import Partidos from './pages/Partidos.jsx'
import Staff from './pages/Staff.jsx'
import { VERSION } from './version.js'

const TABS = [
  { id: 'jugadores', label: 'Jugadores', ico: '👥' },
  { id: 'entrenamientos', label: 'Entrenamientos', ico: '📋' },
  { id: 'partidos', label: 'Partidos', ico: '🏉' },
  { id: 'staff', label: 'Staff', ico: '🧑‍🏫' },
]

// La pestaña activa vive en el hash (#/jugadores, #/partidos/...): sobrevive
// recargas y descartes de la PWA, y el botón "atrás" vuelve a la vista anterior
const tabDeHash = () => {
  const [t] = leerHash()
  // #/asistencia es el nombre viejo de la pestaña: los hashes guardados en el
  // celular de cada uno siguen abriendo Entrenamientos
  if (t === 'asistencia') return 'entrenamientos'
  return TABS.some((x) => x.id === t) ? t : 'jugadores'
}

export default function App() {
  const [staff, setStaff] = useState(undefined) // undefined = cargando, null = sin sesión
  const [tab, setTab] = useState(tabDeHash)

  useEffect(() => suscribir(() => setTab(tabDeHash())), [])

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
          <div className="sub">Tucumán Lawn Tennis · {staff.nombre || staff.email} · {VERSION}</div>
        </div>
        <button onClick={salir}>Salir</button>
      </header>

      <nav className="nav no-imprimir">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'activo' : ''}
            // Ya activa: no se pisa el hash, que puede tener la posición
            // interna de la pestaña (partido y vista elegidos)
            onClick={() => tab !== t.id && irA(t.id)}
          >
            <span className="ico">{t.ico}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'jugadores' && <Jugadores yo={staff} />}
      {tab === 'entrenamientos' && <Entrenamientos yo={staff} />}
      {tab === 'partidos' && <Partidos />}
      {tab === 'staff' && <Staff yo={staff} />}
    </div>
  )
}
