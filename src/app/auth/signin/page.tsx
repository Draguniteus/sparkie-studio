'use client';

import { signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className="w-4 h-4">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function PasswordInput({
  value, onChange, placeholder, id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  id: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        required
        onChange={e => onChange(e.target.value)}
        className="w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey-500 pr-9"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-hive-300 hover:text-honey-400 transition-colors"
        tabIndex={-1}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

function SignInContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
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

  const resetForm = () => {
    setError('');
    setInfo('');
    setPassword('');
    setConfirmPassword('');
    setGender('');
    setAge('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      const ageNum = age ? parseInt(age, 10) : null;
      if (age && (isNaN(ageNum!) || ageNum! < 13 || ageNum! > 120)) {
        setError('Please enter a valid age (13–120).');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            displayName,
            gender: gender || null,
            age: age ? parseInt(age, 10) : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error); setLoading(false); return; }
        setCheckEmail(true);
        setLoading(false);
        return;
      }

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
    'w-full bg-hive-600 border border-hive-border text-white placeholder-hive-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey-500';

  if (checkEmail) {
    return (
      <div className="min-h-screen bg-hive-600 flex items-center justify-center p-4">
        <div className="w-full max-w-sm text-center">
          <div className="bg-hive-500 rounded-2xl p-8 border border-hive-border">
            <div className="text-4xl mb-3">📬</div>
            <h2 className="text-lg font-bold text-white mb-2">Check your email</h2>
            <p className="text-hive-300 text-sm mb-4">
              We sent a verification link to{' '}
              <span className="text-honey-500">{email}</span>.
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
    <div className="min-h-screen bg-hive-600 flex items-center justify-center p-3">
      <div className="w-full max-w-sm">

        {/* Logo — compact */}
        <div className="flex flex-col items-center mb-4">
          <Image
            src="/sparkie-avatar.jpg"
            alt="Sparkie"
            width={56}
            height={56}
            className="rounded-full mb-2 ring-2 ring-honey-500"
          />
          <h1 className="text-xl font-bold text-white">Sparkie Studio</h1>
          <p className="text-hive-300 text-xs mt-0.5">Your AI creative workspace</p>
        </div>

        {/* Card */}
        <div className="bg-hive-500 rounded-2xl px-5 py-4 border border-hive-border shadow-xl">

          {/* Tabs */}
          <div className="flex mb-4 bg-hive-600 rounded-lg p-0.5">
            {(['signin', 'register'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); resetForm(); }}
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  mode === m ? 'bg-honey-500 text-black' : 'text-hive-300 hover:text-white'
                }`}
              >
                {m === 'signin' ? 'Sign In' : 'Create Account'}
              </button>
            ))}
          </div>

          {info && (
            <div className="bg-green-900/40 border border-green-700 text-green-300 rounded-lg px-3 py-2 text-xs mb-3">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-2.5">

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
              placeholder="Email address"
              value={email}
              required
              onChange={e => setEmail(e.target.value)}
              className={inputClass}
            />

            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              placeholder={mode === 'register' ? 'Password (min. 8 chars)' : 'Password'}
            />

            {mode === 'register' && (
              <>
                <PasswordInput
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="Confirm password"
                />

                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={gender}
                    onChange={e => setGender(e.target.value)}
                    className="w-full bg-hive-600 border border-hive-border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-honey-500"
                  >
                    <option value="">Gender (optional)</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>

                  <input
                    type="number"
                    min={13}
                    max={120}
                    placeholder="Age (optional)"
                    value={age}
                    onChange={e => setAge(e.target.value)}
                    className={inputClass}
                  />
                </div>

                <p className="text-hive-400 text-xs pt-0.5">
                  By signing up you agree to our{' '}
                  <span className="text-honey-500 cursor-pointer hover:underline">Terms</span>{' '}and{' '}
                  <span className="text-honey-500 cursor-pointer hover:underline">Privacy Policy</span>.
                </p>
              </>
            )}

            {error && (
              <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-honey-500 hover:bg-honey-400 text-black font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50"
            >
              {loading ? 'Loading…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-hive-400 text-xs mt-3">
            {mode === 'signin' ? (
              <>Don&apos;t have an account?{' '}
                <button onClick={() => { setMode('register'); resetForm(); }}
                  className="text-honey-500 hover:underline font-medium">Create one</button>
              </>
            ) : (
              <>Already have an account?{' '}
                <button onClick={() => { setMode('signin'); resetForm(); }}
                  className="text-honey-500 hover:underline font-medium">Sign in</button>
              </>
            )}
          </p>
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
