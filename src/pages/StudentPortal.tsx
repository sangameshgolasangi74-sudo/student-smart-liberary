import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Bell,
  BookOpen,
  BookPlus,
  Compass,
  Flag,
  Gift,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  User as UserIcon,
  X
} from 'lucide-react';
import { apiRequest, uploadImageFile } from '../lib/api';
import { BookCoverImage } from '../components/BookCoverImage';
import { StatusIndicator } from '../components/StatusIndicator';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type {
  Announcement,
  AuditLogItem,
  BookListing,
  DonationRequest,
  ExchangeRequest,
  NotificationItem,
  PublicMetadata,
  StudentProfile,
  User
} from '../types';

type StudentPage =
  | 'dashboard'
  | 'explore'
  | 'book-details'
  | 'submit-book'
  | 'my-listings'
  | 'exchanges'
  | 'donations'
  | 'notifications'
  | 'profile'
  | 'activity';

interface StudentPortalProps {
  user: User;
  profile: StudentProfile | null;
  metadata: PublicMetadata | null;
  unreadCount: number;
  onRefreshSession: () => Promise<void>;
  onLogout: () => void;
}

const COVER_PRESETS = [
  { label: 'Computer Science (Sage)', url: '/src/assets/images/book_cover_algorithms_1795534389311.jpg' },
  { label: 'Physics & Engineering (Charcoal)', url: '/src/assets/images/book_cover_physics_1795534389691.jpg' },
  { label: 'Economics (Ivory)', url: '/src/assets/images/book_cover_economics_1795534389897.jpg' },
  { label: 'Architecture (Onyx)', url: '/src/assets/images/book_cover_architecture_1795534391035.jpg' }
];

export function StudentPortal({
  user,
  profile,
  metadata,
  unreadCount,
  onRefreshSession,
  onLogout
}: StudentPortalProps) {
  const [page, setPage] = useState<StudentPage>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dashboard
  const [dashData, setDashData] = useState<{
    metrics: {
      myListingsCount: number;
      pendingRequestsCount: number;
      approvedRequestsCount: number;
      completedExchangesCount: number;
      availableBooksCount: number;
    };
    recentlyAdded: BookListing[];
    recommended: BookListing[];
    notifications: NotificationItem[];
    announcements: Announcement[];
  } | null>(null);

  // Explore
  const [catalogBooks, setCatalogBooks] = useState<BookListing[]>([]);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [semesterId, setSemesterId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [listingType, setListingType] = useState('');
  const [condition, setCondition] = useState('');
  const [sort, setSort] = useState('newest');
  const [selectedBook, setSelectedBook] = useState<BookListing | null>(null);

  // Book Details Request form
  const [requestMessage, setRequestMessage] = useState('');
  const [offeredListingId, setOfferedListingId] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

  // Submit Book
  const [submitForm, setSubmitForm] = useState({
    title: '',
    author: '',
    isbn: '',
    edition: '',
    publisher: '',
    publicationYear: '2024',
    description: '',
    categoryId: '',
    departmentId: profile?.department_id ? String(profile.department_id) : '',
    semesterId: profile?.semester_id ? String(profile.semester_id) : '',
    subjectId: '',
    listingType: 'EXCHANGE',
    condition: 'LIKE_NEW',
    notes: '',
    coverImageUrl: COVER_PRESETS[0].url
  });
  const [uploadingImage, setUploadingImage] = useState(false);
  const [submittingBook, setSubmittingBook] = useState(false);

  // My Listings, Exchanges, Donations, Notifications, Activity
  const [myListings, setMyListings] = useState<BookListing[]>([]);
  const [exchanges, setExchanges] = useState<{ outgoing: ExchangeRequest[]; incoming: ExchangeRequest[] }>({
    outgoing: [],
    incoming: []
  });
  const [donations, setDonations] = useState<{ myDonations: BookListing[]; myDonationRequests: DonationRequest[] }>({
    myDonations: [],
    myDonationRequests: []
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activities, setActivities] = useState<AuditLogItem[]>([]);

  // Profile
  const [profileForm, setProfileForm] = useState({
    fullName: profile?.full_name || '',
    departmentId: profile?.department_id ? String(profile.department_id) : '',
    semesterId: profile?.semester_id ? String(profile.semester_id) : '',
    phone: profile?.phone || '',
    bio: profile?.bio || ''
  });
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '' });

  // Confirmation Dialog
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        fullName: profile.full_name,
        departmentId: profile.department_id ? String(profile.department_id) : '',
        semesterId: profile.semester_id ? String(profile.semester_id) : '',
        phone: profile.phone,
        bio: profile.bio
      });
    }
  }, [profile]);

  useEffect(() => {
    loadPageData(page);
  }, [page]);

  useEffect(() => {
    if (page === 'explore') {
      loadCatalog();
    }
  }, [search, departmentId, semesterId, categoryId, listingType, condition, sort]);

  async function loadPageData(target: StudentPage) {
    try {
      if (target === 'dashboard') {
        const res = await apiRequest<typeof dashData>('/api/student/dashboard');
        setDashData(res);
      } else if (target === 'explore') {
        await loadCatalog();
        const lst = await apiRequest<{ listings: BookListing[] }>('/api/student/listings');
        setMyListings(lst.listings);
      } else if (target === 'book-details') {
        const lst = await apiRequest<{ listings: BookListing[] }>('/api/student/listings');
        setMyListings(lst.listings);
      } else if (target === 'my-listings') {
        const lst = await apiRequest<{ listings: BookListing[] }>('/api/student/listings');
        setMyListings(lst.listings);
      } else if (target === 'exchanges') {
        const ex = await apiRequest<{ outgoing: ExchangeRequest[]; incoming: ExchangeRequest[] }>('/api/student/exchanges');
        setExchanges(ex);
      } else if (target === 'donations') {
        const don = await apiRequest<{ myDonations: BookListing[]; myDonationRequests: DonationRequest[] }>('/api/student/donations');
        setDonations(don);
      } else if (target === 'notifications') {
        const notifs = await apiRequest<{ notifications: NotificationItem[] }>('/api/student/notifications');
        setNotifications(notifs.notifications);
      } else if (target === 'activity') {
        const act = await apiRequest<{ activities: AuditLogItem[] }>('/api/student/activity');
        setActivities(act.activities);
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load records.' });
    }
  }

  async function loadCatalog() {
    const qs = new URLSearchParams();
    if (search.trim()) qs.set('search', search.trim());
    if (departmentId) qs.set('departmentId', departmentId);
    if (semesterId) qs.set('semesterId', semesterId);
    if (categoryId) qs.set('categoryId', categoryId);
    if (listingType) qs.set('listingType', listingType);
    if (condition) qs.set('condition', condition);
    if (sort) qs.set('sort', sort);
    const data = await apiRequest<{ books: BookListing[] }>(`/api/public/books?${qs.toString()}`);
    setCatalogBooks(data.books);
  }

  function openBookDetails(book: BookListing) {
    setSelectedBook(book);
    setRequestMessage('');
    setOfferedListingId('');
    setPage('book-details');
  }

  async function handleRequestBook(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBook) return;
    const listingId = selectedBook.listing_id ?? selectedBook.id;
    setRequestSubmitting(true);
    setBannerMsg(null);
    try {
      if (selectedBook.listing_type === 'DONATION') {
        await apiRequest('/api/student/donations/request', {
          method: 'POST',
          body: JSON.stringify({ listingId, purpose: requestMessage })
        });
        setBannerMsg({ type: 'success', text: 'Donation request submitted and queued for Super Administrator review.' });
        setPage('donations');
      } else {
        await apiRequest('/api/student/exchanges', {
          method: 'POST',
          body: JSON.stringify({
            listingId,
            offeredListingId: offeredListingId ? Number(offeredListingId) : null,
            message: requestMessage
          })
        });
        setBannerMsg({ type: 'success', text: 'Exchange request submitted and queued for Super Administrator review.' });
        setPage('exchanges');
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Request failed.' });
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    setBannerMsg(null);
    try {
      const url = await uploadImageFile(file);
      setSubmitForm((prev) => ({ ...prev, coverImageUrl: url }));
      setBannerMsg({ type: 'success', text: 'Book cover image uploaded securely.' });
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Image upload failed.' });
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleSubmitBook(e: React.FormEvent) {
    e.preventDefault();
    setSubmittingBook(true);
    setBannerMsg(null);
    try {
      await apiRequest('/api/student/listings', {
        method: 'POST',
        body: JSON.stringify({
          ...submitForm,
          publicationYear: submitForm.publicationYear ? Number(submitForm.publicationYear) : null,
          categoryId: submitForm.categoryId ? Number(submitForm.categoryId) : null,
          departmentId: submitForm.departmentId ? Number(submitForm.departmentId) : null,
          semesterId: submitForm.semesterId ? Number(submitForm.semesterId) : null,
          subjectId: submitForm.subjectId ? Number(submitForm.subjectId) : null
        })
      });
      setBannerMsg({
        type: 'success',
        text: 'Book submitted successfully. It remains pending until approved by the Super Administrator.'
      });
      setSubmitForm({
        title: '',
        author: '',
        isbn: '',
        edition: '',
        publisher: '',
        publicationYear: '2024',
        description: '',
        categoryId: '',
        departmentId: profile?.department_id ? String(profile.department_id) : '',
        semesterId: profile?.semester_id ? String(profile.semester_id) : '',
        subjectId: '',
        listingType: 'EXCHANGE',
        condition: 'LIKE_NEW',
        notes: '',
        coverImageUrl: COVER_PRESETS[0].url
      });
      setPage('my-listings');
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Book submission failed.' });
    } finally {
      setSubmittingBook(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBannerMsg(null);
    try {
      await apiRequest('/api/student/profile', {
        method: 'PUT',
        body: JSON.stringify({
          ...profileForm,
          departmentId: profileForm.departmentId ? Number(profileForm.departmentId) : null,
          semesterId: profileForm.semesterId ? Number(profileForm.semesterId) : null
        })
      });
      await onRefreshSession();
      setBannerMsg({ type: 'success', text: 'Academic profile updated.' });
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Profile update failed.' });
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setBannerMsg(null);
    try {
      await apiRequest('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(pwdForm)
      });
      setPwdForm({ currentPassword: '', newPassword: '' });
      setBannerMsg({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Could not update password.' });
    }
  }

  const navLinks: Array<{ id: StudentPage; label: string; icon: typeof LayoutDashboard; badge?: number }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'explore', label: 'Explore Books', icon: Compass },
    { id: 'submit-book', label: 'Submit a Book', icon: BookPlus },
    { id: 'my-listings', label: 'My Listings', icon: Library },
    { id: 'exchanges', label: 'Exchange Requests', icon: RefreshCw },
    { id: 'donations', label: 'Donation Requests', icon: Gift },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'My Profile', icon: UserIcon },
    { id: 'activity', label: 'Activity History', icon: Activity }
  ];

  const myApprovedAvailable = myListings.filter(
    (l) => l.approval_status === 'APPROVED' && l.availability_status === 'AVAILABLE' && l.listing_type !== 'DONATION'
  );

  return (
    <div className="min-h-screen bg-[#F7F5EF] text-[#171717] flex">
      {/* Desktop Sidebar (Light Luxury Ivory & Soft Cream) */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-[#EEEAE1] border-r border-[#DFD8CA] shrink-0">
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#DFD8CA]">
          <span className="font-serif text-xl font-semibold tracking-tight text-[#101010]">Athenaeum</span>
        </div>

        <div className="px-5 py-4 border-b border-[#DFD8CA]">
          <p className="text-sm font-semibold text-[#101010] truncate">{profile?.full_name || user.email}</p>
          <p className="text-xs text-neutral-600 truncate mt-0.5">{profile?.student_id_number || 'Student Scholar'}</p>
          <div className="mt-2">
            <StatusIndicator status={profile?.verification_status || 'PENDING'} />
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = page === item.id || (page === 'book-details' && item.id === 'explore');
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setBannerMsg(null);
                  setPage(item.id);
                }}
                className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#171717] text-[#F7F5EF]'
                    : 'text-neutral-700 hover:bg-[#E4DEC9]/60 hover:text-[#101010]'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge ? (
                  <span className="font-mono text-xs tabular-nums px-1.5 py-0.5 rounded bg-[#C6A66B] text-[#101010]">
                    {item.badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#DFD8CA]">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-neutral-700 hover:text-[#101010] hover:bg-[#E4DEC9]/60 rounded transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[#F7F5EF]/95 border-b border-[#E3DDD1] px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded hover:bg-[#EEEAE1]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-xs text-neutral-500 truncate">
              Student Portal <span className="mx-1.5">/</span>{' '}
              <span className="text-[#101010] font-medium capitalize">{page.replace('-', ' ')}</span>
            </p>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setPage('submit-book')}
              className="px-4 py-2 bg-[#171717] text-[#F7F5EF] text-xs font-medium rounded hover:bg-[#292929] transition-colors whitespace-nowrap cursor-pointer"
            >
              Submit a Book
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="fixed inset-0 bg-black/40" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-72 bg-[#EEEAE1] h-full flex flex-col p-4 z-10">
              <div className="flex items-center justify-between pb-4 border-b border-[#DFD8CA]">
                <span className="font-serif text-lg font-semibold">Athenaeum</span>
                <button type="button" onClick={() => setMobileNavOpen(false)} className="p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
                {navLinks.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPage(item.id);
                        setMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-sm font-medium ${
                        page === item.id ? 'bg-[#171717] text-[#F7F5EF]' : 'text-neutral-700'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.badge ? <span className="font-mono text-xs">{item.badge}</span> : null}
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-neutral-700 border-t border-[#DFD8CA]"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {bannerMsg && (
            <div
              className={`mb-6 px-4 py-3 rounded border text-sm flex items-center justify-between gap-4 ${
                bannerMsg.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <span>{bannerMsg.text}</span>
              <button type="button" onClick={() => setBannerMsg(null)} className="text-xs underline shrink-0 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* 1. STUDENT DASHBOARD */}
          {page === 'dashboard' && (
            <div className="space-y-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-[#E3DDD1]">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#8A7040] font-medium">Scholar Overview</p>
                  <h1 className="mt-1.5 font-serif text-3xl font-semibold text-[#101010]">
                    Welcome back, {profile?.full_name || 'Scholar'}
                  </h1>
                  <p className="mt-1 text-sm text-neutral-600">
                    {profile?.department_name || 'Academic Member'} · {profile?.semester_label || 'Current Term'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setPage('explore')}
                  className="px-4 py-2 border border-[#D4CCB9] bg-white hover:bg-[#EEEAE1] text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                >
                  Browse All {dashData?.metrics.availableBooksCount ?? 0} Available Books
                </button>
              </div>

              {/* 4 Concise Metrics */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                {[
                  { label: 'My Listed Books', value: dashData?.metrics.myListingsCount ?? 0 },
                  { label: 'Pending Requests', value: dashData?.metrics.pendingRequestsCount ?? 0 },
                  { label: 'Approved Requests', value: dashData?.metrics.approvedRequestsCount ?? 0 },
                  { label: 'Completed Exchanges', value: dashData?.metrics.completedExchangesCount ?? 0 }
                ].map((m) => (
                  <div key={m.label} className="bg-white border border-[#E2DBD0] rounded-md p-5">
                    <p className="text-xs text-neutral-500">{m.label}</p>
                    <p className="mt-2 font-serif text-3xl font-semibold text-[#101010] tabular-nums">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Announcements */}
              {dashData?.announcements && dashData.announcements.length > 0 && (
                <div className="bg-[#EEEAE1] border border-[#DDD5C7] rounded-md p-6">
                  <p className="text-xs uppercase tracking-[0.16em] text-[#8A7040] font-medium">Institutional Announcements</p>
                  <div className="mt-4 divide-y divide-[#DFD8CA]">
                    {dashData.announcements.map((a) => (
                      <div key={a.id} className="py-3 first:pt-0 last:pb-0">
                        <h3 className="font-serif text-base font-semibold text-[#101010]">{a.title}</h3>
                        <p className="mt-1 text-sm text-neutral-700">{a.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended for Department/Semester */}
              <div>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="font-serif text-2xl font-semibold text-[#101010]">Recommended Academic Volumes</h2>
                  <button type="button" onClick={() => setPage('explore')} className="text-xs font-medium text-[#8A7040] hover:underline cursor-pointer">
                    Explore full catalog
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {(dashData?.recommended || []).map((book) => (
                    <article
                      key={book.listing_id}
                      onClick={() => openBookDetails(book)}
                      className="bg-white border border-[#E2DBD0] rounded-md overflow-hidden flex flex-col cursor-pointer hover:border-[#C6A66B] transition-colors"
                    >
                      <div className="aspect-[3/4] bg-[#EEEAE1]">
                        <BookCoverImage src={book.cover_image_url} title={book.title} author={book.author} className="w-full h-full" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <p className="text-xs text-neutral-500">
                          {book.department_code || 'GEN'} · {book.semester_label || 'All'}
                        </p>
                        <h3 className="mt-1.5 font-serif text-base font-semibold text-[#101010] line-clamp-2">{book.title}</h3>
                        <p className="mt-1 text-xs text-neutral-600 truncate">{book.author}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {/* Recent Notifications */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-serif text-2xl font-semibold text-[#101010]">Recent Notifications</h2>
                  <button type="button" onClick={() => setPage('notifications')} className="text-xs font-medium text-[#8A7040] hover:underline cursor-pointer">
                    View all
                  </button>
                </div>
                <div className="bg-white border border-[#E2DBD0] rounded-md divide-y divide-[#EFEAE0]">
                  {(dashData?.notifications || []).length === 0 ? (
                    <p className="p-6 text-sm text-neutral-500">No notifications yet.</p>
                  ) : (
                    dashData?.notifications.map((n) => (
                      <div key={n.id} className="p-4 flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-[#101010]">{n.title}</p>
                          <p className="mt-0.5 text-xs text-neutral-600">{n.message}</p>
                        </div>
                        <span className="font-mono text-xs text-neutral-400 shrink-0 tabular-nums">
                          {n.created_at.slice(0, 10)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 2. EXPLORE BOOKS */}
          {page === 'explore' && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-5 border-b border-[#E3DDD1]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold text-[#101010]">Explore Approved Books</h1>
                  <p className="mt-1 text-sm text-neutral-600">Only verified listings approved by the Super Administrator appear here.</p>
                </div>
                <div className="relative w-full md:w-80">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Title, author, ISBN, subject..."
                    className="w-full pl-9 pr-3 py-2 bg-white border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="">All Departments</option>
                  {metadata?.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.code} — {d.name}</option>
                  ))}
                </select>
                <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="">All Semesters</option>
                  {metadata?.semesters.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="">All Categories</option>
                  {metadata?.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <select value={listingType} onChange={(e) => setListingType(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="">All Types</option>
                  <option value="EXCHANGE">Exchange</option>
                  <option value="LEND">Lend</option>
                  <option value="DONATION">Donation</option>
                </select>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="">Any Condition</option>
                  <option value="NEW">New</option>
                  <option value="LIKE_NEW">Like New</option>
                  <option value="GOOD">Good</option>
                  <option value="FAIR">Fair</option>
                </select>
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="px-3 py-2 bg-white border border-[#D8D1C4] rounded text-xs">
                  <option value="newest">Newest First</option>
                  <option value="title_asc">Title A–Z</option>
                  <option value="semester_asc">Semester Order</option>
                </select>
              </div>

              {catalogBooks.length === 0 ? (
                <div className="py-16 text-center bg-white border border-[#E2DBD0] rounded-md">
                  <BookOpen className="w-8 h-8 text-neutral-400 mx-auto" />
                  <p className="mt-3 font-serif text-lg font-semibold">No books match your filters</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {catalogBooks.map((book) => (
                    <article
                      key={book.listing_id}
                      onClick={() => openBookDetails(book)}
                      className="bg-white border border-[#E2DBD0] rounded-md overflow-hidden flex flex-col cursor-pointer hover:border-[#C6A66B] transition-colors"
                    >
                      <div className="aspect-[3/4] bg-[#EEEAE1]">
                        <BookCoverImage src={book.cover_image_url} title={book.title} author={book.author} className="w-full h-full" />
                      </div>
                      <div className="p-4 flex-1 flex flex-col">
                        <p className="text-xs text-neutral-500">
                          {book.department_code || 'GEN'} · {book.semester_label || 'All'} · {book.listing_type}
                        </p>
                        <h3 className="mt-1.5 font-serif text-base font-semibold text-[#101010] line-clamp-2">{book.title}</h3>
                        <p className="mt-1 text-xs text-neutral-600 truncate">{book.author}</p>
                        <div className="mt-auto pt-3 flex items-center justify-between text-xs border-t border-[#F0ECE4]">
                          <span className="text-neutral-500">{book.condition.replace('_', ' ')}</span>
                          <span className="text-[#8A7040] font-medium">View Volume</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 3. BOOK DETAILS */}
          {page === 'book-details' && selectedBook && (
            <div className="space-y-6">
              <button
                type="button"
                onClick={() => setPage('explore')}
                className="inline-flex items-center gap-2 text-xs font-medium text-neutral-600 hover:text-[#101010] cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Explore Books</span>
              </button>

              <div className="bg-white border border-[#E2DBD0] rounded-md overflow-hidden grid grid-cols-1 lg:grid-cols-12">
                <div className="lg:col-span-5 bg-[#EEEAE1] min-h-[380px]">
                  <BookCoverImage
                    src={selectedBook.cover_image_url}
                    title={selectedBook.title}
                    author={selectedBook.author}
                    className="w-full h-full"
                  />
                </div>
                <div className="lg:col-span-7 p-8 flex flex-col">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs uppercase tracking-[0.16em] text-[#8A7040] font-medium">
                      {selectedBook.listing_type} · {selectedBook.condition.replace('_', ' ')}
                    </span>
                    <StatusIndicator status={selectedBook.availability_status} />
                  </div>
                  <h1 className="mt-2 font-serif text-3xl font-semibold text-[#101010]">{selectedBook.title}</h1>
                  <p className="mt-1 text-base text-neutral-600">{selectedBook.author}</p>

                  <div className="mt-6 py-4 border-y border-[#ECE6DA] grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <p className="text-neutral-500">Department</p>
                      <p className="mt-0.5 font-medium text-[#101010]">{selectedBook.department_name || 'General'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Semester</p>
                      <p className="mt-0.5 font-medium text-[#101010]">{selectedBook.semester_label || 'All'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Category</p>
                      <p className="mt-0.5 font-medium text-[#101010]">{selectedBook.category_name || 'Academic'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Edition</p>
                      <p className="mt-0.5 font-medium text-[#101010]">{selectedBook.edition || 'Standard'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">ISBN</p>
                      <p className="mt-0.5 font-mono text-[#101010]">{selectedBook.isbn || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-500">Listed By</p>
                      <p className="mt-0.5 font-medium text-[#101010]">{selectedBook.owner_name || 'Scholar'}</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2 text-sm text-neutral-700 leading-relaxed">
                    <p>{selectedBook.description}</p>
                    {selectedBook.notes && (
                      <p className="text-xs text-neutral-600 bg-[#F7F5EF] p-3 rounded border border-[#EAE4D8]">
                        Owner Notes: {selectedBook.notes}
                      </p>
                    )}
                  </div>

                  {selectedBook.owner_student_id === user.id ? (
                    <div className="mt-8 p-4 bg-[#EEEAE1] rounded text-xs text-neutral-700">
                      This is your own book listing. Manage it under My Listings.
                    </div>
                  ) : (
                    <form onSubmit={handleRequestBook} className="mt-8 pt-6 border-t border-[#ECE6DA] space-y-4">
                      {selectedBook.listing_type !== 'DONATION' && myApprovedAvailable.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                            Offer One of Your Approved Books for Swap (Optional)
                          </label>
                          <select
                            value={offeredListingId}
                            onChange={(e) => setOfferedListingId(e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-[#D8D1C4] rounded text-sm"
                          >
                            <option value="">Direct request (no swap book attached)</option>
                            {myApprovedAvailable.map((mine) => (
                              <option key={mine.id} value={mine.id}>
                                {mine.title} ({mine.condition.replace('_', ' ')})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1.5">
                          {selectedBook.listing_type === 'DONATION' ? 'Academic Purpose / Statement' : 'Message for Exchange Review'}
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={requestMessage}
                          onChange={(e) => setRequestMessage(e.target.value)}
                          placeholder={
                            selectedBook.listing_type === 'DONATION'
                              ? 'Briefly explain your semester coursework need for this donated copy...'
                              : 'Share your preferred exchange schedule or notes...'
                          }
                          className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm focus:outline-none focus:border-[#C6A66B]"
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <button
                          type="submit"
                          disabled={requestSubmitting}
                          className="px-6 py-2.5 bg-[#171717] hover:bg-[#292929] text-[#F7F5EF] text-sm font-medium rounded transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {requestSubmitting
                            ? 'Submitting...'
                            : selectedBook.listing_type === 'DONATION'
                            ? 'Submit Donation Request'
                            : 'Submit Exchange Request'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportDialogOpen(true)}
                          className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-rose-700 cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>Report Listing</span>
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 4. SUBMIT A BOOK */}
          {page === 'submit-book' && (
            <div className="max-w-3xl">
              <div className="pb-5 border-b border-[#E3DDD1]">
                <h1 className="font-serif text-3xl font-semibold text-[#101010]">Submit an Academic Book</h1>
                <p className="mt-1 text-sm text-neutral-600">
                  All submissions enter the Super Administrator approval queue before appearing in the student catalog.
                </p>
              </div>

              <form onSubmit={handleSubmitBook} className="mt-6 bg-white border border-[#E2DBD0] rounded-md p-6 sm:p-8 space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Book Title</label>
                    <input
                      type="text"
                      required
                      value={submitForm.title}
                      onChange={(e) => setSubmitForm({ ...submitForm, title: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Author(s)</label>
                    <input
                      type="text"
                      required
                      value={submitForm.author}
                      onChange={(e) => setSubmitForm({ ...submitForm, author: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">ISBN</label>
                    <input
                      type="text"
                      value={submitForm.isbn}
                      onChange={(e) => setSubmitForm({ ...submitForm, isbn: e.target.value })}
                      placeholder="978-..."
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Edition</label>
                    <input
                      type="text"
                      value={submitForm.edition}
                      onChange={(e) => setSubmitForm({ ...submitForm, edition: e.target.value })}
                      placeholder="e.g. 4th Edition"
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Publication Year</label>
                    <input
                      type="number"
                      value={submitForm.publicationYear}
                      onChange={(e) => setSubmitForm({ ...submitForm, publicationYear: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Department</label>
                    <select
                      value={submitForm.departmentId}
                      onChange={(e) => setSubmitForm({ ...submitForm, departmentId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Select Department</option>
                      {metadata?.departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Semester</label>
                    <select
                      value={submitForm.semesterId}
                      onChange={(e) => setSubmitForm({ ...submitForm, semesterId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Select Semester</option>
                      {metadata?.semesters.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Category</label>
                    <select
                      value={submitForm.categoryId}
                      onChange={(e) => setSubmitForm({ ...submitForm, categoryId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Select Category</option>
                      {metadata?.categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Subject</label>
                    <select
                      value={submitForm.subjectId}
                      onChange={(e) => setSubmitForm({ ...submitForm, subjectId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Optional Subject</option>
                      {metadata?.subjects.map((subj) => (
                        <option key={subj.id} value={subj.id}>{subj.code} — {subj.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Listing Type</label>
                    <select
                      value={submitForm.listingType}
                      onChange={(e) => setSubmitForm({ ...submitForm, listingType: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="EXCHANGE">Peer Exchange</option>
                      <option value="LEND">Semester Lend</option>
                      <option value="DONATION">Academic Donation</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Physical Condition</label>
                    <select
                      value={submitForm.condition}
                      onChange={(e) => setSubmitForm({ ...submitForm, condition: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="NEW">New</option>
                      <option value="LIKE_NEW">Like New</option>
                      <option value="GOOD">Good</option>
                      <option value="FAIR">Fair</option>
                    </select>
                  </div>
                </div>

                {/* Cover Upload */}
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-2">Book Cover Photograph</label>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="w-20 h-28 rounded overflow-hidden border border-[#D8D1C4] shrink-0">
                      <BookCoverImage src={submitForm.coverImageUrl} title={submitForm.title || 'Preview'} className="w-full h-full" />
                    </div>
                    <div className="space-y-2 flex-1 min-w-[200px]">
                      <label className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#D8D1C4] bg-[#F7F5EF] hover:bg-[#EEEAE1] text-xs font-medium rounded cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingImage ? 'Uploading...' : 'Upload Photo (PNG/JPEG/WebP)'}</span>
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFileUpload} />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {COVER_PRESETS.map((p) => (
                          <button
                            key={p.url}
                            type="button"
                            onClick={() => setSubmitForm({ ...submitForm, coverImageUrl: p.url })}
                            className={`px-2.5 py-1 text-xs rounded border cursor-pointer ${
                              submitForm.coverImageUrl === p.url
                                ? 'border-[#171717] bg-[#171717] text-[#F7F5EF]'
                                : 'border-[#D8D1C4] text-neutral-600'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Academic Description</label>
                  <textarea
                    rows={3}
                    value={submitForm.description}
                    onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
                    placeholder="Key topics covered, textbook syllabus relevance..."
                    className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Condition & Exchange Notes</label>
                  <input
                    type="text"
                    value={submitForm.notes}
                    onChange={(e) => setSubmitForm({ ...submitForm, notes: e.target.value })}
                    placeholder="Highlight any annotations, missing inserts, or preferred swap courses..."
                    className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingBook}
                  className="px-6 py-2.5 bg-[#171717] hover:bg-[#292929] text-[#F7F5EF] text-sm font-medium rounded transition-colors cursor-pointer disabled:opacity-50"
                >
                  {submittingBook ? 'Submitting for Approval...' : 'Submit Book for Verification'}
                </button>
              </form>
            </div>
          )}

          {/* 5. MY LISTINGS */}
          {page === 'my-listings' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-5 border-b border-[#E3DDD1]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold text-[#101010]">My Book Listings</h1>
                  <p className="mt-1 text-sm text-neutral-600">Track Super Administrator approval decisions and availability.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPage('submit-book')}
                  className="px-4 py-2 bg-[#171717] text-[#F7F5EF] text-xs font-medium rounded cursor-pointer"
                >
                  New Submission
                </button>
              </div>

              {myListings.length === 0 ? (
                <div className="p-12 text-center bg-white border border-[#E2DBD0] rounded-md">
                  <p className="font-serif text-lg font-semibold">You have not listed any books yet</p>
                  <button
                    type="button"
                    onClick={() => setPage('submit-book')}
                    className="mt-4 px-4 py-2 bg-[#171717] text-[#F7F5EF] text-xs font-medium rounded cursor-pointer"
                  >
                    Submit Your First Book
                  </button>
                </div>
              ) : (
                <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                        <th className="py-3 px-4 font-medium">Volume</th>
                        <th className="py-3 px-4 font-medium">Type</th>
                        <th className="py-3 px-4 font-medium">Approval</th>
                        <th className="py-3 px-4 font-medium">Availability</th>
                        <th className="py-3 px-4 font-medium">Review Notes</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F0ECE4] text-sm">
                      {myListings.map((item) => (
                        <tr key={item.id} className="hover:bg-[#FAF8F4]">
                          <td className="py-3.5 px-4">
                            <p className="font-medium text-[#101010]">{item.title}</p>
                            <p className="text-xs text-neutral-500">{item.author}</p>
                          </td>
                          <td className="py-3.5 px-4 text-xs capitalize">{item.listing_type.toLowerCase()}</td>
                          <td className="py-3.5 px-4"><StatusIndicator status={item.approval_status} /></td>
                          <td className="py-3.5 px-4"><StatusIndicator status={item.availability_status} /></td>
                          <td className="py-3.5 px-4 text-xs text-rose-700 max-w-xs">
                            {item.rejection_reason || <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {item.availability_status !== 'EXCHANGED' && item.availability_status !== 'DONATED' && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    open: true,
                                    title: 'Withdraw Listing',
                                    description: `Remove "${item.title}" from your listings?`,
                                    confirmLabel: 'Withdraw',
                                    destructive: true,
                                    action: async () => {
                                      await apiRequest(`/api/student/listings/${item.id}`, { method: 'DELETE' });
                                      await loadPageData('my-listings');
                                    }
                                  })
                                }
                                className="inline-flex items-center gap-1 text-xs text-rose-700 hover:underline cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Withdraw</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 6. EXCHANGE REQUESTS */}
          {page === 'exchanges' && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#E3DDD1]">
                <h1 className="font-serif text-3xl font-semibold text-[#101010]">Exchange Requests</h1>
                <p className="mt-1 text-sm text-neutral-600">Monitor outgoing requests and incoming proposals on your listed books.</p>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">Outgoing Requests</h2>
                <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                  {exchanges.outgoing.length === 0 ? (
                    <p className="p-6 text-sm text-neutral-500">No outgoing exchange requests.</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                          <th className="py-3 px-4 font-medium">Requested Book</th>
                          <th className="py-3 px-4 font-medium">Owner</th>
                          <th className="py-3 px-4 font-medium">Offered Swap</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium">Admin Note</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE4] text-sm">
                        {exchanges.outgoing.map((ex) => (
                          <tr key={ex.id}>
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#101010]">{ex.book_title}</p>
                              <p className="text-xs text-neutral-500">{ex.book_author}</p>
                            </td>
                            <td className="py-3 px-4 text-xs">{ex.owner_name || 'Scholar'}</td>
                            <td className="py-3 px-4 text-xs">{ex.offered_book_title || 'Direct Request'}</td>
                            <td className="py-3 px-4"><StatusIndicator status={ex.status} /></td>
                            <td className="py-3 px-4 text-xs text-rose-700">{ex.rejection_reason || '—'}</td>
                            <td className="py-3 px-4 text-right">
                              {ex.status === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      title: 'Cancel Exchange Request',
                                      description: `Cancel your pending request for "${ex.book_title}"?`,
                                      confirmLabel: 'Cancel Request',
                                      destructive: true,
                                      action: async () => {
                                        await apiRequest(`/api/student/exchanges/${ex.id}/cancel`, { method: 'POST' });
                                        await loadPageData('exchanges');
                                      }
                                    })
                                  }
                                  className="text-xs text-rose-700 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">Incoming Proposals for My Books</h2>
                <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                  {exchanges.incoming.length === 0 ? (
                    <p className="p-6 text-sm text-neutral-500">No incoming requests yet.</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                          <th className="py-3 px-4 font-medium">My Book</th>
                          <th className="py-3 px-4 font-medium">Requester</th>
                          <th className="py-3 px-4 font-medium">Message</th>
                          <th className="py-3 px-4 font-medium">Governance Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE4] text-sm">
                        {exchanges.incoming.map((ex) => (
                          <tr key={ex.id}>
                            <td className="py-3 px-4 font-medium">{ex.book_title}</td>
                            <td className="py-3 px-4 text-xs">{ex.requester_name}</td>
                            <td className="py-3 px-4 text-xs text-neutral-600">{ex.message}</td>
                            <td className="py-3 px-4"><StatusIndicator status={ex.status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 7. DONATION REQUESTS */}
          {page === 'donations' && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#E3DDD1]">
                <h1 className="font-serif text-3xl font-semibold text-[#101010]">Academic Donations</h1>
                <p className="mt-1 text-sm text-neutral-600">Track books you have donated and requests you placed for open-access copies.</p>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">My Requested Donations</h2>
                <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                  {donations.myDonationRequests.length === 0 ? (
                    <p className="p-6 text-sm text-neutral-500">No donation requests placed.</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                          <th className="py-3 px-4 font-medium">Book</th>
                          <th className="py-3 px-4 font-medium">Donor</th>
                          <th className="py-3 px-4 font-medium">Purpose</th>
                          <th className="py-3 px-4 font-medium">Status</th>
                          <th className="py-3 px-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE4] text-sm">
                        {donations.myDonationRequests.map((dr) => (
                          <tr key={dr.id}>
                            <td className="py-3 px-4 font-medium">{dr.book_title}</td>
                            <td className="py-3 px-4 text-xs">{dr.donor_name}</td>
                            <td className="py-3 px-4 text-xs text-neutral-600">{dr.purpose}</td>
                            <td className="py-3 px-4"><StatusIndicator status={dr.status} /></td>
                            <td className="py-3 px-4 text-right">
                              {dr.status === 'PENDING' && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiRequest(`/api/student/donations/request/${dr.id}/cancel`, { method: 'POST' });
                                    await loadPageData('donations');
                                  }}
                                  className="text-xs text-rose-700 hover:underline cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">Books I Donated</h2>
                <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                  {donations.myDonations.length === 0 ? (
                    <p className="p-6 text-sm text-neutral-500">You have not submitted any donated books yet.</p>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                          <th className="py-3 px-4 font-medium">Title</th>
                          <th className="py-3 px-4 font-medium">Department</th>
                          <th className="py-3 px-4 font-medium">Approval</th>
                          <th className="py-3 px-4 font-medium">Availability</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0ECE4] text-sm">
                        {donations.myDonations.map((d) => (
                          <tr key={d.id}>
                            <td className="py-3 px-4 font-medium">{d.title}</td>
                            <td className="py-3 px-4 text-xs">{d.department_name || 'General'}</td>
                            <td className="py-3 px-4"><StatusIndicator status={d.approval_status} /></td>
                            <td className="py-3 px-4"><StatusIndicator status={d.availability_status} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 8. NOTIFICATIONS */}
          {page === 'notifications' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-5 border-b border-[#E3DDD1]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold text-[#101010]">Notifications</h1>
                  <p className="mt-1 text-sm text-neutral-600">Real-time status updates from Super Administrator reviews.</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest('/api/student/notifications/read', { method: 'POST', body: JSON.stringify({}) });
                    await loadPageData('notifications');
                    await onRefreshSession();
                  }}
                  className="px-4 py-2 border border-[#D8D1C4] bg-white hover:bg-[#EEEAE1] text-xs font-medium rounded cursor-pointer"
                >
                  Mark All Read
                </button>
              </div>

              <div className="bg-white border border-[#E2DBD0] rounded-md divide-y divide-[#EFEAE0]">
                {notifications.length === 0 ? (
                  <p className="p-8 text-sm text-neutral-500">No notifications.</p>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      onClick={async () => {
                        if (!n.is_read) {
                          await apiRequest('/api/student/notifications/read', {
                            method: 'POST',
                            body: JSON.stringify({ notificationId: n.id })
                          });
                          await loadPageData('notifications');
                          await onRefreshSession();
                        }
                      }}
                      className={`p-5 flex items-start justify-between gap-4 cursor-pointer ${
                        n.is_read ? 'opacity-75' : 'bg-[#FAF7F0]'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#101010]">
                          {n.title} {!n.is_read && <span className="ml-2 text-xs text-[#8A7040]">New</span>}
                        </p>
                        <p className="mt-1 text-sm text-neutral-700">{n.message}</p>
                      </div>
                      <span className="font-mono text-xs text-neutral-400 shrink-0 tabular-nums">{n.created_at}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* 9. MY PROFILE */}
          {page === 'profile' && (
            <div className="max-w-3xl space-y-8">
              <div className="pb-5 border-b border-[#E3DDD1] flex items-center justify-between">
                <div>
                  <h1 className="font-serif text-3xl font-semibold text-[#101010]">My Academic Profile</h1>
                  <p className="mt-1 text-sm text-neutral-600">{user.email} · {profile?.student_id_number}</p>
                </div>
                <StatusIndicator status={profile?.verification_status || 'PENDING'} />
              </div>

              <form onSubmit={handleSaveProfile} className="bg-white border border-[#E2DBD0] rounded-md p-6 space-y-4">
                <h2 className="font-serif text-xl font-semibold">Profile Information</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Full Name</label>
                    <input
                      type="text"
                      required
                      value={profileForm.fullName}
                      onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Phone</label>
                    <input
                      type="text"
                      value={profileForm.phone}
                      onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Department</label>
                    <select
                      value={profileForm.departmentId}
                      onChange={(e) => setProfileForm({ ...profileForm, departmentId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Select Department</option>
                      {metadata?.departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Semester</label>
                    <select
                      value={profileForm.semesterId}
                      onChange={(e) => setProfileForm({ ...profileForm, semesterId: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm bg-white"
                    >
                      <option value="">Select Semester</option>
                      {metadata?.semesters.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1.5">Academic Bio</label>
                  <textarea
                    rows={3}
                    value={profileForm.bio}
                    onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                  />
                </div>
                <button type="submit" className="px-5 py-2.5 bg-[#171717] text-[#F7F5EF] text-xs font-medium rounded cursor-pointer">
                  Save Profile Changes
                </button>
              </form>

              <form onSubmit={handleChangePassword} className="bg-white border border-[#E2DBD0] rounded-md p-6 space-y-4">
                <h2 className="font-serif text-xl font-semibold">Security & Password</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">Current Password</label>
                    <input
                      type="password"
                      required
                      value={pwdForm.currentPassword}
                      onChange={(e) => setPwdForm({ ...pwdForm, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-neutral-700 mb-1.5">New Password (min 8 chars)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwdForm.newPassword}
                      onChange={(e) => setPwdForm({ ...pwdForm, newPassword: e.target.value })}
                      className="w-full px-3 py-2 border border-[#D8D1C4] rounded text-sm"
                    />
                  </div>
                </div>
                <button type="submit" className="px-5 py-2.5 border border-[#171717] text-[#171717] hover:bg-[#EEEAE1] text-xs font-medium rounded cursor-pointer">
                  Update Password
                </button>
              </form>
            </div>
          )}

          {/* 10. ACTIVITY HISTORY */}
          {page === 'activity' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-[#E3DDD1]">
                <h1 className="font-serif text-3xl font-semibold text-[#101010]">Activity History</h1>
                <p className="mt-1 text-sm text-neutral-600">Chronological log of your submissions, requests, and account updates.</p>
              </div>
              <div className="bg-white border border-[#E2DBD0] rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#E3DDD1] text-xs text-neutral-500">
                      <th className="py-3 px-4 font-medium">Timestamp</th>
                      <th className="py-3 px-4 font-medium">Action</th>
                      <th className="py-3 px-4 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0ECE4] text-sm">
                    {activities.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-6 text-center text-neutral-500">No recorded activity yet.</td>
                      </tr>
                    ) : (
                      activities.map((a) => (
                        <tr key={a.id}>
                          <td className="py-3 px-4 font-mono text-xs text-neutral-500 tabular-nums">{a.created_at}</td>
                          <td className="py-3 px-4 text-xs font-medium">{a.action.replace(/_/g, ' ')}</td>
                          <td className="py-3 px-4 text-xs text-neutral-600">{a.details || a.new_status || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Confirmation Dialog */}
      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            await confirmState.action();
            setConfirmState(null);
          }}
        />
      )}

      {/* Report Listing Modal */}
      {selectedBook && (
        <ConfirmDialog
          open={reportDialogOpen}
          title="Report Book Listing"
          description={`Flag "${selectedBook.title}" for Super Administrator moderation review.`}
          confirmLabel="Submit Report"
          requireReason
          reasonLabel="Reason for Reporting"
          reasonPlaceholder="Describe inaccurate details, inappropriate content, or damaged condition..."
          destructive
          onCancel={() => setReportDialogOpen(false)}
          onConfirm={async (reason) => {
            await apiRequest('/api/student/reports', {
              method: 'POST',
              body: JSON.stringify({ listingId: selectedBook.listing_id ?? selectedBook.id, reason })
            });
            setReportDialogOpen(false);
            setBannerMsg({ type: 'success', text: 'Report logged for Super Administrator review.' });
          }}
        />
      )}
    </div>
  );
}
