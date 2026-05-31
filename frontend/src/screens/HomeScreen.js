import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, ScrollView, RefreshControl, Dimensions } from 'react-native';
import { Surface, ActivityIndicator, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 60) / 2;

const HomeScreen = ({ navigation }) => {
  const [stats, setStats] = useState({ presentes: 0, faltas: 0, tardanzas: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userName, setUserName] = useState('');

  const fetchStats = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const userData = await AsyncStorage.getItem('userData');
      if (userData) setUserName(JSON.parse(userData).nombre);

      // Backend simulation or real fetch
      const response = await fetch('http://192.168.18.9:3001/api/attendance/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.status === 401 || response.status === 403) {
        handleLogout();
        return;
      }

      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['userToken', 'userData']);
    navigation.replace('Login');
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const MenuButton = ({ title, icon, color, onPress, fullWidth = false }) => (
    <TouchableOpacity 
      style={[styles.menuItem, fullWidth && styles.fullWidthItem]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Surface style={styles.menuSurface} elevation={1}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={icon} size={28} color="white" />
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </Surface>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#334155" />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.welcomeText}>Bienvenido de nuevo,</Text>
            <Text style={styles.userName}>{userName || 'Administrador'}</Text>
          </View>
          <IconButton 
            icon="logout-variant" 
            iconColor="#B91C1C" 
            size={28} 
            style={styles.logoutButton}
            onPress={handleLogout} 
          />
        </View>

        {/* Stats Card */}
        <Surface style={styles.statsCard} elevation={1}>
          <View style={styles.statsContent}>
            <Text style={styles.statsTitle}>Resumen de Hoy</Text>
            {loading ? (
              <ActivityIndicator animating={true} color="#334155" />
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#15803D' }]}>{stats.presentes}</Text>
                  <Text style={styles.statLabel}>Presentes</Text>
                </View>
                <View style={styles.statDivider} />
                <TouchableOpacity 
                  style={styles.statItem} 
                  onPress={() => navigation.navigate('Absentees')}
                >
                  <Text style={[styles.statValue, { color: '#B91C1C' }]}>{stats.faltas}</Text>
                  <Text style={styles.statLabel}>Faltas</Text>
                </TouchableOpacity>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#F1C40F' }]}>{stats.tardanzas}</Text>
                  <Text style={styles.statLabel}>Tardanzas</Text>
                </View>
              </View>
            )}
          </View>
        </Surface>

        <Text style={styles.sectionTitle}>Menú Principal</Text>

        <View style={styles.menuGrid}>
          <MenuButton 
            title="MARCACIÓN" 
            icon="barcode-scan" 
            color="#334155" 
            onPress={() => navigation.navigate('Scan')}
            fullWidth
          />
          <MenuButton 
            title="PERSONAL" 
            icon="account-group" 
            color="#B91C1C" 
            onPress={() => navigation.navigate('PersonalList')}
          />
          <MenuButton 
            title="ASISTENCIA" 
            icon="calendar-check" 
            color="#15803D" 
            onPress={() => navigation.navigate('AttendanceControl')}
          />
          <MenuButton 
            title="REGLAS" 
            icon="clock-edit-outline" 
            color="#F1C40F" 
            onPress={() => navigation.navigate('Rules')}
          />
          <MenuButton 
            title="CONFIG" 
            icon="cog-outline" 
            color="#7DA5CE" 
            onPress={() => navigation.navigate('Config')}
          />
        </View>

      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F6F8',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 30,
  },
  welcomeText: {
    color: '#64748B',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  userName: {
    color: '#334155',
    fontSize: 26,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
  },
  statsCard: {
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    marginBottom: 35,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  statsContent: {
    padding: 20,
  },
  statsTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E2E8F0',
  },
  statValue: {
    fontSize: 26,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '500',
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    paddingLeft: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#334155',
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  menuItem: {
    width: COLUMN_WIDTH,
    height: 130,
    borderRadius: 6,
    overflow: 'hidden',
  },
  fullWidthItem: {
    width: '100%',
    height: 110,
    marginBottom: 5,
  },
  menuSurface: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 15,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  menuTitle: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  }
});

export default HomeScreen;
