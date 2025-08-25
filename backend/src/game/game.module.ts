import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameGateway } from './game.gateway';
import { Game, GameSchema } from './game.schema'; // Đảm bảo bạn có GameSchema

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Game.name, schema: GameSchema }]),
  ],
  providers: [GameGateway], // Khai báo GameGateway là một provider
})
export class GameModule {}