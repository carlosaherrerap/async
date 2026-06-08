import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import { TextInput, Button, Surface, Text, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const HORARIOS_DIA = ['07:00', '08:00', '09:00', '10:00'];
const HORARIOS_TARDE = ['12:00', '13:00', '14:00', '15:00', '16:00'];

const RegisterWorkerScreen = ({ route, navigation }) => {
  const initialDni = route.params?.dni || '';

  const [formData, setFormData] = useState({
    dni: initialDni,
    nombres: '',
    ape_pat: '',
    ape_mat: '',
    sede_reg: '',
    sede_juris: '',
    local: '',
    aula: '',
    cargo_id: '',
    tipo_postulante_id: '1',
    turno: 'DIA',
    hora_ingreso: '08:00',
  });

  const [cargosList, setCargosList] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [horarioDropdownOpen, setHorarioDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingCargos, setFetchingCargos] = useState(true);

  const horariosDisponibles = formData.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;

  useEffect(() => {
    fetchCargos();
  }, []);

  // Cuando cambia el turno, resetear la hora de ingreso al primer horario disponible
  useEffect(() => {
    const nuevosHorarios = formData.turno === 'DIA' ? HORARIOS_DIA : HORARIOS_TARDE;
    setFormData(prev => ({ ...prev, hora_ingreso: nuevosHorarios[0] }));
  }, [formData.turno]);

  const fetchCargos = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch('https://backend-a484.onrender.com/api/config/cargos', {
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
    } finally {
      setFetchingCargos(false);
    }
  };

  const handleRegister = async () => {
    if (!formData.dni || !formData.nombres || !formData.ape_pat || !formData.ape_mat || !formData.sede_reg || !formData.local) {
      Alert.alert('Error', 'Por favor completa todos los campos obligatorios');
      return;
    }

    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const payload = {
        ...formData,
        hora_ingreso: formData.hora_ingreso + ':00', // Enviar como HH:MM:SS
      };
      const response = await fetch('https://backend-a484.onrender.com/api/attendance/register-worker', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.alert) {
          Alert.alert('Aviso Importante', data.alert, [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        } else {
          Alert.alert('Exito', 'Postulante registrado correctamente', [{ text: 'OK', onPress: () => navigation.navigate('Scan', { dni: formData.dni }) }]);
        }
      } else {
        Alert.alert('Error', data.message || 'Error al registrar');
      }
    } catch (error) {
      Alert.alert('Error', 'Hubo un problema de conexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Surface style={styles.card} elevation={1}>
          <Text style={styles.title}>Nuevo Postulante</Text>

          <TextInput
            label="DNI"
            value={formData.dni}
            onChangeText={(t) => setFormData({ ...formData, dni: t })}
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
              onChangeText={(t) => setFormData({ ...formData, ape_pat: t })}
              mode="outlined"
              style={[styles.input, { flex: 1, marginRight: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Ape. Materno"
              value={formData.ape_mat}
              onChangeText={(t) => setFormData({ ...formData, ape_mat: t })}
              mode="outlined"
              style={[styles.input, { flex: 1, marginLeft: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>
          <TextInput
            label="Nombres"
            value={formData.nombres}
            onChangeText={(t) => setFormData({ ...formData, nombres: t })}
            mode="outlined"
            style={styles.input}
            textColor="#0F172A"
            outlineColor="#E2E8F0"
            activeOutlineColor="#334155"
          />
          <View style={styles.row}>
            <TextInput
              label="Sede Regional"
              value={formData.sede_reg}
              onChangeText={(t) => setFormData({ ...formData, sede_reg: t })}
              mode="outlined"
              style={[styles.input, { flex: 1, marginRight: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Sede Jurisdiccional"
              value={formData.sede_juris}
              onChangeText={(t) => setFormData({ ...formData, sede_juris: t })}
              mode="outlined"
              style={[styles.input, { flex: 1, marginLeft: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>
          <View style={styles.row}>
            <TextInput
              label="Local"
              value={formData.local}
              onChangeText={(t) => setFormData({ ...formData, local: t })}
              mode="outlined"
              style={[styles.input, { flex: 2, marginRight: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Aula"
              value={formData.aula}
              onChangeText={(t) => setFormData({ ...formData, aula: t })}
              mode="outlined"
              keyboardType="numeric"
              placeholder="99"
              style={[styles.input, { flex: 1, marginLeft: 5 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>

          {/* Cargo dropdown */}
          <Text style={styles.label}>Cargo:</Text>
          {fetchingCargos ? (
            <ActivityIndicator color="#334155" size="small" style={{ marginVertical: 10 }} />
          ) : (
            <View style={{ marginBottom: 15 }}>
              <TouchableOpacity
                style={styles.dropdownHeader}
                onPress={() => { setDropdownOpen(!dropdownOpen); setHorarioDropdownOpen(false); }}
              >
                <Text style={styles.dropdownHeaderText}>
                  {cargosList.find(c => c.id.toString() === formData.cargo_id.toString())?.nombre || 'Seleccione Cargo'}
                </Text>
                <MaterialCommunityIcons name={dropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#334155" />
              </TouchableOpacity>

              {dropdownOpen && (
                <Surface style={styles.dropdownList} elevation={1}>
                  <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                    {cargosList.map(c => (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.dropdownOption,
                          formData.cargo_id.toString() === c.id.toString() && styles.dropdownOptionActive
                        ]}
                        onPress={() => {
                          setFormData({ ...formData, cargo_id: c.id.toString() });
                          setDropdownOpen(false);
                        }}
                      >
                        <Text style={{
                          color: formData.cargo_id.toString() === c.id.toString() ? '#FFFFFF' : '#0F172A',
                          fontWeight: formData.cargo_id.toString() === c.id.toString() ? 'bold' : 'normal'
                        }}>
                          {c.nombre}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </Surface>
              )}
            </View>
          )}

          {/* Tipo de Postulante */}
          <Text style={styles.label}>Tipo de Postulante:</Text>
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
          <Text style={styles.label}>Turno:</Text>
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

          {/* Hora de Ingreso dropdown */}
          <Text style={styles.label}>Hora de Ingreso Programada:</Text>
          <View style={{ marginBottom: 15 }}>
            <TouchableOpacity
              style={styles.dropdownHeader}
              onPress={() => { setHorarioDropdownOpen(!horarioDropdownOpen); setDropdownOpen(false); }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="clock-outline" size={18} color="#334155" />
                <Text style={[styles.dropdownHeaderText, { fontWeight: 'bold' }]}>
                  {formData.hora_ingreso}
                </Text>
              </View>
              <MaterialCommunityIcons name={horarioDropdownOpen ? "chevron-up" : "chevron-down"} size={20} color="#334155" />
            </TouchableOpacity>

            {horarioDropdownOpen && (
              <Surface style={styles.dropdownList} elevation={1}>
                {horariosDisponibles.map(h => (
                  <TouchableOpacity
                    key={h}
                    style={[
                      styles.dropdownOption,
                      formData.hora_ingreso === h && styles.dropdownOptionActive
                    ]}
                    onPress={() => {
                      setFormData({ ...formData, hora_ingreso: h });
                      setHorarioDropdownOpen(false);
                    }}
                  >
                    <Text style={{
                      color: formData.hora_ingreso === h ? '#FFFFFF' : '#0F172A',
                      fontWeight: formData.hora_ingreso === h ? 'bold' : 'normal'
                    }}>
                      {h}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Surface>
            )}
          </View>

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
  scrollContent: { padding: 20 },
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
    marginTop: 5,
    fontWeight: 'bold',
    fontSize: 12,
  },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    backgroundColor: '#F9FAFB',
    height: 50,
  },
  dropdownHeaderText: {
    color: '#0F172A',
    fontSize: 14,
  },
  dropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    marginTop: 5,
    maxHeight: 200,
    overflow: 'hidden',
  },
  dropdownOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dropdownOptionActive: {
    backgroundColor: '#334155',
  },
  segmented: {
    marginBottom: 15,
  },
  button: {
    marginTop: 15,
    height: 50,
    justifyContent: 'center',
    borderRadius: 6,
  }
});

export default RegisterWorkerScreen;
