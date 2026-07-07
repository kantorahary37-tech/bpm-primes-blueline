import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getBonus, getBonusValidations, validateBonus } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Timeline from '../components/Timeline';
import Modal from '../components/Modal';
import { ArrowLeftIcon, CheckIcon, XCircleIcon, EditIcon, CalendarIcon, MoonIcon, ChartIcon, EyeIcon, ClipboardIcon, DownloadIcon } from '../components/Icons';

const typeIcons = {
  mensuel: CalendarIcon,
  astreinte: MoonIcon,
  commission: ChartIcon,
}

const typeColors = {
  mensuel: 'blue',
  astreinte: 'violet',
  commission: 'emerald',
}

const EXPORT_COLUMNS = {
  common: [
    "Matricule", "Nom", "Departement", "TypePrime",
    "DateDebut", "DateFin", "MontantTotal", "Statut",
    "DejaRejete", "CreePar", "DateCreation",
  ],
  mensuel: ["Score", "Quantitatif", "Qualitatif"],
  astreinte: ["NbDisponibilite", "TotalDisponibilite", "TotalInterventions", "Exceptionnelle", "Ponctuelle"],
  commission: ["NbVentes"],
}

const BonusDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bonus, setBonus] = useState(null);
  const [validations, setValidations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showValidateModal, setShowValidateModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportColumns, setExportColumns] = useState([]);
  const [motifRejet, setMotifRejet] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

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

  const handleValidate = async () => {
    const step = getValidStep(bonus.status);
    if (!step) return;
    setShowValidateModal(true);
  };

  const confirmValidate = async () => {
    const step = getValidStep(bonus.status);
    if (!step) return;
    try {
      await validateBonus(bonus.id, { action: 'VALIDER' }, step);
      showToast('success', 'Prime validée avec succès !');
      setShowValidateModal(false);
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
      showToast('error', err.response?.data?.detail || 'Erreur lors de la validation');
      setShowValidateModal(false);
    }
  };

  const handleReject = async () => {
    if (!motifRejet.trim()) return;
    try {
      await validateBonus(bonus.id, { action: 'REJETER', motif_rejet: motifRejet }, getValidStep(bonus.status));
      showToast('success', 'Prime rejetée — retour au statut Initialisé');
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
      showToast('error', err.response?.data?.detail || 'Erreur lors du rejet');
    }
  };

  const getValidStep = (status) => {
    if (!user) return null;
    if (user.is_validator_n1 && status === 'Initialisé') return 'N1';
    if (user.is_directeur && status === 'En attente Directeur') return 'DIRECTEUR';
    if (user.is_dg && status === 'En attente DG') return 'DG';
    return null;
  };

    const statusLabel = (bonus) => {
      if (!bonus) return '';
      if (bonus.status === 'En attente Directeur') return `En attente Directeur ${bonus.employee?.department || ''}`;
      return bonus.status;
    };

    const getBadgeClass = (status) => {
      const map = {
        'Initialisé': 'bg-orange-100 text-orange-700',
        'En attente Directeur': 'bg-purple-100 text-purple-700',
        'En attente DG': 'bg-amber-100 text-amber-700',
        'Prime validée': 'bg-emerald-100 text-emerald-700',
        'Prime rejetée': 'bg-red-100 text-red-700',
      };
      return map[status] || 'bg-gray-100 text-gray-600';
    };

  const formatDate = (d) => new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  const formatAr = (n) => (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 2 });

  const InfoRow = ({ label, value, big }) => (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className={`${big ? 'text-xl font-bold' : 'font-medium'} text-gray-900`}>{value}</p>
    </div>
  )

  const InfoCard = ({ icon: Icon, children, className = '' }) => (
    <div className={`rounded-xl border border-gray-200 bg-white p-5 ${className}`}>
      {Icon && (
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Icon className="w-3.5 h-3.5" />
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{children}</h3>
        </div>
      )}
    </div>
  )

  const Section = ({ title, icon: Icon, children }) => (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
        {Icon && <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></div>}
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )

  const EvaluationTable = ({ label, items, totalEval, totalValue, primeMax, color }) => {
    if (!items || items.length === 0) return null;
    const pct = primeMax > 0 ? (totalValue / primeMax) * 100 : 0;
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold text-sm text-gray-900">{label}</h4>
          <span className="text-xs text-gray-600">{totalEval}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="text-left py-2 pr-2 font-medium text-gray-600 text-xs">Critères</th>
                <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Objectif</th>
                <th className="text-center py-2 px-2 font-medium text-gray-600 text-xs">Note</th>
                <th className="text-right py-2 pl-2 font-medium text-gray-600 text-xs">Valeur (Ar)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-2 pr-2 text-gray-900">{item.criteria}</td>
                  <td className="py-2 px-2 text-center text-gray-800">{item.objective}</td>
                  <td className="py-2 px-2 text-center font-medium text-gray-900">{item.evaluation ?? 0}</td>
                  <td className="py-2 pl-2 text-right font-medium text-gray-900">{formatAr(item.value)}</td>
                </tr>
              ))}
              <tr className="font-semibold bg-gray-50">
                <td className="py-2 pr-2 text-gray-900">Total {label}</td>
                <td colSpan={2}></td>
                <td className="py-2 pl-2 text-right text-blue-600">{formatAr(totalValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (!bonus) {
    return (
      <div className="page-container text-center">
        <h1 className="text-2xl font-bold mb-4">Prime introuvable</h1>
        <Link to="/bonuses" className="btn btn-primary">Retour à la liste</Link>
      </div>
    );
  }

  const step = getValidStep(bonus.status);
  const TypeIcon = typeIcons[bonus.bonus_type] || ClipboardIcon

  return (
    <div className="page-container max-w-4xl">
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer"><ArrowLeftIcon className="w-5 h-5 text-gray-500" /></button>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <TypeIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Prime {typeIcons[bonus.bonus_type] ? ['Mensuelle', 'd\'Astreinte', 'Commission'][['mensuel', 'astreinte', 'commission'].indexOf(bonus.bonus_type)] : bonus.bonus_type}</h1>
            <p className="text-xs text-gray-400">{bonus.employee?.name || 'N/A'}</p>
          </div>
        </div>
        <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full ${getBadgeClass(bonus.status)} ${bonus.was_rejected ? 'ring-1 ring-red-400' : ''}`}>
          {statusLabel(bonus)}
        </span>
        <button onClick={() => {
          const allCols = [...EXPORT_COLUMNS.common, ...(EXPORT_COLUMNS[bonus.bonus_type] || [])]
          setExportColumns(allCols)
          setShowExportModal(true)
        }} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600" title="Exporter cette prime">
          <DownloadIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        <Section title="Informations générales">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            <InfoRow label="Employé" value={bonus.employee?.name || 'N/A'} />
            <InfoRow label="Département" value={bonus.employee?.department || 'N/A'} />
            <InfoRow label="Matricule" value={bonus.employee?.matricule || 'N/A'} />
            <InfoRow label="Type de prime" value={
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                <span className={`w-1.5 h-1.5 rounded-full bg-${typeColors[bonus.bonus_type] || 'blue'}-500`} />
                {typeIcons[bonus.bonus_type] ? ['Mensuelle', 'Astreinte', 'Commission'][['mensuel', 'astreinte', 'commission'].indexOf(bonus.bonus_type)] : bonus.bonus_type}
              </span>
            } />
            <InfoRow label="Période" value={`${formatDate(bonus.start_date)} → ${formatDate(bonus.end_date)}`} />
            <InfoRow label="Créé le" value={formatDate(bonus.created_at)} />
          </div>
        </Section>

        <Section title="Montant" icon={ClipboardIcon}>
          <div className="flex items-center gap-4">
            <div className="flex-1 p-4 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
              <p className="text-xs text-blue-600 font-medium mb-1">Montant total</p>
              <p className="text-2xl font-bold text-blue-700">{bonus.total_amount} Ar</p>
            </div>
            {bonus.bonus_type === 'mensuel' && bonus.details?.prime_max && (
              <div className="flex-1 p-4 rounded-xl bg-gray-50 border border-gray-300">
                <p className="text-xs text-gray-700 font-medium mb-1">Prime maximum</p>
                <p className="text-2xl font-bold text-gray-900">{formatAr(bonus.details.prime_max)} Ar</p>
              </div>
            )}
            {bonus.performance_score && (
              <div className="flex-1 p-4 rounded-xl bg-gray-50 border border-gray-300">
                <p className="text-xs text-gray-700 font-medium mb-1">Score</p>
                <p className="text-2xl font-bold text-gray-900">{bonus.performance_score}%</p>
              </div>
            )}
          </div>
        </Section>

        {bonus.bonus_type === 'mensuel' && bonus.details && (
          <Section title="Évaluation mensuelle" icon={ChartIcon}>
            <div className="space-y-6">
              <EvaluationTable
                label="Quantitatif"
                items={bonus.details.quantitative}
                totalEval={bonus.details.quantitative?.reduce((s, i) => s + (i.evaluation || 0), 0)}
                totalValue={bonus.details.total_quantitative || 0}
                primeMax={bonus.details.prime_max || bonus.total_amount}
                color="bg-blue-500"
              />
              <div className="border-t border-gray-300" />
              <EvaluationTable
                label="Qualitatif"
                items={bonus.details.qualitative}
                totalEval={bonus.details.qualitative?.reduce((s, i) => s + (i.evaluation || 0), 0)}
                totalValue={bonus.details.total_qualitative || 0}
                primeMax={bonus.details.prime_max || bonus.total_amount}
                color="bg-violet-500"
              />
              <div className="border-t-2 border-blue-200 pt-4 mt-4">
                <div className="flex items-center justify-between text-lg font-bold text-blue-700">
                  <span>Total général</span>
                  <span>{formatAr(bonus.total_amount)} / {formatAr(bonus.details.prime_max || bonus.total_amount)} Ar</span>
                </div>
              </div>
            </div>
          </Section>
        )}

        {bonus.bonus_type === 'astreinte' && bonus.details && (
          <Section title="Récapitulatif astreinte" icon={MoonIcon}>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-400">Semaines</p>
                <p className="font-semibold text-gray-900">{bonus.details.weeks || '—'}</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-400">Prime max / semaine</p>
                <p className="font-semibold text-gray-900">{formatAr(bonus.details.weekly_max)} Ar</p>
              </div>
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <p className="text-xs text-gray-400">Taux / intervention</p>
                <p className="font-semibold text-gray-900">{formatAr(bonus.details.intervention_rate)} Ar</p>
              </div>
            </div>

            <div className="space-y-1.5 mb-4 text-sm">
              {bonus.details.total_dispo > 0 && (
                <div className="flex items-center justify-between py-1 px-3 rounded-lg bg-blue-50/50">
                  <span className="text-gray-600">
                    Disponibilité <span className="text-gray-400 font-medium">
                      {bonus.details.disponibilites?.reduce((s, d) => s + (parseInt(d.nombre) || 0), 0)} sem
                    </span>
                  </span>
                  <span className="font-semibold text-gray-900">{formatAr(bonus.details.total_dispo)} Ar</span>
                </div>
              )}
              {bonus.details.total_interv > 0 && (
                <div className="flex items-center justify-between py-1 px-3 rounded-lg bg-violet-50/50">
                  <span className="text-gray-600">
                    Interventions <span className="text-gray-400 font-medium">{bonus.details.interventions?.length || 0} × {formatAr(bonus.details.intervention_rate)}</span>
                  </span>
                  <span className="font-semibold text-gray-900">{formatAr(bonus.details.total_interv)} Ar</span>
                </div>
              )}
              {(bonus.details.exceptionnelle || 0) > 0 && (
                <div className="flex items-center justify-between py-1 px-3">
                  <span className="text-gray-500">Exceptionnelle</span>
                  <span className="font-medium text-gray-900">{formatAr(bonus.details.exceptionnelle)} Ar</span>
                </div>
              )}
              {(bonus.details.ponctuelle || 0) > 0 && (
                <div className="flex items-center justify-between py-1 px-3">
                  <span className="text-gray-500">Ponctuelle</span>
                  <span className="font-medium text-gray-900">{formatAr(bonus.details.ponctuelle)} Ar</span>
                </div>
              )}
            </div>

            {bonus.details.interventions?.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm text-gray-700 mb-2">Détail des interventions</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-1.5 font-medium text-gray-400 text-xs">Date</th>
                        <th className="text-center py-1.5 font-medium text-gray-400 text-xs">Heure</th>
                        <th className="text-left py-1.5 font-medium text-gray-400 text-xs">Motif</th>
                        <th className="text-center py-1.5 font-medium text-gray-400 text-xs">Type</th>
                        <th className="text-center py-1.5 font-medium text-gray-400 text-xs">Ticket</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bonus.details.interventions.map((iv, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 text-gray-900 text-xs">{iv.date || '—'}</td>
                          <td className="py-1 text-center text-gray-500 text-xs">{iv.heure || '—'}</td>
                          <td className="py-1 text-gray-500 text-xs">{iv.motif || '—'}</td>
                          <td className="py-1 text-center text-xs">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                              iv.type === 'exceptionnelle' ? 'bg-amber-100 text-amber-700' :
                              iv.type === 'ponctuelle' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {iv.type === 'exceptionnelle' ? 'Exceptionnelle' : iv.type === 'ponctuelle' ? 'Ponctuelle' : 'Intervention'}
                            </span>
                          </td>
                          <td className="py-1 text-center text-xs font-mono">{iv.ticket || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        )}

        {bonus.bonus_type === 'commission' && (
          <Section title="Détails commission" icon={ChartIcon}>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-300">
                <p className="text-xs text-gray-600">Commission par vente</p>
                <p className="font-semibold text-gray-900">{formatAr(bonus.taux_commission ?? bonus.details?.rate ?? 0)} Ar</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <p className="text-xs text-emerald-600 font-medium">Total commission</p>
                <p className="font-semibold text-emerald-700">{formatAr(bonus.total_amount)} Ar</p>
              </div>
            </div>

            {bonus.details?.sales && bonus.details.sales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-300">
                      <th className="text-left py-2 font-medium text-gray-600 text-xs">Désignation</th>
                      <th className="text-center py-2 font-medium text-gray-600 text-xs">Nombre</th>
                      <th className="text-left py-2 font-medium text-gray-600 text-xs">Description</th>
                      <th className="text-right py-2 font-medium text-gray-600 text-xs">Montant (Ar)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bonus.details.sales.map((sale, i) => {
                      const montant = (parseFloat(sale.nombre) || 0) * (bonus.details.rate || 0);
                      return (
                        <tr key={i} className="border-b border-gray-200">
                          <td className="py-1.5 text-gray-900">{sale.designation || '—'}</td>
                          <td className="py-1.5 text-center">{sale.nombre ?? 0}</td>
                          <td className="py-1.5 text-gray-800 text-xs">{sale.description || '—'}</td>
                          <td className="py-1.5 text-right font-medium">{formatAr(montant)}</td>
                        </tr>
                      );
                    })}
                    <tr className="font-semibold bg-gray-50">
                      <td colSpan={3} className="py-1.5 text-gray-900">Total commission</td>
                      <td className="py-1.5 text-right text-emerald-600">{formatAr(bonus.total_amount)} Ar</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center text-gray-400 py-4 text-sm">
                {bonus.ca_realise ? (
                  <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-xs text-gray-400">CA réalisé</p>
                      <p className="font-semibold text-gray-900">{formatAr(bonus.ca_realise)} Ar</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                      <p className="text-xs text-gray-400">CA objectif</p>
                      <p className="font-semibold text-gray-900">{formatAr(bonus.ca_objectif ?? 0)} Ar</p>
                    </div>
                  </div>
                ) : (
                  'Détails non disponibles'
                )}
              </div>
            )}
          </Section>
        )}

        <Section title="Historique des validations" icon={EyeIcon}>
          <Timeline items={validations} />
        </Section>

        {step && (
          <div className="flex gap-3 justify-end pt-2">
            {bonus.status === 'Initialisé' && bonus.was_rejected ? (
              <Link to={`/bonuses/edit/${bonus.id}`} className="btn bg-amber-500 hover:bg-amber-600 text-white border-0">
                <EditIcon className="w-4 h-4" /> Modifier
              </Link>
            ) : (
              <button className="btn bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={handleValidate}>
                <CheckIcon className="w-4 h-4" /> Valider
              </button>
            )}
            {user?.is_dg && (
              <button className="btn bg-red-500 hover:bg-red-600 text-white border-0" onClick={() => setShowRejectModal(true)}>
                <XCircleIcon className="w-4 h-4" /> Rejeter
              </button>
            )}
          </div>
        )}
      </div>

      <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)} title="Rejeter la prime" size="md">
        <p className="text-sm text-gray-500 mb-4">
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
          <button className="btn bg-red-500 hover:bg-red-600 text-white border-0" onClick={handleReject} disabled={!motifRejet.trim()}>
            Confirmer le rejet
          </button>
        </div>
      </Modal>

      <Modal open={showValidateModal} onClose={() => setShowValidateModal(false)} title="Confirmer la validation" size="sm">
        <p className="text-sm text-gray-600 mb-6">Êtes-vous sûr de vouloir valider cette prime ?</p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setShowValidateModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
          <button onClick={confirmValidate} className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0">Valider</button>
        </div>
      </Modal>
      <Modal open={showExportModal} onClose={() => setShowExportModal(false)} title="Exporter la prime" size="lg">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Colonnes à inclure :</p>
            <div className="flex gap-3">
              <button onClick={() => {
                const all = [...EXPORT_COLUMNS.common, ...(EXPORT_COLUMNS[bonus?.bonus_type] || [])]
                setExportColumns(all)
              }} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">Tout</button>
              <button onClick={() => setExportColumns([])} className="text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors">Aucun</button>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">Commun</p>
            <div className="grid grid-cols-2 gap-2">
              {EXPORT_COLUMNS.common.map(col => {
                const selected = exportColumns.includes(col)
                return (
                  <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                    selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                    <input type="checkbox" checked={selected} onChange={() => {
                      setExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                    }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                    <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                  </label>
                )
              })}
            </div>
          </div>
          {(EXPORT_COLUMNS[bonus?.bonus_type] || []).length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                {bonus?.bonus_type === 'mensuel' ? 'Mensuel' : bonus?.bonus_type === 'astreinte' ? 'Astreinte' : 'Commission'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_COLUMNS[bonus?.bonus_type].map(col => {
                  const selected = exportColumns.includes(col)
                  return (
                    <label key={col} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
                      selected ? 'border-blue-300 bg-blue-50/60 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}>
                      <input type="checkbox" checked={selected} onChange={() => {
                        setExportColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])
                      }} className="checkbox checkbox-sm rounded border-gray-300 checked:bg-blue-600 checked:border-blue-600" />
                      <span className={`text-sm ${selected ? 'text-blue-700 font-medium' : 'text-gray-700'}`}>{col}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
              {exportColumns.length} / {EXPORT_COLUMNS.common.length + (EXPORT_COLUMNS[bonus?.bonus_type] || []).length}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setShowExportModal(false)} className="btn btn-sm btn-ghost">Annuler</button>
              <button onClick={() => {
                const token = localStorage.getItem('token')
                const cols = exportColumns.join(',')
                fetch(`/api/v1/bonuses/${bonus.id}/export?columns=${encodeURIComponent(cols)}`, { headers: { Authorization: `Bearer ${token}` } })
                  .then(r => r.blob())
                  .then(blob => {
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `prime_${bonus.id}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
                    a.click()
                    URL.revokeObjectURL(url)
                    setShowExportModal(false)
                  })
              }} className="btn btn-sm bg-blue-600 hover:bg-blue-700 text-white border-0">Exporter</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BonusDetail;
