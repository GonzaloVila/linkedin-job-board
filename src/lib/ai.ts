import OpenAI from 'openai';
import type { JobAnalysis } from './db';

const client = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY,
  baseURL: 'https://api.cerebras.ai/v1',
});

const MODEL = process.env.LLM_MODEL_PRIMARY ?? 'llama-3.3-70b';

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
};

export async function runAnalysis(job: JobInput): Promise<JobAnalysis> {
  const lines = [
    `Título: ${job.title}`,
    `Empresa: ${job.company}`,
    job.location       ? `Ubicación: ${job.location}`              : null,
    job.search_keyword ? `Keyword de búsqueda: ${job.search_keyword}` : null,
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

  const skillsLine = [
    analysis.required_skills.length ? `Skills requeridas: ${analysis.required_skills.join(', ')}` : null,
    analysis.stack.length           ? `Stack: ${analysis.stack.join(', ')}`                        : null,
    analysis.modality !== 'unknown' ? `Modalidad: ${analysis.modality}`                            : null,
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
