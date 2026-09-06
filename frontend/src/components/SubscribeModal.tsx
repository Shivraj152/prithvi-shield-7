import React, { useState } from 'react';
import { Bell, CheckCircle, Info, Trash2, X, Mail, Send, Copy, Volume2, ShieldAlert } from 'lucide-react';
import { useUIStore } from '../store/uiStore';
import { dispatchEmergencyWarningEmail, type DispatchResult } from '../utils/emergencyEmailService';
import { playSiren, unlockAudio } from '../utils/audioSirenService';

interface SubscribeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscribeModal: React.FC<SubscribeModalProps> = ({ isOpen, onClose }) => {
  const { subscription, subscribeToAlerts, unsubscribeFromAlerts, user, addAlert, triggerToastAlert } = useUIStore();
  const [email, setEmail] = useState<string>(user?.email || '');
  const [severityPreference, setSeverityPreference] = useState<'all' | 'high_critical' | 'critical_only'>('high_critical');
  const [duration, setDuration] = useState<'1_day' | '7_days' | '30_days' | 'forever'>('7_days');
  const [lastDispatched, setLastDispatched] = useState<DispatchResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!email.trim()) {
      setFormError("Please enter a valid email address.");
      return;
    }

    // Unlock Web Audio Context upon user interaction
    await unlockAudio();

    const targetEmail = email.trim();
    subscribeToAlerts({
      email: targetEmail,
      severityPreference,
      duration
    });

    // Play instant test siren confirmation
    playSiren();

    // Instantly dispatch subscription confirmation & emergency warning email
    const result = dispatchEmergencyWarningEmail({
      recipientEmail: targetEmail,
      severity: 'HIGH & CRITICAL',
      location: 'East Khasi Hills & NER Hazard Zones',
      state: 'Meghalaya'
    });

    setLastDispatched(result);
  };

  const handleSendTestEmail = () => {
    setFormError(null);
    const targetEmail = subscription?.email || email.trim() || user?.email;
    if (!targetEmail) {
      setFormError("Please enter your email address first.");
      return;
    }

    const result = dispatchEmergencyWarningEmail({
      recipientEmail: targetEmail,
      severity: 'CRITICAL',
      location: 'NH-6 Shillong Axis (Km 42 Debris Slip)',
      state: 'Meghalaya',
      rainfallMm: 195.2,
      soilMoisturePct: 94.2
    });

    setLastDispatched(result);
  };

  const handleTestInBrowserSiren = async () => {
    await unlockAudio();

    // Inject a live test alert to demonstrate toast + siren
    const testAlert = {
      id: Date.now(),
      title: '🚨 LIVE DEMO: Critical Landslide Evacuation Warning',
      title_en: '🚨 LIVE DEMO: Critical Landslide Evacuation Warning',
      message: 'High-volume slope saturation detected in East Khasi Hills. In-app toast popup and siren sound triggered live.',
      message_en: 'High-volume slope saturation detected in East Khasi Hills. In-app toast popup and siren sound triggered live.',
      severity: 'Critical',
      timestamp: new Date().toLocaleTimeString(),
      location: 'East Khasi Hills (NH-6 Corridor)',
      status: 'Active'
    };
    addAlert(testAlert);
    triggerToastAlert(testAlert);
  };

  const handleCopyEmailText = () => {
    if (!lastDispatched) return;
    navigator.clipboard.writeText(`SUBJECT: ${lastDispatched.subject}\n\n${lastDispatched.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const getRemainingDays = (expiresAt: string | null) => {
    if (!expiresAt) return 'Forever';
    const diffMs = new Date(expiresAt).getTime() - new Date().getTime();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours < 24) return `${hours} Hours remaining`;
    const days = Math.ceil(hours / 24);
    return `${days} Days remaining`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl space-y-0">
        
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Subscribe to Real-Time Alerts</h3>
              <p className="text-[11px] text-emerald-400 font-medium">In-App Siren Alerts & Direct Warning Email Dispatches</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
          {formError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-400 font-bold">
              ⚠️ {formError}
            </div>
          )}

          {/* Primary In-App Siren Banner */}
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl space-y-1.5 text-xs">
            <div className="flex items-center space-x-1.5 font-bold text-red-400">
              <Volume2 className="w-4 h-4 animate-pulse" />
              <span>PRIMARY ALERT SYSTEM ACTIVE</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              You'll receive an <strong>instant in-app alert popup with siren sound</strong> whenever a new warning is issued for your area, regardless of which page you are viewing.
            </p>
          </div>

          {/* Dispatched Email Terminal / Live Log */}
          {lastDispatched && (
            <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-4 space-y-3 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>Email Warning Dispatched</span>
                </span>
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 font-mono text-[10px] rounded border border-emerald-500/40 font-bold">
                  200 OK
                </span>
              </div>

              <div className="text-[11px] font-mono text-slate-300 space-y-1 bg-black/60 p-2.5 rounded-lg border border-slate-800">
                <div><span className="text-slate-500">To:</span> <strong className="text-white">{lastDispatched.recipientEmail}</strong></div>
                <div><span className="text-slate-500">Status:</span> <strong className="text-emerald-400">{lastDispatched.status}</strong></div>
                <div><span className="text-slate-500">Subject:</span> <strong className="text-amber-300">{lastDispatched.subject}</strong></div>
              </div>

              <div className="bg-black/90 p-3 rounded-lg border border-slate-800 max-h-36 overflow-y-auto">
                <pre className="text-[10px] font-mono text-emerald-400/90 whitespace-pre-wrap leading-relaxed">
                  {lastDispatched.body}
                </pre>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <button
                  onClick={handleCopyEmailText}
                  className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1 border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{copied ? 'Copied Email Text!' : 'Copy Warning Email Text'}</span>
                </button>

                <a
                  href={lastDispatched.gmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="py-1.5 px-3 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition flex items-center justify-center space-x-1.5 shadow-md cursor-pointer"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Open in Gmail Web App</span>
                </a>
              </div>
            </div>
          )}

          {/* Active Subscription Status Banner */}
          {subscription && subscription.active ? (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" /> Active Alert Subscription
                </span>
                <span className="px-2 py-0.5 bg-black/40 text-emerald-300 font-mono text-[10px] rounded border border-emerald-500/30 font-bold">
                  {getRemainingDays(subscription.expiresAt)}
                </span>
              </div>

              <div className="text-xs text-slate-300 space-y-1 font-mono text-[11px]">
                <div>Subscribed Email: <strong className="text-white">{subscription.email}</strong></div>
                <div>Severity Filter: <strong className="text-white">{subscription.severityPreference.replace('_', ' ').toUpperCase()}</strong></div>
                <div>In-App Siren Alerts: <strong className="text-emerald-400">ACTIVE 🔊</strong></div>
                <div>Subscribed: <strong className="text-slate-400">{new Date(subscription.subscribedAt).toLocaleDateString()}</strong></div>
              </div>

              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleTestInBrowserSiren}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-lg transition shadow-md flex items-center justify-center space-x-1.5"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Test In-App Alert Siren & Toast Popup</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendTestEmail}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg transition shadow-md flex items-center justify-center space-x-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Send Test Emergency Warning Email</span>
                </button>

                <button
                  type="button"
                  onClick={unsubscribeFromAlerts}
                  className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-xs font-bold rounded-lg transition flex items-center justify-center space-x-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Unsubscribe / Cancel Alerts</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="space-y-4">
              
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Email Address for Warning Dispatches</label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Severity Threshold Filter</label>
                <select
                  value={severityPreference}
                  onChange={e => setSeverityPreference(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="all">All Alerts (Low, Moderate, High, Critical)</option>
                  <option value="high_critical">High & Critical Warnings Only (Recommended)</option>
                  <option value="critical_only">Critical Evacuation Warnings Only</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300">Subscription Duration</label>
                <select
                  value={duration}
                  onChange={e => setDuration(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="1_day">1 Day (Temporary Monitoring)</option>
                  <option value="7_days">7 Days (Weekly Monsoon Season)</option>
                  <option value="30_days">30 Days (Monthly Deployment)</option>
                  <option value="forever">Forever (Permanent Alert Stream)</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-1.5"
                >
                  <Bell className="w-4 h-4" />
                  <span>Confirm Subscription & Enable Siren Alerts</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestInBrowserSiren}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-red-400 font-bold text-xs rounded-xl border border-red-500/30 transition flex items-center justify-center space-x-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Test In-App Alert Siren & Toast Popup Now</span>
                </button>
              </div>
            </form>
          )}

          {/* Delivery Channels Status */}
          <div className="space-y-2 text-[11px] leading-relaxed">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start space-x-2 text-emerald-300/90">
              <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <strong>In-App Alert + Sound & Direct Email Dispatches:</strong> Subscribed users receive live in-browser popups with siren audio across all pages, plus detailed disaster warning emails containing 24h rainfall sums and emergency contact info.
              </div>
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start space-x-2 text-amber-300/90">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>SMS & Mobile Gateways Status:</strong> Cellular SMS sending is currently <em>paused pending security review</em> and is planned for future production release. The in-browser alert + siren sound system is fully active and live.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

