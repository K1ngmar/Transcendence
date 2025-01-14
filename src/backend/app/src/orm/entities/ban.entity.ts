import { Entity, PrimaryColumn, ManyToOne, Column } from 'typeorm';
import { User } from './user.entity';
import { Chat } from './chat.entity';

@Entity()
export class Ban {
  @PrimaryColumn()
  @ManyToOne(() => User, (user: User) => user.bans, {
    onDelete: 'CASCADE',
  })
  userId: number;

  @PrimaryColumn()
  @ManyToOne(() => Chat, (chat: Chat) => chat.bans, {
    onDelete: 'CASCADE',
  })
  chatId: number;

  @Column({ type: 'timestamp' })
  expirationDate: Date;
}
