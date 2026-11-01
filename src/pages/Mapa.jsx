import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Mapa de OpenStreetMap con Leaflet. Muestra el club, un círculo por lugar
// (más grande cuantos más chicos viven ahí) y, para ubicar un barrio, un pin
// que se arrastra o se pone tocando el mapa, más los candidatos que propuso
// el buscador.
//
//   club        {lat, lng}
//   puntos      [{id, lat, lng, n, titulo, resaltado}]
//   onPunto     (id) => …   al tocar un círculo
//   pin         {lat, lng} | null
//   onPin       ({lat, lng}) => …   al tocar el mapa o soltar el pin
//   candidatos  [{lat, lng, nombre}] y onCandidato(i)
//
// Leaflet maneja el DOM del mapa por su cuenta: React solo le pasa los datos.

const icono = (clase, texto) => L.divIcon({
  className: '',
  html: `<div class="${clase}">${texto}</div>`,
  iconSize: null,
})

export default function Mapa({
  club, puntos = [], onPunto, pin, onPin, candidatos = [], onCandidato, alto = 360,
}) {
  const nodo = useRef(null)
  const mapa = useRef(null)
  const capas = useRef(null)
  const ajustado = useRef(false)
  // Encuadre pedido mientras el mapa todavía no tenía tamaño (recién abierto
  // dentro de un modal): se hace apenas lo tenga
  const pendiente = useRef(null)
  const datos = useRef({})
  datos.current = { club, puntos, pin, candidatos }
  // Las funciones cambian en cada render: el mapa siempre llama a la última
  const llamadas = useRef({})
  llamadas.current = { onPunto, onPin, onCandidato }

  useEffect(() => {
    const m = L.map(nodo.current, { zoomControl: true, attributionControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    m.setView([club?.lat ?? -26.83, club?.lng ?? -65.2], 12)
    m.on('click', (e) => llamadas.current.onPin?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    capas.current = L.layerGroup().addTo(m)
    mapa.current = m
    // Dentro de un modal o una solapa que recién aparece el tamaño llega
    // tarde: se acomoda cada vez que cambia y se hace el encuadre pendiente
    const alCambiar = () => {
      m.invalidateSize()
      if (pendiente.current && m.getSize().x > 0) encuadrar(pendiente.current)
    }
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(alCambiar) : null
    obs?.observe(nodo.current)
    const t = setTimeout(alCambiar, 150)
    return () => { clearTimeout(t); obs?.disconnect(); m.remove(); mapa.current = null }
  }, [])

  // Que entren en pantalla los puntos de `que` ('todo' o 'candidatos'), con el club
  function encuadrar(que) {
    const m = mapa.current
    if (!m) return
    if (m.getSize().x === 0) { pendiente.current = que; return }
    pendiente.current = null
    const { club: c, puntos: ps, pin: p, candidatos: cs } = datos.current
    const todos = que === 'candidatos'
      ? cs.map((x) => [x.lat, x.lng])
      : [...ps.map((x) => [x.lat, x.lng]), ...cs.map((x) => [x.lat, x.lng]), ...(p ? [[p.lat, p.lng]] : [])]
    if (c) todos.push([c.lat, c.lng])
    if (todos.length > 1) m.fitBounds(todos, { padding: [30, 30], maxZoom: que === 'candidatos' ? 15 : 14 })
    else if (todos.length === 1) m.setView(todos[0], 14)
  }

  useEffect(() => {
    const m = mapa.current
    const g = capas.current
    if (!m || !g) return
    g.clearLayers()
    const max = Math.max(1, ...puntos.map((p) => p.n || 0))
    for (const p of puntos) {
      const radio = 7 + 16 * Math.sqrt((p.n || 0) / max)
      const c = L.circleMarker([p.lat, p.lng], {
        radius: radio,
        color: p.resaltado ? '#b45309' : '#123a80',
        weight: p.resaltado ? 3 : 1.5,
        fillColor: p.resaltado ? '#ffd200' : '#1a4a9e',
        fillOpacity: 0.55,
      }).addTo(g)
      if (p.titulo) c.bindTooltip(p.titulo)
      c.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        llamadas.current.onPunto?.(p.id)
      })
    }
    candidatos.forEach((cand, i) => {
      L.marker([cand.lat, cand.lng], { icon: icono('mapa-candidato', i + 1) })
        .bindTooltip(cand.nombre || `Opción ${i + 1}`)
        .on('click', (e) => { L.DomEvent.stopPropagation(e); llamadas.current.onCandidato?.(i) })
        .addTo(g)
    })
    if (club) {
      L.marker([club.lat, club.lng], { icon: icono('mapa-club', '🏉'), zIndexOffset: 500 })
        .bindTooltip('Club')
        .addTo(g)
    }
    if (pin) {
      const mk = L.marker([pin.lat, pin.lng], {
        icon: icono('mapa-pin', '📍'), draggable: true, zIndexOffset: 1000,
      }).addTo(g)
      mk.on('dragend', () => {
        const ll = mk.getLatLng()
        llamadas.current.onPin?.({ lat: ll.lat, lng: ll.lng })
      })
    }
    // Encuadre: la primera vez que hay datos, que entren todos; después se
    // respeta el zoom que haya elegido cada uno
    if (!ajustado.current && (puntos.length || candidatos.length || pin)) {
      ajustado.current = true
      encuadrar('todo')
    }
  }, [club, puntos, pin, candidatos])

  // Los candidatos nuevos de una búsqueda se encuadran de nuevo
  useEffect(() => {
    if (candidatos.length) encuadrar('candidatos')
  }, [candidatos])

  return <div ref={nodo} className="mapa" style={{ height: alto }} />
}
