'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    const verified = params.get('verified');
    const err = params.get('error');
    if (verified === '1') setInfo('Email verified! You can now sign in.');
    if (err === 'token_expired') setError('Verification link expired. Register again to get a new one.');
    if (err === 'invalid_token') setError('Invalid verification link.');
    if (err === 'missing_token') setError('Missing token.');
  }, [params]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
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
        setCheckEmail(true);
        setLoading(false);
        return;
      }

      // Sign in
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email before signing in. Check your inbox.');
        setLoading(false);
        return;
      }
      if (result?.error) {
        setError('Invalid email or password.');
        setLoading(false);
        return;
      }
      router.push('/');
    } catch {
      setError('Something went wrong.');
      setLoading(false);
    }
  };

  const inputClass =
    'w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-honey-500';

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-hive-600 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-hive-500 rounded-2xl p-8 border border-hive-border">
            <div className="text-4xl mb-4">📬</div>
            <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
            <p className="text-hive-300 text-sm mb-6">
              We sent a verification link to <span className="text-honey-500">{email}</span>.
              Click it to activate your account.
            </p>
            <p className="text-hive-400 text-xs">Didn&apos;t get it? Check spam, or{' '}
              <button
                onClick={() => { setCheckEmail(false); setMode('register'); }}
                className="text-honey-500 hover:underline">
                try again
              </button>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hive-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <Image
            src="/sparkie-avatar.jpg"
            alt="Sparkie"
            width={80}
            height={80}
            className="rounded-full mb-3 ring-2 ring-honey-500"
          />
          <h1 className="text-2xl font-bold text-white">Sparkie Studio</h1>
          <p className="text-hive-300 text-sm mt-1">Your AI creative workspace</p>
        </div>

        {/* Card */}
        <div className="bg-hive-500 rounded-2xl p-6 border border-hive-border">
          {/* Tabs */}
          <div className="flex mb-5 bg-hive-600 rounded-lg p-1">
            {(['signin', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setInfo(''); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-honey-500 text-black' : 'text-hive-300 hover:text-white'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {info && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-xl px-4 py-2.5 text-sm mb-4">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'register' && (
              <input
                type="text"
                placeholder="Display name (optional)"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                className={inputClass}
              />
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              required
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              required
              onChange={e => setPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-honey-500 hover:bg-honey-400 text-black font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'signin' && (
            <p className="text-center text-hive-400 text-xs mt-4">
              No account?{' '}
              <button
                onClick={() => { setMode('register'); setError(''); }}
                className="text-honey-500 hover:underline"
              >
                Create one
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
