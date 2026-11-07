import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/** Una sede borrada entre la validación y el guardado la frena la clave foránea: es un error de la petición, no del servidor. */
@Catch(Prisma.PrismaClientKnownRequestError)
export class CampusGoneFilter extends BaseExceptionFilter {
  catch(e: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(e.code === 'P2003' && e.message.includes('campusId') ? new BadRequestException('Esa sede ya no existe') : e, host);
  }
}
