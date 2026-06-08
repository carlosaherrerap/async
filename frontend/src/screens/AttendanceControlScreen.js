import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { Text, Surface, ActivityIndicator, List, Avatar, Portal, Modal, Button } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
        delay: idx * 100, // Efecto staggered de Highcharts
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

  return (
    <View style={styles.chartContainer}>
      {/* Líneas de cuadrícula traseras */}
      <View style={styles.gridLinesContainer}>
        {gridLines.map((val) => (
          <View key={val} style={styles.gridLineRow}>
            <Text style={styles.gridLineLabel}>{val}%</Text>
            <View style={styles.gridLine} />
          </View>
        ))}
      </View>

      {/* Columnas con Barras */}
      <View style={styles.barsContainer}>
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
            <View key={idx} style={styles.barColumn}>
              <Text style={styles.barValue}>{item.value.toFixed(1)}%</Text>
              <View style={styles.barTrack}>
                {overflowValue > 0 && (
                  <Animated.View
                    style={[
                      styles.barFill,
                      {
                        height: overflowHeight,
                        backgroundColor: color,
                        opacity: 0.45 // Opacidad para la parte superior (más opaco / translúcido)
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
              <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const AttendanceControlScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [dailyData, setDailyData] = useState({ presentes: [], ausentes: [] });

  const [activeTab, setActiveTab] = useState('RESUMEN'); // RESUMEN | ASISTENCIA
  const [attendanceTab, setAttendanceTab] = useState('PRESENTES'); // PRESENTES | AUSENTES
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Calendario de estados
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());

  // Animaciones de carga tipo Highcharts
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const slideAnim = React.useRef(new Animated.Value(25)).current;

  useEffect(() => {
    fetchData();
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
    try {
      const token = await AsyncStorage.getItem('userToken');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [statsRes, dailyRes] = await Promise.all([
        fetch('https://backend-a484.onrender.com/api/attendance/stats', { headers }),
        fetch(`https://backend-a484.onrender.com/api/attendance/daily?date=${selectedDate}`, { headers })
      ]);

      if (statsRes.status === 401) {
        await AsyncStorage.multiRemove(['userToken', 'userData']);
        navigation.replace('Login');
        return;
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (dailyRes.ok) setDailyData(await dailyRes.json());

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
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

  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'RESUMEN' && styles.tabActive]}
        onPress={() => setActiveTab('RESUMEN')}
      >
        <Text style={[styles.tabText, activeTab === 'RESUMEN' && styles.tabTextActive]}>RESUMEN & METAS</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tabButton, activeTab === 'ASISTENCIA' && styles.tabActive]}
        onPress={() => setActiveTab('ASISTENCIA')}
      >
        <Text style={[styles.tabText, activeTab === 'ASISTENCIA' && styles.tabTextActive]}>ASISTENCIA DIARIA</Text>
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
    if (!stats) return null;
    return (
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <View style={styles.kpiContainer}>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#15803D' }]}>{stats.presentes}</Text>
            <Text style={styles.kpiLabel}>ASISTENCIAS</Text>
          </Surface>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#B91C1C' }]}>{stats.faltas}</Text>
            <Text style={styles.kpiLabel}>FALTAS / NO REG</Text>
          </Surface>
          <Surface style={styles.kpiCard} elevation={0}>
            <Text style={[styles.kpiValue, { color: '#F1C40F' }]}>{stats.tardanzas}</Text>
            <Text style={styles.kpiLabel}>TARDANZAS</Text>
          </Surface>
        </View>

        <Surface style={styles.chartCard} elevation={0}>
          <Text style={styles.chartTitle}>% POSTULANTES REGISTRADOS vs META</Text>
          <CustomAnimatedChart data={getBarChartData()} />
        </Surface>

        <Surface style={styles.chartCard} elevation={0}>
          <Text style={styles.chartTitle}>METAS POR CARGO (TOTALES REGISTRADOS)</Text>
          {stats.metasPorCargo.map(m => {
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
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons name="calendar" size={24} color="#334155" />
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: '#64748B', fontSize: 10, fontWeight: 'bold' }}>FECHA (CLICK PARA CAMBIAR):</Text>
              <Text style={{ color: '#334155', fontWeight: 'bold', fontSize: 16 }}>{selectedDate}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-down" size={24} color="#334155" />
        </TouchableOpacity>

        <View style={styles.subTabContainer}>
          <TouchableOpacity
            style={[styles.subTabButton, attendanceTab === 'PRESENTES' && styles.subTabActive]}
            onPress={() => setAttendanceTab('PRESENTES')}
          >
            <Text style={[styles.subTabText, attendanceTab === 'PRESENTES' && styles.subTabTextActive]}>PRESENTES ({dailyData.presentes.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTabButton, attendanceTab === 'AUSENTES' && styles.subTabActive]}
            onPress={() => setAttendanceTab('AUSENTES')}
          >
            <Text style={[styles.subTabText, attendanceTab === 'AUSENTES' && { color: '#B91C1C' }]}>AUSENTES ({dailyData.ausentes.length})</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 10 }}>
          {attendanceTab === 'PRESENTES' ? dailyData.presentes.map(renderPersonItem) : dailyData.ausentes.map(renderPersonItem)}
          {attendanceTab === 'PRESENTES' && dailyData.presentes.length === 0 && <Text style={styles.emptyText}>No hay registros para este día.</Text>}
          {attendanceTab === 'AUSENTES' && dailyData.ausentes.length === 0 && <Text style={styles.emptyText}>Todos asistieron o no hay personal.</Text>}
        </View>
      </View>
    );
  };

  const renderPersonItem = (item) => {
    const isPresent = attendanceTab === 'PRESENTES';
    const statusColor = item.estado === 'P' ? '#15803D' : (item.estado === 'T' ? '#F1C40F' : '#B91C1C');

    return (
      <Surface key={item.id} style={styles.personCard} elevation={0}>
        <List.Item
          title={`${item.nombres} ${item.ape_pat}`}
          description={`${item.cargo} | ${item.sede_reg}`}
          left={props => (
            <Avatar.Text
              {...props}
              label={item.nombres[0]}
              size={40}
              style={{ backgroundColor: isPresent ? statusColor : '#B91C1C' }}
              textColor="#FFFFFF"
            />
          )}
          right={() => isPresent && (
            <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
              <Text style={{ color: statusColor, fontWeight: 'bold' }}>{item.estado === 'P' ? 'PUNTUAL' : 'TARDE'}</Text>
              <Text style={{ color: '#64748B', fontSize: 10 }}>{new Date(item.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          )}
          titleStyle={{ color: '#0F172A', fontSize: 14, fontWeight: 'bold' }}
          descriptionStyle={{ color: '#64748B', fontSize: 12 }}
        />
      </Surface>
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
      {renderTabs()}
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {activeTab === 'RESUMEN' ? renderResumen() : renderAsistencia()}
      </ScrollView>
      {renderCalendarModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F8' },
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
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
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

  // Custom Animated Chart styles
  chartContainer: {
    height: 220,
    position: 'relative',
    marginTop: 10,
    marginBottom: 5,
  },
  gridLinesContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingBottom: 20, // offset de etiquetas de eje X
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
    paddingRight: 5,
  },
  gridLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    paddingLeft: 35,
    paddingBottom: 20,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    maxHeight: '100%',
  },
  barValue: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#334155',
    marginBottom: 4,
  },
  barTrack: {
    width: 24,
    height: 120,
    backgroundColor: '#F8FAFC',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 2,
  },
  barLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 5,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Calendar styles
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
  }
});

export default AttendanceControlScreen;
