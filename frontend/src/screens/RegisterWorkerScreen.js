import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Surface, Text, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DropdownModal from '../components/DropdownModal';
import { API_URL } from '../config';

const HORARIOS_DIA   = ['07:00', '08:00', '09:00', '10:00'];
const HORARIOS_TARDE = ['12:00', '13:00', '14:00', '15:00', '16:00'];
const PLANTILLA_KEY = 'plantilla_registro';
const PLANTILLA_ACTIVA_KEY = 'plantilla_activa';

// ─── Helpers de validación ────────────────────────────────────────────────────
const soloNumeros    = (t) => t.replace(/[^0-9]/g, '');
const soloLetras     = (t) => t.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '').toUpperCase();
const alfanumerico   = (t) => t.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑüÜ\s.,#\-]/g, '').toUpperCase();

const RegisterWorkerScreen = ({ route, navigation }) => {
  const initialDni = route.params?.dni || '';

  const [formData, setFormData] = useState({
    dni: initialDni,
    nombres: '',
    ape_pat: '',
    ape_mat: '',
    sede_reg: '',
    sede_juris: '',
    sede_juris_id: '',
    local: '',
    aula: '',
    cargo_id: '',
    tipo_postulante_id: '1',
    turno: 'DIA',
    hora_ingreso: '08:00',
  });

  const [cargosList, setCargosList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingCargos, setFetchingCargos] = useState(true);

  const horariosDisponibles = formData.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;

  const [userRole, setUserRole] = useState('');
  const [sedesRegionales, setSedesRegionales] = useState([]);
  const [sedesJurisdiccionales, setSedesJurisdiccionales] = useState([]);
  const [filteredJuris, setFilteredJuris] = useState([]);

  const loadSedes = async () => {
    try {
      const db = global.dbHelper.db;
      if (db) {
        const regRows = await db.getAllAsync('SELECT id, nombre FROM sede_regional ORDER BY nombre ASC');
        const jurRows = await db.getAllAsync('SELECT id, nombre, sede_regional_id, codigo_juris FROM sede_juris ORDER BY nombre ASC');
        setSedesRegionales(regRows);
        setSedesJurisdiccionales(jurRows);
        return { regRows, jurRows };
      }
    } catch (e) {
      console.error('Error loading sedes from SQLite:', e);
    }
    return { regRows: [], jurRows: [] };
  };

  useEffect(() => {
    const loadUserRoleAndSedes = async () => {
      const { regRows } = await loadSedes();
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const user = JSON.parse(userData);
          setUserRole(user.rol);
          const isSU = user.rol?.toLowerCase() === 'su' || user.rol?.toLowerCase() === 'admin';
          let sedePreset = '';
          if (!isSU) {
            const matchedReg = regRows.find(r => r.id === user.rol);
            if (matchedReg) sedePreset = matchedReg.nombre;
          }

          // Intentar cargar plantilla activa
          try {
            const plantillaRaw = await AsyncStorage.getItem(PLANTILLA_KEY);
            const plantillaActiva = await AsyncStorage.getItem(PLANTILLA_ACTIVA_KEY);
            if (plantillaRaw && plantillaActiva === 'true') {
              const p = JSON.parse(plantillaRaw);
              // Si el usuario no es SU/admin, usar su sede en lugar de la de la plantilla
              setFormData(prev => ({
                ...prev,
                sede_reg: isSU ? (p.sede_reg || sedePreset) : (sedePreset || p.sede_reg || ''),
                sede_juris_id: isSU ? (p.sede_juris_id || '') : '',
                sede_juris: isSU ? (p.sede_juris || '') : '',
                local: p.local || '',
                aula: p.aula?.toString() || '',
                cargo_id: p.cargo_id?.toString() || '',
                tipo_postulante_id: p.tipo_postulante_id || '1',
                turno: p.turno || 'DIA',
                hora_ingreso: p.hora_ingreso || '08:00',
              }));
              console.log('[PLANTILLA] Plantilla cargada en el formulario.');
              return;
            }
          } catch (pErr) {
            console.error('[PLANTILLA] Error al cargar plantilla:', pErr);
          }

          // Sin plantilla activa: solo pre-cargar sede
          if (sedePreset) setFormData(prev => ({ ...prev, sede_reg: sedePreset }));
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadUserRoleAndSedes();
    fetchCargos();
  }, []);

  // Filtrar jurisdicciones según la sede regional seleccionada
  useEffect(() => {
    if (formData.sede_reg) {
      const matchedReg = sedesRegionales.find(
        r => r.nombre?.toLowerCase() === formData.sede_reg?.toLowerCase()
      );
      if (matchedReg) {
        const filtered = sedesJurisdiccionales.filter(
          j => j.sede_regional_id === matchedReg.id
        );
        setFilteredJuris(filtered);
        // Si el sede_juris_id actual no pertenece a las jurisdicciones filtradas, resetearlo
        if (!filtered.some(f => f.id === formData.sede_juris_id)) {
          setFormData(prev => ({ ...prev, sede_juris: '', sede_juris_id: '' }));
        }
      } else {
        setFilteredJuris([]);
      }
    } else {
      setFilteredJuris([]);
    }
  }, [formData.sede_reg, sedesJurisdiccionales, sedesRegionales]);

  // Cuando cambia el turno, resetear la hora de ingreso al primer horario disponible
  useEffect(() => {
    const nuevosHorarios = formData.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;
    setFormData(prev => ({ ...prev, hora_ingreso: nuevosHorarios[0] }));
  }, [formData.turno]);

  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        const localCargos = await global.dbHelper.getCargos();
        setCargosList(localCargos);
        if (localCargos.length > 0) {
          setFormData(prev => ({ ...prev, cargo_id: localCargos[0].id.toString() }));
        }
        setFetchingCargos(false);
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/configuracion/cargos`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCargosList(data);
        if (data.length > 0) {
          setFormData(prev => ({ ...prev, cargo_id: data[0].id.toString() }));
        }
      }
    } catch (e) {
      console.error(e);
      const localCargos = await global.dbHelper.getCargos();
      setCargosList(localCargos);
      if (localCargos.length > 0) {
        setFormData(prev => ({ ...prev, cargo_id: localCargos[0].id.toString() }));
      }
    } finally {
      setFetchingCargos(false);
    }
  };

  const handleRegister = async () => {
    if (!formData.dni || !formData.nombres || !formData.ape_pat || !formData.ape_mat || !formData.sede_juris_id || !formData.local) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';
    const matchedReg = sedesRegionales.find(r => r.nombre?.toLowerCase() === formData.sede_reg?.toLowerCase());
    if (!isSU && matchedReg && matchedReg.id !== userRole) {
      Alert.alert('Error', 'Solo se permite registrar postulantes para la sede del usuario activo');
      return;
    }

    setLoading(true);
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        const payload = {
          ...formData,
          hora_ingreso: formData.hora_ingreso + ':00',
        };
        const data = await global.dbHelper.registerWorkerOffline(payload);
        if (data.alert) {
          Alert.alert('Aviso Importante', data.alert, [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        } else {
          Alert.alert('Exito', 'Postulante registrado correctamente (Modo Offline)', [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        }
      } catch (error) {
        Alert.alert('Error', error.message || 'Error al registrar offline');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        ...formData,
        hora_ingreso: formData.hora_ingreso + ':00',
      };
      const response = await fetch(`${API_URL}/api/asistencia/registrar-postulante`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        try {
          const w = data.worker;
          const db = global.dbHelper.db;
          if (db) {
            await db.runAsync(`
              INSERT OR REPLACE INTO principal (
                id, sede_juris_id, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
              w.id, w.sede_juris_id, w.dni || w.doc_identidad, w.ape_pat, w.ape_mat, w.nombres, w.area || w.local, w.aula, w.tipo_postulante_id, w.cargo_id, w.turno, w.hora_ingreso
            ]);
          }
        } catch (dbErr) {
          console.error('Failed to update local db after online registration:', dbErr);
        }

        if (data.alert) {
          Alert.alert('Aviso Importante', data.alert, [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        } else {
          Alert.alert('Exito', 'Postulante registrado correctamente', [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        }
      } else {
        Alert.alert('Error', data.message || 'Error al registrar');
      }
    } catch (error) {
      Alert.alert('Error', 'Hubo un problema de conexion. ¿Desea registrar de forma local/offline?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar Local',
          onPress: async () => {
            try {
              setLoading(true);
              const payload = {
                ...formData,
                hora_ingreso: formData.hora_ingreso + ':00',
              };
              const data = await global.dbHelper.registerWorkerOffline(payload);
              if (data.alert) {
                Alert.alert('Aviso Importante', data.alert, [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
              } else {
                Alert.alert('Exito', 'Postulante registrado correctamente (Modo Offline)', [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
              }
            } catch (error) {
              Alert.alert('Error', error.message || 'Error al registrar offline');
            } finally {
              setLoading(false);
            }
          }
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Construir opciones desplegables a partir de la lista de cargos
  const cargoOptions = cargosList.map(c => ({
    value: c.id.toString(),
    label: c.nombre,
  }));

  const cargoSelected = cargosList.find(c => c.id.toString() === formData.cargo_id.toString());

  // Construir opciones de horario
  const horarioOptions = horariosDisponibles.map(h => ({
    value: h,
    label: h,
    icon: 'clock-outline',
  }));

  const isSU = userRole?.toLowerCase() === 'su' || userRole?.toLowerCase() === 'admin';

  const regOptions = sedesRegionales.map(r => ({
    value: r.nombre,
    label: r.nombre
  }));

  const jurisOptions = filteredJuris.map(j => ({
    value: j.id,
    label: j.nombre
  }));

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Surface style={styles.card} elevation={1}>
          <Text style={styles.title}>Nuevo Postulante</Text>

          <TextInput
            label="DNI"
            value={formData.dni}
            onChangeText={(t) => setFormData({ ...formData, dni: soloNumeros(t) })}
            mode="outlined"
            keyboardType="numeric"
            maxLength={8}
            style={styles.input}
            disabled={!!initialDni}
            textColor="#0F172A"
            outlineColor="#E2E8F0"
            activeOutlineColor="#334155"
          />
          <View style={styles.row}>
            <TextInput
              label="Ape. Paterno"
              value={formData.ape_pat}
              onChangeText={(t) => setFormData({ ...formData, ape_pat: soloLetras(t) })}
              mode="outlined"
              autoCapitalize="characters"
              style={[styles.input, { flex: 1, marginRight: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Ape. Materno"
              value={formData.ape_mat}
              onChangeText={(t) => setFormData({ ...formData, ape_mat: soloLetras(t) })}
              mode="outlined"
              autoCapitalize="characters"
              style={[styles.input, { flex: 1, marginLeft: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>
          <TextInput
            label="Nombres"
            value={formData.nombres}
            onChangeText={(t) => setFormData({ ...formData, nombres: soloLetras(t) })}
            mode="outlined"
            autoCapitalize="characters"
            style={styles.input}
            textColor="#0F172A"
            outlineColor="#E2E8F0"
            activeOutlineColor="#334155"
          />
          <Text style={styles.label}>SEDE REGIONAL:</Text>
          <DropdownModal
            label="Sede Regional"
            value={formData.sede_reg}
            displayText={formData.sede_reg || 'Seleccione Sede Regional'}
            options={regOptions}
            onSelect={(val) => setFormData({ ...formData, sede_reg: val })}
            activeColor="#334155"
            style={styles.dropdownTrigger}
            disabled={!isSU}
          />

          <Text style={styles.label}>SEDE JURISDICCIONAL:</Text>
          <DropdownModal
            label="Sede Jurisdiccional"
            value={formData.sede_juris_id}
            displayText={formData.sede_juris || 'Seleccione Sede Jurisdiccional'}
            options={jurisOptions}
            onSelect={(val) => {
              const selectedJ = filteredJuris.find(f => f.id === val);
              setFormData({ ...formData, sede_juris_id: val, sede_juris: selectedJ ? selectedJ.nombre : '' });
            }}
            activeColor="#334155"
            style={styles.dropdownTrigger}
          />
          <View style={styles.row}>
            <TextInput
              label="Local"
              value={formData.local}
              onChangeText={(t) => setFormData({ ...formData, local: alfanumerico(t) })}
              mode="outlined"
              autoCapitalize="characters"
              style={[styles.input, { flex: 2, marginRight: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Aula"
              value={formData.aula?.toString()}
              onChangeText={(t) => setFormData({ ...formData, aula: soloNumeros(t) })}
              mode="outlined"
              keyboardType="numeric"
              maxLength={2}
              placeholder="1-20"
              style={[styles.input, { flex: 1, marginLeft: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>

          {/* Menú desplegable de Cargo vía Modal */}
          <Text style={styles.label}>CARGO:</Text>
          {fetchingCargos ? (
            <ActivityIndicator color="#334155" size="small" style={{ marginVertical: 10 }} />
          ) : (
            <DropdownModal
              label="Cargo"
              value={formData.cargo_id}
              displayText={cargoSelected?.nombre || 'Seleccione Cargo'}
              options={cargoOptions}
              onSelect={(val) => setFormData({ ...formData, cargo_id: val })}
              activeColor="#334155"
              style={styles.dropdownTrigger}
            />
          )}

          {/* Tipo de Postulante */}
          <Text style={styles.label}>TIPO DE POSTULANTE:</Text>
          <SegmentedButtons
            value={formData.tipo_postulante_id}
            onValueChange={(val) => setFormData({ ...formData, tipo_postulante_id: val })}
            buttons={[
              { label: 'Titular', value: '1' },
              { label: 'Reserva', value: '2' },
            ]}
            style={styles.segmented}
            theme={{ colors: { secondaryContainer: '#334155', onSecondaryContainer: '#FFFFFF' } }}
          />

          {/* Turno */}
          <Text style={styles.label}>TURNO:</Text>
          <SegmentedButtons
            value={formData.turno}
            onValueChange={(val) => setFormData({ ...formData, turno: val })}
            buttons={[
              { label: 'Dia', value: 'DIA', icon: 'weather-sunny' },
              { label: 'Tarde', value: 'TARDE', icon: 'weather-night' },
            ]}
            style={styles.segmented}
            theme={{ colors: { secondaryContainer: '#334155', onSecondaryContainer: '#FFFFFF' } }}
          />

          {/* Menú desplegable de Hora de Ingreso vía Modal */}
          <Text style={styles.label}>HORA DE INGRESO PROGRAMADA:</Text>
          <DropdownModal
            label="Hora de Ingreso"
            value={formData.hora_ingreso}
            displayText={formData.hora_ingreso}
            options={horarioOptions}
            onSelect={(val) => setFormData({ ...formData, hora_ingreso: val })}
            activeColor="#334155"
            style={styles.dropdownTrigger}
          />

          <Button
            mode="contained"
            onPress={handleRegister}
            loading={loading}
            disabled={loading}
            style={styles.button}
            buttonColor="#334155"
          >
            Registrar Postulante
          </Button>
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  title: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
  },
  label: {
    color: '#64748B',
    marginBottom: 8,
    marginTop: 12,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 0.6,
  },
  dropdownTrigger: {
    marginBottom: 12,
  },
  segmented: {
    marginBottom: 15,
  },
  button: {
    marginTop: 20,
    height: 50,
    justifyContent: 'center',
    borderRadius: 6,
  }
});

export default RegisterWorkerScreen;
