import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      'mongodb://mongo:wIJRXRTynxlIArjGuFoCobkodIYGFQSS@trolley.proxy.rlwy.net:43934',
    ), // Thay bằng URI MongoDB của bạn
    GameModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
