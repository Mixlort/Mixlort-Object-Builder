/**
 * Parse an ID list string into a sorted, deduplicated array.
 *
 * Accepted separators: comma, spaces, tabs, and new lines.
 * Accepted tokens:
 * - Single ID: "12"
 * - Range: "10-15"
 */

function parsePositiveId(rawValue: string, token: string): number {
  const value = Number(rawValue)
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid token "${token}"`)
  }
  if (value <= 0) {
    throw new Error(`Invalid ID "${rawValue}": ID must be greater than 0`)
  }
  return value
}

export function parseIdList(input: string): number[] {
  const normalized = input.replace(/\s*-\s*/g, '-').trim()
  if (normalized.length === 0) {
    return []
  }

  const tokens = normalized.split(/[\s,]+/).filter(Boolean)
  const values = new Set<number>()

  for (const token of tokens) {
    if (/^-?\d+$/.test(token)) {
      values.add(parsePositiveId(token, token))
      continue
    }

    const range = token.match(/^(-?\d+)-(-?\d+)$/)
    if (range) {
      const start = parsePositiveId(range[1], token)
      const end = parsePositiveId(range[2], token)
      if (start > end) {
        throw new Error(`Invalid range "${token}": start must be less than or equal to end`)
      }

      for (let id = start; id <= end; id++) {
        values.add(id)
      }
      continue
    }

    throw new Error(`Invalid token "${token}"`)
  }

  return Array.from(values).sort((a, b) => a - b)
}

