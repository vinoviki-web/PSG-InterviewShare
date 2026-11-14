/**
 * Domains and topics: the ONE source of truth (DECISIONS MD1–MD3).
 *
 * PSG placements span every branch, so each experience has a domain (the
 * field of the role, not the student's department: an EEE student can take
 * a software job) and questions are tagged with topics grouped by domain.
 *
 * The database rows are generated from this file:
 *   node scripts/gen-reference-sql.mjs          rewrites the marked blocks in migration 0900
 *   node scripts/gen-reference-sql.mjs --check  fails if they differ (CI)
 * Topic ids are slugs of their names and must never change once published.
 */
import {
  Code2, BarChart3, CircuitBoard, Zap, Gauge, Cog, Bot, Building2, HeartPulse, Layers, Shirt, Briefcase, CircleDot,
} from 'lucide-react'

export const DOMAINS = [
  { value: 'software', label: 'Software & IT', short: 'Software', icon: Code2, covers: 'SDE, web, cloud, testing', roleExample: 'e.g. SDE Intern', technicalExample: 'e.g. 45 minutes with a senior engineer. Resume project first, then two coding questions. They wanted my approach before I wrote code.' },
  { value: 'data', label: 'Data & analytics', short: 'Data', icon: BarChart3, covers: 'Data science, ML, analyst', roleExample: 'e.g. Data Analyst Intern', technicalExample: 'e.g. 45 minutes. SQL on a sample sales table, then statistics: p-values and how I’d test a pricing change.' },
  { value: 'electronics', label: 'Electronics & semiconductors', short: 'Electronics', icon: CircuitBoard, covers: 'VLSI, embedded, communication, hardware', roleExample: 'e.g. Hardware Design Intern', technicalExample: 'e.g. 50 minutes with two design engineers. Op-amp basics, then a filter-design question and timing in a flip-flop circuit.' },
  { value: 'electrical', label: 'Electrical & power', short: 'Electrical', icon: Zap, covers: 'Machines, power systems, power electronics, EV', roleExample: 'e.g. Graduate Engineer Trainee', technicalExample: 'e.g. 40 minutes. Transformer and induction-motor basics, then a numerical on per-unit fault current.' },
  { value: 'instrumentation', label: 'Instrumentation & control', short: 'Instrumentation', icon: Gauge, covers: 'Process control, PLC/SCADA, sensors', roleExample: 'e.g. Instrumentation Engineer Trainee', technicalExample: 'e.g. 45 minutes. PID tuning, choosing a sensor for a tank level, and ladder logic for a start/stop circuit.' },
  { value: 'mechanical', label: 'Mechanical & manufacturing', short: 'Mechanical', icon: Cog, covers: 'Design, production, automobile, CAD/CAE', roleExample: 'e.g. Design Engineer', technicalExample: 'e.g. 45 minutes. Strength of materials, a bending-moment diagram on paper, and GD&T on a drawing they handed me.' },
  { value: 'robotics', label: 'Robotics & automation', short: 'Robotics', icon: Bot, covers: 'Mechatronics, ROS, motion control', roleExample: 'e.g. Automation Engineer Trainee', technicalExample: 'e.g. 45 minutes. Forward kinematics of a 2-link arm, choosing motors, and my final-year robot project.' },
  { value: 'civil', label: 'Civil & construction', short: 'Civil', icon: Building2, covers: 'Structural, site, planning', roleExample: 'e.g. Graduate Engineer Trainee, Construction', technicalExample: 'e.g. 40 minutes. RCC design basics, reading a soil report, and how I’d plan a site schedule.' },
  { value: 'biomedical', label: 'Biomedical & biotech', short: 'Biomedical', icon: HeartPulse, covers: 'Medical devices, labs, bioprocess', roleExample: 'e.g. Field Service Engineer', technicalExample: 'e.g. 40 minutes. How an ECG amplifier works, CT vs MRI, and troubleshooting a device on site.' },
  { value: 'materials', label: 'Materials & metallurgy', short: 'Materials', icon: Layers, covers: 'Steel, materials, welding, quality', roleExample: 'e.g. Graduate Trainee, Metallurgy', technicalExample: 'e.g. 40 minutes. Iron–carbon diagram, heat-treatment choices and a welding-defect question.' },
  { value: 'textile', label: 'Textile & fashion', short: 'Textile', icon: Shirt, covers: 'Textile technology, apparel, design', roleExample: 'e.g. Management Trainee, Textiles', technicalExample: 'e.g. 40 minutes. Spinning processes, dyeing questions and calculations on yarn count.' },
  { value: 'business', label: 'Business, consulting & finance', short: 'Business', icon: Briefcase, covers: 'Analyst, consulting, quant, product', roleExample: 'e.g. Business Analyst', technicalExample: 'e.g. 45 minutes. A guesstimate, then a case: why a client’s profit fell, and how I’d structure the answer.' },
  { value: 'other', label: 'Other', short: 'Other', icon: CircleDot, covers: 'Anything else', roleExample: 'e.g. the title from the job post', technicalExample: 'e.g. 45 minutes. What they asked, in order, and what they seemed to care about.' },
]
export const DOMAIN = Object.fromEntries(DOMAINS.map((d) => [d.value, d]))

/** Topic groups in display order. `domain: null` = useful in every domain. */
export const TOPIC_GROUPS = [
  { name: 'Data structures & algorithms', domain: 'software', topics: [
    'Arrays', 'Strings', 'Linked lists', 'Stacks & queues', 'Trees', 'Graphs', 'Dynamic programming', 'Greedy',
    'Recursion & backtracking', 'Sorting & searching', 'Hashing', 'Heaps', 'Bit manipulation', 'Sliding window', 'Two pointers',
  ] },
  { name: 'CS fundamentals', domain: 'software', topics: [
    'Operating systems', 'DBMS', 'SQL', 'Computer networks', 'OOP', 'System design', 'Low-level design', 'Web development',
    'Cloud & DevOps', 'Software testing',
  ] },
  { name: 'Languages', domain: 'software', topics: ['Java', 'Python', 'C / C++', 'JavaScript'] },
  { name: 'Data & analytics', domain: 'data', topics: ['Machine learning', 'Deep learning', 'Statistics', 'Probability', 'Data analysis', 'Excel & BI tools'] },
  { name: 'Electronics', domain: 'electronics', topics: [
    'Analog circuits', 'Digital electronics', 'Electronic devices', 'Signals & systems', 'Communication systems', 'Digital signal processing',
    'VLSI design', 'Verilog / VHDL', 'Microcontrollers & microprocessors', 'Embedded C', 'PCB design', 'Electromagnetics & RF',
  ] },
  { name: 'Electrical', domain: 'electrical', topics: [
    'Circuit theory', 'Electrical machines', 'Power systems', 'Power electronics', 'Switchgear & protection', 'Electric drives',
    'Electrical measurements', 'Renewable energy', 'Electric vehicles',
  ] },
  { name: 'Instrumentation & control', domain: 'instrumentation', topics: [
    'Control systems', 'Sensors & transducers', 'Process control', 'PLC & SCADA', 'Industrial instrumentation',
  ] },
  { name: 'Mechanical', domain: 'mechanical', topics: [
    'Thermodynamics', 'Fluid mechanics', 'Heat transfer', 'Strength of materials', 'Theory of machines', 'Machine design',
    'Manufacturing processes', 'CAD / CAE tools', 'GD&T', 'IC engines', 'Automobile engineering', 'Industrial engineering',
    'Quality & lean manufacturing',
  ] },
  { name: 'Robotics & automation', domain: 'robotics', topics: [
    'Robot kinematics', 'Mechatronics', 'ROS', 'Motion control', 'Computer vision', 'Hydraulics & pneumatics',
  ] },
  { name: 'Civil', domain: 'civil', topics: [
    'Structural analysis', 'RCC & steel design', 'Geotechnical engineering', 'Surveying', 'Construction management',
    'Transportation engineering', 'Environmental engineering', 'AutoCAD & BIM',
  ] },
  { name: 'Biomedical & biotech', domain: 'biomedical', topics: [
    'Biomedical instrumentation', 'Medical imaging', 'Biomaterials', 'Molecular biology', 'Bioprocess engineering',
  ] },
  { name: 'Materials & metallurgy', domain: 'materials', topics: ['Physical metallurgy', 'Heat treatment', 'Material testing', 'Welding', 'Corrosion'] },
  { name: 'Textile & fashion', domain: 'textile', topics: [
    'Yarn & fabric manufacturing', 'Textile chemistry & dyeing', 'Garment technology', 'Fashion design', 'Textile testing',
  ] },
  { name: 'Business & finance', domain: 'business', topics: ['Finance basics', 'Accounting basics', 'Economics', 'Case interviews', 'Guesstimates', 'Product sense'] },
  { name: 'Aptitude', domain: null, topics: ['Quantitative aptitude', 'Logical reasoning', 'Verbal ability'] },
  { name: 'General', domain: null, topics: ['Engineering mathematics', 'Projects & resume', 'Behavioral', 'Puzzles', 'Current affairs'] },
]

export const topicSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const TOPICS = TOPIC_GROUPS.flatMap((g) => g.topics.map((name) => ({ value: topicSlug(name), label: name, group: g.name, domain: g.domain })))
export const TOPIC = Object.fromEntries(TOPICS.map((t) => [t.value, t]))

/**
 * Topic options ordered for a domain: that domain's topics first, then the
 * ones useful everywhere (aptitude, general), then the rest. The picker shows
 * the first few when the field is empty, so this decides what students see.
 */
export function topicsForDomain(domain) {
  if (!domain || domain === 'other') return TOPICS
  const rank = (t) => (t.domain === domain ? 0 : t.domain === null ? 1 : 2)
  return [...TOPICS].sort((a, b) => rank(a) - rank(b))
}
