import React from 'react';
import { Shield, Lock, LayoutDashboard, KeyRound, QrCode, LogOut } from 'lucide-react';

interface HeaderProps {
  currentTab: 'portal' | 'client' | 'provider' | 'agent' | 'scanner';
  onTabChange: (tab: 'portal' | 'client' | 'provider' | 'agent' | 'scanner') => void;
  providerActive: boolean;
  role?: 'admin' | 'provider' | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onTabChange, providerActive, role, onLogout }) => {
  return (
    <header className="bg-surface-a0 border-b border-surface-a10 text-theme-light sticky top-0 z-40 backdrop-blur-md bg-opacity-95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo & Tagline */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('portal')}>
          <div className="w-10 h-10 rounded-lg bg-info-a0/10 border border-info-a0/30 flex items-center justify-center text-info-a0">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-lg tracking-wider text-theme-light uppercase">GATEKEEPER</span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-info-a0/20 text-info-a0 border border-info-a0/30">
                MVP 1.1
              </span>
            </div>
            <p className="text-[11px] text-surface-a40 font-mono tracking-wide hidden sm:block">
              ALL SIGNAL. NO NOISE.
            </p>
          </div>
        </div>

        {/* Navigation tabs */}
        <nav className="flex items-center space-x-1 sm:space-x-2">
          <button
            onClick={() => onTabChange('portal')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
              currentTab === 'portal'
                ? 'bg-tonal-a10 text-info-a0 border border-surface-a20'
                : 'text-surface-a40 hover:text-theme-light hover:bg-surface-a10/50'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>Portal</span>
          </button>

          <button
            onClick={() => onTabChange('client')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
              currentTab === 'client'
                ? 'bg-tonal-a10 text-info-a0 border border-surface-a20'
                : 'text-surface-a40 hover:text-theme-light hover:bg-surface-a10/50'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Checkout</span>
          </button>

          <button
            onClick={() => onTabChange('provider')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
              currentTab === 'provider'
                ? 'bg-tonal-a10 text-info-a0 border border-surface-a20'
                : 'text-surface-a40 hover:text-theme-light hover:bg-surface-a10/50'
            }`}
          >
            <div className={`w-2 h-2 rounded-full ${providerActive ? 'bg-success-a0' : 'bg-danger-a0'}`} />
            <span className="hidden sm:inline">Provider</span>
          </button>

          <button
            onClick={() => onTabChange('agent')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
              currentTab === 'agent'
                ? 'bg-tonal-a10 text-info-a0 border border-surface-a20'
                : 'text-surface-a40 hover:text-theme-light hover:bg-surface-a10/50'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </button>

          <button
            onClick={() => onTabChange('scanner')}
            className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors flex items-center space-x-1.5 ${
              currentTab === 'scanner'
                ? 'bg-tonal-a10 text-info-a0 border border-surface-a20'
                : 'text-surface-a40 hover:text-theme-light hover:bg-surface-a10/50'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Gate</span>
          </button>

          {role && onLogout && (
            <button
              onClick={onLogout}
              title="End Secure Session"
              className="ml-2 px-2 py-1.5 rounded-md text-danger-a0 hover:bg-danger-a0/10 transition-colors flex items-center"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </nav>
      </div>
    </header>
  );
};
