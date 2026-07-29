import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { User } from '../../domain/users/user.entity';
import { UsersRepository } from '../../infrastructure/repositories/users.repository';

/**
 * Application service for User aggregate operations.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly userRepo: UsersRepository,
    private readonly uow: PrismaUnitOfWork<PrismaClient>,
  ) {}

  async createUser(params: { email: string; name: string }): Promise<User> {
    return this.uow.do(async () => {
      return this.userRepo.create(params);
    });
  }
}
