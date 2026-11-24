export type UserRole = 'SUPER_ADMIN' | 'STUDENT';

export interface User {
  id: number;
  email: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  is_verified: number;
}

export interface StudentProfile {
  user_id: number;
  full_name: string;
  student_id_number: string;
  department_id: number | null;
  semester_id: number | null;
  department_name?: string;
  department_code?: string;
  semester_label?: string;
  phone: string;
  bio: string;
  avatar_url: string;
  verification_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  verification_note: string;
  updated_at?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
}

export interface Department {
  id: number;
  code: string;
  name: string;
}

export interface Semester {
  id: number;
  number: number;
  label: string;
}

export interface Subject {
  id: number;
  department_id: number;
  semester_id: number;
  code: string;
  name: string;
  department_name?: string;
  department_code?: string;
  semester_label?: string;
}

export interface BookListing {
  listing_id?: number;
  id?: number;
  book_id: number;
  owner_student_id: number;
  listing_type: 'EXCHANGE' | 'LEND' | 'DONATION';
  condition: 'NEW' | 'LIKE_NEW' | 'GOOD' | 'FAIR';
  availability_status: 'AVAILABLE' | 'RESERVED' | 'EXCHANGED' | 'DONATED' | 'UNAVAILABLE';
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REMOVED';
  rejection_reason?: string;
  notes: string;
  created_at: string;
  title: string;
  author: string;
  isbn: string;
  edition: string;
  publisher: string;
  publication_year: number | null;
  description: string;
  cover_image_url: string;
  category_id: number | null;
  category_name?: string;
  department_id: number | null;
  department_code?: string;
  department_name?: string;
  semester_id: number | null;
  semester_number?: number;
  semester_label?: string;
  subject_id: number | null;
  subject_code?: string;
  subject_name?: string;
  owner_name?: string;
  owner_email?: string;
  owner_sid?: string;
  owner_verification_status?: string;
  owner_department_name?: string;
}

export interface ExchangeRequest {
  id: number;
  listing_id: number;
  requester_student_id: number;
  offered_listing_id: number | null;
  message: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  rejection_reason: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  book_title: string;
  book_author: string;
  cover_image_url?: string;
  listing_type?: string;
  condition?: string;
  owner_name?: string;
  owner_email?: string;
  requester_name?: string;
  requester_email?: string;
  offered_book_title?: string;
}

export interface DonationRequest {
  id: number;
  listing_id: number;
  donor_student_id: number;
  recipient_student_id: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  purpose: string;
  rejection_reason: string;
  created_at: string;
  book_title: string;
  book_author: string;
  cover_image_url?: string;
  donor_name?: string;
  recipient_name?: string;
  recipient_email?: string;
}

export interface NotificationItem {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  related_entity_type: string;
  related_entity_id: number | null;
  is_read: number;
  created_at: string;
}

export interface AuditLogItem {
  id: number;
  actor_user_id: number | null;
  actor_email: string;
  action: string;
  affected_table: string;
  affected_id: number | null;
  previous_status: string;
  new_status: string;
  details: string;
  created_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  audience: string;
  is_active: number;
  created_at: string;
}

export interface PublicMetadata {
  categories: Category[];
  departments: Department[];
  semesters: Semester[];
  subjects: Subject[];
  announcements: Announcement[];
  stats: {
    approvedBooks: number;
    completedExchanges: number;
    approvedDonations: number;
    activeStudents: number;
  };
}
