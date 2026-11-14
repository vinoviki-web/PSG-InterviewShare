-- =====================================================================
-- Roundwise · 0900 · Reference data (runs in EVERY environment, incl. production)
-- Departments, topics and the starting company list, moved out of seed.sql
-- so production gets them through migrations and never gets demo accounts.
-- Idempotent (ON CONFLICT DO NOTHING).
-- BEFORE LAUNCH: verify departments against PSG Tech's official programme
-- list (DECISIONS A4); admins can edit companies in /admin/companies.
-- =====================================================================

insert into public.departments (id, code, name, degree, sort) values
  ('cse', 'CSE', 'Computer Science and Engineering', 'BE', 0),
  ('ece', 'ECE', 'Electronics and Communication Engineering', 'BE', 1),
  ('eee', 'EEE', 'Electrical and Electronics Engineering', 'BE', 2),
  ('ice', 'ICE', 'Instrumentation and Control Engineering', 'BE', 3),
  ('mech', 'MECH', 'Mechanical Engineering', 'BE', 4),
  ('prod', 'PROD', 'Production Engineering', 'BE', 5),
  ('auto', 'AUTO', 'Automobile Engineering', 'BE', 6),
  ('civil', 'CIVIL', 'Civil Engineering', 'BE', 7),
  ('bme', 'BME', 'Biomedical Engineering', 'BE', 8),
  ('meta', 'META', 'Metallurgical Engineering', 'BE', 9),
  ('rae', 'RAE', 'Robotics and Automation Engineering', 'BE', 10),
  ('it', 'IT', 'Information Technology', 'BTech', 11),
  ('bt', 'BT', 'Biotechnology', 'BTech', 12),
  ('ft', 'FT', 'Fashion Technology', 'BTech', 13),
  ('tt', 'TT', 'Textile Technology', 'BTech', 14),
  ('ss', 'SS', 'Software Systems', 'MSc', 15),
  ('ds', 'DS', 'Data Science', 'MSc', 16),
  ('tcs', 'TCS', 'Theoretical Computer Science', 'MSc', 17),
  ('cys', 'CYS', 'Cyber Security', 'MSc', 18),
  ('mca', 'MCA', 'Computer Applications', 'MCA', 19),
  ('me-cse', 'ME CSE', 'Computer Science and Engineering', 'ME', 20)
on conflict (id) do nothing;

insert into public.topics (id, name, group_name, sort) values
  ('arrays', 'Arrays', 'Data structures & algorithms', 0),
  ('strings', 'Strings', 'Data structures & algorithms', 1),
  ('linked-lists', 'Linked lists', 'Data structures & algorithms', 2),
  ('stacks-queues', 'Stacks & queues', 'Data structures & algorithms', 3),
  ('trees', 'Trees', 'Data structures & algorithms', 4),
  ('graphs', 'Graphs', 'Data structures & algorithms', 5),
  ('dynamic-programming', 'Dynamic programming', 'Data structures & algorithms', 6),
  ('greedy', 'Greedy', 'Data structures & algorithms', 7),
  ('recursion-backtracking', 'Recursion & backtracking', 'Data structures & algorithms', 8),
  ('sorting-searching', 'Sorting & searching', 'Data structures & algorithms', 9),
  ('hashing', 'Hashing', 'Data structures & algorithms', 10),
  ('heaps', 'Heaps', 'Data structures & algorithms', 11),
  ('bit-manipulation', 'Bit manipulation', 'Data structures & algorithms', 12),
  ('sliding-window', 'Sliding window', 'Data structures & algorithms', 13),
  ('two-pointers', 'Two pointers', 'Data structures & algorithms', 14),
  ('operating-systems', 'Operating systems', 'CS fundamentals', 0),
  ('dbms', 'DBMS', 'CS fundamentals', 1),
  ('sql', 'SQL', 'CS fundamentals', 2),
  ('computer-networks', 'Computer networks', 'CS fundamentals', 3),
  ('oop', 'OOP', 'CS fundamentals', 4),
  ('system-design', 'System design', 'CS fundamentals', 5),
  ('low-level-design', 'Low-level design', 'CS fundamentals', 6),
  ('java', 'Java', 'Languages', 0),
  ('python', 'Python', 'Languages', 1),
  ('c-c', 'C / C++', 'Languages', 2),
  ('javascript', 'JavaScript', 'Languages', 3),
  ('quantitative-aptitude', 'Quantitative aptitude', 'Aptitude', 0),
  ('logical-reasoning', 'Logical reasoning', 'Aptitude', 1),
  ('verbal-ability', 'Verbal ability', 'Aptitude', 2),
  ('digital-electronics', 'Digital electronics', 'Core', 0),
  ('analog-circuits', 'Analog circuits', 'Core', 1),
  ('embedded-c', 'Embedded C', 'Core', 2),
  ('control-systems', 'Control systems', 'Core', 3),
  ('thermodynamics', 'Thermodynamics', 'Core', 4),
  ('strength-of-materials', 'Strength of materials', 'Core', 5),
  ('machine-design', 'Machine design', 'Core', 6),
  ('manufacturing-processes', 'Manufacturing processes', 'Core', 7),
  ('puzzles', 'Puzzles', 'Other', 0),
  ('projects-resume', 'Projects & resume', 'Other', 1),
  ('behavioral', 'Behavioral', 'Other', 2),
  ('cloud-devops', 'Cloud & DevOps', 'Other', 3),
  ('machine-learning', 'Machine learning', 'Other', 4),
  ('statistics', 'Statistics', 'Other', 5),
  ('finance-basics', 'Finance basics', 'Other', 6),
  ('guesstimates', 'Guesstimates', 'Other', 7)
on conflict (id) do nothing;

insert into public.companies (name, slug, industry, website, description, description_source, is_verified) values
  ('Zoho Corporation', 'zoho-corporation', 'Software', 'zoho.com', 'Chennai-headquartered SaaS company building business software across CRM, finance, collaboration and IT management.', 'admin_curated', true),
  ('Amazon', 'amazon', 'E-commerce & Cloud', 'amazon.jobs', 'Global e-commerce and cloud computing company. Campus hiring is mainly for SDE roles.', 'admin_curated', true),
  ('Microsoft', 'microsoft', 'Software', 'careers.microsoft.com', 'Technology company building operating systems, productivity software and cloud services.', 'admin_curated', true),
  ('Bosch Global Software Technologies', 'bosch-global-software-technologies', 'Automotive & Embedded', 'bosch-softwaretechnologies.com', 'Engineering and IT services arm of Bosch, with large teams in Coimbatore and Bengaluru.', 'admin_curated', true),
  ('Freshworks', 'freshworks', 'Software', 'freshworks.com', 'SaaS company building customer and employee engagement software, with major engineering in Chennai.', 'admin_curated', true),
  ('PayPal', 'paypal', 'Fintech', 'paypal.com/careers', 'Digital payments company with a large technology centre in Chennai.', 'admin_curated', true),
  ('Texas Instruments', 'texas-instruments', 'Semiconductors', 'careers.ti.com', 'Semiconductor company designing analog and embedded processing chips.', 'admin_curated', true),
  ('Caterpillar', 'caterpillar', 'Heavy machinery', 'caterpillar.com/careers', 'Manufacturer of construction and mining equipment, engines and turbines, with an engineering centre in Chennai.', 'admin_curated', true),
  ('Tata Consultancy Services', 'tata-consultancy-services', 'IT services', 'tcs.com/careers', 'IT services and consulting company. Hires at scale through national tests and campus drives.', 'admin_curated', true),
  ('Goldman Sachs', 'goldman-sachs', 'Finance', 'goldmansachs.com/careers', 'Investment bank whose engineering division builds trading, risk and platform systems.', 'admin_curated', true),
  ('Deloitte', 'deloitte', 'Consulting', 'deloitte.com/careers', 'Professional services firm. Campus roles include analyst and consulting tracks.', 'admin_curated', true),
  ('Cisco', 'cisco', 'Networking', 'jobs.cisco.com', 'Networking and security company. Campus roles span software and hardware engineering.', 'admin_curated', true),
  ('Walmart Global Tech', 'walmart-global-tech', 'Retail technology', 'careers.walmart.com', 'Technology organisation behind Walmart’s retail, supply-chain and e-commerce platforms.', 'admin_curated', true),
  ('Oracle', 'oracle', 'Software', 'oracle.com/careers', 'Enterprise software company known for databases and cloud infrastructure.', 'admin_curated', true),
  ('L&T Technology Services', 'l-t-technology-services', 'Engineering services', 'ltts.com/careers', 'Engineering R&D services company working across mobility, industrial and medical domains.', 'admin_curated', true),
  ('Chargebee', 'chargebee', 'Software', 'chargebee.com/careers', 'Subscription billing and revenue management SaaS company based in Chennai.', 'admin_curated', true),
  ('Kissflow', 'kissflow', 'Software', 'kissflow.com', null, null, false),
  ('Siemens Healthineers', 'siemens-healthineers', 'Medical technology', 'siemens-healthineers.com/careers', 'Medical technology company building imaging, diagnostics and healthcare IT products.', 'admin_curated', true)
on conflict (slug) do nothing;

insert into public.company_aliases (company_id, alias)
select c.id, a.alias from (values
  ('zoho-corporation', 'Zoho'),
  ('bosch-global-software-technologies', 'Bosch'),
  ('bosch-global-software-technologies', 'BGSW'),
  ('bosch-global-software-technologies', 'RBEI'),
  ('texas-instruments', 'TI'),
  ('tata-consultancy-services', 'TCS'),
  ('tata-consultancy-services', 'TCS Digital'),
  ('tata-consultancy-services', 'TCS Ninja'),
  ('l-t-technology-services', 'LTTS')
) as a(slug, alias) join public.companies c on c.slug = a.slug
on conflict do nothing;
