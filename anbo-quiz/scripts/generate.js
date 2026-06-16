// scripts/generate.js
// Gemini API로 뉴스 검색 + 퀴즈 20문제 자동 생성

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('GEMINI_API_KEY 없음'); process.exit(1); }

const genAI = new GoogleGenerativeAI(API_KEY);

// ── 날짜 유틸
function todayStr() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
function todayLabel() {
  const d = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
}

// ── Gemini로 퀴즈 생성
async function generateQuiz() {
  // Google Search grounding 지원 모델 사용
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],  // 실시간 Google 검색 연동
  });

  const today = todayLabel();

  const prompt = `오늘(${today}) 기준으로 다음 작업을 수행하세요.

Google 검색을 통해 최근 2~4주 이내 실제 뉴스를 검색한 후,
국제정세·북한 관련 퀴즈 20문제를 만들어주세요.

검색할 주제:
- 북한 핵·미사일 도발 동향
- 북미·남북 관계 최신 동향  
- 한반도 안보 (한미동맹, 주한미군 등)
- 국제정세 (미중러 관계, 우크라이나 등)
- 유엔 안보리·대북제재
- NATO·인도태평양 전략

반드시 아래 JSON 형식만 출력하세요. 마크다운 없이 순수 JSON만:

{
  "date": "${todayStr()}",
  "date_label": "${today}",
  "headlines": [
    "헤드라인1",
    "헤드라인2",
    "헤드라인3",
    "헤드라인4",
    "헤드라인5",
    "헤드라인6",
    "헤드라인7",
    "헤드라인8",
    "헤드라인9",
    "헤드라인10"
  ],
  "questions": [
    {
      "id": 1,
      "topic": "북한 핵·미사일",
      "tag_class": "tag-nk",
      "question": "질문 텍스트 (구체적 날짜·인물·수치 포함)",
      "options": ["보기①", "보기②", "보기③", "보기④"],
      "answer": 0,
      "explanation": "정답 해설 2~3문장. 배경 설명 포함.",
      "wrong_explanations": [
        "",
        "②번이 틀린 이유 1~2문장",
        "③번이 틀린 이유 1~2문장",
        "④번이 틀린 이유 1~2문장"
      ],
      "source": "연합뉴스 2025.06.15",
      "source_url": "https://www.yna.co.kr/...",
      "correct_rate": 65,
      "difficulty": "중급"
    }
  ]
}

규칙:
1. questions 배열에 정확히 20개 문제
2. tag_class: 북한관련→"tag-nk", 미국/NATO→"tag-us", 그 외→"tag-int"
3. answer: 정답 보기의 인덱스 (0~3)
4. wrong_explanations: 정답 보기 위치는 빈문자열(""), 나머지 3개는 왜 틀렸는지 설명
5. correct_rate: 예상 정답률 숫자만 (30~85 사이)
6. 반드시 실제 뉴스 기반, 가상 사건 금지
7. 난이도 균형: 입문 5문제, 중급 10문제, 고급 5문제`;

  console.log('Gemini API 호출 중...');
  const result = await model.generateContent(prompt);
  const text = result.response.text();

  // JSON 추출
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON 파싱 실패:\n' + text.slice(0, 500));

  const parsed = JSON.parse(match[0]);
  if (!parsed.questions || parsed.questions.length < 10) {
    throw new Error(`문제 수 부족: ${parsed.questions?.length || 0}개`);
  }

  console.log(`✅ ${parsed.questions.length}문제 생성 완료`);
  return parsed;
}

// ── 메인
async function main() {
  try {
    // data 디렉토리 생성
    await fs.mkdir('data', { recursive: true });

    const quiz = await generateQuiz();
    const dateStr = todayStr();

    // 오늘 날짜 파일로 저장
    const filePath = path.join('data', `${dateStr}.json`);
    await fs.writeFile(filePath, JSON.stringify(quiz, null, 2), 'utf-8');
    console.log(`📁 저장: ${filePath}`);

    // latest.json도 갱신 (프론트엔드가 항상 이걸 먼저 읽음)
    await fs.writeFile('data/latest.json', JSON.stringify(quiz, null, 2), 'utf-8');
    console.log('📁 저장: data/latest.json');

    // index.json 갱신 (날짜 목록)
    let index = [];
    try {
      const raw = await fs.readFile('data/index.json', 'utf-8');
      index = JSON.parse(raw);
    } catch {}
    if (!index.includes(dateStr)) {
      index.unshift(dateStr);
      index = index.slice(0, 90); // 최근 90일만 유지
    }
    await fs.writeFile('data/index.json', JSON.stringify(index, null, 2), 'utf-8');
    console.log(`📅 인덱스 업데이트: ${index.length}일치`);

    console.log('🎉 완료!');
  } catch (e) {
    console.error('❌ 오류:', e.message);
    process.exit(1);
  }
}

main();
