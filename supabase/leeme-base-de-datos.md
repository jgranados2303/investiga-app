# Base de datos de InvestigaApp (Supabase)

Proyecto: **investigaapp** · Región us-east-1 · Plan gratuito
URL de la API: https://uozwkxuuudrynqxbrkhl.supabase.co

## Migraciones aplicadas (en orden)
1. `01_esquema_base` — tablas de catálogo, perfiles, proyectos, versiones, recompensas, fuentes, fichas, mentor, comentarios, contenidos y bitácora.
2. `02_catalogo_inicial` — 6 misiones, 11 campos de ficha y 5 preguntas del diagnóstico (claves en esquema privado).
3. `03_seguridad_reglas_bitacora` — seguridad por fila (RLS), funciones con las reglas pedagógicas y auditoría automática.
4. `04_indices` — índices de rendimiento.
5. `05_lectura_proyecto_recien_creado` — ajuste de la política de lectura de proyectos.

El SQL completo de cada migración se puede ver en el panel: *Database → Migrations*.
Para descargarlo como archivos: `npx supabase link --project-ref uozwkxuuudrynqxbrkhl` y luego `npx supabase db pull`.

## Qué se registra
| Tabla | Contenido |
|---|---|
| profiles | Nombre, correo, rol, institución, área, meta, recordatorios, último diagnóstico |
| diagnosis_attempts | Cada intento del diagnóstico (respuestas, puntaje, ruta) |
| projects / project_members | Proyectos y docentes autorizados |
| versions | Cada versión de cada misión, con retroalimentación, estado y reflexión |
| rewards | Misiones completadas y XP (una vez por misión) |
| sources / readings | Fuentes bibliográficas y fichas de lectura crítica |
| mentor_messages | Consultas al orientador y respuestas |
| comments | Comentarios docentes vinculados a una versión |
| contents | Versiones publicadas de guías y ejemplos |
| activity_log | Bitácora: toda alta/cambio/baja (con estado antes y después) + inicios de sesión, exportaciones y descargas |

## Funciones (API)
submit_diagnosis · save_evidence · complete_mission · add_source · save_reading · ask_mentor ·
set_member · add_comment · publish_content · admin_set_role · log_event

## Consultas útiles (panel SQL)
```sql
-- Hacer administrador al docente responsable (tras registrarse en la app)
update profiles set role='administrador' where email='correo@ejemplo.edu.ec';
-- Avance por estudiante
select p.name, pr.title, count(r.*) misiones, coalesce(sum(r.xp),0) xp
from profiles p join projects pr on pr.owner_id=p.id left join rewards r on r.project_id=pr.id
group by 1,2 order by 3 desc;
-- Últimos eventos
select created_at, entity, action, actor_id from activity_log order by id desc limit 50;
```
