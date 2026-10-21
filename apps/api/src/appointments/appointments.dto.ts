import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AppointmentStatus } from '@prisma/client';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class AvailabilitySlotDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @Matches(HHMM, { message: 'Hora inválida (HH:mm)' }) startTime: string;
  @Matches(HHMM, { message: 'Hora inválida (HH:mm)' }) endTime: string;
  @IsOptional() @IsIn([15, 20, 30, 45, 60, 90]) slotMinutes?: number;
}

export class SetAvailabilityDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots: AvailabilitySlotDto[];
}

export class SlotsQuery {
  @IsString() hostId: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) days?: number;
}

export class BookDto {
  @IsString() hostId: string;
  @IsDateString() startsAt: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AppointmentsQuery {
  @IsOptional() @IsIn(['mine', 'hosting', 'all']) scope?: 'mine' | 'hosting' | 'all';
  @IsOptional() @IsEnum(AppointmentStatus) status?: AppointmentStatus;
  @IsOptional() @IsIn(['upcoming', 'past']) when?: 'upcoming' | 'past';
}

export class UpdateStatusDto {
  @IsEnum(AppointmentStatus) status: AppointmentStatus;
  @IsOptional() @IsString() @MaxLength(2000) hostNotes?: string;
}
