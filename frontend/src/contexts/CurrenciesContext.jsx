import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const CurrenciesContext = createContext(null);

export function CurrenciesProvider({ children }) {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const load = useCallback(() => {
    api.get('/currencies/', { params: { active_only: true } })
      .then(res => setCurrencies(res.data || []))
      .catch(() => setCurrencies([{ code: 'Ar', symbol: 'Ar', label: 'Ariary', is_system: true, active: true }]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) {
      load();
    } else {
      setCurrencies([{ code: 'Ar', symbol: 'Ar', label: 'Ariary', is_system: true, active: true }]);
      setLoading(false);
    }
  }, [user, load]);

  // Symbole d'affichage d'une devise (retourne le code si introuvable)
  const symbolFor = useCallback((code) => {
    const c = code || 'Ar';
    const found = currencies.find(cur => cur.code === c);
    return found?.symbol || c;
  }, [currencies]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const addCurrency = async (data) => {
    const res = await api.post('/currencies/', data);
    await refresh();
    return res.data;
  };

  const updateCurrency = async (code, data) => {
    const res = await api.put(`/currencies/${code}`, data);
    await refresh();
    return res.data;
  };

  const removeCurrency = async (code) => {
    const res = await api.delete(`/currencies/${code}`);
    await refresh();
    return res.data;
  };

  return (
    <CurrenciesContext.Provider value={{ currencies, loading, symbolFor, refresh, addCurrency, updateCurrency, removeCurrency }}>
      {children}
    </CurrenciesContext.Provider>
  );
}

export function useCurrencies() {
  return useContext(CurrenciesContext);
}