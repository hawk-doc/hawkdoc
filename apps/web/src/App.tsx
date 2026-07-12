import { Github, Sun, Moon } from 'lucide-react';
import { Editor } from './components/Editor';
import { Sidebar } from './components/Sidebar';
import { useDocumentStore } from './hooks/useDocumentStore';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { theme, toggle } = useTheme();
  const { docs, activeId, create, rename, remove, activate, touch } = useDocumentStore();

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
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-notion-hover dark:hover:bg-[#2d2f31] transition-colors"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
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
          <Editor
            key={activeId}
            docId={activeId}
            title={title}
            onTitleChange={(t) => touch(activeId, t)}
          />
        </main>
      </div>
    </div>
  );
}
