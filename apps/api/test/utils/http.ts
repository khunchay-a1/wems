import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DEFAULT_PASSWORD } from '../factories/users';

/** Mobile-style client: bearer token in memory. */
export async function bearerLogin(
  app: INestApplication,
  email: string,
  password = DEFAULT_PASSWORD,
) {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password, platform: 'ANDROID', deviceName: 'test' })
    .expect(200);
  const accessToken = res.body.accessToken as string;
  const refreshToken = res.body.refreshToken as string;
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${accessToken}`);
  return {
    accessToken,
    refreshToken,
    body: res.body,
    get: (url: string) => auth(request(app.getHttpServer()).get(url)),
    post: (url: string) => auth(request(app.getHttpServer()).post(url)),
    patch: (url: string) => auth(request(app.getHttpServer()).patch(url)),
    put: (url: string) => auth(request(app.getHttpServer()).put(url)),
    delete: (url: string) => auth(request(app.getHttpServer()).delete(url)),
  };
}

export type BearerClient = Awaited<ReturnType<typeof bearerLogin>>;

/** Web-style client: cookie jar + CSRF header (supertest agent). */
export async function cookieLogin(
  app: INestApplication,
  email: string,
  password = DEFAULT_PASSWORD,
) {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post('/api/v1/auth/login')
    .send({ email, password, platform: 'WEB' })
    .expect(200);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const csrf = /wems_csrf=([^;]+)/.exec(cookies.join(';'))?.[1] ?? '';
  return { agent, csrf, cookies, body: res.body };
}
