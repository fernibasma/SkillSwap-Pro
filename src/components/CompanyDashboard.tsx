import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  Lock,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { Challenge, ChallengeSubmission, SubscriptionSummary, TalentProfile } from '../types/index';

interface CompanyDashboardProps {
  activeTab: string;
  subscriptionSummary: SubscriptionSummary | null;
  onNavigateTab: (tab: string) => void;
  onStartMessage: (userId: string) => void;
  onRefreshNotifications: () => void;
}

export function CompanyDashboard({
  activeTab,
  subscriptionSummary,
  onNavigateTab,
  onStartMessage,
  onRefreshNotifications,
}: CompanyDashboardProps) {
  const { user } = useAuth();
  const hasActiveAccess = user?.role === 'admin' || Boolean(subscriptionSummary?.hasActiveAccess);
  const [talents, setTalents] = useState<TalentProfile[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Talent discovery filters & drawer
  const [talentSearch, setTalentSearch] = useState('');
  const [selectedTalent, setSelectedTalent] = useState<TalentProfile | null>(null);

  // Challenge creation form
  const [showCreateChallenge, setShowCreateChallenge] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Développement Web');
  const [difficulty, setDifficulty] = useState<'Débutant' | 'Intermédiaire' | 'Avancé'>('Intermédiaire');
  const [deadline, setDeadline] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [reward, setReward] = useState('');
  const [summary, setSummary] = useState('');
  const [brief, setBrief] = useState('');

  // Evaluation modal
  const [evalTarget, setEvalTarget] = useState<ChallengeSubmission | null>(null);
  const [evalScore, setEvalScore] = useState(85);
  const [evalStatus, setEvalStatus] = useState<'approved' | 'needs_revision'>('approved');
  const [evalFeedback, setEvalFeedback] = useState('');

  async function loadAll() {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiRequest<{ talents: TalentProfile[] }>('/api/talents'),
        apiRequest<{ challenges: Challenge[] }>('/api/challenges'),
        apiRequest<{ submissions: ChallengeSubmission[] }>('/api/submissions'),
      ]);
      if (results[0].status === 'fulfilled') {
        setTalents(results[0].value.talents);
      } else if (results[0].reason instanceof ApiError && results[0].reason.status === 402) {
        setTalents([]);
      }
      if (results[1].status === 'fulfilled') {
        setChallenges(results[1].value.challenges.filter((c) => c.companyId === user?.id || user?.role === 'admin'));
      }
      if (results[2].status === 'fulfilled') {
        setSubmissions(results[2].value.submissions);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user?.id, subscriptionSummary?.hasActiveAccess]);

  const filteredTalents = useMemo(() => {
    const q = talentSearch.trim().toLowerCase();
    return talents.filter((t) => {
      if (!q) return true;
      const inProfile =
        t.profile.fullName.toLowerCase().includes(q) ||
        t.profile.university.toLowerCase().includes(q) ||
        t.profile.major.toLowerCase().includes(q) ||
        t.profile.city.toLowerCase().includes(q);
      const inSkills = t.skills.some((s) => s.skillName.toLowerCase().includes(q));
      return inProfile || inSkills;
    });
  }, [talents, talentSearch]);

  const pendingSubmissions = useMemo(
    () => submissions.filter((s) => s.status === 'submitted'),
    [submissions]
  );

  async function handleCreateChallenge(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ challenge: Challenge }>('/api/challenges', {
        method: 'POST',
        body: { title, category, difficulty, summary, brief, reward, deadline },
      });
      setChallenges((prev) => [res.challenge, ...prev]);
      setTitle('');
      setSummary('');
      setBrief('');
      setReward('');
      setShowCreateChallenge(false);
      setFeedbackBanner('Défi pratique publié et visible pour tous les étudiants.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la publication.');
    }
  }

  async function handleToggleChallengeStatus(ch: Challenge) {
    const nextStatus = ch.status === 'open' ? 'closed' : 'open';
    try {
      const res = await apiRequest<{ challenge: Challenge }>(`/api/challenges/${ch.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setChallenges((prev) => prev.map((c) => (c.id === ch.id ? res.challenge : c)));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  async function handleDeleteChallenge(id: string) {
    try {
      await apiRequest(`/api/challenges/${id}`, { method: 'DELETE' });
      setChallenges((prev) => prev.filter((c) => c.id !== id));
      setSubmissions((prev) => prev.filter((s) => s.challengeId !== id));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function handleEvaluateSubmission(e: React.FormEvent) {
    e.preventDefault();
    if (!evalTarget) return;
    setErrorBanner(null);
    try {
      const res = await apiRequest<{ submission: ChallengeSubmission }>(
        `/api/submissions/${evalTarget.id}/evaluate`,
        {
          method: 'PATCH',
          body: { score: evalScore, status: evalStatus, feedback: evalFeedback },
        }
      );
      setSubmissions((prev) => prev.map((s) => (s.id === evalTarget.id ? res.submission : s)));
      setEvalTarget(null);
      setEvalFeedback('');
      setFeedbackBanner(`Évaluation enregistrée pour ${evalTarget.studentName}.`);
      onRefreshNotifications();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Erreur lors de l'évaluation.");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-white/10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-xl border border-[#F472B6]/15 bg-[#160D27]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {feedbackBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#F472B6]/40 bg-[#F472B6]/10 px-4 py-3 text-sm text-[#F472B6]">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {feedbackBanner}
          </span>
          <button type="button" onClick={() => setFeedbackBanner(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#FCA5A5]">
          <span>{errorBanner}</span>
          <button type="button" onClick={() => setErrorBanner(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {!hasActiveAccess && subscriptionSummary !== null && (
        <div className="rounded-2xl border border-[#F472B6]/40 bg-gradient-to-r from-[#28123F] to-[#1A0D2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-[#F472B6] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-display text-sm font-semibold text-white">
                {subscriptionSummary.subscription?.status === 'expired'
                  ? 'Votre abonnement entreprise a expiré'
                  : 'Abonnement entreprise requis'}
              </p>
              <p className="text-xs text-[#DFD5EC] mt-1">
                Choisissez une offre mensuelle ou annuelle pour accéder à la base de talents, publier des défis et
                contacter les étudiants.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('subscription')}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            {subscriptionSummary.subscription?.status === 'expired' ? 'Renouveler mon offre' : 'Voir les offres'}
          </button>
        </div>
      )}

      {!hasActiveAccess &&
      subscriptionSummary !== null &&
      ['talents', 'challenges'].includes(activeTab) ? (
        <div className="rounded-2xl border border-[#F472B6]/25 bg-[#160D27] p-8 text-center space-y-4">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F472B6]/15 text-[#F472B6]">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-bold text-white">
            Espace Entreprise réservé aux comptes abonnés
          </h2>
          <p className="mx-auto max-w-lg text-sm text-[#B8ADC8]">
            {subscriptionSummary.subscription?.status === 'expired'
              ? 'Votre abonnement entreprise a expiré. Renouvelez-le pour consulter les portfolios étudiants et publier vos challenges.'
              : 'Sélectionnez notre offre mensuelle ou annuelle dans « Mon abonnement » pour débloquer la découverte des talents et la gestion des défis.'}
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('subscription')}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-6 py-3 text-sm font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Choisir ou renouveler mon offre
          </button>
        </div>
      ) : null}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                {user?.companyName || user?.fullName}
              </h1>
              <p className="text-sm text-[#B8ADC8]">
                {user?.sector ? `${user.sector} · ` : ''}Espace partenaire entreprise
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('talents')}
                className="rounded-lg border border-white/15 bg-[#160D27] px-4 py-2 text-xs font-medium text-white hover:border-[#F472B6] cursor-pointer"
              >
                Explorer les talents
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigateTab('challenges');
                  setShowCreateChallenge(true);
                }}
                className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
              >
                Publier un défi
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Talents étudiants actifs</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{talents.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">Profils universitaires</p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Défis publiés</p>
              <p className="font-mono-tabular text-2xl font-semibold text-[#F472B6]">{challenges.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {challenges.filter((c) => c.status === 'open').length} ouvert(s)
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Soumissions reçues</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{submissions.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">{pendingSubmissions.length} à évaluer</p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Candidats approuvés</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">
                {submissions.filter((s) => s.status === 'approved').length}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">Évaluations validées</p>
            </div>
          </div>

          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-semibold text-white">
                Soumissions en attente d’évaluation
              </h2>
              <button
                type="button"
                onClick={() => onNavigateTab('challenges')}
                className="text-xs text-[#F472B6] hover:underline cursor-pointer"
              >
                Gérer les défis
              </button>
            </div>
            {pendingSubmissions.length === 0 ? (
              <p className="text-sm text-[#8D7FA3] py-4">Toutes les soumissions reçues ont été évaluées.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {pendingSubmissions.map((sub) => (
                  <div key={sub.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">
                        {sub.studentName} · {sub.challengeTitle}
                      </p>
                      <p className="text-xs text-[#B8ADC8]">
                        {sub.studentUniversity || 'Université'} · {sub.summary.slice(0, 100)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEvalTarget(sub);
                        setEvalScore(sub.score ?? 85);
                        setEvalFeedback(sub.feedback || '');
                      }}
                      className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-1.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
                    >
                      Évaluer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: TALENTS */}
      {activeTab === 'talents' && hasActiveAccess && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Découverte de talents universitaires</h1>
              <p className="text-sm text-[#B8ADC8]">
                Recherchez par compétence, université ou filière et consultez les portfolios vérifiés.
              </p>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
              <input
                type="text"
                value={talentSearch}
                onChange={(e) => setTalentSearch(e.target.value)}
                placeholder="Compétence, université, nom..."
                className="w-full rounded-lg border border-white/12 bg-[#160D27] py-2 pl-9 pr-3 text-xs text-white placeholder-[#64748B] focus:border-[#F472B6] focus:outline-none"
              />
            </div>
          </div>

          {filteredTalents.length === 0 ? (
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-10 text-center">
              <Users className="h-8 w-8 text-[#8D7FA3] mx-auto mb-2" />
              <p className="text-sm font-medium text-white">Aucun profil étudiant trouvé</p>
              <p className="text-xs text-[#B8ADC8] mt-1">
                Les étudiants inscrits apparaîtront ici avec leurs compétences et projets.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredTalents.map((t) => {
                const offered = t.skills.filter((s) => s.mode === 'offered');
                return (
                  <div
                    key={t.profile.id}
                    className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <h2 className="font-display text-base font-semibold text-white">{t.profile.fullName}</h2>
                      <p className="text-xs text-[#F472B6] mt-0.5">
                        {t.profile.university || 'Étudiant'}
                        {t.profile.major ? ` · ${t.profile.major}` : ''}
                      </p>
                      {t.profile.bio && (
                        <p className="text-xs text-[#B8ADC8] mt-2 line-clamp-2">{t.profile.bio}</p>
                      )}
                      <div className="mt-3 pt-3 border-t border-white/8 text-xs text-[#CBD5E1] space-y-1">
                        <p>
                          Compétences :{' '}
                          {offered.length > 0
                            ? offered
                                .slice(0, 3)
                                .map((s) => s.skillName)
                                .join(' · ')
                            : 'Profil en cours de complétion'}
                        </p>
                        <p className="font-mono-tabular text-[#8D7FA3]">
                          {t.portfolio.length} projet(s) · {t.completedExchangesCount} échange(s)
                          {t.averageScore !== null ? ` · Moy. défi ${t.averageScore}/100` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTalent(t)}
                        className="flex-1 rounded-lg border border-white/15 bg-[#0D0716] px-3 py-2 text-xs font-medium text-white hover:border-[#F472B6] cursor-pointer"
                      >
                        Voir le dossier
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartMessage(t.profile.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-3 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Contacter
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Talent Detail Modal */}
          {selectedTalent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-xl border border-white/15 bg-[#160D27] p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-xl font-bold text-white">
                      {selectedTalent.profile.fullName}
                    </h3>
                    <p className="text-sm text-[#F472B6]">
                      {selectedTalent.profile.university} · {selectedTalent.profile.major}
                      {selectedTalent.profile.city ? ` · ${selectedTalent.profile.city}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTalent(null)}
                    className="text-[#B8ADC8] hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {selectedTalent.profile.bio && (
                  <p className="text-sm text-[#CBD5E1]">{selectedTalent.profile.bio}</p>
                )}

                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">Compétences déclarées</h4>
                  {selectedTalent.skills.length === 0 ? (
                    <p className="text-xs text-[#8D7FA3]">Aucune compétence renseignée.</p>
                  ) : (
                    <div className="divide-y divide-white/8 border-t border-b border-white/8">
                      {selectedTalent.skills.map((s) => (
                        <div key={s.id} className="py-2 flex items-center justify-between text-xs">
                          <span className="text-white font-medium">{s.skillName}</span>
                          <span className="text-[#B8ADC8]">
                            {s.mode === 'offered' ? 'Maîtrisée' : 'Recherchée'} · {s.level}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-white mb-2">
                    Portfolio ({selectedTalent.portfolio.length})
                  </h4>
                  {selectedTalent.portfolio.length === 0 ? (
                    <p className="text-xs text-[#8D7FA3]">Aucun projet publié.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedTalent.portfolio.map((p) => (
                        <div key={p.id} className="rounded-lg border border-[#F472B6]/15 bg-[#0D0716] p-3">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-white">{p.title}</span>
                            <span className="font-mono-tabular text-[#8D7FA3]">{p.completedAt}</span>
                          </div>
                          <p className="text-xs text-[#B8ADC8] mt-1">{p.description}</p>
                          {p.projectUrl && (
                            <a
                              href={p.projectUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-[#F472B6] mt-2 hover:underline"
                            >
                              Ouvrir le lien <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const id = selectedTalent.profile.id;
                      setSelectedTalent(null);
                      onStartMessage(id);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                  >
                    <MessageSquare className="h-4 w-4" /> Envoyer un message
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: CHALLENGES & SUBMISSIONS */}
      {activeTab === 'challenges' && hasActiveAccess && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Gestion des défis et évaluations</h1>
              <p className="text-sm text-[#B8ADC8]">
                Créez vos cas pratiques et évaluez les livrables des étudiants.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateChallenge((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {showCreateChallenge ? 'Fermer' : 'Nouveau défi'}
            </button>
          </div>

          {showCreateChallenge && (
            <form
              onSubmit={handleCreateChallenge}
              className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4"
            >
              <h2 className="font-display text-base font-semibold text-white">Publier un défi pratique</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Titre du défi</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ex. Conception d'une API de paiement temps réel"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Catégorie</label>
                  <input
                    type="text"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Niveau</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  >
                    <option value="Débutant">Débutant</option>
                    <option value="Intermédiaire">Intermédiaire</option>
                    <option value="Avancé">Avancé</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Date limite</label>
                  <input
                    type="date"
                    required
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Opportunité / Récompense (stage, entretien, mentorat)
                </label>
                <input
                  type="text"
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder="Ex. Entretien prioritaire stage PFE + revue technique"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Résumé court</label>
                <input
                  type="text"
                  required
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Enjeu principal du défi en 1 à 2 phrases"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Cahier des charges détaillé</label>
                <textarea
                  rows={4}
                  required
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="Livrables attendus, contraintes techniques, critères d'évaluation..."
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                >
                  Publier le défi
                </button>
              </div>
            </form>
          )}

          {challenges.length === 0 ? (
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-10 text-center">
              <Award className="h-8 w-8 text-[#8D7FA3] mx-auto mb-2" />
              <p className="text-sm font-medium text-white">Vous n’avez pas encore publié de défi</p>
              <p className="text-xs text-[#B8ADC8] mt-1">
                Créez un premier défi pratique pour évaluer les compétences des étudiants.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {challenges.map((ch) => {
                const chSubs = submissions.filter((s) => s.challengeId === ch.id);
                return (
                  <div key={ch.id} className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-[#F472B6] mb-1">
                          <span>{ch.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ch.difficulty}</span>
                          <span aria-hidden="true">·</span>
                          <span>{ch.status === 'open' ? 'Ouvert' : 'Fermé'}</span>
                        </div>
                        <h3 className="font-display text-lg font-semibold text-white">{ch.title}</h3>
                        <p className="text-xs text-[#B8ADC8] mt-1">Échéance : {ch.deadline}</p>
                        <p className="text-sm text-[#CBD5E1] mt-2">{ch.summary}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleChallengeStatus(ch)}
                          className="rounded-lg border border-white/15 bg-[#0D0716] px-3 py-1.5 text-xs text-white hover:border-[#F472B6] cursor-pointer"
                        >
                          {ch.status === 'open' ? 'Clôturer' : 'Réouvrir'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteChallenge(ch.id)}
                          aria-label={`Supprimer ${ch.title}`}
                          className="rounded-lg border border-white/12 p-1.5 text-[#8D7FA3] hover:text-[#FCA5A5] cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-[#F472B6]/15 pt-4">
                      <p className="text-xs font-semibold text-white mb-3">
                        Soumissions reçues ({chSubs.length})
                      </p>
                      {chSubs.length === 0 ? (
                        <p className="text-xs text-[#8D7FA3]">Aucune soumission étudiante pour ce défi.</p>
                      ) : (
                        <div className="divide-y divide-white/8">
                          {chSubs.map((sub) => (
                            <div
                              key={sub.id}
                              className="py-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="font-semibold text-white">{sub.studentName}</span>
                                  <span className="text-[#B8ADC8]">{sub.studentUniversity}</span>
                                  {sub.score !== null && (
                                    <span className="font-mono-tabular text-[#F472B6] font-semibold">
                                      {sub.score}/100
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-[#CBD5E1] mt-1">{sub.summary}</p>
                                <a
                                  href={sub.solutionUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-[#F472B6] mt-1 hover:underline"
                                >
                                  Voir la solution <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEvalTarget(sub);
                                    setEvalScore(sub.score ?? 85);
                                    setEvalStatus(sub.status === 'needs_revision' ? 'needs_revision' : 'approved');
                                    setEvalFeedback(sub.feedback || '');
                                  }}
                                  className="rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-3 py-1.5 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                                >
                                  {sub.score !== null ? 'Modifier note' : 'Évaluer'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onStartMessage(sub.studentId)}
                                  className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
                                >
                                  Contacter
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Evaluation Modal */}
          {evalTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <form
                onSubmit={handleEvaluateSubmission}
                className="w-full max-w-md rounded-xl border border-white/15 bg-[#160D27] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Évaluer {evalTarget.studentName}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEvalTarget(null)}
                    className="text-[#B8ADC8] hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Note sur 100</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    required
                    value={evalScore}
                    onChange={(e) => setEvalScore(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Décision</label>
                  <select
                    value={evalStatus}
                    onChange={(e) => setEvalStatus(e.target.value as 'approved' | 'needs_revision')}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  >
                    <option value="approved">Solution approuvée</option>
                    <option value="needs_revision">Révision suggérée</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Commentaire technique</label>
                  <textarea
                    rows={3}
                    required
                    value={evalFeedback}
                    onChange={(e) => setEvalFeedback(e.target.value)}
                    placeholder="Points forts, qualité du code, axes d'amélioration..."
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEvalTarget(null)}
                    className="rounded-lg border border-white/12 px-4 py-2 text-xs text-[#CBD5E1] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                  >
                    Enregistrer l’évaluation
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
