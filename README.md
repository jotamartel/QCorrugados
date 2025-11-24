# Q Corrugados - Sistema de Gestión

Sistema completo de gestión de producción y órdenes de cajas de cartón corrugado.

## Características

### Portal de Clientes
- ✅ Registro y login de clientes
- ✅ Catálogo de cajas disponibles
- ✅ Crear órdenes de compra
- ✅ Selección de fecha de entrega (mínimo 7 días)
- ✅ Ver historial de órdenes
- ✅ Gestión de perfil

### Panel de Administración
- ✅ Ver todas las órdenes
- ✅ Gestión de estados (Pendiente → Aprobada → En Producción → Lista → Entregada)
- ✅ Gestión de clientes
- ✅ Ver cajas más pedidas por cliente
- ✅ Análisis de frecuencia de compra
- ✅ Catálogo de cajas
- ✅ Acceso a herramienta de optimización de producción

### Producción
- ✅ Optimización de corte de bobinas
- ✅ Soporte para Doble Chapetón (cajas grandes)
- ✅ Análisis con IA (Claude)

---

## Configuración de Supabase

### 1. Crear Proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta
2. Crea un nuevo proyecto
3. Espera a que se inicialice

### 2. Ejecutar Schema SQL

1. Ve a **SQL Editor** en el panel de Supabase
2. Copia todo el contenido de `supabase-schema.sql`
3. Pégalo en el editor y ejecuta
4. Esto creará todas las tablas, funciones, triggers y políticas de seguridad

### 3. Configurar Variables de Entorno

1. En tu proyecto Supabase, ve a **Settings > API**
2. Copia:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3. Crea un archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 4. Crear Usuario Admin

Después de ejecutar el schema, necesitas crear un usuario admin:

1. Ve a **Authentication > Users** en Supabase
2. Click en "Add user" > "Create new user"
3. Ingresa email y contraseña
4. Luego ve a **Table Editor > profiles**
5. Encuentra el usuario y cambia el campo `role` de `client` a `admin`

---

## Estructura de la Base de Datos

```
profiles          - Usuarios (extiende auth.users)
box_catalog       - Catálogo de cajas
client_boxes      - Cajas preferidas por cliente (historial)
orders            - Órdenes de compra
order_items       - Items de cada orden
order_history     - Historial de cambios de estado
```

### Vistas
- `orders_with_client` - Órdenes con info del cliente
- `client_analytics` - Análisis de clientes

---

## Rutas de la Aplicación

| Ruta | Descripción |
|------|-------------|
| `/login` | Login y registro |
| `/dashboard` | Redirige según rol |
| `/cliente` | Portal del cliente |
| `/admin` | Panel de administración |
| `/` | Herramienta de producción |

---

## Desarrollo Local

```bash
# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Build de producción
npm run build
```

---

## Deploy en Vercel

1. Sube el proyecto a GitHub
2. Conecta con Vercel
3. Configura las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (opcional, para IA)

---

## Flujo de Órdenes

```
┌──────────────────────────────────────────────────────────┐
│  Cliente                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐              │
│  │ Registro│ →  │ Catálogo│ →  │  Orden  │              │
│  └─────────┘    └─────────┘    └─────────┘              │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│  Admin                                                    │
│                                                           │
│  PENDIENTE → APROBADA → EN PRODUCCIÓN → LISTA → ENTREGADA│
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## Seguridad (Row Level Security)

- Los clientes solo ven sus propias órdenes y perfil
- Los admins ven todo
- Las cajas activas son visibles para todos
- Los cambios de estado se registran automáticamente

---

## Funcionalidades Automáticas

1. **Al crear orden**: Se actualizan los totales automáticamente
2. **Al cambiar estado**: Se registra en `order_history`
3. **Al agregar item**: Se actualiza `client_boxes` con estadísticas
4. **Al registrar usuario**: Se crea perfil automáticamente

---

## Cajas con Doble Chapetón

Para cajas con largo desplegado > 2080mm:
- Se marcan con badge "2P" (2 planchas)
- Cada caja consume 2 planchas en producción
- Los totales reflejan las planchas reales necesarias
