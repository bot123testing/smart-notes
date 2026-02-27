import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

// Replace with your machine's IP address for physical device testing
// Run: ifconfig | grep "inet " | grep -v 127.0.0.1
// to get your current IP (it changes when you switch networks/hotspots)
const API_URL = 'http://172.20.160.207:8000/api';
// const API_URL = 'http://10.0.2.2:8000/api'; // For Android Emulator
// const API_URL = 'http://localhost:8000/api'; // For iOS Simulator

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Auto-logout callback ─────────────────────────────────────────────────────
// AuthContext calls setAuthLogoutHandler(signOut) on mount so the 401
// interceptor can trigger a real sign-out without a circular import.
let _logoutHandler = null;
export const setAuthLogoutHandler = (fn) => { _logoutHandler = fn; };

// ── Request interceptor: attach Bearer token ─────────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: auto-logout on 401 ────────────────────────────────
// When the server returns 401 (token expired / invalid), clear the stored
// token and call the AuthContext signOut so the Login screen appears.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await SecureStore.deleteItemAsync('userToken');
      if (_logoutHandler) {
        _logoutHandler();
      }
    }
    return Promise.reject(error);
  }
);

export default api;
