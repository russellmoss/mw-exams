/**
 * Build a unified question index from historical exams + mock exams.
 * Output: study-app/public/data/question-index.json
 * Run: node scripts/build-question-index.js
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

function classifyQuestion(text, paper) {
  const t = text.toLowerCase();

  if (t.includes('quality designation') || t.includes('classification') || t.includes('ascending order of quality') ||
      t.includes('rank the wines') || t.includes('quality levels within') || t.includes('formal appellation hierarchy') ||
      t.includes('quality within their classification')) {
    let sub = 'F7b quality calibration';
    if (t.includes('same producer')) sub = 'F7c same producer hierarchy';
    if (t.includes('ascending order')) sub = 'F7a legal classification ladder';
    return { family: 'F7', familyLabel: 'Quality Hierarchy', subcategory: sub };
  }

  if (t.includes('method of production') || t.includes('methods of production') ||
      t.includes('natural factors versus human') || t.includes('human inputs vs') ||
      t.includes('natural factors vs') || t.includes('human factors')) {
    if (t.includes('sparkling')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5a sparkling method' };
    if (t.includes('fortifi') || t.includes('biological') || t.includes('oxidative')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5c fortification / maturation' };
    if (t.includes('residual sugar') || t.includes('sweetness')) return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5d sweetness mechanism' };
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5e human vs natural factors' };
  }

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

  if (t.includes('blend') || t.includes('two grape varieties') || t.includes('predominant varieties differ')) {
    return { family: 'F3', familyLabel: 'Blend Logic', subcategory: 'F3a blend comparison' };
  }

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

  if (t.includes('residual sugar') || t.includes('all have residual') || t.includes('maturity') ||
      t.includes('younger') || t.includes('older') || t.includes('different vintages')) {
    if (t.includes('residual sugar') || t.includes('sweetness')) return { family: 'F6', familyLabel: 'Style Mechanism', subcategory: 'F6a sweetness axis' };
    return { family: 'F6', familyLabel: 'Style Mechanism', subcategory: 'F6d maturity axis' };
  }

  if (t.includes('sparkling') || t.includes('effervescence')) {
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5a sparkling method' };
  }

  if (t.includes('fortified') || t.includes('legally defined category')) {
    return { family: 'F5', familyLabel: 'Method / Production', subcategory: 'F5c fortification / maturation' };
  }

  return { family: 'F4', familyLabel: 'Mixed Breadth', subcategory: 'F4a independent identification' };
}

function extractMarks(text) {
  let total = 0;
  const mult = [...text.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
  for (const m of mult) total += parseInt(m[1]) * parseInt(m[2]);
  const single = [...text.matchAll(/\((\d+)\s*marks?\)/gi)];
  for (const m of single) total += parseInt(m[1]);
  return total || 100;
}

function parseHistoricalExams() {
  const raw = JSON.parse(fs.readFileSync(EXAMS_JSON, 'utf-8'));
  const questions = [];

  for (const exam of raw) {
    for (const paper of exam.papers) {
      for (const q of paper.questions) {
        const wines = [];
        for (const slot of q.wines) {
          const wine = paper.wines.find(w => w.slot === slot);
          if (wine) wines.push({ slot: wine.slot, fullText: wine.full_text });
        }

        const id = `${exam.year}_p${paper.paper}_q${q.n}`;
        const classification = classifyQuestion(q.text, paper.paper);
        const hasMatrix = fs.existsSync(path.join(DECISION_MATRICES_DIR, `${id}.md`));
        const hasResearch = wines.some(w =>
          fs.existsSync(path.join(WINE_RESEARCH_DIR, `${exam.year}_p${paper.paper}_w${w.slot}.md`))
        );

        const mockAnswerPath = path.join(ROOT, 'outputs', 'mock_answers', `${id}.md`);
        const hasMockAnswer = fs.existsSync(mockAnswerPath);
        let modelAnswer;
        if (hasMockAnswer) modelAnswer = fs.readFileSync(mockAnswerPath, 'utf-8');

        let decisionMatrixContent;
        if (hasMatrix) decisionMatrixContent = fs.readFileSync(path.join(DECISION_MATRICES_DIR, `${id}.md`), 'utf-8');

        questions.push({
          id, source: 'historical', sourceFile: 'data/exams.json',
          year: exam.year, paper: paper.paper, questionNumber: q.n,
          text: q.text, wines, totalMarks: extractMarks(q.text),
          ...classification,
          hasModelAnswer: hasMockAnswer, hasDecisionMatrix: hasMatrix, hasWineResearch: hasResearch,
          modelAnswer, decisionMatrixContent,
        });
      }
    }
  }
  return questions;
}

function parseMockExam(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  const questions = [];
  const baseName = fileName.replace('.md', '');

  let answerContent = '';
  const answerFile = path.join(MOCK_DIR, `${baseName}_answers.md`);
  if (fs.existsSync(answerFile)) answerContent = fs.readFileSync(answerFile, 'utf-8');

  const perPaperAnswers = {};
  for (const p of [1, 2, 3]) {
    const ppPath = path.join(MOCK_DIR, `${baseName}_answers_p${p}.md`);
    if (fs.existsSync(ppPath)) perPaperAnswers[p] = fs.readFileSync(ppPath, 'utf-8');
  }

  const paperSections = content.split(/^## Paper (\d)/m);

  for (let i = 1; i < paperSections.length; i += 2) {
    const currentPaper = parseInt(paperSections[i]);
    const section = paperSections[i + 1] || '';
    const questionBlocks = section.split(/^### Question (\d+)/m);
    const winesSection = section.match(/### Wines[^\n]*\n([\s\S]*?)(?=---|\n## |$)/);

    const winesList = [];
    if (winesSection) {
      const wineLines = winesSection[1].split('\n').filter(l => /^\d+\./.test(l.trim()));
      for (const line of wineLines) {
        const slotMatch = line.match(/^(\d+)\.\s+(.*)/);
        if (slotMatch) winesList.push({ slot: parseInt(slotMatch[1]), fullText: slotMatch[2].trim() });
      }
    }

    const paperAnswerContent = perPaperAnswers[currentPaper] || answerContent;

    for (let j = 1; j < questionBlocks.length; j += 2) {
      const qNum = parseInt(questionBlocks[j]);
      const qText = questionBlocks[j + 1]?.split(/^###/m)[0]?.trim() || '';
      if (!qText || qText.length < 20) continue;

      const wineRefs = qText.match(/Wines?\s+(\d+)\s*(?:to|–|-|and)\s*(\d+)/i);
      const questionWines = [];
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

      let modelAnswer = '', reasoningTrace = '', studyDiagramAssist = '', proposedAnnotation = '';

      if (paperAnswerContent) {
        const qPattern = new RegExp(`## Question ${qNum}[\\s\\S]*?(?=\\n## Question \\d|\\*End of Paper|$)`, 'i');
        const answerMatch = paperAnswerContent.match(qPattern);
        if (answerMatch) {
          modelAnswer = answerMatch[0];
          const traceMatch = modelAnswer.match(/## Reasoning trace[\s\S]*?(?=\n## |$)/i);
          if (traceMatch) reasoningTrace = traceMatch[0];
          const diagramMatch = modelAnswer.match(/## Study diagram assist[\s\S]*?(?=\n## Question|\n---\n|$)/i);
          if (diagramMatch) studyDiagramAssist = diagramMatch[0];
          const annotationMatch = modelAnswer.match(/## Proposed annotation[\s\S]*?(?=\n## Reasoning|\n## Study|$)/i);
          if (annotationMatch) proposedAnnotation = annotationMatch[0];
        }
      }

      questions.push({
        id, source: 'mock', sourceFile: fileName,
        year: null, paper: currentPaper, questionNumber: qNum,
        text: qText, wines: questionWines, totalMarks: extractMarks(qText),
        ...classification,
        hasModelAnswer: modelAnswer.length > 100,
        hasDecisionMatrix: false, hasWineResearch: false,
        modelAnswer: modelAnswer || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
        proposedAnnotation: proposedAnnotation || undefined,
      });
    }
  }
  return questions;
}

function loadTextFile(filePath) {
  if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf-8');
  return '';
}

function main() {
  console.log('Building question index...');

  const historical = parseHistoricalExams();
  console.log(`  Historical questions: ${historical.length}`);

  const mockFiles = fs.readdirSync(MOCK_DIR)
    .filter(f => /^mock_full_.*\.md$/.test(f))
    .filter(f => !f.includes('answers') && !f.includes('rationale') && !f.includes('review') &&
                 !f.includes('coverage') && !f.includes('sourcing') && !f.includes('predicted') &&
                 !f.includes('country') && !f.includes('diversity'));

  let mockQuestions = [];
  for (const file of mockFiles) {
    const questions = parseMockExam(path.join(MOCK_DIR, file));
    mockQuestions = mockQuestions.concat(questions);
    console.log(`  ${file}: ${questions.length} questions`);
  }
  console.log(`  Total mock questions: ${mockQuestions.length}`);

  const allQuestions = [...historical, ...mockQuestions];

  const familyCounts = {};
  for (const q of allQuestions) {
    const key = `P${q.paper} ${q.family} ${q.familyLabel}`;
    familyCounts[key] = (familyCounts[key] || 0) + 1;
  }
  console.log('\nFamily distribution:');
  for (const [key, count] of Object.entries(familyCounts).sort()) {
    console.log(`  ${key}: ${count}`);
  }

  const withAnswers = allQuestions.filter(q => q.hasModelAnswer).length;
  console.log(`\nQuestions with model answers: ${withAnswers}`);

  const trees = {};
  for (const f of ['p1_whites_tree.md', 'p2_reds_tree.md', 'p3_special_tree.md']) {
    const p = path.join(MASTER_TREES_DIR, f);
    if (fs.existsSync(p)) trees[f.replace('_tree.md', '')] = fs.readFileSync(p, 'utf-8');
  }

  const diagrams = {};
  for (const f of ['p1_whites.md', 'p2_reds.md', 'p3_special.md', 'variety_cards.md']) {
    const p = path.join(STUDY_DIAGRAMS_DIR, f);
    if (fs.existsSync(p)) diagrams[f.replace('.md', '')] = fs.readFileSync(p, 'utf-8');
  }

  const examinerRubric = loadTextFile(path.join(ROOT, 'outputs', 'heuristics', 'examiner_report_synthesis.md'));

  const output = {
    generated: new Date().toISOString(),
    totalQuestions: allQuestions.length,
    questions: allQuestions,
    decisionTrees: trees,
    studyDiagrams: diagrams,
    examinerRubric,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\nIndex written to: ${OUTPUT}`);
  console.log(`Total questions: ${allQuestions.length}`);
  console.log(`File size: ${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB`);
}

main();
