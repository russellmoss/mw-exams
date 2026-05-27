/**
 * Build a unified question index from historical exams + mock exams.
 * Output: study-app/public/data/question-index.json
 *
 * Run: npx ts-node scripts/build-question-index.ts
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXAMS_JSON = path.join(ROOT, 'data', 'exams.json');
const MOCK_DIR = path.join(ROOT, 'outputs', 'mock_exams');
const WINE_RESEARCH_DIR = path.join(ROOT, 'data', 'wine_research');
const DECISION_MATRICES_DIR = path.join(ROOT, 'outputs', 'decision_matrices');
const MASTER_TREES_DIR = path.join(ROOT, 'outputs', 'master_trees');
const STUDY_DIAGRAMS_DIR = path.join(ROOT, 'outputs', 'study_diagrams');
const OUTPUT = path.join(ROOT, 'study-app', 'public', 'data', 'question-index.json');

interface Wine {
  slot: number;
  fullText: string;
}

interface Question {
  id: string;
  source: 'historical' | 'mock';
  sourceFile: string;
  year: number | null;
  paper: number;
  questionNumber: number;
  text: string;
  wines: Wine[];
  totalMarks: number;
  family: string;
  familyLabel: string;
  subcategory: string;
  hasModelAnswer: boolean;
  hasDecisionMatrix: boolean;
  hasWineResearch: boolean;
  modelAnswer?: string;
  reasoningTrace?: string;
  studyDiagramAssist?: string;
  proposedAnnotation?: string;
}

// Classify question into family based on stem text
function classifyQuestion(text: string, paper: number): { family: string; familyLabel: string; subcategory: string } {
  const t = text.toLowerCase();

  // F7: Quality hierarchy / classification
  if (t.includes('quality designation') || t.includes('classification') || t.includes('ascending order of quality') ||
      t.includes('rank the wines') || t.includes('quality levels within') || t.includes('formal appellation hierarchy') ||
      t.includes('quality within their classification')) {
    return { family: 'F7', familyLabel: 'Quality Hierarchy', subcategory: detectF7Sub(t) };
  }

  // F5: Method / Production dominant
  if (t.includes('method of production') || t.includes('methods of production') ||
      t.includes('natural factors versus human') || t.includes('human inputs vs') ||
      t.includes('natural factors vs') || t.includes('human factors')) {
    if (t.includes('sparkling')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5a sparkling method' };
    if (t.includes('fortifi') || t.includes('biological') || t.includes('oxidative')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5c fortification / maturation' };
    if (t.includes('residual sugar') || t.includes('sweetness')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5d sweetness mechanism' };
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5e human vs natural factors' };
  }

  // F1: Same variety
  if (t.includes('same single grape variety') || t.includes('same grape variety') ||
      t.includes('same single variety') || t.includes('same predominant grape') ||
      t.includes('predominantly from the same')) {
    if (t.includes('same country') || t.includes('same region')) {
      return { family: 'F1', familyLabel: 'Same Variety', subcategory: 'F1a same variety, same country/region' };
    }
    if (t.includes('different countr')) {
      return { family: 'F1', familyLabel: 'Same Variety', subcategory: 'F1b same variety, different countries' };
    }
    if (t.includes('same producer')) {
      return { family: 'F1', familyLabel: 'Same Variety', subcategory: 'F1c same variety, same producer' };
    }
    return { family: 'F1', familyLabel: 'Same Variety', subcategory: 'F1b same variety, different countries' };
  }

  // F3: Blend logic
  if (t.includes('blend') || t.includes('two grape varieties') || t.includes('predominant varieties differ')) {
    return { family: 'F3', familyLabel: 'Blend Logic', subcategory: 'F3a blend comparison' };
  }

  // F2: Same origin
  if (t.includes('same country') || t.includes('same region') || t.includes('same wine region') ||
      t.includes('same broad region') || t.includes('same producer')) {
    if (t.includes('different grape variet') || t.includes('different single grape') || t.includes('different wine region')) {
      return { family: 'F2', familyLabel: 'Same Origin', subcategory: 'F2a same country, different varieties' };
    }
    if (t.includes('same producer') || t.includes('same region') || t.includes('same wine region')) {
      return { family: 'F2', familyLabel: 'Same Origin', subcategory: 'F2b same region' };
    }
    return { family: 'F2', familyLabel: 'Same Origin', subcategory: 'F2a same country, different varieties' };
  }

  // F6: Style mechanism (residual sugar, maturity, etc.)
  if (t.includes('residual sugar') || t.includes('all have residual') || t.includes('maturity') ||
      t.includes('younger') || t.includes('older') || t.includes('different vintages')) {
    if (t.includes('residual sugar') || t.includes('sweetness')) return { family: 'F6', familyLabel: 'Style Mechanism', subcategory: 'F6a sweetness axis' };
    return { family: 'F6', familyLabel: 'Style Mechanism', subcategory: 'F6d maturity axis' };
  }

  // P3 special: sparkling
  if (t.includes('sparkling') || t.includes('effervescence')) {
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5a sparkling method' };
  }

  // P3 special: fortified
  if (t.includes('fortified') || t.includes('legally defined category')) {
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5c fortification / maturation' };
  }

  // F4: Mixed breadth (fallback)
  return { family: 'F4', familyLabel: 'Mixed Breadth', subcategory: 'F4a independent identification' };
}

function detectF7Sub(t: string): string {
  if (t.includes('same producer')) return 'F7c same producer hierarchy';
  if (t.includes('ascending order')) return 'F7a legal classification ladder';
  return 'F7b quality calibration';
}

// Extract total marks from question text
function extractMarks(text: string): number {
  let total = 0;
  // Match patterns like (4 x 8 marks), (15 marks), (2 x 10 marks)
  const patterns = [
    /\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi,
    /\((\d+)\s*marks?\)/gi
  ];

  for (const match of text.matchAll(patterns[0])) {
    total += parseInt(match[1]) * parseInt(match[2]);
  }
  for (const match of text.matchAll(patterns[1])) {
    total += parseInt(match[1]);
  }

  return total || 100; // default if parsing fails
}

// Parse historical exams from exams.json
function parseHistoricalExams(): Question[] {
  const raw = JSON.parse(fs.readFileSync(EXAMS_JSON, 'utf-8'));
  const questions: Question[] = [];

  for (const exam of raw) {
    for (const paper of exam.papers) {
      for (const q of paper.questions) {
        const wines: Wine[] = [];
        for (const slot of q.wines) {
          const wine = paper.wines.find((w: any) => w.slot === slot);
          if (wine) {
            wines.push({ slot: wine.slot, fullText: wine.full_text });
          }
        }

        const id = `${exam.year}_p${paper.paper}_q${q.n}`;
        const classification = classifyQuestion(q.text, paper.paper);

        const hasMatrix = fs.existsSync(path.join(DECISION_MATRICES_DIR, `${id}.md`));
        const hasResearch = wines.some(w =>
          fs.existsSync(path.join(WINE_RESEARCH_DIR, `${exam.year}_p${paper.paper}_w${w.slot}.md`))
        );

        questions.push({
          id,
          source: 'historical',
          sourceFile: 'data/exams.json',
          year: exam.year,
          paper: paper.paper,
          questionNumber: q.n,
          text: q.text,
          wines,
          totalMarks: extractMarks(q.text),
          ...classification,
          hasModelAnswer: false,
          hasDecisionMatrix: hasMatrix,
          hasWineResearch: hasResearch,
        });
      }
    }
  }

  return questions;
}

// Parse a single mock exam file
function parseMockExam(filePath: string): Question[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const questions: Question[] = [];

  // Find answer file
  const baseName = fileName.replace('.md', '');
  const answerFile = path.join(MOCK_DIR, `${baseName}_answers.md`);
  let answerContent = '';
  if (fs.existsSync(answerFile)) {
    answerContent = fs.readFileSync(answerFile, 'utf-8');
  }

  // Split into papers
  const paperSections = content.split(/^## Paper (\d)/m);

  let currentPaper = 0;
  for (let i = 1; i < paperSections.length; i += 2) {
    currentPaper = parseInt(paperSections[i]);
    const section = paperSections[i + 1] || '';

    // Extract questions
    const questionBlocks = section.split(/^### Question (\d+)/m);
    const winesSection = section.match(/### Wines[^\n]*\n([\s\S]*?)(?=---|\n## |$)/);

    // Parse wines list
    const winesList: Wine[] = [];
    if (winesSection) {
      const wineLines = winesSection[1].split('\n').filter(l => /^\d+\./.test(l.trim()));
      for (const line of wineLines) {
        const slotMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (slotMatch) {
          winesList.push({ slot: parseInt(slotMatch[1]), fullText: slotMatch[2].trim() });
        }
      }
    }

    for (let j = 1; j < questionBlocks.length; j += 2) {
      const qNum = parseInt(questionBlocks[j]);
      const qText = questionBlocks[j + 1]?.split(/^###/m)[0]?.trim() || '';

      if (!qText || qText.length < 20) continue;

      // Figure out which wines belong to this question from the stem
      const wineRefs = qText.match(/Wines?\s+(\d+)\s*(?:to|–|-|and)\s*(\d+)/i);
      const questionWines: Wine[] = [];
      if (wineRefs) {
        const start = parseInt(wineRefs[1]);
        const end = parseInt(wineRefs[2]);
        for (let w = start; w <= end; w++) {
          const wine = winesList.find(wl => wl.slot === w);
          if (wine) questionWines.push(wine);
        }
      }

      const id = `mock_${baseName}_p${currentPaper}_q${qNum}`;
      const classification = classifyQuestion(qText, currentPaper);

      // Extract model answer section for this question from answer file
      let modelAnswer = '';
      let reasoningTrace = '';
      let studyDiagramAssist = '';
      let proposedAnnotation = '';

      if (answerContent) {
        // Try to find the answer section for this question
        const qPattern = new RegExp(`## Question ${qNum}[\\s\\S]*?(?=## Question \\d|## Paper|$)`, 'i');
        const answerMatch = answerContent.match(qPattern);
        if (answerMatch) {
          modelAnswer = answerMatch[0];

          const traceMatch = modelAnswer.match(/## Reasoning trace[\s\S]*?(?=## |$)/i);
          if (traceMatch) reasoningTrace = traceMatch[0];

          const diagramMatch = modelAnswer.match(/## Study diagram assist[\s\S]*?(?=## Question|## Paper|$)/i);
          if (diagramMatch) studyDiagramAssist = diagramMatch[0];

          const annotationMatch = modelAnswer.match(/## Proposed annotation[\s\S]*?(?=## Reasoning|## Study|$)/i);
          if (annotationMatch) proposedAnnotation = annotationMatch[0];
        }
      }

      questions.push({
        id,
        source: 'mock',
        sourceFile: fileName,
        year: null,
        paper: currentPaper,
        questionNumber: qNum,
        text: qText,
        wines: questionWines,
        totalMarks: extractMarks(qText),
        ...classification,
        hasModelAnswer: modelAnswer.length > 100,
        hasDecisionMatrix: false,
        hasWineResearch: questionWines.some(w => {
          // Mock wines won't have research files, but check anyway
          return false;
        }),
        modelAnswer: modelAnswer || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
        proposedAnnotation: proposedAnnotation || undefined,
      });
    }
  }

  return questions;
}

// Load decision trees
function loadDecisionTrees(): Record<string, string> {
  const trees: Record<string, string> = {};
  for (const file of ['p1_whites_tree.md', 'p2_reds_tree.md', 'p3_special_tree.md']) {
    const filePath = path.join(MASTER_TREES_DIR, file);
    if (fs.existsSync(filePath)) {
      trees[file.replace('_tree.md', '')] = fs.readFileSync(filePath, 'utf-8');
    }
  }
  return trees;
}

// Load study diagrams
function loadStudyDiagrams(): Record<string, string> {
  const diagrams: Record<string, string> = {};
  for (const file of ['p1_whites.md', 'p2_reds.md', 'p3_special.md', 'variety_cards.md']) {
    const filePath = path.join(STUDY_DIAGRAMS_DIR, file);
    if (fs.existsSync(filePath)) {
      diagrams[file.replace('.md', '')] = fs.readFileSync(filePath, 'utf-8');
    }
  }
  return diagrams;
}

// Load examiner report synthesis
function loadExaminerRubric(): string {
  const filePath = path.join(ROOT, 'outputs', 'heuristics', 'examiner_report_synthesis.md');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return '';
}

// Main
function main() {
  console.log('Building question index...');

  // Historical exams
  const historical = parseHistoricalExams();
  console.log(`  Historical questions: ${historical.length}`);

  // Mock exams (only clean exam files, not answers/rationale)
  const mockFiles = fs.readdirSync(MOCK_DIR)
    .filter(f => /^mock_full_.*_v\d+\.md$/.test(f) || /^mock_full_\d{4}_\d{2}_\d{2}\.md$/.test(f))
    .filter(f => !f.includes('answers') && !f.includes('rationale') && !f.includes('review') && !f.includes('coverage') && !f.includes('sourcing') && !f.includes('predicted') && !f.includes('country'));

  let mockQuestions: Question[] = [];
  for (const file of mockFiles) {
    const questions = parseMockExam(path.join(MOCK_DIR, file));
    mockQuestions = mockQuestions.concat(questions);
    console.log(`  ${file}: ${questions.length} questions`);
  }

  console.log(`  Total mock questions: ${mockQuestions.length}`);

  const allQuestions = [...historical, ...mockQuestions];

  // Stats by family
  const familyCounts: Record<string, number> = {};
  for (const q of allQuestions) {
    const key = `P${q.paper} ${q.family} ${q.familyLabel}`;
    familyCounts[key] = (familyCounts[key] || 0) + 1;
  }
  console.log('\nFamily distribution:');
  for (const [key, count] of Object.entries(familyCounts).sort()) {
    console.log(`  ${key}: ${count}`);
  }

  // Questions with model answers
  const withAnswers = allQuestions.filter(q => q.hasModelAnswer).length;
  console.log(`\nQuestions with model answers: ${withAnswers}`);

  // Load supporting data
  const trees = loadDecisionTrees();
  const diagrams = loadStudyDiagrams();
  const examinerRubric = loadExaminerRubric();

  // Build output
  const output = {
    generated: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    questions: allQuestions,
    decisionTrees: trees,
    studyDiagrams: diagrams,
    examinerRubric,
  };

  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\nIndex written to: ${OUTPUT}`);
  console.log(`Total questions: ${allQuestions.length}`);
  console.log(`File size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
}

main();
