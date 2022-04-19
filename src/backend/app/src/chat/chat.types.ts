import { IsString, IsNotEmpty, IsOptional, IsIn, IsInt } from 'class-validator';
import { User } from 'src/orm/entities/user.entity';
import { Chat } from 'src/orm/entities/chat.entity';
import { ApiProperty } from '@nestjs/swagger';
import { Timestamp } from 'typeorm';

const CHATROOM_TYPES = ['private', 'protected', 'public'];

export interface AllChatsDto {
  joinedChats: Chat[];
  otherChats: Chat[];
}

export class CreateChatDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsIn(CHATROOM_TYPES)
  type: string;
}

export class CreateChatInterface extends CreateChatDto {
  owner: User;
  members: User[];
}

export class IncomingMessageDtO {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsNotEmpty()
  chatName: string;
}

export class ChatRoomDto {
  @IsString()
  @IsNotEmpty()
  roomName: string;

  @IsString()
  @IsOptional()
  password: string;
}

export class ChatUserDto {
	@IsInt()
	@IsNotEmpty()
	@ApiProperty({
		type: Number,
	})
	chatId: number;

	@IsInt()
	@IsNotEmpty()
	@ApiProperty({
		type: Number,
	})
	userId: number;
}

export class ChatPasswordDto {
	@IsInt()
	@IsNotEmpty()
	@ApiProperty({
		type: Number,
	})
	chatId: number;

	@IsString()
	@IsOptional()
	@ApiProperty()
	password: string;
}

export class ChatActionDto extends ChatUserDto {
	@IsInt()
	@IsNotEmpty()
	@ApiProperty({
		type: Date,
	})
	expirationDate: Date;
}
