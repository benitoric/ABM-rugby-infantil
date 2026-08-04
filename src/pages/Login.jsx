import { useState } from 'react'
import { api, setToken } from '../api.js'
import { VERSION } from '../version.js'

export default function Login({ onIngreso }) {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [clave2, setClave2] = useState('')
  const [primeraVez, setPrimeraVez] = useState(false)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    if (primeraVez && clave !== clave2) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setCargando(true)
    try {
      const ruta = primeraVez ? 'auth/setup' : 'auth/login'
      const r = await api(ruta, { method: 'POST', body: { email, password: clave } })
      setToken(r.token)
      onIngreso(r.staff)
    } catch (err) {
      if (err.error === 'necesita_clave') {
        setPrimeraVez(true)
        setError('')
      } else {
        console.error('Fallo de ingreso:', err.codigo, err.error, err.detalle)
        setError(traducir(err.error, err.detalle, err.codigo))
      }
    }
    setCargando(false)
  }

  return (
    <div className="login-wrap">
      <form className="login-caja" onSubmit={enviar}>
        <h1>🏉 Rugby M12</h1>
        <p className="suave">Gestión de jugadores · Tucumán Lawn Tennis</p>

        <div className="campo">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={primeraVez}
          />
        </div>
        <div className="campo">
          <label>{primeraVez ? 'Creá tu contraseña' : 'Contraseña'}</label>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            minLength={6}
            autoComplete={primeraVez ? 'new-password' : 'current-password'}
          />
        </div>
        {primeraVez && (
          <>
            <div className="aviso">
              Primer ingreso: elegí una contraseña de al menos 6 caracteres y
              repetila para confirmar.
            </div>
            <div className="campo">
              <label>Repetir contraseña</label>
              <input
                type="password"
                value={clave2}
                onChange={(e) => setClave2(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <button className="btn" disabled={cargando}>
          {cargando ? 'Un momento…' : primeraVez ? 'Crear contraseña e ingresar' : 'Ingresar'}
        </button>
        {primeraVez && (
          <button type="button" className="btn sec" onClick={() => { setPrimeraVez(false); setClave(''); setClave2('') }}>
            Volver
          </button>
        )}
        <p className="mini">
          Solo pueden ingresar los emails habilitados por el staff. Si es tu
          primera vez, usá el email con el que te invitaron: la app te va a
          pedir crear tu contraseña.
        </p>
        <p className="mini" style={{ textAlign: 'right', opacity: 0.6 }}>{VERSION}</p>
      </form>
    </div>
  )
}

function traducir(e, detalle, codigo) {
  const mapa = {
    no_invitado: 'Ese email no está habilitado como staff. Pedí que te agreguen desde la pestaña Staff.',
    suspendido: 'Tu acceso está suspendido. Hablá con el resto del staff.',
    clave_incorrecta: 'Contraseña incorrecta.',
    clave_corta: 'La contraseña debe tener al menos 6 caracteres.',
    ya_tiene_clave: 'Ese email ya tiene contraseña. Probá iniciar sesión.',
    faltan_datos: 'Completá email y contraseña.',
  }
  if (mapa[e]) return mapa[e]
  return `No se pudo ingresar. Datos técnicos para pasarle a Claude → código HTTP: ${codigo ?? '?'} · error: ${e || 'desconocido'} · detalle: ${detalle || 'sin detalle'} · versión: ${VERSION}`
}
