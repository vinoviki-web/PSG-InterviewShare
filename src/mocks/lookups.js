/* Lookup tables. Department list must be verified against PSG Tech's
   official programme list before Phase 3 seeding (DECISIONS.md A4). */

export const DEPARTMENTS = [
  // BE
  { id: 'cse', code: 'CSE', name: 'Computer Science and Engineering', degree: 'BE' },
  { id: 'ece', code: 'ECE', name: 'Electronics and Communication Engineering', degree: 'BE' },
  { id: 'eee', code: 'EEE', name: 'Electrical and Electronics Engineering', degree: 'BE' },
  { id: 'ice', code: 'ICE', name: 'Instrumentation and Control Engineering', degree: 'BE' },
  { id: 'mech', code: 'MECH', name: 'Mechanical Engineering', degree: 'BE' },
  { id: 'prod', code: 'PROD', name: 'Production Engineering', degree: 'BE' },
  { id: 'auto', code: 'AUTO', name: 'Automobile Engineering', degree: 'BE' },
  { id: 'civil', code: 'CIVIL', name: 'Civil Engineering', degree: 'BE' },
  { id: 'bme', code: 'BME', name: 'Biomedical Engineering', degree: 'BE' },
  { id: 'meta', code: 'META', name: 'Metallurgical Engineering', degree: 'BE' },
  { id: 'rae', code: 'RAE', name: 'Robotics and Automation Engineering', degree: 'BE' },
  // BTech
  { id: 'it', code: 'IT', name: 'Information Technology', degree: 'BTech' },
  { id: 'bt', code: 'BT', name: 'Biotechnology', degree: 'BTech' },
  { id: 'ft', code: 'FT', name: 'Fashion Technology', degree: 'BTech' },
  { id: 'tt', code: 'TT', name: 'Textile Technology', degree: 'BTech' },
  // MSc (integrated)
  { id: 'ss', code: 'SS', name: 'Software Systems', degree: 'MSc' },
  { id: 'ds', code: 'DS', name: 'Data Science', degree: 'MSc' },
  { id: 'tcs', code: 'TCS', name: 'Theoretical Computer Science', degree: 'MSc' },
  { id: 'cys', code: 'CYS', name: 'Cyber Security', degree: 'MSc' },
  // PG
  { id: 'mca', code: 'MCA', name: 'Computer Applications', degree: 'MCA' },
  { id: 'me-cse', code: 'ME CSE', name: 'Computer Science and Engineering', degree: 'ME' },
]

export const DEPARTMENT = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]))

export const departmentOptions = () => {
  const groups = {}
  for (const d of DEPARTMENTS) (groups[d.degree] ??= []).push({ value: d.id, label: `${d.code} · ${d.name}` })
  return Object.entries(groups).map(([label, options]) => ({ label, options }))
}

// Topics live in src/lib/taxonomy.js (shared with the database, DECISIONS MD2).
export { TOPIC_GROUPS, TOPICS, TOPIC, topicSlug } from '../lib/taxonomy.js'
