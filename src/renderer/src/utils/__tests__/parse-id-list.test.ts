import { parseIdList } from '../parse-id-list'

describe('parseIdList', () => {
  it('parses comma-separated IDs', () => {
    expect(parseIdList('1,2,3')).toEqual([1, 2, 3])
  })

  it('parses mixed separators and ranges', () => {
    expect(parseIdList('1, 2 3\n4-6')).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('sorts and deduplicates IDs', () => {
    expect(parseIdList('3,1,2,2,1,3,2-4')).toEqual([1, 2, 3, 4])
  })

  it('supports spaces around range dash', () => {
    expect(parseIdList('1, 5, 10 - 12')).toEqual([1, 5, 10, 11, 12])
  })

  it('returns empty array for blank input', () => {
    expect(parseIdList('   \n\t  ')).toEqual([])
  })

  it('throws for invalid token', () => {
    expect(() => parseIdList('1,abc,3')).toThrow('Invalid token "abc"')
  })

  it('throws for inverted range', () => {
    expect(() => parseIdList('20-10')).toThrow(
      'Invalid range "20-10": start must be less than or equal to end'
    )
  })

  it('throws for ID zero', () => {
    expect(() => parseIdList('0')).toThrow('Invalid ID "0": ID must be greater than 0')
  })

  it('throws for negative ID', () => {
    expect(() => parseIdList('-1')).toThrow('Invalid ID "-1": ID must be greater than 0')
  })
})

