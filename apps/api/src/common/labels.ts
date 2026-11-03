import { AppointmentStatus, TransactionType } from '@prisma/client';

export const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
};

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: 'Pendiente',
  CONFIRMED: 'Confirmada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Realizada',
};
