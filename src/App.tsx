import React, { useState, useEffect } from 'react';
import { api, setUnauthorizedHandler } from './services/api.ts';
import { AdminUser, Domain, Invoice } from './types.ts';
import { Sidebar, NavTab } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
import { LoginView } from './views/LoginView.tsx';
import { DashboardView } from './views/DashboardView.tsx';
import { CustomersView } from './views/CustomersView.tsx';
import { DomainsView } from './views/DomainsView.tsx';
import { InvoicesView } from './views/InvoicesView.tsx';
import { PaymentsView } from './views/PaymentsView.tsx';
import { MessagingView } from './views/MessagingView.tsx';
import { ReportsView } from './views/ReportsView.tsx';
import { AuditLogsView } from './views/AuditLogsView.tsx';
import { SettingsView } from './views/SettingsView.tsx';

export default function App() {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [sidebarOpenMobile, setSidebarOpenMobile] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [urgentDomainCount, setUrgentDomainCount] = useState(0);

  // Quick Action / Cross-Tab Modal Triggers
  const [openNewCustomerModal, setOpenNewCustomerModal] = useState(false);
  const [openNewDomainModal, setOpenNewDomainModal] = useState(false);
  const [openNewInvoiceModal, setOpenNewInvoiceModal] = useState(false);
  const [openNewPaymentModal, setOpenNewPaymentModal] = useState(false);

  const [targetDomainToRenew, setTargetDomainToRenew] = useState<Domain | null>(null);
  const [targetDomainToRemind, setTargetDomainToRemind] = useState<Domain | null>(null);
  const [preselectedInvoiceForPayment, setPreselectedInvoiceForPayment] = useState<Invoice | null>(null);

  // Global refresh counter
  const [refreshKey, setRefreshKey] = useState(0);

  // Register unauthorized handler for 401 sessions
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAdmin(null);
    });

    const verifySession = async () => {
      try {
        const res = await api.getMe();
        setAdmin(res.admin);
        setTimeoutMinutes(res.timeoutMinutes || 60);
      } catch {
        setAdmin(null);
      } finally {
        setAuthChecking(false);
      }
    };

    verifySession();
  }, []);

  // Fetch domain badge count
  useEffect(() => {
    if (!admin) return;
    const fetchBadges = async () => {
      try {
        const stats = await api.getDashboardStats();
        const urgent = (stats.metrics.expiringSoonDomains || 0) + (stats.metrics.expiredDomains || 0);
        setUrgentDomainCount(urgent);
      } catch {
        // quiet fallback
      }
    };
    fetchBadges();
  }, [admin, refreshKey]);

  const handleLoginSuccess = (user: AdminUser, timeout: number) => {
    setAdmin(user);
    setTimeoutMinutes(timeout);
    setCurrentTab('dashboard');
  };

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {
      // quiet cleanup
    } finally {
      setAdmin(null);
    }
  };

  const handleQuickAction = (action: 'customer' | 'domain' | 'invoice' | 'payment') => {
    if (action === 'customer') {
      setCurrentTab('customers');
      setOpenNewCustomerModal(true);
    } else if (action === 'domain') {
      setCurrentTab('domains');
      setOpenNewDomainModal(true);
    } else if (action === 'invoice') {
      setCurrentTab('invoices');
      setOpenNewInvoiceModal(true);
    } else if (action === 'payment') {
      setCurrentTab('payments');
      setOpenNewPaymentModal(true);
    }
  };

  const handleRenewDomainFromDashboard = (domain: Domain) => {
    setCurrentTab('domains');
    setTargetDomainToRenew(domain);
  };

  const handleSendReminderFromDashboard = (domain: Domain) => {
    setCurrentTab('domains');
    setTargetDomainToRemind(domain);
  };

  const handleRecordPaymentForInvoice = (invoice: Invoice) => {
    setCurrentTab('payments');
    setPreselectedInvoiceForPayment(invoice);
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium">Verifying Administrator Session...</span>
        </div>
      </div>
    );
  }

  if (!admin) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        admin={admin}
        onLogout={handleLogout}
        isOpenMobile={sidebarOpenMobile}
        onCloseMobile={() => setSidebarOpenMobile(false)}
        urgentDomainCount={urgentDomainCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Header
          currentTab={currentTab}
          onOpenMobileSidebar={() => setSidebarOpenMobile(true)}
          admin={admin}
          onLogout={handleLogout}
          onQuickAction={handleQuickAction}
          timeoutMinutes={timeoutMinutes}
          onRefresh={() => setRefreshKey((k) => k + 1)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              key={`dash-${refreshKey}`}
              onNavigate={setCurrentTab}
              onRenewDomain={handleRenewDomainFromDashboard}
              onSendReminder={handleSendReminderFromDashboard}
            />
          )}

          {currentTab === 'customers' && (
            <CustomersView
              key={`cust-${refreshKey}`}
              initialOpenNewModal={openNewCustomerModal}
              onResetNewModal={() => setOpenNewCustomerModal(false)}
            />
          )}

          {currentTab === 'domains' && (
            <DomainsView
              key={`dom-${refreshKey}`}
              initialOpenNewModal={openNewDomainModal}
              onResetNewModal={() => setOpenNewDomainModal(false)}
              targetDomainToRenew={targetDomainToRenew}
              targetDomainToRemind={targetDomainToRemind}
              onClearTargetActions={() => {
                setTargetDomainToRenew(null);
                setTargetDomainToRemind(null);
              }}
            />
          )}

          {currentTab === 'invoices' && (
            <InvoicesView
              key={`inv-${refreshKey}`}
              initialOpenNewModal={openNewInvoiceModal}
              onResetNewModal={() => setOpenNewInvoiceModal(false)}
              onRecordPaymentForInvoice={handleRecordPaymentForInvoice}
            />
          )}

          {currentTab === 'payments' && (
            <PaymentsView
              key={`pay-${refreshKey}`}
              initialOpenNewModal={openNewPaymentModal}
              onResetNewModal={() => setOpenNewPaymentModal(false)}
              preselectedInvoice={preselectedInvoiceForPayment}
              onClearPreselectedInvoice={() => setPreselectedInvoiceForPayment(null)}
            />
          )}

          {currentTab === 'messaging' && (
            <MessagingView key={`msg-${refreshKey}`} />
          )}

          {currentTab === 'reports' && (
            <ReportsView key={`rep-${refreshKey}`} />
          )}

          {currentTab === 'audit' && (
            <AuditLogsView key={`aud-${refreshKey}`} />
          )}

          {currentTab === 'settings' && (
            <SettingsView key={`set-${refreshKey}`} />
          )}
        </main>
      </div>
    </div>
  );
}
