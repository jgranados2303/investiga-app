# InvestigaApp · Sitio web para Netlify

## Contenido
- `index.html` + `landing.css` — página de presentación.
- `app/` — la aplicación completa (edición web). Usa `localapi.js`, que reproduce en el navegador las reglas y rutas de `backend/server.py`.
- `img/` — capturas reales de la app, logotipo e íconos optimizados.
- `netlify.toml` — cabeceras de seguridad y caché.

## Publicar (opción rápida, sin cuenta de GitHub)
1. Entra a https://app.netlify.com/drop
2. Arrastra **esta carpeta completa** (o descomprime el ZIP y arrastra la carpeta).
3. Netlify te dará una URL `https://<nombre>.netlify.app`. Puedes renombrarla en *Site configuration → Change site name* (p. ej. `investigaapp-profejohn`).

## Publicar con Git (actualizaciones automáticas)
1. Sube esta carpeta a un repositorio de GitHub.
2. En Netlify: *Add new site → Import an existing project*, elige el repositorio.
3. Build command: (vacío) · Publish directory: `.`

## Probar en tu equipo antes de subir
Desde esta carpeta: `python -m http.server 8080` y abre http://localhost:8080
(No abras index.html con doble clic: el cifrado de contraseñas requiere http/https.)

## Base de datos (Supabase)
La app guarda todo en el proyecto Supabase **investigaapp** (`https://uozwkxuuudrynqxbrkhl.supabase.co`).
La conexión está en `app/config.js` (clave publicable, apta para el navegador).
La documentación de la base está en `supabase/LEEME-BASE-DE-DATOS.md`.

Tablas: profiles, diagnosis_attempts, projects, project_members, versions, rewards, sources,
readings, mentor_messages, comments, contents, activity_log (bitácora) + catálogo
(activities, reading_fields, diagnosis_questions). Las reglas pedagógicas se aplican en funciones
del servidor y la seguridad por fila (RLS) impide ver proyectos ajenos.

### Roles
- Toda cuenta nueva es **estudiante**.
- El primer administrador se asigna desde el panel SQL de Supabase:
  `update profiles set role='administrador' where email='su-correo@...';`
- Luego el administrador asigna roles desde *Mi perfil → Asignar roles*.

### Confirmación de correo
Supabase la trae activada y su correo gratuito envía muy pocos mensajes por hora.
Para uso en aula: Supabase → Authentication → Sign In / Providers → Email → desactivar **Confirm email**,
o configurar un SMTP propio (Authentication → Emails → SMTP Settings).
