import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, MD3DarkTheme, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View } from 'react-native';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ManualEntryScreen from './src/screens/ManualEntryScreen';
import AbsenteesScreen from './src/screens/AbsenteesScreen';
import PersonalListScreen from './src/screens/PersonalListScreen';
import AttendanceControlScreen from './src/screens/AttendanceControlScreen';
import RulesScreen from './src/screens/RulesScreen';
import ConfigScreen from './src/screens/ConfigScreen';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [userToken, setUserToken] = useState(null);

  useEffect(() => {
    const checkToken = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        setUserToken(token);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    checkToken();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#33d9b2" />
      </View>
    );
  }

  return (
    <PaperProvider theme={MD3DarkTheme}>
      <NavigationContainer>
        <Stack.Navigator 
          initialRouteName={userToken ? "Home" : "Login"}
          screenOptions={{
            headerStyle: { backgroundColor: '#121212' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: 'bold' },
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'Marcación DNI' }} />
          <Stack.Screen name="Manual" component={ManualEntryScreen} options={{ title: 'Ingreso Manual' }} />
          <Stack.Screen name="Absentees" component={AbsenteesScreen} options={{ title: 'Faltas' }} />
          <Stack.Screen name="PersonalList" component={PersonalListScreen} options={{ title: 'Lista de Personal' }} />
          <Stack.Screen name="AttendanceControl" component={AttendanceControlScreen} options={{ title: 'Control de Asistencia' }} />
          <Stack.Screen name="Rules" component={RulesScreen} options={{ title: 'Reglas de Asistencia' }} />
          <Stack.Screen name="Config" component={ConfigScreen} options={{ title: 'Configuración' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
