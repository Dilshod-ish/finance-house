/** The one place a connection string is read from the environment. */
export function databaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set. Copy .env.example and start `make up`.');
  }
  return url;
}
