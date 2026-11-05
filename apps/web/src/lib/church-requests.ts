import { api } from './api';

export interface ChurchRequest {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  name: string;
  slug: string;
  city: string | null;
  message: string | null;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string;
  rejectionReason: string | null;
  createdAt: string;
}

/** Vive bajo la clave `admin` para refrescarse junto con el resto de la plataforma. */
export const churchRequestsQuery = {
  queryKey: ['admin', 'church-requests'],
  queryFn: () => api<ChurchRequest[]>('/admin/church-requests'),
};
