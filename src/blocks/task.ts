import { css, html } from 'lit';

export const taskStyles = css`
  .task {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border: 2px dashed var(--primary-color, #03a9f4);
    border-radius: 12px;
  }

  .task-text {
    font-size: 1.1em;
    white-space: pre-line;
  }

  .task.done .task-text {
    text-decoration: line-through;
    opacity: 0.7;
  }

  .done-toggle {
    align-self: flex-start;
    font: inherit;
    padding: 6px 14px;
    border-radius: 18px;
    border: 1px solid var(--primary-color, #03a9f4);
    background: transparent;
    color: var(--primary-color, #03a9f4);
    cursor: pointer;
  }

  .task.done .done-toggle {
    background: var(--primary-color, #03a9f4);
    color: var(--text-primary-color, #fff);
  }
`;

/** Mini-Aufgabe oder Gutschein mit „Erledigt“-Haken. */
export function renderTask(task: string, done: boolean, onToggle: () => void) {
  return html`
    <div class="task ${done ? 'done' : ''}">
      <span class="task-text">${task}</span>
      <button class="done-toggle" aria-pressed=${done ? 'true' : 'false'} @click=${onToggle}>
        ${done ? 'Erledigt ✔' : 'Als erledigt markieren'}
      </button>
    </div>
  `;
}
