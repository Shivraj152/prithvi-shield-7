import React, { useEffect } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { useUIStore } from './store/uiStore';
import { syncOfflineReports } from './utils/OfflineQueue';
import { Dashboard } from './pages/Dashboard';
import './i18n';

// Configure Axios Defaults
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
axios.defaults.baseURL = API_BASE_URL;

export const App: React.FC = () => {
  const {
    user,
    setSensors,
    updateSensor,
    setRoads,
    updateRoad,
    setIncidents,
    addIncident,
    updateIncident,
    setCitizenReports,
    addCitizenReport,
    updateCitizenReport,
    setAlerts,
    addAlert,
    updateAlert,
    setIsConnected,
    isConnected,
    tickLiveTelemetry
  } = useUIStore();

  // 4-Second Real-Time Live Telemetry Tick Loop
  useEffect(() => {
    const timer = setInterval(() => {
      tickLiveTelemetry();
    }, 4000);
    return () => clearInterval(timer);
  }, [tickLiveTelemetry]);

  // 1. Initial API poll
  const loadData = async () => {
    try {
      const headers = user ? { Authorization: `Bearer token_mock_admin` } : undefined; // Simulated headers

      const [sensorsRes, roadsRes, incidentsRes, alertsRes] = await Promise.all([
        axios.get('/sensors').catch(() => null),
        axios.get('/roads').catch(() => null),
        axios.get('/incidents').catch(() => null),
        axios.get('/alerts').catch(() => null)
      ]);

      if (sensorsRes?.data) setSensors(sensorsRes.data);
      if (roadsRes?.data) setRoads(roadsRes.data);
      if (incidentsRes?.data) setIncidents(incidentsRes.data);
      if (alertsRes?.data) setAlerts(alertsRes.data);

      if (user && (user.role === 'Field Officer' || user.role === 'District Admin' || user.role === 'SDMA Super Admin')) {
        const citizenReportsRes = await axios.get('/citizen-reports', {
          headers: { Authorization: `Bearer mock_admin_token` }
        }).catch(() => null);
        if (citizenReportsRes?.data) setCitizenReports(citizenReportsRes.data);
      }
    } catch (err) {
      console.error('[Initial Loading Error]', err);
      // Fallback Seed Data when backend is offline
      console.warn('[Initial Loading] Backend offline. Seeding premium offline mock data...');
      setSensors([
        { id: 1, name: 'Tiltmeter-01 (Shillong Ridge)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Tilt' },
        { id: 2, name: 'RainGauge-02 (Haflong Highway)', status: 'warning', last_reading_at: new Date().toISOString(), type: 'Rainfall' },
        { id: 3, name: 'Tiltmeter-03 (Mangan Valley)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Tilt' },
        { id: 4, name: 'RainGauge-04 (Tawang Road)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Rainfall' },
        { id: 5, name: 'Tiltmeter-05 (Aizawl North)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Tilt' },
        { id: 6, name: 'Tiltmeter-06 (Lunglei Pass)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Tilt' },
        { id: 7, name: 'RainGauge-07 (Gangtok Hill)', status: 'active', last_reading_at: new Date().toISOString(), type: 'Rainfall' }
      ]);
      setRoads([
        { id: 1, name: 'Shillong - Silchar Highway (NH-6)', status: 'Partially Blocked', district_id: 1 },
        { id: 2, name: 'Haflong Link Road', status: 'Fully Blocked', district_id: 2 },
        { id: 3, name: 'Aizawl Bypass Road', status: 'Clear', district_id: 3 },
        { id: 5, name: 'Guwahati-Tezpur Route (NH-37)', status: 'Clear', district_id: 1 }
      ]);
      setIncidents([
        { 
          id: 1, 
          title: 'Debris Flow on Shillong Bypass (NH-06)', 
          description: 'Saturated slope debris flow blocking primary district corridor.', 
          status: 'Active', 
          severity: 'Critical', 
          type: 'Debris Flow',
          location: 'East Khasi Hills, Meghalaya', 
          lat: 25.5788, 
          lng: 91.8933,
          latitude: 25.5788,
          longitude: 91.8933,
          reportedAt: '10 mins ago'
        },
        { 
          id: 2, 
          title: 'Rockfall & Highway Obstruction (NH-27)', 
          description: 'Major rockfall and boulder collapse blocking both travel lanes.', 
          status: 'Under Response', 
          severity: 'High', 
          type: 'Rockfall',
          location: 'Haflong Pass, Dima Hasao, Assam', 
          lat: 25.1812, 
          lng: 92.9461,
          latitude: 25.1812,
          longitude: 92.9461,
          reportedAt: '35 mins ago'
        },
        { 
          id: 3, 
          title: 'Flash Flood & Culvert Erosion (NH-10)', 
          description: 'Flash flood torrent causing subgrade washout near river bed.', 
          status: 'Active', 
          severity: 'High', 
          type: 'Flash Flood',
          location: 'Mangan-Lachen Highway, Sikkim', 
          lat: 27.5042, 
          lng: 88.5358,
          latitude: 27.5042,
          longitude: 88.5358,
          reportedAt: '1 hour ago'
        },
        { 
          id: 4, 
          title: 'Slope Creep & Ridge Tension Fissures', 
          description: 'Urban slope pore pressure accumulation with 15cm tension cracks.', 
          status: 'Monitoring', 
          severity: 'Moderate', 
          type: 'Slope Creep',
          location: 'Chaltlang Ridge, Aizawl, Mizoram', 
          lat: 23.7367, 
          lng: 92.7176,
          latitude: 23.7367,
          longitude: 92.7176,
          reportedAt: '2 hours ago'
        },
        { 
          id: 5, 
          title: 'Fallen Tree & Mudslide Road Blockage', 
          description: 'Fallen timber and mud slip obstructing single lane.', 
          status: 'Under Response', 
          severity: 'Moderate', 
          type: 'Road Blockage',
          location: 'Noney Highway Pass, Manipur', 
          lat: 24.8142, 
          lng: 93.6120,
          latitude: 24.8142,
          longitude: 93.6120,
          reportedAt: '3 hours ago'
        },
        { 
          id: 6, 
          title: 'Minor Soil Slurry Seepage', 
          description: 'Controlled soil slurry runoff cleared by district maintenance.', 
          status: 'Resolved', 
          severity: 'Low', 
          type: 'Soil Slurry',
          location: 'Tawang Pass, Arunachal Pradesh', 
          lat: 27.5860, 
          lng: 91.8594,
          latitude: 27.5860,
          longitude: 91.8594,
          reportedAt: '5 hours ago'
        }
      ]);
      setAlerts([
        {
          id: 1,
          title_en: 'Red Alert: Landslide Risk in Meghalaya',
          message_en: 'Severe rainfall has saturated slope soils. Evacuate low-lying areas in East Khasi Hills immediately.',
          severity: 'Critical',
          status: 'Dispatched',
          translations: {
            kha: {
              title: 'Hakhlieh Kyndon: Jingma ha Meghalaya',
              message: 'Ka jingshlei um ka la pynlong ia ki khyndew ban khyllem. Phet noh shisyndon baroh ki jaka kyndong.'
            }
          }
        }
      ]);
    }
  };

  useEffect(() => {
    loadData();

    // 2. Setup WebSocket Live Stream
    const socket = io(`${API_BASE_URL}/live`, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 4000,
    });

    // In-memory simulation interval when backend is offline
    const simInterval = setInterval(() => {
      const randomSensorId = Math.floor(Math.random() * 7) + 1;
      const randomStatus = Math.random() > 0.88 ? 'warning' : 'active';
      const battery_level = Math.floor(82 + Math.random() * 17);
      const signal_strength = Math.floor(78 + Math.random() * 21);
      const tilt_displacement = (Math.random() * 3.5).toFixed(2);
      const moisture_saturation = Math.floor(65 + Math.random() * 28);
      
      updateSensor({
        sensor_id: randomSensorId,
        id: randomSensorId,
        timestamp: new Date().toISOString(),
        status: randomStatus,
        battery_level,
        signal_strength,
        tilt_displacement,
        moisture_saturation
      });
    }, 4000);

    socket.on('connect', () => {
      console.log('[WebSocket Client] Connected to namespace /live');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('[WebSocket Client] Disconnected');
      setIsConnected(false);
    });

    socket.on('sensor:update', (data) => {
      console.log('[WS Telemetry Ingestion]', data);
      updateSensor(data);
    });

    socket.on('road:status-change', (data) => {
      updateRoad(data);
    });

    socket.on('incident:new', (data) => {
      addIncident(data);
    });

    socket.on('incident:update', (data) => {
      updateIncident(data);
    });

    socket.on('alert:new', (data) => {
      addAlert(data);
    });

    socket.on('alert:update', (data) => {
      updateAlert(data);
    });

    socket.on('risk:zone-change', (data) => {
      console.log('[WS Risk Shift Notification]', data);
      // Reload lists or append alert
      loadData();
    });

    // 3. Setup Offline Sync Hooks
    const handleOnline = async () => {
      console.log('[Network] Connectivity restored.');
      setIsConnected(true);
      
      // Auto Sync Offline Queue
      const mockToken = 'mock_admin_token'; // Normally from auth state
      const synced = await syncOfflineReports(mockToken, API_BASE_URL);
      if (synced > 0) {
        console.log(`[Offline Sync] Uploaded ${synced} citizen reports.`);
        loadData(); // refresh list
      }
    };

    const handleOffline = () => {
      console.log('[Network] Network connectivity lost. Switching to IndexedDB Cache.');
      setIsConnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial connection state check
    setIsConnected(navigator.onLine);

    return () => {
      socket.disconnect();
      clearInterval(simInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [user]);

  return <Dashboard />;
};

export default App;
