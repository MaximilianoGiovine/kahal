'use client';

import { useState, type ReactNode } from 'react';
import { Dialog } from './dialog';
import { Button, Field, Input } from './ui';

/** Confirmación de un borrado grave: hay que escribir una palabra y, si la cuenta la tiene, la contraseña. */
export function DeleteConfirm({
  title,
  description,
  word,
  askPassword,
  confirmLabel,
  loading,
  onClose,
  onConfirm,
}: {
  title: string;
  description: ReactNode;
  word: string;
  askPassword: boolean;
  confirmLabel: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (values: { confirm: string; password?: string }) => void;
}) {
  const [confirm, setConfirm] = useState('');
  const [password, setPassword] = useState('');
  const ready = confirm === word && (!askPassword || !!password);
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" disabled={!ready} loading={loading} onClick={() => onConfirm({ confirm, ...(askPassword && { password }) })}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm text-muted">{description}</div>
        <Field label={`Escribe ${word} para confirmar`}>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="none" />
        </Field>
        {askPassword && (
          <Field label="Tu contraseña">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
        )}
      </div>
    </Dialog>
  );
}
