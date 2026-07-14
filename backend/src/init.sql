-- =============================================================================
-- INIT.SQL  —  Hard Reset completo de la base de datos ENLA-2026
-- Esquema normalizado: principal usa sede_juris_id (FK) sin sede_reg/sede_juris
-- =============================================================================

-- Eliminar tablas en orden inverso a las dependencias
DROP TABLE IF EXISTS intentos_login          CASCADE;
DROP TABLE IF EXISTS historial_cambios_sede  CASCADE;
DROP TABLE IF EXISTS asistencias             CASCADE;
DROP TABLE IF EXISTS usuarios                CASCADE;
DROP TABLE IF EXISTS principal               CASCADE;
DROP TABLE IF EXISTS metas_cargos            CASCADE;
DROP TABLE IF EXISTS cargos                  CASCADE;
DROP TABLE IF EXISTS tipo_postulante         CASCADE;
DROP TABLE IF EXISTS sede_juris              CASCADE;
DROP TABLE IF EXISTS sede_regional           CASCADE;
DROP TABLE IF EXISTS parametros_asistencia   CASCADE;

-- =============================================================================
-- 1. PARÁMETROS DE ASISTENCIA
-- =============================================================================
CREATE TABLE parametros_asistencia (
    estado      CHAR(1)      PRIMARY KEY,
    descripcion VARCHAR(20)  NOT NULL
);

INSERT INTO parametros_asistencia (estado, descripcion) VALUES
    ('P', 'Puntual'),
    ('T', 'Tarde');

-- =============================================================================
-- 2. SEDES REGIONALES  (28 sedes)
-- =============================================================================
CREATE TABLE sede_regional (
    id     VARCHAR(10)  PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    ubigeo VARCHAR(10)
);

-- =============================================================================
-- 3. SEDES JURISDICCIONALES  (165 sedes)
-- =============================================================================
CREATE TABLE sede_juris (
    id               VARCHAR(20)  PRIMARY KEY,
    nombre           VARCHAR(100) NOT NULL,
    sede_regional_id VARCHAR(10)  NOT NULL REFERENCES sede_regional(id) ON UPDATE CASCADE ON DELETE CASCADE,
    codigo_juris     VARCHAR(10)  NOT NULL,
    ubigeo           VARCHAR(10),
    UNIQUE (sede_regional_id, nombre)
);

-- =============================================================================
-- 4. CARGOS Y METAS
-- =============================================================================
CREATE TABLE cargos (
    id     SERIAL       PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO cargos (id, nombre) VALUES
    (1, 'Monitor Nacional'),
    (2, 'Supervisor Nacional'),
    (3, 'Coordinador Regional'),
    (4, 'Coordinador Administrativo Regional'),
    (5, 'Tecnico Administrativo Provincial')
ON CONFLICT DO NOTHING;

SELECT setval('cargos_id_seq', (SELECT MAX(id) FROM cargos));

CREATE TABLE metas_cargos (
    cargo_id        INT PRIMARY KEY REFERENCES cargos(id),
    limite_vacantes INT NOT NULL DEFAULT 0
);

INSERT INTO metas_cargos (cargo_id, limite_vacantes) VALUES
    (1, 10), (2, 5), (3, 2), (4, 2), (5, 15)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. TIPO DE POSTULANTE
-- =============================================================================
CREATE TABLE tipo_postulante (
    id          SERIAL      PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO tipo_postulante (id, descripcion) VALUES
    (1, 'Titular'),
    (2, 'Reserva')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 6. PRINCIPAL  — ESQUEMA NORMALIZADO (sin sede_reg / sede_juris)
-- =============================================================================
CREATE TABLE principal (
    id                 SERIAL        PRIMARY KEY,
    sede_juris_id      VARCHAR(20)   NOT NULL REFERENCES sede_juris(id) ON UPDATE CASCADE,
    doc_identidad      VARCHAR(12)   NOT NULL UNIQUE,
    ape_pat            VARCHAR(35)   NOT NULL,
    ape_mat            VARCHAR(35)   NOT NULL,
    nombres            VARCHAR(100)  NOT NULL,
    local              VARCHAR(150)  NOT NULL,
    aula               INT           NOT NULL,
    tipo_postulante_id INT           NOT NULL REFERENCES tipo_postulante(id),
    cargo_id           INT           NOT NULL REFERENCES cargos(id),
    turno              VARCHAR(10)   NOT NULL DEFAULT 'DIA',
    hora_ingreso       TIME          NOT NULL DEFAULT '08:00:00'
);

CREATE INDEX idx_principal_doc ON principal(doc_identidad);

-- =============================================================================
-- 7. USUARIOS
-- =============================================================================
CREATE TABLE usuarios (
    id             SERIAL        PRIMARY KEY,
    username       VARCHAR(50)   UNIQUE NOT NULL,
    password       VARCHAR(255)  NOT NULL,
    nombre         VARCHAR(100),
    -- rol: 'admin' | 'SU' | <id de sede_regional>
    rol            VARCHAR(20)   DEFAULT 'operador',
    activo         BOOLEAN       DEFAULT TRUE,
    fecha_creacion TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- 8. ASISTENCIAS
-- =============================================================================
CREATE TABLE asistencias (
    id                   SERIAL   PRIMARY KEY,
    principal_id         INT      NOT NULL REFERENCES principal(id)            ON DELETE CASCADE,
    estado               CHAR(1)  NOT NULL REFERENCES parametros_asistencia(estado),
    fecha_hora           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones        TEXT,
    usuario_registro_id  INT      REFERENCES usuarios(id)                      ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date));

-- =============================================================================
-- 9. HISTORIAL DE CAMBIOS DE SEDE
-- =============================================================================
CREATE TABLE historial_cambios_sede (
    id            SERIAL        PRIMARY KEY,
    principal_id  INT           NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    sede_origen   VARCHAR(100)  NOT NULL,
    sede_destino  VARCHAR(100)  NOT NULL,
    fecha_hora    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    usuario_cambio VARCHAR(50)  NOT NULL
);

-- =============================================================================
-- 10. INTENTOS DE LOGIN (seguridad / bloqueo por IP)
-- =============================================================================
CREATE TABLE intentos_login (
    id          SERIAL      PRIMARY KEY,
    username    VARCHAR(50) NOT NULL,
    ip_address  VARCHAR(45) NOT NULL,
    fecha_hora  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
    exitoso     BOOLEAN     NOT NULL
);

-- =============================================================================
-- FIN DEL SCRIPT
-- Para aplicar: psql -U <usuario> -d <base_de_datos> -f init.sql
-- ADVERTENCIA: elimina TODOS los datos existentes
-- =============================================================================
