export type Role = "mechanic" | "client";

// Row types mirror the database columns (snake_case), as returned by supabase-js selects.
// Timestamps and dates are ISO strings; `date` columns are "YYYY-MM-DD".

export interface Client {
  id: string;
  mechanic_id: string;
  user_id: string | null;
  name: string;
  email: string;
  created_at: string;
}

export interface Vehicle {
  id: string;
  client_id: string;
  make: string;
  model: string;
  registration_number: string;
  created_at: string;
}

export interface ServiceEntry {
  id: string;
  vehicle_id: string;
  mechanic_id: string;
  service_type: string;
  service_date: string;
  mileage: number;
  cost: number | null;
  notes: string | null;
  next_due_mileage: number | null;
  next_due_date: string | null;
  created_at: string;
}

export interface NewClientInput {
  name: string;
  email: string;
  make: string;
  model: string;
  registrationNumber: string;
}

export interface NewServiceEntryInput {
  serviceType: string;
  serviceDate: string;
  mileage: number;
  cost: number;
  notes?: string;
  nextDueMileage?: number;
  nextDueDate?: string;
}
