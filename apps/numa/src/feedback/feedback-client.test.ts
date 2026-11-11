/**
 * @jest-environment jsdom
 */
import { feedbackCloneSkips } from './feedback-client';

test('the screenshot clone skips nodes that are not shown', () => {
  const shown = document.createElement('p');
  shown.textContent = 'Shown';
  const noscript = document.createElement('noscript');
  noscript.textContent = 'Enable JavaScript';
  const insideNoscript = document.createElement('span');
  insideNoscript.textContent = 'Enable JavaScript';
  noscript.append(insideNoscript);
  const script = document.createElement('script');
  script.textContent = 'var x = 1';
  const template = document.createElement('template');
  template.innerHTML = '<p>stored</p>';
  const hidden = document.createElement('p');
  hidden.hidden = true;
  hidden.textContent = 'hidden attribute';
  const none = document.createElement('div');
  none.style.display = 'none';
  const insideNone = document.createElement('p');
  insideNone.textContent = 'display none';
  none.append(insideNone);
  const self = document.createElement('div');
  self.setAttribute('data-fb-self', 'true');
  document.body.append(shown, noscript, script, template, hidden, none, self);

  expect(feedbackCloneSkips(shown)).toBe(false);
  expect(feedbackCloneSkips(document.createTextNode('Enable JavaScript'))).toBe(false);
  expect(feedbackCloneSkips(noscript)).toBe(true);
  expect(feedbackCloneSkips(insideNoscript)).toBe(true);
  expect(feedbackCloneSkips(script)).toBe(true);
  expect(feedbackCloneSkips(template)).toBe(true);
  expect(feedbackCloneSkips(hidden)).toBe(true);
  expect(feedbackCloneSkips(none)).toBe(true);
  expect(feedbackCloneSkips(insideNone)).toBe(true);
  expect(feedbackCloneSkips(self)).toBe(true);
});
