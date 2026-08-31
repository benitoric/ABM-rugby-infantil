// Notificaciones push al celular (Web Push estándar, sin servicios externos).
//
// Las claves VAPID identifican a la app ante los servidores de push de Apple,
// Google y Mozilla. Se generan solas la primera vez y quedan guardadas en la
// tabla `ajustes`: no hay nada que cargar a mano en Vercel.
import webpush from 'web-push'
import { query } from './db.js'

// Contacto que ven los servidores de push si hay un problema con los envíos
const CONTACTO = 'mailto:benitoric@gmail.com'

export async function clavesVapid() {
  const guardadas = async () => {
    const filas = await query(
      `select clave, valor from ajustes where clave in ('vapid_publica', 'vapid_privada')`)
    const m = Object.fromEntries(filas.map((f) => [f.clave, f.valor]))
    return m.vapid_publica && m.vapid_privada
      ? { publica: m.vapid_publica, privada: m.vapid_privada }
      : null
  }
  const ya = await guardadas()
  if (ya) return ya
  const nuevas = webpush.generateVAPIDKeys()
  // Si dos arranques las generan a la vez, gana la primera que inserta y la
  // otra se queda con esa (las claves tienen que ser las mismas para todos).
  await query(
    `insert into ajustes (clave, valor)
     values ('vapid_publica', $1), ('vapid_privada', $2)
     on conflict (clave) do nothing`,
    [nuevas.publicKey, nuevas.privateKey])
  return await guardadas()
}

export async function suscripcionesDe(email) {
  return query(
    'select endpoint, p256dh, auth from push_suscripciones where staff_email = $1',
    [email])
}

export async function todasLasSuscripciones() {
  return query(`select ps.endpoint, ps.p256dh, ps.auth
                from push_suscripciones ps
                join staff s on s.email = ps.staff_email
                where s.activo`)
}

// Manda el mismo aviso a varias suscripciones. Devuelve cuántas lo recibieron.
// El payload viaja cifrado y lo abre el service worker (public/sw.js):
// { titulo, cuerpo, url }
export async function enviar(suscripciones, payload) {
  if (!suscripciones.length) return 0
  const { publica, privada } = await clavesVapid()
  webpush.setVapidDetails(CONTACTO, publica, privada)
  let enviados = 0
  for (const s of suscripciones) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload))
      enviados++
    } catch (e) {
      // 404 y 410: el navegador dio de baja esa suscripción (desinstalaron la
      // app, revocaron el permiso). Se borra para no reintentarla siempre.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await query('delete from push_suscripciones where endpoint = $1', [s.endpoint])
      } else {
        console.error('No se pudo enviar el push:', e?.statusCode, e?.body || e?.message)
      }
    }
  }
  return enviados
}
