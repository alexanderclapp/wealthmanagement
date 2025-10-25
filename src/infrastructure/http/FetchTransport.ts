export const fetchTransport = async (input: {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
};
