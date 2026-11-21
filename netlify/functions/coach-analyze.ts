import { analyzeBrainDump } from '../../src/utils/eisenhowerEngine';

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { brainDump, clientNow, existingTasks } = body ?? {};

    if (!brainDump || typeof brainDump !== 'string' || !brainDump.trim()) {
      return new Response(
        JSON.stringify({ error: 'Please paste your tasks or message before submitting.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = analyzeBrainDump(
      brainDump,
      typeof clientNow === 'string' ? clientNow : undefined,
      Array.isArray(existingTasks) ? existingTasks : undefined
    );

    if (result.tasks.length === 0) {
      return new Response(
        JSON.stringify({
          error:
            'Could not detect any individual tasks. Try listing each item on a new line or separated by commas.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        error: err?.message || 'Failed to analyze your task list. Please try again.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const config = {
  path: '/api/coach/analyze',
};
