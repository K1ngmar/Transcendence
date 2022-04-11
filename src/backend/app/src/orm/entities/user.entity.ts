import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Match } from './match.entity';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  Equals,
  ValidateIf,
} from 'class-validator';
import { Exclude } from 'class-transformer';
import { Friend } from './friend.entity';
import { Avatar } from './avatar.entity';

//////     //////
// User Entity //
//////     //////

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  intraId: string;

  @Column({ unique: true })
  username: string;

  @OneToOne(() => Avatar, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'avatarId' })
  avatar?: Avatar;

  @Column({ nullable: true })
  avatarId?: number;

  @OneToMany(() => Match, (match) => match.winner)
  wins: Match[];

  @OneToMany(() => Match, (match) => match.loser)
  losses: Match[];

  // Friendships
  @OneToMany(() => Friend, (relation: Friend) => relation.relatingUser)
  relatingUsers: Friend[];

  @OneToMany(() => Friend, (relation: Friend) => relation.relatedUser)
  relatedUsers: Friend[];

  @Column({ default: 'OFFLINE' })
  status: string;

  // Two Factor
  @Column({ nullable: true })
  @Exclude()
  twoFactorSecret: string;

  @Column({ default: false })
  twoFactorEnabled: boolean;
}

//////      //////
// Partial User //
//////      //////

// can only have username and avatar, otherwise the update shouldn't occur from an endpoints
export class PartialUser {
  @IsString()
  @IsOptional()
  username?: string;

  @Equals(undefined)
  avatar?: Avatar;

  @Equals(undefined)
  intraId?: string;

  @Equals(undefined)
  status?: string;

  @Equals(undefined)
  twoFactorSecret?: string;

  @Equals(undefined)
  twoFactorEnabled?: boolean;
}
