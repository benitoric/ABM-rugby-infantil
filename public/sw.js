// Service worker de la app. Su única tarea son las notificaciones push: no
// cachea nada, así que no puede dejar pegada una versión vieja de la app.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = {} }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Rugby M12', {
    body: d.cuerpo || '',
    icon: './icon.svg',
    badge: './icon.svg',
    tag: d.tag,
    data: { url: d.url || './' },
  }))
})

// Al tocar el aviso: si la app ya está abierta se la trae al frente en la
// vista que corresponde; si no, se abre.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const destino = e.notification.data?.url || './'
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of abiertas) {
      if ('focus' in c) {
        if ('navigate' in c) { try { await c.navigate(destino) } catch { /* misma vista */ } }
        return c.focus()
      }
    }
    return self.clients.openWindow(destino)
  })())
})

// El sistema de push del teléfono renueva la suscripción cada tanto por su
// cuenta (Chrome lo hace seguido). Si no se la vuelve a registrar, el celular
// deja de recibir avisos sin que nadie se entere. Acá se saca una suscripción
// nueva con la misma clave de la app y se le avisa al servidor cuál reemplaza:
// la vieja hace de credencial, porque solo este celular la conocía.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(renovarSuscripcion(e.oldSubscription, e.newSubscription))
})

async function renovarSuscripcion(vieja, nueva) {
  const clave = vieja?.options?.applicationServerKey
  if (!nueva && clave) {
    nueva = await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: clave,
    })
  }
  if (!nueva || !vieja?.endpoint) return
  await fetch('./api/index?ruta=push%2Frenovar', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ anterior: vieja.endpoint, nueva: nueva.toJSON() }),
  })
}
