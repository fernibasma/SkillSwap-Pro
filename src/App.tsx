/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Award,
  Bell,
  BookOpen,
  CreditCard,
  FolderGit2,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Users,
} from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AuthView } from './components/AuthView';
import { CompanyDashboard } from './components/CompanyDashboard';
import { LandingPage } from './components/LandingPage';
import { MessagesView } from './components/MessagesView';
import { NotificationsView } from './components/NotificationsView';
import { ProfileSettingsView } from './components/ProfileSettingsView';
import { StudentDashboard } from './components/StudentDashboard';
import { SubscriptionView } from './components/SubscriptionView';
import { WorkspaceShell, type NavItem } from './components/WorkspaceShell';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest } from './lib/api';
import type { AppNotification, DirectMessage, SubscriptionSummary } from './types/index';

function SkillSwapApp() {
  const { user, isAuthenticated, logout } = useAuth();
  const [view, setView] = useState<'landing' | 'auth'>('landing');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authDefaultRole, setAuthDefaultRole] = useState<'student' | 'company'>('student');
  const [activeTab, setActiveTab] = useState('overview');
  const [messagePartnerId, setMessagePartnerId] = useState<string | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
  const [loadingSubscription, setLoadingSubscription] = useState(false);

  const refreshSubscription = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setLoadingSubscription(true);
    try {
      const subRes = await apiRequest<SubscriptionSummary>('/api/subscriptions/me');
      setSubscriptionSummary(subRes);
    } catch {
      // Ignore background subscription fetch error
    } finally {
      setLoadingSubscription(false);
    }
  }, [isAuthenticated, user]);

  const refreshCounters = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    try {
      const [notifsRes, msgsRes] = await Promise.all([
        apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
        apiRequest<{ messages: DirectMessage[] }>('/api/messages'),
      ]);
      setUnreadNotifications(notifsRes.notifications.filter((n) => !n.isRead).length);
      setUnreadMessages(msgsRes.messages.filter((m) => m.recipientId === user.id && !m.isRead).length);
    } catch {
      // Ignore background counter refresh errors
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (isAuthenticated && user) {
      const params = new URLSearchParams(window.location.search);
      const hasPaymentParam = params.has('payment');
      if (hasPaymentParam && user.role !== 'admin') {
        setActiveTab('subscription');
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        setActiveTab('overview');
      }
      refreshSubscription().then(() => refreshCounters());
    } else {
      setSubscriptionSummary(null);
    }
  }, [isAuthenticated, user?.id]);

  const navItems = useMemo<NavItem[]>(() => {
    if (!user) return [];
    const commonTail: NavItem[] = [
      { id: 'messages', label: 'Messages', icon: MessageSquare, badge: unreadMessages },
      { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
      { id: 'settings', label: 'Profil & Paramètres', icon: Settings },
    ];

    if (user.role === 'admin') {
      return [
        { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
        { id: 'users', label: 'Utilisateurs', icon: Users },
        { id: 'skills', label: 'Compétences', icon: BookOpen },
        { id: 'moderation', label: 'Défis & Échanges', icon: Shield },
        { id: 'subscriptions', label: 'Gestion des abonnements', icon: CreditCard },
        ...commonTail,
      ];
    }

    if (user.role === 'company') {
      return [
        { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
        { id: 'talents', label: 'Découverte talents', icon: Users },
        { id: 'challenges', label: 'Défis & Évaluations', icon: Award },
        { id: 'subscription', label: 'Mon abonnement', icon: CreditCard },
        ...commonTail,
      ];
    }

    return [
      { id: 'overview', label: 'Vue d’ensemble', icon: LayoutDashboard },
      { id: 'skills', label: 'Mes compétences', icon: BookOpen },
      { id: 'exchanges', label: 'Échanges', icon: ArrowLeftRight },
      { id: 'challenges', label: 'Défis pratiques', icon: Award },
      { id: 'portfolio', label: 'Mon portfolio', icon: FolderGit2 },
      { id: 'subscription', label: 'Mon abonnement', icon: CreditCard },
      ...commonTail,
    ];
  }, [user, unreadMessages, unreadNotifications]);

  function handleStartMessage(partnerId: string) {
    setMessagePartnerId(partnerId);
    setActiveTab('messages');
  }

  if (!isAuthenticated || !user) {
    if (view === 'auth') {
      return (
        <AuthView
          initialMode={authMode}
          initialRole={authDefaultRole}
          onBack={() => setView('landing')}
        />
      );
    }
    return (
      <LandingPage
        onOpenAuth={(mode, defaultRole = 'student') => {
          setAuthMode(mode);
          setAuthDefaultRole(defaultRole);
          setView('auth');
        }}
      />
    );
  }

  return (
    <WorkspaceShell
      user={user}
      navItems={navItems}
      activeTab={activeTab}
      onSelectTab={(tab) => setActiveTab(tab)}
      unreadNotifications={unreadNotifications}
      onOpenNotifications={() => setActiveTab('notifications')}
      onLogout={() => {
        logout();
        setView('landing');
      }}
    >
      {activeTab === 'messages' ? (
        <MessagesView
          initialPartnerId={messagePartnerId}
          onMessagesRead={refreshCounters}
          hasActiveAccess={user.role === 'admin' ? true : Boolean(subscriptionSummary?.hasActiveAccess)}
          onOpenSubscriptionTab={() => setActiveTab('subscription')}
        />
      ) : activeTab === 'notifications' ? (
        <NotificationsView
          onNavigateTab={(tab) => setActiveTab(tab)}
          onUpdatedCount={refreshCounters}
        />
      ) : activeTab === 'settings' ? (
        <ProfileSettingsView
          subscriptionSummary={subscriptionSummary}
          onOpenSubscriptionTab={() => setActiveTab('subscription')}
        />
      ) : activeTab === 'subscription' && user.role !== 'admin' ? (
        <SubscriptionView
          summary={subscriptionSummary}
          loading={loadingSubscription}
          onRefreshSummary={refreshSubscription}
          onRefreshNotifications={refreshCounters}
        />
      ) : user.role === 'admin' ? (
        <AdminDashboard activeTab={activeTab} />
      ) : user.role === 'company' ? (
        <CompanyDashboard
          activeTab={activeTab}
          subscriptionSummary={subscriptionSummary}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onStartMessage={handleStartMessage}
          onRefreshNotifications={refreshCounters}
        />
      ) : (
        <StudentDashboard
          activeTab={activeTab}
          subscriptionSummary={subscriptionSummary}
          onNavigateTab={(tab) => setActiveTab(tab)}
          onStartMessage={handleStartMessage}
          onRefreshNotifications={refreshCounters}
        />
      )}
    </WorkspaceShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SkillSwapApp />
    </AuthProvider>
  );
}
