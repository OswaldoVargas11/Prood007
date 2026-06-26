import { assertSafeWebhookUrl, isPrivateWebhookHost } from './webhook-url';

describe('webhook-url (guard SSRF)', () => {
  it('acepta una URL https pública y la normaliza', () => {
    expect(assertSafeWebhookUrl('https://hooks.example.com/x')).toContain(
      'https://hooks.example.com',
    );
  });

  it('rechaza http (no https)', () => {
    expect(() => assertSafeWebhookUrl('http://example.com/x')).toThrow();
  });

  it('rechaza una URL malformada', () => {
    expect(() => assertSafeWebhookUrl('no-es-una-url')).toThrow();
  });

  it('rechaza localhost y rangos privados/reservados', () => {
    expect(() => assertSafeWebhookUrl('https://localhost/x')).toThrow();
    expect(() => assertSafeWebhookUrl('https://127.0.0.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('https://10.0.0.5/x')).toThrow();
    expect(() => assertSafeWebhookUrl('https://192.168.1.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('https://172.16.0.1/x')).toThrow();
    expect(() => assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toThrow();
  });

  it('isPrivateWebhookHost distingue internos de públicos', () => {
    expect(isPrivateWebhookHost('foo.local')).toBe(true);
    expect(isPrivateWebhookHost('service.internal')).toBe(true);
    expect(isPrivateWebhookHost('api.example.com')).toBe(false);
  });
});
