import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const handleError = (error) => {
  console.error('API Error:', error.response?.data || error.message);
  throw error;
};

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password });
  return data;
};

export const signup = async (userData) => {
  const { data } = await api.post('/auth/signup', userData);
  return data;
};

export const getMe = async () => {
  const { data } = await api.get('/auth/me');
  return data;
};

export const forgotPassword = async (email) => {
  const { data } = await api.post('/auth/forgot-password', { email });
  return data;
};

export const resetPassword = async (token, newPassword) => {
  const { data } = await api.post('/auth/reset-password', { token, new_password: newPassword });
  return data;
};

export const getUsers = async () => {
  const { data } = await api.get('/users/');
  return data;
};

export const getEmployees = async (department = null) => {
  const params = department ? { department } : {};
  const { data } = await api.get('/employees/', { params });
  return data;
};

export const createEmployee = async (employeeData) => {
  const { data } = await api.post('/employees/', employeeData);
  return data;
};

export const updateEmployee = async (id, employeeData) => {
  const { data } = await api.put(`/employees/${id}`, employeeData);
  return data;
};

export const getBonuses = async (status = null, employeeId = null, bonusType = null, startDate = null, endDate = null, showPaid = false) => {
  const params = {};
  if (status) params.status = status;
  if (employeeId) params.employee_id = employeeId;
  if (bonusType) params.bonus_type = bonusType;
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (showPaid) params.show_paid = true;
  const { data } = await api.get('/bonuses/', { params });
  return data;
};

export const createBonus = async (bonusData) => {
  const { data } = await api.post('/bonuses/', bonusData);
  return data;
};

export const updateBonus = async (id, data) => {
  const { data: res } = await api.put(`/bonuses/${id}`, data);
  return res;
};

export const getBonus = async (id) => {
  const { data } = await api.get(`/bonuses/${id}`);
  return data;
};

export const markBonusesPaid = async (payload) => {
  const { data } = await api.post('/bonuses/mark-paid', payload);
  return data;
};

export const getBonusValidations = async (id) => {
  const { data } = await api.get(`/bonuses/${id}/validations`);
  return data;
};

export const getAuditLogs = async (id) => {
  const { data } = await api.get(`/bonuses/${id}/audit-logs`);
  return data;
};

export const validateBonus = async (bonusId, validationData, step) => {
  const { data } = await api.post(`/bonuses/${bonusId}/validate?step=${step}`, validationData);
  return data;
};

export const batchValidateBonuses = async (bonusIds, action, step, motif_rejet = null) => {
  const { data } = await api.post('/bonuses/batch/validate', { bonus_ids: bonusIds, action, step, motif_rejet });
  return data;
};

export const getPrimeMax = async (department = null, bonusType = null) => {
  const params = {};
  if (department) params.department = department;
  if (bonusType) params.bonus_type = bonusType;
  const { data } = await api.get('/primemax/', { params });
  return data;
};

export const createPrimeMax = async (primemaxData) => {
  const { data } = await api.post('/primemax/', primemaxData);
  return data;
};

export const updatePrimeMax = async (id, primemaxData) => {
  const { data } = await api.put(`/primemax/${id}`, primemaxData);
  return data;
};

export const deletePrimeMax = async (id) => {
  const { data } = await api.delete(`/primemax/${id}`);
  return data;
};

export const getNotifications = async () => {
  const { data } = await api.get('/notifications');
  return data;
};

export const getUnreadCount = async () => {
  const { data } = await api.get('/notifications/unread-count');
  return data;
};

export const markAsRead = async (id) => {
  const { data } = await api.put(`/notifications/${id}/read`);
  return data;
};

export const markAllRead = async () => {
  const { data } = await api.put('/notifications/read-all');
  return data;
};

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export default api;
