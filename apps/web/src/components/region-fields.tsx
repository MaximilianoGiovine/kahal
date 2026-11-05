'use client';

import { useEffect, useState } from 'react';
import { CurrencyOptions } from './currency-options';
import { Field, Select } from './ui';

export const TIMEZONES: { value: string; label: string }[] = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { value: 'America/La_Paz', label: 'Bolivia' },
  { value: 'America/Sao_Paulo', label: 'Brasil (Brasilia)' },
  { value: 'America/Manaus', label: 'Brasil (Manaos)' },
  { value: 'America/Toronto', label: 'Canadá (este)' },
  { value: 'America/Winnipeg', label: 'Canadá (centro)' },
  { value: 'America/Edmonton', label: 'Canadá (montaña)' },
  { value: 'America/Vancouver', label: 'Canadá (pacífico)' },
  { value: 'America/Santiago', label: 'Chile' },
  { value: 'America/Bogota', label: 'Colombia' },
  { value: 'America/Costa_Rica', label: 'Costa Rica' },
  { value: 'America/Havana', label: 'Cuba' },
  { value: 'America/Guayaquil', label: 'Ecuador' },
  { value: 'America/El_Salvador', label: 'El Salvador' },
  { value: 'Europe/Madrid', label: 'España' },
  { value: 'America/New_York', label: 'Estados Unidos (este)' },
  { value: 'America/Chicago', label: 'Estados Unidos (centro)' },
  { value: 'America/Denver', label: 'Estados Unidos (montaña)' },
  { value: 'America/Los_Angeles', label: 'Estados Unidos (pacífico)' },
  { value: 'America/Guatemala', label: 'Guatemala' },
  { value: 'America/Tegucigalpa', label: 'Honduras' },
  { value: 'America/Mexico_City', label: 'México (centro)' },
  { value: 'America/Cancun', label: 'México (sureste)' },
  { value: 'America/Tijuana', label: 'México (noroeste)' },
  { value: 'America/Managua', label: 'Nicaragua' },
  { value: 'America/Panama', label: 'Panamá' },
  { value: 'America/Asuncion', label: 'Paraguay' },
  { value: 'America/Lima', label: 'Perú' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico' },
  { value: 'America/Santo_Domingo', label: 'República Dominicana' },
  { value: 'America/Montevideo', label: 'Uruguay' },
  { value: 'America/Caracas', label: 'Venezuela' },
];

/** Opciones de zona horaria; una ya guardada que no esté en la lista se conserva. */
export function TimezoneOptions({ current }: { current?: string }) {
  return (
    <>
      {current && !TIMEZONES.some((t) => t.value === current) && <option value={current}>{current.replace(/_/g, ' ')}</option>}
      {TIMEZONES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </>
  );
}

/**
 * Zona horaria y moneda de una iglesia nueva. No hay un valor neutro, así que se piden siempre:
 * la zona se propone según el dispositivo y la moneda se elige.
 */
export function RegionFields() {
  const [timezone, setTimezone] = useState('');
  useEffect(() => {
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (TIMEZONES.some((t) => t.value === own)) setTimezone(own);
  }, []);
  return (
    <>
      <Field label="Zona horaria">
        <Select name="timezone" required value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="">Elige una zona horaria</option>
          <TimezoneOptions />
        </Select>
      </Field>
      <Field label="Moneda principal">
        <Select name="currency" required defaultValue="">
          <option value="">Elige una moneda</option>
          <CurrencyOptions />
        </Select>
      </Field>
    </>
  );
}
