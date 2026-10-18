# DyL Gestor

Gestión de mallas de turnos, personal, asistencia y RRHH para Mayorista DyL.

Funciona como **app instalable (PWA)** en celulares Android, iPhone y en PC (Windows / Mac), y como página web normal. Todos los dispositivos comparten los mismos datos en tiempo real a través de Supabase.

- **Frontend:** Next.js 15 + React 19 + Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)

---

## 1. Puesta en marcha (una sola vez)

### a) Base de datos

Aplica la migración nueva en tu proyecto Supabase. Puedes usar la CLI (`supabase db push`) o copiar el contenido de
`supabase/migrations/20261018000000_auth_roles_rls.sql` en **Supabase → SQL Editor → Run**.

La migración **no borra datos** de trabajadores, mallas, asistencia ni RRHH. Hace lo siguiente:

- Cierra el acceso público a la base de datos. Antes, cualquiera con la URL podía leer y modificar todo.
- Crea los roles de usuario (`admin`, `lector`, `pendiente`).
- Elimina la tabla `pin_settings`, porque guardaba los PIN en texto plano y ya no se usa.

> ⚠️ Desde este momento, la versión antigua de la app (con PIN) deja de funcionar. Publica la versión nueva al mismo tiempo.

### b) Configurar el login en Supabase

En **Authentication → URL Configuration**:

- **Site URL:** la dirección de tu app, por ejemplo `https://tu-app.netlify.app`.
- **Redirect URLs:** agrega esa misma dirección.

En **Authentication → Providers → Email**, deja activado *Confirm email*.

### c) Crear el primer administrador

1. Abre la app y usa **Crear cuenta** con tu correo.
2. Confirma el correo desde el enlace que te llega.
3. En **Supabase → SQL Editor** ejecuta:

   ```sql
   UPDATE public.user_roles SET role = 'admin' WHERE email = 'tu-correo@ejemplo.com';
   ```

4. Vuelve a la app y presiona **"Ya me dieron acceso"**.

Desde ahí, las demás personas crean su cuenta en la app y tú les das acceso en **Ajustes → Usuarios**.

| Rol | Qué puede hacer |
| --- | --- |
| Administrador | Ver y modificar todo, incluido RRHH y Ajustes |
| Solo lectura | Ver mallas, personal y asistencia, sin modificar |
| Sin acceso | No ve nada (estado inicial de toda cuenta nueva) |

### d) Variables de entorno

Copia `.env.example` como `.env.local` (o configúralas en tu hosting):

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

Las dos son necesarias **al compilar**, porque también se usan en la política de seguridad (CSP).

---

## 2. Instalar la app

| Dispositivo | Cómo instalar |
| --- | --- |
| **Android** (Chrome) | Abre la app → botón **Instalar app** arriba, o menú ⋮ → *Instalar aplicación* |
| **iPhone / iPad** (Safari) | Abre la app → botón Compartir → **Agregar a pantalla de inicio** |
| **PC** (Chrome o Edge) | Abre la app → botón **Instalar app** arriba, o ícono de instalar en la barra de direcciones |

Queda como un ícono más, se abre en su propia ventana y se actualiza sola cuando publicas una versión nueva.

---

## 3. Desarrollo

```bash
npm install
npm run dev        # http://localhost:4028
npm run build      # compila y revisa tipos y lint
npm run start      # sirve la versión compilada
```

### Estructura

```
src/
  app/                 páginas (malla-de-turnos, asistencia, personal, rrhh, ajustes…)
  components/          AuthGate (login), AppLayout, Sidebar, LockToggle…
  context/
    AuthContext.tsx    sesión y rol del usuario
    AppContext.tsx     datos de la app (trabajadores, turnos, mallas) + tiempo real
  lib/
    supabase/          cliente único y paginación (fetchAll)
    excel.ts           importar/exportar Excel con ExcelJS
    pwa.ts             service worker y botón "Instalar app"
supabase/migrations/   historial de la base de datos
public/sw.js           service worker (caché de archivos estáticos, nunca de datos)
```

### Notas

- **Seguridad:** los permisos se aplican en la base de datos (RLS). Ocultar botones en la interfaz es solo comodidad, no la protección real.
- **Excel:** se importan archivos `.xlsx` y `.csv`. Los `.xls` antiguos (Excel 97-2003) hay que guardarlos primero como `.xlsx`.
- **Días bloqueados en asistencia:** la base de datos rechaza cualquier cambio en un día bloqueado hasta que un admin lo desbloquee.
