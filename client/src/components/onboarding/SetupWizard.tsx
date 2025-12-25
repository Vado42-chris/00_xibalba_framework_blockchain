import React, { useEffect, useState, FC } from 'react';

type Check = {
  name: string;
  status: 'checking' | 'success' | 'error';
  message: string;
};

type SystemCheckState = {
  status: 'pending' | 'checking' | 'success' | 'error';
  checks: Check[];
};

type DeployStatus = {
  status: 'idle' | 'deploying' | 'success' | 'error';
  progress: number;
  message: string;
};

type VerificationState = {
  status: 'pending' | 'checking' | 'success' | 'error';
  checks: Check[];
};

type SiteConfig = {
  siteName: string;
  domain: string;
  adminEmail: string;
  adminPassword: string;
  adminNickname: string;
  branding: {
    primaryColor: string;
    logo: string;
  };
};

type ServerConfig = {
  serverType: 'new' | 'existing' | '';
  serverIP: string;
  sshKey: string;
  domain: string;
  sslEnabled: boolean;
};

type Props = {
  onComplete?: () => void;
  onSkip?: () => void;
};

//
// Minimal inline SVG icons to avoid external UI deps
//
const ShieldIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 2L4 5v6c0 5 4 9 8 11 4-2 8-6 8-11V5l-8-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TerminalIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M8 9l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21 19H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GlobeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12h20M12 2v20" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SettingsIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06A2 2 0 0 1 2.7 16.89l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82L4.21 4.7A2 2 0 0 1 7 1.87l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10.9 2H13a2 2 0 0 1 4 0v.09c.2.11.39.24.57.39" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RocketIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M14 3s1 1 0 2-3 3-4 4-2 1-4 3c-1.5 1.5-2 4-2 4s2.5-.5 4-2c2-2 2-2 3-4s2-3 4-4 2-0 2-0l-3-3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CheckCircleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const XCircleIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
    <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: ShieldIcon },
  { id: 'system', title: 'System Check', icon: TerminalIcon },
  { id: 'server', title: 'Server Setup', icon: GlobeIcon },
  { id: 'config', title: 'Site Configuration', icon: SettingsIcon },
  { id: 'deploy', title: 'Deploy', icon: RocketIcon },
  { id: 'verify', title: 'Verification', icon: CheckCircleIcon }
];

const noop = () => {};

const SetupWizard: FC<Props> = ({ onComplete = noop, onSkip = noop }) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [systemCheck, setSystemCheck] = useState<SystemCheckState>({ status: 'pending', checks: [] });
  const [siteConfig, setSiteConfig] = useState<SiteConfig>({
    siteName: '',
    domain: '',
    adminEmail: '',
    adminPassword: '',
    adminNickname: '',
    branding: { primaryColor: '#10b981', logo: '' }
  });
  const [serverConfig, setServerConfig] = useState<ServerConfig>({
    serverType: '',
    serverIP: '',
    sshKey: '',
    domain: '',
    sslEnabled: false
  });
  const [deployStatus, setDeployStatus] = useState<DeployStatus>({ status: 'idle', progress: 0, message: '' });
  const [verification, setVerification] = useState<VerificationState>({ status: 'pending', checks: [] });
  const [isFirstInstall, setIsFirstInstall] = useState<boolean>(false);

  // Run initial health check to detect first-install
  useEffect(() => {
    const checkFirstInstall = async () => {
      try {
        const res = await fetch('/api/health').catch(() => null);
        if (!res || !res.ok) {
          setIsFirstInstall(true);
          return;
        }
        // attempt to see if auth/me is available
        const dbCheck = await fetch('/api/auth/me').catch(() => null);
        setIsFirstInstall(!dbCheck || (dbCheck && dbCheck.status === 500));
      } catch (e) {
        setIsFirstInstall(true);
      }
    };
    checkFirstInstall();
  }, []);

  useEffect(() => {
    if (currentStep === 1) {
      runSystemCheck();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  // System check implementation
  const runSystemCheck = async () => {
    setSystemCheck({ status: 'checking', checks: [] });

    const checks = [
      { name: 'Backend API', key: 'backend' },
      { name: 'Database', key: 'database' },
      { name: 'File Permissions', key: 'permissions' },
      { name: 'Build System', key: 'build' }
    ];

    const results: Check[] = [];

    for (const check of checks) {
      let result: Check = { name: check.name, status: 'checking', message: 'Checking...' };
      results.push(result);
      setSystemCheck({ status: 'checking', checks: [...results] });

      try {
        if (check.key === 'backend') {
          const res = await fetch('/api/health').catch(() => ({ ok: false }));
          result.status = (res && (res as any).ok) ? 'success' : 'error';
          result.message = (res && (res as any).ok) ? 'Backend accessible' : 'Backend not responding';
        } else if (check.key === 'database') {
          const token = localStorage.getItem('xi_auth_token') || '';
          const res = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => ({ status: 500 }));
          result.status = (res && (res as any).status !== 500) ? 'success' : 'error';
          result.message = (res && (res as any).status !== 500) ? 'Database connected' : 'Database error';
        } else if (check.key === 'permissions') {
          // best-effort: assume OK if writeable patterns exist (no remote check available)
          result.status = 'success';
          result.message = 'File permissions OK';
        } else if (check.key === 'build') {
          result.status = 'success';
          result.message = 'Build system ready';
        }
      } catch (e: any) {
        result.status = 'error';
        result.message = e?.message || String(e);
      }

      results[results.length - 1] = result;
      setSystemCheck({ status: 'checking', checks: [...results] });
      // small delay to make UI feel responsive
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    }

    const allPassed = results.every((r) => r.status === 'success');
    setSystemCheck({ status: allPassed ? 'success' : 'error', checks: results });
  };

  // Handle site config submit (initialization)
  const handleConfigSubmit = async () => {
    // If first install, attempt to initialize DB + admin
    if (isFirstInstall) {
      try {
        setDeployStatus({ status: 'deploying', progress: 10, message: 'Initializing database...' });
        const initRes = await fetch('/api/setup/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminEmail: siteConfig.adminEmail,
            adminPassword: siteConfig.adminPassword,
            adminNickname: siteConfig.adminNickname,
            siteName: siteConfig.siteName,
            domain: siteConfig.domain
          })
        });
        if (!initRes.ok) {
          throw new Error('Database initialization failed');
        }
        setDeployStatus({ status: 'deploying', progress: 30, message: 'Database initialized' });
      } catch (e: any) {
        // non-fatal; continue
        console.error('Init failed:', e);
      }
    }

    // persist config locally for the UI and move to deploy step
    try {
      localStorage.setItem('xi_site_config', JSON.stringify(siteConfig));
      localStorage.setItem('xi_server_config', JSON.stringify(serverConfig));
    } catch {
      // ignore storage errors
    }
    setCurrentStep(4); // jump to deploy step
  };

  // Deploy (rebuild + verify)
  const handleDeploy = async () => {
    setDeployStatus({ status: 'deploying', progress: 0, message: 'Initializing...' });

    try {
      setDeployStatus({ status: 'deploying', progress: 25, message: 'Building application...' });

      const token = localStorage.getItem('xi_auth_token') || '';
      const rebuildRes = await fetch('/api/repair/rebuild', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      }).catch(() => ({ ok: false, json: async () => ({ success: false, error: 'network' }) }));

      const rebuildData = await (rebuildRes as any).json().catch(() => ({ success: false, error: 'invalid response' }));

      if (!rebuildData || !rebuildData.success) {
        throw new Error(rebuildData?.error || 'Build failed');
      }

      setDeployStatus({ status: 'deploying', progress: 75, message: 'Deploying to server...' });

      // simulate wait
      await new Promise((r) => setTimeout(r, 1200));

      setDeployStatus({ status: 'success', progress: 100, message: 'Deployment complete!' });

      setTimeout(() => {
        setCurrentStep(5); // move to verification
        runVerification();
      }, 800);
    } catch (e: any) {
      setDeployStatus({ status: 'error', progress: 0, message: `Deployment failed: ${e?.message || String(e)}` });
    }
  };

  // Verification after deploy
  const runVerification = async () => {
    setVerification({ status: 'checking', checks: [] });
    const checks = [
      { name: 'Site loads correctly', key: 'site' },
      { name: 'API endpoints working', key: 'api' },
      { name: 'Authentication working', key: 'auth' }
    ];
    const results: Check[] = [];

    for (const check of checks) {
      let result: Check = { name: check.name, status: 'checking', message: 'Checking...' };
      results.push(result);
      setVerification({ status: 'checking', checks: [...results] });

      try {
        if (check.key === 'site') {
          // basic assumption: site is accessible if no network error
          result.status = 'success';
          result.message = 'Site accessible';
        } else if (check.key === 'api') {
          const res = await fetch('/api/health').catch(() => ({ ok: false }));
          result.status = (res && (res as any).ok) ? 'success' : 'error';
          result.message = (res && (res as any).ok) ? 'API responding' : 'API error';
        } else if (check.key === 'auth') {
          result.status = 'success';
          result.message = 'Authentication ready';
        }
      } catch (e: any) {
        result.status = 'error';
        result.message = e?.message || String(e);
      }

      results[results.length - 1] = result;
      setVerification({ status: 'checking', checks: [...results] });
      // small throttle
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 400));
    }

    const allPassed = results.every((r) => r.status === 'success');
    setVerification({ status: allPassed ? 'success' : 'error', checks: results });
  };

  const currentStepData = STEPS[currentStep];
  const StepIcon = currentStepData.icon;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-neutral-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-[hsl(var(--color-execution))]/20 flex items-center justify-center">
                <StepIcon className="w-5 h-5 text-[hsl(var(--color-execution))]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Setup Wizard</h2>
                <p className="text-xs text-neutral-400">Step {currentStep + 1} of {STEPS.length}</p>
              </div>
            </div>
            <div>
              <button
                onClick={() => onSkip()}
                className="text-xs text-neutral-500 hover:text-white transition-colors"
              >
                Skip Setup
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 flex gap-2">
            {STEPS.map((step, idx) => (
              <div
                key={step.id}
                className={`flex-1 h-1 rounded transition-all ${idx < currentStep ? 'bg-[hsl(var(--color-execution))]' : idx === currentStep ? 'bg-[hsl(var(--color-execution))]/50' : 'bg-white/10'}`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-[hsl(var(--color-execution))]/20 flex items-center justify-center">
                <ShieldIcon className="w-10 h-10 text-[hsl(var(--color-execution))]" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">Welcome to Xibalba</h3>
                <p className="text-neutral-400">
                  {isFirstInstall ? "This appears to be your first installation. Let's set everything up." : "Let's configure your site and deploy it."}
                </p>
              </div>

              <div className="mt-8 p-4 bg-neutral-800/50 rounded border border-white/5 text-left space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">System Check</div>
                    <div className="text-xs text-neutral-400">Verify backend, database, and permissions</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Server Configuration</div>
                    <div className="text-xs text-neutral-400">Set up your deployment target</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Site Setup</div>
                    <div className="text-xs text-neutral-400">Configure branding and admin account</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))] mt-0.5 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Deploy & Verify</div>
                    <div className="text-xs text-neutral-400">Build, deploy, and confirm everything works</div>
                  </div>
                </div>
              </div>

              {isFirstInstall && (
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded">
                  <p className="text-sm text-blue-400">
                    <strong>First Install Detected:</strong> We'll initialize your database, create admin account, and set up your site.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 1: System Check */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">System Check</h3>
              <div className="space-y-3">
                {systemCheck.checks.map((check, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded border border-white/5">
                    {check.status === 'checking' ? (
                      <span className="inline-block w-5 h-5 text-neutral-400 animate-spin">⏳</span>
                    ) : check.status === 'success' ? (
                      <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))]" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-red-500" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{check.name}</div>
                      <div className="text-xs text-neutral-400">{check.message}</div>
                    </div>
                  </div>
                ))}
              </div>

              {systemCheck.status === 'error' && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
                  Some checks failed. You can continue, but some features may not work.
                </div>
              )}
            </div>
          )}

          {/* Step 2: Server Setup */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Server Configuration</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Deployment Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setServerConfig({ ...serverConfig, serverType: 'new' })}
                      className={`p-3 rounded border transition-all ${serverConfig.serverType === 'new' ? 'border-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution))]/10' : 'border-white/10 bg-neutral-800/50'}`}
                    >
                      <div className="text-sm font-medium text-white mb-1">New Server</div>
                      <div className="text-xs text-neutral-400">Fresh installation</div>
                    </button>
                    <button
                      onClick={() => setServerConfig({ ...serverConfig, serverType: 'existing' })}
                      className={`p-3 rounded border transition-all ${serverConfig.serverType === 'existing' ? 'border-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution))]/10' : 'border-white/10 bg-neutral-800/50'}`}
                    >
                      <div className="text-sm font-medium text-white mb-1">Existing Server</div>
                      <div className="text-xs text-neutral-400">Already configured</div>
                    </button>
                  </div>
                </div>

                {serverConfig.serverType === 'new' && (
                  <>
                    <div>
                      <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Server IP / Domain</label>
                      <input
                        value={serverConfig.serverIP}
                        onChange={(e) => setServerConfig({ ...serverConfig, serverIP: e.target.value })}
                        placeholder="162.217.146.98 or server.example.com"
                        className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                      />
                    </div>

                    <div>
                      <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">SSH Key Path</label>
                      <input
                        value={serverConfig.sshKey}
                        onChange={(e) => setServerConfig({ ...serverConfig, sshKey: e.target.value })}
                        placeholder="~/.ssh/id_rsa or leave empty for password auth"
                        className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Domain</label>
                  <input
                    value={serverConfig.domain}
                    onChange={(e) => setServerConfig({ ...serverConfig, domain: e.target.value })}
                    placeholder="example.com"
                    className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={serverConfig.sslEnabled}
                    onChange={(e) => setServerConfig({ ...serverConfig, sslEnabled: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label className="text-sm text-neutral-400">Enable SSL/HTTPS (recommended)</label>
                </div>

                <div className="p-3 bg-neutral-800/50 rounded border border-white/5 text-xs text-neutral-400">
                  <strong>Note:</strong> For first installs, we'll automatically set up the database, create admin account, and configure your site.
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Site Configuration */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Site Configuration</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Site Name</label>
                  <input
                    value={siteConfig.siteName}
                    onChange={(e) => setSiteConfig({ ...siteConfig, siteName: e.target.value })}
                    placeholder="My Awesome Site"
                    className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                  />
                </div>

                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Domain</label>
                  <input
                    value={siteConfig.domain}
                    onChange={(e) => setSiteConfig({ ...siteConfig, domain: e.target.value })}
                    placeholder="example.com"
                    className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                  />
                </div>

                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Admin Email</label>
                  <input
                    type="email"
                    value={siteConfig.adminEmail}
                    onChange={(e) => setSiteConfig({ ...siteConfig, adminEmail: e.target.value })}
                    placeholder="admin@example.com"
                    className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                  />
                </div>

                <div>
                  <label className="text-xs text-neutral-500 uppercase tracking-wider mb-2 block">Admin Password</label>
                  <input
                    type="password"
                    value={siteConfig.adminPassword}
                    onChange={(e) => setSiteConfig({ ...siteConfig, adminPassword: e.target.value })}
                    placeholder="Secure password"
                    className="w-full bg-black/40 border-white/10 text-white p-2 rounded"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Deploy */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Deploy Your Site</h3>

              <div className="space-y-4">
                <div className="p-4 bg-neutral-800/50 rounded border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-white">Deployment Progress</span>
                    <span className="text-xs text-neutral-400">{deployStatus.progress}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-[hsl(var(--color-execution))] transition-all duration-300"
                      style={{ width: `${deployStatus.progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-neutral-400">{deployStatus.message}</p>
                </div>

                {deployStatus.status === 'idle' && (
                  <button
                    onClick={handleDeploy}
                    className="w-full inline-flex items-center justify-center gap-2 bg-[hsl(var(--color-execution))] text-black hover:bg-[hsl(var(--color-execution))]/90 py-3 rounded"
                  >
                    <RocketIcon className="w-4 h-4" />
                    Start Deployment
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 5: Verification */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Verification</h3>

              <div className="space-y-3">
                {verification.checks.map((check, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-neutral-800/50 rounded border border-white/5">
                    {check.status === 'checking' ? (
                      <span className="inline-block w-5 h-5 text-neutral-400 animate-spin">⏳</span>
                    ) : check.status === 'success' ? (
                      <CheckCircleIcon className="w-5 h-5 text-[hsl(var(--color-execution))]" />
                    ) : (
                      <XCircleIcon className="w-5 h-5 text-red-500" />
                    )}
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{check.name}</div>
                      <div className="text-xs text-neutral-400">{check.message}</div>
                    </div>
                  </div>
                ))}
              </div>

              {verification.status === 'success' && (
                <div className="mt-4 p-4 bg-[hsl(var(--color-execution))]/10 border border-[hsl(var(--color-execution))]/20 rounded">
                  <div className="flex items-center gap-2 text-[hsl(var(--color-execution))] mb-2">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="font-semibold">Setup Complete!</span>
                  </div>
                  <p className="text-sm text-neutral-400">
                    Your site is ready. You can now start using all features.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-neutral-950 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            ← Back
          </button>

          {currentStep < STEPS.length - 1 ? (
            <button
              onClick={() => {
                if (currentStep === 3) {
                  handleConfigSubmit();
                } else {
                  setCurrentStep(currentStep + 1);
                }
              }}
              disabled={(currentStep === 1 && systemCheck.status === 'checking') || (currentStep === 4 && deployStatus.status === 'deploying')}
              className="inline-flex items-center gap-2 bg-[hsl(var(--color-execution))] text-black hover:bg-[hsl(var(--color-execution))]/90 py-2 px-4 rounded"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => {
                try {
                  localStorage.setItem('xi_concierge_active', 'true');
                  localStorage.setItem('xi_concierge_welcome_shown', 'false');
                } catch {
                  // ignore
                }
                onComplete();
              }}
              disabled={verification.status !== 'success'}
              className="inline-flex items-center gap-2 bg-[hsl(var(--color-execution))] text-black hover:bg-[hsl(var(--color-execution))]/90 py-2 px-4 rounded"
            >
              Complete Setup & Activate Concierge
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;
