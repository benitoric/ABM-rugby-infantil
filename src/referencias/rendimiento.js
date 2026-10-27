// Referencias de rendimiento por edad: centiles por año cumplido para los
// tests de campo (salto, velocidad, resistencia) en varones. Las carga a mano
// quien tenga la tabla de la fuente; mientras falten, el reporte de ese test
// no compara con nada externo y lo dice.
//
// Formato: { [edadAnios]: { [centil]: valor } } con los centiles que la
// fuente publique (5, 10, 25, 50, 75, 90, 95…). `fuente` describe de dónde
// salió, porque el reporte lo imprime.

export const SALTO_VARONES = { fuente: null, centiles: {} }

// Decisión del cuerpo técnico: la velocidad en 20 m se compara solo dentro
// del grupo. No hay una tabla internacional por edad que valga la pena citar,
// y antes que una referencia floja, ninguna.
export const VELOCIDAD_VARONES = { fuente: null, centiles: {} }

// El 10×20 m del club es el test de 20 m ida y vuelta (course navette), así
// que acá van las normas internacionales de ese test en vueltas, por edad
// (Tomkinson y otros, Br J Sports Med 2017), cuando se puedan cargar.
export const RESISTENCIA_VARONES = { fuente: null, centiles: {} }
