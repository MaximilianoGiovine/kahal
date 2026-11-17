import { IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ChatMessageDto {
  @IsString() @MinLength(1) @MaxLength(500, { message: 'El mensaje no puede superar los 500 caracteres' }) body: string;
}

export class ChatLogsQuery extends PageQuery {}
