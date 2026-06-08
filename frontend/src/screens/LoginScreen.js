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
      const response = await fetch('https://backend-6oio.onrender.com/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('userToken', data.token);
        await AsyncStorage.setItem('userData', JSON.stringify(data.user));
        
        try {
          const syncRes = await fetch('https://backend-6oio.onrender.com/api/attendance/sync-pull', {
            headers: { 'Authorization': `Bearer ${data.token}` }
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            await global.dbHelper.clearAndPopulate(syncData.cargos, syncData.workers, syncData.asistencias);
          } else {
            console.error('Error in sync-pull during login:', syncRes.status);
          }
        } catch (syncErr) {
          console.error('Network error during sync-pull:', syncErr);
        }

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
      <View style={styles.content}>
        <Image 
          source={require('../../assets/icon.png')} 
          style={styles.logo} 
          resizeMode="contain" 
        />
        <Text style={styles.title}>Evaluación Nacional de Logros de Aprendizaje de Estudiantes (ENLA-2026)</Text>
        
        <Surface style={styles.card} elevation={1}>

          <TextInput
            label="Usuario"
            value={username}
            onChangeText={setUsername}
            mode="outlined"
            style={styles.input}
            autoCapitalize="none"
            textColor="#0F172A"
            outlineColor="#E2E8F0"
            activeOutlineColor="#334155"
          />

          <TextInput
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            mode="outlined"
            secureTextEntry
            style={styles.input}
            textColor="#0F172A"
            outlineColor="#E2E8F0"
            activeOutlineColor="#334155"
          />

          <Button 
            mode="contained" 
            onPress={handleLogin} 
            loading={loading}
            disabled={loading}
            style={styles.button}
            buttonColor="#334155"
          >
            Iniciar Sesión
          </Button>
        </Surface>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 15,
    color: '#0F172A',
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 30,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    lineHeight: 22,
  },
  card: {
    padding: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subtitle: {
    color: '#64748B',
    marginBottom: 25,
    fontSize: 13,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    backgroundColor: '#F9FAFB',
    marginBottom: 15,
  },
  button: {
    width: '100%',
    marginTop: 15,
    height: 52,
    justifyContent: 'center',
    borderRadius: 6,
  }
});

export default LoginScreen;
