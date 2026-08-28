# Sócrates — Asistente Personal de IA

## Stack
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase (PostgreSQL) para memoria y conversaciones
- Anthropic Claude API (modelo sonnet) para respuestas
- Deploy: Vercel (s-crates.vercel.app)

## Estructura
- `src/app/page.tsx` — interfaz del chat
- `src/app/api/chat/route.ts` — endpoint de chat con streaming
- `src/app/api/memory/route.ts` — CRUD de memoria persistente
- `src/lib/socrates.ts` — system prompt + carga de memoria
- `src/lib/supabase.ts` — cliente Supabase (browser)
- `src/lib/supabase-server.ts` — cliente Supabase (server, service_role)
- `supabase-schema.sql` — schema de las tablas

## Variables de entorno
Definidas en `.env.local` (nunca se suben):
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Reglas
- Este proyecto es 100% personal, no tiene relación con InterRoom ni GrupoSkyLine
- La memoria de Sócrates se guarda en la tabla `memory` de Supabase
- Las conversaciones se persisten en la tabla `conversations`
- No hay autenticación por ahora (uso personal directo)
