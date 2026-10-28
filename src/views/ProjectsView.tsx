import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Send,
  Mail,
  Sparkles,
  Edit2,
  Trash2,
  Calendar,
  Globe,
  User,
  LayoutGrid,
  List,
  RotateCw,
  CheckSquare,
  Square,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { Project, ProjectMilestone, Customer, Domain } from '../types.ts';
import { EmailConfirmationModal } from '../components/EmailConfirmationModal.tsx';

interface ProjectsViewProps {
  initialOpenNewModal?: boolean;
  onResetNewModal?: () => void;
}

const DEFAULT_MILESTONES_PRESET: Omit<ProjectMilestone, 'id'>[] = [
  { title: 'Requirements & System Architecture', completed: true },
  { title: 'UI/UX Design & Client Prototype Review', completed: false },
  { title: 'Core Application & Database Development', completed: false },
  { title: 'Integration, Security & QA Testing', completed: false },
  { title: 'Production Deployment & Client Handover', completed: false },
];

export const ProjectsView: React.FC<ProjectsViewProps> = ({
  initialOpenNewModal = false,
  onResetNewModal,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & View Mode
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'planning' | 'in_progress' | 'review_qa' | 'completed' | 'on_hold'
  >('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Create / Edit Project Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    customerId: string;
    domainId: string;
    projectName: string;
    serviceCategory: string;
    status: Project['status'];
    progress: number;
    currentPhase: string;
    startDate: string;
    targetDate: string;
    budget: number;
    notes: string;
    milestones: ProjectMilestone[];
  }>({
    customerId: '',
    domainId: '',
    projectName: '',
    serviceCategory: 'Web & Software Development',
    status: 'in_progress',
    progress: 20,
    currentPhase: 'UI/UX Design & Client Prototype Review',
    startDate: new Date().toISOString().split('T')[0],
    targetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    budget: 15000,
    notes: '',
    milestones: DEFAULT_MILESTONES_PRESET.map((m, idx) => ({
      ...m,
      id: `ms-init-${idx + 1}`,
      completedAt: m.completed ? new Date().toISOString() : undefined,
    })),
  });
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('');

  // Client Notification Modal (Progress Update SMS or New Feature Announcement SMS)
  const [notifyModalProject, setNotifyModalProject] = useState<Project | null>(null);
  const [notifyTemplateMode, setNotifyTemplateMode] = useState<'progress_update' | 'new_feature'>(
    'progress_update'
  );
  const [notifyFeatureName, setNotifyFeatureName] = useState('Live Project Progress Tracking');
  const [notifyPortalLink, setNotifyPortalLink] = useState('https://admin.nexgrid.lol');
  const [notifySmsMessage, setNotifySmsMessage] = useState('');
  const [notifySending, setNotifySending] = useState(false);
  const [notifyResult, setNotifyResult] = useState<{
    success: boolean;
    status: string;
    error?: string;
  } | null>(null);

  // Delete Confirmation Modal
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Email Confirmation Modal
  const [emailModalConfig, setEmailModalConfig] = useState<{
    isOpen: boolean;
    recipientEmail: string;
    recipientName: string;
    customerId?: string;
    subject: string;
    body: string;
    messageType: 'project_update' | 'new_feature';
    title: string;
  }>({
    isOpen: false,
    recipientEmail: '',
    recipientName: '',
    subject: '',
    body: '',
    messageType: 'project_update',
    title: '',
  });

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [projRes, custRes, domRes] = await Promise.all([
        api.getProjects(),
        api.getCustomers(),
        api.getDomains(),
      ]);
      setProjects(projRes.projects || []);
      setCustomers(custRes.customers || []);
      setDomains(domRes.domains || []);
    } catch (err) {
      console.error('Failed to load projects data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialOpenNewModal) {
      handleOpenNewModal();
      if (onResetNewModal) onResetNewModal();
    }
  }, [initialOpenNewModal]);

  const handleOpenNewModal = () => {
    setEditingProject(null);
    setFormError(null);
    const defaultCustId = customers[0]?.id || '';
    const defaultDomId = domains.find((d) => d.customerId === defaultCustId)?.id || '';
    setFormData({
      customerId: defaultCustId,
      domainId: defaultDomId,
      projectName: '',
      serviceCategory: 'Web & Software Development',
      status: 'in_progress',
      progress: 20,
      currentPhase: 'UI/UX Design & Client Prototype Review',
      startDate: new Date().toISOString().split('T')[0],
      targetDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      budget: 15000,
      notes: '',
      milestones: DEFAULT_MILESTONES_PRESET.map((m, idx) => ({
        ...m,
        id: `ms-${Date.now()}-${idx + 1}`,
        completedAt: m.completed ? new Date().toISOString() : undefined,
      })),
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (project: Project) => {
    setEditingProject(project);
    setFormError(null);
    setFormData({
      customerId: project.customerId,
      domainId: project.domainId || '',
      projectName: project.projectName,
      serviceCategory: project.serviceCategory || 'Web & Software Development',
      status: project.status,
      progress: project.progress,
      currentPhase: project.currentPhase,
      startDate: project.startDate,
      targetDate: project.targetDate,
      budget: project.budget || 0,
      notes: project.notes || '',
      milestones:
        project.milestones && project.milestones.length > 0
          ? project.milestones.map((m) => ({ ...m }))
          : [],
    });
    setIsModalOpen(true);
  };

  const recalculateFromMilestones = (milestones: ProjectMilestone[]) => {
    if (milestones.length === 0) return null;
    const completedCount = milestones.filter((m) => m.completed).length;
    const pct = Math.round((completedCount / milestones.length) * 100);
    const nextPending = milestones.find((m) => !m.completed);
    const currentPhase = nextPending
      ? nextPending.title
      : 'Completed & Delivered';
    const status: Project['status'] =
      pct === 100 ? 'completed' : pct >= 80 ? 'review_qa' : pct > 0 ? 'in_progress' : 'planning';
    return { progress: pct, currentPhase, status };
  };

  const handleToggleFormMilestone = (msId: string) => {
    const updated = formData.milestones.map((m) =>
      m.id === msId
        ? {
            ...m,
            completed: !m.completed,
            completedAt: !m.completed ? new Date().toISOString() : undefined,
          }
        : m
    );
    const calc = recalculateFromMilestones(updated);
    setFormData((prev) => ({
      ...prev,
      milestones: updated,
      ...(calc
        ? {
            progress: calc.progress,
            currentPhase: calc.currentPhase,
            status: calc.status,
          }
        : {}),
    }));
  };

  const handleAddFormMilestone = () => {
    const trimmed = newMilestoneTitle.trim();
    if (!trimmed) return;
    const updated: ProjectMilestone[] = [
      ...formData.milestones,
      {
        id: `ms-${Date.now()}-${formData.milestones.length + 1}`,
        title: trimmed,
        completed: false,
      },
    ];
    const calc = recalculateFromMilestones(updated);
    setFormData((prev) => ({
      ...prev,
      milestones: updated,
      ...(calc ? { progress: calc.progress, currentPhase: calc.currentPhase } : {}),
    }));
    setNewMilestoneTitle('');
  };

  const handleRemoveFormMilestone = (msId: string) => {
    const updated = formData.milestones.filter((m) => m.id !== msId);
    const calc = recalculateFromMilestones(updated);
    setFormData((prev) => ({
      ...prev,
      milestones: updated,
      ...(calc ? { progress: calc.progress } : {}),
    }));
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerId || !formData.projectName.trim()) {
      setFormError('Please select a customer and enter a project name.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingProject) {
        await api.updateProject(editingProject.id, formData);
      } else {
        await api.createProject(formData);
      }
      setIsModalOpen(false);
      await loadData(true);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  // Interactive card/table milestone toggle
  const handleToggleProjectMilestoneLive = async (project: Project, msId: string) => {
    const updatedMilestones = (project.milestones || []).map((m) =>
      m.id === msId
        ? {
            ...m,
            completed: !m.completed,
            completedAt: !m.completed ? new Date().toISOString() : undefined,
          }
        : m
    );
    const calc = recalculateFromMilestones(updatedMilestones);
    const nextProgress = calc ? calc.progress : project.progress;
    const nextPhase = calc ? calc.currentPhase : project.currentPhase;
    const nextStatus = calc ? calc.status : project.status;

    // Optimistic UI update
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              milestones: updatedMilestones,
              progress: nextProgress,
              currentPhase: nextPhase,
              status: nextStatus,
            }
          : p
      )
    );

    try {
      await api.updateProject(project.id, {
        milestones: updatedMilestones,
        progress: nextProgress,
        currentPhase: nextPhase,
        status: nextStatus,
      });
      await loadData(true);
    } catch (err) {
      console.error('Failed to update milestone:', err);
      loadData(true);
    }
  };

  // Quick +/- 10% or 100% progress adjustment
  const handleQuickAdjustProgress = async (project: Project, newProgress: number) => {
    const clamped = Math.max(0, Math.min(100, newProgress));
    const nextStatus: Project['status'] =
      clamped === 100
        ? 'completed'
        : clamped >= 85
        ? 'review_qa'
        : clamped > 0
        ? 'in_progress'
        : 'planning';
    const nextPhase =
      clamped === 100 ? 'Completed & Delivered' : project.currentPhase;

    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? { ...p, progress: clamped, status: nextStatus, currentPhase: nextPhase }
          : p
      )
    );

    try {
      await api.updateProject(project.id, {
        progress: clamped,
        status: nextStatus,
        currentPhase: nextPhase,
      });
      await loadData(true);
    } catch (err) {
      console.error('Failed to adjust progress:', err);
      loadData(true);
    }
  };

  const buildNotifySmsText = (
    project: Project,
    mode: 'progress_update' | 'new_feature',
    featName = notifyFeatureName,
    portalLink = notifyPortalLink
  ) => {
    const custName = project.customerName || 'Valued Client';
    if (mode === 'new_feature') {
      return `Hello ${custName}, exciting news from NexGrid Digital Systems! A new feature (${featName}) has just been added to your system (${project.projectName}). Please check it out now at ${portalLink} and let us know your feedback!`;
    }
    return `Hello ${custName}, project update from NexGrid Digital Systems: "${project.projectName}" is now ${project.progress}% complete (Current Phase: ${project.currentPhase}). Check the latest updates at ${portalLink} or contact us for details.`;
  };

  const handleOpenNotifyModal = (
    project: Project,
    mode: 'progress_update' | 'new_feature' = 'progress_update'
  ) => {
    setNotifyModalProject(project);
    setNotifyTemplateMode(mode);
    setNotifyResult(null);
    setNotifySmsMessage(buildNotifySmsText(project, mode, notifyFeatureName, notifyPortalLink));
  };

  const handleDispatchProjectSms = async () => {
    if (!notifyModalProject) return;
    setNotifySending(true);
    setNotifyResult(null);
    try {
      const res = await api.sendProjectUpdateSms(notifyModalProject.id, notifySmsMessage);
      setNotifyResult({
        success: res.status === 'sent' || res.status === 'delivered',
        status: res.status,
        error: res.error,
      });
    } catch (err: any) {
      setNotifyResult({
        success: false,
        status: 'failed',
        error: err.message || 'Failed to dispatch SMS',
      });
    } finally {
      setNotifySending(false);
    }
  };

  const handleOpenEmailForProject = (
    project: Project,
    mode: 'progress_update' | 'new_feature'
  ) => {
    const cust = customers.find((c) => c.id === project.customerId);
    const email = cust?.email || project.customerEmail || '';
    const custName = project.customerName || cust?.businessName || 'Valued Client';

    if (mode === 'new_feature') {
      setEmailModalConfig({
        isOpen: true,
        recipientEmail: email,
        recipientName: custName,
        customerId: project.customerId,
        subject: `New Feature Added: ${notifyFeatureName} — Check It Out!`,
        body: `Dear ${custName},\n\nWe are excited to inform you that a brand-new feature has been added to your NexGrid Digital Systems project (${project.projectName}):\n\n• New Feature: ${notifyFeatureName}\n• Where to Check: ${notifyPortalLink}\n\nWe invite you to log in and check out this new capability today. If you have any questions or feedback, please reach out to us at +251 906697634 or nexgriddigital@gmail.com.\n\nBest regards,\nNexGrid Digital Systems Product & Engineering Team`,
        messageType: 'new_feature',
        title: `Send New Feature Email to ${custName}`,
      });
    } else {
      setEmailModalConfig({
        isOpen: true,
        recipientEmail: email,
        recipientName: custName,
        customerId: project.customerId,
        subject: `Project Progress Update: ${project.projectName} (${project.progress}% Complete)`,
        body: `Dear ${custName},\n\nHere is the latest progress update on your project with NexGrid Digital Systems:\n\n• Project Name: ${project.projectName}\n• Overall Completion: ${project.progress}%\n• Current Phase: ${project.currentPhase}\n• Status: ${project.status.replace('_', ' ').toUpperCase()}\n• Target Delivery Date: ${project.targetDate}\n\nPlease check the latest updates or reach out to our team at +251 906697634 if you would like to review any milestone deliverables.\n\nBest regards,\nNexGrid Digital Systems Project Delivery Team`,
        messageType: 'project_update',
        title: `Send Project Progress Email to ${custName}`,
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete) return;
    setDeleting(true);
    try {
      await api.deleteProject(projectToDelete.id);
      setProjectToDelete(null);
      await loadData(true);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setDeleting(false);
    }
  };

  const filteredProjects = projects.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.projectName.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.customerName && p.customerName.toLowerCase().includes(q)) ||
      (p.domainName && p.domainName.toLowerCase().includes(q)) ||
      p.currentPhase.toLowerCase().includes(q) ||
      p.serviceCategory.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Summary KPIs
  const totalProjects = projects.length;
  const activeCount = projects.filter(
    (p) => p.status === 'planning' || p.status === 'in_progress' || p.status === 'review_qa'
  ).length;
  const completedCount = projects.filter((p) => p.status === 'completed').length;
  const avgProgress =
    totalProjects > 0
      ? Math.round(projects.reduce((acc, p) => acc + (Number(p.progress) || 0), 0) / totalProjects)
      : 0;

  const getStatusBadge = (status: Project['status']) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Completed
          </span>
        );
      case 'review_qa':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
            Review &amp; QA
          </span>
        );
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
            In Progress
          </span>
        );
      case 'planning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700 border border-slate-200">
            Planning
          </span>
        );
      case 'on_hold':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
            On Hold
          </span>
        );
    }
  };

  return (
    <div className="space-y-5">
      {/* 1. Top KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Total Tracked Projects</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <FolderKanban className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {totalProjects}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Across {new Set(projects.map((p) => p.customerId)).size} client accounts
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Active In-Flight</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-600 font-mono tabular-nums">
            {activeCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            Planning, development &amp; QA
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Average Completion</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {avgProgress}%
          </div>
          <div className="mt-1.5 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${avgProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">Completed &amp; Live</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600 font-mono tabular-nums">
            {completedCount}
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            100% milestones delivered
          </div>
        </div>
      </div>

      {/* 2. Filter Bar & Action Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search project, client, phase, domain..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'planning', label: 'Planning' },
                { id: 'in_progress', label: 'In Progress' },
                { id: 'review_qa', label: 'Review & QA' },
                { id: 'completed', label: 'Completed' },
                { id: 'on_hold', label: 'On Hold' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Cards</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => loadData()}
            title="Refresh Projects"
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
          >
            <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* 3. Projects Content: Cards View or Table View */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-xs text-slate-400">
          Loading project progress data...
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <FolderKanban className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-900">No Projects Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Track client website builds, domain deployments, ERP/POS rollouts, and milestone completion percentages in real time.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Project</span>
          </button>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredProjects.map((project) => {
            const milestones = project.milestones || [];
            const doneMilestones = milestones.filter((m) => m.completed).length;
            const progressColor =
              project.progress === 100
                ? 'bg-emerald-600'
                : project.progress >= 50
                ? 'bg-blue-600'
                : 'bg-amber-500';

            return (
              <div
                key={project.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between gap-4 hover:border-slate-300 transition-all"
              >
                <div className="space-y-3.5">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] font-bold text-blue-600">
                          {project.id}
                        </span>
                        {getStatusBadge(project.status)}
                        <span className="text-[11px] text-slate-400 font-medium">
                          {project.serviceCategory}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-1 truncate">
                        {project.projectName}
                      </h3>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 mt-1">
                        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          {project.customerName}
                        </span>
                        {project.domainName && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                            <Globe className="w-3 h-3" />
                            {project.domainName}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(project)}
                        title="Edit Project & Milestones"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(project)}
                        title="Delete Project"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar & Quick Step Controls */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Current Phase
                        </span>
                        <span className="font-semibold text-slate-800 truncate block">
                          {project.currentPhase}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-lg font-extrabold font-mono tabular-nums text-slate-900">
                          {project.progress}%
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${progressColor}`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {doneMilestones}/{milestones.length} milestones completed
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustProgress(project, project.progress - 10)}
                          disabled={project.progress <= 0}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold disabled:opacity-40"
                        >
                          -10%
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjustProgress(project, project.progress + 10)}
                          disabled={project.progress >= 100}
                          className="px-2 py-0.5 rounded bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-mono text-[10px] font-semibold disabled:opacity-40"
                        >
                          +10%
                        </button>
                        {project.progress < 100 && (
                          <button
                            type="button"
                            onClick={() => handleQuickAdjustProgress(project, 100)}
                            className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-mono text-[10px] font-semibold"
                          >
                            100% Done
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Interactive Milestones Checklist */}
                  {milestones.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Delivery Milestones (Click to toggle progress)
                      </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                        {milestones.map((ms) => (
                          <button
                            key={ms.id}
                            type="button"
                            onClick={() => handleToggleProjectMilestoneLive(project, ms.id)}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs border transition-colors ${
                              ms.completed
                                ? 'bg-emerald-50/40 border-emerald-200/70 text-slate-600'
                                : 'bg-white border-slate-200/80 hover:border-blue-300 text-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {ms.completed ? (
                                <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span
                                className={`truncate ${
                                  ms.completed ? 'line-through text-slate-400' : 'font-medium'
                                }`}
                              >
                                {ms.title}
                              </span>
                            </div>
                            {ms.completed && (
                              <span className="text-[10px] font-mono text-emerald-600 shrink-0">
                                Done
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: Dates, Budget & Client Notification Actions */}
                <div className="pt-3 border-t border-slate-100 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Target: <strong className="text-slate-700">{project.targetDate}</strong>
                    </span>
                    {project.budget > 0 && (
                      <span className="font-mono font-semibold text-slate-700 tabular-nums">
                        Budget: {project.budget.toLocaleString()} {project.currency || 'ETB'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenNotifyModal(project, 'progress_update')}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors"
                    >
                      <Send className="w-3 h-3" />
                      <span>SMS Progress Update</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenNotifyModal(project, 'new_feature')}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Announce New Feature</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEmailForProject(project, 'progress_update')}
                      title="Send Progress or Feature Email via Gmail"
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Email</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Project ID &amp; Name</th>
                  <th className="py-2.5 px-4">Client &amp; Domain</th>
                  <th className="py-2.5 px-4">Current Phase</th>
                  <th className="py-2.5 px-4">Progress</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">Target Date</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono text-[11px] font-bold text-blue-600">
                        {project.id}
                      </div>
                      <div className="font-semibold text-slate-900">{project.projectName}</div>
                      <div className="text-[11px] text-slate-400">{project.serviceCategory}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{project.customerName}</div>
                      {project.domainName && (
                        <div className="font-mono text-[11px] text-indigo-600">
                          {project.domainName}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 max-w-xs truncate">
                      {project.currentPhase}
                    </td>
                    <td className="py-3 px-4 w-44">
                      <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-900 mb-1 tabular-nums">
                        <span>{project.progress}%</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickAdjustProgress(project, project.progress - 10)
                            }
                            className="px-1.5 py-0.2 rounded bg-slate-100 hover:bg-slate-200 text-[10px]"
                          >
                            -10
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleQuickAdjustProgress(project, project.progress + 10)
                            }
                            className="px-1.5 py-0.2 rounded bg-slate-100 hover:bg-slate-200 text-[10px]"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            project.progress === 100 ? 'bg-emerald-600' : 'bg-blue-600'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(project.status)}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                      {project.targetDate}
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenNotifyModal(project, 'progress_update')}
                        className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>SMS</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenNotifyModal(project, 'new_feature')}
                        className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>New Feature</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(project)}
                        className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 text-slate-700 text-[11px] font-medium"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Create / Edit Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full overflow-hidden my-8">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FolderKanban className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="text-sm font-bold">
                    {editingProject
                      ? `Edit Project — ${editingProject.id}`
                      : 'Create New Client Project & Progress Tracker'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Track delivery phases, completion percentage, and client SMS updates
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProject} className="p-6 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Client / Customer *
                  </label>
                  <select
                    required
                    value={formData.customerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const linkedDom = domains.find((d) => d.customerId === cid)?.id || '';
                      setFormData((prev) => ({
                        ...prev,
                        customerId: cid,
                        domainId: linkedDom,
                      }));
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} ({c.contactPerson})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Linked Domain (Optional)
                  </label>
                  <select
                    value={formData.domainId}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, domainId: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">-- No Linked Domain --</option>
                    {domains
                      .filter((d) => !formData.customerId || d.customerId === formData.customerId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.domainName} ({d.status})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Project Name / Deliverable *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.projectName}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, projectName: e.target.value }))
                    }
                    placeholder="e.g. Retail POS & Inventory Cloud Portal"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Service Category
                  </label>
                  <select
                    value={formData.serviceCategory}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, serviceCategory: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="Web & Software Development">Web &amp; Software Development</option>
                    <option value="POS & ERP System">POS &amp; ERP System</option>
                    <option value="Domain & Cloud Infrastructure">Domain &amp; Cloud Infrastructure</option>
                    <option value="E-Commerce & Payment Integration">E-Commerce &amp; Payment Integration</option>
                    <option value="Mobile App & Portal">Mobile App &amp; Portal</option>
                    <option value="Annual Maintenance & Retainer">Annual Maintenance &amp; Retainer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Delivery Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        status: e.target.value as Project['status'],
                        progress:
                          e.target.value === 'completed' ? 100 : prev.progress,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
                  >
                    <option value="planning">Planning</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review_qa">Review &amp; QA</option>
                    <option value="completed">Completed</option>
                    <option value="on_hold">On Hold</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      Completion Progress (%)
                    </label>
                    <span className="font-mono font-bold text-blue-600 text-sm tabular-nums">
                      {formData.progress}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={formData.progress}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        progress: val,
                        status: val === 100 ? 'completed' : prev.status === 'completed' ? 'in_progress' : prev.status,
                      }));
                    }}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Current Active Phase
                  </label>
                  <input
                    type="text"
                    value={formData.currentPhase}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, currentPhase: e.target.value }))
                    }
                    placeholder="e.g. Core System Development"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Target Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formData.targetDate}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, targetDate: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Project Budget (ETB)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.budget}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        budget: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-800"
                  />
                </div>
              </div>

              {/* Milestones Checklist Editor */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800">
                    Project Milestones (Checking milestones auto-calculates %)
                  </label>
                  <span className="text-[11px] font-mono text-slate-500">
                    {formData.milestones.filter((m) => m.completed).length}/
                    {formData.milestones.length} Done
                  </span>
                </div>

                <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                  {formData.milestones.map((ms) => (
                    <div
                      key={ms.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleFormMilestone(ms.id)}
                        className="flex items-center gap-2 text-left flex-1 min-w-0"
                      >
                        {ms.completed ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span
                          className={`truncate ${
                            ms.completed
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 font-medium'
                          }`}
                        >
                          {ms.title}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFormMilestone(ms.id)}
                        className="text-slate-400 hover:text-rose-600 px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMilestoneTitle}
                    onChange={(e) => setNewMilestoneTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddFormMilestone();
                      }
                    }}
                    placeholder="Add custom milestone (e.g. Telebirr API Integration)..."
                    className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={handleAddFormMilestone}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold"
                  >
                    + Add Milestone
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Internal Delivery Notes
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Optional technical notes, repository links, or client preferences..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-2xs disabled:opacity-50"
                >
                  {saving
                    ? 'Saving Project...'
                    : editingProject
                    ? 'Save Project Changes'
                    : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Send Client Progress SMS / New Feature Announcement Modal */}
      {notifyModalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notifyTemplateMode === 'new_feature' ? (
                  <Sparkles className="w-4 h-4 text-blue-400" />
                ) : (
                  <Send className="w-4 h-4 text-emerald-400" />
                )}
                <div>
                  <h3 className="text-sm font-bold">
                    {notifyTemplateMode === 'new_feature'
                      ? 'Announce New Feature to Client'
                      : 'Send Project Progress Update'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Recipient: {notifyModalProject.customerName} (
                    {notifyModalProject.customerPhone || 'No phone'})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotifyModalProject(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Template Mode Switcher */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setNotifyTemplateMode('progress_update');
                    setNotifySmsMessage(
                      buildNotifySmsText(
                        notifyModalProject,
                        'progress_update',
                        notifyFeatureName,
                        notifyPortalLink
                      )
                    );
                  }}
                  className={`py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    notifyTemplateMode === 'progress_update'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FolderKanban className="w-3.5 h-3.5 text-blue-600" />
                  <span>Progress Update ({notifyModalProject.progress}%)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotifyTemplateMode('new_feature');
                    setNotifySmsMessage(
                      buildNotifySmsText(
                        notifyModalProject,
                        'new_feature',
                        notifyFeatureName,
                        notifyPortalLink
                      )
                    );
                  }}
                  className={`py-1.5 px-3 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-all ${
                    notifyTemplateMode === 'new_feature'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                  <span>New Feature Added!</span>
                </button>
              </div>

              {notifyTemplateMode === 'new_feature' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-blue-50/50 border border-blue-200">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                      New Feature Name
                    </label>
                    <input
                      type="text"
                      value={notifyFeatureName}
                      onChange={(e) => {
                        setNotifyFeatureName(e.target.value);
                        setNotifySmsMessage(
                          buildNotifySmsText(
                            notifyModalProject,
                            'new_feature',
                            e.target.value,
                            notifyPortalLink
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                      Where to Check (Link)
                    </label>
                    <input
                      type="text"
                      value={notifyPortalLink}
                      onChange={(e) => {
                        setNotifyPortalLink(e.target.value);
                        setNotifySmsMessage(
                          buildNotifySmsText(
                            notifyModalProject,
                            'new_feature',
                            notifyFeatureName,
                            e.target.value
                          )
                        );
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              {notifyResult && (
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2 ${
                    notifyResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {notifyResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {notifyResult.success
                        ? 'SMS Dispatched Successfully via SMS Ethiopia'
                        : 'SMS Dispatch Issue'}
                    </div>
                    {notifyResult.error && (
                      <div className="text-[11px] mt-0.5">{notifyResult.error}</div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  SMS Message Body (SMS Ethiopia API)
                </label>
                <textarea
                  rows={4}
                  value={notifySmsMessage}
                  onChange={(e) => setNotifySmsMessage(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-lg font-mono text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                  <span>Characters: {notifySmsMessage.length}</span>
                  <span>Segments: {Math.ceil(notifySmsMessage.length / 160) || 1}</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setNotifyModalProject(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const proj = notifyModalProject;
                    const mode = notifyTemplateMode;
                    setNotifyModalProject(null);
                    handleOpenEmailForProject(proj, mode);
                  }}
                  className="px-3.5 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold inline-flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send via Gmail Instead</span>
                </button>
                <button
                  type="button"
                  onClick={handleDispatchProjectSms}
                  disabled={notifySending || !notifySmsMessage.trim()}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{notifySending ? 'Sending SMS...' : 'Dispatch SMS Now'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Delete Project Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Delete Project Record?</h3>
                <p className="text-slate-500 mt-1">
                  Are you sure you want to remove{' '}
                  <strong className="text-slate-800">{projectToDelete.projectName}</strong> (
                  {projectToDelete.id})? This action cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-3.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Gmail Confirmation Modal */}
      <EmailConfirmationModal
        isOpen={emailModalConfig.isOpen}
        onClose={() => setEmailModalConfig((prev) => ({ ...prev, isOpen: false }))}
        initialRecipientEmail={emailModalConfig.recipientEmail}
        recipientName={emailModalConfig.recipientName}
        customerId={emailModalConfig.customerId}
        initialSubject={emailModalConfig.subject}
        initialBody={emailModalConfig.body}
        messageType={emailModalConfig.messageType}
        title={emailModalConfig.title}
      />
    </div>
  );
};
