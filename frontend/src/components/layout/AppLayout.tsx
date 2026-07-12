import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Rail } from './Rail';
import { Topbar } from './Topbar';

const STORAGE_KEY = 'hiretrack.sidebar-collapsed';

/** Ink & Bone app shell: left rail + topbar + scrolling page. */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const location = useLocation();

  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* noop */
      }
      return next;
    });
  };

  // Scroll to top on route change.
  useEffect(() => {
    document.getElementById('app-scroll')?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="shell h-screen overflow-hidden">
      <Rail collapsed={collapsed} onToggle={toggle} />
      <main className="main-col">
        <Topbar />
        <div id="app-scroll" className="flex-1 overflow-y-auto">
          <div className="page">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
