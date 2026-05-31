import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Surface, Text, TextInput, Button, ActivityIndicator, IconButton, Portal, Modal } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const RulesScreen = () => {
  const [rules, setRules] = useState([]);
  const [cargos, setCargos] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [nombre, setNombre] = useState('');
  const [selectedDays, setSelectedDays] = useState(['L', 'M', 'X', 'J', 'V']);
  const [horaIngreso, setHoraIngreso] = useState('08:00');
  const [horaSalida, setHoraSalida] = useState('17:00');

  // Modal states
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState(null);
  const [selectedCargoId, setSelectedCargoId] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const [rulesRes, cargosRes] = await Promise.all([
        fetch('http://192.168.18.9:3001/api/rules', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('http://192.168.18.9:3001/api/config/cargos', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      if (rulesRes.ok) setRules(await rulesRes.json());
      if (cargosRes.ok) setCargos(await cargosRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleCreateRule = async () => {
    if (!nombre || !horaIngreso || !horaSalida || selectedDays.length === 0) {
      Alert.alert('Error', 'Completa todos los campos');
      return;
    }
    
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('http://192.168.18.9:3001/api/rules', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre,
          dias_labor: selectedDays.join(','),
          hora_ingreso: `${horaIngreso}:00`,
          hora_salida: `${horaSalida}:00`,
          es_predeterminado: false
        })
      });

      if (response.ok) {
        const newRule = await response.json();
        setRules([...rules, newRule]);
        setNombre('');
        setSelectedRuleId(newRule.id);
        setSelectedCargoId('');
        setModalVisible(true);
      } else {
        Alert.alert('Error', 'No se pudo crear la regla');
      }
    } catch (error) {
      Alert.alert('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyToCargo = async () => {
    if (!selectedCargoId) {
      Alert.alert('Atención', 'Selecciona un cargo');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('http://192.168.18.9:3001/api/rules/apply-cargo', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ regla_id: selectedRuleId, cargo_id: selectedCargoId })
      });

      if (response.ok) {
        Alert.alert('Éxito', 'Regla aplicada a todos los trabajadores del cargo seleccionado.');
        setModalVisible(false);
      }
    } catch (error) {
      Alert.alert('Error al aplicar regla');
    }
  };

  if (loading && rules.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#334155" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        <Surface style={styles.card} elevation={1}>
          <Text style={styles.cardTitle}>[NUEVA REGLA]</Text>
          
          <TextInput
            label="Nombre de la regla"
            value={nombre}
            onChangeText={setNombre}
            mode="outlined"
            style={styles.input}
            textColor="#0F172A"
            activeOutlineColor="#334155"
            outlineColor="#E2E8F0"
          />

          <Text style={styles.label}>DÍAS DE LABOR:</Text>
          <View style={styles.daysRow}>
            {DAYS.map(day => {
              const isSelected = selectedDays.includes(day);
              return (
                <TouchableOpacity 
                  key={day} 
                  style={[styles.dayButton, isSelected && styles.dayButtonActive]}
                  onPress={() => toggleDay(day)}
                >
                  <Text style={[styles.dayText, isSelected && styles.dayTextActive]}>{day}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>HORARIO:</Text>
          <View style={styles.timeRow}>
            <TextInput
              label="Ingreso (HH:MM)"
              value={horaIngreso}
              onChangeText={setHoraIngreso}
              mode="outlined"
              style={[styles.input, { flex: 1, marginRight: 10 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
            <TextInput
              label="Salida (HH:MM)"
              value={horaSalida}
              onChangeText={setHoraSalida}
              mode="outlined"
              style={[styles.input, { flex: 1 }]}
              textColor="#0F172A"
              outlineColor="#E2E8F0"
              activeOutlineColor="#334155"
            />
          </View>

          <Button 
            mode="contained" 
            onPress={handleCreateRule} 
            style={styles.saveButton}
            buttonColor="#334155"
          >
            GUARDAR REGLA
          </Button>
        </Surface>

        <Text style={styles.sectionTitle}>MIS REGLAS</Text>

        {rules.map((rule) => (
          <Surface key={rule.id} style={styles.ruleCard} elevation={1}>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>REGLA {rule.nombre.toUpperCase()}</Text>
              <Text style={styles.ruleSubtitle}>
                Días: [{rule.dias_labor}] HORARIO: [{rule.hora_ingreso.substring(0,5)} - {rule.hora_salida.substring(0,5)}]
              </Text>
            </View>
            {rule.es_predeterminado && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>PREDETERMINADO</Text>
              </View>
            )}
            <IconButton icon="account-multiple-plus" iconColor="#334155" onPress={() => { setSelectedRuleId(rule.id); setSelectedCargoId(''); setModalVisible(true); }} />
          </Surface>
        ))}

      </ScrollView>

      <Portal>
        <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>¿Deseas que se aplique esta regla para todo el personal de un cargo?</Text>
          
          <ScrollView style={{ maxHeight: 200, marginVertical: 15 }}>
            {cargos.map(c => (
              <TouchableOpacity 
                key={c.id} 
                style={[styles.cargoOption, selectedCargoId === c.id && styles.cargoOptionActive]}
                onPress={() => setSelectedCargoId(c.id)}
              >
                <Text style={{ color: selectedCargoId === c.id ? '#FFFFFF' : '#0F172A', fontWeight: 'bold' }}>{c.nombre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button textColor="#B91C1C" mode="outlined" style={{ borderColor: '#B91C1C', borderWidth: 1 }} onPress={() => setModalVisible(false)}>
              OMITIR / CREAR SIN CARGO
            </Button>
            <Button buttonColor="#334155" mode="contained" onPress={handleApplyToCargo}>
              APLICAR A CARGO SELECCIONADO
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  scrollContent: { padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 6,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  label: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 15,
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#F9FAFB',
    height: 45,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayButtonActive: {
    backgroundColor: '#334155',
  },
  dayText: {
    color: '#64748B',
    fontWeight: 'bold',
  },
  dayTextActive: {
    color: '#FFFFFF',
  },
  timeRow: {
    flexDirection: 'row',
  },
  saveButton: {
    marginTop: 20,
    borderRadius: 6,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    paddingLeft: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
  },
  ruleCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 6,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ruleTitle: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  ruleSubtitle: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 5,
  },
  badge: {
    backgroundColor: '#B91C1C',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginRight: 10,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  cargoOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cargoOptionActive: {
    backgroundColor: '#F4F6F8',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalActions: {
    marginTop: 20,
    gap: 10,
  }
});

export default RulesScreen;
