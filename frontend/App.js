import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, MD3LightTheme, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Animated } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ManualEntryScreen from './src/screens/ManualEntryScreen';
import AbsenteesScreen from './src/screens/AbsenteesScreen';
import PersonalListScreen from './src/screens/PersonalListScreen';
import AttendanceControlScreen from './src/screens/AttendanceControlScreen';
import RulesScreen from './src/screens/RulesScreen';
import ConfigScreen from './src/screens/ConfigScreen';
import RegisterWorkerScreen from './src/screens/RegisterWorkerScreen';

const Stack = createStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#334155', // HSL(215, 25%, 27%) - Azul corporativo opaco
    accent: '#B91C1C',  // HSL(0, 75%, 45%) - Rojo desaturado
    background: '#F4F6F8', // HSL(210, 20%, 98%) - Blanco frío
    surface: '#FFFFFF',
    text: '#0F172A', // HSL(222, 47%, 11%) - Azul noche profundo
  },
};

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Animación suave del logo al arrancar (Spring & Fade)
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 12,
        friction: 4,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 900,
        useNativeDriver: true,
      })
    ]).start();

    const checkToken = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        setUserToken(token);
      } catch (e) {
        console.error(e);
      } finally {
        // Retardo para apreciar la animación
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    };
    checkToken();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F4F6F8', justifyContent: 'center', alignItems: 'center' }}>
        <Animated.Image 
          source={require('./assets/ENLA.png')} 
          style={{ 
            width: 160, 
            height: 160, 
            marginBottom: 20,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }]
          }} 
          resizeMode="contain" 
        />
        <ActivityIndicator size="small" color="#334155" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName={userToken ? "Home" : "Login"}
          screenOptions={{
            headerStyle: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', elevation: 0, shadowOpacity: 0 },
            headerTintColor: '#334155',
            headerTitleStyle: { fontWeight: 'bold', fontSize: 15, color: '#0F172A' },
            cardStyle: { backgroundColor: '#F4F6F8' }
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Marcación DNI' }} />
          <Stack.Screen name="RegisterWorker" component={RegisterWorkerScreen} options={{ title: 'Registrar Personal' }} />
          <Stack.Screen name="Manual" component={ManualEntryScreen} options={{ title: 'Ingreso Manual' }} />
          <Stack.Screen name="Absentees" component={AbsenteesScreen} options={{ title: 'Faltas de Hoy' }} />
          <Stack.Screen name="PersonalList" component={PersonalListScreen} options={{ title: 'Personal' }} />
          <Stack.Screen name="AttendanceControl" component={AttendanceControlScreen} options={{ title: 'Control de Asistencia' }} />
          <Stack.Screen name="Rules" component={RulesScreen} options={{ title: 'Reglas de Asistencia' }} />
          <Stack.Screen name="Config" component={ConfigScreen} options={{ title: 'Configuración' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
