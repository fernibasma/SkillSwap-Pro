import React, { useState } from 'react';
import { CheckCircle2, CreditCard, Lock, Save, User } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { SubscriptionSummary, UserProfile } from '../types/index';

interface ProfileSettingsViewProps {
  subscriptionSummary?: SubscriptionSummary | null;
  onOpenSubscriptionTab?: () => void;
}

export function ProfileSettingsView({
  subscriptionSummary,
  onOpenSubscriptionTab,
}: ProfileSettingsViewProps) {
  const { user, setUser } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [university, setUniversity] = useState(user?.university || '');
  const [major, setMajor] = useState(user?.major || '');
  const [companyName, setCompanyName] = useState(user?.companyName || '');
  const [sector, setSector] = useState(user?.sector || '');
  const [city, setCity] = useState(user?.city || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [websiteUrl, setWebsiteUrl] = useState(user?.websiteUrl || '');
  const [githubUrl, setGithubUrl] = useState(user?.githubUrl || '');
  const [linkedinUrl, setLinkedinUrl] = useState(user?.linkedinUrl || '');
  const [notifyExchanges, setNotifyExchanges] = useState(user?.notifyExchanges ?? true);
  const [notifyChallenges, setNotifyChallenges] = useState(user?.notifyChallenges ?? true);
  const [notifyMessages, setNotifyMessages] = useState(user?.notifyMessages ?? true);
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'companies_only'>(
    user?.profileVisibility || 'public'
  );

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  if (!user) return null;

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage(null);
    setProfileError(null);
    try {
      const res = await apiRequest<{ user: UserProfile }>('/api/profile', {
        method: 'PUT',
        body: {
          fullName,
          university,
          major,
          companyName,
          sector,
          city,
          bio,
          websiteUrl,
          githubUrl,
          linkedinUrl,
          notifyExchanges,
          notifyChallenges,
          notifyMessages,
          profileVisibility,
        },
      });
      setUser(res.user);
      setProfileMessage('Profil et préférences enregistrés avec succès.');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMessage(null);
    setPasswordError(null);
    try {
      await apiRequest('/api/profile/password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordMessage('Mot de passe modifié avec succès.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Erreur lors du changement de mot de passe.');
    } finally {
      setSavingPassword(false);
    }
  }

  const sub = subscriptionSummary?.subscription;
  const subStatusLabel =
    sub?.status === 'active'
      ? 'Actif'
      : sub?.status === 'expired'
        ? 'Expiré'
        : sub?.status === 'cancelled'
          ? 'Annulé'
          : 'En attente de paiement';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Profil et paramètres</h1>
        <p className="text-sm text-[#B8ADC8]">
          Gérez votre identité publique, votre abonnement, vos notifications et la sécurité de votre compte.
        </p>
      </div>

      {user.role !== 'admin' && (
        <div className="rounded-2xl border border-[#F472B6]/25 bg-[#160D27] p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F472B6]">
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              <span>Mon abonnement · Statut : {subStatusLabel}</span>
            </div>
            <p className="font-display text-base font-semibold text-white">
              {sub?.planName || (user.role === 'student' ? 'Abonnement Étudiant (100 DH / an)' : 'Abonnement Entreprise')}
            </p>
            <p className="text-xs text-[#B8ADC8]">
              {sub?.expiresAt
                ? `Expire le ${new Date(sub.expiresAt).toLocaleDateString('fr-FR')} · Prix payé : ${sub.pricePaidMad} DH`
                : 'Consultez vos factures, votre historique de paiements ou renouvelez votre accès.'}
            </p>
          </div>
          {onOpenSubscriptionTab && (
            <button
              type="button"
              onClick={onOpenSubscriptionTab}
              className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
            >
              Gérer « Mon abonnement »
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          <User className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-white">Informations du profil</h2>
        </div>

        {profileMessage && (
          <div className="flex items-center gap-2 rounded-lg border border-[#F472B6]/40 bg-[#F472B6]/10 px-4 py-2.5 text-sm text-[#F472B6]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{profileMessage}</span>
          </div>
        )}
        {profileError && (
          <div className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-2.5 text-sm text-[#FCA5A5]">
            {profileError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Nom complet</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Adresse e-mail</label>
            <input
              type="email"
              disabled
              value={user.email}
              className="w-full rounded-lg border border-white/8 bg-[#0D0716]/50 px-3 py-2 text-sm text-[#8D7FA3]"
            />
          </div>

          {user.role === 'student' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Université / École</label>
                <input
                  type="text"
                  value={university}
                  onChange={(e) => setUniversity(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Filière / Spécialité</label>
                <input
                  type="text"
                  value={major}
                  onChange={(e) => setMajor(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                />
              </div>
            </>
          )}

          {user.role === 'company' && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Nom de l’entreprise</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Secteur</label>
                <input
                  type="text"
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Ville</label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Visibilité du profil</label>
            <select
              value={profileVisibility}
              onChange={(e) => setProfileVisibility(e.target.value as 'public' | 'companies_only')}
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
            >
              <option value="public">Visible sur toute la plateforme</option>
              <option value="companies_only">Visible uniquement par les entreprises</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Présentation / Biographie</label>
          <textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Décrivez votre parcours, vos objectifs d'apprentissage ou vos projets..."
            className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Site web (https://)</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">GitHub (https://)</label>
            <input
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/..."
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">LinkedIn (https://)</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-white/10 pt-5 space-y-3">
          <p className="text-xs font-semibold text-white">Préférences de notifications</p>
          <label className="flex items-center gap-3 text-sm text-[#DFD5EC] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyExchanges}
              onChange={(e) => setNotifyExchanges(e.target.checked)}
              className="h-4 w-4 accent-[#F472B6]"
            />
            Recevoir les alertes pour les demandes d’échange de compétences
          </label>
          <label className="flex items-center gap-3 text-sm text-[#DFD5EC] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyChallenges}
              onChange={(e) => setNotifyChallenges(e.target.checked)}
              className="h-4 w-4 accent-[#F472B6]"
            />
            Recevoir les alertes pour les soumissions et évaluations de challenges
          </label>
          <label className="flex items-center gap-3 text-sm text-[#DFD5EC] cursor-pointer">
            <input
              type="checkbox"
              checked={notifyMessages}
              onChange={(e) => setNotifyMessages(e.target.checked)}
              className="h-4 w-4 accent-[#F472B6]"
            />
            Recevoir les alertes pour les nouveaux messages directs
          </label>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-6 py-2.5 text-sm font-semibold text-[#180A28] hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {savingProfile ? 'Enregistrement...' : 'Enregistrer les modifications'}
          </button>
        </div>
      </form>

      {/* Password Change Section */}
      <form onSubmit={handleChangePassword} className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-5">
        <div className="flex items-center gap-2 border-b border-white/10 pb-4">
          <Lock className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-white">Sécurité du mot de passe</h2>
        </div>

        {passwordMessage && (
          <div className="rounded-lg border border-[#F472B6]/40 bg-[#F472B6]/10 px-4 py-2.5 text-sm text-[#F472B6]">
            {passwordMessage}
          </div>
        )}
        {passwordError && (
          <div className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-2.5 text-sm text-[#FCA5A5]">
            {passwordError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">Mot de passe actuel</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
              Nouveau mot de passe (min. 8 caractères)
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingPassword}
            className="rounded-full border border-[#F472B6]/35 bg-[#0D0716] px-5 py-2.5 text-sm font-medium text-white hover:border-[#F472B6] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {savingPassword ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
          </button>
        </div>
      </form>
    </div>
  );
}
