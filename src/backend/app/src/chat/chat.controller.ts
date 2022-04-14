import { ApiTags, ApiParam } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
  UseGuards,
  Req,
	NotAcceptableException,
	ImATeapotException,
	Delete,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateChatDto, CreateChatInterface, AllChatsDto, ChatRoleDto } from './chat.types';
import { Chat } from 'src/orm/entities/chat.entity';
import { User } from 'src/orm/entities/user.entity';
import { Message } from 'src/orm/entities/message.entity';
import { SocketService } from 'src/websocket/socket.service';
import { AuthenticatedGuard } from 'src/auth/auth.guard';
import { RequestWithUser } from '../auth/auth.types';

@ApiTags('chat')
@Controller('chat')
@UseGuards(AuthenticatedGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private socketService: SocketService,
  ) {}

  @Get()
  async findAll(@Req() request: RequestWithUser): Promise<AllChatsDto> {
    // Get all basic information about the chat rooms.

    return await this.chatService.findAll(request.user);
  }

  @Get('/messages/:name')
  @ApiParam({
    name: 'name',
    required: true,
    description: 'Name of a chatroom',
    type: String,
  })
  async getMessagesForChat(@Param('name') name: string): Promise<Message[]> {
    // Get all the messages for a particular chat.
    const chat: Chat = await this.chatService.findByName(name, [
      'messages',
			'messages.author',
    ]);
    if (chat === undefined) throw new NotFoundException();
    return chat.messages;
  }

  @Get('/users/:name')
  @ApiParam({
    name: 'name',
    required: true,
    description: 'Name of a chatroom',
    type: String,
  })
  async getUsersForChat(@Param('name') name: string): Promise<User[]> {
    // Get all the members for a particular chat.
    const chat: Chat = await this.chatService.findByName(name, ['members']);
    if (chat === undefined) throw new NotFoundException();
    return chat.members;
  }

	@Get('/admins/:name')
	@ApiParam({
		name: 'name',
		required: true,
		description: 'Name of a chatroom',
		type: String,
	})
	async getAdminsForChat(@Param('name') name: string): Promise<User[]> {
		// Get all the admins for a particular chat.
		const chat: Chat = await this.chatService.findByName(name, ['admins']);
		console.log(chat);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		return chat.admins;
	}

  @Post()
  async createChat(
    @Req() request: RequestWithUser,
    @Body() body: CreateChatDto,
  ): Promise<Chat> {
    // Create an interface from the DTO.
    const createChatInterface: CreateChatInterface = {
      ...body,
      owner: request.user,
      members: [request.user],
		};
		if (createChatInterface.type == 'protected' && createChatInterface.password === '') {
			throw new ImATeapotException();
		}
    const valid: boolean = this.chatService.isValidRoomname(createChatInterface.name);
    if (!valid) {
      throw new NotAcceptableException();
    }
    // Add the chat to the database.
    const chat: Chat = await this.chatService.createChat(createChatInterface);
    // Broadcast the new room to everyone.
    this.socketService.chatServer.emit('createRoom', { room: chat });
    console.log('Emited createRoom');
    return chat;
	}

	@Post('/admin')
	async promoteAdmin(
		@Req() request: RequestWithUser,
		@Body() body: ChatRoleDto,
	): Promise<void> {
		// Find the relevant chat.
		const chat: Chat = await this.chatService.findByName(body.chatName, ['admins']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Set the new user to admin, if possible.
		const success: boolean = await this.chatService.promoteAdmin(request.user, body.user, chat);
		if (success) {
			this.broadcastRoleUpdate(chat.name, body.user.id);
		}
	}

	@Delete('/admin')
	async demoteAdmin(
		@Req() request: RequestWithUser,
		@Body() body: ChatRoleDto,
	): Promise<void> {
		// Find the relevant chat.
		const chat: Chat = await this.chatService.findByName(body.chatName, ['admins']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Remove the user as admin, if possible.
		const success: boolean = await this.chatService.demoteAdmin(request.user, body.user, chat);
		if (success) {
			this.broadcastRoleUpdate(chat.name, body.user.id);
		}
	}

	@Post('/owner')
	async changeRoomOwner(
		@Req() request: RequestWithUser,
		@Body() body: ChatRoleDto,
	): Promise<void> {
		// Find the relevant chat.
		const chat: Chat = await this.chatService.findByName(body.chatName, ['admins']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Change the room owner, if possible.
		const success: boolean = await this.chatService.changeRoomOwner(request.user, body.user, chat);
		if (success) {
			this.broadcastRoleUpdate(chat.name, body.user.id);
		}
	}

	broadcastRoleUpdate(chatName: string, userId: number): void {
		// Do 2 emits:
		// 1. roleUpdate. To the user that was promoted.
		this.socketService.sockets[userId].chatroom.emit('roleUpdate');
		// 2. roleUpdate_{id}. To all users in the chat room where it happened.
		this.socketService.chatServer.to(chatName).emit('roleUpdate_' + userId);
	}
}
