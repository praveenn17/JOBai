/**
 * ATS Knowledge Base
 * Comprehensive reference used to strengthen all AI prompts
 * Covers: ATS mechanics, keyword strategies, formatting rules, scoring signals
 */

const ATS_SYSTEM_KNOWLEDGE = `
## HOW ATS SYSTEMS WORK (Critical Knowledge)
- ATS (Applicant Tracking Systems) parse resumes and score them against job descriptions.
- Most top companies use: Workday, Greenhouse, Lever, Taleo, iCIMS, BambooHR, Jobvite, SmartRecruiters, Bullhorn, Brassring.
- ATS scoring algorithms evaluate: keyword density, hard skills match, title alignment, years of experience, education credentials, and recency.
- ATS CANNOT reliably parse: complex tables, images, graphical elements, headers/footers, text boxes, dual-column layouts, embedded icons.
- ATS READS BEST: clean single-column plain text, standard section headings, bulleted accomplishments, standard fonts.

## COMMON ATS RED FLAGS (Instant Disqualifiers & Parsing Failures)
1. Tables and Multi-Column Layouts: Text gets scrambled horizontally across columns into meaningless strings.
2. Headers and Footers: Contact details placed in header/footer areas are frequently dropped completely.
3. Images, Icons, Logos, and Graphics: Invisible to OCR scanners and cause document parsing crashes.
4. Non-Standard / Decorative Fonts: Fonts like Comic Sans, Papyrus, script, or non-system fonts become corrupted glyphs.
5. Missing Standard Sections: Missing standard "Work Experience", "Skills", or "Education" headers confuses parsing schemas.
6. Text Boxes and Callouts: Text boxes are treated as background objects and ignored by parsers.
7. Non-Standard Bullet Symbols: Arrowheads, custom icons, or emojis fail parsing; use standard round bullets (•) or hyphens (-).
8. White Font Keyword Stuffing: Modern ATS algorithms detect and automatically blacklist invisible/white text keyword stuffing.
9. Ambiguous Dates: Formats like "2021-2022" without months make it impossible for ATS to calculate years of experience.
10. Unrecognized File Formats: Formats other than clean PDF or standard DOCX are rejected.

## ATS FORMATTING RULES (Mandatory Technical Requirements)
- Layout: 100% single column from top to bottom.
- Margins: Standard 0.5 inch to 1.0 inch margins on all sides.
- Fonts: Arial, Calibri, Helvetica, Georgia, Times New Roman, or Garamond (10-12pt for body text, 14-18pt for section titles).
- Section Headings: Explicit, recognizable headings: "PROFESSIONAL SUMMARY", "TECHNICAL SKILLS", "WORK EXPERIENCE", "PROJECTS", "EDUCATION", "CERTIFICATIONS".
- Date Formatting: Consistent "Month Year – Month Year" (e.g., "Jan 2022 – Present" or "05/2021 – 08/2023").
- Contact Information: In document body at the top: Full Name, Email, Phone Number, City/State/Country, LinkedIn URL, GitHub URL/Portfolio.
- Bullet Structure: Action Verb + Task Context + Metric/Result (e.g., "Architected distributed caching layer with Redis, reducing API latency by 45%").

## HIGH-IMPACT ACTION VERBS THAT SCORE WELL IN ATS
- Engineering & Development: Engineered, Architected, Developed, Deployed, Automated, Refactored, Integrated, Programmed, Constructed, Standardized, Containerized.
- Optimization & Performance: Optimized, Accelerated, Streamlined, Scaled, Enhanced, Reduced, Boosted, Minimized, Doubled, Upgraded.
- Leadership & Direction: Led, Spearheaded, Mentored, Directed, Championed, Supervised, Coordinated, Mobilized, Orchestrated, Guided.
- Analytics & Research: Analyzed, Modeled, Evaluated, Quantified, Audited, Benchmarked, Forecasted, Formulated, Discovered, Validated.
- Product & Strategy: Launched, Designed, Conceptualized, Executed, Delivered, Prioritized, Negotiated, Cultivated, Negotiated, Established.

## HIGH-VALUE ATS KEYWORDS BY ROLE (10 Major Role Categories)

### 1. Software Engineer
Languages: Python, JavaScript, TypeScript, Java, C++, Go, Rust, SQL, C#, Ruby, PHP, Swift, Kotlin
Frameworks: React.js, Next.js, Node.js, Express.js, Spring Boot, Django, Flask, FastAPI, Angular, Vue.js
Architecture & Core: REST APIs, GraphQL, Microservices, Distributed Systems, Data Structures, Algorithms, Object-Oriented Design, System Design, Concurrency, Multithreading
Databases: PostgreSQL, MySQL, MongoDB, Redis, Cassandra, DynamoDB, Elasticsearch, SQLite
DevOps & Cloud: Docker, Kubernetes, AWS (EC2, S3, Lambda), GCP, Azure, CI/CD, GitHub Actions, Linux, Git, Unit Testing, Jest, TDD

### 2. Product Manager
Strategy & Execution: Product Roadmap, Product Lifecycle (PLC), User Stories, Feature Prioritization, MVP, Go-To-Market (GTM) Strategy, Agile, Scrum, Kanban, Sprint Planning
Metrics & Analytics: KPIs, OKRs, Conversion Funnel, Customer Acquisition Cost (CAC), Lifetime Value (LTV), Monthly Active Users (MAU), Daily Active Users (DAU), Net Promoter Score (NPS), Churn Rate, Retention Rate
Research & Discovery: User Research, Wireframing, User Personas, Customer Journey Mapping, Competitive Analysis, Usability Testing, Voice of Customer (VoC)
Tools: Jira, Confluence, Figma, Miro, Productboard, Mixpanel, Amplitude, Google Analytics, Pendo, Linear

### 3. Data Scientist
Core Competencies: Machine Learning, Deep Learning, Natural Language Processing (NLP), Computer Vision, Statistical Modeling, Predictive Analytics, Hypothesis Testing, A/B Testing, Time Series Analysis
Languages: Python, R, SQL, Scala, SAS, Julia
Libraries & Frameworks: TensorFlow, PyTorch, scikit-learn, pandas, NumPy, SciPy, Keras, XGBoost, LightGBM, NLTK, Spacy, HuggingFace
Data Engineering & Big Data: Apache Spark, Hadoop, Apache Kafka, ETL Pipelines, Data Warehousing, Snowflake, Databricks, BigQuery
Visualization & Tools: Tableau, Power BI, Matplotlib, Seaborn, Plotly, Jupyter Notebooks, Docker, MLflow, Airflow

### 4. Designer (UI/UX & Product Design)
Design Systems & UI: Design Systems, Atomic Design, User Interface (UI) Design, Responsive Design, Design Tokens, Typography, Color Theory, Visual Hierarchy, Accessibility (WCAG 2.1)
UX Methodologies: User Experience (UX) Research, Information Architecture (IA), Wireframing, Interactive Prototyping, Usability Testing, Heuristic Evaluation, User Flows, Persona Development, Journey Mapping
Product Strategy: Design Sprints, Mobile-First Design, Empathy Mapping, Rapid Iteration, Stakeholder Alignment
Tools: Figma, Adobe XD, Sketch, InVision, Principle, Framer, FigJam, Zeplin, Adobe Photoshop, Adobe Illustrator

### 5. Marketing (Digital & Growth Marketing)
Digital Channels: Search Engine Optimization (SEO), Search Engine Marketing (SEM), Pay-Per-Click (PPC), Content Marketing, Social Media Marketing, Email Marketing, Influencer Marketing, Affiliate Marketing
Performance Metrics: Customer Acquisition Cost (CAC), Return on Ad Spend (ROAS), Return on Investment (ROI), Click-Through Rate (CTR), Cost Per Click (CPC), Cost Per Acquisition (CPA), Bounce Rate, Conversion Rate Optimization (CRO), Organic Traffic
Growth & Analytics: Marketing Automation, A/B Testing, Multi-Touch Attribution, Lead Generation, Marketing Funnel, Lifecycle Marketing, Retention Strategy
Tools: Google Analytics 4 (GA4), Google Tag Manager, Google Ads, Meta Ads Manager, HubSpot, Marketo, Mailchimp, SEMrush, Ahrefs, Salesforce Marketing Cloud

### 6. Sales (Account Executive & Business Development)
Core Competencies: B2B Sales, Enterprise Sales, Full Sales Cycle, Solution Selling, Consultative Selling, Value Proposition, Lead Qualification, Cold Outreach, Prospecting, Pipeline Management
Deal Closing: Contract Negotiation, Objection Handling, Closing Techniques, RFP/RFI Response, Deal Structuring, Executive Presentations, C-Level Engagement
Revenue Metrics: Quota Attainment, Annual Recurring Revenue (ARR), Monthly Recurring Revenue (MRR), Average Deal Size, Sales Velocity, Customer Retention, Win Rate, Gross Margin
Tools & Frameworks: Salesforce, HubSpot CRM, LinkedIn Sales Navigator, Outreach.io, SalesLoft, ZoomInfo, MEDDIC, BANT, SPIN Selling

### 7. Finance (Financial Analyst & Accounting)
Financial Analysis: Financial Modeling, DCF Modeling, Budgeting, Forecasting, Variance Analysis, Scenario Planning, Capital Budgeting, Sensitivity Analysis, Valuation
Accounting & Reporting: GAAP, IFRS, General Ledger, Balance Sheet, Income Statement, Cash Flow Statement, Month-End Close, Reconciliations, Financial Reporting, Internal Controls, SOX Compliance
Corporate Finance: Mergers & Acquisitions (M&A), Due Diligence, Working Capital Management, Cost Accounting, Risk Management, Treasury, Cap Table Management
Tools: Advanced Excel (VLOOKUP, INDEX/MATCH, Pivot Tables, Macros, VBA), SAP, NetSuite, Oracle Hyperion, QuickBooks, Bloomberg Terminal, FactSet, Power BI

### 8. Operations (Operations Management & Supply Chain)
Process & Optimization: Process Improvement, Continuous Improvement, Lean Manufacturing, Six Sigma (DMAIC), Workflow Optimization, Standard Operating Procedures (SOP), Change Management, Root Cause Analysis
Supply Chain & Logistics: Supply Chain Management (SCM), Procurement, Vendor Management, Inventory Management, Logistics Optimization, Demand Forecasting, Quality Assurance (QA), ERP Systems
Operations Strategy: Resource Allocation, Capacity Planning, Operational Excellence, Service Level Agreements (SLA), Cost Reduction, Risk Mitigation, Cross-Functional Leadership
Tools: SAP ERP, Oracle SCM, Microsoft Dynamics, Jira, Asana, Tableau, Excel Modeling, Minitab, Smartsheet

### 9. HR (Human Resources & Talent Acquisition)
Talent Acquisition: Full-Cycle Recruiting, Candidate Sourcing, Technical Recruiting, Interviewing, Offer Negotiation, Onboarding, Employer Branding, Candidate Experience
HR Management: Employee Relations, Performance Management, Talent Management, Employee Engagement, Retention Strategies, HR Policies, Compliance, Offboarding
Compensation & Benefits: Compensation Benchmarking, Total Rewards, Benefits Administration, Payroll, HRIS Management, Succession Planning, Diversity Equity & Inclusion (DEI)
Tools: Workday, Greenhouse, Lever, BambooHR, ADP, Namely, LinkedIn Recruiter, Culture Amp, Lattice, Paychex

### 10. DevOps & Cloud Engineering
Infrastructure as Code (IaC): Terraform, CloudFormation, Ansible, Puppet, Chef, Pulumi
Containerization & Orchestration: Docker, Kubernetes (K8s), Helm, Docker Swarm, Container Security
Cloud Platforms: AWS (EKS, ECS, VPC, IAM, CloudWatch, Route53), Google Cloud Platform (GCP, GKE), Microsoft Azure (AKS)
CI/CD & Automation: Jenkins, GitHub Actions, GitLab CI/CD, CircleCI, ArgoCD, Spinnaker, Automated Testing Pipelines
Monitoring & Observability: Prometheus, Grafana, ELK Stack (Elasticsearch, Logstash, Kibana), Datadog, Splunk, New Relic, OpenTelemetry, Incident Response, SRE Principles
`;

const ATS_SCORING_WEIGHTS = {
  keyword_density: 0.35,
  experience_match: 0.25,
  education_match: 0.15,
  achievements_metrics: 0.15,
  formatting_clarity: 0.10
};

const INDUSTRY_KEYWORDS = {
  software_engineer: [
    'Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'SQL', 'React.js', 'Next.js', 'Node.js',
    'Express.js', 'Spring Boot', 'REST APIs', 'GraphQL', 'Microservices', 'PostgreSQL', 'MongoDB',
    'Redis', 'Docker', 'Kubernetes', 'AWS', 'CI/CD', 'Git', 'Data Structures', 'Algorithms'
  ],
  product_manager: [
    'Product Roadmap', 'Agile', 'Scrum', 'User Stories', 'Feature Prioritization', 'Product Lifecycle',
    'Go-To-Market', 'KPIs', 'OKRs', 'Conversion Funnel', 'A/B Testing', 'Stakeholder Management',
    'User Research', 'Wireframing', 'Jira', 'Confluence', 'Figma', 'Mixpanel', 'Amplitude', 'Customer Journey'
  ],
  data_scientist: [
    'Python', 'R', 'SQL', 'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'TensorFlow',
    'PyTorch', 'scikit-learn', 'pandas', 'NumPy', 'Statistical Modeling', 'Predictive Analytics',
    'A/B Testing', 'Apache Spark', 'Snowflake', 'BigQuery', 'Tableau', 'Power BI', 'ETL'
  ],
  designer: [
    'UI Design', 'UX Research', 'Design Systems', 'Figma', 'Adobe XD', 'Wireframing', 'Prototyping',
    'User Flows', 'Information Architecture', 'Usability Testing', 'Responsive Design', 'Visual Hierarchy',
    'Typography', 'Accessibility', 'WCAG', 'Interaction Design', 'Atomic Design', 'Sketch', 'Framer', 'Micro-interactions'
  ],
  marketing: [
    'SEO', 'SEM', 'PPC', 'Content Marketing', 'Email Marketing', 'Google Analytics', 'Google Ads',
    'HubSpot', 'Conversion Rate Optimization', 'CRO', 'Growth Marketing', 'Social Media Marketing',
    'A/B Testing', 'ROAS', 'CAC', 'Lead Generation', 'Marketing Automation', 'Copywriting', 'SEMrush', 'Mailchimp'
  ],
  sales: [
    'B2B Sales', 'Enterprise Sales', 'Lead Generation', 'Pipeline Management', 'Cold Calling',
    'Cold Outreach', 'Prospecting', 'Account Management', 'Negotiation', 'Closing Deals',
    'Salesforce', 'CRM', 'Quota Attainment', 'ARR', 'MRR', 'Value Selling', 'MEDDIC', 'BANT', 'Client Retention', 'Consultative Selling'
  ],
  finance: [
    'Financial Modeling', 'DCF', 'Forecasting', 'Budgeting', 'Variance Analysis', 'Financial Reporting',
    'GAAP', 'IFRS', 'General Ledger', 'Auditing', 'Month-End Close', 'Cash Flow Analysis',
    'Valuation', 'M&A', 'Due Diligence', 'Advanced Excel', 'SAP', 'NetSuite', 'SOX Compliance', 'Risk Management'
  ],
  operations: [
    'Process Improvement', 'Operations Management', 'Supply Chain', 'Lean Manufacturing', 'Six Sigma',
    'Workflow Optimization', 'SOP Development', 'Root Cause Analysis', 'Vendor Management', 'Procurement',
    'Logistics', 'Inventory Control', 'ERP', 'Quality Assurance', 'Resource Allocation', 'Capacity Planning', 'Change Management', 'SLA Management', 'Cost Optimization', 'Continuous Improvement'
  ],
  hr: [
    'Talent Acquisition', 'Recruiting', 'Candidate Sourcing', 'Interviewing', 'Onboarding',
    'Employee Relations', 'Performance Management', 'HR Compliance', 'HRIS', 'Workday',
    'Greenhouse', 'Compensation Benchmarking', 'Benefits Administration', 'Employee Engagement', 'Retention', 'DEI', 'Labor Laws', 'Succession Planning', 'HR Policies', 'Offboarding'
  ],
  devops: [
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'CI/CD', 'GitHub Actions',
    'Jenkins', 'Ansible', 'Linux', 'Bash', 'Infrastructure as Code', 'Prometheus', 'Grafana',
    'Helm', 'Microservices', 'Site Reliability Engineering', 'SRE', 'Observability', 'GitOps'
  ],
  general: [
    'Leadership', 'Communication', 'Problem Solving', 'Project Management', 'Cross-Functional Collaboration',
    'Critical Thinking', 'Adaptability', 'Time Management', 'Stakeholder Communication', 'Conflict Resolution'
  ]
};

const APPLY_TIMING = {
  optimal_hours: [9, 10, 11, 14, 15],  // 9am-11am and 2pm-4pm local time
  optimal_days: ['Tuesday', 'Wednesday', 'Thursday'],
  apply_within_hours: 48,  // Jobs posted < 48h ago get 4x more views
  follow_up_days: 7
};

/**
 * Returns the full ATS knowledge base formatted for system prompt injection.
 */
function getAtsContext() {
  return ATS_SYSTEM_KNOWLEDGE.trim();
}

module.exports = {
  ATS_SYSTEM_KNOWLEDGE,
  ATS_SCORING_WEIGHTS,
  INDUSTRY_KEYWORDS,
  APPLY_TIMING,
  getAtsContext,
};

