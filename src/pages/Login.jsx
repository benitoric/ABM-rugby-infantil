import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Login() {
  const [modo, setModo] = useState('login') // login | registro
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setError('')
    setAviso('')
    setCargando(true)
    const credenciales = { email: email.trim().toLowerCase(), password: clave }
    if (modo === 'login') {
      const { error } = await supabase.auth.signInWithPassword(credenciales)
      if (error) setError(traducir(error.message))
    } else {
      const { data, error } = await supabase.auth.signUp(credenciales)
      if (error) setError(traducir(error.message))
      else if (data.user && !data.session)
        setAviso('Cuenta creada. Revisá tu email para confirmarla y después iniciá sesión.')
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
          />
        </div>
        <div className="campo">
          <label>Contraseña</label>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            required
            minLength={6}
            autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {error && <div className="error">{error}</div>}
        {aviso && <div className="aviso">{aviso}</div>}

        <button className="btn" disabled={cargando}>
          {modo === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
        <button
          type="button"
          className="btn sec"
          onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setError(''); setAviso('') }}
        >
          {modo === 'login' ? 'No tengo cuenta todavía' : 'Ya tengo cuenta'}
        </button>
        <p className="mini">
          Solo los emails habilitados por el staff pueden ver los datos. Crear la
          cuenta no alcanza: pedí que te agreguen como staff.
        </p>
      </form>
    </div>
  )
}

function traducir(msg) {
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Tenés que confirmar tu email antes de ingresar.'
  if (/already registered/i.test(msg)) return 'Ese email ya tiene una cuenta. Probá iniciar sesión.'
  if (/at least 6 characters/i.test(msg)) return 'La contraseña debe tener al menos 6 caracteres.'
  return msg
}
