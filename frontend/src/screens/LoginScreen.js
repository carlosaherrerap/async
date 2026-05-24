import React, { useState } from 'react';
import { View, StyleSheet, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, Surface } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert('Error', 'Por favor ingresa usuario y contraseña');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://192.168.18.9:3001/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        navigation.replace('Home');
      } else {
        Alert.alert('Error', data.message || 'Credenciales inválidas');
      }
    } catch (error) {
      Alert.alert('Error de Conexión', 'No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <Surface style={styles.card} elevation={4}>
        <Text style={styles.logoText}>SCA</Text>
        <Text style={styles.subtitle}>Control de Asistencia</Text>

        <TextInput
          label="Usuario"
          value={username}
          onChangeText={setUsername}
          mode="outlined"
          style={styles.input}
          autoCapitalize="none"
          textColor="#fff"
        />

        <TextInput
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          mode="outlined"
          secureTextEntry
          style={styles.input}
          textColor="#fff"
        />

        <Button 
          mode="contained" 
          onPress={handleLogin} 
          loading={loading}
          disabled={loading}
          style={styles.button}
          buttonColor="#33d9b2"
        >
          Iniciar Sesión
        </Button>
      </Surface>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    padding: 30,
    borderRadius: 25,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#33d9b2',
  },
  subtitle: {
    color: '#aaa',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    backgroundColor: '#121212',
    marginBottom: 15,
  },
  button: {
    width: '100%',
    marginTop: 10,
    height: 50,
    justifyContent: 'center',
    borderRadius: 10,
  }
});

export default LoginScreen;
