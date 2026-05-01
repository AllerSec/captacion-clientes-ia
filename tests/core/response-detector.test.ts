import { describe, it, expect, vi } from 'vitest';
import { classifyReply, type ClassifierFn } from '../../src/core/response-detector.js';

describe('classifyReply', () => {
  it('detects out-of-office without LLM', async () => {
    const llm = vi.fn();
    const r = await classifyReply('Estaré fuera de la oficina hasta el lunes', llm);
    expect(r).toBe('auto_reply');
    expect(llm).not.toHaveBeenCalled();
  });

  it('detects bounce text', async () => {
    const llm = vi.fn();
    const r = await classifyReply('Mail Delivery Subsystem - delivery failed', llm);
    expect(r).toBe('bounce');
  });

  it('falls back to LLM for ambiguous text', async () => {
    const llm: ClassifierFn = vi.fn().mockResolvedValue('human_reply');
    const r = await classifyReply('Sí, contame más', llm);
    expect(r).toBe('human_reply');
    expect(llm).toHaveBeenCalled();
  });
});
