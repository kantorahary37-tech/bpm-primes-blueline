import { createContext, useContext, useState, useEffect } from 'react';
import { getSystemConfig } from '../services/api';

const SystemConfigContext = createContext(null);

export function SystemConfigProvider({ children }) {
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSystemConfig()
      .then(data => {
        const flat = {};
        for (const items of Object.values(data.categories || {})) {
          for (const item of items) {
            flat[item.key] = item.value;
          }
        }
        setConfig(flat);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    try {
      const data = await getSystemConfig();
      const flat = {};
      for (const items of Object.values(data.categories || {})) {
        for (const item of items) {
          flat[item.key] = item.value;
        }
      }
      setConfig(flat);
    } catch {}
  };

  const canSeeAmounts = (user) => {
    if (!user) return false;
    if (user.is_admin) return true;
    if (user.is_drh || user.is_dg || user.is_directeur) {
      return config.SHOW_AMOUNTS_DG_DRH !== 'false';
    }
    if (user.is_validator_n1) return true;
    return false;
  };

  return (
    <SystemConfigContext.Provider value={{ config, loading, refresh, canSeeAmounts }}>
      {children}
    </SystemConfigContext.Provider>
  );
}

export const useSystemConfig = () => useContext(SystemConfigContext);
