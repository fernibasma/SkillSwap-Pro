export type UserRole = 'student' | 'company' | 'admin';
export type AccountStatus = 'active' | 'suspended';
export type SkillMode = 'offered' | 'wanted';
export type SkillLevel = 'Débutant' | 'Intermédiaire' | 'Avancé' | 'Expert';
export type ExchangeStatus = 'pending' | 'accepted' | 'rejected' | 'completed';
export type ChallengeStatus = 'open' | 'closed' | 'archived';
export type SubmissionStatus = 'submitted' | 'approved' | 'needs_revision';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: AccountStatus;
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
  createdAt: string;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

export interface UserSkill {
  id: string;
  userId: string;
  skillId: string;
  skillName: string;
  skillCategory: string;
  mode: SkillMode;
  level: SkillLevel;
  notes: string;
  createdAt: string;
  userFullName?: string;
  userUniversity?: string;
  userMajor?: string;
  userCity?: string;
}

export interface SkillExchange {
  id: string;
  requesterId: string;
  recipientId: string;
  requesterName: string;
  requesterUniversity: string;
  recipientName: string;
  recipientUniversity: string;
  offeredSkillId: string;
  offeredSkillName: string;
  requestedSkillId: string;
  requestedSkillName: string;
  message: string;
  proposedHours: number;
  status: ExchangeStatus;
  responseNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface Challenge {
  id: string;
  companyId: string;
  companyName: string;
  companyOwnerName: string;
  companySector: string;
  title: string;
  category: string;
  difficulty: 'Débutant' | 'Intermédiaire' | 'Avancé';
  summary: string;
  brief: string;
  reward: string;
  deadline: string;
  status: ChallengeStatus;
  submissionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChallengeSubmission {
  id: string;
  challengeId: string;
  challengeTitle: string;
  studentId: string;
  studentName: string;
  studentUniversity: string;
  studentMajor: string;
  solutionUrl: string;
  summary: string;
  score: number | null;
  feedback: string;
  status: SubmissionStatus;
  evaluatedBy: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioProject {
  id: string;
  studentId: string;
  title: string;
  category: string;
  description: string;
  technologies: string;
  projectUrl: string;
  completedAt: string;
  createdAt: string;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  recipientId: string;
  senderName: string;
  recipientName: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: 'exchange' | 'challenge' | 'message' | 'system';
  title: string;
  body: string;
  linkTab: string;
  isRead: boolean;
  createdAt: string;
}

export interface TalentProfile {
  profile: UserProfile;
  skills: UserSkill[];
  portfolio: PortfolioProject[];
  evaluatedSubmissionsCount: number;
  averageScore: number | null;
  completedExchangesCount: number;
}

export interface PlatformStats {
  totalUsers: number;
  studentsCount: number;
  companiesCount: number;
  adminsCount: number;
  skillsCount: number;
  exchangesCount: number;
  acceptedExchangesCount: number;
  completedExchangesCount: number;
  challengesCount: number;
  openChallengesCount: number;
  submissionsCount: number;
  portfolioCount: number;
}

export type SubscriptionPlanCode = 'student_annual' | 'company_monthly' | 'company_annual';
export type SubscriptionBillingCycle = 'monthly' | 'annual';
export type SubscriptionStatus = 'active' | 'expired' | 'pending_payment' | 'cancelled';
export type PaymentProvider = 'cmi' | 'payzone' | 'sandbox';
export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refund_requested'
  | 'refunded';

export interface SubscriptionPlan {
  id: string;
  code: SubscriptionPlanCode;
  name: string;
  targetRole: 'student' | 'company';
  billingCycle: SubscriptionBillingCycle;
  priceMad: number;
  currency: string;
  durationMonths: number;
  description: string;
  features: string[];
  isActive: boolean;
  updatedAt: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planCode: SubscriptionPlanCode;
  planName: string;
  targetRole: 'student' | 'company';
  billingCycle: SubscriptionBillingCycle;
  pricePaidMad: number;
  status: SubscriptionStatus;
  startsAt: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  createdAt: string;
  updatedAt: string;
  userFullName?: string;
  userEmail?: string;
  userRole?: UserRole;
  userCompanyName?: string;
  userUniversity?: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  subscriptionId: string | null;
  planId: string;
  planName: string;
  amountMad: number;
  currency: string;
  provider: PaymentProvider;
  paymentMethod: string;
  cardBrand: string;
  cardLast4: string;
  providerRef: string;
  status: PaymentStatus;
  failureReason: string;
  refundReason: string;
  refundedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
  userFullName?: string;
  userEmail?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  paymentId: string;
  subscriptionId: string | null;
  userId: string;
  customerName: string;
  customerEmail: string;
  customerOrg: string;
  planName: string;
  amountMad: number;
  currency: string;
  status: 'paid' | 'refunded';
  issuedAt: string;
  createdAt: string;
}

export interface SubscriptionSummary {
  subscription: UserSubscription | null;
  hasActiveAccess: boolean;
  daysRemaining: number | null;
  isExpiringSoon: boolean;
  plans: SubscriptionPlan[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  gatewayMode: PaymentProvider;
}

export interface AdminSubscriptionsOverview {
  plans: SubscriptionPlan[];
  subscriptions: UserSubscription[];
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  metrics: {
    totalRevenueMad: number;
    monthlyRevenueMad: number;
    annualRevenueMad: number;
    activeSubscriptionsCount: number;
    activeStudentsCount: number;
    activeCompaniesCount: number;
    expiredSubscriptionsCount: number;
    pendingPaymentCount: number;
    refundRequestedCount: number;
    refundedTotalMad: number;
  };
}

