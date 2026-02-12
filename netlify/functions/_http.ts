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
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err && typeof (err as any).message === 'string'
            ? (err as any).message
            : 'Unknown error';
      const details =
        typeof err === 'object' && err !== null && 'details' in err && typeof (err as any).details === 'string'
          ? (err as any).details
          : undefined;
      const hint =
        typeof err === 'object' && err !== null && 'hint' in err && typeof (err as any).hint === 'string'
          ? (err as any).hint
          : undefined;
      const code =
        typeof err === 'object' && err !== null && 'code' in err && typeof (err as any).code === 'string'
          ? (err as any).code
          : undefined;

      console.error('Function error:', err);
      return json(500, { error: message, details, hint, code });
    }
  }) as Handler;
