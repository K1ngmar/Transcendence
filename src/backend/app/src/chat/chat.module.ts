import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { Chat } from 'src/orm/entities/chat.entity';
import { Message } from 'src/orm/entities/message.entity';
import { CookieModule } from 'src/websocket/cookie.module';
import { UserModule } from 'src/user/user.module';
import { DirectMessage } from 'src/orm/entities/directmessage.entity';
import { FriendModule } from 'src/friend/friend.module';

@Module({
  imports: [TypeOrmModule.forFeature([Chat, Message, DirectMessage]), CookieModule, UserModule, FriendModule],
  exports: [ChatService],
  providers: [ChatService, ChatGateway],
  controllers: [ChatController],
})
export class ChatModule {}
