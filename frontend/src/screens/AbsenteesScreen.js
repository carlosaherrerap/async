import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text } from 'react-native';
import { List, Avatar, Surface, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

const AbsenteesScreen = ({ navigation }) => {
  const [absentees, setAbsentees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAbsentees();
  }, []);

  const fetchAbsentees = async () => {
    setLoading(true);
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        const localData = await global.dbHelper.getAbsentees();
        setAbsentees(localData);
      } catch (e) {
        console.error('Error fetching local absentees:', e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(`${API_URL}/api/asistencia/inasistencias`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.status === 401 || response.status === 403) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        navigation.replace('Login');
        return;
      }

      const data = await response.json();
      setAbsentees(data);
    } catch (error) {
      console.error('Error fetching online absentees, falling back to SQLite:', error);
      try {
        const localData = await global.dbHelper.getAbsentees();
        setAbsentees(localData);
      } catch (sqliteErr) {
        console.error('SQLite fallback error:', sqliteErr);
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator animating={true} color="#B91C1C" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Faltas de Hoy ({absentees.length})</Text>
      
      {absentees.length === 0 ? (
        <View style={styles.center}>
           <Text style={styles.emptyText}>¡Todos los trabajadores marcaron asistencia!</Text>
        </View>
      ) : (
        <FlatList
          data={absentees}
          keyExtractor={(item) => item.dni}
          renderItem={({ item }) => (
            <Surface style={styles.itemCard} elevation={1}>
              <List.Item
                title={`${item.nombres} ${item.apellidos}`}
                description={`${item.puesto} | ${item.area}`}
                left={props => <Avatar.Text {...props} label={item.nombres[0]} size={40} style={{ backgroundColor: '#B91C1C' }} />}
                titleStyle={{ color: '#0F172A', fontWeight: 'bold' }}
                descriptionStyle={{ color: '#64748B' }}
              />
            </Surface>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
    padding: 20,
  },
  header: {
    color: '#B91C1C',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#B91C1C',
    paddingLeft: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: '#DC2626', // Color rojo para inasistencias/peligro
    overflow: 'hidden',
    elevation: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.05,
    shadowRadius: 2.5,
  }
});

export default AbsenteesScreen;
