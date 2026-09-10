import { useState } from 'react';
import { Github, Sun, Moon, LogIn, LogOut, User } from 'lucide-react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { AuthModal } from './components/AuthModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useDocumentStore } from './hooks/useDocumentStore';
import { useTheme } from './hooks/useTheme';

function AppShell() {
  const { theme, toggle } = useTheme();
  const { user, token, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const { docs, activeId, create, rename, remove, activate, touch } = useDocumentStore(token);

  const activeDoc = docs.find((d) => d.id === activeId);
  const title = activeDoc?.title ?? 'Untitled';

  return (
    <div className="h-screen flex flex-col bg-notion-sidebar dark:bg-[#1a1a1a]">
      {/* ── Top header ── */}
      <header className="flex-shrink-0 h-[52px] bg-white dark:bg-[#202020] border-b border-notion-border dark:border-[#3c4043] flex items-center justify-between px-5 z-50">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="HawkDoc" className="w-6 h-6 object-contain" />
          <span className="font-semibold text-notion-text dark:text-[#e8eaed] text-[15px] tracking-tight">HawkDoc</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Collab badge — shown when signed in */}
          {user && (
            <span className="hidden sm:flex items-center gap-1.5 mr-2 text-xs text-notion-muted dark:text-[#9aa0a6]">
              <User size={13} />
              <span className="truncate max-w-[120px]">{user.name}</span>
            </span>
          )}

          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-notion-hover dark:hover:bg-[#2d2f31] transition-colors"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* Auth button */}
          {user ? (
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-notion-hover dark:hover:bg-[#2d2f31] transition-colors"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline font-medium">Sign out</span>
            </button>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-notion-accent hover:bg-blue-600 transition-colors"
            >
              <LogIn size={15} />
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}

          <a
            href="https://github.com/hawk-doc/hawkdoc"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-notion-hover dark:hover:bg-[#2d2f31] transition-colors"
          >
            <Github size={17} />
            <span className="hidden sm:inline font-medium">GitHub</span>
          </a>
        </div>
      </header>

      {/* ── Body: sidebar + editor ── */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          docs={docs}
          activeId={activeId}
          onActivate={activate}
          onCreate={create}
          onRename={rename}
          onDelete={remove}
        />

        <main className="flex-1 overflow-y-auto">
          {activeId ? (
            <Editor
              key={activeId}
              docId={activeId}
              title={title}
              onTitleChange={(t) => touch(activeId, t)}
              collabToken={token ?? undefined}
              collabUser={user ? { id: user.id, name: user.name } : undefined}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-notion-muted dark:text-[#5f6368]">
              <p className="text-sm">No document selected</p>
              <button
                type="button"
                onClick={() => { void create(); }}
                className="text-sm text-notion-accent hover:underline"
              >
                Create a new document
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Auth modal */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
