import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  KeyRound,
  Lock,
  Mail,
  Menu,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  X
} from 'lucide-react';
import { apiRequest, setAuthToken } from '../lib/api';
import { BookCoverImage } from '../components/BookCoverImage';
import { StatusIndicator } from '../components/StatusIndicator';
import type { BookListing, PublicMetadata, User } from '../types';

export type PublicRoute =
  | 'home'
  | 'explore'
  | 'how-it-works'
  | 'about'
  | 'contact'
  | 'student-login'
  | 'student-register'
  | 'owner-login';

interface PublicPortalProps {
  route: PublicRoute;
  onNavigate: (route: PublicRoute) => void;
  metadata: PublicMetadata | null;
  onAuthenticated: (user: User) => void;
}

export function PublicPortal({ route, onNavigate, metadata, onAuthenticated }: PublicPortalProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Explore catalog state
  const [books, setBooks] = useState<BookListing[]>([]);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [listingType, setListingType] = useState('');
  const [condition, setCondition] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedBook, setSelectedBook] = useState<BookListing | null>(null);

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);

  // Student auth state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  const [regForm, setRegForm] = useState({
    fullName: '',
    email: '',
    studentIdNumber: '',
    departmentId: '',
    semesterId: '',
    phone: '',
    password: ''
  });

  // Owner auth state
  const [ownerStatus, setOwnerStatus] = useState<{
    ownerEmail: string;
    needsSetup: boolean;
    envPasscodeActive: boolean;
  } | null>(null);
  const [ownerEmail, setOwnerEmail] = useState('patilakash74850@gmail.com');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [ownerConfirmPassword, setOwnerConfirmPassword] = useState('');
  const [ownerRecoveryKeyInput, setOwnerRecoveryKeyInput] = useState('');
  const [ownerMode, setOwnerMode] = useState<'login' | 'reset'>('login');
  const [claimedRecoveryKey, setClaimedRecoveryKey] = useState<string | null>(null);
  const [pendingOwnerUser, setPendingOwnerUser] = useState<User | null>(null);

  useEffect(() => {
    if (route === 'home' || route === 'explore') {
      fetchBooks();
    }
  }, [route, search, departmentId, semesterId, categoryId, listingType, condition, sort]);

  useEffect(() => {
    if (route === 'owner-login') {
      setAuthError('');
      apiRequest<{ ownerEmail: string; needsSetup: boolean; envPasscodeActive: boolean }>('/api/auth/owner-status')
        .then((res) => {
          setOwnerStatus(res);
          setOwnerEmail(res.ownerEmail);
        })
        .catch(() => {});
    } else {
      setAuthError('');
    }
  }, [route]);

  async function fetchBooks() {
    setLoadingBooks(true);
    try {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      if (departmentId) qs.set('departmentId', departmentId);
      if (semesterId) qs.set('semesterId', semesterId);
      if (categoryId) qs.set('categoryId', categoryId);
      if (listingType) qs.set('listingType', listingType);
      if (condition) qs.set('condition', condition);
      if (sort) qs.set('sort', sort);
      const data = await apiRequest<{ books: BookListing[] }>(`/api/public/books?${qs.toString()}`);
      setBooks(data.books);
    } catch {
      setBooks([]);
    } finally {
      setLoadingBooks(false);
    }
  }

  async function handleStudentLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleStudentRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          ...regForm,
          departmentId: regForm.departmentId ? Number(regForm.departmentId) : null,
          semesterId: regForm.semesterId ? Number(regForm.semesterId) : null
        })
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleOwnerSetup(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (ownerPassword.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    if (ownerPassword !== ownerConfirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ token: string; recoveryKey: string; user: User }>('/api/auth/owner-setup', {
        method: 'POST',
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword })
      });
      setAuthToken(res.token);
      setClaimedRecoveryKey(res.recoveryKey);
      setPendingOwnerUser(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Failed to initialize owner password.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleOwnerLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ token: string; user: User }>('/api/auth/owner-login', {
        method: 'POST',
        body: JSON.stringify({ email: ownerEmail, password: ownerPassword })
      });
      setAuthToken(res.token);
      onAuthenticated(res.user);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid administrator credentials.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleOwnerReset(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    if (ownerPassword.length < 8) {
      setAuthError('New password must be at least 8 characters.');
      return;
    }
    setAuthLoading(true);
    try {
      const res = await apiRequest<{ success: boolean; recoveryKey: string }>('/api/auth/owner-reset', {
        method: 'POST',
        body: JSON.stringify({
          email: ownerEmail,
          recoveryKey: ownerRecoveryKeyInput,
          newPassword: ownerPassword
        })
      });
      setClaimedRecoveryKey(res.recoveryKey);
      setOwnerMode('login');
      setOwnerPassword('');
      setOwnerRecoveryKeyInput('');
      setOwnerStatus((prev) => (prev ? { ...prev, needsSetup: false } : prev));
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    setContactStatus(null);
    setContactSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(contactForm)
      });
      setContactStatus({ type: 'success', text: res.message });
      setContactForm({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setContactStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not send message.'
      });
    } finally {
      setContactSubmitting(false);
    }
  }

  const navItems: Array<{ id: PublicRoute; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'explore', label: 'Explore Books' },
    { id: 'how-it-works', label: 'How It Works' },
    { id: 'about', label: 'About' },
    { id: 'contact', label: 'Contact' }
  ];

  // Dedicated dark-luxury experience for Owner Login
  if (route === 'owner-login') {
    return (
      <div className="min-h-screen bg-[#101010] text-[#F7F5EF] flex flex-col">
        <header className="border-b border-[#242424] px-6 py-4 flex items-center justify-between gap-8 max-w-7xl w-full mx-auto">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-serif text-xl font-semibold tracking-tight text-[#F7F5EF] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Athenaeum
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-xs font-medium text-neutral-400 hover:text-[#C6A66B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Return to Public Portal
          </button>
        </header>

        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[#171717] border border-[#292929] rounded-md p-8">
            <div className="flex items-center gap-2.5 text-xs uppercase tracking-[0.18em] text-[#C6A66B] font-medium">
              <ShieldCheck className="w-4 h-4" />
              <span>Executive Governance Access</span>
            </div>
            <h1 className="mt-3 font-serif text-3xl font-semibold text-[#F7F5EF]">
              {claimedRecoveryKey
                ? 'Recovery Key Issued'
                : ownerStatus?.needsSetup
                ? 'Initialize Super Admin'
                : ownerMode === 'reset'
                ? 'Reset Admin Password'
                : 'Owner Command Portal'}
            </h1>
            <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
              {claimedRecoveryKey
                ? 'Store this one-time recovery key securely. It enables password reset if you ever lose access.'
                : ownerStatus?.needsSetup
                ? 'Set the private password for the designated Super Administrator account.'
                : ownerMode === 'reset'
                ? 'Enter your recovery key or server passcode to set a new Super Administrator password.'
                : 'Restricted administrative portal for authorized institutional governance.'}
            </p>

            {claimedRecoveryKey ? (
              <div className="mt-6 space-y-5">
                <div className="p-4 bg-[#101010] border border-[#C6A66B]/40 rounded font-mono text-sm text-[#C6A66B] break-all select-all">
                  {claimedRecoveryKey}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (pendingOwnerUser) {
                      onAuthenticated(pendingOwnerUser);
                    } else {
                      setClaimedRecoveryKey(null);
                    }
                  }}
                  className="w-full py-2.5 px-4 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] font-medium text-sm rounded transition-colors cursor-pointer"
                >
                  {pendingOwnerUser ? 'Proceed to Executive Dashboard' : 'Return to Owner Sign In'}
                </button>
              </div>
            ) : ownerStatus?.needsSetup ? (
              <form onSubmit={handleOwnerSetup} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Designated Owner Email</label>
                  <input
                    type="email"
                    readOnly
                    value={ownerEmail}
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-neutral-400 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Create Super Admin Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Confirm Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ownerConfirmPassword}
                    onChange={(e) => setOwnerConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                {authError && <p className="text-xs text-rose-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] font-medium text-sm rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Securing Account...' : 'Claim Super Admin Account'}
                </button>
              </form>
            ) : ownerMode === 'reset' ? (
              <form onSubmit={handleOwnerReset} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Owner Email</label>
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Recovery Key or Server Passcode</label>
                  <input
                    type="password"
                    required
                    value={ownerRecoveryKeyInput}
                    onChange={(e) => setOwnerRecoveryKeyInput(e.target.value)}
                    placeholder="ATH-REC-..."
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm font-mono text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                {authError && <p className="text-xs text-rose-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] font-medium text-sm rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Resetting...' : 'Reset Administrator Password'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOwnerMode('login');
                    setAuthError('');
                  }}
                  className="w-full text-xs text-neutral-400 hover:text-[#F7F5EF] py-1 cursor-pointer"
                >
                  Back to Owner Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleOwnerLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Administrator Email</label>
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="Enter administrator password"
                    className="w-full px-3.5 py-2.5 bg-[#101010] border border-[#292929] rounded text-sm text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                {authError && <p className="text-xs text-rose-400">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] font-medium text-sm rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Verifying Credentials...' : 'Sign In to Executive Portal'}
                </button>
                <div className="pt-2 flex items-center justify-between text-xs text-neutral-500">
                  <button
                    type="button"
                    onClick={() => {
                      setOwnerMode('reset');
                      setAuthError('');
                    }}
                    className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-[#C6A66B] transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Reset password</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('student-login')}
                    className="hover:text-neutral-300 transition-colors cursor-pointer"
                  >
                    Student Login
                  </button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#171717] flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#F7F5EF]/95 backdrop-blur-sm border-b border-[#E3DDD1]">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="font-serif text-xl font-semibold tracking-tight text-[#101010] whitespace-nowrap shrink-0 cursor-pointer"
          >
            Athenaeum
          </button>

          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer pb-0.5 ${
                  route === item.id
                    ? 'text-[#101010] border-b border-[#C6A66B]'
                    : 'text-neutral-600 hover:text-[#101010]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('student-login')}
              className="hidden md:inline-flex px-4 py-2 text-xs font-medium bg-[#171717] text-[#F7F5EF] rounded hover:bg-[#292929] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="md:hidden p-2 text-[#171717] rounded hover:bg-[#EEEAE1]"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E3DDD1] bg-[#F7F5EF] px-6 py-4 space-y-3">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`block w-full text-left py-2 text-sm font-medium ${
                  route === item.id ? 'text-[#101010]' : 'text-neutral-600'
                }`}
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-[#E3DDD1] flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onNavigate('student-login');
                  setMobileMenuOpen(false);
                }}
                className="flex-1 py-2.5 text-xs font-medium bg-[#171717] text-[#F7F5EF] rounded"
              >
                Student Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigate('student-register');
                  setMobileMenuOpen(false);
                }}
                className="flex-1 py-2.5 text-xs font-medium border border-[#171717] text-[#171717] rounded"
              >
                Register
              </button>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        {/* HOME PAGE */}
        {route === 'home' && (
          <div>
            <section className="max-w-7xl mx-auto px-6 py-12 lg:py-20">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#8A7040] font-medium">
                    Smart Student Library & Book Exchange
                  </p>
                  <h1 className="mt-4 font-serif text-4xl sm:text-5xl lg:text-[3.35rem] font-semibold leading-[1.12] text-[#101010]">
                    Circulate Academic Knowledge Across Every Semester
                  </h1>
                  <p className="mt-5 text-base text-neutral-600 leading-relaxed max-w-xl">
                    An institutional academic resource platform uniting verified peer textbook exchanges, structured book donations, and centralized administrative governance.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => onNavigate('explore')}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-[#171717] text-[#F7F5EF] text-sm font-medium rounded hover:bg-[#292929] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Explore Verified Catalog</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('student-register')}
                      className="inline-flex items-center gap-2 px-6 py-3 border border-[#CFC7B8] bg-[#EEEAE1]/60 text-[#171717] text-sm font-medium rounded hover:bg-[#EEEAE1] transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <span>Create Student Account</span>
                    </button>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="h-full min-h-[320px] lg:min-h-[440px] rounded-md overflow-hidden border border-[#E0D9CC] bg-[#EEEAE1]">
                    <img
                      src="/src/assets/images/hero_luxury_library_1795534389136.jpg"
                      alt="Athenaeum institutional academic reading room"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* 4-column Institutional KPI strip below hero split */}
              <div className="mt-14 pt-10 border-t border-[#E3DDD1] grid grid-cols-2 lg:grid-cols-4 gap-8">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Approved Volumes</p>
                  <p className="mt-2 font-serif text-3xl font-semibold text-[#101010] tabular-nums">
                    {metadata?.stats.approvedBooks ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">Verified across departments</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Completed Exchanges</p>
                  <p className="mt-2 font-serif text-3xl font-semibold text-[#101010] tabular-nums">
                    {metadata?.stats.completedExchanges ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">Peer-to-peer handovers</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Academic Donations</p>
                  <p className="mt-2 font-serif text-3xl font-semibold text-[#101010] tabular-nums">
                    {metadata?.stats.approvedDonations ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">Open-access textbooks</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-neutral-500">Active Scholars</p>
                  <p className="mt-2 font-serif text-3xl font-semibold text-[#101010] tabular-nums">
                    {metadata?.stats.activeStudents ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">Registered community members</p>
                </div>
              </div>
            </section>

            {/* Featured Approved Catalogue */}
            <section className="bg-[#EEEAE1] border-y border-[#E0D9CC] py-16">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Curated Collection</p>
                    <h2 className="mt-2 font-serif text-3xl font-semibold text-[#101010]">
                      Recently Approved Academic Volumes
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('explore')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[#171717] hover:text-[#8A7040] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <span>View full catalog</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {books.slice(0, 4).map((book) => (
                    <article
                      key={book.listing_id}
                      onClick={() => setSelectedBook(book)}
                      className="group bg-[#F7F5EF] border border-[#DFD8CA] rounded-md overflow-hidden flex flex-col cursor-pointer hover:border-[#C6A66B] transition-colors"
                    >
                      <div className="aspect-[3/4] w-full overflow-hidden bg-[#E7E1D5]">
                        <BookCoverImage
                          src={book.cover_image_url}
                          title={book.title}
                          author={book.author}
                          className="w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
                        />
                      </div>
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <span>{book.department_code || 'GEN'}</span>
                          <span aria-hidden="true">·</span>
                          <span>{book.semester_label || 'All Semesters'}</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{book.listing_type.toLowerCase()}</span>
                        </div>
                        <h3 className="mt-2 font-serif text-lg font-semibold text-[#101010] leading-snug line-clamp-2">
                          {book.title}
                        </h3>
                        <p className="mt-1 text-xs text-neutral-600 truncate">{book.author}</p>
                        <div className="mt-auto pt-4 flex items-center justify-between border-t border-[#EAE4D8] text-xs">
                          <span className="text-neutral-600">{book.condition.replace('_', ' ')}</span>
                          <span className="font-medium text-[#8A7040]">Inspect Volume</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* Governance Workflow */}
            <section className="max-w-7xl mx-auto px-6 py-16 lg:py-20">
              <div className="max-w-2xl">
                <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Centralized Governance</p>
                <h2 className="mt-2 font-serif text-3xl font-semibold text-[#101010]">
                  Built for Institutional Transparency and Accountability
                </h2>
              </div>

              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  {
                    num: '01. Submit & Classify',
                    body: 'Students list unused semester textbooks with ISBN, edition, condition photographs, and subject mapping.'
                  },
                  {
                    num: '02. Super Admin Review',
                    body: 'Every submission stays hidden until the institutional Super Administrator verifies authenticity and approves.'
                  },
                  {
                    num: '03. Controlled Exchange',
                    body: 'Students propose textbook swaps, semester loans, or donation requests with structured approval checkpoints.'
                  },
                  {
                    num: '04. Full Audit Trail',
                    body: 'Every approval, rejection reason, account verification, and completion event is recorded in immutable audit logs.'
                  }
                ].map((step) => (
                  <div key={step.num} className="pt-5 border-t border-[#D8D1C4]">
                    <h3 className="font-serif text-lg font-semibold text-[#101010]">{step.num}</h3>
                    <p className="mt-2.5 text-sm text-neutral-600 leading-relaxed">{step.body}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* EXPLORE BOOKS PAGE */}
        {route === 'explore' && (
          <section className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-[#E3DDD1]">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Verified Academic Catalog</p>
                <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-semibold text-[#101010]">
                  Explore Approved Books
                </h1>
              </div>
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title, author, ISBN, subject..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D8D1C4] rounded text-sm text-[#171717] focus:outline-none focus:border-[#C6A66B]"
                />
              </div>
            </div>

            {/* Filters Bar */}
            <div className="py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 border-b border-[#E3DDD1]">
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="">All Departments</option>
                {metadata?.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.name}
                  </option>
                ))}
              </select>

              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="">All Semesters</option>
                {metadata?.semesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="">All Categories</option>
                {metadata?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <select
                value={listingType}
                onChange={(e) => setListingType(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="">All Formats</option>
                <option value="EXCHANGE">Exchange</option>
                <option value="LEND">Lend</option>
                <option value="DONATION">Donation</option>
              </select>

              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="">Any Condition</option>
                <option value="NEW">New</option>
                <option value="LIKE_NEW">Like New</option>
                <option value="GOOD">Good</option>
                <option value="FAIR">Fair</option>
              </select>

              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs text-[#171717] focus:outline-none focus:border-[#C6A66B]"
              >
                <option value="newest">Sort: Recently Added</option>
                <option value="title_asc">Sort: Title (A–Z)</option>
                <option value="semester_asc">Sort: Semester Order</option>
              </select>
            </div>

            {loadingBooks ? (
              <div className="py-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-96 bg-[#EEEAE1] rounded-md animate-pulse" />
                ))}
              </div>
            ) : books.length === 0 ? (
              <div className="py-20 text-center border border-dashed border-[#D8D1C4] rounded-md mt-8">
                <BookOpen className="w-8 h-8 text-neutral-400 mx-auto" />
                <h3 className="mt-3 font-serif text-xl font-semibold text-[#101010]">No Matching Approved Books</h3>
                <p className="mt-1.5 text-sm text-neutral-500">
                  Adjust your search query or academic filters to explore other available volumes.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setDepartmentId('');
                    setSemesterId('');
                    setCategoryId('');
                    setListingType('');
                    setCondition('');
                  }}
                  className="mt-4 px-4 py-2 text-xs font-medium bg-[#171717] text-[#F7F5EF] rounded cursor-pointer"
                >
                  Clear All Filters
                </button>
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {books.map((book) => (
                  <article
                    key={book.listing_id}
                    onClick={() => setSelectedBook(book)}
                    className="group bg-white border border-[#E2DBD0] rounded-md overflow-hidden flex flex-col cursor-pointer hover:border-[#C6A66B] transition-colors"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden bg-[#EEEAE1]">
                      <BookCoverImage
                        src={book.cover_image_url}
                        title={book.title}
                        author={book.author}
                        className="w-full h-full group-hover:scale-[1.02] transition-transform duration-300"
                      />
                    </div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>{book.department_code || 'GEN'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{book.semester_label || 'All'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{book.listing_type.toLowerCase()}</span>
                      </div>
                      <h3 className="mt-2 font-serif text-lg font-semibold text-[#101010] leading-snug line-clamp-2">
                        {book.title}
                      </h3>
                      <p className="mt-1 text-xs text-neutral-600 truncate">{book.author}</p>
                      <div className="mt-auto pt-4 flex items-center justify-between border-t border-[#F0ECE4] text-xs">
                        <span className="text-neutral-600">{book.condition.replace('_', ' ')}</span>
                        <span className="font-medium text-[#8A7040]">View Details</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {/* HOW IT WORKS PAGE */}
        {route === 'how-it-works' && (
          <section className="max-w-5xl mx-auto px-6 py-16">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Operational Architecture</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold text-[#101010]">
              How Athenaeum Governs Academic Book Circulation
            </h1>
            <p className="mt-4 text-base text-neutral-600 leading-relaxed max-w-3xl">
              Unlike unmoderated bulletin boards, every student, textbook listing, exchange proposal, and donation passes through verified checkpoints managed by the Super Administrator.
            </p>

            <div className="mt-12 space-y-8">
              {[
                {
                  step: '01. Student Onboarding & Verification',
                  detail:
                    'Students register with their institutional email, Student ID number, department, and semester. Profiles enter the Super Administrator verification queue.'
                },
                {
                  step: '02. Book Submission & Quality Gate',
                  detail:
                    'Students upload cover photographs, edition details, ISBN, and physical condition notes. Submissions remain invisible to the public catalog until formally approved.'
                },
                {
                  step: '03. Structured Exchange & Donation Requests',
                  detail:
                    'Scholars browse approved books and submit exchange proposals (optionally offering one of their own approved books) or donation requests with academic purpose.'
                },
                {
                  step: '04. Administrative Decision & Immutable Audit',
                  detail:
                    'The Super Administrator approves or rejects requests with recorded reasons, updates book availability atomically, dispatches student notifications, and logs every action.'
                }
              ].map((item) => (
                <div key={item.step} className="p-7 bg-[#EEEAE1]/70 border border-[#DFD8CA] rounded-md">
                  <h2 className="font-serif text-xl font-semibold text-[#101010]">{item.step}</h2>
                  <p className="mt-2.5 text-sm text-neutral-700 leading-relaxed">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ABOUT PAGE */}
        {route === 'about' && (
          <section className="max-w-5xl mx-auto px-6 py-16">
            <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Institutional Mission</p>
            <h1 className="mt-3 font-serif text-4xl font-semibold text-[#101010]">
              Sustainable Textbook Access for Modern Academic Communities
            </h1>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-10 text-sm text-neutral-700 leading-relaxed">
              <div className="space-y-4">
                <p>
                  Every semester, university students purchase new editions of core engineering, economics, and sciences textbooks while identical verified copies sit unused on campus shelves.
                </p>
                <p>
                  Athenaeum bridges this gap by combining peer-to-peer academic book exchange, structured textbook donations, and centralized institutional oversight in a unified digital ecosystem.
                </p>
              </div>
              <div className="p-6 bg-[#EEEAE1] border border-[#DDD5C7] rounded-md space-y-4">
                <h2 className="font-serif text-xl font-semibold text-[#101010]">Core Governance Pillars</h2>
                <ul className="space-y-2.5 text-sm text-neutral-700">
                  <li>Zero unverified listings in the public or student catalog</li>
                  <li>Complete separation of Student and Super Administrator portals</li>
                  <li>Mandatory recorded reasoning for rejections and suspensions</li>
                  <li>Department, semester, and subject-level academic indexing</li>
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* CONTACT PAGE */}
        {route === 'contact' && (
          <section className="max-w-4xl mx-auto px-6 py-16">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
              <div className="md:col-span-5">
                <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Institutional Desk</p>
                <h1 className="mt-3 font-serif text-3xl font-semibold text-[#101010]">Contact Administration</h1>
                <p className="mt-3 text-sm text-neutral-600 leading-relaxed">
                  Reach out for institutional onboarding, department taxonomy updates, or student verification inquiries. Messages are routed directly to the Super Administrator dashboard.
                </p>
                <div className="mt-8 space-y-3 text-sm text-neutral-700 border-t border-[#E3DDD1] pt-6">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-[#8A7040]" />
                    <span>patilakash74850@gmail.com</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal className="w-4 h-4 text-[#8A7040]" />
                    <span>Mon–Sat · Academic Governance Hours</span>
                  </div>
                </div>
              </div>

              <div className="md:col-span-7 bg-white border border-[#E0D9CC] rounded-md p-7">
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Institutional Email</label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Subject</label>
                    <input
                      type="text"
                      required
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Message</label>
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  {contactStatus && (
                    <p className={`text-xs ${contactStatus.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {contactStatus.text}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={contactSubmitting}
                    className="px-6 py-2.5 bg-[#171717] text-[#F7F5EF] text-sm font-medium rounded hover:bg-[#292929] transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {contactSubmitting ? 'Sending...' : 'Submit Inquiry'}
                  </button>
                </form>
              </div>
            </div>
          </section>
        )}

        {/* STUDENT LOGIN PAGE */}
        {route === 'student-login' && (
          <section className="max-w-md mx-auto px-6 py-16">
            <div className="bg-white border border-[#E0D9CC] rounded-md p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Scholar Portal</p>
              <h1 className="mt-2 font-serif text-3xl font-semibold text-[#101010]">Student Sign In</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Access your book listings, exchange requests, and academic notifications.
              </p>

              <form onSubmit={handleStudentLogin} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Institutional Email</label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="student@university.edu"
                    className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Password</label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
                {authError && <p className="text-xs text-rose-700">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-[#171717] hover:bg-[#292929] text-[#F7F5EF] text-sm font-medium rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Signing In...' : 'Sign In to Student Portal'}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-[#ECE6DA] space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('ananya.sharma@university.edu');
                    setLoginPassword('ScholarDemo2026!');
                    setAuthError('');
                  }}
                  className="w-full py-2 px-3 border border-[#D8D1C4] bg-[#F7F5EF] hover:bg-[#EEEAE1] text-xs font-medium text-[#171717] rounded transition-colors cursor-pointer"
                >
                  Fill Sample Student Credentials (Ananya Sharma)
                </button>
                <div className="flex items-center justify-between text-xs text-neutral-600 pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigate('student-register')}
                    className="hover:text-[#101010] underline cursor-pointer"
                  >
                    New student? Register
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('owner-login')}
                    className="inline-flex items-center gap-1 text-[#8A7040] hover:text-[#101010] cursor-pointer"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Owner Portal</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* STUDENT REGISTER PAGE */}
        {route === 'student-register' && (
          <section className="max-w-lg mx-auto px-6 py-12">
            <div className="bg-white border border-[#E0D9CC] rounded-md p-8">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">
                <UserPlus className="w-4 h-4" />
                <span>Academic Onboarding</span>
              </div>
              <h1 className="mt-2 font-serif text-3xl font-semibold text-[#101010]">Student Registration</h1>
              <p className="mt-2 text-sm text-neutral-600">
                Create your verified scholar profile to list, exchange, and donate academic books.
              </p>

              <form onSubmit={handleStudentRegister} className="mt-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={regForm.fullName}
                      onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                      placeholder="Full legal name"
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Student ID Number</label>
                    <input
                      type="text"
                      required
                      value={regForm.studentIdNumber}
                      onChange={(e) => setRegForm({ ...regForm, studentIdNumber: e.target.value })}
                      placeholder="e.g. ATH-2026-0412"
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Institutional Email</label>
                  <input
                    type="email"
                    required
                    value={regForm.email}
                    onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                    placeholder="name@university.edu"
                    className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Department</label>
                    <select
                      required
                      value={regForm.departmentId}
                      onChange={(e) => setRegForm({ ...regForm, departmentId: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm bg-white focus:outline-none focus:border-[#C6A66B]"
                    >
                      <option value="">Select department</option>
                      {metadata?.departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Current Semester</label>
                    <select
                      required
                      value={regForm.semesterId}
                      onChange={(e) => setRegForm({ ...regForm, semesterId: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm bg-white focus:outline-none focus:border-[#C6A66B]"
                    >
                      <option value="">Select semester</option>
                      {metadata?.semesters.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Phone (Optional)</label>
                    <input
                      type="text"
                      value={regForm.phone}
                      onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                      placeholder="+91 ..."
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Password</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={regForm.password}
                      onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3.5 py-2.5 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                    />
                  </div>
                </div>

                {authError && <p className="text-xs text-rose-700">{authError}</p>}
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-2.5 px-4 bg-[#171717] hover:bg-[#292929] text-[#F7F5EF] text-sm font-medium rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {authLoading ? 'Creating Account...' : 'Create Student Account'}
                </button>
              </form>

              <p className="mt-5 text-xs text-neutral-600 text-center">
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('student-login')}
                  className="underline text-[#101010] cursor-pointer"
                >
                  Sign in here
                </button>
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Public Book Details Modal */}
      {selectedBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl bg-[#F7F5EF] border border-[#D8D1C4] rounded-md overflow-hidden grid grid-cols-1 md:grid-cols-12">
            <div className="md:col-span-5 bg-[#EEEAE1] aspect-[3/4] md:aspect-auto">
              <BookCoverImage
                src={selectedBook.cover_image_url}
                title={selectedBook.title}
                author={selectedBook.author}
                className="w-full h-full"
              />
            </div>
            <div className="md:col-span-7 p-6 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="text-xs text-[#8A7040] font-medium uppercase tracking-[0.14em]">
                  {selectedBook.listing_type} · {selectedBook.condition.replace('_', ' ')}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="p-1 text-neutral-500 hover:text-[#101010] cursor-pointer"
                  aria-label="Close book details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <h2 className="mt-2 font-serif text-2xl font-semibold text-[#101010] leading-snug">
                {selectedBook.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">{selectedBook.author}</p>

              <div className="mt-4 py-3 border-y border-[#E3DDD1] grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <span className="text-neutral-500">Department:</span>{' '}
                  <span className="font-medium text-[#171717]">{selectedBook.department_name || 'General'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Semester:</span>{' '}
                  <span className="font-medium text-[#171717]">{selectedBook.semester_label || 'All'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Edition:</span>{' '}
                  <span className="font-medium text-[#171717]">{selectedBook.edition || 'Standard'}</span>
                </div>
                <div>
                  <span className="text-neutral-500">ISBN:</span>{' '}
                  <span className="font-mono text-[#171717]">{selectedBook.isbn || 'N/A'}</span>
                </div>
              </div>

              <p className="mt-4 text-sm text-neutral-700 leading-relaxed line-clamp-4">
                {selectedBook.description || selectedBook.notes}
              </p>

              <div className="mt-4 flex items-center justify-between text-xs text-neutral-600">
                <span>Listed by {selectedBook.owner_name || 'Verified Scholar'}</span>
                <StatusIndicator status={selectedBook.approval_status} />
              </div>

              <div className="mt-auto pt-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBook(null);
                    onNavigate('student-login');
                  }}
                  className="flex-1 py-2.5 px-4 bg-[#171717] hover:bg-[#292929] text-[#F7F5EF] text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Sign In to Request Volume
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Institutional Footer */}
      <footer className="border-t border-[#E3DDD1] bg-[#EEEAE1]/60 py-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <p className="font-serif text-lg font-semibold text-[#101010]">Athenaeum</p>
            <p className="mt-1 text-xs text-neutral-600">
              Smart Student Library & Book Exchange System · Institutional Resource Governance
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs text-neutral-600">
            <button type="button" onClick={() => onNavigate('explore')} className="hover:text-[#101010] cursor-pointer">
              Explore Books
            </button>
            <button type="button" onClick={() => onNavigate('how-it-works')} className="hover:text-[#101010] cursor-pointer">
              Governance
            </button>
            <button type="button" onClick={() => onNavigate('student-login')} className="hover:text-[#101010] cursor-pointer">
              Student Login
            </button>
            <button
              type="button"
              onClick={() => onNavigate('owner-login')}
              className="inline-flex items-center gap-1.5 text-[#8A7040] hover:text-[#101010] font-medium cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Owner Portal Login</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
