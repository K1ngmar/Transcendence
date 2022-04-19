import {
  Injectable,
  ConflictException,
  NotFoundException,
	UnauthorizedException,
	ImATeapotException,
	NotAcceptableException,
} from '@nestjs/common';
import {
  IncomingMessageDtO,
  CreateChatInterface,
  AllChatsDto,
	ChatActionDto,
} from './chat.types';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Chat } from 'src/orm/entities/chat.entity';
import { Message } from 'src/orm/entities/message.entity';
import { User } from 'src/orm/entities/user.entity';
import { UserService } from 'src/user/user.service';
import { SocketService } from 'src/websocket/socket.service';
import { Ban } from 'src/orm/entities/ban.entity';
import { Mute } from 'src/orm/entities/mute.entity';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Chat) private chatRepository: Repository<Chat>,
		@InjectRepository(Message) private messageRepository: Repository<Message>,
		@InjectRepository(Ban) private banRepository: Repository<Ban>,
		@InjectRepository(Mute) private muteRepository: Repository<Mute>,
		private userService: UserService,
		private socketService: SocketService,
  ) {}

  async findAll(user: User): Promise<AllChatsDto> {
		// Find all members and owner of all the rooms.
    const chats = await this.chatRepository.find({
      relations: ['members', 'owner'],
		});
		// Put the chatrooms into the interface to send it back to the frontend.
    const allChats: AllChatsDto = { joinedChats: [], otherChats: [] };
    for (const chat of chats) {
      if (this.userIsInChat(user, chat)) {
        allChats.joinedChats.push(chat);
      } else {
        if (chat.type !== 'private') {
          allChats.otherChats.push(chat);
        }
      }
    }
    return allChats;
  }

  async matchPassword(roomName: string, password: string): Promise<boolean> {
    const chat = await this.chatRepository.findOne({
      select: ['password', 'type'],
      where: [{ name: roomName }],
    });
    if (chat === undefined) {
      throw new NotFoundException();
    }
    if (chat.type !== 'protected') {
      return true;
    }
    return chat.password === password;
  }

  async findByName(name: string, relations = []): Promise<Chat> {
    return await this.chatRepository.findOne({
      where: [{ name: name }],
      relations: relations,
		});
	}

	async findByNameOrFail(name: string, relations = []): Promise<Chat> {
		const chat: Chat = await this.findByName(name, relations);
		if (chat === undefined) {
			throw new NotFoundException()
		}
		return chat;
	}

	async findById(id: number, relations = []): Promise<Chat> {
		const chat: Chat = await this.chatRepository.findOne({
			where: [{id: id}],
			relations: relations,
		});
		if (chat === undefined) {
			throw new NotFoundException();
		}
		return chat;
	}

  async createChat(param: CreateChatInterface): Promise<Chat> {
		// Check if the password has been set if the type is protected.
		if (param.type == 'protected' && param.password === '') {
			throw new ImATeapotException();
		}
		// Check if the roomname is valid.
    if (!this.isValidRoomname(param.name)) {
      throw new NotAcceptableException();
		}
		// Check if the chat does not already exist.
    const existingChat = await this.findByName(param.name);
    if (existingChat !== undefined) {
			throw new ConflictException();
		}
		// Create the new chat from the parameters.
    const chat: Chat = this.chatRepository.create(param);
		await this.chatRepository.save(chat);
		// Broadcast that a new room has been created.
		this.socketService.chatServer.emit('roomCreated', {room: chat});
		return chat;
	}

	async deleteChat(requestingUser: User, chatId: number): Promise<Chat> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['owner']);
		// Check if the user who requested the delete owns this chat.
		if (!this.userIsOwner(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Remove the chat.
		await this.chatRepository.remove(chat);
		// Broadcast to everyone in the room that it has been deleted.
		this.socketService.chatServer.emit('roomDeleted', {room: chat});
		return chat;
	}

	async addPassword(requestingUser: User, chatId: number, password: string): Promise<Chat> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['owner']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Check if requesting user is the owner.
		if (!this.userIsOwner(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Check if chat is of type public.
		if (chat.type !== 'public') {
			return;
		}
		// Add the password.
		chat.type = 'protected';
		chat.password = password;
		return await this.chatRepository.save(chat);
	}

	async changePassword(requestingUser: User, chatId: number, password: string): Promise<Chat> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['owner']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Check if the requesting user is the owner.
		if (!this.userIsOwner(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Check if chat is of type protected.
		if (chat.type !== 'protected') {
			return;
		}
		// Change the password.
		chat.password = password;
		return await this.chatRepository.save(chat);
	}

	async removePassword(requestingUser: User, chatId: number): Promise<Chat> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['owner']);
		if (chat === undefined) {
			throw new NotFoundException();
		}
		// Check if the requesting user is the owner.
		if (!this.userIsOwner(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Check if the chat is protected.
		if (chat.type !== 'protected') {
			return;
		}
		// Remove the password.
		chat.password = '';
		chat.type = 'public';
		return await this.chatRepository.save(chat);
	}

  async addMessage(message: IncomingMessageDtO, user: User): Promise<Message> {
    const messageToDatabase = {
      message: message.message,
      chatRoom: await this.findByNameOrFail(message.chatName),
      author: user,
    };
    const newMessage: Message =
      this.messageRepository.create(messageToDatabase);
    return await this.messageRepository.save(newMessage);
  }

  async userJoinsRoom(user: User, chat: Chat): Promise<void> {
    // Only let a user join if they're not in the room already.
    if (this.userIsInChat(user, chat)) {
      return;
    }
    chat.members.push(user);
    await this.chatRepository.save(chat);
    return;
  }

  async userLeavesRoom(user: User, chat: Chat): Promise<void> {
    // Remove the user from the members list.
    chat.members = chat.members.filter((item) => item.id != user.id);
    await this.chatRepository.save(chat);
    return;
  }

  async promoteAdmin(
    requestingUser: User,
    chatId: number,
    userId: number,
  ): Promise<void> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['admins', 'owner']);
		// Check if requesting user is owner.
		if (!this.userIsOwner(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Now get the user to which this promotion applies.
		const user: User = await this.userService.findById(userId);
    // Only add admin role if not already admin, or owner.
    if (this.userHasAdminPrivilege(user, chat)) {
      return;
    }
    chat.admins.push(user);
    await this.chatRepository.save(chat);
    this.broadcastRoleUpdate(chat.name, userId);
  }

  async demoteAdmin(
    requestingUser: User,
    chatId: number,
    userId: number,
  ): Promise<void> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['admins', 'owner']);
    // Check if requesting user is owner.
    if (!this.userIsOwner(requestingUser, chat)) {
      throw new UnauthorizedException();
		}
		// Now get the user to which this demotion applies.
		const user: User = await this.userService.findById(userId);
    // Remove the user from the admins list.
    chat.admins = chat.admins.filter((item) => item.id != user.id);
		await this.chatRepository.save(chat);
		// Broadcast the role update.
    this.broadcastRoleUpdate(chat.name, userId);
  }

  async changeRoomOwner(
    requestingUser: User,
    chatId: number,
    userId: number,
  ): Promise<void> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['admins', 'owner']);
    // Check if requesting user is owner.
    if (!this.userIsOwner(requestingUser, chat)) {
      throw new UnauthorizedException();
		}
		// Now get the user who will become the new owner.
		const user: User = await this.userService.findById(userId);
		// Update the user as owner in the database, and demote original owner to admin.
		chat.owner = user;
		chat.admins = chat.admins.filter((item) => item.id != user.id);
		chat.admins.push(requestingUser);
		await this.chatRepository.save(chat);
		// Broadcast the role update.
		this.broadcastRoleUpdate(chat.name, userId);
	}

	async userRoleInChat(chatId: number, userId: number): Promise<string> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['members', 'admins', 'owner']);
		// Get the user.
		const user: User = await this.userService.findById(userId);
		if (chat.owner.id === user.id) {
			return "OWNER";
		}
		for (const admin of chat.admins) {
			if (admin.id === user.id) {
				return "ADMIN";
			}
		}
		for (const member of chat.members) {
			if (member.id === user.id) {
				return "MEMBER";
			}
		}
		// User wasn't found, so throw a 404.
		throw new NotFoundException();
	}

	async inviteUserToChat(
		requestingUser: User,
		chatId: number,
		userId: number,
	): Promise<void> {
		// Is the user inviting themselves?
		if (requestingUser.id === userId) {
			return;
		}
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['members', 'admins', 'owner', 'invitedUsers']);
		// Check if the chat is private.
		if (chat.type !== 'private') {
			return;
		}
		// Check if the requesting user has admin privileges.
		if (!this.userHasAdminPrivilege(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Get the user to be invited.
		const user: User = await this.userService.findById(userId);
		// Check if the user is not already in the room.
		if (this.userIsInChat(user, chat)) {
			return;
		}
		// Check if the user was not already invited.
		if (this.userIsInvited(user, chat)) {
			return ;
		}
		// Invite the user.
		chat.invitedUsers.push(user);
		await this.chatRepository.save(chat);
		// Emit the event to both invited user and inviting user.
		this.socketService.emitToUser(requestingUser.id, 'chatroom', 'chatRoleUpdate');
		this.socketService.emitToUser(user.id, 'chatroom', 'chatRoleUpdate');
	}

	async removeInviteToChat(
		requestingUser: User,
		chatId: number,
		userId: number,
	): Promise<void> {
		// Is the user uninviting themselves?
		if (requestingUser.id === userId) {
			return;
		}
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['members', 'admins', 'owner', 'invitedUsers']);
		// Check if the chat is private.
		if (chat.type !== 'private') {
			return;
		}
		// Check if the requesting user has admin privileges.
		if (!this.userHasAdminPrivilege(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		// Get the user to be invited.
		const user: User = await this.userService.findById(userId);
		// Check if the user is invited.
		if (!this.userIsInvited(user, chat)) {
			return;
		}
		// Uninvite the user.
		chat.invitedUsers = chat.invitedUsers.filter((item) => item.id != user.id);
		await this.chatRepository.save(chat);
		// Emit the event to both invited user and uninviting user.
		this.socketService.emitToUser(requestingUser.id, 'chatroom', 'chatRoleUpdate');
		this.socketService.emitToUser(user.id, 'chatroom', 'chatRoleUpdate');
	}

	async acceptInvite(
		requestingUser: User,
		chatId: number,
	): Promise<void> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['invitedUsers', 'members']);
		// Check if this user is invited.
		if (!this.userIsInvited(requestingUser, chat)) {
			return ;
		}
		// Remove from invitedUsers, add to members.
		chat.invitedUsers = chat.invitedUsers.filter((item) => item.id != requestingUser.id);
		chat.members.push(requestingUser);
		await this.chatRepository.save(chat);
		// Broadcast.
		this.socketService.chatServer.to(chat.name).emit('userJoinedRoom', { chatName: chat.name, user: requestingUser });
	}

	async declineInvite(
		requestingUser: User,
		chatId: number,
	): Promise<void> {
		// Get the chat.
		const chat: Chat = await this.findById(chatId, ['invitedUsers']);
		// Check if this user is invited.
		if (!this.userIsInvited(requestingUser, chat)) {
			return ;
		}
		// Remove from the invitedUsers.
		chat.invitedUsers = chat.invitedUsers.filter((item) => item.id != requestingUser.id);
		await this.chatRepository.save(chat);
	}

	async getUserInvites(
		requestingUser: User,
	): Promise<Chat[]> {
		// Get the invites through the user service.
		return await this.userService.getInvites(requestingUser.id);
	}

	async getChatInvites(
		requestingUser: User,
		chatId: number,
	): Promise<User[]> {
		// Get the invites for a particular chat.
		const chat: Chat = await this.findById(chatId, ['invitedUsers', 'admins', 'owner']);
		if (!this.userHasAdminPrivilege(requestingUser, chat)) {
			throw new UnauthorizedException();
		}
		return chat.invitedUsers;
	}

	async getChatUninvites(
		requestingUser: User,
	): Promise<Chat[]> {
		let returnChats: Chat[] = [];
		// Get all the chats where this user is owner or admin.
		const userChats: User = await this.userService.findById(requestingUser.id, {
			relations: ['adminChats', 'ownedChats'],
		});
		const chats: Chat[] = userChats.ownedChats.concat(userChats.adminChats).filter((item) => item.type === 'private');
		// Cycle through the chats and find the invited users for those chats.
		for (let adminChat of chats) {
			const chat: Chat = await this.findById(adminChat.id, ['invitedUsers']);
			returnChats.push(chat);
		}
		return returnChats;
	}

	async banUser(
		requestingUser: User,
		banInfo: ChatActionDto,
	): Promise<void> {

	}

	async unbanUser(
		requestingUser: User,
		chatId: number,
		userId: number,
	): Promise<void> {

	}

	async muteUser(
		requestingUser: User,
		muteInfo: ChatActionDto,
	): Promise<void> {

	}

	async unmuteUser(
		requestingUser: User,
		chatId: number,
		userId: number,
	): Promise<void> {

	}

  userIsInChat(user: User, chat: Chat): boolean {
    // Look through the members and see if the user is in there.
    for (const member of chat.members) {
      if (member.id === user.id) {
        return true;
      }
    }
    return false;
	}
	
	userIsInvited(user: User, chat: Chat): boolean {
		// Look through the invitedUsers and see if the user is in there.
		for (const invitedUser of chat.invitedUsers) {
			if (invitedUser.id === user.id) {
				return true;
			}
		}
		return false;
	}

  userIsOwner(user: User, chat: Chat): boolean {
    return chat.owner.id === user.id;
  }

  userHasAdminPrivilege(user: User, chat: Chat): boolean {
    if (chat.owner.id === user.id) {
      return true;
    }
    for (const admin of chat.admins) {
      if (admin.id === user.id) {
        return true;
      }
    }
    return false;
  }

  isValidRoomname(name: string): boolean {
		const len = name.length;
		if (len > 20) {
			return false;
		}
    for (let i = 0; i < len; i++) {
      const char = name.charCodeAt(i);
      if (
        !(char > 47 && char < 58) &&
        !(char > 64 && char < 91) &&
        !(char > 96 && char < 123) &&
        !(char == 95)
      ) {
        return false;
      }
      if (i == 0 && char == 95) {
        return false;
      }
    }
    return true;
	}

	broadcastRoleUpdate(chatName: string, userId: number): void {
		// Do 2 emits:
		// 1. roleUpdate. To the user that was promoted.
		this.socketService.emitToUser(userId, 'chatroom', 'roleUpdate')
		// 2. roleUpdate_{id}. To all users in the chat room where it happened.
		this.socketService.chatServer.to(chatName).emit('roleUpdate_' + userId);
	}
}
