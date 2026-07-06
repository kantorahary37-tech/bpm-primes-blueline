import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const DepartmentsContext = createContext(null);

export function DepartmentsProvider({ children }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/departments/')
      .then(res => setDepartments(res.data))
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <DepartmentsContext.Provider value={{ departments, loading }}>
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments() {
  return useContext(DepartmentsContext);
}
