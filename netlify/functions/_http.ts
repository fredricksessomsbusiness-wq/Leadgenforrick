import type { Handler } from '@netlify/functions';

export const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'content-type': 'application/json'
  },
  body: JSON.stringify(body)
});

export const withErrorHandling = (fn: Handler): Handler =>
  (async (event, context) => {
    try {
      return await fn(event, context);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return json(500, { error: message });
    }
  }) as Handler;
