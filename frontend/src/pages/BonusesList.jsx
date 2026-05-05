// Page de liste des primes
import { useEffect, useState } from 'react';
import { getBonuses, validateBonus } from '../services/api';
import { Link } from 'react-router-dom';

const BonusesList = () => {
  // États pour les primes et le filtrage
  const [bonuses, setBonuses] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Chargement des primes
  useEffect(() => {
    fetchBonuses();
  }, [statusFilter]);

  const fetchBonuses = async () => {
    try {
      const data = await getBonuses(statusFilter || null);
      setBonuses(data);
      setLoading(false);
    } catch (error) {
      console.error('Erreur:', error);
      setLoading(false);
    }
  };

  // Fonction pour valider une prime
  const handleValidate = async (bonusId, step) => {
    try {
      await validateBonus(bonusId, { action: 'VALIDER' }, step);
      alert('Prime validée !');
      fetchBonuses(); // Rechargement de la liste
    } catch (error) {
      alert('Erreur lors de la validation');
    }
  };

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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Liste des Primes</h1>
        <Link to="/bonuses/new" className="btn btn-primary">Nouvelle Prime</Link>
      </div>

      {/* Filtre par statut */}
      <div className="mb-6">
        <select 
          className="select select-bordered w-full max-w-xs"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="Initialisé">Initialisé</option>
          <option value="En attente N+1">En attente N+1</option>
          <option value="En attente Directeur">En attente Directeur</option>
          <option value="En attente DG">En attente DG</option>
          <option value="Validé">Validé</option>
          <option value="Rejeté">Rejeté</option>
        </select>
      </div>

      {/* Tableau des primes */}
      <div className="overflow-x-auto">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>ID</th>
              <th>Employé</th>
              <th>Mois/Année</th>
              <th>Type</th>
              <th>Montant</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bonuses.map((bonus) => (
              <tr key={bonus.id}>
                <td>{bonus.id}</td>
                <td>{bonus.employee?.name || 'N/A'}</td>
                <td>{bonus.month}/{bonus.year}</td>
                <td>
                  <span className="badge badge-ghost">{bonus.bonus_type}</span>
                </td>
                <td>{bonus.total_amount} Ar</td>
                <td>
                  <span className={
                    bonus.status === 'Validé' ? 'badge badge-success' :
                    bonus.status === 'Rejeté' ? 'badge badge-error' :
                    'badge badge-warning'
                  }>
                    {bonus.status}
                  </span>
                </td>
                <td>
                  {bonus.status !== 'Validé' && bonus.status !== 'Rejeté' && (
                    <button 
                      className="btn btn-sm btn-success"
                      onClick={() => handleValidate(bonus.id, 'N1')}
                    >
                      Valider
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BonusesList;
