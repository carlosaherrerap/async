-- Seed data (para hard reset)

-- Usuario admin (contraseña: admin123)
INSERT INTO usuarios (username, password, nombre, rol) VALUES
('admin', '$2a$10$oM.bfLvrggVzzZJdJTAANOgn4RqYjaPD4SgEtBgNLzwXY4T3aVWxC', 'Administrador', 'admin');

-- Ejemplo de asistente principal
INSERT INTO principal (
  sede_reg, sede_juris, doc_identidad,
  ape_pat, ape_mat, nombres,
  local, aula, tipo_postulante_id, cargo_id
) VALUES
('AMAZONAS', 'AMAZONAS', '70932665',
 'ABAD', 'LLONTOP', 'MIRIAM JENNIFER',
 'LOCAL AMAZONAS BAGUA', 1, 1, 5);

-- Registro de asistencia de ejemplo (estado Puntual 'P')
INSERT INTO asistencias (principal_id, estado, observaciones) VALUES
(1, 'P', 'Asistencia puntual');
