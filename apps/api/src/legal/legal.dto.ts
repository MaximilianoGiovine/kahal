import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @Equals('ELIMINAR', { message: 'Escribe ELIMINAR para confirmar' }) confirm: string;
  /** No hace falta en cuentas creadas con Google o Apple sin contraseña. */
  @IsOptional() @IsString() @MaxLength(100) password?: string;
}

export class ScheduleChurchDeletionDto {
  /** Identificador de la iglesia, escrito a mano para evitar equivocarse de iglesia. */
  @IsString() @MaxLength(60) confirm: string;
  @IsOptional() @IsString() @MaxLength(100) password?: string;
}
