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

export const getBonuses = async (status = null, employeeId = null, bonusType = null, startDate = null, endDate = null, showPaid = false, allStatuses = false, archiveMode = false) => {
  const params = {};
  if (status) params.status = status;
  if (employeeId) params.employee_id = employeeId;
  if (bonusType) params.bonus_type = bonusType;
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (showPaid) params.show_paid = true;
  if (allStatuses) params.all_statuses = true;
  if (archiveMode) params.archive_mode = true;
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

const resolveUploadPath = (url) => {
  if (url.startsWith('/api/v1/')) return url.slice(7);
  if (url.startsWith('/uploads/')) return url;
  return url;
};

export const openFile = async (url) => {
  const { data } = await api.get(resolveUploadPath(url), { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(new Blob([data]));
  window.open(blobUrl, '_blank');
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
};

export const getFileBlob = async (url) => {
  const { data } = await api.get(resolveUploadPath(url), { responseType: 'blob' });
  return URL.createObjectURL(new Blob([data]));
};

export const getAdminUsers = async () => {
  const { data } = await api.get('/admin/users');
  return data;
};

export const adminUpdateUser = async (userId, userData) => {
  const { data } = await api.put(`/admin/users/${userId}`, userData);
  return data;
};

export const adminDeleteUser = async (userId) => {
  const { data } = await api.delete(`/admin/users/${userId}`);
  return data;
};

export const adminResetPassword = async (userId) => {
  const { data } = await api.post(`/admin/users/${userId}/reset-password`);
  return data;
};

export const adminCreateUser = async (userData) => {
  const { data } = await api.post('/admin/users', userData);
  return data;
};

export const adminLdapSync = async () => {
  const { data } = await api.post('/admin/ldap-sync');
  return data;
};

export const adminLdapSearch = async (query) => {
  const { data } = await api.get('/admin/ldap-search', { params: { q: query } });
  return data;
};

export const getCommissionConfig = async (includeInactive = false) => {
  const { data } = await api.get('/commission-config', { params: { include_inactive: includeInactive } });
  return data;
};

export const createCommissionConfig = async (configData) => {
  const { data } = await api.post('/commission-config', configData);
  return data;
};

export const updateCommissionConfig = async (id, configData) => {
  const { data } = await api.put(`/commission-config/${id}`, configData);
  return data;
};

export const deleteCommissionConfig = async (id) => {
  const { data } = await api.delete(`/commission-config/${id}`);
  return data;
};

// Import CSV 4D : aperçu puis création
export const previewCommissionImport = async (file, startDate, endDate) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('start_date', startDate);
  formData.append('end_date', endDate);
  const { data } = await api.post('/bonuses/commission/preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

export const importCommissionBonuses = async (file, startDate, endDate) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('start_date', startDate);
  formData.append('end_date', endDate);
  const { data } = await api.post('/bonuses/commission/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

// --- Explorateur SFTP (fichier CSV 4D des ventes) ---
export const sftpInfo = async () => {
  const { data } = await api.get('/sftp/info');
  return data;
};

export const sftpList = async (path) => {
  const { data } = await api.post('/sftp/list', { path });
  return data;
};

export const sftpDownload = async (path) => {
  const { data } = await api.post('/sftp/download', { path });
  return data;
};

export const getEvaluationTemplates = async (department) => {
  const { data } = await api.get('/evaluation-templates', { params: { department } });
  return data;
};

export const saveEvaluationTemplates = async (payload) => {
  const { data } = await api.post('/evaluation-templates', payload);
  return data;
};

export const getAllEvaluationTemplates = async () => {
  const { data } = await api.get('/evaluation-templates/all');
  return data;
};

export const deleteEvaluationTemplate = async (templateId) => {
  const { data } = await api.delete(`/evaluation-templates/${templateId}`);
  return data;
};

export const deleteDepartmentTemplates = async (department) => {
  const { data } = await api.delete(`/evaluation-templates/department/${encodeURIComponent(department)}`);
  return data;
};

export default api;
