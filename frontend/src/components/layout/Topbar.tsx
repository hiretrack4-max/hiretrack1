import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Search as SearchIcon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';

/**
 * Topbar: a global search that focuses to orange, a light/dark theme toggle,
 * and sign-out.
 */
export function Topbar() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [query, setQuery] = useState('');

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  return (
    <header className="topbar">
      <form className="search" onSubmit={submitSearch}>
        <span className="mag">
          <SearchIcon size={16} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search candidates, skills, roles, email, phone…"
          autoComplete="off"
          aria-label="Global search"
        />
      </form>

      <div className="ml-auto flex items-center gap-2">
        <button
          className="btn sm icon ghost"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="btn sm ghost" onClick={logout} title="Sign out">
          <LogOut size={15} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
