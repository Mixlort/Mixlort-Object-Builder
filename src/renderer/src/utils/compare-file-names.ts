function getComparableBaseName(fileName: string): string {
  const lastSegment = fileName.split(/[/\\]/).pop() ?? fileName
  return lastSegment.replace(/\.[^.]+$/, '')
}

export function compareFileNamesNaturally(a: string, b: string): number {
  const baseCompare = getComparableBaseName(a).localeCompare(getComparableBaseName(b), undefined, {
    numeric: true,
    sensitivity: 'base'
  })

  if (baseCompare !== 0) {
    return baseCompare
  }

  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}
