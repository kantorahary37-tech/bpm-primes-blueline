import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, signup as apiSignup, getMe, clearQueryCache } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => { localStorage.removeItem('token'); setToken(null); })
        .finally(() => setLoading(false));
    }
  }, [token]);

  const login = async (email, password) => {
    const data = await apiLogin(email, password);
    clearQueryCache();
    localStorage.setItem('token', data.access_token);
    setToken(data.access_token);
    const me = await getMe();
    setUser(me);
  };

  const signup = async (data) => {
    return await apiSignup(data);
  };

  const logout = () => {
    clearQueryCache();
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
