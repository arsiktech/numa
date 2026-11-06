import { canSendFeedback, FEEDBACK_MAX, newFeedbackId } from './feedback';

it('accepts real text up to the server limit and nothing else', () => {
  expect(canSendFeedback('')).toBe(false);
  expect(canSendFeedback('   \n ')).toBe(false);
  expect(canSendFeedback(' Add dark charts ')).toBe(true);
  expect(canSendFeedback('x'.repeat(FEEDBACK_MAX))).toBe(true);
  expect(canSendFeedback('x'.repeat(FEEDBACK_MAX + 1))).toBe(false);
});
it('makes a different id each time', () => {
  expect(newFeedbackId()).not.toBe(newFeedbackId());
});
