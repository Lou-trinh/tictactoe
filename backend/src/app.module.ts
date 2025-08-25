import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      'mongodb://mongo:SPLiyfZWsazGtAuvvaxfvAVVLdlmimrE@gondola.proxy.rlwy.net:53244',
    ), // Thay bằng URI MongoDB của bạn
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
