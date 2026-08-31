import { useEffect, useState } from 'react'
import {
  activarPush, desactivarPush, esIOS, estadoPush, instaladaEnInicio, probarPush, soportaPush,
} from '../push.js'

// Notificaciones push en el celular que se está usando. Por ahora avisan los
// cumpleaños de los chicos, el mismo día a la mañana.
export default function Avisos() {
  const [estado, setEstado] = useState(null)
  const [trabajando, setTrabajando] = useState(false)
  const [mensaje, setMensaje] = useState('')

  async function refrescar() {
    setEstado(await estadoPush())
  }
  useEffect(() => { refrescar().catch(() => setEstado({ soportado: false })) }, [])

  async function alternar() {
    setTrabajando(true)
    setMensaje('')
    try {
      if (estado.activo) {
        await desactivarPush()
        setMensaje('Listo: este celular no va a recibir más avisos.')
      } else {
        const r = await activarPush()
        setMensaje(r.ok
          ? 'Avisos activados en este celular.'
          : 'El navegador bloqueó los avisos. Habilitá las notificaciones para la app en la configuración del teléfono y probá de nuevo.')
      }
      await refrescar()
    } catch {
      setMensaje('No se pudieron cambiar los avisos. Probá de nuevo.')
    }
    setTrabajando(false)
  }

  async function probar() {
    setTrabajando(true)
    setMensaje('')
    try {
      const enviados = await probarPush()
      setMensaje(enviados
        ? 'Aviso de prueba enviado: tiene que llegarte en unos segundos.'
        : 'No hay ningún dispositivo activo para avisar.')
    } catch {
      setMensaje('No se pudo mandar el aviso de prueba.')
    }
    setTrabajando(false)
  }

  if (!estado) return null

  // iOS solo entrega notificaciones si la app está agregada a la pantalla de
  // inicio: desde el navegador no hay forma de activarlas.
  const faltaInstalar = esIOS() && !instaladaEnInicio()

  return (
    <div className="tarjeta">
      <h3>🔔 Avisos en este celular</h3>
      <p className="mini" style={{ margin: '4px 0 8px' }}>
        Te llega una notificación el día del cumpleaños de cada chico. Se activa
        por dispositivo: si querés recibirlos también en otro, activalos ahí.
      </p>

      {!soportaPush() && (
        <p className="mini">Este navegador no puede recibir avisos.</p>
      )}

      {soportaPush() && faltaInstalar && (
        <p className="mini">
          En iPhone hay que agregar la app a la pantalla de inicio para poder
          recibir avisos: tocá <b>Compartir</b> → <b>Agregar a inicio</b>, abrila
          desde ahí y volvé a esta pantalla.
        </p>
      )}

      {soportaPush() && !faltaInstalar && (
        <div className="fila">
          <button className="btn sec" disabled={trabajando} onClick={alternar}>
            {estado.activo ? '🔕 Desactivar avisos' : '🔔 Activar avisos'}
          </button>
          {estado.activo && (
            <button className="btn sec chico" disabled={trabajando} onClick={probar}>
              Probar
            </button>
          )}
        </div>
      )}

      {estado.permiso === 'denied' && (
        <p className="mini" style={{ marginTop: 6 }}>
          Las notificaciones están bloqueadas para la app. Habilitalas en la
          configuración del teléfono para poder activarlas.
        </p>
      )}

      {mensaje && <p className="mini" style={{ marginTop: 8 }}>{mensaje}</p>}
    </div>
  )
}
