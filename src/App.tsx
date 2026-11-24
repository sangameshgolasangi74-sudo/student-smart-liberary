import { useEffect, useState } from 'react';
import { apiRequest, setAuthToken } from './lib/api';
import { PublicPortal, type PublicRoute } from './pages/PublicPortal';
import { StudentPortal } from './pages/StudentPortal';
import { OwnerPortal } from './pages/OwnerPortal';
import type { PublicMetadata, StudentProfile, User } from './types';

export default function App() {
  const [publicRoute, setPublicRoute] = useState<PublicRoute>('home');
  const [metadata, setMetadata] = useState<PublicMetadata | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  async function loadMetadata() {
    try {
      const res = await apiRequest<PublicMetadata>('/api/public/metadata');
      setMetadata(res);
    } catch {
      // Ignore transient load error
    }
  }

  async function refreshSession() {
    try {
      const res = await apiRequest<{
        user: User;
        profile: StudentProfile | null;
        unreadNotifications: number;
      }>('/api/auth/me');
      setUser(res.user);
      setProfile(res.profile);
      setUnreadCount(res.unreadNotifications);
    } catch {
      setAuthToken(null);
      setUser(null);
      setProfile(null);
      setUnreadCount(0);
    }
  }

  useEffect(() => {
    loadMetadata();
  }, []);

  async function handleAuthenticated(loggedInUser: User) {
    setUser(loggedInUser);
    await refreshSession();
    await loadMetadata();
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setProfile(null);
    setUnreadCount(0);
    setPublicRoute('home');
    loadMetadata();
  }

  // Strict Role-Based Portal Separation:
  // Portal A: Owner / Super Administrator (Dark Luxury Theme)
  if (user && user.role === 'SUPER_ADMIN') {
    return (
      <OwnerPortal
        user={user}
        metadata={metadata}
        unreadCount={unreadCount}
        onRefreshMetadata={loadMetadata}
        onRefreshSession={refreshSession}
        onLogout={handleLogout}
      />
    );
  }

  // Portal B: Student / Scholar (Light Luxury Theme)
  if (user && user.role === 'STUDENT') {
    return (
      <StudentPortal
        user={user}
        profile={profile}
        metadata={metadata}
        unreadCount={unreadCount}
        onRefreshSession={refreshSession}
        onLogout={handleLogout}
      />
    );
  }

  // Public Academic Showcase & Authentication Entry
  return (
    <PublicPortal
      route={publicRoute}
      onNavigate={(next) => {
        setPublicRoute(next);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
      metadata={metadata}
      onAuthenticated={handleAuthenticated}
    />
  );
}
