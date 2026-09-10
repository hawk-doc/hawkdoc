import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AuthModalProps {
  onClose: () => void;
}

type Tab = 'login' | 'register';

export function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<Tab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setError('');
    setEmail('');
    setPassword('');
    setName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (tab === 'login') {
        await login(email, password);
      } else {
        if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
        await register(email, password, name.trim());
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Card */}
      <div className="relative w-full max-w-[380px] mx-4 bg-white dark:bg-[#2d2f31] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-notion-border dark:border-[#3c4043]">
          <h2 className="font-semibold text-[15px] text-notion-text dark:text-[#e8eaed]">
            {tab === 'login' ? 'Sign in to HawkDoc' : 'Create an account'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded-md text-notion-muted dark:text-[#9aa0a6] hover:bg-notion-hover dark:hover:bg-[#3c4043] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-notion-border dark:border-[#3c4043]">
          {(['login', 'register'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`flex-1 py-2.5 text-[13px] font-medium transition-colors ${
                tab === t
                  ? 'text-notion-accent dark:text-[#8ab4f8] border-b-2 border-notion-accent dark:border-[#8ab4f8] -mb-px'
                  : 'text-notion-muted dark:text-[#9aa0a6] hover:text-notion-text dark:hover:text-[#e8eaed]'
              }`}
            >
              {t === 'login' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-5 flex flex-col gap-3">
          {tab === 'register' && (
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-medium text-notion-muted dark:text-[#9aa0a6]">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                className="w-full px-3 py-2 text-sm rounded-lg border border-notion-border dark:border-[#3c4043] bg-white dark:bg-[#202020] text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368] outline-none focus:border-notion-accent dark:focus:border-[#8ab4f8] transition-colors"
              />
            </label>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-notion-muted dark:text-[#9aa0a6]">Email</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              autoComplete="email"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-notion-border dark:border-[#3c4043] bg-white dark:bg-[#202020] text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368] outline-none focus:border-notion-accent dark:focus:border-[#8ab4f8] transition-colors"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-medium text-notion-muted dark:text-[#9aa0a6]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tab === 'register' ? 'Min. 8 characters' : ''}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
              minLength={tab === 'register' ? 8 : undefined}
              className="w-full px-3 py-2 text-sm rounded-lg border border-notion-border dark:border-[#3c4043] bg-white dark:bg-[#202020] text-notion-text dark:text-[#e8eaed] placeholder-notion-muted dark:placeholder-[#5f6368] outline-none focus:border-notion-accent dark:focus:border-[#8ab4f8] transition-colors"
            />
          </label>

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full py-2 rounded-lg bg-notion-accent text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading
              ? tab === 'login' ? 'Signing in…' : 'Creating account…'
              : tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
