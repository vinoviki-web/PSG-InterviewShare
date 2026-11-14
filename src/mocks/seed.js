/**
 * Deterministic FICTIONAL prototype data. Company names are used only as
 * labels; every experience, question set and statistic here is invented
 * for the prototype (DECISIONS.md I4). Replaced by Supabase in Phase 3+.
 */
import { DEPARTMENTS, topicSlug as t } from './lookups'

function mulberry32(a) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let r = Math.imul(a ^ (a >>> 15), 1 | a)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261113)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const pickN = (arr, n) => [...arr].sort(() => rand() - 0.5).slice(0, n)
const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1))
const uuid = (prefix, i) => `${prefix}-${String(i).padStart(4, '0')}-${Math.floor(rand() * 1e8).toString(16)}`

const DAY = 86400000
const NOW = Date.now()
export const iso = (msAgo) => new Date(NOW - msAgo).toISOString()

/* ---------------- Users ---------------- */
export const DEMO_USERS = {
  newbie: { id: 'u-newbie', email: '23z118@psgtech.ac.in', full_name: 'Nithya Senthil', onboarded_at: null, department_id: null, graduation_year: null },
  student: { id: 'u-student', email: '22z201@psgtech.ac.in', full_name: 'Arjun Prakash', handle: 'arjun-p', department_id: 'cse', graduation_year: 2027, onboarded_at: iso(200 * DAY), bio: 'Pre-final year, preparing for SDE roles. Into backend and distributed systems.', interests: ['SDE'], topics: [t('Graphs'), t('System design')] },
  moderator: { id: 'u-mod', email: '21z235@psgtech.ac.in', full_name: 'Meera Krishnan', handle: 'meera-k', department_id: 'cse', graduation_year: 2026, onboarded_at: iso(400 * DAY), bio: 'Placement rep, CSE ’26.', interests: ['SDE', 'Product'], topics: [] },
  admin: { id: 'u-admin', email: '22e646@psgtech.ac.in', full_name: 'Platform Admin', handle: 'admin', department_id: 'eee', graduation_year: 2026, onboarded_at: iso(420 * DAY), bio: '', interests: [], topics: [] },
}

const NAMES = [
  'Priya Raman', 'Karthik Subramanian', 'Divya Natarajan', 'Harish Kumar', 'Sneha Venkatesh', 'Vignesh Murugan', 'Lakshmi Iyer',
  'Rahul Menon', 'Aishwarya Balaji', 'Sanjay Ravi', 'Keerthana Mohan', 'Pranav Shankar', 'Deepika Sundar', 'Ashwin Chandran',
  'Kavya Raghavan', 'Surya Prakash', 'Janani Gopal', 'Rohit Varadhan', 'Swetha Anand', 'Gokul Krishnan', 'Monisha Selvam',
  'Adithya Ramesh', 'Harini Pandian', 'Naveen Kannan',
]
const FAV_DEPTS = ['cse', 'cse', 'cse', 'it', 'it', 'ece', 'eee', 'mech', 'ss', 'ds', 'ice', 'mca', 'prod', 'tcs']

export const USERS = [
  ...Object.values(DEMO_USERS).map((u) => ({ ...u, status: 'active', profile_visibility: 'public_psg', created_at: u.onboarded_at ?? iso(2 * DAY) })),
  ...NAMES.map((full_name, i) => {
    const year = pick([2025, 2025, 2026, 2026, 2026, 2027])
    const roll = `${String(year - 4).slice(-2)}${pick(['z', 'e', 'u', 'm', 'pw'])}${String(100 + i * 7).slice(-3)}`
    return {
      id: `u-${i + 1}`,
      email: `${roll}@psgtech.ac.in`,
      full_name,
      handle: full_name.toLowerCase().split(' ').map((p, j) => (j ? p[0] : p)).join('-'),
      department_id: pick(FAV_DEPTS),
      graduation_year: year,
      onboarded_at: iso(int(60, 600) * DAY),
      created_at: iso(int(60, 600) * DAY),
      bio: '',
      interests: [],
      topics: [],
      status: i === 7 ? 'suspended' : 'active',
      profile_visibility: i % 6 === 0 ? 'private' : 'public_psg',
    }
  }),
]

export const ROLES = [
  { user_id: 'u-mod', role: 'moderator', granted_by: 'u-admin', granted_at: iso(300 * DAY) },
  { user_id: 'u-admin', role: 'admin', granted_by: null, granted_at: iso(420 * DAY) },
  { user_id: 'u-3', role: 'moderator', granted_by: 'u-admin', granted_at: iso(200 * DAY) },
]

/* ---------------- Companies ---------------- */
const C = (name, industry, website, description, extra = {}) => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
  industry,
  website,
  description,
  description_source: 'admin_curated',
  is_verified: true,
  aliases: [],
  ...extra,
})

export const COMPANY_PROFILES = [
  { ...C('Zoho Corporation', 'Software', 'zoho.com', 'Chennai-headquartered SaaS company building business software across CRM, finance, collaboration and IT management.', { aliases: ['Zoho'] }),
    roles: ['Member Technical Staff', 'Software Developer Intern'], pipelines: [['aptitude', 'coding', 'technical', 'technical', 'hr'], ['aptitude', 'coding', 'technical', 'hr']], focus: ['Arrays', 'Strings', 'OOP', 'DBMS', 'Puzzles', 'Recursion & backtracking'], types: ['full_time', 'internship', 'intern_fte'] },
  { ...C('Amazon', 'E-commerce & Cloud', 'amazon.jobs', 'Global e-commerce and cloud computing company. Campus hiring is mainly for SDE roles.'),
    roles: ['SDE Intern', 'SDE I'], pipelines: [['online_assessment', 'technical', 'technical'], ['online_assessment', 'technical', 'technical', 'technical']], focus: ['Trees', 'Graphs', 'Dynamic programming', 'Sliding window', 'Behavioral', 'Hashing'], types: ['internship', 'intern_ppo', 'full_time'] },
  { ...C('Microsoft', 'Software', 'careers.microsoft.com', 'Technology company building operating systems, productivity software and cloud services.'),
    roles: ['Software Engineer Intern', 'Software Engineer'], pipelines: [['online_assessment', 'technical', 'technical', 'managerial']], focus: ['Linked lists', 'Trees', 'Dynamic programming', 'OOP', 'Projects & resume', 'Low-level design'], types: ['internship', 'intern_ppo', 'full_time'] },
  { ...C('Bosch Global Software Technologies', 'Automotive & Embedded', 'bosch-softwaretechnologies.com', 'Engineering and IT services arm of Bosch, with large teams in Coimbatore and Bengaluru.', { aliases: ['Bosch', 'BGSW', 'RBEI'] }),
    roles: ['Associate Software Engineer', 'Embedded Software Engineer'], pipelines: [['online_assessment', 'technical', 'hr']], focus: ['C / C++', 'Embedded C', 'Operating systems', 'Digital electronics', 'OOP'], types: ['full_time'] },
  { ...C('Freshworks', 'Software', 'freshworks.com', 'SaaS company building customer and employee engagement software, with major engineering in Chennai.'),
    roles: ['Software Engineer', 'Software Engineer Intern'], pipelines: [['coding', 'technical', 'system_design', 'hr'], ['coding', 'technical', 'hr']], focus: ['Arrays', 'Hashing', 'System design', 'JavaScript', 'SQL', 'Projects & resume'], types: ['full_time', 'internship'] },
  { ...C('PayPal', 'Fintech', 'paypal.com/careers', 'Digital payments company with a large technology centre in Chennai.'),
    roles: ['Software Engineer Intern', 'Software Engineer 1'], pipelines: [['online_assessment', 'technical', 'technical', 'hr']], focus: ['Graphs', 'Dynamic programming', 'DBMS', 'Computer networks', 'Java'], types: ['internship', 'intern_ppo'] },
  { ...C('Texas Instruments', 'Semiconductors', 'careers.ti.com', 'Semiconductor company designing analog and embedded processing chips.', { aliases: ['TI'] }),
    roles: ['Analog Design Engineer', 'Digital Design Intern'], pipelines: [['aptitude', 'technical', 'technical', 'hr']], focus: ['Analog circuits', 'Digital electronics', 'Control systems', 'Quantitative aptitude'], types: ['internship', 'full_time'] },
  { ...C('Caterpillar', 'Heavy machinery', 'caterpillar.com/careers', 'Manufacturer of construction and mining equipment, engines and turbines, with an engineering centre in Chennai.'),
    roles: ['Graduate Engineer Trainee', 'Design Engineer'], pipelines: [['aptitude', 'technical', 'hr']], focus: ['Strength of materials', 'Machine design', 'Thermodynamics', 'Manufacturing processes'], types: ['full_time'] },
  { ...C('Tata Consultancy Services', 'IT services', 'tcs.com/careers', 'IT services and consulting company. Hires at scale through national tests and campus drives.', { aliases: ['TCS', 'TCS Digital', 'TCS Ninja'] }),
    roles: ['Digital', 'Ninja', 'Prime'], pipelines: [['aptitude', 'technical', 'managerial', 'hr'], ['aptitude', 'technical', 'hr']], focus: ['Quantitative aptitude', 'Logical reasoning', 'OOP', 'DBMS', 'Projects & resume'], types: ['full_time'] },
  { ...C('Goldman Sachs', 'Finance', 'goldmansachs.com/careers', 'Investment bank whose engineering division builds trading, risk and platform systems.'),
    roles: ['Summer Analyst', 'Analyst, Engineering'], pipelines: [['online_assessment', 'technical', 'technical', 'technical', 'hr']], focus: ['Dynamic programming', 'Arrays', 'Statistics', 'Puzzles', 'Finance basics'], types: ['internship', 'intern_ppo'] },
  { ...C('Deloitte', 'Consulting', 'deloitte.com/careers', 'Professional services firm. Campus roles include analyst and consulting tracks.'),
    roles: ['Analyst', 'Business Technology Analyst'], pipelines: [['aptitude', 'group_discussion', 'technical', 'hr']], focus: ['Verbal ability', 'Guesstimates', 'SQL', 'Behavioral'], types: ['full_time'] },
  { ...C('Cisco', 'Networking', 'jobs.cisco.com', 'Networking and security company. Campus roles span software and hardware engineering.'),
    roles: ['Software Engineer Intern', 'Technical Undergrad Intern'], pipelines: [['online_assessment', 'technical', 'technical', 'managerial']], focus: ['Computer networks', 'Operating systems', 'C / C++', 'Linked lists', 'Bit manipulation'], types: ['internship', 'intern_fte'] },
  { ...C('Walmart Global Tech', 'Retail technology', 'careers.walmart.com', 'Technology organisation behind Walmart’s retail, supply-chain and e-commerce platforms.'),
    roles: ['Software Engineer III', 'Software Engineer Intern'], pipelines: [['online_assessment', 'technical', 'technical', 'hr']], focus: ['Graphs', 'Heaps', 'System design', 'Java', 'Two pointers'], types: ['internship', 'intern_ppo'] },
  { ...C('Oracle', 'Software', 'oracle.com/careers', 'Enterprise software company known for databases and cloud infrastructure.'),
    roles: ['Member of Technical Staff', 'Applications Engineer'], pipelines: [['online_assessment', 'technical', 'technical', 'hr']], focus: ['DBMS', 'SQL', 'Operating systems', 'Java', 'Trees'], types: ['full_time'] },
  { ...C('L&T Technology Services', 'Engineering services', 'ltts.com/careers', 'Engineering R&D services company working across mobility, industrial and medical domains.', { aliases: ['LTTS'] }),
    roles: ['Graduate Engineer Trainee'], pipelines: [['aptitude', 'technical', 'hr']], focus: ['Embedded C', 'Digital electronics', 'Machine design', 'Quantitative aptitude'], types: ['full_time'] },
  { ...C('Chargebee', 'Software', 'chargebee.com/careers', 'Subscription billing and revenue management SaaS company based in Chennai.'),
    roles: ['Software Engineer'], pipelines: [['coding', 'technical', 'technical', 'hr']], focus: ['Low-level design', 'Java', 'SQL', 'Hashing'], types: ['full_time'] },
  { ...C('Kissflow', 'Software', 'kissflow.com', 'Low-code workflow platform company headquartered in Chennai.', { is_verified: false, description: null, description_source: null }),
    roles: ['Product Engineer'], pipelines: [['coding', 'technical', 'hr']], focus: ['JavaScript', 'Arrays', 'Projects & resume'], types: ['full_time'] },
  { ...C('Siemens Healthineers', 'Medical technology', 'siemens-healthineers.com/careers', 'Medical technology company building imaging, diagnostics and healthcare IT products.'),
    roles: ['Software Engineer Trainee'], pipelines: [['online_assessment', 'technical', 'hr']], focus: ['OOP', 'C / C++', 'Operating systems', 'Projects & resume'], types: ['full_time'] },
]

/* ---------------- Question bank (generic, widely-known problem styles) ---------------- */
const Q = (body, kind, topics) => ({ body, kind, topics: topics.map(t) })
export const QUESTION_POOL = {
  Arrays: [Q('Find the maximum sum subarray and explain why Kadane’s algorithm works.', 'coding', ['Arrays', 'Dynamic programming']), Q('Rotate an array by k positions in place with O(1) extra space.', 'coding', ['Arrays']), Q('Given an array of integers, return all unique triplets that sum to zero.', 'coding', ['Arrays', 'Two pointers'])],
  Strings: [Q('Check whether two strings are anagrams. Then handle Unicode input.', 'coding', ['Strings', 'Hashing']), Q('Find the longest palindromic substring. Started with brute force, then expand-around-centre.', 'coding', ['Strings', 'Dynamic programming']), Q('Compress a string like `aaabcc` → `a3b1c2` and return the original if it isn’t shorter.', 'coding', ['Strings'])],
  'Linked lists': [Q('Reverse a linked list in groups of k.', 'coding', ['Linked lists']), Q('Detect a cycle and return the node where it begins.', 'coding', ['Linked lists', 'Two pointers'])],
  Trees: [Q('Print the boundary traversal of a binary tree.', 'coding', ['Trees']), Q('Find the lowest common ancestor of two nodes in a binary tree (not BST).', 'coding', ['Trees', 'Recursion & backtracking']), Q('Serialize and deserialize a binary tree.', 'coding', ['Trees', 'Strings'])],
  Graphs: [Q('Number of islands in a grid. Follow-up: what if the grid doesn’t fit in memory?', 'coding', ['Graphs']), Q('Detect a cycle in a directed graph and explain topological sort.', 'coding', ['Graphs']), Q('Shortest path in a grid with obstacles where you may remove at most k obstacles.', 'coding', ['Graphs'])],
  'Dynamic programming': [Q('Minimum number of coins to make an amount; then count the number of ways.', 'coding', ['Dynamic programming']), Q('Longest increasing subsequence in O(n log n).', 'coding', ['Dynamic programming', 'Sorting & searching']), Q('Edit distance between two words, with the recurrence explained on the whiteboard.', 'coding', ['Dynamic programming', 'Strings'])],
  'Sliding window': [Q('Longest substring without repeating characters.', 'coding', ['Sliding window', 'Strings', 'Hashing']), Q('Maximum in every window of size k.', 'coding', ['Sliding window', 'Stacks & queues'])],
  Hashing: [Q('Design an LRU cache with O(1) get and put.', 'coding', ['Hashing', 'Linked lists']), Q('Group words that are anagrams of each other.', 'coding', ['Hashing', 'Strings'])],
  Heaps: [Q('Find the k-th largest element in a stream.', 'coding', ['Heaps']), Q('Merge k sorted lists.', 'coding', ['Heaps', 'Linked lists'])],
  'Two pointers': [Q('Container with most water.', 'coding', ['Two pointers', 'Arrays'])],
  'Bit manipulation': [Q('Count set bits for every number from 0 to n.', 'coding', ['Bit manipulation']), Q('Find the two non-repeating elements in an array where every other element repeats twice.', 'coding', ['Bit manipulation'])],
  'Recursion & backtracking': [Q('Generate all valid combinations of n pairs of parentheses.', 'coding', ['Recursion & backtracking']), Q('Solve N-Queens and explain pruning.', 'coding', ['Recursion & backtracking'])],
  'Operating systems': [Q('Difference between a process and a thread. When would you prefer each?', 'technical', ['Operating systems']), Q('Explain deadlock, the four necessary conditions, and one way to prevent it.', 'technical', ['Operating systems']), Q('What happens, step by step, when virtual memory has a page fault?', 'technical', ['Operating systems'])],
  DBMS: [Q('Explain normalization up to BCNF with an example from your project’s schema.', 'technical', ['DBMS']), Q('What are ACID properties? How does an index speed up reads and slow down writes?', 'technical', ['DBMS'])],
  SQL: [Q('Write a query for the second-highest salary in each department.', 'technical', ['SQL']), Q('Difference between `WHERE` and `HAVING`, with an example.', 'technical', ['SQL'])],
  'Computer networks': [Q('What happens when you type a URL into the browser and press Enter?', 'technical', ['Computer networks']), Q('TCP vs UDP. Why does video calling often use UDP?', 'technical', ['Computer networks'])],
  OOP: [Q('Explain the four pillars of OOP using classes from your own project.', 'technical', ['OOP']), Q('Abstract class vs interface. When does it matter?', 'technical', ['OOP', 'Java'])],
  'System design': [Q('Design a URL shortener. Focus on ID generation and read scaling.', 'technical', ['System design']), Q('Design the notification service for a food delivery app.', 'technical', ['System design'])],
  'Low-level design': [Q('Design a parking lot: classes, relationships, and how you’d extend for EV charging.', 'technical', ['Low-level design', 'OOP']), Q('Design the classes for a library management system.', 'technical', ['Low-level design', 'OOP'])],
  Java: [Q('How does `HashMap` work internally? What changed in Java 8?', 'technical', ['Java', 'Hashing'])],
  JavaScript: [Q('Explain the event loop and the difference between microtasks and macrotasks.', 'technical', ['JavaScript']), Q('Implement `debounce` from scratch.', 'coding', ['JavaScript'])],
  'C / C++': [Q('Difference between `malloc` and `new`; what is a memory leak and how do you find one?', 'technical', ['C / C++']), Q('What is a virtual function and how does the vtable work?', 'technical', ['C / C++', 'OOP'])],
  'Embedded C': [Q('What does the `volatile` keyword do and when is it required?', 'technical', ['Embedded C', 'C / C++']), Q('Write a function to set, clear and toggle a bit in a register.', 'coding', ['Embedded C', 'Bit manipulation'])],
  'Digital electronics': [Q('Design a mod-6 counter using flip-flops.', 'technical', ['Digital electronics']), Q('Setup and hold time. What happens on a violation?', 'technical', ['Digital electronics'])],
  'Analog circuits': [Q('Derive the gain of a non-inverting op-amp and discuss its bandwidth.', 'technical', ['Analog circuits'])],
  'Control systems': [Q('Explain PID control and the effect of each term on a step response.', 'technical', ['Control systems'])],
  Thermodynamics: [Q('Explain the Rankine cycle and how reheating improves efficiency.', 'technical', ['Thermodynamics'])],
  'Strength of materials': [Q('Draw the shear force and bending moment diagram for a simply supported beam with a point load.', 'technical', ['Strength of materials'])],
  'Machine design': [Q('How would you select a bearing for a given load and speed?', 'technical', ['Machine design'])],
  'Manufacturing processes': [Q('Compare casting and forging for a crankshaft.', 'technical', ['Manufacturing processes'])],
  'Quantitative aptitude': [Q('Time and work, pipes and cisterns, and probability questions. About 30 in 40 minutes.', 'aptitude', ['Quantitative aptitude'])],
  'Logical reasoning': [Q('Seating arrangement and blood-relation puzzles.', 'aptitude', ['Logical reasoning'])],
  'Verbal ability': [Q('Reading comprehension and sentence correction section.', 'aptitude', ['Verbal ability'])],
  Puzzles: [Q('You have 8 balls and one is heavier. Find it with two weighings.', 'puzzle', ['Puzzles']), Q('Two eggs, 100 floors: minimum drops in the worst case?', 'puzzle', ['Puzzles', 'Dynamic programming'])],
  'Projects & resume': [Q('Walk me through your best project. What would you change if you rebuilt it?', 'technical', ['Projects & resume']), Q('Why did you choose this tech stack for your internship project?', 'technical', ['Projects & resume'])],
  Behavioral: [Q('Tell me about a time you disagreed with a teammate.', 'behavioral', ['Behavioral']), Q('Describe a deadline you almost missed and what you did.', 'behavioral', ['Behavioral'])],
  Statistics: [Q('Explain the central limit theorem in plain words.', 'technical', ['Statistics'])],
  'Finance basics': [Q('What is the time value of money? Explain NPV.', 'technical', ['Finance basics'])],
  Guesstimates: [Q('Estimate the number of two-wheelers sold in Coimbatore every month.', 'technical', ['Guesstimates'])],
}
const HR_QUESTIONS = [
  Q('Tell me about yourself.', 'hr', ['Behavioral']),
  Q('Why do you want to join us, and why this role?', 'hr', ['Behavioral']),
  Q('Are you comfortable relocating?', 'hr', ['Behavioral']),
  Q('Where do you see yourself in three years?', 'hr', ['Behavioral']),
  Q('What will you do if you get a higher-studies admit next year?', 'hr', ['Behavioral']),
]

/* ---------------- Narrative pools ---------------- */
const ROUND_TEXT = {
  online_assessment: [
    'Online test on their own platform. 2 coding questions in 90 minutes plus a short work-style survey. Proctored with webcam.',
    'HackerRank test: 3 coding questions (easy, medium, hard) and 10 MCQs on OS and DBMS. Partial marks were awarded for test cases.',
    'Coding test with two questions. The second had tricky edge cases around empty input. Around 180 students wrote it and roughly 25 were shortlisted.',
  ],
  aptitude: [
    'Pen-and-paper aptitude round in the main auditorium: quantitative, logical and some C output questions. Time was the real challenge.',
    'Online aptitude test with sectional time limits. Quants was moderately tough, and verbal was easy if you read regularly.',
  ],
  coding: [
    'Offline programming round in the lab. Five problems of increasing difficulty in 3 hours. They checked code quality, not just output.',
    'Live coding on a shared editor. The interviewer kept adding constraints after each solution.',
  ],
  technical: [
    'Started with a resume walkthrough, then two DSA problems. I had to explain the brute force first and then optimise. They asked me to dry-run with my own test cases.',
    'Mostly CS fundamentals: OS and DBMS questions tied to my project, followed by one medium coding question. The interviewer was friendly and gave hints when I paused.',
    'Deep dive into one project for about 20 minutes, then a coding question. Clarifying requirements before coding clearly mattered to them.',
  ],
  system_design: ['Open-ended design discussion. They cared about trade-offs and data modelling more than drawing boxes.'],
  group_discussion: ['GD of 10 students on a current-affairs topic for 15 minutes. Panel noted who structured the discussion and who listened.'],
  managerial: ['Hiring-manager round: project ownership, handling ambiguity, and a light design question at the end.'],
  hr: [
    'Short HR conversation: background, relocation, notice about the bond, and questions for them.',
    'Friendly HR round. They asked about family, hobbies and long-term plans, and explained the joining timeline.',
  ],
  other: ['Document verification and a short orientation call.'],
}
const PREP = [
  'I followed a fixed plan for about 3 months: one DSA topic a week on LeetCode, revising **OS, DBMS and CN** from class notes on weekends. Two weeks before the drive I switched to timed mock tests and company-tagged problems.',
  'Mostly consistent practice: 2 problems a day for 4 months. I kept a notebook of mistakes and re-solved them every Sunday. For fundamentals I made one-page summaries per subject.',
  'Aptitude from IndiaBix and previous papers, coding on GeeksforGeeks. I practised explaining my approach out loud, which helped a lot in the interview.',
  'Focused heavily on my projects: I could explain every design choice and what I would do differently. DSA practice was medium-level problems on arrays, strings and trees.',
  'Core subjects from NPTEL lectures and our department notes, plus solving previous GATE questions for the technical round.',
]
const ADVICE = [
  'Trace your approach out loud before coding. They cared more about the brute-force → optimal journey than the final answer.',
  'Know every line of your resume. Anything you list, including clubs and minor projects, can become a 10-minute discussion.',
  'Don’t skip aptitude practice. Many strong coders I knew were filtered out in the first round.',
  'Ask clarifying questions. In my second round the “obvious” assumption was wrong, and asking saved me.',
  'Revise OS and DBMS basics the night before. The questions were standard but needed crisp answers.',
  'Be honest when you don’t know something and explain how you would find out. The interviewer appreciated that more than guessing.',
  'Practise writing code without autocomplete. The offline round had no IDE support.',
  'Prepare 3–4 stories (conflict, failure, leadership, learning) for behavioural questions using the STAR format.',
]
const APPLY = [
  'Applied through the placement cell portal. Shortlisting was based on CGPA and resume.',
  'Company came on campus. Everyone above the cutoff could register. Resume shortlist happened after the online test.',
  'Off-campus application through their careers page with a referral from a senior.',
]
const RESOURCES = [
  { title: 'Striver’s SDE sheet', url: 'https://takeuforward.org/interviews/strivers-sde-sheet-top-coding-interview-problems/', kind: 'practice' },
  { title: 'LeetCode company-tagged lists', url: 'https://leetcode.com/problemset/', kind: 'practice' },
  { title: 'IndiaBix aptitude', url: 'https://www.indiabix.com/', kind: 'practice' },
  { title: 'Operating System Concepts (Galvin)', url: 'https://www.os-book.com/', kind: 'book' },
  { title: 'NPTEL: Database Management Systems', url: 'https://nptel.ac.in/', kind: 'course' },
  { title: 'System Design Primer', url: 'https://github.com/donnemartin/system-design-primer', kind: 'other' },
]

/* ---------------- Experiences ---------------- */
const roundTopicsFor = (type, focus) => {
  if (type === 'hr') return null
  if (type === 'aptitude') return ['Quantitative aptitude', 'Logical reasoning', 'Verbal ability'].filter((x) => QUESTION_POOL[x])
  if (type === 'group_discussion') return null
  if (type === 'system_design') return ['System design']
  return focus.filter((f) => QUESTION_POOL[f] && !['Quantitative aptitude', 'Logical reasoning', 'Verbal ability'].includes(f))
}

let qid = 0
function buildRounds(expId, pipeline, focus, difficulty) {
  return pipeline.map((type, i) => {
    const roundId = `${expId}-r${i + 1}`
    let questions = []
    if (type === 'hr') questions = pickN(HR_QUESTIONS, int(1, 3))
    else if (type === 'managerial') questions = [pick(QUESTION_POOL['Projects & resume']), pick(QUESTION_POOL.Behavioral)]
    else {
      const topics = roundTopicsFor(type, focus)
      if (topics?.length) questions = pickN(topics, Math.min(topics.length, int(1, 3))).map((tp) => pick(QUESTION_POOL[tp]))
    }
    return {
      id: roundId,
      position: i + 1,
      round_type: type,
      mode: type === 'online_assessment' || rand() > 0.6 ? 'online' : 'offline',
      duration_minutes: { online_assessment: 90, aptitude: 60, coding: 120, technical: int(40, 75), system_design: 60, group_discussion: 20, managerial: 45, hr: int(15, 30), other: 15 }[type],
      difficulty: Math.max(1, Math.min(5, difficulty + int(-1, 1) - (type === 'hr' ? 2 : 0))),
      description: pick(ROUND_TEXT[type]),
      questions: [...new Map(questions.map((q) => [q.body, q])).values()].map((q, j) => ({
        id: `q-${++qid}`,
        round_id: roundId,
        position: j + 1,
        body: q.body,
        kind: q.kind,
        topics: q.topics,
      })),
    }
  })
}

const OUTCOME_WEIGHTS = ['selected', 'selected', 'selected', 'not_selected', 'not_selected', 'awaiting', 'undisclosed', 'withdrew']
const authorPool = USERS.filter((u) => u.onboarded_at && u.id.startsWith('u-') && !['u-newbie'].includes(u.id))

export const EXPERIENCES = []
const counts = [7, 6, 4, 4, 4, 3, 3, 2, 3, 3, 2, 3, 2, 2, 2, 1, 1, 2]
COMPANY_PROFILES.forEach((co, ci) => {
  for (let k = 0; k < counts[ci]; k++) {
    const idx = EXPERIENCES.length + 1
    const id = uuid('exp', idx)
    const author = idx === 3 || idx === 19 ? USERS.find((u) => u.id === 'u-student') : pick(authorPool)
    const type = pick(co.types)
    const year = author.graduation_year ?? 2026
    const internship = type === 'internship' || type === 'intern_ppo' || type === 'intern_fte'
    const interviewYear = internship ? year - 1 : year - 1
    const month = internship ? pick([7, 8, 9]) : pick([8, 9, 10, 11, 12])
    const publishedAgo = (idx % 9 === 0 ? int(0, 6) : int(2, 520)) * DAY + int(0, 23) * 3600000
    const difficulty = int(2, 5)
    const rounds = buildRounds(id, pick(co.pipelines), co.focus, difficulty)
    const topicSet = new Set(rounds.flatMap((r) => r.questions.flatMap((q) => q.topics)))
    co.focus.slice(0, 3).forEach((f) => topicSet.add(t(f)))
    const anonymous = rand() < 0.22
    const outcome = pick(OUTCOME_WEIGHTS)
    EXPERIENCES.push({
      id,
      author_id: author.id,
      company_slug: co.slug,
      role_title: (() => {
        const internRoles = co.roles.filter((r) => /intern|summer/i.test(r))
        const fullRoles = co.roles.filter((r) => !/intern|summer/i.test(r))
        const pool = internship && type !== 'intern_fte' ? internRoles : fullRoles
        return pick(pool.length ? pool : co.roles)
      })(),
      opportunity_type: type,
      hiring_mode: rand() < 0.82 ? 'on_campus' : pick(['off_campus', 'referral']),
      department_id: author.department_id ?? 'cse',
      graduation_year: year,
      interview_month: `${interviewYear}-${String(month).padStart(2, '0')}-01`,
      eligibility: rand() < 0.7 ? { cgpa: pick([6.5, 7, 7.5, 8]), branches: pickN(['cse', 'it', 'ece', 'eee', 'ss', 'ds', 'mech'], int(2, 5)), backlogs: pick(['no', 'no', 'unknown']), other: '' } : null,
      application_process: pick(APPLY),
      preparation: pick(PREP),
      resources: pickN(RESOURCES, int(0, 3)),
      advice: pick(ADVICE) + (rand() < 0.4 ? ` ${pick(ADVICE)}` : ''),
      difficulty,
      outcome,
      is_anonymous: anonymous,
      hide_department: anonymous && rand() < 0.4,
      status: 'published',
      published_at: iso(publishedAgo),
      created_at: iso(publishedAgo + DAY),
      updated_at: iso(publishedAgo - (rand() < 0.2 ? int(1, 5) * DAY : 0)),
      edited: rand() < 0.15,
      helpful_count: Math.max(0, Math.round(int(0, 60) * (publishedAgo / (520 * DAY) + 0.3))),
      view_count: int(40, 900),
      topics: [...topicSet].slice(0, 8),
      rounds,
    })
  }
})

/* A hidden one and a draft, for moderation and drafts views */
EXPERIENCES[5].status = 'hidden'
EXPERIENCES[5].hidden_reason = 'Auto-hidden after 3 reports'

/* ---------------- Comments ---------------- */
const COMMENT_TEXT = [
  'This is super helpful, thanks! Did they ask anything about your internship project?',
  'Was the OA camera-proctored for everyone or only shortlisted candidates?',
  'Thanks for the detailed rounds. How many were selected overall from PSG?',
  'Same experience for me in the second round. The interviewer focused a lot on edge cases.',
  'Could you share which LeetCode lists you followed?',
]
export const COMMENTS = []
EXPERIENCES.slice(0, 30).forEach((e, i) => {
  const n = i % 4 === 0 ? int(1, 4) : i % 3 === 0 ? 1 : 0
  for (let k = 0; k < n; k++) {
    const id = `c-${i}-${k}`
    const askedDaysAgo = int(2, 60)
    const commenters = authorPool.filter((u) => u.id !== e.author_id)
    COMMENTS.push({ id, experience_id: e.id, author_id: pick(commenters).id, parent_id: null, body: COMMENT_TEXT[(i + k) % COMMENT_TEXT.length], status: 'visible', created_at: iso(askedDaysAgo * DAY) })
    if (rand() < 0.35 && !e.is_anonymous) {
      COMMENTS.push({ id: `${id}-r`, experience_id: e.id, author_id: e.author_id, parent_id: id, body: 'Yes, about 15 minutes on it. Mostly why I chose the database and how I handled auth.', status: 'visible', created_at: iso((askedDaysAgo - 1) * DAY + 3600000) })
    }
  }
})

/* ---------------- Reports & moderation ---------------- */
export const REPORTS = [
  { id: 'rep-1', reporter_id: 'u-4', target_type: 'experience', target_id: EXPERIENCES[5].id, reason: 'misleading', details: 'Rounds don’t match what happened in this drive.', status: 'open', created_at: iso(3 * DAY) },
  { id: 'rep-2', reporter_id: 'u-9', target_type: 'experience', target_id: EXPERIENCES[5].id, reason: 'misleading', details: '', status: 'open', created_at: iso(2 * DAY) },
  { id: 'rep-3', reporter_id: 'u-12', target_type: 'experience', target_id: EXPERIENCES[5].id, reason: 'confidential', details: 'Copies exact test questions they asked us not to share.', status: 'open', created_at: iso(2 * DAY) },
  { id: 'rep-4', reporter_id: 'u-2', target_type: 'comment', target_id: COMMENTS[1]?.id, reason: 'spam', details: 'Promoting a paid course.', status: 'open', created_at: iso(1 * DAY) },
  { id: 'rep-5', reporter_id: 'u-15', target_type: 'experience', target_id: EXPERIENCES[11].id, reason: 'abusive', details: 'Calls the interviewer names in round 2.', status: 'open', created_at: iso(5 * 3600000) },
  { id: 'rep-6', reporter_id: 'u-6', target_type: 'experience', target_id: EXPERIENCES[20].id, reason: 'other', details: 'Duplicate of another post', status: 'dismissed', resolved_by: 'u-mod', resolved_at: iso(9 * DAY), created_at: iso(10 * DAY) },
]

export const AUDIT = [
  { id: 1, actor_id: 'u-admin', action: 'role.grant', entity: 'user', entity_id: 'u-mod', metadata: { role: 'moderator' }, created_at: iso(300 * DAY) },
  { id: 2, actor_id: 'u-admin', action: 'role.grant', entity: 'user', entity_id: 'u-3', metadata: { role: 'moderator' }, created_at: iso(200 * DAY) },
  { id: 3, actor_id: 'u-admin', action: 'company.verify', entity: 'company', entity_id: 'chargebee', metadata: {}, created_at: iso(90 * DAY) },
  { id: 4, actor_id: 'u-mod', action: 'report.dismiss', entity: 'report', entity_id: 'rep-6', metadata: { reason: 'Not a duplicate: different batch' }, created_at: iso(9 * DAY) },
  { id: 5, actor_id: 'system', action: 'experience.auto_hide', entity: 'experience', entity_id: EXPERIENCES[5].id, metadata: { reports: 3 }, created_at: iso(2 * DAY) },
  { id: 6, actor_id: 'u-admin', action: 'user.suspend', entity: 'user', entity_id: 'u-8', metadata: { until: iso(-20 * DAY), reason: 'Repeated spam comments' }, created_at: iso(4 * DAY) },
]

export const SETTINGS = {
  announcement: { text: '', tone: 'info', expires_at: null },
  flags: { comments: true, anonymous_posting: true, new_companies: true },
  limits: { publish_per_day: 5, comments_per_hour: 30, reports_per_day: 20, auto_hide_threshold: 3 },
  landing_stats_threshold: 25,
}

export { DEPARTMENTS }
