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
      <Surface style={styles.card} elevation={2}>
        <Text style={styles.title}>Registro Manual</Text>
        
        <TextInput
          label="Número de DNI"
          value={dni}
          onChangeText={setDni}
          mode="outlined"
          keyboardType="numeric"
          style={styles.input}
          outlineColor="#33d9b2"
          activeOutlineColor="#33d9b2"
          textColor="#fff"
        />

        <TextInput
          label="Observaciones (Opcional)"
          value={obs}
          onChangeText={setObs}
          mode="outlined"
          multiline
          numberOfLines={3}
          style={styles.input}
          outlineColor="#444"
          activeOutlineColor="#33d9b2"
          textColor="#fff"
        />

        <Button 
          mode="contained" 
          onPress={handleConsultar} 
          loading={loading}
          disabled={loading}
          style={styles.button}
          buttonColor="#33d9b2"
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
    backgroundColor: '#000',
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#1e1e1e',
    padding: 25,
    borderRadius: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#121212',
    marginBottom: 15,
  },
  button: {
    marginTop: 10,
    height: 50,
    justifyContent: 'center',
    borderRadius: 10,
  }
});

export default ManualEntryScreen;
