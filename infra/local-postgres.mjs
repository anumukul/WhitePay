// Dedicated local development cluster only. Never touches an existing default Postgres service.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
const directory = '/private/tmp/whitepay-step05-pg';
function run(cmd, args, options = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (r.error || r.status !== 0)
    throw new Error(
      `${cmd} failed; check local PostgreSQL installation/port availability`,
    );
  return r.stdout;
}
const mode = process.argv[2] ?? 'start';
if (!['start', 'stop'].includes(mode)) throw new Error('Use start or stop');
if (mode === 'stop') {
  if (existsSync(directory + '/PG_VERSION'))
    run('pg_ctl', ['-D', directory, '-m', 'fast', 'stop']);
  console.log('Stopped dedicated local WhitePay Postgres');
  process.exit();
}
if (!existsSync(directory + '/PG_VERSION'))
  run('initdb', [
    '-D',
    directory,
    '-A',
    'trust',
    '--no-locale',
    '--encoding=UTF8',
    '-U',
    'whitepay_test',
  ]);
const status = spawnSync('pg_ctl', ['-D', directory, 'status'], {
  encoding: 'utf8',
});
if (status.status !== 0)
  run('pg_ctl', [
    '-D',
    directory,
    '-l',
    directory + '.log',
    '-o',
    '-h 127.0.0.1 -p 55432 -k /private/tmp',
    'start',
  ]);
const args = [
  '-h',
  '127.0.0.1',
  '-p',
  '55432',
  '-U',
  'whitepay_test',
  '-d',
  'postgres',
  '-tAc',
  "SELECT 1 FROM pg_database WHERE datname='whitepay_step05'",
];
if (run('psql', args).trim() !== '1')
  run('createdb', [
    '-h',
    '127.0.0.1',
    '-p',
    '55432',
    '-U',
    'whitepay_test',
    '-T',
    'template0',
    '-E',
    'UTF8',
    'whitepay_step05',
  ]);
console.log(
  'Dedicated development PostgreSQL ready on 127.0.0.1:55432 (local trust authentication, no public binding).\nDATABASE_URL=postgresql://whitepay_test@127.0.0.1:55432/whitepay_step05',
);
