import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountStatus,
  AdminSubscriptionsOverview,
  AppNotification,
  Challenge,
  ChallengeStatus,
  ChallengeSubmission,
  DirectMessage,
  ExchangeStatus,
  InvoiceRecord,
  PaymentProvider,
  PaymentRecord,
  PaymentStatus,
  PlatformStats,
  PortfolioProject,
  Skill,
  SkillExchange,
  SkillLevel,
  SkillMode,
  SubmissionStatus,
  SubscriptionBillingCycle,
  SubscriptionPlan,
  SubscriptionPlanCode,
  SubscriptionStatus,
  SubscriptionSummary,
  TalentProfile,
  UserProfile,
  UserRole,
  UserSkill,
  UserSubscription,
} from '../types/index.ts';

export const ADMIN_EMAIL = 'fernibasma@gmail.com';

const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

const SUPABASE_URL = process.env.SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY?.trim() || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

const isSupabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let supabaseAnon: SupabaseClient | null = null;
let supabaseAdmin: SupabaseClient | null = null;

if (isSupabaseEnabled) {
  supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Validation & Cryptographic Helpers
// ---------------------------------------------------------------------------

export function sanitizeHttpUrl(raw: string | undefined | null): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derived.length) return false;
  return crypto.timingSafeEqual(keyBuf, derived);
}

interface TokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  exp: number;
}

function signToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedToken(token: string): TokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (!decoded.sub || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SQLite Persistence Engine (used when Supabase env vars are not configured)
// ---------------------------------------------------------------------------

let sqliteDb: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (sqliteDb) return sqliteDb;
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const customPath = process.env.SKILLSWAP_DB_PATH?.trim();
  const dbPath = customPath || path.join(dataDir, 'skillswap.db');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'company', 'admin')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
      university TEXT NOT NULL DEFAULT '',
      major TEXT NOT NULL DEFAULT '',
      company_name TEXT NOT NULL DEFAULT '',
      sector TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      website_url TEXT NOT NULL DEFAULT '',
      github_url TEXT NOT NULL DEFAULT '',
      linkedin_url TEXT NOT NULL DEFAULT '',
      notify_exchanges INTEGER NOT NULL DEFAULT 1,
      notify_challenges INTEGER NOT NULL DEFAULT 1,
      notify_messages INTEGER NOT NULL DEFAULT 1,
      profile_visibility TEXT NOT NULL DEFAULT 'public',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      mode TEXT NOT NULL CHECK (mode IN ('offered', 'wanted')),
      level TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE (user_id, skill_id, mode)
    );

    CREATE TABLE IF NOT EXISTS skill_exchanges (
      id TEXT PRIMARY KEY,
      requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      offered_skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      requested_skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      message TEXT NOT NULL DEFAULT '',
      proposed_hours INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'completed')),
      response_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      summary TEXT NOT NULL,
      brief TEXT NOT NULL,
      reward TEXT NOT NULL DEFAULT '',
      deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS challenge_submissions (
      id TEXT PRIMARY KEY,
      challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      solution_url TEXT NOT NULL,
      summary TEXT NOT NULL,
      score INTEGER,
      feedback TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'approved', 'needs_revision')),
      evaluated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      evaluated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (challenge_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS portfolio_projects (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      technologies TEXT NOT NULL DEFAULT '',
      project_url TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      link_tab TEXT NOT NULL DEFAULT 'overview',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscription_plans (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      target_role TEXT NOT NULL CHECK (target_role IN ('student', 'company')),
      billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'annual')),
      price_mad REAL NOT NULL CHECK (price_mad >= 0),
      currency TEXT NOT NULL DEFAULT 'DH',
      duration_months INTEGER NOT NULL CHECK (duration_months > 0),
      description TEXT NOT NULL DEFAULT '',
      features_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
      price_paid_mad REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('active', 'expired', 'pending_payment', 'cancelled')),
      starts_at TEXT,
      expires_at TEXT,
      auto_renew INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
      plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
      amount_mad REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'DH',
      provider TEXT NOT NULL DEFAULT 'sandbox',
      payment_method TEXT NOT NULL DEFAULT 'card',
      card_brand TEXT NOT NULL DEFAULT '',
      card_last4 TEXT NOT NULL DEFAULT '',
      provider_ref TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled', 'refund_requested', 'refunded')),
      failure_reason TEXT NOT NULL DEFAULT '',
      refund_reason TEXT NOT NULL DEFAULT '',
      refunded_at TEXT,
      paid_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT NOT NULL UNIQUE,
      payment_id TEXT NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
      subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_org TEXT NOT NULL DEFAULT '',
      plan_name TEXT NOT NULL,
      amount_mad REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'DH',
      status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded')),
      issued_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  seedInitialSkillCatalog(db);
  seedInitialSubscriptionPlans(db);
  sqliteDb = db;
  return db;
}

function seedInitialSubscriptionPlans(db: DatabaseSync): void {
  const now = new Date().toISOString();
  const plans: Array<{
    code: SubscriptionPlanCode;
    name: string;
    targetRole: 'student' | 'company';
    billingCycle: SubscriptionBillingCycle;
    priceMad: number;
    durationMonths: number;
    description: string;
    features: string[];
  }> = [
    {
      code: 'student_annual',
      name: 'Abonnement Étudiant Annuel',
      targetRole: 'student',
      billingCycle: 'annual',
      priceMad: 100,
      durationMonths: 12,
      description:
        'Accès complet pendant 12 mois aux échanges de compétences, challenges d’entreprises, portfolio vérifié et messagerie.',
      features: [
        'Échanges de compétences illimités entre étudiants',
        'Participation et soumission aux challenges d’entreprises',
        'Portfolio public vérifié et visible par les recruteurs',
        'Messagerie directe et notifications en temps réel',
      ],
    },
    {
      code: 'company_monthly',
      name: 'Entreprise Mensuel',
      targetRole: 'company',
      billingCycle: 'monthly',
      priceMad: 490,
      durationMonths: 1,
      description:
        'Formule souple sans engagement annuel pour publier des challenges et sourcer des talents universitaires.',
      features: [
        'Publication de challenges pratiques et évaluation notée',
        'Accès complet à l’annuaire et portfolios des talents',
        'Messagerie directe avec les étudiants présélectionnés',
        'Facturation mensuelle avec reçu téléchargeable',
      ],
    },
    {
      code: 'company_annual',
      name: 'Entreprise Annuel',
      targetRole: 'company',
      billingCycle: 'annual',
      priceMad: 4900,
      durationMonths: 12,
      description:
        'Couverture annuelle complète pour les équipes RH et techniques avec 2 mois offerts par rapport au tarif mensuel.',
      features: [
        'Challenges illimités toute l’année (12 mois)',
        'Accès prioritaire aux talents et portfolios vérifiés',
        'Messagerie directe illimitée avec les candidats',
        'Économie annuelle dédiée et suivi administratif prioritaire',
      ],
    },
  ];

  const insert = db.prepare(
    `INSERT OR IGNORE INTO subscription_plans (
      id, code, name, target_role, billing_cycle, price_mad, currency,
      duration_months, description, features_json, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'DH', ?, ?, ?, 1, ?, ?)`
  );
  for (const plan of plans) {
    insert.run(
      crypto.randomUUID(),
      plan.code,
      plan.name,
      plan.targetRole,
      plan.billingCycle,
      plan.priceMad,
      plan.durationMonths,
      plan.description,
      JSON.stringify(plan.features),
      now,
      now
    );
  }
}

function seedInitialSkillCatalog(db: DatabaseSync): void {
  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM skills').get() as { cnt: number };
  if (countRow.cnt > 0) return;

  const now = new Date().toISOString();
  const initialSkills = [
    { name: 'React & TypeScript', category: 'Développement Web', description: 'Interfaces front-end modernes, architecture de composants et typage strict.' },
    { name: 'Node.js & API REST', category: 'Développement Backend', description: 'Services serveur Express, authentification et bases relationnelles.' },
    { name: 'Python & Data Science', category: 'Données & IA', description: 'Analyse de données, pandas, visualisation et pipelines analytiques.' },
    { name: 'Machine Learning', category: 'Données & IA', description: 'Modélisation prédictive, scikit-learn, réseaux de neurones et évaluation.' },
    { name: 'Design UI/UX Figma', category: 'Design Produit', description: 'Systèmes de design, prototypage interactif et recherche utilisateur.' },
    { name: 'Cybersécurité & Audit', category: 'Sécurité', description: 'Sécurisation applicative, tests d’intrusion et gestion des identités.' },
    { name: 'Cloud & DevOps', category: 'Infrastructure', description: 'Conteneurisation Docker, CI/CD et déploiement cloud.' },
    { name: 'SQL & Modélisation PostgreSQL', category: 'Bases de données', description: 'Schémas relationnels, indexation, optimisation et politiques RLS.' },
    { name: 'Développement Mobile Flutter', category: 'Mobile', description: 'Applications mobiles multiplateformes iOS et Android.' },
    { name: 'Gestion de Produit Agile', category: 'Produit & Stratégie', description: 'Roadmap produit, entretiens utilisateurs et priorisation Scrum.' },
    { name: 'Marketing Digital & Croissance', category: 'Business', description: 'Acquisition, SEO, analytics et stratégie de lancement.' },
    { name: 'Anglais Technique & Pitch', category: 'Langues & Communication', description: 'Prise de parole en public, rédaction technique et entretiens.' },
  ];

  const insert = db.prepare(
    'INSERT INTO skills (id, name, category, description, created_by, created_at) VALUES (?, ?, ?, ?, NULL, ?)'
  );
  for (const s of initialSkills) {
    insert.run(crypto.randomUUID(), s.name, s.category, s.description, now);
  }
}

function mapSqliteProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as UserRole,
    status: row.status as AccountStatus,
    university: String(row.university || ''),
    major: String(row.major || ''),
    companyName: String(row.company_name || ''),
    sector: String(row.sector || ''),
    city: String(row.city || ''),
    bio: String(row.bio || ''),
    websiteUrl: String(row.website_url || ''),
    githubUrl: String(row.github_url || ''),
    linkedinUrl: String(row.linkedin_url || ''),
    notifyExchanges: Boolean(row.notify_exchanges),
    notifyChallenges: Boolean(row.notify_challenges),
    notifyMessages: Boolean(row.notify_messages),
    profileVisibility: (row.profile_visibility as 'public' | 'companies_only') || 'public',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapSupabaseProfile(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name),
    role: row.role as UserRole,
    status: row.status as AccountStatus,
    university: String(row.university || ''),
    major: String(row.major || ''),
    companyName: String(row.company_name || ''),
    sector: String(row.sector || ''),
    city: String(row.city || ''),
    bio: String(row.bio || ''),
    websiteUrl: String(row.website_url || ''),
    githubUrl: String(row.github_url || ''),
    linkedinUrl: String(row.linkedin_url || ''),
    notifyExchanges: Boolean(row.notify_exchanges),
    notifyChallenges: Boolean(row.notify_challenges),
    notifyMessages: Boolean(row.notify_messages),
    profileVisibility: (row.profile_visibility as 'public' | 'companies_only') || 'public',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Unified Store API
// ---------------------------------------------------------------------------

export async function registerUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: 'student' | 'company';
  university?: string;
  major?: string;
  companyName?: string;
  sector?: string;
  city?: string;
}): Promise<{ user: UserProfile; token: string }> {
  const email = input.email.trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new Error('Adresse e-mail invalide.');
  }
  if (!input.password || input.password.length < 8) {
    throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  }
  const fullName = input.fullName.trim();
  if (fullName.length < 2) {
    throw new Error('Le nom complet est requis.');
  }

  const assignedRole: UserRole =
    email === ADMIN_EMAIL ? 'admin' : input.role === 'company' ? 'company' : 'student';

  if (isSupabaseEnabled && supabaseAnon && supabaseAdmin) {
    const { data, error } = await supabaseAnon.auth.signUp({
      email,
      password: input.password,
      options: {
        data: {
          full_name: fullName,
          role: assignedRole,
          university: (input.university || '').trim(),
          major: (input.major || '').trim(),
          company_name: (input.companyName || '').trim(),
          sector: (input.sector || '').trim(),
        },
      },
    });
    if (error || !data.user) {
      throw new Error(error?.message || "Impossible de créer le compte sur Supabase.");
    }

    const now = new Date().toISOString();
    const { data: profileRow, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert(
        {
          id: data.user.id,
          email,
          full_name: fullName,
          role: assignedRole,
          status: 'active',
          university: (input.university || '').trim(),
          major: (input.major || '').trim(),
          company_name: (input.companyName || '').trim(),
          sector: (input.sector || '').trim(),
          city: (input.city || '').trim(),
          updated_at: now,
        },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (profileErr || !profileRow) {
      throw new Error(profileErr?.message || 'Erreur lors de la création du profil.');
    }

    let token = data.session?.access_token || '';
    if (!token) {
      const signInRes = await supabaseAnon.auth.signInWithPassword({ email, password: input.password });
      token = signInRes.data.session?.access_token || '';
    }
    if (!token) {
      throw new Error('Compte créé. Veuillez confirmer votre e-mail puis vous connecter.');
    }
    return { user: mapSupabaseProfile(profileRow), token };
  }

  // SQLite engine
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('Un compte existe déjà avec cette adresse e-mail.');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const passwordHash = hashPassword(input.password);

  db.prepare(
    `INSERT INTO users (
      id, email, password_hash, full_name, role, status,
      university, major, company_name, sector, city,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    email,
    passwordHash,
    fullName,
    assignedRole,
    (input.university || '').trim(),
    (input.major || '').trim(),
    (input.companyName || '').trim(),
    (input.sector || '').trim(),
    (input.city || '').trim(),
    now,
    now
  );

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  const user = mapSqliteProfile(row);
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return { user, token };
}

export async function loginUser(emailRaw: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const email = emailRaw.trim().toLowerCase();
  if (!isValidEmail(email) || !password) {
    throw new Error('Identifiants invalides.');
  }

  if (isSupabaseEnabled && supabaseAnon && supabaseAdmin) {
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) {
      throw new Error('Adresse e-mail ou mot de passe incorrect.');
    }

    const { data: profileRow, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileErr || !profileRow) {
      throw new Error('Profil introuvable.');
    }
    const profile = mapSupabaseProfile(profileRow);
    if (profile.status === 'suspended') {
      throw new Error('Ce compte a été suspendu par un administrateur.');
    }
    if (profile.email === ADMIN_EMAIL && profile.role !== 'admin') {
      await supabaseAdmin.from('profiles').update({ role: 'admin' }).eq('id', profile.id);
      profile.role = 'admin';
    }
    return { user: profile, token: data.session.access_token };
  }

  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as Record<string, unknown> | undefined;
  if (!row || !verifyPassword(password, String(row.password_hash))) {
    throw new Error('Adresse e-mail ou mot de passe incorrect.');
  }
  if (row.status === 'suspended') {
    throw new Error('Ce compte a été suspendu par un administrateur.');
  }
  if (email === ADMIN_EMAIL && row.role !== 'admin') {
    db.prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      String(row.id)
    );
    row.role = 'admin';
  }
  const user = mapSqliteProfile(row);
  const token = signToken({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });
  return { user, token };
}

export async function authenticateToken(token: string): Promise<UserProfile | null> {
  if (!token) return null;

  if (isSupabaseEnabled && supabaseAnon && supabaseAdmin) {
    const { data, error } = await supabaseAnon.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: profileRow } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
    if (!profileRow) return null;
    const profile = mapSupabaseProfile(profileRow);
    if (profile.status === 'suspended') return null;
    if (profile.email === ADMIN_EMAIL && profile.role !== 'admin') {
      profile.role = 'admin';
    }
    return profile;
  }

  const decoded = verifySignedToken(token);
  if (!decoded) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.sub) as Record<string, unknown> | undefined;
  if (!row || row.status === 'suspended') return null;
  return mapSqliteProfile(row);
}

// ---------------------------------------------------------------------------
// Platform Stats & Public Catalog
// ---------------------------------------------------------------------------

export async function getPlatformStats(): Promise<PlatformStats> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const [
      { count: totalUsers },
      { count: studentsCount },
      { count: companiesCount },
      { count: adminsCount },
      { count: skillsCount },
      { count: exchangesCount },
      { count: acceptedExchangesCount },
      { count: completedExchangesCount },
      { count: challengesCount },
      { count: openChallengesCount },
      { count: submissionsCount },
      { count: portfolioCount },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'company'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
      supabaseAdmin.from('skills').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('skill_exchanges').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('skill_exchanges').select('*', { count: 'exact', head: true }).eq('status', 'accepted'),
      supabaseAdmin.from('skill_exchanges').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabaseAdmin.from('challenges').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('challenges').select('*', { count: 'exact', head: true }).eq('status', 'open'),
      supabaseAdmin.from('challenge_submissions').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('portfolio_projects').select('*', { count: 'exact', head: true }),
    ]);
    return {
      totalUsers: totalUsers || 0,
      studentsCount: studentsCount || 0,
      companiesCount: companiesCount || 0,
      adminsCount: adminsCount || 0,
      skillsCount: skillsCount || 0,
      exchangesCount: exchangesCount || 0,
      acceptedExchangesCount: acceptedExchangesCount || 0,
      completedExchangesCount: completedExchangesCount || 0,
      challengesCount: challengesCount || 0,
      openChallengesCount: openChallengesCount || 0,
      submissionsCount: submissionsCount || 0,
      portfolioCount: portfolioCount || 0,
    };
  }

  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as { cnt: number }).cnt;
  return {
    totalUsers: c('SELECT COUNT(*) as cnt FROM users'),
    studentsCount: c("SELECT COUNT(*) as cnt FROM users WHERE role = 'student'"),
    companiesCount: c("SELECT COUNT(*) as cnt FROM users WHERE role = 'company'"),
    adminsCount: c("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'"),
    skillsCount: c('SELECT COUNT(*) as cnt FROM skills'),
    exchangesCount: c('SELECT COUNT(*) as cnt FROM skill_exchanges'),
    acceptedExchangesCount: c("SELECT COUNT(*) as cnt FROM skill_exchanges WHERE status = 'accepted'"),
    completedExchangesCount: c("SELECT COUNT(*) as cnt FROM skill_exchanges WHERE status = 'completed'"),
    challengesCount: c('SELECT COUNT(*) as cnt FROM challenges'),
    openChallengesCount: c("SELECT COUNT(*) as cnt FROM challenges WHERE status = 'open'"),
    submissionsCount: c('SELECT COUNT(*) as cnt FROM challenge_submissions'),
    portfolioCount: c('SELECT COUNT(*) as cnt FROM portfolio_projects'),
  };
}

// ---------------------------------------------------------------------------
// Profiles & Settings & Admin User Management
// ---------------------------------------------------------------------------

export async function updateProfile(
  userId: string,
  updates: Partial<{
    fullName: string;
    university: string;
    major: string;
    companyName: string;
    sector: string;
    city: string;
    bio: string;
    websiteUrl: string;
    githubUrl: string;
    linkedinUrl: string;
    notifyExchanges: boolean;
    notifyChallenges: boolean;
    notifyMessages: boolean;
    profileVisibility: 'public' | 'companies_only';
  }>
): Promise<UserProfile> {
  const now = new Date().toISOString();
  const cleanPayload = {
    full_name: updates.fullName?.trim(),
    university: updates.university?.trim(),
    major: updates.major?.trim(),
    company_name: updates.companyName?.trim(),
    sector: updates.sector?.trim(),
    city: updates.city?.trim(),
    bio: updates.bio?.trim(),
    website_url: updates.websiteUrl !== undefined ? sanitizeHttpUrl(updates.websiteUrl) : undefined,
    github_url: updates.githubUrl !== undefined ? sanitizeHttpUrl(updates.githubUrl) : undefined,
    linkedin_url: updates.linkedinUrl !== undefined ? sanitizeHttpUrl(updates.linkedinUrl) : undefined,
    notify_exchanges: updates.notifyExchanges,
    notify_challenges: updates.notifyChallenges,
    notify_messages: updates.notifyMessages,
    profile_visibility: updates.profileVisibility,
    updated_at: now,
  };

  if (isSupabaseEnabled && supabaseAdmin) {
    const filtered: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cleanPayload)) {
      if (v !== undefined) filtered[k] = v;
    }
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(filtered)
      .eq('id', userId)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur mise à jour profil.');
    return mapSupabaseProfile(data);
  }

  const db = getDb();
  const current = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
  if (!current) throw new Error('Utilisateur introuvable.');

  db.prepare(
    `UPDATE users SET
      full_name = ?,
      university = ?,
      major = ?,
      company_name = ?,
      sector = ?,
      city = ?,
      bio = ?,
      website_url = ?,
      github_url = ?,
      linkedin_url = ?,
      notify_exchanges = ?,
      notify_challenges = ?,
      notify_messages = ?,
      profile_visibility = ?,
      updated_at = ?
     WHERE id = ?`
  ).run(
    cleanPayload.full_name ?? String(current.full_name),
    cleanPayload.university ?? String(current.university),
    cleanPayload.major ?? String(current.major),
    cleanPayload.company_name ?? String(current.company_name),
    cleanPayload.sector ?? String(current.sector),
    cleanPayload.city ?? String(current.city),
    cleanPayload.bio ?? String(current.bio),
    cleanPayload.website_url ?? String(current.website_url),
    cleanPayload.github_url ?? String(current.github_url),
    cleanPayload.linkedin_url ?? String(current.linkedin_url),
    cleanPayload.notify_exchanges !== undefined ? (cleanPayload.notify_exchanges ? 1 : 0) : Number(current.notify_exchanges),
    cleanPayload.notify_challenges !== undefined ? (cleanPayload.notify_challenges ? 1 : 0) : Number(current.notify_challenges),
    cleanPayload.notify_messages !== undefined ? (cleanPayload.notify_messages ? 1 : 0) : Number(current.notify_messages),
    cleanPayload.profile_visibility ?? String(current.profile_visibility),
    now,
    userId
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
  return mapSqliteProfile(updated);
}

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
  }
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: userRow } = await supabaseAdmin.from('profiles').select('email').eq('id', userId).single();
    if (!userRow || !supabaseAnon) throw new Error('Utilisateur introuvable.');
    const verify = await supabaseAnon.auth.signInWithPassword({
      email: String(userRow.email),
      password: currentPassword,
    });
    if (verify.error) {
      throw new Error('Le mot de passe actuel est incorrect.');
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) throw new Error(error.message);
    return;
  }

  const db = getDb();
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId) as { password_hash: string } | undefined;
  if (!row || !verifyPassword(currentPassword, row.password_hash)) {
    throw new Error('Le mot de passe actuel est incorrect.');
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(newPassword),
    new Date().toISOString(),
    userId
  );
}

export async function listUsers(forRole?: UserRole): Promise<UserProfile[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('profiles').select('*').order('created_at', { ascending: false });
    if (forRole) query = query.eq('role', forRole);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapSupabaseProfile);
  }

  const db = getDb();
  const rows = forRole
    ? (db.prepare('SELECT * FROM users WHERE role = ? ORDER BY created_at DESC').all(forRole) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as Record<string, unknown>[]);
  return rows.map(mapSqliteProfile);
}

export async function adminUpdateUser(
  targetUserId: string,
  updates: { role?: UserRole; status?: AccountStatus }
): Promise<UserProfile> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: target } = await supabaseAdmin.from('profiles').select('email').eq('id', targetUserId).single();
    if (!target) throw new Error('Utilisateur introuvable.');
    if (String(target.email).toLowerCase() === ADMIN_EMAIL && updates.status === 'suspended') {
      throw new Error("Impossible de suspendre l'administrateur principal.");
    }
    const patch: Record<string, unknown> = { updated_at: now };
    if (updates.role) patch.role = updates.role;
    if (updates.status) patch.status = updates.status;
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(patch)
      .eq('id', targetUserId)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur mise à jour utilisateur.');
    return mapSupabaseProfile(data);
  }

  const db = getDb();
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) as Record<string, unknown> | undefined;
  if (!target) throw new Error('Utilisateur introuvable.');
  if (String(target.email).toLowerCase() === ADMIN_EMAIL && updates.status === 'suspended') {
    throw new Error("Impossible de suspendre l'administrateur principal.");
  }

  db.prepare('UPDATE users SET role = ?, status = ?, updated_at = ? WHERE id = ?').run(
    updates.role ?? String(target.role),
    updates.status ?? String(target.status),
    now,
    targetUserId
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) as Record<string, unknown>;
  return mapSqliteProfile(updated);
}

// ---------------------------------------------------------------------------
// Skills Catalog & User Skills
// ---------------------------------------------------------------------------

export async function listSkills(): Promise<Skill[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('skills').select('*').order('category').order('name');
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      category: String(r.category),
      description: String(r.description || ''),
      createdBy: r.created_by ? String(r.created_by) : null,
      createdAt: String(r.created_at),
    }));
  }

  const db = getDb();
  const rows = db.prepare('SELECT * FROM skills ORDER BY category ASC, name ASC').all() as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    category: String(r.category),
    description: String(r.description || ''),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at),
  }));
}

export async function createSkill(input: { name: string; category: string; description: string; createdBy: string }): Promise<Skill> {
  const name = input.name.trim();
  const category = input.category.trim();
  if (!name || !category) throw new Error('Le nom et la catégorie sont requis.');
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('skills')
      .insert({ name, category, description: input.description.trim(), created_by: input.createdBy })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'Impossible de créer la compétence.');
    return {
      id: String(data.id),
      name: String(data.name),
      category: String(data.category),
      description: String(data.description || ''),
      createdBy: data.created_by ? String(data.created_by) : null,
      createdAt: String(data.created_at),
    };
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM skills WHERE lower(name) = lower(?)').get(name);
  if (existing) throw new Error('Cette compétence existe déjà.');
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO skills (id, name, category, description, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    name,
    category,
    input.description.trim(),
    input.createdBy,
    now
  );
  return { id, name, category, description: input.description.trim(), createdBy: input.createdBy, createdAt: now };
}

export async function deleteSkill(skillId: string): Promise<void> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const { error } = await supabaseAdmin.from('skills').delete().eq('id', skillId);
    if (error) throw new Error(error.message);
    return;
  }
  const db = getDb();
  db.prepare('DELETE FROM skills WHERE id = ?').run(skillId);
}

export async function listUserSkills(filters?: { userId?: string; mode?: SkillMode }): Promise<UserSkill[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin
      .from('user_skills')
      .select('*, skills(name, category), profiles(full_name, university, major, city, status)')
      .order('created_at', { ascending: false });
    if (filters?.userId) query = query.eq('user_id', filters.userId);
    if (filters?.mode) query = query.eq('mode', filters.mode);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || [])
      .filter((r: Record<string, any>) => r.profiles?.status !== 'suspended')
      .map((r: Record<string, any>) => ({
        id: String(r.id),
        userId: String(r.user_id),
        skillId: String(r.skill_id),
        skillName: String(r.skills?.name || ''),
        skillCategory: String(r.skills?.category || ''),
        mode: r.mode as SkillMode,
        level: r.level as SkillLevel,
        notes: String(r.notes || ''),
        createdAt: String(r.created_at),
        userFullName: String(r.profiles?.full_name || ''),
        userUniversity: String(r.profiles?.university || ''),
        userMajor: String(r.profiles?.major || ''),
        userCity: String(r.profiles?.city || ''),
      }));
  }

  const db = getDb();
  let sql = `
    SELECT us.*, s.name as skill_name, s.category as skill_category,
           u.full_name as user_full_name, u.university as user_university,
           u.major as user_major, u.city as user_city
    FROM user_skills us
    JOIN skills s ON s.id = us.skill_id
    JOIN users u ON u.id = us.user_id
    WHERE u.status = 'active'
  `;
  const params: string[] = [];
  if (filters?.userId) {
    sql += ' AND us.user_id = ?';
    params.push(filters.userId);
  }
  if (filters?.mode) {
    sql += ' AND us.mode = ?';
    params.push(filters.mode);
  }
  sql += ' ORDER BY us.created_at DESC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: String(r.user_id),
    skillId: String(r.skill_id),
    skillName: String(r.skill_name),
    skillCategory: String(r.skill_category),
    mode: r.mode as SkillMode,
    level: r.level as SkillLevel,
    notes: String(r.notes || ''),
    createdAt: String(r.created_at),
    userFullName: String(r.user_full_name || ''),
    userUniversity: String(r.user_university || ''),
    userMajor: String(r.user_major || ''),
    userCity: String(r.user_city || ''),
  }));
}

export async function upsertUserSkill(input: {
  userId: string;
  skillId: string;
  mode: SkillMode;
  level: SkillLevel;
  notes: string;
}): Promise<UserSkill> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('user_skills')
      .upsert(
        {
          user_id: input.userId,
          skill_id: input.skillId,
          mode: input.mode,
          level: input.level,
          notes: input.notes.trim(),
        },
        { onConflict: 'user_id,skill_id,mode' }
      )
      .select('*, skills(name, category)')
      .single();
    if (error || !data) throw new Error(error?.message || 'Impossible d’enregistrer la compétence.');
    return {
      id: String(data.id),
      userId: String(data.user_id),
      skillId: String(data.skill_id),
      skillName: String((data as any).skills?.name || ''),
      skillCategory: String((data as any).skills?.category || ''),
      mode: data.mode as SkillMode,
      level: data.level as SkillLevel,
      notes: String(data.notes || ''),
      createdAt: String(data.created_at),
    };
  }

  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO user_skills (id, user_id, skill_id, mode, level, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, skill_id, mode) DO UPDATE SET level = excluded.level, notes = excluded.notes`
  ).run(id, input.userId, input.skillId, input.mode, input.level, input.notes.trim(), now);

  const row = db
    .prepare(
      `SELECT us.*, s.name as skill_name, s.category as skill_category
       FROM user_skills us JOIN skills s ON s.id = us.skill_id
       WHERE us.user_id = ? AND us.skill_id = ? AND us.mode = ?`
    )
    .get(input.userId, input.skillId, input.mode) as Record<string, unknown>;

  return {
    id: String(row.id),
    userId: String(row.user_id),
    skillId: String(row.skill_id),
    skillName: String(row.skill_name),
    skillCategory: String(row.skill_category),
    mode: row.mode as SkillMode,
    level: row.level as SkillLevel,
    notes: String(row.notes || ''),
    createdAt: String(row.created_at),
  };
}

export async function removeUserSkill(userId: string, userSkillId: string, isAdmin: boolean): Promise<void> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('user_skills').delete().eq('id', userSkillId);
    if (!isAdmin) query = query.eq('user_id', userId);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return;
  }

  const db = getDb();
  if (isAdmin) {
    db.prepare('DELETE FROM user_skills WHERE id = ?').run(userSkillId);
  } else {
    db.prepare('DELETE FROM user_skills WHERE id = ? AND user_id = ?').run(userSkillId, userId);
  }
}

// ---------------------------------------------------------------------------
// Notifications Helper
// ---------------------------------------------------------------------------

export async function createNotification(input: {
  userId: string;
  type: 'exchange' | 'challenge' | 'message' | 'system';
  title: string;
  body: string;
  linkTab: string;
}): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled && supabaseAdmin) {
    await supabaseAdmin.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link_tab: input.linkTab,
    });
    return;
  }
  const db = getDb();
  db.prepare(
    'INSERT INTO notifications (id, user_id, type, title, body, link_tab, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
  ).run(crypto.randomUUID(), input.userId, input.type, input.title, input.body, input.linkTab, now);
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data || []).map((n) => ({
      id: String(n.id),
      userId: String(n.user_id),
      type: n.type as AppNotification['type'],
      title: String(n.title),
      body: String(n.body),
      linkTab: String(n.link_tab || 'overview'),
      isRead: Boolean(n.is_read),
      createdAt: String(n.created_at),
    }));
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(userId) as Record<string, unknown>[];
  return rows.map((n) => ({
    id: String(n.id),
    userId: String(n.user_id),
    type: n.type as AppNotification['type'],
    title: String(n.title),
    body: String(n.body),
    linkTab: String(n.link_tab || 'overview'),
    isRead: Boolean(n.is_read),
    createdAt: String(n.created_at),
  }));
}

export async function markNotificationRead(userId: string, notificationId?: string): Promise<void> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('notifications').update({ is_read: true }).eq('user_id', userId);
    if (notificationId) query = query.eq('id', notificationId);
    await query;
    return;
  }
  const db = getDb();
  if (notificationId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notificationId, userId);
  } else {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }
}

// ---------------------------------------------------------------------------
// Skill Exchanges (Create, List, Accept, Reject, Complete)
// ---------------------------------------------------------------------------

export async function listExchanges(userId: string, isAdmin: boolean): Promise<SkillExchange[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin
      .from('skill_exchanges')
      .select(
        `*,
        requester:profiles!skill_exchanges_requester_id_fkey(full_name, university),
        recipient:profiles!skill_exchanges_recipient_id_fkey(full_name, university),
        offered:skills!skill_exchanges_offered_skill_id_fkey(name),
        requested:skills!skill_exchanges_requested_skill_id_fkey(name)`
      )
      .order('created_at', { ascending: false });
    if (!isAdmin) {
      query = query.or(`requester_id.eq.${userId},recipient_id.eq.${userId}`);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((r: Record<string, any>) => ({
      id: String(r.id),
      requesterId: String(r.requester_id),
      recipientId: String(r.recipient_id),
      requesterName: String(r.requester?.full_name || ''),
      requesterUniversity: String(r.requester?.university || ''),
      recipientName: String(r.recipient?.full_name || ''),
      recipientUniversity: String(r.recipient?.university || ''),
      offeredSkillId: String(r.offered_skill_id),
      offeredSkillName: String(r.offered?.name || ''),
      requestedSkillId: String(r.requested_skill_id),
      requestedSkillName: String(r.requested?.name || ''),
      message: String(r.message || ''),
      proposedHours: Number(r.proposed_hours || 2),
      status: r.status as ExchangeStatus,
      responseNote: String(r.response_note || ''),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  const db = getDb();
  let sql = `
    SELECT se.*,
      req.full_name as requester_name, req.university as requester_university,
      rec.full_name as recipient_name, rec.university as recipient_university,
      os.name as offered_skill_name, rs.name as requested_skill_name
    FROM skill_exchanges se
    JOIN users req ON req.id = se.requester_id
    JOIN users rec ON rec.id = se.recipient_id
    JOIN skills os ON os.id = se.offered_skill_id
    JOIN skills rs ON rs.id = se.requested_skill_id
  `;
  const params: string[] = [];
  if (!isAdmin) {
    sql += ' WHERE se.requester_id = ? OR se.recipient_id = ?';
    params.push(userId, userId);
  }
  sql += ' ORDER BY se.created_at DESC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    requesterId: String(r.requester_id),
    recipientId: String(r.recipient_id),
    requesterName: String(r.requester_name),
    requesterUniversity: String(r.requester_university || ''),
    recipientName: String(r.recipient_name),
    recipientUniversity: String(r.recipient_university || ''),
    offeredSkillId: String(r.offered_skill_id),
    offeredSkillName: String(r.offered_skill_name),
    requestedSkillId: String(r.requested_skill_id),
    requestedSkillName: String(r.requested_skill_name),
    message: String(r.message || ''),
    proposedHours: Number(r.proposed_hours || 2),
    status: r.status as ExchangeStatus,
    responseNote: String(r.response_note || ''),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function createExchange(input: {
  requesterId: string;
  requesterName: string;
  recipientId: string;
  offeredSkillId: string;
  requestedSkillId: string;
  message: string;
  proposedHours: number;
}): Promise<SkillExchange> {
  if (input.requesterId === input.recipientId) {
    throw new Error('Vous ne pouvez pas vous envoyer une demande d’échange à vous-même.');
  }
  const hours = Math.max(1, Math.min(40, Math.round(Number(input.proposedHours) || 2)));
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('skill_exchanges')
      .insert({
        requester_id: input.requesterId,
        recipient_id: input.recipientId,
        offered_skill_id: input.offeredSkillId,
        requested_skill_id: input.requestedSkillId,
        message: input.message.trim(),
        proposed_hours: hours,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur lors de la création de l’échange.');

    await createNotification({
      userId: input.recipientId,
      type: 'exchange',
      title: 'Nouvelle demande d’échange',
      body: `${input.requesterName} vous propose un échange de compétences (${hours} h).`,
      linkTab: 'exchanges',
    });

    const all = await listExchanges(input.requesterId, false);
    const created = all.find((e) => e.id === data.id);
    if (!created) throw new Error('Échange créé mais introuvable.');
    return created;
  }

  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO skill_exchanges (
      id, requester_id, recipient_id, offered_skill_id, requested_skill_id,
      message, proposed_hours, status, response_note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)`
  ).run(id, input.requesterId, input.recipientId, input.offeredSkillId, input.requestedSkillId, input.message.trim(), hours, now, now);

  await createNotification({
    userId: input.recipientId,
    type: 'exchange',
    title: 'Nouvelle demande d’échange',
    body: `${input.requesterName} vous propose un échange de compétences (${hours} h).`,
    linkTab: 'exchanges',
  });

  const all = await listExchanges(input.requesterId, false);
  const created = all.find((e) => e.id === id);
  if (!created) throw new Error('Échange introuvable.');
  return created;
}

export async function respondToExchange(input: {
  exchangeId: string;
  actor: UserProfile;
  status: 'accepted' | 'rejected' | 'completed';
  responseNote?: string;
}): Promise<SkillExchange> {
  const now = new Date().toISOString();
  const all = await listExchanges(input.actor.id, input.actor.role === 'admin');
  const existing = all.find((e) => e.id === input.exchangeId);
  if (!existing) {
    throw new Error('Demande d’échange introuvable ou accès refusé.');
  }

  if ((input.status === 'accepted' || input.status === 'rejected') && existing.recipientId !== input.actor.id && input.actor.role !== 'admin') {
    throw new Error('Seul le destinataire peut accepter ou refuser cette demande.');
  }
  if (input.status === 'completed' && existing.status !== 'accepted') {
    throw new Error('Un échange doit être accepté avant d’être marqué comme terminé.');
  }

  if (isSupabaseEnabled && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('skill_exchanges')
      .update({
        status: input.status,
        response_note: (input.responseNote || existing.responseNote).trim(),
        updated_at: now,
      })
      .eq('id', input.exchangeId);
    if (error) throw new Error(error.message);
  } else {
    const db = getDb();
    db.prepare('UPDATE skill_exchanges SET status = ?, response_note = ?, updated_at = ? WHERE id = ?').run(
      input.status,
      (input.responseNote || existing.responseNote).trim(),
      now,
      input.exchangeId
    );
  }

  const notifyTarget = existing.requesterId === input.actor.id ? existing.recipientId : existing.requesterId;
  const labelMap: Record<string, string> = {
    accepted: 'Échange accepté',
    rejected: 'Échange refusé',
    completed: 'Échange terminé',
  };
  await createNotification({
    userId: notifyTarget,
    type: 'exchange',
    title: labelMap[input.status],
    body: `${input.actor.fullName} a mis à jour votre échange (${existing.offeredSkillName} ↔ ${existing.requestedSkillName}).`,
    linkTab: 'exchanges',
  });

  const refreshed = await listExchanges(input.actor.id, input.actor.role === 'admin');
  return refreshed.find((e) => e.id === input.exchangeId)!;
}

// ---------------------------------------------------------------------------
// Challenges, Submissions & Evaluations
// ---------------------------------------------------------------------------

export async function listChallenges(): Promise<Challenge[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('challenges')
      .select('*, profiles(full_name, company_name, sector), challenge_submissions(id)')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((c: Record<string, any>) => ({
      id: String(c.id),
      companyId: String(c.company_id),
      companyName: String(c.profiles?.company_name || c.profiles?.full_name || ''),
      companyOwnerName: String(c.profiles?.full_name || ''),
      companySector: String(c.profiles?.sector || ''),
      title: String(c.title),
      category: String(c.category),
      difficulty: c.difficulty as Challenge['difficulty'],
      summary: String(c.summary),
      brief: String(c.brief),
      reward: String(c.reward || ''),
      deadline: String(c.deadline),
      status: c.status as ChallengeStatus,
      submissionsCount: Array.isArray(c.challenge_submissions) ? c.challenge_submissions.length : 0,
      createdAt: String(c.created_at),
      updatedAt: String(c.updated_at),
    }));
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT c.*, u.full_name as company_owner_name, u.company_name, u.sector as company_sector,
        (SELECT COUNT(*) FROM challenge_submissions cs WHERE cs.challenge_id = c.id) as submissions_count
       FROM challenges c
       JOIN users u ON u.id = c.company_id
       ORDER BY c.created_at DESC`
    )
    .all() as Record<string, unknown>[];

  return rows.map((c) => ({
    id: String(c.id),
    companyId: String(c.company_id),
    companyName: String(c.company_name || c.company_owner_name),
    companyOwnerName: String(c.company_owner_name),
    companySector: String(c.company_sector || ''),
    title: String(c.title),
    category: String(c.category),
    difficulty: c.difficulty as Challenge['difficulty'],
    summary: String(c.summary),
    brief: String(c.brief),
    reward: String(c.reward || ''),
    deadline: String(c.deadline),
    status: c.status as ChallengeStatus,
    submissionsCount: Number(c.submissions_count || 0),
    createdAt: String(c.created_at),
    updatedAt: String(c.updated_at),
  }));
}

export async function createChallenge(input: {
  companyId: string;
  title: string;
  category: string;
  difficulty: 'Débutant' | 'Intermédiaire' | 'Avancé';
  summary: string;
  brief: string;
  reward: string;
  deadline: string;
}): Promise<Challenge> {
  if (!input.title.trim() || !input.summary.trim() || !input.brief.trim() || !input.deadline.trim()) {
    throw new Error('Veuillez remplir tous les champs obligatoires du défi.');
  }
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('challenges')
      .insert({
        company_id: input.companyId,
        title: input.title.trim(),
        category: input.category.trim(),
        difficulty: input.difficulty,
        summary: input.summary.trim(),
        brief: input.brief.trim(),
        reward: input.reward.trim(),
        deadline: input.deadline.trim(),
        status: 'open',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur lors de la création du défi.');
    const list = await listChallenges();
    return list.find((c) => c.id === data.id)!;
  }

  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO challenges (id, company_id, title, category, difficulty, summary, brief, reward, deadline, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`
  ).run(
    id,
    input.companyId,
    input.title.trim(),
    input.category.trim(),
    input.difficulty,
    input.summary.trim(),
    input.brief.trim(),
    input.reward.trim(),
    input.deadline.trim(),
    now,
    now
  );
  const list = await listChallenges();
  return list.find((c) => c.id === id)!;
}

export async function updateChallengeStatus(challengeId: string, actor: UserProfile, status: ChallengeStatus): Promise<Challenge> {
  const list = await listChallenges();
  const existing = list.find((c) => c.id === challengeId);
  if (!existing) throw new Error('Défi introuvable.');
  if (existing.companyId !== actor.id && actor.role !== 'admin') {
    throw new Error('Permission refusée.');
  }
  const now = new Date().toISOString();
  if (isSupabaseEnabled && supabaseAdmin) {
    const { error } = await supabaseAdmin.from('challenges').update({ status, updated_at: now }).eq('id', challengeId);
    if (error) throw new Error(error.message);
  } else {
    getDb().prepare('UPDATE challenges SET status = ?, updated_at = ? WHERE id = ?').run(status, now, challengeId);
  }
  const updated = await listChallenges();
  return updated.find((c) => c.id === challengeId)!;
}

export async function deleteChallenge(challengeId: string, actor: UserProfile): Promise<void> {
  const list = await listChallenges();
  const existing = list.find((c) => c.id === challengeId);
  if (!existing) throw new Error('Défi introuvable.');
  if (existing.companyId !== actor.id && actor.role !== 'admin') {
    throw new Error('Permission refusée.');
  }
  if (isSupabaseEnabled && supabaseAdmin) {
    const { error } = await supabaseAdmin.from('challenges').delete().eq('id', challengeId);
    if (error) throw new Error(error.message);
    return;
  }
  getDb().prepare('DELETE FROM challenges WHERE id = ?').run(challengeId);
}

export async function listSubmissions(actor: UserProfile, challengeId?: string): Promise<ChallengeSubmission[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin
      .from('challenge_submissions')
      .select(
        `*,
        challenges(title, company_id),
        profiles!challenge_submissions_student_id_fkey(full_name, university, major)`
      )
      .order('created_at', { ascending: false });
    if (challengeId) query = query.eq('challenge_id', challengeId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || [])
      .filter((r: Record<string, any>) => {
        if (actor.role === 'admin') return true;
        if (actor.role === 'student') return r.student_id === actor.id;
        return r.challenges?.company_id === actor.id;
      })
      .map((r: Record<string, any>) => ({
        id: String(r.id),
        challengeId: String(r.challenge_id),
        challengeTitle: String(r.challenges?.title || ''),
        studentId: String(r.student_id),
        studentName: String(r.profiles?.full_name || ''),
        studentUniversity: String(r.profiles?.university || ''),
        studentMajor: String(r.profiles?.major || ''),
        solutionUrl: String(r.solution_url),
        summary: String(r.summary),
        score: r.score !== null && r.score !== undefined ? Number(r.score) : null,
        feedback: String(r.feedback || ''),
        status: r.status as SubmissionStatus,
        evaluatedBy: r.evaluated_by ? String(r.evaluated_by) : null,
        evaluatedAt: r.evaluated_at ? String(r.evaluated_at) : null,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      }));
  }

  const db = getDb();
  let sql = `
    SELECT cs.*, c.title as challenge_title, c.company_id as challenge_company_id,
           u.full_name as student_name, u.university as student_university, u.major as student_major
    FROM challenge_submissions cs
    JOIN challenges c ON c.id = cs.challenge_id
    JOIN users u ON u.id = cs.student_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (challengeId) {
    sql += ' AND cs.challenge_id = ?';
    params.push(challengeId);
  }
  if (actor.role === 'student') {
    sql += ' AND cs.student_id = ?';
    params.push(actor.id);
  } else if (actor.role === 'company') {
    sql += ' AND c.company_id = ?';
    params.push(actor.id);
  }
  sql += ' ORDER BY cs.created_at DESC';

  const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: String(r.id),
    challengeId: String(r.challenge_id),
    challengeTitle: String(r.challenge_title),
    studentId: String(r.student_id),
    studentName: String(r.student_name),
    studentUniversity: String(r.student_university || ''),
    studentMajor: String(r.student_major || ''),
    solutionUrl: String(r.solution_url),
    summary: String(r.summary),
    score: r.score !== null && r.score !== undefined ? Number(r.score) : null,
    feedback: String(r.feedback || ''),
    status: r.status as SubmissionStatus,
    evaluatedBy: r.evaluated_by ? String(r.evaluated_by) : null,
    evaluatedAt: r.evaluated_at ? String(r.evaluated_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  }));
}

export async function submitChallengeSolution(input: {
  challengeId: string;
  student: UserProfile;
  solutionUrl: string;
  summary: string;
}): Promise<ChallengeSubmission> {
  const safeUrl = sanitizeHttpUrl(input.solutionUrl);
  if (!safeUrl) {
    throw new Error('Veuillez fournir une URL valide commençant par https:// ou http://.');
  }
  if (!input.summary.trim()) {
    throw new Error('Veuillez décrire votre approche technique.');
  }

  const challenges = await listChallenges();
  const challenge = challenges.find((c) => c.id === input.challengeId);
  if (!challenge) throw new Error('Défi introuvable.');
  if (challenge.status !== 'open') throw new Error('Ce défi n’accepte plus de soumissions.');

  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('challenge_submissions')
      .upsert(
        {
          challenge_id: input.challengeId,
          student_id: input.student.id,
          solution_url: safeUrl,
          summary: input.summary.trim(),
          status: 'submitted',
          updated_at: now,
        },
        { onConflict: 'challenge_id,student_id' }
      )
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur lors de la soumission.');
  } else {
    const db = getDb();
    const id = crypto.randomUUID();
    db.prepare(
      `INSERT INTO challenge_submissions (id, challenge_id, student_id, solution_url, summary, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)
       ON CONFLICT(challenge_id, student_id) DO UPDATE SET
         solution_url = excluded.solution_url,
         summary = excluded.summary,
         status = 'submitted',
         updated_at = excluded.updated_at`
    ).run(id, input.challengeId, input.student.id, safeUrl, input.summary.trim(), now, now);
  }

  await createNotification({
    userId: challenge.companyId,
    type: 'challenge',
    title: 'Nouvelle soumission de défi',
    body: `${input.student.fullName} a soumis une solution pour « ${challenge.title} ».`,
    linkTab: 'challenges',
  });

  const subs = await listSubmissions(input.student, input.challengeId);
  return subs[0];
}

export async function evaluateSubmission(input: {
  submissionId: string;
  evaluator: UserProfile;
  score: number;
  feedback: string;
  status: 'approved' | 'needs_revision';
}): Promise<ChallengeSubmission> {
  const score = Math.max(0, Math.min(100, Math.round(Number(input.score))));
  const now = new Date().toISOString();

  const visible = await listSubmissions(input.evaluator);
  const existing = visible.find((s) => s.id === input.submissionId);
  if (!existing) {
    throw new Error('Soumission introuvable ou permission refusée.');
  }

  if (isSupabaseEnabled && supabaseAdmin) {
    const { error } = await supabaseAdmin
      .from('challenge_submissions')
      .update({
        score,
        feedback: input.feedback.trim(),
        status: input.status,
        evaluated_by: input.evaluator.id,
        evaluated_at: now,
        updated_at: now,
      })
      .eq('id', input.submissionId);
    if (error) throw new Error(error.message);
  } else {
    getDb()
      .prepare(
        `UPDATE challenge_submissions
         SET score = ?, feedback = ?, status = ?, evaluated_by = ?, evaluated_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(score, input.feedback.trim(), input.status, input.evaluator.id, now, now, input.submissionId);
  }

  await createNotification({
    userId: existing.studentId,
    type: 'challenge',
    title: 'Évaluation reçue',
    body: `Votre soumission pour « ${existing.challengeTitle} » a été évaluée : ${score}/100.`,
    linkTab: 'challenges',
  });

  const refreshed = await listSubmissions(input.evaluator);
  return refreshed.find((s) => s.id === input.submissionId)!;
}

// ---------------------------------------------------------------------------
// Portfolio Projects
// ---------------------------------------------------------------------------

export async function listPortfolio(studentId?: string): Promise<PortfolioProject[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('portfolio_projects').select('*').order('created_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((p) => ({
      id: String(p.id),
      studentId: String(p.student_id),
      title: String(p.title),
      category: String(p.category),
      description: String(p.description),
      technologies: String(p.technologies || ''),
      projectUrl: String(p.project_url || ''),
      completedAt: String(p.completed_at),
      createdAt: String(p.created_at),
    }));
  }

  const db = getDb();
  const rows = studentId
    ? (db.prepare('SELECT * FROM portfolio_projects WHERE student_id = ? ORDER BY created_at DESC').all(studentId) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM portfolio_projects ORDER BY created_at DESC').all() as Record<string, unknown>[]);
  return rows.map((p) => ({
    id: String(p.id),
    studentId: String(p.student_id),
    title: String(p.title),
    category: String(p.category),
    description: String(p.description),
    technologies: String(p.technologies || ''),
    projectUrl: String(p.project_url || ''),
    completedAt: String(p.completed_at),
    createdAt: String(p.created_at),
  }));
}

export async function createPortfolioProject(input: {
  studentId: string;
  title: string;
  category: string;
  description: string;
  technologies: string;
  projectUrl: string;
  completedAt: string;
}): Promise<PortfolioProject> {
  if (!input.title.trim() || !input.description.trim()) {
    throw new Error('Le titre et la description du projet sont requis.');
  }
  const safeUrl = sanitizeHttpUrl(input.projectUrl);
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('portfolio_projects')
      .insert({
        student_id: input.studentId,
        title: input.title.trim(),
        category: input.category.trim(),
        description: input.description.trim(),
        technologies: input.technologies.trim(),
        project_url: safeUrl,
        completed_at: input.completedAt.trim() || now.slice(0, 10),
      })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur création projet portfolio.');
    return {
      id: String(data.id),
      studentId: String(data.student_id),
      title: String(data.title),
      category: String(data.category),
      description: String(data.description),
      technologies: String(data.technologies || ''),
      projectUrl: String(data.project_url || ''),
      completedAt: String(data.completed_at),
      createdAt: String(data.created_at),
    };
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const completedAt = input.completedAt.trim() || now.slice(0, 10);
  db.prepare(
    `INSERT INTO portfolio_projects (id, student_id, title, category, description, technologies, project_url, completed_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.studentId,
    input.title.trim(),
    input.category.trim(),
    input.description.trim(),
    input.technologies.trim(),
    safeUrl,
    completedAt,
    now
  );
  return {
    id,
    studentId: input.studentId,
    title: input.title.trim(),
    category: input.category.trim(),
    description: input.description.trim(),
    technologies: input.technologies.trim(),
    projectUrl: safeUrl,
    completedAt,
    createdAt: now,
  };
}

export async function deletePortfolioProject(projectId: string, actor: UserProfile): Promise<void> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('portfolio_projects').delete().eq('id', projectId);
    if (actor.role !== 'admin') query = query.eq('student_id', actor.id);
    const { error } = await query;
    if (error) throw new Error(error.message);
    return;
  }
  const db = getDb();
  if (actor.role === 'admin') {
    db.prepare('DELETE FROM portfolio_projects WHERE id = ?').run(projectId);
  } else {
    db.prepare('DELETE FROM portfolio_projects WHERE id = ? AND student_id = ?').run(projectId, actor.id);
  }
}

// ---------------------------------------------------------------------------
// Talent Discovery (for Companies & Admin)
// ---------------------------------------------------------------------------

export async function listTalents(): Promise<TalentProfile[]> {
  const students = (await listUsers('student')).filter((u) => u.status === 'active');
  const allUserSkills = await listUserSkills();
  const allPortfolio = await listPortfolio();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: subs } = await supabaseAdmin.from('challenge_submissions').select('student_id, score');
    const { data: exch } = await supabaseAdmin
      .from('skill_exchanges')
      .select('requester_id, recipient_id, status')
      .eq('status', 'completed');

    return students.map((profile) => {
      const skills = allUserSkills.filter((s) => s.userId === profile.id);
      const portfolio = allPortfolio.filter((p) => p.studentId === profile.id);
      const studentSubs = (subs || []).filter((s) => s.student_id === profile.id && s.score !== null);
      const avg =
        studentSubs.length > 0
          ? Math.round(studentSubs.reduce((acc, s) => acc + Number(s.score), 0) / studentSubs.length)
          : null;
      const completedEx = (exch || []).filter((e) => e.requester_id === profile.id || e.recipient_id === profile.id).length;

      return {
        profile,
        skills,
        portfolio,
        evaluatedSubmissionsCount: studentSubs.length,
        averageScore: avg,
        completedExchangesCount: completedEx,
      };
    });
  }

  const db = getDb();
  const subs = db.prepare('SELECT student_id, score FROM challenge_submissions WHERE score IS NOT NULL').all() as {
    student_id: string;
    score: number;
  }[];
  const exch = db.prepare("SELECT requester_id, recipient_id FROM skill_exchanges WHERE status = 'completed'").all() as {
    requester_id: string;
    recipient_id: string;
  }[];

  return students.map((profile) => {
    const skills = allUserSkills.filter((s) => s.userId === profile.id);
    const portfolio = allPortfolio.filter((p) => p.studentId === profile.id);
    const studentSubs = subs.filter((s) => s.student_id === profile.id);
    const avg =
      studentSubs.length > 0
        ? Math.round(studentSubs.reduce((acc, s) => acc + s.score, 0) / studentSubs.length)
        : null;
    const completedEx = exch.filter((e) => e.requester_id === profile.id || e.recipient_id === profile.id).length;

    return {
      profile,
      skills,
      portfolio,
      evaluatedSubmissionsCount: studentSubs.length,
      averageScore: avg,
      completedExchangesCount: completedEx,
    };
  });
}

// ---------------------------------------------------------------------------
// Direct Messaging
// ---------------------------------------------------------------------------

export async function listMessages(userId: string): Promise<DirectMessage[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .select(
        `*,
        sender:profiles!messages_sender_id_fkey(full_name),
        recipient:profiles!messages_recipient_id_fkey(full_name)`
      )
      .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((m: Record<string, any>) => ({
      id: String(m.id),
      senderId: String(m.sender_id),
      recipientId: String(m.recipient_id),
      senderName: String(m.sender?.full_name || ''),
      recipientName: String(m.recipient?.full_name || ''),
      content: String(m.content),
      isRead: Boolean(m.is_read),
      createdAt: String(m.created_at),
    }));
  }

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.*, s.full_name as sender_name, r.full_name as recipient_name
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.recipient_id
       WHERE m.sender_id = ? OR m.recipient_id = ?
       ORDER BY m.created_at ASC`
    )
    .all(userId, userId) as Record<string, unknown>[];

  return rows.map((m) => ({
    id: String(m.id),
    senderId: String(m.sender_id),
    recipientId: String(m.recipient_id),
    senderName: String(m.sender_name),
    recipientName: String(m.recipient_name),
    content: String(m.content),
    isRead: Boolean(m.is_read),
    createdAt: String(m.created_at),
  }));
}

export async function sendMessage(input: {
  sender: UserProfile;
  recipientId: string;
  content: string;
}): Promise<DirectMessage> {
  const content = input.content.trim();
  if (!content) throw new Error('Le message ne peut pas être vide.');
  if (input.sender.id === input.recipientId) {
    throw new Error('Vous ne pouvez pas vous envoyer un message à vous-même.');
  }
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('messages')
      .insert({
        sender_id: input.sender.id,
        recipient_id: input.recipientId,
        content,
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur lors de l’envoi du message.');

    await createNotification({
      userId: input.recipientId,
      type: 'message',
      title: 'Nouveau message',
      body: `${input.sender.fullName} : ${content.slice(0, 90)}`,
      linkTab: 'messages',
    });

    const all = await listMessages(input.sender.id);
    return all.find((m) => m.id === data.id)!;
  }

  const db = getDb();
  const recipient = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(input.recipientId) as
    | { id: string; full_name: string }
    | undefined;
  if (!recipient) throw new Error('Destinataire introuvable.');

  const id = crypto.randomUUID();
  db.prepare('INSERT INTO messages (id, sender_id, recipient_id, content, is_read, created_at) VALUES (?, ?, ?, ?, 0, ?)').run(
    id,
    input.sender.id,
    input.recipientId,
    content,
    now
  );

  await createNotification({
    userId: input.recipientId,
    type: 'message',
    title: 'Nouveau message',
    body: `${input.sender.fullName} : ${content.slice(0, 90)}`,
    linkTab: 'messages',
  });

  return {
    id,
    senderId: input.sender.id,
    recipientId: input.recipientId,
    senderName: input.sender.fullName,
    recipientName: recipient.full_name,
    content,
    isRead: false,
    createdAt: now,
  };
}

export async function markConversationRead(userId: string, partnerId: string): Promise<void> {
  if (isSupabaseEnabled && supabaseAdmin) {
    await supabaseAdmin
      .from('messages')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('sender_id', partnerId);
    return;
  }
  getDb()
    .prepare('UPDATE messages SET is_read = 1 WHERE recipient_id = ? AND sender_id = ?')
    .run(userId, partnerId);
}

// ---------------------------------------------------------------------------
// Subscriptions, Moroccan Payment Gateways (CMI / Payzone / Sandbox) & Invoices
// ---------------------------------------------------------------------------

export function getActivePaymentProvider(): PaymentProvider {
  const configured = (process.env.PAYMENT_PROVIDER || 'sandbox').trim().toLowerCase();
  if (configured === 'cmi' && process.env.CMI_CLIENT_ID && process.env.CMI_STORE_KEY) {
    return 'cmi';
  }
  if (configured === 'payzone' && process.env.PAYZONE_MERCHANT_ID && process.env.PAYZONE_SECRET_KEY) {
    return 'payzone';
  }
  return 'sandbox';
}

function addMonthsIso(baseIso: string, months: number): string {
  const dt = new Date(baseIso);
  dt.setMonth(dt.getMonth() + months);
  return dt.toISOString();
}

function mapPlanRow(row: Record<string, unknown>): SubscriptionPlan {
  let features: string[] = [];
  if (Array.isArray(row.features)) {
    features = row.features.map((f) => String(f));
  } else if (typeof row.features_json === 'string') {
    try {
      const parsed = JSON.parse(row.features_json);
      if (Array.isArray(parsed)) features = parsed.map((f) => String(f));
    } catch {
      features = [];
    }
  } else if (typeof row.features === 'string') {
    try {
      const parsed = JSON.parse(row.features);
      if (Array.isArray(parsed)) features = parsed.map((f) => String(f));
    } catch {
      features = [];
    }
  }

  return {
    id: String(row.id),
    code: row.code as SubscriptionPlanCode,
    name: String(row.name),
    targetRole: row.target_role as 'student' | 'company',
    billingCycle: row.billing_cycle as SubscriptionBillingCycle,
    priceMad: Number(row.price_mad),
    currency: String(row.currency || 'DH'),
    durationMonths: Number(row.duration_months),
    description: String(row.description || ''),
    features,
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    updatedAt: String(row.updated_at),
  };
}

function mapSubscriptionRow(row: Record<string, any>): UserSubscription {
  const planObj = row.subscription_plans || {};
  const profileObj = row.profiles || {};
  return {
    id: String(row.id),
    userId: String(row.user_id),
    planId: String(row.plan_id),
    planCode: (row.plan_code || planObj.code || 'student_annual') as SubscriptionPlanCode,
    planName: String(row.plan_name || planObj.name || 'Abonnement'),
    targetRole: (row.target_role || planObj.target_role || 'student') as 'student' | 'company',
    billingCycle: (row.billing_cycle || planObj.billing_cycle || 'annual') as SubscriptionBillingCycle,
    pricePaidMad: Number(row.price_paid_mad || 0),
    status: row.status as SubscriptionStatus,
    startsAt: row.starts_at ? String(row.starts_at) : null,
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    autoRenew: Boolean(row.auto_renew),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    userFullName: row.user_full_name || profileObj.full_name ? String(row.user_full_name || profileObj.full_name) : undefined,
    userEmail: row.user_email || profileObj.email ? String(row.user_email || profileObj.email) : undefined,
    userRole: (row.user_role || profileObj.role) as UserRole | undefined,
    userCompanyName: row.user_company_name || profileObj.company_name ? String(row.user_company_name || profileObj.company_name) : undefined,
    userUniversity: row.user_university || profileObj.university ? String(row.user_university || profileObj.university) : undefined,
  };
}

function mapPaymentRow(row: Record<string, any>): PaymentRecord {
  const planObj = row.subscription_plans || {};
  const profileObj = row.profiles || {};
  const invoiceObj = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    subscriptionId: row.subscription_id ? String(row.subscription_id) : null,
    planId: String(row.plan_id),
    planName: String(row.plan_name || planObj.name || 'Abonnement'),
    amountMad: Number(row.amount_mad),
    currency: String(row.currency || 'DH'),
    provider: (row.provider || 'sandbox') as PaymentProvider,
    paymentMethod: String(row.payment_method || 'card'),
    cardBrand: String(row.card_brand || ''),
    cardLast4: String(row.card_last4 || ''),
    providerRef: String(row.provider_ref),
    status: row.status as PaymentStatus,
    failureReason: String(row.failure_reason || ''),
    refundReason: String(row.refund_reason || ''),
    refundedAt: row.refunded_at ? String(row.refunded_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    userFullName: row.user_full_name || profileObj.full_name ? String(row.user_full_name || profileObj.full_name) : undefined,
    userEmail: row.user_email || profileObj.email ? String(row.user_email || profileObj.email) : undefined,
    invoiceId: row.invoice_id || invoiceObj?.id ? String(row.invoice_id || invoiceObj?.id) : undefined,
    invoiceNumber: row.invoice_number || invoiceObj?.invoice_number ? String(row.invoice_number || invoiceObj?.invoice_number) : undefined,
  };
}

function mapInvoiceRow(row: Record<string, unknown>): InvoiceRecord {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    paymentId: String(row.payment_id),
    subscriptionId: row.subscription_id ? String(row.subscription_id) : null,
    userId: String(row.user_id),
    customerName: String(row.customer_name),
    customerEmail: String(row.customer_email),
    customerOrg: String(row.customer_org || ''),
    planName: String(row.plan_name),
    amountMad: Number(row.amount_mad),
    currency: String(row.currency || 'DH'),
    status: (row.status as 'paid' | 'refunded') || 'paid',
    issuedAt: String(row.issued_at),
    createdAt: String(row.created_at),
  };
}

export async function listSubscriptionPlans(targetRole?: 'student' | 'company'): Promise<SubscriptionPlan[]> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('subscription_plans').select('*').order('price_mad', { ascending: true });
    if (targetRole) query = query.eq('target_role', targetRole);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map((r) => mapPlanRow(r as Record<string, unknown>));
  }

  const db = getDb();
  const rows = targetRole
    ? (db.prepare('SELECT * FROM subscription_plans WHERE target_role = ? ORDER BY price_mad ASC').all(targetRole) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM subscription_plans ORDER BY target_role DESC, price_mad ASC').all() as Record<string, unknown>[]);
  return rows.map(mapPlanRow);
}

export async function adminUpdateSubscriptionPlan(
  planId: string,
  updates: Partial<{
    name: string;
    priceMad: number;
    description: string;
    features: string[];
    isActive: boolean;
  }>
): Promise<SubscriptionPlan> {
  const now = new Date().toISOString();
  const priceMad = updates.priceMad !== undefined ? Math.max(0, Math.round(Number(updates.priceMad) * 100) / 100) : undefined;
  if (priceMad !== undefined && (!Number.isFinite(priceMad) || priceMad <= 0)) {
    throw new Error('Le tarif doit être un montant positif en DH.');
  }

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();
    if (fetchErr || !existing) throw new Error('Offre introuvable.');

    const patch: Record<string, unknown> = { updated_at: now };
    if (updates.name?.trim()) patch.name = updates.name.trim();
    if (priceMad !== undefined) patch.price_mad = priceMad;
    if (updates.description !== undefined) patch.description = updates.description.trim();
    if (Array.isArray(updates.features)) patch.features = updates.features.map((f) => f.trim()).filter(Boolean);
    if (updates.isActive !== undefined) patch.is_active = updates.isActive;

    const { data, error } = await supabaseAdmin
      .from('subscription_plans')
      .update(patch)
      .eq('id', planId)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || 'Erreur lors de la mise à jour du tarif.');
    return mapPlanRow(data as Record<string, unknown>);
  }

  const db = getDb();
  const existing = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('Offre introuvable.');

  const nextName = updates.name?.trim() || String(existing.name);
  const nextPrice = priceMad !== undefined ? priceMad : Number(existing.price_mad);
  const nextDesc = updates.description !== undefined ? updates.description.trim() : String(existing.description);
  const nextFeatures = Array.isArray(updates.features)
    ? JSON.stringify(updates.features.map((f) => f.trim()).filter(Boolean))
    : String(existing.features_json);
  const nextActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : Number(existing.is_active);

  db.prepare(
    `UPDATE subscription_plans
     SET name = ?, price_mad = ?, description = ?, features_json = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(nextName, nextPrice, nextDesc, nextFeatures, nextActive, now, planId);

  const updated = db.prepare('SELECT * FROM subscription_plans WHERE id = ?').get(planId) as Record<string, unknown>;
  return mapPlanRow(updated);
}

async function syncExpiredSubscriptions(userId?: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin
      .from('subscriptions')
      .update({ status: 'expired', updated_at: now })
      .eq('status', 'active')
      .lte('expires_at', now);
    if (userId) query = query.eq('user_id', userId);
    await query;
    return;
  }

  const db = getDb();
  if (userId) {
    db.prepare("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE user_id = ? AND status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?").run(
      now,
      userId,
      now
    );
  } else {
    db.prepare("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= ?").run(
      now,
      now
    );
  }
}

async function maybeSendExpiryReminder(user: UserProfile, sub: UserSubscription | null): Promise<number | null> {
  if (!sub || sub.status !== 'active' || !sub.expiresAt) return null;
  const msRemaining = new Date(sub.expiresAt).getTime() - Date.now();
  const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));
  if (daysRemaining > 14 || daysRemaining < 0) return Math.max(0, daysRemaining);

  const expiryDateStr = new Date(sub.expiresAt).toLocaleDateString('fr-FR');
  const title = 'Renouvellement d’abonnement proche';
  const body = `Votre abonnement (${sub.planName}) expire le ${expiryDateStr} (dans ${daysRemaining} jour${daysRemaining > 1 ? 's' : ''}). Renouvelez-le pour éviter toute interruption.`;

  // Avoid spamming duplicate expiry reminder notifications for the same expiry date
  const existingNotifs = await listNotifications(user.id);
  const alreadySent = existingNotifs.some(
    (n) => n.title === title && n.body.includes(expiryDateStr)
  );
  if (!alreadySent) {
    await createNotification({
      userId: user.id,
      type: 'system',
      title,
      body,
      linkTab: 'subscription',
    });
  }
  return Math.max(0, daysRemaining);
}

export async function getSubscriptionSummaryForUser(user: UserProfile): Promise<SubscriptionSummary> {
  await syncExpiredSubscriptions(user.id);
  const targetRole = user.role === 'company' ? 'company' : user.role === 'student' ? 'student' : undefined;
  const plans = await listSubscriptionPlans(targetRole);
  const gatewayMode = getActivePaymentProvider();

  let subscription: UserSubscription | null = null;
  let payments: PaymentRecord[] = [];
  let invoices: InvoiceRecord[] = [];

  if (isSupabaseEnabled && supabaseAdmin) {
    const [{ data: subRow }, { data: payRows }, { data: invRows }] = await Promise.all([
      supabaseAdmin.from('subscriptions').select('*, subscription_plans(*)').eq('user_id', user.id).maybeSingle(),
      supabaseAdmin
        .from('payments')
        .select('*, subscription_plans(name), invoices(id, invoice_number)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('issued_at', { ascending: false }),
    ]);

    if (subRow) subscription = mapSubscriptionRow(subRow as Record<string, any>);
    payments = (payRows || []).map((r) => mapPaymentRow(r as Record<string, any>));
    invoices = (invRows || []).map((r) => mapInvoiceRow(r as Record<string, unknown>));
  } else {
    const db = getDb();
    const subRow = db
      .prepare(
        `SELECT s.*, sp.code as plan_code, sp.name as plan_name, sp.target_role, sp.billing_cycle
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id = s.plan_id
         WHERE s.user_id = ?`
      )
      .get(user.id) as Record<string, unknown> | undefined;
    if (subRow) subscription = mapSubscriptionRow(subRow);

    const payRows = db
      .prepare(
        `SELECT p.*, sp.name as plan_name, i.id as invoice_id, i.invoice_number
         FROM payments p
         JOIN subscription_plans sp ON sp.id = p.plan_id
         LEFT JOIN invoices i ON i.payment_id = p.id
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC`
      )
      .all(user.id) as Record<string, unknown>[];
    payments = payRows.map(mapPaymentRow);

    const invRows = db
      .prepare('SELECT * FROM invoices WHERE user_id = ? ORDER BY issued_at DESC')
      .all(user.id) as Record<string, unknown>[];
    invoices = invRows.map(mapInvoiceRow);
  }

  const hasActiveAccess =
    user.role === 'admin' ||
    Boolean(subscription && subscription.status === 'active' && subscription.expiresAt && new Date(subscription.expiresAt).getTime() > Date.now());

  const daysRemaining = user.role === 'admin' ? null : await maybeSendExpiryReminder(user, subscription);
  const isExpiringSoon = daysRemaining !== null && daysRemaining <= 14;

  return {
    subscription,
    hasActiveAccess,
    daysRemaining,
    isExpiringSoon,
    plans,
    payments,
    invoices,
    gatewayMode,
  };
}

export async function hasActiveSubscription(user: UserProfile): Promise<boolean> {
  if (user.role === 'admin') return true;
  await syncExpiredSubscriptions(user.id);
  const nowIso = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('subscriptions')
      .select('status, expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    return Boolean(data && data.status === 'active' && data.expires_at && String(data.expires_at) > nowIso);
  }

  const row = getDb()
    .prepare("SELECT status, expires_at FROM subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > ?")
    .get(user.id, nowIso) as { status: string; expires_at: string } | undefined;
  return Boolean(row);
}

interface CheckoutTokenPayload {
  paymentId: string;
  userId: string;
  providerRef: string;
  amountMad: number;
  provider: PaymentProvider;
  exp: number;
}

function signCheckoutToken(payload: CheckoutTokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(`chk:${body}`).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyCheckoutToken(token: string): CheckoutTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(`chk:${body}`).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as CheckoutTokenPayload;
    if (!parsed.paymentId || !parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function computeCmiHash(fields: Record<string, string>, storeKey: string): string {
  const sortedKeys = Object.keys(fields)
    .filter((k) => k.toLowerCase() !== 'hash' && k.toLowerCase() !== 'encoding')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const escapedValues = sortedKeys.map((k) =>
    String(fields[k] ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
  );
  const escapedKey = storeKey.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
  const hashVal = `${escapedValues.join('|')}|${escapedKey}`;
  return crypto.createHash('sha512').update(hashVal, 'utf8').digest('base64');
}

export async function createCheckoutSession(input: {
  user: UserProfile;
  planCode: SubscriptionPlanCode;
  cardBrand?: string;
  cardLast4?: string;
}): Promise<{
  payment: PaymentRecord;
  plan: SubscriptionPlan;
  provider: PaymentProvider;
  checkoutToken: string;
  gatewayRedirect?: {
    actionUrl: string;
    method: 'POST';
    fields: Record<string, string>;
  };
}> {
  if (input.user.role === 'admin') {
    throw new Error('Les comptes administrateurs disposent déjà d’un accès complet sans abonnement.');
  }

  const allPlans = await listSubscriptionPlans();
  const plan = allPlans.find((p) => p.code === input.planCode && p.isActive);
  if (!plan) {
    throw new Error('Offre d’abonnement introuvable ou inactive.');
  }
  if (plan.targetRole !== input.user.role) {
    throw new Error('Cette offre ne correspond pas à votre type de compte.');
  }

  // Strictly sanitize optional display metadata: NEVER accept/store full card numbers or CVV
  const safeLast4 = typeof input.cardLast4 === 'string' && /^\d{4}$/.test(input.cardLast4.trim()) ? input.cardLast4.trim() : '';
  const safeBrand = typeof input.cardBrand === 'string' ? input.cardBrand.trim().slice(0, 24) : '';

  const provider = getActivePaymentProvider();
  const providerRef = `SSP-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const now = new Date().toISOString();

  let subscriptionId: string;
  let payment: PaymentRecord;

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('id')
      .eq('user_id', input.user.id)
      .maybeSingle();

    if (existingSub?.id) {
      subscriptionId = String(existingSub.id);
    } else {
      const { data: createdSub, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: input.user.id,
          plan_id: plan.id,
          price_paid_mad: 0,
          status: 'pending_payment',
        })
        .select('id')
        .single();
      if (subErr || !createdSub) throw new Error(subErr?.message || 'Erreur initialisation abonnement.');
      subscriptionId = String(createdSub.id);
    }

    const { data: payRow, error: payErr } = await supabaseAdmin
      .from('payments')
      .insert({
        user_id: input.user.id,
        subscription_id: subscriptionId,
        plan_id: plan.id,
        amount_mad: plan.priceMad,
        currency: 'DH',
        provider,
        payment_method: provider === 'sandbox' ? 'sandbox_card' : 'card',
        card_brand: safeBrand,
        card_last4: safeLast4,
        provider_ref: providerRef,
        status: 'pending',
      })
      .select('*, subscription_plans(name)')
      .single();
    if (payErr || !payRow) throw new Error(payErr?.message || 'Erreur création transaction.');
    payment = mapPaymentRow(payRow as Record<string, any>);
  } else {
    const db = getDb();
    const existingSub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(input.user.id) as { id: string } | undefined;
    if (existingSub?.id) {
      subscriptionId = existingSub.id;
    } else {
      subscriptionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, price_paid_mad, status, auto_renew, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'pending_payment', 0, ?, ?)`
      ).run(subscriptionId, input.user.id, plan.id, now, now);
    }

    const payId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO payments (
        id, user_id, subscription_id, plan_id, amount_mad, currency, provider,
        payment_method, card_brand, card_last4, provider_ref, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'DH', ?, ?, ?, ?, ?, 'pending', ?, ?)`
    ).run(
      payId,
      input.user.id,
      subscriptionId,
      plan.id,
      plan.priceMad,
      provider,
      provider === 'sandbox' ? 'sandbox_card' : 'card',
      safeBrand,
      safeLast4,
      providerRef,
      now,
      now
    );

    const payRow = db
      .prepare('SELECT p.*, sp.name as plan_name FROM payments p JOIN subscription_plans sp ON sp.id = p.plan_id WHERE p.id = ?')
      .get(payId) as Record<string, unknown>;
    payment = mapPaymentRow(payRow);
  }

  const checkoutToken = signCheckoutToken({
    paymentId: payment.id,
    userId: input.user.id,
    providerRef,
    amountMad: plan.priceMad,
    provider,
    exp: Date.now() + 30 * 60 * 1000,
  });

  let gatewayRedirect:
    | {
        actionUrl: string;
        method: 'POST';
        fields: Record<string, string>;
      }
    | undefined;

  const baseUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  if (provider === 'cmi' && process.env.CMI_CLIENT_ID && process.env.CMI_STORE_KEY) {
    const fields: Record<string, string> = {
      clientid: process.env.CMI_CLIENT_ID,
      amount: plan.priceMad.toFixed(2),
      currency: '504',
      oid: providerRef,
      okUrl: `${baseUrl}/?payment=pending&ref=${encodeURIComponent(providerRef)}`,
      failUrl: `${baseUrl}/?payment=failed&ref=${encodeURIComponent(providerRef)}`,
      callbackUrl: `${baseUrl}/api/payments/cmi/callback`,
      trantype: 'PreAuth',
      storetype: '3D_PAY_HOSTING',
      lang: 'fr',
      email: input.user.email,
      BillToName: input.user.fullName,
      rnd: crypto.randomBytes(8).toString('hex'),
      encoding: 'UTF-8',
    };
    fields.HASH = computeCmiHash(fields, process.env.CMI_STORE_KEY);
    gatewayRedirect = {
      actionUrl: process.env.CMI_GATEWAY_URL || 'https://payment.cmi.co.ma/fim/est3Dgate',
      method: 'POST',
      fields,
    };
  } else if (provider === 'payzone' && process.env.PAYZONE_MERCHANT_ID && process.env.PAYZONE_SECRET_KEY) {
    const payload = JSON.stringify({
      merchantAccount: process.env.PAYZONE_MERCHANT_ID,
      price: plan.priceMad,
      currency: 'MAD',
      chargeId: providerRef,
      customerName: input.user.fullName,
      customerEmail: input.user.email,
      callbackUrl: `${baseUrl}/api/payments/webhook/payzone`,
      successUrl: `${baseUrl}/?payment=pending&ref=${encodeURIComponent(providerRef)}`,
      failureUrl: `${baseUrl}/?payment=failed&ref=${encodeURIComponent(providerRef)}`,
    });
    const signature = crypto
      .createHash('sha256')
      .update(`${process.env.PAYZONE_SECRET_KEY}${payload}`, 'utf8')
      .digest('hex');
    gatewayRedirect = {
      actionUrl: `${(process.env.PAYZONE_API_URL || 'https://paiement.payzone.ma').replace(/\/$/, '')}/paywall`,
      method: 'POST',
      fields: { payload, signature },
    };
  }

  return { payment, plan, provider, checkoutToken, gatewayRedirect };
}

export async function finalizeVerifiedPayment(input: {
  paymentId?: string;
  providerRef?: string;
  outcome: 'succeeded' | 'failed' | 'cancelled';
  failureReason?: string;
  cardBrand?: string;
  cardLast4?: string;
}): Promise<{
  payment: PaymentRecord;
  subscription: UserSubscription | null;
  invoice: InvoiceRecord | null;
}> {
  const now = new Date().toISOString();
  const safeLast4 = typeof input.cardLast4 === 'string' && /^\d{4}$/.test(input.cardLast4.trim()) ? input.cardLast4.trim() : '';
  const safeBrand = typeof input.cardBrand === 'string' ? input.cardBrand.trim().slice(0, 24) : '';

  // Load payment + plan + user + existing sub
  let paymentRow: Record<string, any> | undefined;
  if (isSupabaseEnabled && supabaseAdmin) {
    let q = supabaseAdmin.from('payments').select('*, subscription_plans(*), profiles(*)');
    if (input.paymentId) q = q.eq('id', input.paymentId);
    else if (input.providerRef) q = q.eq('provider_ref', input.providerRef);
    const { data, error } = await q.maybeSingle();
    if (error || !data) throw new Error('Transaction introuvable.');
    paymentRow = data;
  } else {
    const db = getDb();
    paymentRow = (
      input.paymentId
        ? db
            .prepare(
              `SELECT p.*, sp.name as plan_name, sp.code as plan_code, sp.duration_months, sp.price_mad as plan_price_mad,
                      u.full_name as user_full_name, u.email as user_email, u.company_name as user_company_name, u.university as user_university
               FROM payments p
               JOIN subscription_plans sp ON sp.id = p.plan_id
               JOIN users u ON u.id = p.user_id
               WHERE p.id = ?`
            )
            .get(input.paymentId)
        : db
            .prepare(
              `SELECT p.*, sp.name as plan_name, sp.code as plan_code, sp.duration_months, sp.price_mad as plan_price_mad,
                      u.full_name as user_full_name, u.email as user_email, u.company_name as user_company_name, u.university as user_university
               FROM payments p
               JOIN subscription_plans sp ON sp.id = p.plan_id
               JOIN users u ON u.id = p.user_id
               WHERE p.provider_ref = ?`
            )
            .get(input.providerRef || '')
    ) as Record<string, any> | undefined;
  }
  if (!paymentRow) throw new Error('Transaction introuvable.');

  const userId = String(paymentRow.user_id);
  const planId = String(paymentRow.plan_id);
  const planName = String(paymentRow.plan_name || paymentRow.subscription_plans?.name || 'Abonnement');
  const durationMonths = Number(paymentRow.duration_months || paymentRow.subscription_plans?.duration_months || 12);
  const amountMad = Number(paymentRow.amount_mad);

  // Idempotency: if already succeeded, return current state without duplicating invoice or extending twice
  if (paymentRow.status === 'succeeded') {
    const userStub = { id: userId, role: 'student' } as UserProfile;
    const summary = await getSubscriptionSummaryForUser(userStub);
    const currentPay = summary.payments.find((p) => p.id === String(paymentRow!.id)) || mapPaymentRow(paymentRow);
    const currentInv = summary.invoices.find((i) => i.paymentId === String(paymentRow!.id)) || null;
    return { payment: currentPay, subscription: summary.subscription, invoice: currentInv };
  }

  if (input.outcome !== 'succeeded') {
    const reason =
      input.failureReason?.trim() ||
      (input.outcome === 'cancelled'
        ? 'Paiement annulé avant validation finale.'
        : 'Transaction refusée par la banque ou le prestataire.');

    if (isSupabaseEnabled && supabaseAdmin) {
      await supabaseAdmin
        .from('payments')
        .update({
          status: input.outcome,
          failure_reason: reason,
          card_brand: safeBrand || paymentRow.card_brand || '',
          card_last4: safeLast4 || paymentRow.card_last4 || '',
          updated_at: now,
        })
        .eq('id', paymentRow.id);
    } else {
      getDb()
        .prepare(
          `UPDATE payments
           SET status = ?, failure_reason = ?, card_brand = COALESCE(NULLIF(?, ''), card_brand),
               card_last4 = COALESCE(NULLIF(?, ''), card_last4), updated_at = ?
           WHERE id = ?`
        )
        .run(input.outcome, reason, safeBrand, safeLast4, now, String(paymentRow.id));
    }

    await createNotification({
      userId,
      type: 'system',
      title: input.outcome === 'cancelled' ? 'Paiement annulé' : 'Échec du paiement',
      body: `Votre transaction de ${amountMad} DH (${planName}) n’a pas abouti : ${reason}`,
      linkTab: 'subscription',
    });

    const userStub = { id: userId, role: 'student' } as UserProfile;
    const summary = await getSubscriptionSummaryForUser(userStub);
    const updatedPay = summary.payments.find((p) => p.id === String(paymentRow!.id))!;
    return { payment: updatedPay, subscription: summary.subscription, invoice: null };
  }

  // Payment succeeded: activate or extend subscription + generate invoice
  const invoiceNumber = `INV-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const customerName = String(paymentRow.user_full_name || paymentRow.profiles?.full_name || '');
  const customerEmail = String(paymentRow.user_email || paymentRow.profiles?.email || '');
  const customerOrg = String(
    paymentRow.user_company_name ||
      paymentRow.profiles?.company_name ||
      paymentRow.user_university ||
      paymentRow.profiles?.university ||
      ''
  );

  let subscriptionId = paymentRow.subscription_id ? String(paymentRow.subscription_id) : '';
  let invoice: InvoiceRecord;

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: existingSub } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const activeExtensionBase =
      existingSub && existingSub.status === 'active' && existingSub.expires_at && String(existingSub.expires_at) > now
        ? String(existingSub.expires_at)
        : now;
    const startsAt =
      existingSub && existingSub.status === 'active' && existingSub.starts_at && String(existingSub.expires_at || '') > now
        ? String(existingSub.starts_at)
        : now;
    const expiresAt = addMonthsIso(activeExtensionBase, durationMonths);

    if (existingSub?.id) {
      subscriptionId = String(existingSub.id);
      await supabaseAdmin
        .from('subscriptions')
        .update({
          plan_id: planId,
          price_paid_mad: amountMad,
          status: 'active',
          starts_at: startsAt,
          expires_at: expiresAt,
          updated_at: now,
        })
        .eq('id', subscriptionId);
    } else {
      const { data: newSub, error: subErr } = await supabaseAdmin
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: planId,
          price_paid_mad: amountMad,
          status: 'active',
          starts_at: startsAt,
          expires_at: expiresAt,
        })
        .select('id')
        .single();
      if (subErr || !newSub) throw new Error(subErr?.message || 'Erreur activation abonnement.');
      subscriptionId = String(newSub.id);
    }

    await supabaseAdmin
      .from('payments')
      .update({
        subscription_id: subscriptionId,
        status: 'succeeded',
        failure_reason: '',
        card_brand: safeBrand || paymentRow.card_brand || '',
        card_last4: safeLast4 || paymentRow.card_last4 || '',
        paid_at: now,
        updated_at: now,
      })
      .eq('id', paymentRow.id);

    const { data: invRow, error: invErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        invoice_number: invoiceNumber,
        payment_id: paymentRow.id,
        subscription_id: subscriptionId,
        user_id: userId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_org: customerOrg,
        plan_name: planName,
        amount_mad: amountMad,
        currency: 'DH',
        status: 'paid',
        issued_at: now,
      })
      .select()
      .single();
    if (invErr || !invRow) throw new Error(invErr?.message || 'Erreur génération facture.');
    invoice = mapInvoiceRow(invRow as Record<string, unknown>);
  } else {
    const db = getDb();
    const existingSub = db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    const activeExtensionBase =
      existingSub && existingSub.status === 'active' && existingSub.expires_at && String(existingSub.expires_at) > now
        ? String(existingSub.expires_at)
        : now;
    const startsAt =
      existingSub && existingSub.status === 'active' && existingSub.starts_at && String(existingSub.expires_at || '') > now
        ? String(existingSub.starts_at)
        : now;
    const expiresAt = addMonthsIso(activeExtensionBase, durationMonths);

    if (existingSub?.id) {
      subscriptionId = String(existingSub.id);
      db.prepare(
        `UPDATE subscriptions
         SET plan_id = ?, price_paid_mad = ?, status = 'active', starts_at = ?, expires_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(planId, amountMad, startsAt, expiresAt, now, subscriptionId);
    } else {
      subscriptionId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO subscriptions (id, user_id, plan_id, price_paid_mad, status, starts_at, expires_at, auto_renew, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?, 0, ?, ?)`
      ).run(subscriptionId, userId, planId, amountMad, startsAt, expiresAt, now, now);
    }

    db.prepare(
      `UPDATE payments
       SET subscription_id = ?, status = 'succeeded', failure_reason = '',
           card_brand = COALESCE(NULLIF(?, ''), card_brand),
           card_last4 = COALESCE(NULLIF(?, ''), card_last4),
           paid_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(subscriptionId, safeBrand, safeLast4, now, now, String(paymentRow.id));

    const invId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO invoices (
        id, invoice_number, payment_id, subscription_id, user_id, customer_name,
        customer_email, customer_org, plan_name, amount_mad, currency, status, issued_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DH', 'paid', ?, ?)`
    ).run(
      invId,
      invoiceNumber,
      String(paymentRow.id),
      subscriptionId,
      userId,
      customerName,
      customerEmail,
      customerOrg,
      planName,
      amountMad,
      now,
      now
    );

    const invRow = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invId) as Record<string, unknown>;
    invoice = mapInvoiceRow(invRow);
  }

  await createNotification({
    userId,
    type: 'system',
    title: 'Abonnement activé avec succès',
    body: `Paiement de ${amountMad} DH confirmé (${invoice.invoiceNumber}). Votre ${planName} est désormais actif.`,
    linkTab: 'subscription',
  });

  const userStub = { id: userId, role: 'student' } as UserProfile;
  const summary = await getSubscriptionSummaryForUser(userStub);
  const updatedPay = summary.payments.find((p) => p.id === String(paymentRow!.id))!;
  return { payment: updatedPay, subscription: summary.subscription, invoice };
}

export function verifyCmiCallbackSignature(fields: Record<string, string>): boolean {
  const storeKey = process.env.CMI_STORE_KEY || '';
  if (!storeKey || !fields.HASH) return false;
  const expected = computeCmiHash(fields, storeKey);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(fields.HASH));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyPayzoneSignature(rawPayload: string, signatureHeader: string): boolean {
  const secret = process.env.PAYZONE_NOTIFICATION_KEY || process.env.PAYZONE_SECRET_KEY || '';
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex');
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(signatureHeader.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyGenericWebhookSignature(rawPayload: string, signatureHeader: string): boolean {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || '';
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex');
  const a = Buffer.from(expected.toLowerCase());
  const b = Buffer.from(signatureHeader.trim().toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function requestPaymentRefund(input: {
  user: UserProfile;
  paymentId: string;
  reason: string;
}): Promise<PaymentRecord> {
  const reason = input.reason.trim();
  if (reason.length < 5) {
    throw new Error('Veuillez préciser le motif de votre demande de remboursement (min. 5 caractères).');
  }
  const now = new Date().toISOString();

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data: existing, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('id', input.paymentId)
      .eq('user_id', input.user.id)
      .single();
    if (error || !existing) throw new Error('Paiement introuvable.');
    if (existing.status !== 'succeeded') {
      throw new Error('Seul un paiement validé peut faire l’objet d’une demande de remboursement.');
    }

    await supabaseAdmin
      .from('payments')
      .update({ status: 'refund_requested', refund_reason: reason, updated_at: now })
      .eq('id', input.paymentId);
  } else {
    const db = getDb();
    const existing = db
      .prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?')
      .get(input.paymentId, input.user.id) as Record<string, unknown> | undefined;
    if (!existing) throw new Error('Paiement introuvable.');
    if (existing.status !== 'succeeded') {
      throw new Error('Seul un paiement validé peut faire l’objet d’une demande de remboursement.');
    }
    db.prepare("UPDATE payments SET status = 'refund_requested', refund_reason = ?, updated_at = ? WHERE id = ?").run(
      reason,
      now,
      input.paymentId
    );
  }

  // Notify admin if exists
  const admins = await listUsers('admin');
  for (const admin of admins) {
    await createNotification({
      userId: admin.id,
      type: 'system',
      title: 'Nouvelle demande de remboursement',
      body: `${input.user.fullName} a demandé le remboursement d’un paiement : « ${reason} ».`,
      linkTab: 'subscriptions',
    });
  }

  const summary = await getSubscriptionSummaryForUser(input.user);
  return summary.payments.find((p) => p.id === input.paymentId)!;
}

export async function adminProcessRefund(input: {
  paymentId: string;
  decision: 'approve' | 'reject';
  adminNote?: string;
}): Promise<PaymentRecord> {
  const now = new Date().toISOString();
  let paymentRow: Record<string, any>;

  if (isSupabaseEnabled && supabaseAdmin) {
    const { data, error } = await supabaseAdmin.from('payments').select('*').eq('id', input.paymentId).single();
    if (error || !data) throw new Error('Paiement introuvable.');
    paymentRow = data;

    if (paymentRow.status !== 'refund_requested' && paymentRow.status !== 'succeeded') {
      throw new Error('Ce paiement ne peut pas être remboursé dans son état actuel.');
    }

    if (input.decision === 'approve') {
      await supabaseAdmin
        .from('payments')
        .update({ status: 'refunded', refunded_at: now, updated_at: now })
        .eq('id', input.paymentId);
      await supabaseAdmin.from('invoices').update({ status: 'refunded' }).eq('payment_id', input.paymentId);
      if (paymentRow.subscription_id) {
        await supabaseAdmin
          .from('subscriptions')
          .update({ status: 'cancelled', expires_at: now, updated_at: now })
          .eq('id', paymentRow.subscription_id);
      }
    } else {
      await supabaseAdmin
        .from('payments')
        .update({
          status: 'succeeded',
          failure_reason: input.adminNote?.trim() ? `Remboursement refusé : ${input.adminNote.trim()}` : '',
          updated_at: now,
        })
        .eq('id', input.paymentId);
    }
  } else {
    const db = getDb();
    const found = db.prepare('SELECT * FROM payments WHERE id = ?').get(input.paymentId) as Record<string, any> | undefined;
    if (!found) throw new Error('Paiement introuvable.');
    paymentRow = found;
    if (paymentRow.status !== 'refund_requested' && paymentRow.status !== 'succeeded') {
      throw new Error('Ce paiement ne peut pas être remboursé dans son état actuel.');
    }

    if (input.decision === 'approve') {
      db.prepare("UPDATE payments SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ?").run(
        now,
        now,
        input.paymentId
      );
      db.prepare("UPDATE invoices SET status = 'refunded' WHERE payment_id = ?").run(input.paymentId);
      if (paymentRow.subscription_id) {
        db.prepare("UPDATE subscriptions SET status = 'cancelled', expires_at = ?, updated_at = ? WHERE id = ?").run(
          now,
          now,
          String(paymentRow.subscription_id)
        );
      }
    } else {
      db.prepare("UPDATE payments SET status = 'succeeded', failure_reason = ?, updated_at = ? WHERE id = ?").run(
        input.adminNote?.trim() ? `Remboursement refusé : ${input.adminNote.trim()}` : '',
        now,
        input.paymentId
      );
    }
  }

  await createNotification({
    userId: String(paymentRow.user_id),
    type: 'system',
    title: input.decision === 'approve' ? 'Remboursement approuvé' : 'Demande de remboursement refusée',
    body:
      input.decision === 'approve'
        ? `Votre remboursement de ${Number(paymentRow.amount_mad)} DH a été validé par l’administration.`
        : `Votre demande de remboursement n’a pas été retenue.${input.adminNote?.trim() ? ` Motif : ${input.adminNote.trim()}` : ''}`,
    linkTab: 'subscription',
  });

  const overview = await getAdminSubscriptionsOverview();
  return overview.payments.find((p) => p.id === input.paymentId)!;
}

export async function getInvoiceForActor(invoiceId: string, actor: UserProfile): Promise<InvoiceRecord | null> {
  if (isSupabaseEnabled && supabaseAdmin) {
    let query = supabaseAdmin.from('invoices').select('*').eq('id', invoiceId);
    if (actor.role !== 'admin') query = query.eq('user_id', actor.id);
    const { data } = await query.maybeSingle();
    return data ? mapInvoiceRow(data as Record<string, unknown>) : null;
  }

  const db = getDb();
  const row =
    actor.role === 'admin'
      ? (db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as Record<string, unknown> | undefined)
      : (db.prepare('SELECT * FROM invoices WHERE id = ? AND user_id = ?').get(invoiceId, actor.id) as Record<string, unknown> | undefined);
  return row ? mapInvoiceRow(row) : null;
}

export async function getAdminSubscriptionsOverview(): Promise<AdminSubscriptionsOverview> {
  await syncExpiredSubscriptions();
  const plans = await listSubscriptionPlans();

  let subscriptions: UserSubscription[] = [];
  let payments: PaymentRecord[] = [];
  let invoices: InvoiceRecord[] = [];

  if (isSupabaseEnabled && supabaseAdmin) {
    const [{ data: subRows }, { data: payRows }, { data: invRows }] = await Promise.all([
      supabaseAdmin
        .from('subscriptions')
        .select('*, subscription_plans(*), profiles(full_name, email, role, company_name, university)')
        .order('updated_at', { ascending: false }),
      supabaseAdmin
        .from('payments')
        .select('*, subscription_plans(name), profiles(full_name, email), invoices(id, invoice_number)')
        .order('created_at', { ascending: false }),
      supabaseAdmin.from('invoices').select('*').order('issued_at', { ascending: false }),
    ]);
    subscriptions = (subRows || []).map((r) => mapSubscriptionRow(r as Record<string, any>));
    payments = (payRows || []).map((r) => mapPaymentRow(r as Record<string, any>));
    invoices = (invRows || []).map((r) => mapInvoiceRow(r as Record<string, unknown>));
  } else {
    const db = getDb();
    const subRows = db
      .prepare(
        `SELECT s.*, sp.code as plan_code, sp.name as plan_name, sp.target_role, sp.billing_cycle,
                u.full_name as user_full_name, u.email as user_email, u.role as user_role,
                u.company_name as user_company_name, u.university as user_university
         FROM subscriptions s
         JOIN subscription_plans sp ON sp.id = s.plan_id
         JOIN users u ON u.id = s.user_id
         ORDER BY s.updated_at DESC`
      )
      .all() as Record<string, unknown>[];
    subscriptions = subRows.map(mapSubscriptionRow);

    const payRows = db
      .prepare(
        `SELECT p.*, sp.name as plan_name, u.full_name as user_full_name, u.email as user_email,
                i.id as invoice_id, i.invoice_number
         FROM payments p
         JOIN subscription_plans sp ON sp.id = p.plan_id
         JOIN users u ON u.id = p.user_id
         LEFT JOIN invoices i ON i.payment_id = p.id
         ORDER BY p.created_at DESC`
      )
      .all() as Record<string, unknown>[];
    payments = payRows.map(mapPaymentRow);

    const invRows = db.prepare('SELECT * FROM invoices ORDER BY issued_at DESC').all() as Record<string, unknown>[];
    invoices = invRows.map(mapInvoiceRow);
  }

  const nowDate = new Date();
  const currentMonthPrefix = `${nowDate.getUTCFullYear()}-${String(nowDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const currentYearPrefix = `${nowDate.getUTCFullYear()}-`;

  const netPaidPayments = payments.filter((p) => p.status === 'succeeded' || p.status === 'refund_requested');
  const totalRevenueMad = netPaidPayments.reduce((sum, p) => sum + p.amountMad, 0);
  const monthlyRevenueMad = netPaidPayments
    .filter((p) => (p.paidAt || p.createdAt).startsWith(currentMonthPrefix))
    .reduce((sum, p) => sum + p.amountMad, 0);
  const annualRevenueMad = netPaidPayments
    .filter((p) => (p.paidAt || p.createdAt).startsWith(currentYearPrefix))
    .reduce((sum, p) => sum + p.amountMad, 0);

  const activeSubs = subscriptions.filter((s) => s.status === 'active');
  const refundedTotalMad = payments.filter((p) => p.status === 'refunded').reduce((sum, p) => sum + p.amountMad, 0);

  return {
    plans,
    subscriptions,
    payments,
    invoices,
    metrics: {
      totalRevenueMad,
      monthlyRevenueMad,
      annualRevenueMad,
      activeSubscriptionsCount: activeSubs.length,
      activeStudentsCount: activeSubs.filter((s) => s.targetRole === 'student').length,
      activeCompaniesCount: activeSubs.filter((s) => s.targetRole === 'company').length,
      expiredSubscriptionsCount: subscriptions.filter((s) => s.status === 'expired').length,
      pendingPaymentCount: subscriptions.filter((s) => s.status === 'pending_payment').length,
      refundRequestedCount: payments.filter((p) => p.status === 'refund_requested').length,
      refundedTotalMad,
    },
  };
}

