import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EncuestaPublica from './pages/EncuestaPublica.jsx'
import Instructivo from './pages/Instructivo.jsx'
import { iniciarNavegacion, leerHash } from './navegacion.js'
import './styles.css'

// El link de la encuesta (#/encuesta/<token>) lo abren los chicos, que no
// tienen usuario: se muestra la encuesta sola, sin login ni menú, y sin tocar
// la posición guardada de la app de quien abra el link en su celular.
const [seccion, token] = leerHash()
const esEncuesta = seccion === 'encuesta' && !!token
// El instructivo (#/instructivo) se abre en otra pestaña, también sin login
const esInstructivo = seccion === 'instructivo'

if (!esEncuesta && !esInstructivo) iniciarNavegacion()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {esEncuesta ? <EncuestaPublica token={token} /> : esInstructivo ? <Instructivo /> : <App />}
  </React.StrictMode>,
)
