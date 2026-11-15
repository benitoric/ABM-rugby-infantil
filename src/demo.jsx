// Franja de la versión de prueba. Sale solo en el build hecho con DEMO=1 (el
// proyecto de Vercel de la demo, ver vite.config.js): ahí todos los datos son
// ficticios (scripts/demo-datos.mjs) y conviene que nadie lo confunda con la
// app del club.
export const ES_DEMO = typeof __DEMO__ !== 'undefined' && __DEMO__

export default function FranjaDemo() {
  if (!ES_DEMO) return null
  return (
    <div className="franja-demo no-imprimir">
      Versión de prueba · todos los datos son ficticios
    </div>
  )
}
