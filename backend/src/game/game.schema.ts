import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema()
export class Game extends Document {
  @Prop({ required: true })
  player1: string;

  @Prop({ required: true })
  player2: string;

  @Prop({ type: [String], default: Array(9).fill(null) }) // Chỉ định kiểu rõ ràng
  board: (string | null)[];

  @Prop({ default: null })
  winner: string;
}

export const GameSchema = SchemaFactory.createForClass(Game);
