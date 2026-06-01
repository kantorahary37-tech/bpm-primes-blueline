import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBonus, getBonusValidations, validateBonus } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Timeline from '../components/Timeline';
import Modal from '../components/Modal';
import { ArrowLeftIcon, CheckIcon, XCircleIcon, EditIcon } from '../components/Icons';

const BonusDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [bonus, setBonus] = useState(null);
  const [validations, setValidations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [motifRejet, setMotifRejet] = useState('');

  useEffect(() => {
    Promise.all([getBonus(id), getBonusValidations(id)])
      .then(([b, v]) => {
        setBonus(b);
        const creation = {
          action: 'creation',
          step: 'Création',
          validator_name: '—',
          date: new Date(b.created_at).toLocaleDateString('fr-FR'),
        };
        const timeline = v.map((entry) => ({
          ...entry,
          date: new Date(entry.validated_at).toLocaleDateString('fr-FR', {
            day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
          }),
        }));
        setValidations([creation, ...timeline]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const handleValidate = async (step) => {
    await validateBonus(bonus.id, { action: 'VALIDER' }, step);
    alert('Prime validée !');
    const [b, v] = await Promise.all([getBonus(id), getBonusValidations(id)]);
    setBonus(b);
    const timeline = v.map((entry) => ({
      ...entry,
      date: new Date(entry.validated_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      }),
    }));
    setValidations(timeline);
  };

  const handleReject = async () => {
    if (!motifRejet.trim()) return;
    try {
      await validateBonus(bonus.id, { action: 'REJETER', motif_rejet: motifRejet }, getValidStep(bonus.status));
      alert('Prime rejetée — retour au statut Initialisé');
      setShowRejectModal(false);
      setMotifRejet('');
      const [b, v] = await Promise.all([getBonus(id), getBonusValidations(id)]);
      setBonus(b);
      const timeline = v.map((entry) => ({
        ...entry,
        date: new Date(entry.validated_at).toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
        }),
      }));
      setValidations(timeline);
    } catch (err) {
      alert(err.response?.data?.detail || 'Erreur lors du rejet');
    }
  };

  const getValidStep = (status) => {
    if (!user) return null;
    if (user.is_validator_n1 && (status === 'Initialisé' || status === 'En attente N+1')) return 'N1';
    if (user.is_directeur && status === 'En attente Directeur') return 'DIRECTEUR';
    if (user.is_dg && status === 'En attente DG') return 'DG';
    return null;
  };

  const getBadgeClass = (status) => {
    if (status === 'Prime validée' || status === 'Validé') return 'badge-success';
    if (status === 'Prime rejetée' || status === 'Rejeté') return 'badge-error';
    return 'badge-warning';
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const EvaluationTable = ({ label, items, budget, total, color }) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-6 last:mb-0">
        <h4 className="font-semibold text-sm mb-3">{label}</h4>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-base-content/60">Budget :</span>
          <span className="font-medium">{budget?.toLocaleString()} Ar</span>
          <div className="flex-1 max-w-xs">
            <progress
              className={`progress ${color} w-full`}
              value={total}
              max={budget || 1}
            />
          </div>
          <span className="text-sm font-medium">{total?.toLocaleString()} / {budget?.toLocaleString()} Ar</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Critères</th>
                <th>Objectif</th>
                <th>Note (0 à poids)</th>
                <th className="text-right">Valeur (Ar)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>{item.criteria}</td>
                  <td>{item.objective}</td>
                  <td>{item.evaluation ?? 0}</td>
                  <td className="text-right">{item.value?.toLocaleString() ?? '0,00'}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-base-200">
                <td colSpan={3}>Total {label}</td>
                <td className="text-right">{total?.toLocaleString()} Ar</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const formatAr = (n) => (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!bonus) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold mb-4">Prime introuvable</h1>
        <Link to="/bonuses" className="btn btn-primary">Retour à la liste</Link>
      </div>
    );
  }

  const step = getValidStep(bonus.status);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/bonuses" className="btn btn-ghost btn-sm"><ArrowLeftIcon className="w-4 h-4" /> Retour</Link>
        <h1 className="text-2xl font-bold">Détail de la prime</h1>
        <span className={`badge badge-lg ${getBadgeClass(bonus.status)}`}>{bonus.status}</span>
      </div>

      <div className="grid gap-6">
        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">Informations générales</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-base-content/60">Employé</p>
                <p className="font-medium">{bonus.employee?.name || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Département</p>
                <p className="font-medium">{bonus.employee?.department || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Type de prime</p>
                <p className="badge badge-ghost">{bonus.bonus_type}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Période</p>
                <p className="font-medium">{formatDate(bonus.start_date)} → {formatDate(bonus.end_date)}</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Montant total</p>
                <p className="text-xl font-bold text-blue-600">{bonus.total_amount} Ar</p>
              </div>
              <div>
                <p className="text-sm text-base-content/60">Créé le</p>
                <p className="font-medium">{formatDate(bonus.created_at)}</p>
              </div>
            </div>
          </div>
        </div>

        {bonus.bonus_type === 'mensuel' && (
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-lg">Évaluation mensuelle</h2>
                <span className="text-sm text-base-content/60">
                  Prime max : {formatAr(bonus.details?.prime_max || bonus.total_amount)} Ar
                </span>
              </div>

              {bonus.details ? (
                <>
                  <EvaluationTable
                    label="Quantitatif"
                    items={bonus.details.quantitative}
                    budget={bonus.details.budgets?.quanti}
                    total={bonus.details.total_quantitative}
                    color="progress-primary"
                  />
                  <EvaluationTable
                    label="Qualitatif"
                    items={bonus.details.qualitative}
                    budget={bonus.details.budgets?.quali}
                    total={bonus.details.total_qualitative}
                    color="progress-secondary"
                  />

                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between text-sm text-base-content/60 mb-1">
                      <span>Budget quantitatif utilisé</span>
                      <span>{formatAr(bonus.details.total_quantitative)} / {formatAr(bonus.details.budgets?.quanti)} Ar</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-base-content/60 mb-3">
                      <span>Budget qualitatif utilisé</span>
                      <span>{formatAr(bonus.details.total_qualitative)} / {formatAr(bonus.details.budgets?.quali)} Ar</span>
                    </div>
                    <div className="flex items-center justify-between text-lg font-bold text-blue-600 border-t pt-3">
                      <span>Total général</span>
                      <span>{formatAr(bonus.total_amount)} / {formatAr(bonus.details.prime_max)} Ar</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center text-base-content/60 py-4">
                  Détails non disponibles pour cette prime
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="stat bg-base-200 rounded-box p-4">
                      <div className="stat-title">Score performance</div>
                      <div className="stat-value text-lg">{bonus.performance_score ?? '—'}</div>
                    </div>
                    <div className="stat bg-base-200 rounded-box p-4">
                      <div className="stat-title">Absences</div>
                      <div className="stat-value text-lg">{bonus.absences ?? 0}</div>
                    </div>
                    <div className="stat bg-base-200 rounded-box p-4">
                      <div className="stat-title">Retards</div>
                      <div className="stat-value text-lg">{bonus.retard ?? 0}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {bonus.bonus_type === 'astreinte' && (
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <h2 className="card-title text-lg mb-4">Détails astreinte</h2>

              {bonus.details ? (
                <>
                  <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-base-200 rounded-box">
                    <div>
                      <p className="text-sm text-base-content/60">Nombre de semaines</p>
                      <p className="font-semibold">{bonus.details.weeks || '—'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-base-content/60">Prime max / semaine</p>
                      <p className="font-semibold">{formatAr(bonus.details.weekly_max)} Ar</p>
                    </div>
                    <div>
                      <p className="text-sm text-base-content/60">Taux par intervention</p>
                      <p className="font-semibold">{formatAr(bonus.details.intervention_rate)} Ar</p>
                    </div>
                  </div>

                  {bonus.details.disponibilites?.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-sm mb-2">Disponibilité</h4>
                      <table className="table table-sm">
                        <thead>
                          <tr><th>Employé</th><th>Nombre</th><th className="text-right">Montant (Ar)</th></tr>
                        </thead>
                        <tbody>
                          {bonus.details.disponibilites.map((d, i) => (
                            <tr key={i}>
                              <td>{d.employee_name || `#${d.employee_id}`}</td>
                              <td>{d.nombre}</td>
                              <td className="text-right font-medium">{formatAr(parseInt(d.nombre) * (bonus.details.weekly_max || 0))}</td>
                            </tr>
                          ))}
                          <tr className="font-semibold bg-base-200">
                            <td colSpan={2}>Total Disponibilité</td>
                            <td className="text-right">{formatAr(bonus.details.total_dispo)} Ar</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {bonus.details.interventions?.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm">Interventions</h4>
                        <span className="text-xs text-base-content/60">Taux : {formatAr(bonus.details.intervention_rate)} Ar / intervention</span>
                      </div>
                      <table className="table table-sm">
                        <thead>
                          <tr><th>Employé</th><th>Date</th><th>Heure</th><th>Motif</th><th>Ticket</th><th className="text-right">Montant (Ar)</th></tr>
                        </thead>
                        <tbody>
                          {bonus.details.interventions.map((iv, i) => (
                            <tr key={i}>
                              <td>{iv.employee_name || `#${iv.employee_id}`}</td>
                              <td>{iv.date || '—'}</td>
                              <td>{iv.heure || '—'}</td>
                              <td className="text-sm text-base-content/60">{iv.motif || '—'}</td>
                              <td className="text-sm">{iv.ticket || '—'}</td>
                              <td className="text-right font-medium">{formatAr(bonus.details.intervention_rate)}</td>
                            </tr>
                          ))}
                          <tr className="font-semibold bg-base-200">
                            <td colSpan={5}>Total Interventions</td>
                            <td className="text-right">{formatAr(bonus.details.total_interv)} Ar</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="border-t pt-4 mt-4">
                    <h4 className="font-semibold text-sm mb-3">Récapitulatif</h4>
                    <div className="flex items-center justify-between text-sm text-base-content/60 mb-1">
                      <span>Prime exceptionnelle</span>
                      <span>{formatAr(bonus.details.exceptionnelle || 0)} Ar</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-base-content/60 mb-3">
                      <span>Prime ponctuelle</span>
                      <span>{formatAr(bonus.details.ponctuelle || 0)} Ar</span>
                    </div>
                    <div className="flex items-center justify-between text-lg font-bold text-blue-600 border-t pt-3">
                      <span>Total Général</span>
                      <span>{formatAr(bonus.total_amount)} Ar</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  <div className="stat bg-base-200 rounded-box p-4">
                    <div className="stat-title">Jours d'astreinte</div>
                    <div className="stat-value text-lg">{bonus.nb_jours_astreinte ?? 0}</div>
                  </div>
                  <div className="stat bg-base-200 rounded-box p-4">
                    <div className="stat-title">Taux journalier</div>
                    <div className="stat-value text-lg">{bonus.taux_jour ?? '—'} Ar</div>
                  </div>
                  <div className="stat bg-base-200 rounded-box p-4">
                    <div className="stat-title">Montant astreinte</div>
                    <div className="stat-value text-lg">{bonus.prime_astreinte_amount ?? '—'} Ar</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {bonus.bonus_type === 'commission' && (
          <div className="card bg-base-100 shadow">
            <div className="card-body">
              <div className="flex items-center justify-between mb-4">
                <h2 className="card-title text-lg">Détails commission</h2>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="stat bg-base-200 rounded-box p-4">
                  <div className="stat-title">Commission par vente</div>
                  <div className="stat-value text-lg">{formatAr(bonus.taux_commission ?? bonus.details?.rate ?? 0)} Ar</div>
                </div>
                <div className="stat bg-base-200 rounded-box p-4">
                  <div className="stat-title">Total commission</div>
                  <div className="stat-value text-lg text-blue-600">{formatAr(bonus.total_amount)} Ar</div>
                </div>
              </div>

              {bonus.details?.sales && bonus.details.sales.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Désignation</th>
                        <th>Nombre</th>
                        <th>Description</th>
                        <th className="text-right">Montant (Ar)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonus.details.sales.map((sale, i) => {
                        const montant = (parseFloat(sale.nombre) || 0) * (bonus.details.rate || 0);
                        return (
                          <tr key={i}>
                            <td>{sale.designation || '—'}</td>
                            <td>{sale.nombre ?? 0}</td>
                            <td className="text-base-content/60 text-sm">{sale.description || '—'}</td>
                            <td className="text-right font-medium">{formatAr(montant)}</td>
                          </tr>
                        );
                      })}
                      <tr className="font-semibold bg-base-200">
                        <td colSpan={3}>Total commission</td>
                        <td className="text-right">{formatAr(bonus.total_amount)} Ar</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center text-base-content/60 py-4">
                  {bonus.ca_realise ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="stat bg-base-200 rounded-box p-4">
                        <div className="stat-title">CA réalisé</div>
                        <div className="stat-value text-lg">{formatAr(bonus.ca_realise)} Ar</div>
                      </div>
                      <div className="stat bg-base-200 rounded-box p-4">
                        <div className="stat-title">CA objectif</div>
                        <div className="stat-value text-lg">{formatAr(bonus.ca_objectif ?? 0)} Ar</div>
                      </div>
                    </div>
                  ) : (
                    'Détails non disponibles pour cette prime'
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="card bg-base-100 shadow">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">Historique des validations</h2>
            <Timeline items={validations} />
          </div>
        </div>

        {step && (
          <div className="flex gap-3 justify-end">
            {bonus.was_rejected ? (
              <Link to={`/bonuses/edit/${bonus.id}`} className="btn btn-warning btn-lg">
                <EditIcon className="w-5 h-5" /> Modifier
              </Link>
            ) : (
              <button className="btn btn-success btn-lg" onClick={() => handleValidate(step)}>
                <CheckIcon className="w-5 h-5" /> Valider
              </button>
            )}
            {user?.is_dg && (
              <button className="btn btn-error btn-lg" onClick={() => setShowRejectModal(true)}>
                <XCircleIcon className="w-5 h-5" /> Rejeter
              </button>
            )}
          </div>
        )}
      </div>

      <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)} title="Rejeter la prime" size="md">
        <p className="text-sm text-base-content/60 mb-4">
          La prime sera remise au statut <strong>Initialisé</strong> et le validateur N+1 pourra la modifier.
        </p>
        <textarea
          className="textarea textarea-bordered w-full min-h-[100px]"
          placeholder="Motif du rejet (obligatoire)"
          value={motifRejet}
          onChange={(e) => setMotifRejet(e.target.value)}
        />
        <div className="flex justify-end gap-3 mt-4">
          <button className="btn btn-ghost" onClick={() => { setShowRejectModal(false); setMotifRejet(''); }}>
            Annuler
          </button>
          <button className="btn btn-error" onClick={handleReject} disabled={!motifRejet.trim()}>
            Confirmer le rejet
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default BonusDetail;
