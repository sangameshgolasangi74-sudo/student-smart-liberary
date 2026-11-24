import { useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookCheck,
  BookMarked,
  Check,
  Edit3,
  FileText,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { apiRequest } from '../lib/api';
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
  User
} from '../types';

type OwnerPage =
  | 'overview'
  | 'students'
  | 'verification'
  | 'approvals'
  | 'books'
  | 'exchanges'
  | 'donations'
  | 'reports'
  | 'notifications'
  | 'audit'
  | 'settings';

interface OwnerPortalProps {
  user: User;
  metadata: PublicMetadata | null;
  unreadCount: number;
  onRefreshMetadata: () => Promise<void>;
  onRefreshSession: () => Promise<void>;
  onLogout: () => void;
}

interface StudentRow {
  id: number;
  email: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  is_verified: number;
  created_at: string;
  last_login_at: string | null;
  full_name: string;
  student_id_number: string;
  phone: string;
  bio: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verification_note: string;
  department_name?: string;
  department_code?: string;
  semester_label?: string;
  total_listings: number;
  total_requests: number;
}

export function OwnerPortal({
  user,
  metadata,
  unreadCount,
  onRefreshMetadata,
  onRefreshSession,
  onLogout
}: OwnerPortalProps) {
  const [page, setPage] = useState<OwnerPage>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Overview
  const [overview, setOverview] = useState<{
    metrics: Record<string, number>;
    charts: {
      departmentBreakdown: Array<{ code: string; name: string; listings_count: number }>;
      listingStatusBreakdown: Array<{ status: string; count: number }>;
      listingTypeBreakdown: Array<{ type: string; count: number }>;
    };
    recentActivities: AuditLogItem[];
  } | null>(null);

  // Students
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentDrawer, setStudentDrawer] = useState<{
    student: StudentRow;
    listings: Array<{ id: number; title: string; author: string; approval_status: string; listing_type: string }>;
    exchanges: Array<{ id: number; book_title: string; status: string; created_at: string }>;
    activities: AuditLogItem[];
  } | null>(null);

  // Books & Approval Center
  const [books, setBooks] = useState<BookListing[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<
    Array<{ id: number; entity_id: number; decision: string; reason: string; decided_by_email: string; decided_at: string }>
  >([]);
  const [bookSearch, setBookSearch] = useState('');
  const [booksSubTab, setBooksSubTab] = useState<'catalog' | 'taxonomy'>('catalog');
  const [editingBook, setEditingBook] = useState<BookListing | null>(null);

  // Taxonomy creation forms
  const [newCategory, setNewCategory] = useState({ name: '', description: '' });
  const [newDept, setNewDept] = useState({ code: '', name: '' });
  const [newSubject, setNewSubject] = useState({ departmentId: '', semesterId: '', code: '', name: '' });

  // Exchanges
  const [exchanges, setExchanges] = useState<ExchangeRequest[]>([]);

  // Donations
  const [donations, setDonations] = useState<{
    donatedListings: Array<BookListing & { donor_name?: string; donor_email?: string }>;
    donationRequests: DonationRequest[];
  }>({ donatedListings: [], donationRequests: [] });

  // Reports
  const [reports, setReports] = useState<
    Array<{
      id: number;
      listing_id: number;
      book_title: string;
      reason: string;
      details: string;
      status: string;
      resolution_note: string;
      reporter_name: string;
      reporter_email: string;
      created_at: string;
    }>
  >([]);

  // Notifications & Announcements
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [contactMessages, setContactMessages] = useState<
    Array<{ id: number; name: string; email: string; subject: string; message: string; created_at: string }>
  >([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [newAnnouncement, setNewAnnouncement] = useState({ title: '', content: '', audience: 'ALL' });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditQuery, setAuditQuery] = useState('');

  // Settings
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [ownerPwdForm, setOwnerPwdForm] = useState({ currentPassword: '', newPassword: '' });
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | null>(null);

  // Confirm Dialog
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    requireReason?: boolean;
    reasonLabel?: string;
    destructive?: boolean;
    action: (reason: string) => Promise<void>;
  } | null>(null);

  useEffect(() => {
    loadOwnerPage(page);
  }, [page]);

  async function loadOwnerPage(target: OwnerPage) {
    try {
      if (target === 'overview') {
        const res = await apiRequest<typeof overview>('/api/owner/overview');
        setOverview(res);
      } else if (target === 'students' || target === 'verification') {
        const res = await apiRequest<{ students: StudentRow[] }>('/api/owner/students');
        setStudents(res.students);
      } else if (target === 'approvals' || target === 'books') {
        const res = await apiRequest<{ books: BookListing[]; history: typeof approvalHistory }>('/api/owner/books');
        setBooks(res.books);
        setApprovalHistory(res.history);
      } else if (target === 'exchanges') {
        const res = await apiRequest<{ exchanges: ExchangeRequest[] }>('/api/owner/exchanges');
        setExchanges(res.exchanges);
      } else if (target === 'donations') {
        const res = await apiRequest<typeof donations>('/api/owner/donations');
        setDonations(res);
      } else if (target === 'reports') {
        const [rep, ov] = await Promise.all([
          apiRequest<{ reports: typeof reports }>('/api/owner/reports'),
          apiRequest<typeof overview>('/api/owner/overview')
        ]);
        setReports(rep.reports);
        setOverview(ov);
      } else if (target === 'notifications') {
        const [notifRes, annRes] = await Promise.all([
          apiRequest<{ notifications: NotificationItem[]; contactMessages: typeof contactMessages }>('/api/owner/notifications'),
          apiRequest<{ announcements: Announcement[] }>('/api/owner/announcements')
        ]);
        setNotifications(notifRes.notifications);
        setContactMessages(notifRes.contactMessages);
        setAnnouncements(annRes.announcements);
      } else if (target === 'audit') {
        const qs = auditQuery.trim() ? `?q=${encodeURIComponent(auditQuery.trim())}` : '';
        const res = await apiRequest<{ logs: AuditLogItem[] }>(`/api/owner/audit-logs${qs}`);
        setAuditLogs(res.logs);
      } else if (target === 'settings') {
        const res = await apiRequest<{ settings: Record<string, string> }>('/api/owner/settings');
        setSettings(res.settings);
      }
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Unable to load executive data.' });
    }
  }

  async function openStudentDetail(studentId: number) {
    try {
      const res = await apiRequest<typeof studentDrawer>(`/api/owner/students/${studentId}`);
      setStudentDrawer(res);
    } catch (err) {
      setBannerMsg({ type: 'error', text: err instanceof Error ? err.message : 'Failed to load student profile.' });
    }
  }

  const navLinks: Array<{ id: OwnerPage; label: string; icon: typeof LayoutDashboard; count?: number }> = [
    { id: 'overview', label: 'Executive Overview', icon: LayoutDashboard },
    { id: 'students', label: 'Student Management', icon: Users },
    {
      id: 'verification',
      label: 'Student Verification',
      icon: UserCheck,
      count: overview?.metrics.pendingVerifications
    },
    {
      id: 'approvals',
      label: 'Book Approval Center',
      icon: BookCheck,
      count: overview?.metrics.pendingBooks
    },
    { id: 'books', label: 'All Books & Taxonomy', icon: BookMarked },
    {
      id: 'exchanges',
      label: 'Exchange Management',
      icon: RefreshCw,
      count: overview?.metrics.pendingExchanges
    },
    {
      id: 'donations',
      label: 'Donation Management',
      icon: Gift,
      count: overview?.metrics.pendingDonations
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: BarChart3,
      count: overview?.metrics.openReports
    },
    { id: 'notifications', label: 'Notices & Inquiries', icon: Bell, count: unreadCount },
    { id: 'audit', label: 'Audit Logs', icon: FileText },
    { id: 'settings', label: 'Platform Settings', icon: Settings }
  ];

  const pendingBookList = books.filter((b) => b.approval_status === 'PENDING');
  const filteredStudents = students.filter(
    (s) =>
      !studentSearch.trim() ||
      s.full_name?.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.student_id_number?.toLowerCase().includes(studentSearch.toLowerCase())
  );
  const filteredBooks = books.filter(
    (b) =>
      !bookSearch.trim() ||
      b.title.toLowerCase().includes(bookSearch.toLowerCase()) ||
      b.author.toLowerCase().includes(bookSearch.toLowerCase()) ||
      (b.owner_name || '').toLowerCase().includes(bookSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#101010] text-[#F7F5EF] flex">
      {/* Executive Dark Sidebar */}
      <aside className="hidden lg:flex lg:flex-col w-68 bg-[#141414] border-r border-[#242424] shrink-0">
        <div className="h-16 px-6 flex items-center justify-between border-b border-[#242424]">
          <span className="font-serif text-xl font-semibold tracking-tight text-[#F7F5EF]">Athenaeum</span>
        </div>

        <div className="px-5 py-4 border-b border-[#242424]">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-[#C6A66B] font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Super Admin</span>
          </div>
          <p className="mt-1 text-xs text-neutral-300 truncate">{user.email}</p>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navLinks.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setBannerMsg(null);
                  setPage(item.id);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#C6A66B] text-[#101010]'
                    : 'text-neutral-400 hover:bg-[#1E1E1E] hover:text-[#F7F5EF]'
                }`}
              >
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.count ? (
                  <span
                    className={`font-mono text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
                      active ? 'bg-[#101010] text-[#C6A66B]' : 'bg-[#242424] text-[#C6A66B]'
                    }`}
                  >
                    {item.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#242424]">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium text-neutral-400 hover:text-[#F7F5EF] hover:bg-[#1E1E1E] rounded transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Executive Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-[#101010]/95 border-b border-[#242424] px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded hover:bg-[#1E1E1E]"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <p className="text-xs text-neutral-500 truncate">
              Executive Command <span className="mx-1.5">/</span>{' '}
              <span className="text-[#F7F5EF] font-medium capitalize">{page}</span>
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setPage('approvals')}
              className="px-3.5 py-2 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
            >
              Review Approval Queue
            </button>
          </div>
        </header>

        {/* Mobile Drawer */}
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div className="fixed inset-0 bg-black/70" onClick={() => setMobileNavOpen(false)} />
            <div className="relative w-72 bg-[#141414] border-r border-[#242424] h-full flex flex-col p-4 z-10">
              <div className="flex items-center justify-between pb-4 border-b border-[#242424]">
                <span className="font-serif text-lg font-semibold">Athenaeum Admin</span>
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded text-xs font-medium ${
                        page === item.id ? 'bg-[#C6A66B] text-[#101010]' : 'text-neutral-400'
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <Icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </span>
                      {item.count ? <span className="font-mono text-xs">{item.count}</span> : null}
                    </button>
                  );
                })}
              </nav>
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-neutral-400 border-t border-[#242424]"
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
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-800 text-rose-300'
              }`}
            >
              <span>{bannerMsg.text}</span>
              <button type="button" onClick={() => setBannerMsg(null)} className="text-xs underline shrink-0 cursor-pointer">
                Dismiss
              </button>
            </div>
          )}

          {/* 1. EXECUTIVE OVERVIEW */}
          {page === 'overview' && overview && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#242424] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-[#C6A66B] font-medium">Institutional Command Center</p>
                  <h1 className="mt-1.5 font-serif text-3xl font-semibold text-[#F7F5EF]">Executive Overview</h1>
                </div>
                <button
                  type="button"
                  onClick={() => loadOwnerPage('overview')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 border border-[#292929] bg-[#171717] hover:bg-[#222] text-xs rounded cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Metrics</span>
                </button>
              </div>

              {/* 12 Executive KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Registered Students', value: overview.metrics.totalStudents, sub: `${overview.metrics.activeStudents} Active · ${overview.metrics.suspendedStudents} Suspended` },
                  { label: 'Pending Verifications', value: overview.metrics.pendingVerifications, sub: 'Awaiting identity review', accent: true },
                  { label: 'Total Submitted Books', value: overview.metrics.totalBooks, sub: `${overview.metrics.approvedBooks} Approved` },
                  { label: 'Pending Book Approvals', value: overview.metrics.pendingBooks, sub: `${overview.metrics.rejectedBooks} Rejected`, accent: true },
                  { label: 'Pending Exchanges', value: overview.metrics.pendingExchanges, sub: 'Awaiting approval', accent: true },
                  { label: 'Completed Exchanges', value: overview.metrics.completedExchanges, sub: 'Verified handovers' },
                  { label: 'Pending Donations', value: overview.metrics.pendingDonations, sub: `${overview.metrics.totalDonations} Total donated` },
                  { label: 'Open Reports', value: overview.metrics.openReports, sub: 'Moderation queue', accent: overview.metrics.openReports > 0 }
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-[#171717] border border-[#292929] rounded-md p-5">
                    <p className="text-xs text-neutral-400">{kpi.label}</p>
                    <p
                      className={`mt-2 font-serif text-3xl font-semibold tabular-nums ${
                        kpi.accent ? 'text-[#C6A66B]' : 'text-[#F7F5EF]'
                      }`}
                    >
                      {kpi.value}
                    </p>
                    <p className="mt-1.5 text-xs text-neutral-500 tabular-nums">{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* Analytical Charts (Custom SVG) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7 bg-[#171717] border border-[#292929] rounded-md p-6">
                  <h2 className="font-serif text-xl font-semibold text-[#F7F5EF]">Listings by Academic Department</h2>
                  <p className="mt-1 text-xs text-neutral-400">Distribution of cataloged volumes across departments</p>
                  <div className="mt-6 space-y-4">
                    {overview.charts.departmentBreakdown.map((d) => {
                      const max = Math.max(1, ...overview.charts.departmentBreakdown.map((x) => x.listings_count));
                      const pct = Math.round((d.listings_count / max) * 100);
                      return (
                        <div key={d.code}>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-neutral-300">
                              <span className="font-mono text-[#C6A66B] mr-2">{d.code}</span>
                              {d.name}
                            </span>
                            <span className="font-mono tabular-nums text-neutral-300">{d.listings_count}</span>
                          </div>
                          <div className="h-2 w-full bg-[#101010] rounded overflow-hidden">
                            <div className="h-full bg-[#C6A66B] rounded" style={{ width: `${Math.max(4, pct)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="lg:col-span-5 bg-[#171717] border border-[#292929] rounded-md p-6 flex flex-col justify-between">
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-[#F7F5EF]">Governance Mix</h2>
                    <p className="mt-1 text-xs text-neutral-400">Listing formats & approval status summary</p>
                  </div>

                  {/* Crisp SVG Bar Chart for Listing Formats */}
                  <div className="my-6">
                    <svg viewBox="0 0 320 140" className="w-full h-36" role="img" aria-label="Listing format breakdown chart">
                      {overview.charts.listingTypeBreakdown.map((item, idx) => {
                        const maxVal = Math.max(1, ...overview.charts.listingTypeBreakdown.map((x) => x.count));
                        const barH = Math.max(12, Math.round((item.count / maxVal) * 85));
                        const x = 32 + idx * 96;
                        const y = 105 - barH;
                        const fill = idx === 0 ? '#C6A66B' : idx === 1 ? '#A0AD99' : '#E5DEC9';
                        return (
                          <g key={item.type}>
                            <rect x={x} y={y} width={54} height={barH} rx={3} fill={fill} />
                            <text x={x + 27} y={y - 6} textAnchor="middle" fill="#F7F5EF" fontSize="11" fontFamily="JetBrains Mono">
                              {item.count}
                            </text>
                            <text x={x + 27} y={126} textAnchor="middle" fill="#A3A3A3" fontSize="10" fontFamily="Plus Jakarta Sans">
                              {item.type}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  <div className="pt-4 border-t border-[#242424] flex items-center justify-between text-xs text-neutral-400">
                    {overview.charts.listingStatusBreakdown.map((st) => (
                      <div key={st.status}>
                        <span className="block text-[11px] text-neutral-500">{st.status}</span>
                        <span className="font-mono text-sm font-medium text-[#F7F5EF] tabular-nums">{st.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent System Activities */}
              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-hidden">
                <div className="px-6 py-4 border-b border-[#242424] flex items-center justify-between">
                  <h2 className="font-serif text-xl font-semibold">Recent System Activities</h2>
                  <button type="button" onClick={() => setPage('audit')} className="text-xs text-[#C6A66B] hover:underline cursor-pointer">
                    Full Audit Log
                  </button>
                </div>
                <div className="divide-y divide-[#242424]">
                  {overview.recentActivities.map((act) => (
                    <div key={act.id} className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <Activity className="w-3.5 h-3.5 text-[#C6A66B] shrink-0" />
                        <span className="font-medium text-[#F7F5EF] whitespace-nowrap">{act.action.replace(/_/g, ' ')}</span>
                        <span className="text-neutral-400 truncate">{act.details || act.actor_email}</span>
                      </div>
                      <span className="font-mono text-neutral-500 tabular-nums shrink-0">{act.created_at}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. STUDENT MANAGEMENT */}
          {page === 'students' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#242424]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold">Student Management</h1>
                  <p className="mt-1 text-xs text-neutral-400">Manage institutional scholar accounts, statuses, and activity records.</p>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search name, email, ID..."
                    className="w-full pl-9 pr-3 py-2 bg-[#171717] border border-[#292929] rounded text-xs text-[#F7F5EF] focus:outline-none focus:border-[#C6A66B]"
                  />
                </div>
              </div>

              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#242424] text-xs text-neutral-400">
                      <th className="py-3 px-4 font-medium">Scholar</th>
                      <th className="py-3 px-4 font-medium">Student ID</th>
                      <th className="py-3 px-4 font-medium">Department</th>
                      <th className="py-3 px-4 font-medium">Verification</th>
                      <th className="py-3 px-4 font-medium">Account Status</th>
                      <th className="py-3 px-4 font-medium text-right">Activity</th>
                      <th className="py-3 px-4 font-medium text-right">Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222] text-xs">
                    {filteredStudents.map((st) => (
                      <tr key={st.id} className="hover:bg-[#1C1C1C]">
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-[#F7F5EF]">{st.full_name}</p>
                          <p className="text-neutral-400">{st.email}</p>
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-neutral-300">{st.student_id_number}</td>
                        <td className="py-3.5 px-4 text-neutral-300">{st.department_code || '—'} · {st.semester_label || '—'}</td>
                        <td className="py-3.5 px-4"><StatusIndicator status={st.verification_status} dark /></td>
                        <td className="py-3.5 px-4"><StatusIndicator status={st.status} dark /></td>
                        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-neutral-300">
                          {st.total_listings} books · {st.total_requests} req
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                          <button
                            type="button"
                            onClick={() => openStudentDetail(st.id)}
                            className="text-[#C6A66B] hover:underline cursor-pointer"
                          >
                            Inspect
                          </button>
                          {st.status === 'ACTIVE' ? (
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmState({
                                  open: true,
                                  title: 'Suspend Student Account',
                                  description: `Suspend ${st.full_name} (${st.email}) from accessing the portal?`,
                                  confirmLabel: 'Suspend Account',
                                  requireReason: true,
                                  destructive: true,
                                  action: async (reason) => {
                                    await apiRequest(`/api/owner/students/${st.id}/status`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: 'SUSPENDED', reason })
                                    });
                                    await loadOwnerPage('students');
                                  }
                                })
                              }
                              className="text-amber-400 hover:underline cursor-pointer"
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiRequest(`/api/owner/students/${st.id}/status`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ status: 'ACTIVE', reason: 'Reactivated by Super Administrator' })
                                });
                                await loadOwnerPage('students');
                              }}
                              className="text-emerald-400 hover:underline cursor-pointer"
                            >
                              Activate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Delete Student Account',
                                description: `Permanently delete ${st.full_name} and all associated records? This cannot be undone.`,
                                confirmLabel: 'Delete Permanently',
                                destructive: true,
                                action: async () => {
                                  await apiRequest(`/api/owner/students/${st.id}`, { method: 'DELETE' });
                                  await loadOwnerPage('students');
                                }
                              })
                            }
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. STUDENT VERIFICATION */}
          {page === 'verification' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Student Identity Verification</h1>
                <p className="mt-1 text-xs text-neutral-400">Approve or reject institutional scholar verification requests.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {students.map((st) => (
                  <div key={st.id} className="bg-[#171717] border border-[#292929] rounded-md p-6 flex flex-col justify-between gap-4">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-serif text-lg font-semibold text-[#F7F5EF]">{st.full_name}</h3>
                          <p className="text-xs text-neutral-400">{st.email}</p>
                        </div>
                        <StatusIndicator status={st.verification_status} dark />
                      </div>
                      <div className="mt-4 pt-4 border-t border-[#242424] grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-neutral-500">ID Number:</span>{' '}
                          <span className="font-mono text-neutral-200">{st.student_id_number}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Department:</span>{' '}
                          <span className="text-neutral-200">{st.department_name || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Semester:</span>{' '}
                          <span className="text-neutral-200">{st.semester_label || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-neutral-500">Phone:</span>{' '}
                          <span className="text-neutral-200">{st.phone || '—'}</span>
                        </div>
                      </div>
                      {st.verification_note && (
                        <p className="mt-3 text-xs text-neutral-400">Note: {st.verification_note}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/owner/students/${st.id}/verification`, {
                            method: 'PATCH',
                            body: JSON.stringify({ verificationStatus: 'VERIFIED', note: 'Verified by Super Administrator' })
                          });
                          setBannerMsg({ type: 'success', text: `Verified ${st.full_name}.` });
                          await loadOwnerPage('verification');
                        }}
                        className="px-4 py-2 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] text-xs font-medium rounded cursor-pointer"
                      >
                        Approve Verification
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmState({
                            open: true,
                            title: 'Reject Verification',
                            description: `Reject identity verification for ${st.full_name}?`,
                            confirmLabel: 'Reject Verification',
                            requireReason: true,
                            reasonLabel: 'Rejection Reason',
                            destructive: true,
                            action: async (reason) => {
                              await apiRequest(`/api/owner/students/${st.id}/verification`, {
                                method: 'PATCH',
                                body: JSON.stringify({ verificationStatus: 'REJECTED', note: reason })
                              });
                              await loadOwnerPage('verification');
                            }
                          })
                        }
                        className="px-4 py-2 border border-rose-800 text-rose-400 hover:bg-rose-950/40 text-xs font-medium rounded cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. BOOK APPROVAL CENTER */}
          {page === 'approvals' && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Book Approval Center</h1>
                <p className="mt-1 text-xs text-neutral-400">
                  Every new student book submission stays hidden from the catalog until approved here.
                </p>
              </div>

              {pendingBookList.length === 0 ? (
                <div className="p-12 text-center bg-[#171717] border border-[#292929] rounded-md">
                  <BookCheck className="w-8 h-8 text-[#C6A66B] mx-auto" />
                  <p className="mt-3 font-serif text-xl font-semibold">Approval Queue Clear</p>
                  <p className="mt-1 text-xs text-neutral-400">All submitted book listings have been reviewed.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {pendingBookList.map((book) => (
                    <div key={book.id} className="bg-[#171717] border border-[#292929] rounded-md overflow-hidden flex flex-col sm:flex-row">
                      <div className="sm:w-44 aspect-[3/4] sm:aspect-auto bg-[#101010] shrink-0">
                        <BookCoverImage src={book.cover_image_url} title={book.title} author={book.author} dark className="w-full h-full" />
                      </div>
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-2 text-xs text-[#C6A66B]">
                            <span>{book.listing_type} · {book.condition.replace('_', ' ')}</span>
                            <StatusIndicator status={book.approval_status} dark />
                          </div>
                          <h3 className="mt-2 font-serif text-xl font-semibold text-[#F7F5EF]">{book.title}</h3>
                          <p className="text-xs text-neutral-400">{book.author}</p>
                          <div className="mt-3 text-xs text-neutral-400 space-y-1">
                            <p>Submitted by: <span className="text-neutral-200">{book.owner_name}</span> ({book.owner_email})</p>
                            <p>Classification: {book.department_name || 'General'} · {book.semester_label || 'All'} · {book.category_name || 'Academic'}</p>
                            {book.isbn && <p className="font-mono">ISBN: {book.isbn}</p>}
                            {book.notes && <p className="text-neutral-300 italic">"{book.notes}"</p>}
                          </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[#242424] flex items-center gap-3">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/owner/books/${book.id}/decision`, {
                                method: 'PATCH',
                                body: JSON.stringify({ decision: 'APPROVED', reason: 'Verified academic metadata and condition.' })
                              });
                              setBannerMsg({ type: 'success', text: `Approved "${book.title}". It is now live in the student catalog.` });
                              await loadOwnerPage('approvals');
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#C6A66B] hover:bg-[#B39359] text-[#101010] text-xs font-medium rounded cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve & Publish</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Reject Book Submission',
                                description: `Reject "${book.title}"? The submitting student will receive your recorded reason.`,
                                confirmLabel: 'Reject Submission',
                                requireReason: true,
                                reasonLabel: 'Rejection Reason',
                                destructive: true,
                                action: async (reason) => {
                                  await apiRequest(`/api/owner/books/${book.id}/decision`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ decision: 'REJECTED', reason })
                                  });
                                  await loadOwnerPage('approvals');
                                }
                              })
                            }
                            className="px-4 py-2 border border-rose-800 text-rose-400 hover:bg-rose-950/40 text-xs font-medium rounded cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Historical Approval Decisions */}
              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-hidden">
                <div className="px-6 py-4 border-b border-[#242424]">
                  <h2 className="font-serif text-xl font-semibold">Recent Book Approval Decisions</h2>
                </div>
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#242424] text-neutral-400">
                      <th className="py-3 px-4 font-medium">Listing ID</th>
                      <th className="py-3 px-4 font-medium">Decision</th>
                      <th className="py-3 px-4 font-medium">Recorded Reason</th>
                      <th className="py-3 px-4 font-medium">Decided By</th>
                      <th className="py-3 px-4 font-medium">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {approvalHistory.map((h) => (
                      <tr key={h.id}>
                        <td className="py-3 px-4 font-mono tabular-nums">#{h.entity_id}</td>
                        <td className="py-3 px-4"><StatusIndicator status={h.decision} dark /></td>
                        <td className="py-3 px-4 text-neutral-300">{h.reason || '—'}</td>
                        <td className="py-3 px-4 text-neutral-400">{h.decided_by_email}</td>
                        <td className="py-3 px-4 font-mono text-neutral-500 tabular-nums">{h.decided_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. ALL BOOKS & TAXONOMY */}
          {page === 'books' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#242424]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold">All Books & Academic Taxonomy</h1>
                  <p className="mt-1 text-xs text-neutral-400">Edit catalog entries, manage availability, and maintain departments/categories/subjects.</p>
                </div>
                <div className="flex items-center gap-1 p-1 bg-[#171717] border border-[#292929] rounded">
                  <button
                    type="button"
                    onClick={() => setBooksSubTab('catalog')}
                    className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                      booksSubTab === 'catalog' ? 'bg-[#C6A66B] text-[#101010]' : 'text-neutral-400'
                    }`}
                  >
                    All Book Listings
                  </button>
                  <button
                    type="button"
                    onClick={() => setBooksSubTab('taxonomy')}
                    className={`px-3 py-1.5 text-xs font-medium rounded cursor-pointer ${
                      booksSubTab === 'taxonomy' ? 'bg-[#C6A66B] text-[#101010]' : 'text-neutral-400'
                    }`}
                  >
                    Categories, Depts & Subjects
                  </button>
                </div>
              </div>

              {booksSubTab === 'catalog' ? (
                <div className="space-y-4">
                  <div className="relative max-w-sm">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={bookSearch}
                      onChange={(e) => setBookSearch(e.target.value)}
                      placeholder="Filter by title, author, student..."
                      className="w-full pl-9 pr-3 py-2 bg-[#171717] border border-[#292929] rounded text-xs text-[#F7F5EF]"
                    />
                  </div>
                  <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-[#242424] text-neutral-400">
                          <th className="py-3 px-4 font-medium">Volume</th>
                          <th className="py-3 px-4 font-medium">Owner</th>
                          <th className="py-3 px-4 font-medium">Type</th>
                          <th className="py-3 px-4 font-medium">Approval</th>
                          <th className="py-3 px-4 font-medium">Availability</th>
                          <th className="py-3 px-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#222]">
                        {filteredBooks.map((b) => (
                          <tr key={b.id} className="hover:bg-[#1C1C1C]">
                            <td className="py-3 px-4">
                              <p className="font-medium text-[#F7F5EF]">{b.title}</p>
                              <p className="text-neutral-400">{b.author} · {b.department_code || 'GEN'}</p>
                            </td>
                            <td className="py-3 px-4 text-neutral-300">{b.owner_name}</td>
                            <td className="py-3 px-4 capitalize">{b.listing_type.toLowerCase()}</td>
                            <td className="py-3 px-4"><StatusIndicator status={b.approval_status} dark /></td>
                            <td className="py-3 px-4"><StatusIndicator status={b.availability_status} dark /></td>
                            <td className="py-3 px-4 text-right whitespace-nowrap space-x-3">
                              <button
                                type="button"
                                onClick={() => setEditingBook(b)}
                                className="inline-flex items-center gap-1 text-[#C6A66B] hover:underline cursor-pointer"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    open: true,
                                    title: 'Remove Book Listing',
                                    description: `Delete "${b.title}" permanently from the platform?`,
                                    confirmLabel: 'Delete Listing',
                                    destructive: true,
                                    action: async () => {
                                      await apiRequest(`/api/owner/books/${b.id}`, { method: 'DELETE' });
                                      await loadOwnerPage('books');
                                    }
                                  })
                                }
                                className="text-rose-400 hover:underline cursor-pointer"
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Categories */}
                  <div className="bg-[#171717] border border-[#292929] rounded-md p-5 space-y-4">
                    <h2 className="font-serif text-lg font-semibold">Categories</h2>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await apiRequest('/api/owner/taxonomy/categories', { method: 'POST', body: JSON.stringify(newCategory) });
                        setNewCategory({ name: '', description: '' });
                        await onRefreshMetadata();
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        required
                        value={newCategory.name}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        placeholder="New category name"
                        className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                      />
                      <button type="submit" className="w-full py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                        Add Category
                      </button>
                    </form>
                    <ul className="divide-y divide-[#242424] text-xs">
                      {metadata?.categories.map((c) => (
                        <li key={c.id} className="py-2 flex items-center justify-between">
                          <span>{c.name}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/owner/taxonomy/categories/${c.id}`, { method: 'DELETE' });
                              await onRefreshMetadata();
                            }}
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Departments */}
                  <div className="bg-[#171717] border border-[#292929] rounded-md p-5 space-y-4">
                    <h2 className="font-serif text-lg font-semibold">Academic Departments</h2>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await apiRequest('/api/owner/taxonomy/departments', { method: 'POST', body: JSON.stringify(newDept) });
                        setNewDept({ code: '', name: '' });
                        await onRefreshMetadata();
                      }}
                      className="space-y-2"
                    >
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={newDept.code}
                          onChange={(e) => setNewDept({ ...newDept, code: e.target.value })}
                          placeholder="Code (CS)"
                          className="w-24 px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs font-mono"
                        />
                        <input
                          type="text"
                          required
                          value={newDept.name}
                          onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
                          placeholder="Department name"
                          className="flex-1 px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                        />
                      </div>
                      <button type="submit" className="w-full py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                        Add Department
                      </button>
                    </form>
                    <ul className="divide-y divide-[#242424] text-xs">
                      {metadata?.departments.map((d) => (
                        <li key={d.id} className="py-2 flex items-center justify-between">
                          <span><span className="font-mono text-[#C6A66B] mr-1.5">{d.code}</span>{d.name}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/owner/taxonomy/departments/${d.id}`, { method: 'DELETE' });
                              await onRefreshMetadata();
                            }}
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Subjects */}
                  <div className="bg-[#171717] border border-[#292929] rounded-md p-5 space-y-4">
                    <h2 className="font-serif text-lg font-semibold">Subject Classifications</h2>
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await apiRequest('/api/owner/taxonomy/subjects', {
                          method: 'POST',
                          body: JSON.stringify({
                            ...newSubject,
                            departmentId: Number(newSubject.departmentId),
                            semesterId: Number(newSubject.semesterId)
                          })
                        });
                        setNewSubject({ departmentId: '', semesterId: '', code: '', name: '' });
                        await onRefreshMetadata();
                      }}
                      className="space-y-2"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          required
                          value={newSubject.departmentId}
                          onChange={(e) => setNewSubject({ ...newSubject, departmentId: e.target.value })}
                          className="px-2.5 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                        >
                          <option value="">Dept</option>
                          {metadata?.departments.map((d) => (
                            <option key={d.id} value={d.id}>{d.code}</option>
                          ))}
                        </select>
                        <select
                          required
                          value={newSubject.semesterId}
                          onChange={(e) => setNewSubject({ ...newSubject, semesterId: e.target.value })}
                          className="px-2.5 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                        >
                          <option value="">Sem</option>
                          {metadata?.semesters.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          value={newSubject.code}
                          onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })}
                          placeholder="CS401"
                          className="w-24 px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs font-mono"
                        />
                        <input
                          type="text"
                          required
                          value={newSubject.name}
                          onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                          placeholder="Subject title"
                          className="flex-1 px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                        />
                      </div>
                      <button type="submit" className="w-full py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                        Add Subject
                      </button>
                    </form>
                    <ul className="divide-y divide-[#242424] text-xs max-h-64 overflow-y-auto">
                      {metadata?.subjects.map((subj) => (
                        <li key={subj.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="truncate">
                            <span className="font-mono text-[#C6A66B] mr-1.5">{subj.code}</span>
                            {subj.name}
                          </span>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/owner/taxonomy/subjects/${subj.id}`, { method: 'DELETE' });
                              await onRefreshMetadata();
                            }}
                            className="text-rose-400 hover:underline shrink-0 cursor-pointer"
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 6. EXCHANGE MANAGEMENT */}
          {page === 'exchanges' && (
            <div className="space-y-6">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Exchange Request Management</h1>
                <p className="mt-1 text-xs text-neutral-400">Approve, reject with reasons, monitor progress, or mark exchanges completed.</p>
              </div>

              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#242424] text-neutral-400">
                      <th className="py-3 px-4 font-medium">Requested Volume</th>
                      <th className="py-3 px-4 font-medium">Requester</th>
                      <th className="py-3 px-4 font-medium">Owner</th>
                      <th className="py-3 px-4 font-medium">Offered Swap</th>
                      <th className="py-3 px-4 font-medium">Status</th>
                      <th className="py-3 px-4 font-medium text-right">Governance Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {exchanges.map((ex) => (
                      <tr key={ex.id} className="hover:bg-[#1C1C1C]">
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-[#F7F5EF]">{ex.book_title}</p>
                          <p className="text-neutral-400">{ex.message}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p>{ex.requester_name}</p>
                          <p className="text-neutral-500">{ex.requester_email}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p>{ex.owner_name}</p>
                          <p className="text-neutral-500">{ex.owner_email}</p>
                        </td>
                        <td className="py-3.5 px-4">{ex.offered_book_title || 'Direct Request'}</td>
                        <td className="py-3.5 px-4"><StatusIndicator status={ex.status} dark /></td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                          {ex.status === 'PENDING' && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/owner/exchanges/${ex.id}/decision`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: 'APPROVED' })
                                  });
                                  await loadOwnerPage('exchanges');
                                }}
                                className="text-[#C6A66B] hover:underline cursor-pointer"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    open: true,
                                    title: 'Reject Exchange Request',
                                    description: `Reject request for "${ex.book_title}"?`,
                                    confirmLabel: 'Reject Request',
                                    requireReason: true,
                                    destructive: true,
                                    action: async (reason) => {
                                      await apiRequest(`/api/owner/exchanges/${ex.id}/decision`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'REJECTED', reason })
                                      });
                                      await loadOwnerPage('exchanges');
                                    }
                                  })
                                }
                                className="text-rose-400 hover:underline cursor-pointer"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {(ex.status === 'APPROVED' || ex.status === 'IN_PROGRESS') && (
                            <>
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/owner/exchanges/${ex.id}/decision`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: 'COMPLETED' })
                                  });
                                  await loadOwnerPage('exchanges');
                                }}
                                className="text-emerald-400 hover:underline cursor-pointer"
                              >
                                Mark Completed
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmState({
                                    open: true,
                                    title: 'Cancel Exchange',
                                    description: `Cancel active exchange #${ex.id}?`,
                                    confirmLabel: 'Cancel Exchange',
                                    requireReason: true,
                                    destructive: true,
                                    action: async (reason) => {
                                      await apiRequest(`/api/owner/exchanges/${ex.id}/decision`, {
                                        method: 'PATCH',
                                        body: JSON.stringify({ status: 'CANCELLED', reason })
                                      });
                                      await loadOwnerPage('exchanges');
                                    }
                                  })
                                }
                                className="text-rose-400 hover:underline cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 7. DONATION MANAGEMENT */}
          {page === 'donations' && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Donation Governance</h1>
                <p className="mt-1 text-xs text-neutral-400">Approve donated textbooks and authorize student donation requests.</p>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">Donated Book Submissions</h2>
                <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#242424] text-neutral-400">
                        <th className="py-3 px-4 font-medium">Donated Book</th>
                        <th className="py-3 px-4 font-medium">Donor</th>
                        <th className="py-3 px-4 font-medium">Approval</th>
                        <th className="py-3 px-4 font-medium">Availability</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {donations.donatedListings.map((dl) => (
                        <tr key={dl.id}>
                          <td className="py-3 px-4">
                            <p className="font-medium text-[#F7F5EF]">{dl.title}</p>
                            <p className="text-neutral-400">{dl.author}</p>
                          </td>
                          <td className="py-3 px-4">{dl.donor_name}</td>
                          <td className="py-3 px-4"><StatusIndicator status={dl.approval_status} dark /></td>
                          <td className="py-3 px-4"><StatusIndicator status={dl.availability_status} dark /></td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {dl.approval_status === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiRequest(`/api/owner/books/${dl.id}/decision`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ decision: 'APPROVED', reason: 'Donation verified.' })
                                    });
                                    await loadOwnerPage('donations');
                                  }}
                                  className="text-[#C6A66B] hover:underline cursor-pointer"
                                >
                                  Approve Donation
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      title: 'Reject Donation',
                                      description: `Reject donated book "${dl.title}"?`,
                                      confirmLabel: 'Reject',
                                      requireReason: true,
                                      destructive: true,
                                      action: async (reason) => {
                                        await apiRequest(`/api/owner/books/${dl.id}/decision`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ decision: 'REJECTED', reason })
                                        });
                                        await loadOwnerPage('donations');
                                      }
                                    })
                                  }
                                  className="text-rose-400 hover:underline cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold mb-3">Student Requests for Donated Books</h2>
                <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#242424] text-neutral-400">
                        <th className="py-3 px-4 font-medium">Book</th>
                        <th className="py-3 px-4 font-medium">Recipient Scholar</th>
                        <th className="py-3 px-4 font-medium">Purpose</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {donations.donationRequests.map((dr) => (
                        <tr key={dr.id}>
                          <td className="py-3 px-4 font-medium">{dr.book_title}</td>
                          <td className="py-3 px-4">{dr.recipient_name} ({dr.recipient_email})</td>
                          <td className="py-3 px-4 text-neutral-300">{dr.purpose}</td>
                          <td className="py-3 px-4"><StatusIndicator status={dr.status} dark /></td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {dr.status === 'PENDING' && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiRequest(`/api/owner/donations/requests/${dr.id}/decision`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: 'APPROVED' })
                                    });
                                    await loadOwnerPage('donations');
                                  }}
                                  className="text-[#C6A66B] hover:underline cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmState({
                                      open: true,
                                      title: 'Reject Donation Request',
                                      description: `Reject request from ${dr.recipient_name}?`,
                                      confirmLabel: 'Reject',
                                      requireReason: true,
                                      destructive: true,
                                      action: async (reason) => {
                                        await apiRequest(`/api/owner/donations/requests/${dr.id}/decision`, {
                                          method: 'PATCH',
                                          body: JSON.stringify({ status: 'REJECTED', reason })
                                        });
                                        await loadOwnerPage('donations');
                                      }
                                    })
                                  }
                                  className="text-rose-400 hover:underline cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {dr.status === 'APPROVED' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await apiRequest(`/api/owner/donations/requests/${dr.id}/decision`, {
                                    method: 'PATCH',
                                    body: JSON.stringify({ status: 'COMPLETED' })
                                  });
                                  await loadOwnerPage('donations');
                                }}
                                className="text-emerald-400 hover:underline cursor-pointer"
                              >
                                Mark Completed
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 8. REPORTS & ANALYTICS */}
          {page === 'reports' && (
            <div className="space-y-8">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Content Moderation & Analytics</h1>
                <p className="mt-1 text-xs text-neutral-400">Resolve flagged listings and review institutional resource distribution.</p>
              </div>

              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                <div className="px-6 py-4 border-b border-[#242424]">
                  <h2 className="font-serif text-xl font-semibold">Reported Listings Queue</h2>
                </div>
                {reports.length === 0 ? (
                  <div className="p-8 text-center text-xs text-neutral-400">
                    <ShieldAlert className="w-6 h-6 text-[#C6A66B] mx-auto mb-2" />
                    No reported listings in moderation queue.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[#242424] text-neutral-400">
                        <th className="py-3 px-4 font-medium">Listing</th>
                        <th className="py-3 px-4 font-medium">Reporter</th>
                        <th className="py-3 px-4 font-medium">Reason</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Moderation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#222]">
                      {reports.map((r) => (
                        <tr key={r.id}>
                          <td className="py-3 px-4 font-medium">{r.book_title}</td>
                          <td className="py-3 px-4">{r.reporter_name}</td>
                          <td className="py-3 px-4 text-neutral-300">{r.reason}</td>
                          <td className="py-3 px-4"><StatusIndicator status={r.status} dark /></td>
                          <td className="py-3 px-4 text-right space-x-2">
                            {r.status === 'OPEN' && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiRequest(`/api/owner/reports/${r.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: 'RESOLVED', removeListing: true, resolutionNote: 'Listing removed after report review.' })
                                    });
                                    await loadOwnerPage('reports');
                                  }}
                                  className="text-rose-400 hover:underline cursor-pointer"
                                >
                                  Remove Listing
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiRequest(`/api/owner/reports/${r.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: 'DISMISSED', removeListing: false, resolutionNote: 'Reviewed and cleared.' })
                                    });
                                    await loadOwnerPage('reports');
                                  }}
                                  className="text-neutral-300 hover:underline cursor-pointer"
                                >
                                  Dismiss
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* 9. NOTIFICATIONS, ANNOUNCEMENTS & CONTACT INQUIRIES */}
          {page === 'notifications' && (
            <div className="space-y-8">
              <div className="flex items-center justify-between pb-5 border-b border-[#242424]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold">Announcements, Notifications & Inquiries</h1>
                  <p className="mt-1 text-xs text-neutral-400">Broadcast institutional notices and review contact desk messages.</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await apiRequest('/api/owner/notifications/read', { method: 'POST' });
                    await loadOwnerPage('notifications');
                    await onRefreshSession();
                  }}
                  className="px-3.5 py-2 border border-[#292929] bg-[#171717] text-xs rounded cursor-pointer"
                >
                  Mark Notifications Read
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 bg-[#171717] border border-[#292929] rounded-md p-6 space-y-4">
                  <h2 className="font-serif text-xl font-semibold">Publish Platform Announcement</h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await apiRequest('/api/owner/announcements', {
                        method: 'POST',
                        body: JSON.stringify(newAnnouncement)
                      });
                      setNewAnnouncement({ title: '', content: '', audience: 'ALL' });
                      setBannerMsg({ type: 'success', text: 'Announcement published.' });
                      await loadOwnerPage('notifications');
                    }}
                    className="space-y-3"
                  >
                    <input
                      type="text"
                      required
                      value={newAnnouncement.title}
                      onChange={(e) => setNewAnnouncement({ ...newAnnouncement, title: e.target.value })}
                      placeholder="Announcement headline"
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                    />
                    <textarea
                      rows={3}
                      required
                      value={newAnnouncement.content}
                      onChange={(e) => setNewAnnouncement({ ...newAnnouncement, content: e.target.value })}
                      placeholder="Institutional notice content..."
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                    />
                    <button type="submit" className="w-full py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                      Broadcast Announcement
                    </button>
                  </form>

                  <div className="pt-4 border-t border-[#242424] space-y-3">
                    {announcements.map((a) => (
                      <div key={a.id} className="p-3 bg-[#101010] border border-[#242424] rounded text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-[#F7F5EF]">{a.title}</p>
                          <button
                            type="button"
                            onClick={async () => {
                              await apiRequest(`/api/owner/announcements/${a.id}`, { method: 'DELETE' });
                              await loadOwnerPage('notifications');
                            }}
                            className="text-rose-400 hover:underline cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="mt-1 text-neutral-400">{a.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-7 space-y-6">
                  <div className="bg-[#171717] border border-[#292929] rounded-md p-6">
                    <h2 className="font-serif text-xl font-semibold mb-4">System Alerts</h2>
                    <div className="divide-y divide-[#242424] text-xs">
                      {notifications.map((n) => (
                        <div key={n.id} className="py-3 flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-[#F7F5EF]">{n.title}</p>
                            <p className="mt-0.5 text-neutral-400">{n.message}</p>
                          </div>
                          <span className="font-mono text-neutral-500 shrink-0 tabular-nums">{n.created_at}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-[#171717] border border-[#292929] rounded-md p-6">
                    <h2 className="font-serif text-xl font-semibold mb-4">Public Contact Inquiries</h2>
                    {contactMessages.length === 0 ? (
                      <p className="text-xs text-neutral-500">No contact inquiries yet.</p>
                    ) : (
                      <div className="divide-y divide-[#242424] text-xs">
                        {contactMessages.map((cm) => (
                          <div key={cm.id} className="py-3">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-[#F7F5EF]">{cm.subject}</p>
                              <span className="font-mono text-neutral-500 tabular-nums">{cm.created_at}</span>
                            </div>
                            <p className="text-[#C6A66B] mt-0.5">{cm.name} · {cm.email}</p>
                            <p className="mt-1 text-neutral-300">{cm.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 10. AUDIT LOGS */}
          {page === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-5 border-b border-[#242424]">
                <div>
                  <h1 className="font-serif text-3xl font-semibold">Immutable Audit Trail</h1>
                  <p className="mt-1 text-xs text-neutral-400">Complete chronological record of administrative decisions and platform events.</p>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadOwnerPage('audit');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={auditQuery}
                    onChange={(e) => setAuditQuery(e.target.value)}
                    placeholder="Search actor, action, details..."
                    className="px-3 py-2 bg-[#171717] border border-[#292929] rounded text-xs text-[#F7F5EF]"
                  />
                  <button type="submit" className="px-4 py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                    Search
                  </button>
                </form>
              </div>

              <div className="bg-[#171717] border border-[#292929] rounded-md overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#242424] text-neutral-400">
                      <th className="py-3 px-4 font-medium">Timestamp</th>
                      <th className="py-3 px-4 font-medium">Administrator / Actor</th>
                      <th className="py-3 px-4 font-medium">Action</th>
                      <th className="py-3 px-4 font-medium">Record</th>
                      <th className="py-3 px-4 font-medium">Transition</th>
                      <th className="py-3 px-4 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#222]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#1C1C1C]">
                        <td className="py-3 px-4 font-mono text-neutral-400 tabular-nums whitespace-nowrap">{log.created_at}</td>
                        <td className="py-3 px-4 text-neutral-200">{log.actor_email}</td>
                        <td className="py-3 px-4 font-medium text-[#C6A66B]">{log.action}</td>
                        <td className="py-3 px-4 font-mono text-neutral-400">
                          {log.affected_table}
                          {log.affected_id ? ` #${log.affected_id}` : ''}
                        </td>
                        <td className="py-3 px-4 font-mono text-neutral-300">
                          {log.previous_status || '—'} → {log.new_status || '—'}
                        </td>
                        <td className="py-3 px-4 text-neutral-300">{log.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 11. PLATFORM SETTINGS */}
          {page === 'settings' && (
            <div className="max-w-3xl space-y-8">
              <div className="pb-5 border-b border-[#242424]">
                <h1 className="font-serif text-3xl font-semibold">Platform & Security Settings</h1>
                <p className="mt-1 text-xs text-neutral-400">Configure institutional parameters and Super Administrator credentials.</p>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiRequest('/api/owner/settings', { method: 'PUT', body: JSON.stringify({ settings }) });
                  setBannerMsg({ type: 'success', text: 'Platform settings saved.' });
                }}
                className="bg-[#171717] border border-[#292929] rounded-md p-6 space-y-4"
              >
                <h2 className="font-serif text-xl font-semibold">Academic Governance Policies</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1.5">Institution Name</label>
                    <input
                      type="text"
                      value={settings.institution_name || ''}
                      onChange={(e) => setSettings({ ...settings, institution_name: e.target.value })}
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1.5">Max Active Requests / Student</label>
                    <input
                      type="number"
                      value={settings.max_active_requests_per_student || '5'}
                      onChange={(e) => setSettings({ ...settings, max_active_requests_per_student: e.target.value })}
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1.5">Exchange Window (Days)</label>
                    <input
                      type="number"
                      value={settings.exchange_window_days || '14'}
                      onChange={(e) => setSettings({ ...settings, exchange_window_days: e.target.value })}
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs font-mono"
                    />
                  </div>
                </div>
                <button type="submit" className="px-5 py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                  Save Governance Settings
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiRequest('/api/auth/change-password', { method: 'POST', body: JSON.stringify(ownerPwdForm) });
                  setOwnerPwdForm({ currentPassword: '', newPassword: '' });
                  setBannerMsg({ type: 'success', text: 'Super Administrator password updated.' });
                }}
                className="bg-[#171717] border border-[#292929] rounded-md p-6 space-y-4"
              >
                <h2 className="font-serif text-xl font-semibold">Super Administrator Security</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1.5">Current Password</label>
                    <input
                      type="password"
                      required
                      value={ownerPwdForm.currentPassword}
                      onChange={(e) => setOwnerPwdForm({ ...ownerPwdForm, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-300 mb-1.5">New Password (min 8 chars)</label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={ownerPwdForm.newPassword}
                      onChange={(e) => setOwnerPwdForm({ ...ownerPwdForm, newPassword: e.target.value })}
                      className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded text-xs"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button type="submit" className="px-5 py-2 bg-[#C6A66B] text-[#101010] text-xs font-medium rounded cursor-pointer">
                    Update Password
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await apiRequest<{ recoveryKey: string }>('/api/owner/regenerate-recovery-key', { method: 'POST' });
                      setNewRecoveryKey(res.recoveryKey);
                    }}
                    className="px-4 py-2 border border-[#292929] text-neutral-300 hover:bg-[#222] text-xs rounded cursor-pointer"
                  >
                    Regenerate Recovery Key
                  </button>
                </div>
                {newRecoveryKey && (
                  <div className="p-3 bg-[#101010] border border-[#C6A66B]/40 rounded font-mono text-xs text-[#C6A66B] select-all">
                    New Recovery Key (save securely): {newRecoveryKey}
                  </div>
                )}
              </form>
            </div>
          )}
        </main>
      </div>

      {/* Student Detail Drawer */}
      {studentDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/70">
          <div className="w-full max-w-lg bg-[#171717] border-l border-[#292929] h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between border-b border-[#242424] pb-4">
              <div>
                <h2 className="font-serif text-2xl font-semibold">{studentDrawer.student.full_name}</h2>
                <p className="text-xs text-neutral-400">{studentDrawer.student.email} · {studentDrawer.student.student_id_number}</p>
              </div>
              <button type="button" onClick={() => setStudentDrawer(null)} className="p-1 text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-[0.14em] text-[#C6A66B] font-medium mb-2">Submitted Book Listings</h3>
              {studentDrawer.listings.length === 0 ? (
                <p className="text-xs text-neutral-500">No book listings.</p>
              ) : (
                <ul className="divide-y divide-[#242424] text-xs">
                  {studentDrawer.listings.map((l) => (
                    <li key={l.id} className="py-2 flex items-center justify-between">
                      <span>{l.title} ({l.listing_type})</span>
                      <StatusIndicator status={l.approval_status} dark />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs uppercase tracking-[0.14em] text-[#C6A66B] font-medium mb-2">Exchange History</h3>
              {studentDrawer.exchanges.length === 0 ? (
                <p className="text-xs text-neutral-500">No exchange history.</p>
              ) : (
                <ul className="divide-y divide-[#242424] text-xs">
                  {studentDrawer.exchanges.map((ex) => (
                    <li key={ex.id} className="py-2 flex items-center justify-between">
                      <span>{ex.book_title}</span>
                      <StatusIndicator status={ex.status} dark />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="w-full max-w-md bg-[#171717] border border-[#292929] rounded-md p-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#242424]">
              <h2 className="font-serif text-xl font-semibold">Edit Book Listing</h2>
              <button type="button" onClick={() => setEditingBook(null)} className="text-neutral-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await apiRequest(`/api/owner/books/${editingBook.id}`, {
                  method: 'PUT',
                  body: JSON.stringify({
                    title: editingBook.title,
                    author: editingBook.author,
                    edition: editingBook.edition,
                    availabilityStatus: editingBook.availability_status,
                    condition: editingBook.condition,
                    notes: editingBook.notes
                  })
                });
                setEditingBook(null);
                setBannerMsg({ type: 'success', text: 'Book listing updated.' });
                await loadOwnerPage('books');
              }}
              className="mt-4 space-y-3 text-xs"
            >
              <div>
                <label className="block text-neutral-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={editingBook.title}
                  onChange={(e) => setEditingBook({ ...editingBook, title: e.target.value })}
                  className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded"
                />
              </div>
              <div>
                <label className="block text-neutral-400 mb-1">Author</label>
                <input
                  type="text"
                  required
                  value={editingBook.author}
                  onChange={(e) => setEditingBook({ ...editingBook, author: e.target.value })}
                  className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Availability</label>
                  <select
                    value={editingBook.availability_status}
                    onChange={(e) =>
                      setEditingBook({
                        ...editingBook,
                        availability_status: e.target.value as BookListing['availability_status']
                      })
                    }
                    className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded"
                  >
                    <option value="AVAILABLE">Available</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="EXCHANGED">Exchanged</option>
                    <option value="DONATED">Donated</option>
                    <option value="UNAVAILABLE">Unavailable</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Condition</label>
                  <select
                    value={editingBook.condition}
                    onChange={(e) =>
                      setEditingBook({ ...editingBook, condition: e.target.value as BookListing['condition'] })
                    }
                    className="w-full px-3 py-2 bg-[#101010] border border-[#292929] rounded"
                  >
                    <option value="NEW">New</option>
                    <option value="LIKE_NEW">Like New</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                  </select>
                </div>
              </div>
              <div className="pt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setEditingBook(null)} className="px-4 py-2 border border-[#292929] rounded cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="px-4 py-2 bg-[#C6A66B] text-[#101010] font-medium rounded cursor-pointer">
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Action Modal */}
      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          requireReason={confirmState.requireReason}
          reasonLabel={confirmState.reasonLabel}
          destructive={confirmState.destructive}
          dark
          onCancel={() => setConfirmState(null)}
          onConfirm={async (reason) => {
            await confirmState.action(reason);
            setConfirmState(null);
          }}
        />
      )}
    </div>
  );
}
