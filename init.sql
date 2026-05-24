-- ==============================================================
--  INICIALIZACIÓN DE BASE DE DATOS – MODELO LÓGICO NORMALIZADO
--  Derivado del documento mod.txt (requisitos del cliente)
-- ==============================================================

-- 1. Tabla de parámetros de asistencia (estados y horarios)
CREATE TABLE parametros_asistencia (
    estado CHAR(1) PRIMARY KEY,
    descripcion VARCHAR(20) NOT NULL,
    hora_min TIME NOT NULL,
    hora_max TIME NOT NULL
);

INSERT INTO parametros_asistencia (estado, descripcion, hora_min, hora_max) VALUES
('P','Puntual'  , '08:00:00', '09:00:00'),
('T','Tarde'    , '09:00:01', '10:00:00');

-- 2. Tablas de referencia (cargos y tipos de postulante)
CREATE TABLE cargos (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO cargos (nombre) VALUES
('Monitor Nacional'),
('Supervisor Nacional'),
('Coordinador Regional'),
('Coordinador Administrativo Regional'),
('Tecnico Administrativo Provincial');

CREATE TABLE tipo_postulante (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO tipo_postulante (descripcion) VALUES
('Titular'),
('Reserva');

-- 3. Tabla principal – información del asistente
CREATE TABLE principal (
    id SERIAL PRIMARY KEY,
    sede_reg VARCHAR(100) NOT NULL,
    sede_juris VARCHAR(100) NOT NULL,
    doc_identidad VARCHAR(12) NOT NULL UNIQUE,
    ape_pat VARCHAR(35) NOT NULL,
    ape_mat VARCHAR(35) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    local VARCHAR(150) NOT NULL,
    aula INT NOT NULL,
    tipo_postulante_id INT NOT NULL REFERENCES tipo_postulante(id),
    cargo_id INT NOT NULL REFERENCES cargos(id)
);

-- 4. Tabla de usuarios del sistema (login)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(20) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100),
    rol VARCHAR(20) DEFAULT 'operador',
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de asistencias (registro de ingreso)
CREATE TABLE asistencias (
    id SERIAL PRIMARY KEY,
    principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    estado CHAR(1) NOT NULL REFERENCES parametros_asistencia(estado),
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,
    UNIQUE (principal_id, DATE(fecha_hora))
);

-- Índices de ayuda
CREATE INDEX idx_principal_doc ON principal(doc_identidad);
CREATE INDEX idx_asistencias_fecha ON asistencias(DATE(fecha_hora));

-- Seed data (hard reset considerations)
INSERT INTO usuarios (username, password_hash, nombre, rol) VALUES
('admin', '$2a$10$Xm7M/k/f1J.5f7H3X.H1OeY4p.S3X0Z6r4W8f9u7d8v7R6Q5P4O3N', 'Administrador', 'admin');

-- Ejemplo de asistente principal
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id) VALUES
('AMAZONAS', 'AMAZONAS', '70932665', 'ABAD', 'LLONTOP', 'MIRIAM JENNIFER', 'LOCAL AMAZONAS BAGUA', 1, 1, 5);

-- Registro de asistencia de ejemplo (usa el estado 'P')
INSERT INTO asistencias (principal_id, estado, observaciones) VALUES
(1, 'P', 'Asistencia puntual');
