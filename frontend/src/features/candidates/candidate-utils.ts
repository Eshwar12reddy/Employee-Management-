import type { Project, Report } from './candidate-types'

export const todayInput = () => new Date().toISOString().slice(0, 10)
export const formatDate = (value: string) => { const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }
export const dateInputValue = (value: string) => { if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10) }
export const workingDays = (value: string) => { const raw = dateInputValue(value); if (!raw) return 0; const start = new Date(`${raw}T00:00:00`); const end = new Date(); end.setHours(0, 0, 0, 0); if (start > end) return 0; let count = 0; for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) if (day.getDay() !== 0 && day.getDay() !== 6) count++; return count }
export const photoLink = (value: unknown) => { const url = String(value || '').trim(); const match = url.match(/[?&]id=([^&]+)/) || url.match(/\/d\/([^/]+)/); return match ? `https://drive.google.com/thumbnail?id=${match[1]}&sz=w400` : url }
export const blankReport = (): Report => ({ name: '', designation: 'AI Intern', phone: '', email: '', bloodGroup: '', joining: '', experience: '', team: '', photo: '', projects: [{ name: '', status: 'Active' }], rating: 1, technicalRating: 1, capabilities: [''], skills: [''], worth: 0, worthPoints: [''], summary: '', recommendation: 'Continue in current project', remarks: '', reportDate: todayInput() })
export const uid = () => crypto.randomUUID?.() || Math.random().toString(36).slice(2)
export const skillLibrary: Record<string, string[]> = { 'AI Engineering': ['Python', 'Machine Learning', 'Deep Learning', 'LLMs', 'Prompt Engineering', 'RAG', 'LangChain', 'Vector Databases'], Frontend: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Tailwind CSS', 'Accessibility'], Backend: ['Node.js', 'Python', 'Java', 'C#', '.NET', 'REST APIs', 'GraphQL', 'Microservices'], 'Hosting & DevOps': ['AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'CI/CD', 'GitHub Actions', 'Linux'], Databases: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQL Server', 'DynamoDB', 'Database Design', 'SQL'], General: ['Git', 'Agile', 'Testing', 'Communication', 'Business Analysis', 'System Design'] }

export const shrinkPhoto = (src: string) => new Promise<string>(resolve => {
  if (!src.startsWith('data:image') || src.length < 150_000) return resolve(src)
  const image = new Image()
  image.onload = () => {
    const scale = Math.min(1, 480 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
    const context = canvas.getContext('2d'); if (!context) return resolve(src)
    context.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.82))
  }
  image.onerror = () => resolve(src); image.src = src
})
