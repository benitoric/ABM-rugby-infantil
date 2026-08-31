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
