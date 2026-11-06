import { CURRENCY_GROUPS } from '@/lib/currencies';

/** El servidor y cada navegador traen datos distintos, así que algunos nombres pueden no coincidir al hidratar. */
const names = new Intl.DisplayNames('es', { type: 'currency' });

/** Opciones de un Select de moneda, agrupadas por región. */
export function CurrencyOptions() {
  return CURRENCY_GROUPS.map((group) => (
    <optgroup key={group.label} label={group.label}>
      {group.codes.map((code) => (
        <option key={code} value={code} suppressHydrationWarning>
          {code} · {names.of(code)}
        </option>
      ))}
    </optgroup>
  ));
}
