// Page Dashboard principale
import { useEffect, useState } from 'react';
import { getBonuses, getEmployees } from '../services/api';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  // États pour stocker les données
  const [stats, setStats] = useState({
    totalBonuses: 0,
    pendingBonuses: 0,
    totalEmployees: 0,
  });
  const [loading, setLoading] = useState(true);

  // Chargement des données au montage du composant
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Récupération des primes
        const bonuses = await getBonuses();
        // Récupération des employés
        const employees = await getEmployees();
        
        // Calcul des statistiques
        const pending = bonuses.filter(b => b.status !== 'Validé' && b.status !== 'Rejeté').length;
        
        setStats({
          totalBonuses: bonuses.length,
          pendingBonuses: pending,
          totalEmployees: employees.length,
        });
        setLoading(false);
      } catch (error) {
        console.error('Erreur:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  // Affichage du loading
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Dashboard - BPM Primes</h1>
      
      {/* Cartes de statistiques */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Carte Total Primes */}
        <div className="stat bg-base-100 shadow rounded-lg p-6">
          <div className="stat-title">Total Primes</div>
          <div className="stat-value text-primary">{stats.totalBonuses}</div>
          <div className="stat-desc">Toutes primes confondues</div>
        </div>
        
        {/* Carte Primes en attente */}
        <div className="stat bg-base-100 shadow rounded-lg p-6">
          <div className="stat-title">En attente</div>
          <div className="stat-value text-warning">{stats.pendingBonuses}</div>
          <div className="stat-desc">À valider</div>
        </div>
        
        {/* Carte Employés */}
        <div className="stat bg-base-100 shadow rounded-lg p-6">
          <div className="stat-title">Employés</div>
          <div className="stat-value text-secondary">{stats.totalEmployees}</div>
          <div className="stat-desc">Actifs</div>
        </div>
      </div>

      {/* Actions rapides */}
      <div className="flex gap-4">
        <Link to="/bonuses/new" className="btn btn-primary">Nouvelle Prime</Link>
        <Link to="/bonuses" className="btn btn-outline">Voir les Primes</Link>
      </div>
    </div>
  );
};

export default Dashboard;
