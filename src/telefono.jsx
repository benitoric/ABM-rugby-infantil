// Teléfonos tocables: en toda la app, un número cargado abre el chat de
// WhatsApp (en el celular, la app; en la PC, WhatsApp Web). Si el número no
// se puede convertir a formato internacional, queda como link de llamada.

// Número argentino en el formato que espera wa.me: 549 + código de área +
// número, sin el 0 de larga distancia ni el 15 del celular. Acepta lo que la
// gente escribe: "381 15 555 5555", "0381-555-5555", "+54 9 381 555 5555".
// Devuelve null si no parece un número completo (10 dígitos nacionales).
export function numeroWhatsApp(numero) {
  let d = String(numero || '').replace(/\D/g, '')
  if (!d) return null
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('54') && d.length > 10) {
    d = d.slice(2)
    if (d.startsWith('9') && d.length > 10) d = d.slice(1)
  }
  if (d.startsWith('0')) d = d.slice(1)
  // El 15 va después del código de área (2 a 4 dígitos); sacarlo tiene que
  // dejar los 10 dígitos de un número nacional
  if (d.length === 12) {
    for (const i of [2, 3, 4]) {
      if (d.slice(i, i + 2) === '15') { d = d.slice(0, i) + d.slice(i + 2); break }
    }
  }
  // Los 0800/0810/0822 no son celulares: quedan como llamada
  if (/^(800|810|822)/.test(d)) return null
  return d.length === 10 ? `549${d}` : null
}

export function linkTelefono(numero) {
  const wa = numeroWhatsApp(numero)
  return wa
    ? { href: `https://wa.me/${wa}`, whatsapp: true }
    : { href: `tel:${String(numero).replace(/[^\d+]/g, '')}`, whatsapp: false }
}

// `enBoton`: dentro de una fila que ya es un botón (un <a> adentro de un
// <button> no es válido), va como texto tocable que abre el chat sin
// disparar el botón de atrás.
export function Telefono({ numero, enBoton = false, className }) {
  if (!numero) return null
  const { href, whatsapp } = linkTelefono(numero)
  const titulo = whatsapp ? 'Abrir el chat de WhatsApp' : 'Llamar'
  if (enBoton) {
    return (
      <span
        className={`tel-link${className ? ` ${className}` : ''}`}
        role="link"
        title={titulo}
        onClick={(e) => { e.stopPropagation(); window.open(href, whatsapp ? '_blank' : '_self') }}
      >
        {numero}
      </span>
    )
  }
  return (
    <a className={className} href={href} title={titulo}
       target={whatsapp ? '_blank' : undefined} rel="noreferrer">
      {numero}
    </a>
  )
}
