import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { MANAGED_BONUS_TYPES } from '../constants/bonusTypes';

const DepartmentsContext = createContext(null);

export function DepartmentsProvider({ children }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/departments/')
      .then(res => setDepartments(res.data))
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  /** Types de primes autorisés pour un département ([] si inconnu). */
  const bonusTypesFor = (name) => {
    const dept = (departments || []).find(d => d.name === name);
    return dept?.bonus_types || [];
  };

  /** True si ce département peut porter une prime de ce type. */
  const allowsBonusType = (name, type) =>
    !MANAGED_BONUS_TYPES.includes(type) || bonusTypesFor(name).includes(type);

  /** Noms des départements qui autorisent ce type de prime. */
  const departmentsForBonusType = (type) =>
    (departments || [])
      .filter(d => (d.bonus_types || []).includes(type))
      .map(d => d.name);

  return (
    <DepartmentsContext.Provider
      value={{
        departments,
        loading,
        refresh: load,
        bonusTypesFor,
        allowsBonusType,
        departmentsForBonusType,
      }}
    >
      {children}
    </DepartmentsContext.Provider>
  );
}

export function useDepartments() {
  return useContext(DepartmentsContext) || {
    departments: [],
    loading: true,
    refresh: () => {},
    bonusTypesFor: () => [],
    allowsBonusType: () => true,
    departmentsForBonusType: () => [],
  };
}