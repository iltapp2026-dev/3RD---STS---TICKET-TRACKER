import { Timestamp } from 'firebase/firestore';

export type TicketStatus = 'open' | 'in-progress' | 'resolved' | 'closed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Vendor {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  category?: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: Priority;
  vendorId: string;
  vendorName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
  authInfo: any;
}
