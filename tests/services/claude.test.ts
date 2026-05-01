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

  it('generateEmail returns parsed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"subject":"hola","body":"<p>hola</p>"}' }],
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
