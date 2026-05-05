// Service API pour communiquer avec le backend FastAPI
import axios from 'axios';

// Instance axios avec configuration de base
const api = axios.create({
  baseURL: '/api/v1', // Utilise le proxy Vite (configuré dans vite.config.js)
  headers: {
    'Content-Type': 'application/json',
  },
});

// Fonction pour gérer les erreurs API
const handleError = (error) => {
  console.error('API Error:', error.response?.data || error.message);
  throw error;
};

// ---- SERVICES UTILISATEURS ----
export const getUsers = async () => {
  try {
    const response = await api.get('/users/');
    return response.data;
  } catch (error) { handleError(error); }
};

export const createUser = async (userData) => {
  try {
    const response = await api.post('/users/', userData);
    return response.data;
  } catch (error) { handleError(error); }
};

// ---- SERVICES EMPLOYÉS ----
export const getEmployees = async (department = null) => {
  try {
    const params = department ? { department } : {};
    const response = await api.get('/employees/', { params });
    return response.data;
  } catch (error) { handleError(error); }
};

export const createEmployee = async (employeeData) => {
  try {
    const response = await api.post('/employees/', employeeData);
    return response.data;
  } catch (error) { handleError(error); }
};

// ---- SERVICES PRIMES ----
export const getBonuses = async (status = null, employeeId = null) => {
  try {
    const params = {};
    if (status) params.status = status;
    if (employeeId) params.employee_id = employeeId;
    const response = await api.get('/bonuses/', { params });
    return response.data;
  } catch (error) { handleError(error); }
};

export const createBonus = async (bonusData, userId) => {
  try {
    const response = await api.post(`/bonuses/?user_id=${userId}`, bonusData);
    return response.data;
  } catch (error) { handleError(error); }
};

export const validateBonus = async (bonusId, validationData, step) => {
  try {
    const response = await api.post(`/bonuses/${bonusId}/validate?step=${step}`, validationData);
    return response.data;
  } catch (error) { handleError(error); }
};

export default api;
