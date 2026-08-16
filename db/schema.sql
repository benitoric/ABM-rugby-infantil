-- Esquema de la app Rugby M12 · Tucumán Lawn Tennis
-- Pensado para una base PostgreSQL propia (Neon). Ejecutar una sola vez.

create table if not exists staff (
  email text primary key check (email = lower(email)),
  nombre text,
  apellido text,
  rol text,
  password_hash text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists jugadores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  fecha_nacimiento date,
  dni text,
  -- Posición genérica (Forward/Back/Mixto). Derivada de `puestos` cuando
  -- están cargados; queda para jugadores viejos y para el balance de bloques.
  posicion text,
  -- Puestos específicos en los que puede jugar (uno o más):
  -- pilar/hooker/segunda/octavo/medio_scrum/apertura/centro/wing/fullback
  puestos jsonb not null default '[]',
  -- Cuál de esos puestos es el suyo de verdad. Con un solo puesto cargado se
  -- deriva de ahí, así que solo hace falta elegirlo cuando juega en varios.
  puesto_principal text,
  aptitudes jsonb not null default '[]',
  estado text not null default 'activo' check (estado in ('activo','inactivo','lesionado')),
  tutor_nombre text,
  tutor_telefono text,
  ficha_medica_vigente boolean not null default false,
  ficha_medica_vence date,
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seguimientos (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  fecha date not null default current_date,
  area text not null check (area in ('tecnica','fisica','tactica','actitudinal','social')),
  valoracion int check (valoracion between 1 and 5),
  comentario text,
  autor_email text,
  created_at timestamptz not null default now()
);

-- Evaluación periódica: una fila por sesión de evaluación de un jugador.
-- "valores" guarda { variable: 1..5 } según el catálogo de src/evaluacion.js.
create table if not exists evaluaciones (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  fecha date not null default current_date,
  valores jsonb not null default '{}',
  comentario text,
  autor_email text,
  -- Revisión cruzada: un segundo entrenador vuelve a puntuar al jugador sin
  -- ver la primera nota. Donde los dos coinciden el dato es sólido; donde
  -- difieren, queda marcado para conversarlo.
  revisor_email text,
  valores_revisor jsonb,
  comentario_revisor text,
  revisado_en timestamptz,
  created_at timestamptz not null default now()
);

-- Documentación escaneada del jugador (DNI, etc.). El archivo se guarda en la
-- misma base: las imágenes se comprimen en el navegador antes de subirlas, así
-- que cada documento pesa unos cientos de KB.
create table if not exists documentos (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  tipo text not null default 'dni' check (tipo in ('dni')),
  nombre text not null,
  mime text not null,
  datos bytea not null,
  -- Versión chica (160px) de las imágenes, para el listado de jugadores: así
  -- la lista no tiene que bajar los archivos completos. Nula en los PDF.
  miniatura bytea,
  subido_por text,
  created_at timestamptz not null default now()
);

-- Reparto de evaluaciones: cada fila es un jugador que le toca evaluar a un
-- miembro del staff. La fila se borra sola cuando esa evaluación se carga, así
-- que "tener fila" equivale a "pendiente".
create table if not exists asignaciones_evaluacion (
  jugador_id uuid not null references jugadores(id) on delete cascade,
  staff_email text not null references staff(email) on delete cascade,
  -- Pareja cruzada: quien revisa lo que evaluó staff_email
  revisor_email text references staff(email) on delete set null,
  -- 'evaluar' = le toca al primero; 'revisar' = le toca al revisor
  etapa text not null default 'evaluar' check (etapa in ('evaluar','revisar')),
  evaluacion_id uuid references evaluaciones(id) on delete cascade,
  asignado_por text,
  created_at timestamptz not null default now(),
  primary key (jugador_id)
);

create table if not exists lesiones (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  fecha date not null default current_date,
  descripcion text not null,
  fecha_retorno_estimada date,
  recuperado boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists eventos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrenamiento','partido')),
  fecha date not null,
  hora time,
  hora_fin time,
  -- Solo para entrenamientos: 'rutina' es el de lunes y miércoles de 19:30 a
  -- 21:00; 'extra' es cualquier otro (recuperatorio, doble turno, etc.).
  modalidad text check (modalidad in ('rutina','extra')),
  rival text,
  lugar text,
  notas text,
  -- Suspensión del evento entero. En los partidos se puede suspender un solo
  -- bloque (ver tabla bloques); acá se marca cuando cae todo el partido.
  suspendido boolean not null default false,
  motivo_suspension text check (motivo_suspension in ('clima','feriado','otro')),
  nota_suspension text,
  created_at timestamptz not null default now()
);

create table if not exists asistencias (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  estado text not null check (estado in ('presente','ausente')),
  -- Se golpeó durante el entrenamiento. Mismo criterio que en el partido:
  -- 'golpeado' es transitorio; 'lesionado' además queda pendiente de
  -- seguimiento en la sección Jugadores. Null = terminó en condiciones.
  condicion text check (condicion in ('golpeado','lesionado')),
  lesion_atendida boolean not null default false,
  unique (evento_id, jugador_id)
);

create table if not exists asistencias_staff (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  staff_email text not null references staff(email) on delete cascade,
  estado text not null check (estado in ('presente','ausente')),
  unique (evento_id, staff_email)
);

create table if not exists bloques (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos(id) on delete cascade,
  -- Normalmente son 2 bloques, pero un partido puede tener más. La
  -- restricción va nombrada porque es el testigo de la migración (server/db.js).
  numero int not null constraint bloques_numero_valido check (numero between 1 and 6),
  nombre text,
  rival text,
  -- Grado de dificultad del rival, para equilibrar los bloques
  dificultad text check (dificultad in ('bueno','regular','malo')),
  lugar text,
  hora_convocatoria time,
  valoracion int check (valoracion between 1 and 5),
  cronica text,
  -- Cierre del bloque: congela asistencia, equipos y datos. Reabrir queda
  -- limitado a la cabeza de división y deja rastro de quién y cuándo.
  cerrado_en timestamptz,
  cerrado_por text,
  -- Un bloque se puede suspender solo (el otro puede jugarse igual)
  suspendido boolean not null default false,
  motivo_suspension text check (motivo_suspension in ('clima','feriado','otro')),
  nota_suspension text,
  unique (evento_id, numero)
);

create table if not exists bloque_jugadores (
  bloque_id uuid not null references bloques(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  primary key (bloque_id, jugador_id)
);

-- Control de asistencia del día del partido, tomado en la cancha por el staff
-- de cada bloque. Es un registro aparte de la confirmación anticipada (la
-- tabla asistencias, que se marca en la semana cuando los chicos avisan que
-- van): así queda el rastro de los que confirmaron y finalmente no fueron.
create table if not exists asistencias_partido (
  evento_id uuid not null references eventos(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  estado text not null check (estado in ('presente','ausente')),
  -- Marcado presente después de la hora de convocatoria + 15 minutos.
  -- Cuenta como presente a todos los efectos, pero pierde prioridad al
  -- armar los equipos de cada tiempo.
  tarde boolean not null default false,
  -- Se golpeó durante el partido y no sigue jugando. 'golpeado' es
  -- transitorio (se desmarca y vuelve); 'lesionado' además queda pendiente de
  -- seguimiento en la sección Jugadores. Null = en condiciones de jugar.
  condicion text check (condicion in ('golpeado','lesionado')),
  -- El staff ya revisó esa lesión (la cargó en la ficha o resolvió que no hace
  -- falta): saca el recordatorio de Jugadores sin borrar lo que pasó en el
  -- partido, que queda como registro.
  lesion_atendida boolean not null default false,
  primary key (evento_id, jugador_id)
);

-- Staff a cargo de cada bloque (los bloques suelen jugarse en canchas y
-- horarios distintos, así que el cuerpo técnico también se reparte)
create table if not exists bloque_staff (
  bloque_id uuid not null references bloques(id) on delete cascade,
  staff_email text not null references staff(email) on delete cascade,
  -- Presencia efectiva el día del partido (null = sin marcar todavía)
  presente boolean,
  primary key (bloque_id, staff_email)
);

create table if not exists tiempos (
  id uuid primary key default gen_random_uuid(),
  bloque_id uuid not null references bloques(id) on delete cascade,
  numero int not null check (numero between 1 and 6),
  -- Cierre del tiempo: confirma que se jugó tal como está cargado. Es
  -- condición para sugerir el equipo del tiempo siguiente.
  cerrado_en timestamptz,
  -- Valoración rápida opcional de ese tiempo (la principal es la del bloque)
  valoracion int check (valoracion between 1 and 5),
  unique (bloque_id, numero)
);

create table if not exists tiempo_jugadores (
  tiempo_id uuid not null references tiempos(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  -- Número de camiseta en la formación de 13 (sin 6 ni 7). Null = en cancha
  -- sin puesto asignado (partidos viejos o carga rápida).
  puesto smallint check (puesto between 1 and 15 and puesto not in (6, 7)),
  -- Jugador prestado al rival ese tiempo (cuenta como tiempo jugado)
  prestado boolean not null default false,
  primary key (tiempo_id, jugador_id)
);

-- Tests físicos que toman los preparadores físicos en los entrenamientos.
-- Una fila por medición (jugador + fecha + test), no por "sesión": los tests
-- se toman sueltos y aleatorios, así que agruparlos dejaría sesiones a medio
-- llenar. El semáforo es la valoración del PF junto al número, y es opcional:
-- primero se anota la medición, que es lo que apura en la cancha.
create table if not exists tests_fisicos (
  id uuid primary key default gen_random_uuid(),
  jugador_id uuid not null references jugadores(id) on delete cascade,
  -- Entrenamiento en el que se tomó; null si se cargó suelto desde la ficha
  evento_id uuid references eventos(id) on delete set null,
  fecha date not null default current_date,
  test text not null check (test in
    ('resistencia','salto_largo','velocidad_20m','peso','talla')),
  -- Siempre en la unidad base del test (ver src/tests.js): la resistencia se
  -- anota en minutos y segundos pero se guarda en segundos.
  valor numeric(7,2) not null check (valor > 0),
  semaforo text check (semaforo in ('verde','amarillo','rojo')),
  nota text,
  autor_email text,
  created_at timestamptz not null default now(),
  -- Volver a cargar el mismo test el mismo día corrige la medición
  unique (jugador_id, fecha, test)
);

create index if not exists tests_fisicos_jugador_idx
  on tests_fisicos (jugador_id, test, fecha desc);

-- Primer miembro del staff (crea su contraseña en el primer ingreso)
insert into staff (email, nombre) values ('benitoric@gmail.com', 'Benito')
on conflict (email) do nothing;
