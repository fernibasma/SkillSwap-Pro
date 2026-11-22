import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  Lock,
  Printer,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type {
  InvoiceRecord,
  PaymentProvider,
  PaymentRecord,
  SubscriptionPlan,
  SubscriptionSummary,
} from '../types/index';

interface SubscriptionViewProps {
  summary: SubscriptionSummary | null;
  loading?: boolean;
  onRefreshSummary: () => Promise<void>;
  onRefreshNotifications: () => void;
}

const SUBSCRIPTION_STATUS_META: Record<
  string,
  { label: string; className: string; icon: React.ComponentType<{ className?: string }> }
> = {
  active: {
    label: 'Actif',
    className: 'border-emerald-400/35 bg-emerald-500/10 text-emerald-300',
    icon: CheckCircle2,
  },
  expired: {
    label: 'Expiré',
    className: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
    icon: XCircle,
  },
  pending_payment: {
    label: 'En attente de paiement',
    className: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
    icon: Clock,
  },
  cancelled: {
    label: 'Annulé / Remboursé',
    className: 'border-white/20 bg-white/5 text-[#CBD5E1]',
    icon: XCircle,
  },
};

const PAYMENT_STATUS_META: Record<PaymentRecord['status'], { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'text-amber-300' },
  succeeded: { label: 'Payé', className: 'text-emerald-300' },
  failed: { label: 'Échoué', className: 'text-rose-300' },
  cancelled: { label: 'Annulé', className: 'text-[#B8ADC8]' },
  refund_requested: { label: 'Remboursement demandé', className: 'text-amber-300' },
  refunded: { label: 'Remboursé', className: 'text-[#F472B6]' },
};

function formatDateFr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function detectCardBrand(digits: string): string {
  if (digits.startsWith('4')) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^6/.test(digits)) return 'CMI';
  return 'Carte Bancaire';
}

export function SubscriptionView({
  summary,
  loading = false,
  onRefreshSummary,
  onRefreshNotifications,
}: SubscriptionViewProps) {
  const { user } = useAuth();
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Checkout Modal State (cardPAN & CVV stay strictly in memory and are NEVER transmitted or stored)
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlan | null>(null);
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [checkoutProvider, setCheckoutProvider] = useState<PaymentProvider>('sandbox');
  const [gatewayRedirect, setGatewayRedirect] = useState<{
    actionUrl: string;
    method: 'POST';
    fields: Record<string, string>;
  } | null>(null);
  const [cardHolder, setCardHolder] = useState(user?.fullName || '');
  const [cardNumberInput, setCardNumberInput] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [processingPayment, setProcessingPayment] = useState(false);

  // Invoice Modal & Refund Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  const currentSub = summary?.subscription || null;
  const currentStatusKey = currentSub?.status || 'pending_payment';
  const statusMeta = SUBSCRIPTION_STATUS_META[currentStatusKey] || SUBSCRIPTION_STATUS_META.pending_payment;
  const StatusIcon = statusMeta.icon;

  const monthlyCompanyPlan = useMemo(
    () => summary?.plans.find((p) => p.code === 'company_monthly'),
    [summary?.plans]
  );
  const annualCompanyPlan = useMemo(
    () => summary?.plans.find((p) => p.code === 'company_annual'),
    [summary?.plans]
  );

  const annualSavingsMad = useMemo(() => {
    if (!monthlyCompanyPlan || !annualCompanyPlan) return 0;
    return Math.max(0, monthlyCompanyPlan.priceMad * 12 - annualCompanyPlan.priceMad);
  }, [monthlyCompanyPlan, annualCompanyPlan]);

  async function openCheckoutForPlan(plan: SubscriptionPlan) {
    setErrorBanner(null);
    setFeedbackBanner(null);
    setCheckoutPlan(plan);
    setCheckoutToken(null);
    setGatewayRedirect(null);
    setCardHolder(user?.fullName || '');
    setCardNumberInput('');
    setCardExpiry('');
    setCardCvv('');

    try {
      const res = await apiRequest<{
        payment: PaymentRecord;
        plan: SubscriptionPlan;
        provider: PaymentProvider;
        checkoutToken: string;
        gatewayRedirect?: { actionUrl: string; method: 'POST'; fields: Record<string, string> };
      }>('/api/payments/checkout', {
        method: 'POST',
        body: { planCode: plan.code },
      });
      setCheckoutToken(res.checkoutToken);
      setCheckoutProvider(res.provider);
      setGatewayRedirect(res.gatewayRedirect || null);
      await onRefreshSummary();
    } catch (err) {
      setCheckoutPlan(null);
      setErrorBanner(err instanceof Error ? err.message : 'Impossible d’initier la session de paiement.');
    }
  }

  async function handleConfirmCheckout(outcome: 'succeeded' | 'failed' | 'cancelled') {
    if (!checkoutToken || !checkoutPlan) return;
    setErrorBanner(null);

    const digitsOnly = cardNumberInput.replace(/\D/g, '');
    if (outcome === 'succeeded' && checkoutProvider === 'sandbox') {
      if (cardHolder.trim().length < 2) {
        setErrorBanner('Veuillez saisir le nom du titulaire de la carte.');
        return;
      }
      if (digitsOnly.length < 12 || digitsOnly.length > 19) {
        setErrorBanner('Veuillez saisir un numéro de carte valide (12 à 19 chiffres) pour le test.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry.trim())) {
        setErrorBanner('Veuillez indiquer une date d’expiration au format MM/AA.');
        return;
      }
      if (!/^\d{3,4}$/.test(cardCvv.trim())) {
        setErrorBanner('Veuillez saisir le code CVV (3 ou 4 chiffres).');
        return;
      }
    }

    setProcessingPayment(true);
    try {
      // Security: NEVER send card number or CVV to the server. Only non-sensitive brand & last 4 digits.
      const cardBrand = digitsOnly.length >= 4 ? detectCardBrand(digitsOnly) : 'CMI';
      const cardLast4 = digitsOnly.length >= 4 ? digitsOnly.slice(-4) : '';

      const res = await apiRequest<{
        pendingVerification?: boolean;
        message?: string;
        payment: PaymentRecord | null;
        invoice: InvoiceRecord | null;
      }>('/api/payments/confirm', {
        method: 'POST',
        body: {
          checkoutToken,
          outcome,
          cardBrand,
          cardLast4,
          failureReason:
            outcome === 'failed'
              ? 'Paiement refusé par la banque émettrice (simulation d’échec).'
              : outcome === 'cancelled'
                ? 'Paiement annulé par l’utilisateur sur la page sécurisée.'
                : undefined,
        },
      });

      // Clear local sensitive inputs immediately
      setCardNumberInput('');
      setCardCvv('');
      setCardExpiry('');
      setCheckoutPlan(null);
      setCheckoutToken(null);

      await onRefreshSummary();
      onRefreshNotifications();

      if (res.pendingVerification) {
        setFeedbackBanner(
          res.message ||
            'Transaction en attente de validation serveur par le prestataire (CMI / Payzone).'
        );
      } else if (outcome === 'succeeded') {
        setFeedbackBanner(
          `Paiement confirmé (${checkoutPlan.priceMad} DH). Votre abonnement est maintenant actif${
            res.invoice ? ` — Facture ${res.invoice.invoiceNumber}` : ''
          }.`
        );
      } else if (outcome === 'failed') {
        setErrorBanner('Le paiement a échoué. Votre abonnement n’a pas été activé. Vous pouvez réessayer.');
      } else {
        setErrorBanner('Le paiement a été annulé avant confirmation.');
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Erreur lors de la validation du paiement.');
    } finally {
      setProcessingPayment(false);
    }
  }

  async function handleSubmitRefundRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!refundTarget) return;
    setSubmittingRefund(true);
    setErrorBanner(null);
    try {
      await apiRequest(`/api/payments/${refundTarget.id}/refund-request`, {
        method: 'POST',
        body: { reason: refundReason },
      });
      setRefundTarget(null);
      setRefundReason('');
      await onRefreshSummary();
      onRefreshNotifications();
      setFeedbackBanner('Votre demande de remboursement a été transmise à l’administrateur.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Impossible d’envoyer la demande.');
    } finally {
      setSubmittingRefund(false);
    }
  }

  if (loading && !summary) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 rounded bg-white/10" />
        <div className="h-44 rounded-2xl border border-[#F472B6]/15 bg-[#160D27]" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Mon abonnement</h1>
          <p className="text-sm text-[#B8ADC8]">
            {user?.role === 'company'
              ? 'Gérez votre formule entreprise, vos renouvellements, factures et demandes de remboursement.'
              : 'Consultez votre statut d’abonnement étudiant (100 DH / an), vos paiements et vos reçus.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRefreshSummary()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#160D27] px-3.5 py-2 text-xs font-medium text-[#DFD5EC] hover:border-[#F472B6] hover:text-white transition-colors cursor-pointer"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </button>
      </div>

      {feedbackBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
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
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {errorBanner}
          </span>
          <button type="button" onClick={() => setErrorBanner(null)} className="cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Pre-expiration or Inactive Warning Banner */}
      {summary && !summary.hasActiveAccess && (
        <div className="rounded-2xl border border-[#F472B6]/40 bg-gradient-to-r from-[#28123F] to-[#1A0D2E] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#F472B6] shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="font-display text-sm font-semibold text-white">
                {currentStatusKey === 'expired'
                  ? 'Votre abonnement a expiré'
                  : 'Abonnement requis pour accéder aux fonctionnalités de la plateforme'}
              </p>
              <p className="text-xs text-[#DFD5EC] mt-1">
                {user?.role === 'company'
                  ? 'Souscrivez ou renouvelez une offre mensuelle ou annuelle pour accéder aux talents et publier des challenges.'
                  : 'Réglez votre abonnement annuel de 100 DH (12 mois) pour débloquer les échanges, challenges, portfolio et messages.'}
              </p>
            </div>
          </div>
          {summary.plans[0] && (
            <button
              type="button"
              onClick={() => openCheckoutForPlan(summary.plans[0])}
              className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
            >
              {currentStatusKey === 'expired' ? 'Renouveler maintenant' : 'Activer mon abonnement'}
            </button>
          )}
        </div>
      )}

      {summary?.isExpiringSoon && summary.daysRemaining !== null && (
        <div className="rounded-2xl border border-amber-400/35 bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-amber-200">
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Votre abonnement expire dans{' '}
              <strong className="font-mono-tabular">{summary.daysRemaining} jour(s)</strong> (le{' '}
              {formatDateFr(currentSub?.expiresAt)}). Renouvelez à l’avance pour prolonger votre échéance sans coupure.
            </span>
          </div>
          {summary.plans[0] && (
            <button
              type="button"
              onClick={() =>
                openCheckoutForPlan(
                  summary.plans.find((p) => p.id === currentSub?.planId) || summary.plans[0]
                )
              }
              className="rounded-full bg-amber-300 px-4 py-1.5 text-xs font-semibold text-[#180A28] hover:brightness-105 shrink-0 cursor-pointer"
            >
              Prolonger (+{summary.plans.find((p) => p.id === currentSub?.planId)?.durationMonths || 12} mois)
            </button>
          )}
        </div>
      )}

      {/* Current Subscription Summary Card */}
      <section className="rounded-2xl border border-[#F472B6]/20 bg-[#160D27] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F472B6]/15 text-[#F472B6]">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                {currentSub?.planName ||
                  (user?.role === 'company' ? 'Aucun abonnement entreprise actif' : 'Abonnement Étudiant Annuel')}
              </h2>
              <p className="text-xs text-[#B8ADC8]">
                Passerelle de paiement :{' '}
                {summary?.gatewayMode === 'cmi'
                  ? 'CMI Maroc (3D Secure)'
                  : summary?.gatewayMode === 'payzone'
                    ? 'Payzone Maroc'
                    : 'Sandbox Maroc sécurisé (CMI / Payzone prêt)'}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
          >
            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {statusMeta.label}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/10 bg-[#0D0716] p-4">
            <p className="text-xs text-[#8D7FA3] mb-1">Type d’abonnement</p>
            <p className="text-sm font-semibold text-white">
              {currentSub ? currentSub.planName : user?.role === 'company' ? 'Entreprise (à choisir)' : 'Étudiant Annuel (12 mois)'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0D0716] p-4">
            <p className="text-xs text-[#8D7FA3] mb-1">Prix payé</p>
            <p className="font-mono-tabular text-lg font-semibold text-[#F472B6]">
              {currentSub && currentSub.pricePaidMad > 0 ? `${currentSub.pricePaidMad} DH` : '0 DH'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0D0716] p-4">
            <p className="text-xs text-[#8D7FA3] mb-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Date de début
            </p>
            <p className="font-mono-tabular text-sm font-medium text-white">
              {formatDateFr(currentSub?.startsAt)}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-[#0D0716] p-4">
            <p className="text-xs text-[#8D7FA3] mb-1 flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Date d’expiration
            </p>
            <p className="font-mono-tabular text-sm font-medium text-white">
              {formatDateFr(currentSub?.expiresAt)}
            </p>
          </div>
        </div>

        {summary?.plans && summary.plans.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <p className="text-xs text-[#B8ADC8]">
              {summary.hasActiveAccess
                ? 'Le renouvellement anticipé prolonge votre date d’expiration actuelle sans perte de jours.'
                : 'L’activation est immédiate dès confirmation réelle du paiement par le serveur.'}
            </p>
            <button
              type="button"
              onClick={() =>
                openCheckoutForPlan(
                  summary.plans.find((p) => p.id === currentSub?.planId) || summary.plans[0]
                )
              }
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 transition-all cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {summary.hasActiveAccess ? 'Renouveler mon abonnement' : 'Souscrire maintenant'}
            </button>
          </div>
        )}
      </section>

      {/* Plans Showcase (Student 100 DH/year OR Company Monthly & Annual Offers) */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-white">
            {user?.role === 'company' ? 'Nos offres Entreprise' : 'Offre Étudiant SkillSwap Pro'}
          </h2>
          <p className="text-sm text-[#B8ADC8]">
            {user?.role === 'company'
              ? 'Choisissez entre la souplesse mensuelle ou l’avantage annuel pour recruter et évaluer nos étudiants.'
              : 'Un tarif unique et accessible de 100 DH par an pour accéder à tout l’écosystème universitaire.'}
          </p>
        </div>

        <div className={`grid grid-cols-1 ${summary?.plans && summary.plans.length > 1 ? 'md:grid-cols-2' : 'max-w-2xl'} gap-6`}>
          {(summary?.plans || []).map((plan) => {
            const isCurrentPlan = currentSub?.planId === plan.id && summary?.hasActiveAccess;
            const isAnnualCompany = plan.code === 'company_annual';
            return (
              <div
                key={plan.id}
                className={`rounded-2xl border p-6 flex flex-col justify-between gap-6 ${
                  isAnnualCompany || plan.code === 'student_annual'
                    ? 'border-[#F472B6]/45 bg-gradient-to-b from-[#1D1032] to-[#160D27]'
                    : 'border-white/12 bg-[#160D27]'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-[#F472B6]">
                        {plan.billingCycle === 'annual'
                          ? `Durée : ${plan.durationMonths} mois`
                          : `Durée : ${plan.durationMonths} mois`}
                      </p>
                      <h3 className="font-display text-xl font-bold text-white mt-1">{plan.name}</h3>
                    </div>
                    {isAnnualCompany && annualSavingsMad > 0 && (
                      <span className="rounded-full border border-[#F472B6]/40 bg-[#F472B6]/15 px-3 py-1 text-xs font-semibold text-[#F472B6]">
                        Économisez {annualSavingsMad} DH/an
                      </span>
                    )}
                    {isCurrentPlan && (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                        Formule actuelle
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="font-mono-tabular text-3xl font-bold text-white">{plan.priceMad}</span>
                    <span className="text-sm font-semibold text-[#F472B6]">
                      {plan.currency} / {plan.billingCycle === 'annual' ? 'an' : 'mois'}
                    </span>
                  </div>

                  <p className="text-sm text-[#B8ADC8]">{plan.description}</p>

                  <ul className="space-y-2.5 pt-2 border-t border-white/10">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#E9E0F7]">
                        <CheckCircle2 className="h-4 w-4 text-[#F472B6] shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => openCheckoutForPlan(plan)}
                  className="w-full rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-3 text-sm font-semibold text-[#180A28] hover:brightness-105 transition-all cursor-pointer"
                >
                  {isCurrentPlan
                    ? `Renouveler cette offre (${plan.priceMad} DH)`
                    : `Choisir cette offre — ${plan.priceMad} DH`}
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Payment History Table */}
      <section className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">Historique des paiements & reçus</h2>
            <p className="text-xs text-[#B8ADC8]">
              Toutes vos transactions validées, échouées, annulées ou remboursées avec accès aux factures.
            </p>
          </div>
          <span className="font-mono-tabular text-xs text-[#8D7FA3]">
            {summary?.payments.length || 0} transaction(s)
          </span>
        </div>

        {!summary || summary.payments.length === 0 ? (
          <p className="text-sm text-[#8D7FA3] py-6">
            Aucune transaction enregistrée pour le moment.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs text-[#B8ADC8]">
                <tr>
                  <th className="py-3 pr-4 font-medium">Date</th>
                  <th className="py-3 pr-4 font-medium">Offre</th>
                  <th className="py-3 pr-4 font-medium">Montant</th>
                  <th className="py-3 pr-4 font-medium">Mode / Référence</th>
                  <th className="py-3 pr-4 font-medium">Statut</th>
                  <th className="py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {summary.payments.map((pay) => {
                  const meta = PAYMENT_STATUS_META[pay.status];
                  const inv = summary.invoices.find((i) => i.paymentId === pay.id);
                  return (
                    <tr key={pay.id} className="hover:bg-white/3">
                      <td className="py-3 pr-4 font-mono-tabular text-xs text-[#CBD5E1] whitespace-nowrap">
                        {formatDateFr(pay.paidAt || pay.createdAt)}
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm font-medium text-white">{pay.planName}</p>
                        {pay.failureReason && (
                          <p className="text-xs text-rose-300 mt-0.5">{pay.failureReason}</p>
                        )}
                        {pay.refundReason && (
                          <p className="text-xs text-amber-200 mt-0.5">Motif : {pay.refundReason}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-mono-tabular font-semibold text-white whitespace-nowrap">
                        {pay.amountMad} {pay.currency}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#B8ADC8]">
                        <span className="uppercase">{pay.provider}</span>
                        {pay.cardLast4 ? ` · ${pay.cardBrand || 'Carte'} •••• ${pay.cardLast4}` : ''}
                        <p className="font-mono-tabular text-[11px] text-[#8D7FA3]">{pay.providerRef}</p>
                      </td>
                      <td className="py-3 pr-4 text-xs font-semibold whitespace-nowrap">
                        <span className={meta.className}>{meta.label}</span>
                      </td>
                      <td className="py-3 text-right whitespace-nowrap space-x-2">
                        {inv && (
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#0D0716] px-2.5 py-1.5 text-xs text-white hover:border-[#F472B6] cursor-pointer"
                          >
                            <FileText className="h-3.5 w-3.5 text-[#F472B6]" /> Reçu
                          </button>
                        )}
                        {pay.status === 'succeeded' && (
                          <button
                            type="button"
                            onClick={() => {
                              setRefundTarget(pay);
                              setRefundReason('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#0D0716] px-2.5 py-1.5 text-xs text-[#CBD5E1] hover:border-amber-400 hover:text-amber-200 cursor-pointer"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Rembourser
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* SECURE PAYMENT CHECKOUT MODAL */}
      {checkoutPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#F472B6]/30 bg-[#160D27] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F472B6] mb-1">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Paiement sécurisé Maroc ({checkoutProvider.toUpperCase()})
                </div>
                <h3 className="font-display text-lg font-bold text-white">{checkoutPlan.name}</h3>
                <p className="text-xs text-[#B8ADC8]">
                  Durée : {checkoutPlan.durationMonths} mois · Montant TTC :{' '}
                  <strong className="font-mono-tabular text-white">{checkoutPlan.priceMad} DH</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (checkoutToken) {
                    handleConfirmCheckout('cancelled');
                  } else {
                    setCheckoutPlan(null);
                  }
                }}
                aria-label="Fermer et annuler"
                className="text-[#B8ADC8] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {gatewayRedirect ? (
              <div className="space-y-4">
                <p className="text-sm text-[#DFD5EC]">
                  Votre session de paiement sécurisée auprès de{' '}
                  <strong className="text-white">{checkoutProvider.toUpperCase()}</strong> est prête. Cliquez ci-dessous
                  pour être redirigé vers la page de paiement bancaire 3D Secure.
                </p>
                <form action={gatewayRedirect.actionUrl} method={gatewayRedirect.method} className="space-y-3">
                  {Object.entries(gatewayRedirect.fields).map(([key, value]) => (
                    <input key={key} type="hidden" name={key} value={value} />
                  ))}
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleConfirmCheckout('cancelled')}
                      className="rounded-lg border border-white/15 px-4 py-2 text-xs text-[#CBD5E1] cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] cursor-pointer"
                    >
                      Payer sur {checkoutProvider.toUpperCase()} ({checkoutPlan.priceMad} DH)
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-xl border border-[#F472B6]/20 bg-[#0D0716] p-3 text-xs text-[#B8ADC8] flex items-start gap-2.5">
                  <ShieldCheck className="h-4 w-4 text-[#F472B6] shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    Sécurité bancaire : aucun numéro de carte ni code CVV n’est transmis ou conservé en base de données.
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-[#DFD5EC] mb-1">Titulaire de la carte</label>
                    <input
                      type="text"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="Nom complet sur la carte"
                      className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#DFD5EC] mb-1">
                      Numéro de carte bancaire (CMI / Visa / Mastercard)
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={23}
                      value={cardNumberInput}
                      onChange={(e) => setCardNumberInput(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="4000 0000 0000 4242"
                      className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm font-mono-tabular text-white focus:border-[#F472B6] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-[#DFD5EC] mb-1">Expiration (MM/AA)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="12/28"
                        className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm font-mono-tabular text-white focus:border-[#F472B6] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#DFD5EC] mb-1">Code CVV</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={4}
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                        placeholder="•••"
                        className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm font-mono-tabular text-white focus:border-[#F472B6] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-white/10">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={processingPayment || !checkoutToken}
                      onClick={() => handleConfirmCheckout('cancelled')}
                      className="rounded-lg border border-white/15 px-3 py-2 text-xs text-[#CBD5E1] hover:text-white cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={processingPayment || !checkoutToken}
                      onClick={() => handleConfirmCheckout('failed')}
                      className="rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/20 cursor-pointer"
                    >
                      Simuler échec
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={processingPayment || !checkoutToken}
                    onClick={() => handleConfirmCheckout('succeeded')}
                    className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-xs font-semibold text-[#180A28] hover:brightness-105 disabled:opacity-50 cursor-pointer"
                  >
                    {processingPayment
                      ? 'Validation en cours...'
                      : `Confirmer et payer ${checkoutPlan.priceMad} DH`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* INVOICE / RECEIPT MODAL */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#F472B6]/30 bg-[#160D27] p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#F472B6]">
                  Reçu officiel SkillSwap Pro
                </p>
                <h3 className="font-display text-xl font-bold text-white mt-0.5">
                  {selectedInvoice.invoiceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="text-[#B8ADC8] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-white/8">
                <span className="text-[#B8ADC8]">Date d’émission</span>
                <span className="font-mono-tabular text-white">{formatDateFr(selectedInvoice.issuedAt)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/8">
                <span className="text-[#B8ADC8]">Client</span>
                <span className="text-white font-medium text-right">
                  {selectedInvoice.customerName}
                  {selectedInvoice.customerOrg ? ` (${selectedInvoice.customerOrg})` : ''}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/8">
                <span className="text-[#B8ADC8]">E-mail</span>
                <span className="text-white">{selectedInvoice.customerEmail}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/8">
                <span className="text-[#B8ADC8]">Prestation</span>
                <span className="text-white font-medium">{selectedInvoice.planName}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/8">
                <span className="text-[#B8ADC8]">Statut</span>
                <span className={selectedInvoice.status === 'paid' ? 'text-emerald-300 font-semibold' : 'text-[#F472B6] font-semibold'}>
                  {selectedInvoice.status === 'paid' ? 'Payée' : 'Remboursée'}
                </span>
              </div>
              <div className="flex justify-between pt-2 text-base font-bold">
                <span className="text-white">Total réglé</span>
                <span className="font-mono-tabular text-[#F472B6]">
                  {selectedInvoice.amountMad} {selectedInvoice.currency}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#0D0716] px-4 py-2 text-xs font-medium text-white hover:border-[#F472B6] cursor-pointer"
              >
                <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
              </button>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2 text-xs font-semibold text-[#180A28] cursor-pointer"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REFUND REQUEST MODAL */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <form
            onSubmit={handleSubmitRefundRequest}
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#160D27] p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold text-white">Demander un remboursement</h3>
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="text-[#B8ADC8] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-[#B8ADC8]">
              Transaction : <strong className="text-white">{refundTarget.planName}</strong> ·{' '}
              <strong className="font-mono-tabular text-[#F472B6]">{refundTarget.amountMad} DH</strong>
            </p>
            <div>
              <label className="block text-xs font-medium text-[#DFD5EC] mb-1.5">
                Motif de la demande
              </label>
              <textarea
                rows={3}
                required
                minLength={5}
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Expliquez la raison de votre demande de remboursement..."
                className="w-full rounded-lg border border-white/12 bg-[#0D0716] px-3 py-2 text-sm text-white focus:border-[#F472B6] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRefundTarget(null)}
                className="rounded-lg border border-white/12 px-4 py-2 text-xs text-[#CBD5E1] cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submittingRefund}
                className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-2 text-xs font-semibold text-[#180A28] cursor-pointer"
              >
                {submittingRefund ? 'Envoi...' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
