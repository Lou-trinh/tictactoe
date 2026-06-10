import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: [
      'https://lou-trinh.github.io',
      'http://localhost:5173',
      'http://localhost:4173',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Lắng nghe trên 0.0.0.0 để đảm bảo hoạt động trên các môi trường triển khai
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
