/** Types shared by every area. Feature-specific types can come from `npm run api:types`. */

export type Role = 'user' | 'admin' | 'airline_moderator' | 'hotel_moderator';
export type AccountStatus = 'active' | 'suspended' | 'deactivated';
export type BookingStatus = 'pending_payment' | 'confirmed' | 'completed' | 'expired' | 'cancelled';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: AccountStatus;
  phone: string | null;
  preferredCurrency: string;
  mustChangePassword: boolean;
  moderatorAssignment: { providerType: 'airline' | 'hotel'; providerId: string } | null;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Every paginated list from the backend (GEN-05). */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** How an author is shown next to content; deactivated accounts come back as "Deleted user". */
export interface PublicAuthor {
  id: string | null;
  name: string;
}

export interface UploadedImage {
  id: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt?: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  data?: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface Currency {
  id: string;
  code: string;
  name: string;
  symbol?: string;
}
