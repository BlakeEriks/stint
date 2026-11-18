import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentDisposition } from '../src/disposition.ts';

test('contentDisposition', () => {
  const cases: [string, boolean, string][] = [
    [
      'INV-0004 Jane Doe.pdf',
      false,
      'inline; filename="INV-0004 Jane Doe.pdf"',
    ],
    [
      'INV-0004 Jane Doe.pdf',
      true,
      'attachment; filename="INV-0004 Jane Doe.pdf"',
    ],
    [
      'INV/0004 Doe "Design": A\\B  Co.pdf',
      true,
      'attachment; filename="INV0004 Doe Design AB Co.pdf"',
    ],
    [
      'INV-0004 José Núñez.pdf',
      true,
      `attachment; filename="INV-0004 Jose Nunez.pdf"; filename*=UTF-8''INV-0004%20Jos%C3%A9%20N%C3%BA%C3%B1ez.pdf`,
    ],
    [
      "INV-0004 山田 (O'Neil).pdf",
      true,
      `attachment; filename="INV-0004 (O'Neil).pdf"; filename*=UTF-8''INV-0004%20%E5%B1%B1%E7%94%B0%20%28O%27Neil%29.pdf`,
    ],
    [
      'INV-0004 Acme Inc..pdf',
      true,
      'attachment; filename="INV-0004 Acme Inc.pdf"',
    ],
    [
      'INV-0004 Jane\r\nDoe.pdf',
      true,
      'attachment; filename="INV-0004 Jane Doe.pdf"',
    ],
    [
      'INV-0004 Smith / Jones.pdf',
      true,
      'attachment; filename="INV-0004 Smith Jones.pdf"',
    ],
  ];
  for (const [filename, attachment, header] of cases)
    assert.equal(contentDisposition(filename, attachment), header);
});
