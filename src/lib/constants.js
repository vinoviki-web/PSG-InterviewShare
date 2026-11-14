import {
  MonitorCheck, Calculator, Code2, Cpu, Network, Users, Briefcase, HeartHandshake, CircleDot,
} from 'lucide-react'

export const APP_NAME = 'Roundwise'
export const PSG_DOMAIN = 'psgtech.ac.in'

/* Mirrors the Postgres enums planned for Phase 3. Keep in sync. */
export const OPPORTUNITY_TYPES = [
  { value: 'internship', label: 'Internship', short: 'Internship' },
  { value: 'full_time', label: 'Full-time', short: 'Full-time' },
  { value: 'intern_ppo', label: 'Internship + PPO', short: 'Intern + PPO' },
  { value: 'intern_fte', label: 'Internship + Full-time', short: 'Intern + FT' },
]

export const HIRING_MODES = [
  { value: 'on_campus', label: 'On-campus' },
  { value: 'off_campus', label: 'Off-campus' },
  { value: 'referral', label: 'Referral' },
  { value: 'other', label: 'Other' },
]

export const OUTCOMES = [
  { value: 'selected', label: 'Selected', tone: 'success' },
  { value: 'not_selected', label: 'Not selected', tone: 'neutral' },
  { value: 'awaiting', label: 'Awaiting result', tone: 'warning' },
  { value: 'withdrew', label: 'Withdrew', tone: 'neutral' },
  { value: 'undisclosed', label: 'Prefer not to say', tone: 'neutral' },
]

export const DIFFICULTY_LABELS = ['', 'Easy', 'Fair', 'Moderate', 'Hard', 'Very hard']

export const ROUND_TYPES = [
  { value: 'online_assessment', label: 'Online assessment', short: 'OA', icon: MonitorCheck },
  { value: 'aptitude', label: 'Aptitude', short: 'APT', icon: Calculator },
  { value: 'coding', label: 'Coding', short: 'CODE', icon: Code2 },
  { value: 'technical', label: 'Technical', short: 'TECH', icon: Cpu },
  { value: 'system_design', label: 'System design', short: 'SD', icon: Network },
  { value: 'group_discussion', label: 'Group discussion', short: 'GD', icon: Users },
  { value: 'managerial', label: 'Managerial', short: 'MGR', icon: Briefcase },
  { value: 'hr', label: 'HR', short: 'HR', icon: HeartHandshake },
  { value: 'other', label: 'Other', short: 'OTHER', icon: CircleDot },
]

export const QUESTION_KINDS = [
  { value: 'coding', label: 'Coding' },
  { value: 'technical', label: 'Technical' },
  { value: 'hr', label: 'HR' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'aptitude', label: 'Aptitude' },
  { value: 'puzzle', label: 'Puzzle' },
]

export const RESOURCE_KINDS = [
  { value: 'course', label: 'Course' },
  { value: 'book', label: 'Book' },
  { value: 'practice', label: 'Practice site' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other' },
]

export const TARGET_ROLES = [
  'SDE', 'Data / ML', 'Core engineering', 'Product', 'Consulting', 'Finance / Quant', 'Design', 'Other',
]

export const SORTS = [
  { value: 'latest', label: 'Latest' },
  { value: 'helpful', label: 'Most helpful' },
  { value: 'read', label: 'Most read' },
]

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam or advertising' },
  { value: 'misleading', label: 'Misleading or fabricated' },
  { value: 'confidential', label: 'Shares confidential test content' },
  { value: 'abusive', label: 'Abusive or personal attack' },
  { value: 'privacy', label: 'Reveals someone’s private information' },
  { value: 'other', label: 'Something else' },
]

export const byValue = (list) => Object.fromEntries(list.map((x) => [x.value, x]))
export const OPPORTUNITY = byValue(OPPORTUNITY_TYPES)
export const HIRING = byValue(HIRING_MODES)
export const OUTCOME = byValue(OUTCOMES)
export const ROUND = byValue(ROUND_TYPES)
export const QKIND = byValue(QUESTION_KINDS)
