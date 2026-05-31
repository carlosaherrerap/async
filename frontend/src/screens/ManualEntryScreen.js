import React, { useState } from 'react';
import { View, StyleSheet, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Surface } from 'react-native-paper';
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
    try {
      const response = await fetch('http://192.168.18.9:3001/api/attendance/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dni, observaciones: obs }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setWorkerData(data);
        setShowModal(true);
      } else {
        Alert.alert('No encontrado', data.message);
      }
    } catch (error) {
      Alert.alert('Error', 'Hubo un problema con la red');
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
