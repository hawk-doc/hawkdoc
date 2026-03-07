import { useState } from 'react';
import { Github } from 'lucide-react';
import { Editor } from './components/Editor';
import { loadAutoSave } from './hooks/useAutoSave';

export default function App() {
  const [title, setTitle] = useState<string>(() => loadAutoSave()?.title ?? 'Untitled');

  return (
    <div className="h-screen flex flex-col bg-notion-sidebar">
      {/* ── Top header ── */}
      <header className="flex-shrink-0 h-[52px] bg-white border-b border-notion-border flex items-center justify-between px-5 z-50">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="HawkDoc" className="w-6 h-6 object-contain" />
          <span className="font-semibold text-notion-text text-[15px] tracking-tight">HawkDoc</span>
        </div>

        {/* GitHub link */}
        <a
          href="https://github.com/hawk-doc/hawkdoc"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-notion-muted hover:text-notion-text hover:bg-notion-hover transition-colors"
        >
          <Github size={17} />
          <span className="hidden sm:inline font-medium">GitHub</span>
        </a>
      </header>

      {/* ── Scrollable editor area ── */}
      <div className="flex-1 overflow-y-auto">
        <Editor title={title} onTitleChange={setTitle} />
      </div>
    </div>
  );
}
