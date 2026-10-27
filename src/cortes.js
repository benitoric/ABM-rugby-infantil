// Los criterios del semáforo de los tests, del lado del navegador.
//
// Son los mismos para toda la división y cambian muy de vez en cuando, así que
// se piden una sola vez por sesión y quedan en memoria. Los usan dos pantallas
// (la carga en tanda del entrenamiento y la carga suelta de la ficha), por eso
// el estado vive acá y no en una de ellas.

import { useEffect, useState } from 'react'
import { api } from './api.js'

let cache = null
let enVuelo = null
const oyentes = new Set()

export function cargarCortes() {
  if (cache) return Promise.resolve(cache)
  if (!enVuelo) {
    enVuelo = api('tests/cortes')
      .then((c) => { cache = c; enVuelo = null; return c })
      .catch((e) => { enVuelo = null; throw e })
  }
  return enVuelo
}

// Después de editarlos, la pantalla pasa los nuevos y se entera todo el resto
export function actualizarCortes(cortes) {
  cache = cortes
  for (const avisar of oyentes) avisar(cortes)
}

// `null` mientras no llegaron: hasta entonces no se propone ningún color
export function useCortes() {
  const [cortes, setCortes] = useState(cache)
  useEffect(() => {
    oyentes.add(setCortes)
    // Sin criterios cargados la app sigue andando: el color va a mano
    cargarCortes().then(setCortes).catch(() => setCortes({}))
    return () => { oyentes.delete(setCortes) }
  }, [])
  return cortes
}
