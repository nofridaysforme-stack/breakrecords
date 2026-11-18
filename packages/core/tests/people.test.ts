import { describe, expect, it } from 'vitest';
import { parseLength, personMissing } from '../src/people';
import type { Person } from '../src/documents';

const base: Person = { id: 'x', name: 'X', type: 'person', legalName: null, pro: null, ipi: null, email: null, phone: null, address: null, citizenship: null, domicile: null };

describe('people', () => {
  it('lists every missing fact for a person, and fewer for a group', () => {
    expect(personMissing(base)).toEqual(['Legal name', 'PRO', 'IPI', 'Email', 'Phone', 'Address', 'Citizenship or home country']);
    expect(personMissing({ ...base, type: 'group' })).toEqual(['Email', 'Phone', 'Address']);
    expect(personMissing({ ...base, pro: 'none', domicile: 'US' })).not.toContain('IPI');
  });
  it('reads a length as minutes and seconds or plain seconds', () => {
    expect(parseLength('3:45')).toBe(225);
    expect(parseLength('225')).toBe(225);
    expect(parseLength('3:75')).toBeNull();
    expect(parseLength('')).toBeNull();
  });
});
