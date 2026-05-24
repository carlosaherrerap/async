# Proyecto Asistencia - Sistema de Registro

## Descripción general
Este proyecto es una aplicación **full‑stack** (backend SQL + frontend React Native/Expo) para registrar la asistencia de personas en distintas sedes.  El modelo de datos está normalizado a **Tercera Forma Normal (3FN)** y los campos compuestos como **Apellidos** se han atomizado en `ape_pat` (apellido paterno) y `ape_mat` (apellido materno).

## Arquitectura
- **Base de datos**: PostgreSQL (el script de inicialización está en `init.sql`).
- **Backend**: (por ahora solo el esquema SQL; la lógica de API se conectará a estas tablas).
- **Frontend**: aplicación Expo/React Native que muestra un modal (`AttendanceModal.js`) para capturar los datos y envía la información al backend mediante fetch.

## Flujo de datos / casos de uso
| Paso | Acción del usuario | Qué tabla se escribe / lee | Comentario |
|------|-------------------|---------------------------|------------|
| 1️⃣  | **Login** (usuario y contraseña) | `usuarios` (consulta `SELECT * FROM usuarios WHERE username = ?`) | Credenciales de ejemplo aparecen en este README. |
| 2️⃣  | **Registrar asistencia** (abriendo el modal) | `principal` (si el documento no existe, se inserta) → `asistencias` (registro de la hora) | El modal envía `{doc_identidad, ape_pat, ape_mat, nombres, ...}` al endpoint `/asistencias`. |
| 3️⃣  | **Consultar reporte** | `asistencias` JOIN `principal` JOIN `cargos` JOIN `tipo_postulante` | El reporte muestra: sede regional, sede jurisdiccional, documento, **apellido paterno + materno**, nombres, local, aula, tipo postulante, cargo, fecha y hora. |
| 4️⃣  | **Cambiar estado de asistencia (p.ej. reserva)** | `parametros_asistencia` (para validar rangos de hora) | El campo `estado` (`P` puntual, `T` tarde) se determina según la hora de ingreso y los rangos definidos en `parametros_asistencia`. |

## Poblar la base de datos (casos de uso básicos)
```sql
-- 1. Insertar usuarios de la aplicación (credenciales de ejemplo)
INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES
('admin', crypt('admin123', gen_salt('bf')), 'Administrador', 'admin'),
('operador', crypt('oper123', gen_salt('bf')), 'Operador', 'operador');

-- 2. Insertar datos de referencia (cargos y tipos de postulante) – ya vienen en el script init.sql.
-- 3. Registrar una persona (solo si aún no está en la tabla principal)
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id)
VALUES ('Amazonas', 'Amazonas 1', '70932665', 'ABAD', 'LLONTOP', 'MIRIAM JENNIFER', 'LOCAL AMAZONAS BAGUA', 1,
        (SELECT id FROM tipo_postulante WHERE descripcion='Titular'),
        (SELECT id FROM cargos WHERE nombre='Tecnico Administrativo Provincial'));

-- 4. Registrar la asistencia de la persona anterior (ejemplo de primer día)
INSERT INTO asistencias (principal_id, estado)
VALUES ((SELECT id FROM principal WHERE doc_identidad='70932665'), 'P');
```
> **Nota**: la columna `password_hash` utiliza la función `crypt` de PostgreSQL con bcrypt.  En un entorno real se deben usar HTTPS y almacenar los hashes de manera segura.

## Credenciales de la aplicación (para pruebas)
| Usuario | Contraseña |
|---------|------------|
| **admin** | `admin123` |
| operador | `oper123` |

Utiliza **admin** para acceder a todas las funcionalidades y **operador** para un acceso limitado (solo registro de asistencia).

## Cómo ejecutar el proyecto
1. **Base de datos**
   ```bash
   createdb asistencia_db        # crea la base de datos
   psql -d asistencia_db -f init.sql   # ejecuta el script de esquema y datos iniciales
   ```
2. **Frontend** (Expo)
   ```bash
   cd frontend
   npm install
   npx expo start    # abre el cliente Expo (Android / iOS o web)
   ```
   El modal de asistencia está en `src/components/AttendanceModal.js`.

3. **Backend** (por implementar) – conectar a la BD con el driver de PostgreSQL y exponer los endpoints `/login`, `/asistencias`, `/reporte`.

## .gitignore
Se incluye en el archivo ` .gitignore ` del proyecto para evitar subir archivos generados, dependencias y datos sensibles.

---
**Fin del README**
