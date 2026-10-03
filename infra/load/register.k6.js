// P1-15 load test (docs/09-nfr.md §2): document register of 5,000 rows — p95 < 500 ms for
// paging, filtering and search. Data: infra/load/seed-register.sql.
//
//   k6 run -e BASE_URL=http://localhost:4000 -e EMAILS=a@x,b@x,... -e PASSWORD=... \
//          -e PROJECT_CODE=P26-001 infra/load/register.k6.js
//
// Never point at production. EMAILS are members of the project (the UAT users from
// `pnpm --filter api seed:demo` work); the API limits each user to 300 requests/min
// (04-api-conventions §11), so the VUs are spread over the users. Each iteration runs one of the
// register queries the web makes.
/* global __ENV, __VU */
import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const BASE = `${__ENV.BASE_URL || 'http://localhost:4000'}/api/v1`;

export const options = {
  scenarios: {
    register: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '20s', target: 15 },
        { duration: '60s', target: 30 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{kind:register}': ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

function login(email) {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email, password: __ENV.PASSWORD, platform: 'ANDROID' }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status !== 200 || !res.json('accessToken'))
    fail(`login failed for ${email}: ${res.status}`);
  return res.json('accessToken');
}

export function setup() {
  const tokens = (__ENV.EMAILS || __ENV.EMAIL || '').split(',').filter(Boolean).map(login);
  if (!tokens.length) fail('set EMAILS');
  const auth = { headers: { Authorization: `Bearer ${tokens[0]}` } };
  const projects = http.get(`${BASE}/projects?q=${__ENV.PROJECT_CODE || 'P26-001'}`, auth);
  const project = projects.json('data.0');
  if (!project) fail('project not found');
  const disciplines = http.get(`${BASE}/disciplines`, auth).json();
  return { tokens, projectId: project.id, disciplineId: disciplines[0].id };
}

const queries = [
  () => 'page=1&pageSize=50',
  () => `page=${1 + Math.floor(Math.random() * 100)}&pageSize=50`,
  () => 'page=1&pageSize=50&sort=-updatedAt',
  (d) => `page=1&pageSize=50&disciplineId=${d.disciplineId}`,
  () => 'page=1&pageSize=50&revisionStatus=IN_REVIEW',
  () => `page=1&pageSize=50&q=${encodeURIComponent('ท่อน้ำดิบ')}`,
  () => `page=1&pageSize=50&q=LOAD-0${Math.floor(Math.random() * 500)}`,
];

export default function (data) {
  const q = queries[Math.floor(Math.random() * queries.length)](data);
  const res = http.get(`${BASE}/projects/${data.projectId}/documents?${q}`, {
    headers: { Authorization: `Bearer ${data.tokens[__VU % data.tokens.length]}` },
    tags: { kind: 'register' },
  });
  check(res, { 200: (r) => r.status === 200 });
  sleep(0.5 + Math.random());
}
