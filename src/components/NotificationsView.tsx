import { useEffect, useState } from 'react';
import { Bell, CheckCheck, ArrowUpRight } from 'lucide-react';
import { apiRequest } from '../lib/api';
import type { AppNotification } from '../types/index';

interface NotificationsViewProps {
  onNavigateTab: (tabId: string) => void;
  onUpdatedCount: () => void;
}

export function NotificationsView({ onNavigateTab, onUpdatedCount }: NotificationsViewProps) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await apiRequest<{ notifications: AppNotification[] }>('/api/notifications');
      setNotifications(res.notifications);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function markAllRead() {
    await apiRequest('/api/notifications/read', { method: 'POST', body: {} });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onUpdatedCount();
  }

  async function markOneRead(notification: AppNotification) {
    if (!notification.isRead) {
      await apiRequest('/api/notifications/read', {
        method: 'POST',
        body: { notificationId: notification.id },
      });
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      onUpdatedCount();
    }
    if (notification.linkTab) {
      onNavigateTab(notification.linkTab);
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Centre de notifications</h1>
          <p className="text-sm text-[#B8ADC8]">
            Suivez en direct vos demandes d’échange, évaluations de challenges et nouveaux messages.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 rounded-full border border-[#F472B6]/25 bg-[#160D27] px-4 py-2 text-xs font-medium text-[#F3EEFF] hover:border-[#F472B6]/60 transition-colors cursor-pointer"
          >
            <CheckCheck className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
            Tout marquer comme lu
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-8 text-sm text-[#B8ADC8]">
          Chargement des notifications...
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-2xl border border-[#F472B6]/15 bg-[#160D27] p-10 text-center">
          <Bell className="h-8 w-8 text-[#8D7FA3] mx-auto mb-3" />
          <p className="text-sm font-medium text-white mb-1">Aucune notification pour le moment</p>
          <p className="text-xs text-[#B8ADC8]">
            Les alertes d’échanges, d’évaluations et de messages apparaîtront ici automatiquement.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-white/8 rounded-2xl border border-[#F472B6]/15 bg-[#160D27] overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                !n.isRead ? 'bg-[#F472B6]/8' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs mb-1">
                  <span className={!n.isRead ? 'font-semibold text-[#F472B6]' : 'text-[#8D7FA3]'}>
                    {!n.isRead ? 'Non lue' : 'Lue'}
                  </span>
                  <span aria-hidden="true" className="text-[#8D7FA3]">·</span>
                  <span className="font-mono-tabular text-[#8D7FA3]">
                    {new Date(n.createdAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <p className="text-sm font-semibold text-white">{n.title}</p>
                <p className="text-sm text-[#C5B9D8] mt-0.5">{n.body}</p>
              </div>
              <button
                type="button"
                onClick={() => markOneRead(n)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0D0716] px-4 py-2 text-xs font-medium text-white hover:border-[#F472B6] transition-colors shrink-0 cursor-pointer"
              >
                Ouvrir
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
