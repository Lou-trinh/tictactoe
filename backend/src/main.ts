import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Kích hoạt CORS cho ứng dụng
  app.enableCors({
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
  });

  // Lắng nghe trên 0.0.0.0 để đảm bảo hoạt động trên các môi trường triển khai
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();