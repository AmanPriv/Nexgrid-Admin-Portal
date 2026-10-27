import React, { useState, useEffect } from 'react';
import {
  Menu,
  Plus,
  Clock,
  Shield,
  LogOut,
  ChevronDown,
  UserPlus,
  Globe,
  FilePlus,
  CreditCard,
  RefreshCw,
  Database,
  CheckCircle2,
} from 'lucide-react';
import { AdminUser } from '../types.ts';
import { NavTab } from './Sidebar.tsx';
import {
  subscribeSyncStatus,
  pullCloudDatabaseState,
  getCloudSyncStatus,
  type CloudSyncStatus,
} from '../services/cloudSyncEngine.ts';
import { signInWithFirebaseGoogle } from '../firebase.ts';

interface HeaderProps {
  currentTab: NavTab;
  onOpenMobileSidebar: () => void;
  admin: AdminUser | null;
  onLogout: () => void;
  onQuickAction: (action: 'customer' | 'domain' | 'invoice' | 'payment') => void;
  timeoutMinutes?: number;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileSidebar,
  admin,
  onLogout,
  onQuickAction,
  timeoutMinutes = 60,
  onRefresh,
}) => {
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncMenuOpen, setSyncMenuOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>(() => getCloudSyncStatus());
  const [timeRemaining, setTimeRemaining] = useState(timeoutMinutes * 60);
  const [addisTime, setAddisTime] = useState('');

  useEffect(() => {
    return subscribeSyncStatus((st) => setSyncStatus(st));
  }, []);

  const handleManualSync = async () => {
    await pullCloudDatabaseState();
    if (onRefresh) onRefresh();
  };

  const handleConnectFirebaseAuth = async () => {
    try {
      await signInWithFirebaseGoogle();
      await pullCloudDatabaseState();
      if (onRefresh) onRefresh();
    } catch {
      // ignore popup close
    }
  };

  // Update Addis Ababa local clock
  useEffect(() => {
    const updateTime = () => {
      try {
        const timeStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Africa/Addis_Ababa',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());
        setAddisTime(timeStr);
      } catch {
        setAddisTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Track session inactivity countdown
  useEffect(() => {
    setTimeRemaining(timeoutMinutes * 60);

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Reset countdown on user interaction
    const handleActivity = () => {
      setTimeRemaining(timeoutMinutes * 60);
    };

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });

    return () => {
      clearInterval(timer);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [timeoutMinutes, onLogout]);

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  const getTabTitle = (tab: NavTab) => {
    switch (tab) {
      case 'dashboard':
        return 'System Overview & Financial Dashboard';
      case 'customers':
        return 'Customer Directory & Profiles';
      case 'domains':
        return 'Domain Registrations & Renewal Tracking';
      case 'invoices':
        return 'Invoices & Quotations';
      case 'payments':
        return 'Payments Ledger & Reconciliation';
      case 'messaging':
        return 'SMS Ethiopia & Notification Center';
      case 'reports':
        return 'Financial & Operational Reports';
      case 'users':
        return 'System Users & Access Management';
      case 'audit':
        return 'System Audit Trail & Security Logs';
      case 'settings':
        return 'System Configuration, API & Backups';
      default:
        return 'NexGrid Admin Portal';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 shadow-2xs px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Hamburger & View Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileSidebar}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {getTabTitle(currentTab)}
            </h1>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700">NexGrid Digital Systems</span>
              <span>·</span>
              <span>Addis Ababa Time: <strong className="font-mono text-slate-700">{addisTime}</strong> (EAT)</span>
            </div>
          </div>
        </div>

        {/* Right: Firebase Cloud Sync, Refresh, Inactivity Timer, Quick Action, Profile */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Firebase Cloud DB Sync Status Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setSyncMenuOpen(!syncMenuOpen);
                setQuickMenuOpen(false);
                setUserMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer"
              title="Firebase Cloud Firestore Multi-Device Sync"
            >
              <Database className={`w-3.5 h-3.5 text-emerald-600 ${syncStatus.syncing ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">
                {syncStatus.syncing ? 'Syncing DB...' : 'Firebase DB Synced'}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            </button>

            {syncMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSyncMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 p-3.5 z-50 text-xs text-slate-700 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-1.5 font-bold text-slate-900">
                      <Database className="w-4 h-4 text-emerald-600" />
                      <span>Firebase Cloud Firestore</span>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Live Sync
                    </span>
                  </div>

                  <div className="space-y-1.5 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Project ID:</span>
                      <span className="font-mono font-semibold text-slate-800">{syncStatus.projectId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Firestore Auth:</span>
                      <span className="font-semibold text-slate-800 truncate max-w-[150px]">
                        {syncStatus.firebaseAuthenticated
                          ? syncStatus.firebaseEmail || 'Verified'
                          : 'Cloud Relay + Firestore'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Last Synced:</span>
                      <span className="font-mono text-slate-700">
                        {syncStatus.lastSyncedAt
                          ? new Date(syncStatus.lastSyncedAt).toLocaleTimeString()
                          : 'Just now'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleManualSync();
                        setSyncMenuOpen(false);
                      }}
                      className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.syncing ? 'animate-spin' : ''}`} />
                      <span>Sync Across All Devices Now</span>
                    </button>

                    {!syncStatus.firebaseAuthenticated && (
                      <button
                        type="button"
                        onClick={() => {
                          setSyncMenuOpen(false);
                          handleConnectFirebaseAuth();
                        }}
                        className="w-full py-1.5 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>Verify Google Identity for Direct Firestore</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {onRefresh && (
            <button
              onClick={handleManualSync}
              title="Refresh & Sync Cloud Data"
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors hidden sm:inline-flex cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${syncStatus.syncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          )}

          {/* Session Inactivity Counter */}
          <div
            title={`Session active. Inactivity timeout: ${timeoutMinutes} minutes. Resets on mouse or keyboard activity.`}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 border border-slate-200 text-[11px] text-slate-600 font-medium"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Timeout:</span>
            <span className="font-mono font-semibold text-slate-800">
              {formatCountdown(timeRemaining)}
            </span>
          </div>

          {/* Quick Actions Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setQuickMenuOpen(!quickMenuOpen);
                setUserMenuOpen(false);
                setSyncMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-2xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Quick Action</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {quickMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setQuickMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 text-xs text-slate-700 animate-in fade-in slide-in-from-top-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                    Create New
                  </div>
                  <button
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAction('customer');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 hover:text-blue-600 text-left transition-colors"
                  >
                    <UserPlus className="w-4 h-4 text-slate-400" />
                    <span>New Customer</span>
                  </button>
                  <button
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAction('domain');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 hover:text-blue-600 text-left transition-colors"
                  >
                    <Globe className="w-4 h-4 text-slate-400" />
                    <span>Register Domain</span>
                  </button>
                  <button
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAction('invoice');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 hover:text-blue-600 text-left transition-colors"
                  >
                    <FilePlus className="w-4 h-4 text-slate-400" />
                    <span>Create Invoice</span>
                  </button>
                  <button
                    onClick={() => {
                      setQuickMenuOpen(false);
                      onQuickAction('payment');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 hover:text-blue-600 text-left transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span>Record Payment</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Admin User Menu */}
          <div className="relative">
            <button
              onClick={() => {
                setUserMenuOpen(!userMenuOpen);
                setQuickMenuOpen(false);
              }}
              className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                {admin?.username ? admin.username[0].toUpperCase() : 'A'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
            </button>

            {userMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setUserMenuOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 z-50 text-xs text-slate-700">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <div className="font-semibold text-slate-900 truncate">
                      {admin?.fullName || 'Administrator'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {admin?.email || 'admin@nexgrid.et'}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Super Administrator Session</span>
                  </div>
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50 hover:text-rose-600 text-left text-rose-600 font-medium transition-colors border-t border-slate-100"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
