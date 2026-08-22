import { describe, expect, it } from 'vitest';
import { buildTestZip, unpackSatPackageBuffer } from './zipUnpack';

describe('zipUnpack', () => {
  it('desempaqueta mock JSON bundle', async () => {
    const buf = Buffer.from(
      JSON.stringify({
        mockZip: true,
        xmls: [
          { fileName: 'a.xml', xmlText: '<cfdi:Comprobante/>', uuid: 'u1' },
        ],
      }),
      'utf8'
    );
    const pkgs = await unpackSatPackageBuffer(buf);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0].fileName).toBe('a.xml');
  });

  it('desempaqueta ZIP real con jszip', async () => {
    const zipBuf = await buildTestZip([
      {
        fileName: 'b.xml',
        xmlText: '<cfdi:Comprobante Version="4.0"/>',
        uuid: 'u2',
      },
    ]);
    const pkgs = await unpackSatPackageBuffer(zipBuf);
    expect(pkgs).toHaveLength(1);
    expect(pkgs[0].fileName).toBe('b.xml');
  });
});
