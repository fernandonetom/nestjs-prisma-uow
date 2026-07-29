import { Injectable } from '@nestjs/common';
import { PrismaUnitOfWork } from '@feneto/nestjs-prisma-uow';
import type { PrismaClient } from '@prisma/client';
import type { IUserRepository } from '../../domain/users/i-user.repository';
import { User } from '../../domain/users/user.entity';

/**
 * Infrastructure implementation of IUserRepository.
 *
 * Maps Prisma models to User domain entities.
 */
@Injectable()
export class UsersRepository implements IUserRepository {
  constructor(private readonly uow: PrismaUnitOfWork<PrismaClient>) {}

  async findByEmail(email: string): Promise<User | null> {
    const client = this.uow.transaction;
    const result = await client.user.findUnique({ where: { email } });
    if (!result) return null;
    return new User(result.id, result.email, result.name);
  }

  async create(params: { email: string; name: string }): Promise<User> {
    const client = this.uow.transaction;
    const result = await client.user.create({
      data: { email: params.email, name: params.name },
    });
    return new User(result.id, result.email, result.name);
  }
}
