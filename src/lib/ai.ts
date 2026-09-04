import OpenAI from 'openai';
import type { JobAnalysis } from './db';

const client = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  timeout: 10_000,
  maxRetries: 0,
});

const MODEL = process.env.LLM_MODEL_PRIMARY ?? 'llama-3.3-70b-versatile';

// ─── Analysis ────────────────────────────────────────────────────────────────

const analysisTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'extract_job_analysis',
    description: 'Extrae análisis estructurado de una oferta laboral',
    parameters: {
      type: 'object',
      properties: {
        required_skills: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills técnicas explícitamente requeridas',
        },
        nice_to_have: {
          type: 'array',
          items: { type: 'string' },
          description: 'Skills deseables pero no obligatorias',
        },
        seniority: {
          type: 'string',
          enum: ['junior', 'ssr', 'senior', 'lead', 'unknown'],
        },
        stack: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tecnologías y frameworks del stack',
        },
        modality: {
          type: 'string',
          enum: ['remote', 'hybrid', 'onsite', 'unknown'],
        },
        location: {
          type: 'string',
          description: 'Ciudad o país de la oferta. String vacío si no se especifica.',
        },
        language_required: {
          type: 'string',
          enum: ['es', 'en', 'both', 'unknown'],
        },
        salary_mentioned: {
          type: 'string',
          description: 'Rango salarial si se menciona. String vacío si no hay información.',
        },
        red_flags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Señales de alerta. Ej: "5 años de exp para un puesto junior".',
        },
      },
      required: [
        'required_skills', 'nice_to_have', 'seniority', 'stack', 'modality',
        'location', 'language_required', 'salary_mentioned', 'red_flags',
      ],
    },
  },
};

type JobInput = {
  title: string;
  company: string;
  location: string | null;
  search_keyword: string | null;
  description?: string | null;
};

export async function runAnalysis(job: JobInput): Promise<JobAnalysis> {
  const lines = [
    `Título: ${job.title}`,
    `Empresa: ${job.company}`,
    job.location       ? `Ubicación: ${job.location}`              : null,
    job.search_keyword ? `Keyword de búsqueda: ${job.search_keyword}` : null,
    job.description     ? `Descripción completa:\n${job.description}` : null,
  ].filter(Boolean).join('\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content:
          'Sos un analizador experto de ofertas laborales tech. Extraé información estructurada ' +
          'inferiendo lo que puedas del título, empresa y ubicación. ' +
          'Solo marcá red_flags si hay algo genuinamente problemático (ej: años de experiencia absurdos para junior, stack imposible). ' +
          'Si no hay información suficiente para un campo, usá "unknown" o array vacío. ' +
          'Para location y salary_mentioned, usá string vacío si no hay información.',
      },
      { role: 'user', content: `Analizá esta oferta:\n\n${lines}` },
    ],
    tools: [analysisTool],
    tool_choice: { type: 'function', function: { name: 'extract_job_analysis' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('Analysis: el modelo no llamó al tool esperado');

  const raw = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;

  // Normalize empty strings → null for optional fields
  return {
    ...(raw as JobAnalysis),
    location:         (raw.location         as string) || null,
    salary_mentioned: (raw.salary_mentioned as string) || null,
  };
}

// ─── Match score ─────────────────────────────────────────────────────────────

const matchTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'score_match',
    description: 'Puntaje de match entre candidato y oferta',
    parameters: {
      type: 'object',
      properties: {
        score: {
          type: 'integer',
          description: 'Fit 0–100 donde 100 = fit perfecto',
        },
        reasoning: {
          type: 'string',
          description: 'Máx 3 oraciones: fortalezas principales y gaps concretos del candidato',
        },
      },
      required: ['score', 'reasoning'],
    },
  },
};

export async function runMatch(
  analysis: JobAnalysis,
  cv: string,
): Promise<{ score: number; reasoning: string }> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'system',
        content:
          'Sos un recruiter técnico senior evaluando el fit entre un candidato y una oferta. ' +
          'Sé honesto y preciso. Comparás habilidades requeridas contra las del CV. ' +
          'Score 0–100: 0 = sin relación, 100 = fit perfecto.',
      },
      {
        role: 'user',
        content:
          `CV del candidato:\n\n${cv}\n\n---\n\nAnálisis de la oferta:\n\n` +
          JSON.stringify(analysis, null, 2) +
          '\n\nCalculá el match score.',
      },
    ],
    tools: [matchTool],
    tool_choice: { type: 'function', function: { name: 'score_match' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('Match: el modelo no llamó al tool esperado');

  const raw = JSON.parse(toolCall.function.arguments) as { score: number; reasoning: string };
  return { ...raw, score: Math.min(100, Math.max(0, Math.round(raw.score))) };
}

// ─── Cover letter ─────────────────────────────────────────────────────────────

export async function runCoverLetter(
  job: { title: string; company: string; location: string | null },
  analysis: JobAnalysis,
  cv: string,
  opts?: { tone?: 'formal' | 'cercano'; feedback?: string },
): Promise<string> {
  const tone = opts?.tone ?? 'cercano';
  const toneDesc =
    tone === 'formal'
      ? 'formal y profesional, usando "usted"'
      : 'cercano y directo, usando "vos"';

  const feedbackLine = opts?.feedback
    ? `\n\nFeedback sobre la versión anterior: ${opts.feedback}\nAjustá la carta en consecuencia.`
    : '';

  const requiredSkills = analysis.required_skills ?? [];
  const stack = analysis.stack ?? [];
  const skillsLine = [
    requiredSkills.length       ? `Skills requeridas: ${requiredSkills.join(', ')}` : null,
    stack.length                ? `Stack: ${stack.join(', ')}`                      : null,
    analysis.modality !== 'unknown' ? `Modalidad: ${analysis.modality}`             : null,
  ].filter(Boolean).join('\n');

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: 'system',
        content:
          `Sos un experto en búsqueda laboral tech. Escribís cartas de presentación en español, ` +
          `tono ${toneDesc}. Adaptás la carta al puesto y al perfil del candidato. ` +
          `No inventés información que no está en el CV. Escribís directo al punto, sin fluff genérico.`,
      },
      {
        role: 'user',
        content: [
          'Escribí una carta de presentación para este puesto:',
          '',
          `Puesto: ${job.title}`,
          `Empresa: ${job.company}`,
          job.location ? `Ubicación: ${job.location}` : null,
          skillsLine || null,
          '',
          'CV del candidato:',
          cv,
          feedbackLine || null,
          '',
          'Escribí solo la carta, sin comentarios adicionales.',
        ].filter((l) => l !== null).join('\n'),
      },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('Cover letter: el modelo no devolvió texto');
  return text;
}

// ─── Screening answers ─────────────────────────────────────────────────────

const screeningTool: OpenAI.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'draft_screening_answers',
    description: 'Respuestas a las preguntas de screening típicas de un formulario de postulación',
    parameters: {
      type: 'object',
      properties: {
        answers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'La pregunta, en español' },
              answer: { type: 'string', description: 'Respuesta breve y honesta basada en el CV' },
            },
            required: ['question', 'answer'],
          },
        },
      },
      required: ['answers'],
    },
  },
};

/**
 * Drafts answers to the screening questions a real application form for
 * this posting would likely ask (years of experience, availability,
 * expected salary, work modality, etc.) — shown to the user for approval
 * in the Tier B Telegram flow, never invented facts beyond the CV.
 */
export async function runScreeningAnswers(
  job: { title: string; company: string; description: string | null },
  analysis: JobAnalysis,
  cv: string,
): Promise<{ question: string; answer: string }[]> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 768,
    messages: [
      {
        role: 'system',
        content:
          'Sos un candidato completando el formulario de postulación de esta oferta, en primera persona. ' +
          'Inferí qué preguntas de screening haría un formulario real para este tipo de puesto ' +
          '(años de experiencia, disponibilidad, modalidad, pretensión salarial, motivo de postulación, etc.) ' +
          'y respondelas de forma honesta y breve usando SOLO información del CV. ' +
          'Nunca inventes experiencia, títulos o años que no estén en el CV — si algo no aplica, decilo con naturalidad ' +
          '(ej: "sin experiencia laboral formal, portfolio de proyectos personales"). Máximo 5 preguntas.',
      },
      {
        role: 'user',
        content:
          `Puesto: ${job.title}\nEmpresa: ${job.company}\n` +
          (job.description ? `Descripción:\n${job.description}\n\n` : '') +
          `Análisis de la oferta:\n${JSON.stringify(analysis, null, 2)}\n\n` +
          `CV del candidato:\n\n${cv}`,
      },
    ],
    tools: [screeningTool],
    tool_choice: { type: 'function', function: { name: 'draft_screening_answers' } },
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function') throw new Error('Screening: el modelo no llamó al tool esperado');

  const raw = JSON.parse(toolCall.function.arguments) as { answers: { question: string; answer: string }[] };
  return raw.answers ?? [];
}
