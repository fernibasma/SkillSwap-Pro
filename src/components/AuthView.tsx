import React, { useState } from 'react';
import { ArrowLeft, Building2, GraduationCap, Lock, Mail, Sparkles, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthViewProps {
  initialMode: 'login' | 'register';
  initialRole?: 'student' | 'company';
  onBack: () => void;
}

export function AuthView({ initialMode, initialRole = 'student', onBack }: AuthViewProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<'student' | 'company'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [university, setUniversity] = useState('');
  const [major, setMajor] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [sector, setSector] = useState('');
  const [city, setCity] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdminEmail = email.trim().toLowerCase() === 'fernibasma@gmail.com';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          fullName,
          role,
          university: role === 'student' ? university : undefined,
          major: role === 'student' ? major : undefined,
          companyName: role === 'company' ? companyName : undefined,
          sector: role === 'company' ? sector : undefined,
          city,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-cosmic-plum text-[#F8F5FF] flex flex-col">
      <header className="border-b border-[#F472B6]/12 bg-[#0D0716]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between px-6 py-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 text-sm text-[#C5B9D8] hover:text-[#F472B6] transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à l’accueil
          </button>
          <div className="flex items-center gap-2.5 font-display text-lg font-bold text-white">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F9A8D4] via-[#F472B6] to-[#EC4899]"
              aria-hidden="true"
            >
              <Sparkles className="h-4 w-4 text-[#190A28] fill-[#190A28]" />
            </span>
            <span>
              SkillSwap <span className="text-[#F472B6]">Pro.</span>
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-2xl border border-[#F472B6]/20 bg-[#160D27]/95 p-6 sm:p-8 shadow-[0_24px_60px_rgba(13,7,22,0.75)]">
          <div className="flex items-center gap-1 rounded-xl bg-[#0D0716] p-1 border border-white/10 mb-6">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] text-[#180A28]'
                  : 'text-[#B8ADC8] hover:text-white'
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-colors cursor-pointer ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] text-[#180A28]'
                  : 'text-[#B8ADC8] hover:text-white'
              }`}
            >
              Inscription
            </button>
          </div>

          <h1 className="font-display text-2xl font-bold text-white mb-1">
            {mode === 'login' ? 'Accéder à votre espace' : 'Créer un compte SkillSwap Pro'}
          </h1>
          <p className="text-sm text-[#B8ADC8] mb-6">
            {mode === 'login'
              ? 'Connectez-vous pour gérer vos échanges, challenges et messages.'
              : 'Choisissez votre profil étudiant ou entreprise pour démarrer.'}
          </p>

          {error && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-3 text-sm text-[#FCA5A5]"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-[#DFD5EC] mb-2">Type de compte</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('student')}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                        role === 'student'
                          ? 'border-[#F472B6] bg-[#F472B6]/15 text-white'
                          : 'border-white/10 bg-[#0D0716] text-[#B8ADC8] hover:text-white'
                      }`}
                    >
                      <GraduationCap className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
                      Étudiant
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('company')}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                        role === 'company'
                          ? 'border-[#F472B6] bg-[#F472B6]/15 text-white'
                          : 'border-white/10 bg-[#0D0716] text-[#B8ADC8] hover:text-white'
                      }`}
                    >
                      <Building2 className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
                      Entreprise
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-fullname" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                    Nom complet
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                    <input
                      id="auth-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={role === 'student' ? 'Ex. Lina Benali' : 'Ex. Karim Mansour'}
                      className="w-full rounded-lg border border-white/12 bg-[#0D0716] py-2 pl-9 pr-3 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                Adresse e-mail
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@universite.edu"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] py-2 pl-9 pr-3 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                />
              </div>
              {mode === 'register' && isAdminEmail && (
                <p className="mt-1.5 text-xs text-[#F472B6]">
                  Cette adresse correspond à l’administrateur désigné : les privilèges administrateur seront
                  attribués automatiquement.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] py-2 pl-9 pr-3 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                />
              </div>
            </div>

            {mode === 'register' && !isAdminEmail && role === 'student' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-university" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                    Université / École
                  </label>
                  <input
                    id="auth-university"
                    type="text"
                    required
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    placeholder="Ex. Sorbonne Université"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-major" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                    Filière / Niveau
                  </label>
                  <input
                    id="auth-major"
                    type="text"
                    required
                    value={major}
                    onChange={(e) => setMajor(e.target.value)}
                    placeholder="Ex. Master Informatique"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && !isAdminEmail && role === 'company' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="auth-company" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                    Nom de l’entreprise
                  </label>
                  <input
                    id="auth-company"
                    type="text"
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Ex. NovaTech Lab"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="auth-sector" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                    Secteur d’activité
                  </label>
                  <input
                    id="auth-sector"
                    type="text"
                    required
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder="Ex. FinTech / IA"
                    className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label htmlFor="auth-city" className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                  Ville
                </label>
                <input
                  id="auth-city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex. Paris, Lyon, Tunis, Montréal"
                  className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] py-3 text-sm font-semibold text-[#180A28] shadow-[0_6px_24px_rgba(244,114,182,0.3)] hover:brightness-105 disabled:opacity-60 transition-all cursor-pointer"
            >
              {submitting
                ? 'Traitement en cours...'
                : mode === 'login'
                  ? 'Se connecter'
                  : 'Créer mon compte'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
