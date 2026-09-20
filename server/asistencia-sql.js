// Los dos criterios que deciden si un evento le cuenta a un jugador. Viven
// acá porque los usan el router (porcentajes, faltas seguidas, gráfico) y el
// boletín, y cuando estaban duplicados se fueron separando: el boletín ya
// descontaba los eventos perdidos por lesión y el listado de jugadores no.

// ¿Estaba lesionado ese día? La ventana va desde la fecha de la lesión hasta
// el día del alta (`recuperado_en`), que es el dato real. Si no lo hay se usa
// el retorno estimado, que es solo un pronóstico, y si tampoco lo hay la
// lesión abierta corre hasta hoy. El día del alta ya no cuenta como lesionado:
// ese día podía entrenar. Una lesión vieja marcada recuperada sin ninguna de
// las dos fechas no se puede ubicar en el tiempo, así que no descuenta nada.
export function sqlLesionadoEnFecha(idJugador, fecha) {
  return `exists (
    select 1 from lesiones l
    where l.jugador_id = ${idJugador}
      and l.fecha <= ${fecha}
      and (${fecha} < coalesce(l.recuperado_en, l.fecha_retorno_estimada)
           or (l.recuperado_en is null and l.fecha_retorno_estimada is null
               and not l.recuperado)))`
}

// ¿Formaba parte del plantel el día del evento? Manda el plantel congelado de
// esa fecha (ver congelarPlantel). Los eventos anteriores a que existiera el
// congelado caen en la fecha de alta del jugador en la app. Sin esto, al que
// entró hace dos semanas se le cuentan como ausencias todos los entrenamientos
// del año anterior a su llegada.
export function sqlEnPlantel(idJugador, evento) {
  return `(case
    when exists (select 1 from evento_plantel ep where ep.evento_id = ${evento}.id)
      then exists (select 1 from evento_plantel ep
                   where ep.evento_id = ${evento}.id and ep.jugador_id = ${idJugador})
    else exists (select 1 from jugadores jp
                 where jp.id = ${idJugador} and jp.created_at::date <= ${evento}.fecha)
    end)`
}
