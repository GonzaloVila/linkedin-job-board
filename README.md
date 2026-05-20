# 📋 LinkedIn Job Board

Dashboard personal para ver y triagear las vacantes que el bot scrapea.
Conecta a la **misma base de Neon** que usa el bot, así que cada vacante
nueva aparece acá automáticamente sin sincronizar nada.

**Stack:** Next.js 15 · React 19 · Tailwind v4 · postgres-js · TypeScript
**Hosting:** Vercel (gratis)

---

## Cómo se usa

- **Pendientes (default):** las vacantes nuevas o marcadas como "interesado".
- **Aplicado:** las que ya aplicaste — para llevar el control.
- **Descartado:** las que no te convencen — fuera de la vista por defecto.
- **Buscar:** texto libre, busca en título y empresa.
- Cada vacante: botón **"abrir ↗"** que te lleva a LinkedIn, y 3 botones de status.

## Setup

### 1. Migración de la base

Una vez, **antes de deployar**, andá al SQL Editor de Neon y ejecutá:

```sql
ALTER TABLE jobs_seen
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs_seen (status);
```

(También está en `migrations/001_add_status.sql`.) Las vacantes existentes
quedan con status `'new'` por default. El bot no se rompe — sigue insertando
nuevas filas sin tocar la columna `status`.

### 2. Dev local

```bash
npm install
cp .env.example .env.local
# Editá .env.local:
#   DATABASE_URL = misma URL de Neon que usa el bot
#   DASHBOARD_PASSWORD = un password fuerte que solo vos sepas
npm run dev
```

Abrí `http://localhost:3000`. Te pide usuario y password vía dialog HTTP Basic:
- **Usuario:** `admin`
- **Password:** lo que pusiste en `DASHBOARD_PASSWORD`

### 3. Deploy en Vercel

1. Pusheá este repo a GitHub (privado).
2. Andá a [vercel.com/new](https://vercel.com/new) → conectá tu GitHub → seleccioná el repo.
3. Vercel detecta Next.js automáticamente. Antes de clickear **Deploy**, agregá las env vars:
   - `DATABASE_URL` = la URL de Neon
   - `DASHBOARD_PASSWORD` = el password
4. **Deploy**. Vercel te asigna una URL tipo `linkedin-job-board-xxx.vercel.app`.
5. Visitala → te pide usuario/password → adentro tenés tu dashboard.

> Tu URL en Vercel es indexable por buscadores por defecto. La protección con
> Basic Auth ya evita que nadie sin password vea contenido, pero igual
> agregamos `robots: noindex` en el `<head>`. Si querés más privacidad,
> usá el dominio personalizado y mantenelo no público.

## Tech notes

- **Server Components** para fetch de datos (sin cliente HTTP intermedio).
- **Server Actions** para updates de status (sin endpoints REST).
- **Middleware Edge** para basic auth — barato y rápido.
- **postgres-js** con `prepare: false` porque el pooler de Neon no soporta prepared statements estables.

## Estructura

```
linkedin-job-board/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # fuentes + html shell
│   │   ├── page.tsx          # dashboard principal (Server Component)
│   │   ├── actions.ts        # server actions para update de status
│   │   ├── globals.css       # tema editorial-terminal
│   │   └── icon.svg          # favicon
│   ├── components/
│   │   ├── JobCard.tsx       # tarjeta de cada vacante (Client Component)
│   │   ├── FilterTabs.tsx    # tabs de filtro por status
│   │   └── SearchInput.tsx   # buscador con debounce
│   ├── lib/
│   │   └── db.ts             # cliente postgres + tipos
│   └── middleware.ts         # HTTP Basic Auth
├── migrations/
│   └── 001_add_status.sql    # ALTER TABLE para la columna status
├── .env.example
├── next.config.ts
├── package.json
├── tailwind.config (en globals.css con @theme)
└── tsconfig.json
```

## Si querés modificar

- **Cambiar paleta:** editá los `--color-*` en `src/app/globals.css`.
- **Cambiar tipografía:** editá `src/app/layout.tsx` (fuentes Google).
- **Cambiar cantidad de filas a mostrar:** editá `LIMIT 200` en `src/app/page.tsx`.
- **Agregar un nuevo status:** agregá en `lib/db.ts` el tipo `JobStatus`, en
  `JobCard.tsx` el label y color, en `FilterTabs.tsx` la tab, y en
  `page.tsx` la lógica de conteo y filtrado.
