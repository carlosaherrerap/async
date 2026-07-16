import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity, Switch } from 'react-native';
import { Surface, Text, TextInput, Button, ActivityIndicator, IconButton, Portal, Modal } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DropdownModal from '../components/DropdownModal';
import { COLORS } from '../theme/colors';
import { API_URL } from '../config';

const HORARIOS_DIA   = ['07:00', '08:00', '09:00', '10:00'];
const HORARIOS_TARDE = ['12:00', '13:00', '14:00', '15:00', '16:00'];

const PLANTILLA_KEY = 'plantilla_registro';
const PLANTILLA_ACTIVA_KEY = 'plantilla_activa';

const ConfigScreen = () => {
  // ─── CARGOS ──────────────────────────────────────────────────────────────────
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [selectedCargo, setSelectedCargo] = useState(null);
  const [nombre, setNombre] = useState('');
  const [meta, setMeta] = useState('');

  // ─── PLANTILLA ───────────────────────────────────────────────────────────────
  const [plantilla, setPlantilla] = useState(null);
  const [plantillaActiva, setPlantillaActiva] = useState(false);
  const [plantillaModalVisible, setPlantillaModalVisible] = useState(false);

  // Campos del modal de plantilla
  const [pSedeReg, setPSedeReg]     = useState('');
  const [pSedeJurisId, setPSedeJurisId] = useState('');
  const [pSedeJurisNombre, setPSedeJurisNombre] = useState('');
  const [pLocal, setPLocal]         = useState('');
  const [pAula, setPAula]           = useState('');
  const [pCargoId, setPCargoId]     = useState('');
  const [pTipo, setPTipo]           = useState('1');
  const [pTurno, setPTurno]         = useState('DIA');
  const [pHora, setPHora]           = useState('07:00');

  // Sedes para los dropdowns de la plantilla
  const [sedesRegionales, setSedesRegionales]     = useState([]);
  const [sedesJuris, setSedesJuris]               = useState([]);
  const [filteredJurisP, setFilteredJurisP]       = useState([]);

  // ─── CARGA INICIAL ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchCargos();
    loadPlantilla();
    loadSedes();
  }, []);

  // Filtrar jurisdicciones cuando cambia la sede regional en la plantilla
  useEffect(() => {
    if (pSedeReg && sedesRegionales.length > 0) {
      const reg = sedesRegionales.find(r => r.nombre?.toLowerCase() === pSedeReg.toLowerCase());
      if (reg) {
        setFilteredJurisP(sedesJuris.filter(j => j.sede_regional_id === reg.id));
      } else {
        setFilteredJurisP([]);
      }
    } else {
      setFilteredJurisP([]);
    }
  }, [pSedeReg, sedesRegionales, sedesJuris]);

  // Sincronizar hora al cambiar turno en la plantilla
  useEffect(() => {
    const hs = pTurno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;
    setPHora(hs[0]);
  }, [pTurno]);

  // ─── FUNCIONES CARGOS ─────────────────────────────────────────────────────────
  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        setCargos(await global.dbHelper.getCargos());
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/configuracion/cargos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setCargos(await res.json());
    } catch (e) {
      try { setCargos(await global.dbHelper.getCargos()); } catch {}
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCargo = async () => {
    if (modalMode === 'create' && !nombre) {
      Alert.alert('Error', 'Ingrese el nombre del cargo');
      return;
    }
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        if (modalMode === 'create') {
          await global.dbHelper.createCargoOffline(nombre, parseInt(meta) || 0);
        } else {
          await global.dbHelper.updateMetaOffline(selectedCargo.id, parseInt(meta) || 0, nombre);
        }
        setModalVisible(false);
        fetchCargos();
        Alert.alert('Exito', 'Configuracion guardada localmente (Modo Offline)');
      } catch (err) {
        Alert.alert('Error', err.message || 'No se pudo guardar localmente');
      }
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      let response;
      if (modalMode === 'create') {
        response = await fetch(`${API_URL}/api/configuracion/cargos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ nombre, meta: parseInt(meta) || 0 })
        });
      } else {
        response = await fetch(`${API_URL}/api/configuracion/cargos/${selectedCargo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ meta: parseInt(meta) || 0 })
        });
      }
      if (response.ok) {
        try {
          const db = global.dbHelper.db;
          if (db) {
            if (modalMode === 'create') {
              const resData = await response.json();
              await db.runAsync('INSERT OR REPLACE INTO cargos (id, nombre) VALUES (?, ?)', [resData.id, nombre]);
              await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [resData.id, parseInt(meta) || 0]);
            } else {
              await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [selectedCargo.id, parseInt(meta) || 0]);
            }
          }
        } catch {}
        setModalVisible(false);
        fetchCargos();
      } else {
        Alert.alert('Error', 'No se pudo guardar la configuración');
      }
    } catch (err) {
      Alert.alert('Error', 'Problema de conexión. ¿Guardar localmente?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Guardar Local', onPress: async () => {
            try {
              if (modalMode === 'create') await global.dbHelper.createCargoOffline(nombre, parseInt(meta) || 0);
              else await global.dbHelper.updateMetaOffline(selectedCargo.id, parseInt(meta) || 0, nombre);
              setModalVisible(false); fetchCargos();
              Alert.alert('Exito', 'Configuracion guardada localmente');
            } catch (e2) { Alert.alert('Error', e2.message); }
          }
        }
      ]);
    }
  };

  const openCreateCargo = () => { setModalMode('create'); setNombre(''); setMeta(''); setModalVisible(true); };
  const openEditCargo = (cargo) => { setModalMode('edit'); setSelectedCargo(cargo); setNombre(cargo.nombre); setMeta(cargo.meta?.toString() || '0'); setModalVisible(true); };

  // ─── FUNCIONES PLANTILLA ──────────────────────────────────────────────────────
  const loadSedes = async () => {
    try {
      const db = global.dbHelper.db;
      if (db) {
        const regs = await db.getAllAsync('SELECT id, nombre FROM sede_regional ORDER BY nombre ASC');
        const jurs = await db.getAllAsync('SELECT id, nombre, sede_regional_id FROM sede_juris ORDER BY nombre ASC');
        setSedesRegionales(regs);
        setSedesJuris(jurs);
      }
    } catch (e) { console.error('Error loading sedes:', e); }
  };

  const loadPlantilla = async () => {
    try {
      const raw = await AsyncStorage.getItem(PLANTILLA_KEY);
      const activa = await AsyncStorage.getItem(PLANTILLA_ACTIVA_KEY);
      if (raw) {
        setPlantilla(JSON.parse(raw));
        setPlantillaActiva(activa === 'true');
      }
    } catch {}
  };

  const openPlantillaModal = () => {
    if (plantilla) {
      // Editar: pre-cargar campos con datos actuales
      setPSedeReg(plantilla.sede_reg || '');
      setPSedeJurisId(plantilla.sede_juris_id || '');
      setPSedeJurisNombre(plantilla.sede_juris || '');
      setPLocal(plantilla.local || '');
      setPAula(plantilla.aula?.toString() || '');
      setPCargoId(plantilla.cargo_id?.toString() || '');
      setPTipo(plantilla.tipo_postulante_id || '1');
      setPTurno(plantilla.turno || 'DIA');
      setPHora(plantilla.hora_ingreso || '07:00');
    } else {
      // Crear: limpiar campos
      setPSedeReg(''); setPSedeJurisId(''); setPSedeJurisNombre('');
      setPLocal(''); setPAula(''); setPCargoId('');
      setPTipo('1'); setPTurno('DIA'); setPHora('07:00');
    }
    setPlantillaModalVisible(true);
  };

  const handleSavePlantilla = async () => {
    if (!pSedeReg || !pSedeJurisId || !pLocal || !pAula || !pCargoId) {
      Alert.alert('Error', 'Completa todos los campos de la plantilla');
      return;
    }
    if (isNaN(parseInt(pAula)) || parseInt(pAula) < 1 || parseInt(pAula) > 20) {
      Alert.alert('Error', 'El aula debe ser un número entre 1 y 20');
      return;
    }
    const nueva = {
      sede_reg: pSedeReg,
      sede_juris_id: pSedeJurisId,
      sede_juris: pSedeJurisNombre,
      local: pLocal,
      aula: pAula,
      cargo_id: pCargoId,
      tipo_postulante_id: pTipo,
      turno: pTurno,
      hora_ingreso: pHora,
    };
    await AsyncStorage.setItem(PLANTILLA_KEY, JSON.stringify(nueva));
    if (!plantilla) {
      // Primera vez: activar por defecto
      await AsyncStorage.setItem(PLANTILLA_ACTIVA_KEY, 'true');
      setPlantillaActiva(true);
    }
    setPlantilla(nueva);
    setPlantillaModalVisible(false);
    Alert.alert('Plantilla guardada', 'Los campos de registro se pre-cargarán con esta plantilla cuando esté habilitada.');
  };

  const handleTogglePlantilla = async (val) => {
    setPlantillaActiva(val);
    await AsyncStorage.setItem(PLANTILLA_ACTIVA_KEY, val ? 'true' : 'false');
  };

  // ─── OPCIONES PARA DROPDOWNS DE PLANTILLA ─────────────────────────────────────
  const regOptionsP = sedesRegionales.map(r => ({ value: r.nombre, label: r.nombre }));
  const jurisOptionsP = filteredJurisP.map(j => ({ value: j.id, label: j.nombre }));
  const cargoOptionsP = cargos.map(c => ({ value: c.id.toString(), label: c.nombre }));
  const horariosP = pTurno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;
  const horarioOptionsP = horariosP.map(h => ({ value: h, label: h }));

  const cargoSelectedP = cargos.find(c => c.id.toString() === pCargoId);

  // ─── RESUMEN DE PLANTILLA ─────────────────────────────────────────────────────
  const resumenPlantilla = plantilla
    ? `${plantilla.sede_reg?.toUpperCase()} • ${plantilla.sede_juris?.toUpperCase()}`
    : 'SIN PLANTILLA';

  if (loading && cargos.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#334155" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* ── CARGOS Y METAS ── */}
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>CARGOS Y METAS</Text>
          <Button icon="plus" mode="contained" buttonColor="#334155" onPress={openCreateCargo}>
            NUEVO
          </Button>
        </View>

        {cargos.map((cargo) => (
          <Surface key={cargo.id} style={styles.cargoCard} elevation={1}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cargoName}>{cargo.nombre}</Text>
              <Text style={styles.cargoMeta}>Meta de Vacantes: {cargo.meta}</Text>
            </View>
            <IconButton icon="pencil" iconColor="#334155" onPress={() => openEditCargo(cargo)} />
          </Surface>
        ))}

        {/* ── PLANTILLA DE REGISTRO ── */}
        <View style={[styles.headerRow, { marginTop: 28 }]}>
          <Text style={styles.sectionTitle}>PLANTILLA DE REGISTRO</Text>
        </View>

        <Surface style={styles.plantillaCard} elevation={1}>
          {/* Resumen + botón crear/editar */}
          <View style={styles.plantillaTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.plantillaLabel}>PLANTILLA ACTUAL</Text>
              <Text style={styles.plantillaResumen} numberOfLines={2}>{resumenPlantilla}</Text>
              {plantilla && (
                <Text style={styles.plantillaDetalle}>
                  {plantilla.local}  •  Aula {plantilla.aula}  •  {plantilla.turno}  •  {plantilla.hora_ingreso}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.plantillaEditBtn}
              onPress={openPlantillaModal}
            >
              <Text style={styles.plantillaEditBtnText}>
                {plantilla ? '✎ EDITAR' : '+ CREAR'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Toggle habilitado/inhabilitado */}
          {plantilla && (
            <View style={styles.plantillaToggleRow}>
              <View style={[styles.plantillaBadge, { backgroundColor: plantillaActiva ? '#D1FAE5' : '#F1F5F9', borderColor: plantillaActiva ? '#34D399' : '#CBD5E1' }]}>
                <View style={[styles.plantillaDot, { backgroundColor: plantillaActiva ? '#10B981' : '#94A3B8' }]} />
                <Text style={[styles.plantillaBadgeText, { color: plantillaActiva ? '#065F46' : '#64748B' }]}>
                  {plantillaActiva ? 'HABILITADO' : 'INHABILITADO'}
                </Text>
              </View>
              <Switch
                value={plantillaActiva}
                onValueChange={handleTogglePlantilla}
                trackColor={{ false: '#CBD5E1', true: '#6EE7B7' }}
                thumbColor={plantillaActiva ? '#10B981' : '#94A3B8'}
              />
            </View>
          )}
        </Surface>

      </ScrollView>

      {/* ── MODAL CARGO ── */}
      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>
            {modalMode === 'create' ? 'NUEVO CARGO' : 'EDITAR META DE CARGO'}
          </Text>
          <TextInput
            label="NOMBRE DEL CARGO"
            value={nombre}
            onChangeText={setNombre}
            mode="outlined"
            style={styles.input}
            textColor="#0F172A"
            disabled={modalMode === 'edit'}
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
            theme={{ colors: { outlineVariant: '#E2E8F0' } }}
          />
          <TextInput
            label="LIMITE MAXIMO DE PERSONAS (META)"
            value={meta}
            onChangeText={(t) => setMeta(t.replace(/[^0-9]/g, ''))}
            mode="outlined"
            style={styles.input}
            keyboardType="numeric"
            textColor="#0F172A"
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
            theme={{ colors: { outlineVariant: '#E2E8F0' } }}
          />
          <View style={styles.modalActions}>
            <Button textColor="#64748B" labelStyle={{ fontWeight: '900' }} onPress={() => setModalVisible(false)}>CANCELAR</Button>
            <TouchableOpacity
              onPress={handleSaveCargo}
              style={{ borderWidth: 2.5, borderColor: COLORS.blue, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#FFF' }}
            >
              <Text style={{ color: COLORS.blue, fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>GUARDAR</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      </Portal>

      {/* ── MODAL PLANTILLA ── */}
      <Portal>
        <Modal
          visible={plantillaModalVisible}
          onDismiss={() => setPlantillaModalVisible(false)}
          contentContainerStyle={styles.plantillaModalContent}
        >
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>
              {plantilla ? '✎ EDITAR PLANTILLA' : '+ CREAR PLANTILLA'}
            </Text>
            <Text style={styles.plantillaModalSubtitle}>
              Los valores aquí definidos se pre-cargarán automáticamente al registrar un nuevo postulante.
            </Text>

            <Text style={styles.fieldLabel}>SEDE REGIONAL</Text>
            <DropdownModal
              label="Sede Regional"
              value={pSedeReg}
              displayText={pSedeReg || 'Seleccione Sede Regional'}
              options={regOptionsP}
              onSelect={(val) => { setPSedeReg(val); setPSedeJurisId(''); setPSedeJurisNombre(''); }}
              activeColor="#334155"
              style={styles.dropdownField}
            />

            <Text style={styles.fieldLabel}>SEDE JURISDICCIONAL</Text>
            <DropdownModal
              label="Sede Jurisdiccional"
              value={pSedeJurisId}
              displayText={pSedeJurisNombre || 'Seleccione Sede Jurisdiccional'}
              options={jurisOptionsP}
              onSelect={(val) => {
                const j = filteredJurisP.find(f => f.id === val);
                setPSedeJurisId(val);
                setPSedeJurisNombre(j ? j.nombre : '');
              }}
              activeColor="#334155"
              style={styles.dropdownField}
            />

            <Text style={styles.fieldLabel}>LOCAL</Text>
            <TextInput
              label="Dirección del Local"
              value={pLocal}
              onChangeText={(t) => setPLocal(t.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s.,#\-]/g, ''))}
              mode="outlined"
              style={styles.inputField}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
              placeholder="Ej: JR. AMAZONAS 1133"
            />

            <Text style={styles.fieldLabel}>AULA (1 - 20)</Text>
            <TextInput
              label="Número de Aula"
              value={pAula}
              onChangeText={(t) => setPAula(t.replace(/[^0-9]/g, ''))}
              mode="outlined"
              keyboardType="numeric"
              maxLength={2}
              style={styles.inputField}
              textColor="#0F172A"
              activeOutlineColor="#334155"
              outlineColor="#E2E8F0"
            />

            <Text style={styles.fieldLabel}>CARGO</Text>
            <DropdownModal
              label="Cargo"
              value={pCargoId}
              displayText={cargoSelectedP?.nombre || 'Seleccione Cargo'}
              options={cargoOptionsP}
              onSelect={setPCargoId}
              activeColor="#334155"
              style={styles.dropdownField}
            />

            <Text style={styles.fieldLabel}>TIPO DE POSTULANTE</Text>
            <View style={styles.segmentRow}>
              {['1', '2'].map((v, i) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.segBtn, pTipo === v && styles.segBtnActive, i === 0 && { borderRightWidth: 0, borderRadius: 6, borderTopRightRadius: 0, borderBottomRightRadius: 0 }, i === 1 && { borderRadius: 6, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                  onPress={() => setPTipo(v)}
                >
                  <Text style={[styles.segBtnText, pTipo === v && styles.segBtnTextActive]}>
                    {v === '1' ? 'Titular' : 'Reserva'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>TURNO</Text>
            <View style={styles.segmentRow}>
              {['DIA', 'TARDE'].map((v, i) => (
                <TouchableOpacity
                  key={v}
                  style={[styles.segBtn, pTurno === v && styles.segBtnActive, i === 0 && { borderRightWidth: 0, borderRadius: 6, borderTopRightRadius: 0, borderBottomRightRadius: 0 }, i === 1 && { borderRadius: 6, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]}
                  onPress={() => setPTurno(v)}
                >
                  <Text style={[styles.segBtnText, pTurno === v && styles.segBtnTextActive]}>
                    {v === 'DIA' ? '☀ Día' : '🌙 Tarde'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>HORA DE INGRESO PROGRAMADA</Text>
            <DropdownModal
              label="Hora de Ingreso"
              value={pHora}
              displayText={pHora}
              options={horarioOptionsP}
              onSelect={setPHora}
              activeColor="#334155"
              style={styles.dropdownField}
            />

            <View style={[styles.modalActions, { marginTop: 16 }]}>
              <Button textColor="#64748B" labelStyle={{ fontWeight: '900' }} onPress={() => setPlantillaModalVisible(false)}>
                CANCELAR
              </Button>
              <TouchableOpacity
                onPress={handleSavePlantilla}
                style={{ borderWidth: 2.5, borderColor: '#10B981', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#ECFDF5' }}
              >
                <Text style={{ color: '#065F46', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 }}>GUARDAR PLANTILLA</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    paddingLeft: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
    letterSpacing: 0.5,
  },
  cargoCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 6,
    borderLeftColor: COLORS.blue,
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 2.5,
  },
  cargoName: { color: '#0F172A', fontWeight: 'bold', fontSize: 16 },
  cargoMeta: { color: '#64748B', fontSize: 12, marginTop: 5 },

  // Plantilla card
  plantillaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderLeftWidth: 6,
    borderLeftColor: '#10B981',
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  plantillaTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  plantillaLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  plantillaResumen: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 14,
    lineHeight: 20,
  },
  plantillaDetalle: {
    color: '#64748B',
    fontSize: 11,
    marginTop: 4,
  },
  plantillaEditBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    alignSelf: 'flex-start',
    marginLeft: 10,
  },
  plantillaEditBtnText: {
    color: '#1D4ED8',
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  plantillaToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
    marginTop: 4,
  },
  plantillaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    gap: 6,
  },
  plantillaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  plantillaBadgeText: {
    fontWeight: '900',
    fontSize: 12,
    letterSpacing: 0.5,
  },

  // Modal cargo
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  // Modal plantilla
  plantillaModalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: '90%',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  plantillaModalSubtitle: {
    color: '#64748B',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 17,
  },
  fieldLabel: {
    color: '#475569',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
    marginBottom: 5,
    marginTop: 10,
  },
  inputField: {
    backgroundColor: '#F9FAFB',
    marginBottom: 2,
  },
  dropdownField: {
    marginBottom: 4,
  },
  segmentRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  segBtnActive: {
    backgroundColor: '#334155',
    borderColor: '#334155',
  },
  segBtnText: {
    color: '#64748B',
    fontWeight: '700',
    fontSize: 13,
  },
  segBtnTextActive: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F9FAFB',
    marginBottom: 15,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 10,
  },
});

export default ConfigScreen;
