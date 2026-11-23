import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { CalendarDays, Check, CirclePlus, FileDown, Flag, FolderKanban, Pencil, Printer, Save, Search, Settings2, ShieldCheck, Star, Target, Trash2, Upload, UserRound, BriefcaseBusiness, ArrowLeft, Eye, UserPlus, X, ArrowUpDown, LogOut } from 'lucide-react'
import './styles.css'
import type { Candidate, Project, Report, View } from './features/candidates/candidate-types'
import { api, ApiError, AppUser, cacheCandidateList, getCurrentUser, hasMigratedLocalCandidates, loginUser, logoutUser, markLocalCandidatesMigrated, readCandidateCache, UnauthorizedError, upsertInBatches } from './features/candidates/candidate-api'
import { exportCandidatesToExcel } from './features/candidates/candidate-export'
import { blankReport, dateInputValue, formatDate, photoLink, shrinkPhoto, skillLibrary, uid, workingDays } from './features/candidates/candidate-utils'
import { announceCandidatesChanged, subscribeToCandidateChanges } from './features/candidates/candidate-sync'

function App() {
  const [candidates, setCandidates] = useState<Candidate[]>(() => readCandidateCache().map(candidate => ({ ...candidate, designation: 'AI Intern' })))
  const [view, setView] = useState<View>('list')
  const [selectedId, setSelectedId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Report>(blankReport)
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'name' | 'rating'>('name')
  const selected = candidates.find(c => c.id === selectedId)
  const update = <K extends keyof Report>(key: K, value: Report[K]) => setDraft(d => ({ ...d, [key]: value }))
  const [dbStatus, setDbStatus] = useState<'checking' | 'connected' | 'offline'>('checking')
  const [user, setUser] = useState<AppUser | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authError, setAuthError] = useState('')
  const flash = (message: string, ms = 2600) => { setNotice(message); setTimeout(() => setNotice(''), ms) }
  const markFailure = (_error: unknown) => setDbStatus('offline')
  const load = async (localItems: Candidate[] = [], allowLocalMigration = false) => {
    try {
      let items: Candidate[] = await (await api()).json()
      setDbStatus('connected')
      if (!items.length && allowLocalMigration && localItems.length && !hasMigratedLocalCandidates()) {
        // First connection: move candidates that were only stored in this browser into the database.
        const pending = await Promise.all(localItems.filter(c => c?.id).map(async c => ({ ...c, photo: await shrinkPhoto(c.photo || '') })))
        if (!pending.length) return true
        items = await upsertInBatches(pending)
        markLocalCandidatesMigrated()
      }
      if (items.length) markLocalCandidatesMigrated()
      setCandidates(items); cacheCandidateList(items)
      return true
    } catch (error) {
      markFailure(error)
      if (error instanceof UnauthorizedError) { setUser(null); setAuthError('Your session expired. Please sign in again.'); return false }
      flash(error instanceof ApiError ? `Could not refresh server data: ${error.message}` : 'Could not refresh server data. Showing the offline cache.', 4500)
      return false
    }
  }
  useEffect(() => {
    let active = true
    void getCurrentUser().then(async current => {
      if (!active) return
      setUser(current); setAuthChecking(false)
      if (current) await load(readCandidateCache(), current.role === 'TEAM_LEAD')
    }).catch(error => { if (!active) return; setAuthError(error instanceof ApiError ? error.message : 'Unable to contact the authentication service.'); setAuthChecking(false) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!user) return
    const refresh = () => { void load([], false) }
    const unsubscribe = subscribeToCandidateChanges(refresh)
    const interval = window.setInterval(refresh, 15_000)
    return () => { unsubscribe(); window.clearInterval(interval) }
  }, [user?.id])
  const handleLogin = async (email: string, password: string) => {
    try {
      const nextUser = await loginUser(email, password)
      setAuthError(''); setUser(nextUser); setDbStatus('checking')
      await load(readCandidateCache(), nextUser.role === 'TEAM_LEAD')
    } catch (error) {
      setAuthError(error instanceof ApiError ? error.message : 'Email or password is incorrect')
      throw error
    }
  }
  const handleLogout = async () => { try { await logoutUser() } finally { setUser(null); setCandidates([]); setView('list'); setSelectedId('') } }
  // The API is authoritative when online. Only a failed non-authenticated request falls back to the offline cache.
  const persist = async (items: Candidate[], sync: () => Promise<unknown>, reason: 'saved' | 'deleted' | 'imported'): Promise<'db' | 'local' | null> => {
    try {
      const result = await sync()
      const serverItems = Array.isArray(result) ? result as Candidate[] : items
      setCandidates(serverItems)
      cacheCandidateList(serverItems)
      setDbStatus('connected')
      announceCandidatesChanged(reason)
      return 'db'
    } catch (error) {
      markFailure(error)
      if (error instanceof UnauthorizedError) { setUser(null); setAuthError('Your session expired. Please sign in again.'); return null }
      if (error instanceof ApiError) { flash(`The server rejected the change: ${error.message}`, 4500); return null }
      const cached = cacheCandidateList(items)
      if (cached) { setCandidates(items); flash('Saved locally only. The server could not be reached.', 4500); return 'local' }
      flash('Could not save: the API is unavailable and browser storage is full.', 4500)
      return null
    }
  }
  const openNew = () => { setEditingId(null); setDraft(blankReport()); setView('form') }
  const openEdit = (candidate: Candidate) => { const { id: _id, updatedAt: _updated, lastUpdatedBy: _lastUpdatedBy, ...report } = candidate; setEditingId(candidate.id); setDraft(report); setView('form') }
  const saveCandidate = async (asDraft = false) => {
    if (asDraft) { try { localStorage.setItem('clyptus-draft', JSON.stringify(draft)); setNotice('Draft saved locally') } catch { setNotice('Unable to save draft') } setTimeout(() => setNotice(''), 2600); return }
    const required: [keyof Report, string][] = [['name', 'candidate name'], ['designation', 'designation'], ['joining', 'date of joining'], ['experience', 'experience'], ['team', 'team / department'], ['reportDate', 'report date'], ['summary', 'overall summary']]
    const missing = required.find(([key]) => !String(draft[key]).trim())
    if (missing) { setNotice(`Please enter the ${missing[1]}.`); setTimeout(() => setNotice(''), 3000); return }
    const next: Candidate = { ...draft, photo: await shrinkPhoto(draft.photo), designation: 'AI Intern', id: editingId || uid(), updatedAt: new Date().toISOString() }
    const items = editingId ? candidates.map(c => c.id === editingId ? next : c) : [next, ...candidates]
    const saved = await persist(items, async () => { await api('', { method: 'POST', body: JSON.stringify(next) }); return next }, 'saved')
    if (!saved) return
    setSelectedId(next.id); setView('list'); if (saved === 'db') flash(editingId ? 'Candidate updated successfully' : 'Candidate saved successfully')
  }
  const removeCandidate = async (candidate: Candidate) => { if (confirm(`Delete ${candidate.name}'s evaluation?`)) { const saved = await persist(candidates.filter(c => c.id !== candidate.id), () => api(`/${encodeURIComponent(candidate.id)}`, { method: 'DELETE' }), 'deleted'); if (selectedId === candidate.id) setSelectedId(''); if (saved === 'db') flash('Candidate deleted') } }
  const openDashboard = (candidate: Candidate) => { setSelectedId(candidate.id); setView('dashboard') }
  const importCandidates = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: '' }).slice(1).filter(row => String(row[0] || '').trim())
      const existing = new Set(candidates.map(c => `${c.name.toLowerCase()}|${c.email.toLowerCase()}`))
      const imported: Candidate[] = []
      const updated = candidates.map(candidate => {
        const row = rows.find(item => `${String(item[0]).trim().toLowerCase()}|${String(item[2]).trim().toLowerCase()}` === `${candidate.name.toLowerCase()}|${candidate.email.toLowerCase()}`)
        const photo = row ? photoLink(row[4]) : ''
        return row && photo && !candidate.photo ? { ...candidate, photo, phone: candidate.phone || String(row[1] || '').trim(), bloodGroup: candidate.bloodGroup || String(row[3] || '').trim() } : candidate
      })
      rows.forEach(row => { const key = `${String(row[0]).trim().toLowerCase()}|${String(row[2]).trim().toLowerCase()}`; if (!existing.has(key)) { existing.add(key); imported.push({ ...blankReport(), name: String(row[0]).trim(), designation: 'AI Intern', phone: String(row[1] || '').trim(), email: String(row[2] || '').trim(), bloodGroup: String(row[3] || '').trim(), photo: photoLink(row[4]), rating: 0, technicalRating: 0, id: uid(), updatedAt: new Date().toISOString() }) } })
      if (!imported.length && updated.every((candidate, index) => candidate.photo === candidates[index].photo)) { setNotice('No new candidates or photos found in the workbook.'); setTimeout(() => setNotice(''), 2600); return }
      const changed = [...imported, ...updated.filter((candidate, index) => candidate !== candidates[index])]
      const saved = await persist([...imported, ...updated], () => upsertInBatches(changed), 'imported')
      if (saved === 'db') flash(`${imported.length ? `${imported.length} candidate${imported.length === 1 ? '' : 's'} imported` : 'Candidate photos updated'} successfully`, 3000)
    } catch { setNotice('Could not read this workbook. Please choose a valid .xlsx file.'); setTimeout(() => setNotice(''), 3000) }
  }
  if (authChecking) return <div className="access-gate"><div className="access-card"><ShieldCheck size={30}/><h2>Checking your session</h2><p>Connecting securely to the Employee Management workspace…</p></div></div>
  if (!user) return <LoginScreen error={authError} onLogin={handleLogin}/>
  const canManage = user.role === 'TEAM_LEAD'
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">C</span><span>Clyptus<span className="brand-dot">.ai</span></span></div><div className="workspace-name">{user.name} · {user.role === 'CEO' ? 'CEO' : 'Team Lead'} <span className={`workspace-pill ${dbStatus}`}>{dbStatus === 'connected' ? 'Database connected' : dbStatus === 'offline' ? 'Offline cache' : 'Connecting…'}</span></div><div className="toolbar">{view !== 'list' && <button className="button ghost" onClick={() => setView('list')}><ArrowLeft size={16}/> Candidate list</button>}{view === 'dashboard' && selected && canManage && <button className="button secondary" onClick={() => openEdit(selected)}><Pencil size={16}/> Edit candidate</button>}{view === 'dashboard' && selected && <button className="button primary" onClick={() => window.print()}><FileDown size={16}/> Download PDF</button>}<button className="button ghost" onClick={handleLogout}><LogOut size={16}/> Sign out</button></div></header>
    {view === 'list' && <CandidateList candidates={candidates} query={query} setQuery={setQuery} sort={sort} setSort={setSort} canManage={canManage} onAdd={openNew} onImport={importCandidates} onExport={() => { if (!candidates.length) { flash('There are no candidates to export.', 2600); return }; exportCandidatesToExcel(candidates); flash('Candidates exported to Excel', 2600) }} onOpen={openDashboard} onEdit={openEdit} onDelete={removeCandidate}/>}
    {view === 'form' && <CandidateForm report={draft} update={update} editing={!!editingId} onSave={() => saveCandidate(false)} onDraft={() => saveCandidate(true)} onCancel={() => setView('list')} onError={message => flash(message, 3000)}/>}
    {view === 'dashboard' && selected && <Dashboard report={selected} onBack={() => setView('list')} onEdit={() => openEdit(selected)} canEdit={canManage}/>}
    {notice && <div className="toast"><Check size={16}/> {notice}</div>}
  </div>
}

export default App

function CandidateList({ candidates, query, setQuery, sort, setSort, canManage, onAdd, onImport, onExport, onOpen, onEdit, onDelete }: { candidates: Candidate[]; query: string; setQuery: (v: string) => void; sort: 'name' | 'rating'; setSort: (v: 'name' | 'rating') => void; canManage: boolean; onAdd: () => void; onImport: (file: File) => void; onExport: () => void; onOpen: (c: Candidate) => void; onEdit: (c: Candidate) => void; onDelete: (c: Candidate) => void }) {
  const rows = useMemo(() => candidates.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : b.rating - a.rating), [candidates, query, sort])
  const importRef = useRef<HTMLInputElement>(null)
  return <main className="list-page"><div className="list-hero"><div><p className="eyebrow">{canManage ? 'TEAM LEAD VIEW' : 'CEO VIEW'}</p><h1>Candidate evaluations</h1><p>{canManage ? 'Manage employee reports and open an individual evaluation dashboard.' : 'Review all saved employee reports and open an individual evaluation dashboard.'}</p></div><div className="list-hero-actions"><button className="button secondary" onClick={onExport}><FileDown size={17}/> Export Excel</button>{canManage && <><button className="button secondary" onClick={() => importRef.current?.click()}><Upload size={17}/> Import Excel</button><input ref={importRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={e => { const file = e.target.files?.[0]; if (file) onImport(file); e.currentTarget.value = '' }}/><button className="button primary add-candidate" onClick={onAdd}><UserPlus size={17}/> Add candidate</button></>}</div></div><div className="list-toolbar"><div className="search-box"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search candidates by name" /></div><button className="sort-button" onClick={() => setSort(sort === 'name' ? 'rating' : 'name')}><ArrowUpDown size={15}/> Sort by {sort === 'name' ? 'name' : 'rating'}</button><span className="candidate-total">{candidates.length} candidate{candidates.length === 1 ? '' : 's'}</span></div>{rows.length === 0 ? <div className="empty-state"><UserRound size={28}/><h2>{candidates.length ? 'No candidates found' : 'No candidates yet'}</h2><p>{candidates.length ? 'Try a different search.' : 'Import the workbook or add your first candidate to generate an evaluation dashboard.'}</p>{!candidates.length && canManage && <div className="empty-actions"><button className="button secondary" onClick={() => importRef.current?.click()}><Upload size={16}/> Import Excel</button><button className="button primary" onClick={onAdd}><CirclePlus size={16}/> Add candidate</button></div>}</div> : <div className="candidate-table-wrap"><table className="candidate-table"><thead><tr><th>Candidate</th><th>Designation</th><th>Experience</th><th>Working days</th><th>Team</th><th>Team lead rating</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>{rows.map(c => <tr key={c.id}><td><button className="candidate-name" onClick={() => onOpen(c)}>{c.photo ? <img src={c.photo}/> : <span className="table-avatar">{c.name.slice(0, 1).toUpperCase()}</span>}<strong>{c.name}</strong></button></td><td>AI Intern</td><td>{c.experience || '—'}</td><td>{workingDays(c.joining) || '—'}</td><td>{c.team || '—'}</td><td><span className="table-rating"><Star size={15} fill="currentColor"/> {c.rating ? `${c.rating.toFixed(1)} / 10` : 'Not rated'}</span></td><td><span title={c.lastUpdatedBy?.email || undefined}>{c.lastUpdatedBy?.name || 'Legacy record'}<br/><small>{formatDate(c.updatedAt)}</small></span></td><td><div className="row-actions"><button onClick={() => onOpen(c)} title="View report"><Eye size={15}/> View</button>{canManage && <><button onClick={() => onEdit(c)} title="Edit candidate"><Pencil size={14}/></button><button className="delete-action" onClick={() => onDelete(c)} title="Delete candidate"><Trash2 size={14}/></button></>}</div></td></tr>)}</tbody></table></div>}</main>
}

function CandidateForm({ report, update, editing, onSave, onDraft, onCancel, onError }: { report: Report; update: <K extends keyof Report>(key: K, value: Report[K]) => void; editing: boolean; onSave: () => void; onDraft: () => void; onCancel: () => void; onError: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const upload = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = async () => update('photo', await shrinkPhoto(String(reader.result))); reader.onerror = () => onError('Could not read this photo. Please try a different image file.'); reader.readAsDataURL(file) } }
  const changeList = (key: 'capabilities' | 'skills' | 'worthPoints', i: number, value: string) => update(key, report[key].map((x, j) => j === i ? value : x))
  return <main className="form-page"><div className="form-top"><div><p className="eyebrow">{editing ? 'EDIT CANDIDATE' : 'NEW CANDIDATE'}</p><h1>{editing ? 'Edit candidate evaluation' : 'Add candidate evaluation'}</h1><p>Enter the Team Lead’s complete assessment. The dashboard is generated from these details.</p></div><button className="button ghost light-ghost" onClick={onCancel}><X size={16}/> Cancel</button></div><div className="evaluation-form">
    <FormSection title="Candidate information" icon={<UserRound/>}><div className="candidate-info-grid"><div className="photo-upload" onClick={() => fileRef.current?.click()}>{report.photo ? <img src={report.photo}/> : <><Upload size={22}/><span>Upload photo</span></>}<input ref={fileRef} hidden type="file" accept="image/*" onChange={upload}/></div><div className="field-grid"><Field label="Full name" value={report.name} onChange={v => update('name', v)} required/><Field label="Designation" value="AI Intern" onChange={() => {}} readOnly required/><Field label="Phone number" type="tel" value={report.phone} onChange={v => update('phone', v)}/><Field label="Email ID" type="email" value={report.email} onChange={v => update('email', v)}/><Field label="Blood group" value={report.bloodGroup} onChange={v => update('bloodGroup', v)} placeholder="e.g. O+"/><Field label="Date of joining" type="date" value={dateInputValue(report.joining)} onChange={v => update('joining', v)} required/><Field label="Total experience" value={report.experience} onChange={v => update('experience', v)} required/><Field label="Working days (calculated)" value={String(workingDays(report.joining) || 0)} onChange={() => {}} readOnly/><Field label="Team / department" value={report.team} onChange={v => update('team', v)} required/><Field label="Report date" type="date" value={dateInputValue(report.reportDate)} onChange={v => update('reportDate', v)} required/></div></div></FormSection>
    <div className="form-two-col"><FormSection title="Projects" icon={<FolderKanban/>}><div className="form-list">{report.projects.map((p, i) => <div className="form-project" key={i}><input value={p.name} onChange={e => update('projects', report.projects.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Project name"/><select value={p.status} onChange={e => update('projects', report.projects.map((x, j) => j === i ? { ...x, status: e.target.value as Project['status'] } : x))}><option>Active</option><option>Completed</option><option>On Hold</option></select><button onClick={() => update('projects', report.projects.filter((_, j) => j !== i))}><Trash2 size={15}/></button></div>)}</div><AddButton onClick={() => update('projects', [...report.projects, { name: '', status: 'Active' }])}>Add project</AddButton></FormSection><FormSection title="Performance ratings" icon={<ShieldCheck/>}><RatingInput label="Team Lead Rating" value={report.rating} onChange={v => update('rating', v)}/><RatingInput label="Technical Rating" value={report.technicalRating} onChange={v => update('technicalRating', v)}/></FormSection></div>
    <div className="form-two-col"><FormSection title="Capabilities" icon={<Settings2/>}><FormEditableList items={report.capabilities} onChange={(i, v) => changeList('capabilities', i, v)} onRemove={i => update('capabilities', report.capabilities.filter((_, j) => j !== i))}/><AddButton onClick={() => update('capabilities', [...report.capabilities, ''])}>Add capability</AddButton></FormSection><FormSection title="Skills" icon={<FolderKanban/>}><div className="form-skill-list">{report.skills.map((s, i) => <span className="form-skill" key={i}><input value={s} onChange={e => changeList('skills', i, e.target.value)} placeholder="Skill"/><button onClick={() => update('skills', report.skills.filter((_, j) => j !== i))}><X size={13}/></button></span>)}</div><AddButton onClick={() => update('skills', [...report.skills, ''])}>Add custom skill</AddButton><div className="skill-library"><div className="skill-library-label">Quick add predefined skills</div>{Object.entries(skillLibrary).map(([group, skills]) => <div className="skill-group" key={group}><span>{group}</span><div>{skills.map(skill => <button className={report.skills.includes(skill) ? 'selected' : ''} key={skill} onClick={() => update('skills', report.skills.includes(skill) ? report.skills : [...report.skills.filter(Boolean), skill])}>{report.skills.includes(skill) && <Check size={12}/>} {skill}</button>)}</div></div>)}</div></FormSection></div>
    <FormSection title="Worth for projects" icon={<Target/>}><div className="worth-form-grid"><Field label="Project value percentage" type="number" value={String(report.worth)} onChange={v => update('worth', Math.max(0, Math.min(100, Number(v))))} suffix="%"/><div className="worth-category"><span>Value category</span><strong>{report.worth >= 75 ? 'High Value' : report.worth >= 45 ? 'Medium Value' : 'Needs Focus'}</strong></div></div><FormEditableList items={report.worthPoints} onChange={(i, v) => changeList('worthPoints', i, v)} onRemove={i => update('worthPoints', report.worthPoints.filter((_, j) => j !== i))}/><AddButton onClick={() => update('worthPoints', [...report.worthPoints, ''])}>Add contribution point</AddButton></FormSection>
    <FormSection title="Overall summary & recommendation" icon={<Star/>}><label className="textarea-label">Overall performance summary <textarea value={report.summary} onChange={e => update('summary', e.target.value)} placeholder="Write the overall performance summary..." /></label><div className="field-grid"><label className="field"><span>Recommendation</span><select value={report.recommendation} onChange={e => update('recommendation', e.target.value)}><option>Continue in current project</option><option>Assign to new projects</option><option>Continue / Assign to key projects</option><option>Needs improvement</option><option>Recommend for promotion consideration</option><option>Recommend additional training</option></select></label><Field label="Optional remarks" value={report.remarks} onChange={v => update('remarks', v)} /></div></FormSection>
  </div><div className="form-actions"><button className="button ghost light-ghost" onClick={onCancel}>Cancel</button><button className="button secondary" onClick={onDraft}><Save size={16}/> Save draft</button><button className="button primary" onClick={onSave}><Check size={16}/> {editing ? 'Save changes' : 'Save candidate'}</button></div></main>
}

function LoginScreen({ error, onLogin }: { error: string; onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (!email.trim() || !password) return; setBusy(true); try { await onLogin(email, password) } catch { /* parent displays the safe error */ } finally { setBusy(false) } }
  return <div className="access-gate" role="dialog" aria-modal="true" aria-labelledby="login-title"><form className="access-card" onSubmit={submit}><ShieldCheck size={30}/><h2 id="login-title">Sign in to Employee Management</h2><p>Use your individual account. Your role controls which records and actions are available.</p><input type="email" autoFocus autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address"/><input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" aria-invalid={!!error}/>{error && <span className="access-error">{error}</span>}<button className="button primary" disabled={busy || !email.trim() || !password}>{busy ? 'Signing in…' : 'Sign in'}</button></form></div>
}
function FormSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <section className="form-section"><div className="form-section-title"><span>{icon}</span><h2>{title}</h2></div>{children}</section> }
function Field({ label, value, onChange, required, type = 'text', suffix, placeholder, readOnly }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; suffix?: string; placeholder?: string; readOnly?: boolean }) { return <label className="field"><span>{label}{required && <em>*</em>}</span><div className="input-suffix"><input type={type} value={value} placeholder={placeholder} readOnly={readOnly} onChange={e => onChange(e.target.value)} />{suffix && <b>{suffix}</b>}</div></label> }
function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) { return <button className="add-form-line" onClick={onClick}><CirclePlus size={15}/> {children}</button> }
function FormEditableList({ items, onChange, onRemove }: { items: string[]; onChange: (i: number, v: string) => void; onRemove: (i: number) => void }) { return <div className="form-editable-list">{items.map((item, i) => <div key={i}><Check size={15}/><input value={item} onChange={e => onChange(i, e.target.value)} placeholder="Enter a point"/><button onClick={() => onRemove(i)}><Trash2 size={14}/></button></div>)}</div> }
function RatingInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) { return <div className="rating-input-block"><div className="rating-input-label"><span>{label}</span><div><input type="number" min="0" max="10" step="0.5" value={value} onChange={e => onChange(Math.max(0, Math.min(10, Number(e.target.value))))}/><b>/ 10</b></div></div><div className="form-stars ten-stars">{[1,2,3,4,5,6,7,8,9,10].map(n => <button key={n} onClick={() => onChange(n)} className={n <= Math.floor(value) ? 'filled' : ''}><Star size={17} fill="currentColor"/></button>)}</div></div> }

function Dashboard({ report, onBack, onEdit, canEdit }: { report: Candidate; onBack: () => void; onEdit: () => void; canEdit: boolean }) { return <main className="dashboard-page"><div className="dashboard-actions no-print"><button className="button ghost dark-ghost" onClick={onBack}><ArrowLeft size={16}/> Back to candidate list</button><div>{canEdit && <button className="button secondary" onClick={onEdit}><Pencil size={16}/> Edit candidate</button>}<button className="button primary" onClick={() => window.print()}><Printer size={16}/> Print / Download PDF</button></div></div><ReportPreview report={report}/></main> }
function ReportPreview({ report }: { report: Candidate }) { return <div className="report-page" id="report"><div className="report-header"><div className="report-brand"><span className="brand-mark large">C</span><span>Clyptus<span className="brand-dot">.ai</span></span></div><div className="divider"></div><div className="report-title"><h1>Employee Evaluation Report</h1><p>Individual Performance Summary for CEO</p></div><div className="date-chip"><CalendarDays size={19}/><span>Report Date: <strong>{formatDate(report.reportDate)}</strong></span></div></div><div className="report-grid"><aside className="profile-card"><div className="photo-wrap">{report.photo ? <img src={report.photo}/> : <div className="avatar-placeholder"><UserRound size={56}/><span>No photo</span></div>}</div><div className="profile-name display-value">{report.name}</div><div className="profile-role display-value">AI Intern</div><div className="profile-divider"></div><Info icon={<CalendarDays/>} label="Date of Joining" value={formatDate(report.joining)}/><Info icon={<BriefcaseBusiness/>} label="Experience" value={report.experience}/><Info icon={<CalendarDays/>} label="Working Days" value={String(workingDays(report.joining) || 0)}/><Info icon={<Flag/>} label="Team" value={report.team}/></aside><div className="main-panels"><div className="row two"><ProjectsPreview projects={report.projects}/><RatingPreview rating={report.rating} technicalRating={report.technicalRating}/></div><div className="row lower"><ListPreview icon={<Settings2/>} title="Capabilities" items={report.capabilities}/><SkillsPreview skills={report.skills}/></div><div className="row bottom"><WorthPreview report={report}/><SummaryPreview report={report}/></div></div></div><footer className="report-footer">Clyptus.ai · Confidential employee performance summary <span>Generated for internal management review</span></footer></div> }
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="info-row"><span className="info-icon">{icon}</span><div><label>{label}</label><strong>{value || '—'}</strong></div></div> }
function Card({ icon, title, subtitle, children, className = '' }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode; className?: string }) { return <section className={`card ${className}`}><div className="card-heading"><span className="heading-icon">{icon}</span><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section> }
function ProjectsPreview({ projects }: { projects: Project[] }) { return <Card icon={<FolderKanban/>} title="Projects" subtitle="Currently working on" className="projects-card"><span className="header-count">{projects.length} {projects.length === 1 ? 'Project' : 'Projects'}</span><div className="project-list">{projects.filter(p => p.name.trim()).map((p, i) => <div className="project-row" key={i}><span className={`status-dot ${p.status.toLowerCase().replace(' ', '-')}`}></span><strong>{p.name}</strong><span className="project-status">{p.status}</span></div>)}</div></Card> }
function RatingPreview({ rating, technicalRating }: { rating: number; technicalRating: number }) { return <Card icon={<ShieldCheck/>} title="Performance Ratings" subtitle="Team Lead and technical assessment" className="rating-card"><div className="dashboard-rating-grid"><div><span>Team Lead</span><strong>{rating ? rating.toFixed(1) : '—'} <small>/ 10</small></strong><div className="dashboard-stars">{[1,2,3,4,5,6,7,8,9,10].map(n => <Star key={n} size={13} fill="currentColor" className={n <= Math.floor(rating) ? 'filled' : ''}/>)}</div></div><div><span>Technical</span><strong>{technicalRating ? technicalRating.toFixed(1) : '—'} <small>/ 10</small></strong><div className="dashboard-stars">{[1,2,3,4,5,6,7,8,9,10].map(n => <Star key={n} size={13} fill="currentColor" className={n <= Math.floor(technicalRating) ? 'filled' : ''}/>)}</div></div></div></Card> }
function ListPreview({ icon, title, items }: { icon: React.ReactNode; title: string; items: string[] }) { return <Card icon={icon} title={title}><div className="editable-list">{items.filter(x => x.trim()).map((item, i) => <div className="edit-list-row" key={i}><Check size={15}/><strong>{item}</strong></div>)}</div></Card> }
function SkillsPreview({ skills }: { skills: string[] }) { return <Card icon={<FolderKanban/>} title="Skills"><div className="skill-list">{skills.filter(x => x.trim()).map((skill, i) => <span className="skill" key={i}>{skill}</span>)}</div></Card> }
function WorthPreview({ report }: { report: Report }) { const pct = Math.max(0, Math.min(100, report.worth)); return <Card icon={<Target/>} title="Worth for Projects" subtitle="Assessment of project value and contribution" className="worth-card"><div className="worth-content"><div className="gauge-wrap"><div className="gauge" style={{ '--value': `${pct * 1.8}deg` } as React.CSSProperties}><div className="gauge-inner"><strong>{pct}%</strong></div></div><div className="value-label">{pct >= 75 ? 'High Value' : pct >= 45 ? 'Medium Value' : 'Needs Focus'}</div></div><div className="worth-points"><div className="editable-list">{report.worthPoints.filter(x => x.trim()).map((point, i) => <div className="edit-list-row" key={i}><Check size={15}/><strong>{point}</strong></div>)}</div></div></div></Card> }
function SummaryPreview({ report }: { report: Candidate }) { return <section className="summary-card"><div className="summary-head"><Star size={27}/><h2>Overall Summary & Recommendation</h2></div><p className="summary-text">{report.summary || '—'}</p>{report.remarks && <p className="remarks-text"><strong>Remarks:</strong> {report.remarks}</p>}<div className="recommendation"><Check size={18}/><strong>Recommendation:</strong><span>{report.recommendation}</span></div></section> }
