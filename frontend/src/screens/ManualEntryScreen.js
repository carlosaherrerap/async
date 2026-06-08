import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Surface } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AttendanceModal from '../components/AttendanceModal';

const ManualEntryScreen = () => {
  const [dni, setDni] = useState('');
  const [obs, setObs] = useState('');
  const [loading, setLoading] = useState(false);
  const [workerData, setWorkerData] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handleConsultar = async () => {
    if (dni.length < 8) {
      Alert.alert('Error', 'Ingresa un DNI válido');
      return;
    }

    setLoading(true);
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        const result = await global.dbHelper.registerAttendanceOffline(dni, obs);
        const formattedData = {
          worker: {
            dni: dni,
            nombre: result.worker.nombre,
            puesto: result.worker.puesto,
            area: result.worker.area,
            turno: result.worker.turno,
            hora_ingreso: result.worker.hora_ingreso
          },
          status: 'entered',
          attendance: result.record
        };
        setWorkerData(formattedData);
        setShowModal(true);
      } catch (error) {
        Alert.alert('Error', error.message || 'Error al registrar ingreso offline');
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('https://backend-6oio.onrender.com/api/attendance/register', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ dni, observaciones: obs }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        try {
          const db = global.dbHelper.db;
          if (db && data.record) {
            const rec = data.record;
            await db.runAsync(
              'INSERT OR REPLACE INTO asistencias (id, principal_id, estado, fecha_hora, observaciones) VALUES (?, ?, ?, ?, ?)',
              [rec.id, rec.principal_id, rec.estado, rec.fecha_hora, rec.observaciones]
            );
          }
        } catch (dbErr) {
          console.error('Failed to update local db after online registration:', dbErr);
        }

        const formattedData = {
          worker: {
            dni: dni,
            nombre: data.worker.nombre,
            puesto: data.worker.puesto,
            area: data.worker.area,
            turno: data.worker.turno,
            hora_ingreso: data.worker.hora_ingreso
          },
          status: 'entered',
          attendance: data.record
        };
        setWorkerData(formattedData);
        setShowModal(true);
      } else {
        Alert.alert('No encontrado', data.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Hubo un problema de conexion. ¿Desea registrar de forma local/offline?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Registrar Local',
          onPress: async () => {
            try {
              setLoading(true);
              const result = await global.dbHelper.registerAttendanceOffline(dni, obs);
              const formattedData = {
                worker: {
                  dni: dni,
                  nombre: result.worker.nombre,
                  puesto: result.worker.puesto,
                  area: result.worker.area,
                  turno: result.worker.turno,
                  hora_ingreso: result.worker.hora_ingreso
                },
                status: 'entered',
                attendance: result.record
              };
              setWorkerData(formattedData);
              setShowModal(true);
            } catch (error) {
              Alert.alert('Error', error.message || 'Error al registrar ingreso offline');
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

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Surface style={styles.card} elevation={1}>
        <Text style={styles.title}>Registro Manual</Text>
        
        <TextInput
          label="Número de DNI"
          value={dni}
          onChangeText={setDni}
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
          outlineColor="#E2E8F0"
          activeOutlineColor="#334155"
          textColor="#0F172A"
        />

        <TextInput
          label="Observaciones (Opcional)"
          value={obs}
          onChangeText={setObs}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          outlineColor="#E2E8F0"
          activeOutlineColor="#334155"
          textColor="#0F172A"
        />

        <Button 
          mode="contained" 
          onPress={handleConsultar} 
          loading={loading}
          disabled={loading}
          style={styles.button}
          buttonColor="#334155"
        >
          Consultar y Marcar
        </Button>
      </Surface>

      <AttendanceModal 
        visible={showModal} 
        data={workerData} 
        onClose={() => setShowModal(false)} 
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 25,
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
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    height: 50,
    justifyContent: 'center',
    borderRadius: 6,
  }
});

export default ManualEntryScreen;
