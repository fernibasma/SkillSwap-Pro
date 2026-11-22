import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  adminProcessRefund,
  adminUpdateSubscriptionPlan,
  adminUpdateUser,
  authenticateToken,
  changeUserPassword,
  createChallenge,
  createCheckoutSession,
  createExchange,
  createPortfolioProject,
  createSkill,
  deleteChallenge,
  deletePortfolioProject,
  deleteSkill,
  evaluateSubmission,
  finalizeVerifiedPayment,
  getAdminSubscriptionsOverview,
  getInvoiceForActor,
  getPlatformStats,
  getSubscriptionSummaryForUser,
  hasActiveSubscription,
  listChallenges,
  listExchanges,
  listMessages,
  listNotifications,
  listPortfolio,
  listSkills,
  listSubmissions,
  listSubscriptionPlans,
  listTalents,
  listUsers,
  listUserSkills,
  loginUser,
  markConversationRead,
  markNotificationRead,
  registerUser,
  removeUserSkill,
  requestPaymentRefund,
  respondToExchange,
  sendMessage,
  submitChallengeSolution,
  updateChallengeStatus,
  updateProfile,
  upsertUserSkill,
  verifyCheckoutToken,
  verifyCmiCallbackSignature,
  verifyGenericWebhookSignature,
  verifyPayzoneSignature,
} from './src/server/store.ts';
import type { SubscriptionPlanCode, UserProfile, UserRole } from './src/types/index.ts';

interface AuthRequest extends Request {
  user?: UserProfile;
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const user = await authenticateToken(token);
    if (!user) {
      res.status(401).json({ error: 'Session expirée ou invalide.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Erreur de vérification de session.' });
  }
}

function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Permissions insuffisantes pour cette action.' });
      return;
    }
    next();
  };
}

async function requireActiveSubscription(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Authentification requise.' });
    return;
  }
  if (req.user.role === 'admin') {
    next();
    return;
  }
  try {
    const active = await hasActiveSubscription(req.user);
    if (!active) {
      res.status(402).json({
        error:
          'Un abonnement actif est requis pour utiliser cette fonctionnalité. Rendez-vous dans « Mon abonnement » pour activer ou renouveler votre accès.',
        code: 'SUBSCRIPTION_REQUIRED',
      });
      return;
    }
    next();
  } catch {
    res.status(500).json({ error: 'Erreur lors de la vérification de l’abonnement.' });
  }
}

function handleError(res: Response, err: unknown, status = 400): void {
  const message = err instanceof Error ? err.message : 'Une erreur inattendue est survenue.';
  res.status(status).json({ error: message });
}

// ---------------------------------------------------------------------------
// Public Routes
// ---------------------------------------------------------------------------

app.get('/api/public/overview', async (_req: Request, res: Response) => {
  try {
    const [stats, skills, challenges, plans] = await Promise.all([
      getPlatformStats(),
      listSkills(),
      listChallenges(),
      listSubscriptionPlans(),
    ]);
    const publicChallenges = challenges.filter((c) => c.status === 'open').slice(0, 6);
    res.json({ stats, skills, challenges: publicChallenges, plans: plans.filter((p) => p.isActive) });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.get('/api/plans', async (req: Request, res: Response) => {
  try {
    const role = req.query.role === 'student' || req.query.role === 'company' ? req.query.role : undefined;
    const plans = await listSubscriptionPlans(role);
    res.json({ plans: plans.filter((p) => p.isActive) });
  } catch (err) {
    handleError(res, err, 500);
  }
});

// ---------------------------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const result = await registerUser(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    const result = await loginUser(String(email || ''), String(password || ''));
    res.json(result);
  } catch (err) {
    handleError(res, err, 401);
  }
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// Profile & Settings Routes
// ---------------------------------------------------------------------------

app.put('/api/profile', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await updateProfile(req.user!.id, req.body || {});
    res.json({ user: updated });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.post('/api/profile/password', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    await changeUserPassword(req.user!.id, String(currentPassword || ''), String(newPassword || ''));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Skills Catalog & Student Skills
// ---------------------------------------------------------------------------

app.get('/api/skills', async (_req: Request, res: Response) => {
  try {
    const skills = await listSkills();
    res.json({ skills });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post('/api/skills', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, description } = req.body || {};
    const skill = await createSkill({
      name: String(name || ''),
      category: String(category || ''),
      description: String(description || ''),
      createdBy: req.user!.id,
    });
    res.status(201).json({ skill });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.delete('/api/skills/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    await deleteSkill(String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.get('/api/user-skills', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    const mode = req.query.mode === 'offered' || req.query.mode === 'wanted' ? req.query.mode : undefined;
    const userSkills = await listUserSkills({ userId, mode });
    res.json({ userSkills });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post(
  '/api/user-skills',
  requireAuth,
  requireRole('student', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { skillId, mode, level, notes } = req.body || {};
      if (mode !== 'offered' && mode !== 'wanted') {
        res.status(400).json({ error: 'Mode de compétence invalide.' });
        return;
      }
      const validLevels = ['Débutant', 'Intermédiaire', 'Avancé', 'Expert'];
      const safeLevel = validLevels.includes(level) ? level : 'Intermédiaire';
      const userSkill = await upsertUserSkill({
        userId: req.user!.id,
        skillId: String(skillId || ''),
        mode,
        level: safeLevel,
        notes: String(notes || ''),
      });
      res.status(201).json({ userSkill });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.delete('/api/user-skills/:id', requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
  try {
    await removeUserSkill(req.user!.id, String(req.params.id), req.user!.role === 'admin');
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Skill Exchanges
// ---------------------------------------------------------------------------

app.get('/api/exchanges', requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
  try {
    const exchanges = await listExchanges(req.user!.id, req.user!.role === 'admin');
    res.json({ exchanges });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post(
  '/api/exchanges',
  requireAuth,
  requireRole('student', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { recipientId, offeredSkillId, requestedSkillId, message, proposedHours } = req.body || {};
      const exchange = await createExchange({
        requesterId: req.user!.id,
        requesterName: req.user!.fullName,
        recipientId: String(recipientId || ''),
        offeredSkillId: String(offeredSkillId || ''),
        requestedSkillId: String(requestedSkillId || ''),
        message: String(message || ''),
        proposedHours: Number(proposedHours || 2),
      });
      res.status(201).json({ exchange });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.patch('/api/exchanges/:id', requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
  try {
    const { status, responseNote } = req.body || {};
    if (status !== 'accepted' && status !== 'rejected' && status !== 'completed') {
      res.status(400).json({ error: 'Statut d’échange invalide.' });
      return;
    }
    const exchange = await respondToExchange({
      exchangeId: String(req.params.id),
      actor: req.user!,
      status,
      responseNote: typeof responseNote === 'string' ? responseNote : undefined,
    });
    res.json({ exchange });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Challenges, Submissions & Evaluations
// ---------------------------------------------------------------------------

app.get('/api/challenges', requireAuth, async (_req: AuthRequest, res: Response) => {
  try {
    const challenges = await listChallenges();
    res.json({ challenges });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post(
  '/api/challenges',
  requireAuth,
  requireRole('company', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, category, difficulty, summary, brief, reward, deadline } = req.body || {};
      const validDiff = ['Débutant', 'Intermédiaire', 'Avancé'].includes(difficulty) ? difficulty : 'Intermédiaire';
      const challenge = await createChallenge({
        companyId: req.user!.id,
        title: String(title || ''),
        category: String(category || 'Développement Web'),
        difficulty: validDiff,
        summary: String(summary || ''),
        brief: String(brief || ''),
        reward: String(reward || ''),
        deadline: String(deadline || ''),
      });
      res.status(201).json({ challenge });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.patch(
  '/api/challenges/:id',
  requireAuth,
  requireRole('company', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body || {};
      if (status !== 'open' && status !== 'closed' && status !== 'archived') {
        res.status(400).json({ error: 'Statut de défi invalide.' });
        return;
      }
      const challenge = await updateChallengeStatus(String(req.params.id), req.user!, status);
      res.json({ challenge });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.delete(
  '/api/challenges/:id',
  requireAuth,
  requireRole('company', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      await deleteChallenge(String(req.params.id), req.user!);
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.get('/api/submissions', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const challengeId = typeof req.query.challengeId === 'string' ? req.query.challengeId : undefined;
    const submissions = await listSubmissions(req.user!, challengeId);
    res.json({ submissions });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post(
  '/api/submissions',
  requireAuth,
  requireRole('student', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { challengeId, solutionUrl, summary } = req.body || {};
      const submission = await submitChallengeSolution({
        challengeId: String(challengeId || ''),
        student: req.user!,
        solutionUrl: String(solutionUrl || ''),
        summary: String(summary || ''),
      });
      res.status(201).json({ submission });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.patch(
  '/api/submissions/:id/evaluate',
  requireAuth,
  requireRole('company', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { score, feedback, status } = req.body || {};
      if (status !== 'approved' && status !== 'needs_revision') {
        res.status(400).json({ error: 'Statut d’évaluation invalide.' });
        return;
      }
      const submission = await evaluateSubmission({
        submissionId: String(req.params.id),
        evaluator: req.user!,
        score: Number(score),
        feedback: String(feedback || ''),
        status,
      });
      res.json({ submission });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

app.get('/api/portfolio', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const studentId = typeof req.query.studentId === 'string' ? req.query.studentId : req.user!.id;
    const projects = await listPortfolio(studentId);
    res.json({ projects });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post(
  '/api/portfolio',
  requireAuth,
  requireRole('student', 'admin'),
  requireActiveSubscription,
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, category, description, technologies, projectUrl, completedAt } = req.body || {};
      const project = await createPortfolioProject({
        studentId: req.user!.id,
        title: String(title || ''),
        category: String(category || 'Projet Web'),
        description: String(description || ''),
        technologies: String(technologies || ''),
        projectUrl: String(projectUrl || ''),
        completedAt: String(completedAt || ''),
      });
      res.status(201).json({ project });
    } catch (err) {
      handleError(res, err, 400);
    }
  }
);

app.delete('/api/portfolio/:id', requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
  try {
    await deletePortfolioProject(String(req.params.id), req.user!);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Talent Discovery & User Directory
// ---------------------------------------------------------------------------

app.get(
  '/api/talents',
  requireAuth,
  requireRole('company', 'admin'),
  requireActiveSubscription,
  async (_req: AuthRequest, res: Response) => {
    try {
      const talents = await listTalents();
      res.json({ talents });
    } catch (err) {
      handleError(res, err, 500);
    }
  }
);

app.get('/api/directory', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const users = await listUsers();
    const safeDirectory = users
      .filter((u) => u.status === 'active' && u.id !== req.user!.id)
      .map((u) => ({
        id: u.id,
        fullName: u.fullName,
        role: u.role,
        university: u.university,
        major: u.major,
        companyName: u.companyName,
        sector: u.sector,
        city: u.city,
      }));
    res.json({ users: safeDirectory });
  } catch (err) {
    handleError(res, err, 500);
  }
});

// ---------------------------------------------------------------------------
// Messaging & Notifications
// ---------------------------------------------------------------------------

app.get('/api/messages', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await listMessages(req.user!.id);
    res.json({ messages });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post('/api/messages', requireAuth, requireActiveSubscription, async (req: AuthRequest, res: Response) => {
  try {
    const { recipientId, content } = req.body || {};
    const message = await sendMessage({
      sender: req.user!,
      recipientId: String(recipientId || ''),
      content: String(content || ''),
    });
    res.status(201).json({ message });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.post('/api/messages/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { partnerId } = req.body || {};
    if (typeof partnerId === 'string' && partnerId) {
      await markConversationRead(req.user!.id, partnerId);
    }
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.get('/api/notifications', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const notifications = await listNotifications(req.user!.id);
    res.json({ notifications });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { notificationId } = req.body || {};
    await markNotificationRead(req.user!.id, typeof notificationId === 'string' ? notificationId : undefined);
    res.json({ ok: true });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Admin Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/overview', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const [stats, users, skills, exchanges, challenges] = await Promise.all([
      getPlatformStats(),
      listUsers(),
      listSkills(),
      listExchanges(req.user!.id, true),
      listChallenges(),
    ]);
    res.json({ stats, users, skills, exchanges, challenges });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { role, status } = req.body || {};
    const validRole = role === 'student' || role === 'company' || role === 'admin' ? role : undefined;
    const validStatus = status === 'active' || status === 'suspended' ? status : undefined;
    const updated = await adminUpdateUser(String(req.params.id), { role: validRole, status: validStatus });
    res.json({ user: updated });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Subscriptions, Payments, Webhooks & Invoices
// ---------------------------------------------------------------------------

app.get('/api/subscriptions/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const summary = await getSubscriptionSummaryForUser(req.user!);
    res.json(summary);
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.post('/api/payments/checkout', requireAuth, requireRole('student', 'company'), async (req: AuthRequest, res: Response) => {
  try {
    const { planCode, cardBrand, cardLast4 } = req.body || {};
    const validCodes: SubscriptionPlanCode[] = ['student_annual', 'company_monthly', 'company_annual'];
    if (!validCodes.includes(planCode)) {
      res.status(400).json({ error: 'Offre d’abonnement invalide.' });
      return;
    }
    const session = await createCheckoutSession({
      user: req.user!,
      planCode,
      cardBrand: typeof cardBrand === 'string' ? cardBrand : undefined,
      cardLast4: typeof cardLast4 === 'string' ? cardLast4 : undefined,
    });
    res.status(201).json(session);
  } catch (err) {
    handleError(res, err, 400);
  }
});

// Server-verified confirmation endpoint (never activates a live gateway payment based on browser redirect alone)
app.post('/api/payments/confirm', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { checkoutToken, outcome, failureReason, cardBrand, cardLast4 } = req.body || {};
    const verifiedToken = verifyCheckoutToken(String(checkoutToken || ''));
    if (!verifiedToken || verifiedToken.userId !== req.user!.id) {
      res.status(403).json({ error: 'Jeton de session de paiement invalide ou expiré.' });
      return;
    }

    if (outcome !== 'succeeded' && outcome !== 'failed' && outcome !== 'cancelled') {
      res.status(400).json({ error: 'Statut de confirmation invalide.' });
      return;
    }

    // For live Moroccan gateways (CMI / Payzone), only server-to-server webhook callbacks can mark a payment succeeded!
    if (verifiedToken.provider !== 'sandbox' && outcome === 'succeeded') {
      const summary = await getSubscriptionSummaryForUser(req.user!);
      const existingPay = summary.payments.find((p) => p.id === verifiedToken.paymentId);
      if (!existingPay || existingPay.status !== 'succeeded') {
        res.status(202).json({
          pendingVerification: true,
          message: 'En attente de confirmation cryptographique du prestataire de paiement.',
          payment: existingPay || null,
          subscription: summary.subscription,
        });
        return;
      }
      res.json({ payment: existingPay, subscription: summary.subscription, invoice: summary.invoices.find((i) => i.paymentId === existingPay.id) || null });
      return;
    }

    const result = await finalizeVerifiedPayment({
      paymentId: verifiedToken.paymentId,
      outcome,
      failureReason: typeof failureReason === 'string' ? failureReason : undefined,
      cardBrand: typeof cardBrand === 'string' ? cardBrand : undefined,
      cardLast4: typeof cardLast4 === 'string' ? cardLast4 : undefined,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, 400);
  }
});

// CMI (Centre Monétique Interbancaire - Maroc) Server-to-Server Callback
app.post('/api/payments/cmi/callback', async (req: Request, res: Response) => {
  try {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      fields[k] = String(v ?? '');
    }
    if (!verifyCmiCallbackSignature(fields)) {
      res.status(401).send('FAILURE');
      return;
    }
    const oid = fields.oid || '';
    const procReturnCode = fields.ProcReturnCode || '';
    const responseStatus = fields.Response || '';
    const outcome = procReturnCode === '00' && responseStatus.toLowerCase() === 'approved' ? 'succeeded' : 'failed';

    await finalizeVerifiedPayment({
      providerRef: oid,
      outcome,
      failureReason: outcome === 'failed' ? fields.ErrMsg || `Code CMI ${procReturnCode}` : undefined,
      cardBrand: fields.cardBrand || 'CMI',
      cardLast4: typeof fields.MaskedPan === 'string' ? fields.MaskedPan.slice(-4) : undefined,
    });
    res.status(200).send('ACTION=POSTAUTH');
  } catch {
    res.status(400).send('FAILURE');
  }
});

// Payzone / Generic Provider Webhook with cryptographic signature check
app.post('/api/payments/webhook/:provider', async (req: Request, res: Response) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    const rawBody = JSON.stringify(req.body || {});
    const signature = String(
      req.headers['x-payzone-signature'] || req.headers['x-webhook-signature'] || req.body?.signature || ''
    );

    const isValid =
      provider === 'payzone'
        ? verifyPayzoneSignature(String(req.body?.payload || rawBody), signature)
        : verifyGenericWebhookSignature(rawBody, signature);

    if (!isValid) {
      res.status(401).json({ error: 'Signature webhook invalide.' });
      return;
    }

    const payload = typeof req.body?.payload === 'string' ? JSON.parse(req.body.payload) : req.body;
    const providerRef = String(payload.providerRef || payload.chargeId || payload.oid || '');
    const statusRaw = String(payload.status || '').toLowerCase();
    const outcome: 'succeeded' | 'failed' | 'cancelled' =
      statusRaw === 'succeeded' || statusRaw === 'paid' || statusRaw === 'approved'
        ? 'succeeded'
        : statusRaw === 'cancelled'
          ? 'cancelled'
          : 'failed';

    const result = await finalizeVerifiedPayment({
      providerRef,
      outcome,
      failureReason: typeof payload.failureReason === 'string' ? payload.failureReason : undefined,
      cardBrand: typeof payload.cardBrand === 'string' ? payload.cardBrand : undefined,
      cardLast4: typeof payload.cardLast4 === 'string' ? payload.cardLast4 : undefined,
    });
    res.json({ ok: true, payment: result.payment });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.post('/api/payments/:id/refund-request', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body || {};
    const payment = await requestPaymentRefund({
      user: req.user!,
      paymentId: String(req.params.id),
      reason: String(reason || ''),
    });
    res.json({ payment });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.get('/api/invoices/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const invoice = await getInvoiceForActor(String(req.params.id), req.user!);
    if (!invoice) {
      res.status(404).json({ error: 'Facture introuvable.' });
      return;
    }
    res.json({ invoice });
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.get('/api/admin/subscriptions', requireAuth, requireRole('admin'), async (_req: AuthRequest, res: Response) => {
  try {
    const overview = await getAdminSubscriptionsOverview();
    res.json(overview);
  } catch (err) {
    handleError(res, err, 500);
  }
});

app.patch('/api/admin/plans/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, priceMad, description, features, isActive } = req.body || {};
    const plan = await adminUpdateSubscriptionPlan(String(req.params.id), {
      name: typeof name === 'string' ? name : undefined,
      priceMad: priceMad !== undefined ? Number(priceMad) : undefined,
      description: typeof description === 'string' ? description : undefined,
      features: Array.isArray(features) ? features.map((f) => String(f)) : undefined,
      isActive: typeof isActive === 'boolean' ? isActive : undefined,
    });
    res.json({ plan });
  } catch (err) {
    handleError(res, err, 400);
  }
});

app.patch('/api/admin/payments/:id/refund', requireAuth, requireRole('admin'), async (req: AuthRequest, res: Response) => {
  try {
    const { decision, note } = req.body || {};
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'Décision de remboursement invalide.' });
      return;
    }
    const payment = await adminProcessRefund({
      paymentId: String(req.params.id),
      decision,
      adminNote: typeof note === 'string' ? note : undefined,
    });
    res.json({ payment });
  } catch (err) {
    handleError(res, err, 400);
  }
});

// ---------------------------------------------------------------------------
// Vite / Static Frontend Serving
// ---------------------------------------------------------------------------

async function startServer() {
  const port = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build missing');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SkillSwap Pro server running on http://0.0.0.0:${port}`);
  });
}

startServer();
