import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type {
  AccountStatus,
  AdminSubscriptionsOverview,
  Challenge,
  PlatformStats,
  Skill,
  SkillExchange,
  SubscriptionPlan,
  UserProfile,
  UserRole,
} from '../types/index';

interface AdminDashboardProps {
  activeTab: string;
}

export function AdminDashboard({ activeTab }: AdminDashboardProps) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [exchanges, setExchanges] = useState<SkillExchange[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState('Développement Web');
  const [skillDescription, setSkillDescription] = useState('');

  // Subscriptions & Payments Management State
  const [subOverview, setSubOverview] = useState<AdminSubscriptionsOverview | null>(null);
  const [subStatusFilter, setSubStatusFilter] = useState<'all' | 'active' | 'expired' | 'pending_payment' | 'cancelled'>('all');
  const [subRoleFilter, setSubRoleFilter] = useState<'all' | 'student' | 'company'>('all');
  const [subSearch, setSubSearch] = useState('');
  const [planEdits, setPlanEdits] = useState<Record<string, { priceMad: string; name: string; description: string }>>({});
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [processingRefundId, setProcessingRefundId] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [res, subsRes] = await Promise.all([
        apiRequest<{
          stats: PlatformStats;
          users: UserProfile[];
          skills: Skill[];
          exchanges: SkillExchange[];
          challenges: Challenge[];
        }>('/api/admin/overview'),
        apiRequest<AdminSubscriptionsOverview>('/api/admin/subscriptions'),
      ]);
      setStats(res.stats);
      setUsers(res.users);
      setSkills(res.skills);
      setExchanges(res.exchanges);
      setChallenges(res.challenges);
      setSubOverview(subsRes);

      const initialEdits: Record<string, { priceMad: string; name: string; description: string }> = {};
      for (const p of subsRes.plans) {
        initialEdits[p.id] = {
          priceMad: String(p.priceMad),
          name: p.name,
          description: p.description,
        };
      }
      setPlanEdits(initialEdits);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors du chargement administrateur.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      const matchesQ =
        !q ||
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.university.toLowerCase().includes(q) ||
        u.companyName.toLowerCase().includes(q);
      return matchesRole && matchesQ;
    });
  }, [users, userSearch, roleFilter]);

  async function handleUpdateUser(targetId: string, patch: { role?: UserRole; status?: AccountStatus }) {
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>(`/api/admin/users/${targetId}`, {
        method: 'PATCH',
        body: patch,
      });
      setUsers((prev) => prev.map((u) => (u.id === targetId ? res.user : u)));
      setFeedbackBanner(`Compte de ${res.user.fullName} mis à jour.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Modification refusée.');
    }
  }

  async function handleCreateSkill(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ skill: Skill }>('/api/skills', {
        method: 'POST',
        body: { name: skillName, category: skillCategory, description: skillDescription },
      });
      setSkills((prev) => [...prev, res.skill]);
      setSkillName('');
      setSkillDescription('');
      setFeedbackBanner(`Compétence « ${res.skill.name} » ajoutée au catalogue.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : "Erreur lors de l'ajout.");
    }
  }

  async function handleDeleteSkill(id: string) {
    setErrorBanner(null);
    try {
      await apiRequest(`/api/skills/${id}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function handleDeleteChallenge(id: string) {
    setErrorBanner(null);
    try {
      await apiRequest(`/api/challenges/${id}`, { method: 'DELETE' });
      setChallenges((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Suppression impossible.');
    }
  }

  async function handleChallengeStatus(id: string, status: Challenge['status']) {
    try {
      const res = await apiRequest<{ challenge: Challenge }>(`/api/challenges/${id}`, {
        method: 'PATCH',
        body: { status },
      });
      setChallenges((prev) => prev.map((c) => (c.id === id ? res.challenge : c)));
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur de mise à jour.');
    }
  }

  const filteredSubscriptions = useMemo(() => {
    if (!subOverview) return [];
    const q = subSearch.trim().toLowerCase();
    return subOverview.subscriptions.filter((s) => {
      const matchesStatus = subStatusFilter === 'all' || s.status === subStatusFilter;
      const matchesRole = subRoleFilter === 'all' || s.targetRole === subRoleFilter;
      const matchesQ =
        !q ||
        (s.userFullName || '').toLowerCase().includes(q) ||
        (s.userEmail || '').toLowerCase().includes(q) ||
        (s.userCompanyName || '').toLowerCase().includes(q) ||
        (s.userUniversity || '').toLowerCase().includes(q) ||
        s.planName.toLowerCase().includes(q);
      return matchesStatus && matchesRole && matchesQ;
    });
  }, [subOverview, subStatusFilter, subRoleFilter, subSearch]);

  async function handleSavePlanPrice(plan: SubscriptionPlan) {
    const edit = planEdits[plan.id];
    if (!edit) return;
    setSavingPlanId(plan.id);
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      const res = await apiRequest<{ plan: SubscriptionPlan }>(`/api/admin/plans/${plan.id}`, {
        method: 'PATCH',
        body: {
          name: edit.name,
          priceMad: Number(edit.priceMad),
          description: edit.description,
        },
      });
      setSubOverview((prev) =>
        prev
          ? { ...prev, plans: prev.plans.map((p) => (p.id === plan.id ? res.plan : p)) }
          : prev
      );
      setFeedbackBanner(`Tarif « ${res.plan.name} » mis à jour (${res.plan.priceMad} DH).`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la mise à jour du tarif.');
    } finally {
      setSavingPlanId(null);
    }
  }

  async function handleRefundDecision(paymentId: string, decision: 'approve' | 'reject') {
    setProcessingRefundId(paymentId);
    setErrorBanner(null);
    setFeedbackBanner(null);
    try {
      await apiRequest(`/api/admin/payments/${paymentId}/refund`, {
        method: 'PATCH',
        body: {
          decision,
          note: decision === 'reject' ? 'Demande non éligible après vérification.' : undefined,
        },
      });
      const refreshed = await apiRequest<AdminSubscriptionsOverview>('/api/admin/subscriptions');
      setSubOverview(refreshed);
      setFeedbackBanner(
        decision === 'approve'
          ? 'Remboursement approuvé et facture mise à jour.'
          : 'Demande de remboursement refusée.'
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur traitement remboursement.');
    } finally {
      setProcessingRefundId(null);
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

      {/* TAB: OVERVIEW */}
      {activeTab === 'overview' && stats && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Administration de la plateforme</h1>
            <p className="text-sm text-[#B8ADC8]">
              Supervision globale des utilisateurs, du catalogue de compétences, des défis et des échanges.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Utilisateurs totaux</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{stats.totalUsers}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats.studentsCount} étudiants · {stats.companiesCount} entreprises
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Catalogue de compétences</p>
              <p className="font-mono-tabular text-2xl font-semibold text-[#F472B6]">{stats.skillsCount}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">Compétences référencées</p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Échanges</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{stats.exchangesCount}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats.acceptedExchangesCount} acceptés · {stats.completedExchangesCount} terminés
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Défis & Soumissions</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">{stats.challengesCount}</p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats.openChallengesCount} ouverts · {stats.submissionsCount} soumissions
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
            <h2 className="font-display text-base font-semibold text-white mb-4">
              Derniers comptes enregistrés
            </h2>
            <div className="divide-y divide-white/8">
              {users.slice(0, 6).map((u) => (
                <div key={u.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-white truncate">{u.fullName}</p>
                    <p className="text-xs text-[#B8ADC8] truncate">{u.email}</p>
                  </div>
                  <div className="text-right text-xs shrink-0">
                    <span className="text-[#F472B6] capitalize">{u.role}</span>
                    <span className="mx-2 text-[#8D7FA3]">·</span>
                    <span className={u.status === 'active' ? 'text-[#CBD5E1]' : 'text-[#FCA5A5]'}>
                      {u.status === 'active' ? 'Actif' : 'Suspendu'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB: USERS */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Gestion des utilisateurs</h1>
              <p className="text-sm text-[#B8ADC8]">
                Contrôlez les rôles et statuts d’accès de tous les membres inscrits.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Nom, e-mail, université..."
                  className="rounded-lg border border-white/12 bg-[#160D27] py-1.5 pl-9 pr-3 text-xs text-white"
                />
              </div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
                className="rounded-lg border border-white/12 bg-[#160D27] px-3 py-1.5 text-xs text-white"
              >
                <option value="all">Tous les rôles</option>
                <option value="student">Étudiants</option>
                <option value="company">Entreprises</option>
                <option value="admin">Administrateurs</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#F472B6]/15 bg-[#160D27]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#F472B6]/15 text-xs text-[#B8ADC8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Membre</th>
                  <th className="px-4 py-3 font-medium">Organisation</th>
                  <th className="px-4 py-3 font-medium">Rôle</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredUsers.map((u) => {
                  const isMainAdmin = u.email.toLowerCase() === 'fernibasma@gmail.com';
                  return (
                    <tr key={u.id} className="hover:bg-white/3">
                      <td className="px-4 py-3">
                        <p className="font-medium text-white">{u.fullName}</p>
                        <p className="text-xs text-[#B8ADC8]">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#CBD5E1]">
                        {u.university || u.companyName || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role}
                          disabled={isMainAdmin}
                          onChange={(e) => handleUpdateUser(u.id, { role: e.target.value as UserRole })}
                          className="rounded border border-white/12 bg-[#0D0716] px-2 py-1 text-xs text-white disabled:opacity-60"
                        >
                          <option value="student">Étudiant</option>
                          <option value="company">Entreprise</option>
                          <option value="admin">Administrateur</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className={u.status === 'active' ? 'text-[#F472B6]' : 'text-[#FCA5A5]'}>
                          {u.status === 'active' ? 'Actif' : 'Suspendu'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isMainAdmin ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#8D7FA3]">
                            <Shield className="h-3.5 w-3.5 text-[#F472B6]" /> Admin principal
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateUser(u.id, {
                                status: u.status === 'active' ? 'suspended' : 'active',
                              })
                            }
                            className="rounded border border-white/15 bg-[#0D0716] px-3 py-1 text-xs text-white hover:border-[#F472B6] cursor-pointer"
                          >
                            {u.status === 'active' ? 'Suspendre' : 'Réactiver'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SKILLS CATALOG */}
      {activeTab === 'skills' && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Catalogue des compétences</h1>
            <p className="text-sm text-[#B8ADC8]">
              Ajoutez ou supprimez les compétences officielles disponibles sur la plateforme.
            </p>
          </div>

          <form onSubmit={handleCreateSkill} className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">Ajouter une compétence</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Nom de la compétence</label>
                <input
                  type="text"
                  required
                  value={skillName}
                  onChange={(e) => setSkillName(e.target.value)}
                  placeholder="Ex. Rust & WebAssembly"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Catégorie</label>
                <input
                  type="text"
                  required
                  value={skillCategory}
                  onChange={(e) => setSkillCategory(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#CBD5E1] mb-1.5">Description</label>
                <input
                  type="text"
                  value={skillDescription}
                  onChange={(e) => setSkillDescription(e.target.value)}
                  placeholder="Courte description"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] rounded-full hover:brightness-105 cursor-pointer"
              >
                <Plus className="h-4 w-4" /> Ajouter au catalogue
              </button>
            </div>
          </form>

          <div className="overflow-x-auto rounded-xl border border-[#F472B6]/15 bg-[#160D27]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#F472B6]/15 text-xs text-[#B8ADC8]">
                <tr>
                  <th className="px-4 py-3 font-medium">Compétence</th>
                  <th className="px-4 py-3 font-medium">Catégorie</th>
                  <th className="px-4 py-3 font-medium">Description</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {skills.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium text-white">{s.name}</td>
                    <td className="px-4 py-3 text-xs text-[#F472B6]">{s.category}</td>
                    <td className="px-4 py-3 text-xs text-[#B8ADC8]">{s.description || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteSkill(s.id)}
                        className="inline-flex items-center gap-1 text-xs text-[#8D7FA3] hover:text-[#FCA5A5] cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Supprimer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: MODERATION */}
      {activeTab === 'moderation' && (
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Modération des défis et échanges</h1>
            <p className="text-sm text-[#B8ADC8]">
              Supervisez les défis publiés par les entreprises et l’activité des échanges étudiants.
            </p>
          </div>

          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
            <h2 className="font-display text-base font-semibold text-white mb-4">
              Défis pratiques ({challenges.length})
            </h2>
            {challenges.length === 0 ? (
              <p className="text-sm text-[#8D7FA3]">Aucun défi publié sur la plateforme.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {challenges.map((c) => (
                  <div key={c.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">{c.title}</p>
                      <p className="text-xs text-[#B8ADC8]">
                        {c.companyName} · {c.category} · {c.submissionsCount} soumission(s) · Statut : {c.status}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={c.status}
                        onChange={(e) => handleChallengeStatus(c.id, e.target.value as Challenge['status'])}
                        className="rounded border border-white/12 bg-[#0D0716] px-2.5 py-1 text-xs text-white"
                      >
                        <option value="open">Ouvert</option>
                        <option value="closed">Fermé</option>
                        <option value="archived">Archivé</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleDeleteChallenge(c.id)}
                        className="rounded border border-white/12 px-2.5 py-1 text-xs text-[#FCA5A5] hover:border-[#DC2626] cursor-pointer"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-6">
            <h2 className="font-display text-base font-semibold text-white mb-4">
              Journal des échanges ({exchanges.length})
            </h2>
            {exchanges.length === 0 ? (
              <p className="text-sm text-[#8D7FA3]">Aucun échange enregistré pour le moment.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {exchanges.map((ex) => (
                  <div key={ex.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <span className="font-medium text-white">{ex.requesterName}</span>
                      <span className="text-[#8D7FA3]"> → </span>
                      <span className="font-medium text-white">{ex.recipientName}</span>
                      <span className="text-[#B8ADC8]">
                        {' '}
                        ({ex.offeredSkillName} ↔ {ex.requestedSkillName}, {ex.proposedHours} h)
                      </span>
                    </div>
                    <span className="text-[#F472B6]">{ex.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: SUBSCRIPTIONS & PAYMENTS MANAGEMENT */}
      {activeTab === 'subscriptions' && subOverview && (
        <div className="space-y-8">
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Gestion des abonnements & revenus</h1>
            <p className="text-sm text-[#B8ADC8]">
              Suivez les revenus mensuels et annuels, configurez les tarifs entreprise, identifiez les comptes expirés et gérez les remboursements.
            </p>
          </div>

          {/* Revenue & Subscription KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Revenu du mois</p>
              <p className="font-mono-tabular text-2xl font-semibold text-[#F472B6]">
                {subOverview.metrics.monthlyRevenueMad} DH
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                Total cumulé : {subOverview.metrics.totalRevenueMad} DH
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Revenu annuel</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">
                {subOverview.metrics.annualRevenueMad} DH
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                Remboursés : {subOverview.metrics.refundedTotalMad} DH
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Abonnements actifs</p>
              <p className="font-mono-tabular text-2xl font-semibold text-emerald-300">
                {subOverview.metrics.activeSubscriptionsCount}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {subOverview.metrics.activeStudentsCount} étudiants · {subOverview.metrics.activeCompaniesCount} entreprises
              </p>
            </div>
            <div className="rounded-xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Expirés & Remboursements</p>
              <p className="font-mono-tabular text-2xl font-semibold text-amber-300">
                {subOverview.metrics.expiredSubscriptionsCount}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {subOverview.metrics.refundRequestedCount} demande(s) de remboursement
              </p>
            </div>
          </div>

          {/* Company Pricing Configuration */}
          <div className="rounded-2xl border border-[#F472B6]/20 bg-[#160D27] p-6 space-y-5">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <CreditCard className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold text-white">
                Configuration des tarifs (Entreprises & Étudiants)
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {subOverview.plans.map((plan) => {
                const edit = planEdits[plan.id] || {
                  priceMad: String(plan.priceMad),
                  name: plan.name,
                  description: plan.description,
                };
                const isStudentPlan = plan.code === 'student_annual';
                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-white/10 bg-[#0D0716] p-4 flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#F472B6] uppercase">
                          {plan.targetRole === 'company' ? 'Entreprise' : 'Étudiant'} ·{' '}
                          {plan.billingCycle === 'monthly' ? 'Mensuel' : 'Annuel'}
                        </span>
                        <span className="font-mono-tabular text-[#8D7FA3]">{plan.durationMonths} mois</span>
                      </div>

                      <div>
                        <label className="block text-xs text-[#B8ADC8] mb-1">Intitulé de l’offre</label>
                        <input
                          type="text"
                          value={edit.name}
                          onChange={(e) =>
                            setPlanEdits((prev) => ({
                              ...prev,
                              [plan.id]: { ...edit, name: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-white/12 bg-[#160D27] px-3 py-1.5 text-sm text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[#B8ADC8] mb-1">
                          Tarif ({plan.currency}) {isStudentPlan ? '(fixé à 100 DH/an par défaut)' : ''}
                        </label>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={edit.priceMad}
                          onChange={(e) =>
                            setPlanEdits((prev) => ({
                              ...prev,
                              [plan.id]: { ...edit, priceMad: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-white/12 bg-[#160D27] px-3 py-1.5 text-sm font-mono-tabular text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs text-[#B8ADC8] mb-1">Description</label>
                        <textarea
                          rows={2}
                          value={edit.description}
                          onChange={(e) =>
                            setPlanEdits((prev) => ({
                              ...prev,
                              [plan.id]: { ...edit, description: e.target.value },
                            }))
                          }
                          className="w-full rounded-lg border border-white/12 bg-[#160D27] px-3 py-1.5 text-xs text-white"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={savingPlanId === plan.id}
                      onClick={() => handleSavePlanPrice(plan)}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] hover:brightness-105 disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="h-3.5 w-3.5" aria-hidden="true" />
                      {savingPlanId === plan.id ? 'Enregistrement...' : 'Enregistrer le tarif'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Refund Requests Section */}
          <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
                Demandes de remboursement ({subOverview.metrics.refundRequestedCount})
              </h2>
            </div>

            {subOverview.payments.filter((p) => p.status === 'refund_requested').length === 0 ? (
              <p className="text-sm text-[#8D7FA3]">Aucune demande de remboursement en attente.</p>
            ) : (
              <div className="divide-y divide-white/8">
                {subOverview.payments
                  .filter((p) => p.status === 'refund_requested')
                  .map((p) => (
                    <div key={p.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {p.userFullName} ({p.userEmail}) ·{' '}
                          <span className="font-mono-tabular text-[#F472B6]">{p.amountMad} DH</span>
                        </p>
                        <p className="text-xs text-[#B8ADC8] mt-0.5">
                          {p.planName} · Réf : <span className="font-mono-tabular">{p.providerRef}</span>
                        </p>
                        <p className="text-xs text-amber-200 mt-1">Motif : {p.refundReason}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={processingRefundId === p.id}
                          onClick={() => handleRefundDecision(p.id, 'approve')}
                          className="rounded-full bg-[#F472B6] px-4 py-1.5 text-xs font-semibold text-[#180A28] cursor-pointer"
                        >
                          Approuver remboursement
                        </button>
                        <button
                          type="button"
                          disabled={processingRefundId === p.id}
                          onClick={() => handleRefundDecision(p.id, 'reject')}
                          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-[#FCA5A5] cursor-pointer"
                        >
                          Refuser
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* All Subscriptions Table */}
          <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h2 className="font-display text-base font-semibold text-white">
                Tous les abonnements ({filteredSubscriptions.length})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2 h-3.5 w-3.5 text-[#8D7FA3]" />
                  <input
                    type="text"
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    placeholder="Nom, e-mail, offre..."
                    className="rounded-lg border border-white/12 bg-[#0D0716] py-1.5 pl-8 pr-3 text-xs text-white"
                  />
                </div>
                <select
                  value={subRoleFilter}
                  onChange={(e) => setSubRoleFilter(e.target.value as typeof subRoleFilter)}
                  className="rounded-lg border border-white/12 bg-[#0D0716] px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">Tous profils</option>
                  <option value="student">Étudiants</option>
                  <option value="company">Entreprises</option>
                </select>
                <select
                  value={subStatusFilter}
                  onChange={(e) => setSubStatusFilter(e.target.value as typeof subStatusFilter)}
                  className="rounded-lg border border-white/12 bg-[#0D0716] px-3 py-1.5 text-xs text-white"
                >
                  <option value="all">Tous statuts</option>
                  <option value="active">Actifs</option>
                  <option value="expired">Expirés</option>
                  <option value="pending_payment">En attente</option>
                  <option value="cancelled">Annulés / Remboursés</option>
                </select>
              </div>
            </div>

            {filteredSubscriptions.length === 0 ? (
              <p className="text-sm text-[#8D7FA3] py-4">Aucun abonnement trouvé pour ces filtres.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-[#B8ADC8]">
                    <tr>
                      <th className="py-3 pr-4 font-medium">Abonné</th>
                      <th className="py-3 pr-4 font-medium">Type</th>
                      <th className="py-3 pr-4 font-medium">Offre</th>
                      <th className="py-3 pr-4 font-medium">Prix payé</th>
                      <th className="py-3 pr-4 font-medium">Début → Expiration</th>
                      <th className="py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {filteredSubscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-white/3">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-white">{sub.userFullName || '—'}</p>
                          <p className="text-xs text-[#B8ADC8]">{sub.userEmail}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#CBD5E1]">
                          {sub.targetRole === 'company' ? 'Entreprise' : 'Étudiant'}
                        </td>
                        <td className="py-3 pr-4 text-xs text-white">{sub.planName}</td>
                        <td className="py-3 pr-4 font-mono-tabular text-xs font-semibold text-[#F472B6]">
                          {sub.pricePaidMad} DH
                        </td>
                        <td className="py-3 pr-4 font-mono-tabular text-xs text-[#B8ADC8]">
                          {sub.startsAt ? new Date(sub.startsAt).toLocaleDateString('fr-FR') : '—'} →{' '}
                          {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td className="py-3 text-xs font-semibold">
                          <span
                            className={
                              sub.status === 'active'
                                ? 'text-emerald-300'
                                : sub.status === 'expired'
                                  ? 'text-rose-300'
                                  : sub.status === 'pending_payment'
                                    ? 'text-amber-300'
                                    : 'text-[#8D7FA3]'
                            }
                          >
                            {sub.status === 'active'
                              ? 'Actif'
                              : sub.status === 'expired'
                                ? 'Expiré'
                                : sub.status === 'pending_payment'
                                  ? 'En attente'
                                  : 'Annulé'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* All Payments Log */}
          <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
            <h2 className="font-display text-base font-semibold text-white">
              Historique global des paiements ({subOverview.payments.length})
            </h2>
            {subOverview.payments.length === 0 ? (
              <p className="text-sm text-[#8D7FA3]">Aucune transaction enregistrée.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-white/10 text-xs text-[#B8ADC8]">
                    <tr>
                      <th className="py-3 pr-4 font-medium">Date</th>
                      <th className="py-3 pr-4 font-medium">Membre</th>
                      <th className="py-3 pr-4 font-medium">Offre</th>
                      <th className="py-3 pr-4 font-medium">Montant</th>
                      <th className="py-3 pr-4 font-medium">Prestataire / Réf</th>
                      <th className="py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8">
                    {subOverview.payments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-white/3">
                        <td className="py-3 pr-4 font-mono-tabular text-xs text-[#B8ADC8]">
                          {new Date(pay.paidAt || pay.createdAt).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          <p className="text-white font-medium">{pay.userFullName}</p>
                          <p className="text-[#8D7FA3]">{pay.userEmail}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-white">
                          {pay.planName}
                          {pay.invoiceNumber && (
                            <p className="font-mono-tabular text-[11px] text-[#F472B6]">{pay.invoiceNumber}</p>
                          )}
                        </td>
                        <td className="py-3 pr-4 font-mono-tabular text-xs font-semibold text-white">
                          {pay.amountMad} DH
                        </td>
                        <td className="py-3 pr-4 text-xs text-[#B8ADC8]">
                          <span className="uppercase">{pay.provider}</span> ·{' '}
                          <span className="font-mono-tabular">{pay.providerRef}</span>
                        </td>
                        <td className="py-3 text-xs font-semibold">
                          <span
                            className={
                              pay.status === 'succeeded'
                                ? 'text-emerald-300'
                                : pay.status === 'failed'
                                  ? 'text-rose-300'
                                  : pay.status === 'refund_requested'
                                    ? 'text-amber-300'
                                    : pay.status === 'refunded'
                                      ? 'text-[#F472B6]'
                                      : 'text-[#B8ADC8]'
                            }
                          >
                            {pay.status === 'succeeded'
                              ? 'Payé'
                              : pay.status === 'failed'
                                ? 'Échoué'
                                : pay.status === 'cancelled'
                                  ? 'Annulé'
                                  : pay.status === 'refund_requested'
                                    ? 'Remboursement demandé'
                                    : pay.status === 'refunded'
                                      ? 'Remboursé'
                                      : 'En attente'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
