import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  Briefcase,
  CheckCircle2,
  Layers,
  PlayCircle,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { Challenge, PlatformStats, Skill, SubscriptionPlan } from '../types/index';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register', defaultRole?: 'student' | 'company') => void;
}

export function LandingPage({ onOpenAuth }: LandingPageProps) {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [heroImgError, setHeroImgError] = useState(false);
  const [labImgError, setLabImgError] = useState(false);
  const [dataImgError, setDataImgError] = useState(false);
  const [partnerImgError, setPartnerImgError] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest<{ stats: PlatformStats; skills: Skill[]; challenges: Challenge[]; plans?: SubscriptionPlan[] }>(
      '/api/public/overview'
    )
      .then((res) => {
        if (!active) return;
        setStats(res.stats);
        setSkills(res.skills);
        setChallenges(res.challenges);
        if (Array.isArray(res.plans)) setPlans(res.plans);
      })
      .catch(() => {
        // Silence non-blocking public overview fetch failure
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D0716] text-[#F8F5FF]">
      {/* Top Bar Contract: 3 zones */}
      <header className="sticky top-0 z-40 border-b border-[#F472B6]/12 bg-[#0D0716]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-8 px-6 py-4">
          <a
            href="#top"
            className="flex items-center gap-3 font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#F9A8D4] via-[#F472B6] to-[#EC4899] shadow-[0_0_20px_rgba(244,114,182,0.35)]"
              aria-hidden="true"
            >
              <Sparkles className="h-4 w-4 text-[#190A28] fill-[#190A28]" />
            </span>
            <span>
              SkillSwap <span className="text-[#F472B6]">Pro.</span>
            </span>
          </a>

          <nav className="hidden lg:flex items-center gap-7 text-sm font-medium text-[#C5B9D8]">
            <a href="#top" className="text-white hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              Accueil
            </a>
            <a href="#competences" className="hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              Compétences
            </a>
            <a href="#challenges" className="hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              Challenges
            </a>
            <a href="#portfolio" className="hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              Portfolio
            </a>
            <a href="#tarifs" className="hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              Abonnements
            </a>
            <a href="#apropos" className="hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0">
              À propos
            </a>
          </nav>

          <div className="flex items-center gap-5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="text-sm font-semibold text-white hover:text-[#F472B6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register', 'student')}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-sm font-semibold text-[#180A28] shadow-[0_4px_24px_rgba(244,114,182,0.35)] hover:brightness-105 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F472B6] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
              Commencer
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Section matching midnight plum + luminous rose-pink visual system */}
        <section className="relative overflow-hidden bg-cosmic-plum pt-12 pb-16 lg:pt-16 lg:pb-24">
          {/* Subtle static starfield texture */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                'radial-gradient(1px 1px at 14% 22%, rgba(255,255,255,0.55) 100%, transparent), radial-gradient(1.5px 1.5px at 48% 15%, rgba(244,114,182,0.55) 100%, transparent), radial-gradient(1px 1px at 72% 38%, rgba(255,255,255,0.45) 100%, transparent), radial-gradient(1.5px 1.5px at 86% 64%, rgba(192,132,252,0.6) 100%, transparent), radial-gradient(1px 1px at 28% 76%, rgba(244,114,182,0.45) 100%, transparent)',
            }}
          />

          <div className="relative mx-auto max-w-[1240px] px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
              {/* Left Copy Column */}
              <div className="lg:col-span-6">
                <h1
                  className="font-display font-bold tracking-tight leading-[1.03] mb-6"
                  style={{ fontSize: 'clamp(2.65rem, 4.8vw, 4.25rem)', textWrap: 'balance' }}
                >
                  <span className="block text-white">Apprends.</span>
                  <span className="block text-white">Prouve.</span>
                  <span className="block text-[#F472B6] drop-shadow-[0_0_28px_rgba(244,114,182,0.38)]">
                    Fais-toi découvrir.
                  </span>
                </h1>

                <p className="text-base sm:text-lg leading-relaxed text-[#C5B9D8] max-w-xl mb-9">
                  Développe tes compétences, relève des challenges réels et construis un portfolio qui attire les
                  entreprises.
                </p>

                <div className="flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => onOpenAuth('register', 'student')}
                    className="inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-7 py-3.5 text-sm font-semibold text-[#180A28] shadow-[0_8px_32px_rgba(244,114,182,0.38)] hover:brightness-105 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F472B6] whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Rocket className="h-4 w-4" aria-hidden="true" />
                    Explorer SkillSwap
                  </button>
                  <a
                    href="#competences"
                    className="inline-flex items-center gap-2.5 rounded-full border border-[#A855F7]/40 bg-[#1A102C]/75 px-6 py-3.5 text-sm font-semibold text-white hover:border-[#F472B6]/70 hover:bg-[#23153B] transition-colors whitespace-nowrap shrink-0"
                  >
                    <PlayCircle className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
                    Découvrir la plateforme
                  </a>
                </div>
              </div>

              {/* Right Visual Composition matching the reference stadium + tilted laptop + 3 floating cards */}
              <div className="lg:col-span-6">
                <div className="relative mx-auto flex min-h-[380px] sm:min-h-[430px] max-w-[540px] items-center justify-center">
                  {/* Outer concentric orbit ring */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute h-[340px] w-[340px] sm:h-[400px] sm:w-[400px] rounded-full border border-[#A855F7]/15"
                  />

                  {/* Glowing Stadium Capsule */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none relative h-[200px] w-[92%] rounded-full border border-[#F472B6]/55 bg-gradient-to-r from-[#2D144D]/55 via-[#581C87]/40 to-[#9D174D]/50 shadow-[0_0_70px_rgba(236,72,153,0.24)]"
                  />

                  {/* Stylized Tilted Laptop Graphic */}
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="-rotate-3 transform">
                      {/* Laptop Screen */}
                      <div className="relative mx-auto h-40 w-64 sm:h-48 sm:w-76 rounded-2xl border border-[#C084FC]/60 bg-gradient-to-br from-[#3B1E66] via-[#2A154B] to-[#1D0F36] shadow-[0_20px_50px_rgba(13,7,22,0.85)] flex items-center justify-center">
                        <div className="relative flex items-center justify-center">
                          <Sparkles className="h-16 w-16 text-[#F472B6] fill-[#F472B6] drop-shadow-[0_0_24px_rgba(244,114,182,0.55)]" />
                        </div>
                      </div>
                      {/* Laptop Base */}
                      <div className="relative -mt-1.5 mx-auto h-5 w-72 sm:w-88 rounded-b-xl rounded-t-sm border-b-2 border-[#C084FC]/60 bg-gradient-to-r from-[#281545] via-[#3F236C] to-[#281545] shadow-[0_14px_30px_rgba(244,114,182,0.18)] flex items-center justify-center">
                        <div className="h-1 w-16 rounded-full bg-[#0D0716]/80" />
                      </div>
                    </div>
                  </div>

                  {/* Interactive Anchor 1: Challengez vous-même */}
                  <a
                    href="#challenges"
                    className="absolute left-0 sm:left-2 top-10 sm:top-12 flex items-center gap-3 rounded-2xl border border-[#A855F7]/30 bg-[#1B102E]/90 px-4 py-3 backdrop-blur-md shadow-lg hover:border-[#F472B6]/60 transition-colors"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F472B6]/15 text-[#F472B6]">
                      <Users className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="text-left leading-tight">
                      <p className="text-xs font-semibold text-white">Challengez</p>
                      <p className="text-[11px] text-[#B8ADC8]">vous-même</p>
                    </div>
                  </a>

                  {/* Interactive Anchor 2: Top talents */}
                  <a
                    href="#portfolio"
                    className="absolute left-4 sm:left-8 bottom-3 sm:bottom-5 flex items-center gap-3 rounded-2xl border border-[#F472B6]/30 bg-[#1B102E]/90 px-4 py-3 backdrop-blur-md shadow-lg hover:border-[#F472B6]/65 transition-colors"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F472B6]/15 text-[#F472B6]">
                      <Award className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="text-left leading-tight">
                      <p className="text-xs font-semibold text-white">Top talents</p>
                      <p className="text-[11px] text-[#B8ADC8]">sur la plateforme</p>
                    </div>
                  </a>

                  {/* Interactive Anchor 3: Progressez à votre rythme */}
                  <a
                    href="#competences"
                    className="absolute right-0 sm:right-2 bottom-4 sm:bottom-6 flex items-center gap-3 rounded-2xl border border-[#8B5CF6]/30 bg-[#1B102E]/90 px-4 py-3 backdrop-blur-md shadow-lg hover:border-[#F472B6]/60 transition-colors"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#8B5CF6]/20 text-[#C084FC]">
                      <TrendingUp className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="text-left leading-tight">
                      <p className="text-xs font-semibold text-white">Progressez</p>
                      <p className="text-[11px] text-[#B8ADC8]">à votre rythme</p>
                    </div>
                  </a>
                </div>
              </div>
            </div>

            {/* 01 LEARN · 02 PROVE · 03 DISCOVER Sequence Strip */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-8 sm:gap-14 text-xs tracking-[0.18em]">
              <a href="#competences" className="inline-flex items-center gap-2.5 text-[#C5B9D8] hover:text-white transition-colors">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">01</span>
                <span>LEARN</span>
              </a>
              <a href="#challenges" className="inline-flex items-center gap-2.5 text-[#C5B9D8] hover:text-white transition-colors">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">02</span>
                <span>PROVE</span>
              </a>
              <a href="#portfolio" className="inline-flex items-center gap-2.5 text-[#C5B9D8] hover:text-white transition-colors">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">03</span>
                <span>DISCOVER</span>
              </a>
            </div>
          </div>

          {/* Luminous Purple-Pink Bottom Wave */}
          <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
            <svg
              viewBox="0 0 1440 90"
              preserveAspectRatio="none"
              className="h-12 sm:h-16 w-full"
            >
              <defs>
                <linearGradient id="skillswap-wave" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4C1D95" stopOpacity="0.45" />
                  <stop offset="50%" stopColor="#701A75" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="#BE185D" stopOpacity="0.6" />
                </linearGradient>
              </defs>
              <path
                d="M0,48 C280,88 560,12 860,46 C1120,76 1290,18 1440,34 L1440,90 L0,90 Z"
                fill="url(#skillswap-wave)"
              />
            </svg>
          </div>
        </section>

        {/* 4-Column Live KPI Strip */}
        <section className="mx-auto max-w-[1240px] px-6 py-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Membres inscrits</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">
                {stats ? stats.totalUsers : 0}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats ? `${stats.studentsCount} étudiants · ${stats.companiesCount} entreprises` : 'Base en ligne'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Compétences au catalogue</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">
                {stats ? stats.skillsCount : skills.length}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">Disciplines techniques et produit</p>
            </div>
            <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Challenges ouverts</p>
              <p className="font-mono-tabular text-2xl font-semibold text-[#F472B6]">
                {stats ? stats.openChallengesCount : challenges.length}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats ? `${stats.submissionsCount} soumissions enregistrées` : 'Cas concrets d’entreprise'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-5">
              <p className="text-xs text-[#B8ADC8] mb-2">Échanges enregistrés</p>
              <p className="font-mono-tabular text-2xl font-semibold text-white">
                {stats ? stats.exchangesCount : 0}
              </p>
              <p className="mt-1 text-xs text-[#8D7FA3]">
                {stats ? `${stats.completedExchangesCount} sessions finalisées` : 'Entraide universitaire'}
              </p>
            </div>
          </div>
        </section>

        {/* 01 LEARN — Skills & Exchanges */}
        <section id="competences" className="mx-auto max-w-[1240px] px-6 py-14 border-t border-white/10">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Comment fonctionne SkillSwap Pro
            </h2>
            <p className="text-sm sm:text-base text-[#B8ADC8]">
              Un parcours structuré pour transformer vos connaissances académiques en réalisations concrètes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-[#A855F7]/20 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">01.</span>
                <BookOpen className="h-5 w-5 text-[#C5B9D8]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-2">
                Déclarez vos compétences et besoins
              </h3>
              <p className="text-sm leading-relaxed text-[#B8ADC8]">
                Indiquez les domaines que vous maîtrisez pour accompagner d’autres étudiants et ceux que vous
                souhaitez approfondir ce semestre.
              </p>
            </div>

            <div className="rounded-2xl border border-[#A855F7]/20 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">02.</span>
                <Users className="h-5 w-5 text-[#C5B9D8]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-2">
                Planifiez des échanges ciblés
              </h3>
              <p className="text-sm leading-relaxed text-[#B8ADC8]">
                Envoyez des propositions d’échange avec volume horaire et objectif. Le destinataire accepte ou refuse
                en un clic avec suivi des notifications.
              </p>
            </div>

            <div className="rounded-2xl border border-[#A855F7]/20 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">03.</span>
                <Layers className="h-5 w-5 text-[#C5B9D8]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-2">
                Relevez les challenges d’entreprises
              </h3>
              <p className="text-sm leading-relaxed text-[#B8ADC8]">
                Participez à des briefs techniques réels publiés par des entreprises partenaires, déposez votre
                dépôt Git ou prototype et recevez une note sur 100.
              </p>
            </div>

            <div className="rounded-2xl border border-[#A855F7]/20 bg-[#160D27] p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono-tabular text-sm font-semibold text-[#F472B6]">04.</span>
                <Briefcase className="h-5 w-5 text-[#C5B9D8]" aria-hidden="true" />
              </div>
              <h3 className="font-display text-lg font-semibold text-white mb-2">
                Faites-vous découvrir sur preuves
              </h3>
              <p className="text-sm leading-relaxed text-[#B8ADC8]">
                Les recruteurs consultent vos projets de portfolio, vos évaluations de challenges et vous contactent
                directement via la messagerie intégrée.
              </p>
            </div>
          </div>

          {skills.length > 0 && (
            <div className="mt-10 rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="font-display text-base font-semibold text-white">
                  Compétences disponibles dans le catalogue
                </h3>
                <span className="font-mono-tabular text-xs text-[#F472B6]">
                  {skills.length} disciplines actives
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {skills.slice(0, 9).map((skill) => (
                  <div
                    key={skill.id}
                    className="flex items-center justify-between border-b border-white/8 py-2"
                  >
                    <span className="text-[#F3EEFF] truncate pr-3">{skill.name}</span>
                    <span className="text-xs text-[#8D7FA3] whitespace-nowrap shrink-0">{skill.category}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* 02 PROVE — Practical Challenges */}
        <section id="challenges" className="mx-auto max-w-[1240px] px-6 py-14 border-t border-white/10">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
                Challenges pratiques et mises en situation
              </h2>
              <p className="text-sm sm:text-base text-[#B8ADC8]">
                Des épreuves techniques notées pour valider vos acquis face à des équipes métiers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenAuth('register', 'student')}
              className="text-sm font-medium text-[#F472B6] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Rejoindre pour soumettre
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="overflow-hidden rounded-2xl border border-[#A855F7]/20 bg-[#160D27]">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0D0716]">
                {!labImgError ? (
                  <img
                    src="/src/assets/images/challenge_fintech_lab_1795350948557.jpg"
                    alt="Poste de conception produit et développement front-end"
                    referrerPolicy="no-referrer"
                    onError={() => setLabImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#B8ADC8]">Atelier Produit</div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#160D27] via-transparent to-transparent" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 text-xs text-[#F472B6] mb-2">
                  <span>Ingénierie Produit & UI</span>
                  <span aria-hidden="true">·</span>
                  <span>Évaluation sur prototype</span>
                </div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  Architecture Front-End & Design Systems
                </h3>
                <p className="text-sm text-[#B8ADC8]">
                  Concevez des interfaces accessibles et réactives à partir de spécifications techniques fournies par
                  les entreprises partenaires.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#A855F7]/20 bg-[#160D27]">
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#0D0716]">
                {!dataImgError ? (
                  <img
                    src="/src/assets/images/challenge_data_studio_1795350948786.jpg"
                    alt="Laboratoire universitaire d'analyse de données et d'intelligence artificielle"
                    referrerPolicy="no-referrer"
                    onError={() => setDataImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-[#B8ADC8]">Laboratoire Données</div>
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#160D27] via-transparent to-transparent" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 text-xs text-[#F472B6] mb-2">
                  <span>Données, IA & Sécurité</span>
                  <span aria-hidden="true">·</span>
                  <span>Revue de code détaillée</span>
                </div>
                <h3 className="font-display text-lg font-semibold text-white mb-2">
                  Pipelines analytiques et sécurité applicative
                </h3>
                <p className="text-sm text-[#B8ADC8]">
                  Résolvez des problématiques réelles de structuration de données, d’API sécurisées et d’audit
                  technique.
                </p>
              </div>
            </div>
          </div>

          {challenges.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {challenges.slice(0, 3).map((ch) => (
                <div
                  key={ch.id}
                  className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#F472B6] mb-2">
                      <span>{ch.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ch.difficulty}</span>
                    </div>
                    <h4 className="font-display text-base font-semibold text-white mb-2">{ch.title}</h4>
                    <p className="text-xs text-[#B8ADC8] line-clamp-3 mb-4">{ch.summary}</p>
                  </div>
                  <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-[#8D7FA3]">
                    <span className="truncate pr-2">{ch.companyName}</span>
                    <span className="font-mono-tabular whitespace-nowrap shrink-0">Échéance {ch.deadline}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 03 DISCOVER — Portfolio & Enterprise Partner Hub */}
        <section id="portfolio" className="mx-auto max-w-[1240px] px-6 py-14 border-t border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch rounded-2xl border border-[#F472B6]/20 bg-[#160D27] overflow-hidden">
            <div className="lg:col-span-6 p-8 lg:p-10 flex flex-col justify-between">
              <div>
                <p className="text-xs font-medium text-[#F472B6] mb-3">Portfolio vérifié & Partenariats campus</p>
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-4">
                  Un portfolio qui attire directement les équipes de recrutement
                </h2>
                <p className="text-sm leading-relaxed text-[#B8ADC8] mb-6">
                  Publiez vos réalisations académiques, associez vos évaluations de challenges et échangez sans
                  intermédiaire avec les entreprises à la recherche de talents.
                </p>
                <ul className="space-y-3 text-sm text-[#E9E0F7] mb-8">
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#F472B6] shrink-0" aria-hidden="true" />
                    <span>Découverte de talents filtrée par compétence et université</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#F472B6] shrink-0" aria-hidden="true" />
                    <span>Notation structurée sur 100 et retours détaillés</span>
                  </li>
                  <li className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-[#F472B6] shrink-0" aria-hidden="true" />
                    <span>Messagerie directe intégrée entre étudiants et recruteurs</span>
                  </li>
                </ul>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', 'student')}
                  className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-6 py-2.5 text-sm font-semibold text-[#180A28] hover:brightness-105 transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Créer mon portfolio
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('register', 'company')}
                  className="rounded-full border border-[#A855F7]/40 bg-[#1E1335] px-5 py-2.5 text-sm font-medium text-white hover:border-[#F472B6]/65 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Inscrire mon entreprise
                </button>
              </div>
            </div>
            <div className="lg:col-span-6 relative min-h-[280px] bg-[#0D0716]">
              {!partnerImgError ? (
                <img
                  src="/src/assets/images/company_partner_hub_1795350947836.jpg"
                  alt="Équipe d'ingénierie dans un hub technologique partenaire"
                  referrerPolicy="no-referrer"
                  onError={() => setPartnerImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[#B8ADC8]">Espace Entreprise</div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#160D27]/75 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {/* About / Campus Collaboration Section */}
        <section id="apropos" className="mx-auto max-w-[1240px] px-6 py-14 border-t border-white/10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 relative min-h-[260px] overflow-hidden rounded-2xl border border-[#A855F7]/20 bg-[#160D27]">
              {!heroImgError ? (
                <img
                  src="/src/assets/images/hero_campus_collaboration_1795350948132.jpg"
                  alt="Étudiants universitaires collaborant autour d'un projet technique"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-[#B8ADC8]">Campus SkillSwap Pro</div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0D0716]/80 via-transparent to-transparent" />
            </div>
            <div className="lg:col-span-7 flex flex-col justify-between rounded-2xl border border-[#A855F7]/20 bg-[#160D27] p-8">
              <div>
                <p className="text-xs font-medium text-[#F472B6] mb-2">À propos de SkillSwap Pro</p>
                <h2 className="font-display text-2xl font-bold text-white tracking-tight mb-4">
                  Relier l’entraide universitaire et la réalité des métiers techniques
                </h2>
                <p className="text-sm leading-relaxed text-[#B8ADC8] mb-6">
                  Conçue pour les campus francophones, la plateforme réunit dans un même espace l’apprentissage entre
                  pairs, la validation pratique par des challenges d’entreprise et un suivi administratif transparent
                  par rôle.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
                <div className="flex flex-wrap items-center gap-4 text-xs text-[#C5B9D8]">
                  <span>Étudiants</span>
                  <span aria-hidden="true">·</span>
                  <span>Entreprises partenaires</span>
                  <span aria-hidden="true">·</span>
                  <span>Supervision campus</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#F472B6] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Accéder à mon espace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing / Subscription Offers Section */}
        <section id="tarifs" className="mx-auto max-w-[1240px] px-6 py-14 border-t border-white/10">
          <div className="max-w-2xl mb-10">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#F472B6] mb-2">
              Abonnements & Paiement sécurisé Maroc
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
              Des formules claires pour les étudiants et les entreprises
            </h2>
            <p className="text-sm sm:text-base text-[#B8ADC8]">
              Paiement en ligne en Dirhams marocains (DH) avec activation instantanée et facture officielle téléchargeable.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 ${
                  plan.code === 'student_annual' || plan.code === 'company_annual'
                    ? 'border-[#F472B6]/40 bg-gradient-to-b from-[#1D1032] to-[#160D27]'
                    : 'border-white/12 bg-[#160D27]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-[#F472B6] font-semibold">
                    <span>{plan.targetRole === 'student' ? 'Étudiant' : 'Entreprise'}</span>
                    <span className="font-mono-tabular">{plan.durationMonths} mois</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-mono-tabular text-3xl font-bold text-white">{plan.priceMad}</span>
                    <span className="text-sm font-semibold text-[#F472B6]">
                      {plan.currency} / {plan.billingCycle === 'annual' ? 'an' : 'mois'}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-[#B8ADC8]">{plan.description}</p>
                  <ul className="space-y-2 pt-3 border-t border-white/10">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-[#E9E0F7]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#F472B6] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenAuth('register', plan.targetRole)}
                  className="w-full rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 cursor-pointer"
                >
                  Souscrire ({plan.priceMad} {plan.currency})
                </button>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#0D0716]">
        <div className="mx-auto max-w-[1240px] px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#8D7FA3]">
          <div className="flex items-center gap-3">
            <span className="font-display text-sm font-semibold text-white">
              SkillSwap <span className="text-[#F472B6]">Pro.</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>Plateforme universitaire francophone</span>
          </div>
          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="hover:text-[#F472B6] transition-colors cursor-pointer"
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('register', 'student')}
              className="hover:text-[#F472B6] transition-colors cursor-pointer"
            >
              Inscription
            </button>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#F472B6]" aria-hidden="true" />
              Accès sécurisé par rôle
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
