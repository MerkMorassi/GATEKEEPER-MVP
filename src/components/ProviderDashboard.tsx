import React, { useState, useEffect, useRef } from 'react';
import { Settings, CheckCircle2, RefreshCw, Power, Mail, Video, QrCode, Copy, Trash2, Plus, Clock, AlertCircle, Check, Download, ExternalLink, X, Edit3, Filter, ArrowUpDown, Search } from 'lucide-react';
import QRCode from 'qrcode';
import { ProviderConfig, Order, Gate, ServiceDefinition } from '../types';

export const ProviderDashboard: React.FC = () => {
  const [provider, setProvider] = useState<ProviderConfig | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string, type: 'info' | 'error' } | null>(null);

  // Gate management state
  const [newGateCustomName, setNewGateCustomName] = useState('');
  const [newGatePromotionType, setNewGatePromotionType] = useState('Free Consultation');
  const [newGateTargetServiceId, setNewGateTargetServiceId] = useState('');
  const [newGateServiceDescription, setNewGateServiceDescription] = useState('');
  const [newGateExpiryDate, setNewGateExpiryDate] = useState('');
  const [newGateCustomGreeting, setNewGateCustomGreeting] = useState('');
  const [showGateMetadataForm, setShowGateMetadataForm] = useState(false);

  // Gate Filtering & Sorting State
  const [gateFilter, setGateFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [gateSortBy, setGateSortBy] = useState<'created_desc' | 'created_asc' | 'expiry_asc' | 'expiry_desc' | 'name_asc'>('created_desc');
  const [gateSearchQuery, setGateSearchQuery] = useState('');

  // Editing Gate State
  const [editingGateId, setEditingGateId] = useState<string | null>(null);
  const [editingGateName, setEditingGateName] = useState('');
  const [editingGatePromotionType, setEditingGatePromotionType] = useState('');
  const [editingGateTargetServiceId, setEditingGateTargetServiceId] = useState('');
  const [editingGateServiceDescription, setEditingGateServiceDescription] = useState('');
  const [editingGateExpiryDate, setEditingGateExpiryDate] = useState('');
  const [editingGateCustomGreeting, setEditingGateCustomGreeting] = useState('');
  const [deletingGateId, setDeletingGateId] = useState<string | null>(null);

  // Field level status indicators
  const [fieldStatuses, setFieldStatuses] = useState<Record<string, 'idle' | 'dirty' | 'saving' | 'saved' | 'error'>>({});

  // Asynchronous action states
  const [togglingActive, setTogglingActive] = useState(false);
  const [generatingGate, setGeneratingGate] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  // QR Code Modal State
  const [qrModalData, setQrModalData] = useState<{
    title: string;
    subtitle: string;
    qrDataUrl: string;
    directUrl: string;
    feeText?: string;
    gateDetails?: Gate;
  } | null>(null);

  // Form fields
  const [payoutEmail, setPayoutEmail] = useState('');
  const [facetimeHandle, setFacetimeHandle] = useState('');
  const [active, setActive] = useState(true);
  const [services, setServices] = useState<ServiceDefinition[]>([]);

  // Timer ref for debounced auto-save
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/provider/overview');
      const data = await res.json();
      if (data.success && data.overview) {
        setProvider(data.overview.provider);
        setOrders(data.overview.orders);
        setGates(data.overview.gates);
        
        setPayoutEmail(data.overview.provider.payoutEmail || '');
        setFacetimeHandle(data.overview.provider.facetimeHandle || '');
        setActive(data.overview.provider.active);
        setServices(data.overview.provider.services || []);
      } else {
        setMessage({ text: data.error || 'Failed to load Provider dashboard data', type: 'error' });
      }
    } catch (err) {
      console.error('Failed to load Provider dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Centralized Asynchronous Config Update with Field Status Feedback
  const saveConfigAsync = async (
    payload: { payoutEmail?: string; facetimeHandle?: string; active?: boolean; services?: ServiceDefinition[] },
    fieldKey?: string
  ) => {
    if (fieldKey) {
      setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'saving' }));
    }
    setSaveStatus('saving');

    try {
      const res = await fetch('/api/provider/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setProvider(data.provider);
        const nowTime = new Date().toLocaleTimeString();
        setLastSavedTime(nowTime);
        setSaveStatus('saved');

        if (fieldKey) {
          setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'saved' }));
          setTimeout(() => {
            setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'idle' }));
          }, 2500);
        }

        setTimeout(() => {
          setSaveStatus('idle');
        }, 3000);
      } else {
        setSaveStatus('error');
        if (fieldKey) {
          setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'error' }));
        }
        setMessage({ text: 'Error saving settings: ' + data.error, type: 'error' });
      }
    } catch (err: any) {
      setSaveStatus('error');
      if (fieldKey) {
        setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'error' }));
      }
      setMessage({ text: 'Connection error during save: ' + err.message, type: 'error' });
    }
  };

  // Debounced field updates
  const triggerDebouncedSave = (fieldKey: string, payload: any) => {
    setFieldStatuses(prev => ({ ...prev, [fieldKey]: 'dirty' }));
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveConfigAsync(payload, fieldKey);
    }, 900);
  };

  const handlePayoutEmailChange = (val: string) => {
    setPayoutEmail(val);
    triggerDebouncedSave('payoutEmail', { payoutEmail: val, facetimeHandle, active, services });
  };

  const handleFacetimeHandleChange = (val: string) => {
    setFacetimeHandle(val);
    triggerDebouncedSave('facetimeHandle', { payoutEmail, facetimeHandle: val, active, services });
  };

  const handleSaveConfigManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    setSaving(true);
    setMessage(null);

    await saveConfigAsync({ payoutEmail, facetimeHandle, active, services });
    setSaving(false);
  };

  const toggleActiveStatus = async () => {
    const nextActive = !active;
    setActive(nextActive);
    setTogglingActive(true);

    try {
      const res = await fetch('/api/provider/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = await res.json();
      if (data.success) {
        setGateNotice(`Gate status updated to ${nextActive ? 'ONLINE' : 'OFFLINE'} ✓`);
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTogglingActive(false);
    }
  };

  const handleGenerateGate = async (customName?: string) => {
    setGeneratingGate(true);
    const nameToUse = customName || newGateCustomName.trim() || `Marketing Link ${gates.length + 1}`;
    try {
      const res = await fetch('/api/gates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameToUse,
          promotionType: newGatePromotionType || undefined,
          targetServiceId: newGateTargetServiceId || undefined,
          serviceDescription: newGateServiceDescription || undefined,
          expiryDate: newGateExpiryDate || undefined,
          customGreeting: newGateCustomGreeting || undefined,
        })
      });
      const data = await res.json();
      if (data.success) {
        setNewGateCustomName('');
        setNewGateServiceDescription('');
        setNewGateExpiryDate('');
        setNewGateCustomGreeting('');
        setNewGateTargetServiceId('');
        setShowGateMetadataForm(false);
        setGateNotice(`New marketing gate "${nameToUse}" generated ✓`);
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      } else {
        setMessage({ text: data.error, type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error generating gate: ' + err.message, type: 'error' });
    } finally {
      setGeneratingGate(false);
    }
  };

  const handleUpdateGateMetadata = async (id: string) => {
    try {
      const res = await fetch(`/api/gates/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingGateName.trim(),
          promotionType: editingGatePromotionType || undefined,
          targetServiceId: editingGateTargetServiceId || undefined,
          serviceDescription: editingGateServiceDescription || undefined,
          expiryDate: editingGateExpiryDate || undefined,
          customGreeting: editingGateCustomGreeting || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingGateId(null);
        setGateNotice('Marketing Gate metadata updated ✓');
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      } else {
        setMessage({ text: data.error || 'Failed to update gate metadata', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error updating gate: ' + err.message, type: 'error' });
    }
  };

  const handleToggleGateActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/gates/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        setGateNotice(`Gate status updated to ${!currentActive ? 'Active' : 'Inactive'} ✓`);
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      } else {
        setMessage({ text: data.error || 'Failed to update gate status', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error updating gate: ' + err.message, type: 'error' });
    }
  };

  const handleUpdateGateName = async (id: string) => {
    if (!editingGateName.trim()) return;
    try {
      const res = await fetch(`/api/gates/${id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingGateName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setEditingGateId(null);
        setEditingGateName('');
        setGateNotice('Marketing gate renamed ✓');
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      } else {
        setMessage({ text: data.error || 'Failed to rename gate', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: 'Error renaming gate: ' + err.message, type: 'error' });
    }
  };

  const handleDeleteGate = async (id: string, gateName: string) => {
    // Immediate optimistic state update
    setGates(prev => prev.filter(g => g.id !== id));
    setDeletingGateId(null);

    try {
      // Attempt DELETE endpoint first, with fallback to POST /delete
      let res = await fetch(`/api/gates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        res = await fetch(`/api/gates/${id}/delete`, { method: 'POST' });
      }
      const data = await res.json();
      if (data.success) {
        setGateNotice(`Marketing gate "${gateName}" deleted ✓`);
        setTimeout(() => setGateNotice(null), 3000);
        fetchData();
      } else {
        setMessage({ text: data.error || 'Failed to delete marketing gate', type: 'error' });
        fetchData(); // Rollback if failed
      }
    } catch (err: any) {
      setMessage({ text: 'Error deleting gate: ' + err.message, type: 'error' });
      fetchData(); // Rollback on error
    }
  };

  const updateService = (index: number, updates: Partial<ServiceDefinition>) => {
    const newServices = [...services];
    newServices[index] = { ...newServices[index], ...updates };
    setServices(newServices);
    triggerDebouncedSave(`service_${index}`, { payoutEmail, facetimeHandle, active, services: newServices });
  };

  const addService = () => {
    if (services.length >= 3) return;
    const newServices = [
      ...services, 
      { id: `srv_${Date.now()}`, name: 'New Service', description: 'Description', feeCents: 10000, currency: 'USD' }
    ];
    setServices(newServices);
    saveConfigAsync({ payoutEmail, facetimeHandle, active, services: newServices }, 'services');
  };

  const removeService = (index: number) => {
    if (services.length <= 1) return;
    const newServices = [...services];
    newServices.splice(index, 1);
    setServices(newServices);
    saveConfigAsync({ payoutEmail, facetimeHandle, active, services: newServices }, 'services');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setGateNotice('Gate URL copied to clipboard ✓');
    setTimeout(() => setGateNotice(null), 3000);
  };

  const handleGenerateServiceQr = async (svc: ServiceDefinition) => {
    const directUrl = `${window.location.origin}/#service=${svc.id}`;
    const qrDataUrl = await QRCode.toDataURL(directUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#111827', light: '#FFFFFF' }
    });
    setQrModalData({
      title: svc.name,
      subtitle: svc.description,
      feeText: `$${(svc.feeCents / 100).toFixed(2)} ${svc.currency}`,
      qrDataUrl,
      directUrl
    });
  };

  const handleGenerateGateQr = async (gate: Gate) => {
    const directUrl = `${window.location.origin}/#gate=${gate.token}`;
    const qrDataUrl = await QRCode.toDataURL(directUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#111827', light: '#FFFFFF' }
    });
    const targetSvc = services.find(s => s.id === gate.targetServiceId);
    setQrModalData({
      title: gate.name || 'Marketing Access Gate',
      subtitle: gate.promotionType ? `[${gate.promotionType}]` : `Gate ID: ${gate.id}`,
      feeText: targetSvc ? (targetSvc.feeCents === 0 ? 'Complimentary ($0.00)' : `$${(targetSvc.feeCents / 100).toFixed(2)} USD`) : undefined,
      qrDataUrl,
      directUrl,
      gateDetails: gate,
    });
  };

  const handleDownloadQr = () => {
    if (!qrModalData) return;
    const a = document.createElement('a');
    a.href = qrModalData.qrDataUrl;
    a.download = `gatekeeper-qr-${qrModalData.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const renderFieldStatusBadge = (fieldKey: string) => {
    const status = fieldStatuses[fieldKey];
    if (status === 'dirty') {
      return (
        <span className="text-[10px] font-mono text-warning-a0 bg-warning-a0/10 px-2 py-0.5 rounded border border-warning-a0/20 flex items-center space-x-1 animate-pulse">
          <Clock className="w-3 h-3" />
          <span>Unsaved...</span>
        </span>
      );
    }
    if (status === 'saving') {
      return (
        <span className="text-[10px] font-mono text-info-a0 bg-info-a0/10 px-2 py-0.5 rounded border border-info-a0/20 flex items-center space-x-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          <span>Updating...</span>
        </span>
      );
    }
    if (status === 'saved') {
      return (
        <span className="text-[10px] font-mono text-success-a0 bg-success-a0/10 px-2 py-0.5 rounded border border-success-a0/30 flex items-center space-x-1">
          <Check className="w-3 h-3" />
          <span>Saved ✓</span>
        </span>
      );
    }
    if (status === 'error') {
      return (
        <span className="text-[10px] font-mono text-danger-a0 bg-danger-a0/10 px-2 py-0.5 rounded border border-danger-a0/20 flex items-center space-x-1">
          <AlertCircle className="w-3 h-3" />
          <span>Save Error</span>
        </span>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-surface-a40">
        <RefreshCw className="w-6 h-6 animate-spin text-info-a0 mb-2" />
        <p className="text-xs font-mono">Loading Provider Infrastructure View...</p>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-surface-a40">
        <p className="text-sm font-mono text-danger-a0 mb-2">Access Denied</p>
        <p className="text-xs font-mono max-w-md text-center">{message?.text || 'You do not have permission to view this console. Ensure you are logged in as the Provider.'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-surface-a10 gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono uppercase tracking-widest text-surface-a40 font-semibold">
              Provider Operations Console
            </span>

            {/* Global Settings Status Indicator */}
            {saveStatus === 'saving' && (
              <span className="text-[10px] font-mono text-info-a0 bg-info-a0/10 border border-info-a0/20 px-2 py-0.5 rounded-full flex items-center space-x-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Saving async...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="text-[10px] font-mono text-success-a0 bg-success-a0/10 border border-success-a0/30 px-2 py-0.5 rounded-full flex items-center space-x-1">
                <Check className="w-3 h-3" />
                <span>Settings updated ✓ ({lastSavedTime})</span>
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold text-theme-light mt-1">{provider.name}</h1>
          <p className="text-xs text-surface-a40 mt-0.5">
            Operational Dashboard
          </p>
        </div>

        {/* Active Toggle */}
        <div className="flex items-center space-x-3 bg-surface-a0 border border-surface-a10 p-2.5 rounded-xl">
          <div className="text-right">
            <span className="text-xs font-medium text-theme-light block">Gate Status</span>
            <span className={`text-[10px] font-mono ${active ? 'text-success-a0' : 'text-danger-a0'}`}>
              {active ? 'ONLINE (Accepting Payments)' : 'OFFLINE (Gate Closed)'}
            </span>
          </div>

          <button
            onClick={toggleActiveStatus}
            disabled={togglingActive}
            className={`p-2.5 rounded-lg border transition-all flex items-center justify-center ${
              active
                ? 'bg-success-a0/10 border-success-a0/30 text-success-a0 hover:bg-success-a0/20'
                : 'bg-danger-a0/10 border-danger-a0/30 text-danger-a0 hover:bg-danger-a0/20'
            }`}
            title="Toggle Gate Active Status"
          >
            {togglingActive ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Power className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {gateNotice && (
        <div className="bg-success-a0/10 border border-success-a0/30 p-3 rounded-xl text-xs text-success-a0 flex items-center space-x-2 font-mono">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{gateNotice}</span>
        </div>
      )}

      {message && (
        <div className={`bg-surface-a0 border p-4 rounded-xl text-xs flex items-center space-x-2 ${
          message.type === 'error' ? 'border-danger-a0/30 text-danger-a0' : 'border-info-a0/30 text-info-a0'
        }`}>
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Configuration Section */}
      <form onSubmit={handleSaveConfigManual} className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-surface-a10">
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-info-a0" />
            <h2 className="text-base font-semibold text-theme-light">Provider Settings & Delivery Specs</h2>
          </div>
          
          <div className="text-[10px] text-surface-a40 font-mono">
            Auto-saves asynchronously on change
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-theme-light uppercase flex items-center space-x-1.5">
                <Mail className="w-3.5 h-3.5 text-info-a0" />
                <span>PayPal Payout Email</span>
              </label>
              {renderFieldStatusBadge('payoutEmail')}
            </div>
            <input
              type="email"
              value={payoutEmail}
              onChange={(e) => handlePayoutEmailChange(e.target.value)}
              required
              className="w-full bg-tonal-a0 border border-surface-a10 rounded-xl px-4 py-2.5 text-xs font-mono text-theme-light focus:outline-none focus:border-info-a0 transition-all"
              placeholder="merk.payouts@merkmorassi.com"
            />
            <p className="text-[10px] text-surface-a40">Destination address for automated 85% settlement payouts.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-theme-light uppercase flex items-center space-x-1.5">
                <Video className="w-3.5 h-3.5 text-info-a0" />
                <span>FaceTime ID / Handle</span>
              </label>
              {renderFieldStatusBadge('facetimeHandle')}
            </div>
            <input
              type="text"
              value={facetimeHandle}
              onChange={(e) => handleFacetimeHandleChange(e.target.value)}
              required
              className="w-full bg-tonal-a0 border border-surface-a10 rounded-xl px-4 py-2.5 text-xs font-mono text-theme-light focus:outline-none focus:border-info-a0 transition-all"
              placeholder="merk@merkmorassi.com"
            />
            <p className="text-[10px] text-surface-a40">Released to Client only after verified single-use redemption.</p>
          </div>
        </div>

        {/* Services Configuration */}
        <div className="pt-6 border-t border-surface-a10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-semibold text-theme-light">Active Services (1-3)</h3>
              {renderFieldStatusBadge('services')}
            </div>

            {services.length < 3 && (
              <button
                type="button"
                onClick={addService}
                className="px-3 py-1 bg-surface-a10 hover:bg-surface-a20 text-theme-light text-[10px] font-bold rounded flex items-center space-x-1 transition-all"
              >
                <Plus className="w-3 h-3" />
                <span>Add Service</span>
              </button>
            )}
          </div>
          
          <div className="space-y-4">
            {services.map((svc, idx) => (
              <div key={idx} className="p-4 bg-tonal-a0 border border-surface-a10 rounded-xl relative space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-surface-a10/50">
                  <span className="text-[10px] font-mono text-info-a0 font-semibold uppercase">
                    Service Tier #{idx + 1}
                  </span>
                  <div className="flex items-center space-x-2">
                    {renderFieldStatusBadge(`service_${idx}`)}
                    {services.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeService(idx)}
                        className="text-surface-a40 hover:text-danger-a0 p-1"
                        title="Remove Service"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-surface-a40 uppercase">Service Name</label>
                    <input
                      type="text"
                      value={svc.name}
                      onChange={(e) => updateService(idx, { name: e.target.value })}
                      required
                      className="w-full bg-surface-a0 border border-surface-a10 rounded px-3 py-2 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-surface-a40 uppercase">Fee (USD Cents)</label>
                    <input
                      type="number"
                      value={svc.feeCents}
                      onChange={(e) => updateService(idx, { feeCents: Number(e.target.value) })}
                      required
                      min="100"
                      className="w-full bg-surface-a0 border border-surface-a10 rounded px-3 py-2 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                    />
                    <p className="text-[9px] text-surface-a50 mt-1">Provider receives ${(svc.feeCents * 0.85 / 100).toFixed(2)}</p>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] font-mono text-surface-a40 uppercase">Description</label>
                    <input
                      type="text"
                      value={svc.description}
                      onChange={(e) => updateService(idx, { description: e.target.value })}
                      required
                      className="w-full bg-surface-a0 border border-surface-a10 rounded px-3 py-2 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                    />
                  </div>
                </div>

                {/* QR Code Issuer Action */}
                <div className="pt-2 border-t border-surface-a10/40 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleGenerateServiceQr(svc)}
                    className="px-3 py-1.5 bg-info-a0/10 hover:bg-info-a0/20 border border-info-a0/30 text-info-a0 text-xs font-mono font-bold rounded-lg transition-all flex items-center space-x-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>Issue QR Code for Tier #{idx + 1}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-4 border-t border-surface-a10 flex items-center justify-between">
          <div className="text-[10px] font-mono text-surface-a40">
            {lastSavedTime ? `Last async sync: ${lastSavedTime}` : 'All changes save asynchronously'}
          </div>

          <button
            type="submit"
            disabled={saving || saveStatus === 'saving'}
            className="px-6 py-2.5 bg-info-a0 hover:bg-info-a10 text-primary-a0 text-xs font-bold rounded-xl shadow-md transition-all flex items-center space-x-2 disabled:opacity-50"
          >
            {saving || saveStatus === 'saving' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>Save All Configuration Now</span>
          </button>
        </div>
      </form>

      {/* Gates Management (Full CRUD + Metadata Embedding) */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-surface-a10 gap-2">
          <h2 className="text-sm font-semibold text-theme-light flex items-center space-x-2">
            <QrCode className="w-4 h-4 text-info-a0" />
            <span>Marketing Gates (Client Entry Links & QR Codes)</span>
          </h2>
          <span className="text-[10px] font-mono text-surface-a40">
            {gates.length} Gate{gates.length !== 1 ? 's' : ''} Configured
          </span>
        </div>

        {/* Create Gate Form with Metadata Controls */}
        <div className="bg-tonal-a0 p-4 rounded-xl border border-surface-a10/80 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newGateCustomName}
              onChange={(e) => setNewGateCustomName(e.target.value)}
              placeholder={`Campaign Name (e.g., "Instagram Alignment Offer")...`}
              className="flex-1 bg-surface-a0 border border-surface-a10 rounded-xl px-3.5 py-2 text-xs font-mono text-theme-light focus:outline-none focus:border-info-a0"
            />
            
            <button
              type="button"
              onClick={() => setShowGateMetadataForm(!showGateMetadataForm)}
              className={`px-3 py-2 text-xs font-mono font-bold rounded-xl border transition-all flex items-center justify-center space-x-1.5 ${
                showGateMetadataForm
                  ? 'bg-info-a0/20 text-info-a0 border-info-a0/40'
                  : 'bg-surface-a0 text-surface-a40 border-surface-a10 hover:text-theme-light'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showGateMetadataForm ? 'Hide Metadata Parameters' : 'Add Campaign Metadata'}</span>
            </button>

            <button
              onClick={() => handleGenerateGate()}
              disabled={generatingGate}
              className="px-4 py-2 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 flex-shrink-0"
            >
              {generatingGate ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Generate Marketing Gate</span>
            </button>
          </div>

          {/* Expanded Metadata Inputs */}
          {showGateMetadataForm && (
            <div className="pt-3 border-t border-surface-a10/60 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-mono animate-fadeIn">
              <div className="space-y-1">
                <label className="text-[10px] text-surface-a40 uppercase font-bold">Promotion Type</label>
                <select
                  value={newGatePromotionType}
                  onChange={(e) => setNewGatePromotionType(e.target.value)}
                  className="w-full bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                >
                  <option value="Free Consultation">Free Consultation / Complimentary Pass</option>
                  <option value="Special Promotion">Special Discount / Promotion</option>
                  <option value="Webinar Perk">Webinar Perk / Special Event</option>
                  <option value="VIP Access">VIP Member Access</option>
                  <option value="General Promo">General Marketing Link</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-surface-a40 uppercase font-bold">Target Service Tier</label>
                <select
                  value={newGateTargetServiceId}
                  onChange={(e) => setNewGateTargetServiceId(e.target.value)}
                  className="w-full bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                >
                  <option value="">All Tiers Allowed (Client Selects)</option>
                  {services.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.feeCents === 0 ? 'FREE' : `$${(s.feeCents / 100).toFixed(2)}`})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-surface-a40 uppercase font-bold">Expiry Date</label>
                <input
                  type="date"
                  value={newGateExpiryDate}
                  onChange={(e) => setNewGateExpiryDate(e.target.value)}
                  className="w-full bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                />
              </div>

              <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                <label className="text-[10px] text-surface-a40 uppercase font-bold">Custom Greeting / Headline</label>
                <input
                  type="text"
                  value={newGateCustomGreeting}
                  onChange={(e) => setNewGateCustomGreeting(e.target.value)}
                  placeholder="Welcome! Claim your 1-on-1 Session..."
                  className="w-full bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <label className="text-[10px] text-surface-a40 uppercase font-bold">Service Description / Promotion Notes</label>
                <input
                  type="text"
                  value={newGateServiceDescription}
                  onChange={(e) => setNewGateServiceDescription(e.target.value)}
                  placeholder="Embedded promotion details or terms for this specific campaign..."
                  className="w-full bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-xs text-theme-light focus:outline-none focus:border-info-a0"
                />
              </div>
            </div>
          )}
        </div>

        {/* Filter, Sort & Search Toolbar and List Rendering */}
        {(() => {
          const activeGatesCount = gates.filter(g => !g.expiryDate || new Date(g.expiryDate).getTime() >= Date.now()).length;
          const expiredGatesCount = gates.filter(g => g.expiryDate && new Date(g.expiryDate).getTime() < Date.now()).length;

          const filteredAndSortedGates = gates
            .filter(gate => {
              const isExpired = gate.expiryDate ? new Date(gate.expiryDate).getTime() < Date.now() : false;
              if (gateFilter === 'active' && isExpired) return false;
              if (gateFilter === 'expired' && !isExpired) return false;
              if (gateSearchQuery.trim()) {
                const q = gateSearchQuery.toLowerCase();
                const matchName = (gate.name || '').toLowerCase().includes(q);
                const matchPromo = (gate.promotionType || '').toLowerCase().includes(q);
                const matchGreeting = (gate.customGreeting || '').toLowerCase().includes(q);
                const matchDesc = (gate.serviceDescription || '').toLowerCase().includes(q);
                const matchId = (gate.id || '').toLowerCase().includes(q);
                if (!matchName && !matchPromo && !matchGreeting && !matchDesc && !matchId) return false;
              }
              return true;
            })
            .sort((a, b) => {
              if (gateSortBy === 'created_desc') {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
              }
              if (gateSortBy === 'created_asc') {
                return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              }
              if (gateSortBy === 'expiry_asc') {
                if (!a.expiryDate && !b.expiryDate) return 0;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
              }
              if (gateSortBy === 'expiry_desc') {
                if (!a.expiryDate && !b.expiryDate) return 0;
                if (!a.expiryDate) return 1;
                if (!b.expiryDate) return -1;
                return new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime();
              }
              if (gateSortBy === 'name_asc') {
                return (a.name || a.id).localeCompare(b.name || b.id);
              }
              return 0;
            });

          return (
            <>
              {/* Filter, Sort & Search Toolbar */}
              {gates.length > 0 && (
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 pt-2 pb-1 bg-tonal-a0/60 p-3 rounded-xl border border-surface-a10/60 text-xs font-mono">
                  {/* Filter Pills */}
                  <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] text-surface-a40 font-bold uppercase flex items-center space-x-1 mr-1">
                      <Filter className="w-3 h-3 text-info-a0" />
                      <span>Filter:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setGateFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1 whitespace-nowrap ${
                        gateFilter === 'all'
                          ? 'bg-info-a0/20 text-info-a0 border border-info-a0/40 font-bold'
                          : 'bg-surface-a0 text-surface-a40 border border-surface-a10 hover:text-theme-light'
                      }`}
                    >
                      <span>All ({gates.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGateFilter('active')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1 whitespace-nowrap ${
                        gateFilter === 'active'
                          ? 'bg-success-a0/20 text-success-a0 border border-success-a0/40 font-bold'
                          : 'bg-surface-a0 text-surface-a40 border border-surface-a10 hover:text-theme-light'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Active ({activeGatesCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setGateFilter('expired')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center space-x-1 whitespace-nowrap ${
                        gateFilter === 'expired'
                          ? 'bg-danger-a0/20 text-danger-a0 border border-danger-a0/40 font-bold'
                          : 'bg-surface-a0 text-surface-a40 border border-surface-a10 hover:text-theme-light'
                      }`}
                    >
                      <AlertCircle className="w-3 h-3" />
                      <span>Expired ({expiredGatesCount})</span>
                    </button>
                  </div>

                  {/* Search & Sort Controls */}
                  <div className="flex items-center space-x-2">
                    {/* Search Input */}
                    <div className="relative flex-1 md:w-48">
                      <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-a40" />
                      <input
                        type="text"
                        value={gateSearchQuery}
                        onChange={(e) => setGateSearchQuery(e.target.value)}
                        placeholder="Search gates..."
                        className="w-full bg-surface-a0 border border-surface-a10 rounded-lg pl-7 pr-6 py-1 text-[11px] text-theme-light focus:outline-none focus:border-info-a0 font-mono"
                      />
                      {gateSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setGateSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-a40 hover:text-theme-light"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Sort Select */}
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      <ArrowUpDown className="w-3 h-3 text-info-a0 hidden sm:block" />
                      <select
                        value={gateSortBy}
                        onChange={(e) => setGateSortBy(e.target.value as any)}
                        className="bg-surface-a0 border border-surface-a10 rounded-lg px-2 py-1 text-[11px] text-theme-light focus:outline-none focus:border-info-a0 font-mono"
                      >
                        <option value="created_desc">Newest Created</option>
                        <option value="created_asc">Oldest Created</option>
                        <option value="expiry_asc">Expiry (Soonest)</option>
                        <option value="expiry_desc">Expiry (Furthest)</option>
                        <option value="name_asc">Name (A-Z)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {gates.length === 0 ? (
                <p className="text-xs text-surface-a40 font-mono py-6 text-center bg-tonal-a0/50 rounded-xl border border-surface-a10/50">
                  No marketing gates generated yet. Create one above to issue client entry links.
                </p>
              ) : filteredAndSortedGates.length === 0 ? (
                <div className="text-xs text-surface-a40 font-mono py-6 text-center bg-tonal-a0/50 rounded-xl border border-surface-a10/50 space-y-2">
                  <p>No marketing gates match your current filter or search criteria.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setGateFilter('all');
                      setGateSearchQuery('');
                    }}
                    className="px-3 py-1 bg-surface-a20 hover:bg-surface-a30 text-theme-light rounded-lg text-[11px] font-semibold transition-colors"
                  >
                    Reset Filter & Search
                  </button>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {filteredAndSortedGates.map(gate => {
                    const gateUrl = `${window.location.origin}/#gate=${gate.token}`;
                    const isEditingThisGate = editingGateId === gate.id;
                    const targetSvc = services.find(s => s.id === gate.targetServiceId);
                    const isExpired = gate.expiryDate ? new Date(gate.expiryDate).getTime() < Date.now() : false;

                    return (
                <div key={gate.id} className="animate-fadeIn bg-tonal-a0 p-4 rounded-xl border border-surface-a10 text-xs font-mono space-y-3 transition-all hover:border-surface-a20">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-surface-a10/60">
                    <div className="flex items-center space-x-2 flex-1">
                      <span className="text-theme-light font-bold text-sm">
                        {gate.name || gate.id}
                      </span>
                      
                      {/* Validity Status Badge (Active/Expired based on metadata expiry date) */}
                      {isExpired ? (
                        <span className="text-[10px] font-bold uppercase bg-danger-a0/20 text-danger-a0 border border-danger-a0/40 px-2.5 py-0.5 rounded-full flex items-center space-x-1 shadow-sm">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span>Expired ({gate.expiryDate})</span>
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase bg-success-a0/20 text-success-a0 border border-success-a0/40 px-2.5 py-0.5 rounded-full flex items-center space-x-1 shadow-sm">
                          <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                          <span>{gate.expiryDate ? `Active (Expires ${gate.expiryDate})` : 'Active (No Expiry)'}</span>
                        </span>
                      )}

                      {gate.promotionType && (
                        <span className="text-[9px] font-bold uppercase bg-info-a0/10 text-info-a0 border border-info-a0/30 px-2 py-0.5 rounded-full">
                          {gate.promotionType}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          if (isEditingThisGate) {
                            setEditingGateId(null);
                          } else {
                            setEditingGateId(gate.id);
                            setEditingGateName(gate.name || '');
                            setEditingGatePromotionType(gate.promotionType || 'Free Consultation');
                            setEditingGateTargetServiceId(gate.targetServiceId || '');
                            setEditingGateServiceDescription(gate.serviceDescription || '');
                            setEditingGateExpiryDate(gate.expiryDate || '');
                            setEditingGateCustomGreeting(gate.customGreeting || '');
                          }
                        }}
                        className="px-2 py-1 bg-surface-a10 hover:bg-surface-a20 text-theme-light rounded text-[10px] flex items-center space-x-1"
                        title="Edit Gate Metadata"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isEditingThisGate ? 'Cancel Edit' : 'Edit Metadata'}</span>
                      </button>

                      {/* Active/Inactive Toggle Pill */}
                      <button
                        onClick={() => handleToggleGateActive(gate.id, gate.active)}
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase transition-all flex items-center space-x-1 border ${
                          gate.active
                            ? 'bg-success-a0/10 text-success-a0 border-success-a0/30 hover:bg-success-a0/20'
                            : 'bg-surface-a20 text-surface-a40 border-surface-a30 hover:bg-surface-a30'
                        }`}
                        title="Click to toggle Active status"
                      >
                        <Power className="w-3 h-3" />
                        <span>{gate.active ? 'Active' : 'Inactive'}</span>
                      </button>

                      {/* Delete Gate Action with Inline Confirm */}
                      {deletingGateId === gate.id ? (
                        <div className="flex items-center space-x-1 animate-fadeIn">
                          <button
                            onClick={() => handleDeleteGate(gate.id, gate.name || gate.id)}
                            className="px-2 py-0.5 bg-danger-a0 text-theme-light text-[10px] font-bold rounded hover:bg-danger-a10 transition-colors flex items-center space-x-1"
                            title="Confirm Permanent Deletion"
                          >
                            <span>Delete?</span>
                          </button>
                          <button
                            onClick={() => setDeletingGateId(null)}
                            className="p-1 text-surface-a40 hover:text-theme-light rounded"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingGateId(gate.id)}
                          className="p-1 text-surface-a40 hover:text-danger-a0 hover:bg-danger-a0/10 rounded transition-colors"
                          title="Delete Marketing Gate"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inline Metadata Edit Drawer */}
                  {isEditingThisGate ? (
                    <div className="bg-surface-a0 p-3 rounded-lg border border-info-a0/40 space-y-3 animate-fadeIn">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-surface-a40">Gate Name</label>
                          <input
                            type="text"
                            value={editingGateName}
                            onChange={(e) => setEditingGateName(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-surface-a40">Promotion Type</label>
                          <select
                            value={editingGatePromotionType}
                            onChange={(e) => setEditingGatePromotionType(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          >
                            <option value="Free Consultation">Free Consultation</option>
                            <option value="Special Promotion">Special Promotion</option>
                            <option value="Webinar Perk">Webinar Perk</option>
                            <option value="VIP Access">VIP Access</option>
                            <option value="General Promo">General Promo</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-surface-a40">Target Service Tier</label>
                          <select
                            value={editingGateTargetServiceId}
                            onChange={(e) => setEditingGateTargetServiceId(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          >
                            <option value="">All Tiers Allowed</option>
                            {services.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[9px] uppercase text-surface-a40">Expiry Date</label>
                          <input
                            type="date"
                            value={editingGateExpiryDate}
                            onChange={(e) => setEditingGateExpiryDate(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-2">
                          <label className="text-[9px] uppercase text-surface-a40">Custom Greeting</label>
                          <input
                            type="text"
                            value={editingGateCustomGreeting}
                            onChange={(e) => setEditingGateCustomGreeting(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          />
                        </div>

                        <div className="space-y-1 sm:col-span-3">
                          <label className="text-[9px] uppercase text-surface-a40">Service Description Override</label>
                          <input
                            type="text"
                            value={editingGateServiceDescription}
                            onChange={(e) => setEditingGateServiceDescription(e.target.value)}
                            className="w-full bg-tonal-a0 border border-surface-a10 rounded px-2 py-1 text-xs text-theme-light"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          onClick={() => handleUpdateGateMetadata(gate.id)}
                          className="px-3 py-1 bg-info-a0 text-primary-a0 font-bold rounded text-xs flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Save Metadata</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Metadata Summary Badges */
                    (gate.customGreeting || gate.serviceDescription || targetSvc) && (
                      <div className="bg-surface-a0/80 p-2.5 rounded-lg border border-surface-a10 text-[11px] space-y-1">
                        {targetSvc && (
                          <p className="text-info-a0 font-semibold">
                            Target Tier: {targetSvc.name} ({targetSvc.feeCents === 0 ? 'Complimentary $0' : `$${(targetSvc.feeCents / 100).toFixed(2)}`})
                          </p>
                        )}
                        {gate.customGreeting && (
                          <p className="text-theme-light font-medium">"{gate.customGreeting}"</p>
                        )}
                        {gate.serviceDescription && (
                          <p className="text-surface-a40 italic">{gate.serviceDescription}</p>
                        )}
                      </div>
                    )
                  )}

                  <div className="text-surface-a40 text-[10px] flex items-center justify-between">
                    <span>Gate ID: <code className="text-info-a0">{gate.id}</code></span>
                    <span>Created: {new Date(gate.createdAt).toLocaleString()}</span>
                  </div>

                  {/* URL Payload & Actions */}
                  <div className="flex items-center space-x-2 mt-2 pt-1">
                    <input 
                      readOnly 
                      value={gateUrl} 
                      className="flex-1 bg-surface-a0 border border-surface-a10 rounded-lg px-2.5 py-1.5 text-[10px] text-surface-a50 font-mono truncate"
                    />
                    <button
                      onClick={() => copyToClipboard(gateUrl)}
                      className="px-2.5 py-1.5 bg-info-a0/10 hover:bg-info-a0/20 text-info-a0 border border-info-a0/20 rounded-lg transition-colors flex items-center space-x-1"
                      title="Copy URL"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[10px]">Copy</span>
                    </button>
                    <button
                      onClick={() => handleGenerateGateQr(gate)}
                      className="px-2.5 py-1.5 bg-info-a0/10 hover:bg-info-a0/20 text-info-a0 border border-info-a0/20 rounded-lg transition-colors flex items-center space-x-1"
                      title="Issue QR Code"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[10px]">QR Code</span>
                    </button>
                  </div>
                </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Minimal Transaction Log */}
      <div className="bg-surface-a0 border border-surface-a10 rounded-2xl p-6 shadow-xl space-y-4">
        <h2 className="text-sm font-semibold text-theme-light">Recent Transactions</h2>

        {orders.length === 0 ? (
          <p className="text-xs text-surface-a40 font-mono py-4 text-center">No transactions recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-surface-a10 text-surface-a40 uppercase text-[10px]">
                  <th className="pb-3">Order ID</th>
                  <th className="pb-3">Service</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Gross</th>
                  <th className="pb-3">Provider (85%)</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-a10 text-theme-light">
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 font-mono text-info-a0">{o.id}</td>
                    <td className="py-3 truncate max-w-[120px]">{o.serviceName}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-semibold ${
                        o.status === 'settled' || o.status === 'paid'
                          ? 'bg-success-a0/10 text-success-a0 border border-success-a0/20'
                          : 'bg-warning-a0/10 text-warning-a0 border border-warning-a0/20'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3">${(o.amountCents / 100).toFixed(2)}</td>
                    <td className="py-3 text-success-a0 font-semibold">${((o.amountCents * 0.85) / 100).toFixed(2)}</td>
                    <td className="py-3 text-surface-a40 text-[11px]">{new Date(o.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Provider QR Code Issuer Modal */}
      {qrModalData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-surface-a0 border border-surface-a10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <button
              onClick={() => setQrModalData(null)}
              className="absolute top-4 right-4 p-1.5 text-surface-a40 hover:text-theme-light rounded-lg bg-tonal-a0 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-info-a0 font-bold bg-info-a0/10 px-2.5 py-0.5 rounded border border-info-a0/20">
                GateKeeper Issued QR Code
              </span>
              <h3 className="text-lg font-bold text-theme-light pt-1">{qrModalData.title}</h3>
              <p className="text-xs text-surface-a40">{qrModalData.subtitle}</p>
              {qrModalData.feeText && (
                <p className="text-base font-bold text-info-a0 font-mono pt-1">{qrModalData.feeText}</p>
              )}
            </div>

            {/* Embedded Campaign Metadata Card if present */}
            {qrModalData.gateDetails && (qrModalData.gateDetails.serviceDescription || qrModalData.gateDetails.customGreeting || qrModalData.gateDetails.expiryDate) && (
              <div className="bg-tonal-a0 border border-info-a0/30 rounded-xl p-3 text-xs font-mono space-y-1.5 text-left">
                <span className="text-[10px] text-info-a0 font-bold uppercase tracking-wider block">Embedded Campaign Parameters</span>
                {qrModalData.gateDetails.customGreeting && (
                  <p className="text-theme-light font-medium">"{qrModalData.gateDetails.customGreeting}"</p>
                )}
                {qrModalData.gateDetails.serviceDescription && (
                  <p className="text-surface-a40 text-[11px] italic">{qrModalData.gateDetails.serviceDescription}</p>
                )}
                {qrModalData.gateDetails.expiryDate && (
                  <p className="text-warning-a0 text-[10px] pt-0.5">Valid through: {qrModalData.gateDetails.expiryDate}</p>
                )}
              </div>
            )}

            {/* Rendered High-Res QR Image Card */}
            <div className="bg-white p-5 rounded-2xl shadow-inner text-center border-2 border-info-a0/30 max-w-[260px] mx-auto">
              <img
                src={qrModalData.qrDataUrl}
                alt="Issued Provider QR Code"
                className="w-52 h-52 mx-auto object-contain"
              />
              <p className="text-[10px] font-mono font-bold text-gray-800 mt-2">
                SCAN TO AUTHENTICATE & CHECKOUT
              </p>
            </div>

            <div className="bg-tonal-a0 border border-surface-a10 rounded-xl p-3 text-xs font-mono space-y-2">
              <span className="text-[10px] text-surface-a40 uppercase block">Direct Payload Target:</span>
              <div className="flex items-center space-x-2">
                <input
                  readOnly
                  value={qrModalData.directUrl}
                  className="flex-1 bg-surface-a0 border border-surface-a10 rounded px-2.5 py-1.5 text-[11px] text-info-a0 truncate"
                />
                <button
                  onClick={() => copyToClipboard(qrModalData.directUrl)}
                  className="p-1.5 bg-info-a0/10 text-info-a0 rounded hover:bg-info-a0/20 transition-colors"
                  title="Copy Direct Link"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={handleDownloadQr}
                className="py-3 bg-info-a0 hover:bg-info-a10 text-primary-a0 font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center space-x-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                onClick={() => setQrModalData(null)}
                className="py-3 bg-surface-a10 hover:bg-surface-a20 text-theme-light font-semibold text-xs rounded-xl transition-all"
              >
                Close Modal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
