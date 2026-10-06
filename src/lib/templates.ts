// Starter questionnaire based on the existing "Blood Chart" workbook.
// It is only a template: every exercise gets its own editable copy.

import type { Question, Section, Template } from './types';

type Q = string | { text: string; sub?: string[]; group?: boolean; reverse?: boolean; hint?: string };

function build(prefix: string, title: string, items: Q[]): Section {
  const questions: Question[] = [];
  let n = 0;
  for (const it of items) {
    n++;
    const id = `${prefix}q${n}`;
    if (typeof it === 'string') {
      questions.push({ id, text: it, type: 'yes_no', required: true });
      continue;
    }
    questions.push({ id, text: it.text, type: 'yes_no', required: !it.group, isGroup: it.group, reverse: it.reverse, hint: it.hint });
    it.sub?.forEach((s, i) => questions.push({ id: `${id}s${i + 1}`, text: s, type: 'yes_no', required: true, parentId: id }));
  }
  return { id: `${prefix}sec`, title, questions };
}

export const BUILT_IN_TEMPLATES: Template[] = [
  {
    id: 'builtin-showroom-two-moments',
    name: 'Showroom sales visit (two Moments of Truth)',
    description: 'Based on the current Blood Chart: 17 First Moment of Truth checks and 15 Second Moment of Truth checks.',
    createdAt: '2026-04-09T00:00:00.000Z',
    sections: [
      build('fmot-', 'First Moment of Truth', [
        'Was there point of sale material on display?',
        'Was the showroom clean and tidy?',
        'Were you acknowledged within 30 seconds?',
        'Were you served within 3 minutes?',
        {
          text: 'Did the salesperson:',
          group: true,
          sub: [
            'Wear a name badge?',
            'Stand up and greet you?',
            'Introduce themselves?',
            'Offer assistance / determine the reason for your visit?',
            'Use your name during discussions?',
            'Provide you with a business card?',
            'Offer refreshments?',
            'Provide correct information timeously?',
            'Refrain from taking calls?',
            'Record your name?',
            'Record your contact number?',
            'Record your e-mail address?',
          ],
        },
        {
          text: 'Did the salesperson open with "Can I help you?"',
          reverse: true,
          hint: 'Negative behaviour. Answer Yes if they used this phrase. A No answer is the compliant result.',
        },
      ]),
      build('smot-', 'Second Moment of Truth', [
        {
          text: 'Did the salesperson qualify your needs?',
          sub: ['Ask what you currently drive?', 'Ask why you bought your current vehicle?', 'Ask why you are looking to change?'],
        },
        'Establish your budget?',
        'Ask questions to determine your customer profile?',
        'Establish your motoring requirements?',
        'Explain the relevant benefits (to match your profile)?',
        'Perform a walk-around?',
        'Offer a test drive?',
        'Show pride in their product?',
        'Offer alternate models?',
        'Introduce you to accessories?',
        'Offer to appraise your trade-in?',
        'Offer to provide a written quote?',
      ]),
    ],
  },
  {
    id: 'builtin-blank',
    name: 'Blank questionnaire',
    description: 'Start with one empty section and build your own.',
    createdAt: '2026-04-09T00:00:00.000Z',
    sections: [{ id: 'blank-sec', title: 'Section 1', questions: [] }],
  },
];
