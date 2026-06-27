jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
import { lookup } from 'node:dns/promises';
import { assertResolvedHostSafe, assertSafeWebhookUrlResolved } from './webhook-url';

const mockLookup = lookup as unknown as jest.Mock;

describe('webhook-url (guard SSRF por DNS)', () => {
  afterEach(() => jest.clearAllMocks());

  it('rechaza si el host resuelve a una IP privada', async () => {
    mockLookup.mockResolvedValue([{ address: '10.1.2.3', family: 4 }]);
    await expect(assertResolvedHostSafe('evil.example.com')).rejects.toThrow();
  });

  it('rechaza IPv4 mapeada en IPv6 privada (::ffff:192.168.x)', async () => {
    mockLookup.mockResolvedValue([{ address: '::ffff:192.168.0.10', family: 6 }]);
    await expect(assertResolvedHostSafe('evil.example.com')).rejects.toThrow();
  });

  it('acepta si todas las IPs resueltas son públicas', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertResolvedHostSafe('example.com')).resolves.toBeUndefined();
  });

  it('rechaza si el host no resuelve', async () => {
    mockLookup.mockRejectedValue(new Error('ENOTFOUND'));
    await expect(assertResolvedHostSafe('nope.invalid')).rejects.toThrow();
  });

  it('assertSafeWebhookUrlResolved combina esquema + resolución DNS', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    await expect(assertSafeWebhookUrlResolved('https://example.com/h')).resolves.toContain(
      'https://example.com',
    );
    mockLookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(assertSafeWebhookUrlResolved('https://example.com/h')).rejects.toThrow();
  });
});
