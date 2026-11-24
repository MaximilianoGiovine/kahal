import { MessageCircle } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { supportWhatsappUrl } from '@/lib/billing';

/** Contacto directo para iglesias que no pueden aportar. No se muestra si no hay número configurado. */
export function SupportWhatsapp({ phone, className }: { phone: string | null | undefined; className?: string }) {
  if (!phone) return null;
  return (
    <div className={className}>
      <p className="text-sm text-muted">Si tu iglesia carece de los medios para apoyar el proyecto, haz clic aquí.</p>
      <a href={supportWhatsappUrl(phone)} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary', 'md', 'mt-2')}>
        <MessageCircle className="size-4" /> Escribir por WhatsApp
      </a>
    </div>
  );
}
