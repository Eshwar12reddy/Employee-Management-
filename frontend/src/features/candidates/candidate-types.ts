export type Project = { name: string; status: 'Active' | 'Completed' | 'On Hold' }
export type Report = {
  name: string; designation: string; phone: string; email: string; bloodGroup: string; joining: string; experience: string; team: string; photo: string
  projects: Project[]; rating: number; technicalRating: number; capabilities: string[]; skills: string[]; worth: number; worthPoints: string[]
  summary: string; recommendation: string; remarks: string; reportDate: string
}
export type Candidate = Report & { id: string; updatedAt: string }
export type View = 'list' | 'form' | 'dashboard'
