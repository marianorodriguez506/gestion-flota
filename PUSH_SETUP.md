# Activar notificaciones push

## 1. Supabase

En Supabase SQL Editor, ejecutar el bloque de `push_subscriptions` que esta en `supabase-schema.sql`.

Si queres aplicar todo junto, podes ejecutar de nuevo `supabase-schema.sql`: usa `if not exists` y no borra datos.

## 2. Vercel

Crear claves VAPID:

```bash
npx web-push generate-vapid-keys
```

Agregar estas variables en Vercel:

```text
VAPID_PUBLIC_KEY=clave_publica_generada
VAPID_PRIVATE_KEY=clave_privada_generada
VAPID_SUBJECT=mailto:tu-correo@ejemplo.com
```

Ya deben existir tambien:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY o SUPABASE_PUBLISHABLE_KEY
```

## 3. Celulares

Despues del deploy, cada celular debe:

1. Abrir la app con internet.
2. Iniciar sesion.
3. Tocar `Activar alertas`.
4. Aceptar el permiso del sistema.

Cada celular queda guardado por separado, asi una misma cuenta puede recibir alertas en varios dispositivos.
