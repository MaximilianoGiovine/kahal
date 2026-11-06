import { api } from './api';

export interface LegalDocument {
  key: 'privacy' | 'contract';
  title: string;
  version: string;
  effectiveDate: string;
  sections: { title: string; paragraphs: string[] }[];
}

export const legalDocumentQuery = (key: LegalDocument['key']) => ({
  queryKey: ['legal', key],
  queryFn: () => api<LegalDocument>(`/public/legal/${key}`),
});
