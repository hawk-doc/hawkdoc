import { useState } from 'react';
import { Github, Sun, Moon } from 'lucide-react';
import { Editor } from './components/Editor';
import { loadAutoSave } from './hooks/useAutoSave';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const [title, setTitle] = useState<string>(() => loadAutoSave()?.title ?? 'Untitled');
  const { theme, toggle } = useTheme();

  return (
    <div className="h-screen flex flex-col bg-notion-sidebar dark:bg-[#1a1a1a]">
      {/* ── Top header ── */}
      <header className="flex-shrink-0 h-[52px] bg-white dark:bg-[#202020] border-b border-notion-border dark:border-[#3c4043] flex items-center justify-between px-5 z-50">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="HawkDoc" className="w-6 h-6 object-contain" />
          <span className="font-semibold text-notion-text dark:text-[#e8eaed] text-[15px] tracking-tight">HawkDoc</span>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed] hover:bg-notion-hover dark:hover:bg-[#2d2f31] transition-colors"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          {/* GitHub link */}
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

      {/* ── Scrollable editor area ── */}
      <div className="flex-1 overflow-y-auto">
        <Editor title={title} onTitleChange={setTitle} />
      </div>
    </div>
  );
}
