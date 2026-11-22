import React, { useState } from 'react';
import { Bell, LogOut, Menu, Sparkles, X } from 'lucide-react';
import type { UserProfile } from '../types/index';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface WorkspaceShellProps {
  user: UserProfile;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (tabId: string) => void;
  unreadNotifications: number;
  onOpenNotifications: () => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const ROLE_LABELS: Record<UserProfile['role'], string> = {
  student: 'Étudiant',
  company: 'Entreprise',
  admin: 'Administrateur',
};

export function WorkspaceShell({
  user,
  navItems,
  activeTab,
  onSelectTab,
  unreadNotifications,
  onOpenNotifications,
  onLogout,
  children,
}: WorkspaceShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeNav = navItems.find((n) => n.id === activeTab);

  return (
    <div className="min-h-screen bg-[#0D0716] text-[#F8F5FF] flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-[260px] lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#F472B6]/12 bg-[#160D27]">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-[#F472B6]/12">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F9A8D4] via-[#F472B6] to-[#EC4899]"
            aria-hidden="true"
          >
            <Sparkles className="h-4 w-4 text-[#190A28] fill-[#190A28]" />
          </span>
          <span className="font-display text-lg font-bold tracking-tight text-white">
            SkillSwap <span className="text-[#F472B6]">Pro.</span>
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] text-[#180A28] font-semibold'
                    : 'text-[#C5B9D8] hover:bg-white/6 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-3 truncate">
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    className={`font-mono-tabular ml-2 rounded px-1.5 py-0.5 text-xs ${
                      active ? 'bg-[#180A28]/20 text-[#180A28]' : 'bg-[#F472B6]/20 text-[#F472B6]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-[#F472B6]/12 p-4">
          <div className="mb-3">
            <p className="text-sm font-semibold text-white truncate">{user.fullName}</p>
            <p className="text-xs text-[#B8ADC8] truncate">
              {ROLE_LABELS[user.role]}
              {user.role === 'student' && user.university ? ` · ${user.university}` : ''}
              {user.role === 'company' && user.companyName ? ` · ${user.companyName}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#0D0716] px-3 py-2 text-xs font-medium text-[#DFD5EC] hover:border-[#F472B6]/50 hover:text-white transition-colors cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-[#160D27] border-r border-[#F472B6]/15 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F472B6]/12">
              <span className="font-display text-lg font-bold text-white">
                SkillSwap <span className="text-[#F472B6]">Pro.</span>
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Fermer le menu"
                className="p-2 text-[#B8ADC8] hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeTab;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-gradient-to-r from-[#F9A8D4] via-[#F472B6] to-[#EC4899] text-[#180A28] font-semibold'
                        : 'text-[#C5B9D8] hover:bg-white/6 hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 truncate">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    {typeof item.badge === 'number' && item.badge > 0 && (
                      <span className="font-mono-tabular text-xs">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </nav>
            <div className="border-t border-[#F472B6]/12 p-4">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/12 bg-[#0D0716] px-3 py-2 text-xs font-medium text-[#DFD5EC]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="flex-1 lg:pl-[260px] flex flex-col min-w-0">
        <header className="sticky top-0 z-30 border-b border-[#F472B6]/12 bg-[#0D0716]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Ouvrir la navigation"
              className="lg:hidden rounded-lg border border-white/12 p-2 text-[#DFD5EC] hover:text-white cursor-pointer"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="text-sm text-[#B8ADC8] truncate">
              <span>{ROLE_LABELS[user.role]}</span>
              <span className="mx-2" aria-hidden="true">/</span>
              <span className="font-medium text-white">{activeNav?.label || 'Tableau de bord'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onOpenNotifications}
              className="inline-flex items-center gap-2 rounded-full border border-[#F472B6]/20 bg-[#160D27] px-3.5 py-2 text-xs font-medium text-[#F3EEFF] hover:border-[#F472B6]/55 transition-colors cursor-pointer"
            >
              <Bell className="h-4 w-4 text-[#F472B6]" aria-hidden="true" />
              <span className="hidden sm:inline">Notifications</span>
              {unreadNotifications > 0 && (
                <span className="font-mono-tabular rounded-full bg-[#F472B6] px-1.5 py-0.5 text-[11px] font-semibold text-[#180A28]">
                  {unreadNotifications}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1280px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
