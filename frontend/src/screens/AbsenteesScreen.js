import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text } from 'react-native';
import { List, Avatar, Surface, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AbsenteesScreen = ({ navigation }) => {
  const [absentees, setAbsentees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAbsentees();
  }, []);

  const fetchAbsentees = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch('http://192.168.18.9:3001/api/attendance/absentees', {
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
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator animating={true} color="#ff5252" size="large" />
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
                left={props => <Avatar.Text {...props} label={item.nombres[0]} size={40} style={{ backgroundColor: '#ff5252' }} />}
                titleStyle={{ color: '#fff', fontWeight: 'bold' }}
                descriptionStyle={{ color: '#aaa' }}
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
    backgroundColor: '#000',
    padding: 20,
  },
  header: {
    color: '#ff5252',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#aaa',
    fontSize: 16,
    textAlign: 'center',
  },
  itemCard: {
    backgroundColor: '#1e1e1e',
    borderRadius: 15,
    overflow: 'hidden',
  }
});

export default AbsenteesScreen;
