import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  Trash2,
  KeyRound,
  Mail,
  User,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  Lock,
} from 'lucide-react';
import { api } from '../services/api.ts';
import { AdminUser } from '../types.ts';

interface UsersViewProps {
  currentAdmin: AdminUser;
}

export const UsersView: React.FC<UsersViewProps> = ({ currentAdmin }) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Create New User Modal / Form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    role: 'admin' as 'admin' | 'super_admin',
  });

  // Reset Password Modal state
  const [resetTargetUser, setResetTargetUser] = useState<AdminUser | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);

  // Delete confirmation state
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  const isPrimaryAdmin =
    currentAdmin.role === 'super_admin' ||
    Boolean(currentAdmin.isPrimary) ||
    (users.length > 0 && users[0].id === currentAdmin.id);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const calculatePasswordStrength = (pw: string) => {
    const minLength = pw.length >= 12;
    const hasLower = /[a-z]/.test(pw);
    const hasUpper = /[A-Z]/.test(pw);
    const hasDigit = /[0-9]/.test(pw);
    const hasSpecial = /[^a-zA-Z0-9]/.test(pw);
    const categoriesCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;
    return {
      minLength,
      hasLower,
      hasUpper,
      hasDigit,
      hasSpecial,
      isValid: minLength && categoriesCount >= 3,
    };
  };

  const pwStrength = calculatePasswordStrength(formData.password);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!pwStrength.isValid) {
      setError('Password must be at least 12 characters and include uppercase, lowercase, numbers, or special characters.');
      return;
    }

    setCreating(true);
    try {
      const res = await api.createUser(formData);
      setSuccessMsg(`User account "${res.user.username}" (${res.user.fullName}) created successfully.`);
      setFormData({
        fullName: '',
        username: '',
        email: '',
        password: '',
        role: 'admin',
      });
      setShowCreateModal(false);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user account.');
    } finally {
      setCreating(false);
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError(null);
    setSuccessMsg(null);

    const check = calculatePasswordStrength(resetNewPassword);
    if (!check.isValid) {
      setError('New password must be at least 12 characters with mixed complexity (OWASP standard).');
      return;
    }

    setResetSaving(true);
    try {
      await api.updateUser(resetTargetUser.id, { newPassword: resetNewPassword });
      setSuccessMsg(`Password updated for "${resetTargetUser.username}". Their active sessions were revoked.`);
      setResetTargetUser(null);
      setResetNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setResetSaving(false);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    setError(null);
    setSuccessMsg(null);
    setDeletingUserId(user.id);
    try {
      await api.deleteUser(user.id);
      setSuccessMsg(`User "${user.username}" has been permanently removed.`);
      loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-blue-600 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              System Users & Access Control
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Public signup is permanently closed after initial setup. Only the Primary Administrator can provision and manage additional user accounts.
            </p>
          </div>
        </div>

        {isPrimaryAdmin && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs transition-colors shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create New User</span>
          </button>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/60">
          <div className="text-xs font-bold text-slate-800">
            Authorized Portal Users ({users.length})
          </div>
          <button
            type="button"
            onClick={loadUsers}
            className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="py-3 px-4">Full Name</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Last Sign-In</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Loading user accounts...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No user accounts found.
                  </td>
                </tr>
              ) : (
                users.map((u, idx) => {
                  const isPrimary = idx === 0 || u.isPrimary;
                  const isSelf = u.id === currentAdmin.id;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${
                              isPrimary
                                ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}
                          >
                            {u.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{u.fullName}</span>
                              {isSelf && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-800">{u.username}</td>
                      <td className="py-3 px-4 text-slate-600">{u.email}</td>
                      <td className="py-3 px-4">
                        {isPrimary ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            <ShieldCheck className="w-3 h-3" />
                            Primary Administrator
                          </span>
                        ) : u.role === 'super_admin' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Shield className="w-3 h-3" />
                            Super Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            Staff / Admin
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {u.lastLoginAt ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(u.lastLoginAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Never signed in</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {isPrimaryAdmin ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setResetTargetUser(u);
                                setResetNewPassword('');
                                setError(null);
                              }}
                              className="px-2.5 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              title="Reset User Password"
                            >
                              <KeyRound className="w-3 h-3 text-slate-500" />
                              <span>Set Password</span>
                            </button>

                            {!isPrimary && !isSelf && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                disabled={deletingUserId === u.id}
                                className="px-2.5 py-1 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-medium text-[11px] inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Remove User"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{deletingUserId === u.id ? 'Removing...' : 'Remove'}</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Managed by Primary</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Create New User Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    placeholder="e.g.Selamawit Tadesse"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. selam"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Access Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as 'admin' | 'super_admin' })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900 font-medium"
                  >
                    <option value="admin">Standard Admin / Staff</option>
                    <option value="super_admin">Co-Administrator</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Work Email *</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="staff@company.com"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-semibold text-slate-700">Initial Password *</label>
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="text-slate-500 hover:text-slate-800 flex items-center gap-1 text-[11px]"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showNewPassword ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Min 12 chars (Upper, lower, digit, symbol)"
                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                  />
                </div>
                {formData.password.length > 0 && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1 text-[10px] bg-slate-50 p-2 rounded border border-slate-200">
                    <span className={pwStrength.minLength ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {pwStrength.minLength ? '✓' : '○'} 12+ characters
                    </span>
                    <span className={pwStrength.hasUpper ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {pwStrength.hasUpper ? '✓' : '○'} Uppercase
                    </span>
                    <span className={pwStrength.hasLower ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {pwStrength.hasLower ? '✓' : '○'} Lowercase
                    </span>
                    <span className={pwStrength.hasDigit ? 'text-emerald-600 font-medium' : 'text-slate-400'}>
                      {pwStrength.hasDigit ? '✓' : '○'} Number / Symbol
                    </span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !pwStrength.isValid}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {creating ? 'Creating User...' : 'Create User Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Set Password for {resetTargetUser.fullName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setResetTargetUser(null)}
                className="text-slate-400 hover:text-slate-700 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetUserPassword} className="space-y-3.5">
              <p className="text-slate-600">
                Assign a new password for <span className="font-mono font-semibold">{resetTargetUser.username}</span>.
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  New Password (min 12 chars, OWASP standard) *
                </label>
                <input
                  type="text"
                  required
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Enter new strong password"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetSaving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold disabled:opacity-50"
                >
                  {resetSaving ? 'Saving...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
