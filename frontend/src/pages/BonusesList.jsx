import { useEffect, useState, useMemo } from 'react';
import { getBonuses, validateBonus } from '../services/api';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const BonusesList = () => {
  const { user } = useAuth();
  const [bonuses, setBonuses] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

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

  const handleValidate = async (bonusId, step) => {
    try {
      await validateBonus(bonusId, { action: 'VALIDER' }, step);
      alert('Prime validée !');
      fetchBonuses();
    } catch (error) {
      alert('Erreur lors de la validation');
    }
  };

  const getValidStep = (bonus) => {
    if (!user) return null;
    if (user.is_validator_n1 && (bonus.status === 'Initialisé' || bonus.status === 'En attente N+1')) return 'N1';
    if (user.is_directeur && bonus.status === 'En attente Directeur') return 'DIRECTEUR';
    if (user.is_dg && bonus.status === 'En attente DG') return 'DG';
    return null;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const getBadgeClass = (status) => {
    if (status === 'Prime validée' || status === 'Validé') return 'badge-success';
    if (status === 'Prime rejetée' || status === 'Rejeté') return 'badge-error';
    return 'badge-warning';
  };

  const sections = useMemo(() => {
    if (!user) return [];

    const myStatuses = [];
    if (user.is_validator_n1) myStatuses.push('Initialisé', 'En attente N+1');
    if (user.is_directeur) myStatuses.push('En attente Directeur');
    if (user.is_dg) myStatuses.push('En attente DG');

    const base = [
      { key: 'myValidation', title: 'À valider par vous', icon: '🫵', highlight: true, filter: (b) => myStatuses.includes(b.status) },
      { key: 'pendingDirector', title: 'En attente Directeur', icon: '⏳', highlight: false, filter: (b) => b.status === 'En attente Directeur' },
      { key: 'pendingDG', title: 'En attente DG', icon: '⏳', highlight: false, filter: (b) => b.status === 'En attente DG' },
      { key: 'initialised', title: 'Initialisées', icon: '📋', highlight: false, filter: (b) => b.status === 'Initialisé' || b.status === 'En attente N+1' },
      { key: 'validated', title: 'Validées', icon: '✅', highlight: false, filter: (b) => b.status === 'Prime validée' || b.status === 'Validé' },
    ];

    const order = [];
    if (user.is_validator_n1) {
      order.push('myValidation', 'pendingDirector', 'pendingDG', 'initialised', 'validated');
    } else if (user.is_directeur) {
      order.push('myValidation', 'pendingDG', 'initialised', 'pendingDirector', 'validated');
    } else if (user.is_dg) {
      order.push('myValidation', 'pendingDirector', 'initialised', 'pendingDG', 'validated');
    } else {
      order.push('initialised', 'pendingDirector', 'pendingDG', 'validated');
    }

    const map = new Map(base.map((s) => [s.key, s]));
    return order.map((key) => map.get(key)).filter(Boolean);
  }, [user]);

  const grouped = useMemo(() => {
    const result = {};
    for (const s of sections) {
      result[s.key] = bonuses.filter(s.filter);
    }
    return result;
  }, [bonuses, sections]);

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
        <h1 className="text-3xl font-bold">Primes</h1>
        <div className="flex gap-2">
          <Link to="/bonuses/new" className="btn btn-primary">Nouvelle Prime</Link>
          <a
            href="/api/v1/bonuses/export/sage"
            className="btn btn-outline btn-success"
            target="_blank"
            rel="noopener noreferrer"
          >
            Export SAGE
          </a>
        </div>
      </div>

      {sections.map((section) => {
        const items = grouped[section.key] || [];
        if (items.length === 0 && section.key !== 'myValidation') return null;

        return (
          <div
            key={section.key}
            className={`card mb-6 ${section.highlight ? 'bg-teal-50 border-2 border-teal-400 shadow-lg' : 'bg-base-100 shadow'}`}
          >
            <div className={`card-body p-0 ${section.highlight ? '' : ''}`}>
              <div className={`flex items-center gap-2 px-6 py-4 border-b ${section.highlight ? 'border-teal-300' : 'border-base-200'}`}>
                <span className="text-xl">{section.icon}</span>
                <h2 className="card-title text-lg">{section.title}</h2>
                <span className={`badge ${section.highlight ? 'badge-accent' : 'badge-ghost'} ml-auto`}>
                  {items.length}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="p-6 text-center text-base-content/60">
                  Aucune prime à valider
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table table-zebra">
                    <thead>
                      <tr>
                        <th>Employé</th>
                        <th>Période</th>
                        <th>Type</th>
                        <th>Montant</th>
                        <th>Statut</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((bonus) => (
                        <tr key={bonus.id}>
                          <td>{bonus.employee?.name || 'N/A'}</td>
                          <td>
                            {bonus.start_date && bonus.end_date
                              ? `${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}`
                              : 'N/A'}
                          </td>
                          <td>
                            <span className="badge badge-ghost">{bonus.bonus_type}</span>
                          </td>
                          <td className="font-medium">{bonus.total_amount} Ar</td>
                          <td>
                            <span className={`badge ${getBadgeClass(bonus.status)}`}>
                              {bonus.status}
                            </span>
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <Link
                                to={`/bonuses/${bonus.id}`}
                                className="btn btn-sm btn-ghost"
                                title="Voir le détail"
                              >
                                👁
                              </Link>
                              {(() => {
                                const step = getValidStep(bonus);
                                if (!step) return null;
                                if (bonus.was_rejected) {
                                  return (
                                    <Link
                                      to={`/bonuses/edit/${bonus.id}`}
                                      className="btn btn-sm btn-warning"
                                    >
                                      ✏️ Modifier
                                    </Link>
                                  );
                                }
                                return (
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={() => handleValidate(bonus.id, step)}
                                  >
                                    Valider
                                  </button>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default BonusesList;
