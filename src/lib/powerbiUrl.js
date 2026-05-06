export function buildPublicPowerBiUrl(rawUrl) {
  if (!rawUrl) return ''
  return String(rawUrl).trim().replace(/&amp;/g, '&')
}

export function extractPowerBiReportIdentifiers(rawUrl) {
  if (!rawUrl) return { reportId: null, groupId: null }

  try {
    const url = new URL(rawUrl)
    const reportId = url.searchParams.get('reportId')
    const groupId = url.searchParams.get('groupId')

    return {
      reportId: reportId || null,
      groupId: groupId || null,
    }
  } catch {
    return { reportId: null, groupId: null }
  }
}
