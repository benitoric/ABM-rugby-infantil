// Alta y baja de las notificaciones push en el celular que se está usando.
// Cada dispositivo se suscribe por separado: activarlas en el teléfono no las
// activa en la computadora.
import { api } from './api.js'

// Recuerda si en este celular los avisos estuvieron activos ('1') o si fue
// la persona quien los apagó ('0'): sirve para avisarle cuando se pierden
// solos, sin molestar a quien los desactivó a propósito.
const CLAVE_ESTADO = 'rugby_m12_push'

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

function recordar(valor) {
  try { localStorage.setItem(CLAVE_ESTADO, valor) } catch { /* sin almacenamiento */ }
}
function recordado() {
  try { return localStorage.getItem(CLAVE_ESTADO) } catch { return null }
}

// Qué pasa hoy en este dispositivo: si puede recibir avisos, si ya los tiene
// activados y si los tenía y los perdió. "Activo" exige las dos partes: la
// suscripción del navegador y que el servidor la conozca. Si el navegador la
// tiene con la clave vigente y el servidor no (base restaurada, renovación que
// no llegó), se vuelve a registrar sola acá mismo.
export async function estadoPush() {
  if (!soportaPush()) return { soportado: false, activo: false, perdido: false, permiso: 'default' }
  const permiso = Notification.permission
  let activo = false
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sus = await reg?.pushManager.getSubscription()
    if (sus) {
      const { endpoints } = await api('push/suscripciones')
      activo = endpoints.includes(sus.endpoint)
      if (!activo) {
        const { clave } = await api('push/clave')
        if (mismaClave(sus, clave)) {
          await api('push/suscripciones', { method: 'POST', body: sus.toJSON() })
          activo = true
        }
      }
    }
  } catch { /* sin service worker todavía, o sin red */ }
  if (activo) recordar('1')
  // Los tenía (o al menos dio el permiso) y ya no están: hay que avisarle
  const perdido = !activo && permiso === 'granted' && recordado() !== '0'
  return { soportado: true, activo, perdido, permiso }
}

export async function activarPush() {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') return { ok: false, motivo: permiso }
  const reg = await registrar()
  await navigator.serviceWorker.ready
  const { clave } = await api('push/clave')
  let sus = await reg.pushManager.getSubscription()
  // Una suscripción hecha con otra clave de la app no sirve: el sistema de
  // push rechazaría los envíos. Se descarta y se saca una nueva.
  if (sus && !mismaClave(sus, clave)) {
    await sus.unsubscribe()
    sus = null
  }
  sus ||= await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: claveAplicacion(clave),
  })
  await api('push/suscripciones', { method: 'POST', body: sus.toJSON() })
  recordar('1')
  return { ok: true }
}

export async function desactivarPush() {
  recordar('0')
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

// ¿La suscripción del navegador se hizo con la clave que hoy usa el servidor?
function mismaClave(sus, claveBase64url) {
  const propia = sus.options?.applicationServerKey
  if (!propia) return true // navegadores que no la exponen: se confía
  return aBase64url(new Uint8Array(propia)) === claveBase64url
}

function aBase64url(bytes) {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// La clave pública viaja en base64url y el navegador la pide como bytes
function claveAplicacion(base64url) {
  const base64 = (base64url + '='.repeat((4 - base64url.length % 4) % 4))
    .replace(/-/g, '+').replace(/_/g, '/')
  const bruto = atob(base64)
  return Uint8Array.from(bruto, (c) => c.charCodeAt(0))
}
