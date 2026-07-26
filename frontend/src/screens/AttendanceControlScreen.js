import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated, TextInput, FlatList } from 'react-native';
import { Text, Surface, ActivityIndicator, Portal, Modal, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, TIPO_CONFIG } from '../theme/colors';
import DropdownModal from '../components/DropdownModal';
import { API_URL } from '../config';

const { width } = Dimensions.get('window');

// ─── Mini avatar con inicial ─────────────────────────────────────────────────
const WorkerAvatar = ({ worker }) => {
  const tipo = worker.tipo_postulante;
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
  const initial = (worker.nombres || worker.nombre || '?')[0].toUpperCase();
  return (
    <View style={[styles.avatarCircle, { backgroundColor: cfg.avatar }]}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  );
};

// ─── Badge de tipo ────────────────────────────────────────────────────────────
const TipoBadge = ({ tipo }) => {
  const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
  return (
    <View style={[styles.tipoBadge, { backgroundColor: cfg.bg, borderColor: cfg.border, borderWidth: 2 }]}>
      <MaterialCommunityIcons name={cfg.icon} size={15} color={cfg.text} />
      <Text style={[styles.tipoBadgeText, { color: cfg.text }]}>
        {(tipo || 'SIN TIPO').toUpperCase()}
      </Text>
    </View>
  );
};

// ─── Informacion de sede ─────────────────────────────────────────────────────────
const SedePill = ({ icon, label, value }) => (
  value && value.trim() ? (
    <View style={styles.sedePill}>
      <MaterialCommunityIcons name={icon} size={14} color={COLORS.blue} />
      <Text style={styles.sedePillText} numberOfLines={1}>{value.toUpperCase()}</Text>
    </View>
  ) : null
);

const screenWidth = Dimensions.get('window').width;

const CustomAnimatedChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <Text style={styles.emptyText}>No hay datos</Text>;
  }

  // Animaciones de crecimiento de barra
  const [animations, setAnimations] = useState([]);

  useEffect(() => {
    const anims = data.map(() => new Animated.Value(0));
    setAnimations(anims);

    const timingAnimations = anims.map((anim, idx) => {
      return Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        delay: idx * 100, // Efecto staggered
        useNativeDriver: false,
      });
    });

    Animated.parallel(timingAnimations).start();
  }, [data]);

  const softColors = [
    '#7DA5CE',
    '#7DCEB1',
    '#CE9E7D',
    '#9E7DCE',
    '#67A9C2',
    '#CE7D99',
  ];

  const maxVal = data.length > 0 ? Math.max(...data.map(d => d.value)) : 100;
  let scaleMax = 100;
  let gridLines = [100, 75, 50, 25, 0];

  if (maxVal > 100 && maxVal <= 150) {
    scaleMax = 150;
    gridLines = [150, 100, 50, 0];
  } else if (maxVal > 150) {
    scaleMax = Math.ceil(maxVal / 50) * 50;
    gridLines = [scaleMax, Math.round(scaleMax * 0.75), Math.round(scaleMax * 0.5), Math.round(scaleMax * 0.25), 0];
  }

  const PLOT_HEIGHT = 160;
  const HEADER_HEIGHT = 25;
  const TOTAL_HEIGHT = PLOT_HEIGHT + HEADER_HEIGHT; // 185px

  return (
    <View style={styles.chartContainer}>
      {/* Contenedor del área de trazado y líneas de cuadrícula */}
      <View style={{ height: TOTAL_HEIGHT, position: 'relative', width: '100%' }}>
        {/* Líneas de cuadrícula traseras */}
        <View style={[styles.gridLinesContainer, { top: HEADER_HEIGHT, height: PLOT_HEIGHT }]}>
          {gridLines.map((val) => {
            const bottomPercent = (val / scaleMax) * 100;
            return (
              <View
                key={val}
                style={[
                  styles.gridLineRow,
                  {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${bottomPercent}%`,
                    transform: [{ translateY: 10 }] // Centrar la línea horizontal con la etiqueta de 20px de alto
                  }
                ]}
              >
                <Text style={styles.gridLineLabel}>{val}%</Text>
                <View style={styles.gridLine} />
              </View>
            );
          })}
        </View>

        {/* Columnas con Barras */}
        <View style={[styles.barsContainer, { height: TOTAL_HEIGHT }]}>
          {data.map((item, idx) => {
            const anim = animations[idx];

            const totalValue = item.value;
            const baseValue = Math.min(totalValue, 100);
            const overflowValue = Math.max(0, totalValue - 100);

            const basePercentage = (baseValue / scaleMax) * 100;
            const overflowPercentage = (overflowValue / scaleMax) * 100;

            const baseHeight = anim
              ? anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${basePercentage}%`],
              })
              : '0%';

            const overflowHeight = anim
              ? anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${overflowPercentage}%`],
              })
              : '0%';

            const color = softColors[idx % softColors.length];

            return (
              <View key={idx} style={[styles.barColumn, { height: TOTAL_HEIGHT }]}>
                {/* Posicionar el texto arriba de la barra en el área del HEADER */}
                <Text style={styles.barValue}>{item.value.toFixed(1)}%</Text>
                <View style={[styles.barTrack, { height: PLOT_HEIGHT }]}>
                  {overflowValue > 0 && (
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          height: overflowHeight,
                          backgroundColor: color,
                          opacity: 0.45
                        }
                      ]}
                    />
                  )}
                  <Animated.View
                    style={[
                      styles.barFill,
                      {
                        height: baseHeight,
                        backgroundColor: color
                      }
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Etiquetas del eje X abajo del plot area */}
      <View style={styles.labelsContainer}>
        {data.map((item, idx) => (
          <View key={idx} style={styles.labelColumn}>
            <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const GroupedBarChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <Text style={styles.emptyText}>No hay datos</Text>;
  }

  const [animations, setAnimations] = useState([]);

  useEffect(() => {
    const anims = data.map(() => new Animated.Value(0));
    setAnimations(anims);

    const timingAnimations = anims.map((anim, idx) => {
      return Animated.timing(anim, {
        toValue: 1,
        duration: 900,
        delay: idx * 80,
        useNativeDriver: false,
      });
    });

    Animated.parallel(timingAnimations).start();
  }, [data]);

  const maxVal = Math.max(...data.map(d => d.existente), 5);
  const scaleMax = Math.ceil(maxVal / 5) * 5;
  const gridLines = [
    scaleMax,
    Math.round(scaleMax * 0.75),
    Math.round(scaleMax * 0.5),
    Math.round(scaleMax * 0.25),
    0
  ];

  const PLOT_HEIGHT = 160;
  const HEADER_HEIGHT = 25;
  const TOTAL_HEIGHT = PLOT_HEIGHT + HEADER_HEIGHT;

  return (
    <View style={styles.chartContainer}>
      <View style={{ height: TOTAL_HEIGHT, position: 'relative', width: '100%' }}>
        {/* Líneas de cuadrícula */}
        <View style={[styles.gridLinesContainer, { top: HEADER_HEIGHT, height: PLOT_HEIGHT }]}>
          {gridLines.map((val) => {
            const bottomPercent = (val / scaleMax) * 100;
            return (
              <View
                key={val}
                style={[
                  styles.gridLineRow,
                  {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: `${bottomPercent}%`,
                    transform: [{ translateY: 10 }]
                  }
                ]}
              >
                <Text style={styles.gridLineLabel}>{val}</Text>
                <View style={styles.gridLine} />
              </View>
            );
          })}
        </View>

        {/* Barras */}
        <View style={[styles.barsContainer, { height: TOTAL_HEIGHT }]}>
          {data.map((item, idx) => {
            const anim = animations[idx];

            const existentePercentage = (item.existente / scaleMax) * 100;
            const asistieronPercentage = (item.asistieron / scaleMax) * 100;

            const existenteHeight = anim
              ? anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${existentePercentage}%`],
              })
              : '0%';

            const asistieronHeight = anim
              ? anim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${asistieronPercentage}%`],
              })
              : '0%';

            return (
              <View key={idx} style={[styles.barColumn, { height: TOTAL_HEIGHT, flexDirection: 'column', justifyContent: 'flex-end' }]}>
                {/* Etiquetas de valor encima de las barras */}
                <View style={{ flexDirection: 'row', gap: 2, height: 15, marginBottom: 2 }}>
                  <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#64748B', width: 12, textAlign: 'center' }}>
                    {item.existente}
                  </Text>
                  <Text style={{ fontSize: 7, fontWeight: 'bold', color: '#1565C0', width: 12, textAlign: 'center' }}>
                    {item.asistieron}
                  </Text>
                </View>

                {/* Doble Barra */}
                <View style={{ flexDirection: 'row', gap: 2, alignItems: 'flex-end', height: PLOT_HEIGHT }}>
                  {/* Existente */}
                  <View style={[styles.groupedBarTrack, { height: PLOT_HEIGHT }]}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          height: existenteHeight,
                          backgroundColor: '#94A3B8'
                        }
                      ]}
                    />
                  </View>

                  {/* Asistieron */}
                  <View style={[styles.groupedBarTrack, { height: PLOT_HEIGHT }]}>
                    <Animated.View
                      style={[
                        styles.barFill,
                        {
                          height: asistieronHeight,
                          backgroundColor: '#1565C0'
                        }
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Etiquetas del eje X */}
      <View style={styles.labelsContainer}>
        {data.map((item, idx) => (
          <View key={idx} style={styles.labelColumn}>
            <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
          </View>
        ))}
      </View>

      {/* Leyenda */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#94A3B8' }} />
          <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#64748B' }}>EXISTENTE</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: '#1565C0' }} />
          <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1565C0' }}>ASISTIERON</Text>
        </View>
      </View>
    </View>
  );
};

const AttendanceControlScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [dailyData, setDailyData] = useState({ presentes: [], ausentes: [] });
  const [cargos, setCargos] = useState([]);

  const [activeTab, setActiveTab] = useState('RESUMEN'); // RESUMEN | REPORTE | ASISTENCIA
  // Usar timezone America/Lima explícitamente para evitar desfase UTC en el emulador
  const getLocalDateString = () => {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Lima' });
  };

  const [attendanceTab, setAttendanceTab] = useState('PRESENTES'); // PRESENTES | AUSENTES
  const [selectedDate, setSelectedDate] = useState(getLocalDateString());
  const [searchDni, setSearchDni] = useState('');

  // Filtros Asistencia Diaria
  const [filterCargo, setFilterCargo] = useState('TODOS');
  const [filterSede, setFilterSede] = useState('TODOS');
  const [filterTipo, setFilterTipo] = useState('TODOS'); // TODOS | Titular | Reserva
  const [filterTurno, setFilterTurno] = useState('TODOS'); // TODOS | 1 | 2
  const [userRole, setUserRole] = useState('');
  // Sedes regionales cargadas desde la API/SQLite (no hardcodeadas)
  const [sedesDisponibles, setSedesDisponibles] = useState([]);

  const isUserAdminOrSU = (r) => {
    if (!r) return false;
    const str = String(r).trim().toLowerCase();
    return str === 'admin' || str === 'administrador' || str === 'su' || str === 'super' || str === 'superusuario';
  };

  useEffect(() => {
    const checkRole = async () => {
      try {
        const userData = await AsyncStorage.getItem('userData');
        if (userData) {
          const rol = JSON.parse(userData).rol;
          setUserRole(rol);
          // Si el rol NO es admin ni su, forzar pestaña ASISTENCIA
          const isPrivileged = isUserAdminOrSU(rol);
          if (!isPrivileged) {
            setActiveTab('ASISTENCIA');
          }
        }
      } catch (_) {}
    };
    checkRole();
  }, []);

  // Calendario de estados
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());

  // Animaciones de carga tipo Highcharts
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(25)).current;

  useEffect(() => {
    fetchData();
    fetchCargos();
    fetchSedesRegionales();
  }, [selectedDate]);

  useEffect(() => {
    if (stats) {
      fadeAnim.setValue(0);
      slideAnim.setValue(25);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [stats]);

  const fetchData = async () => {
    setLoading(true);
    const isOnline = global.dbHelper.isOnline();
    if (!isOnline) {
      try {
        const localStats = await global.dbHelper.getStats();
        const localDaily = await global.dbHelper.getDailyAttendance(selectedDate);
        setStats(localStats);
        setDailyData(localDaily);
      } catch (e) {
        console.error('Error fetching data offline:', e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, dailyRes] = await Promise.all([
        fetch(`${API_URL}/api/asistencia/estadisticas`, { headers }),
        fetch(`${API_URL}/api/asistencia/reporte-diario?date=${selectedDate}`, { headers })
      ]);

      if (statsRes.status === 401) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        navigation.replace('Login');
        return;
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (dailyRes.ok) setDailyData(await dailyRes.json());

    } catch (e) {
      console.error('Error fetching online, falling back to SQLite:', e);
      try {
        const localStats = await global.dbHelper.getStats();
        const localDaily = await global.dbHelper.getDailyAttendance(selectedDate);
        setStats(localStats);
        setDailyData(localDaily);
      } catch (sqliteErr) {
        console.error('Error in SQLite fallback:', sqliteErr);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCargos = async () => {
    try {
      const isOnline = global.dbHelper.isOnline();
      if (!isOnline) {
        const localCargos = await global.dbHelper.getCargos();
        setCargos(localCargos);
        return;
      }
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/configuracion/cargos`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) setCargos(await res.json());
    } catch (e) {
      try {
        const localCargos = await global.dbHelper.getCargos();
        setCargos(localCargos);
      } catch (sqliteErr) { console.error('Error fetching cargos:', sqliteErr); }
    }
  };

  // Cargar sedes regionales desde la BD local (SQLite) o la API
  const fetchSedesRegionales = async () => {
    try {
      // Primero intentar desde SQLite local (siempre disponible tras sincronización)
      const db = global.dbHelper?.db;
      if (db) {
        const rows = await db.getAllAsync('SELECT id, nombre FROM sede_regional ORDER BY nombre ASC');
        if (rows && rows.length > 0) {
          setSedesDisponibles(rows.map(r => r.nombre));
          return;
        }
      }
      // Fallback: cargar desde la API
      const token = await AsyncStorage.getItem('userToken');
      const res = await fetch(`${API_URL}/api/configuracion/sedes-regionales`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSedesDisponibles((data || []).map(s => s.nombre));
      }
    } catch (e) {
      console.error('Error cargando sedes regionales:', e);
    }
  };

  const getBarChartData = () => {
    if (!stats || !stats.metasPorCargo) return [];

    return stats.metasPorCargo.map(m => {
      let shortName = m.cargo.substring(0, 5);
      if (m.cargo === 'Monitor Nacional') shortName = 'Monit';
      if (m.cargo === 'Supervisor Nacional') shortName = 'Super';
      if (m.cargo === 'Coordinador Regional') shortName = 'CoReg';
      if (m.cargo === 'Coordinador Administrativo Regional') shortName = 'CoAdm';
      if (m.cargo === 'Tecnico Administrativo Provincial') shortName = 'TecAd';

      const limitVal = parseInt(m.meta || 0);
      const registered = parseInt(m.registrados || 0);
      const percentage = limitVal > 0 ? (registered / limitVal) * 100 : 0;
      return {
        label: shortName,
        value: parseFloat(percentage.toFixed(1))
      };
    });
  };

  const isPrivilegedRole = isUserAdminOrSU(userRole);

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      {isPrivilegedRole && (
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'RESUMEN' && styles.tabActive]}
          onPress={() => setActiveTab('RESUMEN')}
        >
          <Text style={[styles.tabText, activeTab === 'RESUMEN' && styles.tabTextActive]}>RESUMEN & METAS</Text>
        </TouchableOpacity>
      )}
      {isPrivilegedRole && (
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'REPORTE' && styles.tabActive]}
          onPress={() => setActiveTab('REPORTE')}
        >
          <Text style={[styles.tabText, activeTab === 'REPORTE' && styles.tabTextActive]}>REPORTE DIARIO</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'ASISTENCIA' && styles.tabActive]}
        onPress={() => setActiveTab('ASISTENCIA')}
      >
        <Text style={[styles.tabText, activeTab === 'ASISTENCIA' && styles.tabTextActive]}>ASISTENCIA</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCalendarModal = () => {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
    const firstDayIndex = new Date(pickerYear, pickerMonth, 1).getDay();
    const startDay = (firstDayIndex === 0) ? 6 : firstDayIndex - 1; // Mon=0, Sun=6

    const cells = [];
    for (let i = 0; i < startDay; i++) {
      cells.push({ id: `pad-${i}`, val: '', empty: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ id: `day-${d}`, val: d, empty: false });
    }

    const prevMonth = () => {
      if (pickerMonth === 0) {
        setPickerMonth(11);
        setPickerYear(pickerYear - 1);
      } else {
        setPickerMonth(pickerMonth - 1);
      }
    };

    const nextMonth = () => {
      if (pickerMonth === 11) {
        setPickerMonth(0);
        setPickerYear(pickerYear + 1);
      } else {
        setPickerMonth(pickerMonth + 1);
      }
    };

    const selectDay = (dayNum) => {
      const m = (pickerMonth + 1).toString().padStart(2, '0');
      const d = dayNum.toString().padStart(2, '0');
      const dateStr = `${pickerYear}-${m}-${d}`;
      setSelectedDate(dateStr);
      setShowDatePicker(false);
    };

    return (
      <Portal>
        <Modal visible={showDatePicker} onDismiss={() => setShowDatePicker(false)} contentContainerStyle={styles.calendarModal}>
          <Text style={styles.calendarModalTitle}>SELECCIONAR FECHA</Text>
          <View style={styles.calendarHeader}>
            <TouchableOpacity onPress={prevMonth} style={styles.calendarNavBtn}>
              <MaterialCommunityIcons name="chevron-left" size={24} color="#334155" />
            </TouchableOpacity>
            <Text style={styles.calendarMonthYear}>
              {monthNames[pickerMonth]} {pickerYear}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.calendarNavBtn}>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#334155" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekdaysRow}>
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, idx) => (
              <Text key={idx} style={styles.weekdayText}>{day}</Text>
            ))}
          </View>

          <View style={styles.daysGrid}>
            {cells.map((cell, idx) => {
              const isSelected = !cell.empty &&
                selectedDate === `${pickerYear}-${(pickerMonth + 1).toString().padStart(2, '0')}-${cell.val.toString().padStart(2, '0')}`;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.dayCell,
                    cell.empty && styles.emptyCell,
                    isSelected && styles.selectedDayCell
                  ]}
                  onPress={() => !cell.empty && selectDay(cell.val)}
                  disabled={cell.empty}
                >
                  <Text style={{
                    color: isSelected ? '#FFFFFF' : (cell.empty ? 'transparent' : '#0F172A'),
                    fontWeight: isSelected ? 'bold' : 'normal',
                    fontSize: 13
                  }}>
                    {cell.val}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Button textColor="#64748B" onPress={() => setShowDatePicker(false)} style={{ marginTop: 15 }}>
            CERRAR
          </Button>
        </Modal>
      </Portal>
    );
  };

  const renderResumen = () => {
    if (!stats) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60 }}>
          <MaterialCommunityIcons name="chart-bar" size={48} color="#CBD5E1" />
          <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 14 }}>Cargando estadísticas...</Text>
        </View>
      );
    }
    const metasPorCargo = Array.isArray(stats.metasPorCargo) ? stats.metasPorCargo : [];
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.kpiContainer}>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#15803D' }]}>{stats.presentes ?? 0}</Text>
            <Text style={styles.kpiLabel}>ASISTENCIAS</Text>
          </Surface>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#B91C1C' }]}>{stats.faltas ?? 0}</Text>
            <Text style={styles.kpiLabel}>FALTAS / NO REG</Text>
          </Surface>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#F1C40F' }]}>{stats.tardanzas ?? 0}</Text>
            <Text style={styles.kpiLabel}>TARDANZAS</Text>
          </Surface>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#2563EB' }]}>{stats.temprano ?? 0}</Text>
            <Text style={styles.kpiLabel}>TEMPRANO</Text>
          </Surface>
        </View>

        <Surface style={styles.chartCard} elevation={0}>
          <Text style={styles.chartTitle}>% POSTULANTES REGISTRADOS vs META</Text>
          <CustomAnimatedChart data={getBarChartData()} />
        </Surface>

        <Surface style={styles.chartCard} elevation={0}>
          <Text style={styles.chartTitle}>METAS POR CARGO (TOTALES REGISTRADOS)</Text>
          {metasPorCargo.length === 0 ? (
            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingVertical: 12 }}>Sin datos de metas configuradas</Text>
          ) : metasPorCargo.map(m => {
            const registeredCount = parseInt(m.registrados || 0);
            const limitVal = parseInt(m.meta || 0);
            const perc = limitVal > 0 ? (registeredCount / limitVal) * 100 : 0;
            const isMetOrExceeded = perc >= 100;
            const barColor = isMetOrExceeded ? '#15803D' : '#334155';

            return (
              <View key={m.cargo} style={styles.metaRow}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: '#0F172A', fontSize: 12, fontWeight: 'bold', flex: 1 }}>{m.cargo}</Text>
                  <Text style={{
                    color: isMetOrExceeded ? '#15803D' : '#64748B',
                    fontSize: 12,
                    fontWeight: isMetOrExceeded ? 'bold' : 'normal'
                  }}>
                    {registeredCount}/{limitVal} ({perc.toFixed(1)}%)
                  </Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(perc, 100)}%`,
                      backgroundColor: barColor
                    }
                  ]} />
                </View>
              </View>
            );
          })}
        </Surface>
      </Animated.View>
    );
  };

  const renderAsistencia = () => {
    // Fecha de hoy en formato YYYY-MM-DD para comparar marcacion_2
    const todayStr = selectedDate;

    const checkTurnoMatch = (item) => {
      if (filterTurno === 'TODOS') return true;
      const condStr = String(item.condicion ?? 1).trim();
      if (filterTurno === '2') return condStr === '2';
      if (filterTurno === '1') return condStr !== '2';
      return true;
    };

    // Para condicion=2 en filtro '2 Turnos': ASISTIERON = tienen marcacion_2 válida HOY
    const hasMarcacion2Hoy = (item) => {
      const m2 = item.marcacion_2;
      return m2 && m2 !== '0' && m2 !== 'null' && m2.substring(0, 10) === todayStr;
    };

    const filteredData = {
      presentes: (() => {
        const base = [...dailyData.presentes];
        // Si filtro es 2 Turnos: incluir ausentes de 1er turno que SÍ tienen marcacion_2
        if (filterTurno === '2') {
          dailyData.ausentes.forEach(item => {
            const condStr = String(item.condicion ?? 1).trim();
            if (condStr === '2' && hasMarcacion2Hoy(item)) base.push(item);
          });
        }
        return base.filter(item => {
          const matchCargo = filterCargo === 'TODOS' || item.cargo === filterCargo;
          const sedeItem = item.sede_regional || item.sede_reg || '';
          const matchSede = filterSede === 'TODOS' || sedeItem === filterSede;
          const matchTipo = filterTipo === 'TODOS' || item.tipo_postulante === filterTipo;
          const matchDni = !searchDni.trim() || (item.dni || item.doc_identidad || '').includes(searchDni.trim());
          const matchTurno = checkTurnoMatch(item);
          // Para filtro 2 Turnos: solo los que marcaron 2do turno hoy
          if (filterTurno === '2') {
            return matchCargo && matchSede && matchTipo && matchDni && matchTurno && hasMarcacion2Hoy(item);
          }
          return matchCargo && matchSede && matchTipo && matchDni && matchTurno;
        });
      })(),
      ausentes: dailyData.ausentes.filter(item => {
        const matchCargo = filterCargo === 'TODOS' || item.cargo === filterCargo;
        const sedeItem = item.sede_regional || item.sede_reg || '';
        const matchSede = filterSede === 'TODOS' || sedeItem === filterSede;
        const matchTipo = filterTipo === 'TODOS' || item.tipo_postulante === filterTipo;
        const matchDni = !searchDni.trim() || (item.dni || item.doc_identidad || '').includes(searchDni.trim());
        const matchTurno = checkTurnoMatch(item);
        // Para filtro 2 Turnos: ausentees son condicion=2 que NO marcaron 2do turno
        if (filterTurno === '2') {
          return matchCargo && matchSede && matchTipo && matchDni && matchTurno && !hasMarcacion2Hoy(item);
        }
        return matchCargo && matchSede && matchTipo && matchDni && matchTurno;
      }),
    };

    const currentList = attendanceTab === 'PRESENTES' ? filteredData.presentes : filteredData.ausentes;

    return (
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 10 }}>
        {/* Switch TODOS / TITULAR / RESERVA */}
        <View style={styles.tipoSwitchRow}>
          {['TODOS', 'Titular', 'Reserva'].map(tipo => {
            const isActive = filterTipo === tipo;
            const color = tipo === 'Reserva' ? '#C2410C' : tipo === 'Titular' ? '#15803D' : '#334155';
            return (
              <TouchableOpacity
                key={tipo}
                style={[styles.tipoSwitchBtn2, isActive && { backgroundColor: color, borderColor: color }]}
                onPress={() => setFilterTipo(tipo)}
              >
                <Text style={[styles.tipoSwitchText2, { color: isActive ? '#FFFFFF' : '#64748B' }]}>
                  {tipo.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Filtros de Cargo y Sede — usando DropdownModal para un correcto soporte de desplazamiento */}
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <DropdownModal
              label="Cargo"
              value={filterCargo}
              displayText={filterCargo === 'TODOS' ? 'Todos los Cargos' : filterCargo}
              options={[{ value: 'TODOS', label: 'Todos los Cargos' }, ...cargos.map(c => ({ value: c.nombre, label: c.nombre }))]}
              onSelect={(val) => setFilterCargo(val)}
              activeColor="#334155"
              style={styles.filterDropdownHeader}
            />
          </View>
          {(userRole?.toLowerCase() === 'admin' || userRole?.toLowerCase() === 'su') && (
            <View style={{ flex: 1 }}>
              <DropdownModal
                label="Sede Regional"
                value={filterSede}
                displayText={filterSede === 'TODOS' ? 'Todas las sedes Regionales' : filterSede}
                options={[
                  { value: 'TODOS', label: 'Todas las sedes Regionales' },
                  ...sedesDisponibles.map(s => ({ value: s, label: s }))
                ]}
                onSelect={(val) => setFilterSede(val)}
                activeColor="#334155"
                style={styles.filterDropdownHeader}
              />
            </View>
          )}
        </View>

        {/* Filtro de Turnos (condicion) */}
        <View style={styles.filterRow}>
          <View style={{ flex: 1 }}>
            <DropdownModal
              label="Turnos"
              value={filterTurno}
              displayText={filterTurno === 'TODOS' ? 'Todos los Turnos' : filterTurno === '1' ? '1 Turno' : '2 Turnos'}
              options={[
                { value: 'TODOS', label: 'Todos los Turnos' },
                { value: '1', label: '1 Turno' },
                { value: '2', label: '2 Turnos' },
              ]}
              onSelect={(val) => setFilterTurno(val)}
              activeColor="#334155"
              style={styles.filterDropdownHeader}
            />
          </View>
        </View>

        {/* Búsqueda por DNI input */}
        <View style={styles.searchContainer}>
          <MaterialCommunityIcons name="magnify" size={20} color="#64748B" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Busqueda por DNI"
            placeholderTextColor="#94A3B8"
            value={searchDni}
            onChangeText={setSearchDni}
            keyboardType="numeric"
            maxLength={8}
          />
          {searchDni.length > 0 && (
            <TouchableOpacity onPress={() => setSearchDni('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* SubTabs */}
        <View style={styles.subTabContainer}>
          <TouchableOpacity
            style={[styles.subTabButton, attendanceTab === 'PRESENTES' && styles.subTabActive]}
            onPress={() => setAttendanceTab('PRESENTES')}
          >
            <Text style={[styles.subTabText, attendanceTab === 'PRESENTES' && styles.subTabTextActive]}>
              ASISTIERON ({filteredData.presentes.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTabButton, attendanceTab === 'AUSENTES' && styles.subTabActive]}
            onPress={() => setAttendanceTab('AUSENTES')}
          >
            <Text style={[styles.subTabText, attendanceTab === 'AUSENTES' && { color: '#B91C1C' }]}>
              NO ASISTIERON ({filteredData.ausentes.length})
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={currentList}
          keyExtractor={(item) => `${item.id}-${item.dni}`}
          renderItem={({ item }) => renderPersonItem(item)}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          contentContainerStyle={{ paddingBottom: 24, paddingTop: 6 }}
          ListEmptyComponent={() => {
            if (attendanceTab === 'PRESENTES') {
              return <Text style={styles.emptyText}>No hay registros para este día.</Text>;
            } else {
              return <Text style={styles.emptyText}>Todos asistieron o no hay personal.</Text>;
            }
          }}
        />
      </View>
    );
  };

  const renderPersonItem = (item) => {
    const isPresent = attendanceTab === 'PRESENTES';
    const statusColor = item.estado === 'P' ? '#2563EB' : (item.estado === 'T' ? '#F1C40F' : '#B91C1C');
    const statusLabel = item.estado === 'P' ? 'TEMPRANO' : 'TARDE';

    const tipo = item.tipo_postulante;
    const cfg = TIPO_CONFIG[tipo] || TIPO_CONFIG.default;
    const fullName = item.nombre || `${item.nombres || ''} ${item.ape_pat || ''} ${item.ape_mat || ''}`.trim();
    const turnoLabel = item.turno === 'DIA' ? 'DIURNO' : item.turno === 'TARDE' ? 'TARDE' : item.turno;

    const isDoubleTurno = String(item.condicion ?? 1) === '2';

    // Hora 1er turno: solo mostrar si tiene un valor real (no '0', no null)
    const horaIngreso1Raw = item.hora_ingreso;
    const horaIngreso1 = (horaIngreso1Raw && horaIngreso1Raw !== '0' && horaIngreso1Raw !== '00:00')
      ? horaIngreso1Raw.substring(0, 5)
      : null;

    // Hora 2do turno programada: solo mostrar si condicion=2 y tiene valor real
    const horaIngreso2Raw = item.hora_ingreso_2;
    const horaIngreso2 = (isDoubleTurno && horaIngreso2Raw && horaIngreso2Raw !== '0' && horaIngreso2Raw !== '00:00')
      ? horaIngreso2Raw.substring(0, 5)
      : (isDoubleTurno ? '13:00' : null);

    // Marcación real del 2do turno (si existe y es de hoy)
    const marcacion2Raw = item.marcacion_2;
    const marcacion2Valid = marcacion2Raw && marcacion2Raw !== '0' && marcacion2Raw !== 'null' &&
      marcacion2Raw.substring(0, 10) === selectedDate;
    const marcacion2Display = marcacion2Valid
      ? new Date(marcacion2Raw.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <Surface key={`${item.id}-${item.dni}`} style={[styles.card, { borderLeftColor: cfg.avatar }]} elevation={1}>
        {/* Fila de encabezado */}
        <View style={styles.cardHeader}>
          <WorkerAvatar worker={item} />
          <View style={styles.cardHeaderInfo}>
            <Text style={styles.cardName} numberOfLines={1}>{fullName.toUpperCase()}</Text>
            <Text style={styles.cardCargo} numberOfLines={1}>
              {(item.cargo || '—').toUpperCase()}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <TipoBadge tipo={tipo} />
            {isPresent && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: statusColor + '15', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                <MaterialCommunityIcons name={item.estado === 'P' ? 'clock-check' : 'clock-alert'} size={12} color={statusColor} />
                <Text style={{ color: statusColor, fontWeight: 'bold', fontSize: 10 }}>
                  {statusLabel}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.cardDivider} />

        {/* Fila de DNI + Turno + Botones Visuales de Horas de Ingreso */}
        <View style={styles.cardMeta}>
          <View style={styles.cardMetaItem}>
            <MaterialCommunityIcons name="card-account-details" size={18} color={COLORS.blue} />
            <Text style={styles.cardMetaText}>{item.dni || item.doc_identidad || '—'}</Text>
          </View>
          {item.turno ? (
            <View style={styles.cardMetaItem}>
              <MaterialCommunityIcons
                name={item.turno === 'DIA' ? 'weather-sunny' : 'weather-night'}
                size={18} color={COLORS.orange}
              />
              <Text style={styles.cardMetaText}>{turnoLabel.toUpperCase()}</Text>
            </View>
          ) : null}

          {/* Botón 1er Turno - Solo si tiene hora válida Y no es solo-tarde */}
          {horaIngreso1 && (
            <View style={[styles.cardMetaItem, styles.horaPill]}>
              <MaterialCommunityIcons name="clock-outline" size={14} color={COLORS.blue} />
              <Text style={styles.horaPillText}>{horaIngreso1}</Text>
            </View>
          )}

          {/* Botón 2do Turno programado - Solo si condicion === 2 */}
          {horaIngreso2 && (
            <View style={[styles.cardMetaItem, styles.horaPill, styles.horaPillTurno2]}>
              <MaterialCommunityIcons name="clock-fast" size={14} color="#7C3AED" />
              <Text style={[styles.horaPillText, { color: '#7C3AED' }]}>{horaIngreso2}</Text>
            </View>
          )}

          {/* Marcación real del 2do turno - Si existe y fue hoy */}
          {marcacion2Display && (
            <View style={[styles.cardMetaItem, { backgroundColor: '#D1FAE5', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}>
              <MaterialCommunityIcons name="check-circle" size={13} color="#15803D" />
              <Text style={[styles.horaPillText, { color: '#15803D', fontSize: 10 }]}>2T: {marcacion2Display}</Text>
            </View>
          )}
        </View>

        {/* Fila de Sede Regional + Sede Jurisdiccional */}
        {(item.sede_reg || item.sede_juris) ? (
          <View style={styles.sedeRow}>
            <SedePill icon="map-marker" label="REGIONAL" value={item.sede_reg} />
            {item.sede_reg && item.sede_juris ? (
              <MaterialCommunityIcons name="chevron-right" size={16} color={COLORS.subtle} />
            ) : null}
            <SedePill icon="map-marker-radius" label="JURIS." value={item.sede_juris} />
          </View>
        ) : null}

        {/* Aula + Local / Marcaciones */}
        <View style={styles.cardFooter}>
          <MaterialCommunityIcons name="office-building-marker" size={16} color={COLORS.muted} />
          <Text style={styles.cardFooterText} numberOfLines={1}>
            {[
              item.local || item.area,
              item.aula ? `AULA ${item.aula}` : 'AULA NO ASIGNADA'
            ].filter(Boolean).join(' · ').toUpperCase()}
          </Text>
          {isPresent && (
            <>
              <View style={{ width: 1.5, height: 12, backgroundColor: COLORS.border, marginHorizontal: 6 }} />
              <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.muted} />
              <Text style={styles.cardFooterText}>
                MARCA: {item.fecha_hora ? new Date(item.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
              </Text>
            </>
          )}
          {item.salida && (
            <>
              <View style={{ width: 1.5, height: 12, backgroundColor: COLORS.border, marginHorizontal: 6 }} />
              <MaterialCommunityIcons name="logout" size={16} color="#DC2626" />
              <Text style={[styles.cardFooterText, { color: '#DC2626' }]}>
                SALIDA: {new Date(item.salida).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </>
          )}
        </View>
      </Surface>
    );
  };

  const getComparativaData = () => {
    const group = {};

    cargos.forEach(c => {
      group[c.nombre] = {
        cargo: c.nombre,
        existente: 0,
        asistieron: 0,
        titulares: 0,
        reserva: 0,
        turno1: 0,
        turno2: 0,
        salidas: 0,
      };
    });

    dailyData.presentes.forEach(item => {
      const cargoName = item.cargo || '—';
      if (!group[cargoName]) {
        group[cargoName] = { cargo: cargoName, existente: 0, asistieron: 0, titulares: 0, reserva: 0, turno1: 0, turno2: 0, salidas: 0 };
      }
      group[cargoName].existente += 1;
      group[cargoName].asistieron += 1;
      if (item.tipo_postulante === 'Titular' || item.tipo_postulante_id === 1 || item.tipo_postulante_id === '1') {
        group[cargoName].titulares += 1;
      } else {
        group[cargoName].reserva += 1;
      }

      if (String(item.condicion ?? 1) === '2') {
        group[cargoName].turno2 += 1;
      } else {
        group[cargoName].turno1 += 1;
      }

      if (item.salida) {
        group[cargoName].salidas += 1;
      }
    });

    dailyData.ausentes.forEach(item => {
      const cargoName = item.cargo || '—';
      if (!group[cargoName]) {
        group[cargoName] = { cargo: cargoName, existente: 0, asistieron: 0, titulares: 0, reserva: 0, turno1: 0, turno2: 0, salidas: 0 };
      }
      group[cargoName].existente += 1;

      if (String(item.condicion ?? 1) === '2') {
        group[cargoName].turno2 += 1;
      } else {
        group[cargoName].turno1 += 1;
      }
    });

    return Object.values(group);
  };

  const getGroupedChartData = () => {
    const rawData = getComparativaData();
    return rawData.map(d => {
      let shortName = d.cargo.substring(0, 5);
      if (d.cargo === 'Monitor Nacional') shortName = 'Monit';
      if (d.cargo === 'Supervisor Nacional') shortName = 'Super';
      if (d.cargo === 'Coordinador Regional') shortName = 'CoReg';
      if (d.cargo === 'Coordinador Administrativo Regional') shortName = 'CoAdm';
      if (d.cargo === 'Tecnico Administrativo Provincial') shortName = 'TecAd';

      return {
        label: shortName,
        existente: d.existente,
        asistieron: d.asistieron
      };
    });
  };

  const renderReporteDiario = () => {
    const data = getComparativaData();
    const chartData = getGroupedChartData();

    return (
      <View style={{ flex: 1 }}>
        {/* Gráfico comparativo */}
        <Surface style={styles.chartCard} elevation={0}>
          <Text style={styles.chartTitle}>CANTIDAD EXISTENTE vs ASISTIERON</Text>
          <GroupedBarChart data={chartData} />
        </Surface>

        {/* Listado de comparaciones por cargo */}
        <View style={{ gap: 8, marginTop: 10 }}>
          {data.map((c) => {
            const formattedDate = selectedDate.split('-').reverse().join('/'); // YYYY-MM-DD a DD/MM/YYYY
            return (
              <Surface key={c.cargo} style={styles.reportCard} elevation={1}>
                <View style={styles.reportCardHeader}>
                  <View style={[styles.headerAccent, { backgroundColor: '#1565C0', marginRight: 8, height: 18 }]} />
                  <Text style={styles.reportCargoName}>{c.cargo.toUpperCase()}</Text>
                </View>
                <View style={styles.reportRow}>
                  <View style={styles.reportCol}>
                    <Text style={styles.reportLabel}>CANTIDAD EXISTENTE</Text>
                    <Text style={styles.reportValue}>{c.existente}</Text>
                    <Text style={styles.reportSubValue}>({c.turno1} de 1 turno · {c.turno2} de 2 turnos)</Text>
                  </View>
                  <View style={styles.reportCol}>
                    <Text style={styles.reportLabel}>ASISTIERON HOY ({formattedDate})</Text>
                    <Text style={[styles.reportValue, { color: '#1565C0' }]}>
                      {c.asistieron} <Text style={styles.reportSubValue}>({c.titulares} titulares + {c.reserva} reserva)</Text>
                    </Text>
                    {c.salidas > 0 && (
                      <Text style={[styles.reportSubValue, { color: '#DC2626', marginTop: 2, fontWeight: 'bold' }]}>
                        {c.salidas} salidas registradas
                      </Text>
                    )}
                  </View>
                </View>
              </Surface>
            );
          })}
        </View>
      </View>
    );
  };

  if (loading && !stats) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#334155" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Selector de fecha Global */}
      <TouchableOpacity style={styles.dateSelectorGlobal} onPress={() => setShowDatePicker(true)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <MaterialCommunityIcons name="calendar" size={24} color="#1565C0" />
          <View style={{ marginLeft: 10 }}>
            <Text style={{ color: '#64748B', fontSize: 10, fontWeight: 'bold' }}>FECHA (CLICK PARA CAMBIAR):</Text>
            <Text style={{ color: '#1565C0', fontWeight: 'bold', fontSize: 16 }}>{selectedDate}</Text>
          </View>
        </View>
        <MaterialCommunityIcons name="chevron-down" size={24} color="#1565C0" />
      </TouchableOpacity>

      {renderTabs()}
      {activeTab === 'RESUMEN' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderResumen()}
        </ScrollView>
      ) : activeTab === 'REPORTE' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {renderReporteDiario()}
        </ScrollView>
      ) : (
        renderAsistencia()
      )}
      {renderCalendarModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
  dateSelectorGlobal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 6,
    margin: 12,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scrollContent: { padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: '#334155',
  },
  tabText: { color: '#64748B', fontWeight: 'bold', fontSize: 13 },
  tabTextActive: { color: '#334155' },
  kpiContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 5 },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 6,
    alignItems: 'center',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiValue: { fontSize: 24, fontWeight: 'bold' },
  kpiLabel: { color: '#64748B', fontSize: 9, marginTop: 5, textAlign: 'center', fontWeight: 'bold' },
  chartCard: {
    backgroundColor: '#FFFFFF',
    padding: 15,
    borderRadius: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  chartTitle: { color: '#0F172A', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  metaRow: { marginBottom: 12 },
  progressBarBg: { height: 8, backgroundColor: '#E2E8F0', borderRadius: 4, marginTop: 5 },
  progressBarFill: { height: 8, borderRadius: 4 },

  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
    zIndex: 999,
    elevation: 999,
  },
  filterDropdown: {
    flex: 1,
    position: 'relative',
    zIndex: 999,
    elevation: 999,
  },
  filterDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  filterDropdownText: {
    color: '#334155',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
  },
  filterDropdownList: {
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    zIndex: 20,
    overflow: 'hidden',
  },
  filterDropdownOption: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  filterDropdownOptionActive: {
    backgroundColor: '#334155',
  },
  subTabContainer: { flexDirection: 'row', marginBottom: 12 },
  subTabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subTabActive: { backgroundColor: '#F4F6F8', borderColor: '#E2E8F0' },
  subTabText: { color: '#64748B', fontWeight: 'bold', fontSize: 12 },
  subTabTextActive: { color: '#15803D' },

  personCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyText: { color: '#64748B', textAlign: 'center', marginTop: 20 },

  tipoSwitchRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tipoSwitchBtn2: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F4F6F8',
    alignItems: 'center',
  },
  tipoSwitchText2: {
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },

  // Estilos del gráfico animado personalizado
  chartContainer: {
    height: 235,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    marginBottom: 5,
  },
  gridLinesContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 35,
  },
  gridLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 20,
  },
  gridLineLabel: {
    width: 35,
    color: '#64748B',
    fontSize: 10,
    textAlign: 'right',
    paddingRight: 8,
    fontWeight: 'bold',
  },
  gridLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#F1F5F9',
  },
  barsContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingLeft: 35,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
  },
  barValue: {
    fontSize: 9,
    fontWeight: '900',
    color: '#1E293B',
    height: 15,
    textAlign: 'center',
    marginBottom: 4,
  },
  barTrack: {
    width: 20,
    backgroundColor: '#F8FAFC',
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  labelsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingLeft: 35,
    height: 25,
    alignItems: 'center',
    marginTop: 6,
  },
  labelColumn: {
    flex: 1,
    alignItems: 'center',
  },
  barLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '900',
    textAlign: 'center',
  },

  // Estilos del calendario
  calendarModal: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    margin: 20,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarModalTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 15,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    backgroundColor: '#F4F6F8',
    borderRadius: 6,
    padding: 5,
  },
  calendarNavBtn: {
    padding: 5,
  },
  calendarMonthYear: {
    color: '#0F172A',
    fontWeight: 'bold',
    fontSize: 14,
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  weekdayText: {
    color: '#64748B',
    fontWeight: 'bold',
    fontSize: 12,
    width: 32,
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  dayCell: {
    width: (screenWidth - 100) / 7,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 18,
  },
  emptyCell: {
    backgroundColor: 'transparent',
  },
  selectedDayCell: {
    backgroundColor: '#334155',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: COLORS.blue,
    overflow: 'hidden',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 8,
  },
  cardHeaderInfo: { flex: 1 },
  cardName: {
    color: COLORS.ink, fontSize: 14, fontWeight: '900',
    letterSpacing: 0.1,
  },
  cardCargo: {
    color: COLORS.muted, fontSize: 11, fontWeight: '800',
    marginTop: 2, letterSpacing: 0.2,
  },
  cardDivider: { backgroundColor: COLORS.surface, marginBottom: 8, height: 1.5 },
  cardMeta: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 6, alignItems: 'center' },
  cardMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { color: COLORS.inkLight, fontSize: 12, fontWeight: '800' },
  horaPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  horaPillTurno2: {
    backgroundColor: '#F3E8FF',
    borderColor: '#DDD6FE',
  },
  horaPillText: {
    color: COLORS.blue,
    fontSize: 11,
    fontWeight: '900',
  },

  sedeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 6, flexWrap: 'wrap',
  },
  sedePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.blueSoft,
    borderWidth: 2, borderColor: COLORS.blueBorder,
    borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    maxWidth: width * 0.42,
  },
  sedePillText: {
    color: COLORS.blue, fontSize: 10, fontWeight: '800',
    letterSpacing: 0.2, flexShrink: 1,
  },

  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFooterText: { color: COLORS.muted, fontSize: 11, fontWeight: '800' },

  tipoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20, borderWidth: 2.5, alignSelf: 'flex-start',
  },
  tipoBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontSize: 18, fontWeight: '900' },
  reportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: '#1565C0',
    padding: 14,
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  reportCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportCargoName: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  reportCol: {
    flex: 1,
  },
  reportLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  reportValue: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
  },
  reportSubValue: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  groupedBarTrack: {
    width: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
    marginTop: 5,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    fontWeight: 'bold',
    paddingVertical: 8,
  },
});

export default AttendanceControlScreen;
