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
  posicion text,
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
  created_at timestamptz not null default now()
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
  numero int not null check (numero in (1,2)),
  nombre text,
  rival text,
  lugar text,
  hora_convocatoria time,
  valoracion int check (valoracion between 1 and 5),
  cronica text,
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

create table if not exists tiempos (
  id uuid primary key default gen_random_uuid(),
  bloque_id uuid not null references bloques(id) on delete cascade,
  numero int not null check (numero between 1 and 6),
  unique (bloque_id, numero)
);

create table if not exists tiempo_jugadores (
  tiempo_id uuid not null references tiempos(id) on delete cascade,
  jugador_id uuid not null references jugadores(id) on delete cascade,
  primary key (tiempo_id, jugador_id)
);

-- Primer miembro del staff (crea su contraseña en el primer ingreso)
insert into staff (email, nombre) values ('benitoric@gmail.com', 'Benito')
on conflict (email) do nothing;
