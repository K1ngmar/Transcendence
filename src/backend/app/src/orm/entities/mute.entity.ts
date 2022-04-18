import { Entity, PrimaryColumn, ManyToOne, Column } from "typeorm";
import { User } from "./user.entity";
import { Chat } from "./chat.entity";

@Entity()
export class Mute {
	@PrimaryColumn()
	@ManyToOne(() => User)
	user: User;

	@PrimaryColumn()
	@ManyToOne(() => Chat)
	chat: Chat;

	@Column({type: 'timestamp'})
	expirationDate: Date;
}
