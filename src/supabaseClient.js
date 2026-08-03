import { createClient } from '@supabase/supabase-js'

// Proyecto Supabase que aloja los datos (tablas con prefijo rugby_).
// La clave publishable es pública por diseño: la seguridad la dan las
// políticas RLS (solo staff invitado accede a los datos de rugby).
const SUPABASE_URL = 'https://biuwqdmcbwoqlandgzbg.supabase.co'
const SUPABASE_KEY = 'sb_publishable_BGEOolJjvWKAbERQw_FVOg_wNUm7HCG'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
