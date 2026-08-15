import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { iniciarNavegacion } from './navegacion.js'
import './styles.css'

iniciarNavegacion()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
