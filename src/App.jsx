import { useEffect, useState } from 'react'
import { api, getToken, setToken, onSesionExpirada } from './api.js'
import { irA, leerHash, suscribir } from './navegacion.js'
import Login from './pages/Login.jsx'
import Jugadores from './pages/Jugadores.jsx'
import Entrenamientos from './pages/Entrenamientos.jsx'
import Partidos from './pages/Partidos.jsx'
import Viajes from './pages/Viajes.jsx'
import Staff from './pages/Staff.jsx'
import Padron from './pages/Padron.jsx'
import Avisos from './pages/Avisos.jsx'
import { VERSION } from './version.js'
import { useVersionNueva } from './actualizacion.js'

// Pestañas de quienes ven todo (entrenadores, PF, cabeza de división)
const TABS_COMPLETO = [
  { id: 'jugadores', label: 'Jugadores', ico: '👥' },
  { id: 'entrenamientos', label: 'Entrenamientos', ico: '📋' },
  { id: 'partidos', label: 'Partidos', ico: '🏉' },
  { id: 'viajes', label: 'Viajes', ico: '🚌' },
  { id: 'staff', label: 'Staff', ico: '🧑‍🏫' },
]

// Pestañas de los managers (alcance administrativo): solo lo administrativo.
// Esto es cosmética: la API les cierra todo lo demás (server/permisos.js).
const TABS_ADMINISTRATIVO = [
  { id: 'padron', label: 'Padrón', ico: '🗂️' },
  { id: 'viajes', label: 'Viajes', ico: '🚌' },
  { id: 'avisos', label: 'Avisos', ico: '🔔' },
]

const tabsDe = (staff) => (staff?.alcance === 'completo' ? TABS_COMPLETO : TABS_ADMINISTRATIVO)

// La pestaña activa vive en el hash (#/jugadores, #/partidos/...): sobrevive
// recargas y descartes de la PWA, y el botón "atrás" vuelve a la vista anterior.
// Un hash que apunte a una pestaña que este rol no tiene (guardado cuando
// tenía otro rol, o escrito a mano) cae a la primera de las suyas.
const tabDeHash = (tabs) => {
  const [t] = leerHash()
  // #/asistencia es el nombre viejo de la pestaña: los hashes guardados en el
  // celular de cada uno siguen abriendo Entrenamientos
  const id = t === 'asistencia' ? 'entrenamientos' : t
  return tabs.some((x) => x.id === id) ? id : tabs[0].id
}

export default function App() {
  const [staff, setStaff] = useState(undefined) // undefined = cargando, null = sin sesión
  const versionNueva = useVersionNueva()
  const [tab, setTab] = useState(() => tabDeHash(TABS_COMPLETO))
  const TABS = tabsDe(staff)

  useEffect(() => {
    setTab(tabDeHash(TABS))
    return suscribir(() => setTab(tabDeHash(TABS)))
  }, [staff])

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

  // Hay un deploy más nuevo que lo que corre en esta pestaña: se ofrece
  // recargar, arriba de todo, también en el login
  const avisoVersion = versionNueva && (
    <div className="aviso-version no-imprimir">
      <span>Hay una versión nueva de la app.</span>
      <button onClick={() => location.reload()}>Actualizar</button>
    </div>
  )

  if (staff === undefined) return <div className="vacio">Cargando…</div>
  if (!staff) return <>{avisoVersion}<Login onIngreso={setStaff} /></>

  return (
    <div className="app">
      {avisoVersion}
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
      {tab === 'viajes' && <Viajes yo={staff} />}
      {tab === 'staff' && <Staff yo={staff} />}
      {tab === 'padron' && <Padron />}
      {tab === 'avisos' && <div className="contenido"><Avisos /></div>}
    </div>
  )
}
