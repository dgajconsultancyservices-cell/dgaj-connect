'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, X, Edit2, Save, Trash2, Phone, Mail, User, FileText, ChevronDown, Layers, MapPin, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface ClientOrg {
  id: string;
  name: string;
  gst_number: string | null;
  pan_number: string | null;
  address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  created_at: string;
}

interface Subsidiary {
  id: string;
  name: string;
  code: string | null;
  firm_type: string | null;
  gst_number: string | null;
  pan_number: string | null;
  address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
}

interface ClientOrganisationsProps {
  /** Omit when shown as a full page (no close button). */
  onClose?: () => void;
  /** 'modal' (default) floats over the task board; 'page' fills the screen on the Clients page. */
  variant?: 'modal' | 'page';
  /** Called after any add, edit or delete so the task form can refresh its list. */
  onOrgAdded?: () => void;
  /** Directors and managers can add, edit or delete clients. Everyone else sees the lists read-only. */
  canManage: boolean;
}

const GST_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const emptyForm = {
  name: '',
  gst_number: '',
  pan_number: '',
  address: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  notes: '',
};

/** Returns an error message, or null if the client form is valid. */
function validateClient(f: typeof emptyForm): string | null {
  if (!f.name.trim()) return 'Client name is required';
  // Everything else is optional; format is only checked when a value is entered.
  if (f.gst_number.trim() && !GST_RE.test(f.gst_number.trim().toUpperCase())) return 'GST number is not in a valid format (15 characters)';
  if (f.pan_number.trim() && !PAN_RE.test(f.pan_number.trim().toUpperCase())) return 'PAN is not in a valid format (10 characters)';
  if (f.contact_phone.trim() && f.contact_phone.replace(/\D/g, '').length < 10) return 'Contact number must have at least 10 digits';
  return null;
}

export default function ClientOrganisations({ onClose, onOrgAdded, canManage, variant = 'modal' }: ClientOrganisationsProps) {
  const isPage = variant === 'page';
  const [orgs, setOrgs] = useState<ClientOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<ClientOrg | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [subs, setSubs] = useState<Subsidiary[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [subsNote, setSubsNote] = useState<string | null>(null);

  // Both panels open by default; either can be collapsed.
  const [subsOpen, setSubsOpen] = useState(true);
  const [clientsOpen, setClientsOpen] = useState(true);
  const { user, effectiveUserId } = useAuth();
  const supabase = createClient();

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_organisations')
        .select('id, name, gst_number, pan_number, address, contact_person, contact_phone, contact_email, notes, created_at')
        .order('name', { ascending: true });
      if (error) throw error;
      setOrgs((data as ClientOrg[]) || []);
    } catch (err) {
      toast.error('Failed to load clients');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubs = useCallback(async () => {
    if (!effectiveUserId) { setSubsLoading(false); return; }
    setSubsLoading(true);
    setSubsNote(null);
    try {
      // The user's own firm is always included, even if the visibility rule returns nothing.
      const [{ data: profile }, { data: ids, error: rpcErr }] = await Promise.all([
        supabase.from('user_profiles').select('firm_id').eq('id', effectiveUserId).maybeSingle(),
        supabase.rpc('get_visible_firm_ids', { p_user_id: effectiveUserId, p_module: 'all' }),
      ]);
      if (rpcErr) throw rpcErr;
      const firmIds = new Set<string>((ids as string[] | null) || []);
      if (profile?.firm_id) firmIds.add(profile.firm_id as string);
      if (firmIds.size === 0) {
        setSubs([]);
        setSubsNote('Your account is not linked to a firm yet. Ask a director to set your firm in User Management.');
        return;
      }
      const { data, error } = await supabase
        .from('firms')
        .select('id, name, code, firm_type, gst_number, pan_number, address, contact_person, contact_phone')
        .in('id', Array.from(firmIds))
        .eq('firm_type', 'subsidiary')
        .order('name', { ascending: true });
      if (error) throw error;
      setSubs((data as Subsidiary[]) || []);
    } catch (err: any) {
      setSubs([]);
      setSubsNote(`Could not load subsidiaries${err?.message ? `: ${err.message}` : ''}`);
    } finally {
      setSubsLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);
  useEffect(() => { fetchSubs(); }, [fetchSubs]);

  // ── Clients ──
  const handleSave = async () => {
    if (!canManage) { toast.error('Only directors and managers can change clients'); return; }
    const err = validateClient(form);
    if (err) { toast.error(err); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      gst_number: form.gst_number.trim().toUpperCase() || null,
      pan_number: form.pan_number.trim().toUpperCase() || null,
      address: form.address.trim() || null,
      contact_person: form.contact_person.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      contact_email: form.contact_email.trim() || null,
      notes: form.notes.trim() || null,
    };
    try {
      if (editingOrg) {
        const { error } = await supabase
          .from('client_organisations')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingOrg.id);
        if (error) throw error;
        toast.success('Client updated');
      } else {
        const { error } = await supabase
          .from('client_organisations')
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
        toast.success('Client added');
      }
      setForm(emptyForm);
      setShowForm(false);
      setEditingOrg(null);
      await fetchOrgs();
      onOrgAdded?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save client');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (org: ClientOrg) => {
    setEditingOrg(org);
    setForm({
      name: org.name,
      gst_number: org.gst_number || '',
      pan_number: org.pan_number || '',
      address: org.address || '',
      contact_person: org.contact_person || '',
      contact_phone: org.contact_phone || '',
      contact_email: org.contact_email || '',
      notes: org.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (org: ClientOrg) => {
    if (!canManage) return;
    if (!window.confirm(`Remove client "${org.name}"? Tasks linked to it keep their name but lose the link.`)) return;
    try {
      const { error } = await supabase.from('client_organisations').delete().eq('id', org.id);
      if (error) throw error;
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
      toast.success('Client removed');
      onOrgAdded?.();
    } catch {
      toast.error('Failed to remove client');
    }
  };

  const handleCancel = () => {
    setForm(emptyForm);
    setEditingOrg(null);
    setShowForm(false);
  };

  const Detail = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) =>
    value ? (
      <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
        {icon}<span className="text-slate-400 dark:text-slate-500">{label}:</span><span className="truncate">{value}</span>
      </span>
    ) : null;

  const sectionHeader = (title: string, count: number, open: boolean, onToggle: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="w-full flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200 dark:border-slate-700 text-left"
    >
      <span className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-sm font-700 text-slate-900 dark:text-slate-100 truncate">{title}</span>
        <span className="text-[11px] font-600 text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">{count}</span>
      </span>
      <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`} />
    </button>
  );

  const field = (label: string, required: boolean) => (
    <label className="block text-xs font-600 text-slate-700 dark:text-slate-300 mb-1">
      {label}{required && ' *'}
    </label>
  );

  return (
    <div className={isPage ? 'w-full' : 'fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4'}>
      <div className={isPage
        ? 'bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card w-full flex flex-col'
        : 'bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col'}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-blue-600" />
            <h3 className="text-base font-700 text-slate-900 dark:text-slate-100">Clients</h3>
          </div>
          <div className="flex items-center gap-2">
            {canManage && !showForm && (
              <button
                onClick={() => { setEditingOrg(null); setForm(emptyForm); setShowForm(true); }}
                className="flex items-center gap-1.5 text-xs font-600 text-blue-600 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus size={13} />Add Client
              </button>
            )}
            {onClose && (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            )}
          </div>
        </div>

        <div className={`${isPage ? '' : 'flex-1 overflow-y-auto '}p-4 grid grid-cols-1 md:grid-cols-2 gap-4 items-start`}>
          {/* ── My Subsidiaries ── */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {sectionHeader('My Subsidiaries', subs.length, subsOpen, () => setSubsOpen((v) => !v),
              <Layers size={15} className="text-violet-600 flex-shrink-0" />)}
            {subsOpen && (
              <div className="p-3 space-y-2">
                {subsLoading ? (
                  <div className="py-8 text-center">
                    <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full mx-auto" />
                  </div>
                ) : subs.length === 0 ? (
                  <p className="py-6 px-3 text-center text-xs text-slate-400 dark:text-slate-500">{subsNote || 'No subsidiaries visible to you'}</p>
                ) : (
                  subs.map((f) => (
                    <div key={f.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
                        <Layers size={15} className="text-violet-600 dark:text-violet-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-700 text-slate-900 dark:text-slate-100 truncate">
                          {f.name}{f.code && <span className="text-[11px] font-400 text-slate-400 ml-1.5">{f.code}</span>}
                        </p>
                        <div className="flex flex-col gap-0.5 mt-0.5">
                          <Detail icon={<Hash size={10} />} label="GST" value={f.gst_number} />
                          <Detail icon={<Hash size={10} />} label="PAN" value={f.pan_number} />
                          <Detail icon={<MapPin size={10} />} label="Address" value={f.address} />
                          <Detail icon={<User size={10} />} label="Contact" value={f.contact_person} />
                          <Detail icon={<Phone size={10} />} label="Number" value={f.contact_phone} />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          {/* ── My Clients ── */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {sectionHeader('My Clients', orgs.length, clientsOpen, () => setClientsOpen((v) => !v),
              <Building2 size={15} className="text-blue-600 flex-shrink-0" />)}
            {clientsOpen && (
              <div>
                {/* Add / Edit form */}
                {canManage && showForm && (
                  <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-700 bg-blue-50/40 dark:bg-blue-900/10">
                    <h4 className="text-xs font-700 text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-3">
                      {editingOrg ? 'Edit Client' : 'New Client'}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        {field('Client Name', true)}
                        <div className="relative">
                          <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input type="text" placeholder="e.g. Acme Petroleum Ltd." value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })} className="input-field pl-8" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          {field('GST', true)}
                          <div className="relative">
                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" maxLength={15} placeholder="22AAAAA0000A1Z5" value={form.gst_number}
                              onChange={(e) => setForm({ ...form, gst_number: e.target.value.toUpperCase() })} className="input-field pl-8" />
                          </div>
                        </div>
                        <div>
                          {field('PAN', true)}
                          <div className="relative">
                            <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" maxLength={10} placeholder="AAAAA0000A" value={form.pan_number}
                              onChange={(e) => setForm({ ...form, pan_number: e.target.value.toUpperCase() })} className="input-field pl-8" />
                          </div>
                        </div>
                      </div>
                      <div>
                        {field('Address', true)}
                        <div className="relative">
                          <MapPin size={14} className="absolute left-3 top-3 text-slate-400" />
                          <textarea rows={2} placeholder="Full registered address" value={form.address}
                            onChange={(e) => setForm({ ...form, address: e.target.value })} className="input-field pl-8 resize-none" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          {field('Contact Person', true)}
                          <div className="relative">
                            <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Name" value={form.contact_person}
                              onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="input-field pl-8" />
                          </div>
                        </div>
                        <div>
                          {field('Contact Number', true)}
                          <div className="relative">
                            <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="tel" placeholder="+91 …" value={form.contact_phone}
                              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} className="input-field pl-8" />
                          </div>
                        </div>
                      </div>
                      <div>
                        {field('Email', false)}
                        <div className="relative">
                          <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input type="email" placeholder="contact@client.com" value={form.contact_email}
                            onChange={(e) => setForm({ ...form, contact_email: e.target.value })} className="input-field pl-8" />
                        </div>
                      </div>
                      <div>
                        {field('Notes', false)}
                        <div className="relative">
                          <FileText size={14} className="absolute left-3 top-3 text-slate-400" />
                          <textarea placeholder="Any additional notes…" value={form.notes} rows={2}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input-field pl-8 resize-none" />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={handleCancel} className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm font-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleSave} disabled={saving} className="flex-1 btn-primary py-2 disabled:opacity-50">
                          <Save size={14} />{saving ? 'Saving…' : editingOrg ? 'Update' : 'Add Client'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Clients list */}
                <div className="p-3">
                  {loading ? (
                    <div className="py-10 text-center">
                      <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
                    </div>
                  ) : orgs.length === 0 ? (
                    <div className="py-8 text-center">
                      <Building2 size={28} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No clients yet</p>
                      {canManage && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Use “Add Client” to add one</p>}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {orgs.map((org) => (
                        <div key={org.id} className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-700/40 rounded-xl border border-slate-200 dark:border-slate-600">
                          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                            <Building2 size={15} className="text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-700 text-slate-900 dark:text-slate-100 truncate">{org.name}</p>
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <Detail icon={<Hash size={10} />} label="GST" value={org.gst_number} />
                              <Detail icon={<Hash size={10} />} label="PAN" value={org.pan_number} />
                              <Detail icon={<MapPin size={10} />} label="Address" value={org.address} />
                              <Detail icon={<User size={10} />} label="Contact" value={org.contact_person} />
                              <Detail icon={<Phone size={10} />} label="Number" value={org.contact_phone} />
                              <Detail icon={<Mail size={10} />} label="Email" value={org.contact_email} />
                            </div>
                            {org.notes && <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">{org.notes}</p>}
                          </div>
                          {canManage && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => handleEdit(org)} aria-label="Edit client"
                                className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-400 hover:text-blue-600 transition-colors">
                                <Edit2 size={13} />
                              </button>
                              <button onClick={() => handleDelete(org)} aria-label="Remove client"
                                className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
