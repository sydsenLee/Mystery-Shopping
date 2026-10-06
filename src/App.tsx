import { useEffect, useState, type ReactNode } from 'react';
import { HashRouter, MemoryRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Building2, ClipboardCheck, FileDown, FolderKanban, LayoutDashboard, Menu, Settings as SettingsIcon, Table2, X, CloudOff, Check, Loader2 } from 'lucide-react';
import { initStore, useData, useStore } from './store/store';
import { selectExercise, useUi } from './store/ui';
import { Toasts, OemMark } from './components/ui';
import Dashboard from './pages/Dashboard';
import Exercises from './pages/Exercises';
import ExerciseDetail from './pages/ExerciseDetail';
import Dealerships from './pages/Dealerships';
import Capture from './pages/Capture';
import BloodChartPage from './pages/BloodChartPage';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/exercises', label: 'Exercises', icon: FolderKanban },
  { to: '/dealerships', label: 'Dealerships', icon: Building2 },
  { to: '/capture', label: 'Data Capture', icon: ClipboardCheck },
  { to: '/blood-chart', label: 'Blood Chart', icon: Table2 },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileDown },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function SaveIndicator() {
  const save = useStore((s) => s.save);
  const err = useStore((s) => s.saveError);
  if (save === 'saving')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Loader2 size={13} className="animate-spin" /> Saving
      </span>
    );
  if (save === 'error')
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-no" title={err}>
        <CloudOff size={13} /> Not saved
      </span>
    );
  if (save === 'saved')
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Check size={13} className="text-yes" /> All changes saved
      </span>
    );
  return null;
}

function ExerciseSwitcher() {
  const data = useData();
  const exerciseId = useUi((s) => s.exerciseId);
  const ex = data.exercises.find((e) => e.id === exerciseId);
  const oem = data.oems.find((o) => o.id === ex?.oemId);
  const sorted = [...data.exercises].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <div className="px-3">
      <label htmlFor="exercise-switcher" className="label-caps mb-1.5 block px-1">
        Working on
      </label>
      <div className="flex items-center gap-2 rounded-md border border-line bg-surface2/60 px-2 py-1.5">
        {ex && <OemMark name={oem?.name} logo={oem?.logo} color={oem?.color} size={24} />}
        <select id="exercise-switcher" className="w-full min-w-0 cursor-pointer truncate bg-transparent text-sm font-medium focus:outline-none" value={exerciseId ?? ''} onChange={(e) => selectExercise(e.target.value || null)}>
          <option value="">Choose an exercise</option>
          {sorted.map((e) => (
            <option key={e.id} value={e.id}>
              {(data.oems.find((o) => o.id === e.oemId)?.name ?? '') + ' | ' + e.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const warning = useStore((s) => s.storageWarning);
  const saveErr = useStore((s) => (s.save === 'error' ? s.saveError : undefined));
  useEffect(() => setOpen(false), [loc.pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5 px-3" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-surface2 hover:text-ink'}`}>
          <Icon size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-6">
      <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-md bg-ink p-1.5" aria-hidden>
        <span className="rounded-[2px] bg-yes" />
        <span className="rounded-[2px] bg-no" />
        <span className="rounded-[2px] bg-yes" />
        <span className="rounded-[2px] bg-yes" />
      </span>
      <div className="leading-tight">
        <div className="font-display text-[17px] font-bold tracking-tight">Mystery Shop</div>
        <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Dealer assessment</div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface py-5 lg:flex">
        {brand}
        <ExerciseSwitcher />
        {nav}
        <div className="mt-auto px-6">
          <SaveIndicator />
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-64 flex-col gap-6 bg-surface py-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button className="btn-ghost px-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={18} />
              </button>
            </div>
            <ExerciseSwitcher />
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 lg:hidden">
          <button className="btn-ghost px-2" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div className="font-display text-base font-bold">{NAV.find((n) => (n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to)))?.label ?? 'Mystery Shop'}</div>
          <SaveIndicator />
        </header>
        {(warning || saveErr) && <div className="border-b border-warn/30 bg-warn-soft px-4 py-2 text-sm text-warn">{saveErr ?? warning}</div>}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function RouteMemory() {
  // In the embedded build there is no address bar, so remember the last screen.
  const loc = useLocation();
  const navigate = useNavigate();
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored) return;
    setRestored(true);
    try {
      const last = localStorage.getItem('msm-route');
      if (last && last !== loc.pathname) navigate(last, { replace: true });
    } catch {
      /* ignore */
    }
  }, [restored, loc.pathname, navigate]);
  useEffect(() => {
    try {
      localStorage.setItem('msm-route', loc.pathname);
    } catch {
      /* ignore */
    }
  }, [loc.pathname]);
  return null;
}

function AppRoutes() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/exercises" element={<Exercises />} />
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/exercises/:id/:tab" element={<ExerciseDetail />} />
        <Route path="/dealerships" element={<Dealerships />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/blood-chart" element={<BloodChartPage />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    void initStore();
  }, []);
  // Inside a Claude page frame the address bar is not available, so routing lives in memory.
  const embedded = typeof window !== 'undefined' && typeof window.claude?.use === 'function';

  if (!ready)
    return (
      <div className="flex h-full items-center justify-center gap-3 text-muted">
        <Loader2 className="animate-spin" size={20} /> Loading your exercises
      </div>
    );

  return embedded ? (
    <MemoryRouter>
      <RouteMemory />
      <AppRoutes />
    </MemoryRouter>
  ) : (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
