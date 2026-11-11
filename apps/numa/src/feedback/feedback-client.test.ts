/**
 * @jest-environment jsdom
 */
import { feedbackCloneSkipped } from './feedback-client';

test('the screenshot clone skips nodes that are not shown', () => {
  const shown = document.createElement('p');
  shown.textContent = 'Shown';
  const noscript = document.createElement('noscript');
  noscript.textContent = 'Enable JavaScript';
  const script = document.createElement('script');
  script.textContent = 'var x = 1';
  const template = document.createElement('template');
  template.innerHTML = '<p>stored</p>';
  const hidden = document.createElement('p');
  hidden.hidden = true;
  hidden.textContent = 'hidden attribute';
  const none = document.createElement('p');
  none.style.display = 'none';
  none.textContent = 'display none';
  const invisible = document.createElement('p');
  invisible.style.visibility = 'hidden';
  invisible.textContent = 'visibility hidden';
  const self = document.createElement('div');
  self.setAttribute('data-fb-self', 'true');
  document.body.append(shown, noscript, script, template, hidden, none, invisible, self);

  expect(feedbackCloneSkipped(shown)).toBe(false);
  expect(feedbackCloneSkipped(document.createTextNode('Enable JavaScript'))).toBe(false);
  expect(feedbackCloneSkipped(noscript)).toBe(true);
  expect(feedbackCloneSkipped(script)).toBe(true);
  expect(feedbackCloneSkipped(template)).toBe(true);
  expect(feedbackCloneSkipped(hidden)).toBe(true);
  expect(feedbackCloneSkipped(none)).toBe(true);
  expect(feedbackCloneSkipped(invisible)).toBe(true);
  expect(feedbackCloneSkipped(self)).toBe(true);

  const collapsed = document.createElement('p');
  const view = document.defaultView!;
  const original = view.getComputedStyle;
  view.getComputedStyle = (() => ({ display: 'block', visibility: 'visible', contentVisibility: 'hidden' })) as unknown as typeof view.getComputedStyle;
  try {
    expect(feedbackCloneSkipped(collapsed)).toBe(true);
  } finally {
    view.getComputedStyle = original;
  }
});
