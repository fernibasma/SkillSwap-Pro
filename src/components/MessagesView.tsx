import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, MessageSquare, Search, Send } from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { DirectMessage, UserRole } from '../types/index';

interface DirectoryUser {
  id: string;
  fullName: string;
  role: UserRole;
  university: string;
  major: string;
  companyName: string;
  sector: string;
  city: string;
}

interface MessagesViewProps {
  initialPartnerId?: string | null;
  onMessagesRead?: () => void;
  hasActiveAccess?: boolean;
  onOpenSubscriptionTab?: () => void;
}

const ROLE_LABEL: Record<UserRole, string> = {
  student: 'Étudiant',
  company: 'Entreprise',
  admin: 'Admin',
};

export function MessagesView({
  initialPartnerId,
  onMessagesRead,
  hasActiveAccess = true,
  onOpenSubscriptionTab,
}: MessagesViewProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(initialPartnerId || null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  async function loadData() {
    try {
      const [msgRes, dirRes] = await Promise.all([
        apiRequest<{ messages: DirectMessage[] }>('/api/messages'),
        apiRequest<{ users: DirectoryUser[] }>('/api/directory'),
      ]);
      setMessages(msgRes.messages);
      setDirectory(dirRes.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialPartnerId) {
      setSelectedPartnerId(initialPartnerId);
    }
  }, [initialPartnerId]);

  useEffect(() => {
    if (!selectedPartnerId || !user) return;
    const hasUnread = messages.some((m) => m.senderId === selectedPartnerId && m.recipientId === user.id && !m.isRead);
    if (hasUnread) {
      apiRequest('/api/messages/read', {
        method: 'POST',
        body: { partnerId: selectedPartnerId },
      })
        .then(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.senderId === selectedPartnerId && m.recipientId === user.id ? { ...m, isRead: true } : m
            )
          );
          onMessagesRead?.();
        })
        .catch(() => {});
    }
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedPartnerId, messages.length]);

  const conversations = useMemo(() => {
    if (!user) return [];
    const map = new Map<
      string,
      {
        partnerId: string;
        partnerName: string;
        lastMessage: string;
        lastAt: string;
        unread: number;
      }
    >();

    for (const m of messages) {
      const partnerId = m.senderId === user.id ? m.recipientId : m.senderId;
      const partnerName = m.senderId === user.id ? m.recipientName : m.senderName;
      const prev = map.get(partnerId);
      const unreadInc = m.recipientId === user.id && !m.isRead ? 1 : 0;
      if (!prev || m.createdAt > prev.lastAt) {
        map.set(partnerId, {
          partnerId,
          partnerName,
          lastMessage: m.content,
          lastAt: m.createdAt,
          unread: (prev?.unread || 0) + unreadInc,
        });
      } else {
        prev.unread += unreadInc;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [messages, user]);

  const filteredDirectory = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory.filter(
      (d) =>
        !q ||
        d.fullName.toLowerCase().includes(q) ||
        d.university.toLowerCase().includes(q) ||
        d.companyName.toLowerCase().includes(q)
    );
  }, [directory, search]);

  const activeThread = useMemo(() => {
    if (!user || !selectedPartnerId) return [];
    return messages.filter(
      (m) =>
        (m.senderId === user.id && m.recipientId === selectedPartnerId) ||
        (m.senderId === selectedPartnerId && m.recipientId === user.id)
    );
  }, [messages, selectedPartnerId, user]);

  const selectedPartner = useMemo(() => {
    return directory.find((d) => d.id === selectedPartnerId) || null;
  }, [directory, selectedPartnerId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPartnerId || !draft.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await apiRequest<{ message: DirectMessage }>('/api/messages', {
        method: 'POST',
        body: { recipientId: selectedPartnerId, content: draft.trim() },
      });
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Échec de l'envoi.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Messagerie directe</h1>
        <p className="text-sm text-[#B8ADC8]">
          Échangez directement avec les étudiants, entreprises partenaires et administrateurs.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[#DC2626]/40 bg-[#DC2626]/10 px-4 py-2.5 text-sm text-[#FCA5A5]">
          {error}
        </div>
      )}

      {!hasActiveAccess && user?.role !== 'admin' && (
        <div className="rounded-xl border border-[#F472B6]/40 bg-[#1B0F2E] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm text-[#DFD5EC]">
            <Lock className="h-4 w-4 text-[#F472B6] shrink-0" aria-hidden="true" />
            <span>
              Un abonnement actif est requis pour envoyer de nouveaux messages directs.
            </span>
          </div>
          {onOpenSubscriptionTab && (
            <button
              type="button"
              onClick={onOpenSubscriptionTab}
              className="rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-4 py-1.5 text-xs font-semibold text-[#180A28] cursor-pointer"
            >
              Activer / Renouveler
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-[#F472B6]/15 bg-[#160D27] overflow-hidden min-h-[540px]">
        {/* Left: Conversations & Directory */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#8D7FA3]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un membre..."
                className="w-full rounded-lg border border-white/12 bg-[#0D0716] py-2 pl-9 pr-3 text-xs text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/6">
            {loading ? (
              <div className="p-4 text-xs text-[#B8ADC8]">Chargement des conversations...</div>
            ) : (
              <>
                {conversations.length > 0 && (
                  <div>
                    <p className="px-4 py-2 text-[11px] font-medium text-[#8D7FA3] bg-[#0D0716]/50">
                      Conversations récentes
                    </p>
                    {conversations.map((conv) => (
                      <button
                        key={conv.partnerId}
                        type="button"
                        onClick={() => setSelectedPartnerId(conv.partnerId)}
                        className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                          selectedPartnerId === conv.partnerId ? 'bg-[#F472B6]/15' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-white truncate">{conv.partnerName}</span>
                          {conv.unread > 0 && (
                            <span className="font-mono-tabular rounded bg-[#F472B6]/20 px-1.5 py-0.5 text-[11px] text-[#F472B6]">
                              {conv.unread}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#B8ADC8] truncate">{conv.lastMessage}</p>
                      </button>
                    ))}
                  </div>
                )}

                <div>
                  <p className="px-4 py-2 text-[11px] font-medium text-[#8D7FA3] bg-[#0D0716]/50">
                    Annuaire des membres ({filteredDirectory.length})
                  </p>
                  {filteredDirectory.length === 0 ? (
                    <p className="px-4 py-4 text-xs text-[#8D7FA3]">Aucun autre membre disponible.</p>
                  ) : (
                    filteredDirectory.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setSelectedPartnerId(member.id)}
                        className={`w-full text-left px-4 py-2.5 transition-colors cursor-pointer ${
                          selectedPartnerId === member.id ? 'bg-[#F472B6]/15' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[#F3EEFF] truncate">{member.fullName}</span>
                          <span className="text-[11px] text-[#F472B6] shrink-0">{ROLE_LABEL[member.role]}</span>
                        </div>
                        <p className="text-xs text-[#8D7FA3] truncate">
                          {member.role === 'student'
                            ? member.university || 'Étudiant'
                            : member.companyName || member.sector || 'Organisation'}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Active Thread */}
        <div className="lg:col-span-8 flex flex-col">
          {!selectedPartnerId ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <MessageSquare className="h-9 w-9 text-[#F472B6] mb-3" />
              <p className="font-display text-base font-semibold text-white mb-1">
                Sélectionnez un destinataire
              </p>
              <p className="text-xs text-[#B8ADC8] max-w-sm">
                Choisissez une conversation existante ou un membre dans l’annuaire pour démarrer un échange direct.
              </p>
            </div>
          ) : (
            <>
              <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selectedPartner?.fullName ||
                      conversations.find((c) => c.partnerId === selectedPartnerId)?.partnerName ||
                      'Conversation'}
                  </p>
                  {selectedPartner && (
                    <p className="text-xs text-[#B8ADC8]">
                      {ROLE_LABEL[selectedPartner.role]}
                      {selectedPartner.university ? ` · ${selectedPartner.university}` : ''}
                      {selectedPartner.companyName ? ` · ${selectedPartner.companyName}` : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-3 max-h-[400px]">
                {activeThread.length === 0 ? (
                  <p className="text-xs text-[#8D7FA3] text-center py-8">
                    Aucun message pour le moment. Envoyez votre premier message ci-dessous.
                  </p>
                ) : (
                  activeThread.map((msg) => {
                    const isMine = msg.senderId === user?.id;
                    return (
                      <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[78%] rounded-xl px-4 py-2.5 text-sm ${
                            isMine
                              ? 'bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] text-[#180A28] font-medium'
                              : 'border border-white/10 bg-[#0D0716] text-[#F3EEFF]'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <p className={`mt-1 font-mono-tabular text-[10px] ${isMine ? 'text-[#180A28]/75' : 'text-[#8D7FA3]'}`}>
                            {new Date(msg.createdAt).toLocaleString('fr-FR', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              <form onSubmit={handleSend} className="p-4 border-t border-white/10 flex items-center gap-3">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!hasActiveAccess && user?.role !== 'admin'}
                  placeholder={
                    !hasActiveAccess && user?.role !== 'admin'
                      ? 'Abonnement actif requis pour envoyer un message...'
                      : 'Écrire votre message...'
                  }
                  className="flex-1 rounded-lg border border-white/12 bg-[#0D0716] px-4 py-2.5 text-sm text-white placeholder-[#6E6085] focus:border-[#F472B6] focus:outline-none disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim() || (!hasActiveAccess && user?.role !== 'admin')}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] px-5 py-2.5 text-sm font-semibold text-[#180A28] hover:brightness-105 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Envoyer
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
