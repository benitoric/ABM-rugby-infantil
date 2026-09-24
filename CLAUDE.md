# Rugby M12 · Tucumán Lawn Tennis

App de gestión de jugadores para el staff de la división M12 de rugby infantil.

## Instrucciones permanentes del dueño del repo

- **Mergear los pull requests sin pedirle nada al usuario**: una vez que los
  cambios están pusheados y verificados, marcar el PR como listo (ready for
  review) y mergearlo directamente. No pedirle al usuario que lo haga él.
- Comunicarse en español (Argentina).

## Arquitectura

- **Frontend**: React + Vite, CSS propio mobile-first, en `src/`.
- **API**: funciones serverless de Vercel — `api/[...path].js` delega en
  `server/router.js`. Sin framework de backend.
- **Base de datos**: PostgreSQL en Neon (plan gratuito, proyecto propio del
  club). Esquema en `db/schema.sql`.
- **Auth**: login email + contraseña contra la tabla `staff` (bcryptjs + JWT
  de 60 días firmado con `JWT_SECRET`). El primer ingreso de un email invitado
  crea su contraseña. Sin registro abierto: solo emails cargados en `staff`.
- **Permisos por rol**: todo vive en `server/permisos.js`. Dos alcances:
  `completo` (Cabeza de división, Entrenador, PF, PF/entrenador y el dueño
  del repo) y `administrativo` (Manager principal y asistente, y cualquier rol
  vacío o desconocido). Los managers suelen ser padres: **nunca** deben ver
  asistencia, evaluaciones, entrenamientos, partidos, lesiones, tests,
  seguimientos, boletines ni las observaciones de la ficha. El router aplica
  una **lista blanca** (`rutaAdministrativa`) justo después de `autenticar`:
  al alcance administrativo solo le pasan `me`, `viajes/*`, `padron/*`,
  `documentos/*`, `push/*` y `GET staff` (sin `tiene_clave`); el resto
  devuelve 403 `solo_entrenadores`. Una ruta nueva nace cerrada para ellos:
  si tiene que abrirse, se agrega a la lista y se prueba en
  `scripts/test-permisos.mjs` (`npm run test:permisos`, base en memoria).
  El control es en la API, no en las pestañas: el frontend solo arma las
  pestañas según `alcance` (`me` y el login lo devuelven).
  El rol se relee de la base en cada request, así que un cambio de rol corta
  al instante. Sumar gente, cambiar roles, suspender y quitar del staff queda
  para `puedeAdministrar` (Cabeza de división y dueño), y el rol es
  obligatorio al sumar a alguien.
- **Padrón** (`server/padron.js`, `src/pages/Padron.jsx`): la vista de los
  chicos para los managers. Trae y edita solo lo administrativo (DNI, fecha
  de nacimiento, tutor y teléfono, ficha médica) más los escaneos del DNI.
  La pantalla de Viajes elige quiénes viajan con `viajes/plantel` (nombre,
  estado y puestos), nunca con `GET jugadores`, que trae asistencia y
  evaluaciones.
- **Deploy**: Vercel (auto-deploy en cada push a `main`). Variables de entorno
  requeridas: `DATABASE_URL` (Neon) y `JWT_SECRET`; opcional `CRON_SECRET`,
  que exige que la tarea diaria venga de Vercel.
- Diagnóstico de despliegue: `GET /api/health`.
- **Asistencia**: los dos criterios que deciden si un evento le cuenta a un
  jugador viven en `server/asistencia-sql.js` y los usan tanto el router como
  el boletín (cuando estaban duplicados se fueron separando). Un evento entra
  en su denominador solo si ya estaba en el plantel de ese día
  (`evento_plantel`, congelado al tomar la asistencia) y no estaba lesionado.
  La ventana de la lesión va de `fecha` a `recuperado_en` —el día del alta, que
  se registra al marcarla recuperada—; sin eso cae en el retorno estimado. El
  que estuvo presente cuenta siempre, aunque fuera lesionado o recién llegado.
  Mismo criterio para el porcentaje del listado y la ficha, el boletín y el
  aviso de faltas seguidas. El denominador del gráfico por evento es otra cosa:
  ahí es el plantel entero del día (ver `stats/asistencia-eventos`).
- **Avisos push**: notificaciones web estándar (`web-push`), sin servicios de
  terceros. El service worker es `public/sw.js` (solo push, no cachea nada) y
  cada celular se da de alta desde Staff → "Avisos en este celular". Las claves
  VAPID se generan solas la primera vez y quedan en la tabla `ajustes`. La
  tarea diaria de `vercel.json` (`crons`, 12:00 UTC = 9:00 de Tucumán) pega en
  `cron/cumpleanos`, que saluda a los que cumplen ese día; `avisos_enviados`
  evita repetir el saludo si la tarea corre de más. En iPhone los avisos solo
  llegan si la app está agregada a la pantalla de inicio.
- **Boletín mensual**: hoja A4 por jugador (`server/boletin.js` arma los
  números, `src/boletin.js` dibuja el PDF con el generador propio) con la
  asistencia del mes, la comparación contra la división, el ranking y las
  distinciones. Se abre desde Jugadores → "Boletines" o desde la ficha, y
  **nunca muestra evaluaciones ni tests físicos**: lo lee el propio chico. Los
  eventos que se perdió estando lesionado no le cuentan como falta. El día 1
  de cada mes la tarea `cron/boletines` avisa por push que ya están.
  Los "objetivos del mes" (`src/objetivos.js`) son la única parte que mira la
  última evaluación: se eligen las dos variables más bajas —sin el área social,
  que no se imprime— y al boletín llega solo la frase de qué practicar, nunca
  la nota, el área ni la fecha. Con todo alto va un desafío en vez de una
  debilidad inventada, y con la evaluación de más de 90 días no sale nada.
- **Viajes (giras)**: menú propio para las giras a otras provincias. Las
  rutas `viajes/...` viven en `server/viajes.js` (el router delega ahí) y la
  pantalla en `src/pages/Viajes.jsx`, con cuatro vistas: Jugadores (quiénes
  van, elegidos sobre el plantel), Alojados (una "casa" por familia del club
  anfitrión, con sus datos y los chicos que recibe; imprimible y exportable),
  Managers (checklist de papeles —autorización, DNI, ficha, obra social—,
  pagos de cada familia y observaciones para la casa) y Datos. Tablas:
  `viajes`, `viaje_staff`, `viaje_grupos`, `viaje_jugadores` y `viaje_pagos`.
  Lo cobrado nunca se guarda como total: se suma de `viaje_pagos`, y por eso
  no se puede sacar del viaje a un chico con pagos cargados sin borrarlos
  antes. Borrar un viaje entero queda para quien administra
  (`puedeAdministrar`). El catálogo de papeles (`PAPELES_VIAJE`) está en
  `src/helpers.js` y sus claves son las columnas de `viaje_jugadores`.
- **Navegación**: la posición en la app vive en el hash de la URL
  (`#/partidos/<id>/<vista>`) con respaldo en localStorage (`src/navegacion.js`),
  para sobrevivir recargas y descartes de la PWA. La vista de partido se
  refresca sola (`GET partido/:id/estado` al volver a la app y cada 15 s),
  salteándose los refrescos mientras haya escrituras propias en vuelo.

## Desarrollo y pruebas

```bash
npm install
npm run dev:api   # API en :3001 con Postgres en memoria (PGLITE=1)
npm run dev       # frontend en :5173 con proxy /api → :3001
npm run build     # build de producción
```

- Las columnas `date`/`time` se devuelven como texto (`::text` en los SELECT
  del router) para evitar objetos Date con desfase de zona horaria.
- Para probar la API completa: levantar `PGLITE=1 node scripts/dev-server.mjs`
  (sirve `dist/` + API) y correr requests contra `/api/...`.
