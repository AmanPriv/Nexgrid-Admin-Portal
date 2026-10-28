import React from 'react';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Globe,
  FileText,
  Menu,
} from 'lucide-react';
import { NavTab } from './Sidebar.tsx';

interface MobileBottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenDrawer: () => void;
  urgentDomainCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenDrawer,
  urgentDomainCount = 0,
}) => {
  const primaryTabs: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'customers', label: 'Clients', icon: Users },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    {
      id: 'domains',
      label: 'Domains',
      icon: Globe,
      badge: urgentDomainCount > 0 ? urgentDomainCount : undefined,
    },
    { id: 'invoices', label: 'Billing', icon: FileText },
  ];

  const isSecondaryTabActive = [
    'payments',
    'messaging',
    'reports',
    'users',
    'audit',
    'settings',
  ].includes(currentTab);

  return (
    <nav
      aria-label="Mobile Primary Navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 text-slate-300 shadow-2xl pb-[env(safe-area-inset-bottom)] select-none"
    >
      <div className="grid grid-cols-6 h-16 max-w-lg mx-auto px-1">
        {primaryTabs.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                isActive
                  ? 'text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 active:bg-slate-800/60'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-blue-500" />
              )}
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight truncate max-w-full px-0.5">
                {item.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onOpenDrawer}
          className={`relative flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
            isSecondaryTabActive
              ? 'text-blue-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 active:bg-slate-800/60'
          }`}
        >
          {isSecondaryTabActive && (
            <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-blue-500" />
          )}
          <Menu className="w-5 h-5" />
          <span className="text-[10px] tracking-tight">More</span>
        </button>
      </div>
    </nav>
  );
};
