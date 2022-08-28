export class Draft extends HTMLElement {
  constructor() {
    // Always call super first in constructor
    super();

    // Create a shadow root
    const shadow = this.attachShadow({ mode: "open" });

    const wrapper = document.createElement("div");
    wrapper.classList.add("wrap");

    // Create some CSS to apply to the shadow dom
    const style = document.createElement("style");

    style.textContent = `
      .wrap {
        color: red;
        display: grid;
        grid-gap: 1em;
        grid-template-columns: auto auto auto auto auto auto;
      }
    `;

    // Attach the created elements to the shadow dom
    shadow.appendChild(style);
    shadow.appendChild(wrapper);

    const tileDataPromise = this.getTiles();
    this.appendTiles(tileDataPromise, wrapper);
  }

  getTiles() {
    return fetch("https://kingdomino-api.glitch.me/dominos").then((response) =>
      response.json()
    );
  }

  appendTiles(dataPromise, wrapper) {
    dataPromise.then((data) =>
      data.forEach((d) => {
        const tile = document.createElement("span");
        tile.textContent = `${d.left.type}:${d.right.type}`;
        wrapper.appendChild(tile);
      })
    );
  }
}
