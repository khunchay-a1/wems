import { Body, Controller, Module, Post } from '@nestjs/common';
import { IsInt, IsString, Min } from 'class-validator';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { Public } from '../src/common/auth/public.decorator';
import { Problem } from '../src/common/errors/problem';
import { createTestApp, type TestApp } from './utils/app';

class EchoDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  version!: number;
}

@Public()
@Controller('test-echo')
class EchoController {
  @Post()
  echo(@Body() dto: EchoDto): EchoDto {
    return dto;
  }

  @Post('rule')
  rule(): never {
    throw new Problem('DOC_PDF_RENDITION_REQUIRED', { rule: 'BR-DOC-030' });
  }

  @Post('boom')
  boom(): never {
    throw new Error('database password=secret leaked?');
  }
}

@Module({ controllers: [EchoController] })
class EchoModule {}

describe('P0-03 API skeleton', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('GET /api/v1/health/live is public and returns ok with a request id', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok', checks: {} });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /api/v1/health/ready checks the database', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(res.body.checks.database).toBe('up');
  });

  it('echoes the client X-Request-Id', async () => {
    const res = await request(t.app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'req-12345678');
    expect(res.headers['x-request-id']).toBe('req-12345678');
  });

  it('unknown routes are 404 problem+json', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/nope').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('sets security headers (helmet)', async () => {
    const res = await request(t.app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('P0-03 problem+json and validation', () => {
  async function echoApp() {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, EchoModule],
    }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    return app;
  }

  it('invalid DTO → 400 VALIDATION_FAILED with errors[] (Thai by default)', async () => {
    const app = await echoApp();
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-echo')
        .send({ name: 5, version: 0, extra: true })
        .expect(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body.code).toBe('VALIDATION_FAILED');
      expect(res.body.title).toBe('ข้อมูลไม่ถูกต้อง');
      expect(res.body.requestId).toBeTruthy();
      const fields = res.body.errors.map(
        (e: { field: string; code: string }) => `${e.field}:${e.code}`,
      );
      expect(fields).toEqual(
        expect.arrayContaining(['name:IS_STRING', 'version:MIN', 'extra:UNKNOWN_FIELD']),
      );
    } finally {
      await app.close();
    }
  });

  it('Accept-Language: en returns English messages', async () => {
    const app = await echoApp();
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-echo')
        .set('Accept-Language', 'en-US,en;q=0.9')
        .send({})
        .expect(400);
      expect(res.body.title).toBe('Invalid input');
    } finally {
      await app.close();
    }
  });

  it('malformed JSON → 400 VALIDATION_FAILED', async () => {
    const app = await echoApp();
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/test-echo')
        .set('Content-Type', 'application/json')
        .send('{"name":')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    } finally {
      await app.close();
    }
  });

  it('business rule problems carry code and rule', async () => {
    const app = await echoApp();
    try {
      const res = await request(app.getHttpServer()).post('/api/v1/test-echo/rule').expect(422);
      expect(res.body).toMatchObject({
        code: 'DOC_PDF_RENDITION_REQUIRED',
        rule: 'BR-DOC-030',
        status: 422,
      });
      expect(res.body.type).toBe('https://wems.local/errors/DOC_PDF_RENDITION_REQUIRED');
    } finally {
      await app.close();
    }
  });

  it('unexpected errors → 500 INTERNAL_ERROR without leaking the message', async () => {
    const app = await echoApp();
    try {
      const res = await request(app.getHttpServer()).post('/api/v1/test-echo/boom').expect(500);
      expect(res.body.code).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('secret');
    } finally {
      await app.close();
    }
  });
});
