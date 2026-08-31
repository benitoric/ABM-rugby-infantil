// Avisos automáticos que dispara la tarea diaria de Vercel (vercel.json →
// crons), hoy solo los cumpleaños de los chicos.
import { query } from './db.js'
import { enviar, todasLasSuscripciones } from './push.js'

// La hora del servidor es UTC: el "hoy" se calcula en la zona del club para
// que el saludo salga el día que corresponde y no de madrugada.
const ZONA = 'America/Argentina/Tucuman'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

// Aviso del día 1: ya cerró el mes, están los boletines de todos los chicos.
// El PDF se arma en la app al abrirlos; acá solo se avisa que hay novedad.
export async function avisarBoletines() {
  const [{ mes }] = await query(
    `select to_char((now() at time zone $1) - interval '1 month', 'YYYY-MM') as mes`, [ZONA])
  const [anio, numero] = mes.split('-')
  const nombre = `${MESES[Number(numero) - 1]} de ${anio}`

  const marca = await query(
    `insert into avisos_enviados (tipo, referencia, fecha)
     values ('boletin', $1, (now() at time zone $2)::date)
     on conflict do nothing returning referencia`,
    [mes, ZONA])
  if (!marca.length) return { mes, avisados: 0, repetido: true }

  const avisados = await enviar(await todasLasSuscripciones(), {
    titulo: `📄 Boletines de ${nombre}`,
    cuerpo: 'Ya están los boletines del mes para repartir entre los chicos.',
    url: '#jugadores',
    tag: `boletines-${mes}`,
  })
  return { mes, avisados }
}

export async function avisarCumpleanos() {
  const [{ hoy }] = await query(
    `select (now() at time zone $1)::date::text as hoy`, [ZONA])
  const cumplen = await query(
    `select id, nombre, apellido,
            date_part('year', age($1::date, fecha_nacimiento))::int as cumple
     from jugadores
     where estado <> 'inactivo' and fecha_nacimiento is not null
       and (
         to_char(fecha_nacimiento, 'MM-DD') = to_char($1::date, 'MM-DD')
         -- Nacidos un 29 de febrero: en los años no bisiestos se los saluda el
         -- 1 de marzo (el día anterior es un 28 solo en esos años).
         or (to_char(fecha_nacimiento, 'MM-DD') = '02-29'
             and to_char($1::date, 'MM-DD') = '03-01'
             and to_char($1::date - interval '1 day', 'MM-DD') = '02-28')
       )
     order by apellido, nombre`,
    [hoy])
  if (!cumplen.length) return { fecha: hoy, cumplen: 0, avisados: 0 }

  const suscripciones = await todasLasSuscripciones()
  let avisados = 0
  for (const j of cumplen) {
    // El registro del aviso hace de traba: si la tarea corre dos veces en el
    // día (o alguien la dispara a mano), el saludo sale una sola vez.
    const marca = await query(
      `insert into avisos_enviados (tipo, referencia, fecha) values ('cumple', $1, $2)
       on conflict do nothing returning referencia`,
      [j.id, hoy])
    if (!marca.length) continue
    avisados += await enviar(suscripciones, {
      titulo: `🎂 Cumple ${j.nombre} ${j.apellido}`,
      cuerpo: `Hoy cumple ${j.cumple} años. ¡A saludarlo!`,
      url: '#jugadores',
      tag: `cumple-${j.id}-${hoy}`,
    })
  }
  return { fecha: hoy, cumplen: cumplen.length, avisados }
}
