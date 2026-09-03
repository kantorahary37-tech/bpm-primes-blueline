import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from './AuthContext';

const DepartmentsContext = createContext(null);

export function DepartmentsProvider({ children }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  const load = () => {
    api.get('/departments/')
      .then(res => setDepartments(res.data))
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (user) {
      load();
    } else {
      setDepartments([]);
      setLoading(false);
    }
  }, [user]);

  return (
    <DepartmentsContext.Provider value={{ departments, loading, refresh: load }}>
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments() {
  return useContext(DepartmentsContext);
}
