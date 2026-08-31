// Alta y baja de las notificaciones push en el celular que se está usando.
// Cada dispositivo se suscribe por separado: activarlas en el teléfono no las
// activa en la computadora.
import { api } from './api.js'

export function soportaPush() {
  return typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
}

// iOS solo permite avisos si la app está agregada a la pantalla de inicio
export function esIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function instaladaEnInicio() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

async function registrar() {
  return navigator.serviceWorker.register('./sw.js')
}

// Qué pasa hoy en este dispositivo: si puede recibir avisos y si ya los tiene
// activados (la suscripción del navegador tiene que estar además guardada en
// el servidor: si se reinstaló la app, puede quedar solo de un lado).
export async function estadoPush() {
  if (!soportaPush()) return { soportado: false, activo: false, permiso: 'default' }
  const permiso = Notification.permission
  let activo = false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sus = await reg?.pushManager.getSubscription()
    if (sus) {
      const { endpoints } = await api('push/suscripciones')
      activo = endpoints.includes(sus.endpoint)
      // Suscripción del navegador que el servidor no conoce (base restaurada,
      // otra cuenta): se vuelve a registrar sola al activar.
    }
  } catch { /* sin service worker todavía */ }
  return { soportado: true, activo, permiso }
}

export async function activarPush() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, motivo: permiso }
  const reg = await registrar()
  await navigator.serviceWorker.ready
  const { clave } = await api('push/clave')
  const sus = await reg.pushManager.getSubscription() ||
    await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: claveAplicacion(clave),
    })
  await api('push/suscripciones', { method: 'POST', body: sus.toJSON() })
  return { ok: true }
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sus = await reg?.pushManager.getSubscription()
  if (!sus) return { ok: true }
  await api(`push/suscripciones?endpoint=${encodeURIComponent(sus.endpoint)}`, { method: 'DELETE' })
  await sus.unsubscribe()
  return { ok: true }
}

export async function probarPush() {
  const { enviados } = await api('push/prueba', { method: 'POST' })
  return enviados
}

// La clave pública viaja en base64url y el navegador la pide como bytes
function claveAplicacion(base64url) {
  const base64 = (base64url + '='.repeat((4 - base64url.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(base64)
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0))
}
