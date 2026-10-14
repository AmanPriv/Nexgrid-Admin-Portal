import React from 'react';
import {
  LayoutDashboard,
  Users,
  Globe,
  FileText,
  CreditCard,
  MessageSquare,
  BarChart3,
  ShieldCheck,
  Settings,
  LogOut,
  X,
  Shield,
} from 'lucide-react';
import { AdminUser } from '../types.ts';

export type NavTab =
  | 'dashboard'
  | 'customers'
  | 'domains'
  | 'invoices'
  | 'payments'
  | 'messaging'
  | 'reports'
  | 'audit'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  admin: AdminUser | null;
  onLogout: () => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  urgentDomainCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  admin,
  onLogout,
  isOpenMobile,
  onCloseMobile,
  urgentDomainCount = 0,
}) => {
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers' as NavTab, label: 'Customers', icon: Users },
    {
      id: 'domains' as NavTab,
      label: 'Domains',
      icon: Globe,
      badge: urgentDomainCount > 0 ? urgentDomainCount : undefined,
    },
    { id: 'invoices' as NavTab, label: 'Invoices & Quotes', icon: FileText },
    { id: 'payments' as NavTab, label: 'Payments', icon: CreditCard },
    { id: 'messaging' as NavTab, label: 'SMS & Messaging', icon: MessageSquare },
    { id: 'reports' as NavTab, label: 'Reports', icon: BarChart3 },
    { id: 'audit' as NavTab, label: 'Audit Logs', icon: ShieldCheck },
    { id: 'settings' as NavTab, label: 'Settings & Backup', icon: Settings },
  ];

  const handleNavClick = (tab: NavTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const content = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200 w-64 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-sm font-bold text-lg tracking-wider">
            N
          </div>
          <div>
            <div className="font-bold text-white text-base tracking-tight leading-tight">
              NexGrid
            </div>
            <div className="text-[11px] text-slate-400 font-medium tracking-wide">
              ADMIN PORTAL
            </div>
          </div>
        </div>
        <button
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
          Management
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Admin User Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-200 shrink-0">
              <Shield className="w-4 h-4 text-blue-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-white truncate">
                {admin?.fullName || 'Administrator'}
              </div>
              <div className="text-[10px] text-slate-400 truncate">
                {admin?.username || 'admin'} • {admin?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
              </div>
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Log Out"
            className="p-1.5 rounded-md text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full flex">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
