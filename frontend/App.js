import 'react-native-gesture-handler';
import React, { useState, useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider, MD3LightTheme, ActivityIndicator } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Animated, Alert } from 'react-native';
import * as SQLite from 'expo-sqlite';
import NetInfo from '@react-native-community/netinfo';

import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ScanScreen from './src/screens/ScanScreen';
import ManualEntryScreen from './src/screens/ManualEntryScreen';
import AbsenteesScreen from './src/screens/AbsenteesScreen';
import PersonalListScreen from './src/screens/PersonalListScreen';
import AttendanceControlScreen from './src/screens/AttendanceControlScreen';
import ConfigScreen from './src/screens/ConfigScreen';
import RegisterWorkerScreen from './src/screens/RegisterWorkerScreen';
import { API_URL } from './src/config';

const Stack = createStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1565C0',
    secondary: '#F5A623',
    tertiary: '#9C27B0',
    error: '#DC2626',
    background: '#F1F5F9',
    surface: '#FFFFFF',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    outline: '#E2E8F0',
  },
};

let db = null;
let isConnected = true;

global.dbHelper = {
  db: null,
  isOnline: () => isConnected,

  async init() {
    try {
      db = await SQLite.openDatabaseAsync('asistencia.db');
      this.db = db;

      // PRAGMA must be run separately (not in batch with CREATE TABLE)
      await db.runAsync('PRAGMA foreign_keys = ON;');
      await db.runAsync('PRAGMA journal_mode = WAL;'); // Better performance on mobile/APK

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS parametros_asistencia (
          estado TEXT PRIMARY KEY,
          descripcion TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS cargos (
          id INTEGER PRIMARY KEY,
          nombre TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS metas_cargos (
          cargo_id INTEGER PRIMARY KEY,
          limite_vacantes INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY(cargo_id) REFERENCES cargos(id) ON DELETE CASCADE ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tipo_postulante (
          id INTEGER PRIMARY KEY,
          descripcion TEXT UNIQUE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS principal (
          id INTEGER PRIMARY KEY,
          sede_reg TEXT NOT NULL DEFAULT '',
          sede_juris TEXT NOT NULL DEFAULT '',
          doc_identidad TEXT UNIQUE NOT NULL,
          ape_pat TEXT NOT NULL,
          ape_mat TEXT NOT NULL,
          nombres TEXT NOT NULL,
          local TEXT NOT NULL DEFAULT '',
          aula INTEGER NOT NULL DEFAULT 1,
          tipo_postulante_id INTEGER NOT NULL,
          cargo_id INTEGER NOT NULL,
          turno TEXT NOT NULL DEFAULT 'DIA',
          hora_ingreso TEXT NOT NULL DEFAULT '08:00:00',
          FOREIGN KEY(tipo_postulante_id) REFERENCES tipo_postulante(id) ON UPDATE CASCADE,
          FOREIGN KEY(cargo_id) REFERENCES cargos(id) ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS asistencias (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          principal_id INTEGER NOT NULL,
          estado TEXT NOT NULL,
          fecha_hora TEXT NOT NULL,
          observaciones TEXT,
          FOREIGN KEY(principal_id) REFERENCES principal(id) ON DELETE CASCADE ON UPDATE CASCADE,
          FOREIGN KEY(estado) REFERENCES parametros_asistencia(estado) ON UPDATE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          action_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);

      // Seed immutable reference data
      await db.runAsync(`INSERT OR IGNORE INTO tipo_postulante (id, descripcion) VALUES (1, 'Titular'), (2, 'Reserva');`);
      await db.runAsync(`INSERT OR IGNORE INTO parametros_asistencia (estado, descripcion) VALUES ('P', 'Puntual'), ('T', 'Tarde');`);
      console.log('[DB] Local SQLite initialized successfully (WAL mode)');
    } catch (error) {
      console.error('[DB] Error initializing SQLite:', error);
      // Attempt recovery: reopen and try without foreign keys
      try {
        db = await SQLite.openDatabaseAsync('asistencia.db');
        this.db = db;
        console.log('[DB] Recovered DB connection after init error');
      } catch (recoveryErr) {
        console.error('[DB] Critical: Could not open database:', recoveryErr);
      }

    }
  },

  async clearAndPopulate(cargos, metas_cargos, tipo_postulante, parametros_asistencia, workers, asistencias) {
    try {
      if (!db) return;
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM asistencias;');
        await db.runAsync('DELETE FROM principal;');
        await db.runAsync('DELETE FROM tipo_postulante;');
        await db.runAsync('DELETE FROM metas_cargos;');
        await db.runAsync('DELETE FROM cargos;');
        await db.runAsync('DELETE FROM parametros_asistencia;');

        for (const p of parametros_asistencia || []) {
          await db.runAsync('INSERT OR REPLACE INTO parametros_asistencia (estado, descripcion) VALUES (?, ?)', [p.estado, p.descripcion]);
        }

        for (const c of cargos || []) {
          await db.runAsync('INSERT OR REPLACE INTO cargos (id, nombre) VALUES (?, ?)', [c.id, c.nombre]);
        }

        for (const m of metas_cargos || []) {
          await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [m.cargo_id, m.limite_vacantes]);
        }

        for (const tp of tipo_postulante || []) {
          await db.runAsync('INSERT OR REPLACE INTO tipo_postulante (id, descripcion) VALUES (?, ?)', [tp.id, tp.descripcion]);
        }

        for (const w of workers || []) {
          await db.runAsync(`
            INSERT OR REPLACE INTO principal (
              id, sede_reg, sede_juris, doc_identidad, ape_pat, ape_mat, nombres, local, aula, tipo_postulante_id, cargo_id, turno, hora_ingreso
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            w.id, w.sede_reg, w.sede_juris, w.dni || w.doc_identidad, w.ape_pat, w.ape_mat, w.nombres, w.area || w.local, w.aula, w.tipo_postulante_id, w.cargo_id, w.turno, w.hora_ingreso
          ]);
        }

        for (const a of asistencias || []) {
          await db.runAsync('INSERT OR REPLACE INTO asistencias (id, principal_id, estado, fecha_hora, observaciones) VALUES (?, ?, ?, ?, ?)', [
            a.id, a.principal_id, a.estado, a.fecha_hora, a.observaciones
          ]);
        }
      });
      console.log('SQLite cleared and populated.');
    } catch (e) {
      console.error('Error populating SQLite:', e);
    }
  },

  async addPendingAction(actionType, payload) {
    try {
      if (!db) return;
      const payloadStr = JSON.stringify(payload);
      const now = new Date().toISOString();
      await db.runAsync('INSERT INTO sync_queue (action_type, payload, created_at) VALUES (?, ?, ?)', [
        actionType, payloadStr, now
      ]);
      console.log(`Action ${actionType} added to sync queue.`);
    } catch (error) {
      console.error('Error adding to sync queue:', error);
    }
  },

  async syncQueue() {
    if (!db) return;
    if (!isConnected) {
      console.log('[SYNC] Device is offline, skipping sync.');
      return;
    }
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const queue = await db.getAllAsync('SELECT * FROM sync_queue ORDER BY id ASC');
      
      if (queue.length > 0) {
        console.log(`Processing ${queue.length} items in sync queue...`);
        for (const item of queue) {
          const payload = JSON.parse(item.payload);
          let success = false;
          let responseStatus = 200;

          try {
            if (item.action_type === 'REGISTER_WORKER') {
              const res = await fetch(`${API_URL}/api/attendance/register-worker`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
              });
              responseStatus = res.status;
              success = res.ok;
              if (success) {
                const resData = await res.json();
                const realId = resData.worker.id;
                await db.runAsync('UPDATE principal SET id = ? WHERE doc_identidad = ?', [realId, payload.dni]);
                await db.runAsync('UPDATE asistencias SET principal_id = ? WHERE principal_id = ?', [realId, payload.id]);
              }
            } else if (item.action_type === 'MARK_ATTENDANCE') {
              const res = await fetch(`${API_URL}/api/attendance/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
              });
              responseStatus = res.status;
              success = res.ok;
            } else if (item.action_type === 'CREATE_CARGO') {
              const res = await fetch(`${API_URL}/api/config/cargos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
              });
              responseStatus = res.status;
              success = res.ok;
              if (success) {
                const resData = await res.json();
                const realId = resData.id;
                await db.runAsync('UPDATE cargos SET id = ? WHERE nombre = ?', [realId, payload.nombre]);
                await db.runAsync('UPDATE principal SET cargo_id = ? WHERE cargo_id = ?', [realId, payload.tempId]);
              }
            } else if (item.action_type === 'UPDATE_META') {
              // Find real cargo ID if it was created offline and updated offline
              const cargoLocal = await db.getAllAsync('SELECT id FROM cargos WHERE nombre = ?', [payload.nombre]);
              const realId = cargoLocal[0]?.id || payload.id;
              
              const res = await fetch(`${API_URL}/api/config/cargos/${realId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ meta: payload.meta })
              });
              responseStatus = res.status;
              success = res.ok;
            } else if (item.action_type === 'UPDATE_WORKER') {
              // Find real worker ID by DNI
              const workerLocal = await db.getAllAsync('SELECT id FROM principal WHERE doc_identidad = ?', [payload.dni]);
              const realId = workerLocal[0]?.id || payload.id;

              const res = await fetch(`${API_URL}/api/attendance/workers/${realId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
              });
              responseStatus = res.status;
              success = res.ok;
            }

            if (success) {
              await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]);
            } else {
              console.log(`Failed to sync item ${item.id}, status: ${responseStatus}`);
              if (responseStatus === 401 || responseStatus === 403) return; // Stop if unauthenticated
              if (responseStatus >= 400 && responseStatus < 500) {
                await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [item.id]); // Drop invalid request
              } else {
                break; // Stop and retry later for server or network error
              }
            }
          } catch (fetchErr) {
            console.error(`Network error during sync of item ${item.id}:`, fetchErr);
            break;
          }
        }
      }

      // Check if queue is now empty (was empty or successfully processed everything)
      const remaining = await db.getAllAsync('SELECT COUNT(*) as count FROM sync_queue');
      if (remaining[0].count === 0) {
        console.log('Sync queue completed (or empty), triggering syncPullIfUpdated...');
        await this.syncPullIfUpdated(token);
      }
    } catch (e) {
      console.error('Error during syncQueue:', e);
    }
  },

  async syncPullIfUpdated(token, force = false) {
    if (!token) return false;
    try {
      if (!force) {
      console.log('[SYNC] Checking if updates exist via sync-check...');
      const checkRes = await fetch(`${API_URL}/api/attendance/sync-check`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        const localCounts = await this.getDbDiagnostics();
        if (localCounts &&
            localCounts.principalCount === checkData.workers &&
            localCounts.asistenciasCount === checkData.asistencias &&
            localCounts.cargosCount === checkData.cargos &&
            localCounts.metasCount === checkData.metas_cargos &&
            localCounts.tiposCount === checkData.tipo_postulante &&
            localCounts.paramsCount === checkData.parametros_asistencia) {
          console.log('[SYNC] Local counts match Render. Skipping sync-pull.');
          return true;
          }
        }
      }

      console.log('[SYNC] SQLite counts differ. Performing sync-pull...');
      const pullRes = await fetch(`${API_URL}/api/attendance/sync-pull`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (pullRes.ok) {
        const syncData = await pullRes.json();
        await this.clearAndPopulate(
          syncData.cargos,
          syncData.metas_cargos,
          syncData.tipo_postulante,
          syncData.parametros_asistencia,
          syncData.workers,
          syncData.asistencias
        );
        console.log('[SYNC] Pull successful. Local SQLite database fully synchronized.');
        return true;
      }
      return false;
    } catch (e) {
      console.error('[SYNC] Error in syncPullIfUpdated:', e);
      return false;
    }
  },

  async getCargos() {
    if (!db) return [];
    return await db.getAllAsync(`
      SELECT c.id, c.nombre, COALESCE(m.limite_vacantes, 0) as meta 
      FROM cargos c 
      LEFT JOIN metas_cargos m ON c.id = m.cargo_id
      ORDER BY c.id ASC
    `);
  },

  async getWorkersOffline(limit, offset, filterTipo) {
    if (!db) return { data: [], total: 0 };
    let query = `
      SELECT p.id, p.doc_identidad as dni, p.ape_pat, p.ape_mat, p.nombres, p.local as area,
             p.sede_reg, p.sede_juris, p.aula, p.turno, p.hora_ingreso,
             c.nombre as cargo, tp.descripcion as tipo_postulante, p.cargo_id
      FROM principal p
      JOIN cargos c ON p.cargo_id = c.id
      JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
    `;
    let countQuery = 'SELECT COUNT(*) as count FROM principal p JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id';
    const params = [];
    const countParams = [];
    if (filterTipo) {
      query += ' WHERE tp.descripcion = ?';
      countQuery += ' WHERE tp.descripcion = ?';
      params.push(filterTipo);
      countParams.push(filterTipo);
    }
    query += ' ORDER BY p.sede_reg, p.sede_juris, p.local, c.nombre, p.ape_pat LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await db.getAllAsync(query, params);
    const countRes = await db.getAllAsync(countQuery, countParams);
    const total = countRes[0]?.count || 0;

    return { data: rows, total };
  },

  async getStats() {
    if (!db) return { presentes: 0, faltas: 0, tardanzas: 0, asistenciaPorCargo: [], metasPorCargo: [] };
    try {
      const getLocalDateString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const todayStr = getLocalDateString();

      const totalRes = await db.getAllAsync('SELECT COUNT(*) as count FROM principal');
      const total = totalRes[0]?.count || 0;

      const presentesRes = await db.getAllAsync("SELECT COUNT(*) as count FROM asistencias WHERE date(fecha_hora, 'localtime') = ?", [todayStr]);
      const presentes = presentesRes[0]?.count || 0;

      const tardanzasRes = await db.getAllAsync("SELECT COUNT(*) as count FROM asistencias WHERE estado = 'T' AND date(fecha_hora, 'localtime') = ?", [todayStr]);
      const tardanzas = tardanzasRes[0]?.count || 0;

      const tempranoRes = await db.getAllAsync("SELECT COUNT(*) as count FROM asistencias WHERE estado = 'P' AND date(fecha_hora, 'localtime') = ?", [todayStr]);
      const temprano = tempranoRes[0]?.count || 0;

      const faltas = total - presentes;

      const metasPorCargo = await db.getAllAsync(`
        SELECT c.nombre as cargo,
               COALESCE(c.meta, 0) as meta,
               (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as registrados
        FROM cargos c
        ORDER BY c.id ASC
      `);

      const asistenciaPorCargo = await db.getAllAsync(`
        SELECT c.nombre as cargo, 
               COUNT(a.id) as presentes,
               (SELECT COUNT(*) FROM principal WHERE cargo_id = c.id) as total_cargo
        FROM cargos c
        LEFT JOIN principal p ON p.cargo_id = c.id
        LEFT JOIN asistencias a ON a.principal_id = p.id AND date(a.fecha_hora, 'localtime') = ?
        GROUP BY c.id, c.nombre
        ORDER BY c.id ASC
      `, [todayStr]);

      return { 
        presentes, 
        faltas: faltas < 0 ? 0 : faltas, 
        tardanzas,
        temprano,
        metasPorCargo,
        asistenciaPorCargo
      };
    } catch (e) {
      console.error('Error in getStats:', e);
      return { presentes: 0, faltas: 0, tardanzas: 0, temprano: 0, asistenciaPorCargo: [], metasPorCargo: [] };
    }
  },

  async getDailyAttendance(selectedDate) {
    if (!db) return { presentes: [], ausentes: [] };
    try {
      const getLocalDateString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const targetDate = selectedDate || getLocalDateString();

      const presentes = await db.getAllAsync(`
        SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
               c.nombre as cargo, tp.descripcion as tipo_postulante,
               p.sede_reg, p.sede_juris, p.local, p.turno, p.aula,
               p.hora_ingreso, a.estado, a.fecha_hora
        FROM asistencias a
        JOIN principal p ON a.principal_id = p.id
        JOIN cargos c ON p.cargo_id = c.id
        JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
        WHERE date(a.fecha_hora, 'localtime') = date(?)
        ORDER BY a.fecha_hora DESC
      `, [targetDate]);

      const ausentes = await db.getAllAsync(`
        SELECT p.id, p.doc_identidad as dni, p.nombres, p.ape_pat, p.ape_mat, 
               c.nombre as cargo, tp.descripcion as tipo_postulante,
               p.sede_reg, p.sede_juris, p.local, p.turno, p.aula,
               p.hora_ingreso
        FROM principal p
        JOIN cargos c ON p.cargo_id = c.id
        JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id
        WHERE NOT EXISTS (
          SELECT 1 FROM asistencias a 
          WHERE a.principal_id = p.id AND date(a.fecha_hora, 'localtime') = date(?)
        )
        ORDER BY p.ape_pat, p.ape_mat
      `, [targetDate]);

      return { presentes, ausentes };
    } catch (e) {
      console.error('Error in getDailyAttendance:', e);
      return { presentes: [], ausentes: [] };
    }
  },

  async getAbsentees() {
    if (!db) return [];
    try {
      return await db.getAllAsync(`
        SELECT p.doc_identidad as dni, p.nombres, (p.ape_pat || ' ' || p.ape_mat) as apellidos, 
               p.local as area, c.nombre as puesto, p.turno, p.hora_ingreso
        FROM principal p
        JOIN cargos c ON p.cargo_id = c.id
        WHERE p.id NOT IN (SELECT principal_id FROM asistencias WHERE date(fecha_hora, 'localtime') = date('now', 'localtime'))
        ORDER BY p.ape_pat ASC
      `);
    } catch (e) {
      console.error('Error in getAbsentees:', e);
      return [];
    }
  },

  async verifyWorkerOffline(dni) {
    if (!db) return null;
    const workerRes = await db.getAllAsync(`
      SELECT p.*, c.nombre as cargo, tp.descripcion as tipo_postulante 
      FROM principal p 
      JOIN cargos c ON p.cargo_id = c.id 
      JOIN tipo_postulante tp ON p.tipo_postulante_id = tp.id 
      WHERE p.doc_identidad = ?
    `, [dni]);

    if (workerRes.length === 0) return null;

    const worker = workerRes[0];

    const userData = await AsyncStorage.getItem('userData');
    if (userData) {
      const user = JSON.parse(userData);
      const isSU = user.rol?.toLowerCase() === 'su' || user.rol?.toLowerCase() === 'admin';
      if (!isSU && worker.sede_reg !== user.rol) {
        return {
          error: 'Este postulante no pertenece a la sede actual',
          worker: { dni: worker.doc_identidad, sede_reg: worker.sede_reg }
        };
      }
    }
    const attendanceRes = await db.getAllAsync('SELECT * FROM asistencias WHERE principal_id = ?', [worker.id]);
    const attendance = attendanceRes[0] || null;
    const status = attendance ? 'entered' : 'none';

    return {
      worker: {
        id: worker.id,
        dni: worker.doc_identidad,
        nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
        puesto: worker.cargo,
        area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
        sede_reg: worker.sede_reg,
        sede_juris: worker.sede_juris,
        tipo_postulante: worker.tipo_postulante,
        turno: worker.turno,
        hora_ingreso: worker.hora_ingreso
      },
      status,
      attendance
    };
  },

  async registerAttendanceOffline(dni, observaciones) {
    if (!db) throw new Error('Base de datos no inicializada');
    
    const workerRes = await db.getAllAsync(`
      SELECT p.*, c.nombre as cargo 
      FROM principal p 
      JOIN cargos c ON p.cargo_id = c.id 
      WHERE p.doc_identidad = ?
    `, [dni]);

    if (workerRes.length === 0) throw new Error('Postulante no encontrado');
    const worker = workerRes[0];

    const userData = await AsyncStorage.getItem('userData');
    if (userData) {
      const user = JSON.parse(userData);
      const isSU = user.rol?.toLowerCase() === 'su' || user.rol?.toLowerCase() === 'admin';
      if (!isSU && worker.sede_reg !== user.rol) {
        throw new Error('Este postulante no pertenece a la sede actual');
      }
    }

    const existing = await db.getAllAsync('SELECT * FROM asistencias WHERE principal_id = ?', [worker.id]);
    if (existing.length > 0) {
      throw new Error('Ya se registro el ingreso de hoy. No se puede marcar nuevamente.');
    }

    const now = new Date();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    const [ingH, ingM] = worker.hora_ingreso.split(':').map(Number);
    const ingresoTotalMinutes = ingH * 60 + ingM;

    const estado = currentTotalMinutes <= ingresoTotalMinutes ? 'P' : 'T';
    const fechaHora = now.toISOString();

    const insertRes = await db.runAsync(
      'INSERT INTO asistencias (principal_id, estado, fecha_hora, observaciones) VALUES (?, ?, ?, ?)',
      [worker.id, estado, fechaHora, observaciones]
    );

    await this.addPendingAction('MARK_ATTENDANCE', { dni, observaciones });

    return {
      message: 'Ingreso registrado exitosamente (Guardado localmente sin conexión)',
      worker: {
        nombre: `${worker.nombres} ${worker.ape_pat} ${worker.ape_mat}`,
        puesto: worker.cargo,
        area: `${worker.sede_reg} - ${worker.local} (Aula ${worker.aula})`,
        turno: worker.turno,
        hora_ingreso: worker.hora_ingreso
      },
      record: {
        id: insertRes.lastInsertRowId,
        principal_id: worker.id,
        estado,
        fecha_hora: fechaHora,
        observaciones
      },
      estado_desc: estado === 'P' ? 'PUNTUAL' : 'TARDE'
    };
  },

  async registerWorkerOffline(payload) {
    if (!db) throw new Error('Base de datos no inicializada');
    const { dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso } = payload;

    const userData = await AsyncStorage.getItem('userData');
    if (userData) {
      const user = JSON.parse(userData);
      const isSU = user.rol?.toLowerCase() === 'su' || user.rol?.toLowerCase() === 'admin';
      if (!isSU && sede_reg !== user.rol) {
        throw new Error('Solo se permite registrar postulantes para la sede del usuario activo');
      }
    }

    const exists = await db.getAllAsync('SELECT id FROM principal WHERE doc_identidad = ?', [dni]);
    if (exists.length > 0) throw new Error('El DNI ya esta registrado.');

    let finalTipoPostulante = parseInt(tipo_postulante_id);
    let mensajeAlerta = null;

    if (finalTipoPostulante === 1) {
      const cargoRes = await db.getAllAsync('SELECT limite_vacantes as meta FROM metas_cargos WHERE cargo_id = ?', [parseInt(cargo_id)]);
      const limite = cargoRes[0]?.meta || 0;
      
      const actualesRes = await db.getAllAsync(
        'SELECT COUNT(*) as count FROM principal WHERE cargo_id = ? AND tipo_postulante_id = 1',
        [parseInt(cargo_id)]
      );
      const actuales = actualesRes[0]?.count || 0;

      if (actuales >= limite) {
        finalTipoPostulante = 2;
        mensajeAlerta = 'Meta Cubierta. Se guardo como Reserva.';
      }
    }

    const minIdRes = await db.getAllAsync('SELECT MIN(id) as min_id FROM principal');
    const minId = minIdRes[0]?.min_id || 0;
    const tempId = (minId < 0 ? minId : 0) - 1;

    await db.runAsync(`
      INSERT INTO principal (
        id, doc_identidad, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula, cargo_id, tipo_postulante_id, turno, hora_ingreso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      tempId, dni, ape_pat, ape_mat, nombres, sede_reg, sede_juris, local, aula ? parseInt(aula) : 99, 
      parseInt(cargo_id), finalTipoPostulante, turno || 'DIA', hora_ingreso || '08:00:00'
    ]);

    await this.addPendingAction('REGISTER_WORKER', { ...payload, id: tempId });

    return {
      message: 'Postulante registrado exitosamente (Guardado localmente sin conexión)',
      worker: {
        id: tempId,
        doc_identidad: dni,
        ape_pat,
        ape_mat,
        nombres,
        sede_reg,
        sede_juris,
        local,
        aula: aula ? parseInt(aula) : 99,
        cargo_id: parseInt(cargo_id),
        tipo_postulante_id: finalTipoPostulante,
        turno: turno || 'DIA',
        hora_ingreso: hora_ingreso || '08:00:00'
      },
      alert: mensajeAlerta
    };
  },

  async updateWorkerOffline(id, editForm, dni) {
    if (!db) throw new Error('Base de datos no inicializada');
    const { sede_reg, sede_juris, local, aula, cargo_id, turno, hora_ingreso } = editForm;

    await db.runAsync(`
      UPDATE principal 
      SET sede_reg = ?, sede_juris = ?, local = ?, aula = ?, cargo_id = ?, turno = ?, hora_ingreso = ?
      WHERE id = ?
    `, [
      sede_reg, sede_juris, local, aula ? parseInt(aula) : 99, 
      cargo_id ? parseInt(cargo_id) : null, turno, hora_ingreso, id
    ]);

    await this.addPendingAction('UPDATE_WORKER', { id, dni, ...editForm });
    return { id, ...editForm };
  },

  async createCargoOffline(nombre, meta) {
    if (!db) throw new Error('Base de datos no inicializada');
    
    const minIdRes = await db.getAllAsync('SELECT MIN(id) as min_id FROM cargos');
    const minId = minIdRes[0]?.min_id || 0;
    const tempId = (minId < 0 ? minId : 0) - 1;

    await db.runAsync('INSERT INTO cargos (id, nombre) VALUES (?, ?)', [tempId, nombre]);
    await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [tempId, meta || 0]);
    await this.addPendingAction('CREATE_CARGO', { nombre, meta: meta || 0, tempId });

    return { id: tempId, nombre, meta: meta || 0 };
  },

  async updateMetaOffline(id, meta, nombre) {
    if (!db) throw new Error('Base de datos no inicializada');
    await db.runAsync('INSERT OR REPLACE INTO metas_cargos (cargo_id, limite_vacantes) VALUES (?, ?)', [id, meta || 0]);
    await this.addPendingAction('UPDATE_META', { id, nombre, meta: meta || 0 });
    return { message: 'Meta actualizada correctamente (Local)' };
  },

  async getDbDiagnostics() {
    if (!db) return null;
    try {
      const principal = await db.getAllAsync('SELECT COUNT(*) as count FROM principal');
      const asistencias = await db.getAllAsync('SELECT COUNT(*) as count FROM asistencias');
      const cargos = await db.getAllAsync('SELECT COUNT(*) as count FROM cargos');
      const metas = await db.getAllAsync('SELECT COUNT(*) as count FROM metas_cargos');
      const tipos = await db.getAllAsync('SELECT COUNT(*) as count FROM tipo_postulante');
      const params = await db.getAllAsync('SELECT COUNT(*) as count FROM parametros_asistencia');
      const queue = await db.getAllAsync('SELECT * FROM sync_queue ORDER BY id ASC');
      return {
        principalCount: principal[0]?.count || 0,
        asistenciasCount: asistencias[0]?.count || 0,
        cargosCount: cargos[0]?.count || 0,
        metasCount: metas[0]?.count || 0,
        tiposCount: tipos[0]?.count || 0,
        paramsCount: params[0]?.count || 0,
        queue
      };
    } catch (e) {
      console.error(e);
      return null;
    }
  }
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

    const initApp = async () => {
      try {
        await global.dbHelper.init();

        const netState = await NetInfo.fetch();
        isConnected = !!netState.isConnected;
        console.log('Initial connectivity state:', isConnected ? 'ONLINE' : 'OFFLINE');

        if (isConnected) {
          global.dbHelper.syncQueue();
        }

        const token = await AsyncStorage.getItem('userToken');
        setUserToken(token);
      } catch (e) {
        console.error(e);
      } finally {
        setTimeout(() => {
          setIsLoading(false);
        }, 1500);
      }
    };

    initApp();

    const unsubscribe = NetInfo.addEventListener(state => {
      const wasConnected = isConnected;
      isConnected = !!state.isConnected;
      console.log('Connectivity changed. Connected:', isConnected);
      if (isConnected && !wasConnected) {
        global.dbHelper.syncQueue();
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Periodic background sync helper when logged in and online
  useEffect(() => {
    if (!userToken) return;

    const interval = setInterval(() => {
      if (isConnected) {
        console.log('[SYNC] Running periodic background sync...');
        global.dbHelper.syncQueue();
      }
    }, 90000); // 90 seconds

    return () => clearInterval(interval);
  }, [userToken]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#1565C0', justifyContent: 'center', alignItems: 'center' }}>
        <Animated.Image
          source={require('./assets/icon.png')}
          style={{
            width: 140,
            height: 140,
            marginBottom: 24,
            opacity: logoOpacity,
            transform: [{ scale: logoScale }]
          }}
          resizeMode="contain"
        />
        <ActivityIndicator size="small" color="rgba(255,255,255,0.8)" />
      </View>
    );
  }

  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={userToken ? "Home" : "Login"}
          screenOptions={{
            headerStyle: { backgroundColor: '#1565C0', elevation: 0, shadowOpacity: 0 },
            headerTintColor: '#FFFFFF',
            headerTitleStyle: { fontWeight: '900', fontSize: 16, color: '#FFFFFF', letterSpacing: 0.8 },
            cardStyle: { backgroundColor: '#F1F5F9' }
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Scan" component={ScanScreen} options={{ title: 'MARCACION DNI' }} />
          <Stack.Screen name="RegisterWorker" component={RegisterWorkerScreen} options={{ title: 'INSCRIPCION DE POSTULANTE' }} />
          <Stack.Screen name="Manual" component={ManualEntryScreen} options={{ title: 'INGRESO MANUAL' }} />
          <Stack.Screen name="Absentees" component={AbsenteesScreen} options={{ title: 'FALTAS DE HOY' }} />
          <Stack.Screen name="PersonalList" component={PersonalListScreen} options={{ title: 'PERSONAL' }} />
          <Stack.Screen name="AttendanceControl" component={AttendanceControlScreen} options={{ title: 'EVALUACION CURRICULAR' }} />
          <Stack.Screen name="Config" component={ConfigScreen} options={{ title: 'CONFIGURACION' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}
