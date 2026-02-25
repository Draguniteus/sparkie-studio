'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, displayName }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setLoading(false); return; }
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error) { setError('Invalid email or password'); setLoading(false); return; }
      router.push('/');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-hive-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image src="/sparkie-avatar.jpg" alt="Sparkie" width={80} height={80} className="rounded-full mb-3 ring-2 ring-honey-500" />
          <h1 className="text-2xl font-bold text-white">Sparkie Studio</h1>
          <p className="text-hive-300 text-sm mt-1">Your AI creative workspace</p>
        </div>

        {/* Card */}
        <div className="bg-hive-500 rounded-2xl p-6 border border-hive-border">
          {/* Google */}
          <button
            onClick={() => signIn('google', { callbackUrl: '/' })}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-medium py-2.5 px-4 rounded-xl hover:bg-gray-100 transition-colors mb-4"
          >
            <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-hive-border" />
            <span className="text-hive-300 text-xs">or</span>
            <div className="flex-1 h-px bg-hive-border" />
          </div>

          {/* Tabs */}
          <div className="flex mb-4 bg-hive-600 rounded-lg p-1">
            {(['signin', 'register'] as const).map(m => (
              <button key={m} onClick={() => { setMode(m); setError(''); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-honey-500 text-black' : 'text-hive-300 hover:text-white'
                }`}>
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleCredentials} className="space-y-3">
            {mode === 'register' && (
              <input
                type="text" placeholder="Display name" value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className="w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-honey-500"
              />
            )}
            <input
              type="email" placeholder="Email" value={email} required
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-honey-500"
            />
            <input
              type="password" placeholder="Password" value={password} required
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-honey-500"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-honey-500 hover:bg-honey-400 text-black font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50">
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
