import * as XLSX from 'xlsx'
import type { Candidate } from './candidate-types'
import { workingDays } from './candidate-utils'

const exportRow = (candidate: Candidate) => ({
  ID: candidate.id,
  'Full Name': candidate.name,
  Designation: candidate.designation,
  Phone: candidate.phone,
  Email: candidate.email,
  'Blood Group': candidate.bloodGroup,
  'Date of Joining': candidate.joining,
  Experience: candidate.experience,
  'Working Days': workingDays(candidate.joining),
  Team: candidate.team,
  Projects: candidate.projects.map(project => `${project.name} (${project.status})`).filter(Boolean).join('; '),
  'Team Lead Rating': candidate.rating,
  'Technical Rating': candidate.technicalRating,
  Capabilities: candidate.capabilities.filter(Boolean).join('; '),
  Skills: candidate.skills.filter(Boolean).join('; '),
  'Worth for Projects (%)': candidate.worth,
  'Contribution Points': candidate.worthPoints.filter(Boolean).join('; '),
  Summary: candidate.summary,
  Recommendation: candidate.recommendation,
  Remarks: candidate.remarks,
  'Report Date': candidate.reportDate,
  Photo: candidate.photo,
  'Updated At': candidate.updatedAt,
})

export function exportCandidatesToExcel(candidates: Candidate[]): void {
  const worksheet = XLSX.utils.json_to_sheet(candidates.map(exportRow))
  worksheet['!cols'] = [
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 20 },
    { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 36 }, { wch: 36 }, { wch: 20 }, { wch: 40 }, { wch: 50 }, { wch: 30 }, { wch: 40 }, { wch: 16 }, { wch: 40 }, { wch: 24 },
  ]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Candidates')
  const date = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `clyptus-candidates-${date}.xlsx`)
}
