
CREATE TABLE IF NOT EXISTS turnos (
    id             SERIAL        PRIMARY KEY,
    principal_id   INT           NOT NULL UNIQUE REFERENCES principal(id) ON DELETE CASCADE,
    condicion      INT           NOT NULL DEFAULT 1,
    hora_ingreso_2 VARCHAR(10)   DEFAULT '0',
    marcacion_2    VARCHAR(50)   DEFAULT '0',
    estado         VARCHAR(10)   DEFAULT 'NA',
    salida         VARCHAR(50)
);

-- Trigger de control de actualizaciones para sincronización en tiempo real
DROP TRIGGER IF EXISTS trg_actualizacion_turnos ON turnos;
CREATE TRIGGER trg_actualizacion_turnos
AFTER INSERT OR UPDATE OR DELETE ON turnos
FOR EACH ROW EXECUTE FUNCTION registrar_actualizacion();

-- Inicializar turnos con valores por defecto para todos los postulantes existentes
INSERT INTO turnos (principal_id, condicion, hora_ingreso_2, marcacion_2, estado, salida)
SELECT id, 1, '0', '0', 'NA', NULL
FROM principal
ON CONFLICT (principal_id) DO NOTHING;
