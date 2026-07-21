require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3019;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize SQLite
const db = new Database('./study_pro.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS usage (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL,
    date TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    UNIQUE(ip, date)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    email TEXT,
    plan TEXT,
    amount INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subscribers (
    id TEXT PRIMARY KEY,
    stripe_session_id TEXT UNIQUE,
    email TEXT,
    plan TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

const openai = new OpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Exam metadata
const EXAMS = [
  { id: 'sat', name: 'SAT', category: 'US Standardized Tests', icon: '📐', description: 'College admissions, 1600 score', topics: ['Algebra', 'Geometry', 'Statistics', 'Advanced Math', 'Reading Comprehension', 'Grammar & Writing'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'lsat', name: 'LSAT', category: 'US Standardized Tests', icon: '⚖️', description: 'Law school, logic games + reasoning', topics: ['Logic Games', 'Logical Reasoning', 'Reading Comprehension'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: true },
  { id: 'gre', name: 'GRE', category: 'US Standardized Tests', icon: '🎓', description: 'Grad school, verbal + quant + writing', topics: ['Verbal Reasoning', 'Quantitative Reasoning', 'Analytical Writing'], questionTypes: ['multiple_choice', 'essay'], supportsMockInterview: false, supportsEssayGrading: true },
  { id: 'gmat', name: 'GMAT', category: 'US Standardized Tests', icon: '📊', description: 'Business school', topics: ['Data Insights', 'Quantitative', 'Verbal'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'nclex', name: 'NCLEX', category: 'Medical & Nursing', icon: '🏥', description: 'Nursing license exam — Next Generation NCLEX (NGN) format', topics: ['Pharmacology', 'Medical-Surgical', 'Maternal Newborn', 'Pediatrics', 'Mental Health', 'Leadership'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'usmle1', name: 'USMLE Step 1', category: 'Medical & Nursing', icon: '🩺', description: 'US Medical License - Basic Sciences', topics: ['Pathology', 'Pharmacology', 'Physiology', 'Biochemistry', 'Microbiology', 'Anatomy'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'mckinsey', name: 'McKinsey/BCG Case', category: 'Career Interviews', icon: '💼', description: 'AI plays interviewer, real case simulation', topics: ['Market Sizing', 'Profitability', 'Market Entry', 'M&A', 'Operations'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'ib', name: 'Investment Banking', category: 'Career Interviews', icon: '🏦', description: 'DCF, LBO, valuation Q&A', topics: ['DCF Valuation', 'LBO Model', 'Comparable Analysis', 'M&A Concepts', 'Technical Questions'], questionTypes: ['multiple_choice', 'open_answer'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'coding', name: 'Google/Meta Coding', category: 'Career Interviews', icon: '💻', description: 'LeetCode-style with AI explanation', topics: ['Arrays', 'Strings', 'Trees', 'Dynamic Programming', 'System Design'], questionTypes: ['coding'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'google_behavioral', name: 'Google Behavioral', category: 'Career Interviews', icon: '🔍', description: 'Googleyness & Leadership — AI plays interviewer', topics: ['Leadership & Influence', 'Conflict Resolution', 'Ambiguity & Problem Solving', 'Collaboration', 'Innovation'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'amazon_lp', name: 'Amazon LP Interview', category: 'Career Interviews', icon: '📦', description: '16 Leadership Principles with STAR method coaching', topics: ['Customer Obsession', 'Ownership', 'Invent & Simplify', 'Bias for Action', 'Deliver Results', 'Earn Trust', 'Think Big'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'civil', name: 'Civil Service Interview', category: 'Career Interviews', icon: '🏛️', description: 'Structured behavioral questions', topics: ['Situational Judgment', 'Behavioral', 'Policy Analysis'], questionTypes: ['open_answer'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'shenlun', name: '申论批改', category: 'Chinese Exams', icon: '📝', description: 'Upload your essay, get scored in 60 seconds', topics: ['综合分析', '提出对策', '大作文'], questionTypes: ['essay'], supportsMockInterview: false, supportsEssayGrading: true },
  { id: 'xingce', name: '公务员行测', category: 'Chinese Exams', icon: '🧮', description: 'AI generates practice questions', topics: ['言语理解', '数量关系', '判断推理', '资料分析', '常识判断'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'mianshi', name: '公务员面试', category: 'Chinese Exams', icon: '🎤', description: 'AI模拟考官追问', topics: ['自我介绍', '情景模拟', '综合分析', '计划组织', '人际关系'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'topik', name: 'TOPIK', category: 'Language Exams', icon: '🇰🇷', description: 'Korean proficiency exam', topics: ['Vocabulary', 'Grammar', 'Reading', 'Writing'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'jlpt', name: 'JLPT', category: 'Language Exams', icon: '🇯🇵', description: 'Japanese language proficiency', topics: ['Vocabulary', 'Grammar', 'Reading', 'Listening Comprehension'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'ielts', name: 'IELTS/TOEFL', category: 'Language Exams', icon: '🌍', description: 'English proficiency', topics: ['Reading', 'Writing', 'Speaking', 'Listening'], questionTypes: ['multiple_choice', 'essay'], supportsMockInterview: false, supportsEssayGrading: true },
  { id: 'dele', name: 'DELE', category: 'Language Exams', icon: '🇪🇸', description: 'Spanish language certification', topics: ['Vocabulary', 'Reading', 'Writing', 'Oral Expression'], questionTypes: ['multiple_choice'], supportsMockInterview: false, supportsEssayGrading: false },
  { id: 'ielts_speaking', name: 'IELTS Speaking', category: 'Language Exams', icon: '🎙️', description: 'IELTS Part 1/2/3 speaking practice with AI examiner', topics: ['Part 1: Personal Questions', 'Part 2: Long Turn (Cue Card)', 'Part 3: Discussion'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'toefl_speaking', name: 'TOEFL Speaking', category: 'Language Exams', icon: '🗣️', description: 'TOEFL integrated & independent speaking tasks', topics: ['Task 1: Independent', 'Task 2: Campus Situation', 'Task 3: Academic Reading', 'Task 4: Academic Lecture'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'ket_pet', name: 'KET/PET', category: 'Kids English', icon: '🌟', description: 'Cambridge A2/B1 for young learners', topics: ['Reading & Writing', 'Listening', 'Speaking', 'Vocabulary'], questionTypes: ['multiple_choice'], supportsMockInterview: true, supportsEssayGrading: false },
  { id: 'kids_speaking', name: 'Kids English Speaking', category: 'Kids English', icon: '👧', description: 'Elementary school English speaking practice', topics: ['Self Introduction', 'Daily Life', 'School & Friends', 'Animals & Nature', 'Hobbies'], questionTypes: ['interview'], supportsMockInterview: true, supportsEssayGrading: false },
];

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '127.0.0.1';
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getUsageCount(ip) {
  const row = db.prepare('SELECT count FROM usage WHERE ip = ? AND date = ?').get(ip, getTodayStr());
  return row ? row.count : 0;
}

function incrementUsage(ip) {
  db.prepare(`
    INSERT INTO usage (id, ip, date, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(ip, date) DO UPDATE SET count = count + 1
  `).run(uuidv4(), ip, getTodayStr());
}

function buildSystemPrompt(exam_type, topic, difficulty) {
  switch (exam_type) {
    case 'sat':
      return `You are an expert SAT tutor. Generate a realistic SAT Math or Reading question.\nDifficulty: ${difficulty}\nTopic: ${topic}\nFormat: Multiple choice with 4 options (A-D)\nReturn ONLY valid JSON (no markdown, no code blocks): {"question": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "correct_answer": "A", "explanation": "...", "concept_tested": "...", "common_mistake": "..."}`;
    case 'lsat':
      return `You are an LSAT expert. Generate a complete LSAT logic games or logical reasoning question.\nDifficulty: ${difficulty}\nTopic: ${topic}\nReturn ONLY valid JSON (no markdown): {"scenario": "...", "constraints": ["..."], "question": "...", "options": {"A":"...","B":"...","C":"...","D":"...","E":"..."}, "correct_answer": "A", "explanation": "..."}`;
    case 'gre':
      return `You are a GRE expert tutor. Generate a GRE-style question.\nSection: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "question_type": "verbal", "options": {"A":"...","B":"...","C":"...","D":"...","E":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary_tip": "..."}`;
    case 'gmat':
      return `You are a GMAT expert. Generate a practice question.\nSection: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "options": {"A":"...","B":"...","C":"...","D":"...","E":"..."}, "correct_answer": "A", "explanation": "...", "strategy": "..."}`;
    case 'nclex':
      return `You are an expert NCLEX-RN question writer trained on the 2023 Next Generation NCLEX (NGN) format.
Generate a realistic clinical scenario question following NCSBN Clinical Judgment Model.

CRITICAL RULES:
1. Always use a realistic clinical scenario (patient name, age, diagnosis, vitals, context)
2. Use the NGN format: clinical scenario → focused question → 4 options
3. Distractors must be plausible but wrong for a specific reason
4. Cover the 6 cognitive skills: Recognize Cues, Analyze Cues, Prioritize Hypotheses, Generate Solutions, Take Action, Evaluate Outcomes
5. Include rationale for ALL 4 options (why correct AND why each wrong option is wrong)
6. Topics rotate through: Pharmacology, Med-Surg, Maternal-Newborn, Pediatrics, Mental Health, Leadership/Management

For difficulty levels:
- Beginner: single-system, straightforward priority
- Intermediate: multi-system, requires analysis
- Advanced: complex clinical judgment, safety-critical

Topic: ${topic}, Difficulty: ${difficulty}

Return ONLY valid JSON (no markdown, no code blocks):
{"scenario": "68-year-old male admitted with...", "question": "Which action should the nurse take FIRST?", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "correct": "C", "rationales": {"A": "Incorrect because...", "B": "Incorrect because...", "C": "CORRECT: This is the priority because...", "D": "Incorrect because..."}, "nursing_concept": "Airway/Breathing/Circulation priority", "cognitive_skill": "Prioritize Hypotheses"}`;
    case 'usmle1':
      return `You are an expert USMLE Step 1 question writer with deep knowledge of basic medical sciences.
Generate a clinical vignette question in authentic USMLE format.

CRITICAL RULES:
1. Write 1-2 paragraphs of rich patient vignette (age, sex, presenting complaint, HPI, PMH, vitals, physical exam findings, lab values where relevant)
2. Single best answer from 5 options (A-E)
3. Distractors must represent common misconceptions or related but incorrect pathophysiology
4. Rationale must explain the underlying pathophysiology of the correct answer
5. Each wrong answer rationale must explain why that answer is incorrect (not just "wrong")
6. Topics: ${topic}

Difficulty: ${difficulty}

Return ONLY valid JSON (no markdown, no code blocks):
{"scenario": "A 45-year-old woman presents with...", "question": "Which of the following best explains the mechanism of this patient's symptoms?", "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "..."}, "correct": "B", "rationales": {"A": "Incorrect: ...", "B": "CORRECT: The pathophysiology here is...", "C": "Incorrect: ...", "D": "Incorrect: ...", "E": "Incorrect: ..."}, "concept": "Mechanism of disease", "system": "Cardiovascular"}`;
    case 'mckinsey':
      return `You are a McKinsey interviewer. Generate a business case interview opening.\nIndustry/Type: ${topic}\nReturn ONLY valid JSON (no markdown): {"case_title": "...", "industry": "...", "situation": "...", "opening_question": "...", "hints": ["..."], "framework_expected": "..."}`;
    case 'ib':
      return `You are a Wall Street investment banking interviewer. Generate a technical interview question.\nTopic: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "category": "...", "model_answer": "...", "key_points": ["..."], "follow_up": "..."}`;
    case 'coding':
      return `You are a technical interviewer at Google. Generate a coding problem.\nTopic: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"title": "...", "difficulty": "...", "description": "...", "examples": [{"input": "...", "output": "..."}], "constraints": ["..."], "optimal_approach": "...", "time_complexity": "...", "space_complexity": "...", "starter_code": "..."}`;
    case 'civil':
      return `You are a civil service interview panelist. Generate a structured behavioral interview question.\nArea: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "context": "...", "model_answer": "...", "key_competencies": ["..."], "follow_up": "..."}`;
    case 'shenlun':
      return `你是国家公务员考试申论命题专家。生成一道申论练习题。\n题型：${topic}\n只返回JSON（不要markdown）：{"prompt": "...", "material": "...", "task": "...", "word_count": "800字以内", "score": 30}`;
    case 'xingce':
      return `你是公务员考试专家。生成一道行测题目。\n科目：${topic}，难度：${difficulty}\n只返回JSON（不要markdown）：{"题目": "...", "选项": {"A":"...","B":"...","C":"...","D":"..."}, "正确答案": "A", "解析": "...", "考点": "..."}`;
    case 'mianshi':
      return `你是公务员面试考官。生成一道面试练习题。\n题型：${topic}\n只返回JSON（不要markdown）：{"question": "...", "context": "...", "evaluation_points": ["..."], "model_answer": "..."}`;
    case 'topik':
      return `You are an expert TOPIK examiner. Generate a practice question.\nSkill: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "question_type": "multiple_choice", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary": ["key words"]}`;
    case 'jlpt':
      return `You are an expert JLPT examiner. Generate a practice question.\nSkill: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "question_type": "multiple_choice", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary": ["key words"]}`;
    case 'ielts':
      return `You are an expert IELTS/TOEFL examiner. Generate a practice question.\nSkill: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "question_type": "multiple_choice", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary": ["key words"]}`;
    case 'dele':
      return `You are an expert DELE examiner. Generate a practice question.\nSkill: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "question_type": "multiple_choice", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary": ["key words"]}`;
    case 'ielts_speaking':
      return `You are an experienced IELTS examiner conducting a speaking practice session. Topic: ${topic}.
Generate a realistic IELTS speaking prompt with model answer structure.
Return ONLY valid JSON (no markdown): {"part": "Part 2", "prompt": "Describe a place you like to visit. You should say: where it is / what it looks like / what you do there / and explain why you like it.", "preparation_time": "1 minute", "speaking_time": "2 minutes", "sample_answer_points": ["Point 1...", "Point 2...", "Point 3..."], "useful_phrases": ["Firstly...", "What I particularly like is..."], "band_7_tips": "Use complex sentences and varied vocabulary..."}`;
    case 'toefl_speaking':
      return `You are a TOEFL speaking coach. Topic: ${topic}.
Generate a TOEFL speaking task with full instructions.
Return ONLY valid JSON (no markdown): {"task_number": 1, "task_type": "Independent", "question": "Some people prefer to live in cities. Others prefer to live in rural areas. Which do you prefer and why?", "preparation_time": "15 seconds", "response_time": "45 seconds", "scoring_criteria": ["Delivery", "Language Use", "Topic Development"], "sample_response_outline": ["Opening statement...", "Reason 1 with example...", "Reason 2 with example...", "Conclusion..."], "key_phrases": ["In my opinion...", "For instance..."]}`;
    case 'ket_pet':
      return `You are a Cambridge KET/PET examiner. Generate a practice question for ${topic}, difficulty ${difficulty}.
Keep language age-appropriate for young learners (10-16 years).
Return ONLY valid JSON (no markdown): {"question": "...", "question_type": "multiple_choice", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "...", "vocabulary": ["key words"], "tip": "Remember to..."}`;
    case 'kids_speaking':
      return `You are a friendly English teacher for elementary school children (ages 6-12). Topic: ${topic}.
Generate a fun, encouraging speaking practice question. Use simple vocabulary.
Return ONLY valid JSON (no markdown): {"question": "Can you tell me about your favorite animal?", "example_answer": "My favorite animal is a dog because...", "vocabulary_help": ["favorite - 最喜欢的", "because - 因为"], "follow_up_questions": ["What does it eat?", "Where does it live?"], "encouragement": "Great job! You're doing amazing!", "difficulty": "${difficulty}"}`;
    default:
      return `You are an expert exam tutor. Generate a practice question for ${exam_type}.\nTopic: ${topic}, Difficulty: ${difficulty}\nReturn ONLY valid JSON (no markdown): {"question": "...", "options": {"A":"...","B":"...","C":"...","D":"..."}, "correct_answer": "A", "explanation": "..."}`;
  }
}

async function callAI(systemPrompt, userMessage) {
  const response = await openai.chat.completions.create({
    model: 'deepseek-chat',
    max_tokens: 2048,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage || 'Generate the question now.' },
    ],
  });
  return response.choices[0].message.content;
}

function parseJSON(text) {
  // Strip markdown code fences if present
  const cleaned = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  return JSON.parse(cleaned);
}

// Routes

app.get('/api/exams', (req, res) => {
  res.json(EXAMS);
});

app.get('/api/usage', (req, res) => {
  const ip = getClientIP(req);
  const used = getUsageCount(ip);
  res.json({ used, limit: 5, remaining: Math.max(0, 5 - used) });
});

app.post('/api/generate-question', async (req, res) => {
  const ip = getClientIP(req);
  const used = getUsageCount(ip);
  if (used >= 5) {
    return res.status(429).json({ error: 'rate_limit', message: 'Daily limit reached. Upgrade to Pro for unlimited practice.' });
  }

  const { exam_type, topic, difficulty = 'Intermediate' } = req.body;
  if (!exam_type || !topic) {
    return res.status(400).json({ error: true, message: 'exam_type and topic are required' });
  }

  const systemPrompt = buildSystemPrompt(exam_type, topic, difficulty);

  let text;
  try {
    text = await callAI(systemPrompt);
  } catch (err) {
    return res.status(500).json({ error: true, message: 'AI API error: ' + err.message });
  }

  let parsed;
  try {
    parsed = parseJSON(text);
  } catch (e) {
    // Retry once
    try {
      text = await callAI(systemPrompt);
      parsed = parseJSON(text);
    } catch (e2) {
      return res.status(500).json({ error: true, message: 'Failed to parse AI response. Please try again.' });
    }
  }

  incrementUsage(ip);
  const newUsed = used + 1;
  res.json({ question: parsed, usage: { used: newUsed, limit: 5, remaining: Math.max(0, 5 - newUsed) } });
});

app.post('/api/interview-followup', async (req, res) => {
  const ip = getClientIP(req);
  const used = getUsageCount(ip);
  if (used >= 5) {
    return res.status(429).json({ error: 'rate_limit', message: 'Daily limit reached. Upgrade to continue.' });
  }

  const { exam_type, conversation_history = [], user_response } = req.body;
  if (!exam_type || !user_response) {
    return res.status(400).json({ error: true, message: 'exam_type and user_response are required' });
  }

  const examNames = {
    mckinsey: 'McKinsey Case Interview',
    coding: 'Google/Meta Technical Coding Interview',
    mianshi: '公务员面试',
    civil: 'Civil Service Interview',
    ib: 'Investment Banking Interview',
  };
  const examName = examNames[exam_type] || exam_type;

  const systemPrompt = `You are an expert ${examName} interviewer conducting a live interview session.
Continue this interview conversation naturally. Be encouraging but rigorous. Ask probing follow-up questions.
After 4 or more exchanges, you may offer to conclude and give final structured feedback.
Respond in plain text (not JSON) as the interviewer. Keep responses under 200 words.
${exam_type === 'mianshi' ? 'Respond entirely in Chinese as a 考官.' : ''}`;

  const messages = [
    ...conversation_history,
    { role: 'user', content: user_response },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 512,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    });
    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: true, message: 'AI API error: ' + err.message });
  }
});

app.post('/api/interview-start', async (req, res) => {
  const { exam_type, topic } = req.body;
  const ip = getClientIP(req);
  const used = getUsageCount(ip);
  if (used >= 5) {
    return res.status(429).json({ error: 'rate_limit', message: 'Daily limit reached.' });
  }

  const prompts = {
    mckinsey: `You are Sarah, a McKinsey Associate Partner. Introduce yourself warmly (2 sentences), explain this is a 30-min case interview, then naturally present the case about ${topic}. End with "Where would you like to start?" Under 180 words. Plain text, not JSON.`,
    ib: `You are Marcus, a VP at Goldman Sachs. Briefly introduce yourself and the role you're hiring for. Say this will cover ${topic}. First ask "tell me briefly about your finance background" before diving in. Under 120 words. Plain text, not JSON.`,
    coding: `You are Alex, a friendly Google L5 Software Engineer conducting a 45-minute technical interview. Start by warmly introducing yourself and making the candidate feel comfortable. Then naturally transition into presenting one coding problem related to ${topic} — describe it conversationally as if explaining it in person, not as a formal question. End by asking "Do you have any clarifying questions before you start?" Keep it under 180 words. Plain text, not JSON.`,
    ielts_speaking: `You are a friendly IELTS examiner. Introduce yourself briefly, explain the 3-part structure, then start with easy warm-up questions for ${topic}. Under 150 words. Plain text, not JSON.`,
    toefl_speaking: `You are a TOEFL speaking coach. Welcome the student, explain the task type for ${topic}, give timing info, then present the question clearly. Under 150 words. Plain text, not JSON.`,
    ket_pet: `You are a cheerful Cambridge examiner for young learners. Say hello and make the student feel welcome. Start with an easy question about ${topic} to warm up. Under 100 words. Plain text, not JSON.`,
    kids_speaking: `You are a super friendly English teacher for kids! 👋 Say hi and give a big welcome! Start a fun chat about ${topic} with one simple question. Use emojis. Under 80 words. Plain text, not JSON.`,
    google_behavioral: `You are Jordan, a Google Engineering Manager. Introduce yourself, explain you'll be asking about past experiences using the STAR method, then ask your first behavioral question about ${topic}. Under 150 words. Plain text, not JSON.`,
    amazon_lp: `You are Taylor, an Amazon Senior Manager. Introduce yourself and the role, briefly explain STAR format, then ask your first Leadership Principle question about "${topic}". Under 150 words. Plain text, not JSON.`,
    civil: `You are the chair of a civil service interview panel. Welcome the candidate, introduce the panel briefly, explain the competency-based format on ${topic}, then ask your first question. Under 130 words. Plain text, not JSON.`,
    mianshi: `你是公务员面试主考官。先欢迎考生，简短介绍今天的面试形式（结构化面试，题目类型：${topic}），让考生放松，然后请考生就第一道题作答。不超过150字。纯文字，不要JSON。`,
  };

  const systemPrompt = prompts[exam_type] || `You are an interviewer for ${exam_type}. Start the interview for topic: ${topic}. Plain text, not JSON.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Begin the interview now.' },
      ],
    });
    incrementUsage(ip);
    res.json({ reply: response.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: true, message: 'AI API error: ' + err.message });
  }
});

app.post('/api/grade-essay', async (req, res) => {
  const { exam_type, essay_text, prompt_text } = req.body;
  if (!exam_type || !essay_text) {
    return res.status(400).json({ error: true, message: 'exam_type and essay_text are required' });
  }

  const ip = getClientIP(req);
  const used = getUsageCount(ip);
  if (used >= 5) {
    return res.status(429).json({ error: 'rate_limit', message: 'Daily limit reached.' });
  }

  let systemPrompt;
  if (exam_type === 'shenlun') {
    systemPrompt = `你是国家公务员考试申论阅卷专家。对考生的申论作文进行批改。
评分维度：内容（40分）、结构（30分）、语言（30分），满分100分。
${prompt_text ? `题目：${prompt_text}` : ''}
只返回JSON（不要markdown）：{"total_score": 75, "content_score": 30, "structure_score": 25, "language_score": 20, "strengths": ["优点"], "weaknesses": ["问题"], "suggestions": ["改进建议"], "model_paragraph": "示范段落"}`;
  } else if (exam_type === 'gre') {
    systemPrompt = `You are a GRE essay grader. Grade this essay on a 0-6 scale.${prompt_text ? ` Prompt: ${prompt_text}` : ''}
Return ONLY JSON (no markdown): {"score": 4.5, "max_score": 6, "score_label": "Strong", "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."], "revised_sentence": "..."}`;
  } else if (exam_type === 'ielts') {
    systemPrompt = `You are an IELTS examiner. Grade this Writing Task 2 essay.${prompt_text ? ` Prompt: ${prompt_text}` : ''}
Return ONLY JSON (no markdown): {"band_score": 7.0, "max_score": 9, "task_achievement": 7, "coherence": 7, "lexical_resource": 7, "grammatical_range": 7, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."]}`;
  } else if (exam_type === 'lsat') {
    systemPrompt = `You are an LSAT Writing grader. Evaluate this LSAT Writing sample.${prompt_text ? ` Prompt: ${prompt_text}` : ''}
Return ONLY JSON (no markdown): {"score": "Satisfactory", "max_score": "Excellent", "argumentation": 7, "clarity": 7, "evidence": 7, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."]}`;
  } else {
    systemPrompt = `You are an expert essay grader for ${exam_type}. Grade this essay.${prompt_text ? ` Prompt: ${prompt_text}` : ''}
Return ONLY JSON (no markdown): {"score": 75, "max_score": 100, "strengths": ["..."], "weaknesses": ["..."], "suggestions": ["..."]}`;
  }

  let text;
  try {
    const response = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Essay to grade:\n\n${essay_text}` },
      ],
    });
    text = response.choices[0].message.content;
  } catch (err) {
    return res.status(500).json({ error: true, message: 'AI API error: ' + err.message });
  }

  let parsed;
  try {
    parsed = parseJSON(text);
  } catch (e) {
    return res.status(500).json({ error: true, message: 'Failed to parse grading response.' });
  }

  incrementUsage(ip);
  res.json({ result: parsed });
});

app.post('/api/create-order', async (req, res) => {
  const { plan, email } = req.body;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeKey || stripeKey === 'sk_live_...') {
    return res.json({ url: '#', message: 'Stripe not configured — add STRIPE_SECRET_KEY to .env' });
  }

  const stripe = require('stripe')(stripeKey);
  const prices = { pro: 1999, elite: 3999, premium: 3999 };
  const amount = prices[plan] || 1999;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `AI Study Pro ${plan === 'premium' ? 'Premium' : plan === 'elite' ? 'Elite' : 'Pro'}` },
          unit_amount: amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      success_url: `${process.env.BASE_URL || 'http://localhost:3019'}?success={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:3019'}?cancelled=1`,
    });

    db.prepare('INSERT INTO orders (id, session_id, email, plan, amount) VALUES (?, ?, ?, ?, ?)').run(uuidv4(), session.id, email || '', plan, amount);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: true, message: err.message });
  }
});

// POST /api/verify-session — called after Stripe redirect to confirm payment
app.post('/api/verify-session', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey === 'sk_live_...') {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  try {
    const stripe = require('stripe')(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return res.status(402).json({ error: 'Payment not completed' });
    }

    db.prepare(`
      INSERT OR IGNORE INTO subscribers (id, stripe_session_id, email, plan)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), session_id, session.customer_email || '', session.metadata?.plan || 'pro');

    res.json({ ok: true, email: session.customer_email });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/book-teacher
app.post('/api/book-teacher', (req, res) => {
  try {
    const { teacher, exam, name, email, duration, focus } = req.body;

    db.exec(`CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      teacher TEXT,
      exam TEXT,
      student_name TEXT,
      student_email TEXT,
      duration TEXT,
      focus TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.prepare(
      `INSERT INTO bookings (id, teacher, exam, student_name, student_email, duration, focus) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), teacher, exam, name, email, duration, focus);

    console.log(`📅 New booking request: ${name} wants to book ${teacher} for ${exam}`);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`AI Study Pro running at http://localhost:${PORT}`);
});
