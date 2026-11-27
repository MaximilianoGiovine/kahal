import { MessageCircle } from 'lucide-react';
import { buttonClass } from '@/components/ui';
import { whatsappUrl } from '@/lib/billing';

/** Abre WhatsApp con un mensaje ya escrito. No se muestra si no hay número configurado. */
export function WhatsappButton({
  phone,
  message,
  label = 'Escribir por WhatsApp',
  variant = 'primary',
  className,
}: {
  phone: string | null | undefined;
  message: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  className?: string;
}) {
  if (!phone) return null;
  return (
    <a href={whatsappUrl(phone, message)} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, 'md', className)}>
      <MessageCircle className="size-4" /> {label}
    </a>
  );
}
