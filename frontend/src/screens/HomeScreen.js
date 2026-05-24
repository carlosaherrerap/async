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
      <LinearGradient
        colors={[color + '44', color + '22', '#1a1a1a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <MaterialCommunityIcons name={icon} size={30} color="white" />
        </View>
        <Text style={styles.menuTitle}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#121212', '#000000']} style={styles.background} />
      
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#33d9b2" />
        }
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.welcomeText}>Bienvenido de nuevo,</Text>
            <Text style={styles.userName}>{userName || 'Administrador'}</Text>
          </View>
          <IconButton 
            icon="logout-variant" 
            iconColor="#ff5252" 
            size={28} 
            style={styles.logoutButton}
            onPress={handleLogout} 
          />
        </View>

        {/* Stats Card */}
        <Surface style={styles.statsCard} elevation={4}>
          <LinearGradient
            colors={['#1e1e1e', '#121212']}
            style={styles.statsGradient}
          >
            <Text style={styles.statsTitle}>Resumen de Hoy</Text>
            {loading ? (
              <ActivityIndicator animating={true} color="#33d9b2" />
            ) : (
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{stats.presentes}</Text>
                  <Text style={styles.statLabel}>Presentes</Text>
                </View>
                <View style={styles.statDivider} />
                <TouchableOpacity 
                  style={styles.statItem} 
                  onPress={() => navigation.navigate('Absentees')}
                >
                  <Text style={[styles.statValue, { color: '#ff5252' }]}>{stats.faltas}</Text>
                  <Text style={styles.statLabel}>Faltas</Text>
                </TouchableOpacity>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#ffb142' }]}>{stats.tardanzas}</Text>
                  <Text style={styles.statLabel}>Tardanzas</Text>
                </View>
              </View>
            )}
          </LinearGradient>
        </Surface>

        <Text style={styles.sectionTitle}>Menú Principal</Text>

        <View style={styles.menuGrid}>
          <MenuButton 
            title="MARCACIÓN" 
            icon="barcode-scan" 
            color="#33d9b2" 
            onPress={() => navigation.navigate('Scan')}
            fullWidth
          />
          <MenuButton 
            title="LISTA PERSONAL" 
            icon="account-group" 
            color="#34ace0" 
            onPress={() => navigation.navigate('PersonalList')}
          />
          <MenuButton 
            title="ASISTENCIA" 
            icon="calendar-check" 
            color="#ffb142" 
            onPress={() => navigation.navigate('AttendanceControl')}
          />
          <MenuButton 
            title="REGLAS" 
            icon="clock-edit-outline" 
            color="#ff5252" 
            onPress={() => navigation.navigate('Rules')}
          />
          <MenuButton 
            title="CONFIG" 
            icon="cog-outline" 
            color="#706fd3" 
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
    backgroundColor: '#000',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
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
    color: '#888',
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
  },
  statsCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: 35,
    borderWidth: 1,
    borderColor: '#333',
  },
  statsGradient: {
    padding: 20,
  },
  statsTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.8,
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
    backgroundColor: '#333',
  },
  statValue: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#33d9b2',
  },
  statLabel: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  menuItem: {
    width: COLUMN_WIDTH,
    height: 140,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  fullWidthItem: {
    width: '100%',
    height: 120,
    marginBottom: 5,
  },
  gradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  menuTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 1,
  },
  exportButton: {
    marginTop: 40,
    backgroundColor: '#1a1a1a',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 30,
  },
  exportText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  }
});

export default HomeScreen;
