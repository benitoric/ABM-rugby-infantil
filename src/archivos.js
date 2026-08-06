// Preparación de archivos en el navegador antes de subirlos a la API.

// Las funciones serverless de Vercel cortan los cuerpos en 4,5 MB y base64
// infla ~33%: el archivo real no puede pasar de 3 MB (mismo tope que el server).
export const MAX_BYTES = 3 * 1024 * 1024
const LADO_MAX = 1600
const CALIDAD = 0.82
const LADO_MINI = 160
const CALIDAD_MINI = 0.7
const MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function tamanoLegible(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function aBase64(blob) {
  return new Promise((resolver, rechazar) => {
    const fr = new FileReader()
    fr.onload = () => resolver(String(fr.result).split(',')[1])
    fr.onerror = () => rechazar(fr.error)
    fr.readAsDataURL(blob)
  })
}

// Reescala y recomprime a JPEG: la foto del DNI sale del celular con varios MB
// y así queda en un par de cientos de KB sin perder legibilidad.
async function comprimirImagen(origen, lado = LADO_MAX, calidad = CALIDAD) {
  const bitmap = await createImageBitmap(origen)
  const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', calidad))
  if (!blob) throw new Error('no se pudo comprimir')
  return blob
}

// Encuadre por defecto de la cara: en el DNI argentino la foto va sobre el
// margen izquierdo. Es solo el punto de partida; el evaluador lo ajusta.
export const RECORTE_DNI = { cx: 0.20, cy: 0.45, tam: 0.40 }

// Miniatura cuadrada para el listado de jugadores: recorta la zona de la cara
// (centro y tamaño en fracciones de la imagen) y la deja en unos pocos KB.
export async function generarMiniatura(origen, recorte = RECORTE_DNI) {
  const bitmap = await createImageBitmap(origen)
  const lado = Math.round(Math.min(bitmap.width, bitmap.height) * recorte.tam)
  const x = Math.round(bitmap.width * recorte.cx - lado / 2)
  const y = Math.round(bitmap.height * recorte.cy - lado / 2)
  const canvas = document.createElement('canvas')
  canvas.width = LADO_MINI
  canvas.height = LADO_MINI
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, LADO_MINI, LADO_MINI)
  ctx.drawImage(bitmap, x, y, lado, lado, 0, 0, LADO_MINI, LADO_MINI)
  bitmap.close?.()
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', CALIDAD_MINI))
  if (!blob) throw new Error('no se pudo recortar')
  return aBase64(blob)
}

// Devuelve { nombre, mime, datos (base64), bytes } listo para POST /documentos.
export async function prepararArchivo(file) {
  let blob = file
  let mime = file.type
  let nombre = (file.name || 'documento').slice(0, 120)
  let esImagen = false

  if (file.type.startsWith('image/')) {
    try {
      blob = await comprimirImagen(file)
      mime = 'image/jpeg'
      nombre = `${nombre.replace(/\.[^.]+$/, '')}.jpg`
      esImagen = true
    } catch {
      // Formato que el navegador no sabe decodificar: se intenta subir tal cual
      blob = file
      mime = file.type
    }
  }

  if (!MIMES.includes(mime)) {
    throw new Error('Formato no admitido. Subí una foto (JPG o PNG) o un PDF.')
  }
  if (blob.size > MAX_BYTES) {
    throw new Error(
      `El archivo pesa ${tamanoLegible(blob.size)} y el máximo es ${tamanoLegible(MAX_BYTES)}. ` +
      'Probá con una foto en vez de un PDF, o sacala con menos resolución.')
  }
  // blob viaja aparte: con él se elige el recorte de la cara antes de subir
  return { nombre, mime, datos: await aBase64(blob), bytes: blob.size, blob, esImagen }
}

// base64 → Blob, para poder mostrar o descargar lo que devuelve la API
export function base64ABlob(base64, mime) {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
