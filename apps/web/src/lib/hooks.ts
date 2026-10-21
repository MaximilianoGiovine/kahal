'use client';

import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

/** useMutation con toast de éxito/error e invalidación de queries. */
export function useAction<TVars = void, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string; invalidate?: QueryKey[]; onSuccess?: (data: TData) => void } = {},
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      if (opts.success) toast.success(opts.success);
      opts.invalidate?.forEach((key) => qc.invalidateQueries({ queryKey: key }));
      opts.onSuccess?.(data);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Ocurrió un error'),
  });
}

/** Lee un <form> como objeto plano. Los checkbox se devuelven como boolean. */
export function formValues(form: HTMLFormElement) {
  const out: Record<string, string | boolean> = {};
  for (const el of Array.from(form.elements) as HTMLInputElement[]) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') {
      if (el.checked) out[el.name] = el.value;
    } else if (el.type !== 'file') out[el.name] = el.value;
  }
  return out;
}
