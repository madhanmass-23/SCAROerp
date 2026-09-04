import React, { useState, useEffect } from 'react';
import { Download, Smartphone, Monitor, Apple, Check, Info } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallAppButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('android');

  useEffect(() => {
    // 1. Check if already installed / running in standalone mode
    const checkInstalled = () => {
      const isStandalone = 
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true ||
        document.referrer.includes('android-app://');
      setIsInstalled(Boolean(isStandalone));
    };

    checkInstalled();

    // 2. Detect platform for default instructions tab
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (/iphone|ipad|ipod/.test(userAgent)) {
      setActiveTab('ios');
    } else if (/android/.test(userAgent)) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    // 3. Listen for browser install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setDeferredPrompt(null);
        }
      } catch (err) {
        console.error('PWA install prompt error:', err);
        setIsModalOpen(true);
      }
    } else {
      // Fallback modal for browsers that do not fire beforeinstallprompt (e.g., iOS Safari)
      setIsModalOpen(true);
    }
  };

  if (isInstalled) {
    return (
      <div 
        id="pwa-installed-badge"
        data-testid="pwa-installed-badge"
        className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-status-success/10 text-status-success text-xs font-medium border border-status-success/20 ${className}`}
      >
        <Check className="h-3.5 w-3.5" />
        <span>SCARO ERP App Installed</span>
      </div>
    );
  }

  return (
    <>
      <button
        id="pwa-install-button"
        data-testid="pwa-install-button"
        type="button"
        onClick={handleInstallClick}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/15 border border-primary/25 transition-all shadow-xs active:scale-[0.98] cursor-pointer ${className}`}
      >
        <img
          src="/assets/scaro-logo.png"
          alt="SCARO"
          className="h-4 w-4 object-contain rounded-xs bg-[#fbf7f2] shrink-0"
        />
        <Download className="h-4 w-4 shrink-0 text-primary" />
        <span>Install SCARO ERP App</span>
      </button>

      {/* Fallback Instructional Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          <div className="flex items-center gap-2.5">
            <img
              src="/assets/scaro-logo.png"
              alt="SCARO Logo"
              className="h-6 w-6 object-contain rounded-md border border-border/40 bg-[#fbf7f2] shadow-2xs shrink-0"
            />
            <span>Install SCARO ERP</span>
          </div>
        }
        className="max-w-md"
        footer={
          <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
            Got it
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/15 text-xs text-content-muted">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p>
              SCARO ERP is a Progressive Web App (PWA). You can install it directly to your home screen or desktop without using an app store.
            </p>
          </div>

          {/* Platform Switcher Tabs */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface-muted rounded-lg border border-border text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('android')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                activeTab === 'android' ? 'bg-surface text-content shadow-xs font-semibold' : 'text-content-muted hover:text-content'
              }`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Android</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('ios')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                activeTab === 'ios' ? 'bg-surface text-content shadow-xs font-semibold' : 'text-content-muted hover:text-content'
              }`}
            >
              <Apple className="h-3.5 w-3.5" />
              <span>iOS / Safari</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('desktop')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                activeTab === 'desktop' ? 'bg-surface text-content shadow-xs font-semibold' : 'text-content-muted hover:text-content'
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              <span>Desktop</span>
            </button>
          </div>

          {/* Platform Specific Step Instructions */}
          {activeTab === 'ios' && (
            <div className="space-y-2.5 text-xs text-content">
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                <span>Open <strong>Safari</strong> on your iPhone or iPad and navigate to this login page.</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                <span>Tap the <strong>Share</strong> button (the square icon with an arrow pointing upward) in the Safari toolbar.</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                <span>Scroll down the action sheet and tap <strong>Add to Home Screen</strong>.</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">4</span>
                <span>Tap <strong>Add</strong> in the top-right corner to place the SCARO ERP app icon on your home screen.</span>
              </div>
            </div>
          )}

          {activeTab === 'android' && (
            <div className="space-y-2.5 text-xs text-content">
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                <span>In <strong>Chrome</strong>, tap the three-dot menu icon (<strong>⋮</strong>) in the top-right corner.</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                <span>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                <span>Confirm by tapping <strong>Install</strong> when prompted.</span>
              </div>
            </div>
          )}

          {activeTab === 'desktop' && (
            <div className="space-y-2.5 text-xs text-content">
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                <span>In <strong>Chrome</strong> or <strong>Edge</strong>, look at the right side of the address bar (URL bar).</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                <span>Click the <strong>Install</strong> icon (computer screen with a down arrow).</span>
              </div>
              <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-muted border border-border">
                <span className="h-5 w-5 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                <span>Alternatively, click the browser menu (<strong>⋮</strong>) &rarr; <strong>Save and share</strong> &rarr; <strong>Install SCARO ERP</strong>.</span>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
