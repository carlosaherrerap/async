-- 1. Tabla de parámetros de asistencia (estados)
CREATE TABLE parametros_asistencia (
    estado CHAR(1) PRIMARY KEY,
    descripcion VARCHAR(20) NOT NULL
);

INSERT INTO parametros_asistencia (estado, descripcion) VALUES
('P','Puntual'),
('T','Tarde');

-- 2. Tablas de referencia
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

CREATE TABLE metas_cargos (
    cargo_id INT PRIMARY KEY REFERENCES cargos(id),
    limite_vacantes INT NOT NULL DEFAULT 0
);

INSERT INTO metas_cargos (cargo_id, limite_vacantes) VALUES
(1, 10), (2, 5), (3, 2), (4, 2), (5, 15);

CREATE TABLE tipo_postulante (
    id SERIAL PRIMARY KEY,
    descripcion VARCHAR(50) NOT NULL UNIQUE
);

INSERT INTO tipo_postulante (descripcion) VALUES
('Titular'),
('Reserva');

-- 3. Tabla principal – postulante con turno y hora de ingreso programada
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
    cargo_id INT NOT NULL REFERENCES cargos(id),
    turno VARCHAR(10) NOT NULL DEFAULT 'DIA',
    hora_ingreso TIME NOT NULL DEFAULT '08:00:00'
);

-- 4. Tabla de usuarios del sistema (login)
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    username VARCHAR(20) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nombre VARCHAR(100),
    rol VARCHAR(20) DEFAULT 'operador',
    activo BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de asistencias (solo registro de ingreso, 1 vez por día)
CREATE TABLE asistencias (
    id SERIAL PRIMARY KEY,
    principal_id INT NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
    estado CHAR(1) NOT NULL REFERENCES parametros_asistencia(estado),
    fecha_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT
);

-- Índices
CREATE INDEX idx_principal_doc ON principal(doc_identidad);
CREATE INDEX idx_asistencias_fecha ON asistencias((fecha_hora::date));
CREATE UNIQUE INDEX idx_asistencias_unico ON asistencias(principal_id, (fecha_hora::date));

-- ==============================================================
--  SEED DATA
-- ==============================================================

-- Usuario administrador (contraseña: admin123)
INSERT INTO usuarios (username, password, nombre, rol) VALUES
('admin', '$2a$10$oM.bfLvrggVzzZJdJTAANOgn4RqYjaPD4SgEtBgNLzwXY4T3aVWxC', 'Administrador', 'admin');

-- Usuario operador (contraseña: admin123)
INSERT INTO usuarios (username, password, nombre, rol) VALUES
('operador1', '$2a$10$oM.bfLvrggVzzZJdJTAANOgn4RqYjaPD4SgEtBgNLzwXY4T3aVWxC', 'Juan Operador', 'operador');

-- ==========================================
--  POSTULANTES - 15 registros con turno y hora de ingreso
-- ==========================================

-- AMAZONAS (turno DIA)
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('AMAZONAS', 'AMAZONAS', '70932665', 'ABAD', 'LLONTOP', 'MIRIAM JENNIFER', 'LOCAL AMAZONAS BAGUA', 1, 1, 5, 'DIA', '08:00:00'),
('AMAZONAS', 'AMAZONAS', '45678901', 'GARCIA', 'PEREZ', 'CARLOS ALBERTO', 'LOCAL AMAZONAS BAGUA', 2, 1, 3, 'DIA', '07:00:00'),
('AMAZONAS', 'CONDORCANQUI', '42315678', 'VASQUEZ', 'RIOS', 'ANA MARIA', 'LOCAL CONDORCANQUI NIEVA', 1, 2, 5, 'TARDE', '13:00:00');

-- LIMA (mixto)
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('LIMA', 'LIMA CENTRO', '10234567', 'TORRES', 'MENDOZA', 'LUIS FERNANDO', 'LOCAL LIMA CENTRO 01', 1, 1, 1, 'DIA', '09:00:00'),
('LIMA', 'LIMA CENTRO', '10345678', 'QUISPE', 'HUAMAN', 'ROSA ELENA', 'LOCAL LIMA CENTRO 01', 2, 1, 2, 'TARDE', '14:00:00'),
('LIMA', 'LIMA NORTE', '10456789', 'RODRIGUEZ', 'SILVA', 'PEDRO MIGUEL', 'LOCAL LIMA NORTE COMAS', 1, 1, 4, 'DIA', '08:00:00'),
('LIMA', 'LIMA SUR', '10567890', 'MORALES', 'DIAZ', 'MARIA LUISA', 'LOCAL LIMA SUR VES', 1, 2, 5, 'TARDE', '12:00:00');

-- AREQUIPA
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('AREQUIPA', 'AREQUIPA', '29123456', 'CHAVEZ', 'GUTIERREZ', 'JORGE ENRIQUE', 'LOCAL AREQUIPA CENTRO', 1, 1, 3, 'DIA', '07:00:00'),
('AREQUIPA', 'AREQUIPA', '29234567', 'FERNANDEZ', 'PONCE', 'CARMEN ROSA', 'LOCAL AREQUIPA CENTRO', 2, 1, 5, 'DIA', '10:00:00'),
('AREQUIPA', 'CAMANA', '29345678', 'HUANCA', 'MAMANI', 'ROBERTO CARLOS', 'LOCAL CAMANA', 1, 2, 5, 'TARDE', '15:00:00');

-- CUSCO
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('CUSCO', 'CUSCO', '23456789', 'CONDORI', 'APAZA', 'EDGAR DAVID', 'LOCAL CUSCO CENTRO', 1, 1, 2, 'DIA', '08:00:00'),
('CUSCO', 'CUSCO', '23567890', 'PUMA', 'QUISPE', 'NANCY BEATRIZ', 'LOCAL CUSCO CENTRO', 2, 1, 5, 'TARDE', '16:00:00');

-- LAMBAYEQUE
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('LAMBAYEQUE', 'CHICLAYO', '16789012', 'SANCHEZ', 'OLIVA', 'JOSE MANUEL', 'LOCAL CHICLAYO CENTRO', 1, 1, 4, 'DIA', '09:00:00'),
('LAMBAYEQUE', 'CHICLAYO', '16890123', 'CASTILLO', 'BERNAL', 'TERESA MILAGROS', 'LOCAL CHICLAYO CENTRO', 2, 2, 5, 'TARDE', '14:00:00');

-- LA LIBERTAD
INSERT INTO principal (sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso) VALUES
('LA LIBERTAD', 'TRUJILLO', '17901234', 'REYES', 'LEON', 'FRANCISCO JAVIER', 'LOCAL TRUJILLO CENTRO', 1, 1, 1, 'DIA', '07:00:00');

-- Asistencias de ejemplo
INSERT INTO asistencias (principal_id, estado, observaciones) VALUES
(1, 'P', 'Asistencia puntual'),
(2, 'P', NULL),
(4, 'P', NULL),
(5, 'T', 'Llegó 15 min tarde'),
(8, 'P', NULL),
(11, 'T', 'Tráfico en la vía'),
(13, 'P', NULL),
(15, 'P', NULL);
