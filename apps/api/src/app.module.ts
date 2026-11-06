import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ActivityModule } from './activity/activity.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { ArticlesModule } from './articles/articles.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { SubscriptionGuard } from './billing/subscription.guard';
import { ChurchesModule } from './churches/churches.module';
import { AuthGuard } from './common/auth.guard';
import { PermissionsGuard } from './common/permissions.guard';
import { CalendarModule } from './calendar/calendar.module';
import { CampusesModule } from './campuses/campuses.module';
import { ContentModule } from './content/content.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { FilesModule } from './files/files.module';
import { FinanceModule } from './finance/finance.module';
import { HealthController } from './health/health.controller';
import { LegalModule } from './legal/legal.module';
import { MailModule } from './mail/mail.module';
import { MembersModule } from './members/members.module';
import { PrismaModule } from './prisma/prisma.module';
import { PushModule } from './push/push.module';
import { RolesModule } from './roles/roles.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 300 }],
      errorMessage: 'Demasiados intentos. Espera un minuto y vuelve a probar.',
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>('JWT_SECRET') }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get('REDIS_URL') ?? 'redis://localhost:6379');
        return {
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
          },
          prefix: 'kahal',
        };
      },
    }),
    PrismaModule,
    MailModule,
    PushModule,
    FilesModule,
    ActivityModule,
    AuthModule,
    ChurchesModule,
    CampusesModule,
    RolesModule,
    UsersModule,
    MembersModule,
    FinanceModule,
    ContentModule,
    CalendarModule,
    AppointmentsModule,
    ArticlesModule,
    LegalModule,
    BillingModule,
  ],
  controllers: [HealthController, DashboardController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
