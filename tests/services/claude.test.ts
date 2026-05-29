import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));
vi.mock('../../src/config/env.js', () => ({
  loadEnv: () => ({ ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'claude-sonnet-4-6' }),
}));

// Helper: tool_use input con los 5 cuerpos que ahora exige el schema.
const seqInput = (subject = 'hola') => ({
  subject,
  email1_body: '<p>inicial</p>',
  email2_body: '<p>fu1</p>',
  email3_body: '<p>fu2</p>',
  email4_body: '<p>fu3</p>',
  email5_body: '<p>despedida</p>',
});

describe('claude service', () => {
  beforeEach(() => mockCreate.mockReset());

  it('generateEmail returns the 5 bodies from tool_use output', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'send_email_draft', input: seqInput('hola') }],
    });
    const { generateEmail } = await import('../../src/services/claude.js');
    const out = await generateEmail({
      systemPrompt: 'sys',
      variantSnippet: '',
      userPrompt: 'biz info',
    });
    expect(out.subject).toBe('hola');
    expect(out.bodies).toHaveLength(5);
    expect(out.bodies[0]).toContain('inicial');
    expect(out.bodies[4]).toContain('despedida');
  });

  it('generateEmail throws when a body field is missing', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'send_email_draft', input: { subject: 's', email1_body: '<p>x</p>' } }],
    });
    const { generateEmail } = await import('../../src/services/claude.js');
    await expect(generateEmail({ systemPrompt: 'sys', variantSnippet: '', userPrompt: 'p' }))
      .rejects.toThrow(/email2_body/);
  });

  it('classifyReplyText returns valid kind', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'human_reply' }] });
    const { classifyReplyText } = await import('../../src/services/claude.js');
    const out = await classifyReplyText('algún texto');
    expect(out).toBe('human_reply');
  });

  it('generateEmail retries on 529 overloaded and eventually succeeds', async () => {
    const overload = Object.assign(new Error('overloaded'), { status: 529 });
    mockCreate
      .mockRejectedValueOnce(overload)
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', name: 'send_email_draft', input: seqInput('s') }],
      });

    const { generateEmail } = await import('../../src/services/claude.js');
    const out = await generateEmail({ systemPrompt: 'sys', variantSnippet: '', userPrompt: 'p' });
    expect(out.subject).toBe('s');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('generateEmail propagates non-retryable errors immediately', async () => {
    const bad = Object.assign(new Error('bad req'), { status: 400 });
    mockCreate.mockRejectedValueOnce(bad);

    const { generateEmail } = await import('../../src/services/claude.js');
    await expect(generateEmail({ systemPrompt: 'sys', variantSnippet: '', userPrompt: 'p' })).rejects.toThrow();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('judgeEnrichment', () => {
  beforeEach(() => mockCreate.mockReset());

  it('decides has_real_website when results include the business own domain', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        name: 'report_enrichment',
        input: {
          has_real_website: true,
          website_url: 'https://www.tallerx.es',
          email: null,
          reasoning: 'tallerx.es contiene horarios y servicios del taller.',
        },
      }],
    });

    const { judgeEnrichment } = await import('../../src/services/claude.js');
    const r = await judgeEnrichment({
      business_name: 'Taller X',
      city: 'Bilbao',
      category: 'taller mecánico',
      results: [
        { url: 'https://www.tallerx.es', title: 'Taller X', description: 'Bilbao', markdown: 'horarios...' },
      ],
    });
    expect(r.has_real_website).toBe(true);
    expect(r.website_url).toBe('https://www.tallerx.es');
  });

  it('decides not a real website when only social profiles appear', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'tool_use',
        name: 'report_enrichment',
        input: {
          has_real_website: false,
          website_url: null,
          email: 'info@tallerx.es',
          reasoning: 'solo perfiles de Instagram y Facebook con email en bio.',
        },
      }],
    });

    const { judgeEnrichment } = await import('../../src/services/claude.js');
    const r = await judgeEnrichment({
      business_name: 'Taller X', city: 'Bilbao', category: null,
      results: [
        { url: 'https://www.instagram.com/tallerx' },
        { url: 'https://www.facebook.com/tallerx' },
      ],
    });
    expect(r.has_real_website).toBe(false);
    expect(r.email).toBe('info@tallerx.es');
  });

  it('throws when Claude does not call the tool', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'no idea' }],
    });
    const { judgeEnrichment } = await import('../../src/services/claude.js');
    await expect(judgeEnrichment({
      business_name: 'X', city: null, category: null, results: [],
    })).rejects.toThrow(/tool_use|report_enrichment/i);
  });
});
