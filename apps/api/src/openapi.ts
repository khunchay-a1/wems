/* eslint-disable no-console -- CLI entry point */
import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument, configureApp } from './app.setup';

const OPERATION_ID = /^[A-Z][A-Za-z]+_[a-z][A-Za-z0-9]+$/;

/**
 * Writes packages/api-contract/openapi.json (ADR-0002). Runs Nest in preview mode — routes and DTO
 * metadata only, no database or Redis connections.
 */
async function main(): Promise<void> {
  const out = resolve(
    process.argv[2] ?? `${__dirname}/../../../packages/api-contract/openapi.json`,
  );
  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  configureApp(app);
  const doc = buildOpenApiDocument(app);
  const ids = new Map<string, string>();
  const problems: string[] = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, { operationId?: string }>)) {
      if (!op || typeof op !== 'object' || !('responses' in op)) continue;
      const id = op.operationId ?? '';
      if (!OPERATION_ID.test(id))
        problems.push(
          `${method.toUpperCase()} ${path}: operationId "${id}" must be <Tag>_<verbNoun>`,
        );
      if (ids.has(id)) problems.push(`duplicate operationId ${id} (${ids.get(id)} and ${path})`);
      ids.set(id, path);
    }
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  // stable output: no server-specific bits
  doc.servers = [{ url: '/' }];
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`openapi: ${ids.size} operations → ${out}`);
  await app.close();
}

void main();
