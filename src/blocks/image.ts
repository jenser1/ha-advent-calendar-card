import { css, html } from 'lit';

export const imageStyles = css`
  .image {
    display: block;
    max-width: 100%;
    max-height: 60vh;
    margin: 0 auto;
    border-radius: 10px;
  }
`;

/** Bild oder GIF, z. B. /local/advent/jens/01.gif oder eine https-Adresse. */
export function renderImage(url: string, day: number) {
  return html`<img class="image" src=${url} alt="Bild hinter Türchen ${day}" loading="lazy" />`;
}
