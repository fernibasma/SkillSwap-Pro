import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FolderGit2,
  Lock,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { ApiError, apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  Challenge,
  ChallengeSubmission,
  PortfolioProject,
  Skill,
  SkillExchange,
  SkillLevel,
  SkillMode,
  SubscriptionSummary,
  UserSkill,
} from '../types/index';

interface StudentDashboardProps {
  activeTab: string;
  subscriptionSummary: SubscriptionSummary | null;
  onNavigateTab: (tab: string) => void;
  onStartMessage: (userId: string) => void;
  onRefreshNotifications: () => void;
}

const EXCHANGE_STATUS_LABEL: Record<SkillExchange['status'], string> = {
  pending: 'En attente',
  accepted: 'Accepté',
  rejected: 'Refusé',
  completed: 'Terminé',
};

const SUBMISSION_STATUS_LABEL: Record<ChallengeSubmission['status'], string> = {
  submitted: 'Soumis — en attente d’évaluation',
  approved: 'Approuvé par l’entreprise',
  needs_revision: 'Révision suggérée',
};

export function StudentDashboard({
  activeTab,
  subscriptionSummary,
  onNavigateTab,
  onStartMessage,
  onRefreshNotifications,
}: StudentDashboardProps) {
  const { user } = useAuth();
  const [skillsCatalog, setSkillsCatalog] = useState<Skill[]>([]);
  const [mySkills, setMySkills] = useState<UserSkill[]>([]);
  const [peerOfferedSkills, setPeerOfferedSkills] = useState<UserSkill[]>([]);
  const [exchanges, setExchanges] = useState<SkillExchange[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [submissions, setSubmissions] = useState<ChallengeSubmission[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const hasActiveAccess = user?.role === 'admin' || Boolean(subscriptionSummary?.hasActiveAccess);

  // Add skill form state
  const [newSkillId, setNewSkillId] = useState('');
  const [newSkillMode, setNewSkillMode] = useState<SkillMode>('offered');
  const [newSkillLevel, setNewSkillLevel] = useState<SkillLevel>('Intermédiaire');
  const [newSkillNotes, setNewSkillNotes] = useState('');

  // Exchange search & proposal modal state
  const [peerSearch, setPeerSearch] = useState('');
  const [peerCategoryFilter, setPeerCategoryFilter] = useState('all');
  const [proposalTarget, setProposalTarget] = useState<UserSkill | null>(null);
  const [proposalOfferedSkillId, setProposalOfferedSkillId] = useState('');
  const [proposalHours, setProposalHours] = useState(2);
  const [proposalMessage, setProposalMessage] = useState('');

  // Challenge filter & submission state
  const [challengeSearch, setChallengeSearch] = useState('');
  const [challengeDifficulty, setChallengeDifficulty] = useState('all');
  const [activeChallenge, setActiveChallenge] = useState<Challenge | null>(null);
  const [solutionUrl, setSolutionUrl] = useState('');
  const [solutionSummary, setSolutionSummary] = useState('');

  // Portfolio form state
  const [showPortfolioForm, setShowPortfolioForm] = useState(false);
  const [pfTitle, setPfTitle] = useState('');
  const [pfCategory, setPfCategory] = useState('Développement Web');
  const [pfTechnologies, setPfTechnologies] = useState('');
  const [pfDescription, setPfDescription] = useState('');
  const [pfUrl, setPfUrl] = useState('');
  const [pfDate, setPfDate] = useState(new Date().toISOString().slice(0, 10));

  async function loadAll() {
    if (!user) return;
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        apiRequest<{ skills: Skill[] }>('/api/skills'),
        apiRequest<{ userSkills: UserSkill[] }>(`/api/user-skills?userId=${encodeURIComponent(user.id)}`),
        apiRequest<{ userSkills: UserSkill[] }>('/api/user-skills?mode=offered'),
        apiRequest<{ exchanges: SkillExchange[] }>('/api/exchanges'),
        apiRequest<{ challenges: Challenge[] }>('/api/challenges'),
        apiRequest<{ submissions: ChallengeSubmission[] }>('/api/submissions'),
        apiRequest<{ projects: PortfolioProject[] }>(`/api/portfolio?studentId=${encodeURIComponent(user.id)}`),
      ]);
      if (results[0].status === 'fulfilled') {
        setSkillsCatalog(results[0].value.skills);
        if (results[0].value.skills.length > 0 && !newSkillId) {
          setNewSkillId(results[0].value.skills[0].id);
        }
      }
      if (results[1].status === 'fulfilled') setMySkills(results[1].value.userSkills);
      if (results[2].status === 'fulfilled') {
        setPeerOfferedSkills(results[2].value.userSkills.filter((s) => s.userId !== user.id));
      }
      if (results[3].status === 'fulfilled') {
        setExchanges(results[3].value.exchanges);
      } else if (results[3].reason instanceof ApiError && results[3].reason.status === 402) {
        setExchanges([]);
      }
      if (results[4].status === 'fulfilled') setChallenges(results[4].value.challenges);
      if (results[5].status === 'fulfilled') setSubmissions(results[5].value.submissions);
      if (results[6].status === 'fulfilled') setPortfolio(results[6].value.projects);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors du chargement des données.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [user?.id, subscriptionSummary?.hasActiveAccess]);

  const offeredByMe = useMemo(() => mySkills.filter((s) => s.mode === 'offered'), [mySkills]);
  const wantedByMe = useMemo(() => mySkills.filter((s) => s.mode === 'wanted'), [mySkills]);

  const pendingIncomingExchanges = useMemo(
    () => exchanges.filter((e) => e.recipientId === user?.id && e.status === 'pending'),
    [exchanges, user?.id]
  );

  const averageScore = useMemo(() => {
    const scored = submissions.filter((s) => s.score !== null);
    if (scored.length === 0) return null;
    return Math.round(scored.reduce((sum, s) => sum + (s.score || 0), 0) / scored.length);
  }, [submissions]);

  const categories = useMemo(
    () => Array.from(new Set(skillsCatalog.map((s) => s.category))),
    [skillsCatalog]
  );

  const filteredPeers = useMemo(() => {
    const q = peerSearch.trim().toLowerCase();
    return peerOfferedSkills.filter((item) => {
      const matchesCat = peerCategoryFilter === 'all' || item.skillCategory === peerCategoryFilter;
      const matchesQ =
        !q ||
        item.skillName.toLowerCase().includes(q) ||
        (item.userFullName || '').toLowerCase().includes(q) ||
        (item.userUniversity || '').toLowerCase().includes(q);
      return matchesCat && matchesQ;
    });
  }, [peerOfferedSkills, peerSearch, peerCategoryFilter]);

  const filteredChallenges = useMemo(() => {
    const q = challengeSearch.trim().toLowerCase();
    return challenges.filter((c) => {
      const matchesDiff = challengeDifficulty === 'all' || c.difficulty === challengeDifficulty;
      const matchesQ =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q);
      return matchesDiff && matchesQ;
    });
  }, [challenges, challengeSearch, challengeDifficulty]);

  async function handleAddUserSkill(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ userSkill: UserSkill }>('/api/user-skills', {
        method: 'POST',
        body: {
          skillId: newSkillId,
          mode: newSkillMode,
          level: newSkillLevel,
          notes: newSkillNotes,
        },
      });
      setMySkills((prev) => {
        const filtered = prev.filter((item) => item.id !== res.userSkill.id);
        return [res.userSkill, ...filtered];
      });
      setNewSkillNotes('');
      setFeedbackBanner('Compétence enregistrée dans votre profil.');
      await loadAll();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Impossible d'ajouter la compétence.");
    }
  }

  async function handleRemoveUserSkill(id: string) {
    setErrorBanner(null);
    try {
      await apiRequest(`/api/user-skills/${id}`, { method: 'DELETE' });
      setMySkills((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function handleCreateExchange(e: React.FormEvent) {
    e.preventDefault();
    if (!proposalTarget) return;
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const offeredSkillId = proposalOfferedSkillId || offeredByMe[0]?.skillId || skillsCatalog[0]?.id;
      const res = await apiRequest<{ exchange: SkillExchange }>('/api/exchanges', {
        method: 'POST',
        body: {
          recipientId: proposalTarget.userId,
          offeredSkillId,
          requestedSkillId: proposalTarget.skillId,
          proposedHours: proposalHours,
          message: proposalMessage,
        },
      });
      setExchanges((prev) => [res.exchange, ...prev]);
      setProposalTarget(null);
      setProposalMessage('');
      setFeedbackBanner(`Demande d’échange envoyée à ${proposalTarget.userFullName}.`);
      onRefreshNotifications();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la demande.');
    }
  }

  async function handleRespondExchange(exchangeId: string, status: 'accepted' | 'rejected' | 'completed') {
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ exchange: SkillExchange }>(`/api/exchanges/${exchangeId}`, {
        method: 'PATCH',
        body: { status },
      });
      setExchanges((prev) => prev.map((e) => (e.id === exchangeId ? res.exchange : e)));
      setFeedbackBanner(`Statut mis à jour : ${EXCHANGE_STATUS_LABEL[status]}.`);
      onRefreshNotifications();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function handleSubmitSolution(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChallenge) return;
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ submission: ChallengeSubmission }>('/api/submissions', {
        method: 'POST',
        body: {
          challengeId: activeChallenge.id,
          solutionUrl,
          summary: solutionSummary,
        },
      });
      setSubmissions((prev) => [res.submission, ...prev.filter((s) => s.challengeId !== activeChallenge.id)]);
      setActiveChallenge(null);
      setSolutionUrl('');
      setSolutionSummary('');
      setFeedbackBanner('Votre solution a été transmise à l’entreprise.');
      onRefreshNotifications();
      await loadAll();
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la soumission.');
    }
  }

  async function handleCreatePortfolio(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ project: PortfolioProject }>('/api/portfolio', {
        method: 'POST',
        body: {
          title: pfTitle,
          category: pfCategory,
          description: pfDescription,
          technologies: pfTechnologies,
          projectUrl: pfUrl,
          completedAt: pfDate,
        },
      });
      setPortfolio((prev) => [res.project, ...prev]);
      setPfTitle('');
      setPfTechnologies('');
      setPfDescription('');
      setPfUrl('');
      setShowPortfolioForm(false);
      setFeedbackBanner('Projet ajouté à votre portfolio.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Impossible d'ajouter le projet.");
    }
  }

  async function handleDeletePortfolio(id: string) {
    setErrorBanner(null);
    try {
      await apiRequest(`/api/portfolio/${id}`, { method: 'DELETE' });
      setPortfolio((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
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
                  ? 'Votre abonnement étudiant a expiré'
                  : 'Abonnement étudiant requis (100 DH / an)'}
              </p>
              <p className="text-xs text-[#DFD5EC] mt-1">
                Activez ou renouvelez votre abonnement annuel de 100 DH (12 mois) pour accéder aux compétences,
                échanges, challenges pratiques et portfolio.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('subscription')}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
          >
            <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
            {subscriptionSummary.subscription?.status === 'expired' ? 'Renouveler (100 DH)' : 'Activer mon abonnement'}
          </button>
        </div>
      )}

      {/* SUBSCRIBER GATE FOR RESTRICTED TABS */}
      {!hasActiveAccess &&
      subscriptionSummary !== null &&
      ['skills', 'exchanges', 'challenges', 'portfolio'].includes(activeTab) ? (
        <div className="rounded-2xl border border-[#F472B6]/25 bg-[#160D27] p-8 text-center space-y-4">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F472B6]/15 text-[#F472B6]">
            <Lock className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-bold text-white">
            Fonctionnalité réservée aux abonnés SkillSwap Pro
          </h2>
          <p className="mx-auto max-w-lg text-sm text-[#B8ADC8]">
            {subscriptionSummary.subscription?.status === 'expired'
              ? 'Votre abonnement annuel est arrivé à expiration. Renouvelez votre accès pour 100 DH / an afin de retrouver toutes vos fonctionnalités.'
              : 'L’accès complet aux compétences, échanges étudiants, challenges d’entreprises et portfolio requiert l’abonnement étudiant à 100 DH / an (12 mois).'}
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('subscription')}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-6 py-3 text-sm font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            Accéder à « Mon abonnement » (100 DH / an)
          </button>
        </div>
      ) : null}

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                Bonjour, {user?.fullName}
              </h1>
              <p className="text-sm text-[#B8ADC8]">
                {user?.university ? `${user.university} · ${user.major}` : 'Tableau de bord étudiant'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onNavigateTab('skills')}
                className="rounded-lg border border-white/15 bg-[#160D27] px-4 py-2 text-xs font-medium text-white hover:border-[#F472B6] transition-colors cursor-pointer"
              >
                Gérer mes compétences
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('exchanges')}
                className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 transition-all cursor-pointer"
              >
                Trouver un échange
              </button>
            </div>
          </div>

          {/* 4 KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Compétences déclarées</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{mySkills.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {offeredByMe.length} proposées · {wantedByMe.length} recherchées
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Échanges de compétences</p>
              <p className="font-mono-tabular text-2xl font-semibold text-[#F472B6]">{exchanges.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {pendingIncomingExchanges.length} demande(s) en attente
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Défis soumis</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{submissions.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {averageScore !== null ? `Moyenne : ${averageScore}/100` : 'Aucune évaluation notée'}
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Projets portfolio</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{portfolio.length}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">Visibles par les entreprises</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pending incoming exchange requests */}
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-white">
                  Demandes d’échange reçues
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateTab('exchanges')}
                  className="text-xs text-[#F472B6] hover:underline cursor-pointer"
                >
                  Tout voir
                </button>
              </div>
              {pendingIncomingExchanges.length === 0 ? (
                <p className="text-sm text-[#8D7FA3] py-4">
                  Aucune nouvelle demande en attente de réponse.
                </p>
              ) : (
                <div className="space-y-3">
                  {pendingIncomingExchanges.map((ex) => (
                    <div key={ex.id} className="border-t border-white/8 pt-3 first:border-t-0 first:pt-0">
                      <p className="text-sm font-medium text-white">
                        {ex.requesterName} · <span className="text-[#F472B6]">{ex.proposedHours} h</span>
                      </p>
                      <p className="text-xs text-[#B8ADC8] mt-0.5">
                        Propose {ex.offeredSkillName} contre {ex.requestedSkillName}
                      </p>
                      {ex.message && <p className="text-xs text-[#CBD5E1] mt-1.5">{ex.message}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRespondExchange(ex.id, 'accepted')}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#F472B6] px-3 py-1.5 text-xs font-semibold text-[#180A28] hover:opacity-90 cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" /> Accepter
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRespondExchange(ex.id, 'rejected')}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#0D0716] px-3 py-1.5 text-xs font-medium text-[#FCA5A5] hover:border-[#DC2626] cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" /> Refuser
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Open challenges preview */}
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-base font-semibold text-white">
                  Défis pratiques ouverts
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigateTab('challenges')}
                  className="text-xs text-[#F472B6] hover:underline cursor-pointer"
                >
                  Explorer les défis
                </button>
              </div>
              {challenges.filter((c) => c.status === 'open').length === 0 ? (
                <p className="text-sm text-[#8D7FA3] py-4">
                  Aucun défi ouvert pour le moment. Revenez bientôt ou enrichissez votre portfolio.
                </p>
              ) : (
                <div className="space-y-3">
                  {challenges
                    .filter((c) => c.status === 'open')
                    .slice(0, 4)
                    .map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between gap-3 border-t border-white/8 pt-3 first:border-t-0 first:pt-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">{ch.title}</p>
                          <p className="text-xs text-[#B8ADC8] truncate">
                            {ch.companyName} · {ch.difficulty} · Échéance {ch.deadline}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onNavigateTab('challenges');
                            setActiveChallenge(ch);
                          }}
                          className="rounded-lg border border-white/15 bg-[#0D0716] px-3 py-1.5 text-xs font-medium text-white hover:border-[#F472B6] shrink-0 cursor-pointer"
                        >
                          Participer
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: SKILLS */}
      {activeTab === 'skills' && hasActiveAccess && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Mes compétences</h1>
            <p className="text-sm text-[#B8ADC8]">
              Indiquez les compétences que vous pouvez enseigner et celles que vous recherchez.
            </p>
          </div>

          <form
            onSubmit={handleAddUserSkill}
            className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4"
          >
            <h2 className="font-display text-base font-semibold text-white">Ajouter une compétence</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Compétence</label>
                <select
                  value={newSkillId}
                  onChange={(e) => setNewSkillId(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                >
                  {skillsCatalog.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.category})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Rôle dans l’échange</label>
                <select
                  value={newSkillMode}
                  onChange={(e) => setNewSkillMode(e.target.value as SkillMode)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                >
                  <option value="offered">Je propose / j’enseigne</option>
                  <option value="wanted">Je recherche / j’apprends</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Niveau actuel</label>
                <select
                  value={newSkillLevel}
                  onChange={(e) => setNewSkillLevel(e.target.value as SkillLevel)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                >
                  <option value="Débutant">Débutant</option>
                  <option value="Intermédiaire">Intermédiaire</option>
                  <option value="Avancé">Avancé</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={newSkillNotes}
                onChange={(e) => setNewSkillNotes(e.target.value)}
                placeholder="Précisions (ex. Projets réalisés, créneaux disponibles, objectifs...)"
                className="flex-1 rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#64748B] focus:border-[#F472B6] focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-sm font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Enregistrer
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
              <h2 className="font-display text-base font-semibold text-white mb-4">
                Compétences proposées ({offeredByMe.length})
              </h2>
              {offeredByMe.length === 0 ? (
                <p className="text-sm text-[#8D7FA3]">Aucune compétence proposée pour le moment.</p>
              ) : (
                <div className="divide-y divide-white/8">
                  {offeredByMe.map((s) => (
                    <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{s.skillName}</p>
                        <p className="text-xs text-[#F472B6]">
                          {s.skillCategory} · {s.level}
                        </p>
                        {s.notes && <p className="text-xs text-[#B8ADC8] mt-1">{s.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveUserSkill(s.id)}
                        aria-label={`Supprimer ${s.skillName}`}
                        className="p-1.5 text-[#8D7FA3] hover:text-[#FCA5A5] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
              <h2 className="font-display text-base font-semibold text-white mb-4">
                Compétences recherchées ({wantedByMe.length})
              </h2>
              {wantedByMe.length === 0 ? (
                <p className="text-sm text-[#8D7FA3]">Aucune compétence recherchée pour le moment.</p>
              ) : (
                <div className="divide-y divide-white/8">
                  {wantedByMe.map((s) => (
                    <div key={s.id} className="py-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{s.skillName}</p>
                        <p className="text-xs text-[#B8ADC8]">
                          {s.skillCategory} · Niveau souhaité : {s.level}
                        </p>
                        {s.notes && <p className="text-xs text-[#B8ADC8] mt-1">{s.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveUserSkill(s.id)}
                        aria-label={`Supprimer ${s.skillName}`}
                        className="p-1.5 text-[#8D7FA3] hover:text-[#FCA5A5] cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB: EXCHANGES */}
      {activeTab === 'exchanges' && hasActiveAccess && (
        <div className="space-y-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Échanges de compétences</h1>
            <p className="text-sm text-[#B8ADC8]">
              Découvrez les étudiants proposant des compétences et gérez vos demandes reçues ou envoyées.
            </p>
          </div>

          {/* Peer Discovery */}
          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                Étudiants disponibles pour un échange
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                  <input
                    type="text"
                    value={peerSearch}
                    onChange={(e) => setPeerSearch(e.target.value)}
                    placeholder="Compétence, étudiant, université..."
                    className="rounded-lg border border-white/12 bg-[#0D0716] py-1.5 pl-9 pr-3 text-xs text-white placeholder-[#64748B] focus:border-[#F472B6] focus:outline-none"
                  />
                </div>
                <select
                  value={peerCategoryFilter}
                  onChange={(e) => setPeerCategoryFilter(e.target.value)}
                  className="rounded-lg border border-white/12 bg-[#0D0716] px-3 py-1.5 text-xs text-white focus:border-[#F472B6] focus:outline-none"
                >
                  <option value="all">Toutes les catégories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredPeers.length === 0 ? (
              <p className="text-sm text-[#8D7FA3] py-6">
                Aucun étudiant ne correspond à ces critères pour le moment.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPeers.map((peer) => (
                  <div
                    key={peer.id}
                    className="rounded-lg border border-[#F472B6]/15 bg-[#0D0716] p-4 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <p className="text-xs text-[#F472B6]">
                        {peer.skillCategory} · {peer.level}
                      </p>
                      <h3 className="font-display text-base font-semibold text-white mt-1">
                        {peer.skillName}
                      </h3>
                      <p className="text-xs text-[#CBD5E1] mt-1">
                        {peer.userFullName}
                        {peer.userUniversity ? ` · ${peer.userUniversity}` : ''}
                      </p>
                      {peer.notes && <p className="text-xs text-[#B8ADC8] mt-2 line-clamp-2">{peer.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-white/8">
                      <button
                        type="button"
                        onClick={() => {
                          setProposalTarget(peer);
                          setProposalOfferedSkillId(offeredByMe[0]?.skillId || skillsCatalog[0]?.id || '');
                        }}
                        className="flex-1 rounded-lg bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-3 py-1.5 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                      >
                        Proposer un échange
                      </button>
                      <button
                        type="button"
                        onClick={() => onStartMessage(peer.userId)}
                        className="rounded-lg border border-white/12 px-3 py-1.5 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
                      >
                        Message
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Proposal Modal */}
          {proposalTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <form
                onSubmit={handleCreateExchange}
                className="w-full max-w-md rounded-xl border border-white/15 bg-[#160D27] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Proposer un échange à {proposalTarget.userFullName}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setProposalTarget(null)}
                    className="text-[#B8ADC8] hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-xs text-[#F472B6]">
                  Compétence demandée : {proposalTarget.skillName} ({proposalTarget.level})
                </p>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Compétence que vous proposez en retour
                  </label>
                  <select
                    value={proposalOfferedSkillId}
                    onChange={(e) => setProposalOfferedSkillId(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  >
                    {(offeredByMe.length > 0 ? offeredByMe.map((s) => ({ id: s.skillId, name: s.skillName })) : skillsCatalog).map(
                      (s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Volume horaire proposé (heures)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={proposalHours}
                    onChange={(e) => setProposalHours(Number(e.target.value))}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Message d’accompagnement
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={proposalMessage}
                    onChange={(e) => setProposalMessage(e.target.value)}
                    placeholder="Présentez vos disponibilités et ce que vous souhaitez travailler ensemble..."
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setProposalTarget(null)}
                    className="rounded-lg border border-white/12 px-4 py-2 text-xs text-[#CBD5E1] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                  >
                    Envoyer la demande
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Exchanges History & Actions */}
          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
            <h2 className="font-display text-base font-semibold text-white mb-4">
              Suivi de mes demandes d’échange ({exchanges.length})
            </h2>
            {exchanges.length === 0 ? (
              <p className="text-sm text-[#8D7FA3]">Aucune demande d’échange enregistrée pour le moment.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {exchanges.map((ex) => {
                  const isRecipient = ex.recipientId === user?.id;
                  const partnerId = isRecipient ? ex.requesterId : ex.recipientId;
                  return (
                    <div
                      key={ex.id}
                      className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs mb-1">
                          <span className="font-semibold text-[#F472B6]">
                            {isRecipient ? 'Reçue de' : 'Envoyée à'} {isRecipient ? ex.requesterName : ex.recipientName}
                          </span>
                          <span aria-hidden="true" className="text-[#8D7FA3]">·</span>
                          <span className="font-mono-tabular text-[#B8ADC8]">{ex.proposedHours} h</span>
                          <span aria-hidden="true" className="text-[#8D7FA3]">·</span>
                          <span
                            className={
                              ex.status === 'accepted' || ex.status === 'completed'
                                ? 'text-[#F472B6] font-medium'
                                : ex.status === 'rejected'
                                  ? 'text-[#FCA5A5] font-medium'
                                  : 'text-[#FBBF24] font-medium'
                            }
                          >
                            Statut : {EXCHANGE_STATUS_LABEL[ex.status]}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-white flex items-center gap-2">
                          <span>{ex.offeredSkillName}</span>
                          <ArrowLeftRight className="h-3.5 w-3.5 text-[#8D7FA3]" />
                          <span>{ex.requestedSkillName}</span>
                        </p>
                        {ex.message && <p className="text-xs text-[#B8ADC8] mt-1">{ex.message}</p>}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {isRecipient && ex.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRespondExchange(ex.id, 'accepted')}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#F472B6] px-3 py-1.5 text-xs font-semibold text-[#180A28] cursor-pointer"
                            >
                              <Check className="h-3.5 w-3.5" /> Accepter
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRespondExchange(ex.id, 'rejected')}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] cursor-pointer"
                            >
                              <X className="h-3.5 w-3.5" /> Refuser
                            </button>
                          </>
                        )}
                        {ex.status === 'accepted' && (
                          <button
                            type="button"
                            onClick={() => handleRespondExchange(ex.id, 'completed')}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#F472B6] px-3 py-1.5 text-xs font-semibold text-[#180A28] cursor-pointer"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Marquer terminé
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onStartMessage(partnerId)}
                          className="rounded-lg border border-white/12 bg-[#0D0716] px-3 py-1.5 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
                        >
                          Discuter
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: CHALLENGES */}
      {activeTab === 'challenges' && hasActiveAccess && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Défis pratiques d’entreprises</h1>
              <p className="text-sm text-[#B8ADC8]">
                Relevez des cas réels, soumettez votre solution et obtenez une évaluation notée.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                <input
                  type="text"
                  value={challengeSearch}
                  onChange={(e) => setChallengeSearch(e.target.value)}
                  placeholder="Rechercher un défi..."
                  className="rounded-lg border border-white/12 bg-[#160D27] py-1.5 pl-9 pr-3 text-xs text-white placeholder-[#64748B] focus:border-[#F472B6] focus:outline-none"
                />
              </div>
              <select
                value={challengeDifficulty}
                onChange={(e) => setChallengeDifficulty(e.target.value)}
                className="rounded-lg border border-white/12 bg-[#160D27] px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Tous niveaux</option>
                <option value="Débutant">Débutant</option>
                <option value="Intermédiaire">Intermédiaire</option>
                <option value="Avancé">Avancé</option>
              </select>
            </div>
          </div>

          {filteredChallenges.length === 0 ? (
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-8 text-center">
              <Award className="h-8 w-8 text-[#8D7FA3] mx-auto mb-2" />
              <p className="text-sm text-white font-medium">Aucun défi disponible actuellement</p>
              <p className="text-xs text-[#B8ADC8] mt-1">
                Les défis publiés par les entreprises apparaîtront ici dès leur mise en ligne.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {filteredChallenges.map((ch) => {
                const mySub = submissions.find((s) => s.challengeId === ch.id);
                return (
                  <div
                    key={ch.id}
                    className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 flex flex-col justify-between gap-4"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#F472B6] mb-2">
                        <span>{ch.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ch.difficulty}</span>
                        <span aria-hidden="true">·</span>
                        <span className={ch.status === 'open' ? 'text-[#F472B6]' : 'text-[#B8ADC8]'}>
                          {ch.status === 'open' ? 'Ouvert' : 'Fermé'}
                        </span>
                      </div>
                      <h2 className="font-display text-lg font-semibold text-white">{ch.title}</h2>
                      <p className="text-xs text-[#B8ADC8] mt-1">
                        Publié par {ch.companyName} · Échéance : {ch.deadline}
                        {ch.reward ? ` · Opportunité : ${ch.reward}` : ''}
                      </p>
                      <p className="text-sm text-[#CBD5E1] mt-3">{ch.summary}</p>
                      <p className="text-xs text-[#B8ADC8] mt-2 whitespace-pre-line">{ch.brief}</p>
                    </div>

                    {mySub && (
                      <div className="rounded-lg border border-[#F472B6]/15 bg-[#0D0716] p-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[#F472B6]">
                            {SUBMISSION_STATUS_LABEL[mySub.status]}
                          </span>
                          {mySub.score !== null && (
                            <span className="font-mono-tabular font-semibold text-white">
                              Note : {mySub.score}/100
                            </span>
                          )}
                        </div>
                        {mySub.feedback && <p className="text-xs text-[#CBD5E1]">Retour : {mySub.feedback}</p>}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-[#F472B6]/15">
                      <span className="font-mono-tabular text-xs text-[#8D7FA3]">
                        {ch.submissionsCount} soumission(s)
                      </span>
                      {ch.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveChallenge(ch);
                            setSolutionUrl(mySub?.solutionUrl || '');
                            setSolutionSummary(mySub?.summary || '');
                          }}
                          className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                        >
                          {mySub ? 'Mettre à jour ma solution' : 'Soumettre une solution'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Submission Modal */}
          {activeChallenge && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
              <form
                onSubmit={handleSubmitSolution}
                className="w-full max-w-lg rounded-xl border border-white/15 bg-[#160D27] p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-lg font-semibold text-white">
                    Soumettre pour : {activeChallenge.title}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveChallenge(null)}
                    className="text-[#B8ADC8] hover:text-white cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Lien vers la solution (GitHub, Figma, démo en ligne — https://)
                  </label>
                  <input
                    type="url"
                    required
                    value={solutionUrl}
                    onChange={(e) => setSolutionUrl(e.target.value)}
                    placeholder="https://github.com/..."
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                    Synthèse technique et choix d’architecture
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={solutionSummary}
                    onChange={(e) => setSolutionSummary(e.target.value)}
                    placeholder="Décrivez votre implémentation, les bibliothèques utilisées et les résultats..."
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveChallenge(null)}
                    className="rounded-lg border border-white/12 px-4 py-2 text-xs text-[#CBD5E1] cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                  >
                    Envoyer la soumission
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB: PORTFOLIO */}
      {activeTab === 'portfolio' && hasActiveAccess && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Mon portfolio académique et technique</h1>
              <p className="text-sm text-[#B8ADC8]">
                Mettez en valeur vos réalisations auprès des entreprises partenaires.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPortfolioForm((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              {showPortfolioForm ? 'Fermer le formulaire' : 'Ajouter un projet'}
            </button>
          </div>

          {showPortfolioForm && (
            <form
              onSubmit={handleCreatePortfolio}
              className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Titre du projet</label>
                  <input
                    type="text"
                    required
                    value={pfTitle}
                    onChange={(e) => setPfTitle(e.target.value)}
                    placeholder="Ex. Plateforme de suivi énergétique"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Catégorie</label>
                  <input
                    type="text"
                    required
                    value={pfCategory}
                    onChange={(e) => setPfCategory(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Technologies utilisées</label>
                  <input
                    type="text"
                    value={pfTechnologies}
                    onChange={(e) => setPfTechnologies(e.target.value)}
                    placeholder="Ex. React, TypeScript, PostgreSQL"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Date de réalisation</label>
                  <input
                    type="date"
                    value={pfDate}
                    onChange={(e) => setPfDate(e.target.value)}
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">
                  Lien du projet ou dépôt (optionnel, https://)
                </label>
                <input
                  type="url"
                  value={pfUrl}
                  onChange={(e) => setPfUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Description</label>
                <textarea
                  rows={3}
                  required
                  value={pfDescription}
                  onChange={(e) => setPfDescription(e.target.value)}
                  placeholder="Objectif, rôle dans l'équipe et résultats obtenus..."
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                >
                  Enregistrer le projet
                </button>
              </div>
            </form>
          )}

          {portfolio.length === 0 ? (
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-10 text-center">
              <FolderGit2 className="h-8 w-8 text-[#8D7FA3] mx-auto mb-2" />
              <p className="text-sm font-medium text-white">Votre portfolio est vide</p>
              <p className="text-xs text-[#B8ADC8] mt-1">
                Ajoutez vos projets universitaires, hackathons ou réalisations personnelles.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {portfolio.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#F472B6] mb-1.5">
                      <span>{proj.category}</span>
                      <span className="font-mono-tabular text-[#8D7FA3]">{proj.completedAt}</span>
                    </div>
                    <h2 className="font-display text-lg font-semibold text-white">{proj.title}</h2>
                    {proj.technologies && (
                      <p className="text-xs text-[#B8ADC8] mt-1">Outils : {proj.technologies}</p>
                    )}
                    <p className="text-sm text-[#CBD5E1] mt-3">{proj.description}</p>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-white/8">
                    {proj.projectUrl ? (
                      <a
                        href={proj.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F472B6] hover:underline"
                      >
                        Consulter le projet <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#8D7FA3]">Sans lien externe</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeletePortfolio(proj.id)}
                      className="inline-flex items-center gap-1 text-xs text-[#8D7FA3] hover:text-[#FCA5A5] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
