import { css, html, nothing } from 'lit';

export const textStyles = css`
  .text {
    margin: 0;
    font-size: 1.1em;
    line-height: 1.5;
    white-space: pre-line;
  }

  .reveal {
    align-self: flex-start;
    font: inherit;
    padding: 6px 14px;
    border-radius: 18px;
    border: 1px solid var(--primary-color, #03a9f4);
    background: transparent;
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
  }

  .answer {
    margin: 0;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--secondary-background-color, #f2f2f2);
    white-space: pre-line;
  }
`;

/** Spruch, Fakt oder Rätsel; mit `answer` gibt es einen „Lösung zeigen“-Button. */
export function renderText(
  text: string,
  answer: string | undefined,
  revealed: boolean,
  onReveal: () => void,
) {
  return html`
    <p class="text">${text}</p>
    ${answer === undefined
      ? nothing
      : revealed
        ? html`<p class="answer">💡 ${answer}</p>`
        : html`<button class="reveal" @click=${onReveal}>Lösung zeigen</button>`}
  `;
}
