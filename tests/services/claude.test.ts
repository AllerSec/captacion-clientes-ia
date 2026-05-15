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

describe('claude service', () => {
  beforeEach(() => mockCreate.mockReset());

  it('generateEmail returns parsed tool_use output', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'send_email_draft', input: { subject: 'hola', body: '<p>hola</p>' } }],
    });
    const { generateEmail } = await import('../../src/services/claude.js');
    const out = await generateEmail({
      systemPrompt: 'sys',
      variantSnippet: '',
      userPrompt: 'biz info',
    });
    expect(out.subject).toBe('hola');
    expect(out.body).toContain('<p>');
  });

  it('classifyReplyText returns valid kind', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'human_reply' }] });
    const { classifyReplyText } = await import('../../src/services/claude.js');
    const out = await classifyReplyText('algún texto');
    expect(out).toBe('human_reply');
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
